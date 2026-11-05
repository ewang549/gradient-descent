/**
 * The calculator's engine on the server (Node runtime): same model files and the same
 * onnxruntime-web WASM build the browser uses, so an OG image shows exactly the numbers the
 * page will compute. Loaded once per server instance.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateOptions } from "@/lib/engine/engine";
import { loadModels, type Models } from "@/lib/engine/models";
import type { EngineInput, EngineOutput, PredictWP } from "@/lib/engine/types";
import { onnxPredictor } from "@/lib/engine/wpOnnx";

const MODELS_DIR = path.join(process.cwd(), "public", "models");
const ORT_WASM = path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist", "ort-wasm-simd-threaded.wasm");

let loading: Promise<{ models: Models; predict: PredictWP }> | null = null;

function load() {
  loading ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmBinary = await readFile(ORT_WASM);
    const [models, session] = await Promise.all([
      loadModels(async (f) => JSON.parse(await readFile(path.join(MODELS_DIR, f), "utf8"))),
      readFile(path.join(MODELS_DIR, "wp.onnx")).then((buf) =>
        ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ["wasm"] })),
    ]);
    return { models, predict: onnxPredictor(session, ort.Tensor, models.contract) };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

export async function evaluateOnServer(input: EngineInput): Promise<EngineOutput> {
  const { models, predict } = await load();
  return (await evaluateOptions([input], models, predict))[0];
}
