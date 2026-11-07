import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

const requestSchema = z.object({ storyId: z.string().uuid() });
const acceptedStatuses = new Set([100, 101, 102]);

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

  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;
  const recipient = process.env.AFRICASTALKING_RECIPIENT;
  const senderId = process.env.AFRICASTALKING_SENDER_ID;

  if (!apiKey || !username || !recipient || !senderId) {
    return NextResponse.json(
      { error: "SMS service is not configured" },
      { status: 503 },
    );
  }

  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
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

  let providerResponse: Response;
  try {
    providerResponse = await fetch(
      "https://api.africastalking.com/version1/messaging/bulk",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          apiKey,
        },
        body: JSON.stringify({
          username,
          phoneNumbers: [recipient],
          message,
          senderId,
        }),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach the SMS provider" },
      { status: 502 },
    );
  }

  const providerResult = await providerResponse.json().catch(() => null);
  const recipientResult = providerResult?.SMSMessageData?.Recipients?.[0];
  const statusCode = Number(recipientResult?.statusCode);

  if (!providerResponse.ok || !acceptedStatuses.has(statusCode)) {
    console.error("SMS provider rejected follow-up:", {
      httpStatus: providerResponse.status,
      statusCode: recipientResult?.statusCode,
    });
    return NextResponse.json(
      { error: "The SMS provider did not accept the message" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}