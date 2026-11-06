/**
 * Findings share cards + draft threads: exports/findings/<slug>/ -> exports/findings/<slug>/cards/
 *
 *   npm run findings                       every finding with cards
 *   npm run findings -- --out DIR          write somewhere else (samples)
 *   npm run findings -- --grades FILE      use this grades file for finding 2's results card (e.g. a --simulate run)
 *
 * Fails (exit 1) without writing a finding's posts.md if any draft breaks the post rules.
 * Finding 2's results.png is drawn only once grades_2026.json exists (written by luck_grade.py after week 18).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { DriftCard, MapCard, SpreadCard } from "@/lib/cards/findings";
import { CallsCard, LuckCard, RegressionCard, ResultsCard } from "@/lib/cards/luckSkill";
import { renderPng } from "@/lib/cards/render";
import { luckSkillMarkdown } from "@/lib/findings/luckPosts";
import { loadLuckSkill } from "@/lib/findings/luckSkill";
import { loadOffenseStyle } from "@/lib/findings/offenseStyle";
import { threadMarkdown } from "@/lib/findings/posts";
import { EXPORTS_DIR } from "@/lib/weekly/data";

async function write(root: string, slug: string, cards: Record<string, ReactElement>, md: string) {
  const dir = path.join(root, slug, "cards");
  mkdirSync(dir, { recursive: true });
  for (const [name, el] of Object.entries(cards)) writeFileSync(path.join(dir, name), await renderPng(el));
  writeFileSync(path.join(dir, "posts.md"), md);
  console.log(`${slug}: ${Object.keys(cards).join(", ")}, posts.md -> ${path.relative(process.cwd(), dir)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => (args.includes(flag) ? path.resolve(args[args.indexOf(flag) + 1]) : undefined);
  const root = arg("--out") ?? path.join(EXPORTS_DIR, "findings");

  const os = loadOffenseStyle();
  if (!os) throw new Error("no exports/findings/offense-style; run python -m analysis.findings.offense_style");
  // posts are built (and checked) before any card is drawn
  await write(root, os.slug, { "drift.png": <DriftCard d={os} />, "map.png": <MapCard d={os} />, "spread.png": <SpreadCard d={os} /> }, threadMarkdown(os));

  const ls = loadLuckSkill(arg("--grades"));
  if (!ls) throw new Error("no exports/findings/luck-skill; run the analysis.findings.luck_* modules");
  const md = luckSkillMarkdown(ls);
  const cards: Record<string, ReactElement> = {
    "regression.png": <RegressionCard d={ls} />, "luck.png": <LuckCard d={ls} />, "calls.png": <CallsCard d={ls} />,
  };
  if (ls.grades?.vs_baseline) cards["results.png"] = <ResultsCard d={ls} />;
  await write(root, ls.slug, cards, md);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
