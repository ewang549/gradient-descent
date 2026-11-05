/**
 * Link preview for "You Make the Call": /og/play (the game) or /og/play?<a result's query string>
 * (that result). Drawn from the query alone, so it's deterministic and the CDN caches it.
 */
import { PlayCard } from "@/lib/cards/play";
import { cardResponse } from "@/lib/cards/render";
import { parseResult } from "@/lib/play/game";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  return cardResponse(<PlayCard r={q.has("g") ? parseResult(q) : null} />, {
    "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  });
}
