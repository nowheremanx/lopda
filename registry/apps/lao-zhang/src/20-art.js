/* 矿工老张: the four-tone picture. Everything is painted into an indexed 160x144 buffer,
   so every visible pixel is one of the four palette colours; no antialiasing, no blending. */
var GM = (typeof GM !== "undefined" && GM) || {};

GM.INK = 0;
GM.DARK = 1;
GM.MID = 2;
GM.PAPER = 3;
GM.CLEAR = 255;
GM.RGB = [[31, 42, 20], [74, 90, 50], [125, 138, 88], [163, 173, 126]];

GM.put = function (buf, x, y, c) {
  x = x | 0; y = y | 0;
  if (x >= 0 && x < GM.W && y >= 0 && y < GM.H) buf[y * GM.W + x] = c;
};

GM.rect = function (buf, x, y, w, h, c) {
  x = x | 0; y = y | 0; w = w | 0; h = h | 0;
  var x0 = Math.max(0, x), x1 = Math.min(GM.W, x + w);
  var y0 = Math.max(0, y), y1 = Math.min(GM.H, y + h);
  for (var yy = y0; yy < y1; yy++) {
    var row = yy * GM.W;
    for (var xx = x0; xx < x1; xx++) buf[row + xx] = c;
  }
};

GM.line = function (buf, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  for (;;) {
    GM.put(buf, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};

GM.ellipse = function (buf, cx, cy, rx, ry, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (var dy = -ry; dy <= ry; dy++) {
    var w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
    GM.rect(buf, cx - w, cy + dy, w * 2 + 1, 1, c);
  }
};

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
  var cx = w / 2, cy = h / 2, rx = w / 2 - 1, ry = h / 2 - 1;
  var n = 10, poly = [], i;
  for (i = 0; i < n; i++) {
    var a = i / n * Math.PI * 2;
    var k = 0.78 + rng() * 0.2;
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
    for (i = 0; i < 2; i++) {
      var hx = Math.round(cx - rx * 0.45 + rng() * rx * 0.35);
      var hy = Math.round(cy - ry * 0.45 + rng() * ry * 0.2);
      if (s.b[hy * w + hx] !== GM.CLEAR) s.b[hy * w + hx] = GM.PAPER;
    }
  }
  if (speck) {
    /* rocks get a crack, not a row of dots */
    GM.sline(s, Math.round(cx - rx * 0.2), Math.round(cy), Math.round(cx + rx * 0.15), Math.round(cy + ry * 0.35), GM.INK);
    GM.sline(s, Math.round(cx - rx * 0.2), Math.round(cy), Math.round(cx - rx * 0.45), Math.round(cy - ry * 0.1), GM.INK);
  }
  return s;
};

GM.diamondSprite = function () {
  var s = GM.sprite(14, 14);
  var poly = [[7, 1], [13, 6], [7, 13], [1, 6]];
  for (var y = 0; y < 14; y++) for (var x = 0; x < 14; x++) if (GM.pointIn(poly, x + 0.5, y + 0.5)) GM.sput(s, x, y, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.sline(s, 2, 6, 12, 6, GM.MID);
  GM.sline(s, 7, 2, 3, 6, GM.MID);
  GM.sline(s, 7, 2, 11, 6, GM.MID);
  GM.sline(s, 3, 6, 7, 12, GM.MID);
  GM.sline(s, 11, 6, 7, 12, GM.MID);
  return s;
};

GM.bagSprite = function () {
  var s = GM.sprite(16, 16);
  GM.sellipse(s, 8, 10, 6, 5, GM.PAPER);
  GM.srect(s, 6, 3, 4, 6, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.srect(s, 5, 6, 6, 2, GM.DARK);
  GM.sput(s, 5, 6, GM.INK); GM.sput(s, 10, 6, GM.INK);
  /* a readable five-by-seven dollar mark */
  var d = ["00100", "01110", "10100", "01110", "00101", "01110", "00100"];
  for (var y = 0; y < d.length; y++) {
    for (var x = 0; x < 5; x++) if (d[y].charAt(x) === "1") GM.sput(s, 6 + x, 8 + y, GM.INK);
  }
  return s;
};

GM.boneSprite = function () {
  var s = GM.sprite(16, 10);
  GM.srect(s, 4, 4, 8, 2, GM.PAPER);
  GM.sellipse(s, 3, 3, 2, 2, GM.PAPER);
  GM.sellipse(s, 3, 6, 2, 2, GM.PAPER);
  GM.sellipse(s, 13, 3, 2, 2, GM.PAPER);
  GM.sellipse(s, 13, 6, 2, 2, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.sput(s, 3, 4, GM.MID); GM.sput(s, 13, 4, GM.MID);
  return s;
};

GM.skullSprite = function () {
  var s = GM.sprite(14, 14);
  GM.sellipse(s, 7, 6, 5, 5, GM.PAPER);
  GM.srect(s, 4, 9, 6, 3, GM.PAPER);
  GM.soutline(s, GM.INK);
  GM.srect(s, 4, 5, 2, 2, GM.INK);
  GM.srect(s, 8, 5, 2, 2, GM.INK);
  GM.srect(s, 6, 8, 2, 1, GM.INK);
  GM.srect(s, 4, 11, 1, 2, GM.INK);
  GM.srect(s, 6, 11, 1, 2, GM.INK);
  GM.srect(s, 8, 11, 1, 2, GM.INK);
  GM.srect(s, 10, 11, 1, 2, GM.INK);
  return s;
};

GM.tntSprite = function () {
  var s = GM.sprite(16, 16);
  var xs = [3, 7, 11], i;
  for (i = 0; i < xs.length; i++) GM.srect(s, xs[i], 5, 2, 9, GM.DARK);
  GM.soutline(s, GM.INK);
  GM.srect(s, 2, 9, 12, 1, GM.INK);
  GM.srect(s, 2, 10, 12, 1, GM.PAPER);
  GM.srect(s, 2, 11, 12, 1, GM.INK);
  GM.sline(s, 8, 5, 11, 2, GM.MID);
  GM.sput(s, 12, 1, GM.PAPER);
  GM.sput(s, 11, 2, GM.PAPER);
  return s;
};

GM.ICON = [
  "................",
  ".....000000.....",
  "...0033333300...",
  "..033333333330..",
  "..033333333330..",
  "..033332333330..",
  "..033333333330..",
  "..000000000000..",
  "...0333333330...",
  "...0303333030...",
  "...0333333330...",
  "...0331111330...",
  "....03333330....",
  ".....000000.....",
  "................",
  "................"
];

GM.text3 = function (s, text, x, y, color) {
  var F = GM.FONT3, i, j, r, c;
  for (i = 0; i < text.length; i++) {
    var glyph = F[text.charAt(i)] || F["?"];
    for (j = 0; j < glyph.length; j++) {
      r = glyph[j];
      for (c = 0; c < 3; c++) if (r.charAt(c) === "1") GM.sput(s, x + i * 4 + c, y + j, color);
    }
  }
};

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
  "+": ["000", "010", "111", "010", "000"],
  "-": ["000", "000", "111", "000", "000"],
  " ": ["000", "000", "000", "000", "000"],
  "?": ["111", "001", "011", "000", "010"]
};

GM.initArt = function () {
  GM.SPR = {
    goldS: GM.blob(14, 12, 11, GM.PAPER, GM.MID, false, false),
    goldM: GM.blob(20, 16, 17, GM.PAPER, GM.MID, false, false),
    goldL: GM.blob(26, 20, 23, GM.PAPER, GM.MID, false, false),
    rockS: GM.blob(16, 14, 31, GM.MID, GM.DARK, true, true),
    rockL: GM.blob(26, 20, 37, GM.MID, GM.DARK, true, true),
    diamond: GM.diamondSprite(),
    bag: GM.bagSprite(),
    bone: GM.boneSprite(),
    skull: GM.skullSprite(),
    tnt: GM.tntSprite()
  };
};

GM.spriteDraw = function (buf, s, x, y, flip) {
  x = Math.round(x); y = Math.round(y);
  for (var sy = 0; sy < s.h; sy++) {
    for (var sx = 0; sx < s.w; sx++) {
      var c = s.b[sy * s.w + sx];
      if (c === GM.CLEAR) continue;
      GM.put(buf, x + (flip ? s.w - 1 - sx : sx), y + sy, c);
    }
  }
};

GM.makeBackground = function (state) {
  var b = new Uint8Array(GM.W * GM.H);
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

  /* mine texture: sparse, small, never mistaken for loot */
  rng = GM.rng((state.levelSeed || 1) ^ 0x9e3779b9);
  for (i = 0; i < 95; i++) {
    x = 2 + Math.floor(rng() * (GM.W - 4));
    y = GM.GROUND + 2 + Math.floor(Math.pow(rng(), 1.6) * (GM.H - GM.GROUND - 4));
    GM.put(b, x, y, rng() < 0.7 ? GM.MID : GM.DARK);
    if (rng() < 0.28) GM.put(b, x + 1, y, GM.DARK);
  }
  for (i = 0; i < 18; i++) {
    x = 2 + Math.floor(rng() * (GM.W - 22));
    y = GM.GROUND + 5 + Math.floor(rng() * (GM.H - GM.GROUND - 10));
    len = 3 + Math.floor(rng() * 13);
    if (rng() < 0.5) GM.line(b, x, y, x + len, y + (rng() < 0.5 ? 0 : 1), GM.DARK);
    else GM.line(b, x, y, x + len, y - 1, GM.MID);
  }
  for (i = 0; i < 7; i++) {
    x = 5 + Math.floor(rng() * (GM.W - 16));
    y = GM.GROUND + 8 + Math.floor(rng() * (GM.H - GM.GROUND - 16));
    GM.line(b, x, y, x + 2, y + 2, GM.INK);
    GM.line(b, x + 2, y + 2, x + 1, y + 5, GM.INK);
    if (rng() < 0.6) GM.line(b, x + 2, y + 2, x + 5, y + 3, GM.INK);
  }
  for (i = 0; i < 9; i++) {
    x = 3 + Math.floor(rng() * (GM.W - 8));
    y = GM.GROUND + 4 + Math.floor(rng() * (GM.H - GM.GROUND - 8));
    GM.rect(b, x, y, 2, 2, GM.MID);
    GM.put(b, x, y, GM.DARK);
  }
  return b;
};

GM.drawItem = function (buf, it, anim) {
  var spr = GM.SPR[it.sprite];
  if (!spr) return;
  var x = Math.round(it.x - spr.w / 2);
  var y = Math.round(it.y - spr.h / 2);
  GM.spriteDraw(buf, spr, x, y);
  if (it.kind === "gem" && Math.sin(anim * 4 + it.x) > 0.86) {
    GM.put(buf, x + spr.w - 2, y + 2, GM.PAPER);
  }
  if (it.kind === "tnt" && it.fuse > 0 && Math.sin(anim * 30) > 0) {
    GM.put(buf, x + 12, y, GM.PAPER);
    GM.put(buf, x + 11, y + 1, GM.MID);
  }
};

GM.miniGold = function (buf, x, y) {
  GM.rect(buf, x, y, 5, 4, GM.INK);
  GM.rect(buf, x + 1, y + 1, 3, 2, GM.PAPER);
};

GM.miniGem = function (buf, x, y) {
  GM.rect(buf, x, y + 1, 5, 3, GM.INK);
  GM.rect(buf, x + 1, y + 2, 3, 1, GM.PAPER);
  GM.put(buf, x + 2, y, GM.INK);
  GM.put(buf, x + 2, y + 4, GM.INK);
  GM.put(buf, x + 2, y + 1, GM.PAPER);
};

GM.drawMole = function (buf, it, anim) {
  var d = it.dir;
  var x = Math.round(it.x), y = Math.round(it.y);
  var step = Math.sin(anim * 14 + it.x) > 0 ? 1 : 0;
  GM.ellipse(buf, x, y, 8, 5, GM.INK);
  GM.ellipse(buf, x, y, 7, 4, GM.MID);
  GM.ellipse(buf, x, y + 2, 5, 2, GM.DARK);
  GM.ellipse(buf, x + d * 5, y - 2, 4, 4, GM.INK);
  GM.ellipse(buf, x + d * 5, y - 2, 3, 3, GM.MID);
  GM.ellipse(buf, x + d * 2, y - 6, 2, 2, GM.INK);
  GM.ellipse(buf, x + d * 2, y - 6, 1, 1, GM.DARK);
  GM.rect(buf, x + d * 8, y - 2, 2, 2, GM.PAPER);
  GM.put(buf, x + d * 9, y - 1, GM.INK);
  GM.put(buf, x + d * 6, y - 3, GM.INK);
  GM.line(buf, x - 3, y + 4, x - 4, y + 6 + step, GM.INK);
  GM.line(buf, x + 3, y + 4, x + 4, y + 6 + (1 - step), GM.INK);
  GM.line(buf, x - d * 7, y, x - d * 10, y - 2, GM.INK);
  if (it.carry === "diamond") GM.miniGem(buf, x + d * 6 - (d < 0 ? 5 : 0), y - 8);
  else GM.miniGold(buf, x + d * 6 - (d < 0 ? 5 : 0), y - 8);
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

  /* a low cap with a broad brim and a lamp */
  GM.ellipse(buf, bx, 4 + by, 8, 3, GM.INK);
  GM.ellipse(buf, bx, 4 + by, 7, 2, GM.PAPER);
  GM.rect(buf, bx - 9, 6 + by, 18, 2, GM.INK);
  GM.rect(buf, bx - 8, 6 + by, 16, 1, GM.PAPER);
  GM.rect(buf, bx - 1, 2 + by, 3, 2, GM.MID);
  GM.put(buf, bx, 2 + by, GM.PAPER);

  /* two hands on the rope, with a small coil at the winch */
  GM.line(buf, bx - 7, 13 + by, 79, 17, GM.INK);
  GM.line(buf, bx + 7, 13 + by, 81, 17, GM.INK);
  GM.rect(buf, 78, 16, 2, 2, GM.PAPER);
  GM.rect(buf, 81, 16, 2, 2, GM.PAPER);
  GM.rect(buf, 79, 17, 2, 2, GM.DARK);
  GM.put(buf, 80, 18, GM.PAPER);
};

GM.draw = function (ctx, state) {
  if (!GM.SPR) GM.initArt();
  var key = state.levelSeed;
  if (!state.bg || state.bgKey !== key) {
    state.bg = GM.makeBackground(state);
    state.bgKey = key;
  }
  var buf = GM._buf || (GM._buf = new Uint8Array(GM.W * GM.H));
  buf.set(state.bg);
  var i, it, tip;
  for (i = 0; i < state.items.length; i++) {
    it = state.items[i];
    if (it.type !== "mole") GM.drawItem(buf, it, state.anim);
  }
  for (i = 0; i < state.items.length; i++) {
    it = state.items[i];
    if (it.type === "mole") GM.drawMole(buf, it, state.anim);
  }
  GM.drawRope(buf, state.hook);
  if (state.hook.item) {
    tip = GM.tip(state.hook);
    GM.drawItem(buf, state.hook.item, state.anim);
    GM.put(buf, Math.round(tip.x), Math.round(tip.y) - 2, GM.PAPER);
  }
  GM.drawHook(buf, state.hook);
  GM.drawMiner(buf, state);

  for (i = 0; i < state.blasts.length; i++) {
    var bl = state.blasts[i], k = bl.t / bl.life;
    var rr = 4 + k * 27;
    for (var a = 0; a < Math.PI * 2; a += 0.22) {
      GM.put(buf, bl.x + Math.cos(a) * rr, bl.y + Math.sin(a) * rr, (i + Math.floor(a * 5)) % 2 ? GM.PAPER : GM.MID);
    }
    GM.put(buf, bl.x, bl.y, GM.PAPER);
  }
  for (i = 0; i < state.particles.length; i++) {
    var p = state.particles[i];
    GM.put(buf, p.x, p.y, p.color === "paper" ? GM.PAPER : p.color === "dark" ? GM.DARK : GM.MID);
  }
  for (i = 0; i < state.floats.length; i++) {
    var f = state.floats[i];
    var tx = f.x - (f.text.length * 4 - 1) / 2;
    var ty = f.y - (f.t / f.life) * 9;
    GM.text3(buf, f.text, Math.round(tx), Math.round(ty), GM.INK);
  }

  var sx = 0, sy = 0;
  if (state.shake > 0) {
    sx = Math.round((Math.random() * 2 - 1) * 3);
    sy = Math.round((Math.random() * 2 - 1) * 2);
  }
  GM.present(ctx, buf, sx, sy);
};

GM.present = function (ctx, buf, sx, sy) {
  if (!GM._img) GM._img = ctx.createImageData(GM.W, GM.H);
  var data = GM._img.data;
  for (var y = 0; y < GM.H; y++) {
    for (var x = 0; x < GM.W; x++) {
      var xx = x - (sx || 0), yy = y - (sy || 0), c;
      if (xx < 0 || xx >= GM.W || yy < 0 || yy >= GM.H) c = GM.RGB[GM.PAPER];
      else {
        var t = buf[yy * GM.W + xx];
        c = GM.RGB[t === GM.CLEAR ? GM.PAPER : t] || GM.RGB[GM.PAPER];
      }
      var o = (y * GM.W + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  ctx.putImageData(GM._img, 0, 0);
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
