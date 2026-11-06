# 2026 Week 6: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_06.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 6: Liam Coen kicked a 60-yard field goal on 4th & 4 at HOU 42, down 3 to HOU with 2:00 left.

Going for it: 29.7% win probability. What JAX did: 23.4%. That's 6.3 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=42&togo=4&diff=-3&q=4&t=120&to=3&dto=3&spr=2.5&v=n&oe=0.103266&de=-0.10016

<sub>242/280</sub>

## top-3.png

The 3 costliest 4th-down calls of Week 6, in win-probability points lost:

1. Coen (JAX) FG, 4th & 4 at HOU 42: -6.3
2. Canales (CAR) FG, 4th & 4 at PHI 29: -4.2
3. Reid (KC) FG, 4th & 2 at LAC 26: -4.0

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/6

<sub>271/280</sub>

## leaderboard.png

Wins given away on 4th down through Week 6: win probability lost vs the model's best call, summed over every graded call (1.00 = one win).

Fewest: Shanahan (SF) 0.08, LaFleur (GB) 0.09
Most: Minter (BAL) 0.33, Steichen (IND) 0.31

Min 24 calls. https://gradient-descent-eta.vercel.app/week/2026/6

<sub>269/280</sub>

## gutsiest.png

Gutsiest correct call of Week 6: Sean Payton went for it on 4th & 3 at SEA 48, down 3 to SEA in the 1st quarter.

Only 18% of coaches go there. The model agreed, by 3.1 points of win probability over punting. DEN converted.

https://gradient-descent-eta.vercel.app/calculator?yl=48&togo=3&diff=-3&q=1&t=226&to=3&dto=2&spr=-2.5&v=h&rk=1&oe=-0.087691&de=-0.132346

<sub>248/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 6's costliest 4th-down call: down 3 to HOU with 2:00 left, Liam Coen kicked a 60-yard field goal on 4th & 4 at HOU 42.

It cost JAX 6.3 points of win probability. Here's the math.

<sub>184/280</sub>

**2/5**

What JAX did. Kicking: the model gives the 60-yard try a 43% chance, and JAX's win probability is 23.4%.

<sub>104/280</sub>

**3/5**

What the model wanted. Going for it: the model gives JAX a 45% chance to convert. Convert and JAX's win probability is 52%. Get stopped and it's 11%. Weighted together: 29.7%.

<sub>175/280</sub>

**4/5**

So going for it beats kicking if JAX converts at least 30% of the time. The model puts it at 45%, so kicking the field goal cost 6.3 points, the most of the 214 graded 4th downs in Week 6.

<sub>188/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=42&togo=4&diff=-3&q=4&t=120&to=3&dto=3&spr=2.5&v=n&oe=0.103266&de=-0.10016

<sub>208/280</sub>
