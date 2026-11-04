"""Settings shared by the ingest step. Override the database location with NFL_DUCKDB_PATH."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# One DuckDB file is the whole warehouse. dbt reads the same env var (see dbt/profiles.yml).
DB_PATH = Path(os.environ.get("NFL_DUCKDB_PATH", REPO_ROOT / "data" / "nfl.duckdb"))

# nflverse play-by-play starts in 1999.
FIRST_SEASON = 1999

RAW_SCHEMA = "raw"
