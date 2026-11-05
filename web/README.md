# web/ — 4th-down calculator

Next.js (App Router) + TypeScript + Tailwind. The whole decision engine runs in the browser: no
server, no API. Every input lives in the query string, so any situation is a shareable link.

```
npm install
npm run dev        # http://localhost:3000 (copies the ONNX Runtime WASM into public/ort first)
npm test           # parity: TS engine vs the Python engine on 600 real 4th downs, to 1e-4
npm run build
```

## How the models get here

`uv run python -m models.export_web` (repo root) writes `public/models/`:

| File | What | Runs with |
|---|---|---|
| `wp.onnx` + `wp_onnx_contract.json` | win probability (XGBoost) | onnxruntime-web (WASM, 1 thread) |
| `conversion.json` | conversion model: 169 depth-3 trees + Platt calibration | `lib/engine/conversion.ts` (tree walker) |
| `field_goal.json` | logistic regression + the long-kick correction | `lib/engine/fieldGoal.ts` |
| `engine.json` | punt lookup, kickoff starts, clock runoffs, conversion gains | `lib/engine/engine.ts` |
| `presets.json` | the famous 4th downs, with their real game context | the preset chips |

It also writes `tests/fixtures/parity.json`: 500 random real 4th downs plus 100 from the last two
minutes of a half (where the kneel-out and end-of-half rules fire), with every input and every
Python output. `tests/parity.test.ts` runs the TS engine on them through onnxruntime-node
(the same `.onnx`) and requires every number to match to 1e-4. Current max difference: 2.4e-7
(ONNX vs XGBoost float32 rounding).

`lib/engine/engine.ts` mirrors `models/decision_engine.py` function by function. Change one,
re-export, and the parity test tells you if they drifted.

## URL keys

`yl` yard line (yards from the opponent's end zone) · `togo` · `diff` score (offense minus defense)
· `q` quarter · `t` seconds left in the quarter · `to`/`dto` timeouts · `spr` spread (+ = offense
favored) · `v` h/a/n · `rk` receives 2nd-half kickoff. Only when a preset sets them: `yr` season,
`oe`/`de` team EPA, `in` indoors, `tf` turf, `w` wind, `tmp` temperature, `p` preset id.

## Deploying (Vercel)

Import the repo, set **Root Directory = `web`**, keep the Next.js defaults. The site is fully
static; the WASM is 14.8 MB raw / 2.4 MB brotli and loads after first paint.
