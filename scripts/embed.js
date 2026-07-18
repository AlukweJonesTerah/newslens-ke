const { GoogleGenAI } = require("@google/genai");
const {
  getSupabaseClient,
  sleep,
  normalizeL2,
  getFirstNWords,
  isRateLimitError,
} = require("./lib.js");

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_OUTPUT_DIMENSIONALITY = 768;
const EMBED_DELAY_MS = process.env.EMBED_DELAY_MS
  ? parseInt(process.env.EMBED_DELAY_MS)
  : 1500;
const LOG_PROGRESS_EVERY = 20;
const MAX_429_RETRIES = 4;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }
  return new GoogleGenAI({ apiKey });
}

async function runEmbed(supabase) {
  console.log("🔌 NewsLens KE — Embedding");
  console.log("=".repeat(72));
  const genAI = getGenAIClient();
  console.log("Fetching articles with null embeddings...");
  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("id, title, raw_text")
    .is("embedding", null);
  if (fetchError) throw new Error(`Failed to fetch articles: ${fetchError.message}`);

  const total = articles.length;
  console.log(`Found ${total} articles to embed\n`);

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    let success = false;

    for (let attempt = 1; attempt <= MAX_429_RETRIES + 1; attempt++) {
      try {
        const inputText =
          (article.title || "") + "\n\n" + getFirstNWords(article.raw_text || "", 500);
        const response = await genAI.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: inputText,
          config: {
            outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONALITY,
            taskType: "SEMANTIC_SIMILARITY",
          },
        });
        const embedding = response.embeddings?.[0]?.values;
        if (!embedding) throw new Error("No embedding returned from API");

        const { error: updateError } = await supabase
          .from("articles")
          .update({
            embedding: normalizeL2(embedding),
            embedding_model: EMBEDDING_MODEL,
          })
          .eq("id", article.id);

        if (updateError) throw updateError;
        embedded++;
        success = true;
        break;
      } catch (err) {
        if (isRateLimitError(err) && attempt <= MAX_429_RETRIES) {
          const backoffSeconds = attempt * 5;
          console.log(
            `Rate limited, retrying in ${backoffSeconds}s (attempt ${attempt}/${MAX_429_RETRIES})...`
          );
          await sleep(backoffSeconds * 1000);
        } else if (isRateLimitError(err)) {
          failed++;
          console.error(`Failed to embed article ${article.id}: ${err.message}`);
          console.log("\n" + "=".repeat(72));
          console.log("Quota exhausted, stopping embedding early.");
          console.log(`Embedded so far: ${embedded} | Failed: ${failed}`);
          console.log("=".repeat(72));
          return { embedded, failed, total, stoppedEarly: true };
        } else {
          failed++;
          console.error(`Failed to embed article ${article.id}: ${err.message}`);
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
  console.log("✅ EMBEDDING SUMMARY");
  console.log(`Total embedded: ${embedded}`);
  console.log(`Total failed: ${failed}`);
  console.log("=".repeat(72));
  return { embedded, failed, total };
}

async function main() {
  const supabase = getSupabaseClient();
  return runEmbed(supabase);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  });
}

module.exports = { runEmbed };
