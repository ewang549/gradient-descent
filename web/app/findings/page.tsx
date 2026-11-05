import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FINDINGS, findingPath } from "@/lib/findings/registry";

const title = "Findings: what the NFL data actually says";
const description = "Machine-learning findings from NFL play-by-play, each checked on held-out seasons or with stated uncertainty, with sample sizes and what it does and doesn't mean.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { title, description, images: FINDINGS[0] ? [{ url: FINDINGS[0].image, width: 1200, height: 675 }] : undefined },
  twitter: { card: "summary_large_image", title, description },
};

export default function FindingsIndex() {
  return (
    <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange">The findings series</div>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.85] tracking-wide sm:text-7xl">Findings</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Questions about how the NFL works, answered with play-by-play data back to 2006. A finding only goes up if it holds on
          held-out seasons or comes with its uncertainty. Each one shows its sample sizes and the robustness checks behind it, and says plainly what it
          doesn&apos;t mean.
        </p>
      </header>
      <ol className="flex flex-col gap-4">
        {FINDINGS.map((f, i) => (
          <li key={f.slug}>
            <Link href={findingPath(f.slug)} className="group grid overflow-hidden rounded-2xl border border-line bg-panel/70 transition hover:border-ink-2/50 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <Image src={f.image} alt="" width={1200} height={675} priority={i === 0} sizes="(min-width: 640px) 480px, 100vw" className="h-auto w-full border-b border-line sm:border-b-0 sm:border-r" />
              <div className="flex flex-col p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted">Finding {f.number} · {f.published}</div>
                <h2 className="mt-1 font-display text-3xl font-black uppercase leading-[0.95] tracking-wide group-hover:text-ink">{f.title}</h2>
                <p className="mt-2 text-sm text-ink-2">{f.dek}</p>
                <p className="mt-auto pt-3 text-xs text-muted">{f.method}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
