"""Model tests that need the warehouse and trained artifacts (skipped on a fresh clone)."""

from __future__ import annotations

import joblib
import numpy as np
import pandas as pd
import pytest

from models import wp
from models.config import DB_PATH

needs_warehouse = pytest.mark.skipif(not DB_PATH.exists(), reason="run `make ingest dbt` first")
needs_wp_model = pytest.mark.skipif(not wp.ARTIFACT.exists(), reason="run `make train` first")


@needs_warehouse
def test_python_features_match_sql():
    """Train/serve skew guard: the decision engine rebuilds engineered features in Python for
    hypothetical states; they must equal what dbt computed for the training rows."""
    from models import data

    df = data.query("select * from features.feat_wp_plays using sample reservoir(5000 rows) repeatable (7)")
    rebuilt = wp.derive_features(df.drop(columns=["spread_time", "score_diff_per_sqrt_sec"]))
    np.testing.assert_allclose(rebuilt["spread_time"], df["spread_time"], rtol=1e-9, atol=1e-12)
    np.testing.assert_allclose(rebuilt["score_diff_per_sqrt_sec"], df["score_diff_per_sqrt_sec"], rtol=1e-9, atol=1e-12)


@needs_wp_model
def test_saved_wp_model_respects_monotone_constraints():
    """More points can't lower WP; being farther from the end zone can't raise it."""
    model = joblib.load(wp.ARTIFACT)
    base = {"down": 1, "ydstogo": 10, "yardline_100": 60, "posteam_timeouts_remaining": 2,
            "defteam_timeouts_remaining": 2, "home": 0, "posteam_spread_line": -3.0, "is_receiving_2h_kickoff": 0,
            "game_seconds_remaining": 600, "half_seconds_remaining": 600, "score_differential": 0}
    by_score = pd.DataFrame([{**base, "score_differential": d} for d in range(-24, 25)])
    by_field = pd.DataFrame([{**base, "yardline_100": y} for y in range(1, 100)])
    assert np.all(np.diff(wp.predict(model, wp.derive_features(by_score))) >= -1e-9)
    assert np.all(np.diff(wp.predict(model, wp.derive_features(by_field))) <= 1e-9)


@pytest.mark.skipif(not __import__("models.conversion").conversion.ARTIFACT.exists(), reason="run `make train` first")
def test_conversion_odds_fall_with_distance():
    from models import conversion

    bundle = joblib.load(conversion.ARTIFACT)
    rows = pd.DataFrame([{"ydstogo": d, "yardline_100": 40, "posteam_off_epa_last_8": 0.0,
                          "defteam_def_epa_last_8": 0.0, "is_indoors": 0, "is_turf": 0} for d in range(1, 16)])
    p = conversion.predict(bundle, rows)
    assert np.all(np.diff(p) <= 1e-9) and 0.6 < p[0] < 0.85 and p[-1] < 0.35


@pytest.mark.skipif(not __import__("models.field_goal").field_goal.ARTIFACT.exists(), reason="run `make train` first")
def test_fg_odds_fall_with_distance_and_wind():
    from models import field_goal

    bundle = joblib.load(field_goal.ARTIFACT)
    calm = pd.DataFrame({"kick_distance": range(20, 66), "is_indoors": 1, "is_turf": 1, "wind_mph": 0, "temp_f": 70,
                         "season": 2026})
    windy = calm.assign(is_indoors=0, wind_mph=20, temp_f=30)
    p_calm, p_windy = field_goal.predict(bundle, calm), field_goal.predict(bundle, windy)
    assert np.all(np.diff(p_calm) < 0) and np.all(p_windy < p_calm)
    assert field_goal.predict(bundle, calm.assign(kick_distance=75))[0] == 0.0  # beyond any make in the data


@pytest.mark.skipif(not __import__("models.punt").punt.ARTIFACT.exists(), reason="run `make train` first")
def test_punting_from_deeper_never_helps_the_punting_team():
    from models import punt

    model = joblib.load(punt.ARTIFACT)
    receiving = punt.predict(model, np.arange(20, 100))  # receiving team's distance to the end zone it attacks
    assert np.all(np.diff(receiving) <= 1e-9)
    assert 55 < punt.predict(model, [70])[0] < 85  # own 30 -> opponent starts somewhere around its own 25


def test_engine_flips_the_state_when_the_opponent_gets_the_ball():
    from models import decision_engine as engine

    d = pd.DataFrame([{"score_differential": 3, "game_seconds_remaining": 1500, "half_seconds_remaining": 1500,
                       "ydstogo": 2, "yardline_100": 45, "posteam_timeouts_remaining": 3, "defteam_timeouts_remaining": 1,
                       "is_posteam_home": True, "is_neutral_site": False, "posteam_spread_line": 4.5, "qtr": 2,
                       "is_receiving_2h_kickoff": False}])
    s = engine.opponent_gets_ball(d, offense_points=np.array([3]), opp_yardline=np.array([75.0]), runoff=np.array([8]))
    row = s.iloc[0]
    assert row["score_differential"] == -6          # offense was up 3, then kicked a FG: opponent down 6
    assert (row["posteam_timeouts_remaining"], row["defteam_timeouts_remaining"]) == (1, 3)
    assert row["home"] == -1 and row["posteam_spread_line"] == -4.5
    assert row["is_receiving_2h_kickoff"] == 1      # 1st half: the team that didn't have it gets the 2nd-half kickoff
    assert (row["down"], row["ydstogo"], row["yardline_100"]) == (1, 10, 75)
    assert row["half_seconds_remaining"] == 1492 and row["game_seconds_remaining"] == 1492


def test_clock_stops_at_the_end_of_the_half():
    from models import decision_engine as engine

    d = pd.DataFrame({"half_seconds_remaining": [7, 600], "game_seconds_remaining": [1807, 600]})
    clock = engine._clock(d, np.array([14, 14]))
    assert list(clock["half_seconds_remaining"]) == [0, 586] and list(clock["game_seconds_remaining"]) == [1800, 586]


def test_kneel_out_rule():
    from models import decision_engine as engine

    base = {"down": 1, "score_differential": 3, "game_seconds_remaining": 100, "defteam_timeouts_remaining": 0}
    s = pd.DataFrame([base, {**base, "defteam_timeouts_remaining": 1}, {**base, "game_seconds_remaining": 70,
                      "defteam_timeouts_remaining": 1}, {**base, "score_differential": 0}, {**base, "down": 4}])
    assert list(engine.kneel_out(s)) == [True, False, True, False, False]


@needs_wp_model
def test_clock_expiry_resolves_to_halftime_or_final():
    from models import decision_engine as engine

    model = joblib.load(wp.ARTIFACT)
    common = {"down": 1, "ydstogo": 10, "yardline_100": 30, "half_seconds_remaining": 0, "posteam_timeouts_remaining": 2,
              "defteam_timeouts_remaining": 2, "home": 0, "posteam_spread_line": 0.0}
    s = pd.DataFrame([
        {**common, "score_differential": 0, "game_seconds_remaining": 1800, "is_receiving_2h_kickoff": 1},
        {**common, "score_differential": 0, "game_seconds_remaining": 1800, "is_receiving_2h_kickoff": 0},
        {**common, "score_differential": 3, "game_seconds_remaining": 0, "is_receiving_2h_kickoff": 0},
        {**common, "score_differential": -3, "game_seconds_remaining": 0, "is_receiving_2h_kickoff": 0},
        {**common, "score_differential": 0, "game_seconds_remaining": 0, "is_receiving_2h_kickoff": 0},
    ])
    p = engine.clock_expiry_wp(s, np.full(len(s), 70.0), model)
    assert p[0] > 0.5 > p[1] and abs(p[0] + p[1] - 1) < 1e-6  # same halftime game, seen from each side
    assert list(p[2:]) == [1.0, 0.0, 0.5]


@pytest.mark.skipif(not __import__("models.field_goal").field_goal.ARTIFACT.exists(), reason="run `make train` first")
def test_long_fg_correction_only_lowers_and_tapers_to_zero():
    from models import field_goal

    bundle = joblib.load(field_goal.ARTIFACT)
    kicks = pd.DataFrame({"kick_distance": range(18, 76), "is_indoors": 0, "is_turf": 0, "wind_mph": 8, "temp_f": 59,
                          "season": 2024})
    p = field_goal.predict(bundle, kicks)
    raw = bundle["model"].predict_proba(kicks[bundle["columns"]])[:, 1]
    assert np.all(np.diff(p) <= 1e-12)                     # never easier from farther out
    assert np.all(p <= raw + 1e-12)                        # the correction only pulls down
    assert np.allclose(p[:26], raw[:26], atol=1e-4)        # ~untouched where everyone kicks (18-43 yds)
    assert p[kicks["kick_distance"] == 69][0] == 0.0       # one past the longest make in the data


@needs_warehouse
@needs_wp_model
def test_engine_agrees_with_consensus_situations():
    from models import decision_engine as engine
    from models import score

    for name, expected, pick, _ in score.sanity_check(engine.load_models(), engine.load_lookups()):
        assert pick == expected, name
