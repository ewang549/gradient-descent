/**
 * Draft X threads (finding 1 here, later findings in their own files, all rendered by threadToMarkdown).
 * Same house rules as the weekly posts (checkPost: <= 280 weighted chars, no em/en dashes, hashtags,
 * exclamation marks or hype words); every number comes from the finding's export loader, so a thread
 * can't drift from its page.
 */
import { checkPost } from "@/lib/weekly/posts";
import { SITE_URL } from "@/lib/weekly/format";
import { type OffenseStyle, fmt } from "./offenseStyle";
import { findingPath } from "./registry";

export interface ThreadPost { card?: string; text: string }

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function offenseStyleThread(d: OffenseStyle): ThreadPost[] {
  const [shotgun, go, adot] = d.drift;
  const edp = d.spreadTable.find((s) => s.info.key === "early_down_pass")!;
  const others = d.spreadTable.filter((s) => !s.spread.significant);
  const was24 = d.callouts.find((c) => c.season === 2024 && c.team === "WAS");
  const was25 = d.callouts.find((c) => c.season === 2025 && c.team === "WAS");
  const url = `${SITE_URL}${findingPath(d.slug)}`;
  const rb = d.robustness;

  return [
    {
      card: "drift.png",
      text: `The NFL changed together. Teams didn't.\n\nFrom ${shotgun.from.season} to ${shotgun.to.season}, shotgun went from ${fmt(shotgun.from.mean, "pct")} of snaps to ${fmt(shotgun.to.mean, "pct")}. ` +
        `On 4th downs where our model says go, teams went for it ${fmt(go.to.mean, "pct")} of the time, up from ${fmt(go.from.mean, "pct")}. ` +
        `Passes got shorter: ${adot.from.mean.toFixed(1)} air yards to ${adot.to.mean.toFixed(1)}.`,
    },
    {
      text: `How much of a team's offensive style is just the year it played in?\n\nAcross ${d.teamSeasons} team-seasons, about ${pct(d.eraShareAll)}. ` +
        `For shotgun rate it's ${pct(shotgun.eraShare)}, and for 4th-down aggressiveness ${pct(go.eraShare)}. Those moved league-wide, not team by team.`,
    },
    {
      card: "spread.png",
      text: `So did teams get more alike? Mostly no.\n\nThe spread between teams in early-down pass rate shrank (p = ${edp.spread.p.toFixed(3)}). ` +
        `For the other ${others.length} measures, including pass rate over expected, shotgun, tempo and 4th-down aggressiveness, ` +
        `there's no significant change.`,
    },
    {
      card: "map.png",
      text: `Are there offense "types"? Compare each team only with its own season and there aren't. Offenses sit on two dials: ` +
        `how pass-first they are and how fast they play.\n\nBoth dials hold up when we resample teams (congruence ${rb.pc1Boot.median.toFixed(2)} and ${rb.pc2Boot.median.toFixed(2)}) ` +
        `or fit 2006-15 and 2016-26 separately.`,
    },
    {
      text: `The outliers are on the tempo dial. Washington ran no-huddle on ${pct(was24?.noHuddle ?? 0)} of neutral snaps in 2024 and ${pct(was25?.noHuddle ?? 0)} in 2025. ` +
        `The 2013-15 Eagles and 2010 Colts are out there too.\n\nFull map, filterable by season:\n${url}`,
    },
  ];
}

/** posts.md for any finding's thread; throws (writing nothing) if a post breaks the house rules. */
export function threadToMarkdown(heading: string, slug: string, posts: ThreadPost[], extra: string[] = []): string {
  const problems = posts.flatMap((p, i) => checkPost(p.text).map((m) => `post ${i + 1}: ${m}`));
  if (problems.length) throw new Error(`thread breaks the post rules:\n${problems.join("\n")}`);
  return [
    `# ${heading}`,
    "",
    `Draft thread, ${posts.length} posts. Numbers come from exports/findings/${slug}; regenerate with \`npm run findings\`.`,
    "",
    ...posts.flatMap((p, i) => [`## ${i + 1}/${posts.length}${p.card ? ` (attach ${p.card})` : ""}`, "", p.text, ""]),
    ...extra,
  ].join("\n");
}

export function threadMarkdown(d: OffenseStyle): string {
  return threadToMarkdown("Finding 1: The NFL changed together. Teams didn't.", d.slug, offenseStyleThread(d));
}
