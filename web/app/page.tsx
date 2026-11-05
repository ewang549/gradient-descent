import type { Metadata } from "next";
import Link from "next/link";
import { WeekReport } from "@/components/week/WeekReport";
import { latestWeek, loadWeek, seasonIndex } from "@/lib/weekly/data";

const latest = latestWeek();
const w = latest ? loadWeek(latest.season, latest.week) : null;
const image = w ? `/cards/${w.season}/week_${String(w.week).padStart(2, "0")}/worst-call.png` : undefined;

export const metadata: Metadata = {
  title: w ? `Week ${w.week} on 4th down` : "4th down, graded",
  description: "Every NFL 4th down graded by win probability: the week's worst calls, best calls and the coach leaderboard.",
  ...(image && {
    openGraph: { images: [{ url: image, width: 1200, height: 675 }] },
    twitter: { card: "summary_large_image", images: [image] },
  }),
};

/** Home = the latest week's report. */
export default function Home() {
  if (!w) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16 text-ink-2">
        No weekly report yet. <Link href="/calculator" className="text-los underline">Open the calculator</Link>.
      </main>
    );
  }
  return (
    <main className="relative">
      <WeekReport w={w} weeks={seasonIndex(w.season).weeks} />
    </main>
  );
}
