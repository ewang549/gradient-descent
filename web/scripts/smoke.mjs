// Production smoke test: every route in a phone-sized Chromium (Pixel 7) and WebKit (iPhone 15, the
// engine behind mobile Safari). Real devices can still differ; this catches broken pages, console
// errors, missing OG images and an engine that never loads.
//
//   npm run smoke                         against the URL in site.json
//   npm run smoke -- http://localhost:3000
//
// One-time setup: npx playwright install chromium webkit
// Screenshots go to web/.smoke/ (gitignored). Exit 1 on any failure.
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, webkit } from "playwright";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const exportsDir = join(web, "..", "exports");
const siteUrl = JSON.parse(readFileSync(join(web, "site.json"), "utf8")).url.replace(/\/$/, "");
const base = (process.argv[2] ?? siteUrl).replace(/\/$/, "");
const shots = join(web, ".smoke");
mkdirSync(shots, { recursive: true });

// One real example of every dynamic route, read from the same exports the site is built from.
const weekly = JSON.parse(readFileSync(join(exportsDir, "weekly", "2026", "index.json"), "utf8"));
const game = readdirSync(join(exportsDir, "games", "2026")).filter((f) => /^\d{4}_\d{2}_.*\.json$/.test(f)).sort().at(-1).replace(".json", "");
const coach = readdirSync(join(exportsDir, "coaches")).find((f) => f === "andy-reid.json")?.replace(".json", "") ?? "andy-reid";

const ROUTES = [
  "/",
  "/calculator",
  "/play",
  "/week/2026/" + weekly.latest,
  "/games",
  "/games/2026",
  `/games/2026/${game}`,
  "/coaches",
  `/coaches/${coach}`,
  "/findings",
  "/findings/offense-style",
  "/findings/luck-skill",
  "/methodology",
];

const failures = [];
const fail = (where, msg) => { failures.push(`${where}: ${msg}`); console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

/** Route-specific interaction: the things that only work if client JS and data loaded. */
const CHECKS = {
  "/calculator": async (page, where) => {
    // Not cross-origin isolated on purpose (see next.config.ts): an isolated page can't start the
    // engine worker on Vercel. Model loading below is the real check.
    try {
      await page.getByText("Loading model…").waitFor({ state: "detached", timeout: 30_000 });
      ok("ONNX model loaded, recommendation shown");
    } catch {
      fail(where, "model never finished loading (still 'Loading model…' after 30 s)");
    }
    if (await page.getByText("couldn't load in this browser").count()) fail(where, "engine error shown");
  },
  "/play": async (page, where) => {
    for (const [mode, label] of [["daily", /Play today's 5|Play again/], ["round", /^Play 10$/]]) {
      await page.goto(base + "/play", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: label }).click({ timeout: 15_000 });
      const call = page.getByRole("group", { name: "Your call" }).getByRole("button").first();
      await call.click({ timeout: 15_000 });
      try {
        await page.getByRole("region", { name: "The answer" }).waitFor({ timeout: 10_000 });
        ok(`${mode}: picked a call, reveal shown`);
      } catch {
        fail(where, `${mode}: reveal never appeared`);
      }
    }
  },
};

async function checkOg(request, route) {
  const res = await request.get(base + route);
  const html = await res.text();
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const tw = html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];
  if (!og) return fail(`og ${route}`, "no og:image");
  // Unfurlers fetch the absolute URL in the tag, so in production it must be this site.
  if (base === siteUrl && !og.startsWith(base)) fail(`og ${route}`, `og:image points at another host: ${og}`);
  // Fetch from the site under test, whatever host the tag names, so a local run still checks the image.
  const img = await request.get(base + new URL(og.replaceAll("&amp;", "&")).pathname + new URL(og.replaceAll("&amp;", "&")).search);
  const type = img.headers()["content-type"] ?? "";
  const bytes = (await img.body()).length;
  if (img.status() !== 200 || !type.startsWith("image/") || bytes < 5_000) {
    fail(`og ${route}`, `og:image ${img.status()} ${type} ${bytes} B`);
  } else {
    ok(`og:image ${img.status()} ${type} ${(bytes / 1024).toFixed(0)} KB${tw ? "" : " (no twitter:image)"}`);
  }
}

for (const [name, type, device] of [["chrome", chromium, devices["Pixel 7"]], ["safari", webkit, devices["iPhone 15"]]]) {
  const browser = await type.launch();
  const context = await browser.newContext({ ...device });
  console.log(`\n${name} (${device.userAgent.includes("iPhone") ? "iPhone 15" : "Pixel 7"}) against ${base}`);
  for (const route of ROUTES) {
    const where = `${name} ${route}`;
    console.log(route);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    try {
      const res = await page.goto(base + route, { waitUntil: "networkidle", timeout: 45_000 });
      if (!res || res.status() >= 400) fail(where, `HTTP ${res?.status()}`);
      else ok(`HTTP ${res.status()}`);
      await CHECKS[route]?.(page, where);
      await page.screenshot({ path: join(shots, `${name}${route.replaceAll("/", "_") || "_home"}.png`), fullPage: false });
    } catch (e) {
      fail(where, e.message.split("\n")[0]);
    }
    if (errors.length) fail(where, `console errors:\n      ${[...new Set(errors)].join("\n      ")}`);
    else ok("no console errors");
    await page.close();
  }
  await browser.close();
}

console.log("\nOG images");
const api = await (await chromium.launch()).newContext();
for (const route of ROUTES) {
  console.log(route);
  await checkOg(api.request, route);
}
await api.close();

console.log(failures.length ? `\n${failures.length} failure(s):\n- ${failures.join("\n- ")}` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
