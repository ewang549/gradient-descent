"use client";
/**
 * The style map: every team-season on the two era-removed style dials (PC1 pass-first, PC2 tempo),
 * in that season's SDs, so 0 is the league average of its own year. Hover / tap picks the nearest
 * point; the season filter highlights one year; the heaviest no-huddle offenses are orange and the
 * best-known ones are labeled.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint } from "@/lib/findings/offenseStyle";

interface Props {
  teams: string[];
  points: MapPoint[];
  league: Record<number, [number, number, number, number, number]>;
  seasons: number[];
  partialSeason: number;
  labeled: { season: number; team: string; pos: "right" | "above" | "below" }[];
}

const X = [-4.5, 5] as const;
const Y = [-2.6, 6.2] as const;
const BLUE = "#4c8dff";
const ORANGE = "#ff7a45";
const PAD = { l: 8, r: 8, t: 10, b: 10 };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

export function StyleMap({ teams, points, league, seasons, partialSeason, labeled }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [season, setSeason] = useState<number | "all">("all");
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = Math.round(Math.min(Math.max(w * 0.72, 320), 620));
  const sx = (v: number) => PAD.l + ((v - X[0]) / (X[1] - X[0])) * (w - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - Y[0]) / (Y[1] - Y[0])) * (h - PAD.t - PAD.b);
  const r = w < 500 ? 3.2 : 4.2;

  const labelPos = useMemo(() => new Map(labeled.map((l) => [`${l.season}-${l.team}`, l.pos])), [labeled]);
  const inSeason = (p: MapPoint) => season === "all" || p[0] === season;
  // draw order: background, then no-huddle, then the selected season, so highlights sit on top
  const order = useMemo(() => points.map((p, i) => i).sort((a, b) => {
    const rank = (p: MapPoint) => (season !== "all" && p[0] === season ? 2 : p[9] ? 1 : 0);
    return rank(points[a]) - rank(points[b]);
  }), [points, season]);

  function pick(clientX: number, clientY: number) {
    const rect = box.current!.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best = -1, bd = 26 ** 2;
    points.forEach((p, i) => {
      if (season !== "all" && p[0] !== season) return;
      const d = (sx(p[2]) - mx) ** 2 + (sy(p[3]) - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    setActive(best === -1 ? null : best);
  }

  const step = (dir: 1 | -1) => {
    setActive(null);
    setSeason((s) => {
      if (s === "all") return dir === 1 ? seasons[0] : seasons.at(-1)!;
      const i = seasons.indexOf(s) + dir;
      return i < 0 || i >= seasons.length ? "all" : seasons[i];
    });
  };

  const a = active !== null ? points[active] : null;
  const lg = a ? league[a[0]] : null;
  const seasonCount = season === "all" ? points.length : points.filter((p) => p[0] === season).length;
  const nhCount = points.filter((p) => p[9] && inSeason(p)).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="map-season" className="text-xs font-semibold uppercase tracking-wider text-muted">Season</label>
        <div className="flex items-center rounded-lg border border-line bg-night-2">
          <button type="button" onClick={() => step(-1)} aria-label="Previous season" className="px-3 py-2 text-ink-2 hover:text-ink">‹</button>
          <select id="map-season" value={season} onChange={(e) => { setActive(null); setSeason(e.target.value === "all" ? "all" : Number(e.target.value)); }}
            className="num min-w-28 bg-transparent py-2 text-center text-sm font-semibold text-ink outline-none">
            <option value="all">All seasons</option>
            {seasons.map((s) => <option key={s} value={s}>{s}{s === partialSeason ? " (to date)" : ""}</option>)}
          </select>
          <button type="button" onClick={() => step(1)} aria-label="Next season" className="px-3 py-2 text-ink-2 hover:text-ink">›</button>
        </div>
        <span className="num text-xs text-muted">{seasonCount} team-seasons · {nhCount} no-huddle outliers</span>
      </div>

      <div className="mt-3 flex gap-2">
        {/* y-axis title */}
        <div className="flex w-4 shrink-0 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-ink-2">Slower, huddles ← Tempo → Faster, no-huddle</span>
        </div>
        <div ref={box} className="relative min-w-0 flex-1 touch-pan-y select-none" style={{ height: h }}
          onPointerMove={(e) => e.pointerType === "mouse" && pick(e.clientX, e.clientY)}
          onPointerDown={(e) => pick(e.clientX, e.clientY)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full rounded-xl bg-night-2/60" role="img"
            aria-label={`Scatter of ${seasonCount} team-seasons on two style dials, pass-first (horizontal) and tempo (vertical)`}>
            {[-4, -2, 2, 4].map((v) => <line key={`x${v}`} x1={sx(v)} x2={sx(v)} y1={PAD.t} y2={h - PAD.b} stroke="#24304a" strokeWidth={1} />)}
            {[-2, 2, 4, 6].map((v) => <line key={`y${v}`} x1={PAD.l} x2={w - PAD.r} y1={sy(v)} y2={sy(v)} stroke="#24304a" strokeWidth={1} />)}
            <line x1={sx(0)} x2={sx(0)} y1={PAD.t} y2={h - PAD.b} stroke="#3a4663" strokeWidth={1.5} />
            <line x1={PAD.l} x2={w - PAD.r} y1={sy(0)} y2={sy(0)} stroke="#3a4663" strokeWidth={1.5} />
            {order.map((i) => {
              const p = points[i];
              const on = inSeason(p);
              const sel = season !== "all" && p[0] === season;
              const fill = p[9] ? ORANGE : sel ? BLUE : "#8a95ad";
              return (
                <circle key={i} cx={sx(p[2])} cy={sy(p[3])} r={sel || (p[9] && on) ? r + 0.8 : r}
                  fill={fill} fillOpacity={on ? (sel || p[9] ? 0.95 : 0.45) : 0.12} stroke="#121a2c" strokeWidth={sel || p[9] ? 1.5 : 0} />
              );
            })}
            {season === "all" && points.filter((p) => labelPos.has(`${p[0]}-${teams[p[1]]}`)).map((p) => (
              <circle key={`ring${p[0]}${p[1]}`} cx={sx(p[2])} cy={sy(p[3])} r={r + 3.5} fill="none" stroke="#eef1f7" strokeWidth={1.5} />
            ))}
            {a && <circle cx={sx(a[2])} cy={sy(a[3])} r={r + 5} fill="none" stroke="#eef1f7" strokeWidth={2} />}
          </svg>
          {/* direct labels: the named no-huddle offenses in "all", every team in a single season */}
          {points.map((p, i) => {
            const pos = season === "all" ? labelPos.get(`${p[0]}-${teams[p[1]]}`) : p[0] === season ? "right" : undefined;
            if (!pos || i === active) return null;
            const flip = sx(p[2]) > w * 0.8;
            const t = pos === "above" ? "translate(-30%, calc(-100% - 8px))" : pos === "below" ? "translate(-70%, 8px)"
              : `translate(${flip ? "calc(-100% - 7px)" : "7px"}, -50%)`;
            return (
              <span key={i} aria-hidden className={`pointer-events-none absolute whitespace-nowrap font-semibold ${season === "all" ? "rounded bg-night-2/80 px-1 text-[11px] text-ink" : "text-[10px] text-ink-2"}`}
                style={{ left: sx(p[2]), top: sy(p[3]), transform: t }}>
                {season === "all" ? `${p[0]} ${teams[p[1]]}` : teams[p[1]]}
              </span>
            );
          })}
          <span className="pointer-events-none absolute bottom-2 right-2 text-[11px] font-semibold uppercase tracking-wider text-ink-2">Pass-first →</span>
          <span className="pointer-events-none absolute bottom-2 left-2 text-[11px] font-semibold uppercase tracking-wider text-ink-2">← Run-first</span>
          {a && lg && (
            <div className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line bg-night/95 p-2.5 text-xs shadow-xl"
              style={{ left: Math.min(Math.max(sx(a[2]) - 112, 0), w - 224), top: sy(a[3]) > h * 0.5 ? sy(a[3]) - 14 : sy(a[3]) + 14, transform: sy(a[3]) > h * 0.5 ? "translateY(-100%)" : undefined }}>
              <div className="flex items-baseline justify-between">
                <b className="font-display text-lg font-extrabold uppercase tracking-wide">{a[0]} {teams[a[1]]}</b>
                {a[9] === 1 && <span className="text-[10px] font-semibold uppercase tracking-wider text-orange">no-huddle outlier</span>}
              </div>
              <div className="num mt-0.5 text-ink-2">Pass-first {signed(a[2])} · Tempo {signed(a[3])} <span className="text-muted">SD vs {a[0]}</span></div>
              <table className="num mt-1.5 w-full">
                <thead><tr className="text-[10px] uppercase tracking-wider text-muted"><th className="text-left font-semibold" /><th className="text-right font-semibold">Team</th><th className="pl-3 text-right font-semibold">League</th></tr></thead>
                <tbody>
                  <tr><td className="text-ink-2">Early-down pass</td><td className="text-right font-semibold">{pct(a[6])}</td><td className="text-right text-ink-2">{pct(lg[2])}</td></tr>
                  <tr><td className="text-ink-2">Shotgun</td><td className="text-right font-semibold">{pct(a[7])}</td><td className="text-right text-ink-2">{pct(lg[3])}</td></tr>
                  <tr><td className="text-ink-2">No-huddle</td><td className="text-right font-semibold">{pct(a[4])}</td><td className="text-right text-ink-2">{pct(lg[0])}</td></tr>
                  <tr><td className="text-ink-2">Sec between snaps</td><td className="text-right font-semibold">{a[5].toFixed(1)}</td><td className="text-right text-ink-2">{lg[1].toFixed(1)}</td></tr>
                  <tr><td className="text-ink-2">Pass rate vs expected (pts)</td><td className="text-right font-semibold">{a[8] >= 0 ? "+" : "−"}{Math.abs(a[8] * 100).toFixed(1)}</td><td className="text-right text-ink-2">{lg[4] >= 0 ? "+" : "−"}{Math.abs(lg[4] * 100).toFixed(1)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: "#8a95ad" }} />Team-season</span>
        {season !== "all" && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: BLUE }} />{season}</span>}
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: ORANGE }} />No-huddle rate 2+ SD above its season</span>
        <span className="text-muted">Axes in SDs from that season&apos;s average. Hover or tap a dot.</span>
      </div>
    </div>
  );
}
