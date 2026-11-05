/** exports/meta.json (written by `make export`): data freshness, held-out model results, the nfl4th benchmark. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXPORTS_DIR } from "@/lib/weekly/data";

interface Probabilistic { brier: number; log_loss: number; auc: number }

export interface Meta {
  generated_at: string;
  data_through: { season: number; week: number };
  models: { win_probability: { trained: { train: string; val: number; test: number } } };
  held_out?: {
    win_probability: { this_model: Probabilistic; nflverse_vegas_wp: Probabilistic; nflverse_wp: Probabilistic; plays: number; games: number };
    conversion: { attempts: number; actual_rate: number; mean_pred: number };
    field_goal: { attempts: number; actual_rate: number; mean_pred: number };
    punt: { punts: number; mae_yards: number; naive_mae_yards: number };
  };
  nfl4th_benchmark?: {
    threshold_wp: number;
    plays: number;
    agree_all: number;
    both_clear: number;
    both_clear_share: number;
    agree_when_both_clear: number;
    opposite_clear_share: number;
    disagreements: number;
    disagreements_with_a_close_call: number;
    both_clearly_go: number;
    coaches_went_when_both_clearly_go: number;
    go_rate_ours: number;
    go_rate_nfl4th: number;
    go_rate_coaches: number;
    seasons: number[];
  } | null;
  notes: string[];
}

export function loadMeta(): Meta | null {
  const f = path.join(EXPORTS_DIR, "meta.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}
