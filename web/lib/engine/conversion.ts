/**
 * P(convert | go for it): models/conversion.py. XGBoost (depth-3 trees) + Platt calibration.
 *
 * XGBoost compares float32 feature values against float32 thresholds, so both are rounded with
 * Math.fround. Missing values (NaN) go down the "no" branch, which is also where `NaN < t` sends them.
 */
import type { ConversionModel, TreeNode } from "./models";
import type { EngineInput } from "./types";

function leafValue(node: TreeNode, x: number[]): number {
  let n = node;
  while (n.length === 4) {
    const [feature, threshold, yes, no] = n;
    n = Math.fround(x[feature]) < Math.fround(threshold) ? yes : no;
  }
  return n[0];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function conversionFeatures(input: EngineInput): number[] {
  // order = conversion.json "features": ydstogo, yardline_100, off EPA, def EPA, indoors, turf
  return [
    input.ydstogo,
    input.yardline100,
    input.offEpa ?? Number.NaN,
    input.defEpa ?? Number.NaN,
    input.indoors ? 1 : 0,
    input.turf ? 1 : 0,
  ];
}

export function predictConversion(model: ConversionModel, input: EngineInput): number {
  const x = conversionFeatures(input);
  const base = model.base_score;
  let margin = Math.log(base / (1 - base));
  for (const tree of model.trees) margin += leafValue(tree, x);
  const raw = Math.fround(sigmoid(margin)); // XGBoost's predict_proba is float32
  // sklearn _SigmoidCalibration: 1 / (1 + exp(a * p + b))
  return 1 / (1 + Math.exp(model.platt.a * raw + model.platt.b));
}
