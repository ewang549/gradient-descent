# Thin wrappers so you and the weekly GitHub Action run exactly the same commands.
# Override the warehouse location with: make dbt NFL_DUCKDB_PATH=/path/to/nfl.duckdb
NFL_DUCKDB_PATH ?= $(CURDIR)/data/nfl.duckdb
export NFL_DUCKDB_PATH

.PHONY: setup ingest dbt check test refresh

setup:  ## install Python deps and dbt packages
	uv sync
	cd dbt && uv run dbt deps

ingest:  ## load newly final games from nflverse into DuckDB (incremental)
	uv run python -m ingest

dbt:  ## rebuild every dbt model and run the data tests
	cd dbt && uv run dbt build

check:  ## sanity-check the marts and redraw the go-rate chart
	uv run python -m analysis.sanity_check

test:  ## Python unit tests (no network)
	uv run pytest -q

refresh: ingest dbt check  ## the weekly pipeline
