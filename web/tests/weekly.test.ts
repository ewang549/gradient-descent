/**
 * The weekly content, checked against itself:
 *  - every calculator link on a card, the weekly page or a post opens the calculator on the same
 *    situation the export graded: same engine output to 1e-4 (the parity tolerance)
 *  - every draft post passes the post rules (length by X's counting, no dashes, hashtags, hype)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { beforeAll, describe, expect, it } from "vitest";
import { parseQuery, toEngineInput } from "@/lib/calculator/state";
import { evaluateOptions } from "@/lib/engine/engine";
import { loadModels, type Models } from "@/lib/engine/models";
import type { PredictWP } from "@/lib/engine/types";
import { onnxPredictor } from "@/lib/engine/wpOnnx";
import { allWeeks, loadWeek } from "@/lib/weekly/data";
import { calcPath } from "@/lib/weekly/format";
import { checkPost, gutsiestPost, leaderboardPost, top3Post, worstCallPost, worstCallThread } from "@/lib/weekly/posts";
import type { Call, WeekExport } from "@/lib/weekly/types";

const MODELS_DIR = path.join(__dirname, "..", "public", "models");
const weeks: WeekExport[] = allWeeks().map(({ season, week }) => loadWeek(season, week)!);

let models: Models;
let predict: PredictWP;

beforeAll(async () => {
  models = await loadModels(async (f) => JSON.parse(await readFile(path.join(MODELS_DIR, f), "utf8")));
  const session = await ort.InferenceSession.create(path.join(MODELS_DIR, "wp.onnx"));
  predict = onnxPredictor(session, ort.Tensor, models.contract);
});

it("has weekly exports to check", () => {
  expect(weeks.length).toBeGreaterThan(0);
});

describe.each(weeks.map((w) => [`${w.season} week ${w.week}`, w] as const))("%s", (_, w) => {
  it("calculator links reproduce every exported call", async () => {
    const calls: Call[] = [...w.worst, ...w.best, ...(w.gutsiest ? [w.gutsiest] : [])];
    const inputs = calls.map((c) => toEngineInput(parseQuery(new URLSearchParams(calcPath(c).split("?")[1]))));
    const out = await evaluateOptions(inputs, models, predict);
    calls.forEach((c, i) => {
      for (const k of ["wp_go", "wp_punt", "wp_fg"] as const) {
        expect(Math.abs(out[i][k] - c[k]), `${c.play_uid} ${k}`).toBeLessThan(1e-4);
      }
    });
  });

  it("every draft post passes the post rules", () => {
    const posts = [worstCallPost(w), top3Post(w), leaderboardPost(w), gutsiestPost(w)]
      .filter((p) => p !== null).map((p) => p.text);
    for (const text of [...posts, ...worstCallThread(w)]) expect(checkPost(text), text).toEqual([]);
  });
});

describe("post rules", () => {
  it("counts links as 23 characters and flags each rule", () => {
    expect(checkPost(`${"a".repeat(256)} https://example.com/${"x".repeat(200)}`)).toEqual([]);
    expect(checkPost("a".repeat(281))).toHaveLength(1);
    expect(checkPost("Go for it — now")).toContain("contains an em or en dash");
    expect(checkPost("Big call #NFL")).toContain("contains a hashtag");
    expect(checkPost("A massive mistake")).toContain('hype word: "massive"');
    expect(checkPost("4th & 5 at MIN 33")).toEqual([]);
  });
});
