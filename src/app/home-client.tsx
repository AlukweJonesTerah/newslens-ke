"use client";

import Link from "next/link";
import {
  Eye,
  ArrowRight,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const cn = (...inputs: any[]) => twMerge(clsx(inputs));

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

interface HomeClientProps {
  stories: Story[];
}

const trendingData = [
  { name: "1", value: 400 },
  { name: "2", value: 300 },
  { name: "3", value: 500 },
  { name: "4", value: 450 },
  { name: "5", value: 600 },
  { name: "6", value: 550 },
  { name: "7", value: 700 },
];

function getCategoryLabel(category: CoverageCategory): string {
  switch (category) {
    case "government_focused":
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

export default function HomeClient({ stories }: HomeClientProps) {
  const leadStory = stories[0];
  const otherTopStories = stories.slice(1, 4);

  return (
    <main className="flex-1">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main content (col 1-9 on lg) */}
          <div className="lg:col-span-9 space-y-6">
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
                        Updated {new Date(leadStory.updated_at).toLocaleDateString()}
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
                      <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
                        <Sparkles className="w-4 h-4" />
                        AI Summary
                      </button>
                    </div>
                  </div>
                  {/* Right: image (placeholder for now) */}
                  <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center min-h-[300px]">
                    <span className="text-gray-400 text-sm">Image Placeholder</span>
                  </div>
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Other top stories (col 1-5 on md) */}
              <div className="md:col-span-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Other Top Stories</h2>
                  <Link href="/stories" className="text-sm text-[#1a4d7a] hover:underline">
                    View all
                  </Link>
                </div>
                <div className="space-y-4">
                  {otherTopStories.map((story) => (
                    <Link
                      key={story.id}
                      href={`/stories/${story.id}`}
                      className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition"
                    >
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <span className="text-xs text-[#1a4d7a] font-semibold uppercase tracking-wider mb-1 block">
                            {getCategoryLabel(story.coverage_category)}
                          </span>
                          <h3 className="text-base font-medium text-gray-900 leading-snug mb-2">
                            {story.title}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{story.story_articles?.length ?? 0} articles</span>
                            <span>•</span>
                            <span>Updated {new Date(story.updated_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                          <span className="text-gray-400 text-xs">Image</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* From multiple sources (col 6-12 on md) */}
              <div className="md:col-span-7">
                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">From Multiple Sources</h2>
                    </div>
                    <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                      <Info className="w-4 h-4" />
                      How it works
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-6 mb-6 border-b border-gray-100 pb-2">
                    {["All Perspectives", "What They Agree On", "Where They Differ", "Timeline"].map(
                      (tab, idx) => (
                        <button
                          key={tab}
                          className={cn(
                            "text-sm font-medium pb-2 border-b-2 transition",
                            idx === 0
                              ? "text-[#1a4d7a] border-[#1a4d7a]"
                              : "text-gray-500 border-transparent hover:text-gray-700"
                          )}
                        >
                          {tab}
                        </button>
                      )
                    )}
                  </div>

                  <Link
                    href="/stories"
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    View all sources
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
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

              <div className="mb-6">
                <div className="flex items-end justify-between mb-3">
                  <span className="text-2xl font-bold text-gray-900">
                    {stories.length}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-red-500"></span>
                      <span>Gov't-aligned</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                      <span>Neutral</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                      <span>Opposition</span>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500 mb-3">Total Stories</div>
              </div>
            </section>

            {/* Trending now */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
                Trending Now
              </h2>

              <div className="space-y-4">
                {stories.slice(0, 5).map((story, idx) => (
                  <Link key={story.id} href={`/stories/${story.id}`} className="block">
                    <div className="flex items-start gap-3">
                      <span className="text-lg font-bold text-gray-300">{idx + 1}</span>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-gray-900 leading-snug">
                          {story.title}
                        </h3>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[11px] text-gray-500">
                            {story.story_articles?.length ?? 0} sources
                          </p>
                          <div className="w-20 h-8">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={trendingData}>
                                <Line
                                  type="monotone"
                                  dataKey="value"
                                  stroke="#1a4d7a"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <Link
                href="/stories"
                className="flex items-center justify-center gap-2 w-full mt-5 py-2.5 text-sm text-[#1a4d7a] font-medium border border-[#1a4d7a]/30 rounded-lg hover:bg-[#1a4d7a]/5 transition"
              >
                See full trending list
                <ChevronRight className="w-4 h-4" />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
