import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ResultView } from "@/components/play/ResultView";
import { headline, modeLabel, parseResult, resultQuery } from "@/lib/play/game";

/** A shared result: the link unfurls with that result's card (drawn by /og/play). */
export async function generateMetadata({ searchParams }: PageProps<"/play/result">): Promise<Metadata> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  const r = parseResult(q);
  const title = `${headline(r)} (${modeLabel(r)})`;
  const description = `I lost ${r.you.toFixed(1)}% win probability on ${r.you_grades.length} real 4th downs. The real coaches lost ${r.coaches.toFixed(1)}%. Can you do better?`;
  const image = `/og/play?${resultQuery(r)}`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 675 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

async function Connection() {
  await connection();
  return null;
}

export default function PlayResultPage() {
  return (
    <main className="relative">
      <Suspense fallback={<div className="min-h-dvh" />}>
        <ResultView />
      </Suspense>
      <Suspense><Connection /></Suspense>
    </main>
  );
}
