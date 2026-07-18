import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import {
  Search,
  Bookmark,
  Bell,
  User,
  Menu,
  ChevronDown,
  Home,
  Users,
  Briefcase,
  Shield,
  Trophy,
  Heart,
  Monitor,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const cn = (...inputs: any[]) => twMerge(clsx(inputs));

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NewsLens KE",
  description: "Kenyan news aggregator with coverage analysis",
};

const navItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Politics", href: "/stories", icon: Users },
  { label: "Business", href: "/stories", icon: Briefcase },
  { label: "Security", href: "/stories", icon: Shield },
  { label: "Sports", href: "/stories", icon: Trophy },
  { label: "Health", href: "/stories", icon: Heart },
  { label: "Technology", href: "/stories", icon: Monitor },
  { label: "Counties", href: "/stories", icon: MapPin },
  { label: "More", href: "/stories", icon: MoreHorizontal },
];

function Header() {
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search for stories, topics, or sources..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a4d7a]/20 focus:border-[#1a4d7a] text-sm"
              />
            </div>
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
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = idx === 0;
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <Header />
        {children}
      </body>
    </html>
  );
}
