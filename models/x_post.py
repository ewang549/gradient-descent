"""Post the week's cards to X: the worst-call card with its text, then the leaderboard card as a reply.

    uv run python -m models.x_post               the latest exported week
    uv run python -m models.x_post 2026 9        one week

DRY RUN BY DEFAULT: prints what it would post (and writes it to the GitHub Actions run summary).
It posts for real only when the environment variable X_POST_ENABLED is exactly "true", using
X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (OAuth 1.0a user context). Setup: docs/x_setup.md.

Input: exports/cards/{season}/week_NN/posts.json, written by `npm run cards` from the same templates
as posts.md, minus links. These rules are enforced here whatever that file says:
  - no @mentions, no links (X bills a post with a link at $0.20 vs $0.015, and auto-links bare domains)
  - at most 1 hashtag, 280 weighted characters, MAX_POSTS_PER_RUN posts per run
  - never if the publish gate fails for that week (re-run here, not just trusted from earlier steps)
  - never twice for a week: exports/social/x_posted.json logs every real post the moment it succeeds,
    so a run that dies between the card and the reply can't double-post on the retry
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

from models.config import EXPORTS_DIR, REPO_ROOT

API = "https://api.x.com/2"
MAX_POSTS_PER_RUN = 3
MAX_HASHTAGS = 1
MAX_CHARS = 280
CRED_VARS = ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET")
LOG_PATH = EXPORTS_DIR / "social" / "x_posted.json"

# Anything X would turn into a link: a scheme, www., or a bare domain like site.vercel.app. Errs on the
# side of refusing (e.g. "St.Louis" would trip it), which costs a skipped week, never a $0.20 post.
LINK_RE = re.compile(r"https?://|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b", re.IGNORECASE)
MENTION_RE = re.compile(r"(?<!\w)[@＠]\w")
HASHTAG_RE = re.compile(r"(?<![\w&])[#＃]\w")


# ------------------------------------------------------------------------------ the rules


def weighted_length(text: str) -> int:
    """X's count: Latin and common punctuation weigh 1, everything else (CJK, emoji) 2."""
    light = ((0, 0x10FF), (0x2000, 0x200D), (0x2010, 0x201F), (0x2032, 0x2037))
    return sum(1 if any(a <= ord(ch) <= b for a, b in light) else 2 for ch in unicodedata.normalize("NFC", text))


def check_post(text: str) -> list[str]:
    problems = []
    if not text.strip():
        problems.append("empty text")
    if (n := weighted_length(text)) > MAX_CHARS:
        problems.append(f"{n} characters (max {MAX_CHARS})")
    if m := MENTION_RE.search(text):
        problems.append(f"contains an @mention ({text[m.start():m.start() + 20]!r})")
    if m := LINK_RE.search(text):
        problems.append(f"contains a link ({m.group(0)!r})")
    if (n := len(HASHTAG_RE.findall(text))) > MAX_HASHTAGS:
        problems.append(f"{n} hashtags (max {MAX_HASHTAGS})")
    return problems


@dataclass
class Post:
    card: str
    text: str
    image: Path


def load_plan(season: int, week: int) -> list[Post]:
    folder = EXPORTS_DIR / "cards" / str(season) / f"week_{week:02d}"
    path = folder / "posts.json"
    if not path.exists():
        raise SystemExit(f"{path.relative_to(REPO_ROOT)} missing: run `make weekly` (npm run cards) first")
    raw = json.loads(path.read_text())
    if (raw.get("season"), raw.get("week")) != (season, week):
        raise SystemExit(f"{path.relative_to(REPO_ROOT)} is for {raw.get('season')} week {raw.get('week')}")
    return [Post(p["card"], p["text"], folder / p["card"]) for p in raw["posts"]]


def check_plan(plan: list[Post]) -> list[str]:
    problems = []
    if not plan:
        problems.append("nothing to post")
    if len(plan) > MAX_POSTS_PER_RUN:
        problems.append(f"{len(plan)} posts planned (max {MAX_POSTS_PER_RUN} per run)")
    for i, p in enumerate(plan, 1):
        problems += [f"post {i} ({p.card}): {msg}" for msg in check_post(p.text)]
        if not p.image.exists():
            problems.append(f"post {i}: card {p.image.relative_to(REPO_ROOT)} missing")
    return problems


def gate_problems(season: int, week: int) -> list[str]:
    from models import weekly  # imported here: loads the warehouse and models, which the rule checks don't need

    return weekly.check(season, week)


# ------------------------------------------------------------------------------ the posted log


def week_key(season: int, week: int) -> str:
    return f"{season}-week-{week:02d}"


def load_log(path: Path = LOG_PATH) -> dict:
    return json.loads(path.read_text()) if path.exists() else {"weeks": {}}


def save_log(log: dict, path: Path = LOG_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n")


# ------------------------------------------------------------------------------ X API (OAuth 1.0a)


def _enc(s: str) -> str:
    return quote(str(s), safe="~-._")  # RFC 3986, as OAuth 1.0a requires


def oauth_header(method: str, url: str, creds: dict, params: dict | None = None,
                 nonce: str | None = None, timestamp: int | None = None) -> str:
    """OAuth 1.0a HMAC-SHA1 Authorization header. `params` = query string and form-encoded body params only;
    JSON and multipart bodies (everything this module sends) are not part of the signature."""
    oauth = {
        "oauth_consumer_key": creds["X_API_KEY"],
        "oauth_nonce": nonce or secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(timestamp or int(time.time())),
        "oauth_token": creds["X_ACCESS_TOKEN"],
        "oauth_version": "1.0",
    }
    pairs = sorted((_enc(k), _enc(v)) for k, v in {**(params or {}), **oauth}.items())
    base = "&".join([method.upper(), _enc(url), _enc("&".join(f"{k}={v}" for k, v in pairs))])
    key = f"{_enc(creds['X_API_SECRET'])}&{_enc(creds['X_ACCESS_SECRET'])}"
    oauth["oauth_signature"] = base64.b64encode(hmac.new(key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    return "OAuth " + ", ".join(f'{_enc(k)}="{_enc(v)}"' for k, v in sorted(oauth.items()))


class XClient:
    """The two calls this needs. Refuses a post past MAX_POSTS_PER_RUN, whoever calls it."""

    def __init__(self, creds: dict):
        self.creds = creds
        self.posted = 0

    def _send(self, url: str, body: bytes, content_type: str) -> dict:
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Authorization": oauth_header("POST", url, self.creds), "Content-Type": content_type,
            "User-Agent": "gradient-descent-weekly"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:  # X's error body says what's wrong (permissions, credits, duplicate)
            raise RuntimeError(f"X API {e.code} on {url}: {e.read().decode(errors='replace')[:500]}") from None

    def upload_image(self, path: Path) -> str:
        boundary = secrets.token_hex(16)
        body = b"".join([
            f'--{boundary}\r\nContent-Disposition: form-data; name="media_category"\r\n\r\ntweet_image\r\n'.encode(),
            f'--{boundary}\r\nContent-Disposition: form-data; name="media"; filename="{path.name}"\r\n'
            f"Content-Type: image/png\r\n\r\n".encode(),
            path.read_bytes(),
            f"\r\n--{boundary}--\r\n".encode(),
        ])
        return str(self._send(f"{API}/media/upload", body, f"multipart/form-data; boundary={boundary}")["data"]["id"])

    def create_post(self, text: str, media_id: str, reply_to: str | None = None) -> str:
        if self.posted >= MAX_POSTS_PER_RUN:
            raise RuntimeError(f"refusing post {self.posted + 1}: max {MAX_POSTS_PER_RUN} per run")
        payload: dict = {"text": text, "media": {"media_ids": [media_id]}}
        if reply_to:
            payload["reply"] = {"in_reply_to_tweet_id": reply_to}
        tweet_id = str(self._send(f"{API}/tweets", json.dumps(payload).encode(), "application/json")["data"]["id"])
        self.posted += 1
        return tweet_id


# ------------------------------------------------------------------------------ the run


def site_url() -> str:
    return json.loads((REPO_ROOT / "web" / "site.json").read_text())["url"].rstrip("/")


def summary(season: int, week: int, plan: list[Post], heading: str, ids: list[str] | None = None) -> str:
    lines = [f"## X: {heading}", ""]
    for i, p in enumerate(plan):
        role = "Post" if i == 0 else "Reply"
        link = f" ([on X](https://x.com/i/web/status/{ids[i]}))" if ids and i < len(ids) else ""
        lines += [f"**{role} {i + 1}: {p.card}**{link} ({weighted_length(p.text)}/{MAX_CHARS} characters)", "",
                  *[f"> {ln}" if ln else ">" for ln in p.text.split("\n")], "",
                  f"![{p.card}]({site_url()}/cards/{season}/week_{week:02d}/{p.card})", ""]
    return "\n".join(lines)


def write_summary(md: str) -> None:
    print(md)
    if path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(path, "a") as f:
            f.write(md + "\n")


def run(season: int, week: int, *, enabled: bool, client_factory: Callable[[dict], XClient] = XClient,
        gate: Callable[[int, int], list[str]] = gate_problems, log_path: Path = LOG_PATH) -> int:
    log = load_log(log_path)
    key = week_key(season, week)
    if key in log["weeks"]:
        write_summary(f"## X: nothing posted\n\n{season} week {week} is already in "
                      f"`{log_path.relative_to(REPO_ROOT)}` ({log['weeks'][key]['status']}). Never posted twice.")
        return 0
    plan = load_plan(season, week)
    problems = gate(season, week) + check_plan(plan)
    if problems:
        write_summary("## X: refused\n\n" + "\n".join(f"- {p}" for p in problems))
        return 1
    if not enabled:
        write_summary(summary(season, week, plan, 'dry run (set the X_POST_ENABLED secret to "true" to post)'))
        return 0

    missing = [v for v in CRED_VARS if not os.environ.get(v)]
    if missing:
        write_summary(f"## X: refused\n\nX_POST_ENABLED is true but these secrets are missing: {', '.join(missing)}")
        return 1
    client = client_factory({v: os.environ[v] for v in CRED_VARS})
    entry = log["weeks"][key] = {"status": "partial", "posts": []}
    ids: list[str] = []
    try:
        for p in plan:
            media_id = client.upload_image(p.image)
            ids.append(client.create_post(p.text, media_id, reply_to=ids[-1] if ids else None))
            entry["posts"].append({"card": p.card, "id": ids[-1], "text": p.text,
                                   "posted_at": datetime.now(UTC).isoformat(timespec="seconds")})
            save_log(log, log_path)  # after every post, so a crash before the reply still counts the week as posted
        entry["status"] = "posted"
        save_log(log, log_path)
    finally:
        write_summary(summary(season, week, plan, f"posted {len(ids)} of {len(plan)}", ids))
    return 0


def latest_exported_week() -> tuple[int, int]:
    season = max(int(p.name) for p in (EXPORTS_DIR / "weekly").iterdir() if p.name.isdigit())
    return season, json.loads((EXPORTS_DIR / "weekly" / str(season) / "index.json").read_text())["latest"]


def main(argv: list[str]) -> int:
    season, week = (int(argv[0]), int(argv[1])) if len(argv) == 2 else latest_exported_week()
    return run(season, week, enabled=os.environ.get("X_POST_ENABLED") == "true")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
