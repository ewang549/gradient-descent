"""Phase 3c: coach leaderboard + coach pages. `python -m models.coaches`

exports/coaches/index.json
  rows       one per coach-season since 2006 with raw counts (decisions, go, clear-go spots, agreed),
             so the site can add up any range of seasons exactly
  league     the same counts for the whole league, per season
  coaches    every coach with a page (>= MIN_CAREER graded decisions)
exports/coaches/{slug}.json
  seasons    the coach's rows + the league's, for the trend charts
  buckets    go rate by yards to go: the coach, the league in the same seasons, and the model in the
             coach's own spots
  worst      the 5 costliest calls; best: the 5 correct calls that beat the typical coach by the most

Seasons before 2023 are flagged in_sample: the WP model was trained on 2006-2022, so those grades
are fit on their own data. 2023 (validation) and 2024 (test) were held out; 2025+ came after.
"""

from __future__ import annotations

import re
import shutil
import sys

import numpy as np
import pandas as pd

from models import data, findings, weekly
from models.config import EXPORTS_DIR, TRAIN_SEASONS
from models.export_web import engine_inputs

FIRST_SEASON = 2006
OUT_OF_SAMPLE_FROM = TRAIN_SEASONS.stop  # 2023
MIN_SEASON = findings.MIN_DECISIONS      # 30 graded calls to rank in a single season
MIN_RANGE = 100                          # ... in a multi-season range
MIN_CAREER = 50                          # to get a coach page
MIN_BUCKET = 10                          # to show a go rate for a distance bucket
TOP_CALLS = 5
BUCKETS = [(1, 1, "1"), (2, 3, "2-3"), (4, 6, "4-6"), (7, 10, "7-10"), (11, 99, "11+")]

CALL_COLUMNS = ["play_uid", "game_id", "season", "week", "posteam", "defteam", "qtr", "clock", "posteam_score",
                "defteam_score", "ydstogo", "is_goal_to_go", "yardline_label", "decision", "recommendation", "wp_go",
                "wp_punt", "wp_fg", "wp_lost", "is_converted", "is_fg_made", "play_description", "expected_go_rate",
                "value_vs_typical"]


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load() -> pd.DataFrame:
    df = data.query(f"""
        select * from marts.fct_fourth_down_decisions
        where season >= {FIRST_SEASON} and is_graded
        order by season, week, game_id, play_seq
    """)
    df["clear_go"] = df["go_advantage"] >= findings.CLEAR_GO
    df["agreed"] = df["decision"] == df["recommendation"]
    df["model_go"] = df["recommendation"] == "go"
    df["bucket"] = pd.cut(df["ydstogo"], [b[0] - 0.5 for b in BUCKETS] + [99.5], labels=[b[2] for b in BUCKETS])
    return df


def counts(g: pd.DataFrame) -> dict:
    return {
        "decisions": int(len(g)), "go": int(g["is_go"].sum()), "clear_spots": int(g["clear_go"].sum()),
        "clear_go": int((g["clear_go"] & g["is_go"]).sum()), "agreed": int(g["agreed"].sum()),
        "wins_lost": round(float(g["wp_lost"].sum()), 4),
        "wins_lost_kicking": round(float(g.loc[g["model_go"] & ~g["is_go"], "wp_lost"].sum()), 4),
    }


def season_rows(df: pd.DataFrame) -> list[dict]:
    rows = []
    for (coach, season), g in df.groupby(["posteam_coach", "season"], sort=True):
        rows.append({"slug": slug(coach), "coach": coach, "season": int(season),
                     "teams": sorted(set(g["posteam"])), **counts(g)})
    return rows


def league_rows(df: pd.DataFrame) -> list[dict]:
    return [{"season": int(s), **counts(g)} for s, g in df.groupby("season")]


def _calls(df: pd.DataFrame) -> list[dict]:
    out = df[CALL_COLUMNS].copy()
    out["yardline_label"] = out["yardline_label"].replace({"MID 50": "midfield"})
    records = out.astype(object).where(out.notna(), None).to_dict(orient="records")
    for rec, inp in zip(records, engine_inputs(df)):
        rec["situation"] = f"4th & {'goal' if rec['is_goal_to_go'] else rec['ydstogo']} at {rec['yardline_label']}"
        for k in ("wp_go", "wp_punt", "wp_fg", "wp_lost", "expected_go_rate", "value_vs_typical"):
            rec[k] = round(float(rec[k]), 4)
        rec["input"] = inp
    return records


def buckets(mine: pd.DataFrame, league: pd.DataFrame) -> list[dict]:
    same_seasons = league[league["season"].isin(mine["season"].unique())]
    out = []
    for _, _, label in BUCKETS:
        m, lg = mine[mine["bucket"] == label], same_seasons[same_seasons["bucket"] == label]
        out.append({
            "bucket": label, "n": int(len(m)),
            "go_rate": round(float(m["is_go"].mean()), 4) if len(m) >= MIN_BUCKET else None,
            "model_go_rate": round(float(m["model_go"].mean()), 4) if len(m) >= MIN_BUCKET else None,
            "league_n": int(len(lg)), "league_go_rate": round(float(lg["is_go"].mean()), 4),
        })
    return out


def coach_page(coach: str, mine: pd.DataFrame, df: pd.DataFrame, rows: list[dict]) -> dict:
    seasons = [r for r in rows if r["coach"] == coach]
    worst = mine[mine["wp_lost"] > 0].sort_values("wp_lost", ascending=False).head(TOP_CALLS)
    best = mine[mine["agreed"]].sort_values("value_vs_typical", ascending=False).head(TOP_CALLS)
    return {
        "slug": slug(coach), "coach": coach,
        "teams": [{"team": t, "from": int(g["season"].min()), "to": int(g["season"].max())}
                  for t, g in sorted(mine.groupby("posteam"), key=lambda x: x[1]["season"].min())],
        "career": counts(mine),
        "out_of_sample": counts(mine[mine["season"] >= OUT_OF_SAMPLE_FROM]),
        "seasons": seasons,
        "buckets": buckets(mine, df),
        "worst": _calls(worst),
        "best": _calls(best),
    }


def build() -> tuple[dict, list[dict]]:
    df = load()
    last = int(df["season"].max())
    # "what coaches usually do": one expected-go model over the modern era, used descriptively for every season
    df = weekly.add_value_vs_typical(df, weekly.expected_go_model(last))  # trained 2018 through last season
    rows = season_rows(df)
    career = df.groupby("posteam_coach").size()
    page_coaches = sorted(career[career >= MIN_CAREER].index, key=lambda c: (slug(c)))
    pages = [coach_page(c, df[df["posteam_coach"] == c], df, rows) for c in page_coaches]
    colors = data.query("select team_abbr, team_name, color_primary, color_secondary from staging.stg_teams")
    index = {
        "seasons": list(range(FIRST_SEASON, last + 1)),
        "out_of_sample_from": OUT_OF_SAMPLE_FROM,
        "min_decisions": {"season": MIN_SEASON, "range": MIN_RANGE, "career": MIN_CAREER, "bucket": MIN_BUCKET},
        "clear_go_wp": findings.CLEAR_GO,
        "definitions": {
            "wins_lost": "sum of win probability lost vs the model's best option (1.00 = one win)",
            "per_100": "wins lost per 100 graded calls (compares coaches with different sample sizes)",
            "aggressiveness": f"go rate on 'clear go' spots, where going is worth >= {findings.CLEAR_GO * 100:.0f} WP point more",
            "agreed": "share of calls matching the model's best option",
        },
        "teams": {r.team_abbr: {"name": r.team_name, "primary": r.color_primary, "secondary": r.color_secondary}
                  for r in colors.itertuples()},
        "coaches": [{"slug": p["slug"], "coach": p["coach"], "teams": [t["team"] for t in p["teams"]],
                     "decisions": p["career"]["decisions"]} for p in pages],
        "league": league_rows(df),
        "rows": rows,
    }
    return index, pages


def export() -> None:
    index, pages = build()
    out = EXPORTS_DIR / "coaches"
    shutil.rmtree(out, ignore_errors=True)
    data.write_json(index, out / "index.json")
    for p in pages:
        data.write_json(p, out / f"{p['slug']}.json")
    print(f"coaches: {len(pages)} pages, {len(index['rows'])} coach-seasons {index['seasons'][0]}-{index['seasons'][-1]}")


if __name__ == "__main__":
    export()
    sys.exit(0)
