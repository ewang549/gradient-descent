/** Shapes of exports/games/{season}/{game_id}.json and index.json (written by `python -m models.export`). */
import type { EngineInput, Option } from "@/lib/engine/types";
import type { TeamInfo } from "@/lib/weekly/types";

export interface Side {
  team: string;
  coach: string;
  score: number;
  name: string;
  primary: string;
  secondary: string;
  logo: string;
}

export interface FourthDown {
  play_seq: number;
  posteam: string;
  defteam: string;
  coach: string;
  qtr: number;
  clock: string;
  posteam_score: number;
  defteam_score: number;
  ydstogo: number;
  is_goal_to_go: boolean;
  yardline_100: number;
  yardline_label: string;
  situation: string;
  decision: Option;
  recommendation: Option | null;
  wp_now: number | null;
  wp_go: number | null;
  wp_punt: number | null;
  wp_fg: number | null;
  p_convert: number | null;
  p_fg_make: number | null;
  fg_distance: number | null;
  wp_lost: number | null;
  recommendation_margin: number | null;
  is_graded: boolean;
  is_converted: boolean | null;
  is_fg_made: boolean | null;
  play_description: string;
  input: EngineInput;
}

export interface Swing {
  play_seq: number;
  qtr: number;
  clock: string;
  posteam: string;
  wp_before: number;
  wp_after: number;
  delta: number; // home WP change
  play_description: string;
}

export interface GameExport {
  game_id: string;
  season: number;
  week: number;
  game_type: string;
  date: string;
  stadium: string | null;
  home: Side;
  away: Side;
  went_to_overtime: boolean;
  /** columnar, one entry per regulation snap (pre-snap state) plus the final result (play_seq null) */
  series: {
    play_seq: (number | null)[];
    game_seconds_remaining: number[];
    home_wp: number[];
    home_score: number[];
    away_score: number[];
  };
  fourth_downs: FourthDown[];
  swings: Swing[];
}

export interface GameSummary {
  game_id: string;
  week: number;
  game_type: string;
  date: string;
  home: string;
  away: string;
  home_score: number;
  away_score: number;
  overtime: boolean;
  graded: number;
  wp_lost: { home: number; away: number };
}

export interface GamesIndex {
  season: number;
  teams: Record<string, TeamInfo>;
  games: GameSummary[];
}
