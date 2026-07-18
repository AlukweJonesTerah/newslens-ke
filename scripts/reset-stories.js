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
    .select("id, title");
  if (error) throw error;

  console.log(`Resetting ALL summary fields for ${stories.length} stories...`);
  const { error: updateError } = await supabase
    .from("stories")
    .update({
      coverage_category: null,
      summary_updated_at: null,
      neutral_summary: null,
      per_source: null,
      consensus_claims: null,
    })
    .not("id", "is", null); // Update all stories

  if (updateError) throw updateError;
  console.log("Reset complete!");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
