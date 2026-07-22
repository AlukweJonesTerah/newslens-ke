"use client";

import { useState } from "react";
import { type CSSProperties } from "react";
import Link from "next/link";
import { Globe, MapPin, ExternalLink, Calendar, Info } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type CoverageCategory =
  | "government_focused"
  | "opposition_focused"
  | "public_focused"
  | "business_focused"
  | "international_focused"
  | null;

interface SourceStats {
  total: number;
  thisMonth: number;
  avgPerDay: number | null;
}

interface CoverageTendencyItem {
  category: string;
  count: number;
}

interface StoryItem {
  id: string;
  title: string;
  neutral_summary: string | null;
  coverage_category: CoverageCategory;
  updated_at: string;
}

interface SourceItem {
  id: string;
  name: string;
}

interface EditorialProfile {
  text: string | null;
  website: string | null;
  badge: string | null;
  founded: number | null;
}

export interface SourceDetailClientProps {
  source: { id: string; name: string };
  stats: SourceStats;
  coverageTendency: CoverageTendencyItem[];
  totalClassifiedStories: number;
  stories: StoryItem[];
  otherSources: SourceItem[];
  profile: EditorialProfile;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "government_focused",   label: "Government",   color: "#c85a54" },
  { key: "opposition_focused",   label: "Opposition",   color: "#6b9080" },
  { key: "public_focused",       label: "Public",       color: "#e7c15b" },
  { key: "business_focused",     label: "Business",     color: "#7a87c5" },
  { key: "international_focused",label: "International",color: "#a87ca0" },
  { key: "pending",              label: "Pending",      color: "#6b7280" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Maps normalised source name → /logos/*.png. More-specific entries first. */
const SOURCE_LOGOS: { match: string; path: string }[] = [
  { match: "businessdaily", path: "/logos/businessdaily.png" },
  { match: "peopledaily",   path: "/logos/peopledaily.png"   },
  { match: "nation",       path: "/logos/nation.png"        },
  { match: "standard",     path: "/logos/standard.png"      },
  { match: "kenyans",      path: "/logos/kenyans.png"       },
  { match: "tuko",         path: "/logos/tuko.png"          },
];

function getSourceLogo(name: string): string | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SOURCE_LOGOS.find((e) => n.includes(e.match))?.path ?? null;
}

function getCategoryMeta(category: string | null) {
  return (
    CATEGORIES.find((c) => c.key === category) ?? {
      label: "News",
      color: "#6b7280",
    }
  );
}

/** Consistent gradient per source name (hashed, not random). */
function sourceGradient(name: string): CSSProperties {
  const palettes: [string, string][] = [
    ["#3b82f6", "#1d4ed8"],
    ["#14b8a6", "#0f766e"],
    ["#8b5cf6", "#6d28d9"],
    ["#f43f5e", "#be123c"],
    ["#f59e0b", "#b45309"],
    ["#10b981", "#047857"],
  ];
  let h = 0;
  for (const ch of name) h = (h + ch.charCodeAt(0)) % palettes.length;
  const [from, to] = palettes[h];
  return { background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` };
}

function badgeStyle(badge: string): CSSProperties {
  const map: Record<string, CSSProperties> = {
    Independent:    { backgroundColor: "#dcfce7", color: "#15803d" },
    "Digital-Native": { backgroundColor: "#dbeafe", color: "#1d4ed8" },
    "Family-Owned": { backgroundColor: "#fef3c7", color: "#b45309" },
    "Private Media":{ backgroundColor: "#f3f4f6", color: "#374151" },
  };
  return map[badge] ?? { backgroundColor: "#f3f4f6", color: "#374151" };
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const h  = ms / 3_600_000;
  if (h < 1)    return `${Math.floor(ms / 60_000)}m ago`;
  if (h < 24)   return `${Math.floor(h)}h ago`;
  if (h < 168)  return `${Math.floor(h / 24)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-KE", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SourceDetailClient({
  source,
  stats,
  coverageTendency,
  totalClassifiedStories,
  stories,
  otherSources,
  profile,
}: SourceDetailClientProps) {
  const [activeTab, setActiveTab] = useState<"stories" | "tendency">("stories");

  const tendencyMap = new Map(coverageTendency.map((r) => [r.category, r.count]));
  const totalTendency = coverageTendency.reduce((s, r) => s + r.count, 0);

  const donutData = CATEGORIES.map(({ key, label, color }) => ({
    label,
    color,
    value: tendencyMap.get(key) ?? 0,
    pct: totalTendency > 0
      ? Math.round(((tendencyMap.get(key) ?? 0) / totalTendency) * 100)
      : 0,
  })).filter((d) => d.value > 0);

  return (
    <main className="flex-1 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-5">
          <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
          <span className="text-gray-300">/</span>
          <Link href="/sources" className="hover:text-gray-600 transition-colors">Sources</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-medium">{source.name}</span>
        </nav>

        {/* ── Header card ─────────────────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-5">

            {/* Left: logo + identity */}
            <div className="lg:col-span-3 p-6 md:p-8 flex gap-5">
              {/* Logo */}
              {(() => {
                const logo = getSourceLogo(source.name);
                return logo ? (
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl shrink-0 bg-white border border-gray-100 shadow-sm flex items-center justify-center p-3 overflow-hidden">
                    <img
                      src={logo}
                      alt={`${source.name} logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div
                    className="w-32 h-32 md:w-40 md:h-40 rounded-2xl shrink-0 flex items-center justify-center shadow-sm"
                    style={sourceGradient(source.name)}
                  >
                    <span className="text-5xl md:text-6xl font-bold text-white/90 font-serif select-none">
                      {source.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                );
              })()}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <h1 className="text-2xl md:text-3xl font-serif font-semibold text-gray-900 leading-tight">
                    {source.name}
                  </h1>
                  {profile.badge && (
                    <span
                      className="px-2.5 py-0.5 text-xs font-semibold rounded-full shrink-0"
                      style={badgeStyle(profile.badge)}
                    >
                      {profile.badge}
                    </span>
                  )}
                </div>

                {profile.text && (
                  <p className="text-sm text-gray-600 leading-relaxed mb-4 max-w-lg">
                    {profile.text}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-500 mb-4">
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 hover:text-accent transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Website
                    </a>
                  )}
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Nairobi, Kenya
                  </span>
                  {profile.founded && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Founded {profile.founded}
                    </span>
                  )}
                </div>

                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Visit Website
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Right: stats */}
            <div className="lg:col-span-2 bg-gray-50 border-t lg:border-t-0 lg:border-l border-gray-100 p-6 md:p-8 flex flex-col justify-center">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  {
                    value: stats.total.toLocaleString(),
                    label: "Total Articles",
                    sub: "tracked by NewsLens",
                  },
                  {
                    value: stats.thisMonth.toLocaleString(),
                    label: "This Month",
                    sub: "Articles",
                  },
                  {
                    value:
                      stats.avgPerDay != null
                        ? stats.avgPerDay.toFixed(1)
                        : "—",
                    label: "Avg. / Day",
                    sub: "Articles",
                  },
                ].map(({ value, label, sub }) => (
                  <div key={label}>
                    <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums leading-none mb-1">
                      {value}
                    </p>
                    <p className="text-xs font-medium text-gray-600 leading-snug">
                      {label}
                    </p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ── Main grid ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left: tabs + content (3/5) */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">

              {/* Tab bar */}
              <div className="flex items-center gap-0 border-b border-gray-100 px-6 overflow-x-auto">
                {(
                  [
                    ["stories",  "Latest Stories"],
                    ["tendency", "Coverage Tendency"],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-1 py-4 mr-6 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      activeTab === tab
                        ? "text-accent border-accent"
                        : "text-gray-500 border-transparent hover:text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-6">

                {/* ── Latest Stories ─────────────────────────────────────── */}
                {activeTab === "stories" && (
                  <div>
                    {stories.length === 0 ? (
                      <p className="text-sm text-gray-500 py-4">
                        No stories tracked for this source yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {stories.map((story) => {
                          const cat = getCategoryMeta(story.coverage_category);
                          return (
                            <article
                              key={story.id}
                              className="flex gap-4 py-4 -mx-6 px-6 hover:bg-gray-50/60 transition-colors first:pt-0 last:pb-0"
                            >
                              {/* Text */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span
                                    className="px-2 py-0.5 text-xs font-semibold rounded-md"
                                    style={{
                                      backgroundColor: cat.color + "22",
                                      color: cat.color,
                                    }}
                                  >
                                    {cat.label}
                                  </span>
                                  <span className="text-xs text-gray-400">·</span>
                                  <span className="text-xs text-gray-400">
                                    {timeAgo(story.updated_at)}
                                  </span>
                                </div>
                                <Link href={`/stories/${story.id}`}>
                                  <h2 className="text-base font-semibold text-gray-900 leading-snug mb-1.5 hover:text-accent transition-colors">
                                    {story.title}
                                  </h2>
                                </Link>
                                {story.neutral_summary && (
                                  <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                                    {story.neutral_summary}
                                  </p>
                                )}
                              </div>

                              {/* Thumbnail placeholder */}
                              <div
                                className="w-24 h-20 md:w-28 md:h-24 rounded-xl shrink-0"
                                style={{
                                  background: `linear-gradient(135deg, ${cat.color}1a 0%, ${cat.color}40 100%)`,
                                }}
                              />
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Coverage Tendency ──────────────────────────────────── */}
                {activeTab === "tendency" && (
                  <div>
                    {totalTendency === 0 ? (
                      <p className="text-sm text-gray-500 py-4">
                        No classified stories for this source yet.
                      </p>
                    ) : (
                      <div className="space-y-4 mb-6">
                        {CATEGORIES.map(({ key, label, color }) => {
                          const count = tendencyMap.get(key) ?? 0;
                          const pct =
                            totalTendency > 0
                              ? (count / totalTendency) * 100
                              : 0;
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <div className="flex-1">
                                <div className="flex justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-700">
                                    {label}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {count} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      backgroundColor: color,
                                      width: `${pct}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="border-t border-gray-100 pt-4 space-y-2">
                      <p className="text-xs text-gray-500 italic leading-relaxed">
                        Based on AI classification of this outlet&rsquo;s
                        articles in our system &mdash; not an independent
                        editorial rating.
                      </p>
                      {totalClassifiedStories > 0 &&
                        totalClassifiedStories < 10 && (
                          <p className="text-xs text-amber-600 font-medium">
                            Based on a limited sample (
                            {totalClassifiedStories} classified{" "}
                            {totalClassifiedStories === 1
                              ? "story"
                              : "stories"}
                            ).
                          </p>
                        )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Right: sidebar (2/5) */}
          <div className="lg:col-span-2 space-y-5">

            {/* Coverage Breakdown */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Coverage Breakdown
                </h2>
                <Info className="w-4 h-4 text-gray-400" />
              </div>

              {donutData.length === 0 ? (
                <p className="text-sm text-gray-500">No data yet.</p>
              ) : (
                <>
                  <div className="flex items-center gap-5">
                    {/* Donut chart */}
                    <div className="shrink-0">
                      <PieChart width={130} height={130}>
                        <Pie
                          data={donutData}
                          cx={65}
                          cy={65}
                          innerRadius={42}
                          outerRadius={60}
                          dataKey="value"
                          paddingAngle={2}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {donutData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                      </PieChart>
                    </div>

                    {/* Legend */}
                    <div className="flex-1 space-y-2.5">
                      {donutData.map(({ label, color, pct }) => (
                        <div
                          key={label}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-xs text-gray-600 truncate">
                              {label}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-gray-800 ml-2 shrink-0">
                            {pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-gray-400 italic leading-relaxed border-t border-gray-50 pt-3">
                    AI classification of stories in our system — not an
                    independent editorial rating.
                  </p>
                  {totalClassifiedStories < 10 && totalClassifiedStories > 0 && (
                    <p className="text-xs text-amber-600 font-medium mt-1">
                      Based on a limited sample ({totalClassifiedStories}{" "}
                      {totalClassifiedStories === 1 ? "story" : "stories"}).
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Related Sources */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Related Sources
                </h2>
                <Link
                  href="/sources"
                  className="text-xs text-accent hover:underline"
                >
                  View all
                </Link>
              </div>

              {otherSources.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No other sources tracked.
                </p>
              ) : (
                <div className="space-y-1">
                  {otherSources.map((s) => (
                    <Link
                      key={s.id}
                      href={`/sources/${s.id}`}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                    >
                      {(() => {
                        const logo = getSourceLogo(s.name);
                        return logo ? (
                          <div className="w-9 h-9 rounded-lg shrink-0 bg-white border border-gray-100 flex items-center justify-center p-1 overflow-hidden">
                            <img src={logo} alt={`${s.name} logo`} className="w-full h-full object-contain" />
                          </div>
                        ) : (
                          <div
                            className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
                            style={sourceGradient(s.name)}
                          >
                            <span className="text-sm font-bold text-white">
                              {s.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        );
                      })()}
                      <span className="flex-1 text-sm font-medium text-gray-800 group-hover:text-accent transition-colors truncate">
                        {s.name}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0 group-hover:text-accent transition-colors">
                        View →
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      </div>
    </main>
  );
}
