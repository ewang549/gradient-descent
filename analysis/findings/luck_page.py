"""Finding 2 page data: the regression-to-the-mean numbers and the luck scatter. `python -m analysis.findings.luck_page`

Writes exports/findings/luck-skill/page_data.json from the same team-game table luck_skill.py uses, at k = 8:
  by_record   every 8-game record (ties rounded down): team-seasons, win% in the first 8, win% the rest of the way
  starts      the headline groups: 6-2 or better, 2-6 or worse
  luck        one point per team-season: record minus Pythagorean in the first 8 games vs the rest of the season
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from analysis.findings import common
from analysis.findings import luck_skill as L

SLUG = L.SLUG


def _group(d: pd.DataFrame) -> dict:
    return {"n": len(d), "first_win_pct": float(d["win_pct"].mean()),
            "rest_win_pct": float(np.average(d["rest_win_pct"], weights=d["n_rest"])), "rest_games": int(d["n_rest"].sum())}


def run() -> dict:
    tg = L.team_games()
    tg = tg[~tg[["off_plays", "def_plays", "control", "control_ns"]].isna().any(axis=1)]
    hist = tg[tg["season"] <= L.LAST_COMPLETE]
    k = L.K_MAIN
    df = L.split_at(hist, k).dropna(subset=["rest_win_pct"]).reset_index(drop=True)
    df["w8"] = np.floor(df["win_pct"] * k + 1e-9).astype(int)
    by_record = [{"wins": int(w), "losses": k - int(w), **_group(g)} for w, g in df.groupby("w8")]
    starts = {"6-2 or better": _group(df[df["win_pct"] >= 6 / k]), "2-6 or worse": _group(df[df["win_pct"] <= 2 / k])}
    luck_first = df["win_pct"] - df["pyth"]
    luck_rest = df["rest_win_pct"] - df["rest_pyth"]
    luck = [[int(s), t, round(float(a), 4), round(float(b), 4)] for s, t, a, b in zip(df["season"], df["team"], luck_first, luck_rest)]
    slope = float(np.polyfit(luck_first, luck_rest, 1)[0])
    out = {"slug": SLUG, "k": k, "seasons": [L.FIRST, L.LAST_COMPLETE], "team_seasons": len(df),
           "by_record": by_record, "starts": starts,
           "luck": {"columns": ["season", "team", "first8", "rest"], "points": luck, "slope": slope,
                    "sd_first8": float(luck_first.std()), "sd_rest": float(luck_rest.std())}}
    for name, g in starts.items():
        print(f"  {name}: {g['n']} team-seasons, {g['first_win_pct']:.3f} in the first {k}, {g['rest_win_pct']:.3f} after")
    print(f"  luck slope first {k} -> rest: {slope:+.3f}")
    common.write(SLUG, "page_data.json", out)
    return out


if __name__ == "__main__":
    run()
