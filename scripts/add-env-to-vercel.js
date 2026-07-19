const fs = require("fs");
const { execSync } = require("child_process");

const envFile = fs.readFileSync(".env.local", "utf8");
const lines = envFile
  .split("\n")
  .filter((line) => line.trim() && !line.startsWith("#"));

for (const line of lines) {
  const [name, ...valueParts] = line.split("=");
  const value = valueParts.join("=").trim();
  if (name && value && !name.startsWith("VERCEL_")) {
    // Skip Vercel auto vars
    console.log(`Processing ${name}...`);
    try {
      // First try to remove existing var
      try {
        execSync(`vercel env rm ${name} production --yes`, {
          stdio: ["inherit", "pipe", "pipe"],
        });
        console.log(`  Removed existing ${name}`);
      } catch (removeErr) {
        // Ignore if var doesn't exist
      }

      // Now add the var
      execSync(`vercel env add ${name} production --value "${value}" --yes`, {
        stdio: ["inherit", "pipe", "pipe"],
      });
      console.log(`✓ Added ${name}`);
    } catch (e) {
      console.error(`Failed to process ${name}:`, e.message);
    }
  }
}
