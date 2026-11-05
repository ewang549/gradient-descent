"use client";
/** Someone's shared result, read from the URL, with a way in for whoever opened the link. */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { headline, modeLabel, parseResult } from "@/lib/play/game";
import { GradeRow } from "./GradeRow";

export function ResultView() {
  const r = parseResult(new URLSearchParams(useSearchParams().toString()));
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-14">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">You make the call · {modeLabel(r)}</div>
        <h1 className="mt-1 font-display text-5xl font-black uppercase leading-[0.9] tracking-wide sm:text-6xl">{headline(r)}</h1>
        <p className="mt-3 text-lg text-ink-2">
          Lost <b className="num text-ink">{r.you.toFixed(1)}%</b> win probability on {r.you_grades.length} real 4th downs.
          The real coaches lost <b className="num text-ink">{r.coaches.toFixed(1)}%</b> in the same spots.
        </p>
      </header>
      {r.you_grades.length > 0 && (
        <div className="rise flex flex-col gap-2 rounded-2xl border border-line bg-panel/80 p-4 [animation-delay:80ms]">
          <GradeRow grades={r.you_grades} label="Them" />
          <GradeRow grades={r.coach_grades} label="Coaches" />
        </div>
      )}
      <Link href="/play" className="rise flex min-h-14 items-center justify-center rounded-2xl bg-orange font-display text-2xl font-black uppercase tracking-wider text-night [animation-delay:120ms] hover:brightness-110">
        Your turn →
      </Link>
    </div>
  );
}
