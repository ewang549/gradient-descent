# 2026 Week 1: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_01.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 1: Dan Campbell punted on 4th & 1 at DET 44, tied 24-24 with NO with 0:37 left.

Going for it: 68.8% win probability. What DET did: 62.8%. That's 6.1 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=56&togo=1&diff=0&q=4&t=37&to=3&dto=1&spr=7&v=h&oe=0.001306&de=-0.177716&in=1&tf=1

<sub>229/280</sub>

## top-3.png

The 3 costliest 4th-down calls of Week 1, in win-probability points lost:

1. Campbell (DET) punt, 4th & 1 at DET 44: -6.1
2. Moore (NO) FG, 4th & 4 at DET 10: -4.8
3. Ryans (HOU) FG, 4th & 4 at BUF 39: -4.7

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/1

<sub>276/280</sub>

## gutsiest.png

Gutsiest correct call of Week 1: Ben Johnson went for it on 4th & 1 at CHI 21, up 7 on CAR in the 2nd quarter.

Only 7% of coaches go there. The model agreed, by 1.2 points of win probability over punting. CHI was stopped. Still the right call.

https://gradient-descent-eta.vercel.app/calculator?yl=79&togo=1&diff=7&q=2&t=635&to=3&dto=3&spr=3&v=a&oe=0.078504&de=0.061359&w=2&tmp=89

<sub>269/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 1's costliest 4th-down call: tied 24-24 with NO with 0:37 left, Dan Campbell punted on 4th & 1 at DET 44.

It cost DET 6.1 points of win probability. Here's the math.

<sub>171/280</sub>

**2/5**

What DET did. Punting: NO starts at their own 16 on average, and DET's win probability is 62.8%.

<sub>96/280</sub>

**3/5**

What the model wanted. Going for it: the model gives DET a 68% chance to convert. Convert and DET's win probability is 81%. Get stopped and it's 42%. Weighted together: 68.8%.

<sub>175/280</sub>

**4/5**

So going for it beats punting if DET converts at least 53% of the time. The model puts it at 68%, so punting cost 6.1 points, the most of the 208 graded 4th downs in Week 1.

<sub>173/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=56&togo=1&diff=0&q=4&t=37&to=3&dto=1&spr=7&v=h&oe=0.001306&de=-0.177716&in=1&tf=1

<sub>208/280</sub>
