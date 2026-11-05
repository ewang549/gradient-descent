"""Shared helpers for the findings modules: output paths, play loading, small stats utilities."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from models import data
from models.config import EXPORTS_DIR

FINDINGS_DIR = EXPORTS_DIR / "findings"
FIRST_SEASON = 2006  # nflverse's xpass, air yards and our WP model all start here
SEED = 42


def out_dir(slug: str) -> Path:
    path = FINDINGS_DIR / slug
    path.mkdir(parents=True, exist_ok=True)
    return path


def write(slug: str, name: str, obj) -> Path:
    return data.write_json(obj, out_dir(slug) / name)


def scrimmage_plays(first_season: int = FIRST_SEASON, extra_sql: str = "") -> pd.DataFrame:
    """Regular-season run/pass snaps (no kneels, spikes, two-point tries) with our model's pre-snap WP.

    `neutral` marks the standard "tendency" sample: downs 1-3, WP 20-80%, not the last two minutes
    of a half, so a team's choices aren't dominated by being far ahead or behind.
    """
    return data.query(f"""
        select p.*, w.wp,
               p.down between 1 and 3 and w.wp between 0.2 and 0.8 and p.half_seconds_remaining > 120
                 and not p.is_overtime as neutral
        from marts.fct_plays p
        join ml.play_wp w using (play_uid)
        where p.season >= ? and p.season_type = 'REG'
          and (p.is_pass or p.is_rush) and not p.is_qb_kneel and not p.is_qb_spike
          and not p.is_two_point_attempt and p.down is not null
          {extra_sql}
    """, [first_season])


def bootstrap_ci(values: np.ndarray, stat=np.mean, n: int = 2000, seed: int = SEED, level: float = 0.95) -> tuple:
    rng = np.random.default_rng(seed)
    values = np.asarray(values)
    stats = np.array([stat(values[rng.integers(0, len(values), len(values))]) for _ in range(n)])
    lo, hi = np.quantile(stats, [(1 - level) / 2, 1 - (1 - level) / 2])
    return float(lo), float(hi)
