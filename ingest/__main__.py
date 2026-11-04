"""CLI entry point: `python -m ingest` (or `make ingest`).

    python -m ingest                      # incremental: load any final games not yet in DuckDB
    python -m ingest --start-season 2023  # dev: limit to recent seasons
    python -m ingest --refresh 2026       # re-pull a season (picks up nflverse stat corrections)
    python -m ingest --full-refresh       # drop raw tables and rebuild everything from scratch
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

from ingest import db, pipeline
from ingest.config import DB_PATH, FIRST_SEASON

log = logging.getLogger("ingest")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ingest", description="Incrementally load nflverse data into DuckDB.")
    parser.add_argument("--start-season", type=int, default=FIRST_SEASON, help=f"first season to load (default {FIRST_SEASON})")
    parser.add_argument("--refresh", type=int, nargs="+", default=[], metavar="SEASON", help="re-download these seasons even if already loaded")
    parser.add_argument("--full-refresh", action="store_true", help="drop raw tables and reload everything")
    parser.add_argument("--db", type=Path, default=DB_PATH, help=f"DuckDB file (default {DB_PATH})")
    args = parser.parse_args(argv)
    if args.start_season < FIRST_SEASON:
        parser.error(f"nflverse play-by-play starts in {FIRST_SEASON}")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    started = time.perf_counter()
    with db.connect(args.db) as con:
        summary = pipeline.run(con, start_season=args.start_season, refresh=args.refresh, full_refresh=args.full_refresh)
    log.info("done in %.1fs -> %s | rows written: %s", time.perf_counter() - started, args.db, summary.rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
