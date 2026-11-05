"use client";
/**
 * "You Make the Call": a real 4th down, three buttons, then the reveal (model WP for every option,
 * what the coach did, what happened). The pool is a static JSON from exports/play; everything else
 * runs in the browser. Daily results and recently seen spots are remembered in localStorage.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Field } from "@/components/Field";
import { TeamChip } from "@/components/TeamChip";
import { fromEngineInput, toQuery } from "@/lib/calculator/state";
import { confidenceColor, confidenceLabel } from "@/lib/confidence";
import type { Option } from "@/lib/engine/types";
import {
  available, dailyNumber, dailyPicks, grade, headline, localDate, lostBy, modeLabel, resultQuery, roundPicks, shareText,
  tally, toResult, type Grade, type Result,
} from "@/lib/play/game";
import type { Pool, Situation } from "@/lib/play/types";
import { OPTION_LABEL, SITE_URL, clockLabel, modelPhrase, pts, scoreLabel } from "@/lib/weekly/format";
import { GradeRow } from "./GradeRow";

type Mode = Result["mode"];
interface Game { mode: Mode; date: string; picks: Situation[]; choices: Option[]; i: number; revealed: boolean }

const KEYS: Record<string, Option> = { g: "go", p: "punt", f: "field_goal" };
const SEEN_KEY = "play:seen";
const dailyKey = (date: string) => `play:daily:${date}`;

function store<T>(key: string, value?: T): T | null {
  try {
    if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // private mode / storage blocked: the game still works, it just won't remember
  }
}

// ------------------------------------------------------------------------------- text helpers

const did = (s: Situation) =>
  s.decision === "go" ? "went for it" : s.decision === "punt" ? "punted" : `kicked a ${s.fg_distance}-yard field goal`;

const OUTCOME: Record<Situation["outcome"], [string, string]> = {
  converted: ["Converted", "text-green"], stopped: ["Stopped short", "text-orange"], made: ["Good", "text-green"],
  missed: ["No good", "text-orange"], punted: ["", ""], penalty: ["Wiped out by a penalty", "text-ink-2"],
  unknown: ["", ""],
};

function finalLine(s: Situation): string {
  const [us, them] = s.posteam === s.home_team ? [s.final.home, s.final.away] : [s.final.away, s.final.home];
  if (us === them) return `Final: tied ${us}-${them}`;
  return `Final: ${s.posteam} ${us > them ? "won" : "lost"} ${Math.max(us, them)}-${Math.min(us, them)}`;
}

function spreadLine(s: Situation): string {
  if (Math.abs(s.spread) < 0.5) return "Pick'em";
  return `${s.spread > 0 ? s.posteam : s.defteam} favored by ${Math.abs(s.spread)}`;
}

const isAway = (s: Situation) => s.input.home === -1;
const calcHref = (s: Situation) => `/calculator?${toQuery(fromEngineInput(s.input, null))}`;

// ------------------------------------------------------------------------------- the component

export function Play() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [error, setError] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [dailyDone, setDailyDone] = useState<Result | null>(null);

  useEffect(() => {
    const date = localDate();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the date is only known on the client
    setToday(date);
    setDailyDone(store<Result>(dailyKey(date)));
    fetch("/data/play-pool.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setPool).catch(() => setError(true));
  }, []);

  const start = useCallback((mode: Mode) => {
    if (!pool || !today) return;
    const seen = new Set(store<string[]>(SEEN_KEY) ?? []);
    const picks = mode === "daily" ? dailyPicks(pool.situations, today) : roundPicks(pool.situations, Math.random, seen);
    setGame({ mode, date: today, picks, choices: [], i: 0, revealed: false });
    window.scrollTo({ top: 0 });
  }, [pool, today]);

  const choose = useCallback((o: Option) => {
    setGame((g) => {
      if (!g || g.revealed) return g;
      const s = g.picks[g.i];
      if (!available(s).includes(o)) return g;
      return { ...g, choices: [...g.choices, o], revealed: true };
    });
  }, []);

  const next = useCallback(() => {
    if (!game || !game.revealed) return;
    if (game.i === game.picks.length - 1) {
      // remember what was played: the daily result, and recently seen spots so the next round is fresh
      const r = toResult(tally(game.picks.map((s, k) => ({ s, pick: game.choices[k] }))), game.mode, game.date);
      if (game.mode === "daily" && !store(dailyKey(game.date))) setDailyDone(store(dailyKey(game.date), r));
      store(SEEN_KEY, [...(store<string[]>(SEEN_KEY) ?? []), ...game.picks.map((s) => s.id)].slice(-300));
    }
    setGame({ ...game, i: game.i + 1, revealed: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [game]);

  const finished = game && game.choices.length === game.picks.length && game.i >= game.picks.length;
  const result = useMemo(() => {
    if (!game || !finished) return null;
    const t = tally(game.picks.map((s, k) => ({ s, pick: game.choices[k] })));
    return toResult(t, game.mode, game.date);
  }, [game, finished]);

  // keyboard: G / P / F to choose, Enter or Space for the next spot
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!game || finished || e.metaKey || e.ctrlKey || e.altKey) return;
      const o = KEYS[e.key.toLowerCase()];
      if (o && !game.revealed) choose(o);
      else if (game.revealed && (e.key === "Enter" || e.key === " ") && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, finished, choose, next]);

  if (game && result) {
    return <End game={game} result={result} onAgain={() => start("round")} />;
  }
  if (game) {
    const s = game.picks[game.i];
    return (
      <Round key={s.id} s={s} pool={pool!} game={game} pick={game.revealed ? game.choices[game.i] : null}
        onChoose={choose} onNext={next} last={game.i === game.picks.length - 1} />
    );
  }
  return <Menu ready={!!pool && !!today} error={error} today={today} dailyDone={dailyDone} onStart={start} />;
}

// ------------------------------------------------------------------------------- menu

function Menu({ ready, error, today, dailyDone, onStart }: {
  ready: boolean; error: boolean; today: string | null; dailyDone: Result | null; onStart: (m: Mode) => void;
}) {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-14">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">Real 4th downs · 2025-2026</div>
        <h1 className="mt-1 font-display text-6xl font-black uppercase leading-[0.85] tracking-wide sm:text-8xl">
          You make<br />the call
        </h1>
        <p className="mt-4 max-w-xl text-ink-2">
          Real situations from the last two seasons. Go for it, punt or kick. Then see what the win-probability model says,
          what the coach did, and how it played out. Your score is the win probability you give up, next to what the real
          coaches gave up in the same spots.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-orange/40 bg-panel p-4 text-sm text-ink-2">
          Couldn&apos;t load the situations. Check your connection and reload.
        </div>
      )}

      <div className="rise grid gap-3 [animation-delay:80ms] sm:grid-cols-2">
        <ModeCard title={today ? `Daily #${dailyNumber(today)}` : "Daily"} sub="Same 5 calls for everyone today"
          cta={dailyDone ? "Play again (unscored)" : "Play today's 5"} disabled={!ready} onClick={() => onStart("daily")} accent>
          {dailyDone && (
            <div className="mt-3 rounded-lg bg-night-2/80 p-3 text-sm">
              <div className="font-semibold">{headline(dailyDone)}</div>
              <div className="mt-2"><GradeRow grades={dailyDone.you_grades} label="You" /></div>
              <Link href={`/play/result?${resultQuery(dailyDone)}`} className="mt-2 inline-block text-xs font-semibold text-los hover:underline">
                Your result card →
              </Link>
            </div>
          )}
        </ModeCard>
        <ModeCard title="Round of 10" sub="Clear calls, close calls and big moments, at random" cta="Play 10"
          disabled={!ready} onClick={() => onStart("round")} />
      </div>

      <p className="rise text-xs leading-relaxed text-muted [animation-delay:140ms]">
        Spots where every option is within half a point of win probability are left out. Keys: G go, P punt, F field goal,
        Enter next. The model and its limits: <Link href="/methodology" className="text-ink-2 underline">methodology</Link>.
      </p>
    </div>
  );
}

function ModeCard({ title, sub, cta, onClick, disabled, accent, children }: {
  title: string; sub: string; cta: string; onClick: () => void; disabled: boolean; accent?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col rounded-2xl border bg-panel/80 p-5 ${accent ? "border-orange/40" : "border-line"}`}>
      <div className="font-display text-3xl font-black uppercase tracking-wide">{title}</div>
      <div className="mt-1 text-sm text-ink-2">{sub}</div>
      {children}
      <div className="flex-1" />
      <button type="button" onClick={onClick} disabled={disabled}
        className={`mt-4 min-h-12 rounded-xl px-4 font-display text-xl font-extrabold uppercase tracking-wider transition disabled:opacity-50 ${
          accent ? "bg-orange text-night hover:brightness-110" : "border border-line bg-night-2 text-ink hover:border-ink-2"}`}>
        {disabled ? "Loading…" : cta}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------- one round

function Round({ s, pool, game, pick, onChoose, onNext, last }: {
  s: Situation; pool: Pool; game: Game; pick: Option | null; onChoose: (o: Option) => void; onNext: () => void; last: boolean;
}) {
  const away = isAway(s);
  // a "worst call of the week" tag would give the answer away, so it waits for the reveal
  const tag = s.label && !s.label.startsWith("Worst") ? s.label : null;
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-2">
          <span>{game.mode === "daily" ? `Daily #${dailyNumber(game.date)}` : "Round"} · {game.i + 1}/{game.picks.length}</span>
        </div>
        <Progress game={game} />
      </div>

      <section className="rise rounded-2xl border border-line bg-panel/80 p-4 sm:p-5" aria-label="The situation">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <TeamChip abbr={s.posteam} team={pool.teams[s.posteam]} />
          <span className="text-muted">{away ? "at" : "vs"}</span>
          <TeamChip abbr={s.defteam} team={pool.teams[s.defteam]} />
          <span className="text-ink-2">{s.season} · {s.week > 18 ? "Playoffs" : `Week ${s.week}`}</span>
          {tag && <span className="rounded-full border border-yellow/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-yellow">{tag}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <div className="font-display text-6xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">
              4th &amp; {s.goal_to_go ? "goal" : s.ydstogo}
            </div>
            <div className="font-display text-2xl font-extrabold uppercase tracking-wide text-ink-2">at {s.yardline_label}</div>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:text-right">
            <dt className="sr-only">Clock</dt><dd className="num font-semibold">{clockLabel(s)}</dd>
            <dt className="sr-only">Score</dt><dd className="num font-semibold">{scoreLabel(s)}</dd>
            <dt className="sr-only">Timeouts</dt><dd className="text-ink-2">{s.input.posTimeouts} timeout{s.input.posTimeouts === 1 ? "" : "s"} left</dd>
            <dt className="sr-only">Spread</dt><dd className="text-ink-2">{spreadLine(s)}</dd>
          </dl>
        </div>
        <div className="mt-4">
          <Field yardline100={s.yardline_100} ydstogo={s.ydstogo} label={s.yardline_label} />
        </div>
        <div className="mt-2 text-xs text-muted">
          {s.posteam} has the ball, driving right · win probability now <span className="num text-ink-2">{pts(s.wp_now, 0)}%</span>
        </div>
      </section>

      {pick ? <Reveal s={s} pick={pick} onNext={onNext} last={last} /> : <Choices s={s} onChoose={onChoose} />}
    </div>
  );
}

function Progress({ game }: { game: Game }) {
  return (
    <ol className="flex gap-1" aria-label="Progress">
      {game.picks.map((s, k) => {
        const done = k < game.choices.length;
        const g = done ? grade(lostBy(s, game.choices[k])) : null;
        return (
          <li key={s.id} className={`h-2 w-4 rounded-full sm:w-5 ${k === game.i && !done ? "bg-ink" : done ? GRADE_BG[g!] : "bg-line"}`} />
        );
      })}
    </ol>
  );
}

export const GRADE_BG: Record<Grade, string> = { 0: "bg-green", 1: "bg-orange", 2: "bg-red" };

function Choices({ s, onChoose }: { s: Situation; onChoose: (o: Option) => void }) {
  const sub: Record<Option, string> = {
    go: `need ${s.goal_to_go ? "a touchdown" : `${s.ydstogo} yard${s.ydstogo === 1 ? "" : "s"}`}`,
    punt: "flip the field",
    field_goal: s.fg_in_range ? `${s.fg_distance}-yard try` : `${s.fg_distance} yards: out of range`,
  };
  return (
    <div className="rise grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Your call">
      {(["go", "punt", "field_goal"] as Option[]).map((o) => {
        const ok = available(s).includes(o);
        return (
          <button key={o} type="button" disabled={!ok} onClick={() => onChoose(o)}
            className="group flex min-h-20 flex-col items-center justify-center rounded-2xl border border-line bg-night-2 px-2 py-3 transition hover:-translate-y-0.5 hover:border-ink-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:border-line">
            <span className="font-display text-3xl font-black uppercase leading-none tracking-wider sm:text-4xl">
              {o === "field_goal" ? "FG" : o === "go" ? "Go" : "Punt"}
            </span>
            <span className="mt-1 text-center text-[11px] leading-tight text-ink-2 sm:text-xs">{sub[o]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------- the reveal

function Reveal({ s, pick, onNext, last }: { s: Situation; pick: Option; onNext: () => void; last: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(f);
  }, []);
  const opts = available(s);
  const sorted = [...opts].sort((a, b) => s.wp[b] - s.wp[a]);
  const gap = (s.wp[sorted[0]] - s.wp[sorted[1]]) * 100;
  const color = confidenceColor(gap);
  const youLost = lostBy(s, pick);
  const [outcome, outcomeClass] = OUTCOME[s.outcome];
  const worst = s.label?.startsWith("Worst") ? s.label : null;

  return (
    <section className="rise flex flex-col gap-3" aria-live="polite" aria-label="The answer">
      <div className="relative overflow-hidden rounded-2xl border bg-panel/80 p-4 sm:p-5" style={{ borderColor: color.replace(")", " / 0.45)") }}>
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full blur-3xl" style={{ background: color, opacity: 0.16 }} />
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-2">
          The model says
          <span className="rounded-full px-2 py-0.5 font-display text-sm font-extrabold tracking-wider text-night" style={{ background: color }}>
            {confidenceLabel(gap)}
          </span>
        </div>
        <div className="mt-1 font-display text-5xl font-black uppercase leading-none tracking-wide" style={{ color }}>
          {OPTION_LABEL[s.recommendation]}
        </div>
        <div className="mt-2 text-sm text-ink-2">
          by <span className="num font-semibold text-ink">{gap.toFixed(1)}</span> win-probability points over {modelPhrase(sorted[1], true)}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Verdict who="You" option={pick} lost={youLost} />
          <Verdict who={s.coach} option={s.decision} lost={s.wp_lost} />
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          {(["go", "punt", "field_goal"] as Option[]).map((o, k) => (
            <Bar key={o} s={s} o={o} k={k} shown={shown} color={color} pick={pick} top={s.wp[s.recommendation]} />
          ))}
          <div className="text-[11px] text-muted">Bars start at zero and run to the best option, so small gaps stay visible.</div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-night-2/70 p-4 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-2">What happened</span>
          {worst && <span className="rounded-full bg-red/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-red">{worst}</span>}
        </div>
        <p className="mt-1.5">
          <span className="font-semibold">{s.coach} {did(s)}.</span>{" "}
          {outcome && <span className={`font-semibold ${outcomeClass}`}>{outcome}.</span>}{" "}
          <span className="text-ink-2">{finalLine(s)}.</span>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
          <Link href={calcHref(s)} className="text-los hover:underline">Open in calculator →</Link>
        </div>
      </div>

      <button type="button" onClick={onNext} autoFocus
        className="min-h-14 rounded-2xl bg-ink font-display text-2xl font-black uppercase tracking-wider text-night transition hover:brightness-95">
        {last ? "See your score" : "Next call →"}
      </button>
    </section>
  );
}

function Verdict({ who, option, lost }: { who: string; option: Option; lost: number }) {
  const g = grade(lost);
  return (
    <div className="rounded-xl bg-night-2/80 px-3 py-2">
      <div className="truncate text-xs text-ink-2">{who === "You" ? "Your call" : `${who}'s call`}</div>
      <div className="font-display text-xl font-extrabold uppercase tracking-wide">{OPTION_LABEL[option]}</div>
      <div className={`num text-xs font-semibold ${g === 0 ? "text-green" : g === 1 ? "text-orange" : "text-red"}`}>
        {g === 0 ? "Matches the model" : `-${pts(lost)} WP points`}
      </div>
    </div>
  );
}

function Bar({ s, o, k, shown, color, pick, top }: {
  s: Situation; o: Option; k: number; shown: boolean; color: string; pick: Option; top: number;
}) {
  const best = o === s.recommendation;
  const off = o === "field_goal" && !s.fg_in_range;
  const detail: Record<Option, string> = {
    go: `Converts ${pts(s.p_convert, 0)}% of the time`,
    punt: `${s.defteam} takes over around ${puntSpot(s)}`,
    field_goal: off ? `${s.fg_distance} yards: out of range` : `${s.fg_distance}-yard try, makes ${pts(s.p_fg_make, 0)}%`,
  };
  return (
    <div className={off ? "opacity-50" : ""}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`font-display text-lg font-extrabold uppercase tracking-wider ${best ? "text-ink" : "text-ink-2"}`}>{OPTION_LABEL[o]}</span>
          {o === pick && <Tag>You</Tag>}
          {o === s.decision && <Tag>Coach</Tag>}
        </div>
        <span className="num font-display text-2xl font-black leading-none" style={{ color: best ? color : undefined }}>
          {pts(s.wp[o])}<span className="text-base">%</span>
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-night">
        <div className="h-full origin-left rounded-full transition-transform duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
          style={{ transform: `scaleX(${shown ? Math.max(s.wp[o] / (top || 1), 0.01) : 0})`, transitionDelay: `${k * 120}ms`, background: best ? color : "#3a4663" }} />
      </div>
      <div className="mt-0.5 text-xs text-muted">{detail[o]}</div>
    </div>
  );
}

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full border border-ink-2/50 px-1.5 py-px text-[10px] font-bold uppercase tracking-widest text-ink-2">{children}</span>
);

function puntSpot(s: Situation): string {
  const own = Math.round(100 - s.punt_to);
  if (own === 50) return "midfield";
  return own < 50 ? `their own ${own}` : `the ${s.posteam} ${100 - own}`;
}

// ------------------------------------------------------------------------------- end screen

function End({ game, result, onAgain }: { game: Game; result: Result; onAgain: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const path = `/play/result?${resultQuery(result)}`;
  const url = `${SITE_URL}${path}`;
  const text = shareText(result, url);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return; // the share sheet was dismissed
    }
    copy(text, "Copied result");
  };
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("Couldn't copy");
    }
  };

  const diff = result.coaches - result.you;
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">You make the call · {modeLabel(result)}</div>
        <h1 className={`mt-1 font-display text-5xl font-black uppercase leading-[0.9] tracking-wide sm:text-6xl ${diff >= 0.1 ? "text-green" : diff <= -0.1 ? "text-orange" : ""}`}>
          {headline(result).replace(/^I /, "You ").replace(/ me /, " you ")}
        </h1>
        <p className="mt-3 text-lg text-ink-2">
          You lost <b className="num text-ink">{result.you.toFixed(1)}%</b> win probability. The real coaches lost{" "}
          <b className="num text-ink">{result.coaches.toFixed(1)}%</b>.
        </p>
      </header>

      <div className="rise flex flex-col gap-2 rounded-2xl border border-line bg-panel/80 p-4 [animation-delay:80ms]">
        <GradeRow grades={result.you_grades} label="You" />
        <GradeRow grades={result.coach_grades} label="Coaches" />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-green align-middle" />the model&apos;s call</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-orange align-middle" />gave up under 2 points</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red align-middle" />2 or more</span>
        </div>
      </div>

      <div className="rise grid grid-cols-2 gap-2 [animation-delay:120ms] sm:grid-cols-3">
        <button type="button" onClick={share}
          className="col-span-2 min-h-14 rounded-2xl bg-orange font-display text-2xl font-black uppercase tracking-wider text-night hover:brightness-110 sm:col-span-1">
          Share
        </button>
        <button type="button" onClick={() => copy(url, "Copied link")}
          className="min-h-14 rounded-2xl border border-line bg-night-2 font-display text-xl font-extrabold uppercase tracking-wider hover:border-ink-2">
          Copy link
        </button>
        <button type="button" onClick={onAgain}
          className="min-h-14 rounded-2xl border border-line bg-night-2 font-display text-xl font-extrabold uppercase tracking-wider hover:border-ink-2">
          Play 10 {game.mode === "round" ? "more" : ""}
        </button>
      </div>
      <div className="-mt-2 h-4 text-center text-xs text-green" aria-live="polite">{copied}</div>

      <section className="rise rounded-2xl border border-line bg-panel/70 p-4 [animation-delay:160ms]" aria-label="Your calls">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide">The calls</h2>
        <ol className="mt-2">
          {game.picks.map((s, k) => {
            const pick = game.choices[k];
            const lost = lostBy(s, pick);
            return (
              <li key={s.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line py-2.5 first:border-t-0">
                <span className={`h-3 w-3 rounded-sm ${GRADE_BG[grade(lost)]}`} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{s.posteam} {s.situation} <span className="font-normal text-muted">· {clockLabel(s)}</span></div>
                  <div className="truncate text-xs text-ink-2">
                    You: {OPTION_LABEL[pick]} · {s.coach}: {OPTION_LABEL[s.decision]} · Model: {OPTION_LABEL[s.recommendation]}
                  </div>
                </div>
                <div className="num text-right text-xs">
                  <div className={lost > 0 ? "text-orange" : "text-green"}>{lost > 0 ? `-${pts(lost)}` : "0.0"}</div>
                  <div className="text-muted">coach {s.wp_lost > 0 ? `-${pts(s.wp_lost)}` : "0.0"}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
