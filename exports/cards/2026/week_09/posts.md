# 2026 Week 9: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_09.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 9: Brian Schottenheimer punted on 4th & 1 at DAL 39, up 3 on IND with 7:50 left.

Going for it: 75.2% win probability. What DAL did: 70.5%. That's 4.6 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=61&togo=1&diff=3&q=4&t=470&to=3&dto=3&spr=4.5&v=a&oe=0.119962&de=0.047882&w=0&tmp=70

<sub>230/280</sub>

## top-3.png

Week 9's 3 costliest 4th-down calls (WP points lost):

1. Schottenheimer (DAL) punt, 4th & 1 at DAL 39: -4.6
2. Harbaugh (NYG) punt, 4th & 1 at NYG 29: -3.9
3. Moore (NO) punt, 4th & 3 at NO 37: -3.9

https://gradient-descent-eta.vercel.app/week/2026/9

<sub>224/280</sub>

## leaderboard.png

Wins given away on 4th down through Week 9: win probability lost vs the model's best call, summed over every graded call (1.00 = one win).

Fewest: Brady (BUF) 0.12, LaFleur (GB) 0.13
Most: Minter (BAL) 0.45, Ryans (HOU) 0.43

Min 30 calls. https://gradient-descent-eta.vercel.app/week/2026/9

<sub>264/280</sub>

## gutsiest.png

Gutsiest correct call of Week 9: Sean McVay went for it on 4th & 2 at LA 44, down 7 to WAS in the 2nd quarter.

Only 22% of coaches go there. The model agreed, by 6.4 points of win probability over punting. LA converted.

https://gradient-descent-eta.vercel.app/calculator?yl=56&togo=2&diff=-7&q=2&t=279&to=1&dto=3&spr=4.5&v=a&rk=1&oe=0.046705&de=0.018411

<sub>245/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 9's costliest 4th-down call: up 3 on IND with 7:50 left, Brian Schottenheimer punted on 4th & 1 at DAL 39.

It cost DAL 4.6 points of win probability. Here's the math.

<sub>172/280</sub>

**2/5**

What DAL did. Punting: IND starts at their own 18 on average, and DAL's win probability is 70.5%.

<sub>97/280</sub>

**3/5**

What the model wanted. Going for it: the model gives DAL a 76% chance to convert. Convert and DAL's win probability is 81%. Get stopped and it's 58%. Weighted together: 75.2%.

<sub>175/280</sub>

**4/5**

So going for it beats punting if DAL converts at least 56% of the time. The model puts it at 76%, so punting cost 4.6 points, the most of the 221 graded 4th downs in Week 9.

<sub>173/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=61&togo=1&diff=3&q=4&t=470&to=3&dto=3&spr=4.5&v=a&oe=0.119962&de=0.047882&w=0&tmp=70

<sub>208/280</sub>
