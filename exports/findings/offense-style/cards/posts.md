# Finding 1: The NFL changed together. Teams didn't.

Draft thread, 5 posts. Numbers come from exports/findings/offense-style; regenerate with `npm run findings`.

## 1/5 (attach drift.png)

The NFL changed together. Teams didn't.

From 2006 to 2025, shotgun went from 15% of snaps to 63%. On 4th downs where our model says go, teams went for it 41% of the time, up from 22%. Passes got shorter: 8.6 air yards to 7.4.

## 2/5

How much of a team's offensive style is just the year it played in?

Across 671 team-seasons, about 22%. For shotgun rate it's 62%, and for 4th-down aggressiveness 47%. Those moved league-wide, not team by team.

## 3/5 (attach spread.png)

So did teams get more alike? Mostly no.

The spread between teams in early-down pass rate shrank (p = 0.004). For the other 6 measures, including pass rate over expected, shotgun, tempo and 4th-down aggressiveness, there's no significant change.

## 4/5 (attach map.png)

Are there offense "types"? Compare each team only with its own season and there aren't. Offenses sit on two dials: how pass-first they are and how fast they play.

Both dials hold up when we resample teams (congruence 0.99 and 0.98) or fit 2006-15 and 2016-26 separately.

## 5/5

The outliers are on the tempo dial. Washington ran no-huddle on 67% of neutral snaps in 2024 and 64% in 2025. The 2013-15 Eagles and 2010 Colts are out there too.

Full map, filterable by season:
https://gradient-descent.vercel.app/findings/offense-style
