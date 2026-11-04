"""4th-down conversion model: P(offense converts | it goes for it).

Shallow XGBoost with monotone constraints, then Platt (sigmoid) calibration fit on the validation
season. Trained only on real go-for-it snaps: no fakes, no plays wiped out by a penalty.
"""

from __future__ import annotations

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

from analysis import theme
from models import data, plots
from models.config import ARTIFACTS_DIR, DATA_SOURCE, REPORTS_DIR, TEST_SEASON, TRAIN_SEASONS, VAL_SEASON

MONOTONE = {
    "ydstogo": -1,                    # longer is never easier
    "yardline_100": 0,                # a compressed field cuts both ways
    "posteam_off_epa_last_8": +1,     # better offense
    "defteam_def_epa_last_8": +1,     # EPA allowed: a worse defense
    "is_indoors": 0,
    "is_turf": 0,
}
FEATURES = list(MONOTONE)
TARGET = "label_converted"
PARAMS = {
    "objective": "binary:logistic", "eval_metric": "logloss", "tree_method": "hist", "max_depth": 3,
    "learning_rate": 0.03, "min_child_weight": 20, "subsample": 0.8, "colsample_bytree": 0.8,
    "monotone_constraints": tuple(MONOTONE.values()), "seed": 42,
}
ARTIFACT = ARTIFACTS_DIR / "conversion.joblib"


def load() -> pd.DataFrame:
    return data.query("select * from features.feat_go_attempts")


def choose_rounds(train_df: pd.DataFrame) -> int:
    """Tree count by cross-validation that leaves whole seasons out, inside the training years.
    (The validation season is reserved for calibration, so it can't also pick the tree count.)"""
    folds = list(GroupKFold(n_splits=5).split(train_df, groups=train_df["season"]))
    cv = xgb.cv(PARAMS, xgb.DMatrix(train_df[FEATURES], label=train_df[TARGET]), num_boost_round=2000,
                folds=folds, early_stopping_rounds=50, seed=42)
    return len(cv)


def train(train_df: pd.DataFrame, val_df: pd.DataFrame) -> dict:
    rounds = choose_rounds(train_df)
    params = {k: v for k, v in PARAMS.items() if k != "seed"} | {"random_state": 42}
    base = xgb.XGBClassifier(**params, n_estimators=rounds).fit(train_df[FEATURES], train_df[TARGET])
    calibrated = CalibratedClassifierCV(FrozenEstimator(base), method="sigmoid").fit(val_df[FEATURES], val_df[TARGET])
    baseline = train_df.assign(bucket=train_df["ydstogo"].clip(upper=10)).groupby("bucket")[TARGET].mean()
    return {"base": base, "calibrated": calibrated, "rounds": rounds, "baseline_by_ydstogo": baseline.to_dict(),
            "features": FEATURES}


def predict(bundle: dict, df: pd.DataFrame) -> np.ndarray:
    return bundle["calibrated"].predict_proba(df[FEATURES])[:, 1]


def predict_baseline(bundle: dict, df: pd.DataFrame) -> np.ndarray:
    return df["ydstogo"].clip(upper=10).map(bundle["baseline_by_ydstogo"]).to_numpy(dtype=float)


def evaluate(bundle: dict, test_df: pd.DataFrame) -> dict:
    y = test_df[TARGET].to_numpy()
    candidates = {
        "calibrated_model": predict(bundle, test_df),
        "uncalibrated_model": bundle["base"].predict_proba(test_df[FEATURES])[:, 1],
        "baseline_ydstogo_only": predict_baseline(bundle, test_df),
    }
    metrics, curves = {}, {}
    for name, p in candidates.items():
        metrics[name] = {"brier": brier_score_loss(y, p), "log_loss": log_loss(y, p), "auc": roc_auc_score(y, p),
                         "mean_pred": float(p.mean())}
        obs, pred = calibration_curve(y, p, n_bins=8, strategy="quantile")  # ~110 attempts per bin
        curves[name] = {"pred": pred.tolist(), "obs": obs.tolist()}
    by_distance = (
        test_df.assign(pred=candidates["calibrated_model"], bucket=test_df["ydstogo"].clip(upper=10))
        .groupby("bucket").agg(attempts=(TARGET, "size"), actual=(TARGET, "mean"), predicted=("pred", "mean"))
        .reset_index()
    )
    return {"attempts": len(test_df), "actual_rate": float(y.mean()), "metrics": metrics, "calibration": curves,
            "by_ydstogo": by_distance.to_dict(orient="records")}


def run() -> dict:
    print("Conversion model: loading features.feat_go_attempts")
    df = load()
    train_df, val_df, test_df = data.split(df)
    print(f"  go attempts: train {len(train_df):,}, val {len(val_df):,} ({VAL_SEASON}), test {len(test_df):,} "
          f"({TEST_SEASON})")
    bundle = train(train_df, val_df)
    evaluation = evaluate(bundle, test_df)
    joblib.dump(bundle, ARTIFACT)

    m, cal = evaluation["metrics"], evaluation["calibration"]
    plots.calibration(
        [
            {"label": f"Model + Platt calibration  (Brier {m['calibrated_model']['brier']:.4f})", "color": theme.BLUE,
             **cal["calibrated_model"]},
            {"label": f"Yards-to-go average only  (Brier {m['baseline_ydstogo_only']['brier']:.4f})",
             "color": theme.ORANGE, **cal["baseline_ydstogo_only"]},
        ],
        title="4th-down conversion model calibration",
        subtitle=f"{TEST_SEASON} go-for-it attempts, held out: {evaluation['attempts']:,} snaps, 8 equal-size bins",
        source=f"Excludes fakes and snaps wiped out by penalty. {DATA_SOURCE}.",
        path=REPORTS_DIR / "conversion_calibration.png",
        xlabel="Predicted conversion probability", ylabel="Actual conversion rate",
    )
    summary = {"model": "XGBoost (depth 3, monotone) + Platt calibration on the validation season",
               "features": FEATURES, "monotone_constraints": MONOTONE, "trees": bundle["rounds"],
               "split": {"train": f"{TRAIN_SEASONS.start}-{TRAIN_SEASONS.stop - 1}", "calibration": VAL_SEASON,
                         "test": TEST_SEASON},
               "rows": {"train": len(train_df), "val": len(val_df), "test": len(test_df)},
               "test": evaluation}
    data.write_json(summary, REPORTS_DIR / "conversion_metrics.json")

    print(f"  trees chosen by leave-seasons-out CV: {bundle['rounds']}")
    print(f"  {TEST_SEASON} test ({evaluation['attempts']} attempts, actual rate {evaluation['actual_rate']:.1%}):")
    print(f"    {'model':<24}{'Brier':>9}{'log loss':>10}{'AUC':>8}{'mean pred':>11}")
    for name, mm in m.items():
        print(f"    {name:<24}{mm['brier']:>9.4f}{mm['log_loss']:>10.4f}{mm['auc']:>8.4f}{mm['mean_pred']:>11.1%}")
    print("    by yards to go:  " + "  ".join(
        f"{int(r['bucket'])}{'+' if r['bucket'] == 10 else ''}: {r['actual']:.0%}/{r['predicted']:.0%} (n={r['attempts']})"
        for r in evaluation["by_ydstogo"]))
    return summary
