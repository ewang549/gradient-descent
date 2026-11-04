"""DuckDB helpers: connections, transactions, and schema-tolerant appends.

Raw tables are a faithful copy of nflverse (all ~370 play-by-play columns). Cleaning happens later
in dbt; this module only gets data in safely.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import duckdb
import polars as pl

_NUMERIC = {
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "FLOAT", "DOUBLE",
}


class SchemaDriftError(RuntimeError):
    """Incoming data has a column type we can't safely reconcile with the existing table."""


def connect(path: Path) -> duckdb.DuckDBPyConnection:
    path.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(path))


@contextmanager
def transaction(con: duckdb.DuckDBPyConnection) -> Iterator[None]:
    """All-or-nothing writes, so a crash mid-season never leaves half a season behind."""
    con.begin()
    try:
        yield
    except BaseException:
        con.rollback()
        raise
    con.commit()


def table_exists(con: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    (n,) = con.execute(
        "select count(*) from information_schema.tables where table_schema = ? and table_name = ?",
        [schema, table],
    ).fetchone()
    return n > 0


def column_types(con: duckdb.DuckDBPyConnection, relation: str) -> dict[str, str]:
    return {row[0]: row[1] for row in con.execute(f"describe {relation}").fetchall()}


def append(con: duckdb.DuckDBPyConnection, schema: str, table: str, df: pl.DataFrame) -> int:
    """Append `df` to schema.table (creating it on first use). Returns rows written.

    Columns are matched by name, not position. Two kinds of drift are handled because nflverse
    really has them: new columns get added, and INTEGER-vs-DOUBLE mismatches are widened to
    DOUBLE (e.g. `goal_to_go` is Int32 in 2012 but Float64 in other seasons). Any other type
    conflict raises instead of silently coercing values.
    """
    if df.is_empty():
        return 0
    fq = f"{schema}.{table}"
    con.execute(f"create schema if not exists {schema}")
    con.register("_incoming", df.to_arrow())
    try:
        if not table_exists(con, schema, table):
            con.execute(f"create table {fq} as select *, current_timestamp as _ingested_at from _incoming")
        else:
            _reconcile_schema(con, fq, column_types(con, "_incoming"))
            con.execute(f"insert into {fq} by name select *, current_timestamp as _ingested_at from _incoming")
    finally:
        con.unregister("_incoming")
    return df.height


def replace(con: duckdb.DuckDBPyConnection, schema: str, table: str, df: pl.DataFrame) -> int:
    """Swap in a fresh full copy of a small table (schedules, teams)."""
    con.execute(f"drop table if exists {schema}.{table}")
    return append(con, schema, table, df)


def _reconcile_schema(con: duckdb.DuckDBPyConnection, fq: str, incoming: dict[str, str]) -> None:
    existing = column_types(con, fq)
    for col, new_type in incoming.items():
        old_type = existing.get(col)
        if old_type is None:
            con.execute(f'alter table {fq} add column "{col}" {new_type}')
        elif old_type == new_type or new_type == '"NULL"':  # all-null column inserts into anything
            continue
        elif old_type == "VARCHAR":  # anything converts to text losslessly (e.g. rosters.jersey_number)
            continue
        elif old_type in _NUMERIC and new_type in _NUMERIC:
            if old_type != "DOUBLE":
                con.execute(f'alter table {fq} alter column "{col}" type double')
        else:
            raise SchemaDriftError(f"{fq}.{col}: table has {old_type}, incoming data has {new_type}")
