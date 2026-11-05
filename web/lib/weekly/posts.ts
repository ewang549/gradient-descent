/**
 * Draft X posts for a week's cards. Templates filled from the export, no generated prose, so every
 * number in a post is a number in the JSON. checkPost() enforces the house rules; the card script
 * refuses to write a posts.md that breaks them, and tests/posts.test.ts runs it over every week.
 */
import type { Option } from "@/lib/engine/types";
import {
  SITE_URL, breakEven, calcUrl, didPhrase, modelPhrase, pct, pts, puntStart, weekPath,
} from "./format";
import type { Call, WeekExport } from "./types";

export const MAX_CHARS = 280;
const URL_WEIGHT = 23; // X counts every link as 23 characters
const HYPE = ["insane", "crazy", "shocking", "massive", "huge", "unbelievable", "incredible", "brutal", "disaster",
  "wild", "epic", "mind-blowing", "jaw-dropping", "bombshell", "game-changer", "stunning", "egregious", "absurd",
  "ridiculous", "must-see", "you won't believe"];

export function weightedLength(text: string): number {
  return [...text.replace(/https?:\/\/\S+/g, "x".repeat(URL_WEIGHT))].length;
}

export function checkPost(text: string): string[] {
  const problems: string[] = [];
  const n = weightedLength(text);
  if (n > MAX_CHARS) problems.push(`${n} characters (max ${MAX_CHARS})`);
  if (/[—–]/.test(text)) problems.push("contains an em or en dash");
  if (/(^|\s)#\w/.test(text)) problems.push("contains a hashtag");
  if (text.includes("!")) problems.push("contains an exclamation mark");
  const lower = text.toLowerCase();
  for (const w of HYPE) if (new RegExp(`\\b${w}\\b`).test(lower)) problems.push(`hype word: "${w}"`);
  return problems;
}

// ----------------------------------------------------------------------------- helpers

const lastName = (coach: string) => coach.split(" ").slice(1).join(" ") || coach;
const QTR = ["", "1st", "2nd", "3rd", "4th"];

/** "with 3:01 left" in the 4th quarter, else "in the 2nd quarter". */
function when(c: Call): string {
  const [m, s] = c.clock.split(":");
  return c.qtr === 4 ? `with ${Number(m)}:${s} left` : `in the ${QTR[c.qtr]} quarter`;
}

function scorePhrase(c: Call): string {
  const d = c.posteam_score - c.defteam_score;
  if (d === 0) return c.posteam_score === 0 ? `scoreless vs ${c.defteam}` : `tied ${c.posteam_score}-${c.defteam_score} with ${c.defteam}`;
  return d > 0 ? `up ${d} on ${c.defteam}` : `down ${-d} to ${c.defteam}`;
}

const WP: Record<Option, (c: Call) => number> = { go: (c) => c.wp_go, punt: (c) => c.wp_punt, field_goal: (c) => c.wp_fg };
const p1 = (wp: number) => `${pts(wp)}%`;
const weekUrl = (w: WeekExport) => `${SITE_URL}${weekPath(w.season, w.week)}`;

function optionSentence(c: Call, o: Option): string {
  if (o === "go") {
    return `Going for it: the model gives ${c.posteam} a ${pct(c.p_convert)} chance to convert. Convert and ${c.posteam}'s ` +
      `win probability is ${pts(c.wp_if_convert, 0)}%. Get stopped and it's ${pts(c.wp_if_fail, 0)}%. ` +
      `Weighted together: ${p1(c.wp_go)}.`;
  }
  if (o === "punt") {
    return `Punting: ${c.defteam} starts at ${puntStart(c)} on average, and ${c.posteam}'s win probability is ${p1(c.wp_punt)}.`;
  }
  const yards = c.decision === "field_goal" ? (c.fg_attempt_distance ?? c.fg_distance) : c.fg_distance;
  return `Kicking: the model gives the ${yards}-yard try a ${pct(c.p_fg_make)} chance, and ${c.posteam}'s win ` +
    `probability is ${p1(c.wp_fg)}.`;
}

// ----------------------------------------------------------------------------- the posts

export interface Post { card: string; text: string }

/** The first variant that fits the rules (longest, most detailed first); else the last, which the checker will flag. */
function fit(...variants: string[]): string {
  return variants.find((v) => checkPost(v).length === 0) ?? variants[variants.length - 1];
}

export function worstCallPost(w: WeekExport): Post {
  const c = w.worst[0];
  return {
    card: "worst-call.png",
    text: `The costliest 4th-down call of Week ${w.week}: ${c.coach} ${didPhrase(c)} on ${c.situation}, ` +
      `${scorePhrase(c)} ${when(c)}.\n\n` +
      `${modelPhrase(c.recommendation, true).replace(/^./, (s) => s.toUpperCase())}: ${p1(WP[c.recommendation](c))} win probability. ` +
      `What ${c.posteam} did: ${p1(WP[c.decision](c))}. That's ${pts(c.wp_lost)} points given away.\n\n${calcUrl(c)}`,
  };
}

export function top3Post(w: WeekExport): Post {
  const rows = w.worst.slice(0, 3);
  const verb: Record<Option, string> = { go: "go", punt: "punt", field_goal: "FG" };
  const lines = rows.map((c, i) => `${i + 1}. ${lastName(c.coach)} (${c.posteam}) ${verb[c.decision]}, ${c.situation}: -${pts(c.wp_lost)}`);
  const same = rows.every((c) => c.recommendation === rows[0].recommendation);
  const tail = same ? `All three times, the model said ${modelPhrase(rows[0].recommendation)}.\n\n` : "";
  return {
    card: "top-3.png",
    text: fit(
      `The 3 costliest 4th-down calls of Week ${w.week}, in win-probability points lost:\n\n${lines.join("\n")}\n\n${tail}${weekUrl(w)}`,
      `Week ${w.week}'s 3 costliest 4th-down calls (win-probability points lost):\n\n${lines.join("\n")}\n\n${tail}${weekUrl(w)}`,
      `Week ${w.week}'s 3 costliest 4th-down calls (WP points lost):\n\n${lines.join("\n")}\n\n${weekUrl(w)}`,
    ),
  };
}

export function leaderboardPost(w: WeekExport): Post | null {
  const b = w.leaderboard;
  if (!b) return null;
  const fmt = (r: { coach: string; team: string; wins_lost: number }) =>
    `${lastName(r.coach)} (${r.team.split("/").at(-1)}) ${r.wins_lost.toFixed(2)}`;
  const most = [...b.bottom].reverse();
  const body = (n: number) => `Fewest: ${b.top.slice(0, n).map(fmt).join(", ")}\nMost: ${most.slice(0, n).map(fmt).join(", ")}`;
  const intro = `Wins given away on 4th down through Week ${b.through_week}: win probability lost vs the model's best call, ` +
    `summed over every graded call (1.00 = one win).`;
  return {
    card: "leaderboard.png",
    text: fit(
      `${intro}\n\n${body(3)}\n\nMin ${b.min_decisions} calls. ${weekUrl(w)}`,
      `${intro}\n\n${body(2)}\n\nMin ${b.min_decisions} calls. ${weekUrl(w)}`,
    ),
  };
}

export function gutsiestPost(w: WeekExport): Post | null {
  const c = w.gutsiest;
  if (!c) return null;
  const kick: Option = c.wp_punt >= c.wp_fg ? "punt" : "field_goal";
  const result = c.is_converted ? `${c.posteam} converted.` : `${c.posteam} was stopped. Still the right call.`;
  const edge = `${pts(c.wp_go - WP[kick](c))} points of win probability over ${modelPhrase(kick, true)}`;
  const lead = `Gutsiest correct call of Week ${w.week}: ${c.coach} went for it on ${c.situation}`;
  return {
    card: "gutsiest.png",
    text: fit(
      `${lead}, ${scorePhrase(c)} ${when(c)}.\n\nOnly ${pct(c.expected_go_rate)} of coaches go there. The model agreed, by ${edge}. ${result}\n\n${calcUrl(c)}`,
      `${lead}.\n\nOnly ${pct(c.expected_go_rate)} of coaches go there. The model agreed, by ${edge}. ${result}\n\n${calcUrl(c)}`,
      `${lead}.\n\nOnly ${pct(c.expected_go_rate)} of coaches go there. The model agreed, by ${edge}.\n\n${calcUrl(c)}`,
    ),
  };
}

/** A 5-post thread walking through the week's worst call. */
export function worstCallThread(w: WeekExport): string[] {
  const c = w.worst[0];
  const others = (["go", "punt", "field_goal"] as Option[]).filter((o) => o !== c.decision && o !== c.recommendation);
  const be = breakEven(c);
  const involvesGo = c.decision === "go" || c.recommendation === "go";
  const fourth = involvesGo && be !== null
    ? `So going for it beats ${c.wp_punt >= c.wp_fg ? "punting" : "kicking"} if ${c.posteam} converts at least ` +
      `${pct(be)} of the time. The model puts it at ${pct(c.p_convert)}, so ${modelPhrase(c.decision, true)} cost ` +
      `${pts(c.wp_lost)} points, the most of the ${w.summary.graded_decisions} graded 4th downs in Week ${w.week}.`
    : `${optionSentence(c, others[0])} The gap between the call and the best option, ${pts(c.wp_lost)} points, ` +
      `was the largest of the ${w.summary.graded_decisions} graded 4th downs in Week ${w.week}.`;
  return [
    `Week ${w.week}'s costliest 4th-down call: ${scorePhrase(c)} ${when(c)}, ${c.coach} ${didPhrase(c)} on ` +
      `${c.situation}.\n\nIt cost ${c.posteam} ${pts(c.wp_lost)} points of win probability. Here's the math.`,
    `What ${c.posteam} did. ${optionSentence(c, c.decision)}`,
    `What the model wanted. ${optionSentence(c, c.recommendation)}`,
    fourth,
    `The model is trained on NFL play-by-play from 2006 to 2022 and runs in your browser. ` +
      `This link opens it on this exact situation, so you can move the ball and see where the call flips:\n\n${calcUrl(c)}`,
  ];
}

// ----------------------------------------------------------------------------- posts.md

export function postsMarkdown(w: WeekExport, cards: string[]): string {
  const posts = [worstCallPost(w), top3Post(w), leaderboardPost(w), gutsiestPost(w)]
    .filter((p): p is Post => p !== null && cards.includes(p.card));
  const thread = worstCallThread(w);
  const all = [...posts.map((p) => p.text), ...thread];
  const problems = all.flatMap((t) => checkPost(t).map((p) => `${p}: ${t.slice(0, 60)}...`));
  if (problems.length) throw new Error(`posts for ${w.season} week ${w.week} break the rules:\n${problems.join("\n")}`);
  const block = (t: string) => `${t}\n\n<sub>${weightedLength(t)}/${MAX_CHARS}</sub>`;
  return [
    `# ${w.season} Week ${w.week}: draft posts`,
    `Drafts for the cards in this folder. Every number comes from \`exports/weekly/${w.season}/week_${String(w.week).padStart(2, "0")}.json\`; ` +
      `calculator links reproduce each call exactly. Character counts use X's rules (links count as ${URL_WEIGHT}).`,
    ...posts.map((p) => `## ${p.card}\n\n${block(p.text)}`),
    `## Thread: the worst call (attach worst-call.png to post 1)\n\n` +
      thread.map((t, i) => `**${i + 1}/${thread.length}**\n\n${block(t)}`).join("\n\n"),
  ].join("\n\n") + "\n";
}
