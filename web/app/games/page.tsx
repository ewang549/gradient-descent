import { redirect } from "next/navigation";
import { seasonGamesPath } from "@/lib/games/chart";
import { gameSeasons } from "@/lib/games/data";

export default function Games() {
  redirect(seasonGamesPath(gameSeasons().at(-1) ?? 2026));
}
