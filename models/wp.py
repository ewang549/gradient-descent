"""Win-probability model: XGBoost with monotone constraints.

Predicts P(possession team wins) from the pre-snap game state in features.feat_wp_plays.
Train 2006-2022, early-stop on 2023, test once on 2024, benchmarked against nflverse's WP.
"""

from __future__ import annotations

import copy
import time

import joblib
import numpy as np
import onnxruntime as ort
import pandas as pd
import xgboost as xgb
from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType
from sklearn.calibration import calibration_curve
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

from analysis import theme
from models import data, plots
from models.config import ARTIFACTS_DIR, DATA_SOURCE, REPORTS_DIR, TEST_SEASON, TRAIN_SEASONS, VAL_SEASON

# feature -> monotone direction: +1 = more of it can only raise WP, -1 = only lower it, 0 = free
MONOTONE = {
    "score_differential": +1,
    "score_diff_per_sqrt_sec": +1,     # score diff / sqrt(seconds left + 1): a lead matters more late
    "game_seconds_remaining": 0,       # good or bad depending on whether you're ahead
    "half_seconds_remaining": 0,
    "down": -1,
    "ydstogo": -1,
    "yardline_100": -1,                # yards from the opponent's end zone
    "posteam_timeouts_remaining": +1,
    "defteam_timeouts_remaining": -1,
    "home": +1,                        # +1 home, 0 neutral, -1 away
    "posteam_spread_line": +1,         # closing line, + = possession team favored
    "spread_time": +1,                 # spread * exp(-4 * share of game elapsed)
    "is_receiving_2h_kickoff": +1,
}
FEATURES = list(MONOTONE)
TARGET = "label_win"
LABELS = {
    "score_differential": "Score differential",
    "score_diff_per_sqrt_sec": "Score diff / sqrt(sec left + 1)",
    "game_seconds_remaining": "Seconds left in game",
    "half_seconds_remaining": "Seconds left in half",
    "down": "Down",
    "ydstogo": "Yards to go",
    "yardline_100": "Yards from end zone",
    "posteam_timeouts_remaining": "Offense timeouts",
    "defteam_timeouts_remaining": "Defense timeouts",
    "home": "Home / away",
    "posteam_spread_line": "Vegas spread",
    "spread_time": "Spread x time decay",
    "is_receiving_2h_kickoff": "Gets 2nd-half kickoff",
}

BASE_PARAMS = {
    "objective": "binary:logistic", "eval_metric": "logloss", "tree_method": "hist", "learning_rate": 0.05,
    "subsample": 0.8, "colsample_bytree": 0.8, "reg_lambda": 1.0, "n_jobs": -1, "random_state": 42,
    "monotone_constraints": tuple(MONOTONE.values()),
}
GRID = [{"max_depth": d, "min_child_weight": w} for d in (4, 6) for w in (50, 300)]
ARTIFACT = ARTIFACTS_DIR / "wp_xgb.joblib"


def derive_features(state: pd.DataFrame) -> pd.DataFrame:
    """Add the engineered columns to raw regulation game states.

    Must match feat_wp_plays.sql / fct_plays.sql exactly (tests/test_models.py checks it against
    the warehouse), so hypothetical states in the decision engine are scored the way training
    rows were built. Divergence here is "train/serve skew".
    """
    out = state.copy()
    elapsed_share = (3600 - out["game_seconds_remaining"]) / 3600
    out["spread_time"] = out["posteam_spread_line"] * np.exp(-4 * elapsed_share)
    out["score_diff_per_sqrt_sec"] = out["score_differential"] / np.sqrt(out["game_seconds_remaining"] + 1)
    return out


def load() -> pd.DataFrame:
    return data.query("select * from features.feat_wp_plays")


def predict(model: xgb.XGBClassifier, df: pd.DataFrame) -> np.ndarray:
    return model.predict_proba(df[FEATURES].astype(float))[:, 1]


def train(train_df: pd.DataFrame, val_df: pd.DataFrame) -> tuple[xgb.XGBClassifier, list[dict]]:
    """Small grid; each config early-stops on the validation season. The winner is refit with
    exactly its best tree count, so the saved/ONNX model is the model that was evaluated."""
    results = []
    for params in GRID:
        started = time.perf_counter()
        model = xgb.XGBClassifier(**BASE_PARAMS, **params, n_estimators=3000, early_stopping_rounds=100)
        model.fit(train_df[FEATURES], train_df[TARGET], eval_set=[(val_df[FEATURES], val_df[TARGET])], verbose=False)
        results.append({**params, "trees": model.best_iteration + 1,
                        "val_log_loss": log_loss(val_df[TARGET], predict(model, val_df)),
                        "seconds": round(time.perf_counter() - started, 1)})
        print(f"  depth={params['max_depth']} min_child_weight={params['min_child_weight']}: "
              f"{results[-1]['trees']} trees, val log loss {results[-1]['val_log_loss']:.4f}")
    best = min(results, key=lambda r: r["val_log_loss"])
    final = xgb.XGBClassifier(**BASE_PARAMS, max_depth=best["max_depth"], min_child_weight=best["min_child_weight"],
                              n_estimators=best["trees"])
    final.fit(train_df[FEATURES], train_df[TARGET], verbose=False)
    return final, results


def evaluate(model: xgb.XGBClassifier, test_df: pd.DataFrame) -> dict:
    """Score this model and nflverse's two WP columns on the identical set of test plays."""
    te = test_df.dropna(subset=["nflverse_wp", "nflverse_vegas_wp"])
    y = te[TARGET].to_numpy()
    candidates = {
        "this_model": predict(model, te),
        "nflverse_vegas_wp": te["nflverse_vegas_wp"].to_numpy(),
        "nflverse_wp": te["nflverse_wp"].to_numpy(),
    }
    metrics, curves = {}, {}
    for name, p in candidates.items():
        p = np.clip(p, 1e-6, 1 - 1e-6)
        metrics[name] = {"brier": brier_score_loss(y, p), "log_loss": log_loss(y, p), "auc": roc_auc_score(y, p)}
        obs, pred = calibration_curve(y, p, n_bins=10, strategy="uniform")
        curves[name] = {"pred": pred.tolist(), "obs": obs.tolist()}
    q4 = (te["game_seconds_remaining"] <= 900).to_numpy()
    metrics["this_model"]["brier_4th_quarter"] = brier_score_loss(y[q4], candidates["this_model"][q4])
    metrics["nflverse_vegas_wp"]["brier_4th_quarter"] = brier_score_loss(y[q4], candidates["nflverse_vegas_wp"][q4])
    return {"plays": len(te), "games": te["game_id"].nunique(), "metrics": metrics, "calibration": curves}


def sanity_checks(model: xgb.XGBClassifier) -> dict:
    """States with a known answer. Opening drive: 1st & 10 at own 25 after a touchback."""
    base = {"down": 1, "ydstogo": 10, "yardline_100": 75, "posteam_timeouts_remaining": 3, "defteam_timeouts_remaining": 3,
                "posteam_spread_line": 0.0, "is_receiving_2h_kickoff": 0}
    states = {
        "opening drive, even spread, neutral site": {**base, "score_differential": 0, "game_seconds_remaining": 3600,
                                                     "half_seconds_remaining": 1800, "home": 0},
        "opening drive, even spread, home team": {**base, "score_differential": 0, "game_seconds_remaining": 3600,
                                                  "half_seconds_remaining": 1800, "home": 1},
        "opening drive, even spread, away team": {**base, "score_differential": 0, "game_seconds_remaining": 3600,
                                                  "half_seconds_remaining": 1800, "home": -1},
        "up 21, 2:00 left, own ball": {**base, "score_differential": 21, "game_seconds_remaining": 120,
                                       "half_seconds_remaining": 120, "home": 0},
        "down 21, 2:00 left, own ball": {**base, "score_differential": -21, "game_seconds_remaining": 120,
                                         "half_seconds_remaining": 120, "home": 0},
    }
    wp = predict(model, derive_features(pd.DataFrame(list(states.values()))))
    out = {name: float(p) for name, p in zip(states, wp)}
    passed = {
        "opening drive near 0.5": 0.45 <= out["opening drive, even spread, neutral site"] <= 0.55,
        "home > neutral > away": out["opening drive, even spread, home team"]
        > out["opening drive, even spread, neutral site"] > out["opening drive, even spread, away team"],
        "up 21 with 2:00 left >= 0.99": out["up 21, 2:00 left, own ball"] >= 0.99,
        "down 21 with 2:00 left <= 0.01": out["down 21, 2:00 left, own ball"] <= 0.01,
    }
    return {"wp": out, "passed": passed}


def export_onnx(model: xgb.XGBClassifier, sample: pd.DataFrame) -> dict:
    """ONNX for the browser calculator, verified against XGBoost on real plays."""
    unnamed = copy.deepcopy(model)  # the converter only understands positional names (f0, f1, ...)
    unnamed.get_booster().feature_names = None
    onx = convert_xgboost(unnamed, initial_types=[("features", FloatTensorType([None, len(FEATURES)]))], target_opset=15)
    path = ARTIFACTS_DIR / "wp.onnx"
    path.write_bytes(onx.SerializeToString())
    session = ort.InferenceSession(str(path))
    x = sample[FEATURES].to_numpy(dtype=np.float32)
    p_onnx = session.run(None, {"features": x})[1][:, 1]
    max_diff = float(np.abs(p_onnx - predict(model, sample)).max())
    return {"path": str(path.relative_to(ARTIFACTS_DIR.parent.parent)), "max_abs_diff_vs_xgboost": max_diff,
            "input_name": "features", "feature_order": FEATURES}


def run() -> dict:
    print("WP model: loading features.feat_wp_plays")
    df = load()
    labelled = df.dropna(subset=[TARGET])
    train_df, val_df, test_df = data.split(labelled)
    print(f"  train {len(train_df):,} plays ({TRAIN_SEASONS.start}-{TRAIN_SEASONS.stop - 1}), "
          f"val {len(val_df):,} ({VAL_SEASON}), test {len(test_df):,} ({TEST_SEASON})")

    model, search = train(train_df, val_df)
    evaluation = evaluate(model, test_df)
    sanity = sanity_checks(model)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, ARTIFACT)
    onnx_info = export_onnx(model, test_df.sample(5000, random_state=0))
    report_plots(model, test_df, evaluation)

    summary = {
        "model": "XGBoost classifier, monotone constraints",
        "features": FEATURES,
        "monotone_constraints": MONOTONE,
        "split": {"train": f"{TRAIN_SEASONS.start}-{TRAIN_SEASONS.stop - 1}", "val": VAL_SEASON, "test": TEST_SEASON},
        "rows": {"train": len(train_df), "val": len(val_df), "test": len(test_df)},
        "search": search,
        "chosen": {k: model.get_params()[k] for k in ("max_depth", "min_child_weight", "n_estimators")},
        "test": evaluation,
        "sanity": sanity,
        "onnx": onnx_info,
        "caveat": "nflverse's WP models were fit on data that includes the test season, so the benchmark favors them.",
    }
    data.write_json(summary, REPORTS_DIR / "wp_metrics.json")
    _print_summary(summary)
    return summary


def report_plots(model: xgb.XGBClassifier, test_df: pd.DataFrame, evaluation: dict) -> None:
    m, cal = evaluation["metrics"], evaluation["calibration"]
    plots.calibration(
        [
            {"label": f"This model  (Brier {m['this_model']['brier']:.4f})", "color": theme.BLUE, **cal["this_model"]},
            {"label": f"nflverse vegas_wp  (Brier {m['nflverse_vegas_wp']['brier']:.4f})", "color": theme.ORANGE,
             **cal["nflverse_vegas_wp"]},
        ],
        title="Win probability calibration",
        subtitle=f"{TEST_SEASON} season, held out: {evaluation['plays']:,} plays from {evaluation['games']} games, 10 bins",
        source=f"nflverse's model was fit on data that includes {TEST_SEASON}; this one never saw it. {DATA_SOURCE}.",
        path=REPORTS_DIR / "wp_calibration.png",
        xlabel="Predicted win probability", ylabel="Actual win rate",
    )
    gain = model.get_booster().get_score(importance_type="gain")
    values = np.array([gain.get(f, 0.0) for f in FEATURES])
    plots.hbars(
        [LABELS[f] for f in FEATURES], list(values / values.sum()),
        value_fmt=lambda v: "<1%" if v < 0.005 else f"{v:.0%}",
        title="What drives win probability",
        subtitle="Share of total split gain in the XGBoost model, by feature",
        source=f"Trained on {TRAIN_SEASONS.start}-{TRAIN_SEASONS.stop - 1} regulation plays. {DATA_SOURCE}.",
        path=REPORTS_DIR / "wp_feature_importance.png",
    )
    sample = test_df.sample(4000, random_state=1)
    shap_values = model.get_booster().predict(xgb.DMatrix(sample[FEATURES].astype(float)), pred_contribs=True)[:, :-1]
    plots.beeswarm(
        shap_values, sample[FEATURES].to_numpy(dtype=float), [LABELS[f] for f in FEATURES],
        title="How each feature moves win probability",
        subtitle=f"SHAP values for 4,000 random {TEST_SEASON} plays. Right = more likely to win",
        source=f"Color = the feature's value on that play. {DATA_SOURCE}.",
        path=REPORTS_DIR / "wp_shap_summary.png",
    )


def _print_summary(s: dict) -> None:
    print(f"\n  chosen: {s['chosen']}")
    print(f"  {TEST_SEASON} test ({s['test']['plays']:,} plays, identical rows for every model):")
    print(f"    {'model':<20}{'Brier':>9}{'log loss':>10}{'AUC':>8}{'Brier Q4':>10}")
    for name, m in s["test"]["metrics"].items():
        q4 = f"{m['brier_4th_quarter']:.4f}" if "brier_4th_quarter" in m else ""
        print(f"    {name:<20}{m['brier']:>9.4f}{m['log_loss']:>10.4f}{m['auc']:>8.4f}{q4:>10}")
    print("  sanity states:")
    for name, p in s["sanity"]["wp"].items():
        print(f"    {name:<44}{p:.3f}")
    for name, ok in s["sanity"]["passed"].items():
        print(f"    [{'PASS' if ok else 'FAIL'}] {name}")
    print(f"  ONNX max |diff| vs XGBoost: {s['onnx']['max_abs_diff_vs_xgboost']:.2e}")
