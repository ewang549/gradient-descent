/**
 * The site's public URL, from web/site.json: the one value every absolute link uses (OG metadata,
 * share cards, post drafts, the weekly Action's deploy check). After changing it, run
 * `npm run sync-url` to rewrite the hand-written docs, then `npm run cards` / `npm run findings`.
 */
import site from "../site.json";

export const SITE_URL = site.url.replace(/\/$/, "");
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
