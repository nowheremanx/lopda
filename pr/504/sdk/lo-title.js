/* lo-title.js 0.1.0: one title screen for every Lo-PDA app. MIT. See sdk/LO-TITLE.md.
 *
 * A title screen is the app's cover picture (its name drawn into it) above a menu that turns like a wheel: the chosen
 * item sits big in an ink band, the items before and after it show small above and below, and a move rolls the
 * wheel. One layout for all apps, so the store's covers and the apps' first screens look like one family.
 *
 * Everything is drawn into one canvas with putImageData, in the four tones, with the lopix12 pixel font (the
 * data-lo-font block that tools/bundle-app.mjs writes after this one calls LoTitle.font). Nothing here touches PAD:
 * the app passes its button presses in with press(), so it keeps one PAD.on("press") of its own.
 *
 *   var menu = LoTitle.mount(canvas, {
 *     art: { w: 156, h: 156, px: tones },   // tone indices, 0 paper, 1 mid, 2 dark, 3 ink (row by row)
 *     items: [{ label: "开始", sub: "第 1 关" }, { label: "随机关", sub: "通关 30 关后开放", locked: true }],
 *     index: 0,                              // the item in the band at first
 *     note: "最好 第 3 关",                   // optional line under the wheel (a record, a warning)
 *     hint: "↑↓ 选 · A 确定",                // the key line at the bottom
 *     onMove: function (i) {},               // the band reached item i (play a sound here)
 *     onPick: function (i) {}                // A, START or a tap on the band (also for a locked item: say why)
 *   });
 *   PAD.on("press", function (b) { if (onTitle) menu.press(b); });   // up / down roll, a / start pick
 *   menu.set({ items: [...], index: 1 })     // new items or text (a save was read); keeps the wheel where it is
 *
 * The canvas is sized by the app's CSS (give it the whole screen, or the area under a top bar); this file
 * reads its size on mount and on every resize, and forgets it once the canvas leaves the page.
 * Touch: a tap on the band picks, a tap on a small item rolls the wheel to it, a finger dragged up or down turns it.
 */
var LoTitle = (function () {
  "use strict";
  var VERSION = "0.1.0";
  var TONES = [[0xa3, 0xad, 0x7e], [0x7d, 0x8a, 0x58], [0x4a, 0x5a, 0x32], [0x1f, 0x2a, 0x14]];
  var PAPER = 0, DARK = 2, INK = 3;
  var ROLL_MS = 130;           /* one step of the wheel */
  var FONT = null, GLYPHS = {};

  function font(data) { FONT = data; GLYPHS = {}; }

  /* a glyph of lopix12: "advance:base64 bits", one bit per pixel, row by row, cell rows high */
  function glyph(ch) {
    var g = GLYPHS[ch];
    if (g) return g;
    var src = FONT && (FONT.glyphs[ch] || FONT.glyphs["?"]);
    if (!src) return (GLYPHS[ch] = { w: 6, bits: null });
    var cut = src.indexOf(":"), w = +src.slice(0, cut), raw = atob(src.slice(cut + 1)), n = w * FONT.cell, bits = new Uint8Array(n);
    for (var i = 0; i < n; i++) bits[i] = (raw.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    return (GLYPHS[ch] = { w: w, bits: bits });
  }
  function measure(s, k) { var w = 0; Array.from(String(s)).forEach(function (c) { w += glyph(c).w; }); return w * k; }

  function mount(canvas, opts) {
    var o = {}, pos = 0, target = 0, anim = null, buf = null, img = null, W = 0, H = 0, L = null, drag = null;
    set(opts);
    pos = target = clampIndex(o.index || 0);

    function clampIndex(i) { return Math.max(0, Math.min((o.items || []).length - 1, i | 0)); }
    function set(p) {
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
      if (p && p.index !== undefined && L) { pos = target = clampIndex(p.index); }
      if (L) draw();
    }

    /* the layout, in device pixels: u is one LCD pixel (a whole number of device pixels, so lines stay sharp) */
    function layout() {
      var r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      W = Math.max(1, Math.round(r.width * d)); H = Math.max(1, Math.round(r.height * d));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      var u = Math.max(1, Math.round(d)), cell = FONT ? FONT.cell : 13;
      var RB = 46 * u, RS = 20 * u, GAP = 6 * u, HINT = (cell + 4) * u, NOTE = o.note ? (cell + 3) * u : 0;
      var art = o.art, aw = art ? art.w : 0, ah = art ? art.h : 0;
      var n = (o.items || []).length, near = 1;
      var room = H - (RS * 2 + RB) - HINT - NOTE - GAP * 4;
      /* the picture as big as fits, in whole device pixels per art pixel; on a very small screen it shrinks */
      var fit = art ? Math.min((W - 16 * u) / aw, room / ah) : 0, k = fit >= 1 ? Math.floor(fit) : fit;
      var side = Math.round(aw * k), sideH = Math.round(ah * k);
      /* a tall screen with more than three items shows two each way; then the picture, the wheel and the note
         stand together in the middle of what is left above the note and the key line */
      if (n > 3 && room - sideH >= RS * 2) near = 2;
      var wheel = RB + RS * 2 * near, block = sideH + (art ? GAP * 2 : 0) + wheel;
      var ay = Math.max(GAP, Math.round((H - HINT - block) / 2)), ax = Math.round((W - side) / 2);
      var cy = ay + sideH + (art ? GAP * 2 : 0) + RS * near + RB / 2;
      /* the band is as wide as the screen allows, so a long sub line still fits */
      var bx0 = 8 * u, bx1 = W - 8 * u;
      L = { u: u, RB: RB, RS: RS, k: k, ax: ax, ay: ay, aw: side, ah: sideH, cy: cy, near: near,
        b0: cy - RB / 2, b1: cy + RB / 2, bx0: bx0, bx1: bx1,
        w0: cy - RB / 2 - RS * near, w1: cy + RB / 2 + RS * near, noteY: H - HINT - NOTE + 2 * u, hintY: H - HINT + 2 * u };
      buf = new Uint8Array(W * H);
      img = canvas.getContext("2d").createImageData(W, H);
    }

    function fill(x0, y0, x1, y1, t) {
      x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(W, Math.round(x1)); y1 = Math.min(H, Math.round(y1));
      for (var y = y0; y < y1; y++) buf.fill(t, y * W + x0, y * W + x1);
    }
    /* text at scale k (k device pixels per font pixel); tone(y) picks the colour per row, null clips the row */
    function text(s, x, y, k, tone) {
      var cell = FONT ? FONT.cell : 13;
      Array.from(String(s)).forEach(function (c) {
        var g = glyph(c);
        if (g.bits) for (var gy = 0; gy < cell; gy++) {
          var y0 = Math.round(y + gy * k), y1 = Math.round(y + (gy + 1) * k);
          for (var gx = 0; gx < g.w; gx++) if (g.bits[gy * g.w + gx]) {
            var x0 = Math.round(x + gx * k), x1 = Math.round(x + (gx + 1) * k);
            for (var yy = y0; yy < y1; yy++) {
              var t = tone(yy);
              if (t === null || yy < 0 || yy >= H) continue;
              for (var xx = Math.max(0, x0); xx < Math.min(W, x1); xx++) buf[yy * W + xx] = t;
            }
          }
        }
        x += g.w * k;
      });
    }
    /* centred on the screen; a line wider than the band loses its end to an ellipsis */
    function centred(s, y, k, tone) {
      var max = L.bx1 - L.bx0 - 16 * L.u, chars = Array.from(String(s));
      if (measure(s, k) > max) { while (chars.length && measure(chars.join("") + "...", k) > max) chars.pop(); s = chars.join("") + "..."; }
      var x = Math.round((W - measure(s, k)) / 2);
      text(s, x, y, k, tone);
      return x;
    }
    /* a padlock, 7 x 9 LCD pixels, paper on the band */
    var LOCK = ["..###..", ".#...#.", ".#...#.", "#######", "#######", "###.###", "###.###", "#######", "......."];
    function lock(x, y, u) {
      for (var r = 0; r < LOCK.length; r++) for (var c = 0; c < 7; c++)
        if (LOCK[r][c] === "#") fill(x + c * u, y + r * u, x + (c + 1) * u, y + (r + 1) * u, PAPER);
    }

    /* where an item stands when it is d steps from the band (d may be a fraction while the wheel turns) */
    function yAt(d) {
      var a = Math.abs(d), s = d < 0 ? -1 : 1, step1 = L.RB / 2 + L.RS / 2;
      return L.cy + s * (a <= 1 ? a * step1 : step1 + (a - 1) * L.RS);
    }

    function draw() {
      if (!L) return;
      var u = L.u, cell = FONT ? FONT.cell : 13, items = o.items || [], art = o.art, i;
      buf.fill(PAPER);
      if (art && L.aw > 0) {
        for (var y = 0; y < L.ah; y++) {
          var sy = Math.min(art.h - 1, Math.floor(y / L.k)), row = (L.ay + y) * W + L.ax;
          for (var x = 0; x < L.aw; x++) buf[row + x] = art.px[sy * art.w + Math.min(art.w - 1, Math.floor(x / L.k))];
        }
      }
      fill(L.bx0, L.b0, L.bx1, L.b1, INK);
      for (i = 0; i < items.length; i++) {
        var d = i - pos;
        if (Math.abs(d) > L.near + 0.99) continue;
        var t = Math.min(1, Math.abs(d)), k = u * (2 - t), it = items[i];
        var withSub = it.sub && Math.abs(d) < 0.25;
        var ty = yAt(d) - cell * k / 2 - (withSub ? 6 * u : 0);
        /* inside the band: paper; outside: dark; past the wheel's ends: clipped (UI.md 11.3: small text is ink on
           paper or paper on ink, never mid) */
        var lx = centred(it.label, ty, k, function (yy) { return yy >= L.b0 && yy < L.b1 ? PAPER : yy < L.w0 || yy >= L.w1 ? null : DARK; });
        /* a locked item carries a padlock in front of its name while it is in the band; its sub line says why */
        if (it.locked && Math.abs(d) < 0.5) lock(lx - 14 * u, ty + (cell * k - 9 * u) / 2, u);
        if (withSub) centred(it.sub, ty + cell * k + u, u, function (yy) { return yy >= L.b0 && yy < L.b1 ? PAPER : null; });
      }
      /* small marks in the band's right end: more items above / below */
      var p = Math.round(target), mx = L.bx1 - 10 * u;
      for (var j = 0; j < 4; j++) {
        if (p > 0) fill(mx - j * u, L.b0 + (4 + j) * u, mx + (j + 1) * u, L.b0 + (5 + j) * u, PAPER);
        if (p < items.length - 1) fill(mx - j * u, L.b1 - (5 + j) * u, mx + (j + 1) * u, L.b1 - (4 + j) * u, PAPER);
      }
      var all = function () { return DARK; };
      if (o.note) centred(o.note, L.noteY, u, all);
      if (o.hint) centred(o.hint, L.hintY, u, all);
      var px = img.data;
      for (var n = 0, m = W * H; n < m; n++) { var c = TONES[buf[n]], q = n * 4; px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = 255; }
      canvas.getContext("2d").putImageData(img, 0, 0);
    }

    /* roll to item i over ROLL_MS per step, easing out */
    function rollTo(i) {
      i = clampIndex(i);
      if (i === target && !anim) return false;
      var from = pos, t0 = null, steps = Math.max(1, Math.abs(i - from)), ms = Math.min(ROLL_MS * steps, ROLL_MS * 2.5);
      target = i;
      if (anim) cancelAnimationFrame(anim);
      function frame(now) {
        if (canvas.isConnected === false) { anim = null; return; }
        if (t0 === null) t0 = now;
        var f = Math.min(1, (now - t0) / ms), e = 1 - (1 - f) * (1 - f);
        pos = from + (target - from) * e;
        draw();
        anim = f < 1 ? requestAnimationFrame(frame) : null;
        if (!anim) pos = target;
      }
      anim = requestAnimationFrame(frame);
      if (o.onMove) o.onMove(i);
      return true;
    }

    function press(b) {
      var items = o.items || [];
      if (b === "up" || b === "down") {
        var next = target + (b === "down" ? 1 : -1);
        if (next >= 0 && next < items.length) rollTo(next);
        return true;
      }
      if (b === "a" || b === "start") { if (o.onPick && items.length) o.onPick(target); return true; }
      return false;
    }

    /* touch, in the canvas's own pixels */
    function devY(e) { var r = canvas.getBoundingClientRect(); return (e.clientY - r.top) * (H / r.height); }
    function onDown(e) { if (!L) return; drag = { y: devY(e), start: target, moved: false }; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} }
    function onMoveP(e) {
      if (!drag) return;
      var dy = devY(e) - drag.y;
      if (Math.abs(dy) > L.RS * 0.6) drag.moved = true;
      if (!drag.moved) return;
      var steps = Math.round(-dy / L.RS);
      if (clampIndex(drag.start + steps) !== target) rollTo(drag.start + steps);
    }
    function onUp(e) {
      if (!drag) return;
      var moved = drag.moved; drag = null;
      if (moved) return;
      var y = devY(e);
      if (y >= L.b0 && y < L.b1) { if (o.onPick && (o.items || []).length) o.onPick(target); return; }
      if (y < L.w0 || y >= L.w1) return;
      /* which small item is under the finger: the nearest one's resting place */
      var best = null, bd = Infinity;
      for (var i = 0; i < (o.items || []).length; i++) { var dd = Math.abs(yAt(i - target) - y); if (dd < bd) { bd = dd; best = i; } }
      if (best !== null && best !== target) rollTo(best);
    }
    function onResize() { if (canvas.isConnected === false) { removeEventListener("resize", onResize); return; } layout(); draw(); }

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMoveP);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", function () { drag = null; });
    addEventListener("resize", onResize);
    layout();
    draw();

    return {
      press: press,
      set: set,
      index: function () { return target; },
      redraw: function () { layout(); draw(); }
    };
  }

  return { VERSION: VERSION, font: font, mount: mount };
})();
if (typeof window !== "undefined") window.LoTitle = LoTitle;
