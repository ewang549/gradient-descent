"""Export the decision engine for the browser calculator: `python -m models.export_web`.

Writes web/public/models/ (everything the TypeScript engine loads) and the parity fixtures the
web test suite checks the TypeScript port against:

  wp.onnx, wp_onnx_contract.json   win probability (onnxruntime-web)
  conversion.json                   XGBoost trees + Platt calibration (a tiny tree walker in TS)
  field_goal.json                   logistic regression coefficients + the long-kick correction
  engine.json                       punt lookup, kickoff starts, clock runoffs, conversion gains, constants
  presets.json                      the famous 4th downs, with their full game context

  web/tests/fixtures/parity.json    random real 4th downs with every engine input and the Python
                                    engine's outputs; the TS engine must match to 1e-4
"""

from __future__ import annotations

import json
import shutil

import joblib
import numpy as np
import pandas as pd

from models import conversion, data, field_goal, findings, punt, wp
from models import decision_engine as de
from models.config import ARTIFACTS_DIR, REPO_ROOT

WEB = REPO_ROOT / "web"
OUT = WEB / "public" / "models"
FIXTURES = WEB / "tests" / "fixtures"
PARITY_RANDOM = 500
PARITY_LATE = 100   # extra plays from the last 2 minutes of a half, where the football-rule overrides fire
SEED = 2026

OUTPUTS = ["wp_now", "p_convert", "wp_if_convert", "wp_if_fail", "wp_go", "punt_receiving_yardline_100", "wp_punt",
           "fg_distance", "p_fg_make", "wp_if_fg_make", "wp_if_fg_miss", "wp_fg"]


def _clean(obj):
    """NaN -> null (JSON has no NaN). Only team EPA can be missing (a team's first games of a
    season); the TS engine reads null back as NaN, which XGBoost and the tree walker both send
    down the 'no' branch."""
    if isinstance(obj, float) and np.isnan(obj):
        return None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


def _write(obj, path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_clean(obj), separators=(",", ":"), allow_nan=False) + "\n")


# --------------------------------------------------------------------------------- the models


def conversion_json() -> dict:
    """XGBoost margin = logit(base_score) + sum of leaves; p = sigmoid(margin); then Platt:
    p_cal = 1 / (1 + exp(a * p + b)) (sklearn's _SigmoidCalibration on predict_proba)."""
    bundle = joblib.load(conversion.ARTIFACT)
    booster = bundle["base"].get_booster()
    cfg = json.loads(booster.save_config())
    base_score = float(cfg["learner"]["learner_model_param"]["base_score"].strip("[]"))
    features = list(conversion.FEATURES)

    def flatten(node: dict) -> list:
        # compact array form: leaf -> [value]; split -> [feature index, threshold, yes subtree, no subtree]
        if "leaf" in node:
            return [node["leaf"]]
        kids = {c["nodeid"]: c for c in node["children"]}
        assert node["missing"] == node["no"]  # no missing values reach the model; documented, not used
        return [features.index(node["split"]), node["split_condition"], flatten(kids[node["yes"]]),
                flatten(kids[node["no"]])]

    trees = [flatten(json.loads(t)) for t in booster.get_dump(dump_format="json")]
    platt = bundle["calibrated"].calibrated_classifiers_[0].calibrators[0]
    return {"features": features, "base_score": base_score, "trees": trees,
            "platt": {"a": float(platt.a_), "b": float(platt.b_)}}


def _logistic(pipe, columns: list[str], expander: str) -> dict:
    scaler, lr = pipe[1], pipe[2]
    return {"expander": expander, "columns": columns, "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
            "coef": lr.coef_[0].tolist(), "intercept": float(lr.intercept_[0])}


def field_goal_json() -> dict:
    """Terms: quadratic = [d, d^2, indoors, turf, wind, temp, d*wind, (season)];
    linear = [d, indoors, turf, wind, temp, d*wind, (season)]."""
    b = joblib.load(field_goal.ARTIFACT)
    sel = b["selection"]
    return {
        "observed": _logistic(b["model"], b["columns"], "quadratic"),
        "unselected": _logistic(sel["unselected_model"], b["columns"], "linear"),
        "weights": {"outdoors": sel["weights"][0], "indoors": sel["weights"][1]},
        "taper_from": sel["taper_from"], "taper_zero": sel["taper_zero"], "max_season": int(b["max_season"]),
        "max_lookup_distance": field_goal.MAX_LOOKUP_DISTANCE, "logit_clip": 1e-6,
    }


def engine_json() -> dict:
    lookups = de.load_lookups()
    punt_model = joblib.load(punt.ARTIFACT)
    yardlines = np.arange(1, 100)
    return {
        "punt_receiving_yardline_100": dict(zip(map(str, yardlines), punt.predict(punt_model, yardlines).tolist())),
        "kickoff_start": {str(int(k)): float(v) for k, v in lookups["kickoff_start"].items()},
        "kickoff_start_fallback": float(max(lookups["kickoff_start"].values())),
        "runoff": {outcome: {"final_two_minutes" if late else "other": float(v)
                             for (o, late), v in lookups["runoff"].items() if o == outcome}
                   for outcome in sorted({o for o, _ in lookups["runoff"]})},
        "conversion_gain": {str(int(k)): float(v) for k, v in lookups["conversion_gain"].items()},
        "constants": {"fg_snap_to_kick": de.FG_SNAP_TO_KICK, "missed_fg_spot_back": de.MISSED_FG_SPOT_BACK,
                      "touchdown_points": de.TOUCHDOWN_POINTS, "late_half_seconds": 120},
    }


# ------------------------------------------------------------------------- engine inputs (TS)


def engine_inputs(d: pd.DataFrame) -> list[dict]:
    """The TS engine's input shape. Weather is resolved here exactly as the Python engine does it
    (no wind/temperature indoors or under an open roof; missing readings -> outdoor medians)."""
    outdoors = ~(d["is_indoors"].astype(bool) | (d["roof"] == "open"))
    rows = pd.DataFrame({
        "season": d["season"].astype(int),
        "qtr": d["qtr"].astype(int),
        "scoreDiff": d["score_differential"].astype(int),
        "gameSeconds": d["game_seconds_remaining"].astype(int),
        "halfSeconds": d["half_seconds_remaining"].astype(int),
        "ydstogo": d["ydstogo"].astype(int),
        "yardline100": d["yardline_100"].astype(int),
        "goalToGo": d["is_goal_to_go"].astype(bool),
        "posTimeouts": d["posteam_timeouts_remaining"].astype(int),
        "defTimeouts": d["defteam_timeouts_remaining"].astype(int),
        "home": np.where(d["is_neutral_site"], 0, np.where(d["is_posteam_home"], 1, -1)).astype(int),
        "spread": d["posteam_spread_line"].astype(float),
        "receives2hKickoff": d["is_receiving_2h_kickoff"].astype(bool),
        "offEpa": d["posteam_off_epa_last_8"].astype(float),
        "defEpa": d["defteam_def_epa_last_8"].astype(float),
        "indoors": d["is_indoors"].astype(bool),
        "turf": d["surface_type"].eq("turf"),
        "windMph": np.where(outdoors, d["wind_mph"].fillna(8), 0).astype(float),
        "tempF": np.where(outdoors, d["temp_f"].fillna(59), 70).astype(float),
    })
    return rows.to_dict(orient="records")


def _python_outputs(d: pd.DataFrame, models: dict, lookups: dict) -> pd.DataFrame:
    out = de.evaluate_options(d, models, lookups)
    out["recommendation"] = de.recommend(out).to_numpy()
    return out


def parity_fixture(models: dict, lookups: dict) -> dict:
    decisions = de.load_decisions()
    decisions = decisions[decisions["posteam_spread_line"].notna()]
    rng = np.random.default_rng(SEED)
    random_rows = decisions.iloc[rng.choice(len(decisions), PARITY_RANDOM, replace=False)]
    late_pool = decisions[(decisions["half_seconds_remaining"] <= 120) & ~decisions.index.isin(random_rows.index)]
    late_rows = late_pool.iloc[rng.choice(len(late_pool), PARITY_LATE, replace=False)]
    cases = {}
    for name, rows in {"random": random_rows, "late_half": late_rows}.items():
        rows = rows.reset_index(drop=True)
        out = _python_outputs(rows, models, lookups)
        cases[name] = [{"play_uid": uid, "input": inp, "expected": {k: float(o[k]) for k in OUTPUTS} |
                        {"recommendation": o["recommendation"]}}
                       for uid, inp, (_, o) in zip(rows["play_uid"], engine_inputs(rows), out.iterrows())]
    return {"seed": SEED, "tolerance": 1e-4, "cases": cases}


def presets(models: dict, lookups: dict) -> list[dict]:
    ids = [uid for uid, _, _ in findings.FAMOUS]
    meta = {uid: (name, game) for uid, name, game in findings.FAMOUS}
    rows = de.load_decisions(f"play_uid in ({', '.join(repr(u) for u in ids)})")
    extra = data.query(f"""
        select play_uid, posteam, defteam, clock, yardline_label, decision
        from marts.fct_fourth_downs where play_uid in ({', '.join(repr(u) for u in ids)})
    """)
    rows = rows.drop(columns=["decision"]).merge(extra, on="play_uid")
    rows = rows.set_index("play_uid").loc[ids].reset_index()
    out = _python_outputs(rows, models, lookups)
    return [{"id": uid, "name": meta[uid][0], "game": meta[uid][1], "team": r["posteam"], "opponent": r["defteam"],
             "clock": r["clock"], "yardlineLabel": r["yardline_label"], "coach": r["decision"],
             "input": inp, "expected": {k: float(o[k]) for k in ("wp_go", "wp_punt", "wp_fg")}}
            for uid, (_, r), inp, (_, o) in zip(ids, rows.iterrows(), engine_inputs(rows), out.iterrows())]


def run() -> None:
    models, lookups = de.load_models(), de.load_lookups()
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy(ARTIFACTS_DIR / "wp.onnx", OUT / "wp.onnx")
    shutil.copy(ARTIFACTS_DIR / "wp_onnx_contract.json", OUT / "wp_onnx_contract.json")
    _write(conversion_json(), OUT / "conversion.json")
    _write(field_goal_json(), OUT / "field_goal.json")
    _write(engine_json(), OUT / "engine.json")
    _write(presets(models, lookups), OUT / "presets.json")
    fixture = parity_fixture(models, lookups)
    _write(fixture, FIXTURES / "parity.json")
    assert list(wp.FEATURES) == json.loads((OUT / "wp_onnx_contract.json").read_text())["feature_order"]
    for f in sorted(OUT.iterdir()):
        print(f"  {f.relative_to(REPO_ROOT)}  {f.stat().st_size / 1024:.0f} KB")
    print(f"  {(FIXTURES / 'parity.json').relative_to(REPO_ROOT)}  "
          f"{sum(len(v) for v in fixture['cases'].values())} cases")


if __name__ == "__main__":
    run()
