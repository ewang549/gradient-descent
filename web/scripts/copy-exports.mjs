// Copy what the site serves as static files from ../exports into public/ (runs before dev and build;
// both targets are gitignored):
//   exports/cards/**          -> public/cards/{season}/week_NN/*.png   (share cards)
//   exports/play/pool.json    -> public/data/play-pool.json            ("You Make the Call", fetched by the page)
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exportsDir = join(root, "..", "exports");

const cards = join(root, "public", "cards");
rmSync(cards, { recursive: true, force: true });
if (existsSync(join(exportsDir, "cards"))) {
  cpSync(join(exportsDir, "cards"), cards, { recursive: true, filter: (f) => !f.endsWith(".md") });
  console.log("copied exports/cards to public/cards");
} else {
  console.log("no exports/cards yet; skipping");
}

const pool = join(exportsDir, "play", "pool.json");
if (existsSync(pool)) {
  mkdirSync(join(root, "public", "data"), { recursive: true });
  copyFileSync(pool, join(root, "public", "data", "play-pool.json"));
  console.log("copied exports/play/pool.json to public/data/play-pool.json");
} else {
  console.log("no exports/play/pool.json yet; run `make export`");
}
