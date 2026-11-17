# 2026 Week 10: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_10.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 10: John Harbaugh punted on 4th & 3 at WAS 46, down 3 to WAS with 14:15 left.

Going for it: 41.3% win probability. What NYG did: 34.4%. That's 6.9 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=46&togo=3&diff=-3&q=4&t=855&to=3&dto=3&spr=1.5&v=h&oe=0.016521&de=0.028886

<sub>227/280</sub>

## top-3.png

Week 10's 3 costliest 4th-down calls (win-probability points lost):

1. Harbaugh (NYG) punt, 4th & 3 at WAS 46: -6.9
2. Harbaugh (LAC) FG, 4th & 1 at BAL 17: -3.8
3. McVay (LA) punt, 4th & 3 at ARI 47: -3.3

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/10

<sub>275/280</sub>

## leaderboard.png

Wins given away on 4th down through Week 10: win probability lost vs the model's best call, summed over every graded call (1.00 = one win).

Fewest: LaFleur (GB) 0.13, Brady (BUF) 0.14
Most: Minter (BAL) 0.48, O'Connell (MIN) 0.45

Min 30 calls. https://gradient-descent-eta.vercel.app/week/2026/10

<sub>269/280</sub>

## gutsiest.png

Gutsiest correct call of Week 10: Dave Canales went for it on 4th & 1 at CAR 26, up 7 on NO in the 3rd quarter.

Only 8% of coaches go there. The model agreed, by 2.8 points of win probability over punting. CAR converted.

https://gradient-descent-eta.vercel.app/calculator?yl=74&togo=1&diff=7&q=3&t=802&to=2&dto=3&spr=-1.5&v=a&oe=0.031356&de=0.061728&in=1

<sub>246/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 10's costliest 4th-down call: down 3 to WAS with 14:15 left, John Harbaugh punted on 4th & 3 at WAS 46.

It cost NYG 6.9 points of win probability. Here's the math.

<sub>169/280</sub>

**2/5**

What NYG did. Punting: WAS starts at their own 12 on average, and NYG's win probability is 34.4%.

<sub>97/280</sub>

**3/5**

What the model wanted. Going for it: the model gives NYG a 49% chance to convert. Convert and NYG's win probability is 53%. Get stopped and it's 30%. Weighted together: 41.3%.

<sub>175/280</sub>

**4/5**

So going for it beats punting if NYG converts at least 20% of the time. The model puts it at 49%, so punting cost 6.9 points, the most of the 204 graded 4th downs in Week 10.

<sub>174/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=46&togo=3&diff=-3&q=4&t=855&to=3&dto=3&spr=1.5&v=h&oe=0.016521&de=0.028886

<sub>208/280</sub>
