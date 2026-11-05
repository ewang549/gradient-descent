"""Coach exports add up: coach-season rows sum to the league, and pages only exist with enough calls."""

from __future__ import annotations

import pytest

from models.config import DB_PATH

pytestmark = pytest.mark.skipif(not DB_PATH.exists(), reason="run `make ingest dbt score` first")


@pytest.fixture(scope="module")
def built():
    from models import coaches

    return coaches.build()


def test_rows_sum_to_league(built):
    index, _ = built
    for lg in index["league"]:
        rows = [r for r in index["rows"] if r["season"] == lg["season"]]
        for k in ("decisions", "go", "clear_spots", "clear_go", "agreed"):
            assert sum(r[k] for r in rows) == lg[k], (lg["season"], k)
        assert abs(sum(r["wins_lost"] for r in rows) - lg["wins_lost"]) < 0.01


def test_pages_have_enough_calls_and_unique_slugs(built):
    from models import coaches

    index, pages = built
    assert len({p["slug"] for p in pages}) == len(pages)
    assert all(p["career"]["decisions"] >= coaches.MIN_CAREER for p in pages)
    for p in pages:
        for b in p["buckets"]:
            assert (b["go_rate"] is None) == (b["n"] < coaches.MIN_BUCKET)
        assert all(c["wp_lost"] > 0 for c in p["worst"])
        assert all(c["decision"] == c["recommendation"] for c in p["best"])
