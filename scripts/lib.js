require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local",
    );
  return createClient(url, key);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  return (
    err?.status === 429 ||
    err?.message?.includes("429") ||
    err?.message?.includes("RESOURCE_EXHAUSTED")
  );
}

function normalizeL2(vector) {
  if (!vector || vector.length === 0) return vector;
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / norm);
}

function getFirstNWords(text, n = 500) {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  return words.slice(0, n).join(" ");
}

module.exports = {
  getSupabaseClient,
  sleep,
  isRateLimitError,
  normalizeL2,
  getFirstNWords,
};
