/** A coach's best or worst calls, each linking to its game and to the calculator. */
import Link from "next/link";
import { fromEngineInput, toQuery } from "@/lib/calculator/state";
import type { CoachCall } from "@/lib/coaches/types";
import { gamePath } from "@/lib/games/chart";
import { hasGame } from "@/lib/games/data";
import { OPTION_LABEL, OPTION_SHORT, pts } from "@/lib/weekly/format";

const when = (c: CoachCall) => `${c.season} wk ${c.week} · Q${c.qtr} ${Number(c.clock.split(":")[0])}:${c.clock.split(":")[1]}`;
const score = (c: CoachCall) => {
  const d = c.posteam_score - c.defteam_score;
  return d === 0 ? "tied" : d > 0 ? `up ${d}` : `down ${-d}`;
};

export function Calls({ calls, kind, outOfSampleFrom }: { calls: CoachCall[]; kind: "worst" | "best"; outOfSampleFrom: number }) {
  if (!calls.length) return <p className="text-sm text-muted">None yet.</p>;
  return (
    <ol>
      {calls.map((c, i) => (
        <li key={c.play_uid} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 border-t border-line py-2.5 first:border-t-0">
          <span className="font-display text-xl font-black text-muted">{i + 1}</span>
          <div className="min-w-0 text-sm">
            <div><b>{OPTION_LABEL[c.decision]}</b> on {c.situation}, {score(c)} vs {c.defteam}</div>
            <div className="text-xs text-ink-2">
              {when(c)}{c.season < outOfSampleFrom && <span className="text-yellow"> (in-sample)</span>} · Go {pts(c.wp_go)}% · Punt {pts(c.wp_punt)}% · FG {pts(c.wp_fg)}%
              {kind === "worst" && <> · model: {OPTION_SHORT[c.recommendation]}</>}
              {kind === "best" && <> · {Math.round(c.expected_go_rate * 100)}% of coaches go here</>}
            </div>
            <div className="mt-0.5 flex gap-3 text-xs font-semibold">
              {hasGame(c.season, c.game_id) && <Link href={gamePath(c.season, c.game_id)} className="text-ink-2 hover:text-ink hover:underline">Game</Link>}
              <Link href={`/calculator?${toQuery(fromEngineInput(c.input, null))}`} className="text-los hover:underline">Calculator →</Link>
            </div>
          </div>
          <div className="num text-right">
            <div className="font-display text-xl font-black leading-none">{kind === "worst" ? `-${pts(c.wp_lost)}` : `+${pts(c.value_vs_typical)}`}</div>
            <div className="text-[11px] text-muted">{kind === "worst" ? "WP pts lost" : "vs typical call"}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
