/**
 * Link preview for a calculator URL: /og/calculator?<the calculator's own query string>.
 * Runs the same engine as the page (onnxruntime-web WASM, server-side), so the preview shows the
 * numbers the page will show. Deterministic per query, so the CDN caches it for a day.
 */
import { CalculatorCard } from "@/lib/cards/cards";
import { cardResponse } from "@/lib/cards/render";
import { normalize, parseQuery, toEngineInput } from "@/lib/calculator/state";
import { evaluateOnServer } from "@/lib/server/engine";

export async function GET(request: Request) {
  const s = normalize(parseQuery(new URL(request.url).searchParams));
  const out = await evaluateOnServer(toEngineInput(s));
  return cardResponse(<CalculatorCard s={s} out={out} />, {
    "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  });
}
