import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameChart } from "@/components/games/GameChart";
import { TeamChip } from "@/components/TeamChip";
import { fromEngineInput, toQuery } from "@/lib/calculator/state";
import { GRADE_HEX, callGrade, clockAt, seasonGamesPath, teamColors } from "@/lib/games/chart";
import { gameSeasons, gamesIndex, loadGame } from "@/lib/games/data";
import { dateLabel, finalLabel, gameTitle, weekLabel } from "@/lib/games/format";
import type { FourthDown, GameExport } from "@/lib/games/types";
import { loadWeek } from "@/lib/weekly/data";
import { OPTION_SHORT, pts, weekPath } from "@/lib/weekly/format";

export function generateStaticParams() {
  return gameSeasons().flatMap((season) =>
    (gamesIndex(season)?.games ?? []).map((g) => ({ season: String(season), game_id: g.game_id })));
}

function lostBy(g: GameExport, team: string) {
  const graded = g.fourth_downs.filter((f) => f.is_graded && f.posteam === team);
  return { n: graded.length, lost: graded.reduce((a, f) => a + (f.wp_lost ?? 0), 0) };
}

export async function generateMetadata({ params }: PageProps<"/games/[season]/[game_id]">): Promise<Metadata> {
  const { season, game_id } = await params;
  const g = loadGame(Number(season), game_id);
  if (!g) return {};
  const title = gameTitle(g);
  const graded = g.fourth_downs.filter((f) => f.is_graded);
  const worst = [...graded].sort((a, b) => (b.wp_lost ?? 0) - (a.wp_lost ?? 0))[0];
  const description = `${g.away.team} ${g.away.score}, ${g.home.team} ${g.home.score}. Win probability play by play and all ${graded.length} graded 4th downs` +
    (worst && worst.wp_lost! > 0.001 ? `; the costliest: ${worst.coach}'s ${OPTION_SHORT[worst.decision].toLowerCase()} on ${worst.situation} (-${pts(worst.wp_lost!)} WP points).` : ".");
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

const when = (fd: FourthDown) => `Q${fd.qtr} ${Number(fd.clock.split(":")[0])}:${fd.clock.split(":")[1]}`;
const toCalc = (fd: FourthDown) => `/calculator?${toQuery(fromEngineInput(fd.input, null))}`;

// the page awaits params inside Suspense so the route has a static shell for partial prefetching;
// every game is still fully prerendered (generateStaticParams above)
export default function GamePage({ params }: PageProps<"/games/[season]/[game_id]">) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: Pick<PageProps<"/games/[season]/[game_id]">, "params">) {
  const { season, game_id } = await params;
  const g = loadGame(Number(season), game_id);
  if (!g) notFound();
  const colors = teamColors(g.home, g.away);
  const sides = [g.away, g.home].map((s) => ({ s, ...lostBy(g, s.team) }));
  const hasWeekly = g.game_type === "REG" && !!loadWeek(g.season, g.week);
  const regular = g.fourth_downs.filter((f) => f.qtr <= 4);
  const ot = g.fourth_downs.length - regular.length;

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">
          {g.season} · {weekLabel(g)} · {dateLabel(g.date)}
        </div>
        <h1 className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 font-display text-5xl font-black uppercase leading-none tracking-wide sm:text-6xl">
          {[g.away, g.home].map((s, k) => (
            <span key={s.team} className="flex items-center gap-3">
              {k === 1 && <span className="text-2xl text-muted">at</span>}
              <TeamChip abbr={s.team} team={s} className="text-2xl! px-2!" />
              <span className={s.score > (k ? g.away.score : g.home.score) ? "" : "text-ink-2"}>{s.score}</span>
            </span>
          ))}
          <span className="text-xl text-muted">{finalLabel(g)}</span>
        </h1>
        {g.stadium && <div className="mt-1 text-sm text-muted">{g.stadium}</div>}
      </header>

      <dl className="rise grid grid-cols-2 gap-3 [animation-delay:60ms]">
        {sides.map(({ s, n, lost }) => (
          <div key={s.team} className="rounded-xl border border-line bg-night-2/70 px-4 py-3">
            <dt className="flex items-center gap-2 text-xs text-ink-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: s.team === g.home.team ? colors.home : colors.away }} />{s.coach}</dt>
            <dd className="mt-1 font-display text-3xl font-black leading-none">{lost > 0 ? `-${pts(lost)}` : "0.0"}<span className="ml-1 text-base text-ink-2">WP pts</span></dd>
            <dd className="mt-1 text-xs text-muted">lost on {n} graded 4th down{n === 1 ? "" : "s"}</dd>
          </div>
        ))}
      </dl>

      <section className="rise rounded-2xl border border-line bg-panel/70 p-4 sm:p-5 [animation-delay:120ms]">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">{g.home.team} win probability</h2>
        <p className="mt-1 text-sm text-ink-2">Before every snap. Dots are 4th downs (G go, P punt, F field goal); tap one for the model&apos;s numbers.</p>
        <div className="mt-3"><GameChart g={g} colors={colors} /></div>
      </section>

      <div className="rise grid gap-5 [animation-delay:180ms] lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">Every 4th down</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                <tr><th className="hidden py-1.5 font-semibold sm:table-cell">When</th><th className="py-1.5 font-semibold">Situation</th><th className="font-semibold">Call</th><th className="font-semibold">Model</th><th className="text-right font-semibold">WP lost</th></tr>
              </thead>
              <tbody>
                {regular.map((fd) => {
                  const grade = callGrade(fd);
                  return (
                    <tr key={fd.play_seq} className="border-t border-line">
                      <td className="num hidden py-2 pr-2 text-ink-2 sm:table-cell">{when(fd)}</td>
                      <td className="py-2 pr-2">
                        <Link href={toCalc(fd)} className="hover:text-los"><b>{fd.posteam}</b> {fd.situation}</Link>
                        <div className="num text-[11px] text-muted sm:hidden">{when(fd)}</div>
                      </td>
                      <td className="pr-2">{OPTION_SHORT[fd.decision]}</td>
                      <td className="pr-2 text-ink-2">{fd.recommendation ? OPTION_SHORT[fd.recommendation] : "—"}</td>
                      <td className="num text-right">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: GRADE_HEX[grade] }} />
                        {grade === "ungraded" ? "n/a" : fd.wp_lost! > 0 ? `-${pts(fd.wp_lost!)}` : "0.0"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            n/a = final 30 seconds of a half, not graded.{ot > 0 && ` ${ot} overtime 4th down${ot === 1 ? "" : "s"} not shown (overtime isn't graded).`}
          </p>
        </section>

        <section className="min-w-0 rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">Biggest swings</h2>
          <ol className="mt-2">
            {g.swings.map((s, k) => {
              const forTeam = s.delta > 0 ? g.home.team : g.away.team;
              return (
                <li key={s.play_seq} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 border-t border-line py-2.5 first:border-t-0">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] font-black text-night">{k + 1}</span>
                  <div className="min-w-0 text-sm">
                    <div className="text-xs text-ink-2">{clockAt(g.series.game_seconds_remaining[g.series.play_seq.indexOf(s.play_seq)])} · {s.posteam} ball</div>
                    <p className="mt-0.5 leading-snug">{s.play_description}</p>
                  </div>
                  <div className="num text-right">
                    <div className="font-display text-xl font-black leading-none">+{pts(Math.abs(s.delta))}</div>
                    <div className="text-[11px] text-muted">{forTeam} WP</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm font-semibold">
        <Link href={seasonGamesPath(g.season)} className="rounded-lg border border-line px-3 py-2 text-ink-2 hover:text-ink">← All {g.season} games</Link>
        {hasWeekly && <Link href={weekPath(g.season, g.week)} className="rounded-lg border border-line px-3 py-2 text-ink-2 hover:text-ink">Week {g.week} 4th-down report</Link>}
      </nav>

      <footer className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Win probability from this site&apos;s model (trained 2006-2022) before each regulation snap; the last point is the final result.
        4th downs are graded against the model&apos;s best option. Overtime and the final 30 seconds of each half aren&apos;t graded.{" "}
        <Link href="/methodology" className="underline">Methodology</Link>.
      </footer>
    </main>
  );
}
