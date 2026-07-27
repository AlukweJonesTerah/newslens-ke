import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import StoryDetailClient from "../../story-detail-client";

export const revalidate = 300; // Revalidate every 5 minutes so pipeline updates show up without a redeploy

type CoverageCategory =
  | "government_focused"
  | "opposition_focused"
  | "public_focused"
  | "business_focused"
  | "international_focused"
  | null;

interface Story {
  id: string;
  title: string;
  neutral_summary: string | null;
  coverage_category: CoverageCategory;
  summary_updated_at: string | null;
  created_at: string;
  per_source?: Record<string, string>;
  consensus_claims?: { claim: string; sources: string[] }[];
}

interface Article {
  id: string;
  title: string;
  url: string;
  raw_text: string | null;
  published_at: string | null;
  source_name: string;
  embedding: number[] | null;
}

interface StorySource {
  id: string;
  name: string;
}

interface FactCheck {
  id: string;
  title: string;
  url: string;
  verdict: string | null;
  published_at: string | null;
  similarity: number;
}

function parseEmbeddingValue(embedding: unknown): number[] | null {
  if (Array.isArray(embedding)) return embedding as number[];
  if (typeof embedding === "string") {
    try {
      const parsed = JSON.parse(embedding);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function addVectors(a: number[], b: number[]): number[] {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

function divideVector(a: number[], scalar: number): number[] {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] / scalar;
  return out;
}

function normalizeL2Local(vector: number[]): number[] {
  if (!vector || vector.length === 0) return vector;
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vector.map(() => 0);
  return vector.map((v) => v / norm);
}

function cosineSimilarityLocal(v1: number[], v2: number[]): number {
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

function computeStoryCentroid(
  articles: { embedding: unknown }[],
): number[] | null {
  const validEmbeddings = articles
    .map((a) => parseEmbeddingValue(a.embedding))
    .filter((e): e is number[] => Array.isArray(e) && e.length > 0);
  if (validEmbeddings.length === 0) return null;

  let sum = validEmbeddings[0].slice();
  for (let i = 1; i < validEmbeddings.length; i++) {
    sum = addVectors(sum, validEmbeddings[i]);
  }
  const avg = divideVector(sum, validEmbeddings.length);
  return normalizeL2Local(avg);
}

async function getStory(storyId: string) {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id,title,neutral_summary,coverage_category,summary_updated_at,created_at,per_source,consensus_claims",
    )
    .eq("id", storyId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Story;
}

async function getStoryArticles(storyId: string) {
  const { data, error } = await supabase
    .from("story_articles")
    .select(
      "article_id,articles(id,title,url,raw_text,published_at,source_id,embedding)",
    )
    .eq("story_id", storyId);

  if (error) {
    throw new Error(error.message);
  }

  const articleRows = data || [];
  const sourceIds = Array.from(
    new Set(articleRows.map((row: any) => row.articles.source_id)),
  );

  let sources: StorySource[] = [];
  if (sourceIds.length > 0) {
    const { data: srcData, error: srcErr } = await supabase
      .from("sources")
      .select("id,name")
      .in("id", sourceIds);

    if (srcErr) {
      throw new Error(srcErr.message);
    }
    sources = srcData || [];
  }

  const sourceMap = new Map(sources.map((source) => [source.id, source.name]));

  const articles = articleRows.map((row: any) => ({
    ...row.articles,
    source_name: sourceMap.get(row.articles.source_id) || "Unknown",
  })) as Article[];

  return { articles, sources };
}

async function getRelatedStories(
  currentStoryId: string,
  currentStoryArticles: Article[],
) {
  // 1. Compute centroid for current story
  const currentCentroid = computeStoryCentroid(currentStoryArticles);
  if (!currentCentroid) return [];

  // 2. Fetch all other stories and their linked articles' embeddings
  const { data: allStories, error: storiesError } = await supabase
    .from("stories")
    .select(
      "id, title, coverage_category, updated_at, story_articles(article_id, articles(embedding))",
    )
    .neq("id", currentStoryId);

  if (storiesError || !allStories) return [];

  type StoryRow = (typeof allStories)[number];

  // 3. For each story, compute its centroid and calculate similarity
  const storySimilarities: { story: StoryRow; similarity: number }[] = [];

  for (const story of allStories) {
    const saList: Array<{ embedding: unknown }> = (
      story.story_articles ?? []
    ).flatMap((sa: { articles?: unknown }) => {
      const arts = sa.articles;
      if (!arts) return [];
      // Supabase returns the related record as a single object
      // (many-to-one via story_articles.article_id → articles.id)
      if (Array.isArray(arts)) return arts as Array<{ embedding: unknown }>;
      return [arts as { embedding: unknown }];
    });
    const storyArticles = saList.map((a) => ({ embedding: a.embedding }));
    const storyCentroid = computeStoryCentroid(storyArticles);
    if (!storyCentroid) continue;
    const similarity = cosineSimilarityLocal(currentCentroid, storyCentroid);
    if (similarity >= 0.5) {
      storySimilarities.push({ story, similarity });
    }
  }

  // 4. Sort by similarity descending, take top 3
  storySimilarities.sort((a, b) => b.similarity - a.similarity);
  const topStories = storySimilarities.slice(0, 3).map(({ story }) => ({
    id: story.id,
    title: story.title,
    coverage_category: story.coverage_category as CoverageCategory,
    article_count: (story.story_articles || []).length,
  }));

  return topStories;
}

async function getRelatedFactChecks(
  currentStoryArticles: Article[],
): Promise<FactCheck[]> {
  // 1. Compute centroid for current story
  const currentCentroid = computeStoryCentroid(currentStoryArticles);
  if (!currentCentroid) return [];

  // 2. Fetch all fact-check articles with embeddings
  const { data: factCheckArticles, error: factCheckError } = await supabase
    .from("articles")
    .select("id, title, url, fact_check_verdict, published_at, embedding, source_id")
    .not("embedding", "is", null);

  if (factCheckError || !factCheckArticles) return [];

  // 3. Filter to only fact-check sources
  const sourceIds = Array.from(
    new Set(factCheckArticles.map((fc: any) => fc.source_id)),
  );
  
  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("id, source_type")
    .in("id", sourceIds)
    .eq("source_type", "fact_check");

  if (sourcesError || !sources) return [];

  const factCheckSourceIds = new Set(sources.map((s: any) => s.id));
  const validFactChecks = factCheckArticles.filter((fc: any) =>
    factCheckSourceIds.has(fc.source_id),
  );

  // 4. Compute similarity for each fact-check
  const factCheckSimilarities: FactCheck[] = [];
  const FACT_CHECK_THRESHOLD = 0.6;

  for (const fc of validFactChecks) {
    const fcEmbedding = parseEmbeddingValue(fc.embedding);
    if (!fcEmbedding) continue;

    const similarity = cosineSimilarityLocal(currentCentroid, fcEmbedding);

    if (similarity >= FACT_CHECK_THRESHOLD) {
      factCheckSimilarities.push({
        id: fc.id,
        title: fc.title,
        url: fc.url,
        verdict: fc.fact_check_verdict,
        published_at: fc.published_at,
        similarity,
      });
    }
  }

  // 5. Sort by similarity descending and return top matches
  factCheckSimilarities.sort((a, b) => b.similarity - a.similarity);
  return factCheckSimilarities.slice(0, 3); // Return top 3 fact-checks
}

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const story = await getStory(storyId);

  if (!story) {
    notFound();
  }

  const { articles, sources } = await getStoryArticles(storyId);
  const relatedStories = await getRelatedStories(storyId, articles);
  const relatedFactChecks = await getRelatedFactChecks(articles);

  return (
    <StoryDetailClient
      story={story}
      articles={articles}
      sources={sources}
      relatedStories={relatedStories}
      relatedFactChecks={relatedFactChecks}
    />
  );
}