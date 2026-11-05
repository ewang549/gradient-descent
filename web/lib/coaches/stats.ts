/** Rates from raw counts. Pure, so the leaderboard can add up any range of seasons in the browser. */
import type { Counts } from "./types";

export const MIN_CLEAR_SPOTS = 10; // below this, an aggressiveness rate is noise

export function sum(rows: Counts[]): Counts {
  const z: Counts = { decisions: 0, go: 0, clear_spots: 0, clear_go: 0, agreed: 0, wins_lost: 0, wins_lost_kicking: 0 };
  for (const r of rows) for (const k of Object.keys(z) as (keyof Counts)[]) z[k] += r[k];
  return z;
}

export interface Rates {
  per100: number; // wins lost per 100 calls
  goRate: number;
  aggressiveness: number | null;
  agreed: number;
}

export function rates(c: Counts): Rates {
  const n = c.decisions || 1;
  return {
    per100: (c.wins_lost / n) * 100,
    goRate: c.go / n,
    aggressiveness: c.clear_spots >= MIN_CLEAR_SPOTS ? c.clear_go / c.clear_spots : null,
    agreed: c.agreed / n,
  };
}

export const coachPath = (slug: string) => `/coaches/${slug}`;
