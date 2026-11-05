"""Finding 1 (reframed): offense style is a continuum, not a set of types. `python -m analysis.findings.offense_style`

The first pass (archetypes.py) found k = 4 clusters, but they barely beat a featureless null
(silhouette 0.154 vs 0.121), fell apart when refit on recent seasons only (ARI 0.20) or within
season (0.28), and two of them were mostly "early era" vs "late era". This module asks three
questions instead:

  1. Era removed, are there clusters at all? Z-score every feature within its season (a 2009 team is
     compared with 2009 teams), re-run the k search, and compare silhouette with two nulls:
       * Gaussian: one blob with the data's covariance (what archetypes.py used)
       * copula:   same per-feature distributions (skew, the pile-up at 0% no-huddle) AND the same
                   rank correlations, but no clusters. Skewed features alone can fool k-means into
                   "finding" a cluster of outliers; this null has the same skew, so it can't.
     Clusters only count if they beat both nulls' 95th percentile AND stay stable under bootstrap.
  2. A continuous style map: PCA on the season-standardized style features. Components get named
     from their loadings, and only if those loadings hold up: Tucker congruence vs bootstrap refits
     and vs separate 2006-2015 and 2016-2026 fits (>= 0.95 "the same component", 0.85-0.94 "fairly
     similar"), plus Horn's parallel analysis for whether a component is above noise at all.
  3. League drift on the raw features: league average by season, and the spread between teams by
     season. Raw spread overstates real differences when samples are small (the 2026 half-season,
     ~20 fourth-down "go" spots a year), so spread is noise-corrected with a split-half estimate:
     compute each feature on a team's odd and even games, and var(odd - even) / 4 is the sampling
     noise in the full-season value. True spread = sqrt(observed variance - noise).

Style features only (efficiency is an outcome, not a style; it is reported against the map, not used
to build it). PROE is ~0 every season by construction, so the drift chart uses early-down pass rate.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

from analysis.findings import archetypes, common
from models import data

SLUG = "offense-style"
STYLE = archetypes.STYLE
EFFICIENCY = archetypes.EFFICIENCY
LABELS = archetypes.LABELS
DRIFT = ["shotgun", "early_down_pass", "go_when_model_says_go", "pace", "no_huddle", "adot"]
K_RANGE = range(2, 9)
BOOTSTRAPS = 200
CLUSTER_BOOTSTRAPS = 100
NULL_DRAWS = 20
STABLE_ARI = 0.75
SPLIT_SEASON = 2016  # era fits: 2006-2015 vs 2016-2026
COMPLETE_THROUGH = 2025  # 2026 is in progress; trend tests use complete seasons only
MIN_NEUTRAL_PLAYS = archetypes.MIN_NEUTRAL_PLAYS


# ----------------------------------------------------------------------------- features

def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    plays = common.scrimmage_plays()
    plays = plays[~plays["is_overtime"]].copy()
    fourth = data.query("""
        select game_id, season, posteam, is_go::double as is_go
        from marts.fct_fourth_down_decisions
        where season >= ? and season_type = 'REG' and is_graded and recommendation = 'go'
    """, [common.FIRST_SEASON])
    return plays, fourth


def features(plays: pd.DataFrame, fourth: pd.DataFrame) -> pd.DataFrame:
    """Team-season style + efficiency profile, same definitions as archetypes.profiles() but computed
    from a play frame so it can be re-run on half a team's games."""
    key = ["season", "posteam"]
    n = plays[plays["neutral"]]
    g = n.groupby(key)
    out = pd.DataFrame({
        "neutral_plays": g.size(),
        "proe": (n["is_pass"].astype(float) - n["nflverse_xpass"]).groupby([n["season"], n["posteam"]]).mean(),
        "early_down_pass": n[n["down"] <= 2].groupby(key)["is_pass"].mean(),
        "adot": n[n["is_pass_attempt"]].groupby(key)["air_yards"].mean(),
        "shotgun": g["is_shotgun"].mean(),
        "no_huddle": g["is_no_huddle"].mean(),
        "epa_dropback": n[n["is_pass"]].groupby(key)["epa"].mean(),
        "epa_rush": n[n["is_rush"] & ~n["is_qb_scramble"]].groupby(key)["epa"].mean(),
    })
    out["pace"] = _pace(plays)
    fg = fourth.groupby(key)["is_go"]
    out["go_when_model_says_go"] = fg.mean()
    out["model_go_spots"] = fg.size()
    out["games"] = plays.groupby(key)["game_id"].nunique()
    return out.astype(float)


def _pace(plays: pd.DataFrame) -> pd.Series:
    """Median seconds from snap to snap within a drive and quarter, after a plain run (see archetypes._pace)."""
    p = plays.sort_values(["game_id", "drive_number", "play_seq"])
    clean = p["is_rush"] & ~p["is_qb_scramble"] & ~p["is_penalty"] & ~p["is_touchdown"] & ~p["is_fumble_lost"]
    grp = p.groupby(["game_id", "drive_number"], sort=False)
    prev_clean = clean.groupby([p["game_id"], p["drive_number"]], sort=False).shift(1)
    gap = grp["game_seconds_remaining"].shift(1) - p["game_seconds_remaining"]
    ok = (prev_clean == True) & (grp["qtr"].shift(1) == p["qtr"]) & p["neutral"] & gap.between(5, 50)
    return gap[ok].groupby([p.loc[ok, "season"], p.loc[ok, "posteam"]]).median()


def sampling_noise(plays: pd.DataFrame, fourth: pd.DataFrame) -> pd.DataFrame:
    """Sampling variance of each team-season feature value, with games as the sampling unit.

    Every feature except pace is a ratio sum(y) / sum(w) over a team's plays, so its variance is the
    game-clustered delta-method one: G/(G-1) * sum_g (sum_g y - R sum_g w)^2 / (sum w)^2. Clustering by
    game matters: plays within a game share an opponent and a game script, so they are not independent.
    Pace is a median, so it uses a split-half estimate instead: var(odd games - even games) / 4."""
    n = plays[plays["neutral"]].assign(pass_minus_x=lambda d: d["is_pass"].astype(float) - d["nflverse_xpass"])
    specs = {
        "proe": (n, "pass_minus_x"),
        "early_down_pass": (n[n["down"] <= 2], "is_pass"),
        "adot": (n[n["is_pass_attempt"]], "air_yards"),
        "shotgun": (n, "is_shotgun"),
        "no_huddle": (n, "is_no_huddle"),
        "go_when_model_says_go": (fourth, "is_go"),
    }
    out = {}
    for f, (frame, col) in specs.items():
        d = frame[["season", "posteam", "game_id"]].assign(y=frame[col].astype(float)).dropna()
        per_game = d.groupby(["season", "posteam", "game_id"])["y"].agg(["sum", "count"])
        tot = per_game.groupby(level=[0, 1]).sum()
        r = tot["sum"] / tot["count"]
        resid = per_game["sum"] - per_game["count"] * r.reindex(per_game.index.droplevel(2)).to_numpy()
        g = per_game.groupby(level=[0, 1]).size()
        out[f] = (resid ** 2).groupby(level=[0, 1]).sum() * g / (g - 1) / tot["count"] ** 2

    games = plays[["season", "posteam", "game_id", "week"]].drop_duplicates()
    games["half"] = games.sort_values("week").groupby(["season", "posteam"]).cumcount() % 2
    ph = plays.merge(games[["posteam", "game_id", "half"]], on=["posteam", "game_id"])
    a, b = (_pace(ph[ph["half"] == h]) for h in (0, 1))
    out["pace"] = (a - b) ** 2 / 4
    return pd.DataFrame(out).rename_axis(["season", "team"])


def season_z(df: pd.DataFrame, cols: list[str]) -> np.ndarray:
    return df.groupby("season")[cols].transform(lambda c: (c - c.mean()) / c.std(ddof=0)).to_numpy()


# ----------------------------------------------------------------------------- 1. clusters, era removed

def copula_null(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Draw data with x's marginals and rank correlations but no cluster structure (Gaussian copula)."""
    ranks = np.apply_along_axis(stats.rankdata, 0, x)
    normal_scores = stats.norm.ppf(ranks / (len(x) + 1))
    z = rng.multivariate_normal(np.zeros(x.shape[1]), np.corrcoef(normal_scores.T), len(x))
    u = stats.norm.cdf(z)
    sorted_cols = np.sort(x, axis=0)
    idx = np.minimum((u * len(x)).astype(int), len(x) - 1)
    return np.take_along_axis(sorted_cols, idx, axis=0)


def gaussian_null(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    return rng.multivariate_normal(np.zeros(x.shape[1]), np.cov(x.T), len(x))


def km(x: np.ndarray, k: int, seed: int = common.SEED) -> KMeans:
    return KMeans(n_clusters=k, n_init=10, random_state=seed).fit(x)


def cluster_search(x: np.ndarray, name: str) -> list[dict]:
    print(f"  [{name}] {x.shape[1]} features, {len(x)} team-seasons")
    rng = np.random.default_rng(common.SEED)
    rows = []
    for k in K_RANGE:
        ref = km(x, k)
        sil = silhouette_score(x, ref.labels_)
        nulls = {}
        for null_name, draw in (("gaussian", gaussian_null), ("copula", copula_null)):
            sims = []
            for _ in range(NULL_DRAWS):
                z = draw(x, rng)
                sims.append(silhouette_score(z, km(z, k).labels_))
            nulls[null_name] = {"mean": float(np.mean(sims)), "p95": float(np.quantile(sims, 0.95))}
        aris, boots = [], []
        for b in range(CLUSTER_BOOTSTRAPS):
            idx = rng.integers(0, len(x), len(x))
            boots.append(km(x[idx], k, seed=b).predict(x))
            aris.append(adjusted_rand_score(ref.labels_, boots[-1]))
        sizes = np.bincount(ref.labels_).tolist()
        beats = sil > max(nulls["gaussian"]["p95"], nulls["copula"]["p95"])
        rows.append({"k": k, "silhouette": float(sil), "null": nulls, "beats_both_nulls": bool(beats),
                     "bootstrap_ari_mean": float(np.mean(aris)), "bootstrap_ari_p10": float(np.quantile(aris, 0.1)),
                     "cluster_jaccard": archetypes.cluster_jaccard(ref.labels_, boots), "sizes": sizes})
        print(f"    k={k}: silhouette {sil:.3f} | null gaussian {nulls['gaussian']['mean']:.3f} "
              f"(p95 {nulls['gaussian']['p95']:.3f}), copula {nulls['copula']['mean']:.3f} "
              f"(p95 {nulls['copula']['p95']:.3f}) {'BEATS' if beats else 'no'} | bootstrap ARI "
              f"{np.mean(aris):.2f} | sizes {sizes} | Jaccard {[round(j, 2) for j in rows[-1]['cluster_jaccard']]}")
    return rows


def cluster_verdict(search: list[dict]) -> dict:
    real = [r for r in search if r["beats_both_nulls"] and r["bootstrap_ari_mean"] >= STABLE_ARI]
    margin = max(search, key=lambda r: r["silhouette"] - r["null"]["copula"]["mean"])
    return {"clusters_hold": bool(real), "passing_k": [r["k"] for r in real],
            "best_margin_k": margin["k"],
            "best_margin_vs_copula": margin["silhouette"] - margin["null"]["copula"]["mean"]}


def what_the_clusters_are(df: pd.DataFrame, x: np.ndarray) -> dict:
    """The k that survive the null test: are they groups, or a continuum cut in half / a tail?
    k=2 vs a plain median split of PC1, and whether PC1 itself is bimodal (1- vs 2-component
    Gaussian mixture BIC on the PC1 scores; PCA picks the axis for variance, not for a gap, so this
    isn't rigged toward 2). The small k=3 group vs the heavy no-huddle team-seasons."""
    from sklearn.mixture import GaussianMixture
    k2 = km(x, 2).labels_
    pc1 = df["pc1"].to_numpy()
    median_split = (pc1 > np.median(pc1)).astype(int)
    bic = [GaussianMixture(m, n_init=5, random_state=common.SEED).fit(pc1[:, None]).bic(pc1[:, None]) for m in (1, 2)]
    k3 = km(x, 3).labels_
    small = np.argmin(np.bincount(k3))
    heavy_nh = season_z(df, ["no_huddle"])[:, 0] >= 2
    out = {"k2_vs_pc1_median_split_ari": adjusted_rand_score(k2, median_split),
           "k2_vs_pc1_sign_ari": adjusted_rand_score(k2, (pc1 > 0).astype(int)),
           "pc1_bic_1_component": bic[0], "pc1_bic_2_components": bic[1],
           "pc1_skew": float(stats.skew(pc1)), "pc1_excess_kurtosis": float(stats.kurtosis(pc1)),
           "k3_small_cluster_size": int((k3 == small).sum()),
           "k3_small_cluster_jaccard_with_no_huddle_2sd": float(((k3 == small) & heavy_nh).sum() / ((k3 == small) | heavy_nh).sum()),
           "k3_small_cluster_mean_no_huddle_z": float(season_z(df, ["no_huddle"])[k3 == small, 0].mean())}
    print("  what the clusters are: " + ", ".join(f"{k} {v:.3f}" if isinstance(v, float) else f"{k} {v}" for k, v in out.items()))
    return out


# ----------------------------------------------------------------------------- 2. PCA style map

def pca(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Eigenvalues (descending) and loadings (features x components) of the correlation matrix."""
    vals, vecs = np.linalg.eigh(np.corrcoef(x.T))
    order = np.argsort(vals)[::-1]
    return vals[order], vecs[:, order]


def orient(vecs: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Flip each component's sign to point the same way as the reference component."""
    signs = np.sign(np.sum(vecs * ref, axis=0))
    signs[signs == 0] = 1
    return vecs * signs


def congruence(a: np.ndarray, b: np.ndarray) -> float:
    return float(abs(a @ b) / np.sqrt((a @ a) * (b @ b)))


def plane_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Mean squared cosine of the principal angles between two 2D component planes (1 = same plane).
    Catches the case where PC2 and PC3 swap or rotate but the map itself is unchanged."""
    qa, _ = np.linalg.qr(a)
    qb, _ = np.linalg.qr(b)
    return float(np.mean(np.linalg.svd(qa.T @ qb, compute_uv=False) ** 2))


def parallel_analysis(x: np.ndarray, draws: int = 500) -> np.ndarray:
    """95th percentile eigenvalues from column-shuffled data (Horn). A component is real only if its
    eigenvalue beats the matching shuffled one."""
    rng = np.random.default_rng(common.SEED)
    sims = [pca(np.column_stack([rng.permutation(c) for c in x.T]))[0] for _ in range(draws)]
    return np.quantile(sims, 0.95, axis=0)


def style_map(df: pd.DataFrame, x: np.ndarray) -> dict:
    vals, vecs = pca(x)
    # orient PC1/PC2 so the biggest loading is positive (deterministic, readable names)
    for j in range(vecs.shape[1]):
        if vecs[np.argmax(np.abs(vecs[:, j])), j] < 0:
            vecs[:, j] *= -1
    pa = parallel_analysis(x)
    explained = vals / vals.sum()
    print("  eigenvalue / explained / parallel-analysis 95th pct:")
    for j in range(len(vals)):
        print(f"    PC{j + 1}: {vals[j]:.2f}  {explained[j]:5.1%}  vs {pa[j]:.2f} {'ABOVE NOISE' if vals[j] > pa[j] else ''}")

    rng = np.random.default_rng(common.SEED)
    boot = {"pc1": [], "pc2": [], "plane": [], "explained1": [], "explained2": [], "loadings": []}
    for _ in range(BOOTSTRAPS):
        idx = rng.integers(0, len(x), len(x))
        bv, bvec = pca(x[idx])
        bvec = orient(bvec, vecs)
        boot["pc1"].append(congruence(bvec[:, 0], vecs[:, 0]))
        boot["pc2"].append(congruence(bvec[:, 1], vecs[:, 1]))
        boot["plane"].append(plane_similarity(bvec[:, :2], vecs[:, :2]))
        boot["explained1"].append(bv[0] / bv.sum())
        boot["explained2"].append(bv[1] / bv.sum())
        boot["loadings"].append(bvec[:, :2])
    lo = np.quantile(np.array(boot["loadings"]), [0.025, 0.975], axis=0)

    eras = {}
    for name, mask in (("2006-2015", df["season"] < SPLIT_SEASON), ("2016-2026", df["season"] >= SPLIT_SEASON)):
        ev, evec = pca(x[mask.to_numpy()])
        evec = orient(evec, vecs)
        eras[name] = {"pc1_congruence": congruence(evec[:, 0], vecs[:, 0]),
                      "pc2_congruence": congruence(evec[:, 1], vecs[:, 1]),
                      "plane_similarity": plane_similarity(evec[:, :2], vecs[:, :2]),
                      "explained": (ev[:2] / ev.sum()).tolist(),
                      "loadings": {f: evec[i, :2].round(3).tolist() for i, f in enumerate(STYLE)}}
    a, b = pca(x[(df["season"] < SPLIT_SEASON).to_numpy()])[1], pca(x[(df["season"] >= SPLIT_SEASON).to_numpy()])[1]
    b = orient(b, a)
    eras["early_vs_late"] = {"pc1_congruence": congruence(a[:, 0], b[:, 0]), "pc2_congruence": congruence(a[:, 1], b[:, 1]),
                             "plane_similarity": plane_similarity(a[:, :2], b[:, :2])}

    summary = lambda v: {"median": float(np.median(v)), "p05": float(np.quantile(v, 0.05))}
    out = {
        "eigenvalues": vals.tolist(), "explained": explained.tolist(), "parallel_95": pa.tolist(),
        "components_above_noise": int(np.sum(vals > pa)),
        "loadings": {f: vecs[i, :3].round(3).tolist() for i, f in enumerate(STYLE)},
        "loading_ci": {f: {"pc1": lo[:, i, 0].round(3).tolist(), "pc2": lo[:, i, 1].round(3).tolist()} for i, f in enumerate(STYLE)},
        "bootstrap": {"pc1_congruence": summary(boot["pc1"]), "pc2_congruence": summary(boot["pc2"]),
                      "plane_similarity": summary(boot["plane"]),
                      "explained_pc1_ci": np.quantile(boot["explained1"], [0.025, 0.975]).tolist(),
                      "explained_pc2_ci": np.quantile(boot["explained2"], [0.025, 0.975]).tolist()},
        "eras": eras,
    }
    print("  loadings (PC1, PC2, PC3) with bootstrap 95% CI for PC1/PC2:")
    for i, f in enumerate(STYLE):
        print(f"    {f:24s} {vecs[i, 0]:+.2f} [{lo[0, i, 0]:+.2f},{lo[1, i, 0]:+.2f}]  "
              f"{vecs[i, 1]:+.2f} [{lo[0, i, 1]:+.2f},{lo[1, i, 1]:+.2f}]  {vecs[i, 2]:+.2f}")
    bs = out["bootstrap"]
    print(f"  bootstrap congruence PC1 median {bs['pc1_congruence']['median']:.3f} (p05 {bs['pc1_congruence']['p05']:.3f}), "
          f"PC2 {bs['pc2_congruence']['median']:.3f} (p05 {bs['pc2_congruence']['p05']:.3f}), plane {bs['plane_similarity']['median']:.3f} (p05 {bs['plane_similarity']['p05']:.3f})")
    for name, e in eras.items():
        print(f"  {name}: PC1 {e['pc1_congruence']:.3f}  PC2 {e['pc2_congruence']:.3f}  plane {e['plane_similarity']:.3f}")
    return out, vecs


def persistence(df: pd.DataFrame, cols: list[str]) -> dict:
    """Franchise year-to-year correlation of season-adjusted values (is style a team trait?)."""
    out = {}
    adj = df[["season", "team"]].copy()
    for c in cols:
        adj[c] = df[c] - df.groupby("season")[c].transform("mean")
    for c in cols:
        nxt = adj[["season", "team", c]].assign(season=adj["season"] - 1)
        pairs = adj[["season", "team", c]].merge(nxt, on=["season", "team"], suffixes=("", "_next")).dropna()
        r = float(np.corrcoef(pairs[c], pairs[f"{c}_next"])[0, 1])
        out[c] = {"r": r, "ci": list(archetypes._fisher_ci(r, len(pairs))), "pairs": len(pairs)}
    return out


def ftn_check(df: pd.DataFrame, vecs: np.ndarray) -> dict:
    """2022+ only: add play-action and motion, refit, and compare the shared-feature loadings."""
    ftn = archetypes._ftn().reset_index().rename(columns={"posteam": "team"})
    d = df.merge(ftn, on=["season", "team"]).dropna(subset=["play_action", "motion"]).reset_index(drop=True)
    cols = STYLE + archetypes.FTN_FEATURES
    vals, v = pca(season_z(d, cols))
    v = v[:, :2] * np.sign(np.sum(v[: len(STYLE), :2] * vecs[:, :2], axis=0))
    shared = v[: len(STYLE)]
    out = {"team_seasons": len(d), "pc1_congruence_shared": congruence(shared[:, 0], vecs[:, 0]),
           "pc2_congruence_shared": congruence(shared[:, 1], vecs[:, 1]),
           "explained": (vals[:3] / vals.sum()).tolist(),
           "loadings": {f: v[i, :2].round(3).tolist() for i, f in enumerate(cols)}}
    print(f"  2022+ with play-action + motion ({len(d)} team-seasons): PC1 congruence {out['pc1_congruence_shared']:.3f}, "
          f"PC2 {out['pc2_congruence_shared']:.3f}; loadings " +
          ", ".join(f"{f} {l[0]:+.2f}/{l[1]:+.2f}" for f, l in out["loadings"].items()))
    return out


# ----------------------------------------------------------------------------- 3. drift and spread

def drift(df: pd.DataFrame, noise_var: pd.DataFrame) -> dict:
    """League mean and noise-corrected between-team SD by season, per raw feature, plus a combined
    dispersion index (sum of true between-team variances on a fixed, all-seasons scale)."""
    key = ["season", "team"]
    d = df.set_index(key)
    noise_var = noise_var.reindex(d.index)
    pooled_sd = d[STYLE].std()
    rng = np.random.default_rng(common.SEED)
    per_season = []
    for season, g in d.groupby(level="season"):
        nv = noise_var.loc[g.index]
        idx_true = 0.0
        idx_boot = np.zeros(1000)
        row = {"season": int(season), "teams": len(g)}
        for f in STYLE:
            v = g[f].dropna()
            noise = float(nv[f].mean())
            obs = float(v.var(ddof=1))
            true_var = max(obs - noise, 0.0)
            row[f] = {"mean": float(v.mean()), "sd_observed": obs ** 0.5, "sd_true": true_var ** 0.5, "noise_share": noise / obs if obs else None}
            idx_true += true_var / pooled_sd[f] ** 2
            # team bootstrap for the index CI (resample teams; re-estimate observed variance, keep noise)
            vals = v.to_numpy()
            bs = np.array([vals[rng.integers(0, len(vals), len(vals))].var(ddof=1) for _ in range(1000)])
            idx_boot += np.maximum(bs - noise, 0) / pooled_sd[f] ** 2
        row["dispersion_index"] = idx_true
        row["dispersion_ci"] = np.quantile(idx_boot, [0.025, 0.975]).tolist()
        per_season.append(row)

    complete = [r for r in per_season if r["season"] <= COMPLETE_THROUGH]
    seasons = np.array([r["season"] for r in complete])
    trends = {}
    for f in STYLE + ["dispersion_index"]:
        y = np.array([r[f]["sd_true"] if f != "dispersion_index" else r[f] for r in complete])
        m = np.array([r[f]["mean"] for r in complete]) if f != "dispersion_index" else None
        res = stats.linregress(seasons, y)
        trends[f] = {"sd_slope_per_decade": res.slope * 10, "sd_slope_p": res.pvalue,
                     "sd_first5": float(y[:5].mean()), "sd_last5": float(y[-5:].mean())}
        if m is not None:
            mres = stats.linregress(seasons, m)
            trends[f].update({"mean_first5": float(m[:5].mean()), "mean_last5": float(m[-5:].mean()),
                              "mean_slope_p": mres.pvalue,
                              # how big the league's move is relative to the gap between teams
                              "shift_in_team_sds": float((m[-5:].mean() - m[:5].mean()) / y.mean()) if y.mean() else None})
    print("  feature: league mean 2006-10 -> 2021-25 | true between-team SD 2006-10 -> 2021-25 (slope/decade, p) | shift in team SDs")
    for f in STYLE:
        t = trends[f]
        print(f"    {f:24s} {t['mean_first5']:7.3f} -> {t['mean_last5']:7.3f} | {t['sd_first5']:.3f} -> {t['sd_last5']:.3f} "
              f"({t['sd_slope_per_decade']:+.3f}, p={t['sd_slope_p']:.3f}) | {t['shift_in_team_sds']:+.1f}")
    t = trends["dispersion_index"]
    print(f"  dispersion index {t['sd_first5']:.2f} -> {t['sd_last5']:.2f} (slope/decade {t['sd_slope_per_decade']:+.2f}, p={t['sd_slope_p']:.3f})")
    for r in per_season:
        print(f"    {r['season']}: index {r['dispersion_index']:.2f} [{r['dispersion_ci'][0]:.2f}, {r['dispersion_ci'][1]:.2f}]  "
              + " ".join(f"{f[:8]}={r[f]['sd_true']:.3f}(noise {r[f]['noise_share']:.0%})" for f in DRIFT))
    return {"by_season": per_season, "trends": trends}


def era_share(df: pd.DataFrame) -> dict:
    """Share of all style variation (pooled-standardized raw features) that is just the season."""
    z = (df[STYLE] - df[STYLE].mean()) / df[STYLE].std(ddof=0)
    total = (z ** 2).sum().sum()
    season_means = z.groupby(df["season"]).transform("mean")
    by_feature = ((season_means ** 2).sum() / (z ** 2).sum()).to_dict()
    return {"all_style": float((season_means ** 2).sum().sum() / total), "by_feature": by_feature,
            "chance": (df["season"].nunique() - 1) / (len(df) - 1)}


# ----------------------------------------------------------------------------- run

def run() -> dict:
    print("Offense style: building team-season profiles")
    plays, fourth = load()
    feats = features(plays, fourth)
    feats = feats[feats["neutral_plays"] >= MIN_NEUTRAL_PLAYS].dropna(subset=STYLE + EFFICIENCY)
    df = feats.reset_index().rename(columns={"posteam": "team"})
    check = archetypes.profiles().merge(df, on=["season", "team"], suffixes=("_old", ""))
    print(f"  {len(df)} team-seasons {df['season'].min()}-{df['season'].max()}; agreement with archetypes.profiles(): "
          + ", ".join(f"{f} r={np.corrcoef(check[f + '_old'], check[f])[0, 1]:.3f}" for f in STYLE))
    noise = sampling_noise(plays, fourth)

    print("1. Clusters with era removed (within-season z-scores)")
    x = season_z(df, STYLE)
    search_style = cluster_search(x, "style")
    search_all = cluster_search(season_z(df, STYLE + EFFICIENCY), "style + efficiency")
    verdict = cluster_verdict(search_style)
    print(f"  verdict: {verdict}")

    print("2. PCA style map")
    smap, vecs = style_map(df, x)
    scores = x @ vecs[:, :2]
    df["pc1"], df["pc2"] = scores[:, 0], scores[:, 1]
    smap["persistence"] = persistence(df, ["pc1", "pc2"] + STYLE)
    print("  franchise year-to-year r (season-adjusted): " +
          ", ".join(f"{c} {v['r']:+.2f}" for c, v in smap["persistence"].items()))
    smap["efficiency_r"] = {e: {pc: float(np.corrcoef(df[pc], df.groupby("season")[e].transform(lambda c: c - c.mean()))[0, 1])
                                for pc in ("pc1", "pc2")} for e in EFFICIENCY}
    print(f"  map vs season-adjusted efficiency: {smap['efficiency_r']}")
    smap["ftn_2022_plus"] = ftn_check(df, vecs)
    verdict.update(what_the_clusters_are(df, x))

    # no-huddle callout: where do the heaviest no-huddle offenses sit on the map?
    xz = x
    maha = np.einsum("ij,jk,ik->i", xz, np.linalg.inv(np.cov(xz.T)), xz)
    df["mahalanobis_pct"] = stats.rankdata(maha) / len(maha)
    nh_z = season_z(df, ["no_huddle"])[:, 0]
    df["no_huddle_z"] = nh_z
    nh = df[nh_z >= 2].sort_values("no_huddle_z", ascending=False)
    callout = {"threshold": "no-huddle rate >= 2 SD above that season's mean", "count": len(nh),
               "median_mahalanobis_pct": float(nh["mahalanobis_pct"].median()),
               "median_pc1_pct": float((stats.rankdata(df["pc1"]) / len(df))[nh.index].mean()),
               "median_pc2_pct": float((stats.rankdata(df["pc2"]) / len(df))[nh.index].mean()),
               "team_seasons": nh[["season", "team", "no_huddle", "pace", "pc1", "pc2", "mahalanobis_pct"]].round(3).to_dict(orient="records")}
    print(f"  no-huddle teams (>= 2 SD): {len(nh)}, median outlier percentile {callout['median_mahalanobis_pct']:.2f}, "
          f"mean PC1 pct {callout['median_pc1_pct']:.2f}, PC2 pct {callout['median_pc2_pct']:.2f}")
    print(nh[["season", "team", "no_huddle", "pace", "pc1", "pc2", "mahalanobis_pct"]].head(15).round(2).to_string(index=False))

    print("3. League drift and spread between teams")
    share = era_share(df)
    print(f"  season explains {share['all_style']:.0%} of all style variation (chance {share['chance']:.0%}); by feature "
          + ", ".join(f"{f} {v:.0%}" for f, v in share["by_feature"].items()))
    dr = drift(df, noise)

    result = {"slug": SLUG, "features": STYLE, "labels": LABELS, "team_seasons": len(df),
              "seasons": [int(df["season"].min()), int(df["season"].max())],
              "clusters_era_removed": {"style": search_style, "style_plus_efficiency": search_all, "verdict": verdict},
              "style_map": smap, "no_huddle": callout, "era_share": share, "drift": dr}
    common.write(SLUG, "result.json", result)
    common.write(SLUG, "team_seasons.json", df.round(4).replace({np.nan: None}).to_dict(orient="records"))
    return result


if __name__ == "__main__":
    run()
