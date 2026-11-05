/**
 * Go rate by yards to go, as a dot plot on one 0-100% scale: the coach, the league in the same
 * seasons, and what the model would have done in the coach's own spots. Every row shows its n.
 */
import type { Bucket } from "@/lib/coaches/types";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Buckets({ buckets, colors, coachLabel, min }: {
  buckets: Bucket[]; colors: { team: string; league: string }; coachLabel: string; min: number;
}) {
  const MODEL = "#39d98a";
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: colors.team }} />{coachLabel}</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: colors.league }} />League, same seasons</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rotate-45 rounded-[2px] border-2" style={{ borderColor: MODEL }} />Model, in the same spots</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
          <tr><th className="w-16 py-1 font-semibold">To go</th><th className="font-semibold"><span className="sr-only">Go rates</span></th><th className="w-24 text-right font-semibold">Coach / lg</th></tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.bucket} className="border-t border-line">
              <td className="py-2.5">
                <div className="font-display text-lg font-extrabold">{b.bucket}</div>
                <div className="num text-[10px] text-muted">n={b.n}</div>
              </td>
              <td className="px-2">
                <div className="relative h-5">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
                  {[0, 0.5, 1].map((t) => <div key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line" style={{ left: `${t * 100}%` }} />)}
                  <i className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel" title={`League ${pct(b.league_go_rate)} (n=${b.league_n})`}
                    style={{ left: `${b.league_go_rate * 100}%`, background: colors.league }} />
                  {b.model_go_rate !== null && (
                    <i className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2" title={`Model ${pct(b.model_go_rate)}`}
                      style={{ left: `${b.model_go_rate * 100}%`, borderColor: MODEL }} />
                  )}
                  {b.go_rate !== null && (
                    <i className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel" title={`${coachLabel} ${pct(b.go_rate)} (n=${b.n})`}
                      style={{ left: `${b.go_rate * 100}%`, background: colors.team }} />
                  )}
                </div>
              </td>
              <td className="num text-right text-xs">
                {b.go_rate === null ? <span className="text-muted">n &lt; {min}</span> : <><b className="text-sm">{pct(b.go_rate)}</b> <span className="text-ink-2">/ {pct(b.league_go_rate)}</span></>}
                {b.model_go_rate !== null && <div className="text-[10px] text-muted">model {pct(b.model_go_rate)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex justify-between pl-16 pr-24 text-[10px] text-muted" aria-hidden><span>0%</span><span>50%</span><span>100%</span></div>
    </div>
  );
}
