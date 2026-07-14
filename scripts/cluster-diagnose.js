require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Configuration
const CLUSTER_WINDOW_HOURS = parseInt(process.env.CLUSTER_WINDOW_HOURS || "72");

async function main() {
  console.log("NewsLens KE — Cluster Diagnostics");
  console.log("=".repeat(72));

  // Database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // 1. Fetch articles within the window
    const windowStart = new Date(
      Date.now() - CLUSTER_WINDOW_HOURS * 3600 * 1000,
    );
    console.log(
      `Fetching articles published after: ${windowStart.toISOString()}`,
    );

    const { rows: articles } = await pool.query(
      `
        SELECT
          a.id,
          a.title,
          a.published_at,
          s.name as source_name,
          a.embedding
        FROM articles a
        JOIN sources s ON a.source_id = s.id
        WHERE
          a.embedding IS NOT NULL
          AND a.published_at >= $1
        ORDER BY a.published_at ASC
      `,
      [windowStart],
    );

    console.log(`Found ${articles.length} articles for diagnostics`);
    const articleMap = new Map(articles.map((a) => [a.id, a]));
    const articleIds = articles.map((a) => a.id);

    // 2. Compute all pairwise cosine similarities
    console.log("Calculating pairwise cosine similarities...");
    const { rows: distances } = await pool.query(
      `
        SELECT
          a1.id AS id1,
          a2.id AS id2,
          1 - (a1.embedding <=> a2.embedding) AS cosine_similarity
        FROM articles a1
        JOIN articles a2 ON a1.id < a2.id
        WHERE
          a1.id = ANY($1)
          AND a2.id = ANY($1)
      `,
      [articleIds],
    );

    // Prepare sorted list of pairs
    const sortedPairs = distances.sort(
      (a, b) => b.cosine_similarity - a.cosine_similarity,
    );

    // Write to CSV
    const csvPath = path.join(__dirname, "../similarity-scores.csv");
    const csvLines = ["title1,title2,score"];
    sortedPairs.forEach((pair) => {
      const a1 = articleMap.get(pair.id1);
      const a2 = articleMap.get(pair.id2);
      csvLines.push(
        `"${a1.title.replace(/"/g, '""')}","${a2.title.replace(/"/g, '""')}",${pair.cosine_similarity.toFixed(6)}`,
      );
    });
    fs.writeFileSync(csvPath, csvLines.join("\n"));
    console.log(`Wrote similarity scores to ${csvPath}`);

    // 3. Find NTSA/logbook articles
    console.log("\n".repeat(2) + "=".repeat(72));
    console.log("NTSA LOGBOOK ARTICLES PAIRWISE SCORES");
    console.log("=".repeat(72));
    const ntsaArticles = articles.filter(
      (a) =>
        a.title.toLowerCase().includes("ntsa") &&
        a.title.toLowerCase().includes("logbook"),
    );
    console.log(`Found ${ntsaArticles.length} NTSA logbook articles:`);
    ntsaArticles.forEach((a) =>
      console.log(`  - [${a.source_name}] ${a.title}`),
    );

    if (ntsaArticles.length >= 2) {
      console.log("\nPairwise scores between them:");
      for (let i = 0; i < ntsaArticles.length; i++) {
        for (let j = i + 1; j < ntsaArticles.length; j++) {
          const a1 = ntsaArticles[i];
          const a2 = ntsaArticles[j];
          const pair = sortedPairs.find(
            (p) =>
              (p.id1 === a1.id && p.id2 === a2.id) ||
              (p.id1 === a2.id && p.id2 === a1.id),
          );
          console.log(
            `  "${a1.title}" ↔ "${a2.title}": ${pair ? pair.cosine_similarity.toFixed(6) : "N/A"}`,
          );
        }
      }
    }

    // 4. Find university course listing articles
    console.log("\n".repeat(2) + "=".repeat(72));
    console.log("UNIVERSITY COURSE LISTING PAIRWISE SCORES");
    console.log("=".repeat(72));
    const universityArticles = articles.filter(
      (a) =>
        a.title.toLowerCase().includes("university") &&
        a.title.toLowerCase().includes("courses"),
    );
    console.log(
      `Found ${universityArticles.length} university course articles:`,
    );
    universityArticles.forEach((a) =>
      console.log(`  - [${a.source_name}] ${a.title}`),
    );

    if (universityArticles.length >= 2) {
      console.log("\nPairwise scores between them:");
      for (let i = 0; i < universityArticles.length; i++) {
        for (let j = i + 1; j < universityArticles.length; j++) {
          const a1 = universityArticles[i];
          const a2 = universityArticles[j];
          const pair = sortedPairs.find(
            (p) =>
              (p.id1 === a1.id && p.id2 === a2.id) ||
              (p.id1 === a2.id && p.id2 === a1.id),
          );
          console.log(
            `  "${a1.title}" ↔ "${a2.title}": ${pair ? pair.cosine_similarity.toFixed(6) : "N/A"}`,
          );
        }
      }
    }

    // 5. Print score distribution
    console.log("\n".repeat(2) + "=".repeat(72));
    console.log("SCORE DISTRIBUTION");
    console.log("=".repeat(72));
    const thresholds = [0.75, 0.8, 0.83, 0.87, 0.9];
    const counts = new Map(thresholds.map((t) => [t, 0]));
    sortedPairs.forEach((pair) => {
      thresholds.forEach((t) => {
        if (pair.cosine_similarity >= t) {
          counts.set(t, counts.get(t) + 1);
        }
      });
    });
    thresholds.forEach((t) => {
      console.log(`Pairs ≥ ${t.toFixed(2)}: ${counts.get(t)}`);
    });

    console.log("\n".repeat(2) + "=".repeat(72));
    console.log("✅ Diagnostics complete!");
    console.log("=".repeat(72));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
