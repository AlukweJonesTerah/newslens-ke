import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "../../../../../../scripts/sms-followup.js";

type InboundMessage = { from?: string; text?: string };

const OPT_OUT_MESSAGE = /^(STOP(?:\s+ALL)?|UNSUBSCRIBE|CANCEL|END|QUIT)$/i;

export async function POST(request: Request) {
  const token = process.env.INFOBIP_WEBHOOK_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { results?: InboundMessage[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(payload.results)) {
    return NextResponse.json({ error: "Invalid inbound message" }, { status: 400 });
  }

  let optedOut = 0;
  for (const message of payload.results) {
    if (!message.from || !OPT_OUT_MESSAGE.test((message.text || "").trim())) continue;
    const phoneNumber = normalizePhone(message.from);
    if (!phoneNumber) continue;

    const { error } = await supabase
      .from("sms_subscribers")
      .update({ opted_out_at: new Date().toISOString() })
      .eq("phone_number", phoneNumber)
      .is("opted_out_at", null);
    if (error) {
      console.error("Infobip opt-out update failed:", error.message);
      return NextResponse.json({ error: "Could not process opt-out" }, { status: 503 });
    }
    optedOut += 1;
  }

  return NextResponse.json({ received: payload.results.length, optedOut });
}