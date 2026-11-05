/** WP chart geometry and the game exports it reads. */
import { describe, expect, it } from "vitest";
import { callGrade, clockAt, colorDistance, linePaths, linePoints, points, splitAtHalf, teamColors } from "@/lib/games/chart";
import { gameSeasons, gamesIndex, loadGame } from "@/lib/games/data";

describe("chart geometry", () => {
  it("splits the line exactly at 50%", () => {
    const s = splitAtHalf([{ x: 0, y: 0.4 }, { x: 1, y: 0.6 }]);
    expect(s).toEqual([{ x: 0, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.6 }]);
    const { above, below } = linePaths([{ x: 0, y: 0.4 }, { x: 1, y: 0.6 }], 100, 100);
    expect(above).toBe("M0 40L50 50");
    expect(below).toBe("M50 50L100 60");
  });

  it("labels the clock from seconds left", () => {
    expect([clockAt(3600), clockAt(2700), clockAt(1), clockAt(0)]).toEqual(["Q1 15:00", "Q2 15:00", "Q4 0:01", "Final"]);
  });

  it("grades calls with the /play cutoffs", () => {
    expect([0, 0.019, 0.02].map((wp_lost) => callGrade({ is_graded: true, wp_lost }))).toEqual(["right", "small", "big"]);
    expect(callGrade({ is_graded: false, wp_lost: null })).toBe("ungraded");
  });
});

describe("every exported game", () => {
  const games = gameSeasons().flatMap((s) => gamesIndex(s)!.games.map((g) => loadGame(s, g.game_id)!));

  it("has a time-ordered series inside the chart, ending at the result", () => {
    for (const g of games) {
      const p = points(g);
      expect(p.every((q, i) => i === 0 || q.x >= p[i - 1].x - 1e-9), g.game_id).toBe(true);
      expect(p.every((q) => q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1), g.game_id).toBe(true);
      const result = g.home.score > g.away.score ? 1 : g.home.score < g.away.score ? 0 : 0.5;
      expect(g.series.home_wp.at(-1)).toBe(result);
      expect(linePoints(g, p).length).toBe(p.length - (g.went_to_overtime ? 1 : 0));
    }
  });

  it("puts every regulation 4th down on the line and has five swings", () => {
    for (const g of games) {
      const seqs = new Set(g.series.play_seq);
      expect(g.fourth_downs.filter((f) => f.qtr <= 4 && !seqs.has(f.play_seq)).map((f) => f.play_seq), g.game_id).toEqual([]);
      expect(g.swings.length).toBe(5);
    }
  });

  it("gives the two teams colors you can tell apart", () => {
    for (const g of games) {
      const c = teamColors(g.home, g.away);
      expect(colorDistance(c.home, c.away), g.game_id).toBeGreaterThanOrEqual(15);
    }
  });
});
