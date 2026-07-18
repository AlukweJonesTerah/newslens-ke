
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Try inserting a small test row to check if the column exists
  const { error: insertError } = await supabase.from("stories").insert({
    id: "temp-test-id-1234",
    title: "Temp test story",
  });

  console.log("=== Insert test error ===");
  console.log(insertError ? JSON.stringify(insertError, null, 2) : "No error (column might exist, or insert succeeded)");

  // Cleanup: remove temp story if it was inserted
  if (!insertError) {
    await supabase.from("stories").delete().eq("id", "temp-test-id-1234");
  }

  // Alternatively, let's try querying a story with per_source specifically
  const { data: testStory, error: queryError } = await supabase
    .from("stories")
    .select("id, title, per_source")
    .limit(1)
    .single();

  console.log("\n=== Query with per_source ===");
  console.log(queryError ? JSON.stringify(queryError, null, 2) : "Success!");
  console.log("testStory:", JSON.stringify(testStory, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
