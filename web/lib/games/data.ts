/** Reads exports/games at build time (static pages), like lib/weekly/data. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { EXPORTS_DIR } from "@/lib/weekly/data";
import type { GameExport, GamesIndex } from "./types";

const GAMES = path.join(EXPORTS_DIR, "games");

export function gameSeasons(): number[] {
  if (!existsSync(GAMES)) return [];
  return readdirSync(GAMES).filter((d) => /^\d{4}$/.test(d) && existsSync(path.join(GAMES, d, "index.json")))
    .map(Number).sort((a, b) => a - b);
}

export function gamesIndex(season: number): GamesIndex | null {
  const file = path.join(GAMES, String(season), "index.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

export function loadGame(season: number, gameId: string): GameExport | null {
  if (!/^[0-9A-Z_]+$/.test(gameId)) return null;
  const file = path.join(GAMES, String(season), `${gameId}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

export function hasGame(season: number, gameId: string): boolean {
  return /^[0-9A-Z_]+$/.test(gameId) && existsSync(path.join(GAMES, String(season), `${gameId}.json`));
}
