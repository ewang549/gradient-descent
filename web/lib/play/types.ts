/** Shape of exports/play/pool.json (written by `python -m models.play`), served at /data/play-pool.json. */
import type { EngineInput, Option } from "@/lib/engine/types";
import type { TeamInfo } from "@/lib/weekly/types";

export type Kind = "clear" | "close" | "famous";
export type Outcome = "converted" | "stopped" | "made" | "missed" | "punted" | "penalty" | "unknown";

export interface Situation {
  id: string; // play_uid
  game_id: string;
  season: number;
  week: number;
  date: string; // game date, YYYY-MM-DD
  kind: Kind;
  /** why a famous spot is famous ("Divisional round", "Crunch time", "Worst call of Week 7") */
  label: string | null;
  posteam: string;
  defteam: string;
  home_team: string;
  away_team: string;
  coach: string;
  qtr: number;
  clock: string; // "02:31"
  posteam_score: number;
  defteam_score: number;
  ydstogo: number;
  yardline_100: number;
  goal_to_go: boolean;
  yardline_label: string; // "BUF 41"
  situation: string; // "4th & 2 at BUF 41"
  spread: number; // + = offense favored
  wp_now: number;
  wp: Record<Option, number>;
  p_convert: number;
  p_fg_make: number;
  fg_distance: number;
  fg_in_range: boolean;
  punt_to: number; // receiving team's yardline_100 after the average punt
  recommendation: Option;
  decision: Option;
  wp_lost: number; // what the real coach gave up
  outcome: Outcome;
  description: string;
  final: { home: number; away: number };
  input: EngineInput;
}

export interface Pool {
  seasons: [number, number];
  teams: Record<string, TeamInfo>;
  situations: Situation[];
}
