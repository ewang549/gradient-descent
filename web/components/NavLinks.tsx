"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const SECTIONS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "This week", match: (p) => p === "/" || p.startsWith("/week") },
  { href: "/calculator", label: "Calculator", match: (p) => p.startsWith("/calculator") },
  { href: "/play", label: "Make the call", match: (p) => p.startsWith("/play") },
  { href: "/games", label: "Games", match: (p) => p.startsWith("/games") },
  { href: "/coaches", label: "Coaches", match: (p) => p.startsWith("/coaches") },
  { href: "/findings", label: "Findings", match: (p) => p.startsWith("/findings") },
  { href: "/methodology", label: "How it works", match: (p) => p.startsWith("/methodology") },
];

function Links({ path }: { path: string | null }) {
  return (
    <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_88%,transparent)] lg:[mask-image:none] [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1 pr-8 text-sm font-semibold lg:pr-0">
        {SECTIONS.map((s) => {
          const on = path !== null && s.match(path);
          return (
            <li key={s.href}>
              <Link href={s.href} aria-current={on ? "page" : undefined}
                className={`block whitespace-nowrap rounded-lg px-3 py-2 transition ${on ? "bg-panel text-ink" : "text-ink-2 hover:bg-panel hover:text-ink"}`}>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function NavLinks() {
  return <Links path={usePathname()} />;
}

/** Same links with no active state: the server-rendered fallback while the pathname is unknown. */
export function NavLinksStatic() {
  return <Links path={null} />;
}
