"use client";
/**
 * One measure by season: the coach (team color) vs the league (gray). Two of these sit side by
 * side on a coach page rather than one chart with two y-axes. Seasons under the minimum sample
 * are drawn hollow; in-sample seasons (the WP model's training years) are shaded.
 */
import { useState } from "react";

export interface TrendPoint {
  season: number;
  coach: number | null; // null = not a head coach that season, or under the sample needed for this measure
  coachN: number;
  league: number;
  thin: boolean; // under the season minimum: drawn hollow
}

interface Props {
  title: string;
  sub: string;
  points: TrendPoint[];
  /** "dec2" = 0.42, "pct" = 42% (a key, not a function: this is a client component fed by the server) */
  format: "dec2" | "pct";
  nLabel: string;
  colors: { team: string; league: string };
  coachLabel: string;
  outOfSampleFrom: number;
}

const W = 1000;
const H = 1000;

function niceMax(v: number): number {
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10];
  for (const s of steps) if (v <= s * 4) return s * 4;
  return Math.ceil(v);
}

const FORMATS = { dec2: (v: number) => v.toFixed(2), pct: (v: number) => `${Math.round(v * 100)}%` };

export function TrendChart({ title, sub, points, format: fmt, nLabel, colors, coachLabel, outOfSampleFrom }: Props) {
  const format = FORMATS[fmt];
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const max = niceMax(Math.max(...points.flatMap((p) => [p.league, p.coach ?? 0])) * 1.05 || 1);
  const x = (i: number) => (n === 1 ? 0.5 : 0.04 + (i / (n - 1)) * 0.92);
  const y = (v: number) => 1 - v / max;
  const ticks = [0, max / 2, max];

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${(x(i) * W).toFixed(1)} ${(y(v) * H).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const nearest = (e: React.PointerEvent<HTMLElement>) => {
    if (n === 1) return 0;
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    return Math.min(n - 1, Math.max(0, Math.round(((f - 0.04) / 0.92) * (n - 1))));
  };
  const firstOos = points.findIndex((p) => p.season >= outOfSampleFrom);
  const shadeTo = firstOos === -1 ? 1 : firstOos === 0 ? 0 : (x(firstOos - 1) + x(firstOos)) / 2;
  const h = hover !== null ? points[hover] : null;
  const lastCoach = [...points].reverse().find((p) => p.coach !== null);

  return (
    <figure className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <figcaption>
        <div className="font-display text-xl font-extrabold uppercase tracking-wide">{title}</div>
        <div className="mt-0.5 text-xs text-ink-2">{sub}</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded" style={{ background: colors.team }} />{coachLabel}</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded" style={{ background: colors.league }} />League</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border-2" style={{ borderColor: colors.team }} />small sample</span>
        </div>
      </figcaption>

      <div className="relative mt-3 ml-9 h-44 sm:h-52" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {shadeTo > 0 && <rect x={0} y={0} width={shadeTo * W} height={H} fill="#121a2c" />}
          {ticks.map((t) => <line key={t} x1={0} x2={W} y1={y(t) * H} y2={y(t) * H} stroke="#24304a" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <path d={path(points.map((p) => p.league))} stroke={colors.league} strokeWidth={2} fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={path(points.map((p) => p.coach))} stroke={colors.team} strokeWidth={2.25} fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {h && <line x1={x(hover!) * W} x2={x(hover!) * W} y1={0} y2={H} stroke="#aab3c7" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {ticks.map((t) => (
          <span key={t} className="num absolute -left-9 w-8 -translate-y-1/2 text-right text-[10px] text-muted" style={{ top: `${y(t) * 100}%` }}>{format(t)}</span>
        ))}
        {shadeTo > 0.12 && <span className="absolute left-1.5 top-1 text-[10px] uppercase tracking-wider text-muted">in-sample</span>}
        {points.map((p, i) => p.coach !== null && (
          <span key={p.season} aria-hidden className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
            style={{ left: `${x(i) * 100}%`, top: `${y(p.coach) * 100}%`, background: p.thin ? "#151e33" : colors.team, border: `2px solid ${colors.team}` }} />
        ))}
        {/* one target for the whole plot: the pointer picks the nearest season, arrow keys step through them */}
        <div role="slider" tabIndex={0} aria-label={`${title} by season`}
          aria-valuemin={points[0]?.season} aria-valuemax={points[n - 1]?.season} aria-valuenow={h?.season ?? points[n - 1]?.season}
          aria-valuetext={h ? `${h.season}: ${coachLabel} ${h.coach === null ? "no data" : format(h.coach)}, league ${format(h.league)}, ${h.coachN} ${nLabel}` : "Use arrow keys to read each season"}
          className="absolute inset-0 cursor-crosshair rounded outline-none focus-visible:ring-2 focus-visible:ring-yellow/60"
          onPointerMove={(e) => setHover(nearest(e))} onPointerDown={(e) => setHover(nearest(e))} onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            setHover(Math.min(n - 1, Math.max(0, (hover ?? (d > 0 ? -1 : n)) + d)));
          }} />
        {h && (
          <div className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-md border border-line bg-night/95 px-2 py-1 text-[11px] shadow-lg"
            style={{ left: `${x(hover!) * 100}%`, transform: `translateX(${x(hover!) > 0.65 ? "-100%" : x(hover!) < 0.35 ? "0" : "-50%"})` }}>
            <b>{h.season}</b>
            <span className="num ml-2">{coachLabel.split(" ").at(-1)} {h.coach === null ? "—" : format(h.coach)}</span>
            <span className="num ml-2 text-ink-2">league {format(h.league)}</span>
            <span className="num ml-2 text-muted">n={h.coachN}</span>
          </div>
        )}
        {lastCoach && !h && (
          <span className="pointer-events-none absolute -translate-y-1/2 pl-2 text-[11px] font-semibold text-ink" style={{ left: `${x(points.indexOf(lastCoach)) * 100}%`, top: `${y(lastCoach.coach!) * 100}%`, transform: `translate(${x(points.indexOf(lastCoach)) > 0.8 ? "-120%" : "0"}, -150%)` }}>
            {format(lastCoach.coach!)}
          </span>
        )}
      </div>
      <div className="relative ml-9 mt-1 h-4 text-[10px] text-muted" aria-hidden>
        {points.map((p, i) => (n <= 8 || i % 2 === (n - 1) % 2) && (
          <span key={p.season} className="num absolute -translate-x-1/2" style={{ left: `${x(i) * 100}%` }}>{n > 8 ? `'${String(p.season).slice(2)}` : p.season}</span>
        ))}
      </div>
    </figure>
  );
}
