import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WeekReport } from "@/components/week/WeekReport";
import { allWeeks, loadWeek, seasonIndex } from "@/lib/weekly/data";

// every exported week is prerendered at build time; the weekly Action redeploys after each export
export function generateStaticParams() {
  return allWeeks().map(({ season, week }) => ({ season: String(season), week: String(week) }));
}

export async function generateMetadata({ params }: PageProps<"/week/[season]/[week]">): Promise<Metadata> {
  const { season, week } = await params;
  const w = loadWeek(Number(season), Number(week));
  if (!w) return {};
  const c = w.worst[0];
  const title = `Week ${w.week} on 4th down (${w.season})`;
  const description = `Worst call: ${c.coach} ${c.decision === "go" ? "went for it" : c.decision === "punt" ? "punted" : "kicked"} on ${c.situation}, ` +
    `costing ${(c.wp_lost * 100).toFixed(1)} points of win probability. Every 4th down of the week, graded.`;
  const image = `/cards/${w.season}/week_${String(w.week).padStart(2, "0")}/worst-call.png`;
  return {
    title, description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 675 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function WeekPage({ params }: PageProps<"/week/[season]/[week]">) {
  const { season, week } = await params;
  const w = loadWeek(Number(season), Number(week));
  if (!w) notFound();
  return (
    <main className="relative">
      <WeekReport w={w} weeks={seasonIndex(w.season).weeks} />
    </main>
  );
}
