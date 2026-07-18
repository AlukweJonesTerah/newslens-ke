require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local");

  const genAI = new GoogleGenAI({ apiKey });
  console.log("Listing available models from Gemini API...\n");

  const result = await genAI.models.list();
  const models = result.models; // The actual list is under .models

  console.log(
    "=== All available models (name, displayName, supportedActions) ===\n",
  );
  models.forEach((model) => {
    console.log(`Name: ${model.name}`);
    console.log(`Display Name: ${model.displayName}`);
    console.log(`Supported Actions: ${model.supportedActions.join(", ")}`);
    console.log("---");
  });

  console.log("\n=== Models supporting generateContent ===\n");
  const generateContentModels = models.filter((model) =>
    model.supportedActions.includes("generateContent"),
  );
  generateContentModels.forEach((model) => {
    console.log(`- ${model.name} (${model.displayName})`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
