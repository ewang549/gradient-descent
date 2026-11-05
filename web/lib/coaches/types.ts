/** Shapes of exports/coaches (written by `python -m models.coaches`). */
import type { EngineInput, Option } from "@/lib/engine/types";
import type { TeamInfo } from "@/lib/weekly/types";

/** Raw counts, so any range of seasons adds up exactly. */
export interface Counts {
  decisions: number;
  go: number;
  clear_spots: number; // spots where going is worth >= 1 WP point more
  clear_go: number;
  agreed: number;
  wins_lost: number;
  wins_lost_kicking: number;
}

export interface CoachSeason extends Counts {
  slug: string;
  coach: string;
  season: number;
  teams: string[];
}

export interface LeagueSeason extends Counts {
  season: number;
}

export interface CoachesIndex {
  seasons: number[];
  out_of_sample_from: number;
  min_decisions: { season: number; range: number; career: number; bucket: number };
  clear_go_wp: number;
  definitions: Record<string, string>;
  teams: Record<string, TeamInfo>;
  coaches: { slug: string; coach: string; teams: string[]; decisions: number }[];
  league: LeagueSeason[];
  rows: CoachSeason[];
}

export interface CoachCall {
  play_uid: string;
  game_id: string;
  season: number;
  week: number;
  posteam: string;
  defteam: string;
  qtr: number;
  clock: string;
  posteam_score: number;
  defteam_score: number;
  situation: string;
  decision: Option;
  recommendation: Option;
  wp_go: number;
  wp_punt: number;
  wp_fg: number;
  wp_lost: number;
  is_converted: boolean | null;
  is_fg_made: boolean | null;
  play_description: string;
  expected_go_rate: number;
  value_vs_typical: number;
  input: EngineInput;
}

export interface Bucket {
  bucket: string; // "1", "2-3", ...
  n: number;
  go_rate: number | null; // null under the bucket minimum
  model_go_rate: number | null;
  league_n: number;
  league_go_rate: number;
}

export interface CoachPage {
  slug: string;
  coach: string;
  teams: { team: string; from: number; to: number }[];
  career: Counts;
  out_of_sample: Counts;
  seasons: CoachSeason[];
  buckets: Bucket[];
  worst: CoachCall[];
  best: CoachCall[];
}
