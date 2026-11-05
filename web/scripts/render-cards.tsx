/**
 * Weekly share cards + draft posts: exports/weekly -> exports/cards/{season}/week_NN/
 *
 *   npm run cards                      the latest exported week
 *   npm run cards -- 2026 8            one week
 *   npm run cards -- 2026 all          every exported week of 2026 (the backfill)
 *   npm run cards -- 2026 8 --out DIR  write somewhere else (samples)
 *
 * Writes worst-call.png, top-3.png, leaderboard.png (from week 4), gutsiest.png and posts.md.
 * Fails (exit 1) without writing that week's posts.md if any draft breaks the post rules.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { GutsiestCard, LeaderboardCard, Top3Card, WorstCallCard } from "@/lib/cards/cards";
import { renderPng } from "@/lib/cards/render";
import { EXPORTS_DIR, latestWeek, loadWeek, seasonIndex } from "@/lib/weekly/data";
import { postsMarkdown } from "@/lib/weekly/posts";
import type { WeekExport } from "@/lib/weekly/types";

function cardsFor(w: WeekExport): [string, ReactElement][] {
  const cards: [string, ReactElement | null][] = [
    ["worst-call.png", <WorstCallCard key="w" w={w} />],
    ["top-3.png", w.worst.length >= 3 ? <Top3Card key="t" w={w} /> : null],
    ["leaderboard.png", w.leaderboard ? <LeaderboardCard key="l" w={w} /> : null],
    ["gutsiest.png", w.gutsiest ? <GutsiestCard key="g" w={w} /> : null],
  ];
  return cards.filter((c): c is [string, ReactElement] => c[1] !== null);
}

async function renderWeek(season: number, week: number, outRoot: string) {
  const w = loadWeek(season, week);
  if (!w) throw new Error(`no export for ${season} week ${week}; run python -m models.weekly first`);
  const dir = path.join(outRoot, String(season), `week_${String(week).padStart(2, "0")}`);
  mkdirSync(dir, { recursive: true });
  const cards = cardsFor(w);
  const md = postsMarkdown(w, cards.map(([name]) => name)); // throws before anything is written if a post breaks the rules
  for (const [name, el] of cards) writeFileSync(path.join(dir, name), await renderPng(el));
  writeFileSync(path.join(dir, "posts.md"), md);
  console.log(`${season} week ${week}: ${cards.map(([n]) => n).join(", ")}, posts.md -> ${path.relative(process.cwd(), dir)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outRoot = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(EXPORTS_DIR, "cards");
  const [seasonArg, weekArg] = args.filter((_, i) => outIdx < 0 || (i !== outIdx && i !== outIdx + 1));
  const latest = latestWeek();
  if (!latest) throw new Error("exports/weekly is empty; run python -m models.weekly first");
  const season = seasonArg ? Number(seasonArg) : latest.season;
  const weeks = weekArg === "all" ? seasonIndex(season).weeks : [weekArg ? Number(weekArg) : seasonIndex(season).latest];
  for (const week of weeks) await renderWeek(season, week, outRoot);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
