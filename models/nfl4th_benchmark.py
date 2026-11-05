"""Benchmark the decision engine against Ben Baldwin's nfl4th (the public standard for 4th downs).

    python -m models.nfl4th_benchmark   ->  models/reports/nfl4th_benchmark.md (+ a chart)

nfl4th publishes its go / punt / FG win probabilities for every 4th down since 2014 as a release
file, so no R is needed. Its component models are public too: the first-down model (an XGBoost
model over yards gained, readable by Python's xgboost), the FG make table and the punt outcome
distribution. That allows an attribution: keep OUR win-probability model fixed, swap in nfl4th's
version of one component at a time, and see how much of the go-rate gap each swap closes. Whatever
gap is left after swapping everything is the WP model (plus small details listed in the report).
"""

from __future__ import annotations

import gzip
import struct
import urllib.request
from datetime import date

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pyreadr
import xgboost as xgb
from matplotlib.lines import Line2D
from matplotlib.ticker import PercentFormatter

from analysis import theme
from models import conversion, data, field_goal, punt, wp
from models import decision_engine as de
from models.config import DATA_SOURCE, REPO_ROOT, REPORTS_DIR

SEASONS = (2023, 2024, 2025)
NFL4TH_DIR = REPO_ROOT / "data" / "external" / "nfl4th"
NFL4TH_COMMIT = "2ac170b22c1f0ae7cf3ba726450c1b6efa69cfd3"  # data-raw tables pinned to this commit
_RELEASE = "https://github.com/nflverse/nfl4th/releases/download"
_RAW = f"https://raw.githubusercontent.com/nflverse/nfl4th/{NFL4TH_COMMIT}/data-raw"
SOURCES = {
    "pre_computed_go_boost.rds": f"{_RELEASE}/nfl4th_infrastructure/pre_computed_go_boost.rds",
    "fd_model.rds": f"{_RELEASE}/model_archive/fd_model.rds",
    "punt_data.rds": f"{_RAW}/punt_data.rds",
    "fg_prob.rds": f"{_RAW}/fg_prob.rds",
}
GAINS = np.arange(-10, 66)  # the first-down model's 76 classes: yards gained on a go attempt
NFL4TH_RUNOFF = 6           # nfl4th runs 6 seconds off every outcome (no extra after a conversion by default)
REPORT = REPORTS_DIR / "nfl4th_benchmark.md"
CHART = REPORTS_DIR / "nfl4th_go_rate_by_distance.png"
OPTIONS = ("go", "punt", "field_goal")


# ----------------------------------------------------------------------------------- nfl4th files


def fetch(force: bool = False) -> None:
    NFL4TH_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        path = NFL4TH_DIR / name
        if force or not path.exists():
            print(f"  downloading {name}")
            req = urllib.request.Request(url, headers={"User-Agent": "nfl-analytics-benchmark"})
            with urllib.request.urlopen(req, timeout=120) as r:
                path.write_bytes(r.read())


def read_raw_rds(path) -> bytes:
    """An .rds holding one R raw vector -> its bytes. nfl4th stores its XGBoost models this way
    (xgb.save.raw output), and pyreadr/rdata only read data frames. RDS = gzip + R's XDR
    serialization: 'X\\n', version ints, (v3: native encoding), then the RAWSXP header + length."""
    b = path.read_bytes()
    if b[:2] == b"\x1f\x8b":
        b = gzip.decompress(b)
    if b[:2] != b"X\n":
        raise ValueError(f"{path.name}: not an XDR-serialized RDS file")
    version, off = struct.unpack(">i", b[2:6])[0], 14
    if version == 3:
        off += 4 + struct.unpack(">i", b[off:off + 4])[0]
    sexp_type = struct.unpack(">i", b[off:off + 4])[0] & 0xFF
    if sexp_type != 24:  # RAWSXP
        raise ValueError(f"{path.name}: expected an R raw vector, got SEXP type {sexp_type}")
    n = struct.unpack(">i", b[off + 4:off + 8])[0]
    return b[off + 8:off + 8 + n]


def load_nfl4th() -> dict:
    fetch()
    fd = xgb.Booster()
    fd.load_model(bytearray(read_raw_rds(NFL4TH_DIR / "fd_model.rds")))
    pre = pyreadr.read_r(NFL4TH_DIR / "pre_computed_go_boost.rds")[None]
    pre["play_id"] = pre["play_id"].astype(int)
    punts = pyreadr.read_r(NFL4TH_DIR / "punt_data.rds")[None].astype({"yardline_100": int, "yardline_after": int})
    fg = pyreadr.read_r(NFL4TH_DIR / "fg_prob.rds")[None].astype({"yardline_100": int})
    fg["fg_model_roof"] = fg["fg_model_roof"].astype(str)
    return {"fd_model": fd, "precomputed": pre, "punt_data": punts, "fg_prob": fg}


# ------------------------------------------------------------- nfl4th components on our 4th downs


def _model_roof(roof: pd.Series) -> pd.Series:
    """nfl4th's roof buckets (get_games_file): open/closed/unknown count as retractable."""
    return np.select([roof.eq("dome"), roof.eq("outdoors")], ["dome", "outdoors"], "retractable")


def nfl4th_gain_probs(d: pd.DataFrame, fd_model: xgb.Booster) -> np.ndarray:
    """(n, 76) P(gain = g) for g in -10..65, features exactly as nfl4th's get_go_wp builds them."""
    roof = _model_roof(d["roof"])
    X = np.column_stack([
        np.full(len(d), 4.0), d["ydstogo"], d["yardline_100"],
        d["season"].between(2014, 2017).astype(float), (d["season"] > 2017).astype(float),
        roof == "outdoors", roof == "retractable", roof == "dome",
        d["posteam_spread_line"], d["total_line"], (d["total_line"] + d["posteam_spread_line"]) / 2,
    ]).astype(float)
    return fd_model.predict(xgb.DMatrix(X))


def nfl4th_first_down_prob(d: pd.DataFrame, gain_probs: np.ndarray) -> np.ndarray:
    return (gain_probs * (GAINS[None, :] >= d["ydstogo"].to_numpy()[:, None])).sum(axis=1)


def nfl4th_fg_make(d: pd.DataFrame, fg_prob: pd.DataFrame) -> np.ndarray:
    """Lookup by yard line x (outdoors, kicking era). The table is shrunk for long kicks because
    only teams that trust their kicker try them (selection bias a raw model can't see)."""
    key = (d["roof"].eq("outdoors").astype(int).astype(str)
           + (d["season"] >= 2023).astype(int).astype(str))
    table = fg_prob.set_index(["yardline_100", "fg_model_roof"])["fg_make_prob"]
    idx = pd.MultiIndex.from_arrays([d["yardline_100"].astype(int), key])
    return table.reindex(idx).to_numpy()


# ----------------------------------------------------------------------- the engine with swaps

SWAPS = {
    "conversion_prob": "nfl4th's P(first down) in place of our conversion model",
    "conversion_yards": "nfl4th's full yards-gained distribution (where a conversion or a failure leaves the ball)",
    "field_goal": "nfl4th's FG make table in place of our logistic regression",
    "punt": "nfl4th's punt outcome distribution (muffs, return TDs; no punting inside the opponent's 31)",
    "clock": "nfl4th's flat 6-second runoff for every outcome instead of our median runoffs",
    "kickoff": "nfl4th's kickoff start (own 25 before 2024, own 30 after) instead of the season average",
}


def evaluate_variant(d: pd.DataFrame, models: dict, lookups: dict, n4: dict, swaps: frozenset = frozenset()) -> pd.DataFrame:
    """decision_engine.evaluate_options, with any subset of nfl4th's components swapped in.
    With no swaps it reproduces the engine (checked in run())."""
    unknown = set(swaps) - set(SWAPS)
    if unknown:
        raise ValueError(f"unknown swaps: {unknown}")
    d = d.reset_index(drop=True)
    n, yl = len(d), d["yardline_100"].to_numpy()
    zero = np.zeros(n)

    def runoff(outcome: str) -> np.ndarray:
        return np.full(n, float(NFL4TH_RUNOFF)) if "clock" in swaps else de._runoff(d, lookups, outcome)

    if "kickoff" in swaps:
        kick = np.where(d["season"] >= 2024, 70.0, 75.0)
    else:
        kick = d["season"].map(lookups["kickoff_start"]).fillna(max(lookups["kickoff_start"].values())).to_numpy()

    states: dict[str, pd.DataFrame] = {}
    gain_probs = nfl4th_gain_probs(d, n4["fd_model"]) if {"conversion_prob", "conversion_yards"} & swaps else None

    # --- go
    if "conversion_yards" in swaps:
        # one state per (play, gain) pair, like nfl4th: success at the new spot (TD if past the goal
        # line), failure gives the opponent the ball where the play ended
        rep = d.loc[d.index.repeat(len(GAINS))].reset_index(drop=True)
        g = np.tile(GAINS, n)
        yl_r = rep["yardline_100"].to_numpy()
        g = np.minimum(g, yl_r)
        new_yl = yl_r - g
        success = g >= rep["ydstogo"].to_numpy()
        states["go_success"] = de.offense_keeps_ball(rep, yardline=np.maximum(new_yl, 1), runoff=_rep(runoff("go_converted"), len(GAINS)))
        states["go_td"] = de.opponent_gets_ball(rep, offense_points=np.full(len(rep), de.TOUCHDOWN_POINTS),
                                                opp_yardline=np.repeat(kick, len(GAINS)), runoff=_rep(runoff("fg_made"), len(GAINS)))
        states["go_fail"] = de.opponent_gets_ball(rep, offense_points=np.zeros(len(rep)), opp_yardline=np.clip(100 - new_yl, 1, 99),
                                                  runoff=_rep(runoff("go_failed"), len(GAINS)))
    else:
        gain = np.maximum(d["ydstogo"], d["ydstogo"].clip(upper=10).map(lookups["conversion_gain"])).to_numpy()
        new_yl = yl - gain
        touchdown = d["is_goal_to_go"].to_numpy() | (new_yl <= 0)
        states["convert"] = de.offense_keeps_ball(d, yardline=np.maximum(new_yl, 1), runoff=runoff("go_converted"))
        states["convert_td"] = de.opponent_gets_ball(d, offense_points=zero + de.TOUCHDOWN_POINTS, opp_yardline=kick,
                                                     runoff=runoff("fg_made"))
        states["fail"] = de.opponent_gets_ball(d, offense_points=zero, opp_yardline=100 - yl, runoff=runoff("go_failed"))

    # --- punt
    if "punt" in swaps:
        pdist = d[["yardline_100"]].assign(row=np.arange(n)).merge(n4["punt_data"], on="yardline_100", how="inner")
        rows = pdist["row"].to_numpy()
        pd_d = d.iloc[rows].reset_index(drop=True)
        after = pdist["yardline_after"].to_numpy()       # receiver's distance from its own goal line
        muff, ret_td = pdist["muff"].to_numpy() == 1, after == 100
        recv = de.opponent_gets_ball(pd_d, offense_points=np.zeros(len(pd_d)), opp_yardline=np.clip(100 - after, 1, 99),
                                     runoff=runoff("punt")[rows])
        # muff: punting team keeps it at the spot; return TD: receiver +7, punting team gets the kickoff
        keep = de.offense_keeps_ball(pd_d, yardline=np.clip(after, 1, 99), runoff=runoff("punt")[rows])
        td = de.current_state(pd_d)
        td.update(de._clock(pd_d, runoff("punt")[rows]))
        td["score_differential"] = pd_d["score_differential"].to_numpy() - 7
        td["down"], td["yardline_100"], td["ydstogo"] = 1, kick[rows], 10
        states["punt_recv"], states["punt_keep"], states["punt_td"] = recv, keep, td
    else:
        states["punt"] = de.opponent_gets_ball(d, offense_points=zero, opp_yardline=punt.predict(models["punt"], yl),
                                               runoff=runoff("punt"))

    # --- field goal
    states["fg_make"] = de.opponent_gets_ball(d, offense_points=zero + 3, opp_yardline=kick, runoff=runoff("fg_made"))
    states["fg_miss"] = de.opponent_gets_ball(d, offense_points=zero, opp_yardline=np.minimum(80, 100 - (yl + de.MISSED_FG_SPOT_BACK)),
                                              runoff=runoff("fg_missed"))

    # one batched WP call; each WP is from the side of whoever has the ball in that state
    kicks = {name: (np.repeat(kick, len(GAINS)) if name.startswith("go_") else
                    kick[rows] if name.startswith("punt_") else kick) for name in states}
    stacked = pd.concat([st.assign(kickoff_start=kicks[name]) for name, st in states.items()], keys=states.keys())
    raw = wp.predict(models["wp"], wp.derive_features(stacked))
    # the engine's kneel-out and clock-expiry rules (added after this benchmark found them missing)
    probs = pd.Series(de.apply_football_rules(stacked, raw, models["wp"]), index=stacked.index)
    p = {name: probs.loc[name].to_numpy() for name in states}

    # --- combine
    if "conversion_prob" in swaps or "conversion_yards" in swaps:
        p_convert = nfl4th_first_down_prob(d, gain_probs)
    else:
        p_convert = conversion.predict(models["conversion"], d.assign(is_turf=(d["surface_type"] == "turf").astype(int),
                                                                       is_indoors=d["is_indoors"].astype(int)))
    if "conversion_yards" in swaps:
        g = np.minimum(np.tile(GAINS, n), np.repeat(yl, len(GAINS)))
        is_td = g == np.repeat(yl, len(GAINS))
        success = g >= np.repeat(d["ydstogo"].to_numpy(), len(GAINS))
        wp_outcome = np.where(success, np.where(is_td, 1 - p["go_td"], p["go_success"]), 1 - p["go_fail"])
        w = gain_probs.reshape(-1)
        wp_go = (w * wp_outcome).reshape(n, len(GAINS)).sum(axis=1) / gain_probs.sum(axis=1)
    else:
        wp_if_convert = np.where(touchdown, 1 - p["convert_td"], p["convert"])
        wp_go = p_convert * wp_if_convert + (1 - p_convert) * (1 - p["fail"])

    if "punt" in swaps:
        wp_rows = np.select([muff, ret_td], [p["punt_keep"], p["punt_td"]], 1 - p["punt_recv"])
        wp_punt = np.full(n, np.nan)  # nfl4th has no punt option inside the opponent's 31
        sums = np.bincount(rows, weights=pdist["pct"].to_numpy() * wp_rows, minlength=n)
        has = np.bincount(rows, minlength=n) > 0
        wp_punt[has] = sums[has] / np.bincount(rows, weights=pdist["pct"].to_numpy(), minlength=n)[has]
    else:
        wp_punt = 1 - p["punt"]

    if "field_goal" in swaps:
        p_make = nfl4th_fg_make(d, n4["fg_prob"])
    else:
        p_make = field_goal.predict(models["fg"], _fg_inputs(d))
    wp_fg = p_make * (1 - p["fg_make"]) + (1 - p_make) * (1 - p["fg_miss"])

    out = pd.DataFrame({"play_uid": d["play_uid"], "p_convert": p_convert, "p_fg_make": p_make,
                        "wp_go": wp_go, "wp_punt": wp_punt, "wp_fg": wp_fg})
    out["recommendation"] = recommend(out)
    return out


def _rep(x: np.ndarray, k: int) -> np.ndarray:
    return np.repeat(x, k)


def _fg_inputs(d: pd.DataFrame) -> pd.DataFrame:
    outdoors = ~(d["is_indoors"].astype(bool) | (d["roof"] == "open"))
    return pd.DataFrame({
        "kick_distance": d["yardline_100"] + de.FG_SNAP_TO_KICK, "is_indoors": d["is_indoors"].astype(int),
        "is_turf": (d["surface_type"] == "turf").astype(int),
        "wind_mph": np.where(outdoors, d["wind_mph"].fillna(8), 0), "temp_f": np.where(outdoors, d["temp_f"].fillna(59), 70),
        "season": d["season"],
    })


def recommend(df: pd.DataFrame, cols=("wp_go", "wp_punt", "wp_fg")) -> np.ndarray:
    """argmax, skipping options that don't exist (NaN punt inside the 31 in nfl4th)."""
    wps = df[list(cols)].to_numpy(dtype=float)
    return np.array(OPTIONS)[np.nanargmax(np.where(np.isnan(wps), -np.inf, wps), axis=1)]


# --------------------------------------------------------------------------------- comparisons

YARDS_BINS = ([0, 1, 2, 3, 5, 7, 10, 99], ["1", "2", "3", "4-5", "6-7", "8-10", "11+"])
FIELD_BINS = ([0, 10, 20, 30, 40, 50, 60, 70, 80, 99],
              ["Opp 1-10", "Opp 11-20", "Opp 21-30", "Opp 31-40", "Opp 41-49 + 50", "Own 40-49", "Own 30-39",
               "Own 20-29", "Own 1-19"])
SCORE_BINS = ([-99, -9, -4, -1, 0, 3, 8, 99], ["Down 9+", "Down 4-8", "Down 1-3", "Tied", "Up 1-3", "Up 4-8", "Up 9+"])


def load_comparison(n4: dict) -> pd.DataFrame:
    seasons = ", ".join(map(str, SEASONS))
    ours = data.query(f"select * from marts.fct_fourth_down_decisions where season in ({seasons})")
    pre = n4["precomputed"].rename(columns={"go_wp": "n4_go", "punt_wp": "n4_punt", "fg_wp": "n4_fg",
                                            "go_boost": "n4_go_boost"})
    m = ours.merge(pre, on=["game_id", "play_id"], how="left")
    m.attrs["unmatched"] = int(m["n4_go"].isna().sum())
    m = m[m["n4_go"].notna()].reset_index(drop=True)
    m["n4_rec"] = recommend(m, ("n4_go", "n4_punt", "n4_fg"))
    m["yards_bucket"] = pd.cut(m["ydstogo"], YARDS_BINS[0], labels=YARDS_BINS[1])
    m["field_bucket"] = pd.cut(m["yardline_100"], FIELD_BINS[0], labels=FIELD_BINS[1])
    m["score_bucket"] = pd.cut(m["score_differential"], SCORE_BINS[0], labels=SCORE_BINS[1])
    return m


def go_rates(m: pd.DataFrame, by: str, ours_col: str = "recommendation") -> pd.DataFrame:
    return (m.groupby(by, observed=True)
            .apply(lambda x: pd.Series({"plays": len(x), "ours": (x[ours_col] == "go").mean(),
                                        "nfl4th": (x["n4_rec"] == "go").mean(), "coaches": x["is_go"].mean(),
                                        "agree": (x[ours_col] == x["n4_rec"]).mean()}), include_groups=False)
            .reset_index())


def attribution(m: pd.DataFrame, models: dict, lookups: dict, n4: dict) -> tuple[pd.DataFrame, dict]:
    """Go rate and agreement with nfl4th for: ours, each swap alone, all swaps, all-but-one."""
    base = evaluate_variant(m, models, lookups, n4)
    check = float(np.abs(base[["wp_go", "wp_punt", "wp_fg"]].to_numpy()
                         - m[["wp_go", "wp_punt", "wp_fg"]].to_numpy()).max())
    variants = {"ours": frozenset()}
    variants |= {f"+ {s}": frozenset({s}) for s in SWAPS}
    variants["all swaps"] = frozenset(SWAPS)
    # conversion_yards uses nfl4th's probability too, so "all but conversion" drops both
    variants["all but conversion"] = frozenset(SWAPS) - {"conversion_prob", "conversion_yards"}
    variants |= {f"all but {s}": frozenset(SWAPS) - {s} for s in SWAPS if not s.startswith("conversion")}
    rows, per_play = [], {}
    for name, swaps in variants.items():
        v = base if not swaps else evaluate_variant(m, models, lookups, n4, swaps)
        per_play[name] = v
        rec = v["recommendation"].to_numpy()
        rows.append({"variant": name, "go_rate": (rec == "go").mean(), "agree": (rec == m["n4_rec"].to_numpy()).mean(),
                     "go_6_10": (rec[m["ydstogo"].between(6, 10)] == "go").mean(),
                     "go_opp_11_30": (rec[m["yardline_100"].between(11, 30)] == "go").mean()})
    table = pd.DataFrame(rows)
    table.attrs["engine_reproduction_max_abs_diff"] = check
    return table, per_play


# ------------------------------------------------------------- which side do the outcomes favor?


def conversion_check(n4: dict, models: dict) -> pd.DataFrame:
    """Both conversion models on every real go attempt. The by-distance table uses 2024-2025 (2024 =
    our test season, 2025 unseen by our models); attrs["by_season"] adds 2023 (our calibration
    season). Selected sample: teams chose these attempts, the same sample for both models."""
    d = data.query(f"""
        select f.*, g.label_converted from marts.fct_fourth_downs f
        join features.feat_go_attempts g using (play_uid)
        where f.season in ({", ".join(map(str, SEASONS))}) and f.qtr <= 4
    """)
    d["ours"] = conversion.predict(models["conversion"], d.assign(is_turf=(d["surface_type"] == "turf").astype(int),
                                                                   is_indoors=d["is_indoors"].astype(int)))
    d["nfl4th"] = nfl4th_first_down_prob(d, nfl4th_gain_probs(d, n4["fd_model"]))
    agg = {"attempts": ("label_converted", "size"), "actual": ("label_converted", "mean"), "ours": ("ours", "mean"),
           "nfl4th": ("nfl4th", "mean")}
    by_season = pd.concat([
        d.groupby("season").agg(**agg).reset_index().assign(distance="All"),
        d[d["ydstogo"].between(4, 10)].groupby("season").agg(**agg).reset_index().assign(distance="4-10"),
    ], ignore_index=True)
    recent = d[d["season"] >= 2024].copy()
    recent["bucket"] = pd.cut(recent["ydstogo"], YARDS_BINS[0], labels=YARDS_BINS[1])
    out = recent.groupby("bucket", observed=True).agg(**agg).reset_index()
    total = pd.DataFrame([{"bucket": "All", "attempts": len(recent), "actual": recent["label_converted"].mean(),
                           "ours": recent["ours"].mean(), "nfl4th": recent["nfl4th"].mean()}])
    y = recent["label_converted"].to_numpy()
    out = pd.concat([out, total], ignore_index=True)
    out.attrs["brier"] = {k: float(((recent[k] - y) ** 2).mean()) for k in ("ours", "nfl4th")}
    out.attrs["by_season"] = by_season
    return out


def fg_check(n4: dict, models: dict) -> pd.DataFrame:
    d = data.query("""
        select f.*, a.label_made from marts.fct_fourth_downs f
        join features.feat_fg_attempts a using (play_uid) where f.season in (2024, 2025)
    """)
    d["ours"] = field_goal.predict(models["fg"], _fg_inputs(d))
    d["nfl4th"] = nfl4th_fg_make(d, n4["fg_prob"])
    d["kick"] = d["yardline_100"] + de.FG_SNAP_TO_KICK
    d["band"] = pd.cut(d["kick"], [17, 39, 44, 49, 54, 59, 70], labels=["<40", "40-44", "45-49", "50-54", "55-59", "60+"])
    return d.groupby("band", observed=True).agg(attempts=("label_made", "size"), actual=("label_made", "mean"),
                                                ours=("ours", "mean"), nfl4th=("nfl4th", "mean")).reset_index()


# ------------------------------------------------------------------------------ disagreements


def biggest_disagreements(m: pd.DataFrame, k: int = 20) -> pd.DataFrame:
    """Plays where the calls differ, ranked by how sure each model is of its own call:
    (our WP for our pick - our WP for theirs) + (their WP for their pick - their WP for ours)."""
    col = {"go": "wp_go", "punt": "wp_punt", "field_goal": "wp_fg"}
    n4col = {"go": "n4_go", "punt": "n4_punt", "field_goal": "n4_fg"}
    dis = m[m["recommendation"] != m["n4_rec"]].copy()
    pick = lambda df, cols, which: df.apply(lambda r: r[cols[r[which]]], axis=1)
    ours_edge = pick(dis, col, "recommendation") - pick(dis, col, "n4_rec")
    # our pick may be a punt nfl4th doesn't offer (inside the 31): then nfl4th's edge is over its runner-up
    n4_wps = dis[list(n4col.values())].to_numpy(dtype=float)
    n4_runner_up = np.sort(np.where(np.isnan(n4_wps), -np.inf, n4_wps), axis=1)[:, -2]
    n4_edge = pick(dis, n4col, "n4_rec") - pick(dis, n4col, "recommendation").fillna(pd.Series(n4_runner_up, dis.index))
    dis["ours_edge"], dis["n4_edge"] = ours_edge, n4_edge
    dis["size"] = ours_edge + n4_edge
    return dis.sort_values("size", ascending=False).head(k)


# ------------------------------------------------------------------------------------- report


def _pct(x: float, digits: int = 1) -> str:
    return "" if pd.isna(x) else f"{100 * x:.{digits}f}%"


def _md_table(df: pd.DataFrame, fmt: dict) -> str:
    cols = list(fmt)
    lines = ["| " + " | ".join(fmt[c][0] for c in cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join(fmt[c][1](r[c]) for c in cols) + " |")
    return "\n".join(lines)


def _clock(r) -> str:
    return f"Q{int(r['qtr'])} {r['clock']}"


def _score(diff: int) -> str:
    return "tied" if diff == 0 else (f"up {diff}" if diff > 0 else f"down {-diff}")


def _label(rec: str) -> str:
    return {"go": "Go", "punt": "Punt", "field_goal": "FG"}[rec]


def chart(by_yards: pd.DataFrame) -> None:
    theme.apply_theme()
    fig, ax = plt.subplots(figsize=(8, 4.8))
    x = np.arange(len(by_yards))
    for col, color, label in [("ours", theme.BLUE, "This project's engine"), ("nfl4th", theme.ORANGE, "nfl4th"),
                              ("coaches", theme.AQUA, "What coaches did")]:
        ax.plot(x, by_yards[col], color=color, marker="o", markersize=theme.MARKER_SIZE, markeredgecolor=theme.SURFACE,
                markeredgewidth=2, label=label, zorder=3)
    ax.set_xticks(x, by_yards["yards_bucket"].astype(str))
    ax.set_xlabel("Yards to go")
    ax.set_ylim(0, 1.02)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    # legend keys without the surface ring, which would make them look dashed
    handles = [Line2D([], [], color=line.get_color(), marker="o", markersize=7, markeredgewidth=0, label=line.get_label())
               for line in ax.get_lines()]
    ax.legend(handles=handles, loc="upper right")
    theme.headline(
        fig, "Both models say go far more than coaches do",
        f"Share of 4th downs where each says GO, {SEASONS[0]}-{SEASONS[-1]} regulation ({int(by_yards['plays'].sum()):,} plays)",
        f"nfl4th = Ben Baldwin's model (nflverse/nfl4th precomputed release). {DATA_SOURCE}.",
    )
    theme.save(fig, CHART)


FIXES = """1. **Long field goals were priced off elite kickers.** The FG model was fit on attempted kicks, and
   only teams that trust their kicker try a 60-yarder (since 2018, teams kick on 48% of 4th downs at 55
   yards but 5% at 60). Its 64-yard make probability was 42% and then fell off a cliff to 0% at 69. Now: the
   selection correction from nfl4th (blend toward the curve fit on distances everyone attempts,
   weighted by the attempt rate), tapering to 0% one yard past the longest make in the data
   (`models/field_goal.py`).
2. **No kneel-downs.** Down 1 with 0:40 left, punting from your own 30 to an opponent with no
   timeouts left: the WP model gave the punt 19%. In reality the opponent kneels and it's ~0%. A
   leader with a fresh set of downs and enough clock-killing kneels now wins (`kneel_out` in
   `models/decision_engine.py`, the same rule nfl4th uses).
3. **The half never ended.** Outcomes stopped the clock at 0:01, so a conversion with 3 seconds
   left in the half still had a snap to come, and the engine said go on 4th & 2 at the opponent's
   34 in that spot. An outcome that uses up the half now goes to the 2nd-half kickoff (or the
   final score in the 4th quarter) (`clock_expiry_wp`). These plays aren't graded (the final 30
   seconds of a half are excluded), but the calculator can reach them."""


def write_report(m: pd.DataFrame, table: pd.DataFrame, conv: pd.DataFrame, fg: pd.DataFrame,
                 dis: pd.DataFrame, findings: list[str]) -> None:
    overall = go_rates(m.assign(all="All"), "all")
    by_yards, by_field, by_score = (go_rates(m, b) for b in ("yards_bucket", "field_bucket", "score_bucket"))
    confusion = pd.crosstab(m["recommendation"].map(_label), m["n4_rec"].map(_label))
    rate_fmt = lambda name: {name: ("", str), "plays": ("Plays", lambda v: f"{int(v):,}"),
                             "ours": ("Ours: go", _pct), "nfl4th": ("nfl4th: go", _pct),
                             "coaches": ("Coaches went", _pct), "agree": ("Same call", _pct)}

    swap_rows = table.copy()
    base = swap_rows.iloc[0]
    swap_rows["delta"] = swap_rows["go_rate"] - base["go_rate"]
    tbl = _md_table(swap_rows, {
        "variant": ("Our engine with...", lambda v: f"`{v}`"),
        "go_rate": ("Go rate", _pct), "delta": ("vs ours", lambda v: f"{100 * v:+.1f} pts"),
        "agree": ("Agrees w/ nfl4th", _pct), "go_6_10": ("Go rate, 6-10 to go", _pct),
        "go_opp_11_30": ("Go rate, opp 11-30", _pct),
    })

    dis_lines = ["| # | Game | Situation | Coach | Ours (go / punt / FG) | nfl4th (go / punt / FG) | Ours | nfl4th |",
                 "|---|---|---|---|---|---|---|---|"]
    for i, (_, r) in enumerate(dis.iterrows(), 1):
        sit = (f"{_clock(r)}, {_score(int(r['score_differential']))}, 4th & {int(r['ydstogo'])} at "
               f"{r['yardline_label']} ({r['posteam']})")
        trio = lambda a, b, c: " / ".join(_pct(v, 0) if not pd.isna(v) else "n/a" for v in (a, b, c))
        dis_lines.append(f"| {i} | {r['season']} wk {r['week']} {r['game_id'][8:]} | {sit} | {_label(r['decision'])} | "
                         f"{trio(r['wp_go'], r['wp_punt'], r['wp_fg'])} | {trio(r['n4_go'], r['n4_punt'], r['n4_fg'])} | "
                         f"**{_label(r['recommendation'])}** | **{_label(r['n4_rec'])}** |")

    conv_tbl = _md_table(conv, {"bucket": ("Yards to go", str), "attempts": ("Attempts", lambda v: f"{int(v):,}"),
                                "actual": ("Converted", _pct), "ours": ("Ours predicted", _pct),
                                "nfl4th": ("nfl4th predicted", _pct)})
    season_tbl = _md_table(conv.attrs["by_season"], {
        "season": ("Season", str), "distance": ("Yards to go", str), "attempts": ("Attempts", lambda v: f"{int(v):,}"),
        "actual": ("Converted", _pct), "ours": ("Ours predicted", _pct), "nfl4th": ("nfl4th predicted", _pct)})
    fg_tbl = _md_table(fg, {"band": ("Kick distance", str), "attempts": ("Attempts", lambda v: f"{int(v):,}"),
                            "actual": ("Made", _pct), "ours": ("Ours predicted", _pct), "nfl4th": ("nfl4th predicted", _pct)})

    text = f"""# Benchmark: this engine vs nfl4th

Regulation 4th downs, {SEASONS[0]}-{SEASONS[-1]}: {len(m):,} plays matched to nfl4th by game and play id
({m.attrs.get('unmatched', 0)} of ours had no nfl4th row). nfl4th numbers come from its precomputed release file
(downloaded {date.today().isoformat()}); its component tables are pinned to commit `{NFL4TH_COMMIT[:7]}`.
Reproduce with `uv run python -m models.nfl4th_benchmark`.

## Summary

{chr(10).join(f'- {f}' for f in findings)}

![go rate by distance](nfl4th_go_rate_by_distance.png)

## Go rate and agreement

{_md_table(overall, rate_fmt('all') | {'all': ('', str)})}

Recommendations side by side (rows = ours, columns = nfl4th):

{confusion.to_markdown()}

### By yards to go

{_md_table(by_yards, rate_fmt('yards_bucket') | {'yards_bucket': ('Yards to go', str)})}

### By field position

{_md_table(by_field, rate_fmt('field_bucket') | {'field_bucket': ('Line of scrimmage', str)})}

### By score

{_md_table(by_score, rate_fmt('score_bucket') | {'score_bucket': ('Offense is', str)})}

## Where the gap comes from

Method: keep this project's WP model and swap in nfl4th's version of one component at a time.
"+ X" = only X swapped. "all but X" = every swap except X, so the drop from "all swaps" to "all but X" is
what X contributes once everything else matches nfl4th. With no swaps, the code reproduces the stored
engine output to {table.attrs['engine_reproduction_max_abs_diff']:.1e}.

{chr(10).join(f'- `{k}`: {v}' for k, v in SWAPS.items())}

{tbl}

What "all swaps" still doesn't change: the WP model (nfl4th averages its own model with nflfastR's),
and touchdowns (nfl4th: +6 then the better of the PAT and 2-pt try; ours: +7). The kneel-out and end-of-half
rules already match nfl4th's in both columns. The remaining gap between "all swaps" and nfl4th's own calls is
the WP model plus the touchdown detail: it barely moves the go rate but accounts for most of the remaining
{100 * (1 - table.set_index('variant').loc['all swaps', 'agree']):.0f}% of plays where the calls differ.

### Which conversion model fits real attempts better?

Every real go-for-it attempt in 2024-2025 (2024 is our test season, 2025 is unseen). Teams chose these
attempts, so this is a selected sample, but the same one for both models.
Brier: ours {conv.attrs['brier']['ours']:.4f}, nfl4th {conv.attrs['brier']['nfl4th']:.4f} (lower is better).

{conv_tbl}

By season (2023 is the season our model's Platt step was calibrated on, so it isn't out of sample for ours):

{season_tbl}

### Which FG model fits real kicks better?

Every 4th-down field goal attempt in 2024-2025. Past ~55 yards both models sit below the actual rate on
purpose: these are kicks teams chose to try, made by kickers they trust, while the engine has to price
the kick for an average kicker (see "Fixes" below).

{fg_tbl}

## Fixes made because of this benchmark

The first run (engine at commit `9ae2c3a`) said go on 44.8% of these plays, agreed with nfl4th on 78.9%, and
its biggest disagreements exposed three engine bugs. None of them was the cause of the go-rate gap, but
each one produced recommendations that were plainly wrong:

{FIXES}

After the fixes the engine says go a little more often (the corrected FG odds and the kneel-out rule both
favor going), and agreement with nfl4th went up.

## The 20 biggest disagreements

Ranked by how sure both models are of opposite calls (our edge for our pick + nfl4th's edge for its pick).
WP is for the team with the ball. nfl4th has no punt option inside the opponent's 31 ("n/a").

{chr(10).join(dis_lines)}
"""
    REPORT.write_text(text.replace("{FIXES}", FIXES))
    print(f"  wrote {REPORT.relative_to(REPO_ROOT)}")


def summarize(m: pd.DataFrame, table: pd.DataFrame, conv: pd.DataFrame) -> list[str]:
    """The summary bullets, computed so they can't drift from the tables."""
    row = table.set_index("variant")
    ours, n4, coaches = (m["recommendation"] == "go").mean(), (m["n4_rec"] == "go").mean(), m["is_go"].mean()
    agree = (m["recommendation"] == m["n4_rec"]).mean()
    ours_adv, n4_adv = m["go_advantage"], m["n4_go_boost"] / 100
    go_dis = m[(m["recommendation"] == "go") != (m["n4_rec"] == "go")].index
    tossups = ((ours_adv[go_dis].abs() < 0.01) & (n4_adv[go_dis].abs() < 0.01)).mean()
    seasons = go_rates(m, "season").set_index("season")
    others = {k: abs(row.loc[f"+ {k}", "go_rate"] - row.loc["ours", "go_rate"]) for k in SWAPS
              if not k.startswith("conversion")}
    bs = conv.attrs["by_season"]
    mid = bs[bs["distance"] == "4-10"].set_index("season")
    allr = bs[bs["distance"] == "All"].set_index("season")
    return [
        (f"**The high go rate is mostly shared with nfl4th.** nfl4th says go on {_pct(n4)} of these 4th downs, this "
         f"engine on {_pct(ours)}, coaches went for it on {_pct(coaches)}. Both models say teams should go about twice "
         f"as often as they do. The gap between the models is {100 * (ours - n4):.1f} points, and the two make the "
         f"same call on {_pct(agree)} of plays."),
        (f"**Yes, this engine is systematically more aggressive, and the conversion model is why.** Swapping in "
         f"nfl4th's P(first down) alone takes the go rate from {_pct(row.loc['ours', 'go_rate'])} to "
         f"{_pct(row.loc['+ conversion_prob', 'go_rate'])}. Swapping every other component (FG, punt, clock, kickoff) "
         f"moves it by {100 * max(others.values()):.1f} points or less each. With every swap, the go rate is "
         f"{_pct(row.loc['all swaps', 'go_rate'])}, within {100 * abs(row.loc['all swaps', 'go_rate'] - n4):.1f} "
         f"points of nfl4th's."),
        (f"**Real outcomes back our conversion odds, not nfl4th's lower ones.** On every real go attempt, our model's "
         f"average prediction is within {100 * (allr['ours'] - allr['actual']).abs().max():.1f} points of the actual "
         f"rate in each season; nfl4th's is {100 * (allr['actual'] - allr['nfl4th']).min():.1f}-"
         f"{100 * (allr['actual'] - allr['nfl4th']).max():.1f} points low. At 4-10 yards to go, where most of the gap "
         f"lives, teams converted {_pct(mid.loc[2024, 'actual'])} (2024) and {_pct(mid.loc[2025, 'actual'])} (2025); "
         f"we predicted {_pct(mid.loc[2024, 'ours'])} and {_pct(mid.loc[2025, 'ours'])}, nfl4th "
         f"{_pct(mid.loc[2024, 'nfl4th'])} and {_pct(mid.loc[2025, 'nfl4th'])}. Brier scores on 2024-2025 attempts "
         f"are a tie ({conv.attrs['brier']['ours']:.4f} vs {conv.attrs['brier']['nfl4th']:.4f})."),
        ("**Decision: document, don't change the conversion model.** The caveat that remains: both models only see "
         "attempts teams chose. Ours is trained on 4th-down attempts only; nfl4th also learns from 3rd downs, where "
         "nearly everyone goes for it, which may explain why it is more conservative. Outcomes can't settle how plays "
         "that were never attempted would have gone."),
        (f"**The gap grows by season** ({_pct(seasons.loc[2023, 'ours'])} vs {_pct(seasons.loc[2023, 'nfl4th'])} "
         f"in 2023, {_pct(seasons.loc[2025, 'ours'])} vs {_pct(seasons.loc[2025, 'nfl4th'])} in 2025). Our conversion "
         f"model uses each team's recent offensive and defensive EPA, which rose in 2024-2025 along with real conversion "
         f"rates; nfl4th's sees team quality only through the point spread and total."),
        (f"**Most disagreements are coin flips.** In {_pct(tossups, 0)} of plays where one model says go and the other "
         f"doesn't, both models put the gap under 1 WP point. Counting only clear calls (go is better by 1+ point), "
         f"the go rates are {_pct((ours_adv >= 0.01).mean())} (ours) vs {_pct((n4_adv >= 0.01).mean())} (nfl4th)."),
        ("**The benchmark found three real bugs**, fixed below (long FGs, kneel-downs, end of half). They weren't the "
         "cause of the gap, but each produced recommendations that were plainly wrong in late-game situations."),
    ]


def run() -> dict:
    print("nfl4th benchmark: loading nfl4th release files and our scored decisions")
    n4 = load_nfl4th()
    models, lookups = de.load_models(), de.load_lookups()
    m = load_comparison(n4)
    print(f"  matched {len(m):,} plays; ours go {np.mean(m['recommendation'] == 'go'):.1%}, "
          f"nfl4th go {np.mean(m['n4_rec'] == 'go'):.1%}, agree {np.mean(m['recommendation'] == m['n4_rec']):.1%}")
    table, _ = attribution(m, models, lookups, n4)
    print(table.to_string(index=False))
    conv, fg = conversion_check(n4, models), fg_check(n4, models)
    dis = biggest_disagreements(m)
    chart(go_rates(m, "yards_bucket"))
    findings = summarize(m, table, conv)
    write_report(m, table, conv, fg, dis, findings)
    return {"m": m, "table": table, "conv": conv, "fg": fg, "dis": dis}


if __name__ == "__main__":
    run()
