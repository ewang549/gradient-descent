/**
 * The 4th-down decision engine, ported from models/decision_engine.py (keep the two in step; the
 * parity test in tests/parity.test.ts checks this file against the Python engine on real plays).
 *
 *   WP(go)   = p_convert * WP(first down)       + (1 - p_convert) * WP(turnover on downs)
 *   WP(punt) = WP(opponent's ball where punts from here typically leave them)
 *   WP(fg)   = p_make    * WP(+3, then kick off) + (1 - p_make)    * WP(opponent's ball at the kick spot)
 *
 * Every "after" state is scored by the same WP model from the side of whoever has the ball, then
 * two football rules override it: kneel-outs and the half running out (see applyFootballRules).
 */
import { predictConversion } from "./conversion";
import { predictFieldGoal } from "./fieldGoal";
import type { EngineParams, Models } from "./models";
import type { EngineInput, EngineOutput, Option, PredictWP, WPState } from "./types";

type Outcome = keyof EngineParams["runoff"];

// ------------------------------------------------------------------------------- game states

function runoff(p: EngineParams, input: EngineInput, outcome: Outcome): number {
  const late = input.halfSeconds <= p.constants.late_half_seconds;
  return late ? p.runoff[outcome].final_two_minutes : p.runoff[outcome].other;
}

/** Run the clock forward; a state that reaches 0 is resolved by the clock-expiry rule. */
function clock(input: EngineInput, seconds: number) {
  const halfLeft = Math.max(input.halfSeconds - seconds, 0);
  const used = input.halfSeconds - halfLeft;
  return { halfSeconds: halfLeft, gameSeconds: input.gameSeconds - used };
}

function currentState(input: EngineInput, kickoffStart: number): WPState {
  return {
    scoreDiff: input.scoreDiff,
    gameSeconds: input.gameSeconds,
    halfSeconds: input.halfSeconds,
    down: 4,
    ydstogo: input.ydstogo,
    yardline100: input.yardline100,
    posTimeouts: input.posTimeouts,
    defTimeouts: input.defTimeouts,
    home: input.home,
    spread: input.spread,
    receives2hKickoff: input.receives2hKickoff ? 1 : 0,
    kickoffStart,
  };
}

/** 1st down for the same team (after a conversion). */
function offenseKeepsBall(input: EngineInput, kickoffStart: number, yardline: number, seconds: number): WPState {
  return {
    ...currentState(input, kickoffStart),
    ...clock(input, seconds),
    down: 1,
    yardline100: yardline,
    ydstogo: Math.min(10, yardline), // inside the 10 it's 1st & goal
  };
}

/** 1st down for the other team, described from ITS side of the ball. */
function opponentGetsBall(input: EngineInput, kickoffStart: number, offensePoints: number, oppYardline: number,
  seconds: number): WPState {
  return {
    ...clock(input, seconds),
    scoreDiff: -(input.scoreDiff + offensePoints),
    down: 1,
    yardline100: oppYardline,
    ydstogo: Math.min(10, oppYardline),
    posTimeouts: input.defTimeouts,
    defTimeouts: input.posTimeouts,
    home: -input.home,
    spread: -input.spread,
    // in the first half exactly one team gets the 2nd-half kickoff
    receives2hKickoff: input.qtr <= 2 && !input.receives2hKickoff ? 1 : 0,
    kickoffStart,
  };
}

// ------------------------------------------------------------------------------- WP features

/** The 13 features in wp_onnx_contract.json's order, including the two derived ones. */
function writeFeatures(s: WPState, out: Float32Array, offset: number): void {
  const elapsedShare = (3600 - s.gameSeconds) / 3600;
  out[offset + 0] = s.scoreDiff;
  out[offset + 1] = s.scoreDiff / Math.sqrt(s.gameSeconds + 1); // score_diff_per_sqrt_sec
  out[offset + 2] = s.gameSeconds;
  out[offset + 3] = s.halfSeconds;
  out[offset + 4] = s.down;
  out[offset + 5] = s.ydstogo;
  out[offset + 6] = s.yardline100;
  out[offset + 7] = s.posTimeouts;
  out[offset + 8] = s.defTimeouts;
  out[offset + 9] = s.home;
  out[offset + 10] = s.spread;
  out[offset + 11] = s.spread * Math.exp(-4 * elapsedShare); // spread_time
  out[offset + 12] = s.receives2hKickoff;
}

export const FEATURE_ORDER = [
  "score_differential", "score_diff_per_sqrt_sec", "game_seconds_remaining", "half_seconds_remaining", "down",
  "ydstogo", "yardline_100", "posteam_timeouts_remaining", "defteam_timeouts_remaining", "home",
  "posteam_spread_line", "spread_time", "is_receiving_2h_kickoff",
];

async function predictStates(predict: PredictWP, states: WPState[]): Promise<Float32Array> {
  const x = new Float32Array(states.length * FEATURE_ORDER.length);
  states.forEach((s, i) => writeFeatures(s, x, i * FEATURE_ORDER.length));
  return predict(x, states.length);
}

// ---------------------------------------------------------------------------- football rules

/** A team leading with a fresh set of downs kneels out the game if the opponent can't stop the clock. */
export function kneelOut(s: WPState): boolean {
  if (s.down !== 1 || s.scoreDiff <= 0) return false;
  const t = s.gameSeconds;
  return (t < 120 && s.defTimeouts === 0) || (t < 80 && s.defTimeouts === 1) || (t < 40 && s.defTimeouts === 2);
}

/** The 2nd-half kickoff state (timeouts reset), from the receiving team's side. */
function secondHalfKickoff(s: WPState): WPState {
  const flip = s.receives2hKickoff === 1 ? 1 : -1;
  return {
    scoreDiff: s.scoreDiff * flip, gameSeconds: 1800, halfSeconds: 1800, down: 1, ydstogo: 10,
    yardline100: s.kickoffStart, posTimeouts: 3, defTimeouts: 3, home: s.home * flip, spread: s.spread * flip,
    receives2hKickoff: 0, kickoffStart: s.kickoffStart,
  };
}

async function applyFootballRules(predict: PredictWP, states: WPState[], raw: Float32Array): Promise<number[]> {
  const probs = Array.from(raw, (p, i) => (kneelOut(states[i]) ? 1 : p));
  const expired = states.map((s, i) => [s, i] as const).filter(([s]) => s.halfSeconds <= 0);
  const halftime = expired.filter(([s]) => s.gameSeconds > 0);
  if (halftime.length) {
    const p = await predictStates(predict, halftime.map(([s]) => secondHalfKickoff(s)));
    halftime.forEach(([s, i], j) => {
      probs[i] = s.receives2hKickoff === 1 ? p[j] : 1 - p[j];
    });
  }
  for (const [s, i] of expired) {
    if (s.gameSeconds <= 0) probs[i] = s.scoreDiff > 0 ? 1 : s.scoreDiff < 0 ? 0 : 0.5; // OT = coin flip
  }
  return probs;
}

// --------------------------------------------------------------------------------- the engine

const STATE_NAMES = ["now", "convert", "convert_td", "fail", "punt", "fg_make", "fg_miss"] as const;

export function kickoffStart(params: EngineParams, season: number): number {
  return params.kickoff_start[String(season)] ?? params.kickoff_start_fallback;
}

export function recommend(wpGo: number, wpPunt: number, wpFg: number): Option {
  // first maximum wins, in this order (numpy argmax over [go, punt, fg])
  if (wpGo >= wpPunt && wpGo >= wpFg) return "go";
  return wpPunt >= wpFg ? "punt" : "field_goal";
}

export async function evaluateOptions(inputs: EngineInput[], models: Models, predict: PredictWP): Promise<EngineOutput[]> {
  const p = models.params;
  const c = p.constants;
  const states: WPState[] = [];
  const meta = inputs.map((input) => {
    const yl = input.yardline100;
    const kick = kickoffStart(p, input.season);
    // go: average gain on a conversion (at least the line to gain); goal-to-go conversions are TDs
    const gain = Math.max(input.ydstogo, p.conversion_gain[String(Math.min(input.ydstogo, 10))]);
    const newYl = yl - gain;
    const touchdown = input.goalToGo || newYl <= 0;
    const puntSpot = p.punt_receiving_yardline_100[String(yl)];
    const byName: Record<(typeof STATE_NAMES)[number], WPState> = {
      now: currentState(input, kick),
      convert: offenseKeepsBall(input, kick, Math.max(newYl, 1), runoff(p, input, "go_converted")),
      convert_td: opponentGetsBall(input, kick, c.touchdown_points, kick, runoff(p, input, "fg_made")),
      fail: opponentGetsBall(input, kick, 0, 100 - yl, runoff(p, input, "go_failed")),
      punt: opponentGetsBall(input, kick, 0, puntSpot, runoff(p, input, "punt")),
      fg_make: opponentGetsBall(input, kick, 3, kick, runoff(p, input, "fg_made")),
      fg_miss: opponentGetsBall(input, kick, 0, Math.min(80, 100 - (yl + c.missed_fg_spot_back)), runoff(p, input, "fg_missed")),
    };
    const start = states.length;
    for (const name of STATE_NAMES) states.push(byName[name]);
    return { start, touchdown, puntSpot };
  });

  // one batched WP call for every state of every play, then the football-rule overrides
  const probs = await applyFootballRules(predict, states, await predictStates(predict, states));

  return inputs.map((input, k) => {
    const { start, touchdown, puntSpot } = meta[k];
    const wp = Object.fromEntries(STATE_NAMES.map((n, j) => [n, probs[start + j]])) as Record<(typeof STATE_NAMES)[number], number>;
    const pConvert = predictConversion(models.conversion, input);
    const fgDistance = input.yardline100 + c.fg_snap_to_kick;
    const pMake = predictFieldGoal(models.fieldGoal, {
      kickDistance: fgDistance, indoors: input.indoors, turf: input.turf, windMph: input.windMph,
      tempF: input.tempF, season: input.season,
    });
    const wpIfConvert = touchdown ? 1 - wp.convert_td : wp.convert;
    const wpIfFail = 1 - wp.fail;
    const wpIfFgMake = 1 - wp.fg_make;
    const wpIfFgMiss = 1 - wp.fg_miss;
    const wpGo = pConvert * wpIfConvert + (1 - pConvert) * wpIfFail;
    const wpPunt = 1 - wp.punt;
    const wpFg = pMake * wpIfFgMake + (1 - pMake) * wpIfFgMiss;
    return {
      wp_now: wp.now,
      p_convert: pConvert,
      wp_if_convert: wpIfConvert,
      wp_if_fail: wpIfFail,
      wp_go: wpGo,
      punt_receiving_yardline_100: puntSpot,
      wp_punt: wpPunt,
      fg_distance: fgDistance,
      p_fg_make: pMake,
      wp_if_fg_make: wpIfFgMake,
      wp_if_fg_miss: wpIfFgMiss,
      wp_fg: wpFg,
      recommendation: recommend(wpGo, wpPunt, wpFg),
    };
  });
}
