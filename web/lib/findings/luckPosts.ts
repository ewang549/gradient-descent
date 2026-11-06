/**
 * Draft X thread for finding 2 (and, once graded, the results post). Every number comes from
 * loadLuckSkill(); the headline follows the review: regression first, luck second, the small
 * point-diff edge third, the 2026 calls last. "Worse than a coin flip" stays out of the headline.
 */
import { SITE_URL } from "@/lib/weekly/format";
import { type LuckSkill, pct, stamp } from "./luckSkill";
import { type ThreadPost, threadToMarkdown } from "./posts";
import { findingPath } from "./registry";

const r2 = (v: number) => v.toFixed(2);

export function luckSkillThread(d: LuckSkill): ThreadPost[] {
  const url = `${SITE_URL}${findingPath(d.slug)}`;
  const e = d.edge;
  return [
    {
      card: "regression.png",
      text: `Teams that start 6-2 or better won ${pct(d.hot.first_win_pct)} of their games. They win ${pct(d.hot.rest_win_pct)} the rest of the way.\n\n` +
        `That's ${d.hot.n} NFL team-seasons since ${d.firstSeason}. Teams that started 2-6 or worse went from ${pct(d.cold.first_win_pct)} to ${pct(d.cold.rest_win_pct)}. ` +
        "Every record drifts back toward .500.",
    },
    {
      card: "luck.png",
      text: "Part of any record is luck: winning more than your points scored and allowed predict, mostly in close games.\n\n" +
        `It doesn't carry over. Luck in the first 8 games vs luck the rest of the way: r = ${r2(d.luck.r)} (95% CI ${r2(d.luck.ci[0])} to ${r2(d.luck.ci[1])}).`,
    },
    {
      text: "So point differential is the better guide, by a little. Pull both toward .500 and forecast the rest of the season: " +
        `error ${e.record.toFixed(3)} for the record, ${e.pointDiff.toFixed(3)} for point diff.\n\n` +
        "Fit only on past seasons, as in real time, and the edge's 95% interval just crosses zero. The market beats both.",
    },
    {
      card: "calls.png",
      text: "Calling a 6-1 team to cool off is nearly free. The real 2026 test is the 10 teams where point differential and the regressed record disagree most.\n\n" +
        `Point diff says ${d.up.map((t) => t.team).join(", ")} beat their record. ${d.down.map((t) => t.team).join(", ")} fall short.`,
    },
    {
      text: `Recorded ${stamp(d.vs.generated_at)}, before week ${d.vs.data_through_week + 1} kicked off, and graded automatically after week 18. ` +
        `Run on every season since ${d.firstSeason}, the same rule went point differential's way ${pct(d.highlightRule.hitRate)} of the time.\n\n` +
        `Write-up and the timestamped file:\n${url}`,
    },
  ];
}

/** One post for the results card, once grades exist. */
export function luckSkillResultsPost(d: LuckSkill): ThreadPost | null {
  const g = d.grades?.vs_baseline;
  if (!g || !d.grades) return null;
  const m = g.rule_1_mae;
  const h = g.rule_2_highlighted;
  const lead = d.grades.final ? "The 2026 luck vs skill calls are graded." : `Not final (${d.grades.simulated ? "simulated" : "partial"}).`;
  return {
    card: "results.png",
    text: `${lead} Average miss in rest-of-season wins per team: regressed record ${r2(m.baseline)}, point differential ${r2(m.point_diff)}, market ${r2(m.market)}.\n\n` +
      `The 10 highlighted calls: ${h.hits} of ${h.of} went point differential's way (expected ${h.expected.toFixed(1)}).\n${SITE_URL}${findingPath(d.slug)}`,
  };
}

export function luckSkillMarkdown(d: LuckSkill): string {
  const results = luckSkillResultsPost(d);
  const extra = results
    ? (() => {
        // the results post goes through the same rules
        threadToMarkdown("check", d.slug, [results]);
        return ["# Results post", "", `(attach ${results.card})`, "", results.text, ""];
      })()
    : [];
  return threadToMarkdown("Finding 2: Hot starts cool off. Luck doesn't carry over.", d.slug, luckSkillThread(d), extra);
}
