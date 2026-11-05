/**
 * Win probability through ONNX Runtime, following models/artifacts/wp_onnx_contract.json:
 * input "features" float32 [n, 13]; output probabilities[:, 1] = P(team with the ball wins).
 * Works with onnxruntime-web (browser) and onnxruntime-node (tests): both share this API.
 */
import type { WPContract } from "./models";
import type { PredictWP } from "./types";
import { FEATURE_ORDER } from "./engine";

interface OrtTensor { data: unknown; dims: readonly number[] }
interface OrtSession {
  outputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
type TensorCtor = new (type: "float32", data: Float32Array, dims: readonly number[]) => OrtTensor;

export function onnxPredictor(session: OrtSession, Tensor: TensorCtor, contract: WPContract): PredictWP {
  if (contract.feature_order.join() !== FEATURE_ORDER.join()) {
    throw new Error("wp_onnx_contract.json feature order differs from the engine's");
  }
  const width = contract.input.shape[1];
  // onnxmltools' XGBoost classifier emits [label, probabilities]
  const output = session.outputNames.find((n) => n.includes("prob")) ?? session.outputNames[1];
  return async (features, n) => {
    const result = await session.run({ [contract.input.name]: new Tensor("float32", features, [n, width]) });
    const probs = result[output].data as Float32Array;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = probs[i * 2 + 1];
    return out;
  };
}
