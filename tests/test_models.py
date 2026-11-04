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
