/** Reads exports/coaches at build time. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXPORTS_DIR } from "@/lib/weekly/data";
import type { CoachPage, CoachesIndex } from "./types";

const DIR = path.join(EXPORTS_DIR, "coaches");

export function coachesIndex(): CoachesIndex | null {
  const f = path.join(DIR, "index.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

export function loadCoach(slug: string): CoachPage | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const f = path.join(DIR, `${slug}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}
