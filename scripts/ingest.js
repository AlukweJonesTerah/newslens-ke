/**
 * RSS ingestion worker — fetches feeds, extracts full article text, inserts into Supabase.
 * Usage: node scripts/ingest.js
 */

const { getSupabaseClient, sleep } = require("./lib.js");
const { extract } = require("@extractus/article-extractor");
const Parser = require("rss-parser");

const USER_AGENT =
  "NewsLens-KE/0.1 (RSS ingestion; +https://github.com/newslens-ke)";

const RSS_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_DELAY_MS = 500;

const SEED_SOURCES = [
  {
    name: "Nation Africa",
    rss_url: "https://nation.africa/kenya/rss.xml",
    site_url: "https://nation.africa",
  },
  {
    name: "The Standard",
    rss_url: "https://www.standardmedia.co.ke/rss/headlines.php",
    site_url: "https://www.standardmedia.co.ke",
  },
  {
    name: "Kenyans.co.ke",
    rss_url: "https://www.kenyans.co.ke/feeds/news",
    site_url: "https://www.kenyans.co.ke",
  },
  {
    name: "Business Daily Africa",
    rss_url: "https://www.businessdailyafrica.com/bd/rss.xml",
    site_url: "https://www.businessdailyafrica.com",
  },
  {
    name: "Tuko (all)",
    rss_url: "https://www.tuko.co.ke/rss/all.rss",
    site_url: "https://www.tuko.co.ke",
  },
  {
    name: "Tuko (politics)",
    rss_url: "https://www.tuko.co.ke/rss/politics.rss",
    site_url: "https://www.tuko.co.ke",
  },
  {
    name: "People Daily",
    rss_url: "https://peopledaily.digital/feed",
    site_url: "https://peopledaily.digital",
  },
];

const parser = new Parser({
  timeout: RSS_TIMEOUT_MS,
  headers: {
    "User-Agent": USER_AGENT,
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl.trim());
    parsed.search = "";
    parsed.hash = "";

    let normalized = parsed.href.toLowerCase();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/$/, "");
  }
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRssFallbackText(item) {
  const candidates = [
    item.contentSnippet,
    stripHtml(item.content),
    stripHtml(item.summary),
    stripHtml(item.description),
  ];

  for (const text of candidates) {
    if (text && text.length > 0) return text;
  }
  return null;
}

function parsePublishedAt(item) {
  const raw = item.isoDate || item.pubDate;
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function extractWithArticleExtractor(url) {
  const article = await extract(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!article?.content) return null;

  // Convert the extracted content (HTML) to plain text by stripping tags
  const text = stripHtml(article.content).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

async function extractArticleText(url, item) {
  try {
    const text = await extractWithArticleExtractor(url);
    if (text) {
      return { text, usedFallback: false };
    }
  } catch {
    // Fall through to RSS fallback
  }

  const fallback = getRssFallbackText(item);
  return { text: fallback, usedFallback: true };
}

async function seedSources(supabase) {
  const { data, error } = await supabase
    .from("sources")
    .upsert(SEED_SOURCES, { onConflict: "rss_url", ignoreDuplicates: false })
    .select("id, name, rss_url, site_url");

  if (error) {
    throw new Error(`Failed to seed sources: ${error.message}`);
  }

  return data;
}

async function getExistingUrls(supabase, urls) {
  if (urls.length === 0) return new Set();

  const existing = new Set();
  const chunkSize = 100;

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("articles")
      .select("url")
      .in("url", chunk);

    if (error) {
      throw new Error(`Failed to check existing articles: ${error.message}`);
    }

    for (const row of data || []) {
      existing.add(row.url);
    }
  }

  return existing;
}

async function ingestSource(supabase, source) {
  const stats = {
    source: source.name,
    inserted: 0,
    skipped: 0,
    failedExtraction: 0,
    errors: 0,
    feedError: null,
  };

  let feed;
  try {
    feed = await parser.parseURL(source.rss_url);
  } catch (err) {
    stats.feedError = err?.message || String(err);
    return stats;
  }

  const items = (feed.items || [])
    .map((item) => {
      const link = item.link || item.guid;
      const normalizedUrl = normalizeUrl(link);
      return normalizedUrl ? { item, normalizedUrl, link } : null;
    })
    .filter(Boolean);

  const normalizedUrls = items.map((entry) => entry.normalizedUrl);
  let existingUrls;

  try {
    existingUrls = await getExistingUrls(supabase, normalizedUrls);
  } catch (err) {
    stats.feedError = err.message;
    return stats;
  }

  for (const { item, normalizedUrl, link } of items) {
    if (existingUrls.has(normalizedUrl)) {
      stats.skipped += 1;
      continue;
    }

    try {
      const title = item.title?.trim();
      if (!title) {
        stats.errors += 1;
        continue;
      }

      const { text, usedFallback } = await extractArticleText(link, item);
      if (usedFallback) {
        stats.failedExtraction += 1;
      }

      const { error } = await supabase.from("articles").insert({
        source_id: source.id,
        title,
        url: normalizedUrl,
        raw_text: text,
        published_at: parsePublishedAt(item),
        fetched_at: new Date().toISOString(),
      });

      if (error) {
        if (error.code === "23505") {
          stats.skipped += 1;
        } else {
          stats.errors += 1;
          console.error(`  Insert error (${source.name}): ${error.message}`);
        }
      } else {
        stats.inserted += 1;
        existingUrls.add(normalizedUrl);
      }
    } catch (err) {
      stats.errors += 1;
      console.error(
        `  Item error (${source.name}, ${link}): ${err?.message || err}`,
      );
    }

    await sleep(FETCH_DELAY_MS);
  }

  return stats;
}

function printSummary(allStats) {
  console.log("\n" + "=".repeat(72));
  console.log("INGESTION SUMMARY");
  console.log("=".repeat(72));

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailedExtraction = 0;
  let totalErrors = 0;

  for (const stats of allStats) {
    if (stats.feedError) {
      console.log(`\n${stats.source}`);
      console.log(`  FEED FAILED: ${stats.feedError}`);
      continue;
    }

    console.log(`\n${stats.source}`);
    console.log(`  New articles inserted:  ${stats.inserted}`);
    console.log(`  Skipped (duplicates):   ${stats.skipped}`);
    console.log(`  Failed extraction:      ${stats.failedExtraction}`);
    if (stats.errors > 0) {
      console.log(`  Other errors:           ${stats.errors}`);
    }

    totalInserted += stats.inserted;
    totalSkipped += stats.skipped;
    totalFailedExtraction += stats.failedExtraction;
    totalErrors += stats.errors;
  }

  console.log("\n" + "-".repeat(72));
  console.log("TOTALS");
  console.log(`  Inserted:           ${totalInserted}`);
  console.log(`  Skipped:            ${totalSkipped}`);
  console.log(`  Failed extraction:  ${totalFailedExtraction}`);
  console.log(`  Other errors:       ${totalErrors}`);
  console.log("=".repeat(72));
}

async function runIngest(supabase) {
  console.log("📰 NewsLens KE — RSS Ingestion");
  console.log("=".repeat(72));

  console.log("Seeding sources...");
  const sources = await seedSources(supabase);
  console.log(`Active sources: ${sources.length}`);

  const allStats = [];

  for (const source of sources) {
    console.log(`\nIngesting: ${source.name}`);
    const stats = await ingestSource(supabase, source);
    allStats.push(stats);

    if (stats.feedError) {
      console.log(`  ✗ Feed failed: ${stats.feedError}`);
    } else {
      console.log(
        `  ✓ Done — inserted ${stats.inserted}, skipped ${stats.skipped}, extraction fallback ${stats.failedExtraction}`,
      );
    }
  }

  printSummary(allStats);

  return allStats;
}

async function main() {
  const supabase = getSupabaseClient();
  return runIngest(supabase);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  });
}

module.exports = { runIngest };
