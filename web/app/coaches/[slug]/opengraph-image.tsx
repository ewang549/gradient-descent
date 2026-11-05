import { CoachCard } from "@/lib/cards/coach";
import { CARD_HEIGHT, CARD_WIDTH, cardResponse } from "@/lib/cards/render";
import { coachesIndex, loadCoach } from "@/lib/coaches/data";

export const size = { width: CARD_WIDTH, height: CARD_HEIGHT };
export const contentType = "image/png";
export const alt = "The coach's 4th-down record: wins lost, aggressiveness and the season trend vs the league";

// prerendered for every coach at build time
export function generateStaticParams() {
  return (coachesIndex()?.coaches ?? []).map((c) => ({ slug: c.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = loadCoach((await params).slug);
  const idx = coachesIndex();
  if (!p || !idx) return new Response("Not found", { status: 404 });
  return cardResponse(<CoachCard p={p} idx={idx} />);
}
