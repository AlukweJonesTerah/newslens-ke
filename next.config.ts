import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['jsdom', 'html-encoding-sniffer', '@exodus/bytes'],
};

export default nextConfig;
