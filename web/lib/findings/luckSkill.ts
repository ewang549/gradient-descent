/**
 * Finding 2, luck vs skill: reads exports/findings/luck-skill (written by analysis/findings/luck_skill.py,
 * luck_baseline.py, luck_sos.py, luck_page.py and, after week 18, luck_grade.py) at build time. Every number
 * the page, cards and posts show comes from here.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXPORTS_DIR } from "@/lib/weekly/data";

export const SLUG = "luck-skill";
const DIR = path.join(EXPORTS_DIR, "findings", SLUG);
export const ORIGINAL_FILE = "predictions_2026_wk08.json";
export const VS_BASELINE_FILE = "predictions_2026_wk08_vs_baseline.json";
export const GRADES_FILE = "grades_2026.json";

export const COLORS = { record: "#e4602a", pointDiff: "#4c8dff", market: "#1fa984", pace: "#aab3c7", coin: "#6b7690" };

// ----------------------------------------------------------------------------- raw shapes

type Rmse = Record<"win_pct" | "pyth" | "epa_margin" | "control" | "control_ns" | "combined" | "same_pace" | "coin_flip", number>;
interface Eval { n: number; rmse: Rmse; rmse_diff_ci: Record<string, [number, number]> }
interface Result {
  seasons: [number, number];
  k_main: number;
  rest_of_season: Record<string, { loso: Eval; forward: Eval; correlations: { luck_persistence_r: number; luck_persistence_ci: [number, number]; n: number } }>;
  next_season: { loso: Eval };
}
interface Group { n: number; first_win_pct: number; rest_win_pct: number; rest_games: number }
interface PageData {
  k: number;
  team_seasons: number;
  by_record: (Group & { wins: number; losses: number })[];
  starts: Record<"6-2 or better" | "2-6 or worse", Group>;
  luck: { points: [number, string, number, number][]; slope: number };
}
interface Gain { n: number; rmse_without: number; rmse_with: number; diff: number; diff_ci: [number, number]; excludes_zero: boolean }
interface SosCheck { by_k: Record<string, { loso: Gain; forward: Gain }>; reliable_gain: boolean; decided_on: string }
interface Backtest {
  backtest: Record<string, {
    n: number;
    rmse: Record<"baseline" | "point_diff" | "market" | "same_pace" | "coin_flip", number>;
    rmse_diff_ci: Record<"point_diff_minus_baseline" | "market_minus_baseline" | "market_minus_point_diff", [number, number]>;
    highlight_rule: { hit_rate: number; hit_rate_ci: [number, number]; calls: number; expected_rate: number };
  }>;
}
export interface VsTeam {
  team: string; games_played: number; wins: number; losses: number; win_pct: number; pyth: number; point_diff_pg: number;
  remaining_games: number;
  baseline_rest_wins: number; point_diff_rest_wins: number; market_rest_wins: number; same_pace_rest_wins: number;
  gap_wins: number; market_gap_wins: number; p_beats_baseline: number;
  baseline_final_wins: number; point_diff_final_wins: number; market_final_wins: number;
}
interface VsBaseline {
  generated_at: string;
  data_through_week: number;
  excluded_started_games: unknown[];
  highlighted: { point_diff_above_baseline: string[]; point_diff_below_baseline: string[] };
  grading: { rules: string[] };
  teams: VsTeam[];
}
export interface OrigTeam {
  team: string; wins: number; losses: number; win_pct: number; remaining_games: number; pred_rest_wins: number;
  same_pace_rest_wins: number; p_cools_off: number; p_heats_up: number;
}
interface Original { generated_at: string; teams: OrigTeam[] }

export interface Grades {
  graded_at: string;
  status: string;
  final: boolean;
  simulated?: boolean;
  vs_baseline?: {
    rule_1_mae: Record<"baseline" | "point_diff" | "market" | "same_pace" | "coin_flip", number> & { point_diff_beats_baseline: boolean; best: string };
    rule_2_highlighted: { above: Record<string, boolean>; below: Record<string, boolean>; hits: number; of: number; expected: number; chance: number };
    teams: Record<string, { actual_rest_wins: number; baseline_rest_wins: number; point_diff_rest_wins: number; market_rest_wins: number }>;
  };
  original?: {
    rule_1_mae: { model: number; same_pace: number; coin_flip: number; passes: boolean };
    rule_2_calls: { hits: number; of: number };
    rule_3_coverage_80: { share: number };
  };
}

// ----------------------------------------------------------------------------- page shape

export interface KRow { k: number; pace: number; coin: number; record: number; pointDiff: number }
export interface CiRow { k: number; loso: [number, number]; forward: [number, number]; diff: number; diffForward: number }

export interface LuckSkill {
  slug: string;
  firstSeason: number;
  lastSeason: number;
  teamSeasons: number;
  k: number;
  hot: Group;
  cold: Group;
  byRecord: PageData["by_record"];
  kChart: KRow[];
  luck: { points: PageData["luck"]["points"]; r: number; ci: [number, number]; n: number; slope: number };
  edge: {
    record: number; pointDiff: number; market: number; pace: number; coin: number;
    loso: [number, number]; forward: [number, number]; forwardRecord: number; forwardPointDiff: number;
    byK: CiRow[];
    marketVsPointDiff: [number, number];
  };
  sos: { k8: Gain; k7: Gain; reliable: boolean };
  highlightRule: { hitRate: number; ci: [number, number]; calls: number };
  vs: VsBaseline;
  original: Original;
  up: VsTeam[];
  down: VsTeam[];
  grades: Grades | null;
}

const read = <T,>(name: string): T | null => {
  const f = path.join(DIR, name);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : null;
};

export function loadLuckSkill(gradesPath?: string): LuckSkill | null {
  const r = read<Result>("result.json");
  const pd = read<PageData>("page_data.json");
  const sos = read<SosCheck>("sos_check.json");
  const bt = read<Backtest>("baseline_backtest.json");
  const vs = read<VsBaseline>(VS_BASELINE_FILE);
  const original = read<Original>(ORIGINAL_FILE);
  if (!r || !pd || !sos || !bt || !vs || !original) return null;
  const grades = gradesPath
    ? (existsSync(gradesPath) ? (JSON.parse(readFileSync(gradesPath, "utf8")) as Grades) : null)
    : read<Grades>(GRADES_FILE);

  const k = String(r.k_main);
  const main = r.rest_of_season[k];
  const b8 = bt.backtest[k];
  const by = new Map(vs.teams.map((t) => [t.team, t]));

  return {
    slug: SLUG,
    firstSeason: r.seasons[0],
    lastSeason: r.seasons[1],
    teamSeasons: pd.team_seasons,
    k: r.k_main,
    hot: pd.starts["6-2 or better"],
    cold: pd.starts["2-6 or worse"],
    byRecord: pd.by_record,
    kChart: [4, 5, 6, 7, 8, 9].map((kk) => {
      const x = r.rest_of_season[String(kk)].loso.rmse;
      return { k: kk, pace: x.same_pace, coin: x.coin_flip, record: x.win_pct, pointDiff: x.pyth };
    }),
    luck: { points: pd.luck.points, r: main.correlations.luck_persistence_r, ci: main.correlations.luck_persistence_ci, n: main.correlations.n, slope: pd.luck.slope },
    edge: {
      record: main.loso.rmse.win_pct, pointDiff: main.loso.rmse.pyth, market: b8.rmse.market, pace: main.loso.rmse.same_pace, coin: main.loso.rmse.coin_flip,
      loso: main.loso.rmse_diff_ci.pyth_minus_win_pct, forward: main.forward.rmse_diff_ci.pyth_minus_win_pct,
      forwardRecord: main.forward.rmse.win_pct, forwardPointDiff: main.forward.rmse.pyth,
      byK: [4, 5, 6, 7, 8, 9, 10].map((kk) => {
        const x = r.rest_of_season[String(kk)];
        return { k: kk, loso: x.loso.rmse_diff_ci.pyth_minus_win_pct, forward: x.forward.rmse_diff_ci.pyth_minus_win_pct,
          diff: x.loso.rmse.pyth - x.loso.rmse.win_pct, diffForward: x.forward.rmse.pyth - x.forward.rmse.win_pct };
      }),
      marketVsPointDiff: b8.rmse_diff_ci.market_minus_point_diff,
    },
    sos: { k8: sos.by_k["8"].loso, k7: sos.by_k["7"].loso, reliable: sos.reliable_gain },
    highlightRule: { hitRate: b8.highlight_rule.hit_rate, ci: b8.highlight_rule.hit_rate_ci, calls: b8.highlight_rule.calls },
    vs,
    original,
    up: vs.highlighted.point_diff_above_baseline.map((t) => by.get(t)!),
    down: vs.highlighted.point_diff_below_baseline.map((t) => by.get(t)!),
    grades,
  };
}

// ----------------------------------------------------------------------------- formatting

export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
/** ".635" style win%, the way records are usually quoted */
export const wpct = (v: number) => (v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, ""));
export const ci = ([lo, hi]: [number, number], d = 3) => `[${lo >= 0 ? "+" : "−"}${Math.abs(lo).toFixed(d)}, ${hi >= 0 ? "+" : "−"}${Math.abs(hi).toFixed(d)}]`;
export const signed = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
export const record = (w: number, l: number) => {
  const ties = Math.round((w % 1) * 2);
  return ties ? `${Math.floor(w)}-${Math.floor(l)}-${ties}` : `${w}-${l}`;
};

/** "Nov 6, 2026, 00:31 UTC" */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${date}, ${d.toISOString().slice(11, 16)} UTC`;
}
