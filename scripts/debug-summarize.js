require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");

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
  if (!obj.per_source || typeof obj.per_source !== "object") return false;
  if (!COVERAGE_CATEGORIES.includes(obj.coverage_category)) return false;
  return true;
}

function buildSummarizerPrompt(articles) {
  return `Produce a JSON object with exactly these keys:

- neutral_summary: a short neutral summary of the story across all outlets
- per_source: an object mapping each outlet name to what that outlet emphasized. Keys MUST be the exact source_name string from the input articles (e.g. "Kenyans.co.ke", "Tuko (politics)"). Do NOT use article IDs, UUIDs, or any other identifier as keys. If multiple articles share the same source_name, write one entry for that source combining their emphasis.
- highlights: array of 1-3 short bullet strings
- coverage_category: exactly one of: government_focused, opposition_focused, public_focused, business_focused, international_focused

Coverage category guidance:
- government_focused: story centers on government action, officials, agencies, or policy
- opposition_focused: story centers on opposition figures, parties, or their response
- public_focused: story centers on public reaction, citizen impact, or community effects
- business_focused: story centers on economic, market, or corporate impact
- international_focused: story centers on international actors, foreign governments, or global reaction

Input articles (use source_name exactly for per_source keys):

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
  console.log("=== Summarizing story", storyId, "===");
  const { data: articleRows, error: arErr } = await supabase
    .from("story_articles")
    .select(
      "article:articles(id,title,raw_text,source_id, source:sources(name))",
    )
    .eq("story_id", storyId);
  if (arErr) {
    console.error("Error fetching story articles:", arErr);
    return;
  }
  console.log("Found", articleRows.length, "articles in this story");

  const inputs = articleRows.map((r) => {
    const art = r.article;
    return {
      source_name: art.source?.name || "Unknown",
      title: art.title || "",
      text: (art.raw_text || "").slice(0, 2000),
    };
  });
  console.log("Inputs built");

  const prompt = buildSummarizerPrompt(inputs);
  console.log("Prompt built");

  const model = process.env.SUMMARIZER_MODEL || "gemini-2.5-flash";
  let parsed = null;
  try {
    console.log("Calling GenAI model...");
    const response = await genAI.models.generateContent({
      model,
      contents: prompt,
      maxOutputTokens: 800,
    });
    console.log("Got response");
    const rawText = (
      response?.text ||
      response?.output?.[0]?.content ||
      ""
    ).trim();
    console.log("Raw text from model:", rawText);
    if (!rawText) {
      throw new Error("Empty model response");
    }
    const cleanedText = stripMarkdownCodeFences(rawText);
    console.log("Cleaned text:", cleanedText);
    try {
      parsed = JSON.parse(cleanedText);
      console.log("Parsed JSON successfully:", parsed);
    } catch (e) {
      console.error(
        "Failed to parse JSON from model for story",
        storyId,
        "\nRAW TEXT:\n",
        rawText,
        "\nCLEANED TEXT:\n",
        cleanedText,
      );
      return;
    }
  } catch (genErr) {
    console.error(
      "GenAI generation failed for story",
      storyId,
      genErr.message || genErr,
    );
    const sampleTitles = inputs
      .slice(0, 3)
      .map((i) => i.title)
      .filter(Boolean);
    parsed = {
      neutral_summary:
        sampleTitles.join(" — ") || "Multiple outlets reported on this topic.",
      per_source: {},
      highlights: sampleTitles,
      coverage_category: "public_focused",
    };
  }

  console.log("Validating parsed JSON...");
  if (!validateSummaryJson(parsed)) {
    console.error("Validation failed for story", storyId);
    return;
  }
  console.log("Validation passed");

  console.log("Updating database...");
  const { error: updateErr } = await supabase
    .from("stories")
    .update({
      neutral_summary: parsed.neutral_summary,
      coverage_category: parsed.coverage_category,
      summary_updated_at: new Date().toISOString(),
    })
    .eq("id", storyId);

  if (updateErr) {
    console.error("Error updating story in DB:", updateErr);
  } else {
    console.log("Summarized story", storyId, "successfully!");
  }
}

async function main() {
  const storyId = "101b8fad-e43c-415b-87fe-fc7ed1813d7e";
  const supabase = getSupabaseClient();
  const genAI = getGenAIClient();
  await summarizeSingle(storyId, supabase, genAI);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
