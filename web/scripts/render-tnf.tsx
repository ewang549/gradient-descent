/**
 * Thursday Night Football cards from `python -m analysis.tnf SEASON WEEK`:
 *
 *   npm run tnf -- 2026 9    docs/launch/tnf_week09/tnf.json -> game.png + (worst-call.png | best-call.png)
 *
 * game.png: the game's WP chart with every 4th down graded, the costliest call labeled (and the best
 * call, when it's a different play). The call card reuses the weekly worst-call / gutsiest layouts,
 * retitled for TNF. tnf.json has the weekly export's shape, scoped to the one game.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GutsiestCard, WorstCallCard } from "@/lib/cards/cards";
import { type Callout, GameCard } from "@/lib/cards/game";
import { renderPng } from "@/lib/cards/render";
import { GRADE_HEX, callGrade } from "@/lib/games/chart";
import { loadGame } from "@/lib/games/data";
import { pts } from "@/lib/weekly/format";
import type { Call, WeekExport } from "@/lib/weekly/types";

type TnfExport = WeekExport & { game_id: string; pick: "worst" | "best" };

const lastName = (coach: string) => coach.split(" ").slice(1).join(" ") || coach;
const VERB = { go: "go", punt: "punt", field_goal: "FG" } as const;

async function main() {
  const [season, week] = process.argv.slice(2).map(Number);
  if (!season || !week) throw new Error("usage: npm run tnf -- SEASON WEEK");
  const dir = path.join(process.cwd(), "..", "docs", "launch", `tnf_week${String(week).padStart(2, "0")}`);
  const t: TnfExport = JSON.parse(readFileSync(path.join(dir, "tnf.json"), "utf8"));
  const g = loadGame(season, t.game_id);
  if (!g) throw new Error(`exports/games/${season}/${t.game_id}.json missing; run make refresh`);

  // The weekly calls carry play_uid; the game export's 4th downs carry play_seq. Same play = same quarter, clock, offense.
  const seqOf = (c: Call) => {
    const fd = g.fourth_downs.find((f) => f.qtr === c.qtr && f.clock === c.clock && f.posteam === c.posteam);
    if (!fd) throw new Error(`no 4th down in ${t.game_id} matches ${c.posteam} Q${c.qtr} ${c.clock}`);
    return fd;
  };
  const worst = t.worst[0];
  const best = t.best[0];
  const callouts: Callout[] = [];
  if (worst) {
    const fd = seqOf(worst);
    callouts.push({ playSeq: fd.play_seq, color: GRADE_HEX[callGrade(fd)],
      text: `Costliest: ${lastName(worst.coach)} ${VERB[worst.decision]}, ${worst.situation}, -${pts(worst.wp_lost)}` });
  }
  if (best && best.play_uid !== worst?.play_uid) {
    const margin = best.wp_go - Math.max(best.wp_punt, best.wp_fg);
    callouts.push({ playSeq: seqOf(best).play_seq, color: GRADE_HEX.right,
      text: best.decision === "go" ? `Best: ${lastName(best.coach)} go, ${best.situation}, +${pts(margin)}`
        : `Best: ${lastName(best.coach)} ${VERB[best.decision]}, ${best.situation}` });
  }

  const scoreline = `${g.away.team} ${g.away.score} at ${g.home.team} ${g.home.score}`;
  const eyebrow = `TNF · ${season} Week ${week} · ${scoreline} · ${t.summary.graded_decisions} graded 4th downs`;
  const out: [string, Buffer][] = [
    ["game.png", await renderPng(<GameCard g={g} eyebrow={`Thursday Night Football · ${season} Week ${week} · Final`} callouts={callouts} />)],
  ];
  if (t.pick === "worst") {
    out.push(["worst-call.png", await renderPng(<WorstCallCard w={t} c={worst} eyebrow={eyebrow} title="Worst call of TNF" />)]);
  } else if (best?.decision === "go") {
    out.push(["best-call.png", await renderPng(<GutsiestCard w={t} c={best} eyebrow={eyebrow} title="Best call of TNF" />)]);
  } else {
    throw new Error("the best call is a kick; the gutsiest layout only fits go calls, so there's no best-call card design for it yet");
  }
  for (const [name, png] of out) writeFileSync(path.join(dir, name), png);
  console.log(`${t.game_id}: ${out.map(([n]) => n).join(", ")} -> ${path.relative(process.cwd(), dir)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
