// Copy onnxruntime-web's WASM binary into public/ort so the calculator self-hosts it
// (runs before dev and build; public/ort is gitignored).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "onnxruntime-web", "dist");
const dest = join(root, "public", "ort");
mkdirSync(dest, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log("copied onnxruntime-web WASM to public/ort");
