/* wang-dachui / art.js — the alley, the school, the kitchen and the people in them.
 *
 * Everything is drawn with the four Lo-PDA tones: ink 0, dark 1, mid 2, paper 3.
 * The look is a woodcut picture book: big silhouettes, hard light, brick and paper
 * texture, rain as short diagonal strokes. Portraits are 48x58 busts; the son's
 * head is deliberately too big for his body.
 *
 * MIT License. Copyright (c) 2026 Haowei Wu.
 */

var ART = (function () {
  "use strict";

  var INK = 0, DARK = 1, MID = 2, PAPER = 3;

  /* ---------------- small helpers ---------------- */

  function bricks(g, x, y, w, h, base, mortar) {
    g.rect(x, y, w, h, base);
    for (var yy = 0; yy < h; yy += 6) {
      g.rect(x, y + yy, w, 1, mortar);
      var off = ((yy / 6) | 0) % 2 ? 5 : 0;
      for (var xx = off; xx < w; xx += 11) g.rect(x + xx, y + yy, 1, Math.min(6, h - yy), mortar);
    }
  }

  function bricksLit(g, x, y, w, h) {
    bricks(g, x, y, w, h, DARK, INK);
    for (var i = 0; i < 18; i++) {
      var bx = x + (i * 37 + 11) % w, by = y + (i * 23 + 7) % h;
      g.rect(bx, by, 3, 1, MID);
    }
  }

  function rain(g, t, n, tone, len) {
    tone = tone == null ? MID : tone;
    len = len || 4;
    for (var i = 0; i < n; i++) {
      var x = (i * 37 + Math.floor(t * 95) + (i % 3) * 11) % 172 - 6;
      var y = (i * 23 + Math.floor(t * 150) + (i % 5) * 7) % 150 - 4;
      g.line(x, y, x - 2, y + len, tone);
      if (i % 6 === 0) g.pixel(x - 1, y + len + 1, PAPER);
    }
  }

  function cone(g, cx, top, w, h, tone) {
    tone = tone == null ? PAPER : tone;
    for (var yy = 0; yy < h; yy += 2) {
      var half = Math.round(w / 2 + yy * 0.36);
      g.dither(cx - half, top + yy, half * 2, 2, tone, 1);
    }
  }

  function glow(g, cx, cy, r, tone) {
    for (var yy = -r; yy <= r; yy++) {
      var half = Math.round(Math.sqrt(Math.max(0, r * r - yy * yy)));
      g.dither(cx - half, cy + yy, half * 2, 1, tone == null ? PAPER : tone, 1);
    }
  }

  function smoke(g, x, y, t, n) {
    for (var i = 0; i < (n || 5); i++) {
      var yy = y - i * 4;
      var xx = x + Math.round(Math.sin(t * 1.7 + i * 0.9) * (2 + i));
      g.pixel(xx, yy, i % 2 ? MID : DARK);
      g.pixel(xx + 1, yy - 1, MID);
    }
  }

  function dust(g, t, n, x0, y0, w, h) {
    for (var i = 0; i < n; i++) {
      var x = x0 + (i * 47 + Math.floor(t * (6 + i % 3))) % w;
      var y = y0 + (i * 29 + Math.floor(t * 3)) % h;
      g.pixel(x, y, i % 4 ? MID : PAPER);
    }
  }

  function stars(g, t, n, maxY) {
    for (var i = 0; i < n; i++) {
      var x = (i * 53 + 7) % 160, y = 3 + (i * 19) % (maxY || 40);
      if (Math.floor(t * 1.5 + i) % 7) g.pixel(x, y, i % 3 ? MID : PAPER);
    }
  }

  function windows(g, x, y, cols, rows, w, h, gap, lit) {
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var on = lit(c, r);
      if (on) g.rect(x + c * (w + gap), y + r * (h + gap), w, h, on === 2 ? PAPER : MID);
      else g.rect(x + c * (w + gap), y + r * (h + gap), w, h, DARK);
    }
  }

  function tree(g, x, y, h, t, tone) {
    g.rect(x - 1, y, 3, h, INK);
    g.rect(x - 5, y - 2, 3, h * 0.35, INK);
    g.rect(x + 4, y + 2, 3, h * 0.3, INK);
    var cy = y - 4;
    g.circle(x, cy, 9, tone == null ? DARK : tone, true);
    g.circle(x - 6, cy + 3, 6, tone == null ? DARK : tone, true);
    g.circle(x + 7, cy + 2, 7, tone == null ? DARK : tone, true);
    for (var i = 0; i < 9; i++) {
      var lx = x - 9 + (i * 7) % 18, ly = cy - 4 + (i * 5) % 14;
      g.pixel(lx, ly, MID);
      if (i % 3 === 0) g.line(lx, ly, lx + 2, ly + 1, MID);
    }
  }

  function cat(g, x, y, t) {
    g.rect(x, y, 9, 5, INK);
    g.circle(x + 2, y + 1, 2, INK, true);
    g.pixel(x + 1, y - 2, INK); g.pixel(x + 3, y - 2, INK);
    g.line(x + 9, y + 1, x + 13 + Math.round(Math.sin(t * 2) * 2), y - 2, INK);
    g.pixel(x + 2, y + 1, PAPER);
  }

  function bicycle(g, x, y, s) {
    s = s || 1;
    g.circle(x, y, 6, INK, false);
    g.circle(x + 16, y, 6, INK, false);
    g.line(x, y, x + 6, y - 7, INK);
    g.line(x + 6, y - 7, x + 11, y, INK);
    g.line(x + 11, y, x + 16, y, INK);
    g.line(x + 11, y, x + 8, y - 3, INK);
    g.line(x + 6, y - 7, x + 9, y - 9, INK);
    g.line(x + 8, y - 9, x + 12, y - 9, INK);
    for (var i = 0; i < 6; i++) {
      var a = i * 1.05;
      g.pixel(x + Math.round(Math.cos(a) * 5), y + Math.round(Math.sin(a) * 5), MID);
      g.pixel(x + 16 + Math.round(Math.cos(a) * 5), y + Math.round(Math.sin(a) * 5), MID);
    }
  }

  function bin(g, x, y) {
    g.rect(x, y, 13, 16, DARK);
    g.frame(x, y, 13, 16, INK);
    g.rect(x - 1, y - 2, 15, 3, INK);
    g.rect(x + 4, y - 5, 5, 3, INK);
    g.rect(x + 3, y + 3, 7, 1, MID);
  }

  function figure(g, x, y, h, o) {
    o = o || {};
    var body = o.tone == null ? INK : o.tone;
    var headR = Math.max(3, Math.round(h * 0.13));
    var hy = y + headR;
    g.circle(x, hy, headR, o.skin ? PAPER : body, true);
    if (o.skin) g.circle(x, hy, headR, INK, false);
    if (o.hair) {
      g.rect(x - headR, hy - headR, headR * 2, Math.max(2, Math.round(headR * 0.6)), INK);
    }
    var sh = hy + headR;
    g.rect(x - headR - 1, sh, headR * 2 + 2, Math.round(h * 0.34), o.skin ? (o.vest ? PAPER : body) : body);
    if (o.vest) {
      g.frame(x - headR - 1, sh, headR * 2 + 2, Math.round(h * 0.34), INK);
      g.rect(x - headR, sh + 2, 2, Math.round(h * 0.26), MID);
      g.rect(x + headR - 1, sh + 2, 2, Math.round(h * 0.26), MID);
    }
    var legY = sh + Math.round(h * 0.34);
    g.rect(x - headR + 1, legY, 2, y + h - legY, body);
    g.rect(x + headR - 2, legY, 2, y + h - legY, body);
    if (o.arms === "up" || o.pose === "fight") {
      g.line(x - headR, sh + 3, x - headR - 4, sh - 1, body);
      g.line(x + headR, sh + 3, x + headR + 4, sh - 1, body);
      g.circle(x - headR - 4, sh - 2, 2, body, true);
      g.circle(x + headR + 4, sh - 2, 2, body, true);
    } else if (o.arms === "out") {
      g.line(x - headR, sh + 4, x - headR - 6, sh + 6, body);
      g.line(x + headR, sh + 4, x + headR + 6, sh + 6, body);
    }
    if (o.basin) {
      g.rect(x - headR - 1, hy - headR - 3, headR * 2 + 2, 4, PAPER);
      g.frame(x - headR - 1, hy - headR - 3, headR * 2 + 2, 4, INK);
      g.rect(x - headR, hy - headR - 2, headR * 2, 1, MID);
    }
  }

  function crowd(g, y, n, t, tone) {
    for (var i = 0; i < n; i++) {
      var x = 4 + i * (152 / n) + (i % 2) * 2;
      var bob = Math.round(Math.sin(t * 1.5 + i * 0.7));
      g.circle(x, y + bob, 4, tone == null ? INK : tone, true);
      g.rect(x - 5, y + 4 + bob, 11, 8, tone == null ? INK : tone);
      if (i % 3 === 0) g.rect(x - 7, y + 2 + bob, 2, 1, MID);
    }
  }

  function vignette(g) {
    g.dither(0, 0, 160, 3, INK, 1);
    g.dither(0, 141, 160, 3, INK, 1);
    g.dither(0, 0, 3, 144, INK, 1);
    g.dither(157, 0, 3, 144, INK, 1);
  }

  function paperGrain(g, t) {
    for (var i = 0; i < 26; i++) {
      var x = (i * 61 + Math.floor(t * 2)) % 160, y = (i * 43 + 9) % 144;
      if (g.get(x, y) === PAPER) g.pixel(x, y, MID);
    }
  }

  /* ---------------- portraits ---------------- */

  function eyes(g, x, y, o) {
    var mood = o.mood, blink = o.blink;
    if (blink || mood === "solemn" || mood === "cry") {
      g.rect(x, y + 2, 7, 1, INK);
      g.rect(x + 11, y + 2, 7, 1, INK);
      return;
    }
    var h = mood === "shock" ? 4 : mood === "angry" || mood === "defiant" ? 2 : 3;
    g.rect(x, y, 7, h, INK);
    g.rect(x + 11, y, 7, h, INK);
    if (mood !== "angry" && mood !== "defiant") {
      g.pixel(x + 3, y + 1, PAPER);
      g.pixel(x + 14, y + 1, PAPER);
    }
  }

  function brows(g, x, y, mood) {
    if (mood === "angry" || mood === "defiant" || mood === "shout") {
      g.line(x, y + 2, x + 6, y, INK);
      g.line(x + 12, y, x + 18, y + 2, INK);
    } else if (mood === "sad" || mood === "hurt" || mood === "cry") {
      g.line(x, y, x + 6, y + 2, INK);
      g.line(x + 12, y + 2, x + 18, y, INK);
    } else if (mood === "smug" || mood === "smile") {
      g.rect(x, y + 1, 6, 1, INK);
      g.rect(x + 12, y, 6, 1, INK);
    } else {
      g.rect(x, y + 1, 7, 1, INK);
      g.rect(x + 11, y + 1, 7, 1, INK);
    }
  }

  function mouth(g, x, y, mood) {
    if (mood === "shout" || mood === "angry") {
      g.rect(x, y, 10, 4, INK);
      g.rect(x + 2, y + 1, 6, 1, PAPER);
    } else if (mood === "shock") {
      g.rect(x + 2, y, 6, 4, INK);
      g.rect(x + 3, y + 1, 4, 2, PAPER);
    } else if (mood === "smile") {
      g.line(x, y, x + 3, y + 2, INK);
      g.line(x + 3, y + 2, x + 7, y + 2, INK);
      g.line(x + 7, y + 2, x + 10, y, INK);
    } else if (mood === "smug") {
      g.rect(x, y, 8, 1, INK);
      g.pixel(x + 9, y - 1, INK);
    } else if (mood === "sad" || mood === "hurt" || mood === "cry") {
      g.line(x, y + 2, x + 4, y + 3, INK);
      g.line(x + 4, y + 3, x + 9, y + 2, INK);
    } else {
      g.rect(x, y + 1, 9, 1, INK);
    }
  }

  function dad(g, mood, x, y, o) {
    var bob = o.bob || 0;
    y += bob;
    g.rect(x + 3, y + 42, 42, 16, INK);
    g.rect(x + 9, y + 44, 30, 14, DARK);
    g.rect(x + 12, y + 42, 4, 8, DARK);
    g.rect(x + 32, y + 42, 4, 8, DARK);
    g.rect(x + 13, y + 47, 22, 1, MID);
    g.rect(x + 19, y + 35, 10, 9, PAPER);
    g.rect(x + 19, y + 41, 10, 3, MID);
    g.rect(x + 12, y + 10, 24, 26, PAPER);
    g.frame(x + 12, y + 10, 24, 26, INK);
    g.rect(x + 9, y + 20, 3, 7, PAPER); g.frame(x + 9, y + 20, 3, 7, INK);
    g.rect(x + 36, y + 20, 3, 7, PAPER); g.frame(x + 36, y + 20, 3, 7, INK);
    g.rect(x + 10, y + 5, 28, 7, INK);
    g.rect(x + 12, y + 11, 5, 2, INK);
    g.rect(x + 29, y + 11, 5, 2, INK);
    if (o.basin) {
      g.rect(x + 4, y - 4, 40, 9, PAPER);
      g.frame(x + 4, y - 4, 40, 9, INK);
      g.rect(x + 6, y - 2, 36, 1, MID);
      g.rect(x + 6, y + 2, 36, 2, MID);
      g.rect(x + 4, y + 5, 40, 2, INK);
      g.rect(x + 10, y - 3, 3, 1, DARK);
    }
    g.rect(x + 14, y + 12, 3, 2, MID);
    brows(g, x + 15, y + 18, mood);
    eyes(g, x + 15, y + 21, { mood: mood, blink: o.blink });
    g.rect(x + 23, y + 24, 2, 4, MID);
    mouth(g, x + 17, y + 30, mood);
    /* stubble */
    g.dither(x + 15, y + 31, 19, 4, MID, 1);
    g.rect(x + 14, y + 34, 2, 1, MID);
    /* tie-less collar and a cigarette */
    g.rect(x + 18, y + 43, 12, 1, MID);
    if (o.smoke) {
      g.rect(x + 34, y + 30, 7, 1, PAPER);
      g.rect(x + 40, y + 30, 1, 1, INK);
      smoke(g, x + 40, y + 27, o.t || 0, 4);
    }
    if (mood === "shock") {
      g.rect(x + 37, y + 14, 2, 3, PAPER);
      g.rect(x + 37, y + 18, 2, 1, PAPER);
    }
    if (mood === "angry") g.rect(x + 36, y + 8, 3, 1, MID);
    if (mood === "tired") {
      g.rect(x + 14, y + 26, 6, 1, MID);
      g.rect(x + 26, y + 26, 6, 1, MID);
    }
  }

  function son(g, mood, x, y, o) {
    var bob = o.bob || 0;
    y += bob;
    g.rect(x + 8, y + 44, 32, 14, INK);
    g.rect(x + 11, y + 46, 26, 12, DARK);
    g.rect(x + 18, y + 44, 12, 4, MID);
    g.rect(x + 22, y + 48, 4, 1, INK);
    g.rect(x + 20, y + 36, 8, 8, PAPER);
    /* the big head */
    g.rect(x + 7, y + 6, 34, 31, PAPER);
    g.frame(x + 7, y + 6, 34, 31, INK);
    g.rect(x + 4, y + 18, 4, 9, PAPER); g.frame(x + 4, y + 18, 4, 9, INK);
    g.rect(x + 40, y + 18, 4, 9, PAPER); g.frame(x + 40, y + 18, 4, 9, INK);
    /* bowl cut */
    g.rect(x + 6, y + 2, 36, 9, INK);
    g.rect(x + 8, y + 11, 4, 3, INK);
    g.rect(x + 14, y + 11, 5, 2, INK);
    g.rect(x + 21, y + 11, 4, 2, INK);
    g.rect(x + 27, y + 11, 5, 3, INK);
    g.rect(x + 34, y + 11, 4, 2, INK);
    g.rect(x + 9, y + 3, 3, 1, MID);
    if (o.basin) {
      g.rect(x + 4, y - 4, 40, 9, PAPER);
      g.frame(x + 4, y - 4, 40, 9, INK);
      g.rect(x + 6, y - 2, 36, 1, MID);
      g.rect(x + 6, y + 2, 36, 2, MID);
      g.rect(x + 4, y + 5, 40, 2, INK);
      g.rect(x + 10, y - 3, 3, 1, DARK);
    }
    brows(g, x + 12, y + 18, mood);
    eyes(g, x + 12, y + 21, { mood: mood, blink: o.blink });
    g.rect(x + 23, y + 25, 2, 4, MID);
    mouth(g, x + 18, y + 31, mood);
    /* cheek marks */
    if (mood === "smile") {
      g.dither(x + 9, y + 26, 4, 3, MID, 2);
      g.dither(x + 35, y + 26, 4, 3, MID, 2);
    }
    if (mood === "hurt") {
      g.dither(x + 29, y + 25, 7, 5, DARK, 2);
      g.rect(x + 31, y + 24, 3, 1, MID);
    }
    if (mood === "shock") {
      g.rect(x + 38, y + 13, 2, 4, PAPER);
      g.rect(x + 38, y + 18, 2, 1, PAPER);
      g.rect(x + 7, y + 13, 2, 4, PAPER);
    }
    if (mood === "angry") g.rect(x + 37, y + 9, 3, 1, MID);
    if (o.talk) {
      g.rect(x + 20, y + 32, 4, 2, INK);
      g.rect(x + 21, y + 32, 2, 1, PAPER);
    }
  }

  function teacher(g, mood, x, y, o) {
    var bob = o.bob || 0;
    y += bob;
    g.rect(x + 4, y + 42, 40, 16, INK);
    g.rect(x + 9, y + 44, 30, 14, DARK);
    g.rect(x + 23, y + 44, 1, 14, PAPER);
    g.rect(x + 16, y + 42, 16, 3, MID);
    g.rect(x + 19, y + 35, 10, 8, PAPER);
    g.rect(x + 13, y + 10, 22, 25, PAPER);
    g.frame(x + 13, y + 10, 22, 25, INK);
    g.rect(x + 10, y + 20, 3, 6, PAPER); g.frame(x + 10, y + 20, 3, 6, INK);
    g.rect(x + 35, y + 20, 3, 6, PAPER); g.frame(x + 35, y + 20, 3, 6, INK);
    g.rect(x + 11, y + 6, 26, 7, INK);
    g.rect(x + 29, y + 12, 5, 3, INK);
    g.rect(x + 13, y + 7, 4, 1, MID);
    /* glasses */
    g.frame(x + 14, y + 20, 9, 7, INK);
    g.frame(x + 25, y + 20, 9, 7, INK);
    g.rect(x + 23, y + 23, 2, 1, INK);
    g.dither(x + 15, y + 21, 7, 5, MID, 1);
    g.dither(x + 26, y + 21, 7, 5, MID, 1);
    g.rect(x + 17, y + 22, 2, 2, INK);
    g.rect(x + 28, y + 22, 2, 2, INK);
    brows(g, x + 14, y + 17, mood);
    g.rect(x + 23, y + 25, 2, 3, MID);
    mouth(g, x + 18, y + 31, mood);
    /* whistle on a cord */
    g.rect(x + 19, y + 43, 4, 2, PAPER);
    g.frame(x + 19, y + 43, 4, 2, INK);
    g.line(x + 19, y + 43, x + 17, y + 38, MID);
    if (mood === "shock") {
      g.rect(x + 35, y + 13, 2, 4, PAPER);
      g.rect(x + 35, y + 18, 2, 1, PAPER);
    }
  }

  function aunt(g, mood, x, y, o) {
    var bob = o.bob || 0;
    y += bob;
    g.rect(x + 7, y + 43, 34, 15, INK);
    g.rect(x + 11, y + 44, 26, 14, DARK);
    g.rect(x + 19, y + 43, 10, 3, PAPER);
    g.rect(x + 21, y + 36, 6, 8, PAPER);
    g.rect(x + 14, y + 12, 20, 23, PAPER);
    g.frame(x + 14, y + 12, 20, 23, INK);
    g.rect(x + 11, y + 20, 3, 7, PAPER); g.frame(x + 11, y + 20, 3, 7, INK);
    g.rect(x + 34, y + 20, 3, 7, PAPER); g.frame(x + 34, y + 20, 3, 7, INK);
    /* white hair and a bun */
    g.rect(x + 12, y + 8, 24, 7, PAPER);
    g.frame(x + 12, y + 8, 24, 7, INK);
    g.rect(x + 23, y + 3, 9, 6, PAPER);
    g.frame(x + 23, y + 3, 9, 6, INK);
    g.rect(x + 27, y + 2, 1, 3, INK);
    g.rect(x + 12, y + 12, 3, 4, PAPER);
    /* wrinkles */
    g.rect(x + 16, y + 19, 5, 1, MID);
    g.rect(x + 27, y + 19, 5, 1, MID);
    g.rect(x + 15, y + 27, 4, 1, MID);
    g.rect(x + 29, y + 27, 4, 1, MID);
    g.rect(x + 18, y + 35, 3, 1, MID);
    g.rect(x + 25, y + 35, 3, 1, MID);
    brows(g, x + 15, y + 19, mood === "sharp" ? "smug" : mood);
    eyes(g, x + 15, y + 22, { mood: mood, blink: o.blink });
    g.rect(x + 23, y + 25, 2, 3, MID);
    mouth(g, x + 18, y + 31, mood);
    if (o.pipe) {
      g.rect(x + 32, y + 31, 9, 1, INK);
      g.rect(x + 30, y + 30, 3, 3, DARK);
      g.pixel(x + 41, y + 30, MID);
    }
  }

  function girl(g, mood, x, y, o) {
    var bob = o.bob || 0;
    y += bob;
    g.rect(x + 8, y + 43, 32, 15, INK);
    g.rect(x + 11, y + 44, 26, 14, DARK);
    g.rect(x + 18, y + 43, 12, 3, PAPER);
    g.rect(x + 20, y + 36, 8, 8, PAPER);
    g.rect(x + 13, y + 10, 22, 26, PAPER);
    g.frame(x + 13, y + 10, 22, 26, INK);
    g.rect(x + 10, y + 20, 3, 7, PAPER); g.frame(x + 10, y + 20, 3, 7, INK);
    g.rect(x + 35, y + 20, 3, 7, PAPER); g.frame(x + 35, y + 20, 3, 7, INK);
    /* fringe and a ponytail */
    g.rect(x + 11, y + 5, 26, 7, INK);
    g.rect(x + 13, y + 11, 5, 2, INK);
    g.rect(x + 22, y + 11, 4, 2, INK);
    g.rect(x + 29, y + 11, 5, 2, INK);
    g.rect(x + 37, y + 9, 6, 15, INK);
    g.rect(x + 38, y + 15, 4, 2, MID);
    g.rect(x + 12, y + 44, 4, 14, DARK);
    brows(g, x + 15, y + 18, mood === "annoyed" ? "angry" : mood);
    eyes(g, x + 15, y + 21, { mood: mood === "annoyed" ? "angry" : mood, blink: o.blink });
    g.rect(x + 23, y + 25, 2, 3, MID);
    mouth(g, x + 18, y + 31, mood === "annoyed" ? "sad" : mood);
  }

  function portrait(g, who, mood, x, y, o) {
    o = o || {};
    mood = mood || "tired";
    var art = STORY.cast[who] ? STORY.cast[who].art : who;
    if (o.halo) {
      g.dither(x - 2, y - 2, 52, 62, PAPER, 1);
      g.dither(x - 1, y - 1, 50, 60, MID, 1);
    }
    if (art === "son") son(g, mood, x, y, o);
    else if (art === "teacher") teacher(g, mood, x, y, o);
    else if (art === "aunt") aunt(g, mood, x, y, o);
    else if (art === "girl") girl(g, mood, x, y, o);
    else dad(g, mood, x, y, o);
    if (o.dim) g.dither(x, y, 48, 58, INK, 1);
  }

  /* ---------------- backdrops ---------------- */

  function title_alley(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 100, DARK);
    g.dither(0, 0, 160, 34, INK, 2);
    stars(g, t, 10, 26);
    /* distant homes with a few lit windows */
    for (var i = 0; i < 7; i++) {
      var bx = 28 + i * 14, bh = 22 + (i * 13) % 16;
      g.rect(bx, 62 - bh, 13, bh, INK);
      if (i % 3 === 0) g.rect(bx + 3, 50 - (i % 2) * 4, 4, 5, PAPER);
      if (i % 4 === 1) g.rect(bx + 7, 56, 3, 4, MID);
      g.rect(bx, 60, 13, 2, DARK);
    }
    /* the right wall and the courtyard gate */
    bricksLit(g, 100, 26, 60, 72);
    g.rect(101, 26, 2, 72, INK);
    g.rect(126, 54, 22, 44, INK);
    g.rect(128, 56, 18, 42, DARK);
    g.rect(130, 62, 14, 2, MID);
    g.rect(130, 74, 14, 2, MID);
    /* left wall */
    bricks(g, 0, 46, 24, 52, DARK, INK);
    g.rect(22, 46, 2, 52, INK);
    /* wet ground */
    g.rect(0, 98, 160, 46, INK);
    g.rect(0, 98, 160, 2, DARK);
    for (i = 0; i < 9; i++) {
      var px = 8 + (i * 31) % 144, pw = 7 + (i % 4) * 4;
      g.rect(px, 104 + (i % 3) * 8, pw, 1, i % 3 ? DARK : MID);
      g.rect(px + 2, 107 + (i % 3) * 8, pw - 4, 1, MID);
    }
    /* the streetlight, and the boy under it */
    g.rect(132, 16, 2, 82, INK);
    g.rect(120, 16, 14, 3, INK);
    g.rect(122, 19, 10, 4, PAPER);
    g.rect(124, 23, 6, 2, MID);
    cone(g, 126, 24, 34, 72, PAPER);
    g.rect(120, 88, 20, 2, PAPER);
    /* props */
    bicycle(g, 8, 108, 1);
    bin(g, 20, 100);
    cat(g, 146, 28, t);
    /* rain */
    rain(g, t, 26, MID, 4);
    rain(g, t, 10, PAPER, 3);
    /* the gate sign */
    g.rect(98, 30, 26, 11, PAPER);
    g.frame(98, 30, 26, 11, INK);
    g.rect(101, 33, 20, 1, INK);
    g.rect(101, 36, 14, 1, INK);
    vignette(g);
  }

  function school_gate(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 30, MID, 1);
    g.dither(0, 0, 160, 14, DARK, 1);
    g.circle(132, 14, 8, MID, true);
    g.circle(132, 14, 8, INK, false);
    /* school block */
    g.rect(0, 34, 160, 40, DARK);
    g.rect(0, 34, 160, 2, INK);
    for (var r = 0; r < 2; r++) for (var c = 0; c < 9; c++) {
      var on = (r * 9 + c) % 5 === 0;
      g.rect(8 + c * 17, 42 + r * 14, 10, 8, on ? PAPER : MID);
      g.frame(8 + c * 17, 42 + r * 14, 10, 8, INK);
    }
    /* slogan banner */
    g.rect(16, 24, 108, 9, PAPER);
    g.frame(16, 24, 108, 9, INK);
    for (var i = 0; i < 8; i++) g.rect(21 + i * 12, 26, 7, 5, INK);
    /* gate bars */
    g.rect(24, 62, 3, 34, INK);
    g.rect(40, 62, 3, 34, INK);
    g.rect(56, 62, 3, 34, INK);
    g.rect(24, 64, 36, 2, INK);
    g.rect(24, 92, 36, 2, INK);
    g.rect(24, 62, 2, 34, MID);
    /* guard booth */
    g.rect(6, 56, 16, 28, PAPER);
    g.frame(6, 56, 16, 28, INK);
    g.rect(10, 60, 8, 8, MID);
    g.frame(10, 60, 8, 8, INK);
    /* bicycle shed */
    g.rect(72, 54, 84, 4, INK);
    g.rect(74, 58, 3, 38, INK);
    g.rect(150, 58, 3, 38, INK);
    for (i = 0; i < 4; i++) bicycle(g, 80 + i * 17, 88, 0.7);
    /* plane trees */
    tree(g, 154, 24, 46, t, DARK);
    tree(g, 14, 30, 34, t, DARK);
    /* ground */
    g.rect(0, 96, 160, 48, MID);
    g.rect(0, 96, 160, 2, INK);
    for (i = 0; i < 8; i++) g.rect(10 + i * 20, 102 + (i % 3) * 9, 12, 1, DARK);
    /* children */
    crowd(g, 86, 7, t, INK);
    dust(g, t, 12, 0, 20, 160, 50);
    vignette(g);
  }

  function office(g, t) {
    g.clear(MID);
    g.dither(0, 0, 160, 44, DARK, 1);
    g.rect(0, 0, 160, 4, INK);
    /* window with blinds */
    g.rect(96, 8, 58, 38, INK);
    g.rect(98, 10, 54, 34, PAPER);
    for (var i = 0; i < 9; i++) g.rect(98, 12 + i * 4, 54, 1, DARK);
    g.rect(125, 8, 2, 38, INK);
    g.dither(98, 10, 54, 34, MID, 1);
    /* wall clock */
    g.circle(66, 14, 8, PAPER, true);
    g.circle(66, 14, 8, INK, false);
    g.line(66, 14, 66, 9, INK);
    g.line(66, 14, 70, 16, INK);
    g.pixel(66, 14, INK);
    /* file cabinet */
    g.rect(4, 32, 30, 54, DARK);
    g.frame(4, 32, 30, 54, INK);
    for (i = 0; i < 3; i++) {
      g.rect(7, 36 + i * 16, 24, 12, MID);
      g.frame(7, 36 + i * 16, 24, 12, INK);
      g.rect(16, 40 + i * 16, 6, 1, INK);
    }
    /* scroll */
    g.rect(46, 12, 22, 28, PAPER);
    g.frame(46, 12, 22, 28, INK);
    g.line(50, 18, 64, 18, INK);
    g.line(50, 24, 62, 24, INK);
    g.line(50, 30, 60, 30, INK);
    /* desk */
    g.rect(36, 66, 120, 5, DARK);
    g.rect(36, 71, 120, 4, INK);
    g.rect(40, 75, 4, 20, INK);
    g.rect(148, 75, 4, 20, INK);
    /* papers, globe, kettle, books */
    for (i = 0; i < 4; i++) {
      g.rect(48 + i * 3, 58 - i * 2, 26, 7, PAPER);
      g.frame(48 + i * 3, 58 - i * 2, 26, 7, INK);
    }
    g.circle(96, 56, 8, MID, true);
    g.circle(96, 56, 8, INK, false);
    g.line(92, 53, 100, 60, INK);
    g.rect(94, 64, 4, 3, INK);
    g.rect(118, 56, 12, 10, PAPER);
    g.frame(118, 56, 12, 10, INK);
    g.rect(120, 54, 8, 2, INK);
    g.rect(122, 50, 4, 4, MID);
    g.rect(136, 58, 16, 8, PAPER);
    g.frame(136, 58, 16, 8, INK);
    g.rect(138, 60, 12, 1, INK);
    g.rect(138, 63, 8, 1, INK);
    /* steam */
    smoke(g, 126, 50, t, 3);
    /* floor */
    g.rect(0, 95, 160, 49, DARK);
    g.rect(0, 95, 160, 2, INK);
    for (i = 0; i < 6; i++) g.rect(6 + i * 27, 102, 18, 1, MID);
    vignette(g);
  }

  function home_night(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 94, DARK);
    for (var x = 0; x < 160; x += 8) g.rect(x, 0, 1, 94, INK);
    /* window with rain */
    g.rect(14, 8, 48, 40, INK);
    g.rect(16, 10, 44, 36, DARK);
    for (var i = 0; i < 9; i++) {
      var wx = 18 + (i * 11) % 40, wy = 12 + (i * 7) % 30;
      g.line(wx, wy, wx - 1, wy + 5, MID);
    }
    g.frame(14, 8, 48, 40, INK);
    g.rect(37, 8, 1, 40, INK);
    g.rect(14, 27, 48, 1, INK);
    g.dither(16, 10, 44, 36, MID, 1);
    /* fluorescent tube */
    g.rect(78, 3, 54, 3, PAPER);
    g.rect(80, 6, 50, 1, MID);
    glow(g, 104, 8, 24, PAPER);
    /* calendar: a mid-tone wall object, so it does not read as a hat behind a bust */
    g.rect(120, 12, 26, 32, MID);
    g.frame(120, 12, 26, 32, INK);
    g.rect(120, 12, 26, 7, DARK);
    g.rect(123, 15, 4, 1, PAPER);
    g.rect(130, 15, 8, 1, PAPER);
    for (i = 0; i < 4; i++) for (var j = 0; j < 3; j++) {
      g.rect(123 + j * 7, 22 + i * 5, 4, 3, (i * 3 + j) % 4 === 0 ? DARK : INK);
    }
    /* door on the left */
    g.rect(0, 34, 18, 60, INK);
    g.rect(2, 36, 14, 56, DARK);
    g.rect(3, 38, 12, 52, INK);
    g.rect(13, 62, 2, 2, PAPER);
    /* table */
    g.rect(64, 64, 84, 4, DARK);
    g.rect(64, 68, 84, 3, INK);
    g.rect(68, 71, 3, 21, INK);
    g.rect(141, 71, 3, 21, INK);
    /* thermos, bowls, newspapers */
    g.rect(76, 48, 8, 16, PAPER);
    g.frame(76, 48, 8, 16, INK);
    g.rect(77, 46, 6, 2, INK);
    g.rect(78, 51, 4, 1, MID);
    g.circle(96, 62, 4, PAPER, true);
    g.circle(96, 62, 4, INK, false);
    g.circle(108, 62, 3, PAPER, true);
    g.circle(108, 62, 3, INK, false);
    g.rect(118, 56, 18, 3, PAPER);
    g.rect(118, 60, 18, 3, PAPER);
    g.rect(118, 56, 18, 1, INK);
    g.rect(118, 60, 18, 1, INK);
    /* coat rack */
    g.rect(150, 18, 1, 52, INK);
    g.rect(145, 18, 11, 2, INK);
    g.rect(144, 22, 6, 16, DARK);
    g.rect(152, 22, 6, 14, MID);
    /* chair */
    g.rect(24, 66, 3, 26, INK);
    g.rect(24, 66, 20, 3, INK);
    g.rect(41, 66, 3, 26, INK);
    g.rect(24, 78, 20, 2, DARK);
    smoke(g, 30, 54, t, 3);
    /* floor */
    g.rect(0, 94, 160, 50, DARK);
    g.rect(0, 94, 160, 2, INK);
    for (i = 0; i < 9; i++) g.rect(4 + i * 18, 100 + (i % 3) * 8, 11, 1, INK);
    vignette(g);
  }

  function kitchen_night(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 144, DARK);
    /* fridge, open */
    g.rect(3, 18, 50, 84, INK);
    g.rect(6, 21, 44, 78, PAPER);
    g.frame(6, 21, 44, 78, INK);
    g.rect(8, 38, 40, 1, INK);
    g.rect(8, 58, 40, 1, INK);
    g.rect(8, 78, 40, 1, INK);
    /* shelves */
    for (var i = 0; i < 5; i++) {
      g.rect(11 + i * 7, 28, 4, 9, MID);
      g.rect(12 + i * 7, 27, 2, 1, INK);
    }
    g.rect(12, 48, 6, 9, MID);
    g.rect(22, 46, 9, 11, PAPER);
    g.frame(22, 46, 9, 11, INK);
    g.rect(35, 44, 8, 13, MID);
    g.rect(11, 68, 12, 9, MID);
    g.rect(27, 66, 10, 11, PAPER);
    g.frame(27, 66, 10, 11, INK);
    /* the open door edge */
    g.rect(48, 21, 6, 78, PAPER);
    g.frame(48, 21, 6, 78, INK);
    /* light on the floor */
    for (var yy = 0; yy < 50; yy += 2) {
      var half = 22 + yy;
      g.dither(50 - half / 2 + yy * 0.2, 96 + yy, half, 2, PAPER, 1);
    }
    /* table */
    g.rect(56, 76, 98, 5, MID);
    g.rect(56, 81, 98, 3, INK);
    g.rect(60, 84, 3, 20, INK);
    g.rect(148, 84, 3, 20, INK);
    /* plate with food */
    g.circle(78, 70, 8, PAPER, true);
    g.circle(78, 70, 8, INK, false);
    for (i = 0; i < 3; i++) g.rect(72 + i * 4, 67 + (i % 2), 2, 7, MID);
    g.circle(92, 70, 4, MID, true);
    g.circle(92, 68, 1, INK, true);
    g.circle(102, 70, 4, PAPER, true);
    g.circle(102, 70, 4, INK, false);
    g.circle(110, 70, 4, PAPER, true);
    g.circle(110, 70, 4, INK, false);
    /* yogurt */
    g.rect(120, 58, 9, 14, PAPER);
    g.frame(120, 58, 9, 14, INK);
    g.rect(121, 56, 7, 2, MID);
    /* basin */
    g.circle(142, 68, 8, PAPER, true);
    g.circle(142, 68, 8, INK, false);
    g.circle(142, 68, 5, MID, true);
    g.circle(142, 68, 4, PAPER, true);
    /* window and moon */
    g.rect(124, 10, 30, 28, INK);
    g.rect(126, 12, 26, 24, INK);
    g.circle(144, 20, 6, PAPER, true);
    g.circle(142, 18, 2, MID, true);
    g.frame(124, 10, 30, 28, MID);
    g.rect(139, 10, 1, 28, MID);
    /* hanging bulb */
    g.rect(72, 0, 1, 8, INK);
    g.circle(72, 11, 4, PAPER, true);
    g.circle(72, 11, 4, INK, false);
    glow(g, 72, 11, 16, PAPER);
    /* shadow of the boy on the wall */
    g.rect(90, 22, 12, 30, INK);
    g.circle(96, 18, 7, INK, true);
    g.rect(86, 28, 20, 6, INK);
    /* steam */
    smoke(g, 86, 62, t, 4);
    vignette(g);
  }

  function bedroom(g, t) {
    g.clear(MID);
    g.dither(0, 0, 160, 40, DARK, 1);
    /* poster: a tiger */
    g.rect(92, 8, 34, 44, PAPER);
    g.frame(92, 8, 34, 44, INK);
    g.circle(109, 26, 10, MID, true);
    g.circle(109, 26, 10, INK, false);
    g.rect(102, 16, 4, 4, INK); g.rect(112, 16, 4, 4, INK);
    g.rect(105, 24, 3, 2, INK); g.rect(111, 24, 3, 2, INK);
    g.rect(108, 29, 4, 2, INK);
    for (var i = 0; i < 4; i++) {
      g.line(100, 20 + i * 4, 95, 18 + i * 4, INK);
      g.line(118, 20 + i * 4, 123, 18 + i * 4, INK);
    }
    g.text(T({ zh: "虎", en: "TIGER" }), 109, 41, { align: "center", color: INK });
    /* bed */
    g.rect(0, 76, 62, 10, DARK);
    g.rect(0, 86, 62, 4, INK);
    g.rect(4, 66, 20, 10, PAPER);
    g.frame(4, 66, 20, 10, INK);
    g.rect(30, 70, 28, 6, MID);
    g.rect(0, 62, 3, 28, INK);
    g.rect(60, 62, 3, 28, INK);
    /* desk */
    g.rect(74, 66, 66, 4, DARK);
    g.rect(74, 70, 66, 4, INK);
    g.rect(78, 74, 3, 22, INK);
    g.rect(134, 74, 3, 22, INK);
    /* lamp */
    g.rect(118, 44, 2, 22, INK);
    g.rect(108, 40, 22, 8, PAPER);
    g.frame(108, 40, 22, 8, INK);
    glow(g, 119, 44, 16, PAPER);
    /* books */
    for (i = 0; i < 5; i++) {
      g.rect(82 + i * 2, 56 - i * 3, 18, 5, i % 2 ? MID : PAPER);
      g.frame(82 + i * 2, 56 - i * 3, 18, 5, INK);
    }
    g.rect(84, 50, 14, 1, INK);
    /* radio */
    g.rect(136, 54, 14, 10, DARK);
    g.frame(136, 54, 14, 10, INK);
    g.circle(140, 59, 2, PAPER, true);
    g.rect(144, 57, 4, 1, MID);
    /* punching bag */
    g.rect(148, 2, 8, 4, INK);
    g.rect(150, 6, 1, 8, INK);
    g.rect(140, 14, 16, 28, MID);
    g.frame(140, 14, 16, 28, INK);
    g.rect(142, 18, 12, 1, INK);
    g.rect(142, 26, 12, 1, INK);
    g.text(T({ zh: "马", en: "MA" }), 142, 20, { color: INK });
    /* basin on a nail */
    g.rect(52, 28, 1, 7, INK);
    g.circle(52, 39, 7, PAPER, true);
    g.circle(52, 39, 7, INK, false);
    g.circle(52, 39, 4, MID, true);
    /* window */
    g.rect(4, 8, 32, 30, INK);
    g.rect(6, 10, 28, 26, DARK);
    g.frame(4, 8, 32, 30, INK);
    g.rect(20, 8, 1, 30, INK);
    g.rect(4, 23, 32, 1, INK);
    g.circle(28, 16, 4, PAPER, true);
    /* floor */
    g.rect(0, 96, 160, 48, DARK);
    g.rect(0, 96, 160, 2, INK);
    for (i = 0; i < 10; i++) g.rect(4 + i * 16, 102 + (i % 3) * 8, 9, 1, INK);
    vignette(g);
  }

  function schoolyard(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 26, MID, 1);
    g.circle(128, 14, 9, MID, true);
    g.circle(128, 14, 9, INK, false);
    /* school building */
    g.rect(0, 34, 160, 42, DARK);
    g.rect(0, 34, 160, 2, INK);
    for (var r = 0; r < 2; r++) for (var c = 0; c < 10; c++) {
      g.rect(4 + c * 16, 42 + r * 14, 9, 8, (r + c) % 6 === 0 ? PAPER : MID);
      g.frame(4 + c * 16, 42 + r * 14, 9, 8, INK);
    }
    /* banner */
    g.rect(20, 22, 112, 9, PAPER);
    g.frame(20, 22, 112, 9, INK);
    for (var i = 0; i < 9; i++) g.rect(24 + i * 12, 24, 7, 5, INK);
    /* podium */
    g.rect(52, 54, 56, 4, INK);
    g.rect(54, 58, 52, 28, DARK);
    g.frame(54, 58, 52, 28, INK);
    g.rect(56, 60, 48, 2, MID);
    /* microphone */
    g.rect(80, 34, 1, 20, INK);
    g.circle(80, 33, 2, INK, true);
    g.rect(74, 52, 13, 2, INK);
    /* the boy at the microphone */
    figure(g, 80, 50, 20, { skin: true, hair: true, tone: INK, vest: false });
    /* teacher at the side */
    figure(g, 116, 54, 22, { tone: INK, skin: false });
    /* flagpole */
    g.rect(148, 0, 2, 92, INK);
    g.rect(138, 4, 10, 7, PAPER);
    g.frame(138, 4, 10, 7, INK);
    g.rect(140, 6, 6, 1, MID);
    /* trees */
    tree(g, 10, 26, 46, t, DARK);
    tree(g, 154, 30, 43, t, DARK);
    /* ground and audience */
    g.rect(0, 96, 160, 48, MID);
    g.rect(0, 96, 160, 2, INK);
    for (i = 0; i < 8; i++) g.rect(10 + i * 20, 100 + (i % 3) * 8, 12, 1, DARK);
    crowd(g, 90, 8, t, INK);
    crowd(g, 104, 8, t + 0.5, DARK);
    dust(g, t, 18, 0, 18, 160, 60);
    vignette(g);
  }

  function classroom(g, t) {
    g.clear(MID);
    g.dither(0, 0, 160, 30, DARK, 1);
    /* slogan */
    g.rect(14, 0, 96, 6, PAPER);
    for (var i = 0; i < 7; i++) g.rect(18 + i * 13, 1, 8, 3, INK);
    /* blackboard */
    g.rect(14, 8, 96, 38, INK);
    g.frame(14, 8, 96, 38, INK);
    g.rect(16, 10, 92, 34, DARK);
    g.rect(20, 16, 30, 1, PAPER);
    g.rect(20, 21, 44, 1, PAPER);
    g.rect(20, 26, 24, 1, PAPER);
    g.rect(20, 31, 36, 1, PAPER);
    g.rect(70, 16, 20, 1, MID);
    g.rect(70, 21, 26, 1, MID);
    g.circle(82, 34, 5, MID, false);
    /* clock */
    g.circle(124, 12, 7, PAPER, true);
    g.circle(124, 12, 7, INK, false);
    g.line(124, 12, 124, 7, INK);
    g.line(124, 12, 128, 14, INK);
    g.pixel(124, 12, INK);
    /* window */
    g.rect(116, 24, 42, 30, PAPER);
    g.frame(116, 24, 42, 30, INK);
    g.rect(136, 24, 1, 30, INK);
    g.rect(116, 38, 42, 1, INK);
    g.dither(118, 26, 18, 12, MID, 1);
    g.dither(138, 40, 18, 12, MID, 1);
    tree(g, 154, 30, 22, t, DARK);
    /* desks in perspective */
    for (var row = 0; row < 3; row++) {
      var dy = 54 + row * 12, dw = 30 + row * 4;
      for (var col = 0; col < 4; col++) {
        var dx = 8 + col * 38;
        g.rect(dx, dy, dw, 3, DARK);
        g.rect(dx, dy + 3, dw, 1, INK);
        g.rect(dx + 2, dy + 4, 2, 8, INK);
        g.rect(dx + dw - 4, dy + 4, 2, 8, INK);
      }
    }
    /* the basin on the middle desk */
    g.circle(80, 56, 7, PAPER, true);
    g.circle(80, 56, 7, INK, false);
    g.circle(80, 56, 4, MID, true);
    g.circle(80, 56, 3, PAPER, true);
    /* teacher's desk */
    g.rect(108, 62, 48, 4, DARK);
    g.rect(108, 66, 48, 3, INK);
    g.rect(112, 69, 3, 16, INK);
    g.rect(148, 69, 3, 16, INK);
    /* foreground heads */
    for (i = 0; i < 5; i++) {
      g.circle(12 + i * 36, 92, 6, INK, true);
      g.rect(4 + i * 36, 98, 17, 14, INK);
    }
    dust(g, t, 10, 20, 10, 90, 60);
    vignette(g);
  }

  function baoding(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 34, MID, 1);
    g.dither(0, 0, 160, 14, DARK, 1);
    /* back wall */
    bricksLit(g, 0, 38, 160, 62);
    g.rect(0, 36, 160, 2, INK);
    /* gate */
    g.rect(10, 44, 30, 56, INK);
    g.rect(12, 46, 26, 54, DARK);
    g.rect(14, 48, 22, 30, MID);
    g.rect(24, 48, 2, 52, INK);
    /* grape trellis */
    g.rect(0, 0, 160, 3, INK);
    for (var i = 0; i < 6; i++) g.rect(8 + i * 28, 0, 3, 10, INK);
    for (i = 0; i < 5; i++) {
      g.line(0, 8 + i * 2, 160, 12 + i * 3, INK);
      g.circle(20 + i * 31, 14 + (i % 2) * 6, 3, DARK, true);
      g.circle(20 + i * 31, 14 + (i % 2) * 6, 3, INK, false);
    }
    /* persimmon tree */
    tree(g, 132, 30, 44, t, DARK);
    for (i = 0; i < 5; i++) {
      g.circle(124 + (i * 7) % 20, 26 + (i * 5) % 16, 2, PAPER, true);
      g.circle(124 + (i * 7) % 20, 26 + (i * 5) % 16, 2, INK, false);
    }
    /* wooden dummy */
    g.rect(84, 42, 4, 54, INK);
    g.rect(76, 50, 20, 3, INK);
    g.rect(80, 58, 12, 2, DARK);
    g.rect(82, 46, 8, 4, DARK);
    g.rect(86, 96, 16, 3, INK);
    /* water vat */
    g.rect(2, 72, 28, 24, DARK);
    g.frame(2, 72, 28, 24, INK);
    g.rect(2, 76, 28, 2, INK);
    g.rect(2, 88, 28, 2, INK);
    g.rect(4, 72, 24, 2, MID);
    /* bench and stove */
    g.rect(40, 80, 30, 3, DARK);
    g.rect(42, 83, 2, 12, INK);
    g.rect(66, 83, 2, 12, INK);
    g.rect(54, 62, 12, 16, DARK);
    g.frame(54, 62, 12, 16, INK);
    g.rect(56, 58, 8, 4, MID);
    smoke(g, 60, 54, t, 3);
    /* laundry line */
    g.line(0, 30, 100, 24, INK);
    g.rect(30, 25, 10, 12, PAPER);
    g.frame(30, 25, 10, 12, MID);
    g.rect(50, 24, 8, 10, MID);
    /* ground */
    g.rect(0, 96, 160, 48, MID);
    g.rect(0, 96, 160, 2, INK);
    for (i = 0; i < 9; i++) g.rect(4 + i * 18, 102 + (i % 3) * 8, 12, 1, DARK);
    /* the two shadows */
    g.rect(64, 60, 5, 26, INK);
    g.circle(66, 57, 4, INK, true);
    g.rect(74, 62, 4, 24, INK);
    g.circle(76, 60, 3, INK, true);
    /* heat shimmer */
    for (i = 0; i < 6; i++) g.dither(0, 44 + i * 7, 160, 1, PAPER, 1);
    dust(g, t, 12, 0, 10, 160, 60);
    vignette(g);
  }

  function baoding_night(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 60, INK);
    stars(g, t, 18, 34);
    g.circle(130, 16, 10, PAPER, true);
    g.circle(127, 13, 3, MID, true);
    /* wall: moonlit, so the ink shadow reads */
    bricks(g, 0, 38, 160, 62, MID, DARK);
    g.rect(0, 36, 160, 2, INK);
    /* doorway with a lantern */
    g.rect(10, 44, 30, 56, INK);
    g.rect(12, 46, 26, 54, DARK);
    g.rect(22, 52, 8, 10, PAPER);
    g.frame(22, 52, 8, 10, INK);
    glow(g, 26, 57, 10, PAPER);
    /* trellis */
    g.rect(0, 0, 160, 3, INK);
    for (var i = 0; i < 6; i++) g.rect(8 + i * 28, 0, 3, 10, INK);
    for (i = 0; i < 5; i++) g.line(0, 8 + i * 2, 160, 12 + i * 3, INK);
    /* tree */
    tree(g, 132, 30, 44, t, INK);
    /* wooden dummy */
    g.rect(84, 42, 4, 54, INK);
    g.rect(76, 50, 20, 3, INK);
    g.rect(80, 58, 12, 2, DARK);
    /* the boy's shadow on the wall */
    g.circle(74, 38, 7, INK, true);
    g.rect(66, 45, 16, 22, INK);
    g.line(66, 50, 56, 42, INK);
    g.line(82, 50, 92, 42, INK);
    g.rect(68, 67, 4, 22, INK);
    g.rect(78, 67, 4, 22, INK);
    /* the old woman in the doorway */
    figure(g, 26, 66, 28, { tone: INK, skin: true, hair: true });
    g.rect(31, 62, 7, 1, MID);
    /* ground */
    g.rect(0, 96, 160, 48, INK);
    g.rect(0, 96, 160, 2, DARK);
    for (i = 0; i < 7; i++) g.rect(8 + i * 22, 104 + (i % 3) * 6, 10, 1, DARK);
    vignette(g);
  }

  function wall_night(g, t) {
    g.clear(INK);
    bricks(g, 0, 0, 160, 118, DARK, INK);
    for (var i = 0; i < 24; i++) {
      var bx = (i * 37 + 5) % 160, by = (i * 29 + 3) % 112;
      g.rect(bx, by, 3, 1, MID);
    }
    /* the no-peeing sign */
    g.rect(92, 38, 54, 14, PAPER);
    g.frame(92, 38, 54, 14, INK);
    g.text(T({ zh: "禁止小便", en: "NO PEEING" }), 94, 39, { color: INK });
    /* streetlight from above */
    g.rect(128, 0, 2, 22, INK);
    g.rect(116, 2, 14, 2, INK);
    g.rect(120, 4, 8, 4, PAPER);
    cone(g, 124, 8, 26, 50, PAPER);
    /* gutter */
    g.rect(0, 112, 160, 32, INK);
    g.rect(0, 112, 160, 2, MID);
    for (i = 0; i < 10; i++) g.rect((i * 23 + Math.round(t * 4)) % 160, 118 + (i % 3) * 4, 7, 1, MID);
    /* weeds */
    for (i = 0; i < 9; i++) {
      var wx = 4 + i * 18;
      g.line(wx, 112, wx + 2, 104, INK);
      g.line(wx + 1, 112, wx - 1, 103, INK);
    }
    /* the stream: abstract, no body */
    g.line(30, 72, 34, 82, PAPER);
    g.line(34, 82, 32, 94, PAPER);
    g.line(32, 94, 38, 106, MID);
    g.line(38, 106, 36, 114, MID);
    g.pixel(39, 112, PAPER); g.pixel(35, 108, PAPER);
    /* father, back view, at the wall */
    g.circle(18, 58, 7, INK, true);
    g.rect(10, 65, 18, 22, INK);
    g.line(28, 70, 34, 80, INK);
    g.rect(12, 86, 5, 20, INK);
    g.rect(22, 86, 5, 20, INK);
    g.rect(10, 65, 18, 1, MID);
    /* the boy, small, at the right */
    figure(g, 118, 76, 28, { tone: INK, skin: true, hair: true });
    g.rect(137, 74, 2, 18, MID);
    /* cat and bin */
    cat(g, 148, 104, t);
    bin(g, 60, 96);
    /* puddles */
    g.rect(42, 116, 20, 1, MID);
    g.rect(46, 120, 12, 1, DARK);
    vignette(g);
  }

  function alley_final(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 34, INK);
    stars(g, t, 8, 20);
    /* two walls in perspective */
    bricksLit(g, 0, 0, 50, 110);
    bricksLit(g, 110, 0, 50, 110);
    for (var i = 0; i < 10; i++) {
      g.rect(0, 10 + i * 10, 50 - i * 2, 1, INK);
      g.rect(110 + i * 2, 10 + i * 10, 50 - i * 2, 1, INK);
    }
    /* doors and lit windows */
    g.rect(4, 42, 16, 42, INK);
    g.rect(6, 44, 12, 40, DARK);
    g.rect(140, 36, 14, 38, INK);
    g.rect(142, 38, 10, 36, DARK);
    for (i = 0; i < 4; i++) {
      g.rect(14 + i * 3, 16 + (i % 2) * 18, 6, 7, i % 2 ? PAPER : MID);
      g.frame(14 + i * 3, 16 + (i % 2) * 18, 6, 7, INK);
      g.rect(132 - i * 3, 20 + (i % 2) * 16, 6, 7, i % 2 ? MID : PAPER);
      g.frame(132 - i * 3, 20 + (i % 2) * 16, 6, 7, INK);
    }
    /* streetlight */
    g.rect(100, 2, 2, 76, INK);
    g.rect(90, 2, 14, 2, INK);
    g.rect(92, 4, 10, 4, PAPER);
    g.rect(94, 8, 6, 2, MID);
    cone(g, 97, 10, 42, 78, PAPER);
    /* ground */
    g.rect(0, 96, 160, 48, INK);
    g.rect(0, 96, 160, 2, DARK);
    for (i = 0; i < 12; i++) g.rect((i * 19 + 4) % 160, 102 + (i % 4) * 7, 8, 1, i % 3 ? DARK : MID);
    /* the boy, full body, in the light */
    figure(g, 84, 50, 44, { skin: true, hair: true, vest: true, pose: "fight", tone: INK });
    /* his long shadow on the ground and up the wall */
    g.rect(92, 94, 18, 1, INK);
    g.rect(96, 88, 10, 7, INK);
    g.rect(99, 72, 4, 18, INK);
    g.circle(101, 69, 3, INK, true);
    /* the basin on the ground */
    g.circle(54, 104, 6, PAPER, true);
    g.circle(54, 104, 6, INK, false);
    g.circle(54, 104, 3, MID, true);
    /* foreground shoulder, the father's back */
    g.rect(0, 70, 20, 26, INK);
    g.circle(10, 68, 9, INK, true);
    g.rect(0, 70, 20, 2, MID);
    /* props */
    bicycle(g, 118, 118, 1);
    bin(g, 6, 108);
    cat(g, 144, 30, t);
    /* steam from a manhole */
    for (i = 0; i < 4; i++) {
      var sy = 90 - i * 5;
      g.rect(64 + Math.round(Math.sin(t * 1.5 + i) * 3), sy, 3, 1, MID);
    }
    dust(g, t, 10, 30, 40, 100, 40);
    vignette(g);
  }

  function kitchen_table(g, t) {
    g.clear(INK);
    g.rect(6, 6, 148, 132, DARK);
    g.dither(6, 6, 148, 132, MID, 1);
    /* a warm pool of light */
    for (var i = 0; i < 20; i++) g.dither(20 + i * 2, 10 + i * 2, 120 - i * 2, 2, PAPER, 1);
    /* plate */
    g.circle(52, 46, 22, PAPER, true);
    g.circle(52, 46, 22, INK, false);
    g.circle(52, 46, 17, MID, true);
    g.circle(52, 46, 15, PAPER, true);
    /* cucumber sticks, tomato, eggs */
    for (i = 0; i < 4; i++) g.rect(38 + i * 6, 38 + (i % 2) * 2, 3, 14, MID);
    g.circle(66, 50, 6, MID, true);
    g.circle(66, 50, 6, INK, false);
    g.rect(64, 47, 4, 1, INK);
    g.circle(44, 54, 5, PAPER, true);
    g.circle(44, 54, 5, INK, false);
    g.circle(58, 56, 5, PAPER, true);
    g.circle(58, 56, 5, INK, false);
    /* yogurt, bowl, chopsticks */
    g.rect(98, 28, 12, 20, PAPER);
    g.frame(98, 28, 12, 20, INK);
    g.rect(99, 26, 10, 2, MID);
    g.circle(118, 48, 10, PAPER, true);
    g.circle(118, 48, 10, INK, false);
    g.circle(118, 48, 7, MID, true);
    g.line(132, 20, 148, 58, INK);
    g.line(136, 20, 152, 58, INK);
    /* basin at the edge */
    g.circle(136, 76, 14, PAPER, true);
    g.circle(136, 76, 14, INK, false);
    g.circle(136, 76, 10, MID, true);
    g.circle(136, 76, 8, PAPER, true);
    g.circle(136, 76, 4, MID, true);
    /* two hands reaching in */
    g.rect(20, 96, 18, 10, PAPER);
    g.frame(20, 96, 18, 10, INK);
    for (i = 0; i < 3; i++) g.rect(22 + i * 5, 94, 3, 3, PAPER);
    g.rect(76, 106, 22, 10, PAPER);
    g.frame(76, 106, 22, 10, INK);
    for (i = 0; i < 4; i++) g.rect(78 + i * 5, 104, 3, 3, PAPER);
    /* steam */
    smoke(g, 86, 94, t, 3);
    vignette(g);
  }

  function basin_closeup(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 144, DARK);
    g.dither(0, 0, 160, 40, INK, 1);
    /* the huge basin */
    g.circle(80, 64, 54, PAPER, true);
    g.circle(80, 64, 54, INK, false);
    g.circle(80, 64, 47, MID, true);
    g.circle(80, 64, 42, PAPER, true);
    g.circle(80, 64, 38, MID, true);
    g.circle(80, 64, 34, PAPER, true);
    g.circle(80, 64, 56, MID, false);
    /* rim highlights */
    for (var i = 0; i < 9; i++) {
      var a = 3.6 + i * 0.22;
      g.pixel(80 + Math.round(Math.cos(a) * 50), 64 + Math.round(Math.sin(a) * 50), DARK);
    }
    /* the peony at the bottom */
    g.circle(80, 74, 9, MID, true);
    g.circle(80, 74, 6, PAPER, true);
    for (i = 0; i < 6; i++) {
      var aa = i * Math.PI / 3;
      g.circle(80 + Math.round(Math.cos(aa) * 9), 74 + Math.round(Math.sin(aa) * 6), 3, MID, true);
      g.circle(80 + Math.round(Math.cos(aa) * 9), 74 + Math.round(Math.sin(aa) * 6), 2, PAPER, true);
    }
    /* a little face in the enamel */
    g.circle(80, 48, 13, MID, true);
    g.circle(80, 48, 12, PAPER, true);
    g.rect(74, 46, 4, 2, INK);
    g.rect(84, 46, 4, 2, INK);
    g.rect(80, 51, 2, 3, INK);
    g.rect(76, 56, 9, 1, INK);
    g.rect(72, 38, 16, 3, INK);
    /* light from the left */
    for (i = 0; i < 26; i++) g.dither(2 + i * 2, 4 + i * 2, 40 - i, 2, PAPER, 1);
    /* drops */
    g.pixel(44, 36, PAPER); g.pixel(48, 42, PAPER); g.pixel(120, 84, PAPER);
    vignette(g);
  }

  function home_dawn(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 22, MID, 1);
    g.dither(0, 0, 160, 10, DARK, 1);
    g.rect(0, 38, 160, 1, MID);
    g.circle(132, 34, 9, PAPER, true);
    g.circle(132, 34, 9, INK, false);
    /* low street */
    g.rect(0, 52, 160, 36, DARK);
    g.rect(0, 52, 160, 2, INK);
    for (var i = 0; i < 7; i++) {
      g.rect(4 + i * 22, 58, 18, 26, INK);
      if (i % 2 === 0) g.rect(8 + i * 22, 64, 8, 8, MID);
    }
    /* road */
    g.rect(0, 88, 160, 56, MID);
    g.rect(0, 88, 160, 2, INK);
    for (i = 0; i < 8; i++) g.rect(6 + i * 20, 96 + (i % 3) * 8, 12, 1, DARK);
    /* two runners */
    figure(g, 66, 64, 26, { tone: INK, skin: true, hair: true, arms: "out", basin: true });
    figure(g, 84, 70, 22, { tone: INK, skin: true, hair: true, arms: "out" });
    /* breakfast stall */
    g.rect(110, 60, 30, 24, DARK);
    g.rect(108, 56, 34, 4, INK);
    g.rect(114, 66, 8, 6, PAPER);
    g.rect(126, 66, 8, 6, PAPER);
    smoke(g, 124, 54, t, 4);
    /* streetlight off */
    g.rect(20, 30, 2, 58, INK);
    g.rect(14, 28, 10, 3, INK);
    cat(g, 150, 92, t);
    vignette(g);
  }

  function podium_day(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 24, MID, 1);
    g.circle(132, 12, 8, MID, true);
    g.circle(132, 12, 8, INK, false);
    g.rect(0, 34, 160, 42, DARK);
    g.rect(0, 34, 160, 2, INK);
    for (var r = 0; r < 2; r++) for (var c = 0; c < 10; c++) {
      g.rect(4 + c * 16, 42 + r * 14, 9, 8, (r + c) % 5 === 0 ? PAPER : MID);
      g.frame(4 + c * 16, 42 + r * 14, 9, 8, INK);
    }
    g.rect(20, 22, 112, 9, PAPER);
    g.frame(20, 22, 112, 9, INK);
    for (var i = 0; i < 9; i++) g.rect(24 + i * 12, 24, 7, 5, INK);
    /* podium */
    g.rect(44, 56, 72, 4, INK);
    g.rect(46, 60, 68, 30, DARK);
    g.frame(46, 60, 68, 30, INK);
    /* father with a basin, son beside him */
    figure(g, 72, 42, 30, { tone: INK, skin: true, hair: true, vest: false, basin: true });
    figure(g, 96, 48, 24, { tone: INK, skin: true, hair: true });
    /* microphone */
    g.rect(84, 36, 1, 20, INK);
    g.circle(84, 35, 2, INK, true);
    /* crowd */
    g.rect(0, 96, 160, 48, MID);
    g.rect(0, 96, 160, 2, INK);
    crowd(g, 92, 9, t, INK);
    crowd(g, 106, 9, t + 0.4, DARK);
    /* confetti */
    for (i = 0; i < 24; i++) {
      var cx = (i * 37 + Math.floor(t * 8)) % 160;
      var cy = (i * 23 + Math.floor(t * 12)) % 90;
      g.rect(cx, cy, 2, 2, i % 3 === 0 ? INK : i % 3 === 1 ? MID : PAPER);
    }
    vignette(g);
  }

  function window_rain(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 144, DARK);
    /* window frame */
    g.rect(10, 6, 140, 126, INK);
    g.rect(14, 10, 132, 118, DARK);
    g.frame(10, 6, 140, 126, INK);
    g.rect(79, 6, 2, 126, INK);
    g.rect(10, 68, 140, 2, INK);
    /* rain on the glass */
    for (var i = 0; i < 30; i++) {
      var x = 16 + (i * 37 + Math.floor(t * 30)) % 126;
      var y = 12 + (i * 23 + Math.floor(t * 55)) % 112;
      g.line(x, y, x - 1, y + 6, i % 3 ? MID : PAPER);
    }
    /* the street beyond */
    g.dither(16, 76, 62, 50, MID, 1);
    g.dither(82, 76, 62, 50, MID, 1);
    g.circle(112, 100, 8, PAPER, true);
    g.circle(112, 100, 8, INK, false);
    /* a reflected face in the glass */
    g.circle(50, 44, 12, INK, true);
    g.circle(46, 42, 2, PAPER, true);
    g.circle(54, 42, 2, PAPER, true);
    g.rect(47, 50, 6, 1, MID);
    vignette(g);
  }

  /* ---------------- chapter posters ---------------- */

  function card_gate(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 88, DARK);
    g.dither(0, 0, 160, 30, INK, 2);
    /* school gate at night */
    g.rect(0, 26, 160, 40, DARK);
    g.rect(0, 26, 160, 2, INK);
    for (var r = 0; r < 2; r++) for (var c = 0; c < 10; c++) {
      g.rect(4 + c * 16, 32 + r * 12, 9, 7, (r * 10 + c) % 7 === 0 ? PAPER : MID);
      g.frame(4 + c * 16, 32 + r * 12, 9, 7, INK);
    }
    g.rect(18, 20, 110, 8, PAPER);
    g.frame(18, 20, 110, 8, INK);
    for (var i = 0; i < 8; i++) g.rect(23 + i * 13, 22, 8, 4, INK);
    /* gate */
    g.rect(46, 62, 3, 26, INK);
    g.rect(62, 62, 3, 26, INK);
    g.rect(78, 62, 3, 26, INK);
    g.rect(46, 64, 35, 2, INK);
    /* the backpack in the tree */
    g.rect(116, 30, 3, 34, INK);
    g.circle(117, 28, 9, DARK, true);
    g.rect(122, 34, 13, 14, PAPER);
    g.frame(122, 34, 13, 14, INK);
    g.rect(124, 36, 9, 2, MID);
    g.line(122, 34, 117, 30, INK);
    g.line(135, 34, 117, 28, INK);
    /* rain and ground */
    g.rect(0, 88, 160, 56, INK);
    g.rect(0, 88, 160, 2, MID);
    for (i = 0; i < 8; i++) g.rect(8 + i * 20, 94 + (i % 3) * 7, 12, 1, DARK);
    rain(g, t, 22, MID, 4);
    vignette(g);
  }

  function card_podium(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 24, MID, 1);
    g.circle(130, 14, 10, MID, true);
    g.circle(130, 14, 10, INK, false);
    g.rect(0, 32, 160, 44, DARK);
    g.rect(0, 32, 160, 2, INK);
    g.rect(20, 22, 112, 9, PAPER);
    g.frame(20, 22, 112, 9, INK);
    for (var i = 0; i < 9; i++) g.rect(24 + i * 12, 24, 7, 5, INK);
    /* podium */
    g.rect(48, 52, 64, 4, INK);
    g.rect(50, 56, 60, 30, DARK);
    g.frame(50, 56, 60, 30, INK);
    /* a very small boy at a very large microphone */
    figure(g, 80, 42, 18, { tone: INK, skin: true, hair: true });
    g.rect(80, 30, 1, 16, INK);
    g.circle(80, 29, 2, INK, true);
    /* the crowd, as a dark sea */
    g.rect(0, 84, 160, 60, INK);
    for (i = 0; i < 11; i++) {
      g.circle(6 + i * 15, 88, 4, DARK, true);
      g.rect(0 + i * 15, 92, 13, 10, DARK);
    }
    /* one raised fist */
    g.rect(126, 76, 3, 10, INK);
    g.circle(127, 74, 3, INK, true);
    dust(g, t, 14, 0, 20, 160, 50);
    vignette(g);
  }

  function card_basin(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 88, DARK);
    /* a shaft of light */
    for (var i = 0; i < 40; i += 2) {
      var half = 14 + i * 0.8;
      g.dither(80 - half, 0 + i, half * 2, 2, PAPER, 1);
    }
    /* desk */
    g.rect(0, 66, 160, 4, INK);
    g.rect(0, 70, 160, 18, INK);
    /* the giant basin */
    g.circle(80, 54, 28, PAPER, true);
    g.circle(80, 54, 28, INK, false);
    g.circle(80, 54, 22, MID, true);
    g.circle(80, 54, 18, PAPER, true);
    g.circle(80, 54, 11, MID, true);
    g.circle(80, 54, 8, PAPER, true);
    /* a small boy behind it */
    g.circle(80, 30, 6, INK, true);
    g.rect(74, 36, 12, 14, INK);
    g.rect(78, 32, 4, 3, PAPER);
    /* a second basin, the shadow */
    g.circle(118, 58, 18, DARK, true);
    g.circle(118, 58, 18, INK, false);
    rain(g, t, 12, MID, 3);
    vignette(g);
  }

  function card_courtyard(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 30, MID, 1);
    bricksLit(g, 0, 36, 160, 52);
    g.rect(0, 34, 160, 2, INK);
    /* trellis */
    g.rect(0, 0, 160, 3, INK);
    for (var i = 0; i < 6; i++) g.rect(8 + i * 28, 0, 3, 10, INK);
    for (i = 0; i < 5; i++) {
      g.line(0, 8 + i * 2, 160, 12 + i * 3, INK);
      g.circle(20 + i * 31, 14 + (i % 2) * 6, 3, DARK, true);
      g.circle(20 + i * 31, 14 + (i % 2) * 6, 3, INK, false);
    }
    /* dummy and two shadows */
    g.rect(84, 40, 4, 48, INK);
    g.rect(76, 48, 20, 3, INK);
    g.rect(80, 56, 12, 2, DARK);
    g.rect(80, 88, 12, 2, INK);
    /* the two figures, as ink silhouettes */
    g.circle(52, 56, 6, INK, true);
    g.rect(46, 62, 12, 16, INK);
    g.line(46, 66, 38, 58, INK);
    g.line(58, 66, 66, 58, INK);
    g.circle(66, 64, 4, INK, true);
    g.rect(62, 68, 8, 12, INK);
    g.line(62, 70, 56, 64, INK);
    g.line(70, 70, 76, 64, INK);
    /* ground */
    g.rect(0, 88, 160, 56, MID);
    g.rect(0, 88, 160, 2, INK);
    for (i = 0; i < 8; i++) g.rect(6 + i * 20, 96 + (i % 3) * 8, 12, 1, DARK);
    /* persimmons */
    for (i = 0; i < 5; i++) {
      g.circle(124 + (i * 7) % 22, 26 + (i * 5) % 18, 2, PAPER, true);
      g.circle(124 + (i * 7) % 22, 26 + (i * 5) % 18, 2, INK, false);
    }
    dust(g, t, 12, 0, 10, 160, 50);
    vignette(g);
  }

  function card_wave(g, t) {
    g.clear(INK);
    bricks(g, 0, 0, 160, 120, DARK, INK);
    /* streetlight */
    g.rect(124, 0, 2, 50, INK);
    g.rect(112, 2, 16, 2, INK);
    g.rect(116, 4, 10, 4, PAPER);
    cone(g, 120, 8, 30, 58, PAPER);
    /* the wave, rising from the ground */
    for (var y = 0; y < 92; y += 2) {
      var wave = Math.round(Math.sin(y * 0.11 + t * 1.5) * 8);
      var top = 92 - y;
      g.dither(wave - 20, top, 80, 2, MID, 1);
      if (y % 6 === 0) g.dither(wave - 10, top, 50, 1, PAPER, 1);
    }
    /* the boy in front of it */
    figure(g, 70, 54, 38, { tone: INK, skin: true, hair: true, vest: true, pose: "fight" });
    /* ground */
    g.rect(0, 92, 160, 52, INK);
    g.rect(0, 92, 160, 2, MID);
    for (var i = 0; i < 8; i++) g.rect(6 + i * 20, 100 + (i % 3) * 8, 10, 1, MID);
    vignette(g);
  }

  function card_alley(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 96, DARK);
    bricksLit(g, 0, 0, 54, 96);
    bricksLit(g, 106, 0, 54, 96);
    /* the streetlight */
    g.rect(80, 0, 2, 54, INK);
    g.rect(68, 2, 16, 2, INK);
    g.rect(72, 4, 10, 4, PAPER);
    cone(g, 77, 8, 34, 84, PAPER);
    /* ground */
    g.rect(0, 88, 160, 56, INK);
    g.rect(0, 88, 160, 2, MID);
    /* the boy, fists up */
    figure(g, 66, 48, 42, { tone: INK, skin: true, hair: true, vest: true, pose: "fight" });
    /* the father, foreground, back view */
    g.rect(0, 60, 26, 36, INK);
    g.circle(13, 57, 11, INK, true);
    g.rect(0, 60, 26, 2, MID);
    /* the basin on the ground */
    g.circle(108, 92, 7, PAPER, true);
    g.circle(108, 92, 7, INK, false);
    g.circle(108, 92, 4, MID, true);
    /* long shadow */
    g.rect(74, 88, 20, 1, INK);
    g.rect(80, 78, 10, 9, INK);
    g.rect(84, 60, 4, 18, INK);
    g.circle(86, 57, 3, INK, true);
    rain(g, t, 14, MID, 3);
    vignette(g);
  }

  /* ---------------- ending posters ---------------- */

  function end_done(g, t) {
    g.clear(INK);
    g.dither(0, 0, 160, 30, DARK, 1);
    /* low angle: the boy looms, the father is a small shape on the ground */
    g.rect(0, 0, 160, 96, DARK);
    bricksLit(g, 0, 0, 44, 96);
    bricksLit(g, 118, 0, 42, 96);
    g.rect(94, 0, 2, 70, INK);
    g.rect(84, 2, 22, 2, INK);
    g.rect(88, 4, 14, 4, PAPER);
    cone(g, 95, 8, 44, 80, PAPER);
    /* the boy, huge in the foreground */
    figure(g, 76, 24, 64, { tone: INK, skin: true, hair: true, vest: true, pose: "fight" });
    /* the father, small on the ground, above the poster panel */
    g.rect(18, 62, 26, 8, INK);
    g.circle(24, 58, 5, INK, true);
    g.rect(38, 64, 14, 4, INK);
    g.rect(20, 68, 4, 6, INK);
    /* ground and rain */
    g.rect(0, 96, 160, 48, INK);
    g.rect(0, 96, 160, 2, MID);
    for (var i = 0; i < 10; i++) g.rect((i * 19 + 5) % 160, 102 + (i % 4) * 7, 8, 1, MID);
    rain(g, t, 20, MID, 4);
    vignette(g);
  }

  function end_side(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 26, MID, 1);
    g.dither(0, 0, 160, 12, DARK, 1);
    g.circle(130, 18, 10, PAPER, true);
    g.circle(130, 18, 10, INK, false);
    /* alley at dawn */
    bricksLit(g, 0, 30, 50, 66);
    bricksLit(g, 110, 30, 50, 66);
    g.rect(0, 28, 160, 2, INK);
    g.rect(0, 92, 160, 52, MID);
    g.rect(0, 92, 160, 2, INK);
    for (var i = 0; i < 8; i++) g.rect(6 + i * 20, 98 + (i % 3) * 8, 10, 1, DARK);
    /* two figures, backs, side by side */
    figure(g, 64, 48, 40, { tone: INK, skin: true, hair: true, vest: true });
    figure(g, 90, 54, 34, { tone: INK, skin: true, hair: true });
    /* their shadows merge */
    g.rect(58, 88, 44, 1, INK);
    g.rect(62, 82, 36, 6, INK);
    /* a bicycle and the basin */
    bicycle(g, 118, 104, 1);
    g.circle(24, 100, 6, PAPER, true);
    g.circle(24, 100, 6, INK, false);
    g.circle(24, 100, 3, MID, true);
    dust(g, t, 10, 0, 20, 160, 50);
    vignette(g);
  }

  function end_basin(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 24, MID, 1);
    g.rect(0, 32, 160, 44, DARK);
    g.rect(0, 32, 160, 2, INK);
    g.rect(20, 22, 112, 9, PAPER);
    g.frame(20, 22, 112, 9, INK);
    for (var i = 0; i < 9; i++) g.rect(24 + i * 12, 24, 7, 5, INK);
    g.rect(44, 56, 72, 4, INK);
    g.rect(46, 60, 68, 28, DARK);
    g.frame(46, 60, 68, 28, INK);
    /* the father with the basin, the son beside him */
    figure(g, 72, 40, 32, { tone: INK, skin: true, hair: true, basin: true });
    figure(g, 98, 48, 24, { tone: INK, skin: true, hair: true });
    g.rect(84, 34, 1, 22, INK);
    g.circle(84, 33, 2, INK, true);
    /* the crowd */
    g.rect(0, 96, 160, 48, MID);
    g.rect(0, 96, 160, 2, INK);
    crowd(g, 92, 9, t, INK);
    crowd(g, 106, 9, t + 0.4, DARK);
    /* confetti */
    for (i = 0; i < 30; i++) {
      var cx = (i * 37 + Math.floor(t * 8)) % 160;
      var cy = (i * 23 + Math.floor(t * 12)) % 88;
      g.rect(cx, cy, 2, 2, i % 3 === 0 ? INK : i % 3 === 1 ? MID : PAPER);
    }
    vignette(g);
  }

  function end_grow(g, t) {
    g.clear(INK);
    g.rect(0, 0, 160, 96, DARK);
    /* fridge light */
    g.rect(4, 20, 42, 70, INK);
    g.rect(7, 23, 36, 64, PAPER);
    g.frame(7, 23, 36, 64, INK);
    for (var i = 0; i < 4; i++) g.rect(9, 34 + i * 14, 32, 1, INK);
    for (i = 0; i < 4; i++) g.rect(10 + i * 8, 26 + (i % 2) * 16, 4, 8, MID);
    for (var yy = 0; yy < 40; yy += 2) {
      var half = 20 + yy;
      g.dither(44 - half / 2, 90 + yy, half, 2, PAPER, 1);
    }
    /* a warm halo behind the two of them */
    g.dither(40, 18, 64, 54, PAPER, 1);
    /* father, left, leaning down */
    g.rect(48, 38, 26, 36, INK);
    g.rect(48, 38, 26, 2, MID);
    g.rect(56, 40, 10, 10, DARK);
    g.circle(60, 30, 9, PAPER, true);
    g.circle(60, 30, 9, INK, false);
    g.rect(52, 20, 16, 5, INK);
    g.rect(64, 28, 1, 1, INK);
    g.rect(58, 35, 6, 1, INK);
    /* son, right, face against the father's chest */
    g.rect(72, 48, 20, 26, INK);
    g.rect(76, 50, 12, 8, MID);
    g.circle(80, 42, 8, PAPER, true);
    g.circle(80, 42, 8, INK, false);
    g.rect(74, 35, 14, 4, INK);
    g.rect(78, 40, 1, 1, INK);
    g.rect(76, 48, 6, 1, INK);
    /* the father's arm around the son's back */
    g.rect(70, 46, 4, 10, MID);
    g.rect(74, 50, 14, 3, MID);
    g.rect(86, 46, 3, 8, MID);
    g.rect(86, 50, 3, 3, PAPER);
    /* the son's arm around the father's waist */
    g.rect(74, 54, 3, 10, MID);
    g.rect(60, 58, 16, 3, MID);
    g.rect(58, 54, 3, 6, MID);
    g.rect(58, 58, 3, 3, PAPER);
    /* table */
    g.rect(52, 76, 102, 5, MID);
    g.rect(52, 81, 102, 3, INK);
    g.rect(56, 84, 3, 18, INK);
    g.rect(150, 84, 3, 18, INK);
    smoke(g, 120, 62, t, 4);
    /* floor */
    g.rect(0, 96, 160, 48, INK);
    g.rect(0, 96, 160, 2, MID);
    for (i = 0; i < 8; i++) g.rect(6 + i * 20, 102 + (i % 3) * 7, 9, 1, DARK);
    vignette(g);
  }

  function end_leave(g, t) {
    g.clear(PAPER);
    g.dither(0, 0, 160, 24, MID, 1);
    g.dither(0, 0, 160, 10, DARK, 1);
    /* the doorstep, dawn */
    g.rect(0, 34, 160, 62, DARK);
    g.rect(0, 34, 160, 2, INK);
    g.rect(12, 36, 34, 38, INK);
    g.rect(14, 38, 30, 36, DARK);
    g.rect(16, 44, 26, 28, MID);
    /* ground and step */
    g.rect(0, 72, 160, 72, DARK);
    g.rect(0, 72, 160, 2, INK);
    /* the basin on the step */
    g.circle(70, 60, 12, PAPER, true);
    g.circle(70, 60, 12, INK, false);
    g.circle(70, 60, 8, MID, true);
    g.circle(70, 60, 6, PAPER, true);
    /* the note */
    g.rect(88, 62, 20, 10, PAPER);
    g.frame(88, 62, 20, 10, INK);
    g.rect(91, 65, 14, 1, INK);
    g.rect(91, 68, 9, 1, INK);
    /* a train ticket */
    g.rect(112, 63, 14, 8, MID);
    g.frame(112, 63, 14, 8, INK);
    g.rect(114, 65, 10, 1, INK);
    /* a cat on the step and a distant train */
    cat(g, 140, 66, t);
    g.rect(0, 28, 160, 2, INK);
    g.rect(118, 18, 28, 8, INK);
    g.rect(122, 14, 20, 4, INK);
    for (var i = 0; i < 4; i++) g.rect(122 + i * 6, 20, 3, 4, PAPER);
    dust(g, t, 8, 0, 30, 160, 40);
    vignette(g);
  }

  function bg(g, name, t, o) {
    var f = BACKDROPS[name];
    if (f) f(g, t, o || {});
    else { g.clear(PAPER); g.dither(0, 0, 160, 144, MID, 1); }
  }

  var BACKDROPS = {
    title_alley: title_alley,
    school_gate: school_gate,
    office: office,
    home_night: home_night,
    kitchen_night: kitchen_night,
    bedroom: bedroom,
    schoolyard: schoolyard,
    classroom: classroom,
    baoding: baoding,
    baoding_night: baoding_night,
    wall_night: wall_night,
    alley_final: alley_final,
    kitchen_table: kitchen_table,
    basin_closeup: basin_closeup,
    home_dawn: home_dawn,
    podium_day: podium_day,
    window_rain: window_rain
  };

  var CARDS = {
    card_gate: card_gate,
    card_podium: card_podium,
    card_basin: card_basin,
    card_courtyard: card_courtyard,
    card_wave: card_wave,
    card_alley: card_alley
  };

  var ENDS = {
    end_done: end_done,
    end_side: end_side,
    end_basin: end_basin,
    end_grow: end_grow,
    end_leave: end_leave
  };

  /* ---------------- stamps: small paper cards in the corner ---------------- */

  function stamp(g, name, x, y, label) {
    g.rect(x, y, 30, 34, PAPER);
    g.frame(x, y, 30, 34, INK);
    g.rect(x + 2, y + 2, 26, 1, MID);
    var cx = x + 15, cy = y + 10;
    if (name === "cucumber") {
      g.rect(cx - 7, cy - 2, 14, 4, MID);
      g.rect(cx - 6, cy - 1, 12, 1, DARK);
      g.rect(cx - 7, cy - 2, 2, 4, INK);
      g.rect(cx + 5, cy - 2, 2, 4, INK);
      g.pixel(cx - 2, cy, PAPER); g.pixel(cx + 3, cy, PAPER);
    } else if (name === "basin") {
      g.circle(cx, cy, 8, PAPER, true);
      g.circle(cx, cy, 8, INK, false);
      g.circle(cx, cy, 5, MID, true);
      g.circle(cx, cy, 4, PAPER, true);
      g.rect(cx - 6, cy - 8, 12, 1, PAPER);
    } else if (name === "book") {
      g.rect(cx - 7, cy - 6, 14, 4, PAPER); g.frame(cx - 7, cy - 6, 14, 4, INK);
      g.rect(cx - 6, cy - 2, 12, 4, MID); g.frame(cx - 6, cy - 2, 12, 4, INK);
      g.rect(cx - 5, cy + 2, 10, 4, PAPER); g.frame(cx - 5, cy + 2, 10, 4, INK);
    } else if (name === "fist") {
      g.rect(cx - 6, cy - 4, 9, 8, PAPER);
      g.frame(cx - 6, cy - 4, 9, 8, INK);
      g.rect(cx + 3, cy - 1, 3, 5, PAPER);
      g.frame(cx + 3, cy - 1, 3, 5, INK);
      g.rect(cx - 5, cy + 4, 8, 2, MID);
    } else if (name === "wave") {
      for (var i = 0; i < 4; i++) {
        g.line(cx - 8 + i * 4, cy + 2, cx - 4 + i * 4, cy - 4, MID);
        g.line(cx - 4 + i * 4, cy - 4, cx + i * 4, cy + 2, MID);
      }
    } else if (name === "lamp") {
      g.rect(cx, cy - 8, 1, 14, INK);
      g.rect(cx - 5, cy - 8, 11, 2, INK);
      g.rect(cx - 3, cy - 6, 7, 3, PAPER);
      g.frame(cx - 3, cy - 6, 7, 3, INK);
      g.line(cx - 3, cy - 3, cx - 5, cy + 6, MID);
      g.line(cx + 3, cy - 3, cx + 5, cy + 6, MID);
    }
    if (label) g.text(T(label), cx, y + 21, { align: "center", color: INK });
  }

  return {
    portrait: portrait, bg: bg, card: function (g, name, t) { var f = CARDS[name]; if (f) f(g, t); else bg(g, "home_night", t); },
    ending: function (g, name, t) { var f = ENDS[name]; if (f) f(g, t); else bg(g, "alley_final", t); },
    stamp: stamp, rain: rain, dust: dust, cone: cone, glow: glow, smoke: smoke, figure: figure, bike: bicycle,
    names: {
      bg: Object.keys(BACKDROPS), card: Object.keys(CARDS), end: Object.keys(ENDS),
      stamp: ["cucumber", "basin", "book", "fist", "wave", "lamp"],
      cast: ["dad", "son", "teacher", "aunt", "girl"]
    }
  };
})();
