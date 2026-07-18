
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, neutral_summary, coverage_category, summary_updated_at");

  if (error) {
    console.error("Error fetching stories:", error);
    process.exit(1);
  }

  console.log("=== Story Completeness Report ===\n");

  const totalStories = stories.length;
  let hasNeutralSummary = 0;
  let hasCoverageCategory = 0;
  let fullyNull = 0;

  stories.forEach((story) => {
    const hasNS = story.neutral_summary !== null;
    const hasCC = story.coverage_category !== null;

    if (hasNS) hasNeutralSummary++;
    if (hasCC) hasCoverageCategory++;
    if (!hasNS && !hasCC) fullyNull++;
  });

  console.log(`Total stories: ${totalStories}`);
  console.log(`Stories with non-null neutral_summary: ${hasNeutralSummary}`);
  console.log(`Stories with non-null coverage_category: ${hasCoverageCategory}`);
  console.log(`Stories fully NULL (no summary or category): ${fullyNull}\n`);

  console.log("=== Story IDs with NULL data ===");
  stories
    .filter(
      (story) =>
        story.neutral_summary === null || story.coverage_category === null
    )
    .forEach((story) => {
      console.log(`- ${story.id}`);
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
