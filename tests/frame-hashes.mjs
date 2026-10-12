// Frame hashes of a build, to prove that a change leaves the picture exactly as it was.
//   node tests/frame-hashes.mjs registry/apps/zhenyao-tower/index.html > before.json
//   ... change things, rebuild ...
//   node tests/frame-hashes.mjs registry/apps/zhenyao-tower/index.html --compare before.json
// zhenyao-tower plays the scenes in tests/zhenyao-play.js; vector-dream runs a fixed 145-frame script
// (three scenes, solid and wireframe, zoom and turning). Every frame is hashed as it reaches the canvas.
// Any other app (the small lo-game ones: xiaoyuan, last-letter, rain-station) gets a fixed 900-frame script of
// presses and holds through a fake PAD that records every sound and music call, so a framework release can show
// that the old apps draw exactly what they drew before.
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

/* a generic player: A, START, the D-pad held for a while, B, in a fixed order. PAD.load answers null (a new game).
   opt.music gives the fake PAD a PAD.music, as runtime 0.11.0 does; calls lists every sound and music call. */
export function scripted(file, opt = {}) {
  const on = { press: [], release: [] }, down = new Set(), calls = [];
  const pad = { lang: "zh", spec: "lopda/1", on: (type, f) => { if (on[type]) on[type].push(f); }, off() {}, isDown: (b) => down.has(b),
    load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx: (s) => calls.push(["sfx", s]) };
  if (opt.music) pad.music = { play: (song, o) => calls.push(["play", song, o]), stop: () => calls.push(["stop"]) };
  const app = boot(file, { pad });
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  const hold = async (b, n) => { down.add(b); on.press.forEach((f) => f(b)); await run(n); down.delete(b); on.release.forEach((f) => f(b)); await run(2); };
  const steps = [["a", 2, 40], ["a", 2, 60], ["right", 30, 10], ["down", 40, 10], ["a", 2, 40], ["a", 2, 40], ["a", 2, 40], ["left", 50, 10],
    ["up", 30, 10], ["a", 2, 40], ["b", 2, 30], ["start", 2, 30], ["down", 2, 20], ["b", 2, 30], ["a", 2, 40], ["right", 60, 10], ["select", 2, 30]];
  return (async () => {
    await run(30);
    for (const [b, n, after] of steps) { await hold(b, n); await run(after); }
    return { frames: app.hashes, calls };
  })();
}

/* the CLI below only runs when this file is started directly; tests import vecdream() */
const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const [file, flag, against] = direct ? process.argv.slice(2) : [];
const scenes = process.env.SCENES ? process.env.SCENES.split(",") : ["title", "town", "boss", "pagoda", "tower"];
const result = !direct ? null : /vector-dream/.test(file) ? vecdream(file) : /zhenyao-tower/.test(file) ? await zhenyao(file, scenes)
  : { frames: (await scripted(file)).frames };
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
