require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

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

async function main() {
  const supabase = getSupabaseClient();

  console.log("Checking articles with null embeddings...");
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  // First check sources
  const { data: sources } = await supabase.from("sources").select("*");
  console.log("Sources:", sources);

  const { data: totalArticles, error: totalError } = await supabase
    .from("articles")
    .select("*", { count: "exact" });

  console.log("Total articles error:", totalError);
  console.log("Total articles count:", totalArticles?.length || 0);
  console.log("Total articles sample:", totalArticles?.[0]);

  const { data: nullEmbeddingArticles, error: nullError } = await supabase
    .from("articles")
    .select("id", { count: "exact" })
    .is("embedding", null);

  console.log("Null embeddings error:", nullError);
  console.log(
    "Articles with null embeddings:",
    nullEmbeddingArticles?.length || 0,
  );
}

main().catch(console.error);
