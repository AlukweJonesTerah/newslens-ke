import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { runFollowups } from "../../../../../scripts/sms-followup.js";
import { sendInfobipSms } from "@/lib/infobip-sms";

export const maxDuration = 800;

function readConfig() {
  return {
    enabled: process.env.FOLLOWUP_ENABLED === "true",
    windowStart: process.env.FOLLOWUP_WINDOW_START || "08:00",
    windowEnd: process.env.FOLLOWUP_WINDOW_END || "12:00",
    day: process.env.FOLLOWUP_DAY || "Monday",
    lookbackDays: Number.parseInt(process.env.FOLLOWUP_LOOKBACK_DAYS || "7", 10),
    timezone: process.env.FOLLOWUP_TIMEZONE || "Africa/Nairobi",
    appBaseUrl: process.env.APP_BASE_URL,
    maxSegments: 2,
    maxRetries: 2,
    retryDelayMs: Number.parseInt(process.env.FOLLOWUP_RETRY_DELAY_MS || "1000", 10),
    sendDelayMs: Number.parseInt(process.env.FOLLOWUP_SEND_DELAY_MS || "1000", 10),
    batchSize: Number.parseInt(process.env.FOLLOWUP_BATCH_SIZE || "20", 10),
  };
}

function createStore(supabase: ReturnType<typeof createClient>) {
  return {
    async getRecentStoryDeliveries({ since }: { since: Date }) {
      const { data, error } = await supabase
        .from("sms_deliveries")
        .select(
          "subscriber_id,story_id,status,sent_at,created_at,subscriber:sms_subscribers!inner(id,phone_number,opted_in_at,opted_out_at),story:stories!inner(title)",
        )
        .eq("delivery_type", "story")
        .in("status", ["sent", "delivered"])
        .gte("sent_at", since.toISOString())
        .order("sent_at", { ascending: true })
        .limit(1000);

      if (error) throw new Error(error.message);
      return (data || []).map((row: any) => ({
        ...row,
        subscriber: Array.isArray(row.subscriber) ? row.subscriber[0] : row.subscriber,
        story_title: Array.isArray(row.story) ? row.story[0]?.title : row.story?.title,
      }));
    },

    async getSubscriber(subscriberId: string) {
      const { data, error } = await supabase
        .from("sms_subscribers")
        .select("id,phone_number,opted_in_at,opted_out_at")
        .eq("id", subscriberId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },

    async claimFollowupDelivery({ subscriberId, storyId }: { subscriberId: string; storyId: string }) {
      const { data, error } = await supabase.rpc("claim_sms_followup_delivery", {
        p_subscriber_id: subscriberId,
        p_story_id: storyId,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return row ? { id: row.delivery_id, callback_data: row.callback_data } : null;
    },

    async updateDelivery(deliveryId: string, values: Record<string, unknown>) {
      const { error } = await supabase
        .from("sms_deliveries")
        .update(values)
        .eq("id", deliveryId);
      if (error) throw new Error(error.message);
    },
  };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const manual = new URL(request.url).searchParams.get("manual") === "true";
  const dryRun = process.env.FOLLOWUP_DRY_RUN !== "false";
  const config = readConfig();

  if (!config.enabled) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }
  if (!config.appBaseUrl || (!dryRun && !process.env.INFOBIP_SENDER)) {
    return NextResponse.json({ error: "Follow-up SMS is not fully configured" }, { status: 503 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "SMS job database is not configured" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const result = await runFollowups({
      config,
      store: createStore(supabase),
      send: sendInfobipSms,
      sender: process.env.INFOBIP_SENDER,
      dryRun,
      manual,
      testMsisdn: manual ? process.env.TEST_MSISDN : null,
      logger: console,
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 400 || status === 401 || status === 403) {
      console.error("Infobip follow-up configuration/authentication error; aborting run.");
    } else {
      console.error("SMS follow-up job failed:", (error as Error).message);
    }
    return NextResponse.json({ error: "SMS follow-up job failed" }, { status: 502 });
  }
}