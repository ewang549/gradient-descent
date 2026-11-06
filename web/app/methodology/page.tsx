import type { Metadata } from "next";
import Link from "next/link";
import { loadMeta } from "@/lib/meta";

const meta = loadMeta();
const title = "How the 4th-down model works";
const description = "The models behind every grade, how they did on seasons they never saw, how they compare with nfl4th, and what they can't do.";

export const metadata: Metadata = {
  title: { absolute: `Methodology: ${title}` },
  description,
  // The default calculator card: the methodology page explains the numbers on it.
  openGraph: { title, description, images: [{ url: "/og/calculator", width: 1200, height: 675 }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og/calculator"] },
};

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-6">
      <h2 id={id} className="font-display text-3xl font-black uppercase tracking-wide">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-ink-2">{children}</div>
    </section>
  );
}

export default function Methodology() {
  const b = meta?.nfl4th_benchmark;
  const h = meta?.held_out;
  const split = meta?.models.win_probability.trained ?? { train: "2006-2022", val: 2023, test: 2024 };
  const toc = [["short", "The short version"], ["benchmark", "Checked against nfl4th"], ["models", "The models"],
    ["grading", "How a call is graded"], ["limits", "Limitations"], ["data", "Data"]];

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">Methodology</div>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-6xl">How the model <span className="text-ink-2">works</span></h1>
        <p className="mt-4 text-lg text-ink-2">
          Every grade on this site comes from the same idea: for each 4th down, estimate the team&apos;s chance of winning if it
          goes for it, punts or kicks, and compare the coach&apos;s choice with the best one. Here&apos;s how those estimates are made,
          how well they hold up, and where they fall short.
        </p>
        <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-2 text-sm">
          {toc.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-lg border border-line px-3 py-1.5 text-ink-2 transition hover:border-ink-2/50 hover:text-ink">{label}</a>
          ))}
        </nav>
      </header>

      <Section id="short" title="The short version">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li><b className="text-ink">Four models</b> trained on NFL play-by-play since 2006: win probability, the chance a 4th-down attempt converts, field-goal make probability, and where a punt leaves the opponent.</li>
          <li><b className="text-ink">A decision engine</b> combines them into a win probability for each option. Whichever is highest is the model&apos;s call.</li>
          <li><b className="text-ink">Tested on seasons the models never saw.</b> They were trained on {split.train}, tuned on {split.val} and scored on {split.test}. Grades from 2023 on are out of sample.</li>
          <li><b className="text-ink">Checked against nfl4th</b>, the public standard for 4th-down models. On clear calls, the two almost always agree.</li>
        </ul>
      </Section>

      <Section id="benchmark" title="Checked against nfl4th">
        {b ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { v: pct(b.agree_when_both_clear), l: `same call when both models see a clear call (${b.both_clear.toLocaleString("en-US")} plays, one option ahead by ${Math.round(b.threshold_wp * 100)}+ WP point)` },
                { v: pct(b.opposite_clear_share), l: "of all plays where the two are confident and disagree" },
                { v: pct(b.disagreements_with_a_close_call, 0), l: "of disagreements involve a call one model rates within 1 point" },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-line bg-panel/70 p-4">
                  <div className="num font-display text-4xl font-black leading-none text-ink">{s.v}</div>
                  <div className="mt-1.5 text-xs">{s.l}</div>
                </div>
              ))}
            </div>
            <p>
              <a href="https://www.nfl4th.com" className="text-los hover:underline">nfl4th</a>, by Ben Baldwin, is the most widely used public 4th-down
              model. We compared every regulation 4th down from {b.seasons[0]}-{b.seasons.at(-1)} ({b.plays.toLocaleString("en-US")} plays). Overall the two make the
              same call {pct(b.agree_all)} of the time, and most of the disagreements are coin flips where either answer costs almost nothing.
            </p>
            <p>
              The real difference is that this model is a bit more aggressive. It says go on {pct(b.go_rate_ours)} of 4th downs, nfl4th on {pct(b.go_rate_nfl4th)},
              and coaches went for it on {pct(b.go_rate_coaches)}. Swapping in nfl4th&apos;s pieces one at a time traced the gap to the conversion model.
              Ours gives teams slightly better odds of converting, and real 2023-25 attempts back it: our average prediction landed within 3 points
              of the actual conversion rate each season, while nfl4th&apos;s ran 2-5 points low. Both models only see attempts teams chose to try, so that can&apos;t be fully settled.
            </p>
            <p>When both models clearly say go, coaches went for it {pct(b.coaches_went_when_both_clearly_go, 0)} of the time.</p>
          </>
        ) : <p>Benchmark not exported yet.</p>}
      </Section>

      <Section id="models" title="The models">
        <p>
          Every model splits by season, never by shuffling plays: train on {split.train}, tune on {split.val}, test on {split.test}.
          A model never sees a game from a season it&apos;s graded on.
        </p>
        {h && (
          <dl className="flex flex-col gap-3">
            {[
              { name: "Win probability", what: "Chance the team with the ball wins, from score, time, field position, down and distance, timeouts and the pre-game spread. Gradient-boosted trees (XGBoost) with constraints so, say, more time never hurts the leader.",
                result: <>Brier {h.win_probability.this_model.brier.toFixed(3)} on {h.win_probability.plays.toLocaleString("en-US")} plays (lower is better). nflverse&apos;s model: {h.win_probability.nflverse_wp.brier.toFixed(3)}. Its Vegas version scored {h.win_probability.nflverse_vegas_wp.brier.toFixed(3)}, but was trained with {split.test} in it.</> },
              { name: "Conversion", what: "Chance a 4th-down attempt gets the first down, from distance, field position and both teams' recent efficiency.",
                result: <>{h.conversion.attempts} attempts: {pct(h.conversion.actual_rate)} converted, {pct(h.conversion.mean_pred)} predicted. If anything it undersold going for it.</> },
              { name: "Field goal", what: "Make probability from distance, roof, surface, wind, temperature and the league's improvement over time. Long kicks are corrected for the fact that only teams with strong kickers try them.",
                result: <>{h.field_goal.attempts.toLocaleString("en-US")} kicks: {pct(h.field_goal.actual_rate)} made, {pct(h.field_goal.mean_pred)} predicted.</> },
              { name: "Punt", what: "Where the opponent takes over after a punt from each spot.",
                result: <>{h.punt.punts.toLocaleString("en-US")} punts: off by {h.punt.mae_yards.toFixed(1)} yards on average, vs {h.punt.naive_mae_yards.toFixed(1)} for a league-average guess.</> },
            ].map((m) => (
              <div key={m.name} className="grid gap-2 rounded-2xl border border-line bg-panel/70 p-4 text-sm sm:grid-cols-[8rem_1fr_1fr] sm:gap-4">
                <dt className="font-semibold text-ink">{m.name}</dt>
                <dd>{m.what}</dd>
                <dd className="num border-t border-line pt-2 sm:border-0 sm:pt-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">On {split.test}, never seen</span>
                  <span className="text-ink">{m.result}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p>
          The win-probability model runs in your browser on the <Link href="/calculator" className="text-los hover:underline">calculator</Link>,
          and is checked against the Python version on 600 real 4th downs.
        </p>
      </Section>

      <Section id="grading" title="How a call is graded">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li><b className="text-ink">Go for it</b> = chance of converting × win probability with a fresh set of downs, plus chance of failing × win probability after a turnover on downs.</li>
          <li><b className="text-ink">Punt</b> = win probability with the opponent&apos;s ball where punts from that spot typically leave them.</li>
          <li><b className="text-ink">Field goal</b> = make chance × win probability up 3 after the kickoff, plus miss chance × win probability with the opponent&apos;s ball at the spot of the kick.</li>
          <li><b className="text-ink">WP lost</b> is the gap between the best option and the coach&apos;s choice. Add up a season&apos;s WP lost and 1.00 = one win.</li>
          <li><b className="text-ink">A clear call</b> is one where the best option is ahead by at least 1 point of win probability. Below that, either choice is defensible, and the site colors calls by how big the gap is.</li>
        </ul>
        <p>Before writing any grades, the engine has to get a set of obvious situations right (for example: go on 4th & goal at the 1, punt on 4th & 12 from your own 20, kick a field goal with 3 seconds left in the half). If it doesn&apos;t, nothing publishes.</p>
      </Section>

      <Section id="limits" title="Limitations">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li><b className="text-ink">Overtime and the last 30 seconds of each half aren&apos;t graded.</b> Different rules, and the engine&apos;s clock assumptions break down.</li>
          <li><b className="text-ink">It grades an average team in that spot.</b> It knows recent offensive and defensive efficiency, but not that your kicker is hurt or your QB is a great sneaker.</li>
          <li><b className="text-ink">Fakes count as ordinary go attempts.</b> The model can&apos;t price surprise.</li>
          <li><b className="text-ink">The game keeps changing.</b> Teams converted more often in 2024 than the model expected, so it&apos;s more likely to be too cautious than too aggressive.</li>
          <li><b className="text-ink">Grades before 2023 are in sample.</b> The models trained on those seasons. They&apos;re regularized, but the cleanest numbers are 2023 on, and pages flag older seasons.</li>
          <li><b className="text-ink">Late, tied, in field-goal range:</b> both this model and nflverse&apos;s underrate the offense in the final minute (about 80% predicted vs 95% actual, on small samples).</li>
        </ul>
      </Section>

      <Section id="data" title="Data">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li><a href="https://github.com/nflverse" className="text-los hover:underline">nflverse</a> play-by-play, schedules, rosters and team colors, 1999 to today (models use 2006 on). FTN charting data for 2022 on, via nflverse, in the findings.</li>
          <li>nfl4th&apos;s public release files for the benchmark.</li>
          <li>
            Updated every Tuesday after the week&apos;s games are final
            {meta ? `: currently through ${meta.data_through.season} week ${meta.data_through.week}` : ""}. A week only publishes if every scheduled game is in and the engine passes its checks.
          </li>
          <li>No team logos or NFL marks. Team abbreviations and colors only.</li>
        </ul>
        <p>
          The <Link href="/findings" className="text-los hover:underline">findings</Link> follow the same rules: checked on held-out seasons or shown
          with their uncertainty, sample sizes on the page, and a plain statement of what each one doesn&apos;t mean.
        </p>
      </Section>
    </main>
  );
}
