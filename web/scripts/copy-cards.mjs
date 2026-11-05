// Copy the share cards from ../exports/cards into public/cards so the site serves them at
// /cards/{season}/week_NN/*.png (runs before dev and build; public/cards is gitignored).
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "exports", "cards");
const dest = join(root, "public", "cards");
rmSync(dest, { recursive: true, force: true });
if (existsSync(src)) {
  cpSync(src, dest, { recursive: true, filter: (f) => !f.endsWith(".md") });
  console.log("copied exports/cards to public/cards");
} else {
  console.log("no exports/cards yet; skipping");
}
