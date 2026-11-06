# Finding 2: Hot starts cool off. Luck doesn't carry over.

Draft thread, 5 posts. Numbers come from exports/findings/luck-skill; regenerate with `npm run findings`.

## 1/5 (attach regression.png)

Teams that start 6-2 or better won 80% of their games. They win 64% the rest of the way.

That's 141 NFL team-seasons since 2006. Teams that started 2-6 or worse went from 19% to 36%. Every record drifts back toward .500.

## 2/5 (attach luck.png)

Part of any record is luck: winning more than your points scored and allowed predict, mostly in close games.

It doesn't carry over. Luck in the first 8 games vs luck the rest of the way: r = 0.02 (95% CI -0.06 to 0.10).

## 3/5

So point differential is the better guide, by a little. Pull both toward .500 and forecast the rest of the season: error 0.213 for the record, 0.207 for point diff.

Fit only on past seasons, as in real time, and the edge's 95% interval just crosses zero. The market beats both.

## 4/5 (attach calls.png)

Calling a 6-1 team to cool off is nearly free. The real 2026 test is the 10 teams where point differential and the regressed record disagree most.

Point diff says TB, JAX, HOU, NYJ, DAL beat their record. CLE, DEN, BUF, NYG, ARI fall short.

## 5/5

Recorded Nov 6, 2026, 00:31 UTC, before week 9 kicked off, and graded automatically after week 18. Run on every season since 2006, the same rule went point differential's way 66% of the time.

Write-up and the timestamped file:
https://gradient-descent-eta.vercel.app/findings/luck-skill
