/**
 * Finding 1, offense style: reads exports/findings/offense-style (written by
 * `python -m analysis.findings.offense_style`) at build time and shapes it for the page, the cards
 * and the posts. Every number those show comes from here, so copy and charts can't disagree.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXPORTS_DIR } from "@/lib/weekly/data";

export const SLUG = "offense-style";
const DIR = path.join(EXPORTS_DIR, "findings", SLUG);

// ----------------------------------------------------------------------------- raw export shapes

type Feature = "proe" | "early_down_pass" | "adot" | "shotgun" | "no_huddle" | "pace" | "go_when_model_says_go";

interface SeasonDrift {
  season: number;
  teams: number;
  dispersion_index: number;
  [f: string]: number | { mean: number; sd_observed: number; sd_true: number; noise_share: number | null } | number[];
}

interface Trend {
  sd_slope_per_decade: number;
  sd_slope_p: number;
  sd_first5: number;
  sd_last5: number;
  mean_first5?: number;
  mean_last5?: number;
  mean_slope_p?: number;
}

interface Result {
  team_seasons: number;
  seasons: [number, number];
  labels: Record<string, string>;
  clusters_era_removed: {
    style: { k: number; silhouette: number; null: { gaussian: { p95: number }; copula: { p95: number } }; bootstrap_ari_mean: number }[];
    verdict: { passing_k: number[]; k2_vs_pc1_sign_ari: number; pc1_bic_1_component: number; pc1_bic_2_components: number };
  };
  style_map: {
    explained: number[];
    loadings: Record<Feature, number[]>;
    bootstrap: { pc1_congruence: { median: number; p05: number }; pc2_congruence: { median: number; p05: number } };
    eras: Record<"2006-2015" | "2016-2026", { pc1_congruence: number; pc2_congruence: number }>;
    persistence: Record<"pc1" | "pc2", { r: number; ci: [number, number]; pairs: number }>;
    efficiency_r: { epa_dropback: { pc1: number; pc2: number } };
  };
  no_huddle: { count: number; team_seasons: { season: number; team: string; no_huddle: number }[] };
  era_share: { all_style: number; by_feature: Record<Feature, number> };
  drift: { by_season: SeasonDrift[]; trends: Record<Feature | "dispersion_index", Trend> };
}

interface TeamSeasonRow {
  season: number;
  team: string;
  neutral_plays: number;
  proe: number;
  early_down_pass: number;
  adot: number;
  shotgun: number;
  no_huddle: number;
  pace: number;
  go_when_model_says_go: number | null;
  model_go_spots: number | null;
  pc1: number;
  pc2: number;
  no_huddle_z: number;
}

// ----------------------------------------------------------------------------- page shapes

export type Unit = "pct" | "yds" | "sec";

export interface FeatureInfo {
  key: Feature;
  label: string;
  short: string;
  unit: Unit;
  /** plain-language definition for the page */
  def: string;
}

export const FEATURES: Record<Feature, FeatureInfo> = {
  shotgun: { key: "shotgun", label: "Shotgun rate", short: "Shotgun", unit: "pct", def: "share of neutral snaps from shotgun or pistol" },
  go_when_model_says_go: {
    key: "go_when_model_says_go", label: "Go rate when the model says go", short: "4th-down go rate", unit: "pct",
    def: "share of 4th downs where our model's best call was to go for it, and the team went",
  },
  adot: { key: "adot", label: "Average depth of target", short: "Depth of target", unit: "yds", def: "air yards per pass attempt, neutral snaps" },
  early_down_pass: { key: "early_down_pass", label: "Early-down pass rate", short: "Early-down pass rate", unit: "pct", def: "share of 1st and 2nd down neutral snaps that were passes" },
  proe: { key: "proe", label: "Pass rate over expected", short: "Pass rate over expected", unit: "pct", def: "pass rate minus nflverse's expected pass rate for the same down, distance, field position and score" },
  no_huddle: { key: "no_huddle", label: "No-huddle rate", short: "No-huddle", unit: "pct", def: "share of neutral snaps run without a huddle" },
  pace: { key: "pace", label: "Seconds between snaps", short: "Pace", unit: "sec", def: "median seconds from snap to snap after a run, same drive and quarter (lower = faster)" },
};

/** The four on the drift chart, in order. PROE is ~0 every season by construction, so it isn't one. */
export const DRIFT_KEYS: Feature[] = ["shotgun", "go_when_model_says_go", "adot", "early_down_pass"];
/** Every style feature, for the convergence table. */
export const ALL_KEYS: Feature[] = ["shotgun", "go_when_model_says_go", "adot", "early_down_pass", "proe", "no_huddle", "pace"];

export interface DriftSeries {
  info: FeatureInfo;
  points: { season: number; mean: number; sd: number }[];
  eraShare: number;
  /** single-season endpoints: first season and last complete season */
  from: { season: number; mean: number };
  to: { season: number; mean: number };
  /** noise-corrected between-team SD, first 5 vs last 5 complete seasons, and the trend test */
  spread: { first5: number; last5: number; p: number; perDecade: number; significant: boolean };
}

/** [season, teamIndex, pc1, pc2, no_huddle, pace, early_down_pass, shotgun, proe, isNoHuddleOutlier] */
export type MapPoint = [number, number, number, number, number, number, number, number, number, 0 | 1];

export interface OffenseStyle {
  slug: string;
  teamSeasons: number;
  firstSeason: number;
  lastSeason: number;
  /** last season with a full schedule; the current one is partial */
  lastComplete: number;
  partialSeasonTeams: number;
  medianNeutralPlays: number;
  medianGoSpots: number;
  eraShareAll: number;
  drift: DriftSeries[];
  spreadTable: DriftSeries[];
  dispersion: { first5: number; last5: number; p: number };
  map: {
    teams: string[];
    points: MapPoint[];
    /** league average by season for the hover card: season -> [no_huddle, pace, early_down_pass, shotgun, proe] */
    league: Record<number, [number, number, number, number, number]>;
    explained: [number, number];
    loadings: { key: Feature; label: string; pc1: number; pc2: number }[];
    labeled: { season: number; team: string; pos: LabelPos }[];
    noHuddleCount: number;
  };
  robustness: {
    pc1Boot: { median: number; p05: number };
    pc2Boot: { median: number; p05: number };
    eraFits: { label: string; pc1: number; pc2: number }[];
    persistence: { pc1: number; pc2: number; pairs: number };
    clusters: { k: number; silhouette: number; nullP95: number; ari: number }[];
    passingK: number[];
    k2VsPc1Ari: number;
    pc1OnePeak: boolean;
    pc1EpaDropbackR: number;
  };
  callouts: { season: number; team: string; noHuddle: number }[];
}

const SIGNIFICANT = 0.05;
export type LabelPos = "right" | "above" | "below";
/** Named tempo outliers on the map, with where the label goes so the top-right cluster stays legible. */
const LABELED: { season: number; team: string; pos: LabelPos }[] = [
  { season: 2024, team: "WAS", pos: "above" }, { season: 2025, team: "WAS", pos: "right" },
  { season: 2010, team: "IND", pos: "below" }, { season: 2016, team: "SF", pos: "right" },
];

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function loadOffenseStyle(): OffenseStyle | null {
  const rf = path.join(DIR, "result.json");
  const tf = path.join(DIR, "team_seasons.json");
  if (!existsSync(rf) || !existsSync(tf)) return null;
  const r: Result = JSON.parse(readFileSync(rf, "utf8"));
  const rows: TeamSeasonRow[] = JSON.parse(readFileSync(tf, "utf8"));
  const bySeason = r.drift.by_season;
  const [firstSeason, lastSeason] = r.seasons;
  const partial = bySeason.at(-1)!;
  const lastComplete = lastSeason - 1;

  const stat = (s: SeasonDrift, f: Feature) => s[f] as { mean: number; sd_true: number };
  const series = (f: Feature): DriftSeries => {
    const t = r.drift.trends[f];
    const first = bySeason[0];
    const last = bySeason.find((s) => s.season === lastComplete)!;
    return {
      info: FEATURES[f],
      points: bySeason.map((s) => ({ season: s.season, mean: stat(s, f).mean, sd: stat(s, f).sd_true })),
      eraShare: r.era_share.by_feature[f],
      from: { season: first.season, mean: stat(first, f).mean },
      to: { season: last.season, mean: stat(last, f).mean },
      spread: { first5: t.sd_first5, last5: t.sd_last5, p: t.sd_slope_p, perDecade: t.sd_slope_per_decade, significant: t.sd_slope_p < SIGNIFICANT },
    };
  };

  const teams = [...new Set(rows.map((x) => x.team))].sort();
  const ti = new Map(teams.map((t, i) => [t, i]));
  const points: MapPoint[] = rows.map((x) => [
    x.season, ti.get(x.team)!, r3(x.pc1), r3(x.pc2), r3(x.no_huddle), x.pace, r3(x.early_down_pass), r3(x.shotgun), r3(x.proe),
    x.no_huddle_z >= 2 ? 1 : 0,
  ]);
  const league = Object.fromEntries(bySeason.map((s) => [s.season,
    [r3(stat(s, "no_huddle").mean), Math.round(stat(s, "pace").mean * 10) / 10, r3(stat(s, "early_down_pass").mean), r3(stat(s, "shotgun").mean), r3(stat(s, "proe").mean)] as [number, number, number, number, number]]));
  const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const complete = rows.filter((x) => x.season <= lastComplete);
  const sm = r.style_map;
  const cl = r.clusters_era_removed;

  return {
    slug: SLUG,
    teamSeasons: r.team_seasons,
    firstSeason,
    lastSeason,
    lastComplete,
    partialSeasonTeams: partial.teams,
    medianNeutralPlays: median(complete.map((x) => x.neutral_plays)),
    medianGoSpots: median(complete.map((x) => x.model_go_spots ?? 0)),
    eraShareAll: r.era_share.all_style,
    drift: DRIFT_KEYS.map(series),
    spreadTable: ALL_KEYS.map(series),
    dispersion: { first5: r.drift.trends.dispersion_index.sd_first5, last5: r.drift.trends.dispersion_index.sd_last5, p: r.drift.trends.dispersion_index.sd_slope_p },
    map: {
      teams,
      points,
      league,
      explained: [sm.explained[0], sm.explained[1]],
      loadings: (Object.keys(sm.loadings) as Feature[]).map((k) => ({ key: k, label: FEATURES[k].short, pc1: sm.loadings[k][0], pc2: sm.loadings[k][1] })),
      labeled: LABELED.filter((l) => rows.some((x) => x.season === l.season && x.team === l.team)),
      noHuddleCount: r.no_huddle.count,
    },
    robustness: {
      pc1Boot: sm.bootstrap.pc1_congruence,
      pc2Boot: sm.bootstrap.pc2_congruence,
      eraFits: (["2006-2015", "2016-2026"] as const).map((k) => ({ label: k, pc1: sm.eras[k].pc1_congruence, pc2: sm.eras[k].pc2_congruence })),
      persistence: { pc1: sm.persistence.pc1.r, pc2: sm.persistence.pc2.r, pairs: sm.persistence.pc1.pairs },
      clusters: cl.style.map((c) => ({ k: c.k, silhouette: c.silhouette, nullP95: Math.max(c.null.gaussian.p95, c.null.copula.p95), ari: c.bootstrap_ari_mean })),
      passingK: cl.verdict.passing_k,
      k2VsPc1Ari: cl.verdict.k2_vs_pc1_sign_ari,
      pc1OnePeak: cl.verdict.pc1_bic_1_component < cl.verdict.pc1_bic_2_components,
      pc1EpaDropbackR: sm.efficiency_r.epa_dropback.pc1,
    },
    callouts: r.no_huddle.team_seasons.map((t) => ({ season: t.season, team: t.team, noHuddle: t.no_huddle })),
  };
}

// ----------------------------------------------------------------------------- formatting

export function fmt(v: number, unit: Unit, digits?: number): string {
  if (unit === "pct") return `${(v * 100).toFixed(digits ?? 0)}%`;
  if (unit === "yds") return `${v.toFixed(digits ?? 1)} yds`;
  return `${v.toFixed(digits ?? 1)}s`;
}

/** A between-team SD in the feature's units: percentage points for rates. */
export function fmtSpread(v: number, unit: Unit): string {
  if (unit === "pct") return `${(v * 100).toFixed(1)} pts`;
  if (unit === "yds") return `${v.toFixed(2)} yds`;
  return `${v.toFixed(2)}s`;
}

export const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`);
