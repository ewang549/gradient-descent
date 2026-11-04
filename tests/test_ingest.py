"""Ingest tests. No network: a fake nflverse module stands in for ingest.sources."""

from __future__ import annotations

import duckdb
import polars as pl
import pytest

from ingest import db, pipeline

# ---------------------------------------------------------------- plan_pbp_loads (pure logic)


def test_plan_includes_only_final_games_not_yet_loaded():
    final = {2025: {"g1", "g2"}, 2026: {"g3", "g4"}}
    loaded = {2025: {"g1", "g2"}, 2026: {"g3"}}
    assert pipeline.plan_pbp_loads(final, loaded) == {2026: {"g4"}}


def test_plan_is_empty_when_up_to_date():
    final = {2025: {"g1"}}
    assert pipeline.plan_pbp_loads(final, {2025: {"g1"}}) == {}


def test_plan_refresh_reloads_whole_season():
    final = {2025: {"g1", "g2"}, 2026: {"g3"}}
    loaded = {2025: {"g1", "g2"}, 2026: {"g3"}}
    assert pipeline.plan_pbp_loads(final, loaded, refresh=[2025]) == {2025: {"g1", "g2"}}


# ---------------------------------------------------------------- db.append (schema drift)


def test_append_matches_by_name_adds_columns_and_widens_ints():
    con = duckdb.connect()
    db.append(con, "raw", "t", pl.DataFrame({"a": [1], "b": pl.Series([1], dtype=pl.Int32)}))
    # reordered columns, b drifts Int32 -> Float64 (like nflverse's goal_to_go), c is brand new
    db.append(con, "raw", "t", pl.DataFrame({"b": [0.5], "a": [2], "c": ["new"]}))
    assert con.execute("select a, b, c from raw.t order by a").fetchall() == [(1, 1.0, None), (2, 0.5, "new")]
    assert db.column_types(con, "raw.t")["b"] == "DOUBLE"


def test_append_accepts_numbers_into_text_columns():
    con = duckdb.connect()
    db.append(con, "raw", "t", pl.DataFrame({"jersey": ["00"]}))
    db.append(con, "raw", "t", pl.DataFrame({"jersey": pl.Series([12], dtype=pl.Int32)}))
    assert con.execute("select jersey from raw.t order by jersey").fetchall() == [("00",), ("12",)]


def test_append_refuses_incompatible_drift():
    con = duckdb.connect()
    db.append(con, "raw", "t", pl.DataFrame({"a": [1.0]}))
    with pytest.raises(db.SchemaDriftError):
        db.append(con, "raw", "t", pl.DataFrame({"a": ["not a number"]}))


# ---------------------------------------------------------------- end-to-end incremental behaviour


class FakeNflverse:
    """Two seasons. Game 2026_02 is in progress: nflverse already has some of its plays, but the
    schedule doesn't mark it final, so it must not be ingested until it is."""

    def __init__(self):
        self.results = {"2025_01_A_B": 3, "2026_01_A_B": -7, "2026_02_C_D": None}
        self.pbp_calls: list[int] = []
        self.roster_calls: list[list[int]] = []

    def configure(self):
        pass

    def current_season(self):
        return 2026

    def schedules(self):
        return pl.DataFrame({
            "game_id": list(self.results),
            "season": [int(g[:4]) for g in self.results],
            "result": list(self.results.values()),
        }, schema_overrides={"result": pl.Int32})

    def teams(self):
        return pl.DataFrame({"team_abbr": ["A", "B", "C", "D"]})

    def pbp(self, season):
        self.pbp_calls.append(season)
        games = [g for g in self.results if g.startswith(str(season))]
        return pl.DataFrame({
            "game_id": [g for g in games for _ in range(3)],
            "play_id": [float(i) for _ in games for i in range(3)],
            "season": [season] * 3 * len(games),
        })

    def rosters(self, seasons):
        self.roster_calls.append(list(seasons))
        return pl.DataFrame({"season": seasons, "team": ["A"] * len(seasons)})


def _games(con):
    return sorted(g for (g,) in con.execute("select distinct game_id from raw.pbp").fetchall())


def test_run_is_incremental():
    fake, con = FakeNflverse(), duckdb.connect()

    first = pipeline.run(con, start_season=2025, src=fake)
    assert fake.pbp_calls == [2025, 2026]
    assert _games(con) == ["2025_01_A_B", "2026_01_A_B"]  # in-progress game skipped
    assert first.rows["pbp"] == 6

    second = pipeline.run(con, start_season=2025, src=fake)
    assert fake.pbp_calls == [2025, 2026]  # nothing downloaded again
    assert second.rows["pbp"] == 0
    assert fake.roster_calls[-1] == [2026]  # only the current season's roster is re-pulled

    fake.results["2026_02_C_D"] = 10  # game goes final
    third = pipeline.run(con, start_season=2025, src=fake)
    assert fake.pbp_calls == [2025, 2026, 2026]  # only the season with a new game
    assert third.pbp_games == 1 and third.rows["pbp"] == 3
    assert _games(con) == ["2025_01_A_B", "2026_01_A_B", "2026_02_C_D"]
    assert con.execute("select count(*) from raw.rosters").fetchone()[0] == 2  # replaced, not duplicated


def test_plan_skips_games_known_to_be_unavailable_unless_refreshed():
    final = {1999: {"g1", "g_missing"}}
    loaded = {1999: {"g1"}}
    assert pipeline.plan_pbp_loads(final, loaded, unavailable={"g_missing"}) == {}
    assert pipeline.plan_pbp_loads(final, loaded, refresh=[1999], unavailable={"g_missing"}) == {1999: {"g1", "g_missing"}}


class FakeNflverseWithHole(FakeNflverse):
    """nflverse's 2025 file permanently lacks one final game; 2026 is temporarily lagging one."""

    def __init__(self):
        super().__init__()
        self.results = {"2025_01_A_B": 3, "2025_02_HOLE": 7, "2026_01_A_B": -7, "2026_02_LAG": 3}
        self.not_published = {"2025_02_HOLE", "2026_02_LAG"}

    def pbp(self, season):
        df = super().pbp(season)
        return df.filter(~pl.col("game_id").is_in(sorted(self.not_published)))


def test_missing_past_game_is_not_redownloaded_but_current_season_retries():
    fake, con = FakeNflverseWithHole(), duckdb.connect()
    first = pipeline.run(con, start_season=2025, src=fake)
    assert sorted(first.missing_from_source) == ["2025_02_HOLE", "2026_02_LAG"]
    assert fake.pbp_calls == [2025, 2026]

    pipeline.run(con, start_season=2025, src=fake)
    assert fake.pbp_calls == [2025, 2026, 2026]  # 2025 not re-downloaded; lagging 2026 retried

    fake.not_published.discard("2026_02_LAG")  # nflverse catches up
    third = pipeline.run(con, start_season=2025, src=fake)
    assert third.pbp_games == 1 and "2026_02_LAG" in _games(con)

    pipeline.run(con, start_season=2025, refresh=[2025], src=fake)
    assert fake.pbp_calls[-1] == 2025  # explicit refresh retries the hole


def test_refresh_replaces_season_without_duplicates():
    fake, con = FakeNflverse(), duckdb.connect()
    pipeline.run(con, start_season=2025, src=fake)
    pipeline.run(con, start_season=2025, refresh=[2025], src=fake)
    assert con.execute("select count(*) from raw.pbp where season = 2025").fetchone()[0] == 3
