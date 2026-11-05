/**
 * The JSON files `python -m models.export_web` writes to public/models/, and their loader.
 */

/** Compact tree: leaf = [value]; split = [featureIndex, threshold, yesSubtree, noSubtree]. */
export type TreeNode = [number] | [number, number, TreeNode, TreeNode];

export interface ConversionModel {
  features: string[];
  base_score: number;
  trees: TreeNode[];
  platt: { a: number; b: number };
}

export interface LogisticModel {
  expander: "quadratic" | "linear";
  columns: string[];
  mean: number[];
  scale: number[];
  coef: number[];
  intercept: number;
}

export interface FieldGoalModel {
  observed: LogisticModel;
  unselected: LogisticModel;
  weights: { outdoors: number[]; indoors: number[] };
  taper_from: number;
  taper_zero: number;
  max_season: number;
  max_lookup_distance: number;
  logit_clip: number;
}

export interface EngineParams {
  punt_receiving_yardline_100: Record<string, number>;
  kickoff_start: Record<string, number>;
  kickoff_start_fallback: number;
  runoff: Record<"fg_made" | "fg_missed" | "go_converted" | "go_failed" | "punt",
    { other: number; final_two_minutes: number }>;
  conversion_gain: Record<string, number>;
  constants: { fg_snap_to_kick: number; missed_fg_spot_back: number; touchdown_points: number; late_half_seconds: number };
}

export interface WPContract {
  input: { name: string; dtype: string; shape: [null, number] };
  feature_order: string[];
}

export interface Models {
  conversion: ConversionModel;
  fieldGoal: FieldGoalModel;
  params: EngineParams;
  contract: WPContract;
}

/** Load every JSON model through a fetch-like function (browser fetch, or fs in tests). */
export async function loadModels(read: (file: string) => Promise<unknown>): Promise<Models> {
  const [conversion, fieldGoal, params, contract] = await Promise.all([
    read("conversion.json"), read("field_goal.json"), read("engine.json"), read("wp_onnx_contract.json"),
  ]);
  return {
    conversion: conversion as ConversionModel,
    fieldGoal: fieldGoal as FieldGoalModel,
    params: params as EngineParams,
    contract: contract as WPContract,
  };
}
