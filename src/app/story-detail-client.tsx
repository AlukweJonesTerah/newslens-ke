"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

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

export default function StoryDetailClient({
  story,
  articles,
}: {
  story: Story;
  articles: Article[];
}) {
  const [activeTab, setActiveTab] = useState("all");
  const sourceNames = [...new Set(articles.map((a) => a.source_name))];

  const agreeClaims =
    story.consensus_claims?.filter((c) => c.sources.length >= 2) ?? [];
  const singleSourceClaims =
    story.consensus_claims?.filter((c) => c.sources.length === 1) ?? [];

  return (
    <main className="flex-1">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main content (col 1-9 on lg) */}
          <div className="lg:col-span-9 space-y-6">
            {/* Back button */}
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#1a4d7a] mb-4 transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to home
            </Link>

            {/* Lead story section */}
            <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Left: content */}
                <div className="p-6 md:p-8 flex flex-col justify-between">
                  <div className="flex items-center gap-3 mb-4">
                    {story.coverage_category && (
                      <span className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold uppercase tracking-wide rounded-full">
                        Coverage
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Eye className="w-3 h-3" />
                      {story.summary_updated_at
                        ? `Updated ${new Date(story.summary_updated_at).toLocaleDateString()}`
                        : "Coverage pending"}
                    </span>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900 mb-4 leading-tight">
                    {story.title}
                  </h1>
                  {story.neutral_summary && (
                    <p className="text-gray-600 mb-6 leading-relaxed">
                      {story.neutral_summary}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-6">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {articles.length} article
                      {articles.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
                      <Sparkles className="w-4 h-4" />
                      AI Summary
                    </button>
                  </div>
                </div>
                {/* Right: placeholder image */}
                <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center min-h-[300px]">
                  <span className="text-gray-400 text-sm">Image Placeholder</span>
                </div>
              </div>
            </section>

            {/* Tabs section */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">From Multiple Sources</h2>
                <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                  <Info className="w-4 h-4" />
                  How it works
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-4 mb-6 border-b border-gray-100 pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`text-sm font-medium pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === "all"
                      ? "text-[#1a4d7a] border-[#1a4d7a]"
                      : "text-gray-500 border-transparent hover:text-gray-700"
                  }`}
                >
                  All Perspectives
                </button>
                <button
                  onClick={() => setActiveTab("agree")}
                  className={`text-sm font-medium pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === "agree"
                      ? "text-[#1a4d7a] border-[#1a4d7a]"
                      : "text-gray-500 border-transparent hover:text-gray-700"
                  }`}
                >
                  What They Agree On
                </button>
                <button
                  onClick={() => setActiveTab("single")}
                  className={`text-sm font-medium pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === "single"
                      ? "text-[#1a4d7a] border-[#1a4d7a]"
                      : "text-gray-500 border-transparent hover:text-gray-700"
                  }`}
                >
                  Single-Source Claims
                </button>
                <button className="text-sm font-medium pb-2 border-b-2 border-transparent text-gray-400 cursor-not-allowed">
                  Timeline (Coming Soon)
                </button>
              </div>

              {/* Tab content */}
              <div className="space-y-4">
                {activeTab === "all" && (
                  <>
                    {sourceNames.map((sourceName) => {
                      const sourceArticles = articles.filter(
                        (a) => a.source_name === sourceName
                      );
                      const sourceNote = story.per_source?.[sourceName];
                      return (
                        <div
                          key={sourceName}
                          className="p-5 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                              {sourceName.charAt(0).toUpperCase()}
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">{sourceName}</h3>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">
                            {sourceArticles.length} article
                            {sourceArticles.length !== 1 ? "s" : ""}
                          </p>
                          {sourceNote && (
                            <p className="text-sm text-gray-700 mb-3 leading-relaxed">
                              {sourceNote}
                            </p>
                          )}
                          <ul className="space-y-2">
                            {sourceArticles.map((article) => (
                              <li key={article.id}>
                                <a
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-[#1a4d7a] hover:underline"
                                >
                                  {article.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </>
                )}

                {activeTab === "agree" && (
                  <div className="space-y-4">
                    {agreeClaims.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        No agreed-upon claims available yet.
                      </p>
                    ) : (
                      agreeClaims.map((claim, index) => (
                        <div
                          key={index}
                          className="p-5 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
                        >
                          <div className="flex items-start gap-3 mb-2">
                            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm text-gray-800 mb-2 leading-relaxed">
                                {claim.claim}
                              </p>
                              <p className="text-xs text-gray-500">
                                Reported by {claim.sources.length} source
                                {claim.sources.length !== 1 ? "s" : ""}:{" "}
                                {claim.sources.join(", ")}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === "single" && (
                  <div className="space-y-4">
                    {singleSourceClaims.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        No single-source claims available yet.
                      </p>
                    ) : (
                      singleSourceClaims.map((claim, index) => (
                        <div
                          key={index}
                          className="p-5 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
                        >
                          <div className="flex items-start gap-3 mb-2">
                            <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm text-gray-800 mb-2 leading-relaxed">
                                {claim.claim}
                              </p>
                              <p className="text-xs text-gray-500">
                                Only reported by: {claim.sources[0]}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar (col 10-12 on lg) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Coverage analysis */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Coverage Analysis
                </h2>
                <button className="text-gray-400 hover:text-gray-600">
                  <Info className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-6">
                <div className="flex items-end justify-between mb-3">
                  <span className="text-2xl font-bold text-gray-900">
                    {sourceNames.length}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mb-3">Total Sources</div>

                <div className="space-y-3">
                  {/* Simple mock for now */}
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-700 leading-snug">
                        Coverage from multiple outlets
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Other top stories (placeholder) */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Other Top Stories
                </h2>
              </div>
              <p className="text-xs text-gray-500">
                View all stories on the homepage
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
