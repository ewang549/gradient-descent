"""Finding 2: luck vs skill, who's due for regression. `python -m analysis.findings.luck_skill`

A team's record mixes how well it plays with how its close games broke. The question: which measure of
a team's first k games best predicts how it does the REST of the season (and, separately, next season)?

Predictors, all computed from the games already played:
  win_pct      actual record (ties = half a win)
  pyth         Pythagorean win% from points scored and allowed, PF^2.37 / (PF^2.37 + PA^2.37)
  epa_margin   offensive EPA per play minus EPA per play allowed (scrimmage plays)
  control      "game control": a game's time-weighted average win probability from our WP model, averaged
               over games. Our WP model uses the pre-game point spread, so this mixes in the betting market.
  control_ns   the same with the spread zeroed out: how much a team controlled games on the field only
  combined     linear model on win_pct + pyth + epa_margin + control_ns

Validation, all on seasons the fit never saw:
  * leave-one-season-out (LOSO): fit the linear map from predictor to rest-of-season win% on every other
    season, predict the held-out one. Weighted by games remaining.
  * forward-chaining: fit only on earlier seasons, predict the next (what we could have done in real time).
  * baselines: "keeps the same pace" (rest win% = current win%, no regression to the mean) and a coin flip.
  * season-block bootstrap for the RMSE differences (seasons resampled, so correlated teams within a
    season don't count as independent evidence).
Robustness: k = 4..10, era split, without 2020, remaining-schedule strength, ties.

The 2026 application fits the chosen predictor on 2006-2025 at each team's games played and writes
timestamped predictions with pre-registered grading rules to exports/findings/luck-skill/.
"""

from __future__ import annotations

import hashlib
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from analysis.findings import common
from models import data, wp

SLUG = "luck-skill"
PYTH_EXP = 2.37
FIRST, LAST_COMPLETE = 2006, 2025
CURRENT = 2026
K_RANGE = range(4, 11)
K_MAIN = 8
SINGLE = ["win_pct", "pyth", "epa_margin", "control", "control_ns"]
COMBINED = ["win_pct", "pyth", "epa_margin", "control_ns"]
BOOT = 2000
SEED = common.SEED


# ----------------------------------------------------------------------------- per team-game

def team_games() -> pd.DataFrame:
    """One row per team per final regular-season game, 2006 on, with that game's predictors."""
    g = data.query("""
        select game_id, season, week, home_team, away_team, home_score, away_score
        from staging.stg_schedules
        where season >= ? and game_type = 'REG' and home_score is not null
    """, [FIRST])
    home = g.rename(columns={"home_team": "team", "away_team": "opp", "home_score": "pf", "away_score": "pa"})
    away = g.rename(columns={"away_team": "team", "home_team": "opp", "away_score": "pf", "home_score": "pa"})
    tg = pd.concat([home, away], ignore_index=True)[["game_id", "season", "week", "team", "opp", "pf", "pa"]]
    tg["win"] = np.where(tg["pf"] > tg["pa"], 1.0, np.where(tg["pf"] == tg["pa"], 0.5, 0.0))

    epa = data.query("""
        select game_id, posteam, defteam, sum(epa) as epa, count(*) as plays
        from marts.fct_plays
        where season >= ? and season_type = 'REG' and (is_pass or is_rush) and epa is not null
        group by all
    """, [FIRST])
    off = epa.groupby(["game_id", "posteam"])[["epa", "plays"]].sum().rename(columns={"epa": "off_epa", "plays": "off_plays"})
    dfn = epa.groupby(["game_id", "defteam"])[["epa", "plays"]].sum().rename(columns={"epa": "def_epa", "plays": "def_plays"})
    tg = tg.merge(off, left_on=["game_id", "team"], right_index=True, how="left")
    tg = tg.merge(dfn, left_on=["game_id", "team"], right_index=True, how="left")

    tg = tg.merge(game_control(), on=["game_id", "team"], how="left")
    tg = tg.sort_values(["season", "team", "week"]).reset_index(drop=True)
    tg["game_no"] = tg.groupby(["season", "team"]).cumcount() + 1
    tg["games"] = tg.groupby(["season", "team"])["game_no"].transform("max")
    return tg


def game_control() -> pd.DataFrame:
    """Time-weighted average WP per team per game, from our WP model, with and without the spread.

    Each play's WP holds until the next snap, so it's weighted by the seconds until the next play (the last
    play by the time left). Regulation only (the WP model doesn't do overtime)."""
    p = data.query("""
        select f.*, p.posteam, p.home_team, p.away_team, p.play_seq
        from features.feat_wp_plays f
        join marts.fct_plays p using (play_uid)
        where f.season >= ? and p.season_type = 'REG' and f.game_seconds_remaining >= 0
    """, [FIRST])
    model = joblib.load(wp.ARTIFACT)
    stored = data.query("select play_uid, wp from ml.play_wp")
    p = p.merge(stored, on="play_uid", how="inner")
    ns = p.copy()
    ns["posteam_spread_line"] = 0.0
    ns["spread_time"] = 0.0
    p["wp_ns"] = wp.predict(model, ns)
    p = p.sort_values(["game_id", "play_seq"])
    nxt = p.groupby("game_id")["game_seconds_remaining"].shift(-1).fillna(0)
    p["w"] = (p["game_seconds_remaining"] - nxt).clip(lower=0)
    is_home = p["posteam"] == p["home_team"]
    rows = []
    for col, name in (("wp", "control"), ("wp_ns", "control_ns")):
        home_wp = np.where(is_home, p[col], 1 - p[col])
        g = pd.DataFrame({"game_id": p["game_id"], "x": home_wp * p["w"], "w": p["w"]}).groupby("game_id").sum()
        rows.append((g["x"] / g["w"]).rename(name))
    ctl = pd.concat(rows, axis=1)
    teams = p.drop_duplicates("game_id").set_index("game_id")[["home_team", "away_team"]]
    ctl = ctl.join(teams)
    home = ctl.rename(columns={"home_team": "team"})[["team", "control", "control_ns"]]
    away = ctl.rename(columns={"away_team": "team"})[["team"]].assign(control=1 - ctl["control"], control_ns=1 - ctl["control_ns"])
    return pd.concat([home, away]).reset_index()


# ----------------------------------------------------------------------------- first k games vs the rest

def _metrics(g: pd.DataFrame) -> dict:
    pf, pa = g["pf"].sum(), g["pa"].sum()
    return {
        "win_pct": g["win"].mean(),
        "pyth": pf ** PYTH_EXP / (pf ** PYTH_EXP + pa ** PYTH_EXP) if pf + pa else 0.5,
        "epa_margin": g["off_epa"].sum() / g["off_plays"].sum() - g["def_epa"].sum() / g["def_plays"].sum(),
        "control": g["control"].mean(),
        "control_ns": g["control_ns"].mean(),
        "point_diff_pg": (pf - pa) / len(g),
    }


def split_at(tg: pd.DataFrame, k: int) -> pd.DataFrame:
    """Predictors from each team-season's first k games, outcomes from the rest."""
    rows = []
    for (season, team), g in tg.groupby(["season", "team"], sort=False):
        first, rest = g[g["game_no"] <= k], g[g["game_no"] > k]
        if len(first) < k:
            continue
        r = {"season": season, "team": team, "k": k, "cutoff_week": int(first["week"].max()), "n_rest": len(rest),
             **_metrics(first)}
        if len(rest):
            r["rest_win_pct"] = rest["win"].mean()
            m = _metrics(rest)
            r["rest_pyth"] = m["pyth"]
            r["rest_opps"] = list(rest["opp"])
        rows.append(r)
    return pd.DataFrame(rows)


def add_schedule_strength(df: pd.DataFrame, tg: pd.DataFrame, metric: str) -> pd.DataFrame:
    """Average `metric` of the remaining opponents, each measured through the team's cutoff week."""
    cum = []
    for (season, team), g in tg.groupby(["season", "team"], sort=False):
        for i in range(1, len(g) + 1):
            cum.append({"season": season, "team": team, "week": int(g["week"].iloc[i - 1]), **_metrics(g.iloc[:i])})
    cum = pd.DataFrame(cum).sort_values("week")
    out = []
    for _, r in df.iterrows():
        opps = r.get("rest_opps")
        if not isinstance(opps, list) or not opps:
            out.append(np.nan)
            continue
        c = cum[(cum["season"] == r["season"]) & (cum["week"] <= r["cutoff_week"]) & cum["team"].isin(opps)]
        last = c.groupby("team")[metric].last()
        out.append(float(np.mean([last.get(o, 0.5 if metric != "epa_margin" else 0.0) for o in opps])))
    return df.assign(**{f"sos_{metric}": out})


# ----------------------------------------------------------------------------- fitting + evaluation

def _fit(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> np.ndarray:
    X = np.column_stack([np.ones(len(x)), x])
    W = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(X * W[:, None], y * W, rcond=None)
    return beta


def _predict(beta: np.ndarray, x: np.ndarray) -> np.ndarray:
    return np.column_stack([np.ones(len(x)), x]) @ beta


def out_of_sample(df: pd.DataFrame, cols: list[str], y: str, w: str, scheme: str, min_train: int = 6) -> pd.Series:
    """Held-out predictions: LOSO (every other season) or forward (earlier seasons only)."""
    pred = pd.Series(np.nan, index=df.index)
    seasons = sorted(df["season"].unique())
    for s in seasons:
        train = df[df["season"] != s] if scheme == "loso" else df[df["season"] < s]
        if train["season"].nunique() < (1 if scheme == "loso" else min_train):
            continue
        beta = _fit(train[cols].to_numpy(float), train[y].to_numpy(float), train[w].to_numpy(float))
        test = df["season"] == s
        pred[test] = _predict(beta, df.loc[test, cols].to_numpy(float))
    return pred


def _rmse(err: np.ndarray, w: np.ndarray) -> float:
    return float(np.sqrt(np.sum(w * err ** 2) / np.sum(w)))


def evaluate(df: pd.DataFrame, y: str, w: str, scheme: str) -> dict:
    """RMSE of each predictor (and baselines) on held-out seasons, plus season-block bootstrap CIs for
    each predictor's RMSE minus the 'same pace' and 'shrunk record' RMSEs."""
    preds = {name: out_of_sample(df, [name], y, w, scheme) for name in SINGLE}
    preds["combined"] = out_of_sample(df, COMBINED, y, w, scheme)
    ok = preds["win_pct"].notna()
    for p in preds.values():
        ok &= p.notna()
    d = df[ok]
    yv, wv = d[y].to_numpy(float), d[w].to_numpy(float)
    base = {"same_pace": d["win_pct"].to_numpy(float), "coin_flip": np.full(len(d), 0.5)}
    out = {"n": len(d), "seasons": [int(d["season"].min()), int(d["season"].max())], "rmse": {}}
    for name, p in {**{k: v[ok].to_numpy(float) for k, v in preds.items()}, **base}.items():
        out["rmse"][name] = _rmse(p - yv, wv)
    # season-block bootstrap of RMSE differences
    rng = np.random.default_rng(SEED)
    seasons = d["season"].to_numpy()
    uniq = np.unique(seasons)
    idx_by = {s: np.flatnonzero(seasons == s) for s in uniq}
    errs = {name: (p[ok].to_numpy(float) if isinstance(p, pd.Series) else p) - yv for name, p in {**preds, **base}.items()}
    diffs = {f"{a}_minus_{b}": [] for a in [*SINGLE, "combined"] for b in ("same_pace", "win_pct")}
    for _ in range(BOOT):
        pick = np.concatenate([idx_by[s] for s in rng.choice(uniq, len(uniq))])
        r = {n: _rmse(e[pick], wv[pick]) for n, e in errs.items()}
        for a in [*SINGLE, "combined"]:
            for b in ("same_pace", "win_pct"):
                diffs[f"{a}_minus_{b}"].append(r[a] - r[b])
    out["rmse_diff_ci"] = {k: [float(np.quantile(v, 0.025)), float(np.quantile(v, 0.975))] for k, v in diffs.items()}
    out["share_boot_better_than_win_pct"] = {a: float(np.mean(np.array(diffs[f"{a}_minus_win_pct"]) < 0)) for a in [*SINGLE, "combined"]}
    return out


def correlations(df: pd.DataFrame) -> dict:
    """Plain correlations with rest-of-season win%, and whether 'luck' (record minus Pythagorean) persists."""
    d = df.dropna(subset=["rest_win_pct"])
    out = {c: float(np.corrcoef(d[c], d["rest_win_pct"])[0, 1]) for c in SINGLE}
    luck_first = d["win_pct"] - d["pyth"]
    luck_rest = d["rest_win_pct"] - d["rest_pyth"]
    out["luck_persistence_r"] = float(np.corrcoef(luck_first, luck_rest)[0, 1])
    out["luck_persistence_ci"] = list(_fisher_ci(out["luck_persistence_r"], len(d)))
    out["n"] = len(d)
    return out


def _fisher_ci(r: float, n: int) -> tuple[float, float]:
    z, se = np.arctanh(r), 1 / np.sqrt(n - 3)
    return float(np.tanh(z - 1.96 * se)), float(np.tanh(z + 1.96 * se))


# ----------------------------------------------------------------------------- next season

def next_season(tg: pd.DataFrame) -> pd.DataFrame:
    full = pd.DataFrame([{"season": s, "team": t, "games": len(g), **_metrics(g)}
                         for (s, t), g in tg[tg["season"] <= LAST_COMPLETE].groupby(["season", "team"])])
    nxt = full[["season", "team", "win_pct", "games"]].rename(columns={"win_pct": "next_win_pct", "games": "next_games"})
    nxt["season"] -= 1
    return full.merge(nxt, on=["season", "team"])


# ----------------------------------------------------------------------------- 2026

def predictions_2026(tg: pd.DataFrame, history: dict[int, pd.DataFrame], cols: list[str], name: str) -> dict:
    sched = data.query("""
        select game_id, week, home_team, away_team, home_score from staging.stg_schedules
        where season = ? and game_type = 'REG'
    """, [CURRENT])
    played = tg[tg["season"] == CURRENT]
    through = int(played["week"].max())
    rows = []
    for team, g in played.groupby("team"):
        k = len(g)
        hist = history[k].dropna(subset=["rest_win_pct"])
        beta = _fit(hist[cols].to_numpy(float), hist["rest_win_pct"].to_numpy(float), hist["n_rest"].to_numpy(float))
        m = _metrics(g)
        x = np.array([[m[c] for c in cols]])
        p_hat = float(np.clip(_predict(beta, x)[0], 0.02, 0.98))
        remaining = sched[sched["home_score"].isna() & ((sched["home_team"] == team) | (sched["away_team"] == team))]
        n = len(remaining)
        # predictive distribution from held-out residuals at the same k, rescaled to n remaining games:
        # residual = (true rate error) + (binomial noise); refit is LOSO so these are honest out-of-sample errors
        loso = out_of_sample(hist, cols, "rest_win_pct", "n_rest", "loso")
        resid = (hist["rest_win_pct"] - loso).to_numpy(float)
        sims = np.clip(p_hat + resid, 0, 1)
        wins_now = float(g["win"].sum())
        rows.append({
            "team": team, "games_played": k, "wins": wins_now, "losses": float(k - wins_now),
            "win_pct": m["win_pct"], "pyth": m["pyth"], "epa_margin": m["epa_margin"], "control_ns": m["control_ns"],
            "control": m["control"], "point_diff_pg": m["point_diff_pg"],
            "remaining_games": n,
            "pred_rest_win_pct": p_hat,
            "pred_rest_wins": p_hat * n,
            "rest_wins_80": [float(np.quantile(sims, 0.1) * n), float(np.quantile(sims, 0.9) * n)],
            "pred_final_wins": wins_now + p_hat * n,
            "same_pace_rest_wins": m["win_pct"] * n,
            "change_vs_pace": p_hat - m["win_pct"],
            "p_cools_off": float(np.mean(sims < m["win_pct"])),
            "p_heats_up": float(np.mean(sims > m["win_pct"])),
        })
    teams = pd.DataFrame(rows).sort_values("change_vs_pace")
    return {"model": name, "features": cols, "data_through_week": through, "teams": teams.round(4).to_dict(orient="records")}


def git_head() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


# ----------------------------------------------------------------------------- run

def run() -> dict:
    print("Luck vs skill: building team-game table")
    tg = team_games()
    missing = tg[["off_plays", "def_plays", "control", "control_ns"]].isna().any(axis=1)
    print(f"  {len(tg):,} team-games {tg['season'].min()}-{tg['season'].max()}; {missing.sum()} missing a predictor (dropped)")
    tg = tg[~missing]
    hist_tg = tg[tg["season"] <= LAST_COMPLETE]

    print("1. Rest of season from the first k games (held-out seasons)")
    by_k, splits = {}, {}
    for k in K_RANGE:
        df = split_at(hist_tg, k).dropna(subset=["rest_win_pct"])
        splits[k] = df
        by_k[k] = {"loso": evaluate(df, "rest_win_pct", "n_rest", "loso"),
                   "forward": evaluate(df, "rest_win_pct", "n_rest", "forward"),
                   "correlations": correlations(df)}
        r = by_k[k]["loso"]["rmse"]
        print(f"  k={k:2d} n={by_k[k]['loso']['n']} LOSO RMSE: " + "  ".join(f"{n} {v:.4f}" for n, v in r.items()))
    main = splits[K_MAIN]
    print(f"  k={K_MAIN} correlations with rest-of-season win%: {by_k[K_MAIN]['correlations']}")
    print(f"  k={K_MAIN} bootstrap CI, RMSE minus win_pct's: " + ", ".join(
        f"{a} [{by_k[K_MAIN]['loso']['rmse_diff_ci'][f'{a}_minus_win_pct'][0]:+.4f}, {by_k[K_MAIN]['loso']['rmse_diff_ci'][f'{a}_minus_win_pct'][1]:+.4f}]"
        for a in [*SINGLE, "combined"] if a != "win_pct"))

    print("2. Robustness at k = 8")
    robust = {}
    for label, sub in {"2006-2015 test seasons": main[main["season"] <= 2015],
                       "2016-2025 test seasons": main[main["season"] >= 2016],
                       "without 2020": main[main["season"] != 2020],
                       "17-game seasons only (2021+)": main[main["season"] >= 2021]}.items():
        ev = evaluate(sub, "rest_win_pct", "n_rest", "loso")
        robust[label] = ev
        print(f"  {label:30s} n={ev['n']:4d} " + "  ".join(f"{n} {v:.4f}" for n, v in ev["rmse"].items()))
    # does adding remaining-schedule strength help?
    best_single = min((n for n in SINGLE if n != "control"), key=lambda n: by_k[K_MAIN]["loso"]["rmse"][n])
    sos = add_schedule_strength(main, hist_tg, best_single)
    p0 = out_of_sample(sos, [best_single], "rest_win_pct", "n_rest", "loso")
    p1 = out_of_sample(sos, [best_single, f"sos_{best_single}"], "rest_win_pct", "n_rest", "loso")
    robust["schedule_strength"] = {"metric": best_single,
                                   "rmse_without": _rmse((p0 - sos["rest_win_pct"]).to_numpy(), sos["n_rest"].to_numpy()),
                                   "rmse_with": _rmse((p1 - sos["rest_win_pct"]).to_numpy(), sos["n_rest"].to_numpy())}
    print(f"  remaining-schedule strength ({best_single}): RMSE {robust['schedule_strength']['rmse_without']:.4f} -> {robust['schedule_strength']['rmse_with']:.4f}")

    print("3. Next season from this season (held-out seasons)")
    ns_df = next_season(tg)
    ns_df["w"] = ns_df["next_games"].astype(float)
    nxt = {"loso": evaluate(ns_df, "next_win_pct", "w", "loso"), "forward": evaluate(ns_df, "next_win_pct", "w", "forward")}
    print(f"  n={nxt['loso']['n']} LOSO RMSE: " + "  ".join(f"{n} {v:.4f}" for n, v in nxt["loso"]["rmse"].items()))
    nxt["correlations"] = {c: float(np.corrcoef(ns_df[c], ns_df["next_win_pct"])[0, 1]) for c in SINGLE}
    print(f"  correlations with next season's win%: {nxt['correlations']}")

    # choose the 2026 model by held-out RMSE averaged over k = 6..10 (LOSO), among on-field predictors:
    # `control` includes the betting line, so it's reported but not used for the published predictions
    candidates = [n for n in [*SINGLE, "combined"] if n != "control"]
    avg = {n: float(np.mean([by_k[k]["loso"]["rmse"][n] for k in range(6, 11)])) for n in candidates}
    chosen = min(avg, key=avg.get)
    cols = COMBINED if chosen == "combined" else [chosen]
    print(f"4. 2026: chosen predictor {chosen} (mean LOSO RMSE k=6..10: " + ", ".join(f"{n} {v:.4f}" for n, v in avg.items()) + ")")
    played = tg[tg["season"] == CURRENT].groupby("team").size()
    history = {k: split_at(hist_tg, k) for k in sorted(set(played))}
    preds = predictions_2026(tg, history, cols, chosen)
    # the same predictions from the other on-field predictors, to show how much the call depends on the choice
    alt = {n: pd.DataFrame(predictions_2026(tg, history, COMBINED if n == "combined" else [n], n)["teams"]).set_index("team")["pred_rest_win_pct"]
           for n in candidates if n != chosen}
    base = pd.DataFrame(preds["teams"]).set_index("team")["pred_rest_win_pct"]
    agreement = {n: float(base.corr(a, method="spearman")) for n, a in alt.items()}
    print(f"  rank agreement of 2026 predictions with the other predictors: {agreement}")
    t = pd.DataFrame(preds["teams"])
    show = ["team", "games_played", "wins", "win_pct", "pyth", "epa_margin", "control_ns", "pred_rest_win_pct", "remaining_games",
            "pred_rest_wins", "rest_wins_80", "p_cools_off", "p_heats_up"]
    print("  most likely to cool off:")
    print(t.head(6)[show].round(3).to_string(index=False))
    print("  most likely to heat up:")
    print(t.tail(6)[show].round(3).to_string(index=False))

    now = datetime.now(UTC)
    record = {
        "slug": SLUG,
        "season": CURRENT,
        "generated_at": now.isoformat(timespec="seconds"),
        # the predictions are committed together with this module, so HEAD at run time is its parent; the
        # file hash pins the exact code (sha256 of analysis/findings/luck_skill.py in the commit that adds this file)
        "parent_commit": git_head(),
        "code_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "data_through_week": preds["data_through_week"],
        "model": {"predictor": chosen, "features": cols, "fit_on": f"{FIRST}-{LAST_COMPLETE}, each team's games played",
                  "held_out_rmse_k6_10": avg},
        "grading": {
            "when": f"after week 18 of {CURRENT}",
            "rules": [
                ("1. Accuracy: mean absolute error of predicted vs actual rest-of-season wins over all teams, compared with "
                 "'same pace' (rest wins = current win% x games left) and a coin flip (half of games left). The model "
                 "passes if its MAE is lower than same pace."),
                ("2. Calls: of the 5 teams listed most likely to cool off, how many win a lower share of their remaining games "
                 "than of their first games; same for the 5 most likely to heat up. Ties count as no change."),
                "3. Intervals: the share of teams whose rest-of-season wins land inside their 80% range (expect about 80%).",
            ],
        },
        "teams": preds["teams"],
        "rank_agreement_with_other_predictors": agreement,
    }
    week = preds["data_through_week"]
    common.write(SLUG, f"predictions_{CURRENT}_wk{week:02d}.json", record)

    result = {"slug": SLUG, "seasons": [FIRST, LAST_COMPLETE], "pyth_exponent": PYTH_EXP, "k_main": K_MAIN,
              "rest_of_season": {str(k): v for k, v in by_k.items()}, "robustness_k8": robust, "next_season": nxt,
              "chosen": chosen, "chosen_avg_rmse": avg, "predictions_file": f"predictions_{CURRENT}_wk{week:02d}.json",
              "team_seasons_k8": len(main)}
    common.write(SLUG, "result.json", result)
    return result


if __name__ == "__main__":
    run()
