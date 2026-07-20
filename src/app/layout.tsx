import type { Metadata } from "next";
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
