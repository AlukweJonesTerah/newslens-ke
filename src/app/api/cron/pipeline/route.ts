
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const { runIngest } = require("../../../../../scripts/ingest.js");
const { runEmbed } = require("../../../../../scripts/embed.js");
const { runCluster } = require("../../../../../scripts/cluster.js");
const { runSummarize } = require("../../../../../scripts/summarize_stories.js");

export const maxDuration = 300; // 5 minutes

export async function POST(request: Request) {
  try {
    // Verify Authorization header
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (bearerToken !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🚀 NewsLens KE — Automated Pipeline Starting");
    const startTime = Date.now();
    const pipelineStats: any = {};

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1. Run Ingest
    console.log("\n" + "=".repeat(72));
    console.log("📡 Step 1: INGEST");
    const ingestStart = Date.now();
    const ingestResult = await runIngest(supabase);
    pipelineStats.ingest = {
      ...ingestResult,
      durationMs: Date.now() - ingestStart,
    };

    // 2. Run Embed
    console.log("\n" + "=".repeat(72));
    console.log("🧠 Step 2: EMBED");
    const embedStart = Date.now();
    const embedResult = await runEmbed(supabase);
    pipelineStats.embed = {
      ...embedResult,
      durationMs: Date.now() - embedStart,
    };

    // 3. Run Cluster
    console.log("\n" + "=".repeat(72));
    console.log("📊 Step 3: CLUSTER");
    const clusterStart = Date.now();
    const clusterResult = await runCluster();
    pipelineStats.cluster = {
      ...clusterResult,
      durationMs: Date.now() - clusterStart,
    };

    // 4. Run Summarize
    console.log("\n" + "=".repeat(72));
    console.log("📰 Step 4: SUMMARIZE");
    const summarizeStart = Date.now();
    const summarizeResult = await runSummarize(
      supabase,
      clusterResult.newStoryIds,
    );
    pipelineStats.summarize = {
      ...summarizeResult,
      durationMs: Date.now() - summarizeStart,
    };

    const totalDurationMs = Date.now() - startTime;

    console.log("\n" + "=".repeat(72));
    console.log("✅ PIPELINE COMPLETE");
    console.log(`Total Duration: ${(totalDurationMs / 1000).toFixed(1)}s`);
    console.log("=".repeat(72));
    console.log("Final Stats:", JSON.stringify(pipelineStats, null, 2));
    console.log("=".repeat(72));

    return NextResponse.json({
      success: true,
      totalDurationMs,
      stats: pipelineStats,
    });
  } catch (err) {
    console.error("❌ PIPELINE FAILED:", err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
