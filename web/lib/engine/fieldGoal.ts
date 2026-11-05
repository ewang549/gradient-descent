/**
 * P(make a field goal): models/field_goal.py. Logistic regression on distance and conditions,
 * plus the long-kick selection correction (blend toward the unselected-range curve, then a taper
 * to 0% one yard past the longest make in the data).
 */
import type { FieldGoalModel, LogisticModel } from "./models";

export interface KickConditions {
  kickDistance: number;
  indoors: boolean;
  turf: boolean;
  windMph: number;
  tempF: number;
  season: number;
}

function terms(model: LogisticModel, k: KickConditions): number[] {
  const d = k.kickDistance;
  const shared = [k.indoors ? 1 : 0, k.turf ? 1 : 0, k.windMph, k.tempF, d * k.windMph];
  const t = model.expander === "quadratic" ? [d, d * d, ...shared] : [d, ...shared];
  if (model.columns.includes("season")) t.push(k.season);
  return t;
}

function logistic(model: LogisticModel, k: KickConditions): number {
  const x = terms(model, k);
  let z = model.intercept;
  for (let i = 0; i < x.length; i++) z += model.coef[i] * ((x[i] - model.mean[i]) / model.scale[i]);
  return 1 / (1 + Math.exp(-z));
}

function logit(p: number, clip: number): number {
  const q = Math.min(Math.max(p, clip), 1 - clip);
  return Math.log(q / (1 - q));
}

/** Model probability with the selection blend, before the taper. */
function corrected(model: FieldGoalModel, k: KickConditions): number {
  const pObs = logistic(model.observed, k);
  const d = Math.min(Math.max(Math.trunc(k.kickDistance), 0), model.max_lookup_distance);
  const w = (k.indoors ? model.weights.indoors : model.weights.outdoors)[d];
  const pUn = logistic(model.unselected, k);
  const blended = 1 / (1 + Math.exp(-(w * logit(pObs, model.logit_clip) + (1 - w) * logit(pUn, model.logit_clip))));
  return Math.min(pObs, blended);
}

export function predictFieldGoal(model: FieldGoalModel, conditions: KickConditions): number {
  // the era trend is trusted only up to the last evaluated season, never extrapolated
  const k = { ...conditions, season: Math.min(conditions.season, model.max_season) };
  const p = corrected(model, k);
  const lo = model.taper_from;
  const hi = model.taper_zero;
  if (k.kickDistance <= lo) return p;
  const anchor = corrected(model, { ...k, kickDistance: lo });
  const share = Math.min(Math.max((hi - k.kickDistance) / (hi - lo), 0), 1);
  return Math.min(p, anchor * share);
}
