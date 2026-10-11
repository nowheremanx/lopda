/*
 * lo-game.js 1.2.0, a tiny game framework for Lo-PDA apps.
 * MIT License. Copyright (c) 2026 Haowei Wu. See sdk/LICENSE.
 *
 * Paste-in library: an app carries its own copy inside a script tag marked
 * data-lo-game="1.2.0", and `node tools/lo-game.mjs registry/apps/<id>` fills it in.
 * The same tool adds a pixel-font block holding just the characters the app uses.
 * Do not edit the copy inside an app; the checker verifies it.
 *
 * Everything is drawn into a four-tone indexed framebuffer (values 0-3), so
 * nothing can ever show a colour outside the palette or a blurred edge.
 * Reference: sdk/LO-GAME.md
 */
var LoGame = (function () {
  "use strict";

  var VERSION = "1.2.0";
  var TONES = ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"];
  var INK = 0, DARK = 1, MID = 2, PAPER = 3;
  var CLEAR = 255;
  var BUTTONS = ["up", "down", "left", "right", "a", "b", "start", "select"];
  var KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    x: "a", X: "a", z: "b", Z: "b", Enter: "start", Shift: "select" };
  var HAS_PAD = typeof PAD !== "undefined";
  var BITMAP_FONT = null;   /* set by LoGame.font(data), from the data-lo-font block */
  function font(data) { BITMAP_FONT = data; }
  function b64bits(str, n) {
    var bin = atob(str), out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    return out;
  }

  /* bilingual text (1.2.0): t({zh: "...", en: "..."}, vars) picks PAD.lang, else the fallback
     language, else whichever the app wrote. Plain strings pass through. "{name}" is filled from vars. */
  function padLang() { var l = HAS_PAD && PAD.lang; return l === "zh" || l === "en" ? l : null; }
  function pick(text, lang, vars) {
    var s = text;
    if (s && typeof s === "object") { s = s[lang]; if (s == null) s = text.zh != null ? text.zh : text.en; }
    s = s == null ? "" : String(s);
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? "" : String(vars[k]); }) : s;
  }
  function t(text, vars) { return pick(text, padLang() || "zh", vars); }

  function rgbOf(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  var RGB = TONES.map(rgbOf);

  /* ---------------- small helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(v, target, step) { return v < target ? Math.min(v + step, target) : Math.max(v - step, target); }
  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    var next = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    return {
      next: next,
      int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; }
    };
  }
  var EASE = {
    linear: function (t) { return t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    "in": function (t) { return t * t; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  };

  /* ---------------- sprites: rows of "0123." ---------------- */
  function sprite(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("sprite: give an array of strings");
    var h = rows.length, w = rows[0].length, px = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error("sprite: row " + y + " is " + rows[y].length + " wide, expected " + w);
      for (var x = 0; x < w; x++) {
        var c = rows[y].charCodeAt(x) - 48;
        px[y * w + x] = c >= 0 && c <= 3 ? c : CLEAR;
      }
    }
    return { w: w, h: h, px: px };
  }
  function sprites(table) { var out = {}; Object.keys(table).forEach(function (k) { out[k] = sprite(table[k]); }); return out; }

  /* ---------------- tile maps ---------------- */
  function tilemap(opt) {
    var rows = opt.map.slice(), size = opt.size || 8, tiles = opt.tiles || {}, solid = opt.solid || "";
    var cols = rows[0].length;
    rows.forEach(function (r, i) { if (r.length !== cols) throw new Error("tilemap: row " + i + " is " + r.length + " wide, expected " + cols); });
    var map = {
      size: size, cols: cols, rows: rows.length, width: cols * size, height: rows.length * size,
      get: function (tx, ty) { return ty < 0 || ty >= rows.length || tx < 0 || tx >= cols ? null : rows[ty][tx]; },
      set: function (tx, ty, ch) { if (map.get(tx, ty) === null) return; rows[ty] = rows[ty].slice(0, tx) + ch + rows[ty].slice(tx + 1); },
      solid: function (tx, ty) { var c = map.get(tx, ty); return c === null || solid.indexOf(c) >= 0; },
      find: function (ch) { var out = []; rows.forEach(function (r, y) { for (var x = 0; x < r.length; x++) if (r[x] === ch) out.push({ x: x, y: y }); }); return out; },
      at: function (px, py) { return { x: Math.floor(px / size), y: Math.floor(py / size) }; },
      draw: function (g, camX, camY) {
        camX = Math.round(camX || 0); camY = Math.round(camY || 0);
        var x0 = Math.max(0, Math.floor(camX / size)), y0 = Math.max(0, Math.floor(camY / size));
        var x1 = Math.min(cols - 1, Math.floor((camX + g.width - 1) / size)), y1 = Math.min(rows.length - 1, Math.floor((camY + g.height - 1) / size));
        for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
          var t = tiles[rows[ty][tx]];
          if (t) g.sprite(t, tx * size - camX, ty * size - camY);
        }
      }
    };
    return map;
  }
  /* top-left of a camera that keeps (x, y) centred inside a world */
  function camera(x, y, viewW, viewH, worldW, worldH) {
    return {
      x: worldW <= viewW ? Math.round((worldW - viewW) / 2) : clamp(Math.round(x - viewW / 2), 0, worldW - viewW),
      y: worldH <= viewH ? Math.round((worldH - viewH) / 2) : clamp(Math.round(y - viewH / 2), 0, worldH - viewH)
    };
  }

  /* ---------------- the game ---------------- */
  function create(opt) {
    opt = opt || {};
    var W = opt.width || 160, H = opt.height || 144;
    var LANG = padLang() || (opt.lang === "en" ? "en" : "zh");   /* opt.lang: the app's own default */
    var STEP = 1 / 60;
    var fontOpt = opt.font || {};
    /* text: the pixel font when the app carries one, the phone's own font otherwise */
    var BF = fontOpt.system ? null : BITMAP_FONT;
    var FONT = { size: fontOpt.size || 12, family: fontOpt.family || "sans-serif", weight: fontOpt.weight || "400",
      threshold: fontOpt.threshold || 0.45 };
    FONT.line = BF ? BF.line : FONT.size + 2;
    FONT.cell = BF ? BF.cell : FONT.line;

    /* --- page and canvas --- */
    var parent = opt.parent || document.body;
    var border = opt.border == null ? PAPER : opt.border;
    if (!opt.parent) {
      var st = document.createElement("style");
      st.textContent = "html,body{margin:0;height:100%;overflow:hidden;background:" + TONES[border] + "}" +
        "body{display:flex;align-items:center;justify-content:center;touch-action:none;-webkit-user-select:none;user-select:none}";
      document.head.appendChild(st);
    }
    var canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = "display:block;image-rendering:pixelated;image-rendering:crisp-edges;touch-action:none";
    parent.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var image = ctx.createImageData(W, H);
    function fit() {
      var aw = parent.clientWidth || innerWidth, ah = parent.clientHeight || innerHeight;
      var dpr = window.devicePixelRatio || 1, best = Math.min(aw / W, ah / H), k = Math.floor(best * dpr) / dpr;
      if (k < best * 0.9) k = best;   /* small screens: size beats perfectly even pixels */
      k = Math.max(0.5, k);
      canvas.style.width = Math.round(W * k) + "px"; canvas.style.height = Math.round(H * k) + "px";
      game.scale = k;
    }

    /* --- framebuffer and drawing --- */
    var buf = new Uint8Array(W * H);
    var ox = 0, oy = 0, cx0 = 0, cy0 = 0, cx1 = W, cy1 = H;
    function put(x, y, c) { if (x >= cx0 && y >= cy0 && x < cx1 && y < cy1) buf[y * W + x] = c; }

    var fc = document.createElement("canvas"), fx = null, glyphs = {}, baseline = 0;
    function fontCtx() {
      if (fx) return fx;
      fc.width = FONT.size * 3; fc.height = FONT.line + 4;
      fx = fc.getContext("2d", { willReadFrequently: true });
      fx.font = FONT.weight + " " + FONT.size + "px " + FONT.family;
      fx.textBaseline = "alphabetic"; fx.fillStyle = TONES[INK];
      var m = fx.measureText("国");
      baseline = BF ? BF.cell - 2 : Math.round(m.actualBoundingBoxAscent || FONT.size * 0.88);
      return fx;
    }
    /* a glyph is the system font at its native pixel size, thresholded to one bit */
    function glyph(ch) {
      var g = glyphs[ch]; if (g) return g;
      var bf = BF && BF.glyphs[ch];
      if (bf) {
        var cut = bf.indexOf(":"), adv0 = +bf.slice(0, cut);
        return (glyphs[ch] = { w: adv0, adv: adv0, h: BF.cell, bits: b64bits(bf.slice(cut + 1), adv0 * BF.cell) });
      }
      var x = fontCtx(), adv = Math.max(1, Math.round(x.measureText(ch).width));
      x.clearRect(0, 0, fc.width, fc.height);
      x.fillText(ch, 0, baseline);
      var h = FONT.cell, w = Math.min(adv, fc.width), d = x.getImageData(0, 0, w, h).data, bits = new Uint8Array(w * h), lim = FONT.threshold * 255;
      for (var i = 0; i < w * h; i++) bits[i] = d[i * 4 + 3] >= lim ? 1 : 0;
      g = glyphs[ch] = { w: w, adv: adv, h: h, bits: bits };
      return g;
    }
    function measure(str) { var w = 0; Array.from(String(str)).forEach(function (ch) { if (ch !== "\n") w += glyph(ch).adv; }); return w; }
    var NO_START = "，。！？、；：）」』》,.!?;:)]%";
    function wrap(str, width) {
      var lines = [];
      String(str).split("\n").forEach(function (para) {
        var tokens = para.match(/[A-Za-z0-9'_\-]+|\s|./gu) || [""], line = "", lw = 0;
        tokens.forEach(function (t) {
          var tw = measure(t);
          if (lw + tw > width && line && NO_START.indexOf(t) < 0) {
            lines.push(line.replace(/\s+$/, "")); line = ""; lw = 0;
            if (/^\s$/.test(t)) return;
          }
          line += t; lw += tw;
        });
        lines.push(line);
      });
      return lines;
    }

    var g = {
      width: W, height: H, INK: INK, DARK: DARK, MID: MID, PAPER: PAPER,
      clear: function (c) { buf.fill(c == null ? PAPER : c); },
      origin: function (x, y) { ox = Math.round(x || 0); oy = Math.round(y || 0); },
      clip: function (x, y, w, h) {
        if (x == null) { cx0 = 0; cy0 = 0; cx1 = W; cy1 = H; return; }
        cx0 = clamp(Math.round(x + ox), 0, W); cy0 = clamp(Math.round(y + oy), 0, H);
        cx1 = clamp(Math.round(x + ox + w), 0, W); cy1 = clamp(Math.round(y + oy + h), 0, H);
      },
      pixel: function (x, y, c) { put(Math.round(x) + ox, Math.round(y) + oy, c); },
      get: function (x, y) { x = Math.round(x) + ox; y = Math.round(y) + oy; return x < 0 || y < 0 || x >= W || y >= H ? null : buf[y * W + x]; },
      rect: function (x, y, w, h, c) {
        x = Math.round(x) + ox; y = Math.round(y) + oy;
        var xa = Math.max(x, cx0), ya = Math.max(y, cy0), xb = Math.min(x + Math.round(w), cx1), yb = Math.min(y + Math.round(h), cy1);
        for (var yy = ya; yy < yb; yy++) buf.fill(c, yy * W + xa, yy * W + Math.max(xa, xb));
      },
      frame: function (x, y, w, h, c) {
        g.rect(x, y, w, 1, c); g.rect(x, y + h - 1, w, 1, c); g.rect(x, y, 1, h, c); g.rect(x + w - 1, y, 1, h, c);
      },
      line: function (x0, y0, x1, y1, c) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
        for (;;) { put(x0 + ox, y0 + oy, c); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
      },
      circle: function (cx, cy, r, c, fill) {
        cx = Math.round(cx); cy = Math.round(cy);
        for (var y = -r; y <= r; y++) {
          var span = Math.round(Math.sqrt(r * r + r - y * y));
          if (fill) g.rect(cx - span, cy + y, span * 2 + 1, 1, c);
          else { g.pixel(cx - span, cy + y, c); g.pixel(cx + span, cy + y, c); }
        }
        if (!fill) for (var x = -r; x <= r; x++) { var s2 = Math.round(Math.sqrt(r * r + r - x * x)); g.pixel(cx + x, cy - s2, c); g.pixel(cx + x, cy + s2, c); }
      },
      /* level 0-4: 0 nothing, 2 checkerboard, 4 solid */
      dither: function (x, y, w, h, c, level) {
        level = clamp(level == null ? 2 : level, 0, 4);
        x = Math.round(x); y = Math.round(y);
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
          var px = (x + xx) & 1, py = (y + yy) & 1;
          var on = level === 4 || (level === 3 && !(px && py)) || (level === 2 && px === py) || (level === 1 && !px && !py);
          if (on) put(x + xx + ox, y + yy + oy, c);
        }
      },
      /* opts: {flip, flipY, color (paint every opaque pixel one tone), map: [t0,t1,t2,t3]} */
      sprite: function (s, x, y, o) {
        o = o || {};
        x = Math.round(x) + ox; y = Math.round(y) + oy;
        var w = s.w, h = s.h, px = s.px, one = o.color, map = o.map;
        for (var yy = 0; yy < h; yy++) {
          var dy = y + yy; if (dy < cy0 || dy >= cy1) continue;
          var sy = o.flipY ? h - 1 - yy : yy;
          for (var xx = 0; xx < w; xx++) {
            var dx = x + xx; if (dx < cx0 || dx >= cx1) continue;
            var v = px[sy * w + (o.flip ? w - 1 - xx : xx)];
            if (v === CLEAR) continue;
            buf[dy * W + dx] = one != null ? one : map ? map[v] : v;
          }
        }
      },
      /* opts: {color, align: "left"|"center"|"right", width (wrap), shadow: tone} -> height drawn */
      text: function (str, x, y, o) {
        o = o || {};
        var color = o.color == null ? INK : o.color;
        var lines = o.width ? wrap(str, o.width) : String(str).split("\n"), yy = Math.round(y);
        lines.forEach(function (ln) {
          /* with a width, align inside x..x+width; without one, x is the centre or the right edge */
          var lw = measure(ln), box = o.width || 0, xx = Math.round(x);
          if (o.align === "center") xx = Math.round(box ? x + (box - lw) / 2 : x - lw / 2);
          else if (o.align === "right") xx = Math.round(box ? x + box - lw : x - lw);
          Array.from(ln).forEach(function (ch) {
            var gl = glyph(ch);
            for (var j = 0; j < gl.h; j++) for (var i = 0; i < gl.w; i++) if (gl.bits[j * gl.w + i]) {
              if (o.shadow != null) put(xx + i + 1 + ox, yy + j + 1 + oy, o.shadow);
              put(xx + i + ox, yy + j + oy, color);
            }
            xx += gl.adv;
          });
          yy += FONT.line;
        });
        return lines.length * FONT.line;
      },
      measure: measure,
      wrap: wrap,
      lineHeight: FONT.line,
      /* the standard window: paper inside, ink border with cut corners */
      window: function (x, y, w, h, o) {
        o = o || {};
        g.rect(x + 1, y + 1, w - 2, h - 2, o.fill == null ? PAPER : o.fill);
        var c = o.border == null ? INK : o.border;
        g.rect(x + 1, y, w - 2, 1, c); g.rect(x + 1, y + h - 1, w - 2, 1, c);
        g.rect(x, y + 1, 1, h - 2, c); g.rect(x + w - 1, y + 1, 1, h - 2, c);
        if (!o.thin) { g.rect(x + 2, y + 2, w - 4, 1, MID); }
      },
      /* a small arrow used by menus and "more" markers */
      arrow: function (x, y, dir, c) {
        c = c == null ? INK : c;
        for (var i = 0; i < 4; i++) {
          if (dir === "down") g.rect(x + i, y + i, 7 - 2 * i, 1, c);
          else g.rect(x + i, y + i, 1, 7 - 2 * i, c);
        }
      }
    };

    /* --- palette effects: every frame the indexed buffer goes through this map --- */
    var pal = [0, 1, 2, 3], fadeLevel = 0, fadeTo = PAPER, flashT = 0, shakeT = 0, shakeA = 0, sx = 0, sy = 0;
    function present() {
      var map = pal.slice();
      if (fadeLevel) for (var i = 0; i < 4; i++) map[i] = fadeTo === PAPER ? Math.min(3, i + fadeLevel) : Math.max(0, i - fadeLevel);
      if (flashT > 0) map = map.map(function (v) { return 3 - v; });
      var d = image.data, n = W * H;
      if (shakeT > 0) { sx = Math.round((Math.random() * 2 - 1) * shakeA); sy = Math.round((Math.random() * 2 - 1) * shakeA); } else { sx = sy = 0; }
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var srcX = x - sx, srcY = y - sy, v = srcX < 0 || srcY < 0 || srcX >= W || srcY >= H ? PAPER : buf[srcY * W + srcX];
        var c = RGB[map[v]], o = (y * W + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      return n;
    }

    /* --- input: chin buttons through PAD, keyboard as a fallback, and the pointer --- */
    var held = {}, heldFor = {}, queued = {}, pressedNow = {}, releasedNow = {}, queuedUp = {};
    function down(b) { if (held[b]) return; held[b] = true; heldFor[b] = 0; queued[b] = true; }
    function up(b) { if (!held[b]) return; held[b] = false; queuedUp[b] = true; }
    if (HAS_PAD && PAD.on) { PAD.on("press", down); PAD.on("release", up); }
    else {
      addEventListener("keydown", function (e) { var b = KEYS[e.key]; if (b) { e.preventDefault(); if (!e.repeat) down(b); } });
      addEventListener("keyup", function (e) { var b = KEYS[e.key]; if (b) up(b); });
    }
    addEventListener("blur", function () { BUTTONS.forEach(up); });
    var pointer = { x: 0, y: 0, down: false, pressed: false, released: false }, pQueued = false, pQueuedUp = false;
    function toScreen(e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = Math.floor((e.clientX - r.left) * W / r.width); pointer.y = Math.floor((e.clientY - r.top) * H / r.height);
    }
    canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) {} toScreen(e); pointer.down = true; pQueued = true; });
    canvas.addEventListener("pointermove", function (e) { toScreen(e); });
    ["pointerup", "pointercancel"].forEach(function (t) { canvas.addEventListener(t, function (e) { toScreen(e); if (pointer.down) { pointer.down = false; pQueuedUp = true; } }); });
    function inputBegin() {
      pressedNow = queued; queued = {}; releasedNow = queuedUp; queuedUp = {};
      pointer.pressed = pQueued; pQueued = false; pointer.released = pQueuedUp; pQueuedUp = false;
    }
    function inputEnd() { BUTTONS.forEach(function (b) { if (held[b]) heldFor[b] += STEP; }); }

    /* --- timers and tweens (owned by the scene stack; cleared by game.go) --- */
    var timers = [], tweens = [];
    function runTimers() {
      for (var i = 0; i < timers.length; i++) {
        var t = timers[i]; t.left -= STEP;
        if (t.left <= 0 && !t.dead) { t.fn(); if (t.every) t.left += t.every; else t.dead = true; }
      }
      timers = timers.filter(function (t) { return !t.dead; });
      for (i = 0; i < tweens.length; i++) {
        var w = tweens[i]; w.t = Math.min(1, w.t + STEP / w.dur);
        var k = w.ease(w.t);
        for (var p in w.to) w.obj[p] = lerp(w.from[p], w.to[p], k);
        if (w.t >= 1) { w.dead = true; w.done(); }
      }
      tweens = tweens.filter(function (w) { return !w.dead; });
    }

    /* --- scenes: a stack; only the top one updates, all of them draw --- */
    var scenes = {}, stack = [], busy = false;
    function sceneOf(s) { if (typeof s === "string") { if (!scenes[s]) throw new Error("no scene named " + s); return scenes[s]; } return s; }
    function enter(s, args) { var e = { scene: s, args: args, resolve: null }; stack.push(e); if (s.enter) s.enter(args); return e; }

    var game = {
      VERSION: VERSION, width: W, height: H, g: g, time: 0, frame: 0, scale: 1, pointer: pointer, lang: LANG,
      t: function (text, vars) { return pick(text, LANG, vars); },
      INK: INK, DARK: DARK, MID: MID, PAPER: PAPER,

      scene: function (name, def) { scenes[name] = def; return def; },
      start: function (name, args) { stack = []; enter(sceneOf(name), args); loop(); },
      go: function (name, args, o) {
        o = o || {};
        var next = sceneOf(name);
        var swap = function () {
          while (stack.length) { var e = stack.pop(); if (e.scene.exit) e.scene.exit(); if (e.resolve) e.resolve(null); }
          timers = []; tweens = [];
          enter(next, args);
        };
        if (o.fade === false) { swap(); return Promise.resolve(); }
        busy = true;
        return game.fade("out", o.time || 0.25, o.to).then(function () { swap(); return game.fade("in", o.time || 0.25, o.to); }).then(function () { busy = false; });
      },
      /* overlays: game.push(scene) resolves with the value given to game.pop(value) */
      push: function (s, args) { return new Promise(function (res) { enter(sceneOf(s), args).resolve = res; }); },
      pop: function (value) {
        var e = stack.pop(); if (!e) return;
        if (e.scene.exit) e.scene.exit();
        if (e.resolve) e.resolve(value);
      },
      top: function () { var e = stack[stack.length - 1]; return e && e.scene; },

      btn: function (b) { return !!held[b]; },
      pressed: function (b) { return !!pressedNow[b]; },
      released: function (b) { return !!releasedNow[b]; },
      /* true when first pressed, then again every `rate` seconds after `delay` (menus, cursors) */
      repeat: function (b, delay, rate) {
        if (pressedNow[b]) return true;
        if (!held[b]) return false;
        delay = delay == null ? 0.32 : delay; rate = rate == null ? 0.09 : rate;
        var t = heldFor[b] - delay; return t >= 0 && Math.floor(t / rate) !== Math.floor((t - STEP) / rate);
      },
      /* A, START or a tap: "carry on" */
      ok: function () { return !!(pressedNow.a || pressedNow.start || pointer.pressed); },
      /* the D-pad as a direction: {x, y}, one step per press with repeat */
      dir: function (delay, rate) {
        return { x: (game.repeat("right", delay, rate) ? 1 : 0) - (game.repeat("left", delay, rate) ? 1 : 0),
                 y: (game.repeat("down", delay, rate) ? 1 : 0) - (game.repeat("up", delay, rate) ? 1 : 0) };
      },

      after: function (sec, fn) { var t = { left: sec, fn: fn }; timers.push(t); return function () { t.dead = true; }; },
      every: function (sec, fn) { var t = { left: sec, every: sec, fn: fn }; timers.push(t); return function () { t.dead = true; }; },
      wait: function (sec) { return new Promise(function (res) { game.after(sec, res); }); },
      tween: function (obj, to, sec, ease) {
        return new Promise(function (res) {
          var from = {}; for (var p in to) from[p] = obj[p];
          tweens.push({ obj: obj, from: from, to: to, dur: Math.max(STEP, sec), t: 0, ease: EASE[ease || "out"] || EASE.out, done: res });
        });
      },

      /* screen effects */
      fade: function (dir, sec, to) {
        fadeTo = to == null ? PAPER : to;
        var steps = 3, each = (sec == null ? 0.25 : sec) / steps, i = 0;
        return new Promise(function (res) {
          var tick = function () {
            i++; fadeLevel = dir === "out" ? i : steps - i;
            if (i >= steps) { if (dir !== "out") fadeLevel = 0; res(); } else game.after(each, tick);
          };
          if (dir !== "out") fadeLevel = steps;
          game.after(each, tick);
        });
      },
      flash: function (sec) { flashT = sec == null ? 0.08 : sec; },
      shake: function (amount, sec) { shakeA = amount == null ? 2 : amount; shakeT = sec == null ? 0.25 : sec; },

      sfx: function (name) { if (HAS_PAD && PAD.sfx) PAD.sfx(name); },
      save: function (key, value) { if (HAS_PAD) PAD.save(key, value); else memory[key] = JSON.parse(JSON.stringify(value)); },
      load: function (key) { return HAS_PAD ? PAD.load(key) : Promise.resolve(key in memory ? memory[key] : null); },
      remove: function (key) { if (HAS_PAD) PAD.remove(key); else delete memory[key]; },

      /* dialogue: resolves when the player has read every page */
      say: function (text, o) { return game.push(dialogScene(text, o || {})); },
      /* menu: resolves with the chosen index, or -1 when cancelled with B */
      choose: function (items, o) { return game.push(menuScene(items, o || {})); }
    };
    var memory = {};

    /* --- built-in overlay: dialogue box with a typewriter --- */
    function dialogScene(text, o) {
      var pages = [], boxH = o.lines ? o.lines * FONT.line + 10 : 3 * FONT.line + 10, innerW = W - 16;
      (Array.isArray(text) ? text : [text]).forEach(function (t) {
        var ls = wrap(t, innerW), per = Math.floor((boxH - 10) / FONT.line);
        for (var i = 0; i < ls.length; i += per) pages.push(ls.slice(i, i + per));
      });
      var page = 0, shown = 0, speed = o.speed || 40, blip = o.blip !== false, y = o.top ? 0 : H - boxH, sinceBlip = 0;
      function total() { return Array.from(pages[page].join("")).length; }
      return {
        update: function () {
          if (shown < total()) {
            var before = Math.floor(shown);
            shown = Math.min(total(), shown + speed * STEP);
            if (blip && Math.floor(shown) !== before && (sinceBlip++ % 3 === 0)) game.sfx("tick");
            if (game.ok() || game.pressed("b")) shown = total();
          } else if (game.ok() || game.pressed("b")) {
            if (page < pages.length - 1) { page++; shown = 0; game.sfx("move"); }
            else { game.sfx("move"); game.pop(true); }
          }
        },
        draw: function (gg) {
          gg.origin(0, 0); gg.clip();
          var top = y;
          if (o.name) {
            var nw = measure(o.name) + 10, ny = o.top ? boxH - 1 : top - FONT.line - 3;
            gg.window(4, ny, nw, FONT.line + 4, { thin: true });
            gg.text(o.name, 9, ny + 2);
          }
          gg.window(0, top, W, boxH);
          var left = Math.floor(shown), ty = top + 5;
          pages[page].forEach(function (ln) {
            var part = Array.from(ln).slice(0, Math.max(0, left)).join("");
            left -= Array.from(ln).length;
            gg.text(part, 8, ty); ty += FONT.line;
          });
          if (shown >= total() && Math.floor(game.time * 3) % 2 === 0) gg.arrow(W - 13, top + boxH - 7, "down");
        }
      };
    }

    /* --- built-in overlay: a vertical menu --- */
    function menuScene(items, o) {
      var sel = clamp(o.index || 0, 0, items.length - 1), pad = 6, rowH = FONT.line + 2;
      var w = o.width || Math.max.apply(null, items.map(measure).concat([o.title ? measure(o.title) : 0])) + pad * 2 + 10;
      var h = items.length * rowH + pad * 2 - 2 + (o.title ? rowH : 0);
      var x = o.x == null ? Math.round((W - w) / 2) : o.x, y = o.y == null ? Math.round((H - h) / 2) : o.y;
      var cancel = o.cancel !== false;
      return {
        update: function () {
          var d = game.dir();
          if (d.y) { sel = (sel + d.y + items.length) % items.length; game.sfx("move"); }
          if (game.pressed("a") || game.pressed("start")) { game.sfx("tap"); game.pop(sel); return; }
          if (cancel && game.pressed("b")) { game.sfx("miss"); game.pop(-1); return; }
          if (pointer.pressed) {
            var r = Math.floor((pointer.y - y - pad - (o.title ? rowH : 0)) / rowH);
            if (pointer.x >= x && pointer.x < x + w && r >= 0 && r < items.length) { sel = r; game.sfx("tap"); game.pop(sel); }
            else if (cancel) { game.sfx("miss"); game.pop(-1); }
          }
        },
        draw: function (gg) {
          gg.origin(0, 0); gg.clip();
          gg.window(x, y, w, h);
          var ty = y + pad;
          if (o.title) { gg.text(o.title, x + pad, ty, { color: DARK }); ty += rowH; }
          items.forEach(function (it, i) {
            if (i === sel) gg.arrow(x + pad - 1, ty + 3, "right");
            gg.text(it, x + pad + 8, ty);
            ty += rowH;
          });
        }
      };
    }

    /* --- the loop: fixed 60 steps a second, one draw per screen refresh --- */
    var last = 0, acc = 0, running = false;
    function tick() {
      inputBegin();
      runTimers();
      var top = stack[stack.length - 1];
      if (top && top.scene.update && !busy) top.scene.update(STEP);
      if (flashT > 0) flashT -= STEP;
      if (shakeT > 0) shakeT -= STEP;
      game.time += STEP; game.frame++;
      inputEnd();
    }
    function render() {
      g.origin(0, 0); g.clip();
      for (var i = 0; i < stack.length; i++) { var s = stack[i].scene; g.origin(0, 0); g.clip(); if (s.draw) s.draw(g); }
      present();
    }
    function frame(ts) {
      requestAnimationFrame(frame);
      if (!last) last = ts;
      acc += Math.min(0.1, (ts - last) / 1000); last = ts;
      var n = 0;
      while (acc >= STEP && n < 6) { tick(); acc -= STEP; n++; }
      if (n) render();
    }
    function loop() {
      if (running) return; running = true;
      fit(); addEventListener("resize", fit);
      document.addEventListener("visibilitychange", function () { last = 0; });
      requestAnimationFrame(frame);
    }
    g.clear();
    return game;
  }

  return {
    VERSION: VERSION, TONES: TONES.slice(), font: font, INK: INK, DARK: DARK, MID: MID, PAPER: PAPER, BUTTONS: BUTTONS.slice(),
    create: create, sprite: sprite, sprites: sprites, tilemap: tilemap, camera: camera, rng: rng,
    clamp: clamp, lerp: lerp, approach: approach, t: t
  };
})();
