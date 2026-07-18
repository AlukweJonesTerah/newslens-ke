const { GoogleGenAI } = require("@google/genai");
const { getSupabaseClient, sleep, isRateLimitError } = require("./lib.js");

const SUMMARIZER_MODEL =
  process.env.SUMMARIZER_MODEL || "models/gemini-3.5-flash";
const MAX_429_RETRIES = 4;
const SUMMARIZE_DELAY_MS = 1500;

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
- per_source: an object mapping each outlet name to what that outlet emphasized. Keys MUST be exact source_name strings from input articles (e.g. "Kenyans.co.ke", "Tuko (politics)")
- consensus_claims: an array of 4-8 distinct factual claims from the story, each with:
  * "claim": short specific factual claim (e.g. "The court certified the case urgent")
  * "sources": array of EXACT source names that reported that claim
- coverage_category: exactly one of: government_focused, opposition_focused, public_focused, business_focused, international_focused

Available sources: ${JSON.stringify(sourceNames)}

Input articles:
${JSON.stringify(articles, null, 2)}`;
}

function stripMarkdownCodeFences(text) {
  if (typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function summarizeSingle(storyId, supabase, genAI) {
  console.log(`📝 Summarizing story ${storyId}...`);
  const { data: articleRows, error: arErr } = await supabase
    .from("story_articles")
    .select(
      "article:articles(id,title,raw_text,source_id,source:sources(name))",
    )
    .eq("story_id", storyId);
  if (arErr) throw arErr;

  const inputs = articleRows.map((r) => ({
    source_name: r.article.source?.name || "Unknown",
    title: r.article.title || "",
    text: (r.article.raw_text || "").slice(0, 2000),
  }));

  const response = await genAI.models.generateContent({
    model: SUMMARIZER_MODEL,
    contents: buildSummarizerPrompt(inputs),
    maxOutputTokens: 800,
  });
  const rawText = (
    response?.text ||
    response?.output?.[0]?.content ||
    ""
  ).trim();
  if (!rawText) throw new Error("Empty model response");
  const cleanedText = stripMarkdownCodeFences(rawText);

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    console.error(
      `Failed to parse JSON story ${storyId}:`,
      "\nRaw:",
      rawText,
      "\nCleaned:",
      cleanedText,
    );
    throw new Error("JSON parse failed");
  }

  if (!validateSummaryJson(parsed)) {
    console.error("Validation failed story", storyId, parsed);
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
  console.log(`✅ Successfully summarized ${storyId}`);
}

async function runSummarize(supabase, storyIds = null) {
  console.log("📰 NewsLens KE — Story Summarization");
  console.log("=".repeat(72));
  const genAI = getGenAIClient();
  let stories;

  if (storyIds && storyIds.length > 0) {
    const { data, error } = await supabase
      .from("stories")
      .select("id, title")
      .in("id", storyIds);
    if (error) throw error;
    stories = data;
  } else {
    console.log("Fetching stories missing summaries...");
    const { data, error } = await supabase
      .from("stories")
      .select("id, title")
      .is("neutral_summary", null);
    if (error) throw error;
    stories = data;
  }

  console.log(`Found ${stories.length} stories`);
  let succeeded = 0,
    failed = 0,
    stoppedEarly = false;

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    for (let attempt = 1; attempt <= MAX_429_RETRIES + 1; attempt++) {
      try {
        await summarizeSingle(story.id, supabase, genAI);
        succeeded++;
        break;
      } catch (err) {
        if (isRateLimitError(err) && attempt <= MAX_429_RETRIES) {
          const backoff = attempt * 5;
          console.log(`Rate limited, retrying in ${backoff}s...`);
          await sleep(backoff * 1000);
        } else if (isRateLimitError(err)) {
          failed++;
          console.error(`Failed story ${story.id}: ${err.message}`);
          console.log("\nQuota exhausted, stopping early.");
          stoppedEarly = true;
          break;
        } else {
          failed++;
          console.error(`Failed story ${story.id}: ${err.message}`);
          break;
        }
      }
    }

    if (stoppedEarly) break;
    if ((i + 1) % 10 === 0 || i + 1 === stories.length)
      console.log(`${i + 1}/${stories.length} processed`);
    if (i < stories.length - 1) await sleep(SUMMARIZE_DELAY_MS);
  }

  console.log("\n" + "=".repeat(72));
  console.log("✅ SUMMARIZATION REPORT:");
  console.log(`  Succeeded: ${succeeded} | Failed: ${failed}`);
  console.log("=".repeat(72));
  return { succeeded, failed, total: stories.length, stoppedEarly };
}

async function main() {
  const supabase = getSupabaseClient();
  const arg = process.argv.find((a) => a.startsWith("--story="));
  return runSummarize(supabase, arg ? [arg.split("=")[1]] : null);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  });
}

module.exports = { runSummarize, summarizeSingle };
