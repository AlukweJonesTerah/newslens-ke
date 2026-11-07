import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { runFollowups } from "../../../../../scripts/sms-followup.js";
import { sendInfobipSms } from "@/lib/infobip-sms";

export const maxDuration = 800;

function readInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function readConfig() {
  return {
    enabled: process.env.FOLLOWUP_ENABLED === "true",
    windowStart: process.env.FOLLOWUP_WINDOW_START || "08:00",
    windowEnd: process.env.FOLLOWUP_WINDOW_END || "12:00",
    day: process.env.FOLLOWUP_DAY || "Monday",
    lookbackDays: readInt("FOLLOWUP_LOOKBACK_DAYS", 7, 1, 30),
    timezone: process.env.FOLLOWUP_TIMEZONE || "Africa/Nairobi",
    appBaseUrl: process.env.APP_BASE_URL,
    maxSegments: 2,
    maxRetries: 2,
    retryDelayMs: readInt("FOLLOWUP_RETRY_DELAY_MS", 1000, 100, 10000),
    sendDelayMs: readInt("FOLLOWUP_SEND_DELAY_MS", 1000, 250, 10000),
    batchSize: readInt("FOLLOWUP_BATCH_SIZE", 20, 1, 100),
  };
}

function createStore(supabase: SupabaseClient<any>) {
  return {
    async getRecentStoryDeliveries({ since }: { since: Date }) {
      const deliveries: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("sms_deliveries")
          .select(
            "subscriber_id,story_id,status,sent_at,created_at,subscriber:sms_subscribers!inner(id,phone_number,opted_in_at,opted_out_at),story:stories!inner(title)",
          )
          .eq("delivery_type", "story")
          .in("status", ["sent", "delivered"])
          .gte("sent_at", since.toISOString())
          .order("sent_at", { ascending: true })
          .range(offset, offset + 999);

        if (error) throw new Error(error.message);
        deliveries.push(...(data || []));
        if ((data || []).length < 1000) break;
      }

      return deliveries.map((row: any) => ({
        ...row,
        subscriber: Array.isArray(row.subscriber) ? row.subscriber[0] : row.subscriber,
        story_title: Array.isArray(row.story) ? row.story[0]?.title : row.story?.title,
      }));
    },

    async getFollowupKeys(candidates: any[]) {
      const subscriberIds = [...new Set(candidates.map((candidate) => candidate.subscriber.id))];
      const storyIds = [...new Set(candidates.map((candidate) => candidate.story_id))];
      const keys = new Set<string>();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("sms_deliveries")
          .select("subscriber_id,story_id")
          .eq("delivery_type", "followup")
          .in("subscriber_id", subscriberIds)
          .in("story_id", storyIds)
          .range(offset, offset + 999);
        if (error) throw new Error(error.message);
        for (const row of data || []) keys.add(`${row.subscriber_id}:${row.story_id}`);
        if ((data || []).length < 1000) break;
      }
      return keys;
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