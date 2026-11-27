// Screenshots for an event's summary: one picture per app, events/shots/<event id>/<app id>.png.
// Needs Playwright (not a dependency: npm i --no-save playwright, or a global install found through NODE_PATH).
//
//   node tools/event-shots.mjs <event id> [--wait=ms] [--keys=x,x,ArrowDown]
//
// Reads the apps from the event's summary in events/events.js, opens each one in the dev harness
// (sdk/dev.html?app=registry/apps/<id>) and photographs only the app's screen at the 2x scale of a phone.
// --wait (default 2000) is how long to let it start; --keys are pressed in order before the shot (X is A,
// Enter is START), for an app whose first screen is a title card. One app at a time: add --only=<app id>.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, normalize, resolve, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".woff2": "font/woff2", ".wasm": "application/wasm" };

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : d; };
const eventId = args.find((x) => !x.startsWith("--"));
if (!eventId) { console.error("usage: node tools/event-shots.mjs <event id> [--wait=ms] [--keys=a,b] [--only=app]"); process.exit(2); }

// events.js is a browser script that sets window.LOPDA_EVENTS; run it in a sandbox to read it.
const box = { window: {} };
vm.runInNewContext(await readFile(join(ROOT, "events/events.js"), "utf8"), box);
const ev = (box.window.LOPDA_EVENTS || []).find((e) => e.id === eventId);
if (!ev) { console.error("no event " + eventId + " in events/events.js"); process.exit(2); }
const only = opt("only", "");
const apps = ((ev.summary && ev.summary.apps) || []).map((a) => a.app).filter((id) => !only || id === only);
if (!apps.length) { console.error("event " + eventId + " has no summary apps yet"); process.exit(2); }

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const dirs = (process.env.NODE_PATH || "").split(delimiter).filter(Boolean).concat(join(dirname(dirname(process.execPath)), "lib", "node_modules"));
  for (const d of dirs) { try { return createRequire(join(d, "x.js"))("playwright"); } catch {} }
  console.error("Playwright is not installed (npm i --no-save playwright)"); process.exit(2);
}

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, path.endsWith("/") ? path + "index.html" : path);
  try { const body = await readFile(file); res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;

const { chromium } = await loadPlaywright();
// Screenshots of a sandboxed iframe come out blank without this flag (CLAUDE.md, deeper UI checks).
const browser = await chromium.launch({ args: ["--disable-site-isolation-trials"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
const out = join(ROOT, "events/shots", eventId);
await mkdir(out, { recursive: true });
const keys = opt("keys", "").split(",").filter(Boolean);
for (const id of apps) {
  await page.goto(base + "/sdk/dev.html?app=registry/apps/" + id);
  await page.waitForTimeout(+opt("wait", "2000"));
  for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(400); }
  await page.locator("#app").screenshot({ path: join(out, id + ".png"), animations: "disabled", caret: "hide" });
  console.log("shot " + id);
}
await browser.close();
server.close();
