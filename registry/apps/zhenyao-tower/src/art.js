/* Sprites: rows of "0123." (ink, dark, mid, paper, clear). Characters are 16 pixels tall:
   one world unit at the camera's focus, so they draw 1:1. */
var ART = LoGame.sprites({
  heroDown0: [
    "....0000....",
    "...022220...",
    "....0000....",
    "..00000000..",
    ".0000000000.",
    ".0033333300.",
    ".0303333030.",
    ".0033333300.",
    "..00333300..",
    "...011110...",
    "..01133110..",
    ".0311111130.",
    ".0311221130.",
    "..01111110..",
    "..01100110..",
    "..00....00.."
  ],
  heroDown1: [
    "....0000....",
    "...022220...",
    "....0000....",
    "..00000000..",
    ".0000000000.",
    ".0033333300.",
    ".0303333030.",
    ".0033333300.",
    "..00333300..",
    "...011110...",
    "..01133110..",
    ".0311111130.",
    ".0311221130.",
    "..01111110..",
    "...011110...",
    "...00..00..."
  ],
  heroUp0: [
    "....0000....",
    "...022220...",
    "....0000....",
    "..00000000..",
    ".0000000000.",
    ".0001000100.",
    ".0010001000.",
    ".0000000000.",
    "..00000000..",
    "...011110...",
    "..01111110..",
    ".0311111130.",
    ".0311221130.",
    "..01111110..",
    "..01100110..",
    "..00....00.."
  ],
  heroUp1: [
    "....0000....",
    "...022220...",
    "....0000....",
    "..00000000..",
    ".0000000000.",
    ".0001000100.",
    ".0010001000.",
    ".0000000000.",
    "..00000000..",
    "...011110...",
    "..01111110..",
    ".0311111130.",
    ".0311221130.",
    "..01111110..",
    "...011110...",
    "...00..00..."
  ],
  heroSide0: [
    "......0000..",
    ".....02220..",
    "......000...",
    "...0000000..",
    "..000000000.",
    "..033300000.",
    "..030300000.",
    "..033330000.",
    "...0333000..",
    "....01110...",
    "...0111110..",
    "...0311110..",
    "...0312210..",
    "...0111110..",
    "...0110110..",
    "...00..00..."
  ],
  heroSide1: [
    "......0000..",
    ".....02220..",
    "......000...",
    "...0000000..",
    "..000000000.",
    "..033300000.",
    "..030300000.",
    "..033330000.",
    "...0333000..",
    "....01110...",
    "...0111110..",
    "...0311110..",
    "...0312210..",
    "...0111110..",
    "....011100..",
    "....00.00..."
  ],
  elder: [
    "............",
    "...000000...",
    "..01111110..",
    "000000000000",
    "..03333330..",
    "..03033030..",
    "..03333330..",
    "..03333330..",
    "...033330...",
    "..02333320..",
    ".0222332220.",
    ".0222222220.",
    ".0322222230.",
    "..02222220..",
    "..02222220..",
    "..00....00.."
  ],
  granny: [
    "....0220....",
    "...022220...",
    "..02222220..",
    ".0222222220.",
    ".0233333320.",
    ".0303333030.",
    ".0033333300.",
    "..00333300..",
    "...000000...",
    "..01111110..",
    ".0111111110.",
    ".0311111130.",
    "..01111110..",
    "..01111110..",
    "..01111110..",
    "..00000000.."
  ],
  /* the master: an older man in a long robe, grey hair and beard */
  master: [
    "....0220....",
    "...022220...",
    "...022220...",
    "...033330...",
    "...030030...",
    "...033330...",
    "..02222220..",
    "..02222220..",
    "...022220...",
    "..01111110..",
    ".0111111110.",
    ".0311111130.",
    ".0111221110.",
    ".0111111110.",
    ".0111111110.",
    "..00000000.."
  ],
  /* the woodcutter: a straw hat, an axe on the shoulder */
  woodcutter: [
    "....0000....",
    "..00222200..",
    ".0222222220.",
    "...033330.00",
    "...030030.02",
    "...033330.20",
    "....0330.20.",
    "..0111110200",
    ".0111111120.",
    ".0311111100.",
    ".0111111110.",
    ".0111111110.",
    "..01111110..",
    "..01100110..",
    "..01100110..",
    "..00....00.."
  ],
  child: [
    "...0000...",
    "..000000..",
    ".00000000.",
    ".03333330.",
    ".03033030.",
    ".03333330.",
    "..033330..",
    "..022220..",
    ".02222220.",
    ".32222223.",
    "..022220..",
    "..00..00.."
  ]
});

/* the carved mural of 镇妖塔 middle floor: three wave lines wound into a ring, the centre broken off.
   Drawn as a sprite flat on the wall; made by a loop so the rings stay round. */
ART.mural = (function () {
  var N = 14, rows = [], c = (N - 1) / 2, y, x;
  for (y = 0; y < N; y++) {
    var row = "";
    for (x = 0; x < N; x++) {
      var dx = x - c, dy = y - c, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
      var wave = Math.sin(a * 5) * 0.3, ch = ".";
      if (Math.abs(d - 6.3 - wave) < 0.55 || Math.abs(d - 4.5 + wave) < 0.5 || Math.abs(d - 2.9 - wave) < 0.5) ch = "3";
      /* the centre has come away; a crack runs out of it and the ring is chipped there */
      if (d < 2.1 + Math.sin(a * 3 + 1) * 0.7) ch = (x + y) % 3 === 0 ? "1" : ".";
      if (a > 0.5 && a < 0.8 && d > 2.5) ch = ".";
      row += ch;
    }
    rows.push(row);
  }
  return LoGame.sprite(rows);
})();

/* the jade pendant (玉佩) as it lies on the roof: a small disc a person holds in one hand, 5 x 4 pixels, seen at an angle
   (ink rim, mid body, a paper pixel where it catches the light). Its soft glow, not its size, carries the attention. */
ART.jade = LoGame.sprite([
  ".000.",
  "02320",
  "02120",
  ".000."
]);

/* The close-up of the hand in the ending (no text on it): the hero's arm hangs at his side in the wide sleeve and his
   hand, the back of it toward us, is hiding the jade pendant in a fist. Three full-screen frames (160 x 144), painted
   by code like the mural so the rings stay round: ART.hand[0] the fist low and a little open, jade and glow showing
   between the fingers; [1] the fist tightening and drawing up; [2] the hand almost back in the sleeve, knuckles only.
   Painted with a few shape helpers into a tone array, then turned into sprites. */
ART.hand = (function () {
  var W = 160, H = 144, cv, BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function put(x, y, t) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) cv[y * W + x] = t; }
  function get(x, y) { return cv[y * W + x]; }
  /* fill where inside(x, y) holds, within a box */
  function fill(x0, y0, x1, y1, inside, t) {
    for (var y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
      for (var x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) if (inside(x, y)) cv[y * W + x] = t;
  }
  function disc(cx, cy, r, t) { fill(cx - r, cy - r, cx + r, cy + r, function (x, y) { return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r; }, t); }
  function ell(cx, cy, rx, ry, t) { fill(cx - rx, cy - ry, cx + rx, cy + ry, function (x, y) { var u = (x - cx) / rx, v = (y - cy) / ry; return u * u + v * v <= 1; }, t); }
  /* a thick line with round ends */
  function cap(x0, y0, x1, y1, r, t) {
    var n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
    for (var i = 0; i <= n; i++) disc(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, t);
  }
  /* polygon, even-odd */
  function poly(pts, t) {
    var ys = pts.map(function (p) { return p[1]; }), y0 = Math.max(0, Math.floor(Math.min.apply(null, ys))), y1 = Math.min(H - 1, Math.ceil(Math.max.apply(null, ys)));
    for (var y = y0; y <= y1; y++) {
      var xs = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) for (var x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) put(x, y, t);
    }
  }
  /* a shape with an ink outline: grow it by one pixel in ink, then paint it */
  function inked(draw, grow) { draw(grow, 0); draw(0, null); }
  /* a dithered tone on the pixels of tone `over` where a Bayer threshold passes (level 0..16) */
  function shade(x0, y0, x1, y1, over, t, level) {
    for (var y = Math.max(0, y0); y < Math.min(H, y1); y++) for (var x = Math.max(0, x0); x < Math.min(W, x1); x++)
      if (cv[y * W + x] === over && BAYER[(y & 3) * 4 + (x & 3)] < level) cv[y * W + x] = t;
  }

  /* the pendant as far as it shows: ink rim, jade body, one ring of waves (as in the mural) and the eye */
  function jade(cx, cy) {
    var R0 = 17;
    disc(cx, cy, R0, 0);
    disc(cx, cy, R0 - 1.2, 2);
    fill(cx - R0, cy - R0, cx + R0, cy + R0, function (x, y) {
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx), w = Math.sin(a * 5) * 0.6;
      return Math.abs(d - 11 - w) < 0.8;
    }, 0);
    fill(cx - R0, cy - R0, cx + R0, cy + R0, function (x, y) {
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      return d > R0 - 2.6 && d <= R0 - 1.2 && dx + dy < 6;
    }, 3);
    ell(cx, cy, 5, 3, 0); ell(cx, cy, 3, 1.9, 3); disc(cx, cy, 1.1, 0);
  }

  /* a soft warmth round (cx, cy): dithered mid over the dark, paper dots near the middle; level 0..1 */
  function glow(cx, cy, r, level) {
    for (var y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++) for (var x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) {
      var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r, t = cv[y * W + x];
      if (d >= 1 || t > 1) continue;
      var v = (1 - d) * level * 16, b = BAYER[(y & 3) * 4 + (x & 3)];
      if (v > b + 5) cv[y * W + x] = 3; else if (v > b) cv[y * W + x] = 2; else if (v > b - 4 && t === 0) cv[y * W + x] = 1;
    }
  }

  /* the sleeve's hem: lower in the middle, where the opening hangs open */
  function hem(x) { var u = (x - 82) / 62; return Math.round(82 + 7 * (1 - u * u)); }
  function edgeL(y) { return Math.round(46 - 30 * Math.pow(y / 90, 1.3) + Math.sin(y * 0.07) * 2); }
  function edgeR(y) { return Math.round(120 + 30 * Math.pow(y / 90, 1.3) + Math.sin(y * 0.06 + 1) * 2); }

  /* the sleeve: long and wide, folds falling straight down; lit on the left, dark on the right.
     Drawn after the hand so that the hem covers the wrist */
  function sleeve() {
    var y, x;
    for (y = 0; y < H; y++) for (x = edgeL(y); x <= edgeR(y); x++) {
      if (y > hem(x)) continue;
      var u = (x - edgeL(y)) / (edgeR(y) - edgeL(y)), b = BAYER[(y & 3) * 4 + (x & 3)];
      cv[y * W + x] = 1;
      if (u < 0.5 && (1 - u * 2) * 16 > b + 2) cv[y * W + x] = 2;
      if (u > 0.72 && (u - 0.72) * 60 > b) cv[y * W + x] = 0;
    }
    /* folds: [position across at the top, lean as it falls, start row] */
    [[0.14, -0.04, 8], [0.28, -0.02, 0], [0.4, 0.03, 20], [0.52, 0.0, 4], [0.64, 0.05, 14], [0.78, 0.08, 0], [0.9, 0.06, 26]].forEach(function (f, i) {
      for (var yy = f[2]; yy < H; yy++) {
        var L = edgeL(yy), R = edgeR(yy), xx = Math.round(L + (R - L) * (f[0] + f[1] * (yy / 96)) + Math.sin(yy * 0.11 + i * 1.9) * 1.5);
        if (yy > hem(xx) - 2) break;
        put(xx, yy, 0);
        if (f[0] < 0.7) put(xx - 1, yy, 2);
        if (f[0] < 0.5 && (yy + i) % 2 === 0) put(xx - 2, yy, 3);
      }
    });
    /* the outline, thicker on the dark side, and the lit edge on the left */
    for (y = 0; y < H; y++) {
      var l = edgeL(y), r = edgeR(y);
      if (y <= hem(l)) { put(l, y, 0); put(l + 1, y, y % 3 ? 3 : 2); put(l + 2, y, 2); }
      if (y <= hem(r)) { put(r, y, 0); put(r - 1, y, 0); }
    }
    /* the hem: an ink line, a lip catching the light on the left */
    for (x = edgeL(86); x <= edgeR(86); x++) {
      var h = hem(x);
      for (y = h - 5; y <= h; y++) put(x, y, (y === h || y === h - 5) ? 0 : (x < 70 && y === h - 4 ? 3 : (y === h - 1 && x > 96 ? 1 : 2)));
    }
  }

  /* one frame: y0 is the top of the wrist (the lower, the more the fist is out), open how far the fingers are apart
     (0..1), warm the glow (0..1) */
  function paint(y0, open, warm) {
    cv = new Uint8Array(W * H);
    var x, y, i;
    /* the dark round the sleeve: ink with a dithered dark pool below it */
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var d = Math.sqrt((x - 84) * (x - 84) + (y - 132) * (y - 132)) / 90, lum = Math.max(0, 1 - d) * 0.5;
      cv[y * W + x] = lum * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0;
    }
    /* the pendant under the fingers, and its glow round it */
    var jx = 82, jy = y0 + 37;
    glow(jx, jy + 2, 34, Math.min(1, warm * 1.5));
    if (open > 0.02) jade(jx, jy);
    /* the thumb on the left, the back of the hand, then the fingers curled with their knuckles toward us */
    cap(50, y0 + 14, 58, y0 + 38, 8, 0);
    cap(50, y0 + 14, 58, y0 + 38, 7, 2);
    for (i = 0; i < 6; i++) put(46 + i * 0.7, y0 + 16 + i * 3.5, 3);
    ell(82, y0 + 3, 23, 17, 0);
    ell(82, y0 + 3, 22, 16, 2);
    fill(60, y0, 104, y0 + 40, function (px, py) { return cv[py * W + px] === 2 && px < 70 && (px + py) % 2 === 0; }, 3);
    shade(94, y0, 106, y0 + 40, 2, 1, 9);
    var gap = open * 6, fx = [62.5 - gap, 75.5 - gap, 88.5 + gap, 101.5 + gap];
    for (i = 0; i < 4; i++) {
      var top = y0 + 17 + (i === 1 || i === 2 ? -2 : 1), tip = y0 + 38 - (i === 0 || i === 3 ? 4 : 0) - open * 3, dx = i < 2 ? 1 : -1;
      cap(fx[i], top, fx[i] + dx, tip, 7.5, 0);
      cap(fx[i], top, fx[i] + dx, tip, 6.5, 2);
      /* a lit knuckle at the top, a crease across the finger, the fingertip in shade */
      for (var k = -3; k <= 1; k++) put(fx[i] + k, top - 1, 3);
      put(fx[i] - 4, top + 1, 3); put(fx[i] - 4, top + 2, 3);
      for (k = -4; k <= 4; k++) {
        if (cv[(y0 + 29) * W + Math.round(fx[i] + k)] === 2) put(fx[i] + k, y0 + 29, k === 0 ? 2 : 1);
        if (cv[(tip - 2) * W + Math.round(fx[i] + k + dx)] === 2) put(fx[i] + k + dx, tip - 2, (k + i) % 2 ? 1 : 2);
      }
    }
    /* sparks of paper in the dark round the fist while the fist is open */
    if (open > 0.5) [[-27, 30], [28, 36], [-22, 52], [24, 49], [-3, 57], [14, 56]].forEach(function (p) { put(jx + p[0], y0 + p[1], 3); });
    sleeve();
    /* the shadow under the hem on the wrist, so that it goes in */
    for (x = 52; x <= 112; x++) for (y = hem(x) + 1; y <= hem(x) + 4; y++)
      if (cv[y * W + x] > 0 && BAYER[(y & 3) * 4 + (x & 3)] * 0.9 + (y - hem(x)) * 3 < 13) cv[y * W + x] = 0;
    /* the last of the glow, at the cuff */
    if (warm < 0.3) { put(78, hem(78) + 2, 3); put(87, hem(87) + 2, 3); put(88, hem(88) + 2, 2); put(77, hem(77) + 3, 2); }
    var rows = [];
    for (y = 0; y < H; y++) {
      var row = "";
      for (x = 0; x < W; x++) row += cv[y * W + x];
      rows.push(row);
    }
    return LoGame.sprite(rows);
  }
  return [paint(84, 1, 1), paint(70, 0.2, 0.55), paint(52, 0, 0.12)];
})();
