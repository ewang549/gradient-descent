import type { Metadata } from "next";
import Link from "next/link";
import { DriftPanels } from "@/components/findings/DriftPanels";
import { StyleMap } from "@/components/findings/StyleMap";
import { fmt, fmtP, fmtSpread, loadOffenseStyle } from "@/lib/findings/offenseStyle";
import { FINDINGS } from "@/lib/findings/registry";

const d = loadOffenseStyle();
const entry = FINDINGS.find((f) => f.slug === "offense-style")!;
const title = entry.title;
const description = d
  ? `${d.teamSeasons} NFL team-seasons, ${d.firstSeason}-${d.lastSeason}. Shotgun went from ${fmt(d.drift[0].from.mean, "pct")} to ${fmt(d.drift[0].to.mean, "pct")} of snaps. ` +
    "But compared within each season, offenses aren't types: they sit on two dials, pass-first and tempo."
  : entry.dek;

export const metadata: Metadata = {
  title: { absolute: `${title} | Finding ${entry.number}` },
  description,
  openGraph: { title, description, type: "article", images: [{ url: entry.image, width: 1200, height: 675 }] },
  twitter: { card: "summary_large_image", title, description, images: [entry.image] },
};

const pctInt = (v: number) => `${Math.round(v * 100)}%`;

export default function OffenseStylePage() {
  if (!d) return <main className="mx-auto max-w-6xl px-6 py-16 text-ink-2">No export yet. Run `python -m analysis.findings.offense_style`.</main>;
  const [shotgun, go, adot] = d.drift;
  const rb = d.robustness;
  const seasons = Array.from({ length: d.lastSeason - d.firstSeason + 1 }, (_, i) => d.firstSeason + i);
  const converged = d.spreadTable.filter((s) => s.spread.significant);
  const notConverged = d.spreadTable.filter((s) => !s.spread.significant);
  const k2 = rb.clusters.find((c) => c.k === 2)!;
  const loadings = [...d.map.loadings];

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">
          <Link href="/findings" className="hover:text-ink">Finding {entry.number}</Link> · Offense style · {d.firstSeason}-{d.lastSeason}
        </div>
        <h1 className="mt-1 font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">
          The NFL changed together. <span className="text-ink-2">Teams didn&apos;t.</span>
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-ink-2">
          Since {d.firstSeason}, the whole league moved to the shotgun, got more aggressive on 4th down and started
          throwing shorter. But line each team up against its own season and the differences between offenses look about
          the same as they always have. And they don&apos;t come in types. They sit on two dials: how pass-first a team is,
          and how fast it plays.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { v: `${fmt(shotgun.from.mean, "pct")} → ${fmt(shotgun.to.mean, "pct")}`, l: `snaps from shotgun, ${shotgun.from.season} → ${shotgun.to.season}` },
            { v: `${fmt(go.from.mean, "pct")} → ${fmt(go.to.mean, "pct")}`, l: "go rate when our model says go for it" },
            { v: `${adot.from.mean.toFixed(1)} → ${adot.to.mean.toFixed(1)}`, l: "average air yards per pass" },
            { v: pctInt(d.eraShareAll), l: "of all style variation is just the season" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-line bg-panel/70 p-4">
              <dd className="num font-display text-3xl font-black leading-none sm:text-4xl">{s.v}</dd>
              <dt className="mt-1.5 text-xs text-ink-2">{s.l}</dt>
            </div>
          ))}
        </dl>
        <p className="num mt-3 text-xs text-muted">
          {d.teamSeasons} team-seasons, {d.firstSeason}-{d.lastSeason} regular seasons ({d.lastSeason} to date: {d.partialSeasonTeams} teams with enough snaps).
          Median {d.medianNeutralPlays} neutral snaps and {d.medianGoSpots} model-says-go 4th downs per complete team-season.
        </p>
      </header>

      <section aria-labelledby="drift">
        <h2 id="drift" className="font-display text-3xl font-black uppercase tracking-wide">1. The league moved as one</h2>
        <p className="mt-2 max-w-3xl text-ink-2">
          Line = league average. Shaded band = how far apart teams were that season (one standard deviation either side,
          after removing the part that&apos;s just sampling noise). The band moves with the line: teams shifted together.
          The season alone accounts for {pctInt(shotgun.eraShare)} of the variation in shotgun rate and {pctInt(go.eraShare)} in
          4th-down aggressiveness, against {pctInt(d.eraShareAll)} across all seven style measures.
        </p>
        <div className="mt-5">
          <DriftPanels partialSeason={d.lastSeason} panels={d.drift.map((s) => ({
            key: s.info.key, title: s.info.short, unit: s.info.unit, points: s.points, from: s.from, to: s.to, eraShare: s.eraShare, spread: s.spread,
          }))} />
        </div>
        <p className="mt-3 text-xs text-muted">
          Dashed segment and hollow dot: {d.lastSeason} to date. 4th-down go rate has only ~{d.medianGoSpots} chances per team a season,
          so most of its raw spread is noise; where noise explains all of it, the band collapses to the line.
        </p>
      </section>

      <section aria-labelledby="converge">
        <h2 id="converge" className="font-display text-3xl font-black uppercase tracking-wide">2. Did teams get more alike? Mostly no.</h2>
        <p className="mt-2 max-w-3xl text-ink-2">
          {converged.length === 1
            ? <>Only one of the seven measures shows a statistically significant drop in the spread between teams: <b className="text-ink">{converged[0].info.label.toLowerCase()}</b>.</>
            : <>{converged.length} of seven measures show a significant drop in the spread between teams.</>}{" "}
          For {notConverged.map((s) => s.info.short.toLowerCase()).join(", ")}, the spread didn&apos;t change significantly. Combined
          across all seven, the spread index went from {d.dispersion.first5.toFixed(2)} to {d.dispersion.last5.toFixed(2)} ({fmtP(d.dispersion.p)}).
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-panel/70">
          <table className="num w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Spread between teams by measure, first five vs last five complete seasons</caption>
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">Measure</th>
                <th className="px-3 py-2.5 text-right font-semibold">Spread {d.firstSeason}-{String(d.firstSeason + 4).slice(2)}</th>
                <th className="px-3 py-2.5 text-right font-semibold">Spread {d.lastComplete - 4}-{String(d.lastComplete).slice(2)}</th>
                <th className="px-3 py-2.5 text-right font-semibold">Trend test</th>
                <th className="px-4 py-2.5 font-semibold">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {d.spreadTable.map((s) => (
                <tr key={s.info.key} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5"><div className="font-semibold text-ink">{s.info.label}</div><div className="text-xs text-muted">{s.info.def}</div></td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{fmtSpread(s.spread.first5, s.info.unit)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtSpread(s.spread.last5, s.info.unit)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{fmtP(s.spread.p)}</td>
                  <td className={`px-4 py-2.5 font-semibold ${s.spread.significant ? "text-green" : "text-ink-2"}`}>
                    {s.spread.significant ? (s.spread.last5 < s.spread.first5 ? "Teams more alike" : "Teams more different") : "No significant change"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Spread = between-team standard deviation with sampling noise removed (game-clustered). Trend test = linear trend in that spread over
          {" "}{d.firstSeason}-{d.lastComplete}. {d.lastSeason} is excluded because it&apos;s half a season.
        </p>
      </section>

      <section aria-labelledby="map">
        <h2 id="map" className="font-display text-3xl font-black uppercase tracking-wide">3. No types. Two dials.</h2>
        <p className="mt-2 max-w-3xl text-ink-2">
          Take the era out by comparing every offense only with its own season, then look for the main ways offenses differ.
          Two hold up. <b className="text-ink">Pass-first</b> ({pctInt(d.map.explained[0])} of the era-adjusted variation) is mostly pass rate over
          expected and early-down pass rate, with some shotgun. <b className="text-ink">Tempo</b> ({pctInt(d.map.explained[1])}) is no-huddle rate and
          seconds between snaps. Offenses fill the map smoothly, without separate islands.
        </p>
        <div className="mt-5 rounded-2xl border border-line bg-panel/70 p-3 sm:p-5">
          <StyleMap teams={d.map.teams} points={d.map.points} league={d.map.league} seasons={seasons} partialSeason={d.lastSeason} labeled={d.map.labeled} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["pc1", "pc2"] as const).map((pc) => (
            <figure key={pc} className="rounded-2xl border border-line bg-panel/70 p-4">
              <figcaption className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                What moves the <span className="text-ink">{pc === "pc1" ? "pass-first" : "tempo"}</span> dial
              </figcaption>
              <ul className="mt-3 flex flex-col gap-1.5">
                {[...loadings].sort((a, b) => Math.abs(b[pc]) - Math.abs(a[pc])).map((l) => (
                  <li key={l.key} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                    <span className="truncate text-ink-2">{l.label}</span>
                    <span className="relative h-2.5 rounded-sm bg-night-2">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                      <span className="absolute inset-y-0 rounded-sm" style={{
                        background: Math.abs(l[pc]) >= 0.2 ? "#4c8dff" : "#3a4663",
                        left: l[pc] >= 0 ? "50%" : `${50 + l[pc] * 50}%`, width: `${Math.abs(l[pc]) * 50}%`,
                      }} />
                    </span>
                    <span className="num text-right text-ink-2">{l[pc] >= 0 ? "+" : "−"}{Math.abs(l[pc]).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">
                {pc === "pc1" ? "Loadings. Positive = more of it on the pass-first end." : "Loadings. Pace is seconds between snaps, so negative = faster."}
              </p>
            </figure>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-orange/40 bg-orange/5 p-4 text-sm text-ink-2">
          <b className="text-ink">The tempo outliers.</b> {d.map.noHuddleCount} team-seasons ran no-huddle at least 2 SD more than their season&apos;s
          average. They&apos;re the clearest departures from the pack on the map: Washington in 2024 and 2025 (no-huddle on{" "}
          {pctInt(d.callouts.find((c) => c.season === 2024 && c.team === "WAS")?.noHuddle ?? 0)} and {pctInt(d.callouts.find((c) => c.season === 2025 && c.team === "WAS")?.noHuddle ?? 0)} of neutral snaps),
          Philadelphia 2013-15, San Francisco 2016 and Indianapolis 2010. Even they connect to the rest of the map rather than forming a separate group.
        </div>
      </section>

      <section aria-labelledby="checks">
        <h2 id="checks" className="font-display text-3xl font-black uppercase tracking-wide">How we checked</h2>
        <ul className="mt-3 grid gap-3 text-sm text-ink-2 sm:grid-cols-2">
          <li className="rounded-2xl border border-line bg-panel/70 p-4">
            <b className="text-ink">The dials are stable.</b> Refit on 200 bootstrap resamples of team-seasons, the dials match the original
            (Tucker congruence, 1 = identical) at a median of <span className="num">{rb.pc1Boot.median.toFixed(3)}</span> for pass-first and{" "}
            <span className="num">{rb.pc2Boot.median.toFixed(3)}</span> for tempo (5th percentile <span className="num">{rb.pc1Boot.p05.toFixed(2)}</span> and{" "}
            <span className="num">{rb.pc2Boot.p05.toFixed(2)}</span>).
          </li>
          <li className="rounded-2xl border border-line bg-panel/70 p-4">
            <b className="text-ink">Same dials in both halves.</b> Fit separately on {rb.eraFits.map((e) => `${e.label} (${e.pc1.toFixed(3)} / ${e.pc2.toFixed(3)})`).join(" and ")},
            congruence with the full fit stays above 0.95 for both dials.
          </li>
          <li className="rounded-2xl border border-line bg-panel/70 p-4">
            <b className="text-ink">No real types.</b> We clustered the era-adjusted profiles for k = 2 to 8 and compared with two featureless nulls.
            Only k = {rb.passingK.join(", ")} beat both, and barely (silhouette <span className="num">{k2.silhouette.toFixed(3)}</span> vs{" "}
            <span className="num">{k2.nullP95.toFixed(3)}</span> for the null&apos;s 95th percentile). That split mostly cuts the pass-first dial in half
            (agreement with a simple above/below-zero split: ARI <span className="num">{rb.k2VsPc1Ari.toFixed(2)}</span>)
            {rb.pc1OnePeak ? ", and the pass-first dial has a single peak" : ""}. So we don&apos;t present clusters.
          </li>
          <li className="rounded-2xl border border-line bg-panel/70 p-4">
            <b className="text-ink">Style is sticky, not fixed.</b> A franchise&apos;s position on each dial correlates with its position the next season at
            r = <span className="num">{rb.persistence.pc1.toFixed(2)}</span> (pass-first) and <span className="num">{rb.persistence.pc2.toFixed(2)}</span> (tempo),
            over {rb.persistence.pairs} consecutive-season pairs. Teams keep a lean but move around from year to year.
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted">
          Measures are on neutral snaps: downs 1-3, win probability between 20% and 80%, outside the last two minutes of a half, regular season.
          A third, weaker component exists but mixes unrelated measures, so we don&apos;t interpret it.
          Code: <code>analysis/findings/offense_style.py</code>.
        </p>
      </section>

      <section aria-labelledby="means" className="rounded-2xl border border-line bg-night-2/80 p-5 sm:p-6">
        <h2 id="means" className="font-display text-2xl font-black uppercase tracking-wide">What this does and doesn&apos;t mean</h2>
        <div className="mt-3 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-green">It does mean</div>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-ink-2">
              <li>Most of the change in how NFL offenses look since {d.firstSeason} happened to the whole league at once.</li>
              <li>Labels like &ldquo;a spread team&rdquo; describe a position on a dial, not a separate kind of offense.</li>
              <li>Teams are about as different from each other now as they were in {d.firstSeason}, except on early-down pass rate, where they&apos;ve moved closer.</li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-orange">It doesn&apos;t mean</div>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-ink-2">
              <li>That style doesn&apos;t matter. Pass-first teams do have better passing EPA (r = {rb.pc1EpaDropbackR.toFixed(2)}), but good quarterbacks make teams pass more, so that&apos;s not proof that passing more causes it.</li>
              <li>That there are no schemes. Play-calling details like route concepts and protections aren&apos;t in play-by-play data.</li>
              <li>That spreads which didn&apos;t change significantly are proven constant. Twenty seasons of 32 teams can miss a small drift.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="text-xs text-muted">
        Data: nflverse play-by-play (expected pass rate, air yards, shotgun and no-huddle flags) and our 4th-down decision model.
        {" "}<Link href="/findings" className="text-los hover:underline">All findings</Link>
      </footer>
    </main>
  );
}
