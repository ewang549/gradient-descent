"""Phase 3c: the situation pool for "You Make the Call" (/play). `python -m models.play`

exports/play/pool.json
  teams        display colors for every team in the pool
  situations   real graded 4th downs from the last two seasons, each tagged
                 famous   a playoff game, a week's single worst call, or a 4th-quarter one-score spot
                          where the options are far apart
                 clear    the model's pick beats the runner-up by >= 3 WP points
                 close    the pick wins by < 1 point (but the options aren't all the same)
               A spot qualifies for only one tag, in that order of precedence.

Spots where every available option is within 0.5 WP points are skipped: there's nothing to get
right. A field goal counts as available only when the kick is in range (P(make) >= 0.5%), and
the page disables the FG button otherwise.

The site picks a random 10 (4 clear, 3 close, 3 famous) or the daily 5 (2/2/1, seeded by date)
from this file in the browser, so no backend is needed.
"""

from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd

from models import data
from models.config import EXPORTS_DIR
from models.export_web import engine_inputs

SEASONS_BACK = 2           # the current season and the one before
MIN_SPREAD = 0.005         # skip spots where every available option is within this much WP
FG_IN_RANGE = 0.005        # P(make) needed for the FG button to be live
CLEAR_MARGIN = 0.03
CLOSE_MARGIN = 0.01
LEVERAGE_SPREAD = 0.03     # 4th-quarter one-score spots count as famous when options differ this much
SEED = 20261104

# how many of each kind to keep; clear calls are split by the right answer so "always go" doesn't win
TARGETS = {"playoffs": 50, "crunch": 30, "close": 110, ("clear", "go"): 50, ("clear", "punt"): 40, ("clear", "field_goal"): 40}

PLAYOFF_ROUND = {"WC": "Wild Card round", "DIV": "Divisional round", "CON": "Conference championship",
                 "SB": "Super Bowl"}


def load(season_from: int) -> pd.DataFrame:
    df = data.query(f"""
        with d as (
            select *, row_number() over (partition by season, week order by wp_lost desc) as week_rank
            from marts.fct_fourth_down_decisions
            where season >= {season_from} and is_graded
        )
        select d.*, s.home_team, s.away_team, s.home_score as final_home_score, s.away_score as final_away_score
        from d join staging.stg_schedules s using (game_id)
        order by season, week, game_id, play_seq
    """)
    in_range = df["p_fg_make"] >= FG_IN_RANGE
    available = np.where(in_range.to_numpy()[:, None], df[["wp_go", "wp_punt", "wp_fg"]], np.c_[
        df["wp_go"], df["wp_punt"], df["wp_go"]])  # out of range: FG drops out (repeat go so min/max ignore it)
    df["fg_in_range"] = in_range
    df["option_spread"] = available.max(axis=1) - available.min(axis=1)
    return df


def tag(df: pd.DataFrame) -> pd.DataFrame:
    playoff = df["game_type"] != "REG"
    worst_of_week = (df["week_rank"] == 1) & (df["wp_lost"] > 0)
    leverage = (df["qtr"] == 4) & (df["score_differential"].abs() <= 8) & (df["option_spread"] >= LEVERAGE_SPREAD)
    famous = playoff | worst_of_week | leverage
    df = df.assign(
        kind=np.select([famous, df["recommendation_margin"] >= CLEAR_MARGIN, df["recommendation_margin"] < CLOSE_MARGIN],
                       ["famous", "clear", "close"], default=""),
        label=np.select(
            [playoff, worst_of_week, leverage],
            [df["game_type"].map(PLAYOFF_ROUND).fillna("Playoffs"), "Worst call of Week " + df["week"].astype(str),
             "Crunch time"], default=""),
    )
    return df[(df["option_spread"] >= MIN_SPREAD) & (df["kind"] != "")]


def select(df: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    def take(rows: pd.DataFrame, n: int) -> pd.DataFrame:
        return rows if len(rows) <= n else rows.iloc[np.sort(rng.choice(len(rows), n, replace=False))]

    famous = df[df["kind"] == "famous"]
    worst = famous["label"].str.startswith("Worst call")
    crunch = famous["label"] == "Crunch time"
    # every week's worst call stays; playoff spots favor the ones where the options are far apart
    playoffs = famous[~worst & ~crunch].sort_values("option_spread", ascending=False).head(TARGETS["playoffs"] * 2)
    parts = [famous[worst], take(playoffs, TARGETS["playoffs"]), take(famous[crunch], TARGETS["crunch"]),
             take(df[df["kind"] == "close"], TARGETS["close"])]
    for option in ("go", "punt", "field_goal"):
        parts.append(take(df[(df["kind"] == "clear") & (df["recommendation"] == option)], TARGETS[("clear", option)]))
    return pd.concat(parts).sort_values(["season", "week", "game_id", "play_seq"])


def _outcome(r) -> str:
    if r.is_nullified_by_penalty:
        return "penalty"  # a kick wiped out by a penalty still counts as the coach's call
    if r.decision == "go":
        if pd.isna(r.is_converted):
            return "unknown"
        return "converted" if r.is_converted else "stopped"
    if r.decision == "field_goal":
        if pd.isna(r.is_fg_made):
            return "unknown"
        return "made" if r.is_fg_made else "missed"
    return "punted"


def entries(df: pd.DataFrame) -> list[dict]:
    out = []
    for r, inp in zip(df.itertuples(), engine_inputs(df)):
        label = "midfield" if r.yardline_label == "MID 50" else r.yardline_label
        out.append({
            "id": r.play_uid, "game_id": r.game_id, "season": int(r.season), "week": int(r.week),
            "date": str(r.game_date)[:10], "kind": r.kind, "label": r.label or None,
            "posteam": r.posteam, "defteam": r.defteam, "home_team": r.home_team, "away_team": r.away_team,
            "coach": r.posteam_coach, "qtr": int(r.qtr), "clock": r.clock,
            "posteam_score": int(r.posteam_score), "defteam_score": int(r.defteam_score),
            "ydstogo": int(r.ydstogo), "yardline_100": int(r.yardline_100), "goal_to_go": bool(r.is_goal_to_go),
            "yardline_label": label,
            "situation": f"4th & {'goal' if r.is_goal_to_go else int(r.ydstogo)} at {label}",
            "spread": round(float(r.posteam_spread_line), 1),
            "wp_now": round(float(r.wp_now), 4),
            "wp": {"go": round(float(r.wp_go), 4), "punt": round(float(r.wp_punt), 4), "field_goal": round(float(r.wp_fg), 4)},
            "p_convert": round(float(r.p_convert), 3), "p_fg_make": round(float(r.p_fg_make), 3),
            "fg_distance": int(r.fg_distance_1), "fg_in_range": bool(r.fg_in_range),
            "punt_to": round(float(r.punt_receiving_yardline_100)),
            "recommendation": r.recommendation, "decision": r.decision, "wp_lost": round(float(r.wp_lost), 4),
            "outcome": _outcome(r), "description": r.play_description[:240],
            "final": {"home": int(r.final_home_score), "away": int(r.final_away_score)},
            "input": inp,
        })
    return out


def build(season: int | None = None) -> dict:
    if season is None:
        season = int(data.query("select max(season) from marts.fct_fourth_down_decisions").iloc[0, 0])
    pool = select(tag(load(season - SEASONS_BACK + 1)))
    colors = data.query("select team_abbr, team_name, color_primary, color_secondary from staging.stg_teams")
    teams = set(pool["posteam"]) | set(pool["defteam"])
    return {
        "seasons": [season - SEASONS_BACK + 1, season],
        "rules": {"min_option_spread": MIN_SPREAD, "clear_margin": CLEAR_MARGIN, "close_margin": CLOSE_MARGIN,
                  "fg_in_range_p_make": FG_IN_RANGE},
        "teams": {r.team_abbr: {"name": r.team_name, "primary": r.color_primary, "secondary": r.color_secondary}
                  for r in colors.itertuples() if r.team_abbr in teams},
        "situations": entries(pool),
    }


def export() -> dict:
    payload = build()
    path = EXPORTS_DIR / "play" / "pool.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":"), default=data._json_default) + "\n")  # compact: the browser downloads it
    s = pd.DataFrame(payload["situations"])
    print(f"play pool: {len(s)} situations "
          f"({', '.join(f'{k} {v}' for k, v in s['kind'].value_counts().items())}); "
          f"right answer {', '.join(f'{k} {v}' for k, v in s['recommendation'].value_counts().items())}")
    return payload


if __name__ == "__main__":
    export()
    sys.exit(0)
