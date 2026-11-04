"""Decision engine: the win probability of every option on every regulation 4th down.

    WP(go)   = p_convert * WP(first down)       + (1 - p_convert) * WP(turnover on downs)
    WP(punt) = WP(opponent's ball where punts from here typically leave them)
    WP(fg)   = p_make    * WP(+3, then kick off) + (1 - p_make)    * WP(opponent's ball at the kick spot)

Every "after" state goes through the same WP model from the side of whoever has the ball. When the
opponent has it, the state is flipped (score, spread, timeouts, home) and WP = 1 - their WP.
Constants such as yards gained on a conversion, clock used per outcome, and drive starts after a
kickoff come from dbt lookup tables built from the data, not hand-typed numbers.
"""

from __future__ import annotations

import joblib
import numpy as np
import pandas as pd

from models import conversion, data, field_goal, punt, wp

FG_SNAP_TO_KICK = 18      # kick distance = line of scrimmage + 18 (verified in the data)
MISSED_FG_SPOT_BACK = 8   # a miss is spotted where it was kicked: 8 yards behind the line
TOUCHDOWN_POINTS = 7      # TD + PAT, close enough for WP (PATs are ~94%)


def load_decisions(where: str = "true") -> pd.DataFrame:
    return data.query(f"""
        select play_uid, season, week, qtr, decision, is_posteam_home, is_neutral_site,
               score_differential, game_seconds_remaining, half_seconds_remaining, ydstogo, yardline_100,
               is_goal_to_go, posteam_timeouts_remaining, defteam_timeouts_remaining, posteam_spread_line,
               is_receiving_2h_kickoff, posteam_off_epa_last_8, defteam_def_epa_last_8, is_indoors, surface_type,
               roof, wind_mph, temp_f
        from marts.fct_fourth_downs
        where qtr <= 4 and ({where})   -- overtime has different rules and its own clock
    """)


def load_models() -> dict:
    return {
        "wp": joblib.load(wp.ARTIFACT),
        "conversion": joblib.load(conversion.ARTIFACT),
        "fg": joblib.load(field_goal.ARTIFACT),
        "punt": joblib.load(punt.ARTIFACT),
    }


def load_lookups() -> dict:
    kick = data.query("select season, avg_receiving_yardline_100 from features.feat_kickoff_starts")
    runoff = data.query("select outcome, is_final_two_minutes, median_runoff_seconds from features.feat_clock_runoff")
    gains = data.query("select ydstogo_capped, avg_yards_gained from features.feat_conversion_gains")
    return {
        "kickoff_start": dict(zip(kick["season"], kick["avg_receiving_yardline_100"])),
        "runoff": {(r.outcome, bool(r.is_final_two_minutes)): r.median_runoff_seconds for r in runoff.itertuples()},
        "conversion_gain": dict(zip(gains["ydstogo_capped"], gains["avg_yards_gained"])),
    }


# ----------------------------------------------------------------------------------- game states


def _home(d: pd.DataFrame) -> np.ndarray:
    return np.where(d["is_neutral_site"], 0, np.where(d["is_posteam_home"], 1, -1))


def _clock(d: pd.DataFrame, runoff: np.ndarray) -> dict:
    """Run the clock forward, stopping one second short of the end of the half."""
    half_left = np.maximum(d["half_seconds_remaining"].to_numpy() - runoff, 1)
    used = d["half_seconds_remaining"].to_numpy() - half_left
    return {"half_seconds_remaining": half_left, "game_seconds_remaining": d["game_seconds_remaining"].to_numpy() - used}


def _runoff(d: pd.DataFrame, lookups: dict, outcome: str) -> np.ndarray:
    late = d["half_seconds_remaining"].to_numpy() <= 120
    return np.where(late, lookups["runoff"][(outcome, True)], lookups["runoff"][(outcome, False)])


def current_state(d: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "score_differential": d["score_differential"].to_numpy(),
        "game_seconds_remaining": d["game_seconds_remaining"].to_numpy(),
        "half_seconds_remaining": d["half_seconds_remaining"].to_numpy(),
        "down": 4, "ydstogo": d["ydstogo"].to_numpy(), "yardline_100": d["yardline_100"].to_numpy(),
        "posteam_timeouts_remaining": d["posteam_timeouts_remaining"].to_numpy(),
        "defteam_timeouts_remaining": d["defteam_timeouts_remaining"].to_numpy(),
        "home": _home(d), "posteam_spread_line": d["posteam_spread_line"].to_numpy(),
        "is_receiving_2h_kickoff": d["is_receiving_2h_kickoff"].astype(int).to_numpy(),
    })


def offense_keeps_ball(d: pd.DataFrame, *, yardline: np.ndarray, runoff: np.ndarray) -> pd.DataFrame:
    """1st down for the same team (after a conversion)."""
    state = current_state(d)
    state.update(_clock(d, runoff))
    state["down"] = 1
    state["yardline_100"] = yardline
    state["ydstogo"] = np.minimum(10, yardline)  # inside the 10 it's 1st & goal
    return state


def opponent_gets_ball(d: pd.DataFrame, *, offense_points: np.ndarray, opp_yardline: np.ndarray,
                       runoff: np.ndarray) -> pd.DataFrame:
    """1st down for the other team, described from ITS side of the ball."""
    state = current_state(d)
    state.update(_clock(d, runoff))
    state["score_differential"] = -(d["score_differential"].to_numpy() + offense_points)
    state["down"] = 1
    state["yardline_100"] = opp_yardline
    state["ydstogo"] = np.minimum(10, opp_yardline)
    state["posteam_timeouts_remaining"] = d["defteam_timeouts_remaining"].to_numpy()
    state["defteam_timeouts_remaining"] = d["posteam_timeouts_remaining"].to_numpy()
    state["home"] = -_home(d)
    state["posteam_spread_line"] = -d["posteam_spread_line"].to_numpy()
    # in the first half exactly one team gets the 2nd-half kickoff
    state["is_receiving_2h_kickoff"] = ((d["qtr"] <= 2) & ~d["is_receiving_2h_kickoff"].astype(bool)).astype(int).to_numpy()
    return state


# ----------------------------------------------------------------------------------- the engine


def evaluate_options(d: pd.DataFrame, models: dict, lookups: dict) -> pd.DataFrame:
    d = d.reset_index(drop=True)
    yl = d["yardline_100"].to_numpy()
    kickoff_start = d["season"].map(lookups["kickoff_start"]).fillna(max(lookups["kickoff_start"].values()))
    kickoff_start = kickoff_start.to_numpy()
    zero = np.zeros(len(d))

    # go: average gain on a conversion (at least the line to gain); goal-to-go conversions are TDs
    gain = np.maximum(d["ydstogo"], d["ydstogo"].clip(upper=10).map(lookups["conversion_gain"])).to_numpy()
    new_yl = yl - gain
    touchdown = d["is_goal_to_go"].to_numpy() | (new_yl <= 0)
    states = {
        "now": current_state(d),
        "convert": offense_keeps_ball(d, yardline=np.maximum(new_yl, 1), runoff=_runoff(d, lookups, "go_converted")),
        "convert_td": opponent_gets_ball(d, offense_points=zero + TOUCHDOWN_POINTS, opp_yardline=kickoff_start,
                                         runoff=_runoff(d, lookups, "fg_made")),
        "fail": opponent_gets_ball(d, offense_points=zero, opp_yardline=100 - yl, runoff=_runoff(d, lookups, "go_failed")),
        "punt": opponent_gets_ball(d, offense_points=zero, opp_yardline=punt.predict(models["punt"], yl),
                                   runoff=_runoff(d, lookups, "punt")),
        "fg_make": opponent_gets_ball(d, offense_points=zero + 3, opp_yardline=kickoff_start,
                                      runoff=_runoff(d, lookups, "fg_made")),
        "fg_miss": opponent_gets_ball(d, offense_points=zero,
                                      opp_yardline=np.minimum(80, 100 - (yl + MISSED_FG_SPOT_BACK)),
                                      runoff=_runoff(d, lookups, "fg_missed")),
    }
    # one batched WP call for every state of every play
    stacked = pd.concat(states.values(), keys=states.keys())
    probs = pd.Series(wp.predict(models["wp"], wp.derive_features(stacked)), index=stacked.index)
    p = {name: probs.loc[name].to_numpy() for name in states}

    p_convert = conversion.predict(models["conversion"], d.assign(is_turf=(d["surface_type"] == "turf").astype(int),
                                                                   is_indoors=d["is_indoors"].astype(int)))
    outdoors = ~(d["is_indoors"].astype(bool) | (d["roof"] == "open"))
    fg_inputs = pd.DataFrame({
        "kick_distance": yl + FG_SNAP_TO_KICK,
        "is_indoors": d["is_indoors"].astype(int),
        "is_turf": (d["surface_type"] == "turf").astype(int),
        "wind_mph": np.where(outdoors, d["wind_mph"].fillna(8), 0),   # same imputation as feat_fg_attempts
        "temp_f": np.where(outdoors, d["temp_f"].fillna(59), 70),
        "season": d["season"],
    })
    p_make = field_goal.predict(models["fg"], fg_inputs)

    wp_if_convert = np.where(touchdown, 1 - p["convert_td"], p["convert"])
    wp_if_fail = 1 - p["fail"]
    wp_if_fg_make, wp_if_fg_miss = 1 - p["fg_make"], 1 - p["fg_miss"]
    return pd.DataFrame({
        "play_uid": d["play_uid"],
        "wp_now": p["now"],
        "p_convert": p_convert,
        "wp_if_convert": wp_if_convert,
        "wp_if_fail": wp_if_fail,
        "wp_go": p_convert * wp_if_convert + (1 - p_convert) * wp_if_fail,
        "punt_receiving_yardline_100": punt.predict(models["punt"], yl),
        "wp_punt": 1 - p["punt"],
        "fg_distance": yl + FG_SNAP_TO_KICK,
        "p_fg_make": p_make,
        "wp_if_fg_make": wp_if_fg_make,
        "wp_if_fg_miss": wp_if_fg_miss,
        "wp_fg": p_make * wp_if_fg_make + (1 - p_make) * wp_if_fg_miss,
    })


def recommend(options: pd.DataFrame) -> pd.Series:
    wps = options[["wp_go", "wp_punt", "wp_fg"]].to_numpy()
    return pd.Series(np.array(["go", "punt", "field_goal"])[wps.argmax(axis=1)], index=options.index)
