import { supabase } from "@/lib/supabase";
import HomeClient from "./home-client";

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
  updated_at: string;
  story_articles: { article_id: string }[] | null;
}

async function getStories() {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id,title,neutral_summary,coverage_category,summary_updated_at,updated_at,story_articles(article_id)",
    )
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  // Sort stories by number of articles descending, to get the lead story first
  return (data as Story[]).sort(
    (a, b) => (b.story_articles?.length ?? 0) - (a.story_articles?.length ?? 0),
  );
}

export default async function Home() {
  const stories = await getStories();
  return <HomeClient stories={stories} />;
}
