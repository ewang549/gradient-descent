/** Plain-language pieces shared by the cards, the weekly page and the post drafts. */
import { fromEngineInput, toQuery } from "@/lib/calculator/state";
import type { Option } from "@/lib/engine/types";
import type { Call, TeamInfo } from "./types";

import { SITE_URL } from "@/lib/site";

export { SITE_URL };
export const BRAND = "Gradient Descent";

export const OPTION_LABEL: Record<Option, string> = { go: "Go for it", punt: "Punt", field_goal: "Field goal" };
export const OPTION_SHORT: Record<Option, string> = { go: "Go", punt: "Punt", field_goal: "FG" };

/** What the coach did, as a past-tense verb phrase. */
export function didPhrase(c: Call): string {
  if (c.decision === "go") return "went for it";
  if (c.decision === "punt") return "punted";
  return `kicked a ${c.fg_attempt_distance ?? c.fg_distance}-yard field goal`;
}

/** What the model wanted, as an imperative ("go for it") or a gerund ("going for it"). */
export function modelPhrase(o: Option, gerund = false): string {
  if (o === "go") return gerund ? "going for it" : "go for it";
  if (o === "punt") return gerund ? "punting" : "punt";
  return gerund ? "kicking the field goal" : "kick the field goal";
}

export const pts = (wp: number, digits = 1) => (wp * 100).toFixed(digits);
export const pct = (p: number) => `${Math.round(p * 100)}%`;

export function clockLabel(c: Pick<Call, "qtr" | "clock">): string {
  const [m, s] = c.clock.split(":");
  return `Q${c.qtr} ${Number(m)}:${s}`;
}

export function scoreLabel(c: Pick<Call, "posteam_score" | "defteam_score">): string {
  const d = c.posteam_score - c.defteam_score;
  const lead = d === 0 ? "Tied" : d > 0 ? `Up ${d}` : `Down ${-d}`;
  return `${lead}, ${c.posteam_score}-${c.defteam_score}`;
}

/** "vs DET" (home or neutral) / "at DET" (away). */
export const opponentLabel = (c: Call) => `${c.input.home === -1 ? "at" : "vs"} ${c.defteam}`;

/** The calculator, prefilled with exactly this play's engine inputs. */
export function calcPath(c: Call): string {
  return `/calculator?${toQuery(fromEngineInput(c.input, null))}`;
}
export const calcUrl = (c: Call) => `${SITE_URL}${calcPath(c)}`;

export const weekPath = (season: number, week: number) => `/week/${season}/${week}`;

/** Where the receiving team starts after the punt, from the receiver's view: "their own 17". */
export function puntStart(c: Call): string {
  const own = Math.round(100 - c.punt_receiving_yardline_100);
  if (own === 50) return "midfield";
  return own > 50 ? `the ${c.posteam} ${100 - own}` : `their own ${own}`;
}

/** Break-even conversion rate: going beats the best kick iff P(convert) exceeds this. */
export function breakEven(c: Call): number | null {
  const kick = Math.max(c.wp_punt, c.wp_fg);
  const spread = c.wp_if_convert - c.wp_if_fail;
  if (spread <= 0) return null;
  const p = (kick - c.wp_if_fail) / spread;
  return p > 0 && p < 1 ? p : null;
}

// ------------------------------------------------------------------------- team colors

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const NIGHT = "#0d1321";

/** A team color that stays visible on the dark card: primary if it reads, else secondary. */
export function teamAccent(t?: TeamInfo): string {
  if (!t) return "#aab3c7";
  if (contrast(t.primary, NIGHT) >= 2.2) return t.primary;
  if (contrast(t.secondary, NIGHT) >= 2.2) return t.secondary;
  return "#aab3c7";
}

/** Chip fill (team primary) with readable text and an edge that separates dark fills from the card. */
export function teamChip(t?: TeamInfo): { bg: string; fg: string; border: string } {
  const bg = t?.primary ?? "#24304a";
  const fg = contrast(bg, "#ffffff") >= contrast(bg, NIGHT) ? "#ffffff" : NIGHT;
  const border = contrast(bg, NIGHT) < 1.6 ? (t ? teamAccent(t) : "#24304a") : bg;
  return { bg, fg, border };
}
