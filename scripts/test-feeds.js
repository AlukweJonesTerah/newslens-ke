/**
 * RSS feed verification script for Kenyan news outlets.
 * Usage: node scripts/test-feeds.js
 */

const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "NewsLens-KE/0.1 (RSS verification; +https://github.com/newslens-ke)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

const FEEDS = [
  // Required feeds
  {
    name: "Nation Africa",
    url: "https://nation.africa/kenya/rss.xml",
    siteUrl: "https://nation.africa",
  },
  {
    name: "The Standard (Headlines)",
    url: "https://www.standardmedia.co.ke/rss/headlines.php",
    siteUrl: "https://www.standardmedia.co.ke",
  },
  {
    name: "Kenyans.co.ke",
    url: "https://www.kenyans.co.ke/feeds/news",
    siteUrl: "https://www.kenyans.co.ke",
  },
  // Business Daily Africa — candidate URLs to probe
  {
    name: "Business Daily Africa (candidate: /rss)",
    url: "https://www.businessdailyafrica.com/rss",
    siteUrl: "https://www.businessdailyafrica.com",
    note: "Probing common RSS path",
  },
  {
    name: "Business Daily Africa (candidate: /bd/rss.xml)",
    url: "https://www.businessdailyafrica.com/bd/rss.xml",
    siteUrl: "https://www.businessdailyafrica.com",
    note: "Probing Nation Media Group pattern",
  },
  {
    name: "Business Daily Africa (candidate: /feed)",
    url: "https://www.businessdailyafrica.com/feed",
    siteUrl: "https://www.businessdailyafrica.com",
    note: "Probing WordPress-style feed path",
  },
  // Additional outlets
  {
    name: "Citizen Digital (candidate: /feed)",
    url: "https://www.citizen.digital/feed",
    siteUrl: "https://www.citizen.digital",
    note: "Probing WordPress-style feed",
  },
  {
    name: "Citizen Digital (candidate: /news/politics/feed)",
    url: "https://www.citizen.digital/news/politics/feed",
    siteUrl: "https://www.citizen.digital",
    note: "Listed by third-party aggregators",
  },
  {
    name: "Citizen Digital (candidate: citizentv.co.ke/feed)",
    url: "https://www.citizentv.co.ke/feed",
    siteUrl: "https://www.citizentv.co.ke",
    note: "Legacy domain feed path",
  },
  {
    name: "KTN News (candidate: ktnnews.com/feed)",
    url: "https://www.ktnnews.com/feed",
    siteUrl: "https://www.ktnnews.com",
    note: "Probing WordPress-style feed",
  },
  {
    name: "KTN News (candidate: Standard KTN videos RSS)",
    url: "https://www.standardmedia.co.ke/rss/ktnvideos.php",
    siteUrl: "https://www.ktnnews.com",
    note: "Official KTN video feed via Standard Group",
  },
  {
    name: "NTV Kenya (candidate: /feed)",
    url: "https://www.ntvkenya.co.ke/feed",
    siteUrl: "https://www.ntvkenya.co.ke",
    note: "Probing WordPress-style feed",
  },
  {
    name: "NTV Kenya (candidate: /politics/feed)",
    url: "https://www.ntvkenya.co.ke/politics/feed",
    siteUrl: "https://www.ntvkenya.co.ke",
    note: "Listed by third-party aggregators",
  },
  {
    name: "The Star Kenya (candidate: /rss.xml)",
    url: "https://www.the-star.co.ke/rss.xml",
    siteUrl: "https://www.the-star.co.ke",
    note: "Listed by third-party aggregators",
  },
  {
    name: "The Star Kenya (candidate: /feed)",
    url: "https://www.the-star.co.ke/feed",
    siteUrl: "https://www.the-star.co.ke",
    note: "Probing WordPress-style feed",
  },
  {
    name: "Tuko (all news)",
    url: "https://www.tuko.co.ke/rss/all.rss",
    siteUrl: "https://www.tuko.co.ke",
  },
  {
    name: "Tuko (politics)",
    url: "https://www.tuko.co.ke/rss/politics.rss",
    siteUrl: "https://www.tuko.co.ke",
    note: "Category-specific feed",
  },
  {
    name: "People Daily (candidate: /feed)",
    url: "https://peopledaily.digital/feed",
    siteUrl: "https://peopledaily.digital",
    note: "Probing WordPress-style feed",
  },
  {
    name: "People Daily (candidate: /category/politics/feed)",
    url: "https://peopledaily.digital/category/politics/feed",
    siteUrl: "https://peopledaily.digital",
    note: "Listed by third-party aggregators",
  },
];

function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });
}

function formatItem(item, index) {
  const title = item.title?.trim() || "(no title)";
  const pubDate = item.pubDate || item.isoDate || "(no date)";
  const link = item.link || item.guid || "(no link)";
  return `    ${index + 1}. ${title}\n       pubDate: ${pubDate}\n       link: ${link}`;
}

async function testFeed(feed) {
  const result = {
    name: feed.name,
    url: feed.url,
    siteUrl: feed.siteUrl,
    note: feed.note,
    status: "unknown",
    feedTitle: null,
    itemCount: 0,
    recentItems: [],
    error: null,
  };

  try {
    const parsed = await parser.parseURL(feed.url);
    result.status = "ok";
    result.feedTitle = parsed.title || "(untitled feed)";
    result.itemCount = parsed.items?.length ?? 0;

    const recent = sortByDateDesc(parsed.items || []).slice(0, 3);
    result.recentItems = recent.map((item) => ({
      title: item.title?.trim() || "(no title)",
      pubDate: item.pubDate || item.isoDate || "(no date)",
      link: item.link || item.guid || "(no link)",
    }));
  } catch (err) {
    result.status = "failed";
    result.error = classifyError(err);
  }

  return result;
}

function classifyError(err) {
  const message = err?.message || String(err);

  if (/status code 404/i.test(message)) {
    return "HTTP 404 — feed URL not found";
  }
  if (/status code 403/i.test(message)) {
    return "HTTP 403 — access forbidden (may block bots)";
  }
  if (/status code 401/i.test(message)) {
    return "HTTP 401 — unauthorized";
  }
  if (/status code 5\d\d/i.test(message)) {
    return `Server error — ${message}`;
  }
  if (/ENOTFOUND|getaddrinfo/i.test(message)) {
    return "DNS lookup failed — domain not reachable";
  }
  if (/ETIMEDOUT|timeout/i.test(message)) {
    return "Request timed out";
  }
  if (/Non-whitespace before first tag|Unexpected close tag|Invalid character/i.test(message)) {
    return `Malformed XML — ${message}`;
  }
  if (/Feed not recognized as RSS/i.test(message) || /is not valid XML/i.test(message)) {
    return `Not valid RSS/XML — ${message}`;
  }

  return message;
}

function printResult(result) {
  const divider = "-".repeat(72);
  console.log(divider);
  console.log(`Source: ${result.name}`);
  console.log(`URL:    ${result.url}`);
  if (result.note) {
    console.log(`Note:   ${result.note}`);
  }

  if (result.status === "ok") {
    console.log(`Status: ✓ WORKING`);
    console.log(`Feed title: ${result.feedTitle}`);
    console.log(`Items returned: ${result.itemCount}`);
    console.log("3 most recent items:");
    result.recentItems.forEach((item, i) => {
      console.log(formatItem(item, i));
    });
  } else {
    console.log(`Status: ✗ FAILED`);
    console.log(`Reason: ${result.error}`);
  }
}

async function main() {
  console.log("NewsLens KE — RSS Feed Verification");
  console.log("=".repeat(72));
  console.log(`Testing ${FEEDS.length} feed URLs...\n`);

  const results = [];
  for (const feed of FEEDS) {
    const result = await testFeed(feed);
    results.push(result);
    printResult(result);
  }

  const working = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "failed");

  console.log("\n" + "=".repeat(72));
  console.log("SUMMARY");
  console.log("=".repeat(72));
  console.log(`Working: ${working.length} / ${results.length}`);
  console.log(`Failed:  ${failed.length} / ${results.length}`);

  if (working.length) {
    console.log("\nWorking feeds:");
    for (const r of working) {
      console.log(`  ✓ ${r.name} — ${r.feedTitle} (${r.itemCount} items)`);
      console.log(`    ${r.url}`);
    }
  }

  if (failed.length) {
    console.log("\nFailed feeds:");
    for (const r of failed) {
      console.log(`  ✗ ${r.name}`);
      console.log(`    ${r.url}`);
      console.log(`    → ${r.error}`);
    }
  }

  // Outlet-level verdicts for additional sources
  console.log("\n" + "=".repeat(72));
  console.log("OUTLET VERDICTS (additional sources)");
  console.log("=".repeat(72));

  const outletGroups = {
    "Business Daily Africa": [
      "Business Daily Africa (candidate: /rss)",
      "Business Daily Africa (candidate: /bd/rss.xml)",
      "Business Daily Africa (candidate: /feed)",
    ],
    "Citizen Digital": [
      "Citizen Digital (candidate: /feed)",
      "Citizen Digital (candidate: /news/politics/feed)",
      "Citizen Digital (candidate: citizentv.co.ke/feed)",
    ],
    "KTN News": [
      "KTN News (candidate: ktnnews.com/feed)",
      "KTN News (candidate: Standard KTN videos RSS)",
    ],
    "NTV Kenya": [
      "NTV Kenya (candidate: /feed)",
      "NTV Kenya (candidate: /politics/feed)",
    ],
    "The Star Kenya": [
      "The Star Kenya (candidate: /rss.xml)",
      "The Star Kenya (candidate: /feed)",
    ],
    Tuko: ["Tuko (all news)", "Tuko (politics)"],
    "People Daily": [
      "People Daily (candidate: /feed)",
      "People Daily (candidate: /category/politics/feed)",
    ],
  };

  for (const [outlet, names] of Object.entries(outletGroups)) {
    const outletResults = results.filter((r) => names.includes(r.name));
    const anyWorking = outletResults.filter((r) => r.status === "ok");

    if (anyWorking.length) {
      console.log(`\n${outlet}: RSS AVAILABLE`);
      for (const r of anyWorking) {
        console.log(`  → ${r.url} (${r.itemCount} items)`);
      }
    } else {
      console.log(`\n${outlet}: NO WORKING RSS FEED FOUND`);
      for (const r of outletResults) {
        console.log(`  ✗ ${r.url} — ${r.error}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
