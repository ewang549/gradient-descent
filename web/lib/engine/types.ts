/**
 * Shapes shared by the engine port. Field names mirror the Python engine's inputs, camelCased.
 * All yard lines are yardline_100: yards from the opponent's end zone (1-99).
 */

export type Option = "go" | "punt" | "field_goal";

export interface EngineInput {
  season: number;
  qtr: 1 | 2 | 3 | 4 | number;
  /** offense score minus defense score */
  scoreDiff: number;
  gameSeconds: number;
  halfSeconds: number;
  ydstogo: number;
  yardline100: number;
  goalToGo: boolean;
  posTimeouts: number;
  defTimeouts: number;
  /** +1 offense is home, 0 neutral site, -1 away */
  home: number;
  /** closing spread from the offense's view, + = offense favored */
  spread: number;
  /** 1st half only: does the offense get the 2nd-half kickoff? */
  receives2hKickoff: boolean;
  /** team strength: offense's EPA/play over its last 8 games; null/NaN = unknown (league average path) */
  offEpa: number | null;
  /** defense's EPA/play allowed over its last 8 games */
  defEpa: number | null;
  indoors: boolean;
  turf: boolean;
  /** already resolved: 0 indoors or under an open roof */
  windMph: number;
  tempF: number;
}

export interface EngineOutput {
  wp_now: number;
  p_convert: number;
  wp_if_convert: number;
  wp_if_fail: number;
  wp_go: number;
  punt_receiving_yardline_100: number;
  wp_punt: number;
  fg_distance: number;
  p_fg_make: number;
  wp_if_fg_make: number;
  wp_if_fg_miss: number;
  wp_fg: number;
  recommendation: Option;
}

/** A game state for the WP model, from the side of the team with the ball. */
export interface WPState {
  scoreDiff: number;
  gameSeconds: number;
  halfSeconds: number;
  down: number;
  ydstogo: number;
  yardline100: number;
  posTimeouts: number;
  defTimeouts: number;
  home: number;
  spread: number;
  receives2hKickoff: number;
  /** where the next possession starts after a kickoff (only used if the half runs out) */
  kickoffStart: number;
}

/** Batched win-probability model: n rows x 13 float32 features in the contract's order -> P(win). */
export type PredictWP = (features: Float32Array, n: number) => Promise<Float32Array>;
