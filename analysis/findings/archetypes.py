"""Finding 1: offense archetypes. `python -m analysis.findings.archetypes`

One row per team-season (regular season, 2006 onward; the current season to date), profiled on how
an offense plays, then clustered. The question is whether there are a few recognizable kinds of
offense, and how the league's mix of them has moved.

Method
  * Profile features (neutral situations unless noted; see common.scrimmage_plays):
      style:      pass rate over expected, early-down pass rate, average depth of target, shotgun rate,
                  no-huddle rate, pace (seconds between snaps after a run), 4th-down go rate when the
                  decision model says go (all situations)
      efficiency: EPA per dropback, EPA per designed run
    Play-action and motion (FTN charting) exist only from 2022, so they describe the clusters and get
    their own 2022+ clustering as a check, rather than being inputs for every season.
  * Standardize across all team-seasons (so a 2008 offense and a 2024 offense sit on one scale; the
    era shift is part of the story), then k-means and a Gaussian mixture for k = 2..8.
  * Choose k by silhouette AND bootstrap stability (refit on resampled team-seasons, compare labels
    with the adjusted Rand index), not the elbow: among k whose mean bootstrap ARI >= STABLE_ARI,
    take the highest silhouette.
  * Robustness: k-means vs GMM agreement; fit on 2006-2019 only and assign 2020+ (held-out seasons);
    style-only features; within-season standardization; the 2022+ fit with play-action and motion.
  * UMAP to 2D for the site's map. UMAP is for display only; clusters come from the full feature space.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import umap
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

from analysis.findings import common
from models import data

SLUG = "offense-archetypes"
STYLE = ["proe", "early_down_pass", "adot", "shotgun", "no_huddle", "pace", "go_when_model_says_go"]
EFFICIENCY = ["epa_dropback", "epa_rush"]
FEATURES = STYLE + EFFICIENCY
FTN_FEATURES = ["play_action", "motion"]
LABELS = {
    "proe": "Pass rate over expected", "early_down_pass": "Early-down pass rate", "adot": "Avg depth of target",
    "shotgun": "Shotgun rate", "no_huddle": "No-huddle rate", "pace": "Seconds between snaps",
    "go_when_model_says_go": "4th-down go rate (model says go)", "epa_dropback": "EPA per dropback",
    "epa_rush": "EPA per designed run", "play_action": "Play-action rate", "motion": "Motion rate",
}
K_RANGE = range(2, 9)
BOOTSTRAPS = 100
STABLE_ARI = 0.75
HOLDOUT_FROM = 2020
NULL_DRAWS = 5
MIN_NEUTRAL_PLAYS = 150  # partial current seasons need at least this many neutral snaps


# ----------------------------------------------------------------------------- profiles

def profiles() -> pd.DataFrame:
    plays = common.scrimmage_plays()
    neutral = plays[plays["neutral"]]
    g = neutral.groupby(["season", "posteam"])
    out = pd.DataFrame({
        "neutral_plays": g.size(),
        "proe": g.apply(lambda d: (d["is_pass"].astype(float) - d["nflverse_xpass"]).mean(), include_groups=False),
        "early_down_pass": neutral[neutral["down"] <= 2].groupby(["season", "posteam"])["is_pass"].mean(),
        "adot": neutral[neutral["is_pass_attempt"]].groupby(["season", "posteam"])["air_yards"].mean(),
        "shotgun": g["is_shotgun"].mean(),
        "no_huddle": g["is_no_huddle"].mean(),
        "epa_dropback": neutral[neutral["is_pass"]].groupby(["season", "posteam"])["epa"].mean(),
        "epa_rush": neutral[neutral["is_rush"] & ~neutral["is_qb_scramble"]].groupby(["season", "posteam"])["epa"].mean(),
    })
    out["plays"] = plays.groupby(["season", "posteam"]).size()
    out["games"] = plays.groupby(["season", "posteam"])["game_id"].nunique()
    out = out.join(_pace(), how="left").join(_fourth_downs(), how="left").join(_ftn(), how="left")
    out = out.reset_index().rename(columns={"posteam": "team"})
    return out[out["neutral_plays"] >= MIN_NEUTRAL_PLAYS].reset_index(drop=True)


def _pace() -> pd.Series:
    """Median seconds from a snap to the next one in the same drive and quarter, after a plain run
    (no penalty, score or turnover), in neutral situations. Measuring only after runs keeps
    incompletions, which stop the clock, from making pass-heavy teams look fast."""
    df = data.query("""
        with s as (
            select p.season, p.posteam, p.game_id, p.drive_number, p.qtr, p.play_seq, p.game_seconds_remaining,
                   p.is_rush and not p.is_qb_scramble and not p.is_penalty and not p.is_touchdown
                     and not p.is_fumble_lost as clean_run,
                   p.down between 1 and 3 and w.wp between 0.2 and 0.8 and p.half_seconds_remaining > 120 as neutral
            from marts.fct_plays p join ml.play_wp w using (play_uid)
            where p.season >= 2006 and p.season_type = 'REG' and (p.is_pass or p.is_rush) and not p.is_overtime
        ), gaps as (
            select season, posteam, neutral,
                   lag(clean_run) over w as prev_clean_run, lag(qtr) over w as prev_qtr, qtr,
                   lag(game_seconds_remaining) over w - game_seconds_remaining as gap
            from s window w as (partition by game_id, drive_number order by play_seq)
        )
        select season, posteam, median(gap) as pace
        from gaps
        where prev_clean_run and prev_qtr = qtr and neutral and gap between 5 and 50
        group by all
    """)
    return df.set_index(["season", "posteam"])["pace"]


def _fourth_downs() -> pd.Series:
    df = data.query("""
        select season, posteam, avg(is_go::double) as go_when_model_says_go, count(*) as model_go_spots
        from marts.fct_fourth_down_decisions
        where season >= 2006 and season_type = 'REG' and is_graded and recommendation = 'go'
        group by all
    """)
    return df.set_index(["season", "posteam"])[["go_when_model_says_go", "model_go_spots"]]


def _ftn() -> pd.DataFrame:
    df = data.query("""
        select p.season, p.posteam,
               avg(f.is_play_action::double) filter (where p.is_pass) as play_action,
               avg(f.is_motion::double) as motion
        from marts.fct_plays p join staging.stg_ftn_charting f using (play_uid)
        where p.season_type = 'REG' and (p.is_pass or p.is_rush) and not p.is_qb_kneel and not p.is_qb_spike
        group by all
    """)
    return df.set_index(["season", "posteam"])


# ----------------------------------------------------------------------------- clustering

def standardize(df: pd.DataFrame, cols: list[str], within_season: bool = False) -> np.ndarray:
    if within_season:
        z = df.groupby("season")[cols].transform(lambda c: (c - c.mean()) / c.std(ddof=0))
        return z.to_numpy()
    return StandardScaler().fit_transform(df[cols])


def kmeans(x: np.ndarray, k: int, seed: int = common.SEED) -> KMeans:
    return KMeans(n_clusters=k, n_init=20, random_state=seed).fit(x)


def null_silhouette(x: np.ndarray, k: int, draws: int = NULL_DRAWS) -> float:
    """Silhouette k-means gets on one featureless Gaussian blob with the data's covariance. Real
    archetypes should beat it clearly; k-means always finds *some* partition."""
    cov = np.cov(x.T)
    sils = []
    for d in range(draws):
        z = np.random.default_rng(1000 + d).multivariate_normal(np.zeros(x.shape[1]), cov, len(x))
        sils.append(silhouette_score(z, kmeans(z, k).labels_))
    return float(np.mean(sils))


def cluster_jaccard(ref_labels: np.ndarray, boot_labels: list[np.ndarray]) -> list[float]:
    """Hennig's clusterwise stability: for each reference cluster, the mean over bootstraps of its best
    Jaccard match. Above ~0.75 a cluster is usually called stable, below ~0.6 it is not really there."""
    out = []
    for c in np.unique(ref_labels):
        a = ref_labels == c
        best = [max(((a & (b == j)).sum() / (a | (b == j)).sum()) for j in np.unique(b)) for b in boot_labels]
        out.append(float(np.mean(best)))
    return out


def choose_k(x: np.ndarray) -> list[dict]:
    rng = np.random.default_rng(common.SEED)
    rows = []
    for k in K_RANGE:
        ref = kmeans(x, k)
        aris, boots = [], []
        for b in range(BOOTSTRAPS):
            idx = rng.integers(0, len(x), len(x))
            boots.append(kmeans(x[idx], k, seed=b).predict(x))
            aris.append(adjusted_rand_score(ref.labels_, boots[-1]))
        gmm = GaussianMixture(k, covariance_type="full", n_init=5, random_state=common.SEED, reg_covar=1e-3).fit(x)
        gmm_labels = gmm.predict(x)
        rows.append({
            "k": k,
            "kmeans_silhouette": silhouette_score(x, ref.labels_),
            "null_silhouette": null_silhouette(x, k),
            "cluster_jaccard": cluster_jaccard(ref.labels_, boots),
            "bootstrap_ari_mean": float(np.mean(aris)),
            "bootstrap_ari_p10": float(np.quantile(aris, 0.1)),
            "inertia": float(ref.inertia_),
            "gmm_bic": float(gmm.bic(x)),
            "gmm_silhouette": silhouette_score(x, gmm_labels) if len(set(gmm_labels)) > 1 else float("nan"),
            "kmeans_vs_gmm_ari": adjusted_rand_score(ref.labels_, gmm_labels),
        })
        print(f"  k={k}: silhouette {rows[-1]['kmeans_silhouette']:.3f} (null {rows[-1]['null_silhouette']:.3f})  bootstrap ARI {rows[-1]['bootstrap_ari_mean']:.2f} "
              f"(p10 {rows[-1]['bootstrap_ari_p10']:.2f})  GMM BIC {rows[-1]['gmm_bic']:.0f}  "
              f"k-means vs GMM ARI {rows[-1]['kmeans_vs_gmm_ari']:.2f}  cluster Jaccard "
              f"{[round(j, 2) for j in rows[-1]['cluster_jaccard']]}")
    return rows


def pick_k(search: list[dict]) -> int | None:
    stable = [r for r in search if r["bootstrap_ari_mean"] >= STABLE_ARI]
    return max(stable, key=lambda r: r["kmeans_silhouette"])["k"] if stable else None


def ordered_labels(model: KMeans, x: np.ndarray, order_by: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Relabel clusters 0..k-1 by a centroid value, so labels are deterministic across refits."""
    order = np.argsort(order_by)
    remap = np.empty_like(order)
    remap[order] = np.arange(len(order))
    return remap[model.predict(x)], model.cluster_centers_[order]


def robustness(df: pd.DataFrame, x: np.ndarray, k: int, labels: np.ndarray) -> dict:
    out = {}
    # held-out seasons: fit only on 2006-2019, assign 2020+, compare with the full fit's labels there
    train = (df["season"] < HOLDOUT_FROM).to_numpy()
    scaler = StandardScaler().fit(df.loc[train, FEATURES])
    early = kmeans(scaler.transform(df.loc[train, FEATURES]), k)
    held = early.predict(scaler.transform(df.loc[~train, FEATURES]))
    out["holdout_ari"] = adjusted_rand_score(labels[~train], held)
    # and the reverse: clusters found in 2020+ alone vs the full fit
    late = StandardScaler().fit_transform(df.loc[~train, FEATURES])
    out["late_only_fit_ari"] = adjusted_rand_score(labels[~train], kmeans(late, k).labels_)
    gmm = GaussianMixture(k, covariance_type="full", n_init=5, random_state=common.SEED, reg_covar=1e-3).fit(x)
    out["kmeans_vs_gmm_ari"] = adjusted_rand_score(labels, gmm.predict(x))
    out["gmm_mean_max_posterior"] = float(gmm.predict_proba(x).max(axis=1).mean())
    out["style_only_ari"] = adjusted_rand_score(labels, kmeans(standardize(df, STYLE), k).labels_)
    out["within_season_ari"] = adjusted_rand_score(labels, kmeans(standardize(df, FEATURES, within_season=True), k).labels_)
    recent = df["play_action"].notna().to_numpy()
    xr = standardize(df[recent], FEATURES + FTN_FEATURES)
    out["ftn_2022_plus_ari"] = adjusted_rand_score(labels[recent], kmeans(xr, k).labels_)
    out["ftn_2022_plus_team_seasons"] = int(recent.sum())
    for name, v in out.items():
        print(f"  {name}: {v:.3f}" if isinstance(v, float) else f"  {name}: {v}")
    return out


# ----------------------------------------------------------------------------- era vs team

def era_vs_team(df: pd.DataFrame) -> list[dict]:
    """For each feature: how much of the spread across team-seasons is just the year (R^2 of season
    means, with the share 20 random groupings would get for comparison), and whether what's left is a
    lasting team trait (correlation of a franchise's season-adjusted value with its next season's)."""
    rows = []
    for f in FEATURES + FTN_FEATURES:
        d = df.dropna(subset=[f]).copy()
        season_mean = d.groupby("season")[f].transform("mean")
        r2 = 1 - ((d[f] - season_mean) ** 2).sum() / ((d[f] - d[f].mean()) ** 2).sum()
        n_seasons = d["season"].nunique()
        d["adj"] = d[f] - season_mean
        nxt = d[["season", "team", "adj"]].assign(season=d["season"] - 1)
        pairs = d.merge(nxt, on=["season", "team"], suffixes=("", "_next"))
        r_next = float(np.corrcoef(pairs["adj"], pairs["adj_next"])[0, 1]) if len(pairs) > 10 else float("nan")
        lo, hi = _fisher_ci(r_next, len(pairs))
        rows.append({"feature": f, "season_r2": float(r2), "chance_r2": (n_seasons - 1) / (len(d) - 1),
                     "next_season_r": r_next, "next_season_r_ci": [lo, hi], "pairs": len(pairs),
                     "team_seasons": len(d)})
        print(f"  {f:24s} year explains {r2:5.0%} (chance {rows[-1]['chance_r2']:.0%}); "
              f"same team next season r = {r_next:+.2f} [{lo:+.2f}, {hi:+.2f}], {len(pairs)} pairs")
    return rows


def _fisher_ci(r: float, n: int) -> tuple[float, float]:
    if not np.isfinite(r) or n < 4:
        return float("nan"), float("nan")
    z, se = np.arctanh(r), 1 / np.sqrt(n - 3)
    return float(np.tanh(z - 1.96 * se)), float(np.tanh(z + 1.96 * se))


# ----------------------------------------------------------------------------- run

def run() -> dict:
    print("Offense archetypes: building team-season profiles")
    df = profiles()
    df = df.dropna(subset=FEATURES).reset_index(drop=True)
    print(f"  {len(df)} team-seasons, {df['season'].min()}-{df['season'].max()}, "
          f"median {df['neutral_plays'].median():.0f} neutral snaps each")
    x = standardize(df, FEATURES)
    print("Choosing k")
    search = choose_k(x)
    k = pick_k(search)
    print(f"  chosen k = {k}")
    if k is None:
        return {"k": None, "search": search}
    model = kmeans(x, k)
    proe_col = FEATURES.index("proe")
    labels, centers = ordered_labels(model, x, model.cluster_centers_[:, proe_col])
    df["cluster"] = labels
    print("Robustness")
    robust = robustness(df, x, k, labels)
    print("Era vs team: how much of each trait is the year, and does the rest stick to a team?")
    decomposition = era_vs_team(df)

    emb = umap.UMAP(n_neighbors=15, min_dist=0.15, random_state=common.SEED).fit_transform(x)
    df["umap_x"], df["umap_y"] = emb[:, 0], emb[:, 1]

    centroids = pd.DataFrame(centers, columns=FEATURES)
    raw_means = df.groupby("cluster")[FEATURES + FTN_FEATURES].mean()
    sizes = df.groupby("cluster").size()
    mix = (df.groupby(["season", "cluster"]).size().unstack(fill_value=0)
             .pipe(lambda t: t.div(t.sum(axis=1), axis=0)))
    _print_clusters(centroids, raw_means, sizes, mix)

    result = {
        "slug": SLUG, "k": k, "features": FEATURES, "ftn_features": FTN_FEATURES, "labels": LABELS,
        "team_seasons": len(df), "seasons": [int(df["season"].min()), int(df["season"].max())],
        "search": search, "robustness": robust, "era_vs_team": decomposition,
        "clusters": [{"id": int(c), "size": int(sizes[c]), "z": centroids.loc[c].round(3).to_dict(),
                      "raw": raw_means.loc[c].round(4).to_dict()} for c in range(k)],
        "mix_by_season": {int(s): row.round(4).tolist() for s, row in mix.iterrows()},
    }
    common.write(SLUG, "result.json", result)
    common.write(SLUG, "team_seasons.json", df.round(4).to_dict(orient="records"))
    return result


def _print_clusters(centroids, raw_means, sizes, mix) -> None:
    print("\nCluster centroids (z-scores) and raw means")
    for c in centroids.index:
        z = centroids.loc[c].sort_values(key=abs, ascending=False)
        top = ", ".join(f"{f} {v:+.2f}" for f, v in z.head(4).items())
        print(f"  cluster {c} (n={sizes[c]}): {top}")
        print("    raw: " + ", ".join(f"{f}={raw_means.loc[c, f]:.3f}" for f in raw_means.columns))
    print("\nMix by season (share of team-seasons in each cluster)")
    print(mix.round(2).to_string())


if __name__ == "__main__":
    run()
