import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import StoryDetailClient from "../../story-detail-client";

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
    .select("article_id,articles(id,title,url,raw_text,published_at,source_id)")
    .eq("story_id", storyId);

  if (error) {
    throw new Error(error.message);
  }

  const articleRows = data || [];
  const sourceIds = Array.from(
    new Set(articleRows.map((row: any) => row.articles.source_id)),
  );

  if (sourceIds.length === 0) {
    return [];
  }

  const { data: sources, error: srcErr } = await supabase
    .from("sources")
    .select("id,name")
    .in("id", sourceIds);

  if (srcErr) {
    throw new Error(srcErr.message);
  }

  const sourceMap = new Map(
    (sources || []).map((source: any) => [source.id, source.name]),
  );

  return articleRows.map((row: any) => ({
    ...row.articles,
    source_name: sourceMap.get(row.articles.source_id) || "Unknown",
  })) as Article[];
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

  const articles = await getStoryArticles(storyId);

  return <StoryDetailClient story={story} articles={articles} />;
}
