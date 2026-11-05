// Contact sheets of the pet's souvenir catalogue: one PNG per season, each item at 6x with its id, names, lines and where.
// Needs Playwright (not a dependency: npm i --no-save playwright, or a global install found through NODE_PATH).
//
//   node tools/souvenir-sheet.mjs <outDir> [season] [--ids=a,b,c]
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEASON_ORDER = ["spring", "summer", "autumn", "winter", "any"];

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const dirs = (process.env.NODE_PATH || "").split(delimiter).filter(Boolean).concat(join(dirname(dirname(process.execPath)), "lib", "node_modules"));
  for (const d of dirs) { try { return createRequire(join(d, "x.js"))("playwright"); } catch {} }
  console.error("Playwright is not installed (npm i --no-save playwright)"); process.exit(2);
}

/* the runtime scripts are ES5 browser IIFEs: a window and the strings' navigator are all they need */
function load(rel, globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(ROOT, rel), "utf8"), ctx, { filename: rel });
  return ctx;
}
const strings = load("runtime/strings.js", { navigator: { languages: ["zh-CN"], language: "zh-CN" } }).LopdaStrings;
const S = load("runtime/petsouv.js").LopdaPetSouv;

const args = process.argv.slice(2);
const idsArg = (args.find((a) => a.startsWith("--ids=")) || "").slice(6);
const plain = args.filter((a) => !a.startsWith("--"));
const OUT = plain[0] && resolve(plain[0]);
const SEASON = plain[1];
if (!OUT) { console.error("usage: node tools/souvenir-sheet.mjs <outDir> [season] [--ids=a,b,c]"); process.exit(2); }
if (SEASON && !SEASON_ORDER.includes(SEASON)) { console.error("season is one of " + SEASON_ORDER.join(", ")); process.exit(2); }

function text(table, id, line) {
  const key = "pet.souv." + id + (line ? ".line" : "");
  return table[key] || "";
}
function item(e) {
  return {
    id: e.id, where: e.where, grid: e.grid,
    zh: text(strings.STR.zh, e.id), en: text(strings.STR.en, e.id),
    lzh: text(strings.STR.zh, e.id, true), len: text(strings.STR.en, e.id, true),
  };
}

const ids = idsArg ? idsArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
let sheets;
if (ids.length) {
  const seen = new Set();
  const items = [];
  for (const id of ids) {
    const e = S.byId(id);
    if (!e) { console.error("unknown souvenir id: " + id); process.exit(2); }
    if (seen.has(id)) continue;
    seen.add(id);
    items.push(item(e));
  }
  sheets = [["ids", items]];
} else {
  const seasons = SEASON ? [SEASON] : SEASON_ORDER;
  sheets = seasons.map((season) => [season, S.CATALOG.filter((e) => e.season === season).map(item)]);
}

function page(items) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#a3ad7e;color:#1f2a14}
  .sheet{display:grid;grid-template-columns:repeat(5,190px);gap:14px 10px;padding:12px;box-sizing:border-box;
    font-family:-apple-system,"PingFang SC","Noto Sans CJK SC","Segoe UI",sans-serif;font-size:12px;line-height:1.3}
  .item{width:190px}
  canvas{display:block;width:96px;height:96px;image-rendering:pixelated;border:1px solid #1f2a14;background:#a3ad7e}
  .id{margin-top:4px;font-weight:700}
  .names{margin-top:1px}
  .line{margin-top:1px;opacity:.86}
  .where{margin-top:2px;font-size:11px;opacity:.72}
  </style></head><body><div class="sheet"></div><script>
  var T={k:[31,42,20],d:[74,90,50],m:[125,138,88],p:[163,173,126],".":[163,173,126]};
  var items=${JSON.stringify(items)};
  var sheet=document.querySelector(".sheet");
  items.forEach(function(it){
    var box=document.createElement("div"); box.className="item";
    var c=document.createElement("canvas"); c.width=16; c.height=16;
    var x=c.getContext("2d"), im=x.createImageData(16,16);
    for(var y=0;y<16;y++) for(var i=0;i<16;i++){
      var t=T[it.grid[y].charAt(i)], o=(y*16+i)*4;
      im.data[o]=t[0]; im.data[o+1]=t[1]; im.data[o+2]=t[2]; im.data[o+3]=255;
    }
    x.putImageData(im,0,0);
    box.appendChild(c);
    [["id",it.id],["names",it.zh+" · "+it.en],["line",it.lzh],["line",it.len],["where",it.where]].forEach(function(f){
      var d=document.createElement("div"); d.className=f[0]; d.textContent=f[1]; box.appendChild(d);
    });
    sheet.appendChild(box);
  });
  </script></body></html>`;
}

await mkdir(OUT, { recursive: true });
const pw = await loadPlaywright();
const browser = await pw.chromium.launch();
const p = await browser.newPage({ viewport: { width: 1040, height: 800 }, deviceScaleFactor: 1 });
for (const [name, items] of sheets) {
  await p.setContent(page(items), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  const file = join(OUT, "souvenirs-" + name + ".png");
  await p.screenshot({ path: file, fullPage: true });
  console.log(file);
}
await browser.close();
