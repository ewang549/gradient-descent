# Thin wrappers so you and the weekly GitHub Action run exactly the same commands.
# Override the warehouse location with: make dbt NFL_DUCKDB_PATH=/path/to/nfl.duckdb
NFL_DUCKDB_PATH ?= $(CURDIR)/data/nfl.duckdb
export NFL_DUCKDB_PATH

.PHONY: setup ingest dbt check test train score findings export benchmark refresh gate weekly grade

setup:  ## install Python deps and dbt packages
	uv sync
	cd dbt && uv run dbt deps

ingest:  ## load newly final games from nflverse into DuckDB (incremental)
	uv run python -m ingest

dbt:  ## rebuild every dbt model and run the data tests (models that need scores wait for `make score`)
	cd dbt && uv run dbt build --exclude tag:scored

check:  ## sanity-check the marts and redraw the go-rate chart
	uv run python -m analysis.sanity_check

test:  ## Python tests (no network; model tests skip until the warehouse/artifacts exist)
	uv run pytest -q

train:  ## train + evaluate the Phase 2 models -> models/artifacts, models/reports
	uv run python -m models.train

score:  ## run the decision engine with the saved models, then build the dbt models that read the scores
	uv run python -m models.score
	cd dbt && uv run dbt build --select tag:scored

findings:  ## go-rate trend, famous 4th downs, coach leaderboard -> models/reports
	uv run python -m models.findings

export:  ## JSON for the web app -> exports/ (leaderboards, worst decisions, per-game WP)
	uv run python -m models.export

benchmark:  ## compare the engine with nfl4th (downloads its public release files) -> models/reports
	uv run python -m models.nfl4th_benchmark

refresh: ingest dbt score export check  ## the weekly pipeline (no retraining)

gate:  ## publish gate: engine sanity situations pass and every scheduled game of the latest week is in (exit 1 = don't publish)
	uv run python -m models.weekly --check

weekly: gate  ## weekly content: exports/weekly JSON for the season, then the latest week's cards + draft posts
	uv run python -m models.weekly
	cd web && npm run cards

grade:  ## finding 2: grade the timestamped 2026 predictions once the regular season is over, then draw the results card (no-op before; grades are written once)
	uv run python -m analysis.findings.luck_grade
	@if [ -f exports/findings/luck-skill/grades_2026.json ] && [ ! -f exports/findings/luck-skill/cards/results.png ]; then cd web && npm run findings; fi
