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
| `export.py` | JSON for the web app → `exports/` |
| `train.py` | `python -m models.train [wp conversion fg punt]` |
| `plots.py` | Report charts in the shared dark theme (`analysis/theme.py`) |

Split everywhere: train 2006-2022, validate 2023, test 2024. The saved models are exactly the ones
evaluated, so grades for 2023 onward are out-of-sample.
