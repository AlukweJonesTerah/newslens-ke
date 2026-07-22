"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Search,
  Bookmark,
  Bell,
  User,
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
  { label: "Sources", href: "/sources", icon: Newspaper },
];

export default function HeaderClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get("category");
  const [searchInput, setSearchInput] = useState("");

  // Pre-fill search input when on /search page
  useEffect(() => {
    if (pathname === "/search") {
      const q = searchParams.get("q") || "";
      setSearchInput(q);
    }
  }, [pathname, searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      {/* Top bar */}
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-6">
          {/* Logo & tagline */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex flex-col">
              <span className="text-2xl font-serif font-semibold tracking-tight text-[#0f172a]">
                NewsLens <span className="text-[#1a4d7a]">KE</span>
              </span>
              <span className="text-xs text-gray-500 mt-0.5">
                Understand every story. Beyond the headlines.
              </span>
            </Link>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xl">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search for stories, topics, or sources..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a4d7a]/20 focus:border-[#1a4d7a] text-sm"
              />
            </form>
          </div>

          {/* User actions */}
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition">
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">Saved</span>
            </button>
            <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-[#1e293b] transition">
              <User className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          </div>
        </div>
      </div>

      {/* Nav bar */}
      <div className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex items-center gap-1 overflow-x-auto py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              let isActive = false;

              if (item.href === "/") {
                isActive = pathname === "/";
              } else if (!item.href.includes("?")) {
                // Exact path match (e.g. /sources)
                isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              } else {
                const itemParams = new URLSearchParams(
                  item.href.split("?")[1] || "",
                );
                const itemCategory = itemParams.get("category");
                isActive =
                  pathname === "/stories" && itemCategory === currentCategory;
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition",
                    isActive
                      ? "bg-[#1a4d7a] text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  )}
                >
                  <Icon className="w-4 h-4" />
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
