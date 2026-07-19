
const { extract } = require("@extractus/article-extractor");

const USER_AGENT = "NewsLens-KE/0.1 (RSS ingestion; +https://github.com/newslens-ke)";

async function main() {
  console.log("Testing article extractor...");
  try {
    const article = await extract("https://nation.africa/kenya/news/ruto-says-kenya-will-not-be-blackmailed-over-trade-deals-4804588", {
      headers: { "User-Agent": USER_AGENT },
    });
    console.log("Article extraction successful!");
    console.log("Title:", article.title);
    console.log("Content preview (first 500 chars):", article.content.substring(0, 500));
  } catch (err) {
    console.error("Error extracting article:", err);
  }
}

main().catch(err => console.error("Fatal error:", err));
