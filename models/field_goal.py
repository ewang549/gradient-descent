"""Field-goal make probability: logistic regression on distance and conditions.

The distance expansion (distance^2, distance x wind) happens inside the sklearn pipeline, so the
saved model takes raw inputs. Training and scoring can't drift apart, and the web calculator only
needs the raw kick distance and conditions.

Long kicks get a selection correction (adapted from nfl4th, found by the nfl4th benchmark): only
teams that trust their kicker try a 60-yarder, so make rates out there describe an elite subset,
not the average kicker the engine has to assume. Where most teams would kick, the fitted model is
used as is; where few do, it is blended in log-odds toward a curve fit only on the distances
everyone attempts; past the last distance with real data it tapers to zero. It can only lower
a make probability, never raise it, because the bias has a known sign.
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
from sklearn.preprocessing import FunctionTransformer, SplineTransformer, StandardScaler

from analysis import theme
from models import data
from models.config import ARTIFACTS_DIR, DATA_SOURCE, REPORTS_DIR, TEST_SEASON, TRAIN_SEASONS, VAL_SEASON

RAW = ["kick_distance", "is_indoors", "is_turf", "wind_mph", "temp_f"]
TARGET = "label_made"
ARTIFACT = ARTIFACTS_DIR / "field_goal.joblib"
MAX_MAKEABLE_DISTANCE = 68  # longest make in the data; the taper reaches 0% one yard past it

# selection correction (see the module docstring)
WEIGHT_FLOOR = 0.80        # a distance is "unselected" while teams attempt at >= 80% of the short-range rate
PLATEAU_MAX = 51           # short range: below this every kicker is trusted
MIN_ATTEMPTS = 30          # taper starts after the last distance with this many training attempts
MAX_LOOKUP_DISTANCE = 75


def expand(X: pd.DataFrame) -> np.ndarray:
    """Raw inputs -> model terms. Module-level (not a lambda) so the pipeline can be pickled."""
    d = X["kick_distance"].to_numpy(dtype=float)
    cols = [d, d**2, X["is_indoors"], X["is_turf"], X["wind_mph"], X["temp_f"], d * X["wind_mph"]]
    if "season" in X:
        cols.append(X["season"])
    return np.column_stack(cols).astype(float)


def expand_linear(X: pd.DataFrame) -> np.ndarray:
    """Like expand(), but linear in distance: the unselected-range curve has to extrapolate past
    its data monotonically instead of curling back up."""
    d = X["kick_distance"].to_numpy(dtype=float)
    cols = [d, X["is_indoors"], X["is_turf"], X["wind_mph"], X["temp_f"], d * X["wind_mph"]]
    if "season" in X:
        cols.append(X["season"])
    return np.column_stack(cols).astype(float)


def make_model(expander=expand) -> object:
    return make_pipeline(FunctionTransformer(expander), StandardScaler(), LogisticRegression(C=1.0, max_iter=2000))


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


def load_attempt_decisions() -> pd.DataFrame:
    """4th downs where the FG attempt rate reflects trust in the kicker, not strategy: 5+ to go
    (going for it is unattractive) and not an end-of-half heave."""
    return data.query(f"""
        select season, yardline_100 + 18 as kick_distance, is_indoors::int as is_indoors,
               (decision = 'field_goal')::int as attempted
        from marts.fct_fourth_downs
        where qtr <= 4 and ydstogo >= 5 and half_seconds_remaining >= 30
          and yardline_100 + 18 between 30 and {MAX_LOOKUP_DISTANCE}
    """)


def fit_selection(train_df: pd.DataFrame, columns: list[str]) -> dict:
    """Attempt-rate weights by distance (indoor / outdoor), the unselected-range model, and the taper."""
    decisions = load_attempt_decisions()
    decisions = decisions[decisions["season"].between(TRAIN_SEASONS.start, TRAIN_SEASONS.stop - 1)]
    distances = np.arange(MAX_LOOKUP_DISTANCE + 1)
    weights, unselected_max = {}, {}
    for indoors in (0, 1):
        g = decisions[decisions["is_indoors"] == indoors]
        # smooth attempt rate over distance (cubic spline basis + logistic link)
        smoother = make_pipeline(SplineTransformer(n_knots=6, degree=3), LogisticRegression(C=10.0, max_iter=2000))
        smoother.fit(g[["kick_distance"]], g["attempted"])
        rate = smoother.predict_proba(pd.DataFrame({"kick_distance": distances}))[:, 1]
        plateau = np.median(rate[(distances >= 30) & (distances <= PLATEAU_MAX)])
        w = np.minimum(rate / plateau, 1.0)
        w[distances < 30] = 1.0       # no attempt data that close; nobody doubts a chip shot
        w = np.minimum.accumulate(w)  # trust in the kicker can only fall with distance
        weights[indoors] = w.round(6).tolist()
        unselected_max[indoors] = int(distances[w >= WEIGHT_FLOOR].max())
    limit = train_df["is_indoors"].map(unselected_max)
    unselected = make_model(expand_linear).fit(train_df.loc[train_df["kick_distance"] <= limit, columns],
                                               train_df.loc[train_df["kick_distance"] <= limit, TARGET])
    counts = train_df["kick_distance"].value_counts()
    taper_from = int(counts[counts >= MIN_ATTEMPTS].index.max())
    return {"weights": weights, "unselected_max": unselected_max, "unselected_model": unselected,
            "taper_from": taper_from, "taper_zero": MAX_MAKEABLE_DISTANCE + 1}


def _logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def _corrected(bundle: dict, X: pd.DataFrame) -> np.ndarray:
    """Model probability with the selection blend applied (no taper)."""
    p_obs = bundle["model"].predict_proba(X[bundle["columns"]])[:, 1]
    sel = bundle.get("selection")
    if sel is None:
        return p_obs
    d = X["kick_distance"].to_numpy(dtype=int).clip(0, MAX_LOOKUP_DISTANCE)
    table = np.array([sel["weights"][0], sel["weights"][1]])
    w = table[X["is_indoors"].to_numpy(dtype=int), d]
    p_un = sel["unselected_model"].predict_proba(X[bundle["columns"]])[:, 1]
    blended = 1 / (1 + np.exp(-(w * _logit(p_obs) + (1 - w) * _logit(p_un))))
    return np.minimum(p_obs, blended)


def predict(bundle: dict, df: pd.DataFrame) -> np.ndarray:
    """P(make). Seasons past the last evaluated one are clamped to it: the era trend is only
    trusted two seasons beyond training, never extrapolated further."""
    X = df.copy()
    if "season" in bundle["columns"]:
        X["season"] = X["season"].clip(upper=bundle["max_season"])
    p = _corrected(bundle, X)
    sel = bundle.get("selection")
    if sel is None:
        return np.where(X["kick_distance"] > MAX_MAKEABLE_DISTANCE, 0.0, p)
    d = X["kick_distance"].to_numpy(dtype=float)
    lo, hi = sel["taper_from"], sel["taper_zero"]
    anchor = _corrected(bundle, X.assign(kick_distance=lo))
    tapered = anchor * np.clip((hi - d) / (hi - lo), 0, 1)
    return np.where(d > lo, np.minimum(p, tapered), p)


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
    distances = np.arange(18, MAX_MAKEABLE_DISTANCE + 2)
    windy = pd.DataFrame({"kick_distance": distances, "is_indoors": 0, "is_turf": 0, "wind_mph": 15, "temp_f": 35,
                          "season": TEST_SEASON})
    ax.plot(distances, predict(bundle, windy), color=theme.AQUA, linewidth=1.5,
            label="Model: outdoors, 15 mph wind, 35F")
    ax.set_xlim(17, MAX_MAKEABLE_DISTANCE + 2)
    ax.set_ylim(0, 1.02)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.set_xlabel("Kick distance (yards)")
    ax.legend(loc="lower left")
    theme.headline(
        fig, "Field goal make probability by distance",
        f"Logistic regression trained on {TRAIN_SEASONS.start}-{TRAIN_SEASONS.stop - 1}, checked on every "
        f"{TEST_SEASON} attempt ({evaluation['attempts']:,} kicks, {min(r['attempts'] for r in rows)}-"
        f"{max(r['attempts'] for r in rows)} per distance band)",
        f"Kick distance = line of scrimmage + 18 yards. Blocked kicks count as misses. Long kicks corrected for which "
        f"teams attempt them; 0% past the longest make ({MAX_MAKEABLE_DISTANCE} yds). {DATA_SOURCE}.",
    )
    theme.save(fig, REPORTS_DIR / "fg_make_by_distance.png")


def run() -> dict:
    print("Field goal model: loading features.feat_fg_attempts")
    df = load()
    train_df, val_df, test_df = data.split(df)
    print(f"  attempts: train {len(train_df):,}, val {len(val_df):,} ({VAL_SEASON}), test {len(test_df):,} ({TEST_SEASON})")
    model, columns, selection = train(train_df, val_df)
    bundle = {"model": model, "columns": columns, "max_season": TEST_SEASON, "max_distance": MAX_MAKEABLE_DISTANCE}
    bundle["selection"] = fit_selection(train_df, columns)
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
