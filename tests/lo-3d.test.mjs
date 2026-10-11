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

/* ---------- 1.1.0: fixed tones, screen-door alpha, builder, shadow, lookAt, snap ---------- */
const FAR = 1e9, CELLS = 64 * 48;
/* a ground big enough to cover the whole 64x48 screen, so counts are exact */
const wide = (alb = 1) => Lo3D.paint({ v: [[-200, 0, -200], [200, 0, -200], [200, 0, 200], [-200, 0, 200]], t: [[0, 1, 2], [0, 2, 3]] }, alb);
const covered = (r) => Array.from(r.depth).map((z, k) => (z < FAR ? k : -1)).filter((k) => k >= 0);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("lo-3d: tone writes exactly that tone on every covered pixel, whatever sun, fog and point lights", () => {
  for (const t of [0, 1, 2, 3]) {
    const r = view({ fog: { near: 0, far: 0.01, lum: 0 }, lights: [{ x: 0, y: 1, z: 0, radius: 4, power: 3 }] });
    r.clear(1);
    r.draw(Lo3D.move(Lo3D.box(2, 2, 2), 0, 1, 0), null, { tone: t });
    r.present();
    const hit = covered(r);
    assert.ok(hit.length > 100);
    assert.ok(hit.every((k) => r.image.px[k] === t), "tone " + t);
    if (t < 3) assert.equal(tones(r)[t], hit.length, "nothing else is that tone (the background is paper)");
  }
});

test("lo-3d: a toned surface is still depth-tested, and a nearer normal surface replaces it in either order", () => {
  const box = Lo3D.move(Lo3D.box(1, 1, 1), 0, 0.5, 0);
  const solo = view(); solo.draw(box);
  const n = covered(solo).length;
  assert.ok(n > 50);
  const a = view(); a.draw(wide(), null, { tone: 2 }); a.draw(box); a.present();   /* the box comes later: it is nearer, so it wins */
  const b = view(); b.draw(box); b.draw(wide(), null, { tone: 2 }); b.present();   /* the toned ground comes later: it fails the depth test */
  assert.deepEqual(Array.from(a.image.px), Array.from(b.image.px));
  assert.equal(tones(a)[2], CELLS - n, "the box has no mid pixels of its own, so every mid pixel is the toned ground");
});

test("lo-3d: clear resets fixed tones", () => {
  const r = view();
  r.draw(wide(), null, { tone: 2 }); r.present();
  assert.equal(tones(r)[2], CELLS);
  r.clear(0); r.draw(Lo3D.box(1, 1, 1)); r.present();
  assert.equal(tones(r)[2], 0);
});

test("lo-3d: a toned sprite paints every opaque pixel in that tone", () => {
  const px = new Uint8Array(16).fill(0); px[0] = 255;   /* tone 0 pixels and one transparent corner */
  const r = view(); r.camera.focal = 192;   /* k = 2 */
  r.sprite({ w: 4, h: 4, px }, 0, 0, 0, { anchor: "center", tone: 2 });
  r.present();
  assert.equal(tones(r)[2], 15 * 4);
});

test("lo-3d: alpha keeps that share of a surface, in a fixed 4x4 pattern", () => {
  for (const a of [0.25, 0.5, 0.75]) {
    const r = view(); r.draw(wide(), null, { tone: 3, alpha: a }); r.present();
    assert.equal(tones(r)[3], a * CELLS, "alpha " + a);
  }
});

test("lo-3d: alpha 0 draws nothing, alpha 1 is the same as no alpha", () => {
  const r = view(); r.draw(wide(), null, { alpha: 0 });
  assert.equal(r.stats.tris, 0);
  assert.ok(r.depth.every((z) => z >= FAR));
  const a = view(); a.draw(Lo3D.box(1, 1, 1)); a.present();
  const b = view(); b.draw(Lo3D.box(1, 1, 1), null, { alpha: 1 }); b.present();
  assert.deepEqual(Array.from(a.image.px), Array.from(b.image.px));
});

test("lo-3d: the alpha pattern is tied to the screen, not to the surface", () => {
  const frame = (dx) => { const r = view(); r.camera.x = dx; r.draw(wide(), null, { tone: 3, alpha: 0.5 }); r.present(); return Array.from(r.image.px); };
  assert.deepEqual(frame(0), frame(0));
  assert.deepEqual(frame(0), frame(0.01), "a full-screen surface keeps the same pixels when the camera moves");
});

test("lo-3d: a half-transparent lit surface keeps pixels of both neighbouring tones", () => {
  /* luminance 0.5 sits between dark and mid; with the same matrix for alpha and dither the kept pixels would all fall on one side */
  const r = view(); r.draw(wide(0.5), null, { alpha: 0.5 }); r.present();
  const t = tones(r);
  assert.ok(t[1] > 0 && t[2] > 0, "both tones 1 and 2 survive");
  assert.equal(t[3], 0);
});

test("lo-3d: alpha works on sprites", () => {
  const r = view(); r.camera.focal = 192;   /* k = 2: the 4x4 sprite is an 8x8 block at (28, 20), aligned to the 4x4 pattern */
  r.sprite({ w: 4, h: 4, px: new Uint8Array(16).fill(3) }, 0, 0, 0, { anchor: "center", alpha: 0.5 });
  r.present();
  assert.equal(tones(r)[3], 32);
});

test("lo-3d: builder is a mesh whose methods chain", () => {
  const b = Lo3D.builder();
  assert.ok(Array.isArray(b.v) && Array.isArray(b.t) && Array.isArray(b.c));
  const p = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  assert.equal(b.tri([0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], 1), b);
  assert.equal(b.quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], 1), b);
  assert.equal(b.box(0, 0, 0, 1, 1, 1, 1), b);
  assert.equal(b.cone(0, 0, 0, 1, 1, 6, 1), b);
  assert.equal(b.roof(0, 0, 1, 1, 1, 1, 0.2, 1), b);
  assert.equal(b.tube(p, 0.1, 6, 1), b);
  assert.equal(b.ribbon(p, 1, 1), b);
  assert.equal(b.c.length, b.t.length, "one albedo per triangle");
});

test("lo-3d: builder faces are wound to the side `out` points to", () => {
  const quad = (out) => Lo3D.builder().quad([-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], out, 1);
  const up = view(); up.draw(quad([0, 1, 0]));
  assert.ok(covered(up).length > 50, "seen from above");
  const down = view(); down.draw(quad([0, -1, 0]));
  assert.equal(covered(down).length, 0, "the same quad facing down is culled");
});

test("lo-3d: builder box and cone render their outside; box can drop its top", () => {
  /* the centre pixel looks through the origin, so an outside face is hit before depth 6 and an inside one after */
  const mid = 24 * 64 + 32;
  const box = view(); box.draw(Lo3D.builder().box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 1));
  assert.ok(box.depth[mid] < 6 - 0.3);
  const cone = view(); cone.draw(Lo3D.builder().cone(0, -1, 0, 1.5, 2, 8, 1));
  assert.ok(cone.depth[mid] < 6 - 0.3);
  assert.equal(Lo3D.builder().box(0, 0, 0, 1, 1, 1, 1).t.length, 10);
  const open = Lo3D.builder().box(0, 0, 0, 1, 1, 1, 0.5, false);
  assert.equal(open.t.length, 8);
  const lid = Lo3D.builder().box(0, 0, 0, 1, 1, 1, 0.5, 0.9);
  assert.deepEqual(Array.from(lid.c.slice(-2)), [0.9, 0.9], "top takes its own albedo");
});

test("lo-3d: tube triangle count, caps and zero-radius ends", () => {
  const line = [0, 1, 2, 3].map((x) => [x, 0, 0]);
  assert.equal(Lo3D.builder().tube(line, 0.2, 6, 1).t.length, 3 * 6 * 2 + 2 * 6);
  assert.equal(Lo3D.builder().tube(line, 0.2, undefined, 1).t.length, 3 * 6 * 2 + 2 * 6, "6 sides by default");
  const cone = Lo3D.builder().tube([0, 1, 2, 3, 4].map((x) => [x, 0, 0]), (t) => 1 - t, 4, 1);
  assert.equal(cone.t.length, 4 * 4 * 2 + 4, "no cap where the radius is 0");
  const none = Lo3D.builder();
  assert.equal(none.tube([[0, 0, 0]], 1, 6, 1), none);
  assert.equal(none.tube([], 1, 6, 1).t.length, 0);
});

test("lo-3d: a straight tube keeps every vertex on its radius", () => {
  const b = Lo3D.builder().tube([0, 1, 2, 3].map((x) => [x, 0, 0]), 0.2, 6, 1);
  /* the only vertices off the radius are the cap centres, which sit on the axis */
  for (const p of b.v) {
    const d = Math.hypot(p[1], p[2]);
    assert.ok(Math.abs(d - 0.2) < 1e-9 || d < 1e-9, "distance " + d);
  }
  assert.equal(b.v.filter((p) => Math.abs(Math.hypot(p[1], p[2]) - 0.2) < 1e-9).length > 0, true);
});

test("lo-3d: a tube round a bend does not twist", () => {
  const R = 3, rad = 0.2, sides = 6, n = 9;
  const path = Array.from({ length: n }, (_, i) => { const a = i / (n - 1) * Math.PI / 2; return [R * Math.cos(a), 0, R * Math.sin(a)]; });
  const b = Lo3D.builder().tube(path, rad, sides, 1);
  /* each side quad is 6 vertices: A0[j], A0[k], A1[k], A0[j], A1[k], A1[j] */
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const base = 6 * (i * sides + j), p = b.v[base], q = b.v[base + 5];
    const T = Lo3D.norm(Lo3D.sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
    assert.ok(Math.abs(dist(p, path[i]) - rad) < 1e-9, "ring " + i + " at its radius");
    assert.ok(Math.abs(Lo3D.dot(Lo3D.sub(p, path[i]), T)) < 1e-9, "ring " + i + " square to the path");
    assert.ok(Math.abs(dist(p, q) - dist(path[i], path[i + 1])) < 0.06, "the sides run along the path, not round it");
  }
});

test("lo-3d: a tube renders its outside", () => {
  const r = view(); r.draw(Lo3D.builder().tube([[-2, 0, 0], [0, 0, 0], [2, 0, 0]], 0.8, 6, 1));
  assert.ok(r.depth[24 * 64 + 32] < 6 - 0.3);
});

test("lo-3d: ribbon triangles, flat layout and width", () => {
  const path = [0, 1, 2, 3].map((x) => [x, 1, 0]);
  const b = Lo3D.builder().ribbon(path, 2, 1);
  assert.equal(b.t.length, 3 * 2);
  assert.ok(b.v.every((p) => p[1] === 1), "flat at the path's height");
  assert.deepEqual([...new Set(b.v.map((p) => p[2]))].sort(), [-1, 1], "2 wide in z");
  /* width as a function of t: 1, 2.5, 4; a quad is L[i], R[i], R[i+1], L[i], R[i+1], L[i+1] */
  const w = Lo3D.builder().ribbon([[0, 0, 0], [1, 0, 0], [2, 0, 0]], (t) => 1 + t * 3, 1);
  assert.equal(w.t.length, 4);
  assert.ok(Math.abs(Math.abs(w.v[0][2] - w.v[1][2]) - 1) < 1e-9);
  assert.ok(Math.abs(Math.abs(w.v[6][2] - w.v[7][2]) - 2.5) < 1e-9);
  assert.ok(Math.abs(Math.abs(w.v[11][2] - w.v[8][2]) - 4) < 1e-9);
  assert.equal(Lo3D.builder().ribbon([[0, 0, 0]], 1, 1).t.length, 0);
});

test("lo-3d: a ribbon is seen from the side `up` points to, both with two", () => {
  const path = [-3, -1, 1, 3].map((x) => [x, 0, 0]);
  const top = view(); top.draw(Lo3D.builder().ribbon(path, 2, 1));
  assert.ok(covered(top).length > 50);
  const under = view(); under.draw(Lo3D.builder().ribbon(path, 2, 1, [0, -1, 0]));
  assert.equal(covered(under).length, 0, "from above the underside is culled");
  const both = view(); both.draw(Lo3D.builder().ribbon(path, 2, 1, [0, -1, 0]), null, { two: true });
  assert.equal(covered(both).length, covered(top).length);
});

test("lo-3d: shadow is a flat disc just above the ground and shows dark on lit ground", () => {
  const s = Lo3D.shadow(0.5);
  assert.equal(s.t.length, 8);
  assert.equal(Lo3D.shadow(0.5, 12).t.length, 12);
  assert.ok(s.v.every((p) => p[1] >= 0.03 && p[1] <= 0.0301));
  assert.ok(s.v.every((p) => { const d = Math.hypot(p[0], p[2]); return Math.abs(d - 0.5) < 1e-9 || d < 1e-9; }), "rim radius r, apex in the middle");
  assert.ok(s.c.every((a) => a === 0.02));
  const r = view(); r.draw(wide()); r.draw(Lo3D.shadow(1));
  r.present();
  const t = tones(r);
  assert.ok(t[0] > 30, "the disc is dark");
  assert.equal(t[2], 0);
  assert.equal(t[0] + t[1] + t[3], CELLS);
  assert.ok(t[3] > CELLS / 2, "the ground stays lit");
});

test("lo-3d: lookAt puts the target in the middle of the screen", () => {
  const r = view();
  const pairs = [[[0, 5, -5], [0, 0, 0]], [[0, -3, -4], [0, 1, 0]], [[3, 1, 5], [0, 1, 0]], [[4, 2, 1], [0, 2, 1]], [[0, 5, 0], [0, 0, 0]], [[-2, 0.5, 3], [1, 4, -2]]];
  for (const [eye, target] of pairs) {
    r.camera.yaw = 0.7;
    assert.equal(r.lookAt(eye, target), r.camera);
    assert.deepEqual([r.camera.x, r.camera.y, r.camera.z, r.camera.dist], [...eye, 0]);
    const p = r.project(target);
    assert.ok(Math.abs(p[0] - 32) < 1e-6 && Math.abs(p[1] - 24) < 1e-6, JSON.stringify([eye, target, p]));
    assert.ok(Math.abs(p[2] - dist(eye, target)) < 1e-6, "depth is the distance");
  }
  r.lookAt([0, 5, -5], [0, 0, 0]);
  assert.ok(r.camera.pitch < 0, "looking down");
  r.lookAt([0, -3, -4], [0, 1, 0]);
  assert.ok(r.camera.pitch > 0, "looking up");
  /* the orbit camera works again once dist is set back */
  Object.assign(r.camera, { x: 1, y: 2, z: 3, dist: 6 });
  const o = r.project([1, 2, 3]);
  assert.ok(Math.abs(o[0] - 32) < 1e-6 && Math.abs(o[1] - 24) < 1e-6 && Math.abs(o[2] - 6) < 1e-9);
});

test("lo-3d: a snapped sprite is a whole multiple or whole fraction of its pixels", () => {
  /* depth 6, scale 1/16: k = focal / 96 */
  const count = (focal, size, o) => {
    const r = view(); r.camera.focal = focal;
    r.sprite({ w: size, h: size, px: new Uint8Array(size * size).fill(3) }, 0, 0, 0, Object.assign({ anchor: "center" }, o));
    r.present();
    return tones(r)[3];
  };
  assert.equal(count(1.6 * 96, 4, { snap: true }), 64, "1.6 rounds to 2");
  assert.equal(count(2.4 * 96, 4, { snap: true }), 64, "2.4 rounds to 2");
  assert.equal(count(0.55 * 96, 8, { snap: true }), 16, "0.55 rounds to 1/2");
  assert.notEqual(count(1.6 * 96, 4, {}), 64, "without snap the pixels are uneven");
});
