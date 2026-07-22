import { supabase } from "@/lib/supabase";
import Link from "next/link";
import type { CSSProperties } from "react";

// ─── Editorial profiles (same verified data as source detail page) ────────────
const EDITORIAL_PROFILES: {
  match: string;
  badge: string;
  bio: string;
}[] = [
  {
    match: "business daily",
    badge: "Private Media",
    bio: "Kenya\u2019s leading business and financial daily, published by Nation Media Group.",
  },
  {
    match: "nation",
    badge: "Private Media",
    bio: "Founded by the Aga Khan in 1959, Nation Media Group is East and Central Africa\u2019s largest independent media house.",
  },
  {
    match: "standard",
    badge: "Family-Owned",
    bio: "Kenya\u2019s oldest newspaper, founded in 1902 as the African Standard.",
  },
  {
    match: "kenyans",
    badge: "Independent",
    bio: "An independent Kenyan digital-native news outlet, owned by Boxraft Limited and founded by Robert Ndungu.",
  },
  {
    match: "tuko",
    badge: "Digital-Native",
    bio: "A digital-native outlet owned by Genesis Media, a Ukraine-based consumer internet company.",
  },
  {
    match: "people daily",
    badge: "Private Media",
    bio: "A free-circulation daily newspaper owned by Mediamax, a media company linked to the Kenyatta family.",
  },
];

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

function getProfile(name: string) {
  const lower = name.toLowerCase();
  return EDITORIAL_PROFILES.find((e) => lower.includes(e.match)) ?? null;
}

// ─── Visual helpers (inline styles — safe in server components) ───────────────
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
    Independent:      { backgroundColor: "#dcfce7", color: "#15803d" },
    "Digital-Native": { backgroundColor: "#dbeafe", color: "#1d4ed8" },
    "Family-Owned":   { backgroundColor: "#fef3c7", color: "#b45309" },
    "Private Media":  { backgroundColor: "#f3f4f6", color: "#374151" },
  };
  return map[badge] ?? { backgroundColor: "#f3f4f6", color: "#374151" };
}

// ─── Data ─────────────────────────────────────────────────────────────────────
async function getSources() {
  const { data, error } = await supabase
    .from("sources")
    .select("id,name")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function SourcesPage() {
  const sources = await getSources();

  return (
    <main className="flex-1 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-semibold text-gray-900 mb-1">
            Sources
          </h1>
          <p className="text-gray-500 text-sm">
            {sources.length} outlet{sources.length !== 1 ? "s" : ""} tracked
            by NewsLens KE
          </p>
        </div>

        {/* Source grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => {
            const profile = getProfile(source.name);
            return (
              <Link
                key={source.id}
                href={`/sources/${source.id}`}
                className="group bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-md hover:border-gray-300 transition-all"
              >
                {/* Top row: avatar + name + badge */}
                <div className="flex items-center gap-3">
                  {(() => {
                    const logo = getSourceLogo(source.name);
                    return logo ? (
                      <div className="w-12 h-12 rounded-xl shrink-0 bg-white border border-gray-100 shadow-sm flex items-center justify-center p-1.5 overflow-hidden">
                        <img src={logo} alt={`${source.name} logo`} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center shadow-sm"
                        style={sourceGradient(source.name)}
                      >
                        <span className="text-xl font-bold text-white font-serif select-none">
                          {source.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 truncate group-hover:text-accent transition-colors">
                      {source.name}
                    </h2>
                    {profile?.badge && (
                      <span
                        className="inline-block mt-0.5 px-2 py-0.5 text-xs font-medium rounded-full"
                        style={badgeStyle(profile.badge)}
                      >
                        {profile.badge}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bio */}
                <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 flex-1">
                  {profile?.bio ?? "View this outlet\u2019s recent stories and coverage."}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <span className="text-xs text-gray-400">Nairobi, Kenya</span>
                  <span className="text-xs font-medium text-accent group-hover:underline">
                    View source →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
