"use client";
/**
 * Evaluates situations as inputs change. The models (JSON + wp.onnx through onnxruntime-web) load
 * and run in a Web Worker (engine.worker.ts), so the page stays responsive while the WASM compiles.
 * Only the latest request's result is kept, so dragging the ball never shows a stale answer.
 */
import { useEffect, useRef, useState } from "react";
import type { EngineInput, EngineOutput } from "@/lib/engine/types";

type Reply = { id: number; out?: EngineOutput; error?: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (r: Reply) => void>();

function engineWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Reply>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

function evaluate(input: EngineInput): Promise<EngineOutput> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => (r.out ? resolve(r.out) : reject(new Error(r.error ?? "engine failed"))));
    engineWorker().postMessage({ id, input });
  });
}

export function useEngine(input: EngineInput) {
  const [result, setResult] = useState<EngineOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const key = JSON.stringify(input);

  useEffect(() => {
    const id = ++latest.current;
    evaluate(JSON.parse(key))
      .then((out) => {
        if (id === latest.current) setResult(out);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [key]);

  return { result, error };
}
