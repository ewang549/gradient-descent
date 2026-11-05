/** How sure the call is (WP gap to the next-best option, in points) -> color and label.
 *  Orange = toss-up, yellow = lean, green = clear call. Shared by the calculator and the cards. */

const STOPS: [number, [number, number, number]][] = [
  [0, [255, 122, 69]], // #ff7a45
  [3, [229, 200, 74]], // #e5c84a
  [7, [57, 217, 138]], // #39d98a
];

export function confidenceColor(gapPts: number): string {
  const g = Math.min(Math.max(gapPts, 0), STOPS[STOPS.length - 1][0]);
  for (let i = 1; i < STOPS.length; i++) {
    const [x1, c1] = STOPS[i];
    const [x0, c0] = STOPS[i - 1];
    if (g <= x1) {
      const t = (g - x0) / (x1 - x0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c.join(" ")})`;
    }
  }
  return "rgb(57 217 138)";
}

export function confidenceLabel(gapPts: number): string {
  if (gapPts < 1) return "Toss-up";
  if (gapPts < 3) return "Lean";
  if (gapPts < 7) return "Clear call";
  return "No-brainer";
}


/** Same color as hex (Satori's color parser is stricter than browsers'). */
export function confidenceHex(gapPts: number): string {
  const [r, g, b] = confidenceColor(gapPts).match(/\d+/g)!.map(Number);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
