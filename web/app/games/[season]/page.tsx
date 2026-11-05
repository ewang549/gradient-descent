import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamChip } from "@/components/TeamChip";
import { gamePath, seasonGamesPath } from "@/lib/games/chart";
import { gameSeasons, gamesIndex } from "@/lib/games/data";
import { weekLabel } from "@/lib/games/format";
import type { GameSummary, GamesIndex } from "@/lib/games/types";
import { pts } from "@/lib/weekly/format";

export function generateStaticParams() {
  return gameSeasons().map((season) => ({ season: String(season) }));
}

export async function generateMetadata({ params }: PageProps<"/games/[season]">): Promise<Metadata> {
  const { season } = await params;
  const title = `Every ${season} game, play by play`;
  const description = `Win probability charts for every ${season} NFL game, with every 4th down graded.`;
  return { title, description, openGraph: { title, description, images: ["/og/play"] } };
}

function Row({ g, season, teams }: { g: GameSummary; season: number; teams: GamesIndex["teams"] }) {
  const lost = g.wp_lost.home + g.wp_lost.away;
  return (
    <li>
      <Link href={gamePath(season, g.game_id)}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-night-2/70 px-3 py-2.5 transition hover:bg-night-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {(["away", "home"] as const).map((side, k) => {
            const team = g[side];
            const score = side === "home" ? g.home_score : g.away_score;
            const won = score > (side === "home" ? g.away_score : g.home_score);
            return (
              <span key={side} className="flex items-center gap-1.5">
                {k === 1 && <span className="text-xs text-muted">at</span>}
                <TeamChip abbr={team} team={teams[team]} />
                <span className={`num font-display text-xl font-black ${won ? "" : "text-ink-2"}`}>{score}</span>
              </span>
            );
          })}
          {g.overtime && <span className="text-[11px] font-semibold text-muted">OT</span>}
        </div>
        <div className="text-right text-xs text-ink-2">
          <div><span className="num font-semibold text-ink">{g.graded}</span> 4th downs</div>
          <div className="num text-muted">{lost > 0 ? `-${pts(lost)} WP pts` : "no WP lost"}</div>
        </div>
      </Link>
    </li>
  );
}

export default function SeasonGamesPage({ params }: PageProps<"/games/[season]">) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <SeasonGames params={params} />
    </Suspense>
  );
}

async function SeasonGames({ params }: Pick<PageProps<"/games/[season]">, "params">) {
  const season = Number((await params).season);
  const idx = gamesIndex(season);
  if (!idx) notFound();
  const weeks = [...new Set(idx.games.map((g) => g.week))].sort((a, b) => b - a); // newest first
  return (
    <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">{idx.games.length} games · win probability play by play</div>
          <h1 className="font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">{season} games</h1>
        </div>
        <nav className="flex gap-2 text-sm font-semibold" aria-label="Seasons">
          {gameSeasons().map((s) => (
            <Link key={s} href={seasonGamesPath(s)} aria-current={s === season ? "page" : undefined}
              className={`rounded-lg border px-3 py-2 ${s === season ? "border-ink-2 text-ink" : "border-line text-ink-2 hover:text-ink"}`}>{s}</Link>
          ))}
        </nav>
      </header>
      <nav className="flex flex-wrap gap-1.5 text-xs font-semibold" aria-label="Weeks">
        {weeks.map((w) => {
          const g = idx.games.find((x) => x.week === w)!;
          return <a key={w} href={`#week-${w}`} className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink">{g.game_type === "REG" ? w : g.game_type}</a>;
        })}
      </nav>
      {weeks.map((w, k) => {
        const games = idx.games.filter((g) => g.week === w);
        return (
          <details key={w} open={k === 0} className="group rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">{weekLabel(games[0])}</h2>
              <span className="text-xs text-muted">
                {games.length} game{games.length === 1 ? "" : "s"} <span className="inline-block transition group-open:rotate-180">▾</span>
              </span>
            </summary>
            <ul id={`week-${w}`} className="mt-3 grid scroll-mt-16 gap-2 sm:grid-cols-2 lg:grid-cols-3">{games.map((g) => <Row key={g.game_id} g={g} season={season} teams={idx.teams} />)}</ul>
          </details>
        );
      })}
    </main>
  );
}
