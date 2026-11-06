// Rewrite every *.vercel.app link in the repo's tracked text files to the URL in web/site.json.
// Run after changing site.json; the site-url test fails until you do.
//   node scripts/sync-site-url.mjs          rewrite
//   node scripts/sync-site-url.mjs --check  list stale links, exit 1 if any
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(web, "..");
const url = JSON.parse(readFileSync(join(web, "site.json"), "utf8")).url.replace(/\/$/, "");
const VERCEL = /https?:\/\/[a-z0-9-]+\.vercel\.app/g;
const TEXT = /\.(md|ts|tsx|mjs|js|yml|yaml|py|txt)$/;

export function staleLinks() {
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => TEXT.test(f));
  const stale = [];
  for (const f of files) {
    if (f === "web/scripts/sync-site-url.mjs") continue;
    const text = readFileSync(join(root, f), "utf8");
    const hits = [...new Set((text.match(VERCEL) ?? []).filter((u) => u !== url))];
    if (hits.length) stale.push({ file: f, hits });
  }
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stale = staleLinks();
  if (process.argv.includes("--check")) {
    for (const s of stale) console.log(`${s.file}: ${s.hits.join(", ")}`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const { file } of stale) {
    const p = join(root, file);
    writeFileSync(p, readFileSync(p, "utf8").replace(VERCEL, url));
    console.log(`updated ${file}`);
  }
  console.log(stale.length ? `${stale.length} file(s) now link to ${url}` : `every link already points at ${url}`);
}
