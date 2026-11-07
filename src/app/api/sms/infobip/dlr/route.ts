import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type DeliveryReport = {
  callbackData?: string | null;
  messageId?: string | null;
  status?: { groupName?: string; name?: string };
  sentAt?: string;
  doneAt?: string;
};

function statusFromReport(report: DeliveryReport) {
  const group = report.status?.groupName?.toUpperCase();
  const name = report.status?.name?.toUpperCase() || "UNKNOWN";

  if (group === "DELIVERED") return { status: "delivered", provider_status: name };
  if (name.includes("SENT_TO_OPERATOR") || name === "SENT") {
    return { status: "sent", provider_status: name };
  }
  if (["UNDELIVERABLE", "EXPIRED", "REJECTED"].includes(group || "")) {
    return { status: "failed", provider_status: name };
  }
  if (["PENDING", "ACCEPTED"].includes(group || "")) {
    return { status: "accepted", provider_status: name };
  }
  return null;
}

export async function POST(request: Request) {
  const token = process.env.INFOBIP_WEBHOOK_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { results?: DeliveryReport[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(payload.results)) {
    return NextResponse.json({ error: "Invalid delivery report" }, { status: 400 });
  }

  let updated = 0;
  for (const report of payload.results) {
    const mapped = statusFromReport(report);
    if (!mapped || (!report.callbackData && !report.messageId)) continue;

    let lookup = supabase
      .from("sms_deliveries")
      .select("id,status")
      .limit(1);
    lookup = report.callbackData
      ? lookup.eq("callback_data", report.callbackData)
      : lookup.eq("provider_message_id", report.messageId);
    const { data: current, error: lookupError } = await lookup.maybeSingle();
    if (lookupError) {
      console.error("Infobip DLR lookup failed:", lookupError.message);
      return NextResponse.json({ error: "Could not process delivery report" }, { status: 503 });
    }
    if (!current || current.status === "delivered") continue;
    if (current.status === "sent" && mapped.status === "accepted") continue;
    if (current.status === "failed" && mapped.status !== "delivered") continue;

    const values: Record<string, unknown> = {
      ...mapped,
      ...(report.messageId ? { provider_message_id: report.messageId } : {}),
    };
    if (mapped.status === "sent" || mapped.status === "delivered") {
      values.sent_at = report.sentAt || new Date().toISOString();
    }
    if (mapped.status === "delivered") {
      values.delivered_at = report.doneAt || new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("sms_deliveries")
      .update(values)
      .eq("id", current.id);
    if (updateError) {
      console.error("Infobip DLR update failed:", updateError.message);
      return NextResponse.json({ error: "Could not update delivery status" }, { status: 503 });
    }
    updated += 1;
  }

  return NextResponse.json({ received: payload.results.length, updated });
}