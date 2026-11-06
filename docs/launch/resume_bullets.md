# Resume bullets

**Gradient Descent: NFL 4th-Down Decision Grades** | Python, XGBoost, DuckDB, dbt, TypeScript, Next.js, ONNX |
https://your-app.vercel.app

- Trained an XGBoost win-probability model with season-based splits; held-out 2024 Brier of 0.139 beat nflverse's
  WP model (0.157) and came within 0.003 of its Vegas model, which saw 2024.
- Built a DuckDB + dbt pipeline over 1.3M NFL plays with dbt leakage tests and a weekly GitHub Actions job that
  ingests new games, re-scores in ~30 s and redeploys only if a publish gate passes.
- Benchmarked the 4th-down engine against nfl4th on 12,347 plays (80% same call; 96% when both favor one by 1+ WP
  point), fixed 3 bugs, and ported it to TypeScript + ONNX, matching Python within 2.4e-7.

## Why these, and what to check

- One result per bullet, each a number a reviewer can verify in the repo: Brier scores in exports/meta.json, the
  benchmark in models/reports/nfl4th_benchmark.md, parity in web/tests/parity.test.ts.
- "Came within 0.003 of its Vegas model, which saw 2024" is the honest version of the comparison: nflverse's
  `vegas_wp` was fit on all seasons including 2024, so beating 0.157 and nearly matching 0.136 is the claim.
- The two agreement numbers cover different plays, so quote them together. 80.3% is all 12,347 plays
  (`agree_all` in models/reports/nfl4th_benchmark.json). 96.1% is the 5,763 plays (47%) where both engines rate
  their pick at least 1 WP point ahead of the runner-up (`agree_when_both_clear`, threshold `CLEAR_WP = 0.01`).
  Quoting 96% alone reads as cherry-picked next to the report's 80.3% headline table.
- The ~30 s is `make refresh` (ingest -> dbt -> score -> export -> check) on an incremental week; the full Action
  also installs dependencies and renders cards, so don't quote 30 s for the whole job.
- Verbs differ across bullets (Trained, Built, Benchmarked). Past tense; switch the second bullet to "Run" if the
  weekly job is still live when you apply.
- Each bullet is at or under ~200 characters, which fits 2 lines at 10-11 pt with 0.5-0.75 in margins. Check in
  your template; if one wraps to 3, drop the parenthetical first.
- Interview follow-ups to have ready: why season-based splits instead of random (plays within a game are
  correlated, and future seasons are what the model grades); why monotone constraints; what the 3 benchmark bugs
  were (long field goals' selection bias, kneel-downs, halves that never ended).
