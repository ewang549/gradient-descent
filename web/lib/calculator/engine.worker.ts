/**
 * The calculator's engine, off the main thread. Compiling onnxruntime's WASM, creating the session
 * and evaluating a situation each take a few hundred ms on a mid-range phone; here they never block
 * a tap or a drag. Messages: { id, input } in, { id, out } or { id, error } back.
 */
import { evaluateOptions } from "@/lib/engine/engine";
import { loadModels, type Models } from "@/lib/engine/models";
import type { EngineInput, PredictWP } from "@/lib/engine/types";
import { onnxPredictor } from "@/lib/engine/wpOnnx";

interface Loaded { models: Models; predict: PredictWP }

let loading: Promise<Loaded> | null = null;

function loadEngine(): Promise<Loaded> {
  loading ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    // self-hosted WASM (copied by scripts/copy-ort.mjs); one thread keeps memory use and startup low
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

// start loading as soon as the worker exists, before the first situation arrives
loadEngine().catch(() => {});

self.onmessage = async (e: MessageEvent<{ id: number; input: EngineInput }>) => {
  const { id, input } = e.data;
  try {
    const { models, predict } = await loadEngine();
    const [out] = await evaluateOptions([input], models, predict);
    self.postMessage({ id, out });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
