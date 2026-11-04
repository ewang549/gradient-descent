"""Punt model: where does the receiving team start, given where you punt from?

An empirical lookup smoothed by isotonic regression. The only assumption is the football one:
punting from farther back can never leave the opponent farther from your end zone.

Punting keeps improving, so a curve fit on 2006-2022 is ~1.5 yards too kind to receivers in
recent seasons. Like the conversion model's Platt step, a recalibration on the validation season
(here: one constant yard shift) corrects that; the test season then checks it.

Units: punt_yardline_100 = punting team's distance to the opponent's end zone; the output,
receiving_yardline_100, is the receiving team's distance to the end zone IT attacks (the WP
model's yardline_100 for the receiving team's first snap).
"""

from __future__ import annotations

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from analysis import theme
from models import data
from models.config import ARTIFACTS_DIR, DATA_SOURCE, REPORTS_DIR, TEST_SEASON, TRAIN_SEASONS, VAL_SEASON

ARTIFACT = ARTIFACTS_DIR / "punt.joblib"


def load() -> pd.DataFrame:
    return data.query("select * from features.feat_punts")


def fit(train_df: pd.DataFrame, val_df: pd.DataFrame) -> dict:
    curve = IsotonicRegression(increasing=False, out_of_bounds="clip").fit(
        train_df["punt_yardline_100"], train_df["receiving_yardline_100"])
    shift = float((val_df["receiving_yardline_100"] - curve.predict(val_df["punt_yardline_100"])).mean())
    return {"curve": curve, "shift_yards": shift}


def predict(model: dict, punt_yardline_100) -> np.ndarray:
    raw = model["curve"].predict(np.asarray(punt_yardline_100, dtype=float))
    return np.clip(raw + model["shift_yards"], 1, 99)


def naive_baseline(train_df: pd.DataFrame, punt_yardline_100) -> np.ndarray:
    """League-average net punt everywhere, with the ball stopping at the 20 at the deepest
    (roughly a touchback)."""
    net = (train_df["punt_yardline_100"] - (100 - train_df["receiving_yardline_100"])).mean()
    x = np.asarray(punt_yardline_100, dtype=float)
    return 100 - np.maximum(x - net, 20)


def errors(y: np.ndarray, p: np.ndarray) -> dict:
    return {"mae_yards": float(np.abs(y - p).mean()), "bias_yards": float((p - y).mean())}


def run() -> dict:
    print("Punt model: loading features.feat_punts")
    df = load()
    train_df, val_df, test_df = data.split(df)
    print(f"  punts: train {len(train_df):,}, val {len(val_df):,} ({VAL_SEASON}), test {len(test_df):,} ({TEST_SEASON})")
    model = fit(train_df, val_df)
    joblib.dump(model, ARTIFACT)
    lookup = {int(yl): round(float(v), 2) for yl, v in zip(range(1, 100), predict(model, range(1, 100)))}
    data.write_json({"description": "punt yardline_100 -> receiving team's expected yardline_100 at its first snap",
                     "trained_on": f"{TRAIN_SEASONS.start}-{TRAIN_SEASONS.stop - 1}", "lookup": lookup},
                    ARTIFACTS_DIR / "punt_lookup.json")

    y = test_df["receiving_yardline_100"].to_numpy(dtype=float)
    results = {"test": {
        "punts": len(test_df),
        "isotonic_recalibrated": errors(y, predict(model, test_df["punt_yardline_100"])),
        "isotonic_uncalibrated": errors(y, model["curve"].predict(test_df["punt_yardline_100"])),
        "naive_average_net": errors(y, naive_baseline(train_df, test_df["punt_yardline_100"])),
    }}
    plot(model, test_df)
    summary = {"model": "isotonic regression (decreasing) + constant shift fit on the validation season",
               "shift_yards": model["shift_yards"], "rows": {"train": len(train_df), "val": len(val_df),
                                                                     "test": len(test_df)},
               "results": results, "lookup_sample": {k: lookup[k] for k in (30, 40, 50, 60, 70, 80, 90)}}
    data.write_json(summary, REPORTS_DIR / "punt_metrics.json")
    print(f"  recalibration shift from {VAL_SEASON}: {model['shift_yards']:+.2f} yards")
    for name, r in results["test"].items():
        if name != "punts":
            print(f"  {TEST_SEASON} test, {name:<22} MAE {r['mae_yards']:.2f} yds, bias {r['bias_yards']:+.2f}")
    print("  expected start (receiving team, yards from its own goal line) by punting spot: " + ", ".join(
        f"{_spot(yl)} -> own {100 - lookup[yl]:.0f}" for yl in (40, 50, 60, 70, 80, 90)))
    return summary


def _spot(yardline_100: int) -> str:
    """yardline_100 -> 'own 20' / 'midfield' / 'opp 35' from the punting team's view."""
    if yardline_100 == 50:
        return "midfield"
    return f"opp {yardline_100}" if yardline_100 < 50 else f"own {100 - yardline_100}"


def plot(model: dict, test_df: pd.DataFrame) -> None:
    """x and y in 'yards from own goal line' so the chart reads like a field."""
    theme.apply_theme()
    fig, ax = plt.subplots(figsize=(8, 4.8))
    test_df = test_df.assign(los=100 - test_df["punt_yardline_100"],
                             start=100 - test_df["receiving_yardline_100"],
                             band=(100 - test_df["punt_yardline_100"]) // 5 * 5 + 2.5)
    bands = test_df.groupby("band").agg(start=("start", "mean"), punts=("start", "size")).reset_index()
    bands = bands[bands["punts"] >= 15]
    x = np.arange(1, 77)
    ax.plot(x, 100 - predict(model, 100 - x), color=theme.BLUE, label=f"Isotonic fit ({TRAIN_SEASONS.start}-"
            f"{TRAIN_SEASONS.stop - 1}, recalibrated on {VAL_SEASON})", zorder=3)
    ax.plot(bands["band"], bands["start"], linestyle="none", marker="o", markersize=theme.MARKER_SIZE,
            color=theme.ORANGE, markeredgecolor=theme.SURFACE, markeredgewidth=2,
            label=f"{TEST_SEASON} average, 5-yard bands", zorder=4)
    ax.set_xticks([10, 20, 30, 40, 50, 60, 70], ["Own 10", "Own 20", "Own 30", "Own 40", "50", "Opp 40", "Opp 30"])
    ax.set_yticks(range(10, 51, 10), [f"Own {y}" if y < 50 else "50" for y in range(10, 51, 10)])
    ax.set_xlim(0, 78)
    ax.set_ylim(5, 55)
    ax.set_xlabel("Line of scrimmage when punting")
    ax.set_ylabel("Receiving team's start")
    ax.legend(loc="upper right")
    theme.headline(
        fig, "Where the opponent starts after a punt",
        "Receiving team's first snap, by where the punting team kicked from",
        f"Clean punts only (no return TDs or muffs recovered by the kicking team). {DATA_SOURCE}.",
    )
    theme.save(fig, REPORTS_DIR / "punt_outcome.png")
