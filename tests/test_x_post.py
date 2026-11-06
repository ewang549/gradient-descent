"""The X auto-poster: OAuth signing, the posting rules, dry run, the gate and the posted log. No network."""

import json

import pytest

from models import x_post

CREDS = {"X_API_KEY": "k", "X_API_SECRET": "s", "X_ACCESS_TOKEN": "t", "X_ACCESS_SECRET": "ts"}


def test_oauth_signature_matches_x_docs_example():
    # The worked example from X's "Creating a signature" docs (form-encoded params are part of the signature).
    creds = {"X_API_KEY": "xvz1evFS4wEEPTGEFPHBog", "X_API_SECRET": "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
             "X_ACCESS_TOKEN": "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
             "X_ACCESS_SECRET": "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE"}
    header = x_post.oauth_header(
        "POST", "https://api.twitter.com/1.1/statuses/update.json", creds,
        params={"status": "Hello Ladies + Gentlemen, a signed OAuth request!", "include_entities": "true"},
        nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", timestamp=1318622958)
    assert 'oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"' in header


@pytest.mark.parametrize("text,problem", [
    ("Worst call of the week, ask @Ravens", "@mention"),
    ("Full breakdown: https://example.com/x", "link"),
    ("See gradient-descent-eta.vercel.app for more", "link"),
    ("More at www.example.org", "link"),
    ("#TNF #NFL the worst call", "hashtags"),
    ("x" * 281, "characters"),
    ("", "empty"),
])
def test_rules_reject(text, problem):
    assert any(problem in p for p in x_post.check_post(text))


@pytest.mark.parametrize("text", [
    ("The costliest 4th-down call of Week 8: Kevin O'Connell punted on 4th & 5 at MIN 33, down 4 to DET with 3:01 "
     "left.\n\nGoing for it: 20.5% win probability. What MIN did: 14.9%. That's 5.6 points given away."),
    "Fewest: LaFleur (GB) 0.10, McDermott (BUF) 0.11\nMost: Minter (BAL) 0.44. Min 30 calls. #TNF",
    "x" * 280,
])
def test_rules_accept(text):
    assert x_post.check_post(text) == []


def test_emoji_and_cjk_count_double():
    assert x_post.weighted_length("abc") == 3
    assert x_post.weighted_length("🏈") == 2
    assert x_post.check_post("🏈" * 141)  # 282 weighted


# ------------------------------------------------------------------------------ the run


class FakeClient:
    def __init__(self, creds, fail_on_post=None):
        self.creds, self.calls, self.fail_on_post = creds, [], fail_on_post

    def upload_image(self, path):
        self.calls.append(("upload", path.name))
        return f"m{len(self.calls)}"

    def create_post(self, text, media_id, reply_to=None):
        n = sum(c[0] == "post" for c in self.calls) + 1
        if n == self.fail_on_post:
            raise RuntimeError("X API 503")
        self.calls.append(("post", media_id, reply_to))
        return f"t{n}"


@pytest.fixture
def week(tmp_path, monkeypatch):
    """A fake repo: exports/cards/2026/week_09 with two cards and posts.json; the summary goes to a file."""
    monkeypatch.setattr(x_post, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(x_post, "EXPORTS_DIR", tmp_path / "exports")
    monkeypatch.setattr(x_post, "site_url", lambda: "https://site.example")
    folder = tmp_path / "exports" / "cards" / "2026" / "week_09"
    folder.mkdir(parents=True)
    for card in ("worst-call.png", "leaderboard.png"):
        (folder / card).write_bytes(b"png")
    posts = [{"card": "worst-call.png", "text": "The costliest 4th-down call of Week 9."},
             {"card": "leaderboard.png", "text": "Wins given away on 4th down through Week 9."}]
    (folder / "posts.json").write_text(json.dumps({"season": 2026, "week": 9, "posts": posts}))
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    for v in x_post.CRED_VARS:
        monkeypatch.setenv(v, "secret")
    return {"folder": folder, "log": tmp_path / "exports" / "social" / "x_posted.json", "summary": summary}


def go(week, enabled=True, gate=lambda s, w: [], client=None):
    clients = []

    def factory(creds):
        clients.append(client or FakeClient(creds))
        return clients[-1]

    code = x_post.run(2026, 9, enabled=enabled, client_factory=factory, gate=gate, log_path=week["log"])
    return code, clients


def test_dry_run_posts_nothing_and_logs_nothing(week):
    code, clients = go(week, enabled=False)
    assert code == 0 and clients == [] and not week["log"].exists()
    md = week["summary"].read_text()
    assert "dry run" in md and "The costliest 4th-down call of Week 9." in md
    assert "https://site.example/cards/2026/week_09/worst-call.png" in md


def test_real_run_posts_card_then_reply_and_logs(week):
    code, (client,) = go(week)
    assert code == 0
    assert client.calls == [("upload", "worst-call.png"), ("post", "m1", None),
                            ("upload", "leaderboard.png"), ("post", "m3", "t1")]
    entry = json.loads(week["log"].read_text())["weeks"]["2026-week-09"]
    assert entry["status"] == "posted" and [p["id"] for p in entry["posts"]] == ["t1", "t2"]


def test_never_posts_a_week_twice(week):
    go(week)
    code, clients = go(week)
    assert code == 0 and clients == []
    assert "already" in week["summary"].read_text()


def test_failure_before_the_reply_still_blocks_a_retry(week):
    with pytest.raises(RuntimeError):
        go(week, client=FakeClient(CREDS, fail_on_post=2))
    entry = json.loads(week["log"].read_text())["weeks"]["2026-week-09"]
    assert entry["status"] == "partial" and [p["id"] for p in entry["posts"]] == ["t1"]
    _, clients = go(week)
    assert clients == []


def test_gate_failure_refuses(week):
    code, clients = go(week, gate=lambda s, w: ["2026 week 9: only 13 of 14 scheduled games are final"])
    assert code == 1 and clients == [] and not week["log"].exists()
    assert "only 13 of 14" in week["summary"].read_text()


def test_a_post_that_breaks_the_rules_refuses_the_whole_run(week):
    raw = json.loads((week["folder"] / "posts.json").read_text())
    raw["posts"][1]["text"] += " https://site.example/week/2026/9"
    (week["folder"] / "posts.json").write_text(json.dumps(raw))
    code, clients = go(week)
    assert code == 1 and clients == []


def test_more_than_three_posts_refuses(week):
    raw = json.loads((week["folder"] / "posts.json").read_text())
    raw["posts"] = raw["posts"] * 2
    (week["folder"] / "posts.json").write_text(json.dumps(raw))
    code, clients = go(week)
    assert code == 1 and clients == []


def test_enabled_without_credentials_refuses(week, monkeypatch):
    monkeypatch.delenv("X_ACCESS_SECRET")
    code, clients = go(week)
    assert code == 1 and clients == []
    assert "X_ACCESS_SECRET" in week["summary"].read_text()


def test_client_caps_posts_per_run(monkeypatch):
    client = x_post.XClient(CREDS)
    monkeypatch.setattr(client, "_send", lambda url, body, ct: {"data": {"id": "1"}})
    for _ in range(x_post.MAX_POSTS_PER_RUN):
        client.create_post("hi", "m")
    with pytest.raises(RuntimeError, match="max 3"):
        client.create_post("hi", "m")


def test_main_is_dry_unless_the_flag_is_exactly_true(monkeypatch):
    seen = {}
    monkeypatch.setattr(x_post, "run", lambda s, w, enabled: seen.setdefault("enabled", enabled) and 0)
    for value, expected in [("True", False), ("1", False), ("", False), ("true", True)]:
        seen.clear()
        monkeypatch.setenv("X_POST_ENABLED", value)
        x_post.main(["2026", "9"])
        assert seen["enabled"] is expected
