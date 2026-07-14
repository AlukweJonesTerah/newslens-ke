require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { Pool } = require("pg");

// Configuration
const CLUSTER_WINDOW_HOURS = parseInt(process.env.CLUSTER_WINDOW_HOURS || "72");
const SIMILARITY_THRESHOLD = parseFloat(
  process.env.SIMILARITY_THRESHOLD || "0.83",
);
// Margin to relax anchor check compared to the centroid threshold
const ANCHOR_THRESHOLD_MARGIN = parseFloat(
  process.env.ANCHOR_THRESHOLD_MARGIN || "0.03",
);

function parseEmbeddingValue(embedding) {
  if (Array.isArray(embedding)) return embedding;
  if (typeof embedding === "string") {
    // Supabase/pgvector can return vector columns as JSON-like strings, so parse them before JS math.
    try {
      const parsed = JSON.parse(embedding);
      return Array.isArray(parsed) ? parsed : embedding;
    } catch {
      return embedding;
    }
  }
  return embedding;
}

// Helper: Union-Find (Disjoint Set Union)
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  find(x) {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)));
    }
    return this.parent.get(x);
  }

  union(x, y) {
    const xr = this.find(x);
    const yr = this.find(y);

    if (xr === yr) return;

    if (this.rank.get(xr) < this.rank.get(yr)) {
      this.parent.set(xr, yr);
    } else if (this.rank.get(xr) > this.rank.get(yr)) {
      this.parent.set(yr, xr);
    } else {
      this.parent.set(yr, xr);
      this.rank.set(xr, this.rank.get(xr) + 1);
    }
  }

  makeSet(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  getClusters() {
    const clusters = new Map();
    for (const node of this.parent.keys()) {
      const root = this.find(node);
      if (!clusters.has(root)) {
        clusters.set(root, []);
      }
      clusters.get(root).push(node);
    }
    return Array.from(clusters.values());
  }
}

// Main function
async function main() {
  console.log("NewsLens KE — Story Clustering");
  console.log("=".repeat(72));
  console.log(
    `Config: Cluster window = ${CLUSTER_WINDOW_HOURS}h, similarity threshold = ${SIMILARITY_THRESHOLD}`,
  );
  console.log("=".repeat(72));

  // Database connection (using DATABASE_URL from .env.local)
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

    const normalizedArticles = articles.map((article) => ({
      ...article,
      embedding: parseEmbeddingValue(article.embedding),
    }));

    console.log(`Found ${normalizedArticles.length} articles for clustering`);
    if (normalizedArticles.length < 2) {
      console.log("Not enough articles to cluster, exiting.");
      return;
    }

    // 2. Centroid-based clustering (process oldest -> newest)
    console.log("Building story clusters using centroid-based clustering...");
    const articleMap = new Map(normalizedArticles.map((a) => [a.id, a]));

    function addVectors(a, b) {
      const out = new Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
      return out;
    }

    function scaleVector(a, scalar) {
      const out = new Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = a[i] * scalar;
      return out;
    }

    function divideVector(a, scalar) {
      const out = new Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = a[i] / scalar;
      return out;
    }

    function normalizeL2Local(vector) {
      if (!vector || vector.length === 0) return vector;
      let norm = 0;
      for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
      norm = Math.sqrt(norm);
      if (norm === 0) return vector.map(() => 0);
      return vector.map((v) => v / norm);
    }

    function cosineSimilarityLocal(v1, v2) {
      if (!v1 || !v2 || v1.length !== v2.length) return 0;
      let dot = 0;
      let n1 = 0;
      let n2 = 0;
      for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        n1 += v1[i] * v1[i];
        n2 += v2[i] * v2[i];
      }
      n1 = Math.sqrt(n1);
      n2 = Math.sqrt(n2);
      if (n1 === 0 || n2 === 0) return 0;
      return dot / (n1 * n2);
    }

    // Clusters: each cluster has { ids: [], articles: [], sum: [...], count: N, centroid: [...], anchorEmbedding: [...] }
    const clusters = [];

    // Ensure articles sorted oldest first (published_at ASC already from query)
    for (const article of normalizedArticles) {
      const emb = article.embedding;
      if (!Array.isArray(emb) || emb.length === 0) continue;

      // Compare to existing cluster centroids and anchors.
      // We'll only consider clusters where BOTH:
      //  - similarity to centroid >= SIMILARITY_THRESHOLD
      //  - similarity to anchorEmbedding >= (SIMILARITY_THRESHOLD - ANCHOR_THRESHOLD_MARGIN)
      const anchorThreshold = SIMILARITY_THRESHOLD - ANCHOR_THRESHOLD_MARGIN;
      let bestSim = -1;
      let bestIdx = -1;

      for (let ci = 0; ci < clusters.length; ci++) {
        const c = clusters[ci];
        const centroidSim = cosineSimilarityLocal(c.centroid, emb);
        const anchorSim = cosineSimilarityLocal(c.anchorEmbedding, emb);
        if (
          centroidSim >= SIMILARITY_THRESHOLD &&
          anchorSim >= anchorThreshold
        ) {
          if (centroidSim > bestSim) {
            bestSim = centroidSim;
            bestIdx = ci;
          }
        }
      }

      if (bestIdx >= 0) {
        // Add to best cluster: update sum and count and centroid, anchor stays unchanged
        const c = clusters[bestIdx];
        c.ids.push(article.id);
        c.articles.push(article);
        c.count += 1;
        if (!c.sum || c.sum.length === 0) c.sum = emb.slice();
        else c.sum = addVectors(c.sum, emb);
        // centroid = normalize(sum / count)
        const avg = divideVector(c.sum, c.count);
        c.centroid = normalizeL2Local(avg);
      } else {
        // Start a new cluster where this article is the founding article (anchor)
        clusters.push({
          ids: [article.id],
          articles: [article],
          sum: emb.slice(),
          count: 1,
          centroid: normalizeL2Local(emb.slice()),
          anchorEmbedding: normalizeL2Local(emb.slice()),
        });
      }
    }

    // 6: Clear existing stories and story_articles for the window
    console.log(
      "Clearing existing stories/story_articles for this cluster window...",
    );
    const clearResult = await pool.query(
      `
        DELETE FROM story_articles
        WHERE article_id IN (
          SELECT id FROM articles WHERE published_at >= $1
        )
      `,
      [windowStart],
    );
    await pool.query(
      `
        DELETE FROM stories
        WHERE id NOT IN (
          SELECT story_id FROM story_articles
        )
      `,
    );
    console.log(`Deleted ${clearResult.rowCount} story_article links`);

    // Now process clusters and insert new stories
    let singleArticleCount = 0;
    let multiArticleClusters = [];
    let storyInsertions = 0;

    for (const cluster of clusters) {
      if (!cluster || !cluster.articles || cluster.articles.length === 0) {
        continue;
      }
      if (cluster.articles.length === 1) {
        singleArticleCount++;
        continue;
      }

      const clusterArticles = cluster.articles.sort(
        (a, b) => new Date(a.published_at) - new Date(b.published_at),
      );
      const title = clusterArticles[0].title;

      multiArticleClusters.push({
        title,
        articles: clusterArticles,
      });
    }

    // Now insert the stories and story_articles!
    console.log(
      `Inserting ${multiArticleClusters.length} story clusters (excluding single-article stories)...`,
    );
    for (const cluster of multiArticleClusters) {
      const { rows: storyRows } = await pool.query(
        `
          INSERT INTO stories (title, updated_at)
          VALUES ($1, NOW())
          RETURNING id
        `,
        [cluster.title],
      );
      const storyId = storyRows[0].id;
      storyInsertions++;

      for (const a of cluster.articles) {
        await pool.query(
          `
            INSERT INTO story_articles (story_id, article_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `,
          [storyId, a.id],
        );
      }
    }

    // 7: Log everything clearly!
    console.log("\n".repeat(2));
    console.log("=".repeat(72));
    console.log("CLUSTERING RESULTS");
    console.log("=".repeat(72));
    console.log(`Total clusters found: ${clusters.length}`);
    console.log(`  - Single-article clusters (skipped): ${singleArticleCount}`);
    console.log(
      `  - Multi-article clusters (inserted as stories): ${multiArticleClusters.length}`,
    );
    console.log("=".repeat(72));

    if (multiArticleClusters.length > 0) {
      console.log("\n--- Multi-Article Clusters ---");
      for (let i = 0; i < multiArticleClusters.length; i++) {
        const cluster = multiArticleClusters[i];
        console.log("\n" + "-".repeat(72));
        console.log(
          `Cluster ${i + 1} (size ${cluster.articles.length}): "${cluster.title}"`,
        );
        console.log("-".repeat(72));
        for (const a of cluster.articles) {
          console.log(`  [${a.source_name}] ${a.title}`);
        }
      }
    }

    console.log("\n" + "=".repeat(72));
    console.log("✅ Done!");
    console.log("=".repeat(72));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
