import type { Metadata } from "next";
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

// The situation lives in the query string, so the calculator renders per request on the server
// (streamed into the prerendered shell) and the first HTML already has the field, the controls and
// the headline: nothing waits on client JS to paint. Only the win probabilities wait for the model.
async function CalculatorFromQuery({ searchParams }: Pick<PageProps<"/calculator">, "searchParams">) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  return <Calculator query={q.toString()} />;
}

export default function CalculatorPage({ searchParams }: PageProps<"/calculator">) {
  return (
    <main className="relative">
      <Suspense fallback={<div className="min-h-dvh" />}>
        <CalculatorFromQuery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
