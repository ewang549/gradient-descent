"""Phase 2, step 6: do the model's findings hold up? `python -m models.findings`

  1. Actual go rate vs the model's recommended go rate, by season
  2. Ten famous 4th downs, model vs the coach, in a readable table
  3. 2025 coach leaderboard: WP lost, go rate, aggressiveness (min 30 graded decisions)

Everything reads marts.fct_fourth_down_decisions and uses graded decisions only (the final 30
seconds of a half are excluded; see that model's header).
"""

from __future__ import annotations

import sys

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.ticker import PercentFormatter

from analysis import theme
from models import data, plots
from models.config import DATA_SOURCE, REPORTS_DIR

CLEAR_GO = 0.01  # the model's go edge (in WP) needed to call a spot a clear "go"
LEADERBOARD_SEASON = 2025
MIN_DECISIONS = 30

FAMOUS = [
    ("2009_10_NE_IND_4081", "Belichick's 4th & 2 at his own 28", "Patriots @ Colts, 2009 wk 10"),
    ("2009_21_NO_IND_1642", "Saints go for it at the 1 before half", "Super Bowl XLIV"),
    ("2014_20_GB_SEA_2608", "Seahawks' fake field goal TD", "2014 NFC Championship"),
    ("2017_21_PHI_NE_2053", "The Philly Special", "Super Bowl LII"),
    ("2017_21_PHI_NE_3735", "Eagles' 4th & 1 at their own 45", "Super Bowl LII"),
    ("2020_20_TB_GB_3728", "LaFleur kicks a FG down 8, 2:09 left", "2020 NFC Championship"),
    ("2021_02_KC_BAL_3948", "Ravens' 4th & 1 to ice the Chiefs", "Chiefs @ Ravens, 2021 wk 2"),
    ("2022_04_BUF_BAL_3594", "Ravens go for it at the 2, tied", "Bills @ Ravens, 2022 wk 4"),
    ("2023_21_DET_SF_2682", "Lions pass up a 46-yd FG, up 14", "2023 NFC Championship"),
    ("2024_21_BUF_KC_3456", "Allen's 4th & 1 sneak at the KC 41", "2024 AFC Championship"),
]

LABEL = {"go": "Go", "punt": "Punt", "field_goal": "FG"}


# --------------------------------------------------------------------------- 1. go rate by season


def go_rate_by_season() -> pd.DataFrame:
    return data.query(f"""
        select
            season,
            count(*)                                                                   as decisions,
            avg(is_go::int)                                                            as actual_go_rate,
            avg((recommendation = 'go')::int)                                          as model_go_rate,
            avg(is_go::int) filter (where go_advantage >= {CLEAR_GO})                  as go_rate_when_clear_go,
            count(*) filter (where go_advantage >= {CLEAR_GO})                         as clear_go_spots,
            sum(wp_lost) filter (where recommendation = 'go' and decision <> 'go') / 32 as wins_lost_kicking_per_team,
            sum(wp_lost) filter (where decision = 'go' and recommendation <> 'go') / 32 as wins_lost_going_per_team,
            max(week)                                                                  as max_week
        from marts.fct_fourth_down_decisions
        where is_graded and season >= 2006
        group by season
        order by season
    """)


def plot_go_rates(df: pd.DataFrame) -> None:
    current = int(df["season"].max())
    done, partial = df[df["season"] < current], df[df["season"] == current].iloc[0]

    theme.apply_theme()
    fig, ax = plt.subplots(figsize=(8, 4.6))
    ax.fill_between(done["season"], done["actual_go_rate"], done["model_go_rate"], color=theme.ORANGE, alpha=0.10,
                    linewidth=0)
    for col, label, color in (("model_go_rate", "Model says go", theme.ORANGE),
                              ("actual_go_rate", "Coaches went for it", theme.BLUE)):
        ax.plot(done["season"], done[col], color=color, label=label)
        theme.end_marker(ax, done["season"].iloc[-1], done[col].iloc[-1], color)
        ax.annotate(f"{done[col].iloc[-1]:.0%}", (done["season"].iloc[-1], done[col].iloc[-1]), xytext=(-10, 11),
                    textcoords="offset points", ha="right", fontsize=10.5, fontweight="bold", color=theme.INK)
        ax.plot([current], [partial[col]], marker="o", markersize=theme.MARKER_SIZE, markerfacecolor=theme.SURFACE,
                markeredgecolor=color, markeredgewidth=2, linestyle="none", zorder=5)
    first, last = done.iloc[0], done.iloc[-1]
    ax.text(done["season"].iloc[1], (first["actual_go_rate"] + first["model_go_rate"]) / 2,
            f"gap: {(first['model_go_rate'] - first['actual_go_rate']) * 100:.0f} pts in {int(first['season'])}", fontsize=9,
            color=theme.INK_2, va="center")
    ax.text(done["season"].iloc[-4], (last["actual_go_rate"] + last["model_go_rate"]) / 2,
            f"gap: {(last['model_go_rate'] - last['actual_go_rate']) * 100:.0f} pts in {int(last['season'])}", fontsize=9,
            color=theme.INK_2, va="center")
    ax.set_ylim(0, 0.6)
    ax.set_xlim(2005.5, current + 0.8)
    ax.set_xticks(range(2006, current + 1, 4))
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.legend(loc="upper left", ncols=2)
    theme.headline(
        fig, "Coaches go for it twice as often as in 2006, and it's still not enough",
        "Share of 4th downs where the coach went for it vs where the model's win probability says to",
        f"Regulation 4th downs, final 30s of each half excluded. Hollow dots: {current} through week "
        f"{int(partial['max_week'])}. {DATA_SOURCE}.",
    )
    theme.save(fig, REPORTS_DIR / "go_rate_vs_model.png")


def plot_compliance(df: pd.DataFrame) -> None:
    current = int(df["season"].max())
    done, partial = df[df["season"] < current], df[df["season"] == current].iloc[0]
    theme.apply_theme()
    fig, ax = plt.subplots(figsize=(8, 4.4))
    ax.plot(done["season"], done["go_rate_when_clear_go"], color=theme.BLUE)
    for i in (0, len(done) - 1):
        x, y = done["season"].iloc[i], done["go_rate_when_clear_go"].iloc[i]
        theme.end_marker(ax, x, y, theme.BLUE)
        ax.annotate(f"{y:.0%}", (x, y), xytext=(0, 12), textcoords="offset points", ha="center", fontsize=10.5,
                    fontweight="bold", color=theme.INK)
    ax.plot([current], [partial["go_rate_when_clear_go"]], marker="o", markersize=theme.MARKER_SIZE,
            markerfacecolor=theme.SURFACE, markeredgecolor=theme.BLUE, markeredgewidth=2, linestyle="none")
    ax.set_ylim(0, 0.65)
    ax.set_xlim(2005.5, current + 0.8)
    ax.set_xticks(range(2006, current + 1, 4))
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    theme.headline(
        fig, "When the math says go, coaches now listen half the time",
        f"Go rate on 4th downs where going for it is worth at least {CLEAR_GO:.0%} more win probability",
        f"Hollow dot: {current} through week {int(partial['max_week'])}. Final 30s of each half excluded. {DATA_SOURCE}.",
    )
    theme.save(fig, REPORTS_DIR / "go_rate_when_model_says_go.png")


# --------------------------------------------------------------------------- 2. famous 4th downs


def famous_fourth_downs() -> pd.DataFrame:
    ids = ", ".join(f"'{uid}'" for uid, _, _ in FAMOUS)
    df = data.query(f"""
        select play_uid, posteam, qtr, clock, score_differential, ydstogo, is_goal_to_go, yardline_label, decision,
               recommendation, wp_go, wp_punt, wp_fg, wp_lost, recommendation_margin, p_convert, p_fg_make
        from marts.fct_fourth_down_decisions where play_uid in ({ids})
    """).set_index("play_uid")
    rows = []
    for uid, name, game in FAMOUS:
        r = df.loc[uid]
        lead = "tied" if r.score_differential == 0 else (f"up {r.score_differential}" if r.score_differential > 0
                                                        else f"down {-r.score_differential}")
        to_go = "goal" if r.is_goal_to_go else r.ydstogo
        verdict = ("agrees" if r.decision == r.recommendation
                   else "close call" if r.recommendation_margin < 0.01 else "disagrees")
        rows.append({
            "play": name, "game": game,
            "situation": f"Q{r.qtr} {r.clock}, {lead}, 4th & {to_go} at {r.yardline_label} ({r.posteam})",
            "coach": LABEL[r.decision], "model": LABEL[r.recommendation],
            "wp_go": r.wp_go, "wp_punt": r.wp_punt, "wp_fg": r.wp_fg,
            "margin": r.recommendation_margin, "wp_lost": r.wp_lost, "p_convert": r.p_convert, "verdict": verdict,
        })
    return pd.DataFrame(rows)


def famous_markdown(df: pd.DataFrame) -> str:
    head = ("| Play | Situation | Coach | Model | WP go / punt / FG | Model's edge | WP lost | Verdict |\n"
            "|---|---|---|---|---|---|---|---|\n")
    body = "".join(
        f"| **{r.play}**<br>{r.game} | {r.situation} | {r.coach} | {r.model} | "
        f"{r.wp_go:.1%} / {r.wp_punt:.1%} / {r.wp_fg:.1%} | {r.margin * 100:.1f} pts | {r.wp_lost * 100:.1f} pts | "
        f"{r.verdict} |\n" for r in df.itertuples())
    note = ("\nWP = this project's win probability for the team with the ball. Model's edge = best option minus "
            "second best. Fakes are graded as ordinary go attempts (the surprise factor isn't modeled).\n")
    return head + body + note


# --------------------------------------------------------------------------- 3. coach leaderboard


def coach_leaderboard(season: int = LEADERBOARD_SEASON) -> pd.DataFrame:
    return data.query(f"""
        select
            posteam_coach                                                     as coach,
            string_agg(distinct posteam, '/')                                 as team,
            count(*)                                                          as decisions,
            sum(wp_lost)                                                      as wins_lost,
            sum(wp_lost) filter (where recommendation = 'go' and decision <> 'go') as wins_lost_kicking,
            avg(is_go::int)                                                   as go_rate,
            count(*) filter (where go_advantage >= {CLEAR_GO})                as clear_go_spots,
            avg(is_go::int) filter (where go_advantage >= {CLEAR_GO})         as aggressiveness,
            avg((decision = recommendation)::int)                             as agreed_with_model
        from marts.fct_fourth_down_decisions
        where season = {season} and is_graded
        group by posteam_coach
        having count(*) >= {MIN_DECISIONS}
        order by wins_lost
    """, [])


def plot_leaderboard(board: pd.DataFrame, season: int) -> None:
    plots.hbars(
        [f"{r.coach} ({r.team})" for r in board.itertuples()], list(board["wins_lost"]),
        value_fmt=lambda v: f"{v:.2f}",
        title=f"Wins given away on 4th down, {season}",
        subtitle="Total win probability lost vs the model's best option (1.00 = one full win), by head coach",
        source=f"Regular season + playoffs, min {MIN_DECISIONS} graded decisions; final 30s of each half excluded. "
               f"{DATA_SOURCE}.",
        path=REPORTS_DIR / f"coach_leaderboard_{season}.png",
        color=theme.ORANGE,
    )


# --------------------------------------------------------------------------- main


def main() -> int:
    pd.set_option("display.width", 200)
    trend = go_rate_by_season()
    plot_go_rates(trend)
    plot_compliance(trend)
    print("1) Go rate by season (graded regulation decisions)")
    shown = trend.assign(**{c: (trend[c] * 100).round(1) for c in ("actual_go_rate", "model_go_rate",
                                                                    "go_rate_when_clear_go")})
    print(shown[["season", "decisions", "actual_go_rate", "model_go_rate", "go_rate_when_clear_go",
                 "wins_lost_kicking_per_team", "wins_lost_going_per_team"]].round(3).to_string(index=False))

    famous = famous_fourth_downs()
    (REPORTS_DIR / "famous_fourth_downs.md").write_text("# Ten famous 4th downs, graded\n\n" + famous_markdown(famous))
    print("\n2) Ten famous 4th downs")
    for r in famous.itertuples():
        print(f"  {r.play:<42} {r.situation:<44} coach {r.coach:<4} model {r.model:<4} "
              f"edge {r.margin * 100:4.1f} pts  lost {r.wp_lost * 100:4.1f}  [{r.verdict}]")

    board = coach_leaderboard()
    plot_leaderboard(board, LEADERBOARD_SEASON)
    print(f"\n3) {LEADERBOARD_SEASON} coach leaderboard (min {MIN_DECISIONS} graded decisions), fewest wins lost first")
    print(board.assign(go_rate=(board["go_rate"] * 100).round(1), aggressiveness=(board["aggressiveness"] * 100).round(1),
                       agreed_with_model=(board["agreed_with_model"] * 100).round(1)).round(2).to_string(index=False))

    data.write_json({"go_rate_by_season": trend.to_dict(orient="records"),
                     "famous_fourth_downs": famous.to_dict(orient="records"),
                     f"coach_leaderboard_{LEADERBOARD_SEASON}": board.to_dict(orient="records"),
                     "definitions": {"clear_go": f"go_advantage >= {CLEAR_GO}",
                                     "aggressiveness": "go rate on clear-go spots",
                                     "wins_lost": "sum of wp_lost over graded decisions"}},
                    REPORTS_DIR / "findings.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
