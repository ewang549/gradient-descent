import type { Metadata } from "next";
import Link from "next/link";
import { ByRecordChart, EdgeChart, KChart, LuckScatter } from "@/components/findings/LuckCharts";
import {
  COLORS, GRADES_FILE, ORIGINAL_FILE, VS_BASELINE_FILE, type VsTeam, ci, loadLuckSkill, pct, record, signed, stamp, wpct,
} from "@/lib/findings/luckSkill";
import { FINDINGS } from "@/lib/findings/registry";

const d = loadLuckSkill();
const entry = FINDINGS.find((f) => f.slug === "luck-skill")!;
const title = entry.title;
const description = d
  ? `NFL teams that start 6-2 or better won ${pct(d.hot.first_win_pct)} of their first 8 games and ${pct(d.hot.rest_win_pct)} of the rest. ` +
    `Luck in close games doesn't carry over (r = ${d.luck.r.toFixed(2)}). Point differential is a slightly better guide than the record, and the 2026 calls are on the record.`
  : entry.dek;

export const metadata: Metadata = {
  title: { absolute: `${title} | Finding ${entry.number}` },
  description,
  openGraph: { title, description, type: "article", images: [entry.image] },
  twitter: { card: "summary_large_image", title, description, images: [entry.image] },
};

const JSON_BASE = "/findings/luck-skill";
const f3 = (v: number) => v.toFixed(3);
const w1 = (v: number) => v.toFixed(1);

function Badge({ iso, file }: { iso: string; file: string }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-yellow/50 bg-yellow/10 px-3 py-1.5 text-xs">
      <span className="font-semibold uppercase tracking-wider text-yellow">Recorded {stamp(iso)}</span>
      <span className="text-ink-2">graded after week 18</span>
      <a href={`${JSON_BASE}/${file}`} className="num text-los hover:underline">{file}</a>
    </div>
  );
}

function CallTable({ rows, dir, hits }: { rows: VsTeam[]; dir: "up" | "down"; hits?: Record<string, boolean> }) {
  return (
    <div className="rounded-2xl border border-line bg-panel/70">
      <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider" style={{ color: dir === "up" ? COLORS.pointDiff : COLORS.record }}>
        {dir === "up" ? "Point diff says: beats its regressed record" : "Point diff says: falls short of its regressed record"}
      </div>
      <div className="overflow-x-auto">
      <table className="num w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-4 py-2 font-semibold">Team</th>
            <th className="px-3 py-2 text-right font-semibold">Record</th>
            <th className="px-3 py-2 text-right font-semibold">Pts/g</th>
            <th className="px-3 py-2 text-right font-semibold" title="regressed record">Baseline</th>
            <th className="px-3 py-2 text-right font-semibold">Point diff</th>
            <th className="px-3 py-2 text-right font-semibold">Market</th>
            <th className="px-3 py-2 text-right font-semibold">P(beats baseline)</th>
            {hits && <th className="px-4 py-2 font-semibold">Result</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.team} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2 font-display text-lg font-black tracking-wide">{t.team}</td>
              <td className="px-3 py-2 text-right text-ink-2">{record(t.wins, t.losses)}</td>
              <td className="px-3 py-2 text-right text-ink-2">{signed(t.point_diff_pg)}</td>
              <td className="px-3 py-2 text-right">{w1(t.baseline_rest_wins)}</td>
              <td className="px-3 py-2 text-right font-semibold text-ink">{w1(t.point_diff_rest_wins)}</td>
              <td className="px-3 py-2 text-right text-ink-2">{w1(t.market_rest_wins)}</td>
              <td className="px-3 py-2 text-right">{pct(t.p_beats_baseline)}</td>
              {hits && <td className={`px-4 py-2 font-semibold ${hits[t.team] ? "text-green" : "text-ink-2"}`}>{hits[t.team] ? "Hit" : "Miss"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted">Wins over the {rows[0]?.remaining_games === rows.at(-1)?.remaining_games ? `${rows[0]?.remaining_games} ` : ""}remaining games. Pts/g = point differential per game so far.</p>
    </div>
  );
}

export default function LuckSkillPage() {
  if (!d) return <main className="mx-auto max-w-6xl px-6 py-16 text-ink-2">No export yet. Run the analysis.findings.luck_* modules.</main>;
  const e = d.edge;
  const k8 = d.kChart.find((r) => r.k === d.k)!;
  const lessErr = (e.record - e.pointDiff) / e.record;
  const sorted = [...d.vs.teams].sort((a, b) => b.gap_wins - a.gap_wins);
  const highlighted = new Set([...d.vs.highlighted.point_diff_above_baseline, ...d.vs.highlighted.point_diff_below_baseline]);
  const origSorted = [...d.original.teams];
  const cool = [...origSorted].sort((a, b) => b.p_cools_off - a.p_cools_off).slice(0, 5);
  const heat = [...origSorted].sort((a, b) => b.p_heats_up - a.p_heats_up).slice(0, 5);
  const g = d.grades?.vs_baseline ? d.grades : null;
  const hits = g?.vs_baseline ? { ...g.vs_baseline.rule_2_highlighted.above, ...g.vs_baseline.rule_2_highlighted.below } : undefined;

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">
          <Link href="/findings" className="hover:text-ink">Finding {entry.number}</Link> · Luck vs skill · {d.firstSeason}-{d.lastSeason}
        </div>
        <h1 className="mt-1 font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">
          Hot starts cool off. <span className="text-ink-2">Luck doesn&apos;t carry over.</span>
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-ink-2">
          Halfway through a season, a team&apos;s record overstates how good or bad it is. Every record drifts back toward .500, and the part
          that came from close games breaking one way doesn&apos;t repeat. Point differential is a slightly better guide than the record,
          even after both are pulled toward .500. The 2026 calls that test it were recorded before week 9.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { v: `${pct(d.hot.first_win_pct)} → ${pct(d.hot.rest_win_pct)}`, l: "win% of 6-2 or better starts, first 8 games → the rest" },
            { v: `r = ${d.luck.r.toFixed(2)}`, l: "luck in the first 8 games vs luck after" },
            { v: `${f3(e.record)} → ${f3(e.pointDiff)}`, l: "forecast error, regressed record → point differential" },
            { v: `${d.up.length + d.down.length}`, l: "2026 teams where the two forecasts disagree most, on the record" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-line bg-panel/70 p-4">
              <dd className="num font-display text-3xl font-black leading-none sm:text-4xl">{s.v}</dd>
              <dt className="mt-1.5 text-xs text-ink-2">{s.l}</dt>
            </div>
          ))}
        </dl>
        <p className="num mt-3 text-xs text-muted">
          {d.teamSeasons} team-seasons, {d.firstSeason}-{d.lastSeason} regular seasons, split after each team&apos;s 8th game unless noted. Ties count as half a win.
        </p>
      </header>

      <section aria-labelledby="regress">
        <h2 id="regress" className="font-display text-3xl font-black uppercase tracking-wide">
          1. Teams that start 6-2 or better won {pct(d.hot.first_win_pct)} of their games. They win {pct(d.hot.rest_win_pct)} the rest of the way.
        </h2>
        <p className="mt-2 max-w-3xl text-ink-2">
          {d.hot.n} teams started 6-2, 7-1 or 8-0 between {d.firstSeason} and {d.lastSeason}. They won {pct(d.hot.first_win_pct)} of those first eight games
          and {pct(d.hot.rest_win_pct)} of the {d.hot.rest_games} games after. The {d.cold.n} teams that started 2-6 or worse went from {pct(d.cold.first_win_pct)} to{" "}
          {pct(d.cold.rest_win_pct)}. Every record moves toward .500, and the further from .500 it starts, the bigger the move. That&apos;s regression to the mean:
          an 8-game record is part team quality and part bounces.
        </p>
        <div className="mt-5"><ByRecordChart rows={d.byRecord} highlightFrom={6} /></div>

        <p className="mt-6 max-w-3xl text-ink-2">
          So a forecast of the rest of the season has to pull the record toward .500. Assume a team keeps its current pace and the error after {d.k} games
          is <span className="num">{f3(k8.pace)}</span>, worse than calling every team a .500 team (<span className="num">{f3(k8.coin)}</span>). That holds at every
          point from 4 to 9 games, because the pace forecast ignores regression: a 7-1 team isn&apos;t an .875 team. Pull the record toward .500 by as much as
          past seasons say to, and the error falls to <span className="num">{f3(k8.record)}</span>. Do the same with point differential and it falls a bit
          further, to <span className="num">{f3(k8.pointDiff)}</span>.
        </p>
        <div className="mt-5"><KChart rows={d.kChart} /></div>
        <p className="mt-2 text-xs text-muted">
          Root mean squared error of rest-of-season win%, weighted by games left. Every forecast is scored on seasons its fit never saw (each season is
          predicted from a fit on the other {d.lastSeason - d.firstSeason}). &ldquo;Regressed&rdquo; = a straight-line fit from the measure after k games to win% the rest of the way.
        </p>
      </section>

      <section aria-labelledby="luck">
        <h2 id="luck" className="font-display text-3xl font-black uppercase tracking-wide">2. Luck doesn&apos;t carry over</h2>
        <p className="mt-2 max-w-3xl text-ink-2">
          Call the gap between a team&apos;s record and its Pythagorean record (the win% its points scored and allowed predict) its luck. Most of it
          is how close games broke. Teams that were lucky in their first eight games were no luckier than anyone else after: the correlation between
          luck in the first eight and luck in the rest is <b className="num text-ink">r = {d.luck.r.toFixed(2)}</b> (95% CI{" "}
          <span className="num">{d.luck.ci[0].toFixed(2)}</span> to <span className="num">{d.luck.ci[1].toFixed(2)}</span>, {d.luck.n} team-seasons).
          That&apos;s why the record regresses more than point differential does.
        </p>
        <div className="mt-5"><LuckScatter points={d.luck.points} r={d.luck.r} slope={d.luck.slope} /></div>
        <p className="mt-2 text-xs text-muted">Pythagorean win% = PF^2.37 / (PF^2.37 + PA^2.37). Luck in win% points: +10 = a record 10 points better than the scoring predicts.</p>
      </section>

      <section aria-labelledby="edge">
        <h2 id="edge" className="font-display text-3xl font-black uppercase tracking-wide">3. Point differential beats the record, by a little</h2>
        <p className="mt-2 max-w-3xl text-ink-2">
          After {d.k} games the regressed record&apos;s error is <span className="num">{f3(e.record)}</span> and point differential&apos;s is{" "}
          <span className="num">{f3(e.pointDiff)}</span>, about {pct(lessErr)} lower. Resampling whole seasons, the gap is{" "}
          <span className="num">{signed(e.pointDiff - e.record, 4)}</span> with a 95% interval of <span className="num">{ci(e.loso, 4)}</span>: small, but on the right side of zero
          at every cutoff from 4 to 10 games. In real time, fitting only on seasons that had already happened, the edge is about the same size
          (<span className="num">{signed(e.forwardPointDiff - e.forwardRecord, 4)}</span>) but its interval, <span className="num">{ci(e.forward, 4)}</span>, just crosses zero.
          With fewer past seasons to learn from, it&apos;s not a sure thing.
        </p>
        <div className="mt-5"><EdgeChart rows={d.edge.byK} /></div>
        <div className="mt-4 grid gap-3 text-sm text-ink-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-panel/70 p-4">
            <b className="text-ink">The betting market does better than both.</b> Team ratings read off each season&apos;s point spreads forecast the rest of the season with
            error <span className="num">{f3(e.market)}</span> after {d.k} games (point diff minus market: {ci([-e.marketVsPointDiff[1], -e.marketVsPointDiff[0]], 4)}).
            Point differential is the best of the on-field numbers we tried, not the best forecast there is.
          </div>
          <div className="rounded-2xl border border-line bg-panel/70 p-4">
            <b className="text-ink">Schedule strength: no reliable gain.</b> Adding how good the remaining opponents are changes the error by{" "}
            <span className="num">{signed(d.sos.k8.diff, 4)}</span> after {d.k} games, 95% interval <span className="num">{ci(d.sos.k8.diff_ci, 4)}</span>, which includes zero.
            We decided before checking that this cutoff would settle it. (After 7 games the interval is <span className="num">{ci(d.sos.k7.diff_ci, 4)}</span>.)
            So the 2026 forecast doesn&apos;t use it.
          </div>
        </div>
      </section>

      <section aria-labelledby="calls">
        <h2 id="calls" className="font-display text-3xl font-black uppercase tracking-wide">4. The 2026 test</h2>
        <div className="mt-3"><Badge iso={d.vs.generated_at} file={VS_BASELINE_FILE} /></div>
        {g?.vs_baseline && (
          <div className={`mt-4 rounded-2xl border p-4 text-sm ${d.grades?.final ? "border-green/50 bg-green/5" : "border-orange/50 bg-orange/5"}`}>
            <b className="text-ink">{d.grades?.final ? `Graded ${stamp(d.grades.graded_at)}.` : `Not final: ${d.grades?.status}.`}</b>{" "}
            <span className="text-ink-2">
              Error in rest-of-season wins per team: baseline <span className="num">{g.vs_baseline.rule_1_mae.baseline.toFixed(2)}</span>, point differential{" "}
              <span className="num">{g.vs_baseline.rule_1_mae.point_diff.toFixed(2)}</span>, market <span className="num">{g.vs_baseline.rule_1_mae.market.toFixed(2)}</span>.
              Highlighted calls: <span className="num">{g.vs_baseline.rule_2_highlighted.hits} of {g.vs_baseline.rule_2_highlighted.of}</span> (expected{" "}
              <span className="num">{g.vs_baseline.rule_2_highlighted.expected.toFixed(1)}</span>, chance 5). <a href={`${JSON_BASE}/${GRADES_FILE}`} className="text-los hover:underline">{GRADES_FILE}</a>
            </span>
          </div>
        )}
        <p className="mt-4 max-w-3xl text-ink-2">
          Saying a 6-1 team will cool off is nearly free: it only has to win less than 86% of the rest of its games, and regression does that for it.
          The real claim is narrower. Pull both the record and point differential toward .500 by the same held-out fit, and where they disagree,
          point differential should be right more often. For every team we wrote down three forecasts of its remaining wins (regressed record as the
          baseline, point differential, and the betting market) and the chance it beats the baseline. These are the ten teams where point differential
          and the record disagree most.
        </p>
        <div className="mt-5 grid gap-4">
          <CallTable rows={d.up} dir="up" hits={hits} />
          <CallTable rows={d.down} dir="down" hits={hits} />
        </div>
        <p className="mt-3 max-w-3xl text-sm text-ink-2">
          Is 6 or 7 out of 10 good? Run the same rule on every season from {d.firstSeason} to {d.lastSeason} (five biggest disagreements each way, forecasts fit
          without that season) and point differential&apos;s side won <b className="num text-ink">{pct(d.highlightRule.hitRate)}</b> of {d.highlightRule.calls} calls
          (95% CI <span className="num">{pct(d.highlightRule.ci[0])}</span> to <span className="num">{pct(d.highlightRule.ci[1])}</span>). Ten calls is a small sample:
          a season at 5 of 10 wouldn&apos;t refute this, and 8 of 10 wouldn&apos;t prove it.
        </p>

        <details className="mt-4 rounded-2xl border border-line bg-panel/70">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">All 32 teams</summary>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-y border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2 font-semibold">Team</th>
                  <th className="px-3 py-2 text-right font-semibold">Record</th>
                  <th className="px-3 py-2 text-right font-semibold">Left</th>
                  <th className="px-3 py-2 text-right font-semibold">Baseline</th>
                  <th className="px-3 py-2 text-right font-semibold">Point diff</th>
                  <th className="px-3 py-2 text-right font-semibold">Market</th>
                  <th className="px-3 py-2 text-right font-semibold">Gap</th>
                  <th className="px-4 py-2 text-right font-semibold">P(beats)</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.team} className={`border-b border-line/60 last:border-0 ${highlighted.has(t.team) ? "text-ink" : "text-ink-2"}`}>
                    <td className="px-4 py-1.5 font-semibold">{t.team}{highlighted.has(t.team) ? " ●" : ""}</td>
                    <td className="px-3 py-1.5 text-right">{record(t.wins, t.losses)}</td>
                    <td className="px-3 py-1.5 text-right">{t.remaining_games}</td>
                    <td className="px-3 py-1.5 text-right">{w1(t.baseline_rest_wins)}</td>
                    <td className="px-3 py-1.5 text-right">{w1(t.point_diff_rest_wins)}</td>
                    <td className="px-3 py-1.5 text-right">{w1(t.market_rest_wins)}</td>
                    <td className="px-3 py-1.5 text-right">{signed(t.gap_wins)}</td>
                    <td className="px-4 py-1.5 text-right">{pct(t.p_beats_baseline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-muted">● = one of the ten highlighted calls. Gap = point diff minus baseline, in wins over the remaining games. Forecasts are wins over the remaining games.</p>
        </details>

        <div className="mt-4 rounded-2xl border border-line bg-night-2/80 p-4 text-sm text-ink-2">
          <b className="text-ink">How it gets graded.</b> After week 18 the weekly pipeline scores both files by their own written rules and posts the results here.
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
            <li>Average miss in rest-of-season wins over all 32 teams, for the baseline, point differential and the market. Point differential passes if it misses by less than the baseline.</li>
            <li>Hit rate on the ten teams above: a &ldquo;beats&rdquo; team hits if it wins more than its baseline forecast, a &ldquo;falls short&rdquo; team if it wins fewer.</li>
          </ol>
          <p className="mt-2 text-xs text-muted">
            Only games that hadn&apos;t kicked off when the file was written count. The file also stores the code&apos;s hash, the commit it was built on and every per-game market probability.
          </p>
        </div>

        <h3 className="mt-8 font-display text-2xl font-black uppercase tracking-wide">The first version of these calls</h3>
        <div className="mt-2"><Badge iso={d.original.generated_at} file={ORIGINAL_FILE} /></div>
        <p className="mt-3 max-w-3xl text-sm text-ink-2">
          Our first file called which teams would cool off or heat up relative to their current pace. We&apos;re keeping it, unchanged, and it gets graded too.
          But most of those calls are regression to the mean doing the work, so the high confidence they show is mostly that, not skill. The file above is the real test.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([["Most likely to cool off", cool, "p_cools_off"], ["Most likely to heat up", heat, "p_heats_up"]] as const).map(([label, rows, key]) => (
            <div key={label} className="rounded-2xl border border-line bg-panel/70 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</div>
              <ul className="num mt-2 flex flex-col gap-1 text-sm">
                {rows.map((t) => (
                  <li key={t.team} className="flex justify-between gap-2">
                    <span><b className="text-ink">{t.team}</b> <span className="text-ink-2">{record(t.wins, t.losses)} ({wpct(t.win_pct)})</span></span>
                    <span className="text-ink-2">{pct(t[key])}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="means" className="rounded-2xl border border-line bg-night-2/80 p-5 sm:p-6">
        <h2 id="means" className="font-display text-2xl font-black uppercase tracking-wide">What this does and doesn&apos;t mean</h2>
        <div className="mt-3 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-green">It does mean</div>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-ink-2">
              <li>A midseason record should be read as closer to .500 than it looks, and a hot start most of all.</li>
              <li>Winning close games is not a skill that shows up again later in the same season.</li>
              <li>Given only on-field results, point differential is the better half-season guide to a team.</li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-orange">It doesn&apos;t mean</div>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-ink-2">
              <li>That the edge is big. It&apos;s about {pct(lessErr)} less error, and in real time its interval touches zero.</li>
              <li>That point differential beats the betting market. It doesn&apos;t.</li>
              <li>That any one team will follow its forecast. A season of 9 or 10 games is a small sample, which is most of the error.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="text-xs text-muted">
        Data: nflverse schedules, scores and closing lines, {d.firstSeason}-2026. Code: <code>analysis/findings/luck_skill.py</code>, <code>luck_baseline.py</code>,{" "}
        <code>luck_sos.py</code>, <code>luck_grade.py</code>.{" "}
        <Link href="/findings" className="text-los hover:underline">All findings</Link>
      </footer>
    </main>
  );
}
