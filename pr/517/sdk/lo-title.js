/* lo-title.js 0.1.1: one title screen for every Lo-PDA app. MIT. See sdk/LO-TITLE.md.
 *
 * The fog title: the app's cover picture covers the whole canvas edge to edge, a dithered fog rises from the bottom
 * over its lower third, and the menu stands in the fog as bare words, no boxes. The chosen word is big, painted like
 * a sign: a paper-to-mid gradient, an ink outline and a drop shadow. The words before and after it are small and
 * dim. A move rolls the big word out and the next one in. Under it an ink bar holds one live line (the chosen item's
 * status, a locked item's reason, or the note) and the keys. The app's name may be painted into the sky the same way.
 *
 * Everything is drawn into one canvas with putImageData, in the four tones, with the lopix12 pixel font (the
 * data-lo-font block that tools/bundle-app.mjs writes after this one calls LoTitle.font). Nothing here touches PAD:
 * the app passes its button presses in with press(), so it keeps one PAD.on("press") of its own.
 *
 *   var menu = LoTitle.mount(canvas, {
 *     art: { w: 156, h: 156, px: tones },   // tone indices, 0 paper, 1 mid, 2 dark, 3 ink (row by row)
 *     title: { text: "矿工老张", sub: "钩金子", x: 17, y: 6, w: 86 },   // optional: the name, painted in the sky
 *     items: [{ label: "继续", status: "第 3 关" }, { label: "随机关", locked: true, reason: "通关 30 关后开放" }],
 *     index: 0,                              // the chosen item at first
 *     note: "最高 第 5 关",                   // the bar's line while the chosen item has no status
 *     hint: "选 · A 确定",                    // the keys, after the up / down arrows this file draws
 *     maxScale: 5,                           // optional: the chosen word at most 5 LCD pixels a font pixel
 *     onMove: function (i) {},               // item i is now the chosen one (play a sound here)
 *     onPick: function (i) {},               // A, START or a tap on the chosen word
 *     onLocked: function (i) {}              // the same on a locked item (play "err"); onPick is not called
 *   });
 *   PAD.on("press", function (b) { if (onTitle) menu.press(b); });   // up / down roll, a / start pick
 *   menu.set({ items: [...], index: 1 })     // new items or text (a save was read)
 *   menu.destroy()                           // when the screen goes: remove its listeners and stop its frames
 *
 * The canvas is sized by the app's CSS (give it the whole screen, or the area under a top bar); this file reads its
 * size on mount and on every resize, and forgets it once the canvas leaves the page. An app that mounts a title on
 * a screen it will leave calls destroy() so the resize listener, the pointer listeners and any queued frame go.
 * Touch: a tap on the chosen word picks, a tap on a small word rolls to it, a finger dragged up or down turns the menu.
 */
var LoTitle = (function () {
  "use strict";
  var VERSION = "0.1.1";
  var CODE = [[0xa3, 0xad, 0x7e], [0x7d, 0x8a, 0x58], [0x4a, 0x5a, 0x32], [0x1f, 0x2a, 0x14]];   /* paper, mid, dark, ink */
  var ROLL_MS = 130, SHAKE_MS = 320, FLASH_MS = 160, REASON_MS = 1500;

  /* ordered dither thresholds, 4 x 4 and 8 x 8 */
  var B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var B8 = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
  ];
  function dither(x, y, level) { return (B8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 < level; }
  /* value noise for the fog and the ground under the picture: a fixed table, so every start looks the same */
  var NOISE = (function () {
    var a = new Uint8Array(256 * 256), s = 1337;
    for (var i = 0; i < a.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; a[i] = (s >> 16) & 255; }
    return a;
  })();
  function vnoise(x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    function g(i, j) { return NOISE[((j & 255) << 8) | (i & 255)] / 255; }
    var a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    var t = a + (b - a) * u, w = c + (d - c) * u;
    return t + (w - t) * v;
  }

  /* ---------- the font: lopix12 glyphs as 1-bit masks, scaled up ---------- */
  var FONT = null, GC = {}, SG = {}, MC = {};
  function font(data) { FONT = data; GC = {}; SG = {}; MC = {}; }
  function cellH() { return FONT ? FONT.cell : 13; }
  function isCJK(ch) { return ch.charCodeAt(0) >= 0x2e80; }
  function hasCJK(s) { return Array.from(String(s)).some(isCJK); }

  /* a glyph of lopix12: "advance:base64 bits", one bit per pixel, row by row */
  function glyph(ch) {
    if (GC[ch]) return GC[ch];
    var h = cellH(), src = FONT && (FONT.glyphs[ch] || FONT.glyphs["?"]), adv, m, i, x, y;
    if (!src) { adv = 6; m = new Uint8Array(h * adv); }
    else {
      var cut = src.indexOf(":"), raw = atob(src.slice(cut + 1));
      adv = +src.slice(0, cut);
      m = new Uint8Array(h * adv);
      for (i = 0; i < h * adv; i++) m[i] = (raw.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
      if (ch === "·" && adv > 7) {
        /* the middle dot is a full-width CJK cell in lopix12; a latin cell sits better between two words */
        var nw = 7, nm = new Uint8Array(h * nw), off = Math.round((adv - nw) / 2);
        for (y = 0; y < h; y++) for (x = 0; x < nw; x++) nm[y * nw + x] = m[y * adv + x + off];
        adv = nw; m = nm;
      }
    }
    return (GC[ch] = { w: adv, h: h, m: m });
  }
  /* Scale2x: rounds the diagonals and corners of a 1-bit glyph */
  function scale2x(g) {
    var w = g.w, h = g.h, ow = w * 2, m = g.m, o = new Uint8Array(ow * h * 2);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var P = m[y * w + x];
      var A = y > 0 ? m[(y - 1) * w + x] : 0, B = x < w - 1 ? m[y * w + x + 1] : 0;
      var C = x > 0 ? m[y * w + x - 1] : 0, D = y < h - 1 ? m[(y + 1) * w + x] : 0;
      var e0 = P, e1 = P, e2 = P, e3 = P;
      if (C === A && C !== D && A !== B) e0 = A;
      if (A === B && A !== C && B !== D) e1 = B;
      if (D === C && D !== B && C !== A) e2 = C;
      if (B === D && B !== A && D !== C) e3 = D;
      o[(y * 2) * ow + x * 2] = e0; o[(y * 2) * ow + x * 2 + 1] = e1;
      o[(y * 2 + 1) * ow + x * 2] = e2; o[(y * 2 + 1) * ow + x * 2 + 1] = e3;
    }
    return { w: ow, h: h * 2, m: o };
  }
  function scalePlain(g, n) {
    var w = g.w * n, h = g.h * n, m = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) m[y * w + x] = g.m[Math.floor(y / n) * g.w + Math.floor(x / n)];
    return { w: w, h: h, m: m };
  }
  /* CJK strokes must stay straight, so they are only ever copied; Latin keeps round corners through Scale2x
     (once for an even factor, twice when four divides it) and a plain copy for what is left */
  function glyphAt(ch, scale) {
    var key = ch + "|" + scale;
    if (SG[key]) return SG[key];
    var g = glyph(ch);
    if (scale > 1) {
      if (isCJK(ch)) g = scalePlain(g, scale);
      else {
        var rest = scale;
        if (rest % 4 === 0) { g = scale2x(scale2x(g)); rest /= 4; }
        else if (rest % 2 === 0) { g = scale2x(g); rest /= 2; }
        if (rest > 1) g = scalePlain(g, rest);
      }
    }
    return (SG[key] = g);
  }
  /* a line of text as one mask, with its ink box (top, bot, left, right), so a word is placed by what the eye sees */
  function mask(str, scale, gap) {
    var key = str + "|" + scale + "|" + gap;
    if (MC[key]) return MC[key];
    var chars = Array.from(String(str)), parts = [], total = 0, i, x, y;
    for (i = 0; i < chars.length; i++) { var g = glyphAt(chars[i], scale); parts.push(g); total += g.w + gap; }
    var w = Math.max(1, total - gap), h = cellH() * scale, m = new Uint8Array(w * h), cx = 0;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      for (y = 0; y < h; y++) for (x = 0; x < p.w; x++) if (p.m[y * p.w + x] && cx + x < w) m[y * w + cx + x] = 1;
      cx += p.w + gap;
    }
    var top = h, bot = -1, left = w, right = -1;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (m[y * w + x]) {
      if (y < top) top = y;
      if (y > bot) bot = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
    if (bot < 0) { top = 0; bot = h - 1; left = 0; right = w - 1; }
    return (MC[key] = { w: w, h: h, m: m, top: top, bot: bot, left: left, right: right });
  }
  /* the widest letter gap (down to none) that keeps the line within maxW device pixels */
  function fitGap(str, scale, gap, maxW, unit) {
    while (gap > 0 && mask(str, scale, gap).w * unit > maxW) gap--;
    return gap;
  }
  /* the one-pixel outline: the mask grown by one pixel, less the mask */
  function ringOf(mk) {
    if (mk.ring) return mk.ring;
    var w = mk.w + 2, h = mk.h + 2, big = new Uint8Array(w * h), ring = new Uint8Array(w * h), x, y;
    for (y = 0; y < mk.h; y++) for (x = 0; x < mk.w; x++) if (mk.m[y * mk.w + x]) big[(y + 1) * w + x + 1] = 1;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (big[y * w + x]) continue;
      if ((x > 0 && big[y * w + x - 1]) || (x < w - 1 && big[y * w + x + 1]) ||
          (y > 0 && big[(y - 1) * w + x]) || (y < h - 1 && big[(y + 1) * w + x])) ring[y * w + x] = 1;
    }
    return (mk.ring = { w: w, h: h, m: ring });
  }

  /* pixel pictures: a padlock (its inside ink) and the up / down arrows of the key line */
  var LOCK = ["..###..", ".#...#.", ".#...#.", "#######", "#..#..#", "#.###.#", "#..#..#", "#.....#", "#######"];
  var ARROWS = ["..#.......#..", ".###......#..", "#####.....#..", "..#.......#..", "..#.....#####", "..#......###.", "..#.......#.."];

  function mount(canvas, opts) {
    var o = {}, ready = false, cw = 1, ch = 1, dpr = 1, K = 1, N = 2, F = 1, NF = 2, cropX = 0;
    var bg = null, frame = null, img = null, u32 = null, ctx2d = null;
    var aw = 0, ah = 0, calm = 0, S = 4, INK = 0, BIG = 0;
    var stripTop = 0, edge = 1, recY = 0, hintY = 0, inkPrev = 0, slotName = 0, inkNext = 0;
    var fogTop = 0, fogSpan = 1, paintTop = 0;
    var softTop = 0, softRamp = 1, clipBot = 0;   /* a word thins out above softTop and hides under the bar */
    var st = { pos: 0, from: 0, to: 0, t0: null, dur: ROLL_MS, dir: 1, moving: false, seen: 0,
      flashT0: 0, shakeT0: 0, reasonIdx: -1, reasonTimer: null, drag: null };
    var raf = null, fullNext = true, hits = [], dead = false;

    function items() { return o.items || []; }
    function clampIndex(i) { return Math.max(0, Math.min(items().length - 1, Math.round(i) || 0)); }
    function current() { return st.moving ? st.to : clampIndex(st.pos); }

    function set(p) {
      if (dead) return;
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
      if (p.index !== undefined) { st.pos = st.from = st.to = st.seen = clampIndex(p.index); st.moving = false; }
      else if (st.pos > items().length - 1) { st.pos = st.from = st.to = st.seen = clampIndex(st.pos); st.moving = false; }
      if (ready) { layout(); fullNext = true; kick(); }
    }

    /* ---------- plotting, in device pixels ---------- */
    function plotMask(buf, mk, x0, y0, unit, toneFn) {
      var m = mk.m, w = mk.w, h = mk.h;
      x0 = Math.round(x0); y0 = Math.round(y0);
      for (var y = 0; y < h; y++) {
        var py0 = y0 + y * unit;
        if (py0 + unit <= 0 || py0 >= ch || (clipBot && py0 >= clipBot)) continue;
        for (var x = 0; x < w; x++) {
          if (!m[y * w + x]) continue;
          var px0 = x0 + x * unit;
          if (px0 + unit <= 0 || px0 >= cw) continue;
          var t = toneFn(x, y);
          if (t < 0) continue;
          /* above softTop a word thins out through the dither, and is gone softRamp above it */
          if (softTop > 0 && py0 < softTop && dither(x, y, (softTop + unit - py0) / softRamp)) continue;
          var xa = Math.max(0, px0), xb = Math.min(cw, px0 + unit), ya = Math.max(0, py0), yb = Math.min(ch, py0 + unit);
          if (clipBot && yb > clipBot) yb = clipBot;
          for (var py = ya; py < yb; py++) buf.fill(t, py * cw + xa, py * cw + xb);
        }
      }
    }
    function flat(t) { return function () { return t; }; }
    function fade(lx, ly, alpha) { return alpha >= 1 || dither(lx, ly, alpha); }
    /* a small pixel picture: "#" in tone, "." in back (or left alone when back is undefined) */
    function picture(buf, rows, x, y, unit, tone, back, alpha) {
      for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) {
        var t = rows[j][i] === "#" ? tone : back;
        if (t === undefined) continue;
        for (var py = y + j * unit; py < y + (j + 1) * unit; py++) for (var px = x + i * unit; px < x + (i + 1) * unit; px++) {
          if (px < 0 || py < 0 || px >= cw || py >= ch || (clipBot && py >= clipBot)) continue;
          if (alpha < 1 && !dither(px, py, alpha)) continue;
          buf[py * cw + px] = t;
        }
      }
    }
    /* the painted look: a drop shadow, an ink outline, then a fill that turns from the top tone to the lower one
       at seamAt of the letters' height, through three rows of 4 x 4 dither (locked: a tone darker) */
    function sign(buf, mk, x, y, unit, alpha, seamAt, locked) {
      if (alpha > 0.02) {
        plotMask(buf, mk, x + 2 * unit, y + 2 * unit, unit, function (lx, ly) { return fade(lx, ly, alpha) ? 3 : -1; });
        plotMask(buf, ringOf(mk), x - unit, y - unit, unit, flat(3));
      }
      var g0 = mk.top + Math.round((mk.bot - mk.top + 1) * seamAt), g1 = g0 + 3;
      var c1 = locked ? 1 : 0, c2 = locked ? 2 : 1;
      plotMask(buf, mk, x, y, unit, function (lx, ly) {
        if (!fade(lx, ly, alpha)) return -1;
        if (ly < g0) return c1;
        if (ly >= g1) return c2;
        return (B4[(ly & 3) * 4 + (lx & 3)] + 0.5) / 16 < (ly - g0 + 1) / (g1 - g0) ? c2 : c1;
      });
    }

    /* ---------- the layout ----------
       K device pixels per picture pixel, a whole number so the picture never wobbles: as wide as the screen or a
       little wider (cropped evenly at the sides), and as tall as it comes; under it the ground goes on. N is one font
       pixel of the small words (two LCD pixels), F of the big word (one LCD pixel), NF of the bar. */
    function chosenMask(label, sc) { return mask(label, sc, fitGap(label, sc, hasCJK(label) ? 8 : 4, cw - 12 * F, F)); }
    function menuHeight(sc) { return 2 * INK + Math.round(11.5 * sc) * F + 8 * N; }
    /* the menu stands in the middle between the calm row and the bar when it fits there, else it hangs off the bar */
    function menuStart(sc) {
      var mh = menuHeight(sc), start = stripTop - mh, floor = calm * K;
      if (aw && floor + mh <= stripTop) start = Math.round(floor + (stripTop - floor - mh) / 2);
      return Math.max(0, start);
    }
    function fits(sc) {
      var its = items();
      for (var i = 0; i < its.length; i++) if (chosenMask(its[i].label, sc).w * F > cw - 12 * F) return false;
      return true;
    }
    function layout() {
      var r = canvas.getBoundingClientRect(), art = o.art;
      dpr = window.devicePixelRatio || 1;
      cw = Math.max(8, Math.round(r.width * dpr)); ch = Math.max(8, Math.round(r.height * dpr));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      aw = art ? art.w : 0; ah = art ? art.h : 0;
      calm = o.calm !== undefined ? o.calm : Math.round(ah * 2 / 3);
      K = aw ? Math.max(1, Math.ceil(cw / aw)) : 1;
      N = Math.max(2, Math.round(2 * dpr)); F = Math.max(1, Math.round(N / 2)); NF = Math.max(2, N - 1);
      cropX = Math.max(0, Math.round((aw * K - cw) / 2));
      var cell = cellH(), inkF = (cell - 1) * NF;
      INK = (cell - 1) * N;
      edge = Math.min(K, Math.max(2, Math.round(3 * dpr)));
      stripTop = ch - (edge + 2 * inkF + 4 * NF);
      recY = stripTop + edge + NF;
      hintY = recY + inkF + Math.round(1.6 * NF);
      /* the biggest chosen word that fits the width and keeps the menu off the picture's upper 40 percent;
         maxScale caps it, in LCD (CSS) pixels a font pixel */
      var cap = o.maxScale > 0 ? Math.max(2, Math.floor(o.maxScale * dpr / F)) : 6, clear = Math.round(ah * 0.4) * K;
      S = 2;
      for (var sc = cap; sc > 2; sc--) if (fits(sc) && menuStart(sc) >= clear) { S = sc; break; }
      BIG = Math.round(11.5 * S) * F;
      inkPrev = menuStart(S);
      slotName = inkPrev + INK + 4 * N;
      inkNext = slotName + BIG + 4 * N;
      /* the fog rises a little above the calm part of the picture and is thick before the menu */
      fogTop = Math.max(0, Math.min(inkPrev - 12 * K, Math.round(calm * 0.84) * K));
      fogSpan = Math.max(1, inkPrev - fogTop);
      /* what a frame repaints: from where a rolling word can still show (it is gone softRamp above softTop) down */
      paintTop = Math.max(0, inkPrev - 13 * N);
      bg = new Uint8Array(cw * ch);
      frame = new Uint8Array(cw * ch);
      ctx2d = canvas.getContext("2d");
      img = ctx2d.createImageData(cw, ch);
      u32 = new Uint32Array(img.data.buffer);
      scene();
    }

    /* ---------- the still part: picture, ground, fog, dust, name, bar ---------- */
    function ground(x, y) {
      var d = y - ah, n = vnoise(x * 0.09 + 7, y * 0.11 + 31), t = 3;
      if (d < 2) t = 2;
      else if (d < 34 && n > 0.74) t = 1;
      else if (n > 0.64) t = 2;
      if ((y + Math.round(vnoise(x * 0.05, 3.5) * 7)) % 15 === 0 && d < 40) t = 2;
      return t;
    }
    function fogAt(ax, ay, yd) {
      var t = (yd - fogTop) / fogSpan;
      if (t <= 0) return 0;
      if (t > 1) t = 1;
      var f = Math.pow(t, 0.85) * 0.96;
      f += (vnoise(ax * 0.026, ay * 0.045 + 40) - 0.5) * 0.70;
      f += (vnoise(ax * 0.22 + 90, ay * 0.030 + 12) - 0.5) * 0.30;
      var g = (yd - (inkPrev - 5 * N)) / (5 * N);
      if (g > 0 && f < g) f = g;
      if (t >= 1) {
        /* behind the menu the fog is nearly ink and calm, so the words read */
        var deep = 0.88 + (vnoise(ax * 0.03 + 5, ay * 0.05 + 71) - 0.5) * 0.12;
        var still = Math.max(0, Math.min(1, (yd - (inkPrev - 13 * N)) / (9 * N)));
        return deep + (1 - deep) * still;
      }
      return f < 0 ? 0 : f > 0.96 ? 0.96 : f;
    }
    function scene() {
      var x, y, rows = Math.ceil(ch / K) + 1, art = o.art;
      softTop = 0; clipBot = 0;
      if (aw) {
        var pic = new Uint8Array(aw * rows), hs = 2463534242;
        for (y = 0; y < rows; y++) for (x = 0; x < aw; x++) {
          var t = y < ah ? art.px[y * aw + x] & 3 : ground(x, y);
          hs ^= hs << 13; hs ^= hs >>> 17; hs ^= hs << 5;
          var f = fogAt(x, y, y * K + K * 0.5);
          if (f > 0) {
            /* fog darkens a pixel by up to three tones; the fraction goes through the 8 x 8 dither, a little jittered */
            var lv = f * 3, k = Math.floor(lv), fr = lv - k, jit = ((hs >>> 8) & 15) - 7;
            if (fr > 0.002 && (B8[(y & 7) * 8 + (x & 7)] + 0.5 + jit) / 64 < fr) k++;
            t = Math.min(3, t + k);
          }
          pic[y * aw + x] = t;
        }
        /* dust caught in the light: a few mid specks in the fog */
        var seed = 20261;
        for (var i = 0; i < 30; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          var dx = 6 + (seed >> 16) % Math.max(1, aw - 12);
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          var dy = Math.floor(fogTop / K) + 4 + (seed >> 16) % Math.max(6, Math.floor((inkPrev - fogTop) / K));
          if (dy >= 0 && dy < rows && pic[dy * aw + dx] > 1) pic[dy * aw + dx] = 1;
        }
        for (y = 0; y < rows && y * K < ch; y++) {
          var y1 = Math.min(ch, y * K + K);
          for (x = 0; x < aw; x++) {
            var x0 = Math.max(0, x * K - cropX), x1 = Math.min(cw, x * K - cropX + K);
            if (x1 <= x0) continue;
            for (var py = y * K; py < y1; py++) bg.fill(pic[y * aw + x], py * cw + x0, py * cw + x1);
          }
        }
        if (o.title && o.title.text) name(o.title);
      } else bg.fill(3);
      bar();
    }
    /* the name in the sky, painted like the chosen word: four LCD pixels a font pixel, fewer when it is wider than
       w; x / y / w in picture pixels (x left out: centred); sub is a second line under it at half that size */
    function name(tt) {
      var w = (tt.w || aw - 16) * K, top = (tt.y !== undefined ? tt.y : 6) * K;
      function line(str, sc, gap0, y) {
        var unit = F;
        while (sc > 1 && mask(str, sc, 0).w * unit > w) sc--;
        var mk = mask(str, sc, fitGap(str, sc, gap0, w, unit)), inkW = (mk.right - mk.left + 1) * unit;
        var x = tt.x !== undefined ? tt.x * K - cropX : Math.round((cw - inkW) / 2);
        sign(bg, mk, x - mk.left * unit, y - mk.top * unit, unit, 1, 0.86, false);
        return y + (mk.bot - mk.top + 1) * unit;
      }
      var bottom = line(tt.text, 4, hasCJK(tt.text) ? 6 : 2, top);
      if (tt.sub) line(tt.sub, 2, hasCJK(tt.sub) ? 4 : 3, bottom + 8 * F);
    }
    /* the bar: ink, its top edge dark with a few mid points, and the keys on its lower line */
    function bar() {
      bg.fill(3, stripTop * cw, ch * cw);
      bg.fill(2, stripTop * cw, (stripTop + edge) * cw);
      for (var x = 0; x < cw; x++) if (dither(x, (stripTop / K) | 0, 0.3)) bg[stripTop * cw + x] = 1;
      if (o.hint) {
        var hint = mask(o.hint, 1, fitGap(o.hint, 1, hasCJK(o.hint) ? 2 : 1, cw - 40 * NF, NF));
        var hx = Math.round((cw - (16 + hint.w) * NF) / 2);
        picture(bg, ARROWS, hx, hintY + Math.round(2.5 * NF), NF, 1, undefined, 1);
        plotMask(bg, hint, hx + 16 * NF, hintY - hint.top * NF, NF, flat(1));
      }
    }

    /* ---------- the moving part: the menu and the bar's live line ---------- */
    function label(buf, idx, inkTop, alpha) {
      var it = items()[idx], mk = mask(it.label, 1, fitGap(it.label, 1, hasCJK(it.label) ? 2 : 1, cw - 10 * N, N));
      var x = Math.round((cw - mk.w * N) / 2) - mk.left * N, y = inkTop - mk.top * N;
      plotMask(buf, mk, x + N, y + N, N, function (lx, ly) { return fade(lx, ly, alpha) ? 3 : -1; });
      plotMask(buf, mk, x, y, N, function (lx, ly) { return fade(lx, ly, alpha) ? 1 : -1; });
      if (it.locked) picture(buf, LOCK, x + (mk.right + 2) * N, inkTop - N, N, 1, 3, alpha);
      hits.push({ i: idx, x0: x - 4 * N, y0: inkTop - 3 * N, x1: x + mk.w * N + 6 * N, y1: inkTop + INK + 3 * N });
    }
    function chosen(buf, idx, slotY, alpha, flash, xOff) {
      var it = items()[idx], mk = chosenMask(it.label, S), inkH = (mk.bot - mk.top + 1) * F;
      var x = Math.round((cw - (mk.right - mk.left + 1) * F) / 2) - mk.left * F + xOff;
      var y = slotY + Math.round((BIG - inkH) / 2) - mk.top * F;
      sign(buf, mk, x, y, F, alpha, it.locked ? 0.8 : 0.72, !!it.locked);
      if (flash && alpha > 0.5) {
        /* the pick: the letters flash to paper, with a bar of light under the word */
        plotMask(buf, mk, x, y, F, function (lx, ly) { return dither(lx, ly, 0.6) ? 0 : -1; });
        var by = slotY + BIG + 2 * F, x0 = x + mk.left * F - 3 * F, x1 = x0 + (mk.right - mk.left + 1) * F + 6 * F;
        for (var px = Math.max(0, x0); px < Math.min(cw, x1); px++) for (var q = 0; q < 2 * F; q++) {
          var gy = by + q;
          if (gy >= 0 && gy < ch && dither(px, gy, 0.55 - q * 0.2)) buf[gy * cw + px] = 0;
        }
      }
      if (it.locked) {
        var lu = Math.max(2, Math.round(inkH * 0.5 / 9));
        picture(buf, LOCK, x + (mk.right + 8) * F, slotY + Math.round((BIG - 9 * lu) / 2), lu, flash ? 0 : 1, 3, alpha);
      }
    }
    function menu(buf, t) {
      var n = items().length, shx = 0, flash = false;
      hits = [];
      if (!n) return;
      if (st.shakeT0) {
        var sp = (t - st.shakeT0) / SHAKE_MS;
        if (sp >= 1) st.shakeT0 = 0;
        else shx = Math.round(Math.sin(sp * Math.PI * 5) * 3 * F * (1 - sp));
      }
      if (st.flashT0) { if (t - st.flashT0 >= FLASH_MS) st.flashT0 = 0; else flash = true; }
      clipBot = stripTop;
      /* while it rolls toward a higher index ("up") the old word leaves upward and the new one comes from below */
      var pos = st.pos, k = Math.floor(pos), fr = pos - k, up = st.dir >= 0;
      var out = up ? k : k + 1, inc = up ? k + 1 : k, pr = up ? fr : 1 - fr;
      var aOut = pr <= 0.6 ? 1 : Math.max(0, 1 - (pr - 0.6) / 0.3);
      var aInc = pr <= 0.08 ? 0 : Math.min(1, (pr - 0.08) / 0.3);
      var off = cellH() * S * F + 2 * F;
      var yOut = up ? slotName - off * pr : slotName + off * pr;
      var yInc = up ? slotName + off * (1 - pr) : slotName - off * (1 - pr);
      var nearest = clampIndex(pos);
      /* the small words step aside while the big one rolls */
      var la = fr > 0 ? Math.max(0, 1 - 3 * pr) : 1;
      if (la > 0.02) {
        if (nearest > 0) label(buf, nearest - 1, inkPrev, la);
        if (nearest < n - 1) label(buf, nearest + 1, inkNext, la);
      }
      softTop = inkPrev - 6 * N; softRamp = 6 * N;
      if (st.moving || fr > 0) {
        if (aOut > 0.02 && out >= 0 && out < n) chosen(buf, out, yOut, aOut, false, 0);
        if (aInc > 0.02 && inc >= 0 && inc < n) chosen(buf, inc, yInc, aInc, false, 0);
      } else chosen(buf, nearest, slotName, 1, flash, shx);
      softTop = 0;
      clipBot = 0;
      hits.push({ i: nearest, x0: 0, y0: slotName - 2 * F, x1: cw, y1: slotName + BIG + 2 * F });
    }
    /* the bar's live line: a locked item's reason (paper, for a moment), the chosen item's status, or the note */
    function liveLine(buf) {
      var its = items(), it = its[clampIndex(st.pos)], text = o.note, tone = 1;
      if (st.reasonIdx >= 0 && its[st.reasonIdx] && its[st.reasonIdx].reason) { text = its[st.reasonIdx].reason; tone = 0; }
      else if (it && it.status) text = it.status;
      if (!text) return;
      text = String(text);
      var mk = mask(text, 1, fitGap(text, 1, hasCJK(text) ? 2 : 1, cw - 8 * NF, NF));
      plotMask(buf, mk, Math.round((cw - mk.w * NF) / 2) - mk.left * NF, recY - mk.top * NF, NF, flat(tone));
    }

    var COL32 = CODE.map(function (c) { return (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; });
    function render(t, full) {
      var y0 = full ? 0 : paintTop;
      frame.set(bg.subarray(y0 * cw), y0 * cw);
      menu(frame, t);
      liveLine(frame);
      for (var i = y0 * cw, n = cw * ch; i < n; i++) u32[i] = COL32[frame[i]];
      if (full) ctx2d.putImageData(img, 0, 0);
      else ctx2d.putImageData(img, 0, 0, 0, y0, cw, ch - y0);
    }

    /* ---------- time: frames run only while something moves ---------- */
    function kick() { if (!raf && !dead) raf = requestAnimationFrame(tick); }
    function tick(t) {
      raf = null;
      if (dead || canvas.isConnected === false) return;
      /* an animation starts on the frame after it was asked for, on the frames' own clock */
      t = t || 1e-3;
      if (st.moving && st.t0 === null) st.t0 = t;
      if (st.flashT0 === -1) st.flashT0 = t;
      if (st.shakeT0 === -1) st.shakeT0 = t;
      if (st.moving) {
        var p = (t - st.t0) / st.dur;
        if (p >= 1) { st.pos = st.to; st.moving = false; }
        else st.pos = st.from + (st.to - st.from) * (1 - Math.pow(1 - p, 3));
      }
      render(t, fullNext);
      fullNext = false;
      if (st.moving || st.shakeT0 || st.flashT0) kick();
    }

    function moved(i) { if (i !== st.seen) { st.seen = i; if (o.onMove) o.onMove(i); } }
    function rollTo(target) {
      if (!items().length) return false;
      target = clampIndex(target);
      var d = target - current();
      if (d === 0) return false;
      st.from = st.pos; st.to = target; st.dir = d > 0 ? 1 : -1;
      st.t0 = null; st.dur = ROLL_MS * Math.min(1.9, Math.abs(d)); st.moving = true;
      moved(target);
      kick();
      return true;
    }
    function pick(i) {
      var it = items()[i];
      if (!it) return;
      if (st.moving) { st.pos = st.to; st.moving = false; }
      if (it.locked) {
        /* a shake, and the reason on the bar for a moment */
        st.shakeT0 = -1;
        st.reasonIdx = i;
        if (st.reasonTimer) clearTimeout(st.reasonTimer);
        st.reasonTimer = setTimeout(function () { st.reasonIdx = -1; st.reasonTimer = null; kick(); }, REASON_MS);
        kick();
        if (o.onLocked) o.onLocked(i);
        return;
      }
      st.flashT0 = -1;
      kick();
      if (o.onPick) o.onPick(i);
    }
    function press(b) {
      if (dead) return false;
      if (b === "up" || b === "down") { rollTo(current() + (b === "down" ? 1 : -1)); return true; }
      if (b === "a" || b === "start") { pick(current()); return true; }
      return false;
    }

    /* ---------- touch, in the canvas's own pixels ---------- */
    function at(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (cw / r.width), y: (e.clientY - r.top) * (ch / r.height) };
    }
    function onDown(e) {
      if (!ready) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      var p = at(e);
      st.drag = { x: p.x, y: p.y, start: current(), moved: false };
    }
    function onMoveP(e) {
      var d = st.drag;
      if (!d) return;
      var dy = at(e).y - d.y;
      if (!d.moved && Math.abs(dy) > 6 * dpr) d.moved = true;
      if (!d.moved) return;
      st.moving = false;
      st.dir = dy < 0 ? 1 : -1;
      st.pos = Math.max(0, Math.min(items().length - 1, d.start - dy / (BIG * 1.1)));
      moved(clampIndex(st.pos));
      kick();
    }
    function onUp(e) {
      var d = st.drag;
      if (!d) return;
      st.drag = null;
      if (!d.moved) {
        var p = at(e);
        for (var i = 0; i < hits.length; i++) {
          var r = hits[i];
          if (p.x < r.x0 || p.x > r.x1 || p.y < r.y0 || p.y > r.y1) continue;
          if (r.i === current()) pick(r.i); else rollTo(r.i);
          return;
        }
        return;
      }
      /* let go: the menu settles on the nearest item */
      var target = clampIndex(st.pos);
      st.from = st.pos; st.to = target; st.dir = target >= st.pos ? 1 : -1;
      st.t0 = null; st.dur = ROLL_MS; st.moving = true;
      moved(target);
      kick();
    }
    function onResize() {
      if (dead) return;
      if (canvas.isConnected === false) { removeEventListener("resize", onResize); return; }
      layout(); fullNext = true; kick();
    }
    function onCancel() { st.drag = null; }
    /* the screen is going: the resize and pointer listeners and any queued frame go with it, and nothing that
       arrives late can draw into a canvas the app has dropped */
    function destroy() {
      if (dead) return;
      dead = true;
      removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMoveP);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      raf = null;
      if (st.reasonTimer) { clearTimeout(st.reasonTimer); st.reasonTimer = null; }
      st.drag = null;
    }

    set(opts || {});
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMoveP);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    addEventListener("resize", onResize);
    ready = true;
    layout();
    render(0, true);
    fullNext = false;

    return {
      press: press,
      set: set,
      index: current,
      redraw: function () { if (dead) return; layout(); fullNext = true; kick(); },
      destroy: destroy
    };
  }

  return { VERSION: VERSION, font: font, mount: mount };
})();
if (typeof window !== "undefined") window.LoTitle = LoTitle;
