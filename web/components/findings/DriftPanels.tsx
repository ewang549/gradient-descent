"use client";
/**
 * League drift, one small multiple per feature (each its own y scale; never two scales on one chart).
 * Line = league average by season; band = the league average +- one noise-corrected between-team SD,
 * so its width is how different teams were from each other that season. One crosshair is shared
 * across the panels: hovering 2013 in one shows 2013 in all four.
 */
import { useState } from "react";

export interface Panel {
  key: string;
  title: string;
  unit: "pct" | "yds" | "sec";
  points: { season: number; mean: number; sd: number }[];
  from: { season: number; mean: number };
  to: { season: number; mean: number };
  eraShare: number;
  spread: { first5: number; last5: number; p: number; significant: boolean };
}

interface Props {
  panels: Panel[];
  /** the in-progress season (drawn dashed / hollow) */
  partialSeason: number;
}

const W = 1000;
const H = 1000;
const LINE = "#4c8dff";

const fmt = (v: number, unit: Panel["unit"], d?: number) =>
  unit === "pct" ? `${(v * 100).toFixed(d ?? 0)}%` : unit === "yds" ? v.toFixed(d ?? 1) : `${v.toFixed(d ?? 1)}s`;
const fmtSpread = (v: number, unit: Panel["unit"]) => (unit === "pct" ? `${(v * 100).toFixed(1)} pts` : unit === "yds" ? `${v.toFixed(2)} yds` : `${v.toFixed(2)}s`);
const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`);

function niceRange(lo: number, hi: number, unit: Panel["unit"]): [number, number, number] {
  const step = unit === "pct" ? (hi - lo > 0.4 ? 0.2 : hi - lo > 0.15 ? 0.1 : 0.05) : hi - lo > 2.5 ? 1 : 0.5;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  return [Math.max(unit === "pct" ? 0 : -Infinity, a), b, step];
}

export function DriftPanels({ panels, partialSeason }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {panels.map((p) => <One key={p.key} p={p} hover={hover} setHover={setHover} partialSeason={partialSeason} />)}
    </div>
  );
}

function One({ p, hover, setHover, partialSeason }: { p: Panel; hover: number | null; setHover: (i: number | null) => void; partialSeason: number }) {
  const n = p.points.length;
  const [lo, hi, step] = niceRange(Math.min(...p.points.map((q) => q.mean - q.sd)), Math.max(...p.points.map((q) => q.mean + q.sd)), p.unit);
  const x = (i: number) => 0.02 + (i / (n - 1)) * 0.96;
  const y = (v: number) => 1 - (v - lo) / (hi - lo);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  const pi = p.points.findIndex((q) => q.season === partialSeason);
  const full = pi === -1 ? p.points : p.points.slice(0, pi);
  const line = (pts: { mean: number }[], offset = 0) => pts.map((q, i) => `${i ? "L" : "M"}${(x(i + offset) * W).toFixed(1)} ${(y(q.mean) * H).toFixed(1)}`).join("");
  const band = `${full.map((q, i) => `${i ? "L" : "M"}${(x(i) * W).toFixed(1)} ${(y(Math.min(q.mean + q.sd, hi)) * H).toFixed(1)}`).join("")}` +
    [...full].reverse().map((q, j) => `L${(x(full.length - 1 - j) * W).toFixed(1)} ${(y(Math.max(q.mean - q.sd, lo)) * H).toFixed(1)}`).join("") + "Z";
  const h = hover !== null ? p.points[hover] : null;
  const s = p.spread;
  const nearest = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    return Math.min(n - 1, Math.max(0, Math.round(((f - 0.02) / 0.96) * (n - 1))));
  };
  const yearTicks = p.points.map((q, i) => ({ q, i })).filter(({ q }) => q.season % 5 === 0 || q.season === p.points[0].season);

  return (
    <figure className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <figcaption className="flex items-start justify-between gap-3">
        <div className="font-display text-xl font-extrabold uppercase leading-tight tracking-wide">{p.title}</div>
        <div className="num shrink-0 text-right font-display text-2xl font-black leading-none">
          <span className="text-ink-2">{fmt(p.from.mean, p.unit)}</span>
          <span className="mx-1 text-muted">→</span>
          {fmt(p.to.mean, p.unit)}
          <div className="mt-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted">{p.from.season} → {p.to.season}{p.unit === "yds" ? ", yards" : ""}</div>
        </div>
      </figcaption>

      <div className="relative mt-3 ml-9 h-36 sm:h-40" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {ticks.map((t) => <line key={t} x1={0} x2={W} y1={y(t) * H} y2={y(t) * H} stroke="#24304a" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <path d={band} fill={LINE} fillOpacity={0.16} />
          <path d={line(full)} stroke={LINE} strokeWidth={2} fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {pi > 0 && (
            <path d={line(p.points.slice(pi - 1, pi + 1), pi - 1)} stroke={LINE} strokeWidth={2} strokeDasharray="4 4" fill="none" vectorEffect="non-scaling-stroke" />
          )}
          {h && <line x1={x(hover!) * W} x2={x(hover!) * W} y1={0} y2={H} stroke="#aab3c7" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {ticks.map((t) => (
          <span key={t} className="num absolute -left-9 w-8 -translate-y-1/2 text-right text-[10px] text-muted" style={{ top: `${y(t) * 100}%` }}>{fmt(t, p.unit)}</span>
        ))}
        {pi > 0 && (
          <span aria-hidden className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-panel"
            style={{ left: `${x(pi) * 100}%`, top: `${y(p.points[pi].mean) * 100}%`, borderColor: LINE }} />
        )}
        {h && (
          <span aria-hidden className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
            style={{ left: `${x(hover!) * 100}%`, top: `${y(h.mean) * 100}%`, background: LINE }} />
        )}
        {/* one target for the whole plot: the pointer picks the nearest season, arrow keys step through them */}
        <div role="slider" tabIndex={0} aria-label={`${p.title} by season`}
          aria-valuemin={p.points[0].season} aria-valuemax={p.points[n - 1].season} aria-valuenow={h?.season ?? p.points[n - 1].season}
          aria-valuetext={h ? `${h.season}: league average ${fmt(h.mean, p.unit, 1)}, spread between teams ${fmtSpread(h.sd, p.unit)}` : "Use arrow keys to read each season"}
          className="absolute inset-0 cursor-crosshair rounded outline-none focus-visible:ring-2 focus-visible:ring-yellow/60"
          onPointerMove={(e) => setHover(nearest(e))} onPointerDown={(e) => setHover(nearest(e))}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            setHover(Math.min(n - 1, Math.max(0, (hover ?? (d > 0 ? -1 : n)) + d)));
          }} />
        {h && (
          <div className="pointer-events-none absolute -top-2 z-10 whitespace-nowrap rounded-md border border-line bg-night/95 px-2 py-1 text-[11px] shadow-lg"
            style={{ left: `${x(hover!) * 100}%`, transform: `translate(${x(hover!) > 0.65 ? "-100%" : x(hover!) < 0.35 ? "0" : "-50%"}, -100%)` }}>
            <b>{h.season}{h.season === partialSeason ? " to date" : ""}</b>
            <span className="num ml-2">avg {fmt(h.mean, p.unit, 1)}</span>
            <span className="num ml-2 text-ink-2">± {fmtSpread(h.sd, p.unit)}</span>
          </div>
        )}
      </div>
      <div className="relative ml-9 mt-1 h-4 text-[10px] text-muted" aria-hidden>
        {yearTicks.map(({ q, i }) => <span key={q.season} className="num absolute -translate-x-1/2" style={{ left: `${x(i) * 100}%` }}>{q.season}</span>)}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
        <div>
          <dt className="text-muted">Explained by the season</dt>
          <dd className="num mt-0.5 font-semibold text-ink">{Math.round(p.eraShare * 100)}% of all variation</dd>
        </div>
        <div>
          <dt className="text-muted">Spread between teams</dt>
          <dd className="num mt-0.5 font-semibold text-ink">
            {fmtSpread(s.first5, p.unit)} → {fmtSpread(s.last5, p.unit)}
            <span className={`ml-1 font-normal ${s.significant ? "text-green" : "text-ink-2"}`}>
              {s.significant ? (s.last5 < s.first5 ? "shrank" : "grew") : "no sig. change"}, {fmtP(s.p)}
            </span>
          </dd>
        </div>
      </dl>
    </figure>
  );
}
