# Launch thread

Intro thread, 6 posts. Post it once the site is live, ideally before the Sunday week 9 slate (Nov 8, 1pm ET) so the
luck vs skill calls in 4/6 are public before most of those games are played. Every number below is in the repo; the
source for each is listed under the thread. `cd web && npm test` checks every post against the house rules
(280 weighted characters, no dashes, hashtags, exclamation marks or hype words).

## 1/6 (attach docs/launch/cards/calculator.png)

I built a site that grades every NFL 4th-down call with win probability.

Pick a situation and see the win probability of going for it, punting and kicking, computed in your browser. Trained on 2006-2022, so 2024-2026 are seasons it never saw.

What it found, in 4 posts:

## 2/6 (attach models/reports/go_rate_vs_model.png)

Coaches go for it twice as often as they used to: 11% of 4th downs in 2006, 24% in 2025. The model says go on about half.

Nearly all of the cost is on one side. In 2025, kicking when the model said go cost about 0.5 wins per team. Going when it said kick cost 0.01.

## 3/6 (attach exports/findings/offense-style/cards/drift.png)

The league changed together. From 2006 to 2025, shotgun went from 15% of snaps to 63%.

But compared within each season, offenses don't come in types. They sit on two dials: how pass-first they are and how fast they play.

## 4/6 (attach exports/findings/luck-skill/cards/calls.png)

Teams that start 6-2 or better won 80% of their first 8 games and 64% after. Winning more than point differential predicts doesn't carry over (r = 0.02).

Before week 9, I recorded the 10 teams where point differential and record disagree most. Graded automatically after week 18.

## 5/6 (attach docs/launch/cards/play.png)

Two things to come back for:

Every Tuesday, the week's costliest 4th-down calls, graded with the same model.

A daily game: 5 real 4th downs from 2025-26. You make the call, then see the win probability of every option and what the coach did.

## 6/6

On 2024, a season it never trained on, the win probability model scored a Brier of 0.139. nflverse's Vegas model, fit with 2024 in it, scored 0.136. On clear calls it agrees with nfl4th 96% of the time.

Calculator: https://gradient-descent-eta.vercel.app/calculator
How it works: https://gradient-descent-eta.vercel.app/methodology

---

## Sources

| Post | Number | Where it comes from |
|---|---|---|
| 1 | trained 2006-2022, never saw 2024-2026 | exports/meta.json `models.win_probability.trained` (2023 = validation/calibration, 2024 = test) |
| 2 | 11% (2006), 24% (2025), model ~half (51% in 2025) | models/reports/findings.json `go_rate_by_season` |
| 2 | 0.5 wins kicking, 0.01 going (2025) | same, `wins_lost_kicking_per_team` 0.534, `wins_lost_going_per_team` 0.015 |
| 3 | shotgun 15% to 63% | exports/findings/offense-style (thread 1/5) |
| 4 | 80% to 64%, r = 0.02 | exports/findings/luck-skill (thread 1/5, 2/5); 141 team-seasons |
| 4 | the 10 calls | predictions_2026_wk08_vs_baseline.json, recorded Nov 6 2026 00:31 UTC |
| 5 | 2025-26 situations | exports/play/pool.json |
| 6 | Brier 0.139 vs 0.136 | exports/meta.json `held_out.win_probability` (2024, 41,283 plays) |
| 6 | 96% agreement on clear calls | models/reports/nfl4th_benchmark.md (5,763 plays, 2023-2025, both models 1+ WP point apart) |

## Replies to have ready

- "The model is too aggressive." It's more aggressive than nfl4th (45.7% vs 40.1% go on 2023-25) because of its
  conversion model, and real conversion rates back it: teams converted 43.1% at 4-10 yards to go in 2024; we predicted
  39.7%, nfl4th 38.2%. Link /methodology.
- "What about overtime / end of half?" Not graded. Overtime and the final 30 seconds of each half are excluded.
- "Fakes?" Graded as ordinary go attempts. The model can't price surprise.
