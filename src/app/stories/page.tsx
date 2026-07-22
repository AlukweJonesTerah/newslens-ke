import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Eye, ArrowRight, Sparkles, Info } from "lucide-react";

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

function getSourceLogoPath(sourceName: string): string | null {
  const name = sourceName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const logos: Record<string, string> = {
    nation: "/logos/nation.png",
    tuko: "/logos/tuko.png",
    standard: "/logos/standard.png",
    kenyans: "/logos/kenyans.png",
  };
  for (const [key, path] of Object.entries(logos)) {
    if (name.includes(key)) {
      return path;
    }
  }
  return null;
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
}

type CoverageCounts = Record<string, number>;

function getCategoryColor(category: CoverageCategory | string) {
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
    case "pending":
      return "#6b7280";
    default:
      return "#6b7280";
  }
}

function getCategoryLabel(category: CoverageCategory | string): string {
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
    case "pending":
      return "Pending";
    default:
      return "News";
  }
}

function getFeedTitle(category?: string) {
  switch (category) {
    case "government":
      return {
        title: "Government Aligned",
        description: "Stories classified as government-focused.",
        categories: ["government_focused"],
      };
    case "opposition":
      return {
        title: "Opposition Aligned",
        description: "Stories classified as opposition-focused.",
        categories: ["opposition_focused"],
      };
    case "public":
      return {
        title: "Public",
        description: "Stories classified as public-focused.",
        categories: ["public_focused"],
      };
    case "business":
      return {
        title: "Business",
        description: "Stories classified as business-focused.",
        categories: ["business_focused"],
      };
    default:
      return {
        title: "All Stories",
        description:
          "All recent stories, including international-focused coverage when available.",
        categories: [
          "government_focused",
          "opposition_focused",
          "public_focused",
          "business_focused",
          "international_focused",
        ],
      };
  }
}

async function getStories(category?: string | null) {
  let query = supabase
    .from("stories")
    .select(
      "id,title,neutral_summary,coverage_category,summary_updated_at,updated_at,story_articles(article_id,articles(id,source_id))",
    )
    .limit(50);

  if (category === "government") {
    query = query.eq("coverage_category", "government_focused");
  } else if (category === "opposition") {
    query = query.eq("coverage_category", "opposition_focused");
  } else if (category === "public") {
    query = query.eq("coverage_category", "public_focused");
  } else if (category === "business") {
    query = query.eq("coverage_category", "business_focused");
  }

  const { data, error } = await query;

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

  // Sort stories by number of articles descending, to get the lead story first
  return processedStories.sort(
    (a, b) => (b.story_articles?.length ?? 0) - (a.story_articles?.length ?? 0),
  );
}

async function getCoverageCounts(filterCategories?: string[]) {
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
      if (
        !filterCategories ||
        filterCategories.includes(row.coverage_category)
      ) {
        counts[row.coverage_category] =
          (counts[row.coverage_category] || 0) + 1;
      }
    } else if (!filterCategories || filterCategories.includes("pending")) {
      counts.pending = (counts.pending || 0) + 1;
    }
  }

  return counts;
}

export default async function StoriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const category = resolvedSearchParams?.category as string | undefined;
  const stories = await getStories(category);
  const feed = getFeedTitle(category);
  const coverageCounts = await getCoverageCounts(feed.categories);
  const leadStory = stories[0];
  const otherTopStories = stories.slice(1, 4);
  const remainingStories = stories.slice(4);
  const totalStories = Object.values(coverageCounts).reduce((a, b) => a + b, 0);
  const categories = [
    "government_focused",
    "opposition_focused",
    "public_focused",
    "business_focused",
    "international_focused",
    "pending",
  ];

  return (
    <main className="flex-1">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900 mb-2">
            {feed.title}
          </h1>
          <p className="text-gray-600">{feed.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main content (col 1-9 on lg) */}
          <div className="lg:col-span-9 space-y-6">
            {stories.length === 0 ? (
              <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
                <h2 className="text-xl font-serif font-medium text-gray-900 mb-2">
                  No stories in this category yet
                </h2>
                <p className="text-gray-500">Check back later for updates</p>
              </div>
            ) : (
              <>
                {/* Lead story */}
                {leadStory && (
                  <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2">
                      {/* Left: content */}
                      <div className="p-6 md:p-8 flex flex-col justify-between">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold uppercase tracking-wider rounded-full">
                            Lead Story
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Eye className="w-3 h-3" />
                            Updated{" "}
                            {new Date(
                              leadStory.updated_at,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900 mb-4 leading-tight">
                          {leadStory.title}
                        </h1>
                        {leadStory.neutral_summary && (
                          <p className="text-gray-600 mb-6 leading-relaxed">
                            {leadStory.neutral_summary}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-6">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {leadStory.story_articles?.length ?? 0} articles
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/stories/${leadStory.id}`}
                            className="flex items-center gap-2 px-4 py-2.5 bg-[#1a4d7a] text-white text-sm font-medium rounded-lg hover:bg-[#143c5e] transition"
                          >
                            View Full Coverage
                            <ArrowRight className="w-4 h-4" />
                          </Link>

                        </div>
                      </div>
                      {/* Right: sources */}
                      <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 p-6 md:p-8 min-h-[300px] flex flex-col">
                        <span className="text-xs uppercase tracking-wide text-gray-400 mb-4">
                          Covered by
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {leadStory.sources.map((source) => {
                            const logoPath = getSourceLogoPath(source.name);
                            return (
                              <Link
                                key={source.id}
                                href={`/sources/${source.id}`}
                                className="flex items-center gap-3 px-5 py-3 bg-white border border-gray-200 text-sm font-bold text-gray-900 rounded-full hover:border-[#1a4d7a] hover:text-[#1a4d7a] transition"
                              >
                                {logoPath ? (
                                  <img
                                    src={logoPath}
                                    alt={`${source.name} logo`}
                                    className="w-8 h-8 object-contain"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-base text-gray-500 font-bold">
                                    {source.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span>{source.name}</span>
                              </Link>
                            );
                          })}
                          {leadStory.sources.length === 0 && (
                            <span className="text-xs text-gray-400">
                              No sources yet
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Other top stories (col 1-12 on md) */}
                  <div className="md:col-span-12">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900">
                        Other Top Stories
                      </h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-3">
                      {otherTopStories.map((story) => (
                        <Link
                          key={story.id}
                          href={`/stories/${story.id}`}
                          className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition"
                        >
                          <div className="flex flex-col">
                            <div className="flex-1">
                              <span className="text-xs text-[#1a4d7a] font-semibold uppercase tracking-wider mb-1 block">
                                {getCategoryLabel(story.coverage_category)}
                              </span>
                              <h3 className="text-base font-medium text-gray-900 leading-snug mb-2">
                                {story.title}
                              </h3>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>
                                  {story.story_articles?.length ?? 0} articles
                                </span>
                                <span>•</span>
                                <span>
                                  Updated{" "}
                                  {new Date(
                                    story.updated_at,
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-24 mt-4 rounded-lg overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">
                                Image
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Remaining Stories Grid */}
                {remainingStories.length > 0 && (
                  <section>
                    <div className="grid gap-6 md:grid-cols-2">
                      {remainingStories.map((story) => {
                        return (
                          <article
                            key={story.id}
                            className="pb-4 border-b border-gray-200"
                          >
                            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                              {getCategoryLabel(story.coverage_category)}
                            </div>
                            <Link
                              href={`/stories/${story.id}`}
                              className="block"
                            >
                              <h3 className="text-lg font-serif font-medium mb-2 hover:text-[#1a4d7a]">
                                {story.title}
                              </h3>
                            </Link>
                            <div className="text-xs text-gray-400">
                              {story.story_articles?.length ?? 0} articles ·
                              Updated{" "}
                              {new Date(story.updated_at).toLocaleDateString()}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          {/* Sidebar (col 10-12 on lg) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Coverage analysis */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  Coverage Analysis
                </h2>
                <button className="text-gray-400 hover:text-gray-600">
                  <Info className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-4">
                <div className="flex items-end justify-between mb-1">
                  <span className="text-2xl font-bold text-gray-900">
                    {totalStories}
                  </span>
                </div>
                <div className="text-sm text-gray-500">Total Stories</div>
              </div>

              <div className="space-y-3">
                {categories.map((category) => {
                  const count = coverageCounts[category] || 0;
                  const label = getCategoryLabel(category);
                  const color = getCategoryColor(category);
                  return (
                    <div key={category} className="flex items-center gap-3">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {label}
                          </span>
                          <span className="text-xs text-gray-500">{count}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              backgroundColor: color,
                              width: totalStories
                                ? `${(count / totalStories) * 100}%`
                                : "0%",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
