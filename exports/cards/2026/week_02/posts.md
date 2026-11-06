# 2026 Week 2: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_02.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 2: Shane Steichen punted on 4th & 4 at IND 49, tied 27-27 with KC with 0:34 left.

Going for it: 44.8% win probability. What IND did: 35.2%. That's 9.6 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=51&togo=4&diff=0&q=4&t=34&to=1&dto=3&spr=-6&v=a&oe=-0.086761&de=-0.05548&w=10&tmp=71

<sub>231/280</sub>

## top-3.png

The 3 costliest 4th-down calls of Week 2, in win-probability points lost:

1. Steichen (IND) punt, 4th & 4 at IND 49: -9.6
2. Kubliak (LV) punt, 4th & 1 at LV 26: -8.8
3. Ryans (HOU) FG, 4th & 1 at CIN 40: -5.6

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/2

<sub>279/280</sub>

## gutsiest.png

Gutsiest correct call of Week 2: Todd Monken went for it on 4th & 1 at CLE 34, tied 6-6 with TB in the 2nd quarter.

Only 25% of coaches go there. The model agreed, by 3.5 points of win probability over punting. CLE was stopped. Still the right call.

https://gradient-descent-eta.vercel.app/calculator?yl=66&togo=1&diff=0&q=2&t=170&to=2&dto=2&spr=-8.5&v=a&oe=-0.195951&de=0.053178&w=4&tmp=86

<sub>275/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 2's costliest 4th-down call: tied 27-27 with KC with 0:34 left, Shane Steichen punted on 4th & 4 at IND 49.

It cost IND 9.6 points of win probability. Here's the math.

<sub>173/280</sub>

**2/5**

What IND did. Punting: KC starts at their own 13 on average, and IND's win probability is 35.2%.

<sub>96/280</sub>

**3/5**

What the model wanted. Going for it: the model gives IND a 45% chance to convert. Convert and IND's win probability is 72%. Get stopped and it's 23%. Weighted together: 44.8%.

<sub>175/280</sub>

**4/5**

So going for it beats punting if IND converts at least 26% of the time. The model puts it at 45%, so punting cost 9.6 points, the most of the 215 graded 4th downs in Week 2.

<sub>173/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=51&togo=4&diff=0&q=4&t=34&to=1&dto=3&spr=-6&v=a&oe=-0.086761&de=-0.05548&w=10&tmp=71

<sub>208/280</sub>
