// Runs a DOM-built registry app (one that draws its menus as HTML, not only on a canvas) in Node with a
// loose fake DOM: every element accepts any property, class list, listener and 2D context call, and does
// nothing with it. Enough to drive an app's own logic through PAD; nothing is laid out or painted.
import { readFileSync } from "node:fs";
import { scripts, mulberry32 } from "./app-vm.mjs";

function fakeCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createImageData") return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (k === "getImageData") return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (k === "measureText") return () => ({ width: 8 });
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function fakeElement(id) {
  const classes = new Set(), listeners = {};
  let parent = null;
  const el = {
    get parentNode() { return parent || (parent = fakeElement()); }, lastElementChild: null,
    id, style: {}, dataset: {}, children: [], width: 300, height: 300, clientWidth: 331, clientHeight: 359,
    offsetWidth: 331, offsetHeight: 20, textContent: "", innerHTML: "", value: "",
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c), toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : on; if (v) classes.add(c); else classes.delete(c); return v; }
    },
    get className() { return [...classes].join(" "); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    listeners,
    addEventListener(type, f) { (listeners[type] = listeners[type] || []).push(f); },
    removeEventListener() {}, appendChild(c) { el.children.push(c); return c; }, removeChild() {},
    setAttribute(k, v) { el["attr:" + k] = String(v); }, getAttribute(k) { return el["attr:" + k] ?? null; },
    querySelector: () => fakeElement(), querySelectorAll: () => [], focus() {}, blur() {}, scrollIntoView() {},
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300 }),
    getContext: () => fakeCtx()
  };
  return el;
}

/* bootDom(file, {pad, seed}): runs the page's inline scripts; returns {ctx, els, frame(), get(name)} */
export function bootDom(file, opt = {}) {
  const els = {}, raf = [], timers = [], winListeners = {}, docListeners = {};
  let now = 0;
  const byId = (id) => (els[id] = els[id] || fakeElement(id));
  const document = {
    getElementById: byId, createElement: () => fakeElement(), querySelector: () => fakeElement(), querySelectorAll: () => [],
    body: fakeElement("body"), head: fakeElement("head"), documentElement: fakeElement("html"),
    addEventListener: (type, f) => { (docListeners[type] = docListeners[type] || []).push(f); }, hidden: false, title: ""
  };
  const g = {
    console, document, ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    performance: { now: () => now }, innerWidth: 331, innerHeight: 359, devicePixelRatio: 1,
    atob: (s) => Buffer.from(String(s), "base64").toString("binary"), btoa: (s) => Buffer.from(String(s), "binary").toString("base64"),
    requestAnimationFrame: (f) => { raf.push(f); return raf.length; }, cancelAnimationFrame() {},
    setTimeout: (f, ms) => { const t = { f, at: now + (ms || 0), id: timers.length + 1 }; timers.push(t); return t.id; },
    clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.f = null; },
    setInterval: () => 0, clearInterval() {},
    addEventListener: (type, f) => { (winListeners[type] = winListeners[type] || []).push(f); },
    Date: { now: () => now },
    Math: Object.create(Math, { random: { value: mulberry32(opt.seed || 1) } })
  };
  if (opt.pad) g.PAD = opt.pad;
  g.window = g;
  const body = scripts(readFileSync(file, "utf8")).join("\n;\n");
  const names = Object.keys(g);
  const run = new Function(...names, body + "\n;return { get: function (name) { return eval(name); } };");
  const ctx = run(...names.map((n) => g[n]));
  /* advance the clock by ms: timers due by then fire in order, and one animation frame runs */
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.f && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at; const f = due.f; due.f = null; f();
    }
    now = end;
    raf.splice(0).forEach((f) => f(now));
  };
  /* hide(true | false): the page goes to the background (another app, the lock button) or comes back */
  const hide = (on) => { document.hidden = !!on; (docListeners.visibilitychange || []).forEach((f) => f({ type: "visibilitychange" })); };
  return { ctx, els, advance, hide, get: ctx.get };
}
