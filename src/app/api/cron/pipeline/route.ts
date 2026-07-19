import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 800; // ~13 minutes, leaving some buffer

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
    const hardDeadline = startTime + 750 * 1000; // 12.5 minutes, leaving 50s buffer
    const pipelineStats: any = {};

    // Import the functions dynamically to avoid module loading issues
    const [{ runIngest }, { runEmbed }, { runCluster }, { runSummarize }] =
      await Promise.all([
        import("../../../../../scripts/ingest.js"),
        import("../../../../../scripts/embed.js"),
        import("../../../../../scripts/cluster.js"),
        import("../../../../../scripts/summarize_stories.js"),
      ]);

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
      skipped: false,
    };

    // 2. Run Embed
    console.log("\n" + "=".repeat(72));
    console.log("🧠 Step 2: EMBED");
    const embedStart = Date.now();
    let embedResult;
    if (Date.now() >= hardDeadline) {
      embedResult = { skipped: true, reason: "time_budget" };
    } else {
      embedResult = await runEmbed(supabase, hardDeadline);
    }
    pipelineStats.embed = {
      ...embedResult,
      durationMs: Date.now() - embedStart,
    };

    // 3. Run Cluster
    console.log("\n" + "=".repeat(72));
    console.log("📊 Step 3: CLUSTER");
    const clusterStart = Date.now();
    let clusterResult;
    if (Date.now() >= hardDeadline) {
      clusterResult = { skipped: true, reason: "time_budget" };
    } else {
      clusterResult = await runCluster(hardDeadline);
    }
    pipelineStats.cluster = {
      ...clusterResult,
      durationMs: Date.now() - clusterStart,
    };

    // 4. Run Summarize
    console.log("\n" + "=".repeat(72));
    console.log("📰 Step 4: SUMMARIZE");
    const summarizeStart = Date.now();
    let summarizeResult;
    if (Date.now() >= hardDeadline) {
      summarizeResult = { skipped: true, reason: "time_budget" };
    } else {
      summarizeResult = await runSummarize(
        supabase,
        (clusterResult.newStoryIds ?? []) as any,
        hardDeadline,
      );
    }
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
      { success: false, error: (err as Error).message, stack: (err as Error).stack },
      { status: 500 },
    );
  }
}