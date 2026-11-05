/** Shapes of exports/weekly/{season}/week_NN.json (written by `python -m models.weekly`). */
import type { EngineInput, Option } from "@/lib/engine/types";

export interface Call {
  play_uid: string;
  game_id: string;
  week: number;
  posteam: string;
  defteam: string;
  coach: string;
  qtr: number;
  clock: string; // "03:01"
  posteam_score: number;
  defteam_score: number;
  ydstogo: number;
  is_goal_to_go: boolean;
  yardline_100: number;
  yardline_label: string; // "MIN 33"
  situation: string; // "4th & 5 at MIN 33"
  decision: Option;
  recommendation: Option;
  wp_now: number;
  wp_go: number;
  wp_punt: number;
  wp_fg: number;
  p_convert: number;
  wp_if_convert: number;
  wp_if_fail: number;
  p_fg_make: number;
  fg_distance: number; // the engine's distance for a kick from this spot
  fg_attempt_distance: number | null; // the real kick's distance, when the coach kicked
  punt_receiving_yardline_100: number;
  wp_lost: number;
  recommendation_margin: number;
  go_advantage: number;
  is_converted: boolean | null;
  is_fg_made: boolean | null;
  play_description: string;
  posteam_game_result: string | null;
  expected_go_rate: number;
  value_vs_typical: number;
  input: EngineInput;
}

export interface CoachRow {
  coach: string;
  team: string;
  decisions: number;
  wins_lost: number;
  go_rate: number;
  agreed_with_model: number;
  rank: number;
}

export interface TeamInfo {
  name: string;
  primary: string;
  secondary: string;
}

export interface WeekExport {
  season: number;
  week: number;
  generated_at: string;
  games: { scheduled: number; final: number; with_plays: number; with_decisions: number };
  summary: {
    graded_decisions: number;
    go_rate: number;
    model_go_rate: number;
    agreed_with_model: number;
    wins_lost: number;
    wins_lost_kicking: number;
  };
  definitions: Record<string, string>;
  worst: Call[];
  best: Call[];
  gutsiest: Call | null;
  leaderboard: {
    through_week: number;
    min_decisions: number;
    qualified: number;
    top: CoachRow[];
    bottom: CoachRow[];
  } | null;
  teams: Record<string, TeamInfo>;
}

export interface SeasonIndex {
  season: number;
  weeks: number[];
  latest: number;
}
