/** The "You Make the Call" share card: the headline, both grade rows, and the two totals. */
import { headline, modeLabel, type Grade, type Result } from "@/lib/play/game";
import { C, DISPLAY, Frame } from "./parts";

const RED = "#ff4d5e";
const GRADE_HEX: Record<Grade, string> = { 0: C.green, 1: C.orange, 2: RED };

function Squares({ grades, label, value }: { grades: Grade[]; label: string; value: string }) {
  const size = grades.length > 5 ? 38 : 56;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ display: "flex", fontSize: 17, fontWeight: 700, letterSpacing: 3, color: C.ink2, textTransform: "uppercase" }}>{label}</div>
        <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 40, lineHeight: 1 }}>{value}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {grades.map((g, k) => (
          <div key={k} style={{ display: "flex", width: size, height: size, borderRadius: 9, backgroundColor: GRADE_HEX[g] }} />
        ))}
      </div>
    </div>
  );
}

export function PlayCard({ r }: { r: Result | null }) {
  if (!r || !r.you_grades.length) {
    return (
      <Frame eyebrow="Real 4th downs from 2025-26" title="You make the call">
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
            <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 84, lineHeight: 0.92, textTransform: "uppercase" }}>
              Can you beat NFL coaches on 4th down?
            </div>
            <div style={{ display: "flex", marginTop: 20, fontSize: 24, color: C.ink2, lineHeight: 1.35 }}>
              Go, punt or kick. Then see the win probability of every option and what the coach really did.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 420 }}>
            {["Go", "Punt", "FG"].map((o, k) => (
              <div key={o} style={{ display: "flex", height: 96, alignItems: "center", justifyContent: "center", borderRadius: 20,
                border: `2px solid ${k === 0 ? C.orange : C.line}`, backgroundColor: C.night2, fontFamily: DISPLAY, fontWeight: 900,
                fontSize: 54, textTransform: "uppercase", letterSpacing: 2, color: k === 0 ? C.orange : C.ink }}>
                {o}
              </div>
            ))}
          </div>
        </div>
      </Frame>
    );
  }
  const d = r.coaches - r.you;
  const color = d >= 0.1 ? C.green : d <= -0.1 ? C.orange : C.ink;
  return (
    <Frame eyebrow={`You make the call · ${modeLabel(r)}`} title={`${r.you_grades.length} real 4th downs`}
      source="Win probability given up vs the model's best option, summed over the calls. Data: nflverse play-by-play.">
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 540 }}>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 86, lineHeight: 0.92, textTransform: "uppercase", color }}>
            {headline(r)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 30, width: 500, padding: "30px 32px", borderRadius: 18,
          backgroundColor: "rgba(21,30,51,0.85)", border: `1px solid ${C.line}` }}>
          <Squares grades={r.you_grades} label="Me" value={`-${r.you.toFixed(1)}%`} />
          <Squares grades={r.coach_grades} label="The real coaches" value={`-${r.coaches.toFixed(1)}%`} />
        </div>
      </div>
    </Frame>
  );
}
