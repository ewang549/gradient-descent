"""The "You Make the Call" pool: every spot has a decision worth making, and the mix is right."""

from __future__ import annotations

import pytest

from models.config import DB_PATH

pytestmark = pytest.mark.skipif(not DB_PATH.exists(), reason="run `make ingest dbt score` first")


@pytest.fixture(scope="module")
def pool():
    from models import play

    return play.build()


def test_no_boring_spots(pool):
    from models import play

    for s in pool["situations"]:
        options = [s["wp"]["go"], s["wp"]["punt"]] + ([s["wp"]["field_goal"]] if s["fg_in_range"] else [])
        assert max(options) - min(options) >= play.MIN_SPREAD - 1e-4, s["id"]


def test_mix_of_kinds_and_answers(pool):
    from collections import Counter

    kinds = Counter(s["kind"] for s in pool["situations"])
    assert min(kinds["clear"], kinds["close"], kinds["famous"]) >= 30
    answers = Counter(s["recommendation"] for s in pool["situations"] if s["kind"] == "clear")
    assert min(answers.values()) >= 20  # "always go" can't sweep the clear calls


def test_out_of_range_kicks_are_never_the_answer(pool):
    assert not [s["id"] for s in pool["situations"] if not s["fg_in_range"] and s["recommendation"] == "field_goal"]


def test_tags_match_their_rules(pool):
    from models import play

    for s in pool["situations"]:
        margin = sorted(s["wp"].values())[-1] - sorted(s["wp"].values())[-2]
        if s["kind"] == "clear":
            assert margin >= play.CLEAR_MARGIN - 1e-4
        if s["kind"] == "close":
            assert margin < play.CLOSE_MARGIN + 1e-4
        if s["kind"] == "famous":
            assert s["label"]
