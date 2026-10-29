/* 矿工老张: the four-tone picture. The game world is 160x144, but the picture is
   painted into a 320x288 indexed buffer: items and effects get twice the detail,
   and every visible pixel is still one of the four palette colours. */
var GM = (typeof GM !== "undefined" && GM) || {};

GM.INK = 0;
GM.DARK = 1;
GM.MID = 2;
GM.PAPER = 3;
GM.CLEAR = 255;
GM.RGB = [[31, 42, 20], [74, 90, 50], [125, 138, 88], [163, 173, 126]];
GM.RGB32 = GM.RGB.map(function (c) { return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; });

/* ---- the 320x288 framebuffer ---- */

GM.bput = function (buf, x, y, c) {
  x = x | 0; y = y | 0;
  if (x >= 0 && x < GM.BW && y >= 0 && y < GM.BH) buf[y * GM.BW + x] = c;
};

GM.brect = function (buf, x, y, w, h, c) {
  x = x | 0; y = y | 0; w = w | 0; h = h | 0;
  var x0 = Math.max(0, x), x1 = Math.min(GM.BW, x + w);
  var y0 = Math.max(0, y), y1 = Math.min(GM.BH, y + h);
  for (var yy = y0; yy < y1; yy++) {
    var row = yy * GM.BW;
    for (var xx = x0; xx < x1; xx++) buf[row + xx] = c;
  }
};

GM.bline = function (buf, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  for (;;) {
    GM.bput(buf, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};

GM.blineWide = function (buf, x0, y0, x1, y1, c, thick) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  thick = thick || 1;
  var off = thick >> 1;
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  for (;;) {
    GM.brect(buf, x0 - off, y0 - off, thick, thick, c);
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};

GM.bellipse = function (buf, cx, cy, rx, ry, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (var dy = -ry; dy <= ry; dy++) {
    var w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
    GM.brect(buf, cx - w, cy + dy, w * 2 + 1, 1, c);
  }
};

/* world-space helpers: the game still thinks in 160x144 */
GM.put = function (buf, x, y, c) {
  GM.brect(buf, Math.round(x) * GM.SCALE, Math.round(y) * GM.SCALE, GM.SCALE, GM.SCALE, c);
};
GM.rect = function (buf, x, y, w, h, c) {
  GM.brect(buf, Math.round(x) * GM.SCALE, Math.round(y) * GM.SCALE, Math.round(w) * GM.SCALE, Math.round(h) * GM.SCALE, c);
};
GM.line = function (buf, x0, y0, x1, y1, c) {
  GM.blineWide(buf, x0 * GM.SCALE, y0 * GM.SCALE, x1 * GM.SCALE, y1 * GM.SCALE, c, GM.SCALE);
};
GM.ellipse = function (buf, cx, cy, rx, ry, c) {
  GM.bellipse(buf, cx * GM.SCALE, cy * GM.SCALE, rx * GM.SCALE, ry * GM.SCALE, c);
};

/* ---- sprites: these live in their own little buffers at 2x ---- */

GM.sprite = function (w, h) {
  var b = new Uint8Array(w * h);
  b.fill(GM.CLEAR);
  return { w: w, h: h, b: b };
};

GM.sput = function (s, x, y, c) {
  x = x | 0; y = y | 0;
  if (x >= 0 && x < s.w && y >= 0 && y < s.h) s.b[y * s.w + x] = c;
};

GM.srect = function (s, x, y, w, h, c) {
  for (var yy = y; yy < y + h; yy++) for (var xx = x; xx < x + w; xx++) GM.sput(s, xx, yy, c);
};

GM.sline = function (s, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  for (;;) {
    GM.sput(s, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};

GM.sellipse = function (s, cx, cy, rx, ry, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (var dy = -ry; dy <= ry; dy++) {
    var w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
    GM.srect(s, cx - w, cy + dy, w * 2 + 1, 1, c);
  }
};

/* a one-pixel ink edge around everything already drawn in a sprite */
GM.soutline = function (s, ink) {
  var copy = s.b.slice();
  for (var y = 0; y < s.h; y++) {
    for (var x = 0; x < s.w; x++) {
      if (copy[y * s.w + x] === GM.CLEAR) continue;
      if (x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1 ||
          copy[y * s.w + x - 1] === GM.CLEAR || copy[y * s.w + x + 1] === GM.CLEAR ||
          copy[(y - 1) * s.w + x] === GM.CLEAR || copy[(y + 1) * s.w + x] === GM.CLEAR) {
        s.b[y * s.w + x] = ink;
      }
    }
  }
};

GM.pointIn = function (poly, x, y) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
};

GM.blob = function (w, h, seed, base, shadow, highlight, speck) {
  var s = GM.sprite(w, h);
  var rng = GM.rng(seed);
  var cx = w / 2, cy = h / 2, rx = w / 2 - 1.5, ry = h / 2 - 1.5;
  var n = 12 + Math.floor(rng() * 4), poly = [], i;
  for (i = 0; i < n; i++) {
    var a = i / n * Math.PI * 2;
    var k = 0.82 + rng() * 0.16;
    poly.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (!GM.pointIn(poly, x + 0.5, y + 0.5)) continue;
      s.b[y * w + x] = base;
      if (x * 0.5 + y * 0.9 > (w * 0.5 + h * 0.9) * 0.68) s.b[y * w + x] = shadow;
    }
  }
  GM.soutline(s, GM.INK);
  if (highlight) {
    for (i = 0; i < 4; i++) {
      var hx = Math.round(cx - rx * 0.45 + rng() * rx * 0.35);
      var hy = Math.round(cy - ry * 0.45 + rng() * ry * 0.2);
      if (s.b[hy * w + hx] !== GM.CLEAR) s.b[hy * w + hx] = GM.PAPER;
    }
  }
  if (speck) {
    /* a rock gets a crack, not a row of dots */
    GM.sline(s, Math.round(cx - rx * 0.35), Math.round(cy - ry * 0.1), Math.round(cx + rx * 0.2), Math.round(cy + ry * 0.45), GM.INK);
    GM.sline(s, Math.round(cx - rx * 0.35), Math.round(cy - ry * 0.1), Math.round(cx - rx * 0.65), Math.round(cy - ry * 0.35), GM.INK);
  }
  return s;
};

GM.diamondSprite = function () {
  var s = GM.sprite(28, 28);
  var poly = [[14, 2], [26, 12], [14, 26], [2, 12]];
  for (var y = 0; y < 28; y++) for (var x = 0; x < 28; x++) if (GM.pointIn(poly, x + 0.5, y + 0.5)) GM.sput(s, x, y, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.sline(s, 4, 12, 24, 12, GM.MID);
  GM.sline(s, 14, 3, 6, 12, GM.MID);
  GM.sline(s, 14, 3, 22, 12, GM.MID);
  GM.sline(s, 6, 12, 14, 25, GM.MID);
  GM.sline(s, 22, 12, 14, 25, GM.MID);
  return s;
};

GM.bagSprite = function () {
  var s = GM.sprite(32, 32);
  GM.sellipse(s, 16, 20, 12, 10, GM.PAPER);
  GM.srect(s, 12, 6, 8, 14, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.srect(s, 10, 13, 12, 4, GM.DARK);
  GM.sput(s, 10, 13, GM.INK); GM.sput(s, 21, 13, GM.INK);
  GM.stext(s, "$", 11, 17, GM.INK, 2);
  GM.srect(s, 20, 26, 4, 2, GM.MID);
  return s;
};

GM.boneSprite = function () {
  var s = GM.sprite(32, 20);
  GM.srect(s, 8, 8, 16, 4, GM.PAPER);
  GM.sellipse(s, 6, 6, 4, 4, GM.PAPER);
  GM.sellipse(s, 6, 14, 4, 4, GM.PAPER);
  GM.sellipse(s, 26, 6, 4, 4, GM.PAPER);
  GM.sellipse(s, 26, 14, 4, 4, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.sput(s, 6, 8, GM.MID); GM.sput(s, 26, 8, GM.MID);
  return s;
};

GM.skullSprite = function () {
  var s = GM.sprite(28, 28);
  GM.sellipse(s, 14, 12, 10, 10, GM.PAPER);
  GM.srect(s, 8, 19, 12, 6, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.srect(s, 7, 9, 4, 4, GM.INK);
  GM.srect(s, 17, 9, 4, 4, GM.INK);
  GM.srect(s, 12, 15, 4, 2, GM.INK);
  GM.srect(s, 9, 22, 2, 3, GM.INK);
  GM.srect(s, 13, 22, 2, 3, GM.INK);
  GM.srect(s, 17, 22, 2, 3, GM.INK);
  return s;
};

GM.tntSprite = function () {
  var s = GM.sprite(32, 32);
  var xs = [6, 14, 22], i;
  for (i = 0; i < xs.length; i++) GM.srect(s, xs[i], 10, 4, 18, GM.DARK);
  GM.soutline(s, GM.INK);
  GM.srect(s, 4, 18, 24, 2, GM.INK);
  GM.srect(s, 4, 20, 24, 4, GM.PAPER);
  GM.srect(s, 4, 24, 24, 2, GM.INK);
  GM.sline(s, 16, 10, 24, 4, GM.MID);
  GM.srect(s, 24, 2, 2, 2, GM.PAPER);
  return s;
};

GM.dynIconSprite = function () {
  var s = GM.sprite(16, 16);
  GM.srect(s, 6, 5, 4, 9, GM.DARK);
  GM.soutline(s, GM.INK);
  GM.srect(s, 5, 9, 6, 3, GM.PAPER);
  GM.srect(s, 5, 9, 6, 1, GM.INK);
  GM.srect(s, 5, 11, 6, 1, GM.INK);
  GM.sline(s, 8, 5, 12, 1, GM.MID);
  GM.sput(s, 12, 1, GM.PAPER);
  return s;
};

GM.bombSprite = function () {
  var s = GM.sprite(16, 16);
  GM.sellipse(s, 8, 9, 6, 6, GM.INK);
  GM.sellipse(s, 8, 9, 5, 5, GM.DARK);
  GM.srect(s, 5, 5, 2, 2, GM.PAPER);
  GM.sline(s, 8, 3, 11, 0, GM.MID);
  GM.sput(s, 11, 0, GM.PAPER);
  return s;
};

GM.shopStrengthSprite = function () {
  var s = GM.sprite(16, 16);
  GM.srect(s, 4, 6, 8, 8, GM.PAPER);
  GM.srect(s, 6, 2, 4, 5, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.srect(s, 6, 1, 4, 2, GM.DARK);
  GM.srect(s, 4, 12, 8, 2, GM.MID);
  GM.sline(s, 8, 6, 6, 9, GM.INK);
  GM.sline(s, 6, 9, 9, 9, GM.INK);
  GM.sline(s, 9, 9, 7, 12, GM.INK);
  return s;
};

GM.shopCloverSprite = function () {
  var s = GM.sprite(16, 16);
  GM.sellipse(s, 5, 6, 3, 3, GM.PAPER);
  GM.sellipse(s, 11, 6, 3, 3, GM.PAPER);
  GM.sellipse(s, 5, 11, 3, 3, GM.PAPER);
  GM.sellipse(s, 11, 11, 3, 3, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.sput(s, 8, 8, GM.INK);
  GM.srect(s, 7, 12, 2, 3, GM.DARK);
  return s;
};

GM.shopBookSprite = function () {
  var s = GM.sprite(16, 16);
  GM.srect(s, 3, 3, 10, 11, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.srect(s, 3, 3, 2, 11, GM.DARK);
  GM.srect(s, 6, 6, 6, 6, GM.MID);
  GM.sput(s, 7, 7, GM.INK);
  GM.sput(s, 10, 9, GM.INK);
  GM.sline(s, 7, 6, 10, 10, GM.INK);
  return s;
};

GM.miniGemSprite = function () {
  var s = GM.sprite(10, 10);
  var poly = [[5, 1], [9, 5], [5, 9], [1, 5]];
  for (var y = 0; y < 10; y++) for (var x = 0; x < 10; x++) if (GM.pointIn(poly, x + 0.5, y + 0.5)) GM.sput(s, x, y, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.sline(s, 2, 5, 8, 5, GM.MID);
  GM.sline(s, 5, 2, 5, 8, GM.MID);
  return s;
};

GM.ICON = [
  "................",
  ".....000000.....",
  "...0033333300...",
  "..033333333330..",
  "..033332233330..",
  "..033332233330..",
  "..033333333330..",
  ".00000000000000.",
  "0000000000000000",
  "...0333333330...",
  "...0303333030...",
  "...0333333330...",
  "...0331111330...",
  "....03333330....",
  ".....000000.....",
  "................"
];

GM.FONT3 = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "$": ["011", "110", "010", "011", "110"],
  "×": ["000", "101", "010", "101", "000"],
  "+": ["000", "010", "111", "010", "000"],
  "-": ["000", "000", "111", "000", "000"],
  " ": ["000", "000", "000", "000", "000"],
  "?": ["111", "001", "011", "000", "010"]
};

GM.stext = function (s, text, x, y, color, k) {
  k = k || 1;
  var F = GM.FONT3, i, j, c;
  for (i = 0; i < text.length; i++) {
    var glyph = F[text.charAt(i)] || F["?"];
    for (j = 0; j < glyph.length; j++) {
      var r = glyph[j];
      for (c = 0; c < 3; c++) {
        if (r.charAt(c) === "1") GM.srect(s, x + i * 4 * k + c * k, y + j * k, k, k, color);
      }
    }
  }
};

GM.textMain = function (buf, text, x, y, color, k) {
  k = k || 1;
  var F = GM.FONT3, i, j, c;
  for (i = 0; i < text.length; i++) {
    var glyph = F[text.charAt(i)] || F["?"];
    for (j = 0; j < glyph.length; j++) {
      var r = glyph[j];
      for (c = 0; c < 3; c++) {
        if (r.charAt(c) === "1") GM.brect(buf, x + i * 4 * k + c * k, y + j * k, k, k, color);
      }
    }
  }
};

GM.textWidth = function (text, k) {
  return text.length * 4 * k - k;
};

GM.initArt = function () {
  GM.SPR = {
    goldS: GM.blob(28, 24, 11, GM.PAPER, GM.MID, false, false),
    goldM: GM.blob(40, 32, 17, GM.PAPER, GM.MID, false, false),
    goldL: GM.blob(52, 40, 23, GM.PAPER, GM.MID, false, false),
    rockS: GM.blob(32, 28, 31, GM.MID, GM.DARK, true, true),
    rockL: GM.blob(52, 40, 37, GM.MID, GM.DARK, true, true),
    diamond: GM.diamondSprite(),
    bag: GM.bagSprite(),
    bone: GM.boneSprite(),
    skull: GM.skullSprite(),
    tnt: GM.tntSprite(),
    dynIcon: GM.dynIconSprite(),
    bomb: GM.bombSprite(),
    shopStrength: GM.shopStrengthSprite(),
    shopClover: GM.shopCloverSprite(),
    shopBook: GM.shopBookSprite(),
    miniGold: GM.blob(10, 8, 41, GM.PAPER, GM.MID, false, false),
    miniGem: GM.miniGemSprite()
  };
};

GM.spriteDraw = function (buf, s, x, y) {
  x = Math.round(x); y = Math.round(y);
  for (var sy = 0; sy < s.h; sy++) {
    for (var sx = 0; sx < s.w; sx++) {
      var c = s.b[sy * s.w + sx];
      if (c === GM.CLEAR) continue;
      GM.bput(buf, x + sx, y + sy, c);
    }
  }
};

GM.makeBackground = function (state) {
  var b = new Uint8Array(GM.BW * GM.BH);
  var x, y, i, rng, len;
  GM.rect(b, 0, 0, GM.W, GM.H, GM.DARK);
  GM.rect(b, 0, 0, GM.W, GM.GROUND, GM.PAPER);

  /* low hills at the edges, so the sky is not an empty band */
  for (x = 0; x < GM.W; x++) {
    var lh = x < 56 ? 3 + Math.round(2 * Math.sin(x / 7)) : 0;
    var rh = x > 104 ? 3 + Math.round(2 * Math.sin((160 - x) / 6)) : 0;
    var hh = Math.max(lh, rh);
    if (hh > 0) GM.rect(b, x, GM.GROUND - hh, 1, hh, GM.MID);
  }
  GM.rect(b, 0, GM.GROUND - 1, GM.W, 2, GM.INK);

  /* a small lantern on the left, the only light down here */
  GM.rect(b, 8, 12, 2, 10, GM.DARK);
  GM.rect(b, 5, 4, 8, 1, GM.INK);
  GM.rect(b, 4, 5, 10, 8, GM.INK);
  GM.rect(b, 5, 6, 8, 6, GM.PAPER);
  GM.rect(b, 7, 7, 4, 4, GM.MID);
  GM.rect(b, 8, 8, 2, 2, GM.PAPER);
  GM.rect(b, 5, 12, 8, 1, GM.INK);
  GM.rect(b, 6, 3, 6, 1, GM.DARK);

  /* a clean, slightly lighter seam just under the grass, then quiet soil */
  GM.rect(b, 0, GM.GROUND + 1, GM.W, 5, GM.MID);
  GM.rect(b, 0, GM.GROUND + 6, GM.W, 1, GM.DARK);
  rng = GM.rng((state.levelSeed || 1) ^ 0x9e3779b9);
  var top = (GM.GROUND + 2) * GM.SCALE;
  var bottom = GM.BH - 3;
  for (i = 0; i < 34; i++) {
    x = 4 + Math.floor(rng() * (GM.BW - 8));
    y = (GM.GROUND + 2) * GM.SCALE + Math.floor(rng() * 8);
    GM.bput(b, x, y, GM.DARK);
  }
  for (i = 0; i < 150; i++) {
    x = 4 + Math.floor(rng() * (GM.BW - 8));
    y = top + Math.floor(Math.pow(rng(), 1.6) * (bottom - top));
    GM.bput(b, x, y, rng() < 0.78 ? GM.MID : GM.DARK);
    if (rng() < 0.18) GM.brect(b, x, y, 2, 2, rng() < 0.5 ? GM.MID : GM.DARK);
  }
  for (i = 0; i < 18; i++) {
    x = 4 + Math.floor(rng() * (GM.BW - 44));
    y = top + 8 + Math.floor(rng() * (bottom - top - 14));
    len = 8 + Math.floor(rng() * 26);
    GM.bline(b, x, y, x + len, y + (rng() < 0.5 ? 0 : 2), rng() < 0.6 ? GM.DARK : GM.MID);
  }
  for (i = 0; i < 8; i++) {
    x = 6 + Math.floor(rng() * (GM.BW - 12));
    y = top + 10 + Math.floor(rng() * (bottom - top - 18));
    GM.brect(b, x, y, 3, 2, GM.MID);
    GM.bput(b, x, y, GM.DARK);
  }
  return b;
};

GM.drawItemAt = function (buf, it, bx, by, anim) {
  var spr = GM.SPR[it.sprite];
  if (!spr) return;
  var x = Math.round(bx - spr.w / 2);
  var y = Math.round(by - spr.h / 2);
  GM.spriteDraw(buf, spr, x, y);
  if (it.kind === "gem" && Math.sin(anim * 4 + it.x) > 0.86) {
    GM.brect(buf, x + spr.w - 5, y + 4, 2, 2, GM.PAPER);
    GM.bput(buf, x + spr.w - 6, y + 6, GM.MID);
  }
  if (it.kind === "tnt" && it.fuse > 0 && Math.sin(anim * 30) > 0) {
    GM.brect(buf, x + 23, y + 1, 3, 3, GM.PAPER);
    GM.bput(buf, x + 22, y + 3, GM.MID);
  }
};

GM.drawMole = function (buf, it, anim) {
  var d = it.dir, S = GM.SCALE;
  var x = Math.round(it.x * S), y = Math.round(it.y * S);
  var step = Math.sin(anim * 14 + it.x) > 0 ? 2 : 0;
  GM.bellipse(buf, x, y, 16, 10, GM.INK);
  GM.bellipse(buf, x, y, 14, 8, GM.MID);
  GM.bellipse(buf, x, y + 5, 10, 4, GM.DARK);
  GM.bellipse(buf, x + d * 10, y - 4, 8, 8, GM.INK);
  GM.bellipse(buf, x + d * 10, y - 4, 6, 6, GM.MID);
  GM.bellipse(buf, x + d * 4, y - 12, 4, 4, GM.INK);
  GM.bellipse(buf, x + d * 4, y - 12, 2, 2, GM.DARK);
  GM.brect(buf, x + d * 16, y - 4, 4, 4, GM.PAPER);
  GM.bput(buf, x + d * 18, y - 2, GM.INK);
  GM.brect(buf, x + d * 12, y - 6, 2, 2, GM.INK);
  GM.blineWide(buf, x - 6, y + 8, x - 8, y + 12 + step, GM.INK, 2);
  GM.blineWide(buf, x + 6, y + 8, x + 8, y + 12 + (2 - step), GM.INK, 2);
  GM.blineWide(buf, x - d * 14, y, x - d * 20, y - 4, GM.INK, 2);
  var mini = it.carry === "diamond" ? GM.SPR.miniGem : GM.SPR.miniGold;
  var mx = x + d * 12 - (d < 0 ? mini.w : 0);
  var my = y - 20;
  GM.spriteDraw(buf, mini, mx, my);
};

GM.drawRope = function (buf, hook) {
  var tip = GM.tip(hook);
  var a = hook.angle, dx = Math.sin(a), dy = Math.cos(a);
  GM.line(buf, GM.ANCHOR.x, GM.ANCHOR.y, tip.x - dx, tip.y - dy, GM.INK);
  for (var d = 7; d < hook.len - 3; d += 9) {
    GM.put(buf, GM.ANCHOR.x + dx * d, GM.ANCHOR.y + dy * d, GM.PAPER);
  }
};

GM.drawHook = function (buf, hook) {
  var tip = GM.tip(hook);
  var a = hook.angle, dx = Math.sin(a), dy = Math.cos(a);
  var px = Math.cos(a), py = -Math.sin(a);
  GM.line(buf, tip.x - dx * 3, tip.y - dy * 3, tip.x, tip.y, GM.INK);
  var closed = !!hook.item;
  for (var side = -1; side <= 1; side += 2) {
    var x1 = tip.x + dx * 1.5 + px * side * 1.8;
    var y1 = tip.y + dy * 1.5 + py * side * 1.8;
    var x2 = tip.x + dx * 4 + px * side * (closed ? 1.1 : 3.7);
    var y2 = tip.y + dy * 4 + py * side * (closed ? 1.1 : 3.7);
    GM.line(buf, tip.x, tip.y, x1, y1, GM.INK);
    GM.line(buf, x1, y1, x2, y2, GM.INK);
    GM.put(buf, x2, y2, GM.PAPER);
  }
  GM.rect(buf, tip.x - 1, tip.y - 1, 2, 2, GM.INK);
};

GM.sweatDrop = function (buf, bx, by) {
  GM.brect(buf, bx, by, 3, 4, GM.INK);
  GM.brect(buf, bx + 1, by, 1, 2, GM.PAPER);
  GM.bput(buf, bx + 1, by + 2, GM.MID);
};

GM.drawMiner = function (buf, state) {
  var hook = state.hook;
  var bob = hook.state === "swing" && Math.sin(state.anim * 4) > 0.35 ? -1 : 0;
  var lean = hook.state === "out" ? 1 : hook.state === "back" ? -1 : 0;
  var bx = 80 + lean;
  var by = bob;
  var ground = 22;

  /* boots and legs stay on the ground; the body bobs above them */
  GM.rect(buf, bx - 8, ground - 1, 5, 2, GM.INK);
  GM.rect(buf, bx + 3, ground - 1, 5, 2, GM.INK);
  GM.rect(buf, bx - 6, ground - 4, 3, 3, GM.DARK);
  GM.rect(buf, bx + 3, ground - 4, 3, 3, GM.DARK);

  /* body, shirt and overalls */
  GM.rect(buf, bx - 7, 12 + by, 14, 7, GM.INK);
  GM.rect(buf, bx - 6, 13 + by, 12, 5, GM.MID);
  GM.rect(buf, bx - 5, 14 + by, 10, 4, GM.DARK);
  GM.rect(buf, bx - 4, 13 + by, 1, 5, GM.PAPER);
  GM.rect(buf, bx + 3, 13 + by, 1, 5, GM.PAPER);

  /* head, eyes and a big moustache */
  GM.rect(buf, bx - 5, 6 + by, 10, 7, GM.INK);
  GM.rect(buf, bx - 4, 7 + by, 8, 5, GM.PAPER);
  GM.put(buf, bx - 2, 9 + by, GM.INK);
  GM.put(buf, bx + 2, 9 + by, GM.INK);
  GM.rect(buf, bx - 3, 11 + by, 6, 1, GM.DARK);
  GM.put(buf, bx - 4, 11 + by, GM.DARK);
  GM.put(buf, bx + 4, 11 + by, GM.DARK);

  /* a low safety cap: crown, broad brim and a front peak */
  GM.ellipse(buf, bx, 4 + by, 8, 3, GM.INK);
  GM.ellipse(buf, bx, 4 + by, 7, 2, GM.PAPER);
  GM.rect(buf, bx - 9, 6 + by, 18, 2, GM.INK);
  GM.rect(buf, bx - 8, 6 + by, 16, 1, GM.PAPER);
  GM.rect(buf, bx + 9, 7 + by, 3, 1, GM.INK);
  GM.rect(buf, bx + 9, 7 + by, 2, 1, GM.PAPER);
  GM.rect(buf, bx - 1, 2 + by, 3, 2, GM.MID);
  GM.put(buf, bx, 2 + by, GM.PAPER);

  /* two hands on the rope, with a small coil at the winch */
  GM.line(buf, bx - 7, 13 + by, 79, 17, GM.INK);
  GM.line(buf, bx + 7, 13 + by, 81, 17, GM.INK);
  GM.rect(buf, 78, 16, 2, 2, GM.PAPER);
  GM.rect(buf, 81, 16, 2, 2, GM.PAPER);
  GM.rect(buf, 79, 17, 2, 2, GM.DARK);
  GM.put(buf, 80, 18, GM.PAPER);

  /* sweat: drops run downward, faster as they fall */
  if (hook.item) {
    var t = state.anim, side, sx, sy, p;
    for (var i = 0; i < 4; i++) {
      side = i < 2 ? -1 : 1;
      p = (t * 0.8 + i * 0.23) % 1;
      sx = bx + side * (9 + (i % 2) * 2) + Math.sin(t * 5 + i) * 0.7;
      sy = 5 + by + p * p * 12;
      GM.sweatDrop(buf, Math.round(sx * GM.SCALE), Math.round(sy * GM.SCALE));
    }
    for (i = 0; i < 2; i++) {
      p = (t * 0.9 + i * 0.4) % 1;
      sx = bx - 3 + i * 7;
      sy = 9 + by + p * p * 8;
      GM.sweatDrop(buf, Math.round(sx * GM.SCALE), Math.round(sy * GM.SCALE));
    }
    for (i = 0; i < 2; i++) {
      p = (t * 0.7 + i * 0.35) % 1;
      side = i ? 1 : -1;
      sx = bx + side * 8;
      sy = 13 + by + p * p * 5;
      GM.sweatDrop(buf, Math.round(sx * GM.SCALE), Math.round(sy * GM.SCALE));
    }
  }

  if (state.bomb && state.bomb.t < 0.18) {
    var bp = GM.bombPos(state.bomb);
    GM.line(buf, bx + 7, 13 + by, bp.x, bp.y, GM.INK);
  }
};

GM.drawDynamite = function (buf, state) {
  if (state.dynamite <= 0) return;
  var bx = 94 * GM.SCALE, by = 3 * GM.SCALE;
  GM.spriteDraw(buf, GM.SPR.dynIcon, bx, by);
  GM.textMain(buf, "×" + state.dynamite, bx + 18, by + 4, GM.INK, GM.SCALE);
};

GM.draw = function (ctx, state) {
  if (!GM.SPR) GM.initArt();
  var key = state.levelSeed;
  if (!state.bg || state.bgKey !== key) {
    state.bg = GM.makeBackground(state);
    state.bgKey = key;
  }
  var buf = GM._buf || (GM._buf = new Uint8Array(GM.BW * GM.BH));
  buf.set(state.bg);
  var i, it, tip, p;
  for (i = 0; i < state.items.length; i++) {
    it = state.items[i];
    if (it.type !== "mole") GM.drawItemAt(buf, it, it.x * GM.SCALE, it.y * GM.SCALE, state.anim);
  }
  for (i = 0; i < state.items.length; i++) {
    it = state.items[i];
    if (it.type === "mole") GM.drawMole(buf, it, state.anim);
  }
  GM.drawRope(buf, state.hook);
  if (state.hook.item) {
    var held = GM.heldPos(state.hook);
    tip = GM.tip(state.hook);
    it = state.hook.item;
    if (it.type === "mole") {
      var ox = it.x, oy = it.y;
      it.x = held.x; it.y = held.y;
      GM.drawMole(buf, it, state.anim);
      it.x = ox; it.y = oy;
    } else {
      GM.drawItemAt(buf, it, held.x * GM.SCALE, held.y * GM.SCALE, state.anim);
    }
    GM.brect(buf, Math.round(tip.x * GM.SCALE) - 2, Math.round(tip.y * GM.SCALE) - 5, 4, 2, GM.PAPER);
  }
  GM.drawHook(buf, state.hook);
  GM.drawMiner(buf, state);
  GM.drawDynamite(buf, state);
  if (state.bomb) {
    var bp = GM.bombPos(state.bomb);
    GM.spriteDraw(buf, GM.SPR.bomb, Math.round(bp.x * GM.SCALE) - 8, Math.round(bp.y * GM.SCALE) - 8);
    GM.bput(buf, Math.round(bp.x * GM.SCALE) + 4, Math.round(bp.y * GM.SCALE) - 8, GM.PAPER);
  }

  for (i = 0; i < state.blasts.length; i++) {
    var bl = state.blasts[i], k = bl.t / bl.life;
    var rr = (4 + k * 27) * GM.SCALE;
    var bx = bl.x * GM.SCALE, by = bl.y * GM.SCALE;
    for (var a = 0; a < Math.PI * 2; a += 0.18) {
      GM.brect(buf, bx + Math.cos(a) * rr, by + Math.sin(a) * rr, 2, 2,
        (i + Math.floor(a * 5)) % 2 ? GM.PAPER : GM.MID);
    }
    GM.brect(buf, bx - 2, by - 2, 4, 4, GM.PAPER);
  }
  for (i = 0; i < state.particles.length; i++) {
    p = state.particles[i];
    GM.brect(buf, p.x * GM.SCALE, p.y * GM.SCALE, 2, 2,
      p.color === "paper" ? GM.PAPER : p.color === "dark" ? GM.DARK : GM.MID);
  }
  for (i = 0; i < state.floats.length; i++) {
    var f = state.floats[i];
    var tw = GM.textWidth(f.text, GM.SCALE);
    var tx = f.x * GM.SCALE - tw / 2;
    var ty = f.y * GM.SCALE - (f.t / f.life) * 9 * GM.SCALE;
    GM.textMain(buf, f.text, Math.round(tx), Math.round(ty), GM.INK, GM.SCALE);
  }

  var sx = 0, sy = 0;
  if (state.shake > 0) {
    sx = Math.round((Math.random() * 2 - 1) * 6);
    sy = Math.round((Math.random() * 2 - 1) * 4);
  }
  GM.present(ctx, buf, sx, sy);
};

GM.present = function (ctx, buf, sx, sy) {
  if (!GM._img) {
    GM._img = ctx.createImageData(GM.BW, GM.BH);
    GM._u32 = new Uint32Array(GM._img.data.buffer);
  }
  var u32 = GM._u32;
  for (var y = 0; y < GM.BH; y++) {
    for (var x = 0; x < GM.BW; x++) {
      var xx = x - (sx || 0), yy = y - (sy || 0), t;
      if (xx < 0 || xx >= GM.BW || yy < 0 || yy >= GM.BH) t = GM.PAPER;
      else {
        t = buf[yy * GM.BW + xx];
        if (t === GM.CLEAR) t = GM.PAPER;
      }
      u32[y * GM.BW + x] = GM.RGB32[t];
    }
  }
  ctx.putImageData(GM._img, 0, 0);
};

GM.spriteCanvas = function (spr) {
  var c = document.createElement("canvas");
  c.width = spr.w; c.height = spr.h;
  var ctx = c.getContext("2d");
  var img = ctx.createImageData(spr.w, spr.h);
  for (var i = 0; i < spr.b.length; i++) {
    var t = spr.b[i], o = i * 4;
    if (t === GM.CLEAR) { img.data[o + 3] = 0; continue; }
    var rgb = GM.RGB[t] || GM.RGB[GM.PAPER];
    img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

GM.iconCanvas = function () {
  if (GM._iconCv) return GM._iconCv;
  var b = new Uint8Array(16 * 16);
  b.fill(GM.PAPER);
  for (var y = 0; y < 16; y++) {
    for (var x = 0; x < 16; x++) {
      var ch = GM.ICON[y].charAt(x);
      if (ch !== ".") b[y * 16 + x] = +ch;
    }
  }
  var c = document.createElement("canvas");
  c.width = 16; c.height = 16;
  var ctx = c.getContext("2d");
  var img = ctx.createImageData(16, 16);
  for (var i = 0; i < 256; i++) {
    var t = b[i], rgb = GM.RGB[t] || GM.RGB[GM.PAPER], o = i * 4;
    img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  GM._iconCv = c;
  return c;
};

GM.initArt();
