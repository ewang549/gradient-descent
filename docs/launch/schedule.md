# Posting plan: launch through the Super Bowl

Three kinds of posts:

- **Tuesday weekly cards.** The weekly Action runs every Tuesday at 12:00 UTC (7am ET), after Monday Night Football.
  It writes `exports/cards/2026/week_NN/` (worst-call.png, top-3.png, leaderboard.png, gutsiest.png) and the drafts
  in `posts.md`, then waits for the deploy. Post late morning ET once the run is green. If the gate fails (a game
  not final, missing play-by-play), nothing publishes that week. Fix it or skip; don't post by hand.
- **Finding threads, about every 10 days**, never on a Tuesday so they don't compete with the cards.
- **One-off posts**: the launch thread, the luck vs skill grading, the Super Bowl.

Game dates come from nflverse's 2026 schedule (`staging.stg_schedules`). Playoff dates are the NFL's announced
format; check them against the schedule once the matchups are set.

## Calendar

| Date | Post | What to attach / paste | Status |
|---|---|---|---|
| Fri Nov 6 or Sat Nov 7 | **Launch thread** (6 posts), before Sunday's week 9 slate | docs/launch/launch_thread.md; cards listed in each post | ready once the site is live |
| Tue Nov 10 | Week 9 cards | exports/cards/2026/week_09/ + posts.md | Action |
| Mon Nov 16 | **Finding 1: offense style** (5 posts) | exports/findings/offense-style/cards/posts.md; drift.png (1/5), spread.png (3/5), map.png (4/5) | ready |
| Tue Nov 17 | Week 10 cards | exports/cards/2026/week_10/ | Action |
| Tue Nov 24 | Week 11 cards | exports/cards/2026/week_11/ | Action |
| Fri Nov 27 | **Finding 2: luck vs skill** (5 posts) | exports/findings/luck-skill/cards/posts.md; regression.png (1/5), luck.png (2/5), calls.png (4/5). The predictions were recorded Nov 6, so the thread still holds; quote-post launch 4/6 | ready |
| Tue Dec 1 | Week 12 cards | exports/cards/2026/week_12/ | Action |
| Mon Dec 7 | **Finding 3: predictability** | not built yet | to build |
| Tue Dec 8 | Week 13 cards | exports/cards/2026/week_13/ | Action |
| Tue Dec 15 | Week 14 cards | exports/cards/2026/week_14/ | Action |
| Thu Dec 17 | **Finding 4: clutch** | not built yet | to build |
| Tue Dec 22 | Week 15 cards | exports/cards/2026/week_15/ | Action |
| Mon Dec 28 | **Finding 5: SHAP, what drives win probability** | not built yet; models/reports/wp_shap_summary.png is the starting point | to build |
| Tue Dec 29 | Week 16 cards | exports/cards/2026/week_16/ | Action |
| Tue Jan 5 | Week 17 cards (MNF is Jan 4) | exports/cards/2026/week_17/ | Action |
| Tue Jan 12 | Week 18 cards: last regular-season week, the leaderboard card is the final 2026 one | exports/cards/2026/week_18/ | Action |
| Tue Jan 12 or Wed Jan 13 | **Luck vs skill, graded** (1 post, quote-post the Nov 27 thread) | `# Results post` section that `make grade` adds to exports/findings/luck-skill/cards/posts.md; results.png. The same Action run grades before the weekly gate | automatic |
| Tue Jan 19 | Wild Card cards (games Jan 16-18) | exports/cards/2026/week_19/ | Action; first playoff week through the card pipeline, check the labels before posting |
| Thu Jan 21 | **2026 season wrap**: wins given away by coach, regular season | week_18 leaderboard.png + /coaches link | ready after Jan 12 |
| Tue Jan 26 | Divisional round cards (Jan 23-24) | exports/cards/2026/week_20/ | Action |
| Tue Feb 2 | Conference championship cards (Jan 31) | exports/cards/2026/week_21/ | Action |
| Wed Feb 10 | **Super Bowl preview**: both coaches' 2026 4th-down record, link their /coaches pages and a calculator spot | coach pages + /og/calculator card for a real situation | write that week |
| Tue Feb 16 | Super Bowl cards (Super Bowl LXI, Feb 14) | exports/cards/2026/week_22/ | Action |

If a finding isn't ready on its date, slide it rather than posting something thin. Keep about 10 days between
threads and keep them off Tuesdays.

## Where every existing card goes

| File | Used in |
|---|---|
| docs/launch/cards/calculator.png | launch 1/6 |
| models/reports/go_rate_vs_model.png | launch 2/6 |
| exports/findings/offense-style/cards/drift.png | launch 3/6, finding 1 1/5 |
| exports/findings/offense-style/cards/spread.png | finding 1 3/5 |
| exports/findings/offense-style/cards/map.png | finding 1 4/5 |
| exports/findings/luck-skill/cards/calls.png | launch 4/6, finding 2 4/5 |
| exports/findings/luck-skill/cards/regression.png | finding 2 1/5 |
| exports/findings/luck-skill/cards/luck.png | finding 2 2/5 |
| exports/findings/luck-skill/cards/results.png | grading post (drawn after week 18) |
| docs/launch/cards/play.png | launch 5/6 |
| exports/cards/2026/week_01..08/ | not posted: rendered so /week pages and the home page have share images. Use them as replies when someone asks about a past week |
| exports/cards/2026/week_NN/ (9+) | that week's Tuesday post |

## Posting checklist

1. Open the link in each post in a private window: the page loads and the preview card unfurls.
2. Attach the listed PNG at full size (1200x675; X shows it uncropped at 16:9).
3. Post the thread in one go with X's thread composer, not reply by reply.
4. Pin the launch thread until the luck vs skill grading post replaces it on Jan 12.
