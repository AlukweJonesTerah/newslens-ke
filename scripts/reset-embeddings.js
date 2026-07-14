require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local");
  }
  return createClient(url, key);
}

async function main() {
  console.log("NewsLens KE — Reset embeddings and embedding_model");
  console.log("=".repeat(72));

  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("articles")
    .update({
      embedding: null,
      embedding_model: null,
    })
    .not("id", "is", null);

  if (error) {
    throw new Error(`Failed to reset embeddings: ${error.message}`);
  }

  console.log("✅ All article embeddings and embedding_model values have been reset to NULL.");
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
