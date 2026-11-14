import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 배포 묶음(npm run release)은 실행에 필요한 파일만 모은 standalone 으로 만든다
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
