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
      // Cross-origin isolation for the calculator: onnxruntime's WASM probes for shared memory, which
      // without isolation triggers Chrome's SharedArrayBuffer deprecation warning. Everything the
      // page loads (fonts, models, WASM) is same-origin, so require-corp blocks nothing.
      { source: "/calculator", headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ] },
      // a dedicated worker started by an isolated page must be served with COEP itself (the
      // calculator's engine runs in one); harmless on every other static file. All of /_next/static,
      // not just /chunks: on Vercel, Next 16.4 serves chunks from /_next/static/immutable/chunks.
      { source: "/_next/static/:path*", headers: [{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }] },
    ];
  },
};

export default nextConfig;
