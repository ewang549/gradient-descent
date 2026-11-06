"""Grade finding 2's timestamped 2026 predictions after week 18. `python -m analysis.findings.luck_grade`

Runs in the weekly Action. Until the 2026 regular season is over it prints why and exits 0 without writing.
After that it applies each file's own pre-registered rules, word for word, and writes grades_2026.json once:

  predictions_2026_wk08.json               MAE vs same pace and coin flip; the 5 cool-off / 5 heat-up calls; 80% ranges
  predictions_2026_wk08_vs_baseline.json   MAE of baseline, point diff and market; hit rate on the 10 highlighted teams

"Over" = every regular-season game is final, or it's 7+ days past the last scheduled regular-season date (a
game that was never played then counts as cancelled: forecasts are scaled to the games actually played).

    python -m analysis.findings.luck_grade                    grade if the season is over
    python -m analysis.findings.luck_grade --partial --out D  grade the games played so far into D (dry run for the card)
    python -m analysis.findings.luck_grade --simulate --out D unplayed games drawn from the market's probabilities,
                                                              marked SIMULATED (for building and testing the results card)
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from analysis.findings import common
from models import data

SLUG = "luck-skill"
SEASON = 2026
ORIGINAL = f"predictions_{SEASON}_wk08.json"
VS_BASELINE = f"predictions_{SEASON}_wk08_vs_baseline.json"
OUT = f"grades_{SEASON}.json"


def schedule() -> pd.DataFrame:
    return data.query("""
        select game_id, week, game_date, home_team, away_team, home_score, away_score
        from staging.stg_schedules where season = ? and game_type = 'REG'
    """, [SEASON])


def season_over(s: pd.DataFrame, today: date) -> tuple[bool, str]:
    left = s["home_score"].isna().sum()
    if left == 0:
        return True, "every regular-season game is final"
    last = pd.Timestamp(s["game_date"].max()).date()
    if today >= last + timedelta(days=7):
        return True, f"{left} regular-season games never finished; counted as cancelled ({today} is 7+ days past {last})"
    return False, f"{left} regular-season games still to play (last scheduled {last})"


def results(s: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Per team, its final games: game_id, week, win (1 / 0.5 / 0)."""
    g = s.dropna(subset=["home_score"])
    rows = []
    for r in g.itertuples():
        hw = 1.0 if r.home_score > r.away_score else 0.5 if r.home_score == r.away_score else 0.0
        rows += [{"team": r.home_team, "game_id": r.game_id, "week": r.week, "win": hw},
                 {"team": r.away_team, "game_id": r.game_id, "week": r.week, "win": 1 - hw}]
    d = pd.DataFrame(rows)
    return {t: x for t, x in d.groupby("team")}


def _mae(pred: dict, actual: dict) -> float:
    return float(np.mean([abs(pred[t] - actual[t]) for t in actual]))


def grade_original(p: dict, res: dict[str, pd.DataFrame]) -> dict:
    """Rules 1-3 of predictions_2026_wk08.json. Remaining games there = every game after data_through_week."""
    wk = p["data_through_week"]
    teams = {t["team"]: t for t in p["teams"]}
    rows = {}
    for team, t in teams.items():
        g = res.get(team, pd.DataFrame(columns=["week", "win"]))
        rest = g[g["week"] > wk]
        n = len(rest)
        scale = n / t["remaining_games"] if t["remaining_games"] else 0
        actual = float(rest["win"].sum())
        lo, hi = (v * scale for v in t["rest_wins_80"])
        rows[team] = {"played": n, "actual_rest_wins": actual, "actual_rest_win_pct": actual / n if n else None,
                      "pred_rest_wins": t["pred_rest_win_pct"] * n, "same_pace_rest_wins": t["win_pct"] * n,
                      "coin_flip_rest_wins": 0.5 * n, "range_80": [lo, hi], "in_range": bool(lo <= actual <= hi),
                      "win_pct_first": t["win_pct"]}
    actual = {t: r["actual_rest_wins"] for t, r in rows.items()}
    mae = {k: _mae({t: r[f"{k}_rest_wins"] for t, r in rows.items()}, actual) for k in ("pred", "same_pace", "coin_flip")}
    by = pd.DataFrame(p["teams"])
    cool = by.sort_values("p_cools_off", ascending=False).head(5)["team"].tolist()
    heat = by.sort_values("p_heats_up", ascending=False).head(5)["team"].tolist()

    def moved(team: str, direction: int) -> bool:
        r = rows[team]
        if r["actual_rest_win_pct"] is None:
            return False
        d = r["actual_rest_win_pct"] - r["win_pct_first"]
        return d < 0 if direction < 0 else d > 0  # ties = no change = miss

    calls = {"cool_off": {t: moved(t, -1) for t in cool}, "heat_up": {t: moved(t, +1) for t in heat}}
    coverage = float(np.mean([r["in_range"] for r in rows.values()]))
    return {
        "file": ORIGINAL,
        "rule_1_mae": {"model": mae["pred"], "same_pace": mae["same_pace"], "coin_flip": mae["coin_flip"],
                       "passes": mae["pred"] < mae["same_pace"]},
        "rule_2_calls": {**calls, "hits": sum(calls["cool_off"].values()) + sum(calls["heat_up"].values()), "of": 10,
                         "note": "near-guaranteed by regression to the mean; see the vs-baseline file for the real test"},
        "rule_3_coverage_80": {"share": coverage, "expected": 0.8},
        "teams": rows,
    }


def grade_vs_baseline(p: dict, res: dict[str, pd.DataFrame]) -> dict:
    """Rules 1-2 of predictions_2026_wk08_vs_baseline.json, over each team's listed remaining games."""
    rows = {}
    for t in p["teams"]:
        team = t["team"]
        listed = {g["game_id"]: g["p_win"] for g in p["market"]["per_game"][team]}
        g = res.get(team, pd.DataFrame(columns=["game_id", "win"]))
        rest = g[g["game_id"].isin(listed)]
        n = len(rest)
        actual = float(rest["win"].sum())
        rows[team] = {
            "played": n, "listed": len(listed), "actual_rest_wins": actual,
            "baseline_rest_wins": t["baseline_rest_win_pct"] * n, "point_diff_rest_wins": t["point_diff_rest_win_pct"] * n,
            "market_rest_wins": float(sum(listed[x] for x in rest["game_id"])),
            "same_pace_rest_wins": t["win_pct"] * n, "coin_flip_rest_wins": 0.5 * n,
            "p_beats_baseline": t["p_beats_baseline"],
        }
    actual = {t: r["actual_rest_wins"] for t, r in rows.items()}
    names = ("baseline", "point_diff", "market", "same_pace", "coin_flip")
    mae = {k: _mae({t: r[f"{k}_rest_wins"] for t, r in rows.items()}, actual) for k in names}
    up, down = p["highlighted"]["point_diff_above_baseline"], p["highlighted"]["point_diff_below_baseline"]
    hits = {**{t: rows[t]["actual_rest_wins"] > rows[t]["baseline_rest_wins"] for t in up},
            **{t: rows[t]["actual_rest_wins"] < rows[t]["baseline_rest_wins"] for t in down}}
    expected = sum(rows[t]["p_beats_baseline"] for t in up) + sum(1 - rows[t]["p_beats_baseline"] for t in down)
    return {
        "file": VS_BASELINE,
        "rule_1_mae": {**mae, "point_diff_beats_baseline": mae["point_diff"] < mae["baseline"],
                       "best": min(("baseline", "point_diff", "market"), key=mae.get)},
        "rule_2_highlighted": {"above": {t: hits[t] for t in up}, "below": {t: hits[t] for t in down},
                               "hits": int(sum(hits.values())), "of": len(hits), "expected": expected, "chance": len(hits) / 2},
        "teams": rows,
    }


def simulate(s: pd.DataFrame, seed: int = common.SEED) -> pd.DataFrame:
    """Fill unplayed games with outcomes drawn from the vs-baseline file's market probabilities (never for real grades)."""
    p = json.loads((common.FINDINGS_DIR / SLUG / VS_BASELINE).read_text())
    home_p = {g["game_id"]: (g["p_win"] if g["home"] else 1 - g["p_win"]) for gs in p["market"]["per_game"].values() for g in gs}
    rng = np.random.default_rng(seed)
    s = s.copy()
    todo = s["home_score"].isna()
    won = rng.random(todo.sum()) < s.loc[todo, "game_id"].map(home_p).fillna(0.5).to_numpy()
    s.loc[todo, "home_score"], s.loc[todo, "away_score"] = np.where(won, 1, 0), np.where(won, 0, 1)
    return s


def grade(today: date, partial: bool = False, simulated: bool = False) -> dict | None:
    s = schedule()
    if simulated:
        s, partial = simulate(s), True
    over, why = season_over(s, today)
    if simulated:
        over, why = False, "SIMULATED outcomes for unplayed games, not real results"
    if not over and not partial:
        print(f"Not grading yet: {why}.")
        return None
    d = common.FINDINGS_DIR / SLUG
    res = results(s)
    out = {"slug": SLUG, "season": SEASON, "graded_at": datetime.now(UTC).isoformat(timespec="seconds"),
           "status": why if over or simulated else f"PARTIAL (dry run): {why}", "final": over, "simulated": simulated}
    for key, name, fn in (("original", ORIGINAL, grade_original), ("vs_baseline", VS_BASELINE, grade_vs_baseline)):
        f = d / name
        if f.exists():
            p = json.loads(f.read_text())
            out[key] = {"generated_at": p["generated_at"], **fn(p, res)}
    return out


def main(argv: list[str]) -> int:
    simulated = "--simulate" in argv
    partial = "--partial" in argv or simulated
    dest = Path(argv[argv.index("--out") + 1]) if "--out" in argv else common.out_dir(SLUG)
    target = dest / OUT
    if target.exists() and not partial:
        print(f"{target} already exists; grades are written once.")
        return 0
    g = grade(datetime.now(UTC).date(), partial, simulated)
    if g is None:
        return 0
    data.write_json(g, target)
    vb, og = g.get("vs_baseline"), g.get("original")
    if vb:
        m, h = vb["rule_1_mae"], vb["rule_2_highlighted"]
        print(f"vs baseline: MAE baseline {m['baseline']:.2f}, point diff {m['point_diff']:.2f}, market {m['market']:.2f}; "
              f"highlighted {h['hits']}/{h['of']} (expected {h['expected']:.1f})")
    if og:
        print(f"original: MAE {og['rule_1_mae']['model']:.2f} vs same pace {og['rule_1_mae']['same_pace']:.2f}; "
              f"calls {og['rule_2_calls']['hits']}/10; 80% coverage {og['rule_3_coverage_80']['share']:.0%}")
    print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
