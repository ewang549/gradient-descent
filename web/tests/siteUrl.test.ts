import { describe, expect, it } from "vitest";
import site from "../site.json";
import { SITE_HOST, SITE_URL } from "@/lib/site";
import { staleLinks } from "../scripts/sync-site-url.mjs";

describe("site URL", () => {
  it("comes from web/site.json", () => {
    expect(SITE_URL).toBe(site.url.replace(/\/$/, ""));
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
    expect(SITE_HOST).not.toMatch(/^https?:/);
  });

  it("is the only vercel.app host in tracked files (run `npm run sync-url` after changing it)", () => {
    expect(staleLinks()).toEqual([]);
  });
});
