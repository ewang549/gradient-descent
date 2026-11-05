"""Score with the saved models (no training): `python -m models.score`.

Writes two tables into the warehouse, which dbt then reads:
  ml.fourth_down_options  WP of go / punt / FG for every regulation 4th-down decision
  ml.play_wp              this model's WP before every regulation scrimmage play (for WP charts)
Runs in seconds, so the weekly job rescores everything instead of tracking what's new.
"""

from __future__ import annotations

import sys
import time
from datetime import UTC, datetime

import pandas as pd

from models import data, decision_engine, wp

# Situations with an answer nearly everyone in football analytics agrees on. If the engine
# disagrees with these, something upstream is broken.
SANITY = [
    ("4th & 1 at opp 40, tied, 3rd quarter", {"ydstogo": 1, "yardline_100": 40}, "go"),
    ("4th & goal at the 1, tied, 1st quarter", {"ydstogo": 1, "yardline_100": 1, "is_goal_to_go": True, "qtr": 1,
                                                "game_seconds_remaining": 3000, "half_seconds_remaining": 1200}, "go"),
    ("4th & 12 at own 20, tied, 3rd quarter", {"ydstogo": 12, "yardline_100": 80}, "punt"),
    ("4th & 9 at opp 15, tied, 2nd quarter", {"ydstogo": 9, "yardline_100": 15, "qtr": 2,
                                              "game_seconds_remaining": 2400, "half_seconds_remaining": 600}, "field_goal"),
    ("4th & 2 at opp 30, down 4, 1:30 left", {"ydstogo": 2, "yardline_100": 30, "qtr": 4, "score_differential": -4,
                                              "game_seconds_remaining": 90, "half_seconds_remaining": 90}, "go"),
    # the clock-expiry rule: a conversion with 3 seconds left in the half can't be followed by a snap
    ("4th & 2 at opp 30, tied, 0:03 before half", {"ydstogo": 2, "yardline_100": 30, "qtr": 2,
                                                   "game_seconds_remaining": 1803, "half_seconds_remaining": 3},
     "field_goal"),
    # the kneel-out rule: convert and the game is over; punt and the opponent gets a last drive
    ("4th & 1 at own 45, up 3, 1:05 left, opp 0 TOs", {"ydstogo": 1, "yardline_100": 55, "qtr": 4,
                                                       "score_differential": 3, "game_seconds_remaining": 65,
                                                       "half_seconds_remaining": 65, "defteam_timeouts_remaining": 0},
     "go"),
    # the kneel-out rule from the other side: punting down 1 with 0:40 left hands the leader a kneel-down
    ("4th & 10 at own 30, down 1, 0:40 left", {"ydstogo": 10, "yardline_100": 70, "qtr": 4, "score_differential": -1,
                                               "game_seconds_remaining": 40, "half_seconds_remaining": 40,
                                               "posteam_timeouts_remaining": 1}, "go"),
]
SANITY_BASE = {"play_uid": "sanity", "season": 2024, "week": 5, "qtr": 3, "decision": None, "is_posteam_home": True,
               "is_neutral_site": False, "score_differential": 0, "game_seconds_remaining": 1200,
               "half_seconds_remaining": 1200, "is_goal_to_go": False, "posteam_timeouts_remaining": 3,
               "defteam_timeouts_remaining": 3, "posteam_spread_line": 0.0, "is_receiving_2h_kickoff": False,
               "posteam_off_epa_last_8": 0.0, "defteam_def_epa_last_8": 0.0, "is_indoors": False,
               "surface_type": "grass", "roof": "outdoors", "wind_mph": 5.0, "temp_f": 60.0}


def sanity_check(models: dict, lookups: dict) -> list[tuple[str, str, str, pd.Series]]:
    states = pd.DataFrame([{**SANITY_BASE, **overrides} for _, overrides, _ in SANITY])
    options = decision_engine.evaluate_options(states, models, lookups)
    picks = decision_engine.recommend(options)
    return [(name, expected, pick, options.iloc[i]) for i, ((name, _, expected), pick) in enumerate(zip(SANITY, picks))]


def main() -> int:
    started = time.perf_counter()
    models, lookups = decision_engine.load_models(), decision_engine.load_lookups()

    checks = sanity_check(models, lookups)
    print("Engine sanity situations (WP go / punt / FG):")
    for name, expected, pick, o in checks:
        flag = "PASS" if pick == expected else "FAIL"
        print(f"  [{flag}] {name:<40} -> {pick:<10} ({o.wp_go:.3f} / {o.wp_punt:.3f} / {o.wp_fg:.3f})")
    if any(pick != expected for _, expected, pick, _ in checks):
        print("Engine sanity check failed; not writing scores.")
        return 1

    decisions = decision_engine.load_decisions()
    options = decision_engine.evaluate_options(decisions, models, lookups)
    options["scored_at"] = datetime.now(UTC)
    n_options = data.write_table(options, "fourth_down_options")

    plays = data.query("select play_uid, game_id, season from features.feat_wp_plays")
    features = data.query("select * from features.feat_wp_plays")
    plays["wp"] = wp.predict(models["wp"], features)
    n_plays = data.write_table(plays[["play_uid", "wp"]], "play_wp")
    print(f"Scored {n_options:,} 4th-down decisions and {n_plays:,} plays in {time.perf_counter() - started:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
