"use client";
/**
 * Sortable coach leaderboard. The server hands over compact per-coach-season counts; picking a
 * season or a range adds them up here, so every view is exact (no averaging of averages).
 * The view lives in the URL (?s=2025&sort=per100) so it can be linked.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { TeamChip } from "@/components/TeamChip";
import { coachPath, rates, sum } from "@/lib/coaches/stats";
import type { Counts } from "@/lib/coaches/types";
import type { TeamInfo } from "@/lib/weekly/types";

/** [coach index, season, teams "SF/LV", decisions, go, clear_spots, clear_go, agreed, wins_lost, wins_lost_kicking] */
export type Row = [number, number, string, number, number, number, number, number, number, number];

interface Props {
  coaches: { slug: string; coach: string; page: boolean }[];
  rows: Row[];
  seasons: number[];
  outOfSampleFrom: number;
  minSeason: number;
  minRange: number;
  teams: Record<string, TeamInfo>;
}

type SortKey = "wins_lost" | "per100" | "decisions" | "goRate" | "aggressiveness" | "agreed";
const COLUMNS: { key: SortKey; label: string; title: string; asc: boolean; short?: string; hideOnPhone?: boolean }[] = [
  { key: "decisions", label: "Calls", short: "Calls", title: "Graded 4th-down decisions (the sample size)", asc: false },
  { key: "wins_lost", label: "Wins lost", short: "Wins", title: "Sum of win probability lost vs the model's best option (1.00 = one win)", asc: true },
  { key: "per100", label: "Per 100", short: "/100", title: "Wins lost per 100 graded calls: compares coaches with different sample sizes", asc: true },
  { key: "aggressiveness", label: "Aggressive", short: "Aggr", title: "Go rate on clear-go spots (going worth 1+ WP point more); n = clear-go spots", asc: false },
  { key: "goRate", label: "Go rate", hideOnPhone: true, title: "Share of all graded calls where the coach went for it", asc: false },
  { key: "agreed", label: "Agreed", hideOnPhone: true, title: "Share of calls matching the model's best option", asc: false },
];

const toCounts = (r: Row): Counts => ({
  decisions: r[3], go: r[4], clear_spots: r[5], clear_go: r[6], agreed: r[7], wins_lost: r[8], wins_lost_kicking: r[9],
});

function parseView(q: URLSearchParams, seasons: number[], oos: number) {
  const last = seasons.at(-1)!;
  const s = q.get("s") ?? String(last);
  const range: [number, number] =
    s === "all" ? [seasons[0], last] : s === "oos" ? [oos, last] : /^\d{4}$/.test(s) && seasons.includes(Number(s)) ? [Number(s), Number(s)] : [last, last];
  const key = (["wins_lost", "per100", "decisions", "goRate", "aggressiveness", "agreed"] as SortKey[]).find((k) => k === q.get("sort"))
    ?? (range[0] === range[1] ? "wins_lost" : "per100");
  const col = COLUMNS.find((c) => c.key === key)!;
  const asc = q.get("dir") ? q.get("dir") === "asc" : col.asc;
  return { s, range, key, asc };
}

/** "K. Stefanski": phones keep the numbers on screen. */
const short = (name: string) => {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : name;
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function Leaderboard({ coaches, rows, seasons, outOfSampleFrom, minSeason, minRange, teams }: Props) {
  const q = useSearchParams();
  const pathname = usePathname();
  const view = parseView(new URLSearchParams(q.toString()), seasons, outOfSampleFrom);
  const multi = view.range[0] !== view.range[1];
  const min = multi ? minRange : minSeason;
  const inSample = view.range[0] < outOfSampleFrom;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(q.toString());
    for (const [k, v] of Object.entries(patch)) if (v === null) next.delete(k); else next.set(k, v);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  const table = useMemo(() => {
    const by = new Map<number, Row[]>();
    for (const r of rows) if (r[1] >= view.range[0] && r[1] <= view.range[1]) by.set(r[0], [...(by.get(r[0]) ?? []), r]);
    const all = [...by.entries()].map(([ci, rs]) => {
      const c = sum(rs.map(toCounts));
      const teamList = [...new Set(rs.flatMap((r) => r[2].split("/")))];
      return { ci, c, r: rates(c), teamList, latest: rs.at(-1)![2].split("/").at(-1)! };
    });
    const value = (x: (typeof all)[number]): number => {
      switch (view.key) {
        case "wins_lost": return x.c.wins_lost;
        case "decisions": return x.c.decisions;
        case "per100": return x.r.per100;
        case "goRate": return x.r.goRate;
        case "agreed": return x.r.agreed;
        case "aggressiveness": return x.r.aggressiveness ?? (view.asc ? Infinity : -Infinity);
      }
    };
    const qualified = all.filter((x) => x.c.decisions >= min)
      .sort((a, b) => (view.asc ? value(a) - value(b) : value(b) - value(a)) || a.c.wins_lost - b.c.wins_lost);
    return { qualified, hidden: all.length - qualified.length };
  }, [rows, view.range, view.key, view.asc, min]);

  const label = multi ? `${view.range[0]}-${view.range[1]}` : String(view.range[0]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Seasons">
        {[{ v: "oos", l: `${outOfSampleFrom}-${seasons.at(-1)}` }, ...[...seasons].reverse().slice(0, 4).map((s) => ({ v: String(s), l: String(s) }))].map((o) => (
          <button key={o.v} type="button" onClick={() => set({ s: o.v, sort: null, dir: null })} aria-pressed={view.s === o.v}
            className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${view.s === o.v ? "border-ink-2 bg-night-2 text-ink" : "border-line text-ink-2 hover:text-ink"}`}>
            {o.l}
          </button>
        ))}
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink-2">
          <span className="sr-only">Season</span>
          <select value={/^\d{4}$/.test(view.s) && Number(view.s) < seasons.at(-1)! - 3 ? view.s : view.s === "all" ? "all" : ""}
            onChange={(e) => e.target.value && set({ s: e.target.value, sort: null, dir: null })}
            className="bg-transparent font-semibold text-ink-2 outline-none">
            <option value="">Earlier…</option>
            <option value="all">All, {seasons[0]}-{seasons.at(-1)}</option>
            {[...seasons].reverse().slice(4).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {inSample && (
        <div className="rounded-xl border border-yellow/40 bg-yellow/5 px-4 py-3 text-sm text-ink-2">
          <b className="text-yellow">In-sample seasons.</b> The win-probability model was trained on 2006-2022, so grades for
          those seasons are fit on their own data. The cleanest numbers are {outOfSampleFrom} onward.{" "}
          <Link href="/methodology" className="underline">Why it matters</Link>.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel/70">
        <table className="w-full text-sm">
          <caption className="sr-only">Coach 4th-down leaderboard, {label}</caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="sticky left-0 z-10 bg-panel py-2.5 pl-3 pr-1 font-semibold sm:pl-4 sm:pr-2">Coach</th>
              {COLUMNS.map((c) => {
                const on = c.key === view.key;
                return (
                  <th key={c.key} className={`whitespace-nowrap px-1.5 text-right font-semibold sm:px-2 ${c.hideOnPhone ? "max-sm:hidden" : ""}`} aria-sort={on ? (view.asc ? "ascending" : "descending") : "none"}>
                    <button type="button" title={c.title}
                      onClick={() => set({ sort: c.key, dir: on ? (view.asc ? "desc" : "asc") : c.asc ? "asc" : "desc" })}
                      className={`inline-flex min-h-8 items-center gap-0.5 uppercase sm:gap-1 sm:tracking-wider ${on ? "text-ink" : "hover:text-ink-2"}`}>
                      <span className="max-sm:hidden">{c.label}</span><span className="sm:hidden">{c.short ?? c.label}</span><span aria-hidden className="w-2">{on ? (view.asc ? "↑" : "↓") : ""}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {table.qualified.map((x, k) => {
              const coach = coaches[x.ci];
              return (
                <tr key={coach.slug} className="border-t border-line">
                  <td className="sticky left-0 z-10 max-w-[8.5rem] bg-panel py-2 pl-3 pr-2 sm:max-w-none sm:pl-4">
                    <div className="flex items-center gap-2">
                      <span className="num w-5 shrink-0 text-right text-xs text-muted">{k + 1}</span>
                      <TeamChip abbr={x.latest} team={teams[x.latest]} className="min-w-10! text-xs! max-sm:hidden" />
                      {(() => {
                        const name = <><span className="max-sm:hidden">{coach.coach}</span><span className="sm:hidden">{short(coach.coach)}</span></>;
                        return coach.page
                          ? <Link href={coachPath(coach.slug)} className="truncate font-semibold hover:text-los">{name}</Link>
                          : <span className="truncate font-semibold">{name}</span>;
                      })()}
                    </div>
                  </td>
                  <td className="num px-1.5 sm:px-2 text-right text-ink-2">{x.c.decisions}</td>
                  <td className="num px-1.5 sm:px-2 text-right font-semibold">{x.c.wins_lost.toFixed(2)}</td>
                  <td className="num px-1.5 sm:px-2 text-right">{x.r.per100.toFixed(2)}</td>
                  <td className="num px-1.5 sm:px-2 text-right">{pct(x.r.aggressiveness)} <span className="text-[11px] text-muted">/{x.c.clear_spots}</span></td>
                  <td className="num px-1.5 text-right max-sm:hidden sm:px-2">{pct(x.r.goRate)}</td>
                  <td className="num px-2 pr-4 text-right max-sm:hidden">{pct(x.r.agreed)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {label}: {table.qualified.length} head coaches with at least {min} graded calls
        {table.hidden > 0 && ` (${table.hidden} with fewer are left out so small samples don't rank)`}. Aggressive = go rate on
        clear-go spots, out of the number after the slash; shown once a coach has 10 such spots. Tap a column to sort.
        <span className="sm:hidden"> Go rate and agreement show on wider screens.</span>
      </p>
    </div>
  );
}
