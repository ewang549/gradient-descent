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
  // the link-preview route reads the models, the ORT WASM binary and the card fonts from disk
  outputFileTracingIncludes: {
    "/og/**": [
      "./public/models/**",
      "./assets/fonts/**",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
  },
  // calculator links from before it moved to /calculator (any URL with a situation in it)
  async redirects() {
    return [{ source: "/", has: [{ type: "query", key: "yl" }], destination: "/calculator", permanent: true }];
  },
  async headers() {
    return [
      { source: "/models/:path*", headers: MODEL_CACHE },
      { source: "/ort/:path*", headers: MODEL_CACHE },
      { source: "/cards/:path*", headers: MODEL_CACHE },
      { source: "/data/:path*", headers: MODEL_CACHE },
      // No cross-origin isolation (COOP/COEP) on /calculator. Its engine runs in a dedicated worker, and
      // an isolated page can only start a worker whose script is served with COEP too. On Vercel,
      // Next 16.4 serves Turbopack chunks as immutable assets from /_next/static/immutable/, which
      // skip the headers() routes, so the worker was blocked and the model never loaded in production.
      // onnxruntime runs single-threaded (numThreads = 1), so isolation bought nothing functional.
    ];
  },
};

export default nextConfig;
