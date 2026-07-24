import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import SourceDetailClient from "../../source-detail-client";

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
  updated_at: string;
}

interface SourceStats {
  total: number;
  thisMonth: number;
  avgPerDay: number | null;
}

// ---------------------------------------------------------------------------
// Editorial profiles — exact verified copy; do not regenerate
// ---------------------------------------------------------------------------
const EDITORIAL_PROFILES: {
  match: string;
  text: string;
  website: string;
  badge: string;
  founded: number | null;
}[] = [
  {
    match: "business daily",
    text: "Kenya\u2019s leading business and financial daily, published by Nation Media Group.",
    website: "https://businessdailyafrica.com",
    badge: "Private Media",
    founded: null,
  },
  {
    match: "nation",
    text: "Founded by the Aga Khan in 1959, Nation Media Group is East and Central Africa\u2019s largest independent media house. In 2026, majority ownership transferred from the Aga Khan Fund for Economic Development to Taarifa Group, led by Tanzanian businessman Rostam Aziz, ending a 66-year era of Aga Khan family stewardship.",
    website: "https://nation.africa",
    badge: "Private Media",
    founded: 1959,
  },
  {
    match: "standard",
    text: "Kenya\u2019s oldest newspaper, founded in 1902 as the African Standard. The Standard Group is majority-owned by the family of the late President Daniel arap Moi and associates, through S.N.G. Holdings Limited.",
    website: "https://standardmedia.co.ke",
    badge: "Family-Owned",
    founded: 1902,
  },
  {
    match: "kenyans",
    text: "An independent Kenyan digital-native news outlet, owned by Boxraft Limited and founded by Robert Ndungu.",
    website: "https://www.kenyans.co.ke",
    badge: "Independent",
    founded: null,
  },
  {
    match: "tuko",
    text: "A digital-native outlet owned by Genesis Media, a Ukraine-based consumer internet company that operates similar news platforms across several emerging markets, including Nigeria, Ghana, and South Africa.",
    website: "https://www.tuko.co.ke",
    badge: "Digital-Native",
    founded: null,
  },
  {
    match: "people daily",
    text: "A free-circulation daily newspaper owned by Mediamax, a media company linked to the Kenyatta family.",
    website: "https://www.peopledaily.co.ke",
    badge: "Private Media",
    founded: null,
  },
];

// "business daily" is checked before "nation" so "Business Daily Africa" doesn't
// accidentally match the shorter "nation" entry.
function getProfile(sourceName: string) {
  const lower = sourceName.toLowerCase();
  const entry = EDITORIAL_PROFILES.find((e) => lower.includes(e.match));
  return {
    text: entry?.text ?? null,
    website: entry?.website ?? null,
    badge: entry?.badge ?? null,
    founded: entry?.founded ?? null,
  };
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function getSource(sourceId: string) {
  const { data, error } = await supabase
    .from("sources")
    .select("id,name")
    .eq("id", sourceId)
    .single();
  if (error || !data) return null;
  return data as { id: string; name: string };
}

async function getArticleStats(sourceId: string): Promise<SourceStats> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalRes, thisMonthRes, earliestRes] = await Promise.all([
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("source_id", sourceId),
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("source_id", sourceId)
      .gte("published_at", startOfMonth.toISOString()),
    supabase
      .from("articles")
      .select("published_at")
      .eq("source_id", sourceId)
      .not("published_at", "is", null)
      .order("published_at", { ascending: true })
      .limit(1),
  ]);

  const total = totalRes.count ?? 0;
  const thisMonth = thisMonthRes.count ?? 0;
  const earliestDate =
    (earliestRes.data as { published_at: string }[] | null)?.[0]
      ?.published_at ?? null;

  let avgPerDay: number | null = null;
  if (earliestDate && total > 0) {
    const daysDiff = Math.max(
      1,
      (Date.now() - new Date(earliestDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    avgPerDay = total / daysDiff;
  }

  return { total, thisMonth, avgPerDay };
}

async function getCoverageTendency(sourceId: string): Promise<{
  tendency: { category: string; count: number }[];
  totalClassifiedStories: number;
}> {
  const { data, error } = await supabase
    .from("story_articles")
    .select("story_id,stories(coverage_category),articles(source_id)")
    .eq("articles.source_id", sourceId);

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const counts: Record<string, number> = {};

  for (const row of (data ?? []) as {
    story_id: string | null;
    stories:
      | { coverage_category: string | null }
      | { coverage_category: string | null }[]
      | null;
  }[]) {
    if (!row.story_id || seen.has(row.story_id)) continue;
    seen.add(row.story_id);

    const storyData = Array.isArray(row.stories)
      ? row.stories[0]
      : row.stories;
    const cat: string = storyData?.coverage_category ?? "pending";
    counts[cat] = (counts[cat] ?? 0) + 1;
  }

  const tendency = Object.entries(counts).map(([category, count]) => ({
    category,
    count,
  }));

  const totalClassifiedStories = Object.entries(counts)
    .filter(([k]) => k !== "pending")
    .reduce((sum, [, v]) => sum + v, 0);

  return { tendency, totalClassifiedStories };
}

async function getRecentStories(sourceId: string): Promise<Story[]> {
  const { data, error } = await supabase
    .from("story_articles")
    .select(
      "story_id,stories(id,title,neutral_summary,coverage_category,updated_at),articles(source_id)",
    )
    .eq("articles.source_id", sourceId)
    .limit(100);

  if (error) throw new Error(error.message);

  const seen = new Map<string, Story>();
  for (const row of (data ?? []) as {
    story_id: string | null;
    stories:
      | Story
      | Story[]
      | null;
  }[]) {
    if (!row.story_id || seen.has(row.story_id)) continue;
    const s = Array.isArray(row.stories) ? row.stories[0] : row.stories;
    if (s) seen.set(row.story_id, s);
  }

  return Array.from(seen.values()).sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

async function getOtherSources(
  currentSourceId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("sources")
    .select("id,name")
    .neq("id", currentSourceId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = await params;

  const source = await getSource(sourceId);
  if (!source) notFound();

  const [stats, { tendency, totalClassifiedStories }, stories, otherSources] =
    await Promise.all([
      getArticleStats(sourceId),
      getCoverageTendency(sourceId),
      getRecentStories(sourceId),
      getOtherSources(sourceId),
    ]);

  return (
    <SourceDetailClient
      source={source}
      stats={stats}
      coverageTendency={tendency}
      totalClassifiedStories={totalClassifiedStories}
      stories={stories}
      otherSources={otherSources}
      profile={getProfile(source.name)}
    />
  );
}