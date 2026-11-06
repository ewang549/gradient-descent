/**
 * Building blocks for the 1200x675 cards. Satori renders a flexbox subset of CSS: every element
 * with more than one child needs display:flex, sizes are px, and there are no class names, so
 * the site's Tailwind tokens are repeated here as constants.
 */
import type { ReactNode } from "react";
import { confidenceHex as confidenceColor } from "@/lib/confidence";
import type { Option } from "@/lib/engine/types";
import { SITE_HOST } from "@/lib/site";
import { BRAND, teamChip } from "@/lib/weekly/format";
import type { TeamInfo } from "@/lib/weekly/types";

export const C = {
  night: "#0d1321",
  night2: "#121a2c",
  panel: "#151e33",
  line: "#24304a",
  ink: "#eef1f7",
  ink2: "#aab3c7",
  muted: "#6b7690",
  orange: "#ff7a45",
  green: "#39d98a",
  barIdle: "#3a4663",
  los: "#4c8dff",
};
export const DISPLAY = "Big Shoulders";
export const SANS = "Instrument Sans";


// ------------------------------------------------------------------------------- the frame

export function Frame({ eyebrow, title, children, source }: {
  eyebrow: string; title: string; children: ReactNode; source?: string;
}) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "44px 56px 34px",
      backgroundColor: C.night, color: C.ink, fontFamily: SANS,
      backgroundImage: "radial-gradient(900px 340px at 50% -120px, rgba(76,141,255,0.16), rgba(13,19,33,0) 70%), " +
        "radial-gradient(600px 260px at 92% 0%, rgba(255,122,69,0.08), rgba(13,19,33,0) 70%)",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 18, fontWeight: 600, letterSpacing: 3.5, color: C.ink2, textTransform: "uppercase" }}>
          {eyebrow}
        </div>
        <div style={{ display: "flex", marginTop: 2, fontFamily: DISPLAY, fontWeight: 900, fontSize: 62, lineHeight: 1,
          textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, marginTop: 26 }}>{children}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 18 }}>
        <div style={{ display: "flex", fontSize: 15, color: C.muted, maxWidth: 860 }}>
          {source ?? `Win probability for the team with the ball. Data: nflverse play-by-play. ${SITE_HOST}`}
        </div>
        <Wordmark />
      </div>
    </div>
  );
}

/** Small "Gradient Descent" mark: three descending bars + the name. */
export function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 18 }}>
        {[18, 12, 6].map((h, i) => (
          <div key={i} style={{ width: 5, height: h, borderRadius: 1.5, backgroundColor: i === 0 ? C.green : C.ink2 }} />
        ))}
      </div>
      <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, lineHeight: 0.9, letterSpacing: 1.5,
        textTransform: "uppercase", color: C.ink2 }}>
        {BRAND}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------- pieces

export function TeamChip({ abbr, team, size = 22 }: { abbr: string; team?: TeamInfo; size?: number }) {
  const { bg, fg, border } = teamChip(team);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", padding: `${size * 0.12}px ${size * 0.4}px`,
      minWidth: size * 2.9, borderRadius: size * 0.3, backgroundColor: bg, border: `2px solid ${border}`, color: fg,
      fontFamily: DISPLAY, fontWeight: 900, fontSize: size, letterSpacing: 1.2, lineHeight: 1.05,
    }}>
      {abbr}
    </div>
  );
}

export function Tag({ children, color, solid }: { children: ReactNode; color: string; solid?: boolean }) {
  return (
    <div style={{
      display: "flex", padding: "2px 9px", borderRadius: 999, fontSize: 13, fontWeight: 700, letterSpacing: 1.6,
      textTransform: "uppercase", border: `1.5px solid ${color}`,
      backgroundColor: solid ? color : "transparent", color: solid ? C.night : color,
    }}>
      {children}
    </div>
  );
}

export const OPTION_ORDER: Option[] = ["go", "punt", "field_goal"];
const LABEL: Record<Option, string> = { go: "Go for it", punt: "Punt", field_goal: "Field goal" };

export interface BarsData {
  wp: Record<Option, number>;
  best: Option;
  coach?: Option;
  detail?: Partial<Record<Option, string>>;
}

/** Gap between the model's pick and the runner-up, in WP points (drives the confidence color). */
export function gapPts(wp: Record<Option, number>): number {
  const v = Object.values(wp).sort((a, b) => b - a);
  return (v[0] - v[1]) * 100;
}

/** The three options as bars on a 0-100% scale, like the calculator. The model's pick takes the
 *  confidence color; every other bar is the same idle gray, so color only ever means "the pick". */
export function OptionBars({ data, width, compact }: { data: BarsData; width: number; compact?: boolean }) {
  const color = confidenceColor(gapPts(data.wp));
  const trackH = compact ? 9 : 16;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 7 : 16, width }}>
      {OPTION_ORDER.map((o) => {
        const winner = o === data.best;
        const wp = data.wp[o];
        return (
          <div key={o} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, textTransform: "uppercase",
                  fontSize: compact ? 18 : 27, letterSpacing: 1.2, color: winner ? C.ink : C.ink2, lineHeight: 1 }}>
                  {compact ? (o === "field_goal" ? "FG" : o === "go" ? "Go" : "Punt") : LABEL[o]}
                </div>
                {!compact && winner && <Tag color={color} solid>Model</Tag>}
                {!compact && data.coach === o && <Tag color={C.ink}>Coach&apos;s call</Tag>}
                {compact && data.coach === o && (
                  <div style={{ display: "flex", fontSize: 12, fontWeight: 700, letterSpacing: 1.4, color: C.ink, textTransform: "uppercase" }}>
                    · coach
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: DISPLAY, fontWeight: 900,
                fontSize: compact ? 22 : 40, lineHeight: 1, color: winner ? color : C.ink2 }}>
                {(wp * 100).toFixed(1)}
                <span style={{ fontSize: compact ? 15 : 24 }}>%</span>
              </div>
            </div>
            <div style={{ display: "flex", marginTop: compact ? 4 : 8, width, height: trackH, borderRadius: trackH,
              backgroundColor: C.night2, border: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", width: Math.max(wp * (width - 2), trackH), height: trackH - 2,
                borderRadius: trackH, backgroundColor: winner ? color : C.barIdle }} />
            </div>
            {!compact && data.detail?.[o] && (
              <div style={{ display: "flex", marginTop: 6, fontSize: 17, color: C.ink2 }}>{data.detail[o]}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Stat({ value, label, color = C.ink, size = 92, width = 440 }: {
  value: string; label: string; color?: string; size?: number; width?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 0.9, color }}>{value}</div>
      <div style={{ display: "flex", marginTop: 6, fontSize: 19, color: C.ink2, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}
