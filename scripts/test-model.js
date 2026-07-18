
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in env");
  const genAI = new GoogleGenAI({ apiKey });

  const testModels = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.5-pro",
    "gemini-2.0-pro"
  ];

  for (const model of testModels) {
    try {
      console.log(`Testing model: ${model}`);
      const response = await genAI.models.generateContent({
        model,
        contents: "Hello, world! Please respond with JSON {\"message\": \"hi\"}"
      });
      console.log(`Success with model ${model}:`, response.text);
      break;
    } catch (err) {
      console.log(`Failed with model ${model}:`, err.message);
    }
  }
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
