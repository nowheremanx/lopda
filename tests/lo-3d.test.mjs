// sdk/lo-3d.js: the release bookkeeping and the framework block (mirrors the lo-game checks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJSON, tool, copyApp, runScript } from "./helpers.mjs";
import { LIB3D, LIB3D_VERSION, LIB3D_BLOCK, build, sha } from "../tools/lo-game-lib.mjs";

test("the current lo-3d.js is a released version", () => {
  const versions = readJSON("sdk/lo-3d.versions.json");
  assert.match(LIB3D_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(versions[LIB3D_VERSION], sha(LIB3D), "bump VERSION and add the new hash to sdk/lo-3d.versions.json");
  assert.match(LIB3D, new RegExp("lo-3d\\.js " + LIB3D_VERSION.replace(/\./g, "\\.")), "header comment names the version");
});

test("lo-3d.js can sit inside a script tag", () => {
  assert.doesNotMatch(LIB3D, /<\/script/i);
});

/* the counter template with an empty lo-3d block in front of its script */
function app3d(t) {
  const dir = copyApp(t, "sdk/template", "my-app");
  const file = join(dir, "index.html");
  writeFileSync(file, readFileSync(file, "utf8").replace("<script>", '<script data-lo-3d="1.0.0"></script>\n<script>'));
  return { dir, file };
}

test("an empty lo-3d block fails the checker; the tool fills it and the app then passes without a font block", (t) => {
  const { dir, file } = app3d(t);
  assert.match(tool("check-app.mjs", dir).out, /the lo-3d block is empty/);
  const r = tool("bundle-app.mjs", dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /lo-3d \d+\.\d+\.\d+/);
  const html = readFileSync(file, "utf8");
  assert.ok(html.includes(`<script data-lo-3d="${LIB3D_VERSION}">\n${LIB3D}</script>`));
  assert.ok(!html.includes("data-lo-font"), "no lo-game, no font block");
  assert.equal(build(html, dir), html, "idempotent");
  const c = tool("check-app.mjs", dir);
  assert.equal(c.code, 0, c.out);
  assert.match(c.out, new RegExp(`lo-3d ${LIB3D_VERSION.replace(/\./g, "\\.")} verified`));
});

test("an edited lo-3d copy is rejected", (t) => {
  const { dir, file } = app3d(t);
  tool("bundle-app.mjs", dir);
  writeFileSync(file, readFileSync(file, "utf8").replace(LIB3D_BLOCK, (m) => m.replace("</script>", "/* mine */\n</script>")));
  assert.match(tool("check-app.mjs", dir).out, /the lo-3d copy differs from every released version/);
});

/* ---------- the renderer itself ---------- */
const Lo3D = runScript("sdk/lo-3d.js").Lo3D;
const tones = (r) => [0, 1, 2, 3].map((t) => r.image.px.filter((v) => v === t).length);
/* a renderer looking down at the origin from above and in front, like a town camera */
function view(o = {}) {
  const r = Lo3D.create({ width: 64, height: 48 });
  Object.assign(r.camera, { pitch: -0.6, dist: 6, focal: 50 });
  r.sun = { dir: Lo3D.norm([0, 1, 0]), ambient: 0.3, diffuse: 0.7 };
  Object.assign(r, o);
  r.clear(0);
  return r;
}
const ground = (alb = 1) => Lo3D.paint({ v: [[-20, 0, -20], [20, 0, -20], [20, 0, 20], [-20, 0, 20]], t: [[0, 1, 2], [0, 2, 3]] }, alb);

test("lo-3d: the version global matches the file", () => {
  assert.equal(Lo3D.VERSION, LIB3D_VERSION);
});

test("lo-3d: output is only the four tones, as a lo-game sprite", () => {
  const r = view();
  r.draw(Lo3D.box(1, 1, 1));
  const img = r.present();
  assert.deepEqual([img.w, img.h, img.px.length], [64, 48, 64 * 48]);
  assert.ok(img.px.every((v) => v >= 0 && v <= 3));
});

test("lo-3d: a counter-clockwise face is seen, its reverse is culled, two-sided shows both", () => {
  const up = ground(), down = { v: up.v, t: up.t.map((f) => [f[0], f[2], f[1]]), c: up.c };
  let r = view(); r.draw(up); r.present();
  assert.ok(tones(r)[3] > 2000, "ground lit by an overhead sun is paper");
  r = view(); r.draw(down); r.present();
  assert.equal(tones(r)[0], 64 * 48, "seen from behind: nothing drawn");
  r = view(); r.draw(down, null, { two: true }); r.present();
  assert.ok(tones(r)[3] > 2000, "two-sided faces are lit on the side facing the viewer");
});

test("lo-3d: Lo3D.box and Lo3D.ico face outwards", () => {
  for (const m of [Lo3D.box(1, 1, 1), Lo3D.ico(0.6)]) {
    const r = view(); r.draw(m);
    assert.ok(r.depth.some((z) => z < 6), "the near side is what gets drawn");
    assert.ok(Math.min(...r.depth) < 6 - 0.3);
  }
});

test("lo-3d: the z-buffer keeps the nearer surface whatever the drawing order", () => {
  const near = Lo3D.paint(Lo3D.move(Lo3D.box(1, 1, 1), 0, 0.5, -1), 0), far = Lo3D.paint(Lo3D.move(Lo3D.box(1, 1, 1), 0, 0.5, 1), 1);
  const a = view(); a.draw(near); a.draw(far); a.present();
  const b = view(); b.draw(far); b.draw(near); b.present();
  assert.deepEqual(Array.from(a.image.px), Array.from(b.image.px));
});

test("lo-3d: a point light brightens the ground near it, and fog pulls far surfaces to its tone", () => {
  const dark = view({ sun: { dir: [0, 1, 0], ambient: 0.1, diffuse: 0 } });
  dark.draw(ground()); dark.present();
  const lit = view({ sun: { dir: [0, 1, 0], ambient: 0.1, diffuse: 0 }, lights: [{ x: 0, y: 1, z: 0, radius: 3, power: 1.5 }] });
  lit.draw(ground()); lit.present();
  assert.ok(tones(lit)[3] > 50 && tones(dark)[3] === 0);
  const fogged = view({ fog: { near: 0, far: 0.01, lum: 2 / 3 } });
  fogged.draw(ground()); fogged.present();
  const t = tones(fogged);
  assert.ok(t[2] > 2000 && t[3] === 0, "everything behind the fog is mid");
});

test("lo-3d: near-plane clipping keeps the part of a triangle in front of the camera", () => {
  const r = view(); r.camera.pitch = -0.2; r.camera.dist = 0.5;
  r.draw(ground()); r.present();
  const clipped = tones(r)[3];
  const s = view({ clip: false }); s.camera.pitch = -0.2; s.camera.dist = 0.5;
  s.draw(ground()); s.present();
  assert.ok(clipped > 1000 && tones(s)[3] === 0, "without clipping a triangle crossing the near plane is skipped");
});

test("lo-3d: a crisp sprite near the focus depth is drawn 1:1 and hidden behind nearer surfaces", () => {
  const spr = { w: 4, h: 4, px: new Uint8Array(16).fill(3) };
  const r = view(); r.camera.focal = 100;   /* 1/16 unit per pixel at depth 6: k = 1.04 */
  r.sprite(spr, 0, 0, 0, { scale: 1 / 16, crisp: true });
  r.present();
  assert.equal(tones(r)[3], 16);
  const hidden = view(); hidden.camera.focal = 100;
  hidden.draw(Lo3D.paint(Lo3D.move(Lo3D.box(2, 2, 0.2), 0, 0, -1), 0));
  hidden.sprite(spr, 0, 0, 0, { scale: 1 / 16, crisp: true });
  hidden.present();
  assert.equal(tones(hidden)[3], 0);
});
