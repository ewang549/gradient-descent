/**
 * Finding 1 copy, checked against the export: the numbers the thread and page lead with are the
 * export's numbers, convergence is only claimed where the trend test is significant, and every
 * draft post passes the post rules.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOffenseStyle } from "@/lib/findings/offenseStyle";
import { offenseStyleThread } from "@/lib/findings/posts";
import { EXPORTS_DIR } from "@/lib/weekly/data";
import { checkPost } from "@/lib/weekly/posts";

const d = loadOffenseStyle()!;
const raw = JSON.parse(readFileSync(path.join(EXPORTS_DIR, "findings", "offense-style", "result.json"), "utf8"));

describe("offense style finding", () => {
  it("loads", () => expect(d).not.toBeNull());

  it("endpoints are single seasons: the first season and the last complete one", () => {
    const by = (s: number) => raw.drift.by_season.find((r: { season: number }) => r.season === s);
    for (const s of d.drift) {
      expect(s.from.mean).toBe(by(d.firstSeason)[s.info.key].mean);
      expect(s.to.mean).toBe(by(d.lastComplete)[s.info.key].mean);
    }
    expect(d.lastComplete).toBe(d.lastSeason - 1);
  });

  it("only significant spreads are called convergence", () => {
    for (const s of d.spreadTable) expect(s.spread.significant).toBe(raw.drift.trends[s.info.key].sd_slope_p < 0.05);
  });

  it("every labeled map point exists", () => {
    for (const l of d.map.labeled) expect(d.map.points.some((p) => p[0] === l.season && d.map.teams[p[1]] === l.team)).toBe(true);
  });

  it("every thread post passes the post rules", () => {
    const thread = offenseStyleThread(d);
    expect(thread.length).toBeGreaterThanOrEqual(4);
    expect(thread.length).toBeLessThanOrEqual(6);
    for (const p of thread) expect(checkPost(p.text), p.text).toEqual([]);
  });
});
