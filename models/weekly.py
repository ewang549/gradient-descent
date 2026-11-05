"""Phase 3b: one JSON per week for the share cards, the weekly report page and the X post drafts.

    python -m models.weekly                 every completed week of the current season
    python -m models.weekly 2026            every completed week of 2026
    python -m models.weekly 2026 8          just 2026 week 8
    python -m models.weekly --check         the publish gate only (exit 1 = don't publish)

exports/weekly/{season}/week_{NN}.json
  games          scheduled vs final vs games with play-by-play (the gate compares these)
  summary        graded decisions, go rate, model go rate, wins lost league-wide
  worst          the 10 costliest graded calls (WP lost vs the model's best option)
  best           the 10 correct calls that beat what coaches usually do there by the most
  gutsiest       the go call the model agreed with where most coaches would have kicked
  leaderboard    coach standings through this week (top/bottom 5), from week 4 on
  teams          display colors for every team that appears
Each call carries the full engine input, so the site can link to a calculator that reproduces it.

"What coaches usually do" comes from a small expected-go-rate model (gradient boosting on
2018 through last season's graded decisions: down-distance, field position, score, clock, WP).
A call's value over a typical coach = its WP minus the WP of the typical coach's mix of go / kick.
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from models import data, findings, score
from models import decision_engine as de
from models.config import EXPORTS_DIR
from models.export_web import engine_inputs

TOP_N = 10
GUTSY_MAX_GO_RATE = 0.5      # "most coaches would have kicked"
LEADERBOARD_FROM_WEEK = 4    # earlier than this, every coach has a handful of decisions
LEADERBOARD_SHOW = 5
GO_MODEL_SEASONS_FROM = 2018
GO_FEATURES = ["ydstogo", "yardline_100", "score_differential", "game_seconds_remaining", "half_seconds_remaining",
               "wp_now", "is_goal_to_go"]

CALL_COLUMNS = [
    "play_uid", "game_id", "week", "posteam", "defteam", "posteam_coach", "qtr", "clock", "posteam_score",
    "defteam_score", "ydstogo", "is_goal_to_go", "yardline_100", "yardline_label", "decision", "recommendation",
    "wp_now", "wp_go", "wp_punt", "wp_fg", "p_convert", "wp_if_convert", "wp_if_fail", "p_fg_make", "fg_distance_1",
    "fg_distance",
    "punt_receiving_yardline_100", "wp_lost", "recommendation_margin", "go_advantage", "is_converted", "is_fg_made",
    "play_description", "posteam_game_result", "expected_go_rate", "value_vs_typical",
]


class GateError(RuntimeError):
    """The week isn't safe to publish."""


def min_decisions(week: int) -> int:
    return min(findings.MIN_DECISIONS, 4 * week)


# ------------------------------------------------------------------------------ data


def season_decisions(season: int) -> pd.DataFrame:
    return data.query(f"select * from marts.fct_fourth_down_decisions where season = {season} and qtr <= 4")


def expected_go_model(before_season: int) -> HistGradientBoostingClassifier:
    train = data.query(f"""
        select {', '.join(GO_FEATURES)}, is_go from marts.fct_fourth_down_decisions
        where is_graded and season between {GO_MODEL_SEASONS_FROM} and {before_season - 1}
    """)
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, random_state=0)
    return model.fit(train[GO_FEATURES].astype(float), train["is_go"].astype(int))


def add_value_vs_typical(df: pd.DataFrame, go_model) -> pd.DataFrame:
    """expected_go_rate = P(a typical coach goes here). A typical coach who kicks picks the better kick.
    value_vs_typical = actual WP - (p * wp_go + (1 - p) * best kick WP)."""
    df = df.copy()
    df["expected_go_rate"] = go_model.predict_proba(df[GO_FEATURES].astype(float))[:, 1]
    best_kick = np.maximum(df["wp_punt"], df["wp_fg"])
    typical = df["expected_go_rate"] * df["wp_go"] + (1 - df["expected_go_rate"]) * best_kick
    df["value_vs_typical"] = df["actual_wp"] - typical
    return df


def games_count(season: int, week: int) -> dict:
    r = data.query(f"""
        select count(*) as scheduled, count(*) filter (where is_final) as final,
               (select count(distinct game_id) from marts.fct_plays where season = {season} and week = {week})
                   as with_plays,
               (select count(distinct game_id) from marts.fct_fourth_down_decisions
                 where season = {season} and week = {week}) as with_decisions
        from staging.stg_schedules where season = {season} and week = {week}
    """).iloc[0]
    return {k: int(v) for k, v in r.items()}


def completed_weeks(season: int) -> list[int]:
    weeks = data.query(f"""
        select week from staging.stg_schedules where season = {season}
        group by week having count(*) filter (where is_final) = count(*) order by week
    """)
    return [int(w) for w in weeks["week"]]


def latest_week(season: int) -> int:
    """The latest week with any final game: the one the weekly run is about to publish."""
    return int(data.query(f"select max(week) from staging.stg_schedules where season = {season} and is_final")
               .iloc[0, 0])


def team_colors() -> dict:
    t = data.query("select team_abbr, team_name, color_primary, color_secondary from staging.stg_teams")
    return {r.team_abbr: {"name": r.team_name, "primary": r.color_primary, "secondary": r.color_secondary}
            for r in t.itertuples()}


# ------------------------------------------------------------------------------ the gate


def check(season: int, week: int) -> list[str]:
    """Everything that must hold before a week goes out. Returns the problems (empty = publish)."""
    problems = []
    models, lookups = de.load_models(), de.load_lookups()
    for name, expected, pick, _ in score.sanity_check(models, lookups):
        if pick != expected:
            problems.append(f"engine sanity check failed: {name}: expected {expected}, engine says {pick}")
    g = games_count(season, week)
    if g["final"] < g["scheduled"]:
        problems.append(f"{season} week {week}: only {g['final']} of {g['scheduled']} scheduled games are final")
    if g["with_plays"] < g["final"]:
        problems.append(f"{season} week {week}: play-by-play for {g['with_plays']} of {g['final']} final games")
    if g["with_decisions"] < g["final"]:
        problems.append(f"{season} week {week}: graded 4th downs for {g['with_decisions']} of {g['final']} games")
    return problems


# ------------------------------------------------------------------------------ one week


def _calls(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    # fg_distance = the engine's distance for a kick from here; fg_attempt_distance = the real kick, if there was one
    out = df[CALL_COLUMNS].rename(columns={"posteam_coach": "coach", "fg_distance": "fg_attempt_distance",
                                           "fg_distance_1": "fg_distance"})
    records = out.astype(object).where(out.notna(), None).to_dict(orient="records")
    for rec, inp in zip(records, engine_inputs(df)):
        if rec["yardline_label"] == "MID 50":  # nflverse's label for the 50
            rec["yardline_label"] = "midfield"
        rec["situation"] = f"4th & {'goal' if rec['is_goal_to_go'] else rec['ydstogo']} at {rec['yardline_label']}"
        rec["input"] = inp
    return records


def leaderboard(decisions: pd.DataFrame, week: int) -> dict | None:
    if week < LEADERBOARD_FROM_WEEK:
        return None
    graded = decisions[decisions["is_graded"] & (decisions["week"] <= week)]
    board = (graded.groupby("posteam_coach")
             .agg(team=("posteam", lambda s: "/".join(sorted(set(s)))), decisions=("play_uid", "size"),
                  wins_lost=("wp_lost", "sum"), go_rate=("is_go", "mean"))
             .reset_index().rename(columns={"posteam_coach": "coach"}))
    agreed = (graded["decision"] == graded["recommendation"]).groupby(graded["posteam_coach"]).mean()
    board["agreed_with_model"] = board["coach"].map(agreed)
    n_min = min_decisions(week)
    board = board[board["decisions"] >= n_min].sort_values(["wins_lost", "coach"]).reset_index(drop=True)
    board["rank"] = board.index + 1
    rows = board.round(4).to_dict(orient="records")
    return {"through_week": week, "min_decisions": n_min, "qualified": len(rows),
            "top": rows[:LEADERBOARD_SHOW], "bottom": rows[-LEADERBOARD_SHOW:]}


def build_week(season: int, week: int, decisions: pd.DataFrame, colors: dict) -> dict:
    wk = decisions[(decisions["week"] == week) & decisions["is_graded"]]
    worst = wk[wk["wp_lost"] > 0].sort_values("wp_lost", ascending=False).head(TOP_N)
    correct = wk[wk["decision"] == wk["recommendation"]]
    best = correct.sort_values("value_vs_typical", ascending=False).head(TOP_N)
    go_agreed = correct[correct["decision"] == "go"]
    gutsy_pool = go_agreed[go_agreed["expected_go_rate"] < GUTSY_MAX_GO_RATE]
    gutsiest = gutsy_pool.sort_values("value_vs_typical", ascending=False).head(1)
    board = leaderboard(decisions, week)
    shown_teams = set(wk["posteam"]) | set(wk["defteam"])
    if board:
        shown_teams |= {t for r in board["top"] + board["bottom"] for t in r["team"].split("/")}
    return {
        "season": season,
        "week": week,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "games": games_count(season, week),
        "summary": {
            "graded_decisions": len(wk),
            "go_rate": round(float(wk["is_go"].mean()), 4),
            "model_go_rate": round(float((wk["recommendation"] == "go").mean()), 4),
            "agreed_with_model": round(float((wk["decision"] == wk["recommendation"]).mean()), 4),
            "wins_lost": round(float(wk["wp_lost"].sum()), 4),
            "wins_lost_kicking": round(float(wk.loc[(wk["recommendation"] == "go") & ~wk["is_go"], "wp_lost"].sum()), 4),
        },
        "definitions": {
            "wp_lost": "win probability lost vs the model's best option, for the team with the ball",
            "value_vs_typical": "WP of the call minus the WP of what coaches usually do in that spot "
                                "(expected-go-rate mix of going and the better kick)",
            "expected_go_rate": f"share of coaches who go for it in that spot ({GO_MODEL_SEASONS_FROM} through "
                                f"{season - 1}, by down-distance, field position, score, clock and WP)",
            "gutsiest": f"the go call the model agreed with, where under {GUTSY_MAX_GO_RATE:.0%} of coaches go, "
                        "that beat the typical coach by the most",
        },
        "worst": _calls(worst),
        "best": _calls(best),
        "gutsiest": (_calls(gutsiest) or [None])[0],
        "leaderboard": board,
        "teams": {t: colors[t] for t in sorted(shown_teams) if t in colors},
    }


# ------------------------------------------------------------------------------ main


def export(season: int, weeks: list[int]) -> list:
    decisions = season_decisions(season)
    decisions = add_value_vs_typical(decisions, expected_go_model(season))
    colors = team_colors()
    paths = []
    for week in weeks:
        payload = build_week(season, week, decisions, colors)
        path = data.write_json(payload, EXPORTS_DIR / "weekly" / str(season) / f"week_{week:02d}.json")
        g = payload["gutsiest"]
        print(f"{season} week {week:>2}: {payload['games']['final']}/{payload['games']['scheduled']} games, "
              f"{payload['summary']['graded_decisions']} graded, worst {payload['worst'][0]['wp_lost']:.3f} "
              f"({payload['worst'][0]['coach']}), gutsiest: "
              f"{f'{g['coach']} {g['situation']} (go rate {g['expected_go_rate']:.0%})' if g else 'none'}")
        paths.append(path)
    index = sorted(int(p.stem.split("_")[1]) for p in (EXPORTS_DIR / "weekly" / str(season)).glob("week_*.json"))
    data.write_json({"season": season, "weeks": index, "latest": max(index)},
                    EXPORTS_DIR / "weekly" / str(season) / "index.json")
    return paths


def main(argv: list[str]) -> int:
    season = int(data.query("select max(season) from staging.stg_schedules where is_final").iloc[0, 0])
    if argv and argv[0] == "--check":
        week = int(argv[1]) if len(argv) > 1 else latest_week(season)
        problems = check(season, week)
        annotate = "::error title=Publish gate::" if os.environ.get("GITHUB_ACTIONS") else ""
        for p in problems:
            print(f"{annotate}GATE FAILED: {p}")
        if not problems:
            print(f"Gate passed for {season} week {week}: engine sanity checks pass, every scheduled game is in.")
        return 1 if problems else 0
    if argv:
        season = int(argv[0])
    weeks = [int(argv[1])] if len(argv) > 1 else completed_weeks(season)
    export(season, weeks)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
