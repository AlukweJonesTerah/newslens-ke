import { supabase } from "@/lib/supabase";
import HomeClient from "./home-client";

export const revalidate = 300; // Revalidate every 5 minutes so pipeline updates show up without a redeploy

type CoverageCategory =
  | "government_focused"
  | "opposition_focused"
  | "public_focused"
  | "business_focused"
  | "international_focused"
  | null;

interface StorySource {
  id: string;
  name: string;
}

interface Story {
  id: string;
  title: string;
  neutral_summary: string | null;
  coverage_category: CoverageCategory;
  summary_updated_at: string | null;
  updated_at: string;
  story_articles: { article_id: string }[] | null;
  sources: StorySource[];
  consensus_claims?: { claim: string; sources: string[] }[] | null;
}

interface CorroboratedClaim {
  claim: string;
  sources: string[];
  storyId: string;
  storyTitle: string;
  storyUpdatedAt: string;
}

type CoverageCounts = Record<string, number>;

interface PipelineStats {
  sourcesCount: number;
  storiesCount: number;
  articlesCount: number;
  lastUpdated: string | null;
}

// Gravity constant for recency-weighted scoring
// Higher values (e.g. 1.8) decay faster and favor recency more strongly
// Lower values (e.g. 1.2) let article count matter more
// Start at 1.2 (lower since log-scaling already compresses article count's influence)
const STORY_RANKING_GRAVITY = 1.2;

async function getStories() {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id,title,neutral_summary,coverage_category,summary_updated_at,updated_at,consensus_claims,story_articles(article_id,articles(id,source_id))",
    )
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  // Collect all source_ids from all articles
  const allSourceIds = new Set<string>();
  (data as any[]).forEach((story) => {
    (story.story_articles || []).forEach((sa: any) => {
      if (sa.articles?.source_id) {
        allSourceIds.add(sa.articles.source_id);
      }
    });
  });

  // Fetch all sources
  const sourceMap = new Map<string, StorySource>();
  if (allSourceIds.size > 0) {
    const { data: sources, error: srcErr } = await supabase
      .from("sources")
      .select("id,name")
      .in("id", Array.from(allSourceIds));
    if (srcErr) throw new Error(srcErr.message);
    (sources || []).forEach((source) =>
      sourceMap.set(source.id, source as StorySource),
    );
  }

  // Process each story
  const processedStories = (data as any[]).map((story) => {
    const storySourceIds = new Set<string>();
    (story.story_articles || []).forEach((sa: any) => {
      if (sa.articles?.source_id) {
        storySourceIds.add(sa.articles.source_id);
      }
    });

    const storySources: StorySource[] = [];
    storySourceIds.forEach((sourceId) => {
      const source = sourceMap.get(sourceId);
      if (source) {
        storySources.push(source);
      }
    });

    return {
      ...story,
      story_articles: story.story_articles?.map((sa: any) => ({
        article_id: sa.article_id,
      })),
      sources: storySources,
    } as Story;
  });

  // Sort stories by recency-weighted score
  // score = Math.log(articleCount + 1) / Math.pow(ageInHours + 2, GRAVITY)
  const now = Date.now();
  
  const storiesWithScores = processedStories.map((story) => {
    const articleCount = story.story_articles?.length ?? 0;
    
    // Use summary_updated_at if present (when story was last meaningfully refreshed),
    // otherwise fall back to updated_at
    const relevantTimestamp = story.summary_updated_at || story.updated_at;
    const storyDate = new Date(relevantTimestamp);
    const ageInHours = (now - storyDate.getTime()) / (1000 * 60 * 60);
    
    // Calculate recency-weighted score with logarithmic article count
    // log(articleCount + 1) caps how much article accumulation can dominate
    // Add 2 to age to prevent division issues with very recent stories
    const score = Math.log(articleCount + 1) / Math.pow(ageInHours + 2, STORY_RANKING_GRAVITY);
    
    return { story, score, articleCount, ageInHours };
  });

  // Sort by score descending (highest score = lead story)
  storiesWithScores.sort((a, b) => b.score - a.score);

  // Debug log top 6 stories for tuning
  if (process.env.NODE_ENV === 'development' || process.env.LOG_STORY_RANKING === 'true') {
    console.log('\n=== Story Ranking (Top 6) ===');
    storiesWithScores.slice(0, 6).forEach((item, index) => {
      console.log(`${index + 1}. Score: ${item.score.toFixed(6)} | Articles: ${item.articleCount} | Age: ${item.ageInHours.toFixed(1)}h`);
      console.log(`   "${item.story.title.substring(0, 80)}..."`);
    });
    console.log('==============================\n');
  }

  return storiesWithScores.map(item => item.story);
}

async function getCoverageCounts() {
  const { data, error } = await supabase
    .from("stories")
    .select("coverage_category")
    .order("id", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const counts: CoverageCounts = {
    government_focused: 0,
    opposition_focused: 0,
    public_focused: 0,
    business_focused: 0,
    international_focused: 0,
    pending: 0,
  };

  for (const row of data) {
    if (row.coverage_category) {
      counts[row.coverage_category] = (counts[row.coverage_category] || 0) + 1;
    } else {
      counts.pending = (counts.pending || 0) + 1;
    }
  }

  return counts;
}

async function getPipelineStats(): Promise<PipelineStats> {
  // Count sources
  const { count: sourcesCount, error: sourcesError } = await supabase
    .from("sources")
    .select("*", { count: "exact", head: true });
  if (sourcesError) throw new Error(sourcesError.message);

  // Count stories
  const { count: storiesCount, error: storiesError } = await supabase
    .from("stories")
    .select("*", { count: "exact", head: true });
  if (storiesError) throw new Error(storiesError.message);

  // Count articles
  const { count: articlesCount, error: articlesError } = await supabase
    .from("articles")
    .select("*", { count: "exact", head: true });
  if (articlesError) throw new Error(articlesError.message);

  // Get last updated (max fetched_at from articles, if exists, else max updated_at from stories)
  const { data: lastArticleData, error: lastArticleError } = await supabase
    .from("articles")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1);
  let lastUpdated: string | null = null;
  if (!lastArticleError && lastArticleData?.[0]?.fetched_at) {
    lastUpdated = lastArticleData[0].fetched_at;
  } else {
    const { data: lastStoryData, error: lastStoryError } = await supabase
      .from("stories")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (!lastStoryError && lastStoryData?.[0]?.updated_at) {
      lastUpdated = lastStoryData[0].updated_at;
    }
  }

  return {
    sourcesCount: sourcesCount || 0,
    storiesCount: storiesCount || 0,
    articlesCount: articlesCount || 0,
    lastUpdated,
  };
}

async function getCorroboratedClaims(
  stories: Story[],
): Promise<CorroboratedClaim[]> {
  const allClaims: CorroboratedClaim[] = [];

  for (const story of stories) {
    if (story.consensus_claims && story.consensus_claims.length > 0) {
      for (const claim of story.consensus_claims) {
        if (claim.sources.length >= 2) {
          allClaims.push({
            claim: claim.claim,
            sources: claim.sources,
            storyId: story.id,
            storyTitle: story.title,
            storyUpdatedAt: story.summary_updated_at || story.updated_at,
          });
        }
      }
    }
  }

  // Sort by most recent
  allClaims.sort(
    (a, b) =>
      new Date(b.storyUpdatedAt).getTime() -
      new Date(a.storyUpdatedAt).getTime(),
  );

  // Take top 5-6
  return allClaims.slice(0, 6);
}

export default async function Home() {
  const stories = await getStories();
  const coverageCounts = await getCoverageCounts();
  const pipelineStats = await getPipelineStats();
  const corroboratedClaims = await getCorroboratedClaims(stories);
  return (
    <HomeClient
      stories={stories}
      coverageCounts={coverageCounts}
      pipelineStats={pipelineStats}
      corroboratedClaims={corroboratedClaims}
    />
  );
}