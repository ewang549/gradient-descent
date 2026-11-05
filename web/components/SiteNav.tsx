import Link from "next/link";
import { Suspense } from "react";
import { BRAND } from "@/lib/weekly/format";
import { NavLinks, NavLinksStatic } from "./NavLinks";

/** Top bar on every page: the wordmark, then every section. On phones the links get their own
 *  horizontally scrolling row under the wordmark. */
export function SiteNav() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <Link href="/" className="flex shrink-0 items-end gap-2 self-start text-ink-2 transition hover:text-ink lg:self-auto">
        <span aria-hidden className="flex h-4 items-end gap-[3px]">
          <span className="h-4 w-1 rounded-sm bg-green" />
          <span className="h-2.5 w-1 rounded-sm bg-ink-2" />
          <span className="h-1.5 w-1 rounded-sm bg-ink-2" />
        </span>
        <span className="font-display text-lg font-extrabold uppercase leading-none tracking-wider">{BRAND}</span>
      </Link>
      <Suspense fallback={<NavLinksStatic />}>
        <NavLinks />
      </Suspense>
    </header>
  );
}
