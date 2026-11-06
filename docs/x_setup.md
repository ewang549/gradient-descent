# Auto-posting to X: setup

The Tuesday `weekly-refresh` Action posts the week's worst-call card with its text, then replies with the leaderboard card. That's 2 posts a week (3 at most, enforced in `models/x_post.py`). It runs only after the deploy is live and the publish gate passed. It never posts a week twice, and auto-posts have no links or @mentions. Until you set `X_POST_ENABLED` to `true`, it's a **dry run**: the posts appear in the run's summary page and nothing goes to X.

Do these steps in order. Step 3 has to come before step 4, or the tokens come out read-only.

## 1. Sign in to the developer console as the posting account

Go to **https://console.x.com** and sign in as **the account the posts should come from**. The access token in step 4 is issued to whoever is signed in, and that's the account it posts as. Accept the Developer Agreement if asked.

## 2. Create the app

1. **Projects & Apps** → create a project if there isn't one, then **New App** inside it. (An app outside a project gets `client-not-enrolled` errors.)
2. Name it, e.g. `gradient-descent-weekly`.
3. Use-case description, if asked: *Posts a weekly NFL 4th-down analysis card from a GitHub Action, about 2 posts a week. No reading timelines, liking, following, replying to others or DMs.*
4. The console shows an **API Key** and **API Key Secret** once. You can copy them now or regenerate them in step 4.

## 3. Set read + write permissions

In the app: **Settings** → **User authentication settings** → **Set up** (or **Edit**):

| Field | Value |
|---|---|
| App permissions | **Read and write** (not "Read", not "Read and write and Direct message") |
| Type of App | **Web App, Automated App or Bot** |
| Callback URI / Redirect URL | `https://gradient-descent-eta.vercel.app` (required by the form, never used) |
| Website URL | `https://gradient-descent-eta.vercel.app` |

Save.

## 4. Generate the 4 keys

In the app: **Keys and tokens**.

| Console label | GitHub secret |
|---|---|
| API Key (Consumer Key) | `X_API_KEY` |
| API Key Secret (Consumer Secret) | `X_API_SECRET` |
| Access Token | `X_ACCESS_TOKEN` |
| Access Token Secret | `X_ACCESS_SECRET` |

- Under **Consumer Keys**, click **Regenerate** if you didn't save them in step 2.
- Under **Authentication Tokens → Access Token and Secret**, click **Generate** (or **Regenerate** if a pair already exists). The console should say the token was **created with Read and Write permissions**. If it says Read, you generated it before step 3: regenerate it now.
- Each value is shown once. Paste it straight into GitHub (step 7) rather than a notes file.

## 5. Add credits

The app uses pay-per-use: you prepay credits and each call draws them down.

1. **Billing** → add a payment method → buy credits. The smallest amount offered covers a season.
2. The cost is 2 posts a week at $0.015 each, about $0.03/week. A post with a link would cost $0.20, which is why auto-posts never contain one. Check the console's price table for whether media uploads are billed separately.
3. If the console offers auto-recharge, leave it **off**. A runaway bug can then only spend what's prepaid.

With no credits, posting fails with a 402/403 that mentions credits or billing. The Action fails, emails you, and logs nothing, so the next run retries.

## 6. Mark the account as automated

On x.com, signed in as the posting account: **Settings and privacy** → **Your account** → **Account information** → **Automation** → **Managing account** → choose the account of the person running it → confirm with the password.

The profile then shows "Automated by @yourhandle". X's rules expect this label on accounts that post through the API. The managing account has to be **a different account** from the posting one. If the posts come from your personal account, X has no "manage yourself" option, so skip this step for that account.

## 7. Add the secrets to GitHub

Repo **ewang549/gradient-descent** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, once per name:

- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`: from step 4
- `X_POST_ENABLED`: `false` for now

Or from this repo in a terminal (each command prompts for the value, which keeps it out of your shell history):

```sh
for s in X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_SECRET; do gh secret set "$s"; done
gh secret set X_POST_ENABLED --body false
gh secret list
```

## 8. Dry run, then go live

1. **Dry run locally** (no keys needed; the gate needs the local warehouse): `uv run python -m models.x_post 2026 8` prints exactly what would be posted for week 8.
2. **Dry run in the Action:** the next Tuesday run (or **Actions → weekly-refresh → Run workflow**, which only reaches the post step when there are new exports) adds an "X: dry run" section to the run summary, with both posts and their cards.
3. **Go live:** `gh secret set X_POST_ENABLED --body true`. The value must be exactly `true` (lowercase). Anything else stays a dry run.
4. After the first real run, `exports/social/x_posted.json` is committed with the post ids. The run summary links to both posts.

**Pause it:** `gh secret set X_POST_ENABLED --body false`.

**Re-post a week** (e.g. you deleted it by hand): remove that week's entry from `exports/social/x_posted.json`, commit, then run `uv run python -m models.x_post SEASON WEEK` locally with the 4 keys and `X_POST_ENABLED=true` in your environment.

## Troubleshooting

| Error in the run | Fix |
|---|---|
| 401 Unauthorized | A key or token was pasted wrong (watch for trailing spaces). Re-set the secret. |
| 403 mentioning `oauth1-permissions` or "not permitted" | The access token is read-only. Redo step 3, then regenerate the token (step 4). |
| 403 `client-not-enrolled` | The app isn't inside a project on pay-per-use (step 2). |
| 402, or 403 mentioning credits/billing | Out of credits (step 5). |
| 403 "duplicate content" | X refuses identical text. It shouldn't happen, since each week's text has that week's numbers. |
| "X: refused" in the summary | A rule or the gate blocked the post. The summary lists why, and nothing was sent. |

Note: GitHub masks every secret's value in the logs, so with `X_POST_ENABLED` set to `true`, the word "true" shows up as `***` anywhere in that job's log. That's cosmetic.
