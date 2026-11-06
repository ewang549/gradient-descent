# 2026 Week 7: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_07.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 7: Mike Vrabel punted on 4th & 7 at NE 46, down 6 to CHI with 6:28 left.

Going for it: 18.2% win probability. What NE did: 13.4%. That's 4.8 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=54&togo=7&diff=-6&q=4&t=388&to=3&dto=2&spr=-3&v=a&oe=-0.024547&de=0.007609

<sub>221/280</sub>

## top-3.png

Week 7's 3 costliest 4th-down calls (win-probability points lost):

1. Vrabel (NE) punt, 4th & 7 at NE 46: -4.8
2. Schottenheimer (DAL) FG, 4th & 8 at PHI 37: -3.8
3. Glenn (NYJ) FG, 4th & 9 at MIA 22: -3.7

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/7

<sub>275/280</sub>

## leaderboard.png

Wins given away on 4th down through Week 7: win probability lost vs the model's best call, summed over every graded call (1.00 = one win).

Fewest: LaFleur (GB) 0.09, McDermott (BUF) 0.09
Most: Ryans (HOU) 0.40, Minter (BAL) 0.39

Min 28 calls. https://gradient-descent-eta.vercel.app/week/2026/7

<sub>268/280</sub>

## gutsiest.png

Gutsiest correct call of Week 7: Matt LaFleur went for it on 4th & 5 at DET 33, scoreless vs DET in the 1st quarter.

Only 20% of coaches go there. The model agreed, by 3.3 points of win probability over punting. GB converted.

https://gradient-descent-eta.vercel.app/calculator?yl=33&togo=5&diff=0&q=1&t=755&to=2&dto=3&spr=-3.5&v=a&oe=-0.008408&de=0.108808&in=1

<sub>251/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 7's costliest 4th-down call: down 6 to CHI with 6:28 left, Mike Vrabel punted on 4th & 7 at NE 46.

It cost NE 4.8 points of win probability. Here's the math.

<sub>163/280</sub>

**2/5**

What NE did. Punting: CHI starts at their own 15 on average, and NE's win probability is 13.4%.

<sub>95/280</sub>

**3/5**

What the model wanted. Going for it: the model gives NE a 40% chance to convert. Convert and NE's win probability is 31%. Get stopped and it's 9%. Weighted together: 18.2%.

<sub>172/280</sub>

**4/5**

So going for it beats punting if NE converts at least 18% of the time. The model puts it at 40%, so punting cost 4.8 points, the most of the 179 graded 4th downs in Week 7.

<sub>172/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=54&togo=7&diff=-6&q=4&t=388&to=3&dto=2&spr=-3&v=a&oe=-0.024547&de=0.007609

<sub>208/280</sub>
