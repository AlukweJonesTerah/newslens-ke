"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  Info,
  CheckCircle2,
  AlertCircle,
  MessageSquareText,
  LoaderCircle,
} from "lucide-react";

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
  embedding: number[] | null;
}

interface RelatedStory {
  id: string;
  title: string;
  coverage_category: CoverageCategory;
  article_count: number;
}

interface FactCheck {
  id: string;
  title: string;
  url: string;
  verdict: string | null;
  published_at: string | null;
  similarity: number;
}

function formatPublishedAt(dateStr: string | null): string {
  if (!dateStr) return "Unknown time";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const absolute = date.toLocaleString("en-KE", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return `${absolute} · ${mins}m ago`;
  }
  if (diffHours < 24) {
    return `${absolute} · ${Math.floor(diffHours)}h ago`;
  }
  if (diffHours < 24 * 7) {
    return `${absolute} · ${Math.floor(diffHours / 24)}d ago`;
  }
  return absolute;
}

function getCategoryColor(category: CoverageCategory | string): string {
  switch (category) {
    case "government_focused":   return "#c85a54";
    case "opposition_focused":   return "#6b9080";
    case "public_focused":       return "#e7c15b";
    case "business_focused":     return "#7a87c5";
    case "international_focused":return "#a87ca0";
    default:                     return "#6b7280";
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

const SOURCE_LOGOS: { match: string; path: string }[] = [
  { match: "businessdaily", path: "/logos/businessdaily.png" },
  { match: "peopledaily",   path: "/logos/peopledaily.png"   },
  { match: "nation",       path: "/logos/nation.png"        },
  { match: "standard",     path: "/logos/standard.png"      },
  { match: "kenyans",      path: "/logos/kenyans.png"       },
  { match: "tuko",         path: "/logos/tuko.png"          },
  { match: "pesacheck",    path: "/logos/pesacheck.png"     },
];

function getSourceLogoPath(sourceName: string): string | null {
  const n = sourceName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SOURCE_LOGOS.find((e) => n.includes(e.match))?.path ?? null;
}

function getVerdictColor(verdict: string | null): string {
  if (!verdict) return "#6b7280"; // gray
  const v = verdict.toUpperCase();
  if (v.includes("FALSE") || v.includes("FAKE") || v.includes("INCORRECT")) {
    return "#dc2626"; // red
  }
  if (v.includes("MISLEADING") || v.includes("MOSTLY FALSE")) {
    return "#ea580c"; // orange
  }
  if (v.includes("UNPROVEN") || v.includes("UNVERIFIED")) {
    return "#d97706"; // amber
  }
  if (v.includes("TRUE") || v.includes("CORRECT")) {
    return "#16a34a"; // green
  }
  if (v.includes("MOSTLY TRUE")) {
    return "#65a30d"; // light green
  }
  return "#6b7280"; // gray default
}

export default function StoryDetailClient({
  story,
  articles,
  sources,
  relatedStories,
  relatedFactChecks = [],
}: {
  story: Story;
  articles: Article[];
  sources: StorySource[];
  relatedStories: RelatedStory[];
  relatedFactChecks?: FactCheck[];
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [smsState, setSmsState] = useState<"idle" | "sending" | "sent" | "limited" | "error">("idle");
  const [smsFeedback, setSmsFeedback] = useState<string | null>(null);
  const sourceNames = [...new Set(articles.map((a) => a.source_name))];

  const agreeClaims =
    story.consensus_claims?.filter((c) => c.sources.length >= 2) ?? [];
  const singleSourceClaims =
    story.consensus_claims?.filter((c) => c.sources.length === 1) ?? [];

  const timelineArticles = [
    ...articles
      .filter((a) => a.published_at !== null)
      .sort(
        (a, b) =>
          new Date(a.published_at!).getTime() -
          new Date(b.published_at!).getTime(),
      ),
    ...articles.filter((a) => a.published_at === null),
  ];

  async function sendFollowUpSms() {
    setSmsState("sending");
    setSmsFeedback(null);

    try {
      const response = await fetch("/api/sms/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: story.id }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setSmsState(response.status === 429 ? "limited" : "error");
        setSmsFeedback(result?.error || "Could not send the SMS. Please try again.");
        return;
      }

      setSmsState("sent");
      setSmsFeedback("Follow-up SMS accepted by the provider.");
    } catch {
      setSmsState("error");
      setSmsFeedback("Could not send the SMS. Please try again.");
    }
  }

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
                      <span
                        className="px-3 py-1 text-white text-xs font-semibold uppercase tracking-wide rounded-full"
                        style={{ backgroundColor: getCategoryColor(story.coverage_category) }}
                      >
                        {getCategoryLabel(story.coverage_category)}
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

                  <div>
                    <button
                      type="button"
                      onClick={sendFollowUpSms}
                      disabled={smsState === "sending" || smsState === "sent" || smsState === "limited"}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#1a4d7a] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#143c5e] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {smsState === "sending" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquareText className="h-4 w-4" />
                      )}
                      {smsState === "sent" ? "SMS sent" : "Send follow-up SMS"}
                    </button>
                    {smsFeedback && (
                      <p
                        role="status"
                        className={`mt-2 text-xs ${smsState === "sent" ? "text-green-700" : "text-red-700"}`}
                      >
                        {smsFeedback}
                      </p>
                    )}
                  </div>

                </div>
                {/* Right: sources */}
                <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 p-6 md:p-8 min-h-[300px] flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-gray-400 mb-4">
                    Covered by
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((source) => {
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
                    {sources.length === 0 && (
                      <span className="text-xs text-gray-400">
                        No sources yet
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Tabs section */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  From Multiple Sources
                </h2>
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

              </div>

              {/* Tab content */}
              <div className="space-y-4">
                {activeTab === "all" && (
                  <>
                    {sourceNames.map((sourceName) => {
                      const sourceArticles = articles.filter(
                        (a) => a.source_name === sourceName,
                      );
                      const sourceNote = story.per_source?.[sourceName];
                      return (
                        <div
                          key={sourceName}
                          className="p-5 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            {(() => {
                              const logo = getSourceLogoPath(sourceName);
                              return logo ? (
                                <div className="w-9 h-9 rounded-lg bg-white border border-gray-100 shrink-0 flex items-center justify-center p-0.5 overflow-hidden">
                                  <img src={logo} alt={sourceName} className="w-full h-full object-contain" />
                                </div>
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                                  {sourceName.charAt(0).toUpperCase()}
                                </div>
                              );
                            })()}
                            <h3 className="text-sm font-semibold text-gray-900">
                              {sourceName}
                            </h3>
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
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {claim.sources.map((src) => {
                                  const logo = getSourceLogoPath(src);
                                  return (
                                    <span
                                      key={src}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-100 rounded-full text-xs text-gray-600"
                                    >
                                      {logo && (
                                        <img src={logo} alt={src} className="w-3.5 h-3.5 object-contain" />
                                      )}
                                      {src}
                                    </span>
                                  );
                                })}
                              </div>
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
                              <div className="mt-1">
                                {(() => {
                                  const src = claim.sources[0];
                                  const logo = getSourceLogoPath(src);
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-100 rounded-full text-xs text-gray-600">
                                      {logo && (
                                        <img src={logo} alt={src} className="w-3.5 h-3.5 object-contain" />
                                      )}
                                      {src}
                                    </span>
                                  );
                                })()}
                              </div>
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

            {/* Related Fact-Checks */}
            {relatedFactChecks.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Related Fact-Checks
                  </h2>
                </div>
                <div className="space-y-3">
                  {relatedFactChecks.map((factCheck) => (
                    <a
                      key={factCheck.id}
                      href={factCheck.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 border border-gray-100 rounded-xl hover:border-gray-300 hover:shadow-sm transition"
                    >
                      {/* PesaCheck attribution */}
                      <div className="flex items-center gap-2 mb-2">
                        <img
                          src="/logos/pesacheck.svg"
                          alt="PesaCheck logo"
                          className="w-5 h-5 object-contain"
                        />
                        <span className="text-xs font-semibold text-gray-600">
                          Fact-check by PesaCheck
                        </span>
                      </div>

                      {/* Verdict badge */}
                      {factCheck.verdict && (
                        <div className="mb-2">
                          <span
                            className="inline-block px-2.5 py-1 text-xs font-bold uppercase tracking-wide rounded-md text-white"
                            style={{ backgroundColor: getVerdictColor(factCheck.verdict) }}
                          >
                            {factCheck.verdict}
                          </span>
                        </div>
                      )}

                      {/* Headline */}
                      <p className="text-sm font-medium text-gray-900 leading-snug mb-2">
                        {factCheck.title}
                      </p>

                      {/* Published date */}
                      {factCheck.published_at && (
                        <p className="text-xs text-gray-500">
                          {new Date(factCheck.published_at).toLocaleDateString('en-KE', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      )}

                      {/* External link indicator */}
                      <div className="flex items-center gap-1 mt-2 text-xs text-[#1a4d7a]">
                        <span>Read full fact-check</span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </div>
                    </a>
                  ))}
                </div>

                {/* Disclaimer */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    These fact-checks are published by PesaCheck, Africa's independent fact-checking initiative. NewsLens surfaces them based on topical similarity.
                  </p>
                </div>
              </section>
            )}

            {/* Related Stories */}
            {relatedStories.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                  Related Stories
                </h2>
                <div className="space-y-3">
                  {relatedStories.map((related) => (
                    <Link
                      key={related.id}
                      href={`/stories/${related.id}`}
                      className="block p-3 border border-gray-100 rounded-xl hover:border-gray-300 hover:shadow-sm transition"
                    >
                      <span className="text-xs text-[#1a4d7a] font-semibold uppercase tracking-wider mb-1 block">
                        {getCategoryLabel(related.coverage_category)}
                      </span>
                      <p className="text-sm font-medium text-gray-900 leading-snug mb-1">
                        {related.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {related.article_count} articles
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Timeline */}
            {timelineArticles.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                  Timeline
                </h2>
                <ol>
                  {timelineArticles.map((article, index) => {
                    const isFirst = index === 0;
                    return (
                      <li key={article.id} className="flex gap-3">
                        {/* Spine */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                              isFirst ? "bg-[#1a4d7a]" : "bg-gray-300"
                            }`}
                          />
                          {index < timelineArticles.length - 1 && (
                            <div className="w-px flex-1 bg-gray-200 my-1" />
                          )}
                        </div>
                        {/* Content */}
                        <div className="pb-4 min-w-0">
                          {isFirst && (
                            <p className="text-xs font-semibold text-[#1a4d7a] uppercase tracking-wider mb-0.5">
                              First reported
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mb-0.5">
                            {article.source_name} · {formatPublishedAt(article.published_at)}
                          </p>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-gray-900 hover:text-[#1a4d7a] hover:underline leading-snug block"
                          >
                            {article.title}
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* Other top stories (placeholder) */}
            {/* <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Other Top Stories
                </h2>
              </div>
              <p className="text-xs text-gray-500">
                View all stories on the homepage
              </p>
            </section> */}
          </div>
        </div>
      </div>
    </main>
  );
}
