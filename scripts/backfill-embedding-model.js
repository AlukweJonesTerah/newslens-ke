require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase credentials!");
  }
  return createClient(url, key);
}

async function main() {
  const supabase = getSupabaseClient();
  console.log("NewsLens KE — Backfill embedding_model");
  console.log("=".repeat(72));

  const { data: articles, error } = await supabase
    .from("articles")
    .select("id")
    .not("embedding", "is", null)
    .is("embedding_model", null);

  if (error) {
    throw new Error(`Failed to fetch articles: ${error.message}`);
  }

  console.log(`Found ${articles.length} articles to backfill!`);

  if (articles.length === 0) {
    console.log("✅ Nothing to do!");
    return;
  }

  // Update them in batches of 50 to avoid overwhelming Supabase
  const batchSize = 50;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    console.log(
      `Updating batch ${i / batchSize + 1} (${batch.length} articles)...`,
    );

    const { error: updateError } = await supabase
      .from("articles")
      .update({ embedding_model: "models/gemini-embedding-2" })
      .in(
        "id",
        batch.map((a) => a.id),
      );

    if (updateError) {
      throw new Error(`Failed to update batch: ${updateError.message}`);
    }

    if (i + batchSize < articles.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(
    "\n✅ Successfully backfilled embedding_model for all applicable articles!",
  );
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
