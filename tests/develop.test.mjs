// runtime/develop.js: developing a frame (docs/design/darkroom.md section 4, decisions.md section 19).
// Synthetic pictures only: gradients, colour patches and a lamp on a dark ground.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const D = runScript("runtime/develop.js").LopdaDevelop;
const W = 800, H = 700;

/* an 800x700 RGBA picture from a function (x, y) -> [r, g, b] */
function picture(fn) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = fn(x, y), q = (y * W + x) * 4;
    data[q] = c[0]; data[q + 1] = c[1]; data[q + 2] = c[2]; data[q + 3] = 255;
  }
  return { data, w: W, h: H };
}
const grey = (v) => () => [v, v, v];
const gradient = picture((x) => { const v = Math.round(x / (W - 1) * 255); return [v, v, v]; });
const patches = picture((x, y) => [[200, 40, 40], [40, 160, 60], [50, 80, 200], [230, 200, 150], [90, 140, 200], [30, 30, 30], [120, 120, 120]][Math.floor(y / 100)]);
const LAMP = { x: 400, y: 350, r: 20 };
const lamp = picture((x, y) => (x - LAMP.x) ** 2 + (y - LAMP.y) ** 2 < LAMP.r ** 2 ? [255, 252, 240] : [22, 22, 26]);
const flat = picture(grey(128));

/* a seed whose roll has no light leak on frame n (leaks would tint the means) */
const quietSeed = (n = 5, size = 16) => { for (let s = 1; ; s++) if (!D.leakOf(s, n, size)) return s; };
const opts = (o = {}) => ({ stock: "portrait", rollSeed: quietSeed(), size: 16, res: 1, n: 5, exposure: 0, contrast: 0,
  dated: false, taken: Date.UTC(2026, 9, 15, 12), blank: null, devSeed: 12345, v: D.VERSION, scale: 1, ...o });

/* mean r, g, b over a box */
function mean(img, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const q = (y * img.w + x) * 4; r += img.data[q]; g += img.data[q + 1]; b += img.data[q + 2]; n++; }
  return [r / n, g / n, b / n];
}
function lumaStd(img, x0, y0, x1, y1) {
  const v = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const q = (y * img.w + x) * 4; v.push(0.299 * img.data[q] + 0.587 * img.data[q + 1] + 0.114 * img.data[q + 2]); }
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test("same pixels, seeds and version give the same bytes; another develop seed does not", () => {
  const a = D.develop(patches, opts({ dated: true, n: 1, rollSeed: 7 }));
  const b = D.develop(patches, opts({ dated: true, n: 1, rollSeed: 7 }));
  assert.deepEqual([a.w, a.h], [W, H]);
  assert.ok(same(a.data, b.data), "byte-identical");
  const c = D.develop(patches, opts({ dated: true, n: 1, rollSeed: 7, devSeed: 54321 }));
  assert.ok(!same(a.data, c.data), "a different develop seed changes the picture");
});

test("the develop seed comes from the roll id and the develop time, as a uint32", () => {
  const s = D.devSeed("rmg7x2kq1a2b", 1791800000000);
  assert.equal(s, D.devSeed("rmg7x2kq1a2b", 1791800000000));
  assert.equal(s >>> 0, s);
  assert.notEqual(s, D.devSeed("rmg7x2kq1a2b", 1791800000001));
  assert.notEqual(s, D.devSeed("rmg7x2kq1a2c", 1791800000000));
});

test("an unknown algorithm version is refused, never developed differently", () => {
  assert.throws(() => D.develop(flat, opts({ v: D.VERSION + 1 })));
});

test("SUNNY is warmer than PORTRAIT", () => {
  const warmth = (stock) => { const m = mean(D.develop(gradient, opts({ stock })), 100, 100, 700, 600); return m[0] - m[2]; };
  assert.ok(warmth("sunny") > warmth("portrait") + 5, `sunny ${warmth("sunny")} portrait ${warmth("portrait")}`);
  assert.ok(warmth("portrait") > 0, "portrait is warm too");
});

test("VERDE is cooler and greener in the shadows than PORTRAIT", () => {
  const dark = picture(grey(45));
  const cool = (stock) => { const m = mean(D.develop(dark, opts({ stock })), 200, 200, 600, 500); return (m[1] + m[2]) / 2 - m[0]; };
  assert.ok(cool("verde") > cool("portrait") + 4, `verde ${cool("verde")} portrait ${cool("portrait")}`);
  assert.ok(cool("verde") > 0);
});

test("NOIR is black and white everywhere: patches, light leak, dust, date stamp, blank frames", () => {
  let leaky = 1; while (!D.leakOf(leaky, 1, 16)) leaky++;
  for (const img of [D.develop(patches, opts({ stock: "noir", rollSeed: leaky, n: 1, dated: true })), D.develop(lamp, opts({ stock: "noir", scale: 2 })),
    D.develop(null, opts({ stock: "noir", blank: "light" })), D.develop(null, opts({ stock: "noir" }))]) {
    for (let q = 0; q < img.data.length; q += 4) {
      if (img.data[q] !== img.data[q + 1] || img.data[q] !== img.data[q + 2]) assert.fail(`colour at ${q / 4}: ${img.data.slice(q, q + 3)}`);
    }
  }
});

test("TUNGSTEN glows red round a lamp; other stocks barely", () => {
  /* a ring just outside the lamp */
  const ring = (img) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - LAMP.x, y - LAMP.y);
      if (d > LAMP.r + 6 && d < LAMP.r + 26) { const q = (y * W + x) * 4; r += img.data[q]; g += img.data[q + 1]; b += img.data[q + 2]; n++; }
    }
    return [r / n, g / n, b / n];
  };
  const t = ring(D.develop(lamp, opts({ stock: "tungsten" }))), p = ring(D.develop(lamp, opts({ stock: "portrait" })));
  assert.ok(t[0] - t[1] > 30 && t[0] - t[2] > 30, "tungsten ring is red: " + t.map(Math.round));
  assert.ok(t[0] - t[1] > 2 * (p[0] - p[1]) + 15, "and much redder than portrait's: " + p.map(Math.round));
});

test("grain: standard film is grainier than fine grain, and NOIR grainier than PORTRAIT", () => {
  const box = [300, 250, 500, 450];
  const std = (o) => lumaStd(D.develop(flat, opts(o)), ...box);
  assert.ok(std({ res: 1 }) > std({ res: 2 }) * 1.2, `standard ${std({ res: 1 })} fine ${std({ res: 2 })}`);
  assert.ok(std({ stock: "noir" }) > std({ stock: "portrait" }));
});

test("a single print is 1600x1400 with sharp grain, not doubled pixels", () => {
  const big = D.develop(flat, opts({ scale: 2 }));
  assert.deepEqual([big.w, big.h], [1600, 1400]);
  let pairs = 0, equal = 0;
  for (let y = 600; y < 800; y++) for (let x = 600; x < 1000; x += 2) {
    const q = (y * 1600 + x) * 4; pairs++;
    if (big.data[q] === big.data[q + 4] && big.data[q + 1] === big.data[q + 5]) equal++;
  }
  assert.ok(equal / pairs < 0.3, `${equal} of ${pairs} pixel pairs are doubled`);
  /* the same picture as the small one, give or take the grain */
  const small = D.develop(flat, opts()), m1 = mean(small, 300, 250, 500, 450), m2 = mean(big, 600, 500, 1000, 900);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(m1[c] - m2[c]) < 3, `channel ${c}: ${m1[c]} vs ${m2[c]}`);
});

test("a dated frame gets the orange stamp in the lower right; an undated one does not", () => {
  const dark = picture(grey(40));
  const on = D.develop(dark, opts({ dated: true })), off = D.develop(dark, opts({ dated: false }));
  let diff = 0, orange = 0, outside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = (y * W + x) * 4;
    if (on.data[q] !== off.data[q] || on.data[q + 1] !== off.data[q + 1] || on.data[q + 2] !== off.data[q + 2]) {
      diff++;
      if (x < W / 2 || y < H * 0.8) outside++;
      if (on.data[q] > 200 && on.data[q] > on.data[q + 1] + 40 && on.data[q + 1] > on.data[q + 2]) orange++;
    }
  }
  assert.ok(diff > 500, "stamp pixels: " + diff);
  assert.equal(outside, 0, "only in the lower right");
  assert.ok(orange > 200, "orange-red: " + orange);
  let lit = 0;
  for (let q = 0; q < off.data.length; q += 4) if (off.data[q] > 200 && off.data[q] > off.data[q + 1] + 40) lit++;
  assert.equal(lit, 0, "no stamp on an undated frame");
});

test("frame 1 catches light leaks far more often than the middle of the roll; the end now and then", () => {
  const rate = (n) => { let k = 0; for (let s = 0; s < 4000; s++) if (D.leakOf(s * 2654435761 >>> 0, n, 16)) k++; return k / 4000; };
  const first = rate(1), mid = rate(8), last = rate(16);
  assert.ok(first > 0.4 && first > 5 * mid, `first ${first} middle ${mid}`);
  assert.ok(last > mid * 2, `last ${last} middle ${mid}`);
  assert.ok(mid > 0, "now and then in the middle too");
  /* a leak is decided at load time: the develop seed has nothing to do with it */
  let s = 1; while (!D.leakOf(s, 1, 16)) s++;
  const a = D.develop(flat, opts({ rollSeed: s, n: 1 })), b = D.develop(flat, opts({ rollSeed: quietSeed(1), n: 1 }));
  const edge = (img, side) => mean(img, side ? W - 40 : 0, 0, side ? W : 40, H);
  const leak = D.leakOf(s, 1, 16), ea = edge(a, leak.side), eb = edge(b, leak.side);
  assert.ok(ea[0] > eb[0] + 8, `the leak brightens its edge: ${ea[0]} vs ${eb[0]}`);
});

test("blank frames and lost latents develop as bare film, never an error", () => {
  const fog = D.develop(null, opts({ blank: "light", dated: true })), none = D.develop(null, opts({ dated: true })), shot = D.develop(flat, opts({ blank: "dark" }));
  const mf = mean(fog, 300, 250, 500, 450), mn = mean(none, 300, 250, 500, 450);
  assert.ok(mf.every((v) => v > 200), "fogged film prints bright: " + mf.map(Math.round));
  assert.ok(mn.every((v) => v < 40), "unexposed film prints its dark base: " + mn.map(Math.round));
  assert.ok(lumaStd(shot, 300, 250, 500, 450) < 12, "a blank frame shows no picture even if one is passed");
  /* no stamp without a picture */
  let lit = 0;
  for (let q = 0; q < none.data.length; q += 4) if (none.data[q] > 150) lit++;
  assert.ok(lit < 400, "no date on an empty frame: " + lit);
});

test("every stock develops, and an EXPIRED roll fades its own way", () => {
  for (const stock of D.ORDER) {
    const img = D.develop(patches, opts({ stock }));
    assert.equal(img.data.length, W * H * 4, stock);
    assert.ok(D.edgeOf(stock).edge.length === 3, stock + " has an edge colour");
  }
  const a = mean(D.develop(gradient, opts({ stock: "expired", rollSeed: 3 })), 100, 100, 700, 600);
  const casts = new Set();
  for (let s = 1; s < 40; s++) { const st = D.stockFor("expired", s); casts.add(st.wb.map((v) => v.toFixed(2)).join()); }
  assert.ok(casts.size > 20, "rolls differ: " + casts.size);
  assert.ok(a.every((v) => v > 30 && v < 225), "faded, never pure black or white on average");
});

test("shrink averages to the strip's frame size", () => {
  const img = D.develop(flat, opts());
  const s = D.shrink(img, 256, 224);
  assert.deepEqual([s.w, s.h, s.data.length], [256, 224, 256 * 224 * 4]);
  const m1 = mean(img, 0, 0, W, H), m2 = mean(s, 0, 0, 256, 224);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(m1[c] - m2[c]) < 1.5);
});
