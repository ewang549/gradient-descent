"""Phase 1 sanity check: does the warehouse look like the NFL we know?

Prints row counts by season and the 4th-down go rate by year, asserts facts that must hold
(every season present, game counts match the real league format, go rate up since 2018), and
saves analysis/output/go_rate_by_season.png.

    uv run python -m analysis.sanity_check      (or: make check)
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

from analysis import theme
from ingest.config import DB_PATH, FIRST_SEASON, REPO_ROOT

OUTPUT_DIR = REPO_ROOT / "analysis" / "output"


def expected_final_games(season: int) -> int:
    """Regular season + playoff games in the real league format."""
    if season <= 2001:
        return 248 + 11  # 31 teams
    if season <= 2019:
        return 256 + 11
    if season == 2020:
        return 256 + 13  # 14-team playoffs start
    if season == 2022:
        return 271 + 13  # BUF@CIN (Damar Hamlin) was cancelled
    return 272 + 13  # 17-game season


SEASON_SUMMARY = """
with plays as (
    select season, count(distinct game_id) as games, count(*) as plays
    from marts.fct_plays group by season
),
decisions as (
    select
        season,
        count(*)                                                   as fourth_down_decisions,
        avg(is_go::int)                                            as go_rate,
        avg(is_go::int) filter (where ydstogo <= 2 and qtr <= 3)   as go_rate_short_q1_3,
        count(*) filter (where ydstogo <= 2 and qtr <= 3)          as short_q1_3_decisions
    from marts.fct_fourth_downs group by season
),
schedule as (
    select season, count(*) filter (where is_final) as final_games
    from staging.stg_schedules group by season
)
select p.season, s.final_games, p.games, p.plays, round(p.plays / p.games, 1) as plays_per_game,
       d.fourth_down_decisions, d.go_rate, d.go_rate_short_q1_3, d.short_q1_3_decisions
from plays p join decisions d using (season) join schedule s using (season)
order by season
"""


def main() -> int:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    rel = con.sql(SEASON_SUMMARY)
    rows = rel.fetchall()
    cols = rel.columns
    data = [dict(zip(cols, r)) for r in rows]
    current = max(r["season"] for r in data)

    print("\n=== Rows and 4th-down go rate by season ===")
    con.sql(SEASON_SUMMARY.replace("d.go_rate,", "round(100 * d.go_rate, 1) as go_pct,")
            .replace("d.go_rate_short_q1_3,", "round(100 * d.go_rate_short_q1_3, 1) as go_pct_4th_short_q1_3,")).show(max_rows=60)

    print("=== Every 4th-down play is accounted for ===")
    con.sql("""
        select
            count(*)                                                             as fourth_down_plays,
            count(*) filter (where d.play_uid is not null)                       as decisions,
            count(*) filter (where d.play_uid is null and p.play_type in ('qb_kneel', 'qb_spike')) as kneels_spikes,
            count(*) filter (where d.play_uid is null and p.play_type = 'no_play') as pre_snap_penalties,
            count(*) filter (where d.play_uid is null and p.play_type not in ('qb_kneel', 'qb_spike', 'no_play')) as unexplained
        from marts.fct_plays p left join marts.fct_fourth_downs d using (play_uid)
        where p.down = 4
    """).show()

    unavailable = con.sql("select season, game_id from raw.pbp_unavailable_games order by 1, 2").fetchall()
    print(f"Final games nflverse has no play-by-play for: {[g for _, g in unavailable]}\n")

    # ------------------------------------------------------------------ hard checks
    failures: list[str] = []
    seasons = [r["season"] for r in data]
    if seasons != list(range(FIRST_SEASON, current + 1)):
        failures.append(f"seasons not contiguous {FIRST_SEASON}-{current}: {seasons}")

    missing_by_season: dict[int, int] = {}
    for season, _ in unavailable:
        missing_by_season[season] = missing_by_season.get(season, 0) + 1
    for r in data:
        if r["season"] == current:
            continue  # in progress
        if r["final_games"] != expected_final_games(r["season"]):
            failures.append(f"{r['season']}: schedule has {r['final_games']} final games, league format says "
                            f"{expected_final_games(r['season'])}")
        if r["games"] + missing_by_season.get(r["season"], 0) != r["final_games"]:
            failures.append(f"{r['season']}: {r['games']} games with plays vs {r['final_games']} final games")
    for r in data:
        if not 140 <= r["plays_per_game"] <= 190:
            failures.append(f"{r['season']}: {r['plays_per_game']} plays per game is implausible")

    def mean_go(lo: int, hi: int) -> float:
        vals = [r["go_rate"] for r in data if lo <= r["season"] <= hi]
        return sum(vals) / len(vals)

    before, after = mean_go(FIRST_SEASON, 2017), mean_go(2018, current - 1)
    print(f"Mean go rate {FIRST_SEASON}-2017: {before:.1%}  |  2018-{current - 1}: {after:.1%}")
    if not after > before:
        failures.append("go rate did not rise after 2017")

    chart = plot_go_rate(data, current)
    print(f"Chart saved to {chart.relative_to(REPO_ROOT)}")

    if failures:
        print("\nSANITY CHECK FAILED:\n  - " + "\n  - ".join(failures))
        return 1
    print("\nAll sanity checks passed.")
    return 0


def plot_go_rate(data: list[dict], current: int) -> Path:
    theme.apply_theme()
    fig, ax = plt.subplots(figsize=(8, 4.5))
    complete = [r for r in data if r["season"] < current]  # solid lines: complete seasons only
    partial = next(r for r in data if r["season"] == current)
    x = [r["season"] for r in complete]
    series = [
        ("go_rate_short_q1_3", "4th & 1-2, quarters 1-3", theme.ORANGE),
        ("go_rate", "All 4th downs", theme.BLUE),
    ]
    for key, label, color in series:
        y = [r[key] for r in complete]
        ax.plot(x, y, color=color, label=label)
        theme.end_marker(ax, x[-1], y[-1], color)
        ax.annotate(f"{y[-1]:.0%}", (x[-1], y[-1]), xytext=(-10, 11), textcoords="offset points",
                    ha="right", va="center", fontsize=10.5, fontweight="bold", color=theme.INK)
        # in-progress season: hollow dot, so it doesn't read as a finished data point
        ax.plot([current], [partial[key]], marker="o", markersize=theme.MARKER_SIZE, markerfacecolor=theme.SURFACE,
                markeredgecolor=color, markeredgewidth=2, linestyle="none", zorder=5)
    ax.annotate(f"{current}\nso far", (current, partial["go_rate"]), xytext=(0, -24), textcoords="offset points",
                ha="center", va="top", fontsize=8, color=theme.MUTED)

    ax.axvline(2017.5, color=theme.AXIS, linewidth=1, zorder=1)
    ax.text(2017.75, 0.985, "2018", transform=ax.get_xaxis_transform(), ha="left", va="top",
            fontsize=8.5, color=theme.MUTED)

    ax.set_ylim(0, max(r["go_rate_short_q1_3"] for r in data) * 1.15)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.set_xlim(x[0] - 0.5, current + 0.8)
    ax.set_xticks([t for t in range(2000, current + 1, 5)])
    ax.legend(loc="upper left", handlelength=1.6)
    theme.headline(
        fig,
        "NFL coaches are going for it on 4th down more than ever",
        "Share of 4th-down decisions where the offense went for it, by season",
        f"Hollow dots: {current} through week {max_week(current)}. Decisions = go / punt / field goal; "
        "excludes kneels and pre-snap penalties. Data: nflverse play-by-play.",
    )
    return theme.save(fig, OUTPUT_DIR / "go_rate_by_season.png")


def max_week(season: int) -> int:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    return con.execute("select max(week) from marts.fct_plays where season = ?", [season]).fetchone()[0]


if __name__ == "__main__":
    sys.exit(main())
