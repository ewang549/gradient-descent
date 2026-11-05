import { teamChip } from "@/lib/weekly/format";
import type { TeamInfo } from "@/lib/weekly/types";

/** Team abbreviation on its primary color, with an edge that keeps dark colors visible on the night background. */
export function TeamChip({ abbr, team, className = "" }: { abbr: string; team?: TeamInfo; className?: string }) {
  const { bg, fg, border } = teamChip(team);
  return (
    <span className={`inline-flex min-w-11 items-center justify-center rounded-md px-1.5 py-0.5 font-display text-sm font-black tracking-wider ${className}`}
      style={{ background: bg, color: fg, boxShadow: `inset 0 0 0 2px ${border}` }}>
      {abbr}
    </span>
  );
}
