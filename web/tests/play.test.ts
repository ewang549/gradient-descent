/** "You Make the Call": the daily puzzle is deterministic and stable, rounds have the right mix, scoring adds up. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAILY_MIN_AGE_DAYS, dailyNumber, dailyPicks, grade, headline, lostBy, parseResult, resultQuery, roundPicks, tally,
  toResult,
} from "@/lib/play/game";
import type { Pool } from "@/lib/play/types";

const pool: Pool = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "exports", "play", "pool.json"), "utf8"));
const S = pool.situations;

function seeded(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe("daily", () => {
  it("is the same five spots for the same date, and different the next day", () => {
    const a = dailyPicks(S, "2026-11-04").map((s) => s.id);
    expect(a).toHaveLength(5);
    expect(dailyPicks([...S].reverse(), "2026-11-04").map((s) => s.id)).toEqual(a); // order of the file doesn't matter
    expect(dailyPicks(S, "2026-11-05").map((s) => s.id)).not.toEqual(a);
  });

  it("mixes 2 clear, 2 close, 1 famous, from different games", () => {
    const d = dailyPicks(S, "2026-11-04");
    expect(d.filter((s) => s.kind === "clear")).toHaveLength(2);
    expect(d.filter((s) => s.kind === "close")).toHaveLength(2);
    expect(d.filter((s) => s.kind === "famous")).toHaveLength(1);
    expect(new Set(d.map((s) => s.game_id)).size).toBe(5);
  });

  it("can't change when newer games are added to the pool", () => {
    const date = "2026-11-04";
    const cutoff = new Date(Date.parse(`${date}T00:00:00Z`) - DAILY_MIN_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
    const old = S.filter((s) => s.date <= cutoff);
    expect(dailyPicks(old, date).map((s) => s.id)).toEqual(dailyPicks(S, date).map((s) => s.id));
    expect(dailyPicks(S, date).every((s) => s.date <= cutoff)).toBe(true);
  });

  it("numbers days from Nov 1, 2026", () => {
    expect(dailyNumber("2026-11-01")).toBe(1);
    expect(dailyNumber("2026-12-01")).toBe(31);
  });
});

describe("round of 10", () => {
  it("has 4 clear, 3 close, 3 famous from 10 different games", () => {
    const r = roundPicks(S, seeded(7));
    expect(r).toHaveLength(10);
    expect(r.filter((s) => s.kind === "clear")).toHaveLength(4);
    expect(r.filter((s) => s.kind === "famous")).toHaveLength(3);
    expect(new Set(r.map((s) => s.game_id)).size).toBe(10);
  });

  it("skips spots already seen", () => {
    const first = roundPicks(S, seeded(1));
    const second = roundPicks(S, seeded(1), new Set(first.map((s) => s.id)));
    expect(second.filter((s) => first.some((f) => f.id === s.id))).toHaveLength(0);
  });
});

describe("scoring", () => {
  it("picking the model's call loses nothing; the coach's number is the exported wp_lost", () => {
    for (const s of S.slice(0, 50)) {
      expect(lostBy(s, s.recommendation)).toBe(0);
      expect(lostBy(s, s.decision)).toBeCloseTo(s.wp_lost, 3);
    }
  });

  it("tallies points and grades", () => {
    const rounds = S.slice(0, 5).map((s) => ({ s, pick: s.recommendation }));
    const t = tally(rounds);
    expect(t.you).toBe(0);
    expect(t.youGrades).toEqual([0, 0, 0, 0, 0]);
    expect(t.coaches).toBeCloseTo(rounds.reduce((a, r) => a + r.s.wp_lost, 0), 10);
    expect([grade(0), grade(0.019), grade(0.02)]).toEqual([0, 1, 2]);
  });

  it("round-trips the share link and clamps junk", () => {
    const r = toResult({ you: 0.041, coaches: 0.113, youGrades: [0, 1, 2, 0, 0], coachGrades: [2, 2, 1, 0, 0] }, "daily", "2026-11-04");
    expect(parseResult(new URLSearchParams(resultQuery(r)))).toEqual(r);
    expect(headline(r)).toBe("I beat NFL coaches by 7.2% win probability");
    expect(headline({ you: 5, coaches: 2 })).toBe("NFL coaches beat me by 3.0% win probability");
    const junk = parseResult(new URLSearchParams("m=d&d=nope&y=-4&c=abc&g=9x1"));
    expect(junk).toMatchObject({ date: null, you: 0, coaches: 0, you_grades: [1] });
  });
});
