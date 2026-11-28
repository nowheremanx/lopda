// Runs a registry app's index.html in Node with a tiny fake DOM and a manual clock. Every pixel an app
// shows goes through putImageData, so the frames can be hashed without a browser: tests/frame-hashes.mjs
// compares builds with it, and tests/zhenyao-budget.test.mjs counts triangles and lights per frame.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/* the inline scripts of an HTML file, in order */
export function scripts(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/* boot(file, {seed, pad, extra}): runs the app's scripts, then the files in `extra`, in one scope.
   Returns {ctx, frame(), hashes}: frame() runs one screen refresh (1/60 s), hashes gets one sha256 per
   putImageData. Math.random is seeded, so a run is the same every time. */
export function boot(file, opt = {}) {
  const raf = [], listeners = {}, hashes = [];
  const ctx2d = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { hashes.push(createHash("sha256").update(img.data).digest("hex").slice(0, 16)); if (opt.onPut) opt.onPut(img); },
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    measureText: () => ({ width: 12 }), fillText() {}, clearRect() {}
  };
  /* every element's listeners by event type: the canvas's pointer listeners are how pointer() taps the screen.
     opt.stage ({w, h}) gives the page a phone-sized stage: lo-game's fill mode reads it from getBoundingClientRect. */
  const elListeners = {};
  const rect = opt.stage
    ? { left: 0, top: 0, width: opt.stage.w, height: opt.stage.h }
    : { left: 0, top: 0, width: 160, height: 144 };
  const el = () => ({
    style: {}, width: 0, height: 0, textContent: "", clientWidth: 0, clientHeight: 0,
    addEventListener(type, f) { (elListeners[type] = elListeners[type] || []).push(f); },
    removeEventListener(type, f) { const a = elListeners[type] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    appendChild() {}, setPointerCapture() {},
    getContext: () => ctx2d, getBoundingClientRect: () => rect
  });
  class KeyboardEvent { constructor(type, o = {}) { this.type = type; this.key = o.key; this.repeat = false; } preventDefault() {} }
  /* the page's globals. The scripts run as one function in this realm rather than in a vm context, whose
     global lookups (Math, every top-level var) are many times slower */
  const g = {
    console, performance, KeyboardEvent, atob, btoa,
    document: { createElement: el, body: el(), head: el(), documentElement: el(), getElementById: () => el(), addEventListener() {} },
    innerWidth: 160, innerHeight: 144, devicePixelRatio: 1,
    requestAnimationFrame: (f) => { raf.push(f); return raf.length; },
    addEventListener: (type, f) => { (listeners[type] = listeners[type] || []).push(f); },
    removeEventListener: (type, f) => { const a = listeners[type] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); },
    __yield: () => new Promise((r) => setImmediate(r)),
    __frame: () => { const q = raf.splice(0); ts += 1000 / 60 + 1e-4; q.forEach((f) => f(ts)); },
    Math: Object.create(Math, { random: { value: mulberry32(opt.seed || 1) } })
  };
  if (opt.pad) g.PAD = opt.pad;
  /* a little over 1/60 s per refresh, so float rounding never runs a game step twice or not at all */
  let ts = 0;
  g.window = g;
  const body = scripts(readFileSync(file, "utf8")).concat((opt.extra || []).map((f) => readFileSync(f, "utf8"))).join("\n;\n");
  /* ctx.get("name") reads any of the page's top-level variables as it is now */
  const names = Object.keys(g);
  const run = new Function(...names, body + "\n;return { get: function (name) { return eval(name); } };");
  const ctx = run(...names.map((n) => g[n]));
  /* pointer(type, x, y, w, h, view): a "pointerdown" / "pointerup" at screen pixel x, y of a w x h game screen
     (the fake canvas is 160 x 144 css px, so the point is scaled to it). `view` ({k}) is a fill stage's
     CSS pixels per canvas pixel: x, y are then canvas pixels, so the app's real fit-and-offset mapping
     is what turns them into world pixels. */
  const pointer = (type, x, y, w = 160, h = 144, view = null) => {
    const e = view
      ? { pointerId: 1, clientX: (x + 0.5) * (view.k || 1), clientY: (y + 0.5) * (view.k || 1), preventDefault() {} }
      : { pointerId: 1, clientX: (x + 0.5) * 160 / w, clientY: (y + 0.5) * 144 / h, preventDefault() {} };
    (elListeners[type] || []).forEach((f) => f(e));
  };
  /* pointerRaw(type, clientX, clientY): at page CSS pixels (the fake rect starts at 0, 0), for fill apps whose
     stage is not the world's size */
  const pointerRaw = (type, clientX, clientY) => {
    const e = { pointerId: 1, clientX, clientY, preventDefault() {} };
    (elListeners[type] || []).forEach((f) => f(e));
  };
  return { ctx, frame: g.__frame, hashes, pointer, pointerRaw };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
