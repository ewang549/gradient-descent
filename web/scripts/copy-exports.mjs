// Copy what the site serves as static files from ../exports into public/ (runs before dev and build;
// both targets are gitignored):
//   exports/cards/**          -> public/cards/{season}/week_NN/*.png   (share cards)
//   exports/play/pool.json    -> public/data/play-pool.json            ("You Make the Call", fetched by the page)
//   exports/findings/<slug>/cards/*.png -> public/findings/<slug>/*.png (findings share cards + index thumbnails)
//   exports/findings/<slug>/{predictions,grades}_*.json -> public/findings/<slug>/ (timestamped calls, linked from the page)
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
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

const findingsOut = join(root, "public", "findings");
rmSync(findingsOut, { recursive: true, force: true });
const findingsDir = join(exportsDir, "findings");
if (existsSync(findingsDir)) {
  for (const slug of readdirSync(findingsDir)) {
    const cardsDir = join(findingsDir, slug, "cards");
    if (!existsSync(cardsDir)) continue;
    mkdirSync(join(findingsOut, slug), { recursive: true });
    for (const f of readdirSync(cardsDir).filter((f) => f.endsWith(".png"))) copyFileSync(join(cardsDir, f), join(findingsOut, slug, f));
    const records = readdirSync(join(findingsDir, slug)).filter((f) => /^(predictions|grades)_.*\.json$/.test(f));
    for (const f of records) copyFileSync(join(findingsDir, slug, f), join(findingsOut, slug, f));
    console.log(`copied exports/findings/${slug}/cards${records.length ? ` and ${records.length} prediction/grade files` : ""} to public/findings/${slug}`);
  }
}
