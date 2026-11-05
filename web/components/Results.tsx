"use client";
/**
 * The answer: the call, how sure the model is (the WP gap to the next-best option, in points),
 * and one bar per option. The winner's bar and the verdict take the confidence color:
 * orange = toss-up, yellow = lean, green = clear call.
 */
import { useEffect, useRef, useState } from "react";
import { confidenceColor, confidenceLabel } from "@/lib/confidence";
import type { EngineOutput, Option } from "@/lib/engine/types";

const withAlpha = (rgb: string, a: number) => rgb.replace(")", ` / ${a})`);

/** The receiving team's average start after a punt, in plain words. */
function receiverStart(receivingYardline100: number): string {
  const own = Math.round(100 - receivingYardline100);
  if (own === 50) return "midfield";
  return own < 50 ? `their own ${own}` : `your ${100 - own}`;
}

const VERB: Record<Option, string> = { go: "Go for it", punt: "Punt", field_goal: "Kick the field goal" };
const OVER: Record<Option, string> = { go: "going for it", punt: "punting", field_goal: "the field goal" };

// ------------------------------------------------------------------------------ number tween

function useTween(target: number, ms = 650): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const v0 = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = v0 + (target - v0) * eased;
      from.current = v;
      setValue(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

function Pct({ value, digits = 1 }: { value: number; digits?: number }) {
  const v = useTween(value * 100);
  return <span className="num">{v.toFixed(digits)}</span>;
}

// ------------------------------------------------------------------------------------ pieces

interface Props {
  result: EngineOutput | null;
  error: string | null;
}

export function Results({ result, error }: Props) {
  if (error) {
    return (
      <div className="rounded-2xl border border-orange/40 bg-panel p-6 text-sm text-ink-2">
        The model couldn&apos;t load in this browser ({error}). Try a recent Chrome, Safari or Firefox.
      </div>
    );
  }
  const options: { key: Option; wp: number }[] = result
    ? [{ key: "go", wp: result.wp_go }, { key: "punt", wp: result.wp_punt }, { key: "field_goal", wp: result.wp_fg }]
    : [];
  const sorted = [...options].sort((a, b) => b.wp - a.wp);
  const best = result?.recommendation;
  const runnerUp = sorted.find((o) => o.key !== best);
  const gapPts = result && runnerUp ? (sorted[0].wp - runnerUp.wp) * 100 : 0;
  const color = confidenceColor(gapPts);

  return (
    <section aria-live="polite" className="flex flex-col gap-5">
      <Verdict best={best} gapPts={gapPts} runnerUp={runnerUp?.key} color={color} />
      <div className="flex flex-col gap-3">
        <Bar label="Go for it" option="go" wp={result?.wp_go} best={best} color={color}
          detail={result && (
            <>Converts <b className="num text-ink">{(result.p_convert * 100).toFixed(0)}%</b>
              <span className="text-muted"> · then </span><span className="num">{(result.wp_if_convert * 100).toFixed(0)}%</span>
              <span className="text-muted"> · if stopped </span><span className="num">{(result.wp_if_fail * 100).toFixed(0)}%</span></>
          )} />
        <Bar label="Punt" option="punt" wp={result?.wp_punt} best={best} color={color}
          detail={result && (
            <>Opponent starts at <b className="num text-ink">{receiverStart(result.punt_receiving_yardline_100)}</b>
              <span className="text-muted"> on average</span></>
          )} />
        <Bar label="Field goal" option="field_goal" wp={result?.wp_fg} best={best} color={color}
          detail={result && (result.p_fg_make > 0.005
            ? <><b className="num text-ink">{result.fg_distance}-yd</b> try<span className="text-muted"> · </span>
              makes <b className="num text-ink">{(result.p_fg_make * 100).toFixed(0)}%</b></>
            : <><span className="num">{result.fg_distance}</span>-yd try<span className="text-muted"> · out of range</span></>)} />
      </div>
    </section>
  );
}

function Verdict({ best, gapPts, runnerUp, color }: { best?: Option; gapPts: number; runnerUp?: Option; color: string }) {
  const gap = useTween(gapPts);
  if (!best) {
    return (
      <div className="rounded-2xl border border-line bg-panel/80 p-5">
        <div className="font-display text-4xl font-black uppercase tracking-wide text-muted sm:text-5xl">Loading model…</div>
        <div className="mt-2 text-sm text-muted">Win probability runs in your browser. Nothing is sent anywhere.</div>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-panel/80 p-5 transition-colors duration-500"
      style={{ borderColor: withAlpha(color, 0.45) }}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full blur-3xl transition-colors duration-500"
        style={{ background: color, opacity: 0.18 }} />
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-2">
        The call
        <span className="rounded-full px-2 py-0.5 font-display text-sm font-extrabold tracking-wider text-night transition-colors duration-500"
          style={{ background: color }}>
          {confidenceLabel(gapPts)}
        </span>
      </div>
      <div key={best} className="rise mt-1 font-display text-5xl font-black uppercase leading-none tracking-wide sm:text-6xl"
        style={{ color }}>
        {VERB[best]}
      </div>
      <div className="mt-3 flex items-baseline gap-2 text-ink-2">
        <span className="font-display text-3xl font-extrabold text-ink num">+{gap.toFixed(1)}</span>
        <span className="text-sm">win-probability points over {runnerUp ? OVER[runnerUp] : "the alternatives"}</span>
      </div>
    </div>
  );
}

function Bar({ label, option, wp, best, color, detail }: {
  label: string; option: Option; wp?: number; best?: Option; color: string; detail: React.ReactNode;
}) {
  const winner = best === option;
  return (
    <div className={`rounded-xl border px-4 py-3 transition-colors duration-500 ${winner ? "border-line bg-panel" : "border-transparent bg-night-2/70"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-display text-xl font-extrabold uppercase tracking-wider ${winner ? "text-ink" : "text-ink-2"}`}>
          {label}
        </span>
        <span className="font-display text-3xl font-black leading-none" style={{ color: winner ? color : undefined }}>
          {wp === undefined ? <span className="text-muted">--</span> : <><Pct value={wp} /><span className="text-xl">%</span></>}
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-night">
        {wp === undefined ? (
          <div className="loading-bar h-full w-full" />
        ) : (
          <div
            className="h-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ transform: `scaleX(${Math.max(wp, 0.004)})`, background: winner ? color : "#3a4663" }}
          />
        )}
      </div>
      <div className="mt-2 min-h-5 text-sm text-ink-2">{detail}</div>
    </div>
  );
}
