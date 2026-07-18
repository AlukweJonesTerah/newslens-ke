
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Use postgres rpc or raw query via supabase's sql function
  const { error } = await supabase.rpc("exec_sql", {
    sql_text:
      "ALTER TABLE stories ADD COLUMN IF NOT EXISTS per_source JSONB DEFAULT NULL;",
  });
  // Wait, if we can use the direct sql function may not exist — use a better approach
  // Wait, alternatively use the Supabase dashboard to add the column via their UI, but let's use a raw query using postgrest? Wait no, let's just write a quick script using pg instead!
  // Wait let's use node-postgres!
  const { Client } = require("pg");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL!");
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
  });
  await client.connect();

  await client.query(
    "ALTER TABLE stories ADD COLUMN IF NOT EXISTS per_source JSONB DEFAULT NULL"
  );

  console.log("Added per_source column to stories table!");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
