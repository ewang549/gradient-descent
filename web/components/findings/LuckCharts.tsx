"use client";
/**
 * Finding 2 charts. Same construction as DriftPanels: lines in a stretched SVG (non-scaling strokes), dots and
 * labels as positioned HTML so text stays readable at phone width and circles stay round. Every chart has one
 * hover/tap target that picks the nearest item, plus arrow-key stepping.
 */
import { useState, type ReactNode } from "react";

const W = 1000;
const H = 1000;
const GRID = "#24304a";

export const LUCK_COLORS = { record: "#e4602a", pointDiff: "#4c8dff", market: "#1fa984", pace: "#aab3c7", coin: "#6b7690" };

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

function Tip({ left, top = 0, inside, children }: { left: number; top?: number; inside?: boolean; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-night/95 px-2 py-1 text-[11px] shadow-lg"
      style={{ left: `${left * 100}%`, top: `${top * 100}%`, transform: `translate(${left > 0.65 ? "-100%" : left < 0.35 ? "0" : "-50%"}, ${inside ? "0" : "calc(-100% - 8px)"})` }}>
      {children}
    </div>
  );
}

function Stepper({ n, value, setValue, label, text, onMove }: {
  n: number; value: number | null; setValue: (i: number | null) => void; label: string; text: string;
  onMove: (e: React.PointerEvent<HTMLElement>) => number | null;
}) {
  return (
    <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={value ?? 0} aria-valuetext={text}
      className="absolute inset-0 cursor-crosshair rounded outline-none focus-visible:ring-2 focus-visible:ring-yellow/60"
      onPointerMove={(e) => setValue(onMove(e))} onPointerDown={(e) => setValue(onMove(e))} onPointerLeave={() => setValue(null)} onBlur={() => setValue(null)}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        setValue(Math.min(n - 1, Math.max(0, (value ?? (d > 0 ? -1 : n)) + d)));
      }} />
  );
}

const frac = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
};

function YTicks({ ticks, y, fmt }: { ticks: number[]; y: (v: number) => number; fmt: (v: number) => string }) {
  return <>{ticks.map((t) => (
    <span key={t} className="num absolute -left-11 w-10 -translate-y-1/2 text-right text-[10px] text-muted" style={{ top: `${y(t) * 100}%` }}>{fmt(t)}</span>
  ))}</>;
}

function Legend({ items }: { items: { label: string; color: string; dash?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden><line x1="1" x2="21" y1="4" y2="4" stroke={it.color} strokeWidth="2" strokeDasharray={it.dash} strokeLinecap="round" /></svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Spread end-of-line labels so none sit closer than `gap` (fraction of plot height), keeping their order. */
function endLabels<T extends { top: number }>(items: T[], gap = 0.075): T[] {
  const out = [...items].sort((a, b) => a.top - b.top).map((it) => ({ ...it }));
  for (let i = 1; i < out.length; i++) if (out[i].top - out[i - 1].top < gap) out[i].top = out[i - 1].top + gap;
  return out;
}

// ----------------------------------------------------------------------------- 1. by record

export interface RecordRow { wins: number; losses: number; n: number; first_win_pct: number; rest_win_pct: number }

/** One column per 8-game record: hollow = win% in the first 8, solid = win% the rest of the way. */
export function ByRecordChart({ rows, highlightFrom }: { rows: RecordRow[]; highlightFrom: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = rows.length;
  const x = (i: number) => (i + 0.5) / n;
  const y = (v: number) => 1 - v;
  const h = hover !== null ? rows[hover] : null;
  return (
    <figure className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Win% by record after 8 games, 2006-2025</span>
        <span className="flex gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-ink-2" />First 8 games</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" />Rest of the season</span>
        </span>
      </figcaption>
      <div className="relative mt-4 ml-11 h-56 sm:h-64">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line key={t} x1={0} x2={W} y1={y(t) * H} y2={y(t) * H} stroke={t === 0.5 ? "#6b7690" : GRID} strokeDasharray={t === 0.5 ? "6 6" : undefined} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <rect x={x(rows.findIndex((r) => r.wins >= highlightFrom)) * W - W / n / 2} width={(rows.filter((r) => r.wins >= highlightFrom).length * W) / n} y={0} height={H}
            fill="#4c8dff" fillOpacity={0.07} />
          {rows.map((r, i) => (
            <line key={r.wins} x1={x(i) * W} x2={x(i) * W} y1={y(r.first_win_pct) * H} y2={y(r.rest_win_pct) * H}
              stroke={hover === i ? "#eef1f7" : "#aab3c7"} strokeOpacity={hover === i ? 0.9 : 0.5} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <YTicks ticks={[0, 0.25, 0.5, 0.75, 1]} y={y} fmt={(t) => pct(t)} />
        <span className="absolute right-0 -translate-y-full pb-0.5 text-[10px] text-muted" style={{ top: `${y(0.5) * 100}%` }}>.500</span>
        {rows.map((r, i) => (
          <span key={r.wins}>
            <span aria-hidden className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-2 bg-panel" style={{ left: `${x(i) * 100}%`, top: `${y(r.first_win_pct) * 100}%` }} />
            <span aria-hidden className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-panel" style={{ left: `${x(i) * 100}%`, top: `${y(r.rest_win_pct) * 100}%` }} />
          </span>
        ))}
        <Stepper n={n} value={hover} setValue={setHover} label="Win% by record after 8 games"
          text={h ? `${h.wins}-${h.losses}: ${h.n} teams, ${pct(h.first_win_pct)} in the first 8, ${pct(h.rest_win_pct)} after` : "Use arrow keys to read each record"}
          onMove={(e) => Math.min(n - 1, Math.max(0, Math.floor(frac(e)[0] * n)))} />
        {h && (
          <Tip left={x(hover!)} top={Math.min(y(h.first_win_pct), y(h.rest_win_pct))}>
            <b>{h.wins}-{h.losses} starts</b><span className="num ml-2 text-ink-2">{h.n} teams</span>
            <span className="num ml-2">{pct(h.first_win_pct)} → {pct(h.rest_win_pct)}</span>
          </Tip>
        )}
      </div>
      <div className="relative ml-11 mt-1.5 h-4 text-[10px] text-muted" aria-hidden>
        {rows.map((r, i) => <span key={r.wins} className="num absolute -translate-x-1/2" style={{ left: `${x(i) * 100}%` }}>{r.wins}-{r.losses}</span>)}
      </div>
    </figure>
  );
}

// ----------------------------------------------------------------------------- 2. error by k

export interface KRow { k: number; pace: number; coin: number; record: number; pointDiff: number }
const K_SERIES = [
  { key: "pace", label: "Keeps the same pace", color: LUCK_COLORS.pace, dash: "7 6" },
  { key: "coin", label: "Everyone .500", color: LUCK_COLORS.coin, dash: "2 5" },
  { key: "record", label: "Record, regressed", color: LUCK_COLORS.record },
  { key: "pointDiff", label: "Point differential, regressed", color: LUCK_COLORS.pointDiff },
] as const;

/** Held-out error of each rest-of-season forecast, by games played. Lower is better. */
export function KChart({ rows }: { rows: KRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = rows.length;
  const all = rows.flatMap((r) => [r.pace, r.coin, r.record, r.pointDiff]);
  const lo = Math.floor(Math.min(...all) * 100) / 100, hi = Math.ceil(Math.max(...all) * 100) / 100;
  const x = (i: number) => 0.03 + (i / (n - 1)) * 0.94;
  const y = (v: number) => 1 - (v - lo) / (hi - lo);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.01) ticks.push(Math.round(t * 100) / 100);
  const h = hover !== null ? rows[hover] : null;
  const last = rows[n - 1];
  return (
    <figure className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <figcaption className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Forecast error for the rest of the season (RMSE of win%, lower is better)</span>
        <Legend items={K_SERIES.map((s) => ({ label: s.label, color: s.color, dash: "dash" in s ? s.dash : undefined }))} />
      </figcaption>
      <div className="relative mt-4 ml-11 mr-0 h-60 sm:mr-28 sm:h-64">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {ticks.map((t) => <line key={t} x1={0} x2={W} y1={y(t) * H} y2={y(t) * H} stroke={GRID} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          {K_SERIES.map((s) => (
            <path key={s.key} d={rows.map((r, i) => `${i ? "L" : "M"}${(x(i) * W).toFixed(1)} ${(y(r[s.key]) * H).toFixed(1)}`).join("")}
              stroke={s.color} strokeWidth={2} strokeDasharray={"dash" in s ? s.dash : undefined} fill="none" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {h && <line x1={x(hover!) * W} x2={x(hover!) * W} y1={0} y2={H} stroke="#aab3c7" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        <YTicks ticks={ticks} y={y} fmt={(t) => t.toFixed(2)} />
        {/* direct labels at the right end (desktop); the legend carries identity on phones */}
        {endLabels(K_SERIES.map((s) => ({ key: s.key, top: y(last[s.key]) }))).map((l) => (
          <span key={l.key} className="absolute left-full ml-2 hidden -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold text-ink-2 sm:block"
            style={{ top: `${l.top * 100}%` }}>
            {l.key === "pace" ? "Same pace" : l.key === "coin" ? ".500" : l.key === "record" ? "Record" : "Point diff"}
          </span>
        ))}
        {h && K_SERIES.map((s) => (
          <span key={s.key} aria-hidden className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
            style={{ left: `${x(hover!) * 100}%`, top: `${y(h[s.key]) * 100}%`, background: s.color }} />
        ))}
        <Stepper n={n} value={hover} setValue={setHover} label="Forecast error by games played"
          text={h ? `After ${h.k} games: same pace ${h.pace.toFixed(3)}, .500 ${h.coin.toFixed(3)}, record ${h.record.toFixed(3)}, point differential ${h.pointDiff.toFixed(3)}` : "Use arrow keys to read each number of games"}
          onMove={(e) => Math.min(n - 1, Math.max(0, Math.round(((frac(e)[0] - 0.03) / 0.94) * (n - 1))))} />
        {h && (
          <Tip left={x(hover!) + (x(hover!) > 0.65 ? -0.02 : 0.02)} top={0.02} inside>
            <div className="font-semibold">After {h.k} games</div>
            {[...K_SERIES].sort((a, b) => h[a.key] - h[b.key]).map((s) => (
              <div key={s.key} className="num flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                <span>{h[s.key].toFixed(3)}</span>
              </div>
            ))}
          </Tip>
        )}
      </div>
      <div className="relative ml-11 mt-1.5 h-4 text-[10px] text-muted sm:mr-28" aria-hidden>
        {rows.map((r, i) => <span key={r.k} className="num absolute -translate-x-1/2" style={{ left: `${x(i) * 100}%` }}>{r.k}</span>)}
      </div>
      <div className="ml-11 mt-1 text-center text-[10px] uppercase tracking-wider text-muted sm:mr-28">Games played when the forecast is made</div>
    </figure>
  );
}

// ----------------------------------------------------------------------------- 3. luck scatter

/** [season, team, record minus Pythagorean in the first 8, the same for the rest of the season] */
export type LuckPoint = [number, string, number, number];

export function LuckScatter({ points, r, slope }: { points: LuckPoint[]; r: number; slope: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const L = 0.4;
  const x = (v: number) => (v + L) / (2 * L);
  const y = (v: number) => 1 - (v + L) / (2 * L);
  const ticks = [-0.4, -0.2, 0, 0.2, 0.4];
  const h = hover !== null ? points[hover] : null;
  const order = points.map((p, i) => ({ p, i })).sort((a, b) => a.p[2] - b.p[2]).map((o) => o.i); // keyboard steps left to right
  const nearest = (e: React.PointerEvent<HTMLElement>) => {
    const [fx, fy] = frac(e);
    let best = -1, bd = 0.0025; // within ~5% of the plot
    points.forEach((p, i) => { const d = (x(p[2]) - fx) ** 2 + (y(p[3]) - fy) ** 2; if (d < bd) { bd = d; best = i; } });
    return best < 0 ? null : best;
  };
  const fmtL = (v: number) => `${signed(v * 100, 0)} pts`;
  return (
    <figure className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Luck in the first 8 games vs luck the rest of the way, {points.length} team-seasons</span>
        <span className="num text-xs text-ink-2">r = {r.toFixed(2)}</span>
      </figcaption>
      <div className="mx-auto mt-4 w-full max-w-xl">
        <div className="mb-2 ml-11 text-[10px] uppercase tracking-wider text-muted">↑ Record minus Pythagorean, rest of the season</div>
        <div className="relative ml-11 aspect-square">
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={W} y1={y(t) * H} y2={y(t) * H} stroke={t === 0 ? "#3a4663" : GRID} strokeWidth={t === 0 ? 2 : 1} />
                <line y1={0} y2={H} x1={x(t) * W} x2={x(t) * W} stroke={t === 0 ? "#3a4663" : GRID} strokeWidth={t === 0 ? 2 : 1} />
              </g>
            ))}
            {points.map((p, i) => (
              <circle key={i} cx={x(p[2]) * W} cy={y(p[3]) * H} r={7} fill={LUCK_COLORS.pointDiff} fillOpacity={0.35} />
            ))}
            <line x1={0} x2={W} y1={y(-L * slope) * H} y2={y(L * slope) * H} stroke="#eef1f7" strokeWidth={3} strokeLinecap="round" />
            {h && <circle cx={x(h[2]) * W} cy={y(h[3]) * H} r={12} fill={LUCK_COLORS.pointDiff} stroke="#eef1f7" strokeWidth={3} />}
          </svg>
          <YTicks ticks={ticks} y={y} fmt={(t) => (t === 0 ? "0" : `${signed(t * 100, 0)}`)} />
          <span className="absolute right-1 text-[10px] font-semibold text-ink-2" style={{ top: `${y(L * slope) * 100 - 6}%` }}>Best fit: flat</span>
          <Stepper n={points.length} value={hover === null ? null : order.indexOf(hover)} setValue={(i) => setHover(i === null ? null : order[i])}
            label="Luck in the first 8 games against luck in the rest of the season"
            text={h ? `${h[0]} ${h[1]}: ${fmtL(h[2])} in the first 8, ${fmtL(h[3])} after` : "Use arrow keys to step through team-seasons"}
            onMove={(e) => { const i = nearest(e); return i === null ? null : order.indexOf(i); }} />
          {h && (
            <Tip left={x(h[2])} top={y(h[3])}>
              <b>{h[0]} {h[1]}</b>
              <span className="num ml-2">first 8: {fmtL(h[2])}</span>
              <span className="num ml-2 text-ink-2">after: {fmtL(h[3])}</span>
            </Tip>
          )}
        </div>
        <div className="relative ml-11 mt-1.5 h-4 text-[10px] text-muted" aria-hidden>
          {ticks.map((t) => <span key={t} className="num absolute -translate-x-1/2" style={{ left: `${x(t) * 100}%` }}>{t === 0 ? "0" : signed(t * 100, 0)}</span>)}
        </div>
        <div className="ml-11 mt-1 text-center text-[10px] uppercase tracking-wider text-muted">Record minus Pythagorean, first 8 games (win% points) →</div>
      </div>
    </figure>
  );
}

// ----------------------------------------------------------------------------- 4. the edge, with CIs

export interface CiRow { k: number; loso: [number, number]; forward: [number, number]; diff: number; diffForward: number }

/** Point diff's RMSE minus the regressed record's, with 95% season-block bootstrap CIs. Left of zero = point diff better. */
export function EdgeChart({ rows }: { rows: CiRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const lo = -0.014, hi = 0.004;
  const x = (v: number) => (v - lo) / (hi - lo);
  const ticks = [-0.012, -0.008, -0.004, 0, 0.004];
  const h = hover !== null ? rows[hover] : null;
  const n = rows.length;
  return (
    <figure className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <figcaption className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Point diff&apos;s error minus the record&apos;s, with 95% intervals. Left of 0 = point diff better</span>
        <span className="flex flex-wrap gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-sm" style={{ background: LUCK_COLORS.pointDiff }} />Every other season (held out)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-sm border-2" style={{ borderColor: LUCK_COLORS.pointDiff }} />Earlier seasons only (real time)</span>
        </span>
      </figcaption>
      <div className="relative mt-4 ml-16">
        <div className="relative" style={{ height: `${n * 2.4}rem` }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            {ticks.map((t) => <line key={t} y1={0} y2={H} x1={x(t) * W} x2={x(t) * W} stroke={t === 0 ? "#aab3c7" : GRID} strokeWidth={t === 0 ? 1.5 : 1} vectorEffect="non-scaling-stroke" />)}
          </svg>
          {rows.map((r, i) => (
            <div key={r.k} className={`absolute inset-x-0 ${hover === i ? "bg-ink/5" : ""}`} style={{ top: `${(i / n) * 100}%`, height: `${100 / n}%` }}>
              <span className="num absolute -left-16 top-1/2 w-14 -translate-y-1/2 whitespace-nowrap text-right text-[11px] text-ink-2">{r.k} games</span>
              <span className="absolute top-[30%] h-2 -translate-y-1/2 rounded-sm" style={{ left: `${x(r.loso[0]) * 100}%`, width: `${(x(r.loso[1]) - x(r.loso[0])) * 100}%`, background: LUCK_COLORS.pointDiff }} />
              <span className="absolute top-[68%] h-2 -translate-y-1/2 rounded-sm border-2" style={{ left: `${x(r.forward[0]) * 100}%`, width: `${(x(r.forward[1]) - x(r.forward[0])) * 100}%`, borderColor: LUCK_COLORS.pointDiff }} />
            </div>
          ))}
          <Stepper n={n} value={hover} setValue={setHover} label="Point differential's edge by games played"
            text={h ? `After ${h.k} games: held out ${signed(h.diff, 4)} (${h.loso.map((v) => signed(v, 4)).join(" to ")}); real time ${signed(h.diffForward, 4)} (${h.forward.map((v) => signed(v, 4)).join(" to ")})` : "Use arrow keys to read each row"}
            onMove={(e) => Math.min(n - 1, Math.max(0, Math.floor(frac(e)[1] * n)))} />
          {h && (
            <Tip left={x((h.loso[0] + h.loso[1]) / 2)} top={hover! / n}>
              <div className="font-semibold">After {h.k} games</div>
              <div className="num">Held out: {signed(h.diff, 4)} [{h.loso.map((v) => signed(v, 4)).join(", ")}]</div>
              <div className="num text-ink-2">Real time: {signed(h.diffForward, 4)} [{h.forward.map((v) => signed(v, 4)).join(", ")}]</div>
            </Tip>
          )}
        </div>
        <div className="relative mt-1.5 h-4 text-[10px] text-muted" aria-hidden>
          {ticks.map((t) => <span key={t} className="num absolute -translate-x-1/2" style={{ left: `${x(t) * 100}%` }}>{t === 0 ? "0" : signed(t, 3)}</span>)}
        </div>
      </div>
    </figure>
  );
}
