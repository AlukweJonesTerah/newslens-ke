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

interface Source {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
}

function getCategoryLabel(category: CoverageCategory): string {
  switch (category) {
    case "government_focused":
      return "Government";
    case "opposition_focused":
      return "Opposition";
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

async function searchStories(query: string) {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id,title,neutral_summary,coverage_category,summary_updated_at,updated_at,story_articles(article_id)",
    )
    .or(`title.ilike.%${query}%,neutral_summary.ilike.%${query}%`)
    .order("id", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return data as Story[];
}

async function searchSources(query: string) {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .ilike("name", `%${query}%`);

  if (error) {
    throw new Error(error.message);
  }

  return data as Source[];
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawQ = resolvedSearchParams?.q;
  const query = Array.isArray(rawQ) ? rawQ[0] : rawQ || "";

  const stories = query ? await searchStories(query) : [];
  const sources = query ? await searchSources(query) : [];

  return (
    <main className="flex-1">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900 mb-2">
            {query ? `Results for "${query}"` : "Search"}
          </h1>
        </div>

        {sources.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sources</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {sources.map((source) => (
                <Link
                  key={source.id}
                  href={`/sources/${source.id}`}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition"
                >
                  <div className="flex items-center gap-3">
                    {source.logo_url ? (
                      <img
                        src={source.logo_url}
                        alt={source.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-xs text-gray-500 font-semibold">
                          {source.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-base font-medium text-gray-900">{source.name}</h3>
                      {source.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {source.description}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {stories.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Stories</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {stories.map((story) => (
                <article
                  key={story.id}
                  className="pb-4 border-b border-gray-200"
                >
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                    {getCategoryLabel(story.coverage_category)}
                  </div>
                  <Link href={`/stories/${story.id}`} className="block">
                    <h3 className="text-lg font-serif font-medium mb-2 hover:text-[#1a4d7a]">
                      {story.title}
                    </h3>
                  </Link>
                  <div className="text-xs text-gray-400">
                    {story.story_articles?.length ?? 0} articles · Updated{" "}
                    {new Date(story.updated_at).toLocaleDateString()}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : query ? (
          <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
            <h2 className="text-xl font-serif font-medium text-gray-900 mb-2">
              No stories found for "{query}"
            </h2>
            <p className="text-gray-500">Try different keywords</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
