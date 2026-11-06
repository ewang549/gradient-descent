import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPost } from "@/lib/weekly/posts";

/** Posts in a docs/launch draft: the text under each "## n/N" heading, up to the next heading or rule. */
export function draftPosts(file: string): { id: string; text: string }[] {
  const md = readFileSync(path.join(process.cwd(), "..", "docs", "launch", file), "utf8");
  const posts: { id: string; text: string }[] = [];
  for (const block of md.split(/^## /m).slice(1)) {
    const [head, ...rest] = block.split("\n");
    const id = head.match(/^(\d+\/\d+)/)?.[1];
    if (!id) continue;
    posts.push({ id, text: rest.join("\n").split(/^(---|## )/m)[0].trim() });
  }
  return posts;
}

describe("launch thread", () => {
  const posts = draftPosts("launch_thread.md");

  it("has 5-6 posts", () => {
    expect(posts.length).toBeGreaterThanOrEqual(5);
    expect(posts.length).toBeLessThanOrEqual(6);
  });

  it.each(posts.map((p) => [p.id, p.text]))("post %s follows the house rules", (_id, text) => {
    expect(checkPost(text)).toEqual([]);
  });

  it("links the calculator and the methodology", () => {
    const all = posts.map((p) => p.text).join("\n");
    expect(all).toMatch(/\/calculator\b/);
    expect(all).toMatch(/\/methodology\b/);
  });
});
