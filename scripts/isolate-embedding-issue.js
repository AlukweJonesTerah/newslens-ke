require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");
const { createHash } = require("crypto");

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

function normalizeL2(vector) {
  if (!vector || vector.length === 0) return vector;
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / norm);
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

function parseEmbeddingValue(embedding) {
  if (Array.isArray(embedding)) return embedding;
  if (typeof embedding === "string") {
    try {
      const parsed = JSON.parse(embedding);
      return Array.isArray(parsed) ? parsed : embedding;
    } catch {
      return embedding;
    }
  }
  return embedding;
}

function hashString(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

async function main() {
  const supabase = getSupabaseClient();
  const genAI = getGenAIClient();
  const articleId = "bf3f119d-8fe7-4a4a-be8a-cdcc96d3f553";

  console.log("Isolating embedding issue for article ID:", articleId);

  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, title, raw_text, embedding")
    .eq("id", articleId)
    .limit(1);

  if (error) {
    throw error;
  }
  if (!articles || articles.length === 0) {
    throw new Error(`Article not found: ${articleId}`);
  }

  const article = articles[0];
  const inputText =
    (article.title || "") +
    "\n\n" +
    getFirstNWords(article.raw_text || "", 500);
  const textHash = hashString(inputText);

  console.log("\nArticle title:", article.title);
  console.log("Raw text length:", (article.raw_text || "").length);
  console.log("Input text length:", inputText.length);
  console.log("Input text SHA-256:", textHash);

  const request = {
    model: "models/gemini-embedding-2",
    contents: inputText,
    config: { outputDimensionality: 768 },
  };

  console.log("\nEmbedding request payload:");
  console.log(JSON.stringify(request, null, 2));

  const firstResp = await genAI.models.embedContent(request);
  const secondResp = await genAI.models.embedContent(request);

  const fresh1 = normalizeL2(firstResp.embeddings[0].values);
  const fresh2 = normalizeL2(secondResp.embeddings[0].values);
  const stored = normalizeL2(parseEmbeddingValue(article.embedding));

  const simFresh = cosineSimilarity(fresh1, fresh2);
  const simFresh1Stored = cosineSimilarity(fresh1, stored);
  const simFresh2Stored = cosineSimilarity(fresh2, stored);

  console.log("\nSIMILARITY RESULTS:");
  console.log(`  fresh #1 vs fresh #2: ${simFresh.toFixed(6)}`);
  console.log(`  fresh #1 vs stored: ${simFresh1Stored.toFixed(6)}`);
  console.log(`  fresh #2 vs stored: ${simFresh2Stored.toFixed(6)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
