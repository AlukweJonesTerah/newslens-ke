import { supabase } from "@/lib/supabase";
import Link from "next/link";

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

function getCategoryColor(category: CoverageCategory) {
  switch (category) {
    case "government_focused":
      return "#c85a54";
    case "opposition_focused":
      return "#6b9080";
    case "public_focused":
      return "#e7c15b";
    case "business_focused":
      return "#7a87c5";
    case "international_focused":
      return "#a87ca0";
    default:
      return "#6b7280";
  }
}

function getCategoryLabel(category: CoverageCategory): string {
  switch (category) {
    case "government_focused":
      return "Politics";
    case "opposition_focused":
      return "Politics";
    case "public_focused":
      return "Public";
    case "business_focused":
      return "Business";
    case "international_focused":
      return "International";
    default:
      return "News";
  }
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

export default async function StoriesPage() {
  const stories = await getStories();

  // Select lead story (most articles first, which it already is)
  const leadStory = stories[0];
  const remainingStories = stories.slice(1);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      {/* Masthead */}
      <header className="flex items-center justify-between pb-3 border-b-2 border-black mb-8">
        <Link href="/" className="text-2xl font-serif font-medium">
          NewsLens KE
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/stories" className="hover:text-accent">
            Politics
          </Link>
          <Link href="/stories" className="hover:text-accent">
            Business
          </Link>
          <Link href="/stories" className="hover:text-accent">
            Security
          </Link>
          <Link href="/stories" className="hover:text-accent">
            Sports
          </Link>
        </nav>
      </header>

      {/* Lead Story */}
      {leadStory && (
        <section className="mb-12">
          <div className="text-xs uppercase tracking-wide text-accent mb-2">
            Lead story
          </div>
          <Link href={`/stories/${leadStory.id}`} className="block">
            <h2 className="text-3xl font-serif font-medium leading-snug mb-4 hover:text-accent">
              {leadStory.title}
            </h2>
          </Link>
          {leadStory.neutral_summary && (
            <p className="text-base text-gray-700 leading-relaxed max-w-2xl mb-4">
              {leadStory.neutral_summary}
            </p>
          )}
          <div className="flex items-center gap-4">
            {leadStory.coverage_category ? (
              <div
                className="h-2 rounded-full"
                style={{
                  width: "120px",
                  backgroundColor: getCategoryColor(
                    leadStory.coverage_category,
                  ),
                }}
              />
            ) : (
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Coverage pending
              </span>
            )}
            <span className="text-xs text-gray-500">
              {leadStory.story_articles?.length ?? 0} articles · Updated{" "}
              {new Date(leadStory.updated_at).toLocaleDateString()}
            </span>
          </div>
        </section>
      )}

      {/* Remaining Stories Grid */}
      <section>
        <div className="grid gap-6 md:grid-cols-2">
          {remainingStories.map((story) => {
            return (
              <article key={story.id} className="pb-4 border-b border-gray-200">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                  {getCategoryLabel(story.coverage_category)}
                </div>
                <Link href={`/stories/${story.id}`} className="block">
                  <h3 className="text-lg font-serif font-medium mb-2 hover:text-accent">
                    {story.title}
                  </h3>
                </Link>
                <div className="text-xs text-gray-400">
                  {story.story_articles?.length ?? 0} articles · Updated{" "}
                  {new Date(story.updated_at).toLocaleDateString()}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
