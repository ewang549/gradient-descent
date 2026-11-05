"use client";
/**
 * Home-team win probability over the game. Server-rendered like any component (the line is in the
 * HTML before JS loads); the browser adds the crosshair and the 4th-down details.
 *
 * Marks: the line splits at 50% into the home color (above) and the away color (below), each with a
 * faint wash. 4th downs sit on the line, colored by grade and lettered by the call (G / P / F).
 * Numbered dots mark the five biggest swings. Tap or hover a 4th down for its WP bars.
 */
import Link from "next/link";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { fromEngineInput, toQuery } from "@/lib/calculator/state";
import type { Option } from "@/lib/engine/types";
import {
  GRADE_HEX, GRADE_LABEL, areaPaths, callGrade, clockAt, domain, linePaths, linePoints, points, type CallGrade,
} from "@/lib/games/chart";
import type { FourthDown, GameExport } from "@/lib/games/types";
import { OPTION_LABEL, pts } from "@/lib/weekly/format";

const W = 1000;
const H = 1000;
const LETTER: Record<Option, string> = { go: "G", punt: "P", field_goal: "F" };

interface Props {
  g: GameExport;
  colors: { home: string; away: string };
}

export function GameChart({ g, colors }: Props) {
  const pts0 = useMemo(() => points(g), [g]);
  const drawn = useMemo(() => linePoints(g, pts0), [g, pts0]);
  const line = useMemo(() => linePaths(drawn, W, H), [drawn]);
  const area = useMemo(() => areaPaths(drawn, W, H), [drawn]);
  const final = pts0.at(-1)!;
  const total = domain(g);
  const indexOf = useMemo(() => new Map(g.series.play_seq.map((s, i) => [s, i])), [g]);

  const fourths = g.fourth_downs
    .map((fd) => ({ fd, i: indexOf.get(fd.play_seq) }))
    .filter((x): x is { fd: FourthDown; i: number } => x.i !== undefined);
  const costliest = [...fourths].sort((a, b) => (b.fd.wp_lost ?? -1) - (a.fd.wp_lost ?? -1))[0];
  const [selected, setSelected] = useState<number | null>(costliest?.fd.play_seq ?? null);
  const [hover, setHover] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);

  const onMove = (e: PointerEvent) => {
    const r = plot.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    let best = 0;
    for (let i = 1; i < pts0.length; i++) if (Math.abs(pts0[i].x - x) < Math.abs(pts0[best].x - x)) best = i;
    setHover(best);
  };

  const quarters = [1, 2, 3].map((q) => q / 4 / total);
  const swings = g.swings
    .map((s, k) => ({ s, k, i: indexOf.get(s.play_seq) }))
    .filter((x): x is typeof x & { i: number } => x.i !== undefined && x.i + 1 < pts0.length);
  // swings get numbered in time order, matching the list under the chart
  const sel = fourths.find((x) => x.fd.play_seq === selected)?.fd ?? null;
  const h = hover !== null ? pts0[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded" style={{ background: colors.home }} />{g.home.team} leading</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded" style={{ background: colors.away }} />{g.away.team} leading</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(["right", "small", "big"] as CallGrade[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: GRADE_HEX[k] }} />{GRADE_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      {/* plot: SVG stretched to the box for the line; HTML on top for text and markers so they stay round and crisp */}
      <div className="relative mt-3 h-64 select-none sm:h-96" ref={plot} data-plot
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {[0.25, 0.75].map((y) => (
            <line key={y} x1={0} x2={W} y1={y * H} y2={y * H} stroke="#24304a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {quarters.map((x) => (
            <line key={x} x1={x * W} x2={x * W} y1={0} y2={H} stroke="#24304a" strokeWidth={x === quarters[1] ? 1.5 : 1} vectorEffect="non-scaling-stroke" />
          ))}
          {g.went_to_overtime && <rect x={W / total} y={0} width={W - W / total} height={H} fill="#121a2c" />}
          <path d={area.above} fill={colors.home} fillOpacity={0.14} />
          <path d={area.below} fill={colors.away} fillOpacity={0.14} />
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#6b7690" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={line.above} stroke={colors.home} strokeWidth={2.25} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={line.below} stroke={colors.away} strokeWidth={2.25} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {h && <line x1={h.x * W} x2={h.x * W} y1={0} y2={H} stroke="#aab3c7" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>

        {g.went_to_overtime && (
          <span className="pointer-events-none absolute flex -translate-x-full -translate-y-1/2 items-center gap-1.5 whitespace-nowrap pr-0.5 text-[11px] font-semibold text-ink-2"
            style={{ left: `${final.x * 100}%`, top: `${Math.min(Math.max(final.y, 0.06), 0.94) * 100}%` }}>
            {final.y < 0.5 ? g.home.team : final.y > 0.5 ? g.away.team : "Tie"} in OT
            <i className="h-2.5 w-2.5 rounded-full ring-2 ring-night" style={{ background: final.y < 0.5 ? colors.home : final.y > 0.5 ? colors.away : "#aab3c7" }} />
          </span>
        )}

        {/* end labels: who's winning at the top and bottom */}
        <div className="pointer-events-none absolute left-2 top-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">{g.home.team} wins</div>
        <div className="pointer-events-none absolute bottom-1.5 left-2 text-[11px] font-semibold uppercase tracking-wider text-ink-2">{g.away.team} wins</div>
        <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-full pb-0.5 text-[10px] text-muted">50%</div>

        {swings.map(({ s, i }, n) => {
          const a = pts0[i], b = pts0[i + 1];
          return (
            <span key={s.play_seq} aria-hidden
              className="pointer-events-none absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-[9px] font-black text-night ring-2 ring-night"
              style={{ left: `${((a.x + b.x) / 2) * 100}%`, top: `${((a.y + b.y) / 2) * 100}%` }}>
              {n + 1}
            </span>
          );
        })}

        {fourths.map(({ fd, i }) => {
          const p = pts0[i];
          const grade = callGrade(fd);
          const on = fd.play_seq === selected;
          return (
            <button key={fd.play_seq} type="button"
              aria-label={`${fd.posteam} ${fd.situation}, ${clockAt(g.series.game_seconds_remaining[i])}: ${OPTION_LABEL[fd.decision]}. ${GRADE_LABEL[grade]}`}
              aria-pressed={on}
              onClick={() => setSelected(fd.play_seq)} onPointerEnter={(e) => e.pointerType === "mouse" && setSelected(fd.play_seq)}
              className="absolute flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[8px] font-black sm:h-[18px] sm:w-[18px] sm:text-[9px] text-night outline-none ring-2 ring-night transition-transform focus-visible:ring-yellow before:absolute before:-inset-2.5 before:content-['']"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: GRADE_HEX[grade], transform: `translate(-50%,-50%) scale(${on ? 1.35 : 1})`, zIndex: on ? 3 : 2 }}>
              {LETTER[fd.decision]}
            </button>
          );
        })}

        {h && hover !== null && (
          <div className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-md border border-line bg-night/95 px-2 py-1 text-[11px] shadow-lg"
            style={{ left: `${h.x * 100}%`, transform: `translateX(${h.x > 0.7 ? "-100%" : h.x < 0.3 ? "0" : "-50%"})` }}>
            <span className="text-ink-2">{g.series.play_seq[hover] === null ? (g.went_to_overtime ? "Final/OT" : "Final") : clockAt(g.series.game_seconds_remaining[hover])}</span>
            <span className="num ml-2 font-semibold">{g.away.team} {g.series.away_score[hover]}-{g.series.home_score[hover]} {g.home.team}</span>
            <span className="num ml-2">{g.home.team} <b>{pts(1 - h.y, 0)}%</b></span>
          </div>
        )}
      </div>

      <div className="relative mt-1 h-4 text-[11px] text-muted" aria-hidden>
        {["Q1", "Q2", "Q3", "Q4"].map((q, k) => (
          <span key={q} className="absolute -translate-x-1/2" style={{ left: `${((k + 0.5) / 4 / total) * 100}%` }}>{q}</span>
        ))}
        {g.went_to_overtime && <span className="absolute -translate-x-1/2" style={{ left: `${((1 + total) / 2 / total) * 100}%` }}>OT</span>}
      </div>

      {sel && <Detail fd={sel} />}
    </div>
  );
}

function Detail({ fd }: { fd: FourthDown }) {
  const grade = callGrade(fd);
  const wp: Partial<Record<Option, number | null>> = { go: fd.wp_go, punt: fd.wp_punt, field_goal: fd.wp_fg };
  const top = Math.max(...Object.values(wp).map((v) => v ?? 0)) || 1;
  const outcome = fd.decision === "go" ? (fd.is_converted ? "Converted." : fd.is_converted === false ? "Stopped." : "")
    : fd.decision === "field_goal" ? (fd.is_fg_made ? "Good." : fd.is_fg_made === false ? "No good." : "") : "";
  return (
    <div className="mt-4 rounded-xl border border-line bg-night-2/70 p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-display text-2xl font-extrabold uppercase tracking-wide">{fd.posteam} {fd.situation}</div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-night" style={{ background: GRADE_HEX[grade] }}>
          {grade === "right" || grade === "ungraded" ? GRADE_LABEL[grade] : `-${pts(fd.wp_lost!)} WP points`}
        </span>
      </div>
      <div className="mt-0.5 text-sm text-ink-2">
        Q{fd.qtr} {Number(fd.clock.split(":")[0])}:{fd.clock.split(":")[1]} · {fd.posteam_score}-{fd.defteam_score} ·{" "}
        <b className="text-ink">{fd.coach}: {OPTION_LABEL[fd.decision]}</b>
        {fd.recommendation && <> · model: {OPTION_LABEL[fd.recommendation]}</>}
      </div>
      {fd.is_graded ? (
        <div className="mt-3 flex flex-col gap-2">
          {(["go", "punt", "field_goal"] as Option[]).map((o) => {
            const v = wp[o] ?? 0;
            const best = o === fd.recommendation;
            return (
              <div key={o} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm">
                <span className={`font-display text-base font-extrabold uppercase tracking-wider ${best ? "text-ink" : "text-ink-2"}`}>
                  {o === "field_goal" ? "FG" : o === "go" ? "Go" : "Punt"}{o === fd.decision && <span className="ml-1 text-[10px] text-muted">coach</span>}
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-night">
                  <span className="block h-full origin-left rounded-full transition-transform duration-500" style={{ transform: `scaleX(${Math.max(v / top, 0.01)})`, background: best ? GRADE_HEX.right : "#3a4663" }} />
                </span>
                <span className="num text-right font-semibold">{pts(v)}%</span>
              </div>
            );
          })}
          <div className="text-[11px] text-muted">Win probability for {fd.posteam} after each option. Bars run from zero to the best option.</div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-2">Overtime and the final 30 seconds of a half aren&apos;t graded.</p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">{outcome && <b className="text-ink-2">{outcome} </b>}{fd.play_description}</p>
      <Link href={`/calculator?${toQuery(fromEngineInput(fd.input, null))}`} className="mt-2 inline-block text-xs font-semibold text-los hover:underline">
        Open in calculator →
      </Link>
    </div>
  );
}
