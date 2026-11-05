/** The findings series, newest first. A finding is listed here only once it's approved for publishing. */
export interface FindingEntry {
  slug: string;
  number: number;
  title: string;
  dek: string;
  /** share card shown on the index (served from public/findings, copied from exports/findings/<slug>/cards) */
  image: string;
  published: string; // ISO date
  method: string;
}

export const FINDINGS: FindingEntry[] = [
  {
    slug: "offense-style",
    number: 1,
    title: "The NFL changed together. Teams didn't.",
    dek: "Shotgun, 4th-down aggression and shorter passes swept the whole league from 2006 to 2025. Compared within each season, offenses aren't distinct types. They sit on two dials: how pass-first they are and how fast they play.",
    image: "/findings/offense-style/drift.png",
    published: "2026-11-05",
    method: "PCA on season-standardized team profiles, 671 team-seasons, bootstrap + era-split checks",
  },
];

export const findingPath = (slug: string) => `/findings/${slug}`;
