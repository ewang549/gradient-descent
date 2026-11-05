/**
 * "You Make the Call": picking situations, scoring, and the share link. Pure functions, so the
 * daily puzzle is the same for everyone and the tests can pin it down.
 */
import type { Option } from "@/lib/engine/types";
import type { Kind, Situation } from "./types";

export const ROUND_MIX: Record<Kind, number> = { clear: 4, close: 3, famous: 3 };
export const DAILY_MIX: Record<Kind, number> = { clear: 2, close: 2, famous: 1 };
/** A daily puzzle only uses games at least this old, so the weekly data refresh can't change a day in progress. */
export const DAILY_MIN_AGE_DAYS = 10;
export const DAILY_EPOCH = "2026-11-01"; // Daily #1

// ------------------------------------------------------------------------------- picking

/** FNV-1a, 32-bit: a stable hash for seeding by date. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** The viewer's local calendar date, YYYY-MM-DD (the daily rolls over at local midnight, like Wordle). */
export function localDate(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const dailyNumber = (date: string) => dayNumber(date) - dayNumber(DAILY_EPOCH) + 1;

/** The daily set: within each kind, the situations with the smallest hash(date|id), from old-enough games. */
export function dailyPicks(pool: Situation[], date: string): Situation[] {
  const cutoff = isoOf(dayNumber(date) - DAILY_MIN_AGE_DAYS);
  const ranked = pool
    .filter((s) => s.date <= cutoff)
    .map((s) => ({ s, h: fnv1a(`${date}|${s.id}`) }))
    .sort((a, b) => a.h - b.h || a.s.id.localeCompare(b.s.id));
  const picked: { s: Situation; h: number }[] = [];
  const games = new Set<string>();
  for (const kind of Object.keys(DAILY_MIX) as Kind[]) {
    let need = DAILY_MIX[kind];
    for (const r of ranked) {
      if (!need) break;
      if (r.s.kind !== kind || games.has(r.s.game_id)) continue;
      picked.push(r);
      games.add(r.s.game_id);
      need--;
    }
  }
  return picked.sort((a, b) => a.h - b.h).map((r) => r.s);
}

/** A random round: ROUND_MIX of each kind, one spot per game, shuffled. */
export function roundPicks(pool: Situation[], random: () => number = Math.random, avoid = new Set<string>()): Situation[] {
  const shuffled = pool.map((s) => ({ s, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.s);
  const fresh = shuffled.filter((s) => !avoid.has(s.id));
  const source = fresh.length >= 40 ? fresh : shuffled; // once most of the pool has been seen, allow repeats
  const out: Situation[] = [];
  const games = new Set<string>();
  for (const kind of Object.keys(ROUND_MIX) as Kind[]) {
    let need = ROUND_MIX[kind];
    for (const s of source) {
      if (!need) break;
      if (s.kind !== kind || games.has(s.game_id)) continue;
      out.push(s);
      games.add(s.game_id);
      need--;
    }
  }
  return out.map((s) => ({ s, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.s);
}

// ------------------------------------------------------------------------------- scoring

export const available = (s: Situation): Option[] => (s.fg_in_range ? ["go", "punt", "field_goal"] : ["go", "punt"]);

/** WP the pick gave up vs the model's best option (0 when it matches the model). */
export function lostBy(s: Situation, pick: Option): number {
  return Math.max(0, s.wp[s.recommendation] - s.wp[pick]);
}

/** 0 = the model's call, 1 = gave up under 2 points, 2 = gave up 2 or more. */
export type Grade = 0 | 1 | 2;
export function grade(lost: number): Grade {
  if (lost < 1e-6) return 0;
  return lost < 0.02 ? 1 : 2;
}

export interface Tally {
  you: number; // total WP lost, as a fraction (0.041 = 4.1 points)
  coaches: number;
  youGrades: Grade[];
  coachGrades: Grade[];
}

export function tally(rounds: { s: Situation; pick: Option }[]): Tally {
  return {
    you: rounds.reduce((a, r) => a + lostBy(r.s, r.pick), 0),
    coaches: rounds.reduce((a, r) => a + r.s.wp_lost, 0),
    youGrades: rounds.map((r) => grade(lostBy(r.s, r.pick))),
    coachGrades: rounds.map((r) => grade(r.s.wp_lost)),
  };
}

// ------------------------------------------------------------------------------- share link

export interface Result {
  mode: "daily" | "round";
  date: string | null; // daily only
  you: number; // WP points lost, one decimal (4.1)
  coaches: number;
  you_grades: Grade[];
  coach_grades: Grade[];
}

const round1 = (pts: number) => Math.round(pts * 10) / 10;

export function toResult(t: Tally, mode: Result["mode"], date: string | null): Result {
  return {
    mode, date: mode === "daily" ? date : null, you: round1(t.you * 100), coaches: round1(t.coaches * 100),
    you_grades: t.youGrades, coach_grades: t.coachGrades,
  };
}

export function resultQuery(r: Result): string {
  const q = new URLSearchParams({ m: r.mode === "daily" ? "d" : "r" });
  if (r.date) q.set("d", r.date);
  q.set("y", r.you.toFixed(1));
  q.set("c", r.coaches.toFixed(1));
  q.set("g", r.you_grades.join(""));
  q.set("k", r.coach_grades.join(""));
  return q.toString();
}

const num = (v: string | null, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(round1(n), 0), max) : 0;
};
const grades = (v: string | null): Grade[] => (v ?? "").slice(0, 10).split("").filter((c) => /[012]/.test(c)).map(Number) as Grade[];

/** Parse (and clamp) a share link. Anyone can edit the URL; the page just shouldn't break. */
export function parseResult(q: URLSearchParams): Result {
  const daily = q.get("m") === "d";
  const date = q.get("d");
  const yg = grades(q.get("g"));
  return {
    mode: daily ? "daily" : "round",
    date: daily && date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    you: num(q.get("y"), 999), coaches: num(q.get("c"), 999),
    you_grades: yg, coach_grades: grades(q.get("k")).slice(0, yg.length || 10),
  };
}

/** "I beat NFL coaches by 7.2% win probability" (the user-facing headline, in the first person). */
export function headline(r: Pick<Result, "you" | "coaches">): string {
  const d = round1(r.coaches - r.you);
  if (d >= 0.1) return `I beat NFL coaches by ${d.toFixed(1)}% win probability`;
  if (d <= -0.1) return `NFL coaches beat me by ${(-d).toFixed(1)}% win probability`;
  return "I matched NFL coaches call for call";
}

export function modeLabel(r: Pick<Result, "mode" | "date">): string {
  return r.mode === "daily" && r.date ? `Daily #${dailyNumber(r.date)}` : "10-call round";
}

const SQUARE = ["🟩", "🟧", "🟥"];
export const gradeRow = (g: Grade[]) => g.map((x) => SQUARE[x]).join("");

export function shareText(r: Result, url: string): string {
  return [
    `You Make the Call · ${modeLabel(r)}`,
    `${gradeRow(r.you_grades)} me (-${r.you.toFixed(1)}%)`,
    `${gradeRow(r.coach_grades)} the real coaches (-${r.coaches.toFixed(1)}%)`,
    headline(r),
    url,
  ].join("\n");
}
