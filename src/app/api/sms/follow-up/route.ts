import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { InfobipSmsError, sendInfobipSms } from "@/lib/infobip-sms";
import { normalizePhone } from "../../../../../scripts/sms-followup.js";

const requestSchema = z.object({ storyId: z.string().uuid() });
export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid storyId is required" }, { status: 400 });
  }

  const apiKey = process.env.INFOBIP_API_KEY;
  const recipient = process.env.INFOBIP_RECIPIENT;
  const sender = process.env.INFOBIP_SENDER;

  if (!apiKey || !process.env.INFOBIP_BASE_URL || !recipient || !sender) {
    return NextResponse.json(
      { error: "SMS service is not configured" },
      { status: 503 },
    );
  }

  const phoneNumber = normalizePhone(recipient);
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "SMS recipient must be an international phone number" },
      { status: 503 },
    );
  }

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("title,neutral_summary")
    .eq("id", parsed.data.storyId)
    .maybeSingle();

  if (storyError) {
    console.error("Failed to load story for SMS follow-up:", storyError.message);
    return NextResponse.json({ error: "Could not load this story" }, { status: 500 });
  }

  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const { data: subscriber, error: subscriberError } = await supabase
    .from("sms_subscribers")
    .select("id")
    .eq("phone_number", phoneNumber)
    .not("opted_in_at", "is", null)
    .is("opted_out_at", null)
    .maybeSingle();

  if (subscriberError) {
    console.error("SMS consent lookup failed:", subscriberError.message);
    return NextResponse.json({ error: "Could not verify SMS consent" }, { status: 503 });
  }
  if (!subscriber) {
    return NextResponse.json({ error: "SMS recipient has not opted in" }, { status: 403 });
  }

  const { data: canSend, error: limitError } = await supabase.rpc(
    "claim_sms_followup_send",
  );

  if (limitError) {
    console.error("SMS follow-up rate limit failed:", limitError.message);
    return NextResponse.json(
      { error: "SMS sending is temporarily unavailable" },
      { status: 503 },
    );
  }

  if (!canSend) {
    return NextResponse.json(
      { error: "The daily SMS limit has been reached. Try again later." },
      { status: 429 },
    );
  }

  const summary = story.neutral_summary?.trim();
  const message = [
    `NewsLens KE follow-up: ${story.title.slice(0, 120)}`,
    summary ? summary.slice(0, 220) : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: delivery, error: deliveryError } = await supabase
    .from("sms_deliveries")
    .insert({
      subscriber_id: subscriber.id,
      story_id: parsed.data.storyId,
      delivery_type: "story",
      status: "queued",
    })
    .select("id,callback_data")
    .single();

  if (deliveryError || !delivery) {
    console.error("Could not record story SMS delivery:", deliveryError?.message);
    return NextResponse.json({ error: "Could not prepare SMS delivery" }, { status: 503 });
  }

  let providerResult: Awaited<ReturnType<typeof sendInfobipSms>>;
  try {
    providerResult = await sendInfobipSms({
      to: phoneNumber,
      sender,
      text: message,
      messageId: delivery.id,
      callbackData: delivery.callback_data,
    });
  } catch (error) {
    await supabase
      .from("sms_deliveries")
      .update({
        status: "failed",
        error_code: error instanceof InfobipSmsError ? error.code : null,
      })
      .eq("id", delivery.id);
    const status = error instanceof InfobipSmsError ? error.status : undefined;
    console.error("Infobip story SMS failed:", { status });
    return NextResponse.json(
      { error: "The SMS provider did not accept the message" },
      { status: 502 },
    );
  }

  const { error: recordError } = await supabase
    .from("sms_deliveries")
    .update({
      status: "accepted",
      provider_message_id: providerResult.messageId,
      provider_status: providerResult.status,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", delivery.id);

  if (recordError) {
    console.error("Could not update accepted SMS delivery:", recordError.message);
  }

  return NextResponse.json({ success: true, status: providerResult.status });
}