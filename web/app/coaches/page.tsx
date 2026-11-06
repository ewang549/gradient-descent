import type { Metadata } from "next";
import { Suspense } from "react";
import { Leaderboard, type Row } from "@/components/coaches/Leaderboard";
import { coachesIndex } from "@/lib/coaches/data";
import { latestWeek, loadWeek } from "@/lib/weekly/data";

const idx = coachesIndex();
const title = "Coach leaderboard: wins given away on 4th down";
const description = `Every NFL head coach since 2006, ranked by win probability lost on 4th down, with aggressiveness and sample sizes. ${idx?.out_of_sample_from ?? 2023}+ is out of sample.`;

// Unfurls with the latest weekly leaderboard card (this season's wins lost by coach), else the calculator card.
const w = latestWeek();
const image = w && loadWeek(w.season, w.week)?.leaderboard ? `/cards/${w.season}/week_${String(w.week).padStart(2, "0")}/leaderboard.png` : "/og/calculator";

export const metadata: Metadata = {
  title: { absolute: title }, description,
  openGraph: { title, description, images: [{ url: image, width: 1200, height: 675 }] },
  twitter: { card: "summary_large_image", title, description, images: [image] },
};

export default function CoachesPage() {
  if (!idx) return <main className="mx-auto max-w-6xl px-6 py-16 text-ink-2">No coach export yet. Run `make export`.</main>;
  // compact rows: the browser adds up any range of seasons from these counts
  const order = [...new Set(idx.rows.map((r) => r.slug))];
  const pages = new Set(idx.coaches.map((c) => c.slug));
  const coaches = order.map((slug) => ({ slug, coach: idx.rows.find((r) => r.slug === slug)!.coach, page: pages.has(slug) }));
  const at = new Map(order.map((s, i) => [s, i]));
  const rows: Row[] = idx.rows.map((r) => [at.get(r.slug)!, r.season, r.teams.join("/"), r.decisions, r.go, r.clear_spots,
    r.clear_go, r.agreed, Math.round(r.wins_lost * 1000) / 1000, Math.round(r.wins_lost_kicking * 1000) / 1000]);
  const teams = Object.fromEntries([...new Set(idx.rows.flatMap((r) => r.teams))].map((t) => [t, idx.teams[t]]));
  return (
    <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">Head coaches · {idx.seasons[0]}-{idx.seasons.at(-1)}</div>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">Coach <span className="text-ink-2">leaderboard</span></h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Win probability given away on 4th down by not making the model&apos;s best call. 1.00 = one win. Per 100 compares
          coaches with different sample sizes; every row shows how many calls it&apos;s based on.
        </p>
      </header>
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <Leaderboard coaches={coaches} rows={rows} seasons={idx.seasons} outOfSampleFrom={idx.out_of_sample_from}
          minSeason={idx.min_decisions.season} minRange={idx.min_decisions.range} teams={teams} />
      </Suspense>
    </main>
  );
}
