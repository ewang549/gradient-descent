/** Labels for game pages and their cards. */
import type { GameExport, GameSummary } from "./types";

const ROUND: Record<string, string> = { WC: "Wild Card", DIV: "Divisional round", CON: "Conference championship", SB: "Super Bowl" };

export const weekLabel = (g: Pick<GameSummary, "week" | "game_type">) =>
  g.game_type === "REG" ? `Week ${g.week}` : ROUND[g.game_type] ?? `Week ${g.week}`;

export function dateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const finalLabel = (g: Pick<GameExport, "went_to_overtime">) => (g.went_to_overtime ? "Final/OT" : "Final");

/** "DAL 20 at PHI 24" */
export const scoreline = (g: GameExport) => `${g.away.team} ${g.away.score} at ${g.home.team} ${g.home.score}`;

export function gameTitle(g: GameExport): string {
  return `${g.away.name ?? g.away.team} at ${g.home.name ?? g.home.team}, ${weekLabel(g)} ${g.season}`;
}
