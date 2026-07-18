require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const storyId = "101b8fad-e43c-415b-87fe-fc7ed1813d7e";

  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .single();

  if (error) {
    console.error("Error fetching story:", error);
    process.exit(1);
  }

  console.log("=== RAW DB STORY DATA ===");
  console.log("Story ID:", data.id);
  console.log("Title:", data.title);
  console.log("coverage_category:", data.coverage_category);
  console.log("neutral_summary:", data.neutral_summary);
  console.log("per_source (raw):", JSON.stringify(data.per_source, null, 2));
  console.log("per_source type:", typeof data.per_source);
  console.log(
    "consensus_claims (raw):",
    JSON.stringify(data.consensus_claims, null, 2),
  );
  console.log("consensus_claims type:", typeof data.consensus_claims);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
