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

// Flag borderline cases based on keywords in title (case-insensitive)
function isBorderlineCase(title) {
  const lowerTitle = title.toLowerCase();

  // Keywords that suggest non-government focus
  const borderlineKeywords = [
    "university",
    "universities",
    "college",
    "campus",
    "business",
    "economy",
    "market",
    "company",
    "corporate",
    "bank",
    "loan",
    "shilling",
    "shares",
    "stock",
    "sport",
    "sports",
    "football",
    "soccer",
    "rugby",
    "athletics",
    "game",
    "match",
    "entertainment",
    "music",
    "movie",
    "film",
    "celebrity",
    "arts",
    "crime",
    "theft",
    "robbery",
    "murder",
    "shooting",
    "stabbing",
  ];

  // Check if any borderline keyword is present
  const hasBorderlineKeyword = borderlineKeywords.some((keyword) =>
    lowerTitle.includes(keyword),
  );

  // If it has a borderline keyword but NO strong government keyword, it's borderline
  const governmentKeywords = [
    "government",
    "president",
    "ruto",
    "gachagua",
    "minister",
    "parliament",
    "senate",
    "county",
    "statehouse",
    "mp",
    "mca",
    "cs",
    "cabinet",
    "policy",
    "bill",
    "legislation",
    "governor",
    "police",
    "ig",
    "dci",
    "judiciary",
    "court",
    "supreme court",
  ];

  const hasGovernmentKeyword = governmentKeywords.some((keyword) =>
    lowerTitle.includes(keyword),
  );

  return hasBorderlineKeyword && !hasGovernmentKeyword;
}

async function main() {
  const supabase = getSupabaseClient();

  console.log("Fetching ALL stories from the database...");
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, coverage_category");
  if (error) throw error;

  console.log(`Found ${stories.length} total stories\n`);

  // Tally coverage categories
  const tally = {};
  let nullCount = 0;
  const borderlineCases = [];

  stories.forEach((story) => {
    if (story.coverage_category) {
      tally[story.coverage_category] =
        (tally[story.coverage_category] || 0) + 1;
      if (isBorderlineCase(story.title)) {
        borderlineCases.push(story);
      }
    } else {
      nullCount++;
    }
  });

  // Print the tally
  console.log("=".repeat(72));
  console.log("COVERAGE CATEGORY TALLY");
  console.log("=".repeat(72));
  Object.keys(tally)
    .sort()
    .forEach((category) => {
      console.log(`${category}: ${tally[category]}`);
    });
  console.log(`NULL (pending): ${nullCount}`);
  console.log();

  // Print borderline cases
  console.log("=".repeat(72));
  console.log("BORDERLINE CASES");
  console.log("=".repeat(72));
  if (borderlineCases.length === 0) {
    console.log("No borderline cases found.");
  } else {
    console.log(
      `Found ${borderlineCases.length} potential borderline stories:\n`,
    );
    borderlineCases.forEach((story) => {
      console.log(`- ID: ${story.id}`);
      console.log(`  Title: ${story.title}`);
      console.log(`  Category: ${story.coverage_category}\n`);
    });
  }
  console.log("=".repeat(72));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
