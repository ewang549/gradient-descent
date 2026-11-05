"use client";
/**
 * The calculator: state <-> URL, the field, the controls, the answer.
 *
 * State is read from the URL once (the server passes the query string, so the first HTML is the
 * real calculator rather than an empty client-only shell), then mirrored back with
 * history.replaceState on every change (a router navigation per drag frame would be wasteful), so
 * the address bar is always a link to exactly what's on screen.
 */
import { useEffect, useMemo, useState } from "react";
import presetData from "@/public/models/presets.json";
import { Controls } from "@/components/Controls";
import { Field } from "@/components/Field";
import { Results } from "@/components/Results";
import {
  fieldLabel, fmtClock, fromEngineInput, normalize, parseQuery, sameSituation, scoreLabel, toEngineInput, toQuery,
  type CalcState,
} from "@/lib/calculator/state";
import { useEngine } from "@/lib/calculator/useEngine";
import type { EngineInput } from "@/lib/engine/types";

interface Preset {
  id: string; name: string; game: string; team: string; opponent: string; clock: string; yardlineLabel: string;
  coach: "go" | "punt" | "field_goal"; input: EngineInput;
}
const PRESETS = presetData as Preset[];

const SHORT: Record<string, string> = {
  "2009_10_NE_IND_4081": "Belichick 4th & 2",
  "2009_21_NO_IND_1642": "Saints at the 1",
  "2014_20_GB_SEA_2608": "Seahawks fake FG",
  "2017_21_PHI_NE_2053": "Philly Special",
  "2017_21_PHI_NE_3735": "Eagles 4th & 1",
  "2020_20_TB_GB_3728": "LaFleur's FG",
  "2021_02_KC_BAL_3948": "Ravens ice KC",
  "2022_04_BUF_BAL_3594": "Ravens at the 2",
  "2023_21_DET_SF_2682": "Lions pass on FG",
  "2024_21_BUF_KC_3456": "Allen sneak",
};
const COACH: Record<Preset["coach"], string> = { go: "went for it", punt: "punted", field_goal: "kicked the field goal" };

export function Calculator({ query }: { query: string }) {
  const [state, setState] = useState<CalcState>(() => parseQuery(new URLSearchParams(query)));
  const s = useMemo(() => normalize(state), [state]);
  const input = useMemo(() => toEngineInput(s), [s]);
  const { result, error } = useEngine(input);

  const preset = PRESETS.find((p) => p.id === s.preset);
  const presetIntact = preset ? sameSituation(s, fromEngineInput(preset.input, preset.id)) : false;

  useEffect(() => {
    const url = `${window.location.pathname}?${toQuery({ ...s, preset: presetIntact ? s.preset : null })}`;
    window.history.replaceState(window.history.state, "", url);
  }, [s, presetIntact]);

  // a manual edit keeps the preset's game context (team strength, weather) but drops its name
  const set = (patch: Partial<CalcState>) => setState((prev) => ({ ...prev, ...patch }));
  const loadPreset = (p: Preset) => setState(fromEngineInput(p.input, p.id));
  const reset = () => setState(normalize(parseQuery(new URLSearchParams())));

  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  };

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      {/* masthead */}
      {/* no fade-in on the headline: it is the largest paint, and an element that first paints at opacity 0 never counts as LCP */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">Win probability · live</div>
          <h1 className="font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">
            4th Down <span className="text-ink-2">Calculator</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reset}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-2 transition hover:border-ink-2 hover:text-ink">
            Reset
          </button>
          <button type="button" onClick={share}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-night transition hover:bg-yellow active:scale-95">
            {copied ? "Link copied" : "Share this situation"}
          </button>
        </div>
      </header>

      {/* presets */}
      <nav aria-label="Famous 4th downs" className="rise -mx-4 overflow-x-auto px-4 [animation-delay:80ms] [mask-image:linear-gradient(to_right,black_92%,transparent)] [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 pr-10">
          {PRESETS.map((p) => {
            const active = p.id === s.preset && presetIntact;
            return (
              <button key={p.id} type="button" onClick={() => loadPreset(p)} title={`${p.name} (${p.game})`}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  active ? "border-yellow bg-yellow text-night" : "border-line bg-panel/60 text-ink-2 hover:border-ink-2 hover:text-ink"}`}>
                {SHORT[p.id] ?? p.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* scorebug + field */}
      <section className="rise overflow-hidden rounded-2xl border border-line bg-night-2 [animation-delay:140ms]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2.5 font-display text-lg font-extrabold uppercase tracking-wider sm:text-xl">
          <span className="text-yellow">{s.ydstogo >= s.yardline100 ? "4th & Goal" : `4th & ${s.ydstogo}`}</span>
          <span>{fieldLabel(s.yardline100)}</span>
          <span className="num">Q{s.qtr} {fmtClock(s.clock)}</span>
          <span className={s.scoreDiff > 0 ? "text-green" : s.scoreDiff < 0 ? "text-orange" : ""}>{scoreLabel(s.scoreDiff)}</span>
          {presetIntact && preset && (
            <span className="ml-auto font-sans text-xs font-semibold normal-case tracking-normal text-ink-2">
              {preset.game} · {preset.team} {COACH[preset.coach]}
            </span>
          )}
        </div>
        <div className="p-2 sm:p-3">
          <Field yardline100={s.yardline100} ydstogo={s.ydstogo} onChange={(yardline100) => set({ yardline100 })} />
        </div>
        <p className="px-4 pb-3 text-xs text-muted">Drag the ball. Offense drives left to right.</p>
      </section>

      {/* answer + inputs */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rise lg:order-2 [animation-delay:200ms]">
          <Results result={result} error={error} />
        </div>
        <div className="lg:order-1">
          <Controls s={s} set={set} />
        </div>
      </div>

      <footer className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Win probability for the team with the ball, from models trained on 2006-2022 NFL play-by-play (nflverse) and
        computed entirely in your browser. Unless a preset sets the real game context, both teams are league average and
        the weather is a typical outdoor day (8 mph, 59°F). &quot;How sure&quot; is the gap between the best and second-best
        option, in win-probability points.
      </footer>
    </div>
  );
}
