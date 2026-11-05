import type { NextConfig } from "next";

// Model files and the ONNX Runtime WASM aren't content-hashed, so cache for an hour and let the
// CDN serve stale while it revalidates (a retrain + redeploy shows up within the hour).
const MODEL_CACHE = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }];

const nextConfig: NextConfig = {
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
  async headers() {
    return [
      { source: "/models/:path*", headers: MODEL_CACHE },
      { source: "/ort/:path*", headers: MODEL_CACHE },
    ];
  },
};

export default nextConfig;
