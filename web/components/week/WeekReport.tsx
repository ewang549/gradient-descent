/**
 * One week of 4th downs: the worst calls, the best calls, the gutsiest call, the leaderboard
 * snapshot and the share cards. A server component rendered at build time from exports/weekly.
 * Every call links to the calculator prefilled with that exact situation.
 */
import Image from "next/image";
import Link from "next/link";
import { TeamChip } from "@/components/TeamChip";
import { gamePath } from "@/lib/games/chart";
import type { Option } from "@/lib/engine/types";
import {
  OPTION_SHORT, calcPath, clockLabel, didPhrase, opponentLabel, pct, pts, scoreLabel, weekPath,
} from "@/lib/weekly/format";
import type { Call, CoachRow, WeekExport } from "@/lib/weekly/types";

const pad = (n: number) => String(n).padStart(2, "0");

function WPLine({ c }: { c: Call }) {
  const wp: Record<Option, number> = { go: c.wp_go, punt: c.wp_punt, field_goal: c.wp_fg };
  return (
    <span className="num text-xs text-ink-2">
      {(["go", "punt", "field_goal"] as Option[]).map((o, i) => (
        <span key={o}>
          {i > 0 && <span className="text-muted"> · </span>}
          <span className={o === c.recommendation ? "font-bold text-green" : ""}>{OPTION_SHORT[o]} {pts(wp[o])}%</span>
          {o === c.decision && <span className="text-muted"> (coach)</span>}
        </span>
      ))}
    </span>
  );
}

function CallRow({ c, i, w, stat, statLabel }: { c: Call; i: number; w: WeekExport; stat: string; statLabel: string }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
      <span className="font-display text-2xl font-black text-muted">{i + 1}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TeamChip abbr={c.posteam} team={w.teams[c.posteam]} />
          <span className="font-semibold">{c.coach}</span>
          <span className="text-ink-2">{didPhrase(c)} on {c.situation}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          <span>{clockLabel(c)} · {scoreLabel(c)} {opponentLabel(c)}</span>
          <WPLine c={c} />
        </div>
      </div>
      <div className="col-start-2 flex items-baseline gap-2 sm:col-start-3 sm:row-start-1 sm:block sm:text-right">
        <div className="font-display text-2xl font-black leading-none">{stat}</div>
        <div className="text-[11px] text-muted">{statLabel}</div>
        <span className="ml-auto flex gap-3 text-xs font-semibold sm:mt-1 sm:justify-end">
          <Link href={gamePath(w.season, c.game_id)} className="text-ink-2 hover:text-ink hover:underline">Game</Link>
          <Link href={calcPath(c)} className="text-los hover:underline">Calculator →</Link>
        </span>
      </div>
    </li>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">{title}</h2>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Board({ rows, w, title }: { rows: CoachRow[]; w: WeekExport; title: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-2">{title}</h3>
      <ol className="mt-2 flex flex-col gap-1.5">
        {rows.map((r) => {
          const team = r.team.split("/").at(-1)!;
          return (
            <li key={r.coach} className="flex items-center gap-3 rounded-lg bg-night-2/70 px-3 py-2">
              <span className="w-6 font-display text-lg font-black text-muted">{r.rank}</span>
              <TeamChip abbr={team} team={w.teams[team]} />
              <span className="min-w-0 flex-1 truncate font-semibold">{r.coach}</span>
              <span className="hidden text-xs text-muted sm:inline">{r.decisions} calls</span>
              <span className="num w-12 text-right font-display text-xl font-black">{r.wins_lost.toFixed(2)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const CARD_FILES = [
  ["worst-call.png", "Worst call"], ["top-3.png", "Top 3 worst"], ["leaderboard.png", "Leaderboard"],
  ["gutsiest.png", "Gutsiest call"],
] as const;

export function WeekReport({ w, weeks }: { w: WeekExport; weeks: number[] }) {
  const idx = weeks.indexOf(w.week);
  const prev = idx > 0 ? weeks[idx - 1] : null;
  const next = idx >= 0 && idx < weeks.length - 1 ? weeks[idx + 1] : null;
  const s = w.summary;
  const g = w.gutsiest;
  const cardDir = `/cards/${w.season}/week_${pad(w.week)}`;
  const cards = CARD_FILES.filter(([f]) => (f !== "leaderboard.png" || w.leaderboard) && (f !== "gutsiest.png" || g));

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">4th-down report · {w.season}</div>
          <h1 className="font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">
            Week {w.week} <span className="text-ink-2">on 4th down</span>
          </h1>
        </div>
        <nav className="flex gap-2 text-sm font-semibold" aria-label="Other weeks">
          {prev !== null && <Link href={weekPath(w.season, prev)} className="rounded-lg border border-line px-3 py-2 text-ink-2 hover:text-ink">← Week {prev}</Link>}
          {next !== null && <Link href={weekPath(w.season, next)} className="rounded-lg border border-line px-3 py-2 text-ink-2 hover:text-ink">Week {next} →</Link>}
        </nav>
      </header>

      <dl className="rise grid grid-cols-2 gap-3 [animation-delay:80ms] sm:grid-cols-4">
        {[
          [String(s.graded_decisions), `graded 4th downs in ${w.games.final} games`],
          [pct(s.go_rate), `went for it (model said go on ${pct(s.model_go_rate)})`],
          [pct(s.agreed_with_model), "of calls matched the model"],
          [s.wins_lost.toFixed(2), "wins given away league-wide"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-line bg-night-2/70 px-4 py-3">
            <dt className="sr-only">{l}</dt>
            <dd className="font-display text-4xl font-black leading-none">{v}</dd>
            <dd className="mt-1 text-xs text-ink-2">{l}</dd>
          </div>
        ))}
      </dl>

      <div className="rise grid gap-5 [animation-delay:140ms] lg:grid-cols-2">
        <Section title="Worst calls" sub="Win probability lost vs the model's best option, for the team with the ball.">
          <ol>{w.worst.map((c, i) => <CallRow key={c.play_uid} c={c} i={i} w={w} stat={`-${pts(c.wp_lost)}`} statLabel="WP pts lost" />)}</ol>
        </Section>
        <div className="flex flex-col gap-5">
          {g && (
            <Section title="Gutsiest correct call"
              sub={`A go the model agreed with, in a spot where only ${pct(g.expected_go_rate)} of coaches (2018-25) go for it.`}>
              <ol><CallRow c={g} i={0} w={w} stat={`+${pts(g.wp_go - Math.max(g.wp_punt, g.wp_fg))}`} statLabel="WP pts over kicking" /></ol>
            </Section>
          )}
          <Section title="Best calls"
            sub="Calls that matched the model, ranked by how much they beat what coaches usually do in that spot.">
            <ol>{w.best.slice(0, 5).map((c, i) => <CallRow key={c.play_uid} c={c} i={i} w={w} stat={`+${pts(c.value_vs_typical)}`} statLabel="vs typical call" />)}</ol>
          </Section>
        </div>
      </div>

      {w.leaderboard && (
        <div className="rise [animation-delay:200ms]">
          <Section title={`Coach leaderboard through Week ${w.leaderboard.through_week}`}
            sub={`Wins given away on 4th down this season (sum of WP lost; 1.00 = one win). ${w.leaderboard.qualified} head coaches with at least ${w.leaderboard.min_decisions} graded calls.`}>
            <div className="grid gap-5 md:grid-cols-2">
              <Board rows={w.leaderboard.top} w={w} title="Fewest wins lost" />
              <Board rows={[...w.leaderboard.bottom].reverse()} w={w} title="Most wins lost" />
            </div>
          </Section>
        </div>
      )}

      <div className="rise [animation-delay:260ms]">
        <Section title="Share cards" sub="1200×675 PNGs, sized for X. Open one to save it.">
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map(([file, label]) => (
              <a key={file} href={`${cardDir}/${file}`} className="group overflow-hidden rounded-xl border border-line">
                <Image src={`${cardDir}/${file}`} alt={`${label}, Week ${w.week}`} width={1200} height={675} unoptimized
                  className="h-auto w-full transition group-hover:opacity-90" />
              </a>
            ))}
          </div>
        </Section>
      </div>

      <footer className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Graded decisions exclude overtime and the final 30 seconds of each half. Fakes are graded as ordinary go-for-it
        attempts. Win probability model trained on nflverse play-by-play, 2006 to 2022.
      </footer>
    </div>
  );
}
