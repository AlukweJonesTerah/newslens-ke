require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");
const { Pool } = require("pg");

const EXPECTED_EMBEDDING_MODEL = "gemini-embedding-2";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase credentials");
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

function parseEmbeddingValue(embedding) {
  if (Array.isArray(embedding)) return embedding;
  if (typeof embedding === "string") {
    // Supabase/pgvector can return vector columns as JSON-like strings, so parse them before JS math.
    try {
      const parsed = JSON.parse(embedding);
      return Array.isArray(parsed) ? parsed : embedding;
    } catch {
      return embedding;
    }
  }
  return embedding;
}

function cosineSimilarity(v1, v2) {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);
  if (norm1 === 0 || norm2 === 0) return 0;
  return dot / (norm1 * norm2);
}

async function main() {
  console.log("NewsLens KE — Embedding Integrity Verification");
  console.log("=".repeat(72));

  const supabase = getSupabaseClient();
  const genAI = getGenAIClient();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("Checking embedding_model consistency...");
    const { data: articlesWithModel, error: modelError } = await supabase
      .from("articles")
      .select("id, embedding_model")
      .not("embedding", "is", null);
    if (modelError) throw modelError;

    const embeddingModelValues = new Set(
      (articlesWithModel || [])
        .map((row) => row.embedding_model)
        .filter((model) => model !== null),
    );

    const nullModelCount = (articlesWithModel || []).filter(
      (row) => row.embedding_model === null,
    ).length;

    if (nullModelCount > 0) {
      throw new Error(
        `Found ${nullModelCount} rows with non-null embedding but null embedding_model. Re-embed all rows under ${EXPECTED_EMBEDDING_MODEL}.`,
      );
    }
    if (embeddingModelValues.size > 1) {
      throw new Error(
        `Found multiple distinct embedding_model values: ${Array.from(embeddingModelValues).join(", ")}`,
      );
    }
    if (embeddingModelValues.size === 1) {
      const [foundModel] = embeddingModelValues;
      if (foundModel !== EXPECTED_EMBEDDING_MODEL) {
        throw new Error(
          `Found embedding_model='${foundModel}', but expected '${EXPECTED_EMBEDDING_MODEL}'. Please re-embed under the confirmed model.`,
        );
      }
      console.log(`All stored rows use embedding_model='${foundModel}'.`);
    } else {
      console.log("No embedding_model values are populated yet.");
    }

    console.log("Fetching 5 random articles with stored embeddings...");
    const { data: randomArticles, error: fetchError } = await supabase
      .from("articles")
      .select("id, title, raw_text, embedding, embedding_model")
      .not("embedding", "is", null)
      .limit(5);
    if (fetchError) throw fetchError;

    console.log(`Fetched ${randomArticles.length} random articles\n`);
    console.log("=".repeat(72));
    console.log("SPOT-CHECK RESULTS");
    console.log("=".repeat(72));

    let spotCheckPassed = 0;
    for (let i = 0; i < randomArticles.length; i++) {
      const article = randomArticles[i];
      const parsedStoredEmbedding = parseEmbeddingValue(article.embedding);

      console.log(`\nChecking article ${i + 1} (ID: ${article.id})...`);
      console.log(`  Title: "${article.title}"`);
      console.log(`  Stored embedding type: ${typeof parsedStoredEmbedding}`);
      console.log(
        `  Stored embedding first 10 elements: ${JSON.stringify(Array.isArray(parsedStoredEmbedding) ? parsedStoredEmbedding.slice(0, 10) : parsedStoredEmbedding)}`,
      );

      // Build input text exactly as original embed script
      const inputText =
        (article.title || "") +
        "\n\n" +
        getFirstNWords(article.raw_text || "", 500);

      // Generate new embedding
      const response = await genAI.models.embedContent({
        model: EXPECTED_EMBEDDING_MODEL,
        contents: inputText,
        config: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" },
      });
      const newEmbedding = normalizeL2(response.embeddings[0].values);
      console.log(
        `  New embedding first 10 elements: ${JSON.stringify(newEmbedding.slice(0, 10))}`,
      );

      // Compute similarity with stored embedding
      const storedEmbedding = parsedStoredEmbedding;
      const similarity = cosineSimilarity(newEmbedding, storedEmbedding);

      const passed = similarity >= 0.9;
      if (passed) spotCheckPassed++;

      console.log(`  Self-similarity: ${similarity.toFixed(6)}`);
      console.log(`  Result: ${passed ? "✅ PASS" : "❌ FAIL"}`);

      if (i < randomArticles.length - 1) {
        await sleep(1500); // respect rate limit
      }
    }

    // 2. Check for duplicate embeddings (different articles, similarity >0.999)
    console.log("\n".repeat(2) + "=".repeat(72));
    console.log("DUPLICATE EMBEDDING CHECK");
    console.log("=".repeat(72));

    const { rows: allArticles } = await pool.query(
      `
        SELECT id, title, embedding
        FROM articles
        WHERE embedding IS NOT NULL
      `,
    );

    console.log(
      `Checking ${allArticles.length} articles for duplicate embeddings...`,
    );
    const duplicatePairs = [];

    for (let i = 0; i < allArticles.length; i++) {
      for (let j = i + 1; j < allArticles.length; j++) {
        const a = allArticles[i];
        const b = allArticles[j];
        const sim = cosineSimilarity(
          parseEmbeddingValue(a.embedding),
          parseEmbeddingValue(b.embedding),
        );
        if (sim > 0.999) {
          duplicatePairs.push({ a, b, similarity: sim });
        }
      }
    }

    if (duplicatePairs.length === 0) {
      console.log("✅ No duplicate embeddings found!");
    } else {
      console.log(
        `❌ Found ${duplicatePairs.length} duplicate embedding pairs:`,
      );
      for (const pair of duplicatePairs) {
        console.log("\n" + "-".repeat(72));
        console.log(`Similarity: ${pair.similarity.toFixed(6)}`);
        console.log(`Article A (ID: ${pair.a.id}): "${pair.a.title}"`);
        console.log(`Article B (ID: ${pair.b.id}): "${pair.b.title}"`);
      }
    }

    console.log("\n".repeat(2) + "=".repeat(72));
    console.log("VERIFICATION SUMMARY");
    console.log("=".repeat(72));
    console.log(
      `Spot-checks: ${spotCheckPassed}/${randomArticles.length} passed`,
    );
    console.log(`Duplicate pairs found: ${duplicatePairs.length}`);
    console.log("=".repeat(72));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
