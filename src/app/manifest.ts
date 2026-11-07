import type { MetadataRoute } from "next";

// Web app manifest: makes NewsLens KE installable ("Add to Home Screen")
// and open full-screen like a native app. Served by Next.js at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NewsLens KE",
    short_name: "NewsLens KE",
    description:
      "Kenyan news, verified against trusted outlets and PesaCheck fact-checks.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
