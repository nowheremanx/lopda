/* fake-yu / art.js — the court, the crowd and the people in it, drawn in four tones.
 *
 * Every venue is a small stage set built from rectangles, dithered light and silhouettes:
 * King Xuan's bright ensemble hall, his garden, King Min's cold throne room, the moonlit
 * lake, the palace wall at night and the dawn that follows. Portraits are 48x58 busts.
 *
 * MIT License. Copyright (c) 2026 Haowei Wu.
 */

var ART = (function () {
  "use strict";

  var INK = 0, DARK = 1, MID = 2, PAPER = 3;

  /* ---------------- pieces ---------------- */

  function drape(g, x, y, w, h) {
    g.rect(x, y, w, h, INK);
    for (var i = 2; i < w; i += 4) g.rect(x + i, y, 1, h, DARK);
    for (i = 0; i < w; i += 6) {
      g.rect(x + i, y + h - 3, 5, 2, MID);
      g.rect(x + i + 1, y + h - 1, 3, 2, INK);
    }
    g.rect(x, y, w, 1, MID);
  }

  function lantern(g, x, y, t, tone) {
    tone = tone == null ? PAPER : tone;
    var sway = Math.round(Math.sin(t * 1.7 + x * 0.1) * 1);
    g.line(x, y, x + sway, y + 4, INK);
    g.rect(x - 3 + sway, y + 4, 7, 6, tone);
    g.frame(x - 3 + sway, y + 4, 7, 6, INK);
    g.rect(x + sway, y + 5, 1, 4, INK);
    g.line(x - 2 + sway, y + 11, x + sway, y + 14, MID);
    g.line(x + 2 + sway, y + 11, x + sway, y + 14, MID);
    if (tone === PAPER) g.rect(x - 2 + sway, y + 6, 1, 2, MID);
  }

  function pillar(g, x, y, h, bright) {
    g.rect(x, y, 8, h, bright ? DARK : INK);
    g.rect(x + 1, y, 2, h, bright ? MID : DARK);
    g.rect(x + 5, y, 1, h, INK);
    g.rect(x - 1, y, 10, 3, bright ? INK : MID);
    g.rect(x - 1, y + h - 3, 10, 3, bright ? INK : MID);
    for (var i = 0; i < 3; i++) g.rect(x + 2, y + 8 + i * 14, 4, 1, bright ? PAPER : MID);
  }

  function archWindow(g, x, y, w, h, night) {
    g.rect(x, y, w, h, night ? DARK : PAPER);
    g.rect(x + 2, y + 2, w - 4, h - 4, night ? INK : MID);
    if (night) {
      g.circle(x + w / 2, y + h / 2 - 2, Math.max(2, Math.round(w / 5)), PAPER, true);
      g.circle(x + w / 2 + 1, y + h / 2 - 3, Math.max(1, Math.round(w / 7)), INK, true);
      for (var s = 0; s < 4; s++) g.pixel(x + 3 + (s * 7) % (w - 5), y + 4 + (s * 11) % (h - 8), PAPER);
    } else {
      g.rect(x + 2, y + h - 3, w - 4, 2, DARK);
      g.circle(x + w / 2, y + h - 6, 2, DARK, true);
    }
    g.line(x + Math.round(w / 2), y, x + Math.round(w / 2), y + h, INK);
    g.line(x, y + Math.round(h / 2), x + w, y + Math.round(h / 2), INK);
    g.frame(x, y, w, h, INK);
  }

  function paintedScreen(g, x, y, w, h, motif) {
    g.rect(x, y, w, h, PAPER);
    g.frame(x, y, w, h, INK);
    g.rect(x + 2, y + 2, w - 4, h - 4, MID);
    /* distant hills */
    for (var i = 0; i < w - 4; i++) {
      var hh = Math.round(3 + Math.sin((i + x) * 0.24) * 2 + Math.sin((i + x) * 0.09) * 3);
      g.rect(x + 2 + i, y + h - 4 - hh, 1, hh, DARK);
    }
    if (motif === "bamboo") {
      g.rect(x + 5, y + 3, 1, h - 8, INK);
      g.rect(x + 11, y + 6, 1, h - 11, INK);
      for (i = 0; i < 3; i++) {
        g.line(x + 5, y + 7 + i * 6, x + 2, y + 4 + i * 6, INK);
        g.line(x + 5, y + 9 + i * 6, x + 8, y + 7 + i * 6, INK);
        g.line(x + 11, y + 10 + i * 6, x + 14, y + 7 + i * 6, INK);
      }
    } else if (motif === "moon") {
      g.circle(x + w - 7, y + 7, 3, PAPER, true);
      g.rect(x + 3, y + h - 8, w - 6, 1, MID);
    } else {
      g.line(x + 4, y + h - 6, x + w / 2, y + 5, INK);
      g.line(x + w / 2, y + 5, x + w - 4, y + h - 6, MID);
      g.rect(x + 3, y + h - 6, w - 6, 1, INK);
    }
  }

  function beam(g, x, y, w, h, tone, step) {
    for (var i = 0; i < w; i += (step || 4)) g.rect(x + i, y, 1, h, tone);
  }

  function hangingBanner(g, x, y, w, h, ch, t) {
    var sway = Math.round(Math.sin(t * 1.2 + x * 0.05));
    g.line(x, 0, x + sway, y, INK);
    g.line(x + w, 0, x + w + sway, y, INK);
    g.rect(x + sway, y, w, h, DARK);
    g.frame(x + sway, y, w, h, INK);
    g.rect(x + sway + 2, y + 2, w - 4, h - 4, MID);
    g.text(ch, x + sway + Math.round(w / 2), y + Math.round((h - 12) / 2), { align: "center", color: INK });
    for (var i = 0; i < w; i += 3) g.rect(x + i + sway, y + h, 2, 2, INK);
  }

  function crowdHead(g, x, y, r, tone, face) {
    g.circle(x, y, r, tone, true);
    g.circle(x, y, r, INK, false);
    if (face) {
      g.pixel(x - 1, y, INK);
      g.pixel(x + 1, y, INK);
      if (face === "happy") g.rect(x - 1, y + 1, 3, 1, INK);
      else if (face === "shock") { g.pixel(x, y + 1, INK); g.pixel(x, y + 2, INK); }
      else g.rect(x, y + 1, 1, 1, INK);
    }
  }

  function guard(g, x, y, dir) {
    dir = dir || 1;
    g.rect(x + 2, y + 16, 3, 7, INK);
    g.rect(x + 8, y + 16, 3, 7, INK);
    g.rect(x + 2, y + 8, 9, 9, DARK);
    g.rect(x + 1, y + 9, 2, 5, MID);
    g.rect(x + 10, y + 9, 2, 5, MID);
    g.rect(x + 4, y + 2, 6, 6, PAPER);
    g.rect(x + 4, y + 1, 6, 3, INK);
    g.rect(x + 3, y + 3, 8, 1, INK);
    g.rect(x + 5, y + 4, 1, 1, INK);
    g.rect(x + 8, y + 4, 1, 1, INK);
    g.rect(x + 5, y + 6, 4, 1, MID);
    g.line(x + 6, y - 5, x + 6 + dir, y + 1, MID);
    g.rect(x + 6 + dir, y - 6, 1, 3, INK);
    g.rect(x + 5, y + 11, 4, 1, INK);
  }

  function musician(g, x, y, kind, beat, mood) {
    var bob = Math.round(Math.sin(beat * Math.PI * 2 + x * 0.05) * 1);
    var tone = mood === "empty" ? MID : DARK;
    /* legs, robe, head */
    g.rect(x + 2, y + 16, 2, 5, INK);
    g.rect(x + 7, y + 16, 2, 5, INK);
    g.rect(x + 1, y + 9 + bob, 9, 8, tone);
    g.rect(x + 2, y + 3 + bob, 7, 6, PAPER);
    g.rect(x + 2, y + 2 + bob, 7, 2, INK);
    g.rect(x + 3, y + 5 + bob, 1, 1, INK);
    g.rect(x + 7, y + 5 + bob, 1, 1, INK);
    if (kind === "drum") {
      g.circle(x + 5, y + 12 + bob, 4, MID, true);
      g.frame(x + 1, y + 9 + bob, 9, 6, INK);
      g.line(x + 1, y + 7 + bob, x + 9, y + 3 + bob, INK);
    } else if (kind === "qin") {
      g.rect(x - 3, y + 11 + bob, 15, 2, INK);
      g.rect(x - 2, y + 12 + bob, 13, 1, MID);
      g.line(x + 1, y + 13 + bob, x + 1, y + 16, MID);
    } else if (kind === "bell") {
      g.rect(x - 2, y + 7 + bob, 3, 7, INK);
      g.rect(x + 10, y + 7 + bob, 3, 7, INK);
      g.rect(x - 1, y + 6 + bob, 2, 1, MID);
      g.rect(x + 10, y + 6 + bob, 2, 1, MID);
    } else if (kind === "flute") {
      g.line(x + 4, y + 8 + bob, x + 15, y + 5 + bob, INK);
      g.rect(x + 14, y + 4 + bob, 2, 2, MID);
    } else if (kind === "pipa") {
      g.circle(x + 9, y + 11 + bob, 3, MID, true);
      g.frame(x + 6, y + 8 + bob, 7, 7, INK);
      g.rect(x + 9, y + 4 + bob, 1, 5, INK);
    } else {
      /* sheng: a little bundle of pipes at the mouth */
      g.rect(x + 9, y + 6 + bob, 2, 8, INK);
      g.rect(x + 11, y + 5 + bob, 1, 6, MID);
      g.rect(x + 8, y + 7 + bob, 4, 1, INK);
      g.rect(x + 12, y + 8 + bob, 1, 3, MID);
    }
    if (mood === "worried") {
      g.rect(x + 1, y + 1 + bob, 1, 1, INK);
      g.rect(x + 9, y + 1 + bob, 1, 1, INK);
    }
  }

  function player(g, x, y, o) {
    o = o || {};
    var bow = o.bow;
    var bob = bow ? 2 : 0;
    /* feet */
    g.rect(x + 4, y + 24, 4, 4, INK);
    g.rect(x + 12, y + 24, 4, 4, INK);
    /* robe */
    g.rect(x + 2, y + 13 + bob, 16, 12 - bob, o.robed ? DARK : MID);
    g.frame(x + 2, y + 13 + bob, 16, 12 - bob, INK);
    g.rect(x + 7, y + 14 + bob, 6, 1, INK);
    g.rect(x + 4, y + 19 + bob, 12, 1, DARK);
    /* head */
    g.rect(x + 5, y + 6 + bob, 12, 8, PAPER);
    g.frame(x + 5, y + 6 + bob, 12, 8, INK);
    g.rect(x + 7, y + 9 + bob, 2, 2, INK);
    g.rect(x + 12, y + 9 + bob, 2, 2, INK);
    if (o.mood === "worried") { g.rect(x + 7, y + 8 + bob, 2, 1, INK); g.rect(x + 12, y + 8 + bob, 2, 1, INK); }
    if (o.mood === "sly") { g.rect(x + 8, y + 12 + bob, 5, 1, INK); g.pixel(x + 13, y + 11 + bob, INK); }
    else g.rect(x + 8, y + 12 + bob, 5, 1, INK);
    /* cap; a bow pulls it over the eyes */
    g.rect(x + 1, y + 2 + bob, 18, 4, INK);
    g.rect(x + 3, y + bob, 14, 3, INK);
    if (bow) {
      g.rect(x + 5, y + 7 + bob, 12, 3, INK);
      g.rect(x + 7, y + 7 + bob, 2, 1, PAPER);
      g.rect(x + 12, y + 7 + bob, 2, 1, PAPER);
    }
    /* arms and sheng */
    var ay = o.puff ? y + 9 + bob : y + 12 + bob;
    g.rect(x + 15, ay, 8, 2, INK);
    g.rect(x + 20, y + 2 + bob, 2, 10, INK);
    g.rect(x + 22, y + 1 + bob, 2, 12, MID);
    g.rect(x + 24, y + 4 + bob, 2, 7, INK);
    if (o.puff) {
      g.circle(x + 17, y + 9 + bob, 2, MID, true);
      g.rect(x + 26, y + 8 + bob, 3, 1, INK);
      g.rect(x + 28, y + 7 + bob, 2, 1, MID);
      g.rect(x + 28, y + 10 + bob, 2, 1, MID);
    }
    if (o.sweat) { g.rect(x + 15, y + 5 + bob, 1, 2, PAPER); g.rect(x + 16, y + 7 + bob, 1, 1, PAPER); }
    if (o.arms) { g.rect(x + 1, y + 2, 2, 7, INK); g.rect(x + 19, y + 2, 2, 7, INK); }
  }

  function conductor(g, x, y, beat, tone) {
    tone = tone == null ? INK : tone;
    var swing = Math.sin(beat * Math.PI * 2);
    g.rect(x + 5, y + 8, 12, 14, tone);
    g.rect(x + 6, y + 2, 10, 7, PAPER); g.frame(x + 6, y + 2, 10, 7, INK);
    g.rect(x + 8, y + 4, 1, 1, INK); g.rect(x + 12, y + 4, 1, 1, INK);
    g.rect(x + 4, y + 1, 14, 3, tone);
    g.rect(x + 3, y + 10, 5, 2, tone);
    g.rect(x + 14, y + 9, 2, 4, tone);
    g.line(x + 15, y + 10, x + 22 + Math.round(swing * 3), y + 1 + Math.round(swing * 6), MID);
    g.rect(x + 21 + Math.round(swing * 3), y + Math.round(swing * 6), 2, 2, tone);
    g.rect(x + 8, y + 22, 3, 3, tone); g.rect(x + 13, y + 22, 3, 3, tone);
  }

  function audience(g, t, o) {
    o = o || {};
    var top = o.y == null ? 120 : o.y;
    g.rect(0, top, 160, 144 - top, INK);
    g.rect(0, top, 160, 2, DARK);
    var mood = o.mood || "calm";
    for (var row = 0; row < 2; row++) {
      for (var i = 0; i < 8; i++) {
        var x = 2 + i * 20 + (row ? 10 : 0), y = top + 6 + row * 8;
        var b = Math.round(Math.sin((t * 2 + i * 0.13 + row * 0.3) * Math.PI * 2) * 1);
        var face = mood === "happy" ? "happy" : mood === "shock" ? "shock" : null;
        crowdHead(g, x + 5, y + 3 + b, 4, DARK, face);
        g.rect(x + 1, y + 6 + b, 9, 5, DARK);
        if (mood === "happy") {
          g.rect(x - 2, y + 1 + b, 3, 1, MID);
          g.rect(x + 10, y + 1 + b, 3, 1, MID);
        }
        if (mood === "shock") { g.rect(x + 2, y + 8 + b, 2, 2, MID); g.rect(x + 7, y + 8 + b, 2, 2, MID); }
        if (o.clap && Math.floor(t * 4 + i) % 2) { g.rect(x + 2, y + 6 + b, 2, 2, MID); }
        if (row === 0 && i % 3 === 1) {
          /* a fan */
          var fx = x + (i % 2 ? -3 : 9), fy = y - 2 + b;
          g.line(fx, fy + 4, fx + 3, fy, MID);
          g.line(fx + 3, fy, fx + 6, fy + 4, MID);
          g.line(fx, fy + 4, fx + 6, fy + 4, MID);
        }
      }
    }
  }

  /* ---------------- venues ---------------- */

  function hall(g, t, o) {
    o = o || {};
    g.clear(PAPER);
    /* back wall and its windows */
    g.rect(0, 14, 160, 80, DARK);
    for (var i = 0; i < 4; i++) archWindow(g, 20 + i * 32, 22, 20, 32, false);
    /* painted screens between the windows */
    paintedScreen(g, 9, 56, 18, 24, "mountain");
    paintedScreen(g, 133, 56, 18, 24, "bamboo");
    /* upper beams */
    g.rect(0, 12, 160, 4, INK);
    g.rect(0, 12, 160, 1, MID);
    for (i = 0; i < 6; i++) g.rect(12 + i * 28, 14, 3, 4, MID);
    /* pillars and drapes frame the stage */
    pillar(g, 14, 16, 76, true);
    pillar(g, 138, 16, 76, true);
    drape(g, 0, 16, 12, 78);
    drape(g, 148, 16, 12, 78);
    /* royal box */
    g.rect(52, 16, 56, 20, PAPER);
    g.frame(52, 16, 56, 20, INK);
    g.rect(54, 18, 3, 16, DARK);
    g.rect(103, 18, 3, 16, DARK);
    g.rect(58, 18, 44, 2, MID);
    king(g, 80, 25, o.kingEye || 0, o.look || 0, o.kingMood);
    /* chandelier */
    g.line(80, 14, 80, 18, INK);
    g.rect(72, 18, 17, 2, INK);
    for (i = 0; i < 4; i++) {
      g.rect(74 + i * 4, 20, 1, 4, MID);
      g.rect(73 + i * 4, 22, 3, 1, PAPER);
      if (o.lit !== false && Math.floor(t * 6 + i) % 3 === 0) g.rect(73 + i * 4, 21, 1, 1, INK);
    }
    /* banners */
    hangingBanner(g, 36, 0, 12, 20, "齐", t);
    hangingBanner(g, 112, 0, 12, 20, "乐", t);
    /* stage floor */
    g.rect(0, 94, 160, 26, INK);
    g.rect(0, 94, 160, 2, MID);
    for (i = 0; i < 8; i++) g.rect(i * 20, 96, 1, 24, DARK);
    g.rect(0, 118, 160, 2, MID);
    /* lanterns along the front */
    lantern(g, 8, 100, t);
    lantern(g, 152, 100, t + 1);
    if (o.spot) spotlight(g, 36, 88, t, o.spotTone);
    audience(g, t, { mood: o.mood, clap: o.clap, y: 120 });
    if (o.petals) petals(g, t, 10, MID);
  }

  function garden(g, t, o) {
    o = o || {};
    g.clear(PAPER);
    /* sky, distant hills, wall */
    g.dither(0, 14, 160, 34, MID, 1);
    g.rect(0, 14, 160, 1, MID);
    for (var i = 0; i < 160; i++) {
      var h = Math.round(7 + Math.sin(i * 0.06) * 4 + Math.sin(i * 0.17) * 2);
      g.rect(i, 48 - h, 1, h, MID);
    }
    g.rect(0, 48, 160, 30, DARK);
    for (i = 0; i < 160; i += 12) g.rect(i, 48, 6, 2, MID);
    for (i = 0; i < 4; i++) archWindow(g, 24 + i * 30, 54, 16, 20, false);
    /* willow */
    g.rect(10, 40, 5, 54, INK);
    g.circle(12, 40, 9, DARK, true);
    for (i = 0; i < 7; i++) {
      var wx = 5 + i * 3, wy = 43 + (i % 3) * 2;
      g.line(wx, wy, wx - 3 + Math.sin(t * 1.3 + i) * 2, wy + 22, MID);
    }
    /* pavilion */
    g.rect(108, 34, 42, 4, INK);
    g.rect(112, 38, 3, 24, DARK); g.rect(143, 38, 3, 24, DARK);
    g.rect(106, 62, 48, 3, INK);
    g.rect(116, 40, 26, 13, PAPER); g.frame(116, 40, 26, 13, INK);
    king(g, 129, 47, o.kingEye || 0, o.look || 0, o.kingMood);
    /* flower bed and stage */
    for (i = 0; i < 18; i++) {
      var fx = 4 + (i * 37) % 152, fy = 84 + (i * 13) % 8;
      g.rect(fx, fy, 1, 4, INK);
      g.circle(fx, fy, 1, i % 2 ? PAPER : MID, true);
    }
    g.rect(0, 94, 160, 26, INK);
    g.rect(0, 94, 160, 2, MID);
    for (i = 0; i < 8; i++) g.rect(i * 20, 96, 1, 24, DARK);
    lantern(g, 8, 92, t);
    lantern(g, 152, 92, t + 1);
    audience(g, t, { mood: o.mood || "happy", clap: o.clap, y: 120 });
    petals(g, t, 14, PAPER);
  }

  function throne(g, t, o) {
    o = o || {};
    g.clear(INK);
    g.rect(0, 0, 160, 96, INK);
    /* cold light from tall windows */
    for (var i = 0; i < 3; i++) {
      var wx = 16 + i * 54;
      archWindow(g, wx, 12, 18, 46, true);
      g.dither(wx + 2, 58, 14, 28, MID, 1);
    }
    /* columns */
    pillar(g, 6, 10, 84, false);
    pillar(g, 138, 10, 84, false);
    for (i = 0; i < 4; i++) g.rect(44 + i * 22, 12, 2, 46, DARK);
    /* dais */
    g.rect(34, 68, 92, 6, DARK);
    g.rect(40, 62, 80, 6, MID);
    g.rect(46, 56, 68, 6, DARK);
    g.frame(34, 68, 92, 6, INK);
    /* throne back */
    g.rect(62, 26, 36, 32, DARK);
    g.frame(62, 26, 36, 32, MID);
    g.rect(66, 22, 28, 6, INK);
    g.rect(78, 18, 4, 6, MID);
    king(g, 80, 42, o.kingEye || 2, o.look || 0, o.kingMood || "angry", true);
    guard(g, 26, 66, 1);
    guard(g, 120, 66, -1);
    /* brazier */
    for (i = 0; i < 2; i++) {
      var bx = 48 + i * 64;
      g.rect(bx, 78, 8, 3, MID);
      g.rect(bx + 1, 81, 2, 8, DARK);
      g.rect(bx + 5, 81, 2, 8, DARK);
      var fh = 2 + Math.round(Math.abs(Math.sin(t * 5 + i * 2)) * 3);
      g.rect(bx + 2, 78 - fh, 4, fh, PAPER);
      g.rect(bx + 3, 76 - fh, 2, 2, MID);
    }
    /* stage and empty seats where the orchestra used to be */
    g.rect(0, 94, 160, 26, INK);
    g.rect(0, 94, 160, 1, MID);
    for (i = 0; i < 10; i++) {
      var sx = 2 + i * 16, sy = 100 + (i % 2) * 8;
      g.rect(sx + 1, sy, 10, 2, DARK);
      g.rect(sx + 2, sy + 2, 1, 5, MID);
      g.rect(sx + 9, sy + 2, 1, 5, MID);
    }
    g.rect(0, 118, 160, 26, INK);
    for (i = 0; i < 5; i++) {
      var nx = 6 + i * 32;
      g.circle(nx, 130, 3, DARK, true);
      g.rect(nx - 3, 133, 7, 8, DARK);
      if (o.mood === "shock") { g.rect(nx - 1, 129, 1, 1, PAPER); g.rect(nx + 2, 129, 1, 1, PAPER); }
    }
    if (o.spot) spotlight(g, 40, 88, t, MID);
  }

  function moon(g, t, o) {
    o = o || {};
    g.clear(INK);
    g.rect(0, 0, 160, 92, INK);
    /* stars */
    for (var i = 0; i < 22; i++) {
      var sx = (i * 47 + 11) % 160, sy = 4 + (i * 23) % 42;
      if (Math.floor(t * 2 + i) % 5) g.pixel(sx, sy, i % 3 ? MID : PAPER);
    }
    /* moon and its reflection */
    g.circle(122, 24, 13, PAPER, true);
    g.circle(118, 21, 3, MID, true);
    g.circle(127, 29, 2, MID, true);
    g.rect(0, 62, 160, 1, MID);
    for (i = 0; i < 22; i++) {
      var ry = 64 + (i * 7) % 24;
      g.rect(108 + Math.round(Math.sin(t * 0.8 + i) * 3) + (i % 5) * 2, ry, 7 + (i % 4) * 2, 1, i % 2 ? MID : DARK);
    }
    /* lake bank and swans */
    g.rect(0, 86, 160, 8, DARK);
    for (i = 0; i < 2; i++) {
      var bx = 26 + i * 18 + Math.round(Math.sin(t * 0.5 + i) * 2);
      g.circle(bx, 82, 3, PAPER, true);
      g.circle(bx + 3, 80, 1, PAPER, true);
      g.rect(bx + 4, 80, 2, 1, MID);
      g.line(bx - 1, 85, bx - 5, 84, MID);
    }
    /* a small moonlit stage */
    g.rect(0, 94, 160, 26, INK);
    g.rect(0, 94, 160, 1, MID);
    g.rect(20, 96, 120, 1, DARK);
    lantern(g, 10, 92, t);
    lantern(g, 150, 92, t + 1);
    audience(g, t, { mood: o.mood || "calm", clap: o.clap, y: 120 });
    if (o.petals) petals(g, t, 8, MID);
  }

  function night(g, t, o) {
    o = o || {};
    g.clear(INK);
    /* graded sky: dither bands, then the wall */
    g.dither(0, 0, 160, 30, DARK, 1);
    g.dither(0, 30, 160, 18, DARK, 2);
    for (var i = 0; i < 18; i++) g.pixel((i * 53 + 7) % 160, 3 + (i * 19) % 38, i % 2 ? PAPER : MID);
    g.circle(28, 22, 9, PAPER, true);
    g.circle(25, 20, 2, MID, true);
    /* palace wall */
    g.rect(0, 48, 160, 46, DARK);
    for (i = 0; i < 4; i++) archWindow(g, 18 + i * 34, 54, 14, 22, true);
    g.rect(0, 46, 160, 3, INK);
    for (i = 0; i < 160; i += 8) g.rect(i, 44, 5, 3, INK);
    /* willow at the wall */
    g.rect(130, 38, 4, 46, INK);
    g.circle(132, 38, 7, DARK, true);
    for (i = 0; i < 6; i++) g.line(128 + i * 2, 42, 124 + i * 2 + Math.sin(t + i) * 2, 70, MID);
    /* stone path and river */
    g.rect(0, 94, 160, 18, INK);
    for (i = 0; i < 6; i++) g.rect(18 + i * 24, 96 + (i % 2) * 3, 12, 2, DARK);
    g.rect(0, 112, 160, 8, DARK);
    for (i = 0; i < 12; i++) g.rect((i * 17 + Math.round(t * 8)) % 160, 113 + (i % 3) * 2, 5, 1, MID);
    g.rect(0, 120, 160, 24, INK);
    /* a wall lantern and a guard far off */
    lantern(g, 12, 48, t);
    guard(g, 148, 70, -1);
    if (o.snow) snow(g, t, 18);
    if (o.petals) petals(g, t, 6, MID);
  }

  function dawn(g, t, o) {
    o = o || {};
    g.clear(PAPER);
    /* a pale sky made of dither: paper, mid, dark */
    g.dither(0, 0, 160, 22, MID, 1);
    g.dither(0, 22, 160, 16, DARK, 1);
    g.rect(0, 38, 160, 1, MID);
    /* sun */
    g.circle(124, 40, 10, PAPER, true);
    g.circle(124, 40, 7, MID, true);
    g.circle(124, 40, 5, PAPER, true);
    /* palace roof line in silhouette */
    g.rect(0, 52, 160, 42, DARK);
    g.rect(0, 48, 160, 4, INK);
    for (var i = 0; i < 8; i++) g.rect(6 + i * 20, 44, 10, 4, INK);
    for (i = 0; i < 4; i++) archWindow(g, 18 + i * 36, 58, 14, 20, false);
    /* birds */
    for (i = 0; i < 5; i++) {
      var bx = (i * 31 + Math.round(t * 4)) % 160, by = 12 + (i * 7) % 20;
      g.line(bx, by, bx + 2, by - 1, INK);
      g.line(bx + 2, by - 1, bx + 4, by, INK);
    }
    /* river with the sun on it */
    g.rect(0, 94, 160, 20, DARK);
    for (i = 0; i < 18; i++) {
      var rx = (i * 23 + Math.round(t * 6)) % 160;
      g.rect(rx, 98 + (i % 4) * 3, 7, 1, i % 3 ? MID : PAPER);
    }
    g.rect(0, 114, 160, 30, PAPER);
    for (i = 0; i < 10; i++) {
      g.rect(3 + i * 16, 122, 1, 12, DARK);
      g.circle(3 + i * 16, 121, 2, MID, true);
    }
    if (o.spot) spotlight(g, 40, 86, t, PAPER);
    if (o.petals) petals(g, t, 10, PAPER);
  }

  function venue(g, name, t, o) {
    if (name === "garden") garden(g, t, o);
    else if (name === "throne") throne(g, t, o);
    else if (name === "moon") moon(g, t, o);
    else if (name === "night") night(g, t, o);
    else if (name === "dawn") dawn(g, t, o);
    else hall(g, t, o);
  }

  /* ---------------- people ---------------- */

  function king(g, cx, cy, open, look, mood, big) {
    var s = big ? 1 : 0;
    /* robe and shoulders */
    g.rect(cx - 9 - s * 2, cy + 5, 18 + s * 4, 9 + s * 2, INK);
    g.rect(cx - 7 - s * 2, cy + 7, 4, 6, DARK);
    g.rect(cx + 4 + s * 2, cy + 7, 3, 6, DARK);
    /* head */
    g.rect(cx - 5, cy - 4 - s, 10 + s * 2, 9 + s * 2, PAPER);
    g.frame(cx - 5, cy - 4 - s, 10 + s * 2, 9 + s * 2, INK);
    /* crown */
    g.rect(cx - 7, cy - 8 - s, 14 + s * 2, 3, INK);
    g.rect(cx - 5, cy - 11 - s, 2, 4, INK);
    g.rect(cx - 1, cy - 12 - s, 2, 5, INK);
    g.rect(cx + 3, cy - 11 - s, 2, 4, INK);
    g.rect(cx - 1, cy - 10 - s, 1, 1, PAPER);
    /* beard or jowls */
    if (mood === "angry") {
      g.rect(cx - 4, cy + 3, 8, 2, INK);
      g.rect(cx - 2, cy + 5, 4, 2, INK);
      g.rect(cx - 4, cy - 2, 3, 1, INK); g.rect(cx + 1, cy - 2, 3, 1, INK);
    } else {
      g.rect(cx - 4, cy + 3, 8, 1, MID);
      g.rect(cx - 6, cy + 1, 1, 3, INK); g.rect(cx + 5, cy + 1, 1, 3, INK);
      g.rect(cx - 3, cy - 2, 2, 1, INK); g.rect(cx + 1, cy - 2, 2, 1, INK);
    }
    /* eyes: open 0 shut, 1 slit, 2 wide */
    if (open) {
      var h = open === 1 ? 1 : 2;
      g.rect(cx - 4, cy - 1, 3, h, INK);
      g.rect(cx + 1, cy - 1, 3, h, INK);
      if (open === 2) { g.pixel(cx - 3 + (look || 0), cy - 1, PAPER); g.pixel(cx + 2 + (look || 0), cy - 1, PAPER); }
    } else {
      g.rect(cx - 4, cy, 3, 1, MID);
      g.rect(cx + 1, cy, 3, 1, MID);
    }
  }

  function portrait(g, who, mood, x, y) {
    mood = mood || "calm";
    /* shoulders and robe */
    g.rect(x + 4, y + 40, 40, 18, who === "narr" ? DARK : INK);
    g.rect(x + 8, y + 43, 32, 15, who === "xuan" ? MID : who === "min" ? DARK : who === "aqin" ? MID : DARK);
    g.frame(x + 4, y + 40, 40, 18, INK);
    /* neck */
    g.rect(x + 19, y + 33, 10, 8, PAPER);
    g.rect(x + 19, y + 39, 10, 2, DARK);
    /* head */
    g.rect(x + 12, y + 10, 24, 25, PAPER);
    g.frame(x + 12, y + 10, 24, 25, INK);
    g.rect(x + 13, y + 11, 2, 6, MID);
    g.rect(x + 33, y + 11, 2, 6, MID);
    /* ears */
    g.rect(x + 10, y + 20, 3, 6, PAPER); g.frame(x + 10, y + 20, 3, 6, INK);
    g.rect(x + 35, y + 20, 3, 6, PAPER); g.frame(x + 35, y + 20, 3, 6, INK);
    /* hair / hats */
    if (who === "xuan") {
      g.rect(x + 8, y + 6, 32, 5, INK);
      g.rect(x + 10, y + 2, 4, 4, INK); g.rect(x + 20, y, 6, 6, INK); g.rect(x + 32, y + 2, 4, 4, INK);
      g.rect(x + 21, y + 1, 2, 2, PAPER);
      g.rect(x + 8, y + 11, 3, 10, DARK);
      g.rect(x + 37, y + 11, 3, 10, DARK);
    } else if (who === "min") {
      g.rect(x + 9, y + 5, 30, 4, INK);
      g.rect(x + 13, y - 4, 4, 9, INK); g.rect(x + 22, y - 7, 4, 12, INK); g.rect(x + 31, y - 4, 4, 9, INK);
      g.rect(x + 22, y - 6, 2, 2, PAPER);
      g.rect(x + 10, y + 12, 3, 14, DARK);
      g.rect(x + 35, y + 12, 3, 14, DARK);
    } else if (who === "yuezheng") {
      g.rect(x + 8, y + 5, 32, 4, INK);
      g.rect(x + 6, y + 2, 8, 4, INK); g.rect(x + 34, y + 2, 8, 4, INK);
      g.rect(x + 14, y + 8, 20, 2, DARK);
    } else if (who === "aqin") {
      g.rect(x + 9, y + 5, 30, 5, INK);
      g.rect(x + 10, y - 2, 10, 8, INK);
      g.rect(x + 11, y - 3, 8, 2, MID);
      g.rect(x + 34, y + 8, 3, 13, INK);
      g.rect(x + 36, y + 12, 2, 2, MID);
    } else if (who === "guard") {
      g.rect(x + 8, y + 3, 32, 5, INK);
      g.rect(x + 10, y - 4, 28, 8, INK);
      g.rect(x + 22, y - 8, 4, 5, MID);
      g.rect(x + 8, y + 8, 2, 14, DARK);
    } else if (who === "nanguo") {
      g.rect(x + 9, y + 4, 30, 5, INK);
      g.rect(x + 11, y + 1, 26, 3, INK);
      g.rect(x + 13, y + 8, 22, 1, DARK);
      /* sheng pipes over the shoulder */
      for (var i = 0; i < 4; i++) g.rect(x + 38 + i, y + 16 + i * 2, 2, 10, i % 2 ? MID : INK);
    } else {
      g.rect(x + 9, y + 5, 30, 4, DARK);
      g.rect(x + 10, y + 9, 3, 12, INK);
      g.rect(x + 35, y + 9, 3, 12, INK);
    }
    /* brows and eyes */
    var ey = y + 20;
    if (mood === "angry") {
      g.rect(x + 17, ey - 3, 6, 1, INK); g.rect(x + 25, ey - 3, 6, 1, INK);
      g.rect(x + 17, ey, 6, 2, INK); g.rect(x + 25, ey, 6, 2, INK);
    } else if (mood === "sad" || mood === "worried") {
      g.rect(x + 17, ey - 2, 6, 1, INK); g.rect(x + 25, ey - 2, 6, 1, INK);
      g.rect(x + 18, ey + 1, 4, 1, INK); g.rect(x + 26, ey + 1, 4, 1, INK);
    } else if (mood === "sly") {
      g.rect(x + 17, ey - 1, 6, 1, INK); g.rect(x + 25, ey - 1, 6, 1, INK);
      g.rect(x + 18, ey + 1, 4, 1, INK); g.rect(x + 26, ey + 1, 4, 1, INK);
      g.rect(x + 32, ey, 2, 1, INK);
    } else if (mood === "happy") {
      g.rect(x + 17, ey, 6, 1, INK); g.rect(x + 25, ey, 6, 1, INK);
      g.rect(x + 18, ey + 1, 1, 1, INK); g.rect(x + 22, ey + 1, 1, 1, INK);
      g.rect(x + 26, ey + 1, 1, 1, INK); g.rect(x + 30, ey + 1, 1, 1, INK);
    } else {
      g.rect(x + 17, ey, 6, 2, INK); g.rect(x + 25, ey, 6, 2, INK);
      g.pixel(x + 19, ey, PAPER); g.pixel(x + 27, ey, PAPER);
    }
    /* nose and mouth */
    g.rect(x + 23, y + 24, 2, 4, MID);
    if (mood === "happy") g.rect(x + 20, y + 30, 8, 2, INK);
    else if (mood === "angry") { g.rect(x + 20, y + 31, 8, 1, INK); g.rect(x + 21, y + 32, 6, 1, DARK); }
    else if (mood === "sad" || mood === "worried") { g.rect(x + 21, y + 31, 6, 1, INK); g.rect(x + 20, y + 32, 2, 1, INK); g.rect(x + 26, y + 32, 2, 1, INK); }
    else g.rect(x + 21, y + 31, 6, 1, INK);
    /* beards */
    if (who === "yuezheng") {
      g.rect(x + 17, y + 33, 14, 3, PAPER);
      g.rect(x + 19, y + 36, 10, 5, PAPER);
      g.rect(x + 21, y + 36, 6, 4, MID);
      g.rect(x + 18, y + 33, 1, 2, INK);
    } else if (who === "xuan") {
      g.rect(x + 18, y + 32, 12, 2, PAPER);
      g.rect(x + 20, y + 34, 8, 3, PAPER);
    } else if (who === "min") {
      g.rect(x + 22, y + 33, 4, 3, INK);
    }
    /* mood mark */
    if (mood === "worried") { g.rect(x + 37, y + 14, 2, 3, PAPER); g.rect(x + 37, y + 18, 2, 1, PAPER); }
    if (mood === "angry") g.rect(x + 36, y + 12, 3, 1, MID);
  }

  /* ---------------- props and effects ---------------- */

  function scroll(g, o) {
    o = o || {};
    g.rect(3, 34, 154, 60, PAPER);
    g.frame(3, 34, 154, 60, INK);
    g.rect(0, 36, 4, 56, MID); g.rect(156, 36, 4, 56, MID);
    g.frame(6, 37, 148, 54, MID);
    g.rect(10, 40, 140, 1, DARK);
    for (var i = 0; i < 5; i++) g.rect(10, 48 + i * 8, 138, 1, o.eye ? MID : DARK);
    g.rect(0, 35, 4, 2, INK); g.rect(0, 93, 4, 2, INK);
    g.rect(156, 35, 4, 2, INK); g.rect(156, 93, 4, 2, INK);
    g.line(8, 48, 8, 80, DARK);
    g.circle(8, 64, 2, DARK, false);
    /* end flourishes: a tiny seal and a rule */
    g.rect(142, 40, 8, 8, INK);
    g.rect(144, 42, 4, 4, PAPER);
    if (o.act === 2) {
      g.rect(12, 38, 2, 50, DARK);
      g.rect(146, 38, 2, 50, DARK);
    } else if (o.act === 3) {
      g.rect(12, 38, 1, 50, DARK);
      g.circle(148, 42, 2, DARK, true);
    }
  }

  function petals(g, t, n, tone) {
    for (var i = 0; i < n; i++) {
      var x = (i * 37 + t * (5 + i % 3)) % 166 - 3;
      var y = (i * 23 + t * (7 + i % 4)) % 150 - 4;
      g.rect(Math.round(x), Math.round(y), 1, 2, tone == null ? MID : tone);
      if (i % 4 === 0) g.pixel(Math.round(x) + 1, Math.round(y), PAPER);
    }
  }

  function snow(g, t, n) {
    for (var i = 0; i < n; i++) {
      var x = (i * 41 + Math.sin(t * 0.7 + i) * 9 + t * 3) % 166 - 3;
      var y = (i * 29 + t * (5 + i % 3)) % 150 - 4;
      g.pixel(Math.round(x), Math.round(y), i % 3 ? PAPER : MID);
    }
  }

  function confetti(g, t, n) {
    for (var i = 0; i < n; i++) {
      var x = (i * 53 + Math.sin(t * 2 + i) * 6 + t * 7) % 164 - 2;
      var y = (i * 31 + t * (10 + i % 5)) % 150 - 4;
      g.rect(Math.round(x), Math.round(y), 2, 2, i % 3 === 0 ? INK : i % 3 === 1 ? MID : PAPER);
    }
  }

  function spotlight(g, x, w, t, tone) {
    tone = tone == null ? PAPER : tone;
    var sway = Math.round(Math.sin(t * 0.8) * 6);
    for (var y = 16; y < 96; y += 2) {
      var half = Math.round(w / 2 + (y - 16) * 0.45);
      g.dither(x + sway - half, y, half * 2, 2, tone, 1);
    }
  }

  function inkSplash(g, x, y, r, tone) {
    for (var i = 0; i < 10; i++) {
      var a = i * 0.7, rr = r * (0.4 + (i % 3) * 0.25);
      g.rect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), 1 + i % 2, 1 + i % 2, tone == null ? INK : tone);
    }
  }

  return {
    INK: INK, DARK: DARK, MID: MID, PAPER: PAPER,
    drape: drape, lantern: lantern, pillar: pillar, paintedScreen: paintedScreen, hangingBanner: hangingBanner,
    archWindow: archWindow, crowdHead: crowdHead, guard: guard, musician: musician,
    player: player, conductor: conductor, audience: audience, king: king, portrait: portrait,
    venue: venue, hall: hall, garden: garden, throne: throne, moon: moon, night: night, dawn: dawn,
    scroll: scroll, petals: petals, snow: snow, confetti: confetti, spotlight: spotlight, inkSplash: inkSplash
  };
})();
