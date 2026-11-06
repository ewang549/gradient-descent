/**
 * Finding 2 copy, checked against the exports: every claim the page and thread make in words
 * ("just crosses zero", "worse than calling everyone .500 from 4 to 9 games", "no reliable gain")
 * is re-derived here, so a rerun that flips one fails the build instead of shipping wrong copy.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { luckSkillResultsPost, luckSkillThread } from "@/lib/findings/luckPosts";
import { ORIGINAL_FILE, VS_BASELINE_FILE, loadLuckSkill } from "@/lib/findings/luckSkill";
import { EXPORTS_DIR } from "@/lib/weekly/data";
import { checkPost } from "@/lib/weekly/posts";

const d = loadLuckSkill()!;
const dir = path.join(EXPORTS_DIR, "findings", "luck-skill");
const raw = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));

describe("luck vs skill finding", () => {
  it("loads", () => expect(d).not.toBeNull());

  it("headline 1 numbers: 6-2 or better, 80% then 64%", () => {
    expect(Math.round(d.hot.first_win_pct * 100)).toBe(80);
    expect(Math.round(d.hot.rest_win_pct * 100)).toBe(64);
  });

  it("same pace is worse than .500 at every k from 4 to 9", () => {
    for (const r of d.kChart) expect(r.pace).toBeGreaterThan(r.coin);
    expect(d.kChart.map((r) => r.k)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it("point diff beats the regressed record held out at every k; the real-time interval crosses zero at k = 8", () => {
    for (const r of d.edge.byK) expect(r.loso[1]).toBeLessThan(0);
    expect(d.edge.forward[0]).toBeLessThan(0);
    expect(d.edge.forward[1]).toBeGreaterThan(0);
  });

  it("the market beats point diff (interval excludes zero)", () => expect(d.edge.marketVsPointDiff[1]).toBeLessThan(0));

  it("schedule strength: no reliable gain at k = 8, so no v2 file", () => {
    expect(d.sos.reliable).toBe(false);
    expect(d.sos.k8.diff_ci[0]).toBeLessThan(0);
    expect(d.sos.k8.diff_ci[1]).toBeGreaterThan(0);
  });

  it("the luck correlation's interval includes zero", () => {
    expect(d.luck.ci[0]).toBeLessThan(0);
    expect(d.luck.ci[1]).toBeGreaterThan(0);
  });

  it("vs-baseline point diff forecasts are the original file's forecasts", () => {
    const orig = new Map(raw(ORIGINAL_FILE).teams.map((t: { team: string; pred_rest_win_pct: number }) => [t.team, t.pred_rest_win_pct]));
    const vs = raw(VS_BASELINE_FILE);
    expect(vs.teams).toHaveLength(32);
    for (const t of vs.teams) expect(Math.abs(t.point_diff_rest_win_pct - (orig.get(t.team) as number))).toBeLessThan(1e-3);
  });

  it("the highlighted teams are the 5 biggest disagreements each way", () => {
    const by = [...d.vs.teams].sort((a, b) => b.gap_wins - a.gap_wins);
    expect(d.up.map((t) => t.team)).toEqual(by.slice(0, 5).map((t) => t.team));
    expect(d.down.map((t) => t.team).sort()).toEqual(by.slice(-5).map((t) => t.team).sort());
    for (const t of d.up) expect(t.gap_wins).toBeGreaterThan(0);
    for (const t of d.down) expect(t.gap_wins).toBeLessThan(0);
  });

  it("the vs-baseline file was written after the original and excludes nothing it shouldn't", () => {
    expect(new Date(d.vs.generated_at).getTime()).toBeGreaterThan(new Date(d.original.generated_at).getTime());
    expect(Array.isArray(d.vs.excluded_started_games)).toBe(true);
  });

  it("thread: regression leads, no coin flip in the headline, every post passes the rules", () => {
    const t = luckSkillThread(d);
    expect(t[0].text.startsWith("Teams that start 6-2 or better won 80% of their games. They win 64% the rest of the way.")).toBe(true);
    expect(t[0].text.toLowerCase()).not.toContain("coin");
    for (const p of t) expect(checkPost(p.text), p.text).toEqual([]);
    expect(luckSkillResultsPost(d) === null).toBe(d.grades === null);
  });
});
