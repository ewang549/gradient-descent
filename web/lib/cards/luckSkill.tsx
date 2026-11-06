/** Finding 2 share cards (1200x675). Satori: flexbox only, inline SVG for marks, labels as positioned divs. */
import { COLORS, type LuckSkill, type VsTeam, pct, record, stamp } from "@/lib/findings/luckSkill";
import { C, DISPLAY, Frame } from "./parts";

const SOURCE = "NFL regular seasons 2006-2025, split after each team's 8th game. Data: nflverse.";

function Stat({ v, l, color }: { v: string; l: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 64, lineHeight: 1, color: color ?? C.ink }}>{v}</div>
      <div style={{ display: "flex", fontSize: 19, color: C.ink2, lineHeight: 1.3, marginTop: 4 }}>{l}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------- 1. regression by record

export function RegressionCard({ d }: { d: LuckSkill }) {
  const W = 640, H = 400, PAD = 28;
  const rows = d.byRecord;
  const x = (i: number) => PAD + ((i + 0.5) / rows.length) * (W - PAD);
  const y = (v: number) => 10 + (1 - v) * (H - 20);
  const hotFrom = rows.findIndex((r) => r.wins >= 6);
  return (
    <Frame eyebrow={`Win% by record after 8 games, ${d.teamSeasons} NFL team-seasons ${d.firstSeason}-${d.lastSeason}`} title="Hot starts cool off" source={SOURCE}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 380, gap: 26, paddingTop: 4 }}>
          <Stat v={`${pct(d.hot.first_win_pct)} → ${pct(d.hot.rest_win_pct)}`} l={`Teams that started 6-2 or better (${d.hot.n}): first 8 games, then the rest of the season`} />
          <Stat v={`${pct(d.cold.first_win_pct)} → ${pct(d.cold.rest_win_pct)}`} l={`Teams that started 2-6 or worse (${d.cold.n})`} color={C.ink2} />
          <div style={{ display: "flex", fontSize: 19, color: C.ink2, lineHeight: 1.35 }}>Every record moves back toward .500. A forecast that keeps a team on its current pace is worse than calling everyone .500.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: W }}>
          <div style={{ display: "flex", gap: 22, fontSize: 16, color: C.ink2, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, border: `3px solid ${C.ink2}` }} />First 8 games</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, backgroundColor: C.ink }} />Rest of the season</div>
          </div>
          <div style={{ display: "flex", position: "relative", width: W, height: H }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <rect x={x(hotFrom) - (W - PAD) / rows.length / 2} y={0} width={((W - PAD) / rows.length) * (rows.length - hotFrom)} height={H} rx={10} fill={COLORS.pointDiff} fillOpacity={0.1} />
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <line key={t} x1={PAD} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0.5 ? "#6b7690" : C.line} strokeWidth={t === 0.5 ? 2 : 1.5} strokeDasharray={t === 0.5 ? "7 6" : undefined} />
              ))}
              {rows.map((r, i) => (
                <g key={r.wins}>
                  <line x1={x(i)} x2={x(i)} y1={y(r.first_win_pct)} y2={y(r.rest_win_pct)} stroke={C.ink2} strokeOpacity={0.6} strokeWidth={3} />
                  <circle cx={x(i)} cy={y(r.first_win_pct)} r={8} fill={C.night} stroke={C.ink2} strokeWidth={3} />
                  <circle cx={x(i)} cy={y(r.rest_win_pct)} r={9} fill={C.ink} stroke={C.night} strokeWidth={2.5} />
                </g>
              ))}
            </svg>
            {[0, 0.5, 1].map((t) => (
              <div key={t} style={{ display: "flex", position: "absolute", left: -18, top: y(t) - 10, fontSize: 14, color: C.muted }}>{pct(t)}</div>
            ))}
            {rows.map((r, i) => (
              <div key={r.wins} style={{ display: "flex", position: "absolute", left: x(i) - 20, width: 40, justifyContent: "center", top: H + 6, fontSize: 15, color: r.wins >= 6 ? C.ink : C.muted, fontWeight: 600 }}>
                {`${r.wins}-${r.losses}`}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ----------------------------------------------------------------------------- 2. luck scatter

export function LuckCard({ d }: { d: LuckSkill }) {
  const S = 430, L = 0.4;
  const sx = (v: number) => ((v + L) / (2 * L)) * S;
  const sy = (v: number) => (1 - (v + L) / (2 * L)) * S;
  return (
    <Frame eyebrow={`Record minus Pythagorean record, ${d.luck.n} NFL team-seasons ${d.firstSeason}-${d.lastSeason}`} title="Luck doesn't carry over" source={`Pythagorean win% = PF^2.37 / (PF^2.37 + PA^2.37). ${SOURCE}`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 470, gap: 24, paddingTop: 4 }}>
          <Stat v={`r = ${d.luck.r.toFixed(2)}`} l={`Correlation between luck in the first 8 games and luck after. 95% CI ${d.luck.ci[0].toFixed(2)} to ${d.luck.ci[1].toFixed(2)}.`} />
          <div style={{ display: "flex", fontSize: 21, color: C.ink2, lineHeight: 1.4 }}>
            Luck = how much better a team&apos;s record is than its points scored and allowed predict. Mostly close games. Teams that had it early were no luckier than anyone after.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", position: "relative", width: S, height: S, borderRadius: 14, backgroundColor: C.night2 }}>
            <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
              <line x1={sx(0)} x2={sx(0)} y1={0} y2={S} stroke="#3a4663" strokeWidth={2} />
              <line x1={0} x2={S} y1={sy(0)} y2={sy(0)} stroke="#3a4663" strokeWidth={2} />
              {d.luck.points.map((p, i) => <circle key={i} cx={sx(p[2])} cy={sy(p[3])} r={4} fill={COLORS.pointDiff} fillOpacity={0.45} />)}
              <line x1={0} x2={S} y1={sy(-L * d.luck.slope)} y2={sy(L * d.luck.slope)} stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
            </svg>
            <div style={{ display: "flex", position: "absolute", right: 12, top: sy(L * d.luck.slope) - 30, fontSize: 16, fontWeight: 700, color: C.ink }}>Best fit: flat</div>
            <div style={{ display: "flex", position: "absolute", right: 12, bottom: 8, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: C.ink2, textTransform: "uppercase" }}>Luckier, first 8 →</div>
            <div style={{ display: "flex", position: "absolute", left: 12, top: 8, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: C.ink2, textTransform: "uppercase" }}>↑ Luckier, rest of season</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ----------------------------------------------------------------------------- 3. the 2026 calls

function CallColumn({ rows, dir }: { rows: VsTeam[]; dir: "up" | "down" }) {
  const color = dir === "up" ? COLORS.pointDiff : COLORS.record;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
      <div style={{ display: "flex", fontSize: 17, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color }}>
        {dir === "up" ? "Beat their regressed record" : "Fall short of it"}
      </div>
      <div style={{ display: "flex", fontSize: 14, color: C.muted, marginTop: 6, letterSpacing: 1.2, textTransform: "uppercase" }}>
        <div style={{ display: "flex", width: 90 }}>Team</div>
        <div style={{ display: "flex", width: 90 }}>Record</div>
        <div style={{ display: "flex", width: 210 }}>Rest-of-season wins</div>
        <div style={{ display: "flex", width: 110, justifyContent: "flex-end" }}>P(beats)</div>
      </div>
      {rows.map((t) => (
        <div key={t.team} style={{ display: "flex", alignItems: "center", height: 52, borderTop: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", width: 90, fontFamily: DISPLAY, fontWeight: 900, fontSize: 30, letterSpacing: 1 }}>{t.team}</div>
          <div style={{ display: "flex", width: 90, fontSize: 20, color: C.ink2 }}>{record(t.wins, t.losses)}</div>
          <div style={{ display: "flex", width: 210, fontSize: 20, alignItems: "center", gap: 8 }}>
            <span style={{ color: C.ink2 }}>{t.baseline_rest_wins.toFixed(1)}</span>
            <span style={{ color: C.muted, fontSize: 18 }}>→</span>
            <span style={{ color: C.ink, fontWeight: 700 }}>{t.point_diff_rest_wins.toFixed(1)}</span>
          </div>
          <div style={{ display: "flex", width: 110, justifyContent: "flex-end", fontSize: 22, fontWeight: 700, color }}>{pct(t.p_beats_baseline)}</div>
        </div>
      ))}
    </div>
  );
}

export function CallsCard({ d }: { d: LuckSkill }) {
  return (
    <Frame eyebrow={`2026, through week ${d.vs.data_through_week}: where point differential and the record disagree most`} title="On the record for 2026"
      source={`Wins over the remaining games: regressed record → point differential. Recorded ${stamp(d.vs.generated_at)}, graded after week 18. Data: nflverse.`}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
          <CallColumn rows={d.up} dir="up" />
          <CallColumn rows={d.down} dir="down" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 18px", borderRadius: 12, backgroundColor: C.night2, border: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 40, lineHeight: 1 }}>{pct(d.highlightRule.hitRate)}</div>
          <div style={{ display: "flex", fontSize: 19, color: C.ink2, lineHeight: 1.3, maxWidth: 900 }}>
            {`The same rule on every season ${d.firstSeason}-${d.lastSeason}: point differential's side won ${pct(d.highlightRule.hitRate)} of ${d.highlightRule.calls} calls (95% CI ${pct(d.highlightRule.ci[0])} to ${pct(d.highlightRule.ci[1])}).`}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ----------------------------------------------------------------------------- 4. results (after week 18)

export function ResultsCard({ d }: { d: LuckSkill }) {
  const g = d.grades!.vs_baseline!;
  const m = g.rule_1_mae;
  const h = g.rule_2_highlighted;
  const bars = [
    { label: "Regressed record (baseline)", v: m.baseline, color: COLORS.record },
    { label: "Point differential", v: m.point_diff, color: COLORS.pointDiff },
    { label: "Betting market", v: m.market, color: COLORS.market },
    { label: "Same pace (reference)", v: m.same_pace, color: "#3a4663" },
  ];
  const max = Math.max(...bars.map((b) => b.v));
  const notFinal = !d.grades!.final;
  return (
    <Frame eyebrow={`2026 rest-of-season calls, recorded ${stamp(d.vs.generated_at)}`} title={notFinal ? "Results (not final)" : "The 2026 results"}
      source={`${notFinal ? `${d.grades!.status}. ` : ""}Average miss in rest-of-season wins over 32 teams. Graded by the rules written into the file. Data: nflverse.`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 640, gap: 16 }}>
          <div style={{ display: "flex", fontSize: 17, fontWeight: 700, letterSpacing: 1.5, color: C.ink2, textTransform: "uppercase" }}>Average miss, wins per team (lower is better)</div>
          {bars.map((b) => (
            <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", fontSize: 19, color: C.ink2 }}>{b.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", width: (b.v / max) * 480, height: 22, borderRadius: 4, backgroundColor: b.color }} />
                <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{b.v.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 380, gap: 22 }}>
          <Stat v={`${h.hits} of ${h.of}`} l={`highlighted calls went point differential's way (expected ${h.expected.toFixed(1)}, chance ${h.chance})`} />
          <Stat v={m.point_diff_beats_baseline ? "Passed" : "Failed"} l="Point differential missed by less than the regressed record" color={m.point_diff_beats_baseline ? C.green : C.orange} />
        </div>
        {notFinal && (
          <div style={{ display: "flex", position: "absolute", left: 260, top: 150, fontFamily: DISPLAY, fontWeight: 900, fontSize: 120, color: C.orange, opacity: 0.28, letterSpacing: 8, transform: "rotate(-12deg)" }}>
            {d.grades!.simulated ? "SIMULATED" : "NOT FINAL"}
          </div>
        )}
      </div>
    </Frame>
  );
}
