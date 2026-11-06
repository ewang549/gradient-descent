# 2026 Week 4: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_04.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 4: Mike Vrabel punted on 4th & 4 at NE 42, up 1 on BUF with 6:45 left.

Going for it: 37.3% win probability. What NE did: 30.4%. That's 6.8 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=58&togo=4&diff=1&q=4&t=405&to=3&dto=3&spr=-7&v=a&oe=-0.101837&de=0.002453&w=11&tmp=69

<sub>219/280</sub>

## top-3.png

The 3 costliest 4th-down calls of Week 4, in win-probability points lost:

1. Vrabel (NE) punt, 4th & 4 at NE 42: -6.8
2. Quinn (WAS) FG, 4th & 2 at IND 13: -5.4
3. Johnson (CHI) FG, 4th & 2 at NYJ 12: -4.8

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/4

<sub>275/280</sub>

## leaderboard.png

Wins given away on 4th down through Week 4: win probability lost vs the model's best call, summed over every graded call (1.00 = one win).

Fewest: Shanahan (SF) 0.05, McDermott (BUF) 0.05
Most: Payton (DEN) 0.24, Ryans (HOU) 0.22

Min 16 calls. https://gradient-descent-eta.vercel.app/week/2026/4

<sub>269/280</sub>

## gutsiest.png

Gutsiest correct call of Week 4: Nick Sirianni went for it on 4th & 1 at PHI 38, up 10 on LA in the 3rd quarter.

Only 24% of coaches go there. The model agreed, by 3.4 points of win probability over punting. PHI was stopped. Still the right call.

https://gradient-descent-eta.vercel.app/calculator?yl=62&togo=1&diff=10&q=3&t=67&to=3&dto=3&spr=-3.5&v=h&oe=0.034033&de=0.00726&w=9&tmp=62

<sub>272/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 4's costliest 4th-down call: up 1 on BUF with 6:45 left, Mike Vrabel punted on 4th & 4 at NE 42.

It cost NE 6.8 points of win probability. Here's the math.

<sub>161/280</sub>

**2/5**

What NE did. Punting: BUF starts at their own 16 on average, and NE's win probability is 30.4%.

<sub>95/280</sub>

**3/5**

What the model wanted. Going for it: the model gives NE a 46% chance to convert. Convert and NE's win probability is 54%. Get stopped and it's 23%. Weighted together: 37.3%.

<sub>173/280</sub>

**4/5**

So going for it beats punting if NE converts at least 24% of the time. The model puts it at 46%, so punting cost 6.8 points, the most of the 240 graded 4th downs in Week 4.

<sub>172/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=58&togo=4&diff=1&q=4&t=405&to=3&dto=3&spr=-7&v=a&oe=-0.101837&de=0.002453&w=11&tmp=69

<sub>208/280</sub>
