import Link from "next/link";
import { BRAND } from "@/lib/weekly/format";

/** Thin top bar on every page: the wordmark and the two places to go. */
export function SiteNav() {
  return (
    <nav className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-4 sm:px-6">
      <Link href="/" className="flex items-end gap-2 text-ink-2 transition hover:text-ink">
        <span aria-hidden className="flex h-4 items-end gap-[3px]">
          <span className="h-4 w-1 rounded-sm bg-green" />
          <span className="h-2.5 w-1 rounded-sm bg-ink-2" />
          <span className="h-1.5 w-1 rounded-sm bg-ink-2" />
        </span>
        <span className="font-display text-lg font-extrabold uppercase leading-none tracking-wider">{BRAND}</span>
      </Link>
      <div className="flex gap-1 text-sm font-semibold">
        <Link href="/" className="rounded-lg px-3 py-1.5 text-ink-2 transition hover:bg-panel hover:text-ink">This week</Link>
        <Link href="/calculator" className="rounded-lg px-3 py-1.5 text-ink-2 transition hover:bg-panel hover:text-ink">Calculator</Link>
      </div>
    </nav>
  );
}
