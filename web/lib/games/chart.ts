/**
 * Geometry for the win-probability chart, shared by the game page (SVG in the browser) and its
 * link preview (SVG in Satori). Everything is in unit space: x = share of the game (0-1, overtime
 * gets a short stub after regulation), y = 1 - home WP (0 = top = home wins).
 *
 * The line and its two washes are split exactly at 50% (crossing points interpolated), so the part
 * above the line takes the home color and the part below the away color without any SVG clipping.
 */
import type { TeamInfo } from "@/lib/weekly/types";
import { contrast } from "@/lib/weekly/format";
import type { FourthDown, GameExport } from "./types";

export const OT_SHARE = 1 / 7; // overtime stub, as a share of regulation width
export const REG_SECONDS = 3600;

export interface Pt { x: number; y: number }

export function domain(g: Pick<GameExport, "went_to_overtime">): number {
  return 1 + (g.went_to_overtime ? OT_SHARE : 0);
}

/** Unit-space points for every snap plus the final result. */
export function points(g: GameExport): Pt[] {
  const total = domain(g);
  const s = g.series;
  let left = REG_SECONDS;
  return s.home_wp.map((wp, i) => {
    const final = s.play_seq[i] === null;
    left = Math.min(left, s.game_seconds_remaining[i]); // upstream clock corrections can tick back up a few seconds
    const x = final ? total : (REG_SECONDS - left) / REG_SECONDS;
    return { x: x / total, y: 1 - wp };
  });
}

/** The points the line is drawn through. After overtime only the result is known (no OT play-by-play WP),
 *  so an OT game's line stops at the end of regulation and the result is drawn as a lone dot. */
export function linePoints(g: GameExport, pts: Pt[]): Pt[] {
  return g.went_to_overtime ? pts.slice(0, -1) : pts;
}

/** Insert a point wherever the line crosses 50%, so every segment sits on one side. */
export function splitAtHalf(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  pts.forEach((p, i) => {
    if (i > 0) {
      const a = pts[i - 1];
      if ((a.y - 0.5) * (p.y - 0.5) < 0) {
        const t = (0.5 - a.y) / (p.y - a.y);
        out.push({ x: a.x + (p.x - a.x) * t, y: 0.5 });
      }
    }
    out.push(p);
  });
  return out;
}

const f = (v: number) => Math.round(v * 100) / 100;

/** The line as two paths: the runs above 50% (home leading) and below (away leading). */
export function linePaths(pts: Pt[], w: number, h: number): { above: string; below: string } {
  const split = splitAtHalf(pts);
  const paths = { above: "", below: "" };
  for (let i = 1; i < split.length; i++) {
    const a = split[i - 1], b = split[i];
    const side = (a.y + b.y) / 2 <= 0.5 ? "above" : "below";
    paths[side] += `M${f(a.x * w)} ${f(a.y * h)}L${f(b.x * w)} ${f(b.y * h)}`;
  }
  return paths;
}

/** The washes between the line and 50%: home's above, away's below. */
export function areaPaths(pts: Pt[], w: number, h: number): { above: string; below: string } {
  const split = splitAtHalf(pts);
  const poly = (clamp: (y: number) => number) =>
    `M${f(split[0].x * w)} ${f(h / 2)}` + split.map((p) => `L${f(p.x * w)} ${f(clamp(p.y) * h)}`).join("") +
    `L${f(split.at(-1)!.x * w)} ${f(h / 2)}Z`;
  return { above: poly((y) => Math.min(y, 0.5)), below: poly((y) => Math.max(y, 0.5)) };
}

// ------------------------------------------------------------------------------- 4th-down grades

export type CallGrade = "right" | "small" | "big" | "ungraded";

/** Same cutoffs as "You Make the Call": the model's call / under 2 WP points lost / 2 or more. */
export function callGrade(fd: Pick<FourthDown, "is_graded" | "wp_lost">): CallGrade {
  if (!fd.is_graded || fd.wp_lost === null) return "ungraded";
  if (fd.wp_lost < 1e-6) return "right";
  return fd.wp_lost < 0.02 ? "small" : "big";
}

export const GRADE_HEX: Record<CallGrade, string> = { right: "#39d98a", small: "#ff7a45", big: "#ff4d5e", ungraded: "#6b7690" };
export const GRADE_LABEL: Record<CallGrade, string> = {
  right: "Matched the model", small: "Lost under 2 WP points", big: "Lost 2+ WP points", ungraded: "Not graded",
};

// ------------------------------------------------------------------------------- team colors

function oklab(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab distance x100 (15+ reads as two different colors at a glance). */
export function colorDistance(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

const MIN_DISTANCE = 15;
const NIGHT = "#0d1321";
const NEUTRAL = "#aab3c7";
const FALLBACK = ["#4c8dff", "#ff7a45"]; // last resort when both teams' colors collide: the site's blue and orange

function mixWhite(hex: string, t: number): string {
  const v = hex.replace("#", "");
  return "#" + [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * t).toString(16).padStart(2, "0");
  }).join("");
}

/** The team's primary, lightened just enough to read on the night background. */
function liftedPrimary(t: TeamInfo): string {
  for (let k = 0; k <= 10; k++) {
    const c = mixWhite(t.primary, k * 0.08);
    if (contrast(c, NIGHT) >= 3) return c;
  }
  return NEUTRAL;
}

/** In order of preference: the primary as is, the primary lifted, the secondary, the site's neutral. */
function candidates(t: TeamInfo): string[] {
  const out = [liftedPrimary(t)];
  if (contrast(t.secondary, NIGHT) >= 2.2) out.push(t.secondary);
  return [...out, NEUTRAL];
}

/** One visible color per team that also differs from the other team's (e.g. two navy teams). */
export function teamColors(home: TeamInfo, away: TeamInfo): { home: string; away: string } {
  for (const h of candidates(home)) {
    const a = candidates(away).find((c) => colorDistance(c, h) >= MIN_DISTANCE);
    if (a) return { home: h, away: a };
  }
  return { home: FALLBACK[0], away: FALLBACK[1] };
}

// ------------------------------------------------------------------------------- labels

/** "Q3 4:52" from seconds left in regulation. */
export function clockAt(gameSecondsRemaining: number): string {
  if (gameSecondsRemaining <= 0) return "Final";
  const elapsed = REG_SECONDS - gameSecondsRemaining;
  const q = Math.min(Math.floor(elapsed / 900) + 1, 4);
  const left = gameSecondsRemaining - (4 - q) * 900;
  return `Q${q} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export const gamePath = (season: number, gameId: string) => `/games/${season}/${gameId}`;
export const seasonGamesPath = (season: number) => `/games/${season}`;

/** A team's line color that stays distinct from the league-average line (the neutral gray). */
export function colorVsLeague(t: TeamInfo | undefined): { team: string; league: string } {
  const c = t && candidates(t).find((x) => colorDistance(x, NEUTRAL) >= MIN_DISTANCE);
  return { team: c ?? FALLBACK[0], league: NEUTRAL };
}
