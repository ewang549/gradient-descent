# 2026 Week 3: draft posts

Drafts for the cards in this folder. Every number comes from `exports/weekly/2026/week_03.json`; calculator links reproduce each call exactly. Character counts use X's rules (links count as 23).

## worst-call.png

The costliest 4th-down call of Week 3: Jesse Minter punted on 4th & 5 at BAL 45, down 4 to DAL with 7:40 left.

Going for it: 31.2% win probability. What BAL did: 23.7%. That's 7.5 points given away.

https://gradient-descent-eta.vercel.app/calculator?yl=55&togo=5&diff=-4&q=4&t=460&to=2&dto=3&spr=3&v=n&oe=0.097681&de=0.221203&w=0&tmp=70

<sub>224/280</sub>

## top-3.png

Week 3's 3 costliest 4th-down calls (win-probability points lost):

1. Minter (BAL) punt, 4th & 5 at BAL 45: -7.5
2. Payton (DEN) punt, 4th & 2 at DEN 38: -6.5
3. Taylor (CIN) punt, 4th & 3 at CIN 49: -6.2

All three times, the model said go for it.

https://gradient-descent-eta.vercel.app/week/2026/3

<sub>274/280</sub>

## gutsiest.png

Gutsiest correct call of Week 3: Dan Campbell went for it on 4th & 2 at NYJ 9, down 4 to NYJ in the 2nd quarter.

Only 46% of coaches go there. The model agreed, by 8.2 points of win probability over kicking the field goal. DET converted.

https://gradient-descent-eta.vercel.app/calculator?yl=9&togo=2&diff=-4&q=2&t=107&to=3&dto=2&spr=7&v=h&rk=1&oe=0.05597&de=0.162401&in=1&tf=1

<sub>263/280</sub>

## Thread: the worst call (attach worst-call.png to post 1)

**1/5**

Week 3's costliest 4th-down call: down 4 to DAL with 7:40 left, Jesse Minter punted on 4th & 5 at BAL 45.

It cost BAL 7.5 points of win probability. Here's the math.

<sub>166/280</sub>

**2/5**

What BAL did. Punting: DAL starts at their own 15 on average, and BAL's win probability is 23.7%.

<sub>97/280</sub>

**3/5**

What the model wanted. Going for it: the model gives BAL a 52% chance to convert. Convert and BAL's win probability is 45%. Get stopped and it's 16%. Weighted together: 31.2%.

<sub>175/280</sub>

**4/5**

So going for it beats punting if BAL converts at least 26% of the time. The model puts it at 52%, so punting cost 7.5 points, the most of the 215 graded 4th downs in Week 3.

<sub>173/280</sub>

**5/5**

The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. This link opens it on this exact situation, so you can move the ball and see where the call flips:

https://gradient-descent-eta.vercel.app/calculator?yl=55&togo=5&diff=-4&q=4&t=460&to=2&dto=3&spr=3&v=n&oe=0.097681&de=0.221203&w=0&tmp=70

<sub>208/280</sub>
