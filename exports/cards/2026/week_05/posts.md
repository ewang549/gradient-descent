# 2026 Week 5: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_05.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 5: Jesse Minter punted on 4th & 4 at BAL 38, down 5 to ATL with 6:30 left.

Going for it: 20.1% win probability. What BAL did: 13.7%. That's 6.4 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=62&togo=4&diff=-5&q=4&t=390&to=3&dto=3&spr=-3.5&v=a&oe=0.183006&de=-0.034547&w=0&tmp=70

<sub>224/280</sub>

## top-3.png

The 3 costliest 4th-down calls of Week 5, in win-probability points lost:

1. Minter (BAL) punt, 4th & 4 at BAL 38: -6.4
2. Monken (CLE) punt, 4th & 2 at CLE 15: -5.2
3. Saleh (TEN) FG, 4th & 4 at HOU 12: -4.6

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/5

<sub>278/280</sub>

## leaderboard.png

Wins given away on 4th down through Week 5: win probability lost vs the model's best call, summed over every graded call (1.00 = one win).

Fewest: Reid (KC) 0.06, Canales (CAR) 0.07
Most: Payton (DEN) 0.29, Minter (BAL) 0.28

Min 20 calls. https://gradient-descent-eta.vercel.app/week/2026/5

<sub>264/280</sub>

## gutsiest.png

Gutsiest correct call of Week 5: Jim Harbaugh went for it on 4th & 1 at LAC 41, up 7 on DEN with 10:33 left.

Only 31% of coaches go there. The model agreed, by 4.3 points of win probability over punting. LAC was stopped. Still the right call.

https://gradient-descent-eta.vercel.app/calculator?yl=59&togo=1&diff=7&q=4&t=633&to=1&dto=3&spr=-3.5&v=h&oe=-0.121192&de=-0.046614&in=1

<sub>268/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 5's costliest 4th-down call: down 5 to ATL with 6:30 left, Jesse Minter punted on 4th & 4 at BAL 38.

It cost BAL 6.4 points of win probability. Here's the math.

<sub>166/280</sub>

**2/5**

What BAL did. Punting: ATL starts at their own 19 on average, and BAL's win probability is 13.7%.

<sub>97/280</sub>

**3/5**

What the model wanted. Going for it: the model gives BAL a 57% chance to convert. Convert and BAL's win probability is 28%. Get stopped and it's 9%. Weighted together: 20.1%.

<sub>174/280</sub>

**4/5**

So going for it beats punting if BAL converts at least 24% of the time. The model puts it at 57%, so punting cost 6.4 points, the most of the 210 graded 4th downs in Week 5.

<sub>173/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=62&togo=4&diff=-5&q=4&t=390&to=3&dto=3&spr=-3.5&v=a&oe=0.183006&de=-0.034547&w=0&tmp=70

<sub>208/280</sub>
