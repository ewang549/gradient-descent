/** A game's link preview: the scoreline, the WP chart with every 4th down on it, and the coaches' WP lost. */
import { GRADE_HEX, areaPaths, callGrade, domain, linePaths, linePoints, points, teamColors } from "@/lib/games/chart";
import { finalLabel, weekLabel } from "@/lib/games/format";
import type { GameExport } from "@/lib/games/types";
import { pts } from "@/lib/weekly/format";
import { C, DISPLAY, Frame, TeamChip } from "./parts";

const CW = 1088;
const CH = 300;

export function GameCard({ g }: { g: GameExport }) {
  const colors = teamColors(g.home, g.away);
  const p = points(g);
  const line = linePaths(linePoints(g, p), CW, CH);
  const area = areaPaths(linePoints(g, p), CW, CH);
  const final = p.at(-1)!;
  const total = domain(g);
  const idx = new Map(g.series.play_seq.map((s, i) => [s, i]));
  const lost = (team: string) => g.fourth_downs.filter((f) => f.is_graded && f.posteam === team).reduce((a, f) => a + (f.wp_lost ?? 0), 0);

  return (
    <Frame eyebrow={`${g.season} · ${weekLabel(g)} · ${finalLabel(g)}`} title={`${g.away.team} ${g.away.score} at ${g.home.team} ${g.home.score}`}
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
          </svg>
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
