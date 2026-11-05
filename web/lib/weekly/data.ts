/**
 * Reads exports/weekly/ from disk. Only called at build time (static pages) and by the card
 * script, never per request, so the site needs no database or API.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SeasonIndex, WeekExport } from "./types";

// web/ is the Next.js root; the exports live one level up, next to the Python pipeline
export const EXPORTS_DIR = process.env.EXPORTS_DIR ?? path.join(process.cwd(), "..", "exports");
const WEEKLY = path.join(EXPORTS_DIR, "weekly");

export function seasons(): number[] {
  if (!existsSync(WEEKLY)) return [];
  return readdirSync(WEEKLY).filter((d) => /^\d{4}$/.test(d)).map(Number).sort((a, b) => a - b);
}

export function seasonIndex(season: number): SeasonIndex {
  return JSON.parse(readFileSync(path.join(WEEKLY, String(season), "index.json"), "utf8"));
}

export function allWeeks(): { season: number; week: number }[] {
  return seasons().flatMap((season) => seasonIndex(season).weeks.map((week) => ({ season, week })));
}

export function latestWeek(): { season: number; week: number } | null {
  return allWeeks().at(-1) ?? null;
}

export function loadWeek(season: number, week: number): WeekExport | null {
  const file = path.join(WEEKLY, String(season), `week_${String(week).padStart(2, "0")}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
