require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_OUTPUT_DIMENSIONALITY = 768;
const EMBED_DELAY_MS = process.env.EMBED_DELAY_MS
  ? parseInt(process.env.EMBED_DELAY_MS)
  : 1500;
const LOG_PROGRESS_EVERY = 20;
const MAX_429_RETRIES = 4;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local",
    );
  }

  return createClient(url, key);
}

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }
  return new GoogleGenAI({ apiKey });
}

function getFirstNWords(text, n = 500) {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  return words.slice(0, n).join(" ");
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeL2(vector) {
  if (!vector || vector.length === 0) return vector;
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / norm);
}

function isRateLimitError(err) {
  return (
    err?.status === 429 ||
    err?.message?.includes("429") ||
    err?.message?.includes("RESOURCE_EXHAUSTED")
  );
}

async function main() {
  console.log("NewsLens KE — Embedding Backfill");
  console.log("=".repeat(72));

  const supabase = getSupabaseClient();
  const genAI = getGenAIClient();

  console.log("Fetching articles with null embeddings...");
  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("id, title, raw_text")
    .is("embedding", null);

  if (fetchError) {
    throw new Error(`Failed to fetch articles: ${fetchError.message}`);
  }

  const total = articles.length;
  console.log(`Found ${total} articles to embed\n`);

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    let success = false;
    let lastError = null;

    // Retry loop only for 429 errors
    for (let attempt = 1; attempt <= MAX_429_RETRIES + 1; attempt++) {
      // +1 for initial attempt
      try {
        const inputText =
          (article.title || "") +
          "\n\n" +
          getFirstNWords(article.raw_text || "", 500);

        const response = await genAI.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: inputText,
          config: {
            outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONALITY,
            taskType: "SEMANTIC_SIMILARITY",
          },
        });

        const embedding = response.embeddings?.[0]?.values;
        if (!embedding) {
          throw new Error("No embedding returned from API");
        }

        const { error: updateError } = await supabase
          .from("articles")
          .update({
            embedding: normalizeL2(embedding),
            embedding_model: EMBEDDING_MODEL,
          })
          .eq("id", article.id);

        if (updateError) {
          throw updateError;
        }

        embedded++;
        success = true;
        break; // Success, exit retry loop
      } catch (err) {
        lastError = err;
        if (isRateLimitError(err) && attempt <= MAX_429_RETRIES) {
          const backoffSeconds = attempt * 5;
          console.log(
            `Rate limited, retrying in ${backoffSeconds}s (attempt ${attempt}/${MAX_429_RETRIES})...`,
          );
          await sleep(backoffSeconds * 1000);
        } else if (isRateLimitError(err) && attempt > MAX_429_RETRIES) {
          // All retries exhausted, stop the script early
          failed++;
          console.error(
            `Failed to embed article ${article.id}: ${err.message}`,
          );
          console.log("\n" + "=".repeat(72));
          console.log("Quota exhausted, stopping early.");
          console.log("EMBEDDING SUMMARY");
          console.log("=".repeat(72));
          console.log(`Embedded so far: ${embedded}`);
          console.log(`Failed: ${failed}`);
          console.log(`Remaining to embed: ${total - (i + 1)}`);
          console.log("=".repeat(72));
          return;
        } else {
          // Not a rate limit error, fail immediately
          failed++;
          console.error(
            `Failed to embed article ${article.id}: ${err.message}`,
          );
          break;
        }
      }
    }

    if ((i + 1) % LOG_PROGRESS_EVERY === 0 || i + 1 === total) {
      console.log(`${i + 1}/${total} embedded`);
    }

    if (i < articles.length - 1) {
      await sleep(EMBED_DELAY_MS);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("EMBEDDING SUMMARY");
  console.log("=".repeat(72));
  console.log(`Total embedded: ${embedded}`);
  console.log(`Total failed: ${failed}`);
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
