/** A coach page's link preview: the career numbers and the per-100 trend vs the league. */
import { rates } from "@/lib/coaches/stats";
import type { CoachPage, CoachesIndex } from "@/lib/coaches/types";
import { colorVsLeague } from "@/lib/games/chart";
import { C, DISPLAY, Frame, Stat, TeamChip } from "./parts";

const CW = 560;
const CH = 300;

export function CoachCard({ p, idx }: { p: CoachPage; idx: CoachesIndex }) {
  const latest = p.seasons.at(-1)!.teams.at(-1)!;
  const colors = colorVsLeague(idx.teams[latest]);
  const first = p.seasons[0].season, last = p.seasons.at(-1)!.season;
  const league = idx.league.filter((l) => l.season >= first && l.season <= last);
  const pts = league.map((l) => ({ s: l.season, lg: rates(l).per100, me: (() => { const m = p.seasons.find((x) => x.season === l.season); return m ? rates(m).per100 : null; })() }));
  const max = Math.max(...pts.flatMap((q) => [q.lg, q.me ?? 0])) * 1.1 || 1;
  const x = (i: number) => (pts.length === 1 ? CW / 2 : 10 + (i / (pts.length - 1)) * (CW - 20));
  const y = (v: number) => CH - (v / max) * CH;
  const line = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? "" : `${i && vals[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join("");
  const r = rates(p.career);
  return (
    <Frame eyebrow={`Head coach · 4th downs ${first}-${last}`} title={p.coach}
      source={`Wins lost = win probability given up vs the model's best option. Seasons before ${idx.out_of_sample_from} are in-sample for the WP model. Data: nflverse play-by-play.`}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, width: 460 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {p.teams.map((t) => <TeamChip key={t.team} abbr={t.team} team={idx.teams[t.team]} size={22} />)}
          </div>
          <Stat value={p.career.wins_lost.toFixed(2)} label={`wins given away on ${p.career.decisions} graded 4th downs`} size={84} />
          <div style={{ display: "flex", gap: 40 }}>
            <Stat value={r.per100.toFixed(2)} label="per 100 calls" size={48} width={200} />
            <Stat value={r.aggressiveness === null ? "—" : `${Math.round(r.aggressiveness * 100)}%`} label={`go rate, ${p.career.clear_spots} clear-go spots`} size={48} width={220} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: CW, padding: "22px 0 0" }}>
          <div style={{ display: "flex", gap: 22, fontSize: 17, color: C.ink2, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ display: "flex", width: 22, height: 4, borderRadius: 2, backgroundColor: colors.team }} />{`${p.coach.split(" ").at(-1)}, wins lost per 100`}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ display: "flex", width: 22, height: 4, borderRadius: 2, backgroundColor: colors.league }} />League</div>
          </div>
          <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
            <line x1={0} x2={CW} y1={CH} y2={CH} stroke={C.line} strokeWidth={1.5} />
            <path d={line(pts.map((q) => q.lg))} stroke={colors.league} strokeWidth={3} fill="none" strokeLinejoin="round" />
            <path d={line(pts.map((q) => q.me))} stroke={colors.team} strokeWidth={4} fill="none" strokeLinejoin="round" />
            {pts.map((q, i) => q.me !== null && <circle key={q.s} cx={x(i)} cy={y(q.me)} r={6} fill={colors.team} stroke={C.night} strokeWidth={3} />)}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: C.muted }}>
            <div style={{ display: "flex" }}>{String(first)}</div><div style={{ display: "flex" }}>{String(last)}</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}
