import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Calculator } from "@/components/Calculator";
import { fieldLabel, parseQuery, scoreLabel, toQuery } from "@/lib/calculator/state";

const DESCRIPTION = "Go for it, punt, or kick? Win probability for every option on any 4th down, computed in your browser.";

/** Each calculator link unfurls with a preview of that exact situation (drawn by /og/calculator). */
export async function generateMetadata({ searchParams }: PageProps<"/calculator">): Promise<Metadata> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  const s = parseQuery(q);
  const togo = s.ydstogo >= s.yardline100 ? "goal" : s.ydstogo;
  const title = `4th & ${togo} at ${fieldLabel(s.yardline100)}, ${scoreLabel(s.scoreDiff).toLowerCase()}: go, punt or kick?`;
  const image = `/og/calculator?${toQuery({ ...s, preset: null })}`;
  return {
    title,
    description: DESCRIPTION,
    openGraph: { title, description: DESCRIPTION, images: [{ url: image, width: 1200, height: 675 }] },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [image] },
  };
}

// metadata reads the query string, so it renders per request; this marker says that's intended
// while the page shell stays prerendered (see the Cache Components notes in generateMetadata docs)
async function Connection() {
  await connection();
  return null;
}

export default function CalculatorPage() {
  return (
    <main className="relative">
      {/* the calculator reads the URL, so it renders on the client; the shell above it is static */}
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Calculator />
      </Suspense>
      <Suspense><Connection /></Suspense>
    </main>
  );
}
