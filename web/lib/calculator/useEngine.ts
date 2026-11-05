"use client";
/**
 * Loads the models (JSON + wp.onnx through onnxruntime-web) once, then evaluates situations as
 * inputs change. Only the latest request's result is kept, so dragging the ball never shows a
 * stale answer.
 */
import { useEffect, useRef, useState } from "react";
import { evaluateOptions } from "@/lib/engine/engine";
import { loadModels, type Models } from "@/lib/engine/models";
import type { EngineInput, EngineOutput, PredictWP } from "@/lib/engine/types";
import { onnxPredictor } from "@/lib/engine/wpOnnx";

interface Loaded { models: Models; predict: PredictWP }

let loading: Promise<Loaded> | null = null;

function loadEngine(): Promise<Loaded> {
  loading ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    // self-hosted WASM (copied by scripts/copy-ort.mjs); one thread = no cross-origin isolation needed
    ort.env.wasm.wasmPaths = { wasm: "/ort/ort-wasm-simd-threaded.wasm" };
    ort.env.wasm.numThreads = 1;
    const [models, session] = await Promise.all([
      loadModels(async (f) => (await fetch(`/models/${f}`)).json()),
      ort.InferenceSession.create("/models/wp.onnx", { executionProviders: ["wasm"] }),
    ]);
    return { models, predict: onnxPredictor(session, ort.Tensor, models.contract) };
  })();
  return loading;
}

export function useEngine(input: EngineInput) {
  const [result, setResult] = useState<EngineOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const key = JSON.stringify(input);

  useEffect(() => {
    const id = ++latest.current;
    loadEngine()
      .then(({ models, predict }) => evaluateOptions([JSON.parse(key)], models, predict))
      .then(([out]) => {
        if (id === latest.current) setResult(out);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [key]);

  return { result, error };
}
