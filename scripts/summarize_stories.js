require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");

const SUMMARIZER_MODEL =
  process.env.SUMMARIZER_MODEL || "models/gemini-3.5-flash";
const MAX_429_RETRIES = 4;
const SUMMARIZE_DELAY_MS = 1500;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials in env");
  return createClient(url, key);
}

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in env");
  return new GoogleGenAI({ apiKey });
}

const COVERAGE_CATEGORIES = [
  "government_focused",
  "opposition_focused",
  "public_focused",
  "business_focused",
  "international_focused",
];

function validateSummaryJson(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.neutral_summary !== "string") return false;
  if (!COVERAGE_CATEGORIES.includes(obj.coverage_category)) return false;
  if (obj.consensus_claims && !Array.isArray(obj.consensus_claims))
    return false;
  if (obj.consensus_claims) {
    for (const claim of obj.consensus_claims) {
      if (typeof claim.claim !== "string") return false;
      if (!Array.isArray(claim.sources)) return false;
    }
  }
  return true;
}

function buildSummarizerPrompt(articles) {
  const sourceNames = [...new Set(articles.map((a) => a.source_name))];
  return `Produce a JSON object with exactly these keys:

- neutral_summary: a short neutral summary of the story across all outlets
- per_source: an object mapping each outlet name to what that outlet emphasized. Keys MUST be the exact source_name string from the input articles (e.g. "Kenyans.co.ke", "Tuko (politics)"). Do NOT use article IDs, UUIDs, or any other identifier as keys. If multiple articles share the same source_name, write one entry for that source combining their emphasis.
- consensus_claims: an array of 4-8 distinct factual claims from the story, each with:
  * "claim": a short, specific factual claim (e.g. "The court certified the case as urgent")
  * "sources": array of source names (EXACT source_name strings from input) that reported this specific claim
- coverage_category: exactly one of: government_focused, opposition_focused, public_focused, business_focused, international_focused

Coverage category guidance:
- government_focused: story centers on government action, officials, agencies, or policy
- opposition_focused: story centers on opposition figures, parties, or their response
- public_focused: story centers on public reaction, citizen impact, or community effects
- business_focused: story centers on economic, market, or corporate impact
- international_focused: story centers on international actors, foreign governments, or global reaction

Available source names for consensus_claims: ${JSON.stringify(sourceNames)}

Input articles (use source_name exactly for per_source and consensus_claims.sources):

${JSON.stringify(articles, null, 2)}`;
}

function stripMarkdownCodeFences(text) {
  if (typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  return (
    err?.status === 429 ||
    err?.message?.includes("429") ||
    err?.message?.includes("RESOURCE_EXHAUSTED")
  );
}

async function main() {
  console.log("NewsLens KE — Story Summarization & Coverage Classification");
  console.log("=".repeat(72));

  const supabase = getSupabaseClient();
  const genAI = getGenAIClient();

  const arg = process.argv.find((a) => a.startsWith("--story="));
  const specificStoryId = arg ? arg.split("=")[1] : null;

  let stories = [];
  if (specificStoryId) {
    const { data, error } = await supabase
      .from("stories")
      .select("id, title")
      .eq("id", specificStoryId);
    if (error) throw error;
    stories = data;
  } else {
    console.log("Fetching ALL stories...");
    const { data, error } = await supabase.from("stories").select("id, title");
    if (error) throw error;
    stories = data;
  }

  console.log(`Found ${stories.length} stories to process\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    let success = false;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_429_RETRIES + 1; attempt++) {
      try {
        await summarizeSingle(story.id, supabase, genAI);
        succeeded++;
        success = true;
        break;
      } catch (err) {
        lastError = err;
        if (isRateLimitError(err) && attempt <= MAX_429_RETRIES) {
          const backoffSeconds = attempt * 5;
          console.log(
            `Rate limited for story ${story.id}, retrying in ${backoffSeconds}s (attempt ${attempt}/${MAX_429_RETRIES})...`,
          );
          await sleep(backoffSeconds * 1000);
        } else if (isRateLimitError(err) && attempt > MAX_429_RETRIES) {
          failed++;
          console.error(
            `Failed to summarize story ${story.id}: ${err.message}`,
          );
          console.log("\n" + "=".repeat(72));
          console.log("Quota exhausted, stopping early.");
          console.log("SUMMARY REPORT");
          console.log("=".repeat(72));
          console.log(`Succeeded so far: ${succeeded}`);
          console.log(`Failed: ${failed}`);
          console.log(`Remaining: ${stories.length - (i + 1)}`);
          console.log("=".repeat(72));
          return;
        } else {
          failed++;
          console.error(
            `Failed to summarize story ${story.id}: ${err.message}`,
          );
          break;
        }
      }
    }

    if ((i + 1) % 10 === 0 || i + 1 === stories.length) {
      console.log(`${i + 1}/${stories.length} processed`);
    }

    if (i < stories.length - 1) {
      await sleep(SUMMARIZE_DELAY_MS);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("FINAL SUMMARY REPORT");
  console.log("=".repeat(72));
  console.log(`Total succeeded: ${succeeded}`);
  console.log(`Total failed: ${failed}`);
  console.log("=".repeat(72));
}

async function summarizeSingle(storyId, supabase, genAI) {
  console.log(`Summarizing story ${storyId}...`);
  const { data: articleRows, error: arErr } = await supabase
    .from("story_articles")
    .select(
      "article:articles(id,title,raw_text,source_id, source:sources(name))",
    )
    .eq("story_id", storyId);
  if (arErr) throw arErr;

  const inputs = articleRows.map((r) => {
    const art = r.article;
    return {
      source_name: art.source?.name || "Unknown",
      title: art.title || "",
      text: (art.raw_text || "").slice(0, 2000),
    };
  });

  const prompt = buildSummarizerPrompt(inputs);

  const response = await genAI.models.generateContent({
    model: SUMMARIZER_MODEL,
    contents: prompt,
    maxOutputTokens: 800,
  });
  const rawText = (
    response?.text ||
    response?.output?.[0]?.content ||
    ""
  ).trim();
  if (!rawText) {
    throw new Error("Empty model response");
  }
  const cleanedText = stripMarkdownCodeFences(rawText);

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    console.error(
      `Failed to parse JSON for story ${storyId}:`,
      "\nRaw text:",
      rawText,
      "\nCleaned text:",
      cleanedText,
    );
    throw new Error("JSON parse failed");
  }

  if (!validateSummaryJson(parsed)) {
    console.error("Validation failed for story", storyId, "parsed:", parsed);
    throw new Error("Validation failed");
  }

  const { error: updateErr } = await supabase
    .from("stories")
    .update({
      neutral_summary: parsed.neutral_summary,
      coverage_category: parsed.coverage_category,
      per_source: parsed.per_source,
      consensus_claims: parsed.consensus_claims,
      summary_updated_at: new Date().toISOString(),
    })
    .eq("id", storyId);

  if (updateErr) throw updateErr;
  console.log(`Successfully summarized story ${storyId}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  });
}
