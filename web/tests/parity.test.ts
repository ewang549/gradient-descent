/**
 * Parity: the TypeScript engine vs the Python engine on real 4th downs.
 *
 * tests/fixtures/parity.json is written by `python -m models.export_web`: 500 random regulation
 * 4th downs plus 100 from the last two minutes of a half (where the kneel-out and clock-expiry
 * rules fire), each with every engine input and every Python output. Every number must match to
 * 1e-4, and every recommendation must match exactly, except where the Python engine's own margin
 * is below the tolerance (a tie the two runtimes could legitimately break differently).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { beforeAll, describe, expect, it } from "vitest";
import { evaluateOptions } from "@/lib/engine/engine";
import { loadModels, type Models } from "@/lib/engine/models";
import type { EngineInput, EngineOutput, PredictWP } from "@/lib/engine/types";
import { onnxPredictor } from "@/lib/engine/wpOnnx";

const MODELS_DIR = path.join(__dirname, "..", "public", "models");
type Case = { play_uid: string; input: EngineInput; expected: Omit<EngineOutput, "recommendation"> & { recommendation: string } };
type Fixture = { seed: number; tolerance: number; cases: Record<string, Case[]> };

let models: Models;
let predict: PredictWP;
let fixture: Fixture;

beforeAll(async () => {
  models = await loadModels(async (f) => JSON.parse(await readFile(path.join(MODELS_DIR, f), "utf8")));
  const session = await ort.InferenceSession.create(path.join(MODELS_DIR, "wp.onnx"));
  predict = onnxPredictor(session, ort.Tensor, models.contract);
  fixture = JSON.parse(await readFile(path.join(__dirname, "fixtures", "parity.json"), "utf8"));
});

const NUMERIC: (keyof Omit<EngineOutput, "recommendation">)[] = [
  "wp_now", "p_convert", "wp_if_convert", "wp_if_fail", "wp_go", "punt_receiving_yardline_100", "wp_punt",
  "fg_distance", "p_fg_make", "wp_if_fg_make", "wp_if_fg_miss", "wp_fg",
];

describe.each(["random", "late_half"])("TS engine matches Python on %s 4th downs", (set) => {
  it("every output within tolerance", async () => {
    const cases = fixture.cases[set];
    expect(cases.length).toBeGreaterThan(0);
    const out = await evaluateOptions(cases.map((c) => c.input), models, predict);
    let worst = { diff: 0, field: "", play: "" };
    let tieBreaks = 0;
    cases.forEach((c, i) => {
      for (const field of NUMERIC) {
        const diff = Math.abs(out[i][field] - c.expected[field]);
        if (diff > worst.diff) worst = { diff, field, play: c.play_uid };
      }
      if (out[i].recommendation !== c.expected.recommendation) {
        const wps = [c.expected.wp_go, c.expected.wp_punt, c.expected.wp_fg].sort((a, b) => b - a);
        expect(wps[0] - wps[1], `${c.play_uid}: recommendation differs on a non-tie`).toBeLessThan(fixture.tolerance);
        tieBreaks++;
      }
    });
    console.log(`${set}: ${cases.length} plays, max |diff| ${worst.diff.toExponential(2)} (${worst.field}, ` +
      `${worst.play}), ${tieBreaks} tie-breaks`);
    expect(worst.diff).toBeLessThan(fixture.tolerance);
  });
});

describe("presets reproduce the famous-4th-downs table", () => {
  it("matches the Python engine's WPs", async () => {
    const presets = JSON.parse(await readFile(path.join(MODELS_DIR, "presets.json"), "utf8")) as
      { id: string; input: EngineInput; expected: { wp_go: number; wp_punt: number; wp_fg: number } }[];
    const out = await evaluateOptions(presets.map((p) => p.input), models, predict);
    presets.forEach((p, i) => {
      expect(Math.abs(out[i].wp_go - p.expected.wp_go), p.id).toBeLessThan(1e-4);
      expect(Math.abs(out[i].wp_punt - p.expected.wp_punt), p.id).toBeLessThan(1e-4);
      expect(Math.abs(out[i].wp_fg - p.expected.wp_fg), p.id).toBeLessThan(1e-4);
    });
  });
});
