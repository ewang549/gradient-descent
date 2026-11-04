"""The only module that talks to nflverse (through nflreadpy).

Keeping every third-party call here documents exactly what we pull, and lets the tests swap in
fake data without touching the network.
"""

from __future__ import annotations

import nflreadpy as nfl
import polars as pl
from nflreadpy.config import update_config


def configure() -> None:
    # The incremental logic decides what to download, so nflreadpy's own 24h cache could only
    # serve stale data. Season files are ~10-15 MB; give slow connections room.
    update_config(cache_mode="off", timeout=180, verbose=False)


def current_season() -> int:
    return nfl.get_current_season()


def schedules() -> pl.DataFrame:
    """Every game 1999-present, including upcoming ones (`result` is null until the game is final)."""
    return nfl.load_schedules(True)


def pbp(season: int) -> pl.DataFrame:
    """One season of play-by-play. nflverse publishes one file per season."""
    return nfl.load_pbp(season)


def rosters(seasons: list[int]) -> pl.DataFrame:
    return nfl.load_rosters(seasons)


def teams() -> pl.DataFrame:
    """Team abbreviations, franchise ids (`team_id` links OAK->LV, SD->LAC, STL->LA), colors, logos."""
    return nfl.load_teams()
