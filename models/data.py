"""Warehouse access for the models: read dbt feature tables, write model outputs back."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from models.config import DB_PATH, ML_SCHEMA, TEST_SEASON, TRAIN_SEASONS, VAL_SEASON


def connect(read_only: bool = True) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(DB_PATH), read_only=read_only)


def query(sql: str, params: list | None = None) -> pd.DataFrame:
    with connect() as con:
        return con.execute(sql, params or []).df()


def split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Train / validation / test by season (never by shuffling plays)."""
    train = df[df["season"].between(TRAIN_SEASONS.start, TRAIN_SEASONS.stop - 1)]
    return train, df[df["season"] == VAL_SEASON], df[df["season"] == TEST_SEASON]


def write_table(df: pd.DataFrame, table: str) -> int:
    """Replace ml.<table> with df. dbt reads these tables as sources."""
    # XGBoost returns float32; widen so values don't surface as 0.7710000276565552 downstream
    df = df.astype({c: "float64" for c in df.select_dtypes("float32").columns})
    with connect(read_only=False) as con:
        con.execute(f"create schema if not exists {ML_SCHEMA}")
        con.register("_df", df)
        con.execute(f"create or replace table {ML_SCHEMA}.{table} as select * from _df")
        con.unregister("_df")
    return len(df)


def write_json(obj, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=_json_default) + "\n")
    return path


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else round(float(o), 6)
    if isinstance(o, (pd.Timestamp,)):
        return o.isoformat()
    raise TypeError(f"not JSON serializable: {type(o)}")
