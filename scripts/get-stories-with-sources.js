
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
    .select(
      "id, title, story_articles!inner(article_id, articles!inner(title, url, published_at, source_id, sources!inner(name)))"
    );

  if (error) {
    console.error("Error fetching stories:", error);
    process.exit(1);
  }

  console.log("=== Stories with Articles & Sources ===\n");
  stories.forEach((story) => {
    console.log(`Story ID: ${story.id}`);
    console.log(`Title: ${story.title}`);
    console.log(`Articles & Sources:`);
    story.story_articles.forEach((sa) => {
      console.log(
        `  - ${sa.articles.sources.name}: "${sa.articles.title}"`
      );
    });
    console.log("\n---\n");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
