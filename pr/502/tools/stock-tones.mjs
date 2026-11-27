// The landing page's viewfinder picture: docs/images/stocks/0-original.jpg (the owner's own photo, the one the stock
// examples are developed from) as the camera's viewfinder shows it, 256 x 224 in the four tones, through the runtime's
// own runtime/finder.js (crop, luma, the Bayer dither). Needs Playwright (npm i --no-save playwright).
//
//   node tools/stock-tones.mjs      -> docs/images/stocks/0-tones.png
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const dirs = (process.env.NODE_PATH || "").split(delimiter).filter(Boolean).concat(join(dirname(dirname(process.execPath)), "lib", "node_modules"));
  for (const d of dirs) { try { return createRequire(join(d, "x.js"))("playwright"); } catch {} }
  console.error("Playwright is not installed (npm i --no-save playwright)"); process.exit(2);
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch(), page = await browser.newPage();
await page.setContent("<!doctype html><body></body>");
await page.addScriptTag({ content: await readFile(join(ROOT, "runtime/finder.js"), "utf8") });
const jpg = (await readFile(join(ROOT, "docs/images/stocks/0-original.jpg"))).toString("base64");
const png = await page.evaluate(async (jpg) => {
  const F = window.LopdaFinder, W = 256, H = 224;   /* the camera's large format (SPEC.md 6.6) */
  const TONES = [[31, 42, 20], [74, 90, 50], [125, 138, 88], [163, 173, 126]];
  const img = new Image(); img.src = "data:image/jpeg;base64," + jpg; await img.decode();
  const lum = F.grabber()(img, img.naturalWidth, img.naturalHeight, W, H, false);
  const px = F.ditherLuma(lum, W, H, 0, 0);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), d = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const t = TONES[px[i]]; d.data.set([t[0], t[1], t[2], 255], i * 4); }
  g.putImageData(d, 0, 0);
  return c.toDataURL("image/png").split(",")[1];
}, jpg);
await writeFile(join(ROOT, "docs/images/stocks/0-tones.png"), Buffer.from(png, "base64"));
console.log("wrote docs/images/stocks/0-tones.png");
await browser.close();
