import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Buckets } from "@/components/coaches/Buckets";
import { Calls } from "@/components/coaches/Calls";
import { TrendChart, type TrendPoint } from "@/components/coaches/TrendChart";
import { TeamChip } from "@/components/TeamChip";
import { coachesIndex, loadCoach } from "@/lib/coaches/data";
import { rates } from "@/lib/coaches/stats";
import type { CoachPage, CoachesIndex } from "@/lib/coaches/types";
import { colorVsLeague } from "@/lib/games/chart";

export function generateStaticParams() {
  return (coachesIndex()?.coaches ?? []).map((c) => ({ slug: c.slug }));
}

const span = (t: { from: number; to: number }) => (t.from === t.to ? String(t.from) : `${t.from}-${String(t.to).slice(2)}`);

function coachSummary(p: CoachPage): string {
  const r = rates(p.career);
  return `${p.career.wins_lost.toFixed(2)} wins lost on ${p.career.decisions} graded 4th downs (${r.per100.toFixed(2)} per 100 calls)` +
    (r.aggressiveness !== null ? `, went for it on ${Math.round(r.aggressiveness * 100)}% of clear-go spots.` : ".");
}

export async function generateMetadata({ params }: PageProps<"/coaches/[slug]">): Promise<Metadata> {
  const p = loadCoach((await params).slug);
  if (!p) return {};
  const title = `${p.coach} on 4th down`;
  const description = `${p.coach} (${p.teams.map((t) => `${t.team} ${span(t)}`).join(", ")}): ${coachSummary(p)}`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default function CoachRoute({ params }: PageProps<"/coaches/[slug]">) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Coach params={params} />
    </Suspense>
  );
}

function trend(p: CoachPage, idx: CoachesIndex, metric: "per100" | "aggr"): TrendPoint[] {
  const first = p.seasons[0].season, last = p.seasons.at(-1)!.season;
  return idx.league.filter((l) => l.season >= first && l.season <= last).map((l) => {
    const mine = p.seasons.find((s) => s.season === l.season);
    const lr = rates(l);
    const mr = mine ? rates(mine) : null;
    return metric === "per100"
      ? { season: l.season, coach: mr?.per100 ?? null, coachN: mine?.decisions ?? 0, league: lr.per100, thin: !!mine && mine.decisions < idx.min_decisions.season }
      : { season: l.season, coach: mr?.aggressiveness ?? null, coachN: mine?.clear_spots ?? 0, league: lr.aggressiveness ?? 0, thin: !!mine && mine.clear_spots < 20 };
  });
}

async function Coach({ params }: Pick<PageProps<"/coaches/[slug]">, "params">) {
  const p = loadCoach((await params).slug);
  const idx = coachesIndex();
  if (!p || !idx) notFound();
  const latest = p.seasons.at(-1)!.teams.at(-1)!;
  const colors = colorVsLeague(idx.teams[latest]);
  const career = rates(p.career);
  const oos = rates(p.out_of_sample);
  const leagueOos = rates(idx.league.filter((l) => l.season >= idx.out_of_sample_from).reduce((a, l) => {
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] += l[k];
    return a;
  }, { decisions: 0, go: 0, clear_spots: 0, clear_go: 0, agreed: 0, wins_lost: 0, wins_lost_kicking: 0 }));
  const last = p.coach.split(" ").at(-1)!;
  const anyInSample = p.seasons[0].season < idx.out_of_sample_from;

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">Head coach · 4th downs since {idx.seasons[0]}</div>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">{p.coach}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          {p.teams.map((t) => (
            <span key={t.team} className="flex items-center gap-1.5"><TeamChip abbr={t.team} team={idx.teams[t.team]} /> {span(t)}</span>
          ))}
        </div>
      </header>

      <dl className="rise grid grid-cols-2 gap-3 [animation-delay:60ms] sm:grid-cols-4">
        {[
          [p.career.wins_lost.toFixed(2), `wins lost on ${p.career.decisions} graded calls`],
          [career.per100.toFixed(2), "wins lost per 100 calls"],
          [p.out_of_sample.decisions ? oos.per100.toFixed(2) : "—", `per 100, ${idx.out_of_sample_from}+ only (n=${p.out_of_sample.decisions}; league ${leagueOos.per100.toFixed(2)})`],
          [career.aggressiveness === null ? "—" : `${Math.round(career.aggressiveness * 100)}%`, `go rate on ${p.career.clear_spots} clear-go spots`],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-line bg-night-2/70 px-4 py-3">
            <dt className="sr-only">{l}</dt>
            <dd className="font-display text-4xl font-black leading-none">{v}</dd>
            <dd className="mt-1 text-xs text-ink-2">{l}</dd>
          </div>
        ))}
      </dl>

      <div className="rise grid gap-5 [animation-delay:120ms] lg:grid-cols-2">
        <TrendChart title="Wins lost per 100 calls" sub="Lower is better. Per 100 graded 4th downs, so seasons of different lengths compare."
          points={trend(p, idx, "per100")} format="dec2" nLabel="calls" colors={colors} coachLabel={p.coach}
          outOfSampleFrom={idx.out_of_sample_from} />
        <TrendChart title="Aggressiveness" sub="Go rate on clear-go spots (going worth 1+ WP point more)."
          points={trend(p, idx, "aggr")} format="pct" nLabel="clear-go spots" colors={colors}
          coachLabel={p.coach} outOfSampleFrom={idx.out_of_sample_from} />
      </div>
      {anyInSample && (
        <p className="-mt-2 text-xs text-muted">
          Shaded seasons are in-sample: the WP model was trained on 2006-2022. Hollow dots = under {idx.min_decisions.season} calls
          (or under 20 clear-go spots) that season.
        </p>
      )}

      <div className="rise grid gap-5 [animation-delay:180ms] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">Go rate by distance</h2>
          <p className="mt-1 text-sm text-ink-2">Every graded 4th down by yards to go, all field positions.</p>
          <div className="mt-3"><Buckets buckets={p.buckets} colors={colors} coachLabel={last} min={idx.min_decisions.bucket} /></div>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">Season by season</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                <tr><th className="py-1.5 font-semibold">Season</th><th className="text-right font-semibold">Calls</th><th className="text-right font-semibold">Wins lost</th><th className="text-right font-semibold">Per 100</th><th className="text-right font-semibold">Aggr.</th></tr>
              </thead>
              <tbody>
                {[...p.seasons].reverse().map((s) => {
                  const r = rates(s);
                  return (
                    <tr key={s.season} className="border-t border-line">
                      <td className="py-1.5">{s.season} <span className="text-xs text-muted">{s.teams.join("/")}{s.season < idx.out_of_sample_from ? " · in-sample" : ""}</span></td>
                      <td className={`num text-right ${s.decisions < idx.min_decisions.season ? "text-muted" : "text-ink-2"}`}>{s.decisions}</td>
                      <td className="num text-right font-semibold">{s.wins_lost.toFixed(2)}</td>
                      <td className="num text-right">{r.per100.toFixed(2)}</td>
                      <td className="num text-right">{r.aggressiveness === null ? "—" : `${Math.round(r.aggressiveness * 100)}%`} <span className="text-[10px] text-muted">/{s.clear_spots}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="rise grid gap-5 [animation-delay:240ms] lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">Worst 5 calls</h2>
          <p className="mt-1 text-sm text-ink-2">Most win probability lost vs the model&apos;s best option.</p>
          <div className="mt-2"><Calls calls={p.worst} kind="worst" outOfSampleFrom={idx.out_of_sample_from} /></div>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">Best 5 calls</h2>
          <p className="mt-1 text-sm text-ink-2">Calls the model agreed with that beat what coaches usually do in that spot by the most.</p>
          <div className="mt-2"><Calls calls={p.best} kind="best" outOfSampleFrom={idx.out_of_sample_from} /></div>
        </section>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm font-semibold">
        <Link href="/coaches" className="rounded-lg border border-line px-3 py-2 text-ink-2 hover:text-ink">← All coaches</Link>
      </nav>
      <footer className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Regular season and playoffs, regulation only; the final 30 seconds of each half aren&apos;t graded. Fakes count as go.
        &quot;What coaches usually do&quot; comes from a go-rate model fit on 2018-{idx.seasons.at(-1)! - 1} decisions.{" "}
        <Link href="/methodology" className="underline">Methodology</Link>.
      </footer>
    </main>
  );
}
