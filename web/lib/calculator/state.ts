/**
 * Calculator state <-> query string <-> engine input.
 *
 * Every input lives in the URL so any situation can be linked. Short keys keep links tweetable;
 * "context" keys (team strength, weather, season) only appear when a preset sets them.
 */
import type { EngineInput } from "@/lib/engine/types";

export type Venue = "home" | "away" | "neutral";

export interface CalcState {
  yardline100: number; // yards from the opponent's end zone
  ydstogo: number;
  scoreDiff: number;
  qtr: number;
  clock: number; // seconds left in the quarter
  posTimeouts: number;
  defTimeouts: number;
  spread: number; // + = offense favored
  venue: Venue;
  receives2hKickoff: boolean;
  // context: defaults = league-average teams, typical outdoor weather, the latest season
  season: number;
  offEpa: number | null;
  defEpa: number | null;
  indoors: boolean;
  turf: boolean;
  windMph: number;
  tempF: number;
  preset: string | null;
}

export const LATEST_SEASON = 2026;
export const CONTEXT_DEFAULTS = {
  season: LATEST_SEASON, offEpa: 0, defEpa: 0, indoors: false, turf: false, windMph: 8, tempF: 59,
} as const;

export const DEFAULT_STATE: CalcState = {
  yardline100: 45, ydstogo: 2, scoreDiff: -3, qtr: 4, clock: 6 * 60 + 12, posTimeouts: 2, defTimeouts: 3,
  spread: 0, venue: "home", receives2hKickoff: false, ...CONTEXT_DEFAULTS, preset: null,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Keep the situation legal: yards to go can't exceed the distance to the goal line, etc. */
export function normalize(s: CalcState): CalcState {
  const yardline100 = clamp(Math.round(s.yardline100), 1, 99);
  return {
    ...s,
    yardline100,
    ydstogo: clamp(Math.round(s.ydstogo), 1, Math.min(yardline100, 30)),
    scoreDiff: clamp(Math.round(s.scoreDiff), -35, 35),
    qtr: clamp(Math.round(s.qtr), 1, 4),
    clock: clamp(Math.round(s.clock), 1, 900),
    posTimeouts: clamp(Math.round(s.posTimeouts), 0, 3),
    defTimeouts: clamp(Math.round(s.defTimeouts), 0, 3),
    spread: clamp(Math.round(s.spread * 2) / 2, -20, 20),
    receives2hKickoff: s.qtr <= 2 ? s.receives2hKickoff : false,
  };
}

export function toEngineInput(s: CalcState): EngineInput {
  const halfSeconds = s.qtr === 1 || s.qtr === 3 ? s.clock + 900 : s.clock;
  return {
    season: s.season,
    qtr: s.qtr,
    scoreDiff: s.scoreDiff,
    gameSeconds: s.qtr <= 2 ? halfSeconds + 1800 : halfSeconds,
    halfSeconds,
    ydstogo: s.ydstogo,
    yardline100: s.yardline100,
    goalToGo: s.ydstogo >= s.yardline100,
    posTimeouts: s.posTimeouts,
    defTimeouts: s.defTimeouts,
    home: s.venue === "home" ? 1 : s.venue === "away" ? -1 : 0,
    spread: s.spread,
    receives2hKickoff: s.receives2hKickoff,
    offEpa: s.offEpa,
    defEpa: s.defEpa,
    indoors: s.indoors,
    turf: s.turf,
    windMph: s.indoors ? 0 : s.windMph,
    tempF: s.indoors ? 70 : s.tempF,
  };
}

/** From a preset's engine input back to calculator state (clock derived from half seconds). */
export function fromEngineInput(i: EngineInput, preset: string | null): CalcState {
  const clock = i.qtr === 1 || i.qtr === 3 ? i.halfSeconds - 900 : i.halfSeconds;
  return normalize({
    yardline100: i.yardline100, ydstogo: i.ydstogo, scoreDiff: i.scoreDiff, qtr: i.qtr, clock,
    posTimeouts: i.posTimeouts, defTimeouts: i.defTimeouts, spread: i.spread,
    venue: i.home === 1 ? "home" : i.home === -1 ? "away" : "neutral", receives2hKickoff: i.receives2hKickoff,
    season: i.season, offEpa: i.offEpa, defEpa: i.defEpa, indoors: i.indoors, turf: i.turf, windMph: i.windMph,
    tempF: i.tempF, preset,
  });
}

// --------------------------------------------------------------------------------- the URL

const num = (v: string | null, fallback: number) => {
  const n = v === null || v === "" ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const nullableNum = (v: string | null, fallback: number | null) => (v === "na" ? null : v === null ? fallback : num(v, fallback ?? 0));
const round = (v: number, digits: number) => String(Number(v.toFixed(digits)));

export function parseQuery(q: URLSearchParams): CalcState {
  const d = DEFAULT_STATE;
  const venue = q.get("v");
  return normalize({
    yardline100: num(q.get("yl"), d.yardline100),
    ydstogo: num(q.get("togo"), d.ydstogo),
    scoreDiff: num(q.get("diff"), d.scoreDiff),
    qtr: num(q.get("q"), d.qtr),
    clock: num(q.get("t"), d.clock),
    posTimeouts: num(q.get("to"), d.posTimeouts),
    defTimeouts: num(q.get("dto"), d.defTimeouts),
    spread: num(q.get("spr"), d.spread),
    venue: venue === "a" ? "away" : venue === "n" ? "neutral" : venue === "h" ? "home" : d.venue,
    receives2hKickoff: q.get("rk") === "1",
    season: num(q.get("yr"), d.season),
    offEpa: nullableNum(q.get("oe"), d.offEpa),
    defEpa: nullableNum(q.get("de"), d.defEpa),
    indoors: q.get("in") === "1",
    turf: q.get("tf") === "1",
    windMph: num(q.get("w"), d.windMph),
    tempF: num(q.get("tmp"), d.tempF),
    preset: q.get("p"),
  });
}

export function toQuery(s: CalcState): string {
  const q = new URLSearchParams();
  q.set("yl", String(s.yardline100));
  q.set("togo", String(s.ydstogo));
  q.set("diff", String(s.scoreDiff));
  q.set("q", String(s.qtr));
  q.set("t", String(s.clock));
  q.set("to", String(s.posTimeouts));
  q.set("dto", String(s.defTimeouts));
  q.set("spr", String(s.spread));
  q.set("v", s.venue[0]);
  if (s.qtr <= 2 && s.receives2hKickoff) q.set("rk", "1");
  const c = CONTEXT_DEFAULTS;
  if (s.season !== c.season) q.set("yr", String(s.season));
  if (s.offEpa !== c.offEpa) q.set("oe", s.offEpa === null ? "na" : round(s.offEpa, 4));
  if (s.defEpa !== c.defEpa) q.set("de", s.defEpa === null ? "na" : round(s.defEpa, 4));
  if (s.indoors) q.set("in", "1");
  if (s.turf) q.set("tf", "1");
  if (!s.indoors && s.windMph !== c.windMph) q.set("w", round(s.windMph, 1));
  if (!s.indoors && s.tempF !== c.tempF) q.set("tmp", round(s.tempF, 1));
  if (s.preset) q.set("p", s.preset);
  return q.toString();
}

/** Same situation (ignores which preset, if any, it came from). */
export function sameSituation(a: CalcState, b: CalcState): boolean {
  return toQuery({ ...a, preset: null }) === toQuery({ ...b, preset: null });
}

// ------------------------------------------------------------------------------- formatting

export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** "OPP 35", "OWN 28", "50" from the offense's view. */
export function fieldLabel(yardline100: number): string {
  if (yardline100 === 50) return "50";
  return yardline100 < 50 ? `OPP ${yardline100}` : `OWN ${100 - yardline100}`;
}

export const scoreLabel = (d: number) => (d === 0 ? "Tied" : d > 0 ? `Up ${d}` : `Down ${-d}`);
