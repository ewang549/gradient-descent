# models/

Phase 2: the models and the 4th-down decision engine. Everything reads dbt's `features.*` and
`marts.*` tables in `data/nfl.duckdb`. Python never re-derives features dbt already built, except
for hypothetical states, where `wp.derive_features` mirrors the SQL (a test enforces parity).

| Module | What it does |
|---|---|
| `wp.py` | Win-probability model (XGBoost, monotone constraints), evaluation vs nflverse, ONNX export |
| `conversion.py` | P(convert \| go for it): shallow XGBoost + Platt calibration |
| `field_goal.py` | P(make): logistic regression; expansion inside the pipeline |
| `punt.py` | Punt spot → receiving team's start: isotonic regression + 2023 recalibration |
| `decision_engine.py` | WP of go / punt / FG for any 4th-down state |
| `score.py` | `python -m models.score`: score every decision + play into `ml.*` |
| `findings.py` | Go-rate trend, famous 4th downs, coach leaderboard |
| `nfl4th_benchmark.py` | Benchmark vs Ben Baldwin's nfl4th, with per-component attribution → `reports/nfl4th_benchmark.md` |
| `export.py` | JSON for the web app → `exports/` |
| `train.py` | `python -m models.train [wp conversion fg punt]` |
| `plots.py` | Report charts in the shared dark theme (`analysis/theme.py`) |

Split everywhere: train 2006-2022, validate 2023, test 2024. The saved models are exactly the ones
evaluated, so grades for 2023 onward are out-of-sample.

## Benchmark against nfl4th

`make benchmark` compares every 2023-2025 recommendation with nfl4th's published ones and swaps
nfl4th's components into this engine one at a time to find what drives any difference. The short
version (details in `reports/nfl4th_benchmark.md`): this engine says go somewhat more often (~46% vs
~40%), almost entirely because its conversion model gives higher odds, and real conversion rates
on 2023-2025 attempts support its numbers. The benchmark also surfaced three engine bugs, now fixed:
long field goals priced off elite kickers, no kneel-downs, and a half that never ended.
