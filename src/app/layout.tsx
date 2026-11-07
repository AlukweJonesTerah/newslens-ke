import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import HeaderClient from "./HeaderClient";
import { Suspense } from "react";

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
  // iOS "Add to Home Screen": full-screen launch and home-screen icon
  appleWebApp: { capable: true, title: "NewsLens KE", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

// Colours the browser/status bar to match the app when installed
export const viewport: Viewport = {
  themeColor: "#0f172a",
};

function Header() {
  return <HeaderClient />;
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
        <Suspense
          fallback={
            <div className="h-24 bg-white border-b border-gray-200"></div>
          }
        >
          <Header />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
