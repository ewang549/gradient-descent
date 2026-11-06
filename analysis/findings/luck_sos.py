"""Finding 2: does remaining-schedule strength reliably improve the point-differential forecast? `python -m analysis.findings.luck_sos`

luck_skill.py found held-out RMSE 0.2067 -> 0.2048 at k = 8 when the remaining opponents' average Pythagorean win%
(each measured through the cutoff week) is added to the forecast. This bootstraps that gain with the same
season-block procedure as the point-diff gain (seasons resampled, 2000 draws, LOSO and forward-chaining). A v2
forecast with schedule strength is published only if the LOSO 95% CI of the RMSE change excludes zero.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from analysis.findings import common
from analysis.findings import luck_skill as L

SLUG = L.SLUG


def gain(df: pd.DataFrame, metric: str, scheme: str) -> dict:
    p0 = L.out_of_sample(df, [metric], "rest_win_pct", "n_rest", scheme)
    p1 = L.out_of_sample(df, [metric, f"sos_{metric}"], "rest_win_pct", "n_rest", scheme)
    ok = p0.notna() & p1.notna() & df[f"sos_{metric}"].notna()
    d = df[ok]
    y, w = d["rest_win_pct"].to_numpy(float), d["n_rest"].to_numpy(float)
    e0, e1 = p0[ok].to_numpy(float) - y, p1[ok].to_numpy(float) - y
    seasons = d["season"].to_numpy()
    uniq = np.unique(seasons)
    idx = {s: np.flatnonzero(seasons == s) for s in uniq}
    rng = np.random.default_rng(L.SEED)
    boot = []
    for _ in range(L.BOOT):
        pick = np.concatenate([idx[s] for s in rng.choice(uniq, len(uniq))])
        boot.append(L._rmse(e1[pick], w[pick]) - L._rmse(e0[pick], w[pick]))
    lo, hi = float(np.quantile(boot, 0.025)), float(np.quantile(boot, 0.975))
    return {"n": len(d), "seasons": [int(uniq.min()), int(uniq.max())],
            "rmse_without": L._rmse(e0, w), "rmse_with": L._rmse(e1, w), "diff": L._rmse(e1, w) - L._rmse(e0, w),
            "diff_ci": [lo, hi], "share_boot_better": float(np.mean(np.array(boot) < 0)), "excludes_zero": hi < 0 or lo > 0}


def run() -> dict:
    print("Schedule strength: season-block bootstrap of the RMSE gain")
    tg = L.team_games()
    tg = tg[~tg[["off_plays", "def_plays", "control", "control_ns"]].isna().any(axis=1)]
    hist = tg[tg["season"] <= L.LAST_COMPLETE]
    out = {"slug": SLUG, "metric": "pyth", "boot": L.BOOT, "by_k": {}}
    for k in (7, 8):  # 2026 teams have played 7 or 8 games; k = 8 is the number quoted before
        df = L.add_schedule_strength(L.split_at(hist, k).dropna(subset=["rest_win_pct"]), hist, "pyth").reset_index(drop=True)
        out["by_k"][str(k)] = {scheme: gain(df, "pyth", scheme) for scheme in ("loso", "forward")}
        for scheme, g in out["by_k"][str(k)].items():
            print(f"  k={k} {scheme:7s} n={g['n']} RMSE {g['rmse_without']:.4f} -> {g['rmse_with']:.4f} "
                  f"diff {g['diff']:+.4f} [{g['diff_ci'][0]:+.4f}, {g['diff_ci'][1]:+.4f}] better in {g['share_boot_better']:.0%} of draws")
    # the decision rule was set on the k = 8 gain quoted before this check; k = 7 is reported, not used to decide
    main = out["by_k"]["8"]["loso"]
    reliable = main["excludes_zero"] and main["diff"] < 0
    out["decided_on"] = "k=8 LOSO"
    out["reliable_gain"] = reliable
    out["verdict"] = ("schedule strength reliably improves the forecast; v2 published" if reliable else
                      "no reliable gain: at k = 8 the 95% CI of the RMSE change includes zero, so no v2 forecast")
    print(f"  verdict: {out['verdict']}")
    common.write(SLUG, "sos_check.json", out)
    return out


if __name__ == "__main__":
    run()
