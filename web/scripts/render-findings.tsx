/**
 * Findings share cards + draft thread: exports/findings/<slug>/ -> exports/findings/<slug>/cards/
 *
 *   npm run findings              every finding with cards
 *   npm run findings -- --out DIR write somewhere else (samples)
 *
 * Fails (exit 1) without writing posts.md if any draft breaks the post rules.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DriftCard, MapCard, SpreadCard } from "@/lib/cards/findings";
import { renderPng } from "@/lib/cards/render";
import { loadOffenseStyle } from "@/lib/findings/offenseStyle";
import { threadMarkdown } from "@/lib/findings/posts";
import { EXPORTS_DIR } from "@/lib/weekly/data";

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const root = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(EXPORTS_DIR, "findings");

  const d = loadOffenseStyle();
  if (!d) throw new Error("no exports/findings/offense-style; run python -m analysis.findings.offense_style");
  const dir = path.join(root, d.slug, "cards");
  mkdirSync(dir, { recursive: true });
  const md = threadMarkdown(d); // throws before anything is written if a post breaks the rules
  const cards = { "drift.png": <DriftCard d={d} />, "map.png": <MapCard d={d} />, "spread.png": <SpreadCard d={d} /> };
  for (const [name, el] of Object.entries(cards)) writeFileSync(path.join(dir, name), await renderPng(el));
  writeFileSync(path.join(dir, "posts.md"), md);
  console.log(`${d.slug}: ${Object.keys(cards).join(", ")}, posts.md -> ${path.relative(process.cwd(), dir)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
