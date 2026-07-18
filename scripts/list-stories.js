
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials in env");
  return createClient(url, key);
}

async function main() {
  const supabase = getSupabaseClient();
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, coverage_category, summary_updated_at");
  if (error) throw error;
  
  console.log("=== ALL STORIES ===");
  stories.forEach((story, idx) => {
    console.log(`#${idx + 1}`);
    console.log(`  ID: ${story.id}`);
    console.log(`  Title: ${story.title}`);
    console.log(`  Category: ${story.coverage_category || "unclassified"}`);
    console.log(`  Updated: ${story.summary_updated_at || "never"}\n`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
