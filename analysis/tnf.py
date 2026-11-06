"""Thursday Night Football, graded the morning after: one game's 4th downs in the weekly export's shape.

    uv run python -m analysis.tnf 2026 9       -> docs/launch/tnf_week09/tnf.json
    cd web && npm run tnf -- 2026 9            -> game.png + worst-call.png or best-call.png next to it

The weekly pipeline only publishes complete weeks (the gate), so a lone Thursday game never reaches
exports/weekly. This builds the same JSON for just that game with models.weekly.build_week, so the
share cards and post helpers work on it unchanged. It writes to docs/launch, not exports/, so
nothing here is served by the site.

pick = "worst" if the costliest call lost WORST_CUTOFF or more (the "Lost 2+ WP pts" grade on the
game page), else "best": the correct call that beat what coaches usually do in that spot by the most.
"""

from __future__ import annotations

import sys
from pathlib import Path

from models import data, weekly

WORST_CUTOFF = 0.02
OUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "launch"


def thursday_games(season: int, week: int) -> list[str]:
    g = data.query(f"""
        select game_id from staging.stg_schedules
        where season = {season} and week = {week} and weekday = 'Thursday' and is_final order by game_id
    """)
    return list(g["game_id"])


def build(season: int, week: int, game_id: str) -> dict:
    decisions = weekly.season_decisions(season)
    decisions = weekly.add_value_vs_typical(decisions, weekly.expected_go_model(season))
    game = decisions[decisions["game_id"] == game_id]
    if game.empty:
        raise SystemExit(f"{game_id}: no 4th downs in marts.fct_fourth_down_decisions (run `make refresh`)")
    payload = weekly.build_week(season, week, game, weekly.team_colors())
    payload["leaderboard"] = None  # a one-game "week" has no standings
    payload["games"] = {"scheduled": 1, "final": 1, "with_plays": 1, "with_decisions": 1}
    payload["game_id"] = game_id
    worst = payload["worst"][0] if payload["worst"] else None
    payload["pick"] = "worst" if worst and worst["wp_lost"] >= WORST_CUTOFF else "best"
    return payload


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    season, week = int(argv[0]), int(argv[1])
    games = thursday_games(season, week)
    if not games:
        print(f"No final Thursday game in {season} week {week} yet (nflverse may not have it).")
        return 1
    if len(games) > 1:
        print(f"More than one Thursday game ({', '.join(games)}); using {games[0]}.")
    p = build(season, week, games[0])
    path = data.write_json(p, OUT_DIR / f"tnf_week{week:02d}" / "tnf.json")
    w, b = (p["worst"] or [None])[0], (p["best"] or [None])[0]
    print(f"{games[0]}: {p['summary']['graded_decisions']} graded, pick={p['pick']}")
    if w:
        print(f"  costliest: {w['coach']} {w['decision']} on {w['situation']}, -{w['wp_lost'] * 100:.1f} WP pts")
    if b:
        print(f"  best: {b['coach']} {b['decision']} on {b['situation']}, typical coach goes "
              f"{b['expected_go_rate']:.0%}, +{b['value_vs_typical'] * 100:.1f} pts vs typical")
    print(f"-> {path.relative_to(Path.cwd())}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
