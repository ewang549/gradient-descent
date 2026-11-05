import { GameCard } from "@/lib/cards/game";
import { CARD_HEIGHT, CARD_WIDTH, cardResponse } from "@/lib/cards/render";
import { gameSeasons, gamesIndex, loadGame } from "@/lib/games/data";

export const size = { width: CARD_WIDTH, height: CARD_HEIGHT };
export const contentType = "image/png";
export const alt = "Win probability chart of the game with every 4th down graded";

// prerendered for every game at build time, so nothing reads ../exports at request time
export function generateStaticParams() {
  return gameSeasons().flatMap((season) =>
    (gamesIndex(season)?.games ?? []).map((g) => ({ season: String(season), game_id: g.game_id })));
}

export default async function Image({ params }: { params: Promise<{ season: string; game_id: string }> }) {
  const { season, game_id } = await params;
  const g = loadGame(Number(season), game_id);
  if (!g) return new Response("Not found", { status: 404 });
  return cardResponse(<GameCard g={g} />);
}
