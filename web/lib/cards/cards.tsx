/** The share cards. Each takes one week's export (or a calculator situation) and returns a 1200x675 element. */
import type { EngineOutput, Option } from "@/lib/engine/types";
import { fieldLabel, fmtClock, scoreLabel as calcScoreLabel, type CalcState } from "@/lib/calculator/state";
import { confidenceHex, confidenceLabel } from "@/lib/confidence";
import {
  clockLabel, didPhrase, modelPhrase, opponentLabel, pct, pts, puntStart, scoreLabel,
} from "@/lib/weekly/format";
import type { Call, CoachRow, WeekExport } from "@/lib/weekly/types";
import { C, DISPLAY, Frame, OptionBars, Stat, Tag, TeamChip, gapPts, type BarsData } from "./parts";

const wpOf = (c: Call): Record<Option, number> => ({ go: c.wp_go, punt: c.wp_punt, field_goal: c.wp_fg });

function details(c: Call): BarsData["detail"] {
  return {
    go: `Converts ${pct(c.p_convert)} of the time. ${pts(c.wp_if_convert, 0)}% if it does, ${pts(c.wp_if_fail, 0)}% if stopped`,
    punt: `${c.defteam} starts at ${puntStart(c)} on average`,
    field_goal: c.decision === "field_goal" ? `Makes ${pct(c.p_fg_make)} from here`
      : c.p_fg_make > 0.005 ? `${c.fg_distance}-yard try, makes ${pct(c.p_fg_make)}` : `${c.fg_distance}-yard try, out of range`,
  };
}

function CoachLine({ c, w, size = 26 }: { c: Call; w: WeekExport; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <TeamChip abbr={c.posteam} team={w.teams[c.posteam]} size={size} />
      <div style={{ display: "flex", fontSize: size + 2, fontWeight: 600 }}>{c.coach}</div>
    </div>
  );
}

function Context({ c, size = 22 }: { c: Call; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: size, color: C.ink2 }}>
      <div style={{ display: "flex" }}>{`${clockLabel(c)}  ·  ${scoreLabel(c)} ${opponentLabel(c)}`}</div>
    </div>
  );
}

// ------------------------------------------------------------------------- worst call

export function WorstCallCard({ w, c = w.worst[0] }: { w: WeekExport; c?: Call }) {
  return (
    <Frame eyebrow={`${w.season} · Week ${w.week} · ${w.summary.graded_decisions} graded 4th downs`}
      title={`Worst call of Week ${w.week}`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 480 }}>
          <CoachLine c={c} w={w} />
          <div style={{ display: "flex", marginTop: 18, fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, lineHeight: 1.02,
            textTransform: "uppercase" }}>
            {`${didPhrase(c)} on ${c.situation}`}
          </div>
          <div style={{ display: "flex", marginTop: 12 }}><Context c={c} /></div>
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
            <div style={{ display: "flex", width: 6, borderRadius: 3, backgroundColor: C.orange }} />
            <Stat value={`-${pts(c.wp_lost)}`}
              label={`win-probability points lost vs ${modelPhrase(c.recommendation, true)}`} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 560, padding: "26px 28px",
          borderRadius: 18, backgroundColor: "rgba(21,30,51,0.85)", border: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", fontSize: 14, fontWeight: 700, letterSpacing: 2.5, color: C.muted,
            textTransform: "uppercase", marginBottom: 14 }}>
            {`${c.posteam} win probability by option`}
          </div>
          <OptionBars width={504} data={{ wp: wpOf(c), best: c.recommendation, coach: c.decision, detail: details(c) }} />
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------- top 3

export function Top3Card({ w }: { w: WeekExport }) {
  return (
    <Frame eyebrow={`${w.season} · Week ${w.week} · ${w.summary.graded_decisions} graded 4th downs`}
      title={`The 3 worst calls of Week ${w.week}`}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 12 }}>
        {w.worst.slice(0, 3).map((c, i) => (
          <div key={c.play_uid} style={{ display: "flex", alignItems: "center", flex: 1, padding: "0 24px", borderRadius: 16,
            backgroundColor: "rgba(21,30,51,0.85)", border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", width: 46, fontFamily: DISPLAY, fontWeight: 900, fontSize: 54, color: C.muted }}>{i + 1}</div>
            <div style={{ display: "flex", flexDirection: "column", width: 470, gap: 6 }}>
              <CoachLine c={c} w={w} size={20} />
              <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, textTransform: "uppercase", lineHeight: 1 }}>
                {`${didPhrase(c)} on ${c.situation}`}
              </div>
              <Context c={c} size={17} />
            </div>
            <div style={{ display: "flex", marginLeft: 18 }}>
              <OptionBars compact width={290} data={{ wp: wpOf(c), best: c.recommendation, coach: c.decision }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1 }}>
              <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 900, fontSize: 56, lineHeight: 0.9 }}>{`-${pts(c.wp_lost)}`}</div>
              <div style={{ display: "flex", fontSize: 14, color: C.ink2, marginTop: 4 }}>WP points lost</div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------- leaderboard

function BoardColumn({ title, rows, w, max, color }: { title: string; rows: CoachRow[]; w: WeekExport; max: number; color: string }) {
  const barW = 170;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 528 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, letterSpacing: 2.5,
        color: C.ink2, textTransform: "uppercase", marginBottom: 12 }}>
        <div style={{ display: "flex", width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const team = r.team.split("/").at(-1)!;
          return (
            <div key={r.coach} style={{ display: "flex", alignItems: "center", height: 66, padding: "0 16px", borderRadius: 12,
              backgroundColor: "rgba(21,30,51,0.85)", border: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", width: 34, fontFamily: DISPLAY, fontWeight: 900, fontSize: 26, color: C.muted }}>{r.rank}</div>
              <TeamChip abbr={team} team={w.teams[team]} size={17} />
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 12, width: 168 }}>
                <div style={{ display: "flex", fontSize: 19, fontWeight: 600, lineHeight: 1.1 }}>{r.coach}</div>
                <div style={{ display: "flex", fontSize: 13, color: C.muted }}>{`${r.decisions} calls · went for it ${pct(r.go_rate)}`}</div>
              </div>
              <div style={{ display: "flex", width: barW, height: 10, borderRadius: 10, backgroundColor: C.night2, border: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", width: Math.max((r.wins_lost / max) * (barW - 2), 8), height: 8, borderRadius: 8, backgroundColor: color }} />
              </div>
              <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", fontFamily: DISPLAY, fontWeight: 900, fontSize: 30 }}>
                {r.wins_lost.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeaderboardCard({ w }: { w: WeekExport }) {
  const b = w.leaderboard!;
  const max = Math.max(...b.bottom.map((r) => r.wins_lost));
  return (
    <Frame eyebrow={`${w.season} through Week ${b.through_week} · ${b.qualified} head coaches, min ${b.min_decisions} calls`}
      title="Wins given away on 4th down"
      source={`Wins lost = total win probability given up vs the model's best option on every graded 4th down (1.00 = one full win). Final 30s of each half excluded. Data: nflverse.`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <BoardColumn title="Fewest wins lost" rows={b.top} w={w} max={max} color={C.green} />
        <BoardColumn title="Most wins lost" rows={[...b.bottom].reverse()} w={w} max={max} color={C.orange} />
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------- gutsiest

export function GutsiestCard({ w }: { w: WeekExport }) {
  const c = w.gutsiest!;
  const kick: Option = c.wp_punt >= c.wp_fg ? "punt" : "field_goal";
  const result = c.is_converted ? "Converted" : "Stopped";
  return (
    <Frame eyebrow={`${w.season} · Week ${w.week} · the model agreed`} title={`Gutsiest correct call of Week ${w.week}`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 480 }}>
          <CoachLine c={c} w={w} />
          <div style={{ display: "flex", marginTop: 18, fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, lineHeight: 1.02,
            textTransform: "uppercase" }}>
            {`Went for it on ${c.situation}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
            <Context c={c} />
            <Tag color={c.is_converted ? C.green : C.ink2}>{result}</Tag>
          </div>
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", gap: 28 }}>
            <Stat value={pct(c.expected_go_rate)} label="of coaches go for it in this spot (2018-25)" size={80} width={220} />
            <Stat value={`+${pts(c.wp_go - Math.max(c.wp_punt, c.wp_fg))}`}
              label={`WP points over ${kick === "punt" ? "punting" : "the field goal"}, made or not`} size={80} width={220} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 560, padding: "26px 28px",
          borderRadius: 18, backgroundColor: "rgba(21,30,51,0.85)", border: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", fontSize: 14, fontWeight: 700, letterSpacing: 2.5, color: C.muted,
            textTransform: "uppercase", marginBottom: 14 }}>
            {`${c.posteam} win probability by option`}
          </div>
          <OptionBars width={504} data={{ wp: wpOf(c), best: c.recommendation, coach: c.decision, detail: details(c) }} />
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------- calculator link preview

const VERB: Record<Option, string> = { go: "Go for it", punt: "Punt", field_goal: "Kick the field goal" };

export function CalculatorCard({ s, out }: { s: CalcState; out: EngineOutput }) {
  const wp = { go: out.wp_go, punt: out.wp_punt, field_goal: out.wp_fg };
  const gap = gapPts(wp);
  const color = confidenceHex(gap);
  const togo = s.ydstogo >= s.yardline100 ? "goal" : String(s.ydstogo);
  const receiver = Math.round(100 - out.punt_receiving_yardline_100);
  return (
    <Frame eyebrow="4th down calculator" title={`4th & ${togo} at ${fieldLabel(s.yardline100)}`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 480 }}>
          <div style={{ display: "flex", fontSize: 26, color: C.ink2 }}>
            {`Q${s.qtr} ${fmtClock(s.clock)}  ·  ${calcScoreLabel(s.scoreDiff)}  ·  ${s.venue === "home" ? "Home" : s.venue === "away" ? "Away" : "Neutral"}`}
          </div>
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 700, letterSpacing: 3,
            color: C.ink2, textTransform: "uppercase" }}>
            The call
            <Tag color={color} solid>{confidenceLabel(gap)}</Tag>
          </div>
          <div style={{ display: "flex", marginTop: 6, fontFamily: DISPLAY, fontWeight: 900, fontSize: 92, lineHeight: 0.95,
            textTransform: "uppercase", color }}>
            {VERB[out.recommendation]}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
            <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: 40 }}>{`+${gap.toFixed(1)}`}</div>
            <div style={{ display: "flex", fontSize: 19, color: C.ink2 }}>win-probability points over the next option</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 560, padding: "26px 28px",
          borderRadius: 18, backgroundColor: "rgba(21,30,51,0.85)", border: `1px solid ${C.line}` }}>
          <OptionBars width={504} data={{
            wp, best: out.recommendation, detail: {
              go: `Converts ${pct(out.p_convert)} of the time. ${pts(out.wp_if_convert, 0)}% if it does, ${pts(out.wp_if_fail, 0)}% if stopped`,
              punt: `Opponent starts at ${receiver === 50 ? "midfield" : receiver < 50 ? `their own ${receiver}` : `your ${100 - receiver}`} on average`,
              field_goal: out.p_fg_make > 0.005 ? `${out.fg_distance}-yard try, makes ${pct(out.p_fg_make)}` : `${out.fg_distance}-yard try, out of range`,
            },
          }} />
        </div>
      </div>
    </Frame>
  );
}
