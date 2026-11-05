/** Finding 1 share cards (1200x675). Satori: flexbox only, inline SVG for marks, labels as positioned divs. */
import { type DriftSeries, type OffenseStyle, fmt, fmtSpread } from "@/lib/findings/offenseStyle";
import { C, DISPLAY, Frame } from "./parts";

const BLUE = "#4c8dff";
const ORANGE = "#ff7a45";
const SOURCE = "Neutral snaps (downs 1-3, win prob 20-80%), regular season. Data: nflverse play-by-play.";

// ----------------------------------------------------------------------------- 1. drift

function MiniDrift({ s, last, width, height }: { s: DriftSeries; last: number; width: number; height: number }) {
  const pts = s.points.filter((p) => p.season <= last);
  const lo = Math.max(s.info.unit === "pct" ? 0 : -1e9, Math.min(...pts.map((p) => p.mean - p.sd)));
  const hi = Math.max(...pts.map((p) => p.mean + p.sd));
  const pad = (hi - lo) * 0.08;
  const x = (i: number) => 6 + (i / (pts.length - 1)) * (width - 12);
  const y = (v: number) => height - 6 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (height - 12);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.mean).toFixed(1)}`).join("");
  const band = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.mean + p.sd).toFixed(1)}`).join("") +
    [...pts].reverse().map((p, j) => `L${x(pts.length - 1 - j).toFixed(1)} ${y(p.mean - p.sd).toFixed(1)}`).join("") + "Z";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={C.line} strokeWidth={1.5} />
      <path d={band} fill={BLUE} fillOpacity={0.18} />
      <path d={line} stroke={BLUE} strokeWidth={4} fill="none" strokeLinejoin="round" />
      <circle cx={x(0)} cy={y(pts[0].mean)} r={6} fill={C.night} stroke={BLUE} strokeWidth={3} />
      <circle cx={x(pts.length - 1)} cy={y(pts.at(-1)!.mean)} r={7} fill={BLUE} stroke={C.night} strokeWidth={3} />
    </svg>
  );
}

export function DriftCard({ d }: { d: OffenseStyle }) {
  const panels = d.drift.slice(0, 3);
  const W = 336;
  return (
    <Frame eyebrow={`NFL offenses, ${d.firstSeason}-${d.lastComplete}`} title="The NFL changed together"
      source={`Line = league average. Band = spread between teams (±1 SD, sampling noise removed). ${SOURCE}`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        {panels.map((s) => (
          <div key={s.info.key} style={{ display: "flex", flexDirection: "column", width: W }}>
            <div style={{ display: "flex", fontSize: 19, fontWeight: 600, color: C.ink2, height: 50, lineHeight: 1.25 }}>
              {s.info.key === "go_when_model_says_go" ? "Went for it when the model said go" : s.info.key === "adot" ? "Air yards per pass" : "Snaps from shotgun"}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", fontFamily: DISPLAY, fontWeight: 900, lineHeight: 1, marginTop: 4 }}>
              <div style={{ display: "flex", fontSize: 50, color: C.ink2 }}>{s.info.unit === "yds" ? s.from.mean.toFixed(1) : fmt(s.from.mean, s.info.unit)}</div>
              <div style={{ display: "flex", fontSize: 36, color: C.muted, margin: "0 10px" }}>→</div>
              <div style={{ display: "flex", fontSize: 66, color: C.ink }}>{s.info.unit === "yds" ? s.to.mean.toFixed(1) : fmt(s.to.mean, s.info.unit)}</div>
            </div>
            <div style={{ display: "flex", marginTop: 14 }}>
              <MiniDrift s={s} last={d.lastComplete} width={W} height={190} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: C.muted }}>
              <div style={{ display: "flex" }}>{String(d.firstSeason)}</div>
              <div style={{ display: "flex" }}>{String(d.lastComplete)}</div>
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: 16, color: C.ink2 }}>
              {`The season explains ${Math.round(s.eraShare * 100)}% of the variation`}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ----------------------------------------------------------------------------- 2. the map

export function MapCard({ d }: { d: OffenseStyle }) {
  const W = 660, H = 440;
  const X = [-4.5, 5], Y = [-2.6, 6.2];
  const sx = (v: number) => ((v - X[0]) / (X[1] - X[0])) * W;
  const sy = (v: number) => (1 - (v - Y[0]) / (Y[1] - Y[0])) * H;
  const pts = [...d.map.points].sort((a, b) => a[9] - b[9]);
  const labels = d.map.labeled.map((l) => ({ ...l, p: d.map.points.find((p) => p[0] === l.season && d.map.teams[p[1]] === l.team)! }));
  return (
    <Frame eyebrow={`${d.teamSeasons} NFL offenses, ${d.firstSeason}-${d.lastSeason}, each vs its own season`} title="No offense types. Two dials."
      source={`Axes = first two principal components of 7 style measures, standardized within season. ${SOURCE}`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 380, gap: 22, paddingTop: 6 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 34, textTransform: "uppercase", letterSpacing: 1 }}>Pass-first →</div>
            <div style={{ display: "flex", fontSize: 19, color: C.ink2, lineHeight: 1.35 }}>Pass rate over expected and early-down pass rate</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 34, textTransform: "uppercase", letterSpacing: 1 }}>Tempo ↑</div>
            <div style={{ display: "flex", fontSize: 19, color: C.ink2, lineHeight: 1.35 }}>No-huddle rate and seconds between snaps</div>
          </div>
          <div style={{ display: "flex", fontSize: 19, color: C.ink2, lineHeight: 1.35 }}>
            Offenses fill the map without separate islands. Clustering finds no groups that clearly beat random data.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, color: C.ink2 }}>
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, backgroundColor: ORANGE }} />
            No-huddle rate 2+ SD above its season
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: W, height: H, borderRadius: 14, backgroundColor: C.night2 }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <line x1={sx(0)} x2={sx(0)} y1={0} y2={H} stroke={C.line} strokeWidth={2} />
            <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke={C.line} strokeWidth={2} />
            {pts.map((p, i) => (
              <circle key={i} cx={sx(p[2])} cy={sy(p[3])} r={p[9] ? 6 : 4.5} fill={p[9] ? ORANGE : "#8a95ad"} fillOpacity={p[9] ? 0.95 : 0.45}
                stroke={p[9] ? C.night2 : "none"} strokeWidth={1.5} />
            ))}
            {labels.map((l) => {
              const px = sx(l.p[2]), py = sy(l.p[3]);
              const end = l.pos === "above" ? [px + 14, py - 30] : l.pos === "below" ? [px - 6, py + 20] : null;
              return (
                <g key={`${l.season}${l.team}`}>
                  {end && <line x1={px} y1={py} x2={end[0]} y2={end[1]} stroke={C.ink} strokeWidth={1.5} />}
                  <circle cx={px} cy={py} r={8.5} fill="none" stroke={C.ink} strokeWidth={2} />
                </g>
              );
            })}
          </svg>
          {labels.map((l) => {
            const px = sx(l.p[2]), py = sy(l.p[3]);
            const at = l.pos === "above" ? { left: px + 4, top: py - 52 } : l.pos === "below" ? { left: px - 40, top: py + 20 } : { left: px + 10, top: py - 12 };
            return (
              <div key={`${l.season}${l.team}`} style={{ display: "flex", position: "absolute", ...at, fontSize: 17, fontWeight: 700, color: C.ink }}>
                {`${l.season} ${l.team}`}
              </div>
            );
          })}
          <div style={{ display: "flex", position: "absolute", right: 12, bottom: 8, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: C.ink2, textTransform: "uppercase" }}>Pass-first →</div>
          <div style={{ display: "flex", position: "absolute", left: 12, top: 8, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: C.ink2, textTransform: "uppercase" }}>↑ Faster tempo</div>
        </div>
      </div>
    </Frame>
  );
}

// ----------------------------------------------------------------------------- 3. convergence

export function SpreadCard({ d }: { d: OffenseStyle }) {
  const rows = d.spreadTable;
  const BAR = 300;
  return (
    <Frame eyebrow={`Spread between NFL offenses, ${d.firstSeason}-${String(d.firstSeason + 4).slice(2)} vs ${d.lastComplete - 4}-${String(d.lastComplete).slice(2)}`}
      title="Teams didn't converge"
      source={`Spread = between-team SD with sampling noise removed; test = linear trend ${d.firstSeason}-${d.lastComplete}, significant at p < 0.05. ${SOURCE}`}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 9 }}>
        <div style={{ display: "flex", fontSize: 14, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: C.muted }}>
          <div style={{ display: "flex", width: 330 }}>Measure</div>
          <div style={{ display: "flex", width: BAR + 150 }}>Spread then (gray) and now (blue)</div>
          <div style={{ display: "flex" }}>Verdict</div>
        </div>
        {rows.map((s) => {
          const max = Math.max(s.spread.first5, s.spread.last5);
          const sig = s.spread.significant;
          return (
            <div key={s.info.key} style={{ display: "flex", alignItems: "center", height: 47, borderTop: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", width: 330, fontSize: 21, fontWeight: 600, color: sig ? C.ink : C.ink2 }}>{s.info.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: BAR + 150 }}>
                {[s.spread.first5, s.spread.last5].map((v, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", width: (v / max) * BAR, height: 10, borderRadius: 5, backgroundColor: j ? BLUE : "#3a4663" }} />
                    <div style={{ display: "flex", fontSize: 14, color: j ? C.ink : C.muted }}>{fmtSpread(v, s.info.unit)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", fontSize: 19, fontWeight: 700, color: sig ? C.green : C.ink2 }}>
                {sig ? `${s.spread.last5 < s.spread.first5 ? "More alike" : "More different"} (p = ${s.spread.p.toFixed(3)})` : `No sig. change (p = ${s.spread.p.toFixed(2)})`}
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}
