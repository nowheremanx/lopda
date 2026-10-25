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


/* A chest, 16 x 16 (a tile wide), with an ink outline so that it reads on any floor, light or dark:
   a mid lid with dark iron bands, a dark body with mid bands, paper only on a highlight and the lock. Closed, it glints now and then (frames 1 and 2 put a paper star above the lid, timed by
   the map's clock, see Maps.render); opened, the lid stands up behind a dark mouth and there is no lock. */
ART.chest = (function () {
  /* a paper frame round the whole chest glared out of the scene on the phone; paper is kept for the highlight and the lock */
  var closed = [
    "................",
    "................",
    "................",
    "................",
    "..000000000000..",
    ".02322222222220.",
    "0222112222112220",
    "0222112222112220",
    "0222112332112220",
    "0000000330000000",
    "0111221001221110",
    "0111221221221110",
    "0111221111221110",
    "0111221111221110",
    "0111111111111110",
    "0000000000000000"
  ];
  var open = [
    "................",
    "..000000000000..",
    ".02222222222220.",
    ".02111111111120.",
    ".02111111111120.",
    ".02222222222220.",
    ".00000000000000.",
    "0000000000000000",
    "0200000000000020",
    "0111221111221110",
    "0111221111221110",
    "0111221111221110",
    "0111221111221110",
    "0111221111221110",
    "0111111111111110",
    "0000000000000000"
  ];
  function put(rows, list) {
    var out = rows.slice();
    list.forEach(function (p) { var r = out[p[1]]; out[p[1]] = r.slice(0, p[0]) + "3" + r.slice(p[0] + 1); });
    return out;
  }
  /* one sprite per tone, each drawn with the renderer's fixed tone: fog and the dither of the light never turn the
     lid's paper into mush, and the ink base stays ink */
  function layers(rows) {
    return [0, 1, 2, 3].map(function (t) {
      return { tone: t, art: LoGame.sprite(rows.map(function (r) { return r.replace(/[0-3]/g, function (c) { return +c === t ? c : "."; }); })) };
    });
  }
  return {
    closed: [
      layers(closed),
      layers(put(closed, [[13, 2]])),
      layers(put(closed, [[13, 0], [12, 1], [13, 1], [14, 1], [13, 2]]))
    ],
    open: layers(open)
  };
})();

/* ---------- the close-ups of the ending (no text on them) ----------
   2D pictures in the manner of a portrait cut-in: a band 160 x 96 across the screen with an ink frame, painted by code
   so that the rings stay round, then turned into sprites. ART.cutin(name) paints on first use and keeps the sprite:
   "palm" the hero's open hand, palm up, the jade pendant lying on it; "master" the master's face; "curl1", "fist" the
   fingers closing; "down0".."down3" the fist lowering out of the bottom of the band. */
ART.cutin = (function () {
  var W = 160, H = 96, cv, OY = 0, cache = {};
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function put(x, y, t) { x = Math.round(x); y = Math.round(y + OY); if (x >= 0 && y >= 0 && x < W && y < H) cv[y * W + x] = t; }
  function get(x, y) { x = Math.round(x); y = Math.round(y + OY); return x >= 0 && y >= 0 && x < W && y < H ? cv[y * W + x] : -1; }
  /* fill where inside(x, y) holds, within a box (all in picture coordinates, moved down by OY) */
  function fill(x0, y0, x1, y1, inside, t) {
    for (var y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (var x = Math.floor(x0); x <= Math.ceil(x1); x++) if (inside(x, y)) put(x, y, t);
  }
  function disc(cx, cy, r, t) { fill(cx - r, cy - r, cx + r, cy + r, function (x, y) { return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r; }, t); }
  function ell(cx, cy, rx, ry, t) { fill(cx - rx, cy - ry, cx + rx, cy + ry, function (x, y) { var u = (x - cx) / rx, v = (y - cy) / ry; return u * u + v * v <= 1; }, t); }
  /* a thick line with round ends */
  function cap(x0, y0, x1, y1, r, t) {
    var n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
    for (var i = 0; i <= n; i++) disc(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, t);
  }
  /* a thin line */
  function line(x0, y0, x1, y1, t) {
    var n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1;
    for (var i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, t);
  }
  /* polygon, even-odd */
  function poly(pts, t) {
    var ys = pts.map(function (p) { return p[1]; }), y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
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
  /* a shape in tone t with an ink outline of one pixel: paint it grown by `grow` in ink, then plain */
  function inked(shape, grow, t) { shape(grow, 0); shape(0, t); }
  /* tone `over` turned into `t` where a Bayer threshold passes: level 0..16, ramping from `l0` at y0 to `l1` at y1 */
  function ramp(x0, y0, x1, y1, over, t, l0, l1) {
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++)
      if (get(x, y) === over && l0 + (l1 - l0) * (y - y0) / (y1 - y0) > BAYER[((y + OY) & 3) * 4 + (x & 3)]) put(x, y, t);
  }
  /* the frame: two rows of ink at the top and bottom of the band and a paper line inside them */
  function frame() {
    for (var x = 0; x < W; x++) {
      cv[x] = 0; cv[W + x] = 0; cv[2 * W + x] = 3; cv[3 * W + x] = 0;
      cv[(H - 1) * W + x] = 0; cv[(H - 2) * W + x] = 0; cv[(H - 3) * W + x] = 3; cv[(H - 4) * W + x] = 0;
    }
  }
  /* the ground of the band: ink, with a dithered dark pool round (cx, cy) */
  function ground(cx, cy, rx) {
    cv = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy) * 1.6) / rx, lum = Math.max(0, 1 - d) * 0.9;
      cv[y * W + x] = lum * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0;
    }
  }
  function sprite() {
    frame();
    var rows = [];
    for (var y = 0; y < H; y++) {
      var row = "";
      for (var x = 0; x < W; x++) row += cv[y * W + x];
      rows.push(row);
    }
    return LoGame.sprite(rows);
  }

  /* ---- the pendant: ink rim, a mid ring, a dark body with three wavy lines wound into a circle round an eye ---- */
  function jade(cx, cy) {
    var R0 = 21;
    disc(cx, cy, R0, 0);
    disc(cx, cy, R0 - 1.2, 2);
    disc(cx, cy, R0 - 3.4, 1);
    /* a light on the rim at the upper left */
    fill(cx - R0, cy - R0, cx + R0, cy + R0, function (x, y) {
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      return d > R0 - 3.4 && d <= R0 - 1.2 && dx + dy < -5;
    }, 3);
    /* three waves, each a third of the circle: a line that swings in and out, drawn in paper */
    for (var k = 0; k < 3; k++) {
      for (var s = 0; s <= 200; s++) {
        var u = s / 200, a = (k + 0.08 + u * 0.84) * Math.PI * 2 / 3 - 1.2, rr = 12.6 + 2.2 * Math.sin(u * Math.PI * 4);
        var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.98;
        put(px, py, 3); if (Math.abs(Math.sin(a)) > 0.7) put(px, py + 1, 3); else put(px + 1, py, 3);
      }
    }
    /* the eye in the middle */
    ell(cx, cy, 6, 3.6, 0); ell(cx, cy, 5, 2.6, 3); disc(cx, cy, 1.7, 0);
    put(cx - 1, cy - 1, 3);
  }
  /* the cord: from the hole at the top of the pendant, dangling over the heel of the hand and off the band */
  function cord(cx, cy) {
    for (var i = 0; i <= 60; i++) {
      var u = i / 60, x = cx - 14 - u * 26 + Math.sin(u * 5) * 2, y = cy + 14 + u * 70;
      put(x, y, 0); put(x + 1, y, 0); put(x + 1, y + 1, 2);
    }
  }

  /* ---- the hand: seen from above, palm up, wrist on the left, fingers to the right ----
     curl: 0 open and flat, 1 the fingers rising and shortening, 2 the fist closed over the pendant */
  var JX = 66, JY = 50;
  function skin(shape) { shape(1, 0); shape(0, 3); }
  function hand(curl, withJade) {
    var i;
    /* the forearm, bare, from the left edge */
    skin(function (g, t) { poly([[-2, 31 - g], [34, 28 - g], [44, 28 - g], [44, 74 + g], [34, 71 + g], [-2, 69 + g]], t); });
    ramp(0, 30, 44, 71, 3, 2, 2, 12);
    line(4, 44, 30, 46, 2); line(6, 55, 32, 55, 2);
    /* the palm */
    skin(function (g, t) {
      fill(36 - g, 24 - g, 94 + g, 76 + g, function (x, y) {
        var dx = Math.max(0, Math.abs(x - 65) - 20), dy = Math.max(0, Math.abs(y - 50) - 14);
        return dx * dx + dy * dy <= (14 + g) * (14 + g);
      }, t);
    });
    ramp(36, 24, 95, 76, 3, 2, 1, 11);
    /* the thumb, on the top side */
    var th = curl === 0 ? [[54, 30], [80, 12]] : curl === 1 ? [[54, 30], [74, 20]] : [[54, 30], [76, 42]];
    cap(th[0][0], th[0][1], th[1][0], th[1][1], 7, 0); cap(th[0][0], th[0][1], th[1][0], th[1][1], 6, 3);
    /* the fingers: knuckles at x = 92 */
    var ys = [31, 43, 55, 67], len = [44, 50, 46, 36];
    if (withJade) { jade(JX, JY); cord(JX, JY); }
    if (curl === 0) {
      for (i = 0; i < 4; i++) {
        cap(92, ys[i], 92 + len[i], ys[i], 6, 0); cap(92, ys[i], 92 + len[i], ys[i], 5, 3);
        ramp(92, ys[i], 92 + len[i] + 6, ys[i] + 6, 3, 2, 0, 9);
        line(92 + len[i] / 3, ys[i] - 4, 92 + len[i] / 3, ys[i] + 4, 0); line(92 + len[i] * 0.66, ys[i] - 4, 92 + len[i] * 0.66, ys[i] + 4, 0);
      }
    } else if (curl === 1) {
      /* rising towards us: short and fat, the tips lit */
      for (i = 0; i < 4; i++) {
        var l1 = len[i] * 0.4;
        cap(92, ys[i], 92 + l1, ys[i], 6.5, 0); cap(92, ys[i], 92 + l1, ys[i], 5.5, 3);
        ramp(92, ys[i], 92 + l1 + 7, ys[i] + 6, 3, 2, 0, 9);
        line(92 + l1 / 2, ys[i] - 4, 92 + l1 / 2, ys[i] + 4, 0);
      }
    } else {
      /* closed over the pendant: the fingers lie back across it, tips to the left, the thumb across them */
      for (i = 0; i < 4; i++) {
        var l = 33 + (i === 1 ? 3 : 0) - (i === 3 ? 3 : 0);
        cap(94, ys[i], 94 - l, ys[i], 6.3, 0); cap(94, ys[i], 94 - l, ys[i], 5.3, 3);
        ramp(94 - l, ys[i], 94, ys[i] + 6, 3, 2, 0, 8);
        line(94 - l * 0.35, ys[i] - 4, 94 - l * 0.35, ys[i] + 4, 0); line(94 - l * 0.7, ys[i] - 4, 94 - l * 0.7, ys[i] + 4, 0);
      }
      cap(50, 33, 70, 50, 7, 0); cap(50, 33, 70, 50, 6, 3); ramp(48, 30, 76, 56, 3, 2, 0, 8);
      line(54, 29, 70, 44, 3);
    }
    /* creases of the palm at the heel, when it is open */
    if (curl < 2) { line(40, 40, 47, 46, 2); line(41, 62, 48, 56, 2); }
  }

  /* ---- the master: an old man, calm, long grey brows and beard, looking at the hero (the right of the picture) ---- */
  function master() {
    ground(80, 50, 92);
    var f, x, y;
    /* shoulders and robe */
    inked(function (g, t) { poly([[10 - g, 96], [22 - g, 76 - g], [52, 66 - g], [108, 66 - g], [138 + g, 76 - g], [150 + g, 96]], t); }, 1, 1);
    ramp(14, 70, 146, 96, 1, 0, 2, 12);
    for (f = 0; f < 5; f++) { line(30 + f * 8, 80 + f, 24 + f * 5, 96, 0); line(130 - f * 8, 80 + f, 136 - f * 5, 96, 0); }
    /* the collar: a pale V under the beard */
    line(64, 70, 80, 90, 3); line(96, 70, 80, 90, 3); line(63, 70, 79, 91, 2); line(97, 70, 81, 91, 2);
    /* the topknot with its pin */
    inked(function (g, t) { ell(80, 12, 8 + g, 7 + g, t); }, 1, 2);
    line(70, 14, 90, 10, 0); line(70, 15, 90, 11, 3);
    /* grey hair round the head */
    inked(function (g, t) { ell(80, 40, 26 + g, 29 + g, t); }, 1, 2);
    ramp(54, 14, 106, 70, 2, 3, 0, 5);
    for (f = 0; f < 6; f++) { line(60 + f * 2, 22, 56 + f, 46, 0); line(100 - f * 2, 22, 104 - f, 46, 0); }
    /* the face */
    inked(function (g, t) { ell(80, 46, 20 + g, 24 + g, t); }, 1, 3);
    ramp(60, 22, 100, 70, 3, 2, 0, 6);
    for (y = 24; y < 70; y++) for (x = 92; x < 102; x++) if (get(x, y) === 3 && (x - 92) * 1.4 > BAYER[((y + OY) & 3) * 4 + (x & 3)] - 4) put(x, y, 2);
    /* forehead lines, crow's feet, a line from nose to mouth */
    line(68, 29, 92, 29, 2); line(70, 33, 90, 33, 2);
    line(61, 48, 58, 46, 2); line(61, 51, 58, 52, 2); line(99, 48, 102, 46, 2); line(99, 51, 102, 52, 2);
    line(72, 60, 70, 66, 2); line(88, 60, 90, 66, 2);
    /* long brows: grey, drooping at the outer ends past the eyes */
    function brow(x0, y0, x1, y1, x2, y2) {
      cap(x0, y0, x1, y1, 2, 0); cap(x1, y1, x2, y2, 2, 0);
      cap(x0, y0, x1, y1, 1, 2); cap(x1, y1, x2, y2, 1, 2);
    }
    brow(75, 37, 66, 36, 56, 45); brow(85, 37, 94, 36, 104, 45);
    /* calm eyes: a lid line, a small iris looking to the right, a pale lower lid */
    function eye(cx) {
      line(cx - 5, 46, cx + 5, 46, 0); line(cx - 4, 45, cx + 4, 45, 0);
      ell(cx + 1.5, 47, 2.4, 1.6, 0); put(cx + 2, 46, 3);
      line(cx - 4, 49, cx + 4, 49, 2);
    }
    eye(69); eye(91);
    /* nose */
    line(80, 46, 80, 55, 2); line(78, 56, 82, 56, 0); put(81, 53, 2);
    /* moustache falling over the mouth, then the beard, long, over the robe */
    inked(function (g, t) { poly([[80, 58 - g], [90 + g, 59 - g], [97 + g, 67 + g], [88, 64 + g], [80, 62 + g], [72, 64 + g], [63 - g, 67 + g], [70 - g, 59 - g]], t); }, 1, 3);
    line(76, 64, 84, 64, 0);
    inked(function (g, t) { poly([[60 - g, 62], [100 + g, 62], [98 + g, 72], [90 + g, 82 + g], [82, 95], [80, 100], [78, 95], [70 - g, 82 + g], [62 - g, 72]], t); }, 1, 3);
    ramp(60, 62, 100, 96, 3, 2, 0, 8);
    for (f = 0; f < 7; f++) line(66 + f * 4.7, 66 + Math.abs(f - 3) * 2, 70 + f * 3.4, 92, 2);
    return sprite();
  }

  function hold(curl, withJade, dy) {
    ground(70, 52, 88);
    OY = dy || 0;
    hand(curl, withJade);
    OY = 0;
    return sprite();
  }

  var MAKE = {
    palm: function () { return hold(0, true, 0); },
    curl1: function () { return hold(1, true, 0); },
    fist: function () { return hold(2, true, 0); },
    down0: function () { return hold(2, true, 12); },
    down1: function () { return hold(2, true, 30); },
    down2: function () { return hold(2, true, 52); },
    down3: function () { return hold(2, true, 76); },
    master: master
  };
  return function (name) { return cache[name] || (cache[name] = MAKE[name]()); };
})();
