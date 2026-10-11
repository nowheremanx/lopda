// Frame hashes of a build, to prove that a change leaves the picture exactly as it was.
//   node tests/frame-hashes.mjs registry/apps/zhenyao-tower/index.html > before.json
//   ... change things, rebuild ...
//   node tests/frame-hashes.mjs registry/apps/zhenyao-tower/index.html --compare before.json
// zhenyao-tower plays the scenes in tests/zhenyao-play.js; vector-dream runs a fixed 145-frame script
// (three scenes, solid and wireframe, zoom and turning). Every frame is hashed as it reaches the canvas.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { boot } from "./app-vm.mjs";

const PLAY = join(import.meta.dirname, "zhenyao-play.js");

async function zhenyao(file, scenes) {
  const out = {};
  for (const name of scenes) {
    const app = boot(file, { extra: [PLAY] });
    await app.ctx.get("PLAY").run(name);
    out[name] = app.hashes;
  }
  return out;
}

/* VecDream reads PAD presses and PAD.isDown; frames are its own rAF loop */
export function vecdream(file) {
  const handlers = [], down = new Set();
  const pad = { lang: "zh", on: (type, f) => { if (type === "press") handlers.push(f); }, isDown: (b) => down.has(b), sfx() {} };
  const app = boot(file, { pad });
  const press = (b) => handlers.forEach((f) => f(b));
  const run = (n) => { for (let i = 0; i < n; i++) app.frame(); };
  for (let s = 0; s < 3; s++) { run(20); press("b"); run(15); press("b"); press("a"); }
  for (let z = 0; z < 4; z++) { press("select"); run(5); }
  down.add("left"); run(10); down.clear();
  down.add("up"); run(10); down.clear();
  return { vecdream: app.hashes };
}

/* the CLI below only runs when this file is started directly; tests import vecdream() */
const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const [file, flag, against] = direct ? process.argv.slice(2) : [];
const scenes = process.env.SCENES ? process.env.SCENES.split(",") : ["title", "town", "boss", "pagoda", "tower"];
const result = !direct ? null : /vector-dream/.test(file) ? vecdream(file) : await zhenyao(file, scenes);
if (!direct) {
  /* imported: nothing to run */
} else if (flag !== "--compare") {
  process.stdout.write(JSON.stringify(result) + "\n");
} else {
  const old = JSON.parse(readFileSync(against, "utf8"));
  let bad = 0;
  for (const [name, hs] of Object.entries(old)) {
    const now = result[name] || [];
    const diff = hs.findIndex((h, i) => h !== now[i]);
    const same = diff < 0 && hs.length === now.length;
    if (!same) bad++;
    console.log(`${name}: ${hs.length} frames before, ${now.length} now: ${same ? "identical" : `first difference at frame ${diff < 0 ? Math.min(hs.length, now.length) : diff}`}`);
  }
  process.exit(bad ? 1 : 0);
}
