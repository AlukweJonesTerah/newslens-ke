"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Search,
  Home,
  Users,
  Briefcase,
  Newspaper,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const cn = (...inputs: any[]) => twMerge(clsx(inputs));

const navItems = [
  { label: "Home", href: "/", icon: Home },
  {
    label: "Government Aligned",
    href: "/stories?category=government",
    icon: Users,
  },
  {
    label: "Opposition Aligned",
    href: "/stories?category=opposition",
    icon: Users,
  },
  { label: "Public", href: "/stories?category=public", icon: Users },
  { label: "Business", href: "/stories?category=business", icon: Briefcase },
];

function SiteLogo() {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span className="text-xl sm:text-2xl font-serif font-semibold tracking-tight text-slate-900 whitespace-nowrap">
        NewsLens <span className="text-red-700">KE</span>
      </span>
    );
  }

  return (
    <img
      src="/logos/newslenske.png"
      alt="NewsLens KE"
      className="h-12 sm:h-16 w-auto object-contain"
      onError={() => setBroken(true)}
    />
  );
}

export default function HeaderClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get("category");

  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    if (pathname === "/search") {
      setSearchInput(searchParams.get("q") || "");
    }
  }, [pathname, searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = searchInput.trim();

    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const isSourcesActive =
    pathname === "/sources" || pathname.startsWith("/sources/");

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      {/* Top */}
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[auto_1fr_auto] md:items-center md:gap-6">

          <div className="flex items-center justify-between md:justify-start">
            <Link href="/" className="flex flex-col">

              <SiteLogo />

              <span className="hidden sm:block text-xs text-slate-500 mt-0.5">
                Understand every story. Beyond the headlines.
              </span>

            </Link>

            <Link
              href="/sources"
              className={cn(
                "md:hidden flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",

                isSourcesActive
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Newspaper className="w-4 h-4" />
              Sources
            </Link>
          </div>

          {/* Search */}

          <div className="w-full md:max-w-xl md:mx-auto">
            <form onSubmit={handleSearchSubmit} className="relative">

              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />

              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search for stories, topics, or sources..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
              />
            </form>
          </div>

          {/* Desktop Sources */}

          <div className="hidden md:flex justify-end">

            <Link
              href="/sources"
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",

                isSourcesActive
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Newspaper className="h-4 w-4" />
              Sources
            </Link>

          </div>
        </div>
      </div>

      {/* Navigation */}

      <div className="border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-4">

          <nav className="flex items-center gap-2 overflow-x-auto py-3">

            {navItems.map((item) => {
              const Icon = item.icon;

              let isActive = false;

              if (item.href === "/") {
                isActive = pathname === "/";
              } else {
                const params = new URLSearchParams(item.href.split("?")[1] || "");

                isActive =
                  pathname === "/stories" &&
                  params.get("category") === currentCategory;
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",

                    isActive
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

          </nav>

        </div>
      </div>
    </header>
  );
}