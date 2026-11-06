"""Finding 2 follow-up: does point differential beat the record ONCE BOTH REGRESS? `python -m analysis.findings.luck_baseline`

predictions_2026_wk08.json calls teams to "cool off" or "heat up" relative to their current pace. Regression to the
mean makes most of those calls nearly free: a 6-1 team only has to win less than 86% of its remaining games. The
real skill claim is narrower: point differential forecasts the rest of the season better than the record does after
the record is regressed toward .500 just as hard. This module writes that claim down for 2026, with three forecasts:

  baseline     regressed record: the held-out linear map from first-k win% to rest-of-season win%
  point_diff   the same map from Pythagorean win% (points scored and allowed), i.e. the original file's forecast
  market       the betting market: team ratings fitted to 2026 closing spreads, each remaining game's spread turned
               into a win probability by a spread -> win logistic fitted on 2006-2025

and P(team beats the baseline) from a logistic calibrated on held-out history. Backtests (2006-2025, held-out
seasons) go to baseline_backtest.json: the market forecast's RMSE, the calibration of P(beat baseline) and the track
record of the exact highlight rule used for 2026 (the 5 biggest disagreements each way, every season).

The timestamped predictions file is written once and never overwritten. Only games that hadn't kicked off when it
was written count as "the rest of the season"; anything already started is listed under excluded_started_games.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from analysis.findings import common
from analysis.findings import luck_skill as L
from models import data

SLUG = L.SLUG
BASE, PD = ["win_pct"], ["pyth"]
HIGHLIGHT_N = 5
HALF_LIFE_WEEKS = 4.0  # market ratings: a game's line counts half as much 4 weeks later (fixed a priori, not tuned)
RIDGE = 2.0            # shrinks team ratings toward 0 (league average); in points^2 of spread
BACKTEST_K = (7, 8)    # 2026 teams have played 7 or 8 games
ET = ZoneInfo("America/New_York")


# ----------------------------------------------------------------------------- the betting market

def schedules(first: int = L.FIRST, last: int = L.CURRENT) -> pd.DataFrame:
    s = data.query("""
        select game_id, season, week, game_date, kickoff_time_et, home_team, away_team, home_score, away_score,
               spread_line, coalesce(is_neutral_site, false) as neutral
        from staging.stg_schedules
        where season between ? and ? and game_type = 'REG'
    """, [first, last])
    s["kickoff_utc"] = [
        pd.Timestamp(f"{d} {t or '13:00'}").tz_localize(ET).tz_convert(UTC) for d, t in zip(s["game_date"], s["kickoff_time_et"])
    ]
    return s


def spread_logistic(sched: pd.DataFrame, exclude_season: int | None = None) -> tuple[float, float]:
    """P(home wins) = 1 / (1 + exp(-(a + b * spread_line))), fitted on final, non-tied games (positive spread = home favored)."""
    g = sched.dropna(subset=["home_score", "spread_line"])
    g = g[(g["home_score"] != g["away_score"]) & (g["season"] <= L.LAST_COMPLETE)]
    if exclude_season is not None:
        g = g[g["season"] != exclude_season]
    m = LogisticRegression(C=1e6).fit(g[["spread_line"]].to_numpy(float), (g["home_score"] > g["away_score"]).to_numpy(int))
    return float(m.intercept_[0]), float(m.coef_[0][0])


def market_ratings(games: pd.DataFrame, ref_week: int) -> tuple[dict[str, float], float]:
    """Team ratings (points vs an average team) and home-field edge from the spreads of `games`.

    spread_line = hfa * (not neutral) + rating_home - rating_away, recency-weighted least squares with a small ridge
    on the ratings. This is just the market's own view of each team, read back out of its lines."""
    g = games.dropna(subset=["spread_line"])
    teams = sorted(set(g["home_team"]) | set(g["away_team"]))
    ix = {t: i for i, t in enumerate(teams)}
    X = np.zeros((len(g), len(teams) + 1))
    for r, (h, a) in enumerate(zip(g["home_team"], g["away_team"])):
        X[r, ix[h]], X[r, ix[a]] = 1.0, -1.0
    X[:, -1] = (~g["neutral"].astype(bool)).astype(float)
    w = 0.5 ** ((ref_week - g["week"].to_numpy(float)) / HALF_LIFE_WEEKS)
    y = g["spread_line"].to_numpy(float)
    P = np.diag([RIDGE] * len(teams) + [0.0])
    Xw = X * w[:, None]
    beta = np.linalg.solve(X.T @ Xw + P, Xw.T @ y)
    return {t: float(beta[ix[t]]) for t in teams}, float(beta[-1])


def game_probs(remaining: pd.DataFrame, team: str, ratings: dict, hfa: float, logit: tuple[float, float]) -> list[dict]:
    """Win probability for `team` in each remaining game: the game's own line if it has one, else the ratings."""
    a, b = logit
    out = []
    for _, g in remaining.iterrows():
        if pd.notna(g["spread_line"]):
            spread, source = float(g["spread_line"]), "line"
        else:
            spread = hfa * (not bool(g["neutral"])) + ratings.get(g["home_team"], 0.0) - ratings.get(g["away_team"], 0.0)
            source = "ratings"
        p_home = 1 / (1 + np.exp(-(a + b * spread)))
        home = g["home_team"] == team
        out.append({"game_id": g["game_id"], "week": int(g["week"]), "opp": g["away_team"] if home else g["home_team"],
                    "home": bool(home), "home_spread": round(spread, 2), "source": source,
                    "p_win": round(float(p_home if home else 1 - p_home), 4)})
    return out


# ----------------------------------------------------------------------------- held-out history at k

def history_at_k(hist_tg: pd.DataFrame, sched: pd.DataFrame, k: int) -> pd.DataFrame:
    """Every 2006-2025 team-season at k games: held-out (LOSO) baseline, point-diff and market forecasts of the rest."""
    df = L.split_at(hist_tg, k).dropna(subset=["rest_win_pct"]).reset_index(drop=True)
    df["base"] = L.out_of_sample(df, BASE, "rest_win_pct", "n_rest", "loso")
    df["pd"] = L.out_of_sample(df, PD, "rest_win_pct", "n_rest", "loso")
    hs = sched[sched["season"] <= L.LAST_COMPLETE]
    market, cache = [], {}
    logits = {s: spread_logistic(hs, exclude_season=s) for s in df["season"].unique()}
    for _, r in df.iterrows():
        season_games = hs[hs["season"] == r["season"]]
        key = (r["season"], r["cutoff_week"])
        if key not in cache:  # only lines of games already played at the cutoff (conservative: no lookahead lines)
            cache[key] = market_ratings(season_games[season_games["week"] <= r["cutoff_week"]], int(r["cutoff_week"]))
        ratings, hfa = cache[key]
        rest = season_games[(season_games["week"] > r["cutoff_week"]) &
                            ((season_games["home_team"] == r["team"]) | (season_games["away_team"] == r["team"]))].copy()
        rest["spread_line"] = np.nan  # forecast from the ratings, as if those lines weren't known yet
        ps = game_probs(rest, r["team"], ratings, hfa, logits[r["season"]])
        market.append(np.mean([p["p_win"] for p in ps]) if ps else np.nan)
    df["market"] = market
    df["rest_wins"] = df["rest_win_pct"] * df["n_rest"]
    df["gap_wins"] = (df["pd"] - df["base"]) * df["n_rest"]
    df["beat_base"] = (df["rest_wins"] > df["base"] * df["n_rest"]).astype(int)
    return df


def beat_logistic(df: pd.DataFrame) -> tuple[float, float]:
    m = LogisticRegression(C=1e6).fit(df[["gap_wins"]].to_numpy(float), df["beat_base"].to_numpy(int))
    return float(m.intercept_[0]), float(m.coef_[0][0])


def _p_beat(coef: tuple[float, float], gap: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-(coef[0] + coef[1] * np.asarray(gap, float))))


def highlights(df: pd.DataFrame, n: int = HIGHLIGHT_N) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The n biggest disagreements each way: point diff above the baseline (calls: beats it) and below (falls short)."""
    s = df.sort_values("gap_wins")
    return s.tail(n).iloc[::-1], s.head(n)


def _hit(up: pd.DataFrame, down: pd.DataFrame, actual: str, base_wins: str) -> np.ndarray:
    return np.concatenate([(up[actual] > up[base_wins]).to_numpy(int), (down[actual] < down[base_wins]).to_numpy(int)])


def backtest(df: pd.DataFrame) -> dict:
    """RMSE of each forecast on held-out seasons (season-block bootstrap CIs on the differences), calibration of
    P(beat baseline) out of sample (logistic refit leaving each season out), and the highlight rule's track record."""
    d = df.dropna(subset=["base", "pd", "market"]).copy()
    y, w = d["rest_win_pct"].to_numpy(float), d["n_rest"].to_numpy(float)
    fc = {"baseline": d["base"], "point_diff": d["pd"], "market": d["market"], "same_pace": d["win_pct"],
          "coin_flip": pd.Series(0.5, index=d.index)}
    errs = {n: f.to_numpy(float) - y for n, f in fc.items()}
    rest_wins = d["rest_wins"].to_numpy(float)
    out = {"n": len(d), "rmse": {n: L._rmse(e, w) for n, e in errs.items()},
           "mae_wins": {n: float(np.mean(np.abs(f.to_numpy(float) * w - rest_wins))) for n, f in fc.items()}}

    # P(beat baseline): out of sample, the logistic for season s is fitted on the other seasons
    d["p_beat_oos"] = np.nan
    for s in d["season"].unique():
        coef = beat_logistic(d[d["season"] != s])
        m = d["season"] == s
        d.loc[m, "p_beat_oos"] = _p_beat(coef, d.loc[m, "gap_wins"])
    bins = pd.cut(d["p_beat_oos"], [0, 0.35, 0.45, 0.55, 0.65, 1])
    out["p_beat_calibration"] = [
        {"bin": str(b), "n": int(len(g)), "mean_p": float(g["p_beat_oos"].mean()), "actual": float(g["beat_base"].mean())}
        for b, g in d.groupby(bins, observed=True)]
    out["p_beat_brier"] = float(np.mean((d["p_beat_oos"] - d["beat_base"]) ** 2))
    out["p_beat_brier_coin"] = float(np.mean((0.5 - d["beat_base"]) ** 2))
    out["beat_logistic_all"] = beat_logistic(d)

    # the 2026 highlight rule, applied to every past season
    d["base_wins"] = d["base"] * d["n_rest"]
    per_season, hits_by = [], {}
    for s, g in d.groupby("season"):
        up, down = highlights(g)
        h = _hit(up, down, "rest_wins", "base_wins")
        hits_by[s] = h
        per_season.append({"season": int(s), "hits": int(h.sum()), "of": len(h),
                           "expected": float(np.concatenate([up["p_beat_oos"], 1 - down["p_beat_oos"]]).sum())})
    allh = np.concatenate(list(hits_by.values()))
    out["highlight_rule"] = {"per_season": per_season, "hit_rate": float(allh.mean()), "calls": int(len(allh)),
                             "expected_rate": float(np.mean([r["expected"] / r["of"] for r in per_season]))}

    # season-block bootstrap
    rng = np.random.default_rng(L.SEED)
    seasons = d["season"].to_numpy()
    uniq = np.unique(seasons)
    idx = {s: np.flatnonzero(seasons == s) for s in uniq}
    pairs = [("point_diff", "baseline"), ("market", "baseline"), ("market", "point_diff")]
    boot = {f"{a}_minus_{b}": [] for a, b in pairs}
    hit_boot = []
    for _ in range(L.BOOT):
        pick_s = rng.choice(uniq, len(uniq))
        pick = np.concatenate([idx[s] for s in pick_s])
        r = {n: L._rmse(e[pick], w[pick]) for n, e in errs.items()}
        for a, b in pairs:
            boot[f"{a}_minus_{b}"].append(r[a] - r[b])
        hit_boot.append(np.concatenate([hits_by[s] for s in pick_s]).mean())
    out["rmse_diff_ci"] = {k: [float(np.quantile(v, 0.025)), float(np.quantile(v, 0.975))] for k, v in boot.items()}
    out["highlight_rule"]["hit_rate_ci"] = [float(np.quantile(hit_boot, 0.025)), float(np.quantile(hit_boot, 0.975))]
    return out


# ----------------------------------------------------------------------------- 2026

def forecast_2026(tg: pd.DataFrame, hist_tg: pd.DataFrame, sched: pd.DataFrame, hist_k: dict[int, pd.DataFrame],
                  now: datetime) -> tuple[pd.DataFrame, list[dict], dict]:
    cur = sched[sched["season"] == L.CURRENT]
    unplayed = cur[cur["home_score"].isna()]
    started = unplayed[unplayed["kickoff_utc"] <= pd.Timestamp(now)]
    remaining = unplayed[unplayed["kickoff_utc"] > pd.Timestamp(now)]
    logit = spread_logistic(sched)
    lined = cur.dropna(subset=["spread_line"])
    ref_week = int(lined["week"].max())
    ratings, hfa = market_ratings(lined, ref_week)

    played = tg[tg["season"] == L.CURRENT]
    rows, per_game = [], {}
    for team, g in played.groupby("team"):
        k = len(g)
        split = L.split_at(hist_tg, k).dropna(subset=["rest_win_pct"])
        m = L._metrics(g)
        fit = {}
        for name, cols in (("baseline", BASE), ("point_diff", PD)):
            beta = L._fit(split[cols].to_numpy(float), split["rest_win_pct"].to_numpy(float), split["n_rest"].to_numpy(float))
            fit[name] = float(np.clip(L._predict(beta, np.array([[m[c] for c in cols]]))[0], 0.02, 0.98))
        rest = remaining[(remaining["home_team"] == team) | (remaining["away_team"] == team)].sort_values("week")
        n = len(rest)
        games = game_probs(rest, team, ratings, hfa, logit)
        per_game[team] = games
        market = float(np.mean([x["p_win"] for x in games]))
        coef = beat_logistic(hist_k[k].dropna(subset=["base", "pd"]))
        gap = (fit["point_diff"] - fit["baseline"]) * n
        wins = float(g["win"].sum())
        rows.append({
            "team": team, "games_played": k, "wins": wins, "losses": float(k - wins), "win_pct": m["win_pct"],
            "pyth": m["pyth"], "point_diff_pg": m["point_diff_pg"], "remaining_games": n,
            "baseline_rest_win_pct": fit["baseline"], "point_diff_rest_win_pct": fit["point_diff"], "market_rest_win_pct": market,
            "baseline_rest_wins": fit["baseline"] * n, "point_diff_rest_wins": fit["point_diff"] * n, "market_rest_wins": market * n,
            "same_pace_rest_wins": m["win_pct"] * n, "coin_flip_rest_wins": 0.5 * n,
            "gap_wins": gap, "market_gap_wins": (market - fit["baseline"]) * n,
            "p_beats_baseline": float(_p_beat(coef, gap)),
            "baseline_final_wins": wins + fit["baseline"] * n, "point_diff_final_wins": wins + fit["point_diff"] * n,
            "market_final_wins": wins + market * n,
        })
    t = pd.DataFrame(rows).sort_values("gap_wins", ascending=False).reset_index(drop=True)
    excluded = [{"game_id": r.game_id, "week": int(r.week), "home_team": r.home_team, "away_team": r.away_team,
                 "kickoff_utc": r.kickoff_utc.isoformat()} for r in started.itertuples()]
    market_meta = {"ratings": {k: round(v, 2) for k, v in sorted(ratings.items(), key=lambda kv: -kv[1])},
                   "home_field": round(hfa, 2), "spread_logistic": {"a": logit[0], "b": logit[1]},
                   "lines_through_week": ref_week, "games_with_lines": int(len(lined)), "per_game": per_game}
    return t, excluded, {"market": market_meta}


def write_once(name: str, obj) -> Path | None:
    path = common.out_dir(SLUG) / name
    if path.exists():
        print(f"  {path.name} already exists (timestamped, never overwritten); leaving it as is")
        return None
    return common.write(SLUG, name, obj)


# ----------------------------------------------------------------------------- run

def run(dry_run: bool = False) -> dict:
    now = datetime.now(UTC).replace(microsecond=0)
    print("Luck vs skill follow-up: point differential vs the regressed record")
    tg = L.team_games()
    tg = tg[~tg[["off_plays", "def_plays", "control", "control_ns"]].isna().any(axis=1)]
    hist_tg = tg[tg["season"] <= L.LAST_COMPLETE]
    sched = schedules()

    print("1. Backtests on held-out seasons")
    hist_k, bt = {}, {}
    for k in BACKTEST_K:
        hist_k[k] = history_at_k(hist_tg, sched, k)
        bt[k] = backtest(hist_k[k])
        b = bt[k]
        print(f"  k={k} n={b['n']} RMSE " + "  ".join(f"{n} {v:.4f}" for n, v in b["rmse"].items()))
        print(f"       CI " + "  ".join(f"{n} [{lo:+.4f}, {hi:+.4f}]" for n, (lo, hi) in b["rmse_diff_ci"].items()))
        hr = b["highlight_rule"]
        print(f"       highlight rule: {hr['hit_rate']:.3f} of {hr['calls']} calls [{hr['hit_rate_ci'][0]:.3f}, {hr['hit_rate_ci'][1]:.3f}],"
              f" expected {hr['expected_rate']:.3f}; P(beat) Brier {b['p_beat_brier']:.4f} vs coin {b['p_beat_brier_coin']:.4f}")
        for c in b["p_beat_calibration"]:
            print(f"       P(beat) {c['bin']:12s} n={c['n']:3d} predicted {c['mean_p']:.3f} actual {c['actual']:.3f}")

    print("2. 2026 forecasts")
    t, excluded, meta = forecast_2026(tg, hist_tg, sched, hist_k, now)
    orig_path = common.FINDINGS_DIR / SLUG / f"predictions_{L.CURRENT}_wk08.json"
    if orig_path.exists():
        orig = pd.DataFrame(json.loads(orig_path.read_text())["teams"])
        diff = (t.set_index("team")["point_diff_rest_win_pct"] - orig.set_index("team")["pred_rest_win_pct"]).abs().max()
        print(f"  point-diff forecast matches predictions_2026_wk08.json to within {diff:.1e}")
    if excluded:
        print(f"  excluded (kicked off before {now.isoformat()}): " + ", ".join(f"{e['away_team']}@{e['home_team']}" for e in excluded))
    up, down = highlights(t)
    show = ["team", "wins", "losses", "remaining_games", "baseline_rest_wins", "point_diff_rest_wins", "market_rest_wins", "gap_wins", "p_beats_baseline"]
    print("  point diff says BEATS the baseline:")
    print(up[show].round(2).to_string(index=False))
    print("  point diff says FALLS SHORT of the baseline:")
    print(down[show].round(2).to_string(index=False))
    print(f"  rank agreement (Spearman) market vs point diff gap: {t['gap_wins'].corr(t['market_gap_wins'], method='spearman'):.2f}")

    week = int(tg[tg["season"] == L.CURRENT]["week"].max())
    record = {
        "slug": SLUG,
        "season": L.CURRENT,
        "generated_at": now.isoformat(),
        "companion_of": f"predictions_{L.CURRENT}_wk{week:02d}.json",
        "parent_commit": L.git_head(),
        "code_sha256": {"analysis/findings/luck_baseline.py": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                        "analysis/findings/luck_skill.py": hashlib.sha256(Path(L.__file__).read_bytes()).hexdigest()},
        "data_through_week": week,
        "claim": ("Point differential forecasts each team's remaining games better than its record does, after the record is "
                  "regressed toward .500 by the same held-out fit. Cooling off / heating up relative to the current pace is "
                  "mostly regression to the mean and is not the claim."),
        "remaining_games_rule": "games that had not kicked off at generated_at; earlier games are in excluded_started_games",
        "excluded_started_games": excluded,
        "forecasts": {
            "baseline": "regressed record: linear map from first-k win% to rest-of-season win%, fitted on 2006-2025 at the team's k",
            "point_diff": "the same map from Pythagorean win% (PF^2.37 / (PF^2.37 + PA^2.37)); identical to predictions_2026_wk08.json",
            "market": (f"team ratings from 2026 point spreads (recency half-life {HALF_LIFE_WEEKS:g} weeks, ridge {RIDGE:g}); a game's own "
                       "line when nflverse has one, else the ratings; spread -> win probability by a logistic fitted on 2006-2025"),
            "same_pace": "reference only: current win% x remaining games",
            "coin_flip": "reference only: half of remaining games",
        },
        "p_beats_baseline": ("P(actual rest-of-season wins > baseline_rest_wins), from a logistic on gap_wins (point_diff_rest_wins - "
                             "baseline_rest_wins) fitted on held-out 2006-2025 forecasts at the same k"),
        "highlighted": {"point_diff_above_baseline": up["team"].tolist(), "point_diff_below_baseline": down["team"].tolist()},
        "grading": {
            "when": f"after week 18 of {L.CURRENT}",
            "rules": [
                ("1. MAE: mean absolute error of rest-of-season wins over all 32 teams for baseline, point_diff and market "
                 "(same_pace and coin_flip reported for reference). A forecast's rest wins = its rest win% x the listed remaining "
                 "games actually played (the market: the sum of its per-game probabilities over games played). Ties count half. "
                 "Point differential passes if its MAE is lower than the baseline's."),
                ("2. Hit rate on the 10 highlighted teams: a point_diff_above_baseline team is a hit if its actual rest wins are "
                 "above baseline_rest_wins, a point_diff_below_baseline team if they are below. Reported with the expected hits "
                 "(the sum of the P(beats baseline) calls) and 5 of 10 as chance."),
            ],
        },
        "teams": t.round(4).to_dict(orient="records"),
        **meta,
    }
    if dry_run:
        print("  dry run: nothing written")
        return record
    written = datetime.now(UTC).replace(microsecond=0)
    kicked = [g["game_id"] for gs in meta["market"]["per_game"].values() for g in gs
              if sched.set_index("game_id").loc[g["game_id"], "kickoff_utc"] <= pd.Timestamp(written)]
    if kicked:
        raise SystemExit(f"games kicked off during the run, rerun so they're excluded: {sorted(set(kicked))}")
    record["written_at"] = written.isoformat()
    write_once(f"predictions_{L.CURRENT}_wk{week:02d}_vs_baseline.json", record)

    result = {"slug": SLUG, "backtest": {str(k): v for k, v in bt.items()},
              "settings": {"half_life_weeks": HALF_LIFE_WEEKS, "ridge": RIDGE, "highlight_n": HIGHLIGHT_N},
              "predictions_file": f"predictions_{L.CURRENT}_wk{week:02d}_vs_baseline.json"}
    common.write(SLUG, "baseline_backtest.json", result)
    return result


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)
