"""Finding 2 grader: when it grades, and that it applies the written rules (no warehouse needed)."""

from datetime import date

import pandas as pd

from analysis.findings import luck_grade as G


def _sched(scores):
    return pd.DataFrame([{"game_id": f"g{i}", "week": 9 + i, "game_date": "2027-01-10" if i else "2026-11-08",
                          "home_team": "AAA", "away_team": "BBB", "home_score": h, "away_score": a}
                         for i, (h, a) in enumerate(scores)])


def test_season_over_rules():
    assert G.season_over(_sched([(20, 10), (17, 14)]), date(2026, 12, 1))[0]
    assert not G.season_over(_sched([(20, 10), (None, None)]), date(2027, 1, 12))[0]
    over, why = G.season_over(_sched([(20, 10), (None, None)]), date(2027, 1, 17))
    assert over and "cancelled" in why


def test_vs_baseline_rules():
    s = _sched([(20, 10), (10, 20), (14, 14)])  # AAA: W, L, T over its listed games
    res = G.results(s)
    per_game = {t: [{"game_id": f"g{i}", "p_win": 0.6 if t == "AAA" else 0.4} for i in range(3)] for t in ("AAA", "BBB")}
    p = {"teams": [{"team": "AAA", "baseline_rest_win_pct": 0.4, "point_diff_rest_win_pct": 0.6, "win_pct": 0.75, "p_beats_baseline": 0.7},
                   {"team": "BBB", "baseline_rest_win_pct": 0.6, "point_diff_rest_win_pct": 0.4, "win_pct": 0.25, "p_beats_baseline": 0.3}],
         "market": {"per_game": per_game},
         "highlighted": {"point_diff_above_baseline": ["AAA"], "point_diff_below_baseline": ["BBB"]}}
    g = G.grade_vs_baseline(p, res)
    a = g["teams"]["AAA"]
    assert a["actual_rest_wins"] == 1.5 and abs(a["baseline_rest_wins"] - 1.2) < 1e-9 and abs(a["market_rest_wins"] - 1.8) < 1e-9
    # AAA beat its baseline (1.5 > 1.2) = hit; BBB won 1.5 > 1.8? no, 1.5 < 1.8 = hit
    assert g["rule_2_highlighted"]["hits"] == 2 and abs(g["rule_2_highlighted"]["expected"] - 1.4) < 1e-9
    assert g["rule_1_mae"]["point_diff_beats_baseline"] == (g["rule_1_mae"]["point_diff"] < g["rule_1_mae"]["baseline"])
