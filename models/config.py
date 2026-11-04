"""Phase 2 settings: season splits, paths, shared constants."""

from __future__ import annotations

from ingest.config import DB_PATH, REPO_ROOT

# Season-based split. Plays from one season never land on both sides of a split, so the model
# can't learn a specific game's outcome from its own neighbouring plays.
TRAIN_SEASONS = range(2006, 2023)  # 2006-2022
VAL_SEASON = 2023                  # early stopping, calibration, model choices
TEST_SEASON = 2024                 # touched once, for the reported metrics

ARTIFACTS_DIR = REPO_ROOT / "models" / "artifacts"
REPORTS_DIR = REPO_ROOT / "models" / "reports"
EXPORTS_DIR = REPO_ROOT / "exports"

ML_SCHEMA = "ml"  # where Python writes model outputs inside the warehouse (read back by dbt)

DATA_SOURCE = "Data: nflverse play-by-play"

__all__ = ["ARTIFACTS_DIR", "DATA_SOURCE", "DB_PATH", "EXPORTS_DIR", "ML_SCHEMA", "REPORTS_DIR",
           "REPO_ROOT", "TEST_SEASON", "TRAIN_SEASONS", "VAL_SEASON"]
