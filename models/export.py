"""Phase 2, step 7: JSON for the Next.js site. `python -m models.export [season ...]`

exports/
  meta.json                                  when, data through which week, model summaries
  leaderboard/{season}.json                  coach leaderboard (min 30 graded decisions)
  worst_decisions/{season}/week_{NN}.json    the 10 costliest graded decisions of each week
  worst_decisions/latest.json                the most recent week
  games/{season}/index.json                  every game in the season (for navigation)
  games/{season}/{game_id}.json              home-team WP series + key plays, for WP charts
  play/pool.json                             "You Make the Call" situations (see models/play.py)
  coaches/index.json, coaches/{slug}.json    leaderboard rows since 2006 + coach pages (see models/coaches.py)
The site reads these at build time; nothing here needs a database at request time.
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import UTC, datetime

import pandas as pd

from models import coaches, data, findings, play
from models.export_web import engine_inputs
from models.config import ARTIFACTS_DIR, EXPORTS_DIR, REPORTS_DIR

WORST_PER_WEEK = 10
KEY_PLAY_WP_SWING = 0.05  # a play gets a description in the game file if it moved WP at least this much
TOP_SWINGS = 5
FOURTH_DOWN_COLUMNS = [
    "play_seq", "posteam", "defteam", "posteam_coach", "qtr", "clock", "posteam_score", "defteam_score", "ydstogo",
    "is_goal_to_go", "yardline_100", "yardline_label", "decision", "recommendation", "wp_now", "wp_go", "wp_punt",
    "wp_fg", "p_convert", "p_fg_make", "fg_distance_1", "wp_lost", "recommendation_margin", "is_graded", "is_converted",
    "is_fg_made", "play_description",
]


def _records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", double_precision=4))


def _compact(obj, path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")) + "\n")


def team_colors() -> dict:
    t = data.query("select team_abbr, team_name, color_primary, color_secondary, logo_url from staging.stg_teams")
    return {r.team_abbr: {"name": r.team_name, "primary": r.color_primary, "secondary": r.color_secondary,
                          "logo": r.logo_url} for r in t.itertuples()}


def current_season_and_week() -> tuple[int, int]:
    season, week = data.query("select season, max(week) from marts.fct_plays group by season order by season desc "
                              "limit 1").iloc[0]
    return int(season), int(week)


# ---------------------------------------------------------------------------- leaderboard


def export_leaderboard(season: int) -> int:
    board = findings.coach_leaderboard(season)
    data.write_json({
        "season": season,
        "min_decisions": findings.MIN_DECISIONS,
        "definitions": {
            "wins_lost": "sum of win probability lost vs the model's best option (1.0 = one win)",
            "wins_lost_kicking": "the part lost by punting/kicking when the model said go",
            "go_rate": "share of graded 4th downs where the coach went for it",
            "aggressiveness": f"go rate on 4th downs where going is worth >= {findings.CLEAR_GO:.0%} more WP",
            "agreed_with_model": "share of decisions matching the model's recommendation",
        },
        "coaches": _records(board.round(4)),
    }, EXPORTS_DIR / "leaderboard" / f"{season}.json")
    return len(board)


# ---------------------------------------------------------------------------- worst decisions


def export_worst_decisions(season: int) -> int:
    df = data.query(f"""
        select season, week, game_id, play_uid, posteam, defteam, posteam_coach as coach, qtr, clock,
               posteam_score, defteam_score, ydstogo, is_goal_to_go, yardline_label, decision, recommendation,
               wp_now, wp_go, wp_punt, wp_fg, p_convert, p_fg_make, fg_distance, wp_lost, recommendation_margin,
               play_description
        from marts.fct_fourth_down_decisions
        where season = {season} and is_graded and wp_lost > 0
        qualify row_number() over (partition by week order by wp_lost desc) <= {WORST_PER_WEEK}
        order by week, wp_lost desc
    """)
    df["situation"] = [f"4th & {'goal' if g else t} at {y}" for g, t, y in
                       zip(df["is_goal_to_go"], df["ydstogo"], df["yardline_label"])]
    weeks = sorted(df["week"].unique())
    for week in weeks:
        rows = df[df["week"] == week].drop(columns=["is_goal_to_go"])
        payload = {"season": season, "week": int(week), "decisions": _records(rows)}
        data.write_json(payload, EXPORTS_DIR / "worst_decisions" / str(season) / f"week_{week:02d}.json")
    if weeks:
        shutil.copyfile(EXPORTS_DIR / "worst_decisions" / str(season) / f"week_{weeks[-1]:02d}.json",
                        EXPORTS_DIR / "worst_decisions" / "latest.json")
    return len(weeks)


# ---------------------------------------------------------------------------- per-game WP series


def _fourth_downs(rows: pd.DataFrame, inputs: dict) -> list[dict]:
    """Every 4th down of the game with what the page's tooltip needs, plus the calculator input."""
    out = rows[FOURTH_DOWN_COLUMNS].rename(columns={"posteam_coach": "coach", "fg_distance_1": "fg_distance"})
    out = out.assign(play_description=out["play_description"].str.slice(0, 220),
                     yardline_label=out["yardline_label"].replace({"MID 50": "midfield"}))
    records = _records(out)
    for rec, uid in zip(records, rows["play_uid"]):
        rec["situation"] = f"4th & {'goal' if rec['is_goal_to_go'] else rec['ydstogo']} at {rec['yardline_label']}"
        rec["input"] = inputs[uid]
    return records


def _swings(g: pd.DataFrame, result: float, went_to_ot: bool) -> list[dict]:
    """The plays that moved home WP the most: pre-snap WP to the next snap's (the final result after the last
    snap). In an overtime game the last regulation snap is left out: what follows it is a whole overtime."""
    nxt = g["home_wp"].shift(-1)
    if not went_to_ot:
        nxt.iloc[-1] = result
    d = g.assign(wp_after=nxt, delta=nxt - g["home_wp"]).dropna(subset=["delta"])
    top = d.reindex(d["delta"].abs().sort_values(ascending=False).index).head(TOP_SWINGS)
    return _records(top[["play_seq", "qtr", "clock", "posteam", "home_wp", "wp_after", "delta", "play_description"]]
                    .rename(columns={"home_wp": "wp_before"})
                    .assign(play_description=top["play_description"].str.slice(0, 220)).sort_values("play_seq"))


def export_games(season: int, colors: dict) -> int:
    games = data.query(f"""
        select game_id, season, week, game_type, game_date, home_team, away_team, home_score, away_score,
               home_coach, away_coach, is_overtime, stadium
        from staging.stg_schedules where season = {season} and is_final order by game_date, game_id
    """)
    plays = data.query(f"""
        select p.game_id, p.play_seq, p.qtr, p.clock, p.game_seconds_remaining, p.posteam, p.home_team,
               if(p.is_posteam_home, w.wp, 1 - w.wp)                         as home_wp,
               if(p.is_posteam_home, p.posteam_score, p.defteam_score)        as home_score,
               if(p.is_posteam_home, p.defteam_score, p.posteam_score)        as away_score,
               p.down, p.ydstogo, p.yardline_label, p.play_type, p.is_touchdown, p.is_interception,
               p.is_fumble_lost, p.play_description
        from marts.fct_plays p
        inner join ml.play_wp w using (play_uid)
        where p.season = {season}
        order by p.game_id, p.play_seq
    """)
    fourth = data.query(f"select * from marts.fct_fourth_down_decisions where season = {season} order by game_id, play_seq")
    fourth_inputs = dict(zip(fourth["play_uid"], engine_inputs(fourth)))
    index = []
    for game in games.itertuples():
        g = plays[plays["game_id"] == game.game_id]
        if g.empty:
            continue
        swing = g["home_wp"].diff().abs().shift(-1).fillna(0)  # how much the NEXT snap's WP moved after this play
        key = g[(swing >= KEY_PLAY_WP_SWING) | g["is_touchdown"] | g["is_interception"] | g["is_fumble_lost"]
                | (g["down"] == 4)]
        result = 1.0 if game.home_score > game.away_score else 0.0 if game.home_score < game.away_score else 0.5
        payload = {
            "game_id": game.game_id, "season": season, "week": int(game.week), "game_type": game.game_type,
            "date": str(game.game_date)[:10], "stadium": game.stadium,
            "home": {"team": game.home_team, "coach": game.home_coach, "score": int(game.home_score),
                     **colors.get(game.home_team, {})},
            "away": {"team": game.away_team, "coach": game.away_coach, "score": int(game.away_score),
                     **colors.get(game.away_team, {})},
            "went_to_overtime": bool(game.is_overtime),
            "series": {  # columnar: one entry per regulation scrimmage snap, plus the final result
                "play_seq": [*g["play_seq"].tolist(), None],
                "game_seconds_remaining": [*g["game_seconds_remaining"].tolist(), 0],
                "home_wp": [*g["home_wp"].round(4).tolist(), result],
                "home_score": [*g["home_score"].tolist(), int(game.home_score)],  # pre-snap score
                "away_score": [*g["away_score"].tolist(), int(game.away_score)],
            },
            "key_plays": _records(key[["play_seq", "qtr", "clock", "posteam", "home_score", "away_score",
                                       "home_wp", "play_description"]].assign(
                play_description=key["play_description"].str.slice(0, 220))),
            "fourth_downs": _fourth_downs(fourth[fourth["game_id"] == game.game_id], fourth_inputs),
            "swings": _swings(g, result, went_to_ot=bool(game.is_overtime)),
        }
        _compact(payload, EXPORTS_DIR / "games" / str(season) / f"{game.game_id}.json")
        graded = [f for f in payload["fourth_downs"] if f["is_graded"]]
        index.append({"game_id": game.game_id, "week": int(game.week), "game_type": game.game_type,
                      "date": payload["date"], "home": game.home_team, "away": game.away_team,
                      "home_score": int(game.home_score), "away_score": int(game.away_score),
                      "overtime": bool(game.is_overtime), "graded": len(graded),
                      "wp_lost": {side: round(sum(f["wp_lost"] for f in graded if f["posteam"] == team), 4)
                                  for side, team in (("home", game.home_team), ("away", game.away_team))}})
    teams = {t for g in index for t in (g["home"], g["away"])}
    data.write_json({"season": season, "teams": {t: {k: colors[t][k] for k in ("name", "primary", "secondary")}
                                                  for t in sorted(teams) if t in colors},
                     "games": index}, EXPORTS_DIR / "games" / str(season) / "index.json")
    return len(index)


# ---------------------------------------------------------------------------- model contract + meta


def export_model_contract() -> None:
    """What the browser calculator needs to call wp.onnx correctly."""
    wp_metrics = json.loads((REPORTS_DIR / "wp_metrics.json").read_text())
    data.write_json({
        "file": "wp.onnx",
        "input": {"name": "features", "dtype": "float32", "shape": [None, len(wp_metrics["features"])]},
        "output": "probabilities[:, 1] = P(the team with the ball wins); regulation only",
        "feature_order": wp_metrics["features"],
        "derived_features": {
            "score_diff_per_sqrt_sec": "score_differential / sqrt(game_seconds_remaining + 1)",
            "spread_time": "posteam_spread_line * exp(-4 * (3600 - game_seconds_remaining) / 3600)",
        },
        "conventions": {
            "yardline_100": "yards from the opponent's end zone (1-99)",
            "posteam_spread_line": "closing spread from the offense's view, + = offense favored",
            "home": "+1 home, 0 neutral site, -1 away",
        },
        "trained_on": wp_metrics["split"],
        "verified_max_abs_diff_vs_xgboost": wp_metrics["onnx"]["max_abs_diff_vs_xgboost"],
    }, ARTIFACTS_DIR / "wp_onnx_contract.json")


def export_meta(season: int, week: int, counts: dict) -> None:
    reports = {name: json.loads((REPORTS_DIR / f"{name}_metrics.json").read_text())
               for name in ("wp", "conversion", "fg", "punt")}
    data.write_json({
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "data_through": {"season": season, "week": week},
        "counts": counts,
        "models": {
            "win_probability": {"trained": reports["wp"]["split"],
                                "test_brier": reports["wp"]["test"]["metrics"]["this_model"]["brier"],
                                "nflverse_vegas_wp_test_brier": reports["wp"]["test"]["metrics"]["nflverse_vegas_wp"]["brier"]},
            "conversion": {"test_brier": reports["conversion"]["test"]["metrics"]["calibrated_model"]["brier"]},
            "field_goal": {"test_brier": reports["fg"]["test"]["brier"]},
            "punt": {"test_mae_yards": reports["punt"]["results"]["test"]["isotonic_recalibrated"]["mae_yards"]},
        },
        "notes": ["Graded decisions exclude overtime and the final 30 seconds of each half.",
                  "Fakes are graded as ordinary go-for-it attempts."],
    }, EXPORTS_DIR / "meta.json")


def main(argv: list[str]) -> int:
    season, week = current_season_and_week()
    seasons = [int(s) for s in argv] or [season - 1, season]
    colors = team_colors()
    counts = {}
    for s in seasons:
        counts[s] = {"leaderboard_coaches": export_leaderboard(s), "worst_decision_weeks": export_worst_decisions(s),
                     "games": export_games(s, colors)}
        print(f"{s}: {counts[s]}")
    play.export()
    coaches.export()
    export_model_contract()
    export_meta(season, week, counts)
    size = sum(f.stat().st_size for f in EXPORTS_DIR.rglob("*.json"))
    print(f"exports/: {sum(1 for _ in EXPORTS_DIR.rglob('*.json'))} files, {size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
