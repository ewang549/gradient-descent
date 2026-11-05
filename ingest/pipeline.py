"""Incremental load of nflverse data into DuckDB `raw` tables.

Why the weekly run is cheap:
  * schedules, teams: small and they change (scores, spreads), so they are fully replaced each run.
  * pbp: the big one. The schedule says which games are final. We diff that against the game_ids
    already in raw.pbp, download only seasons that have missing games, and insert only those games.
    Past seasons are never downloaded again unless you ask (--refresh).
  * rosters: one snapshot per season. Missing seasons are loaded; the current season is re-pulled
    because rosters change week to week.

Only games the schedule marks final are ingested. An in-progress (or not-yet-published) game can't
get stuck half-loaded; it is simply picked up by the next run.

A few old games are final in the schedule but absent from nflverse's play-by-play (e.g. 1999
BAL-STL). They are recorded in raw.pbp_unavailable_games. Past seasons skip them, so we don't
re-download 1999 every week; the current season keeps retrying, because there a missing game
usually just means nflverse hasn't published it yet.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field
from types import ModuleType

import duckdb
import polars as pl

from ingest import db, sources
from ingest.config import RAW_SCHEMA as RAW

log = logging.getLogger(__name__)


@dataclass
class RunSummary:
    run_id: str
    rows: dict[str, int] = field(default_factory=dict)  # table -> rows written this run
    pbp_games: int = 0
    pbp_seasons_downloaded: list[int] = field(default_factory=list)
    missing_from_source: list[str] = field(default_factory=list)  # final games nflverse hasn't published


def plan_pbp_loads(
    final_games: dict[int, set[str]],
    loaded_games: dict[int, set[str]],
    refresh: Iterable[int] = (),
    unavailable: Iterable[str] = (),
) -> dict[int, set[str]]:
    """Return {season: game_ids to load}.

    A pure function (no I/O), so the incremental rule is easy to unit test. A season shows up only
    if it has final games we neither have nor know to be unavailable upstream, or if it is being
    refreshed, in which case every one of its final games is reloaded.
    """
    refresh, unavailable = set(refresh), set(unavailable)
    plan: dict[int, set[str]] = {}
    for season, finals in final_games.items():
        if season in refresh:
            todo = finals
        else:
            todo = finals - loaded_games.get(season, set()) - unavailable
        if todo:
            plan[season] = set(todo)
    return plan


def run(
    con: duckdb.DuckDBPyConnection,
    *,
    start_season: int,
    end_season: int | None = None,
    refresh: Iterable[int] = (),
    full_refresh: bool = False,
    src: ModuleType = sources,
) -> RunSummary:
    src.configure()
    end_season = end_season or src.current_season()
    seasons = list(range(start_season, end_season + 1))
    refresh = set(refresh) & set(seasons)
    summary = RunSummary(run_id=uuid.uuid4().hex[:12])

    con.execute(f"create schema if not exists {RAW}")
    if full_refresh:
        for table in ("pbp", "schedules", "rosters", "teams", "ftn_charting", "participation"):
            con.execute(f"drop table if exists {RAW}.{table}")
        log.info("full refresh: dropped raw tables")

    schedule = src.schedules()
    with db.transaction(con):
        summary.rows["schedules"] = db.replace(con, RAW, "schedules", schedule)
        summary.rows["teams"] = db.replace(con, RAW, "teams", src.teams())
    log.info("schedules: %d games, teams: %d rows (full replace)", summary.rows["schedules"], summary.rows["teams"])

    _load_pbp(con, src, schedule, seasons, end_season, refresh, summary)
    _load_rosters(con, src, seasons, end_season, refresh, summary)
    _load_supplements(con, src, seasons, end_season, refresh, summary)
    _write_log(con, summary)
    return summary


def _load_pbp(
    con, src, schedule: pl.DataFrame, seasons: list[int], current_season: int, refresh: set[int], summary: RunSummary
) -> None:
    finals = (
        schedule.filter(pl.col("result").is_not_null() & pl.col("season").is_in(seasons))
        .group_by("season")
        .agg("game_id")
    )
    final_games = {row["season"]: set(row["game_id"]) for row in finals.iter_rows(named=True)}
    unavailable = _unavailable_games(con, before_season=current_season)
    plan = plan_pbp_loads(final_games, _loaded_games(con), refresh, unavailable)
    summary.rows["pbp"] = 0
    if not plan:
        log.info("pbp: up to date (%d final games; %d known unavailable upstream)",
                 sum(map(len, final_games.values())), len(unavailable))
        return

    for season, wanted in sorted(plan.items()):
        season_df = src.pbp(season)
        summary.pbp_seasons_downloaded.append(season)
        in_file = set(season_df.get_column("game_id").unique().to_list())
        new = season_df.filter(pl.col("game_id").is_in(sorted(wanted)))
        found = wanted & in_file
        if missing := sorted(wanted - in_file):
            summary.missing_from_source.extend(missing)
            log.warning("pbp %d: %d final game(s) missing from nflverse: %s", season, len(missing), ", ".join(missing[:5]))
        with db.transaction(con):
            if season in refresh and db.table_exists(con, RAW, "pbp"):
                con.execute(f"delete from {RAW}.pbp where season = ?", [season])
            rows = db.append(con, RAW, "pbp", new)
            _record_unavailable(con, season, final_games[season] - in_file)
        summary.rows["pbp"] += rows
        summary.pbp_games += len(found)
        log.info("pbp %d: +%d games (%d rows)", season, len(found), rows)


def _unavailable_games(con, before_season: int) -> set[str]:
    """Final games nflverse didn't have the last time we downloaded their (past) season."""
    if not db.table_exists(con, RAW, "pbp_unavailable_games"):
        return set()
    rows = con.execute(
        f"select game_id from {RAW}.pbp_unavailable_games where season < ?", [before_season]
    ).fetchall()
    return {g for (g,) in rows}


def _record_unavailable(con, season: int, game_ids: set[str]) -> None:
    """Replace the season's list with what this download showed (a refresh can clear entries)."""
    con.execute(
        f"create table if not exists {RAW}.pbp_unavailable_games (season integer, game_id varchar, checked_at timestamptz)"
    )
    con.execute(f"delete from {RAW}.pbp_unavailable_games where season = ?", [season])
    for game_id in sorted(game_ids):
        con.execute(f"insert into {RAW}.pbp_unavailable_games values (?, ?, current_timestamp)", [season, game_id])


def _loaded_games(con) -> dict[int, set[str]]:
    if not db.table_exists(con, RAW, "pbp"):
        return {}
    rows = con.execute(f"select season, list(distinct game_id) from {RAW}.pbp group by season").fetchall()
    return {season: set(game_ids) for season, game_ids in rows}


def _load_rosters(con, src, seasons: list[int], current_season: int, refresh: set[int], summary: RunSummary) -> None:
    _load_by_season(con, "rosters", src.rosters, seasons, current_season, refresh, summary)


def _load_supplements(con, src, seasons: list[int], current_season: int, refresh: set[int], summary: RunSummary) -> None:
    """Per-play add-ons that only exist for some seasons: FTN charting and participation."""
    ftn = [s for s in seasons if s >= src.FTN_FIRST_SEASON]
    lo, hi = src.PARTICIPATION_SEASONS
    part = [s for s in seasons if lo <= s <= hi]
    _load_by_season(con, "ftn_charting", src.ftn_charting, ftn, current_season, refresh, summary)
    _load_by_season(con, "participation", src.participation, part, current_season, refresh, summary,
                    season_sql="cast(left(nflverse_game_id, 4) as integer)")


def _load_by_season(con, table: str, fetch, seasons: list[int], current_season: int, refresh: set[int],
                    summary: RunSummary, season_sql: str = "season") -> None:
    """Season-snapshot tables: load missing seasons, always re-pull the current one (it changes weekly)."""
    have: set[int] = set()
    if db.table_exists(con, RAW, table):
        have = {s for (s,) in con.execute(f"select distinct {season_sql} from {RAW}.{table}").fetchall()}
    todo = sorted(s for s in seasons if s not in have or s == current_season or s in refresh)
    summary.rows[table] = 0
    if not todo:
        log.info("%s: up to date", table)
        return
    df = fetch(todo)
    with db.transaction(con):
        if have:
            con.execute(f"delete from {RAW}.{table} where {season_sql} in ({', '.join(map(str, todo))})")
        summary.rows[table] = db.append(con, RAW, table, df)
    log.info("%s: %d rows for %d season(s)", table, summary.rows[table], len(todo))


def _write_log(con, summary: RunSummary) -> None:
    con.execute(
        f"""create table if not exists {RAW}.ingest_log (
                run_id varchar, run_at timestamptz, table_name varchar, rows_written bigint, note varchar)"""
    )
    notes = {
        "pbp": f"games={summary.pbp_games}; seasons_downloaded={summary.pbp_seasons_downloaded}; "
               f"missing_from_source={len(summary.missing_from_source)}",
    }
    for table, rows in summary.rows.items():
        con.execute(
            f"insert into {RAW}.ingest_log values (?, current_timestamp, ?, ?, ?)",
            [summary.run_id, table, rows, notes.get(table)],
        )
