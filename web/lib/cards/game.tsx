/** A game's link preview: the scoreline, the WP chart with every 4th down on it, and the coaches' WP lost. */
import { GRADE_HEX, areaPaths, callGrade, domain, linePaths, linePoints, points, teamColors } from "@/lib/games/chart";
import { finalLabel, weekLabel } from "@/lib/games/format";
import type { GameExport } from "@/lib/games/types";
import { pts } from "@/lib/weekly/format";
import { C, DISPLAY, Frame, TeamChip } from "./parts";

const CW = 1088;
const CH = 300;
const LABEL_H = 30;
const LABEL_GAP = 26; // dot center to the label's near edge

/** A labeled 4th down on the chart (the TNF post card labels the costliest and best calls). */
export interface Callout { playSeq: number; text: string; color: string }

/** Satori can't measure text before layout, so the label width is estimated (Instrument Sans 600 at 17px). */
const labelWidth = (text: string) => Math.round(text.length * 8.6 + 28);

export function GameCard({ g, eyebrow, callouts = [] }: { g: GameExport; eyebrow?: string; callouts?: Callout[] }) {
  const colors = teamColors(g.home, g.away);
  const p = points(g);
  const line = linePaths(linePoints(g, p), CW, CH);
  const area = areaPaths(linePoints(g, p), CW, CH);
  const final = p.at(-1)!;
  const total = domain(g);
  const idx = new Map(g.series.play_seq.map((s, i) => [s, i]));
  const placed: (Callout & { cx: number; cy: number; w: number; left: number; top: number; lineTo: number })[] = [];
  for (const co of callouts) {
    const i = idx.get(co.playSeq);
    if (i === undefined) continue;
    const cx = p[i].x * CW, cy = p[i].y * CH;
    const below = cy < CH / 2; // label on the side with more room
    const w = labelWidth(co.text);
    const left = Math.min(Math.max(cx - w / 2, 0), CW - w);
    let top = below ? cy + LABEL_GAP : cy - LABEL_GAP - LABEL_H;
    // Step away from the dot until the label clears every label already placed.
    const hits = (t: number) => placed.some((o) => left < o.left + o.w + 8 && o.left < left + w + 8 && t < o.top + LABEL_H + 8 && o.top < t + LABEL_H + 8);
    while (hits(top)) top += below ? LABEL_H + 10 : -(LABEL_H + 10);
    placed.push({ ...co, cx, cy, w, left, top, lineTo: below ? top : top + LABEL_H });
  }
  const lost = (team: string) => g.fourth_downs.filter((f) => f.is_graded && f.posteam === team).reduce((a, f) => a + (f.wp_lost ?? 0), 0);

  return (
    <Frame eyebrow={eyebrow ?? `${g.season} · ${weekLabel(g)} · ${finalLabel(g)}`} title={`${g.away.team} ${g.away.score} at ${g.home.team} ${g.home.score}`}
      source={`${g.home.team} win probability before every snap${g.went_to_overtime ? " (overtime: result only)" : ""}. Data: nflverse play-by-play.`}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 28 }}>
            {[g.away, g.home].map((s) => (
              <div key={s.team} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <TeamChip abbr={s.team} team={s} size={20} />
                <div style={{ display: "flex", fontSize: 20, color: C.ink2 }}>{`${s.coach}: -${pts(lost(s.team))} WP pts on 4th down`}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", marginTop: 18, width: CW, height: CH }}>
          <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
            {[1, 2, 3].map((q) => <line key={q} x1={(q / 4 / total) * CW} x2={(q / 4 / total) * CW} y1={0} y2={CH} stroke={C.line} strokeWidth={1.5} />)}
            {g.went_to_overtime && <rect x={CW / total} y={0} width={CW - CW / total} height={CH} fill={C.night2} />}
            <path d={area.above} fill={colors.home} fillOpacity={0.16} />
            <path d={area.below} fill={colors.away} fillOpacity={0.16} />
            <line x1={0} x2={CW} y1={CH / 2} y2={CH / 2} stroke={C.muted} strokeWidth={1.5} />
            <path d={line.above} stroke={colors.home} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={line.below} stroke={colors.away} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {g.went_to_overtime && <circle cx={final.x * CW - 9} cy={Math.min(Math.max(final.y * CH, 9), CH - 9)} r={7}
              fill={final.y < 0.5 ? colors.home : colors.away} stroke={C.night} strokeWidth={3} />}
            {g.fourth_downs.map((fd) => {
              const i = idx.get(fd.play_seq);
              if (i === undefined) return null;
              return <circle key={fd.play_seq} cx={p[i].x * CW} cy={p[i].y * CH} r={8} fill={GRADE_HEX[callGrade(fd)]} stroke={C.night} strokeWidth={3} />;
            })}
            {placed.map((co) => (
              <g key={co.playSeq}>
                <line x1={co.cx} y1={co.cy + (co.lineTo > co.cy ? 13 : -13)} x2={co.cx} y2={co.lineTo} stroke={co.color} strokeWidth={2} />
                <circle cx={co.cx} cy={co.cy} r={13} fill="none" stroke={co.color} strokeWidth={2.5} />
              </g>
            ))}
          </svg>
          {placed.map((co) => (
            <div key={co.playSeq} style={{ display: "flex", position: "absolute", left: co.left, top: co.top, width: co.w, height: LABEL_H,
              alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: C.night, border: `2px solid ${co.color}`,
              fontSize: 17, fontWeight: 600, color: C.ink }}>{co.text}</div>
          ))}
          <div style={{ display: "flex", position: "absolute", left: 10, top: 6, fontSize: 16, fontWeight: 700, letterSpacing: 2, color: C.ink2 }}>{`${g.home.team} WINS`}</div>
          <div style={{ display: "flex", position: "absolute", left: 10, bottom: 6, fontSize: 16, fontWeight: 700, letterSpacing: 2, color: C.ink2 }}>{`${g.away.team} WINS`}</div>
        </div>
        <div style={{ display: "flex", marginTop: 12, gap: 22, fontSize: 16, color: C.ink2 }}>
          {([["right", "Matched the model"], ["small", "Lost under 2 WP pts"], ["big", "Lost 2+ WP pts"]] as const).map(([k, l]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, backgroundColor: GRADE_HEX[k] }} />{l}
            </div>
          ))}
          <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: C.muted, marginLeft: "auto" }}>
            {`${g.fourth_downs.filter((f) => f.is_graded).length} graded 4th downs`}
          </div>
        </div>
      </div>
    </Frame>
  );
}
