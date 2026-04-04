import type { NextConfig } from "next";

/** next.config.mjs와 동시에 두지 마세요. Next는 mjs를 ts보다 먼저 읽어 ts 설정이 무시됩니다. */
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
