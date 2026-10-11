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

/* the jade pendant (玉佩): the mural's pattern on a small round disc, as a sprite 11 pixels across. Ink rim, mid body,
   a ring of waves in dark, a paper highlight on the rim and an eye (ink with a paper pupil) at the centre. It must
   read at this size: it lies on the ground in the pendant scene and is the only bright thing there. */
ART.pendant = (function () {
  var N = 11, rows = [], c = (N - 1) / 2, y, x;
  for (y = 0; y < N; y++) {
    var row = "";
    for (x = 0; x < N; x++) {
      var dx = x - c, dy = y - c, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx), ch = ".";
      if (d <= 5.4) ch = d > 4.5 ? "0" : "2";
      /* a ring of waves, and the paper rim catching the light at the top left */
      if (d <= 4.5 && Math.abs(d - 3.5 - Math.sin(a * 4) * 0.3) < 0.55) ch = "1";
      if (d <= 4.5 && d > 3.9 && dx + dy < -2.5) ch = "3";
      if (d < 2.1) ch = Math.abs(dy) < 1 && Math.abs(dx) <= 1.5 ? (dx === 0 && dy === 0 ? "3" : "0") : (Math.abs(dy) < 1.6 && Math.abs(dx) < 2.1 ? "0" : "2");
      row += ch;
    }
    rows.push(row);
  }
  return LoGame.sprite(rows);
})();

/* The close-up of the hand in the ending (no text on it): the hero's palm in his wide sleeve, the jade pendant on it,
   and the fingers closing over it. Three full-screen frames (160 x 144), painted by code like the mural so the
   rings stay round: ART.hand[0] open, [1] half closed, [2] closed with the pattern just showing under the fingers.
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

  /* the pendant at 36 pixels across: ink rim, jade body, a paper rim, three wavy rings (as in the mural) and the eye */
  function pendant(cx, cy) {
    var R0 = 18;
    disc(cx, cy, R0, 0);
    disc(cx, cy, R0 - 1.2, 2);
    fill(cx - R0, cy - R0, cx + R0, cy + R0, function (x, y) {
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx), w = Math.sin(a * 5) * 0.7;
      return (Math.abs(d - 13.6 - w) < 0.8) || (Math.abs(d - 10 + w) < 0.75) || (Math.abs(d - 7 - w) < 0.75);
    }, 0);
    /* the paper rim, brightest at the top left */
    fill(cx - R0, cy - R0, cx + R0, cy + R0, function (x, y) {
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      return d > R0 - 2.6 && d <= R0 - 1.2 && dx + dy < 6;
    }, 3);
    /* the eye */
    ell(cx, cy, 4.2, 2.6, 0); ell(cx, cy, 2.4, 1.6, 3); disc(cx, cy, 0.9, 0);
    fill(cx - 4, cy - 4, cx + 4, cy + 4, function (x, y) { return x === cx - 1 && y === cy - 1; }, 3);
  }

  /* the sleeve: a wide cuff hanging round the wrist, widening as it falls, with folds that sway */
  function sleeve(lift) {
    var top = 102 + lift, edge = function (y, g) { var t = (y - top) / (H - top); return 31 + t * 62 + Math.sin(t * 5) * 3 + g; };
    for (var y = top; y < H; y++) {
      var e0 = Math.round(80 - edge(y, 1)), e1 = Math.round(80 + edge(y, 1));
      for (var x = e0; x <= e1; x++) put(x, y, x === e0 || x === e1 || y === top ? 0 : 1);
    }
    /* the cuff band, lit along its top */
    for (var yb = top + 1; yb < top + 6; yb++) for (var xb = 80 - 31; xb <= 80 + 31; xb++) put(xb, yb, yb === top + 1 ? 3 : 2);
    for (var xl = 80 - 32; xl <= 80 + 32; xl++) put(xl, top + 6, 0);
    shade(46, top + 2, 114, top + 6, 2, 3, 6);
    /* folds: a dark line with a lit side, each fanning out from the cuff at its own pace */
    [[-26, 8], [-17, 14], [-8, 6], [3, 12], [13, 7], [22, 14], [30, 9]].forEach(function (f, i) {
      for (var yy = top + 7 + (i % 3) * 3; yy < H; yy++) {
        var t = (yy - top) / (H - top), xx = Math.round(80 + f[0] * (1 + t * 2.1) + Math.sin(yy * 0.13 + i * 1.7) * 2);
        put(xx, yy, 0);
        put(xx + 1, yy, 2);
        if ((yy + i) % 2 === 0) put(xx + 2, yy, 2);
      }
    });
    shade(30, top + 7, 130, H, 1, 2, 2);
  }

  function palm(frame) {
    /* the wrist and the heel of the hand */
    poly([[58, 88], [102, 88], [98, 112], [62, 112]], 0);
    ell(80, 78, 29, 26, 0);
    ell(80, 78, 28, 25, 3);
    shade(52, 70, 110, 106, 3, 2, 5);
  }
  function finger(x0, y0, x1, y1, r, curl) {
    cap(x0, y0, x1, y1, r + 1, 0);
    cap(x0, y0, x1, y1, r, 3);
    /* a shaded side and the knuckle lines */
    var n = 4;
    for (var i = 1; i < 3; i++) {
      var yy = y0 + (y1 - y0) * i / 3, xx = x0 + (x1 - x0) * i / 3;
      for (var k = -r + 1; k <= r - 1; k++) put(xx + k, yy, 2);
    }
    if (curl) { disc(x1, y1 - 1, r - 1.5, 3); ell(x1, y1 + 1, r - 2, 1.4, 2); }
    return n;
  }

  /* frame 0, 1, 2: how far the fingers have closed (0, 0.5, 1) */
  function paint(k) {
    cv = new Uint8Array(W * H);
    /* the dark between the sleeve and the world: a soft pool of dark and mid behind the hand */
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var d = Math.sqrt((x - 80) * (x - 80) + (y - 78) * (y - 78)) / 82, lum = Math.max(0, 1 - d) * 0.62;
      cv[y * W + x] = lum * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? (lum > 0.36 ? 2 : 1) : 0;
    }
    palm(k);
    /* the thumb, on the left, folding in a little as the hand closes */
    var th = [[54, 92], [38 + 8 * k, 74 + 6 * k]];
    cap(th[0][0], th[0][1], th[1][0], th[1][1], 7, 0);
    cap(th[0][0], th[0][1], th[1][0], th[1][1], 6, 3);
    shade(30, 60, 62, 100, 3, 2, 5);
    pendant(80, 82);
    /* the four fingers, from the top of the palm: stretched up, then curling down over the pendant's upper half */
    var base = [[58, 58], [70, 53], [83, 52], [96, 56]], tips = [[54, 42], [66, 34], [82, 33], [98, 40]];
    var curl = [[62, 74], [74, 78], [88, 77], [98, 72]];
    for (var i = 0; i < 4; i++) {
      var x1 = tips[i][0] + (curl[i][0] - tips[i][0]) * k, y1 = tips[i][1] + (curl[i][1] - tips[i][1]) * k;
      /* half way the finger is seen foreshortened, and shorter */
      finger(base[i][0], base[i][1], x1, y1, 5.4, k > 0.7);
    }
    /* the thumb comes over last when closed, across the lower left of the pendant */
    if (k > 0.7) {
      cap(48, 96, 70, 94, 6, 0);
      cap(48, 96, 70, 94, 5, 3);
      for (var q = 52; q < 68; q += 3) put(q, 94, 2);
    }
    sleeve(k > 0.7 ? -3 : 0);
    /* warmth: a few paper dots round the pendant, more as it is held */
    for (var s = 0; s < 14 * (0.3 + k); s++) {
      var a = s * 2.4 + 0.6, r = 29 + (s * 7) % 9;
      put(80 + Math.cos(a) * r * 1.2, 80 + Math.sin(a) * r * 0.9, s % 3 ? 3 : 2);
    }
    var rows = [];
    for (var yy = 0; yy < H; yy++) {
      var row = "";
      for (var xx = 0; xx < W; xx++) row += cv[yy * W + xx];
      rows.push(row);
    }
    return LoGame.sprite(rows);
  }
  return [paint(0), paint(0.5), paint(1)];
})();
