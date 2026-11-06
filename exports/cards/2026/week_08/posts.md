# 2026 Week 8: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_08.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 8: Kevin O'Connell punted on 4th & 5 at MIN 33, down 4 to DET with 3:01 left.

Going for it: 20.5% win probability. What MIN did: 14.9%. That's 5.6 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=67&togo=5&diff=-4&q=4&t=181&to=3&dto=3&spr=-3&v=a&oe=-0.100092&de=0.093788&in=1

<sub>227/280</sub>

## top-3.png

Week 8's 3 costliest 4th-down calls (win-probability points lost):

1. O'Connell (MIN) punt, 4th & 5 at MIN 33: -5.6
2. Glenn (NYJ) FG, 4th & 2 at LV 17: -4.6
3. O'Connell (MIN) FG, 4th & 7 at DET 38: -3.3

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/8

<sub>274/280</sub>

## leaderboard.png

Wins given away on 4th down through Week 8: win probability lost vs the model's best call, summed over every graded call (1.00 = one win).

Fewest: LaFleur (GB) 0.10, McDermott (BUF) 0.11
Most: Minter (BAL) 0.44, Ryans (HOU) 0.40

Min 30 calls. https://gradient-descent-eta.vercel.app/week/2026/8

<sub>268/280</sub>

## gutsiest.png

Gutsiest correct call of Week 8: Brian Schottenheimer went for it on 4th & 1 at DAL 32.

Only 23% of coaches go there. The model agreed, by 2.6 points of win probability over punting. DAL was stopped. Still the right call.

https://gradient-descent-eta.vercel.app/calculator?yl=68&togo=1&diff=0&q=1&t=660&to=2&dto=3&spr=7&v=h&rk=1&oe=0.118141&de=0.121665&in=1

<sub>247/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 8's costliest 4th-down call: down 4 to DET with 3:01 left, Kevin O'Connell punted on 4th & 5 at MIN 33.

It cost MIN 5.6 points of win probability. Here's the math.

<sub>169/280</sub>

**2/5**

What MIN did. Punting: DET starts at their own 23 on average, and MIN's win probability is 14.9%.

<sub>97/280</sub>

**3/5**

What the model wanted. Going for it: the model gives MIN a 51% chance to convert. Convert and MIN's win probability is 32%. Get stopped and it's 8%. Weighted together: 20.5%.

<sub>174/280</sub>

**4/5**

So going for it beats punting if MIN converts at least 28% of the time. The model puts it at 51%, so punting cost 5.6 points, the most of the 202 graded 4th downs in Week 8.

<sub>173/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=67&togo=5&diff=-4&q=4&t=181&to=3&dto=3&spr=-3&v=a&oe=-0.100092&de=0.093788&in=1

<sub>208/280</sub>
