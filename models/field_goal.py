"""Field-goal make probability: logistic regression on distance and conditions.

The distance expansion (distance^2, distance x wind) happens inside the sklearn pipeline, so the
saved model takes raw inputs. Training and scoring can't drift apart, and the web calculator only
needs the raw kick distance and conditions.
"""

from __future__ import annotations

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.ticker import PercentFormatter
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

from analysis import theme
from models import data
from models.config import ARTIFACTS_DIR, DATA_SOURCE, REPORTS_DIR, TEST_SEASON, TRAIN_SEASONS, VAL_SEASON

RAW = ["kick_distance", "is_indoors", "is_turf", "wind_mph", "temp_f"]
TARGET = "label_made"
ARTIFACT = ARTIFACTS_DIR / "field_goal.joblib"
MAX_MAKEABLE_DISTANCE = 68  # longest make in the data; beyond it the engine treats a FG as 0%


def expand(X: pd.DataFrame) -> np.ndarray:
    """Raw inputs -> model terms. Module-level (not a lambda) so the pipeline can be pickled."""
    d = X["kick_distance"].to_numpy(dtype=float)
    cols = [d, d**2, X["is_indoors"], X["is_turf"], X["wind_mph"], X["temp_f"], d * X["wind_mph"]]
    if "season" in X:
        cols.append(X["season"])
    return np.column_stack(cols).astype(float)


def make_model() -> object:
    return make_pipeline(FunctionTransformer(expand), StandardScaler(), LogisticRegression(C=1.0, max_iter=2000))


def load() -> pd.DataFrame:
    return data.query("select * from features.feat_fg_attempts")


def train(train_df: pd.DataFrame, val_df: pd.DataFrame) -> tuple[object, list[str], dict]:
    """Fit with and without a linear era trend; keep whichever predicts the validation season better."""
    candidates = {"no_trend": RAW, "with_season_trend": [*RAW, "season"]}
    val_scores = {}
    for name, cols in candidates.items():
        model = make_model().fit(train_df[cols], train_df[TARGET])
        val_scores[name] = log_loss(val_df[TARGET], model.predict_proba(val_df[cols])[:, 1])
    choice = min(val_scores, key=val_scores.get)
    cols = candidates[choice]
    return make_model().fit(train_df[cols], train_df[TARGET]), cols, {"val_log_loss": val_scores, "chosen": choice}


def predict(bundle: dict, df: pd.DataFrame) -> np.ndarray:
    """P(make). Seasons past the last evaluated one are clamped to it: the era trend is only
    trusted two seasons beyond training, never extrapolated further."""
    X = df.copy()
    if "season" in bundle["columns"]:
        X["season"] = X["season"].clip(upper=bundle["max_season"])
    p = bundle["model"].predict_proba(X[bundle["columns"]])[:, 1]
    return np.where(X["kick_distance"] > MAX_MAKEABLE_DISTANCE, 0.0, p)


def evaluate(bundle: dict, test_df: pd.DataFrame) -> dict:
    y = test_df[TARGET].to_numpy()
    p = predict(bundle, test_df)
    obs, pred = calibration_curve(y, p, n_bins=8, strategy="quantile")
    bins = pd.cut(test_df["kick_distance"], [17, 29, 34, 39, 44, 49, 54, 70],
                  labels=["18-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55+"])
    by_distance = (test_df.assign(pred=p, bin=bins).groupby("bin", observed=True)
                   .agg(attempts=(TARGET, "size"), actual=(TARGET, "mean"), predicted=("pred", "mean"),
                        mean_distance=("kick_distance", "mean")).reset_index())
    return {"attempts": len(test_df), "brier": brier_score_loss(y, p), "log_loss": log_loss(y, p),
            "auc": roc_auc_score(y, p), "actual_rate": float(y.mean()), "mean_pred": float(p.mean()),
            "calibration": {"pred": pred.tolist(), "obs": obs.tolist()},
            "by_distance": by_distance.assign(bin=by_distance["bin"].astype(str)).to_dict(orient="records")}


def plot_by_distance(evaluation: dict, bundle: dict) -> None:
    """Actual 2024 make rate per distance band (dots) vs the model's average prediction for those
    same kicks (line), plus the model curve for an indoor kick to show the weather effect."""
    theme.apply_theme()
    fig, ax = plt.subplots(figsize=(8, 4.8))
    rows = evaluation["by_distance"]
    x = [r["mean_distance"] for r in rows]
    ax.plot(x, [r["predicted"] for r in rows], color=theme.BLUE, label=f"Model, same {TEST_SEASON} kicks")
    ax.plot(x, [r["actual"] for r in rows], linestyle="none", marker="o", markersize=theme.MARKER_SIZE,
            color=theme.ORANGE, markeredgecolor=theme.SURFACE, markeredgewidth=2, label=f"Actual {TEST_SEASON} make rate",
            zorder=4)
    distances = np.arange(18, MAX_MAKEABLE_DISTANCE + 1)
    windy = pd.DataFrame({"kick_distance": distances, "is_indoors": 0, "is_turf": 0, "wind_mph": 15, "temp_f": 35,
                          "season": TEST_SEASON})
    ax.plot(distances, predict(bundle, windy), color=theme.AQUA, linewidth=1.5,
            label="Model: outdoors, 15 mph wind, 35F")
    ax.set_ylim(0.3, 1.02)
    ax.set_xlim(17, MAX_MAKEABLE_DISTANCE + 1)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.set_xlabel("Kick distance (yards)")
    ax.legend(loc="lower left")
    theme.headline(
        fig, "Field goal make probability by distance",
        f"Logistic regression trained on {TRAIN_SEASONS.start}-{TRAIN_SEASONS.stop - 1}, checked on every "
        f"{TEST_SEASON} attempt ({evaluation['attempts']:,} kicks, {min(r['attempts'] for r in rows)}-"
        f"{max(r['attempts'] for r in rows)} per distance band)",
        f"Kick distance = line of scrimmage + 18 yards. Blocked kicks count as misses. {DATA_SOURCE}.",
    )
    theme.save(fig, REPORTS_DIR / "fg_make_by_distance.png")


def run() -> dict:
    print("Field goal model: loading features.feat_fg_attempts")
    df = load()
    train_df, val_df, test_df = data.split(df)
    print(f"  attempts: train {len(train_df):,}, val {len(val_df):,} ({VAL_SEASON}), test {len(test_df):,} ({TEST_SEASON})")
    model, columns, selection = train(train_df, val_df)
    bundle = {"model": model, "columns": columns, "max_season": TEST_SEASON, "max_distance": MAX_MAKEABLE_DISTANCE}
    evaluation = evaluate(bundle, test_df)
    joblib.dump(bundle, ARTIFACT)
    plot_by_distance(evaluation, bundle)

    coefs = dict(zip(["distance", "distance^2", "indoors", "turf", "wind", "temp", "distance x wind", "season"],
                     model[-1].coef_[0].round(3).tolist()))
    summary = {"model": "logistic regression (standardized terms)", "raw_inputs": columns, "selection": selection,
               "standardized_coefficients": coefs, "rows": {"train": len(train_df), "val": len(val_df),
                                                             "test": len(test_df)}, "test": evaluation}
    data.write_json(summary, REPORTS_DIR / "fg_metrics.json")
    print(f"  era trend: validation log loss {selection['val_log_loss']} -> using '{selection['chosen']}'")
    print(f"  {TEST_SEASON} test: Brier {evaluation['brier']:.4f}, log loss {evaluation['log_loss']:.4f}, "
          f"AUC {evaluation['auc']:.3f}, actual {evaluation['actual_rate']:.1%} vs predicted {evaluation['mean_pred']:.1%}")
    print("    by distance (actual/predicted): " + "  ".join(
        f"{r['bin']}: {r['actual']:.0%}/{r['predicted']:.0%}" for r in evaluation["by_distance"]))
    probe = pd.DataFrame({"kick_distance": [33, 45, 50, 55, 60], "is_indoors": 0, "is_turf": 0, "wind_mph": 8,
                          "temp_f": 59, "season": TEST_SEASON})
    print("    typical outdoor kick, 2024 kicker: " + ", ".join(
        f"{d} yds {p:.0%}" for d, p in zip(probe["kick_distance"], predict(bundle, probe))))
    return summary
