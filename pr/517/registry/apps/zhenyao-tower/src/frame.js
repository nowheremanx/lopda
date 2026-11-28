/* The shrine around the 160 x 144 3D window.
   The game keeps its own canvas and its own whole-pixel contain layout; this file paints a full-stage
   background canvas behind it, so the window sits in a carved cabinet instead of on bare paper. Every
   frame pixel is scenery on the same four tones; the frame canvas takes no pointer events, so a tap on
   the wood or the stone never reaches the game and the game's own taps stay world-relative.

   The piece is an architecture, not a border: a tiled roof and a gold plaque over the window, a dark
   lacquer wall with a lattice transom and hanging lanterns on the tall top panels, pillars with ofuda on
   the sides, and a stone terrace with steps, a censer and stone lanterns below. A tall stage grows the
   top and bottom panels; a short or wide one grows the pillars and keeps a compact name board. When a
   margin is too thin for the detail, it keeps only its beams. */
var ZTFrame = (function () {
  "use strict";

  var INK = 0, DARK = 1, MID = 2, PAPER = 3;
  var TONES = ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"];
  /* the view wrapper is inset from the stage on every side, so even a wide stage keeps its side posts.
     The wrapper is what lo-game measures; the canvas centres in it as it always has. */
  var INSET = 4;
  /* the title screen has its own 镇妖塔·序章 window: the frame's board turns blank there, so the two
     names never read as one doubled title. Every other scene keeps the shrine's name. */
  var titleMode = true, repaint = null;

  /* the 12 x 12 lopix blocks of 镇妖塔, copied from the app's font (first row is the font's blank top).
     The plaque is the one piece of text on the frame: the title of the shrine. */
  var GLYPHS = {
    "镇": [".#.....#....", ".##.#######.", "#......#....", "###..#####..", ".#...#...#..", ".#...#####..",
      "###..#...#..", ".#...#...#..", ".#..#######.", ".##..#...#..", ".#..#.....#."],
    "妖": ["..#.....##..", "..#..###....", "####...#....", ".#.#...#....", ".#.#...#....", ".#.########.",
      "#..#...#....", ".#.#..#.#...", "..#...#.#...", ".#.#.#...#..", "#...#.....#."],
    "塔": [".#...#...#..", ".#.########.", ".#...#...#..", "###...###...", ".#...#...#..", ".#.##.###.#.",
      ".#..........", ".##.#######.", "##..#.....#.", "....#.....#.", "....#######."]
  };

  /* ---------------- pixels ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function put(buf, w, h, x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < w && y < h) buf[y * w + x] = c;
  }
  function rect(buf, w, h, x, y, ww, hh, c) {
    var x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    var x1 = Math.min(w, Math.round(x + ww)), y1 = Math.min(h, Math.round(y + hh));
    for (var yy = y0; yy < y1; yy++) buf.fill(c, yy * w + x0, yy * w + Math.max(x0, x1));
  }
  function disc(buf, w, h, cx, cy, r, c, filled) {
    for (var y = -r; y <= r; y++) {
      var span = Math.round(Math.sqrt(r * r + r - y * y));
      if (filled) rect(buf, w, h, cx - span, cy + y, span * 2 + 1, 1, c);
      else { put(buf, w, h, cx - span, cy + y, c); put(buf, w, h, cx + span, cy + y, c); }
    }
    if (!filled) for (var x = -r; x <= r; x++) {
      var s2 = Math.round(Math.sqrt(r * r + r - x * x));
      put(buf, w, h, cx + x, cy - s2, c); put(buf, w, h, cx + x, cy + s2, c);
    }
  }
  /* a deterministic grain: the same stage size always paints the same wood and stone */
  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  /* a fleck of grain, one art pixel: never enough to read as a colour of its own */
  function grain(buf, w, h, x0, y0, x1, y1, u, rand, c, n) {
    for (var i = 0; i < n; i++) {
      var x = x0 + Math.floor(rand() * Math.max(1, (x1 - x0) / u)) * u;
      var y = y0 + Math.floor(rand() * Math.max(1, (y1 - y0) / u)) * u;
      rect(buf, w, h, x, y, Math.max(1, Math.round(u / 2)), Math.max(1, Math.round(u / 2)), c);
    }
  }

  /* ---------------- the view ---------------- */
  /* The same rectangle lo-game's contain fit gives its canvas inside the inset wrapper, for a pure test
     and for the first paint. The live painter measures the canvas instead. */
  function viewRect(stageW, stageH, dpr) {
    var wW = Math.max(1, stageW - INSET * 2), wH = Math.max(1, stageH - INSET * 2);
    var c = typeof LoGame !== "undefined" ? LoGame.containLayout(wW, wH, 160, 144, dpr || 1)
      : (function () {
        var k = Math.floor(Math.min(wW / 160, wH / 144) * (dpr || 1)) / (dpr || 1);
        if (k < Math.min(wW / 160, wH / 144) * 0.9) k = Math.min(wW / 160, wH / 144);
        k = Math.max(0.5, k);
        return { w: Math.round(160 * k), h: Math.round(144 * k), k: k };
      })();
    return { x: INSET + (wW - c.w) / 2, y: INSET + (wH - c.h) / 2, w: c.w, h: c.h, k: c.k, inset: INSET };
  }

  /* ---------------- the pieces ---------------- */
  /* a tiled roof band, its ridge at the stage's edge and its eave above the wall */
  function roof(buf, w, h, bottom, u, rand) {
    var ridge = Math.max(1, Math.round(u / 2)), rowH = Math.max(2, u), lip = Math.max(2, u);
    rect(buf, w, h, 0, 0, w, ridge, PAPER);
    rect(buf, w, h, 0, ridge, w, Math.max(1, u), DARK);
    rect(buf, w, h, 0, ridge + Math.max(1, u), w, Math.max(1, Math.round(u / 2)), INK);
    var y0 = ridge + Math.max(1, u) + Math.max(1, Math.round(u / 2));
    var rows = Math.max(0, Math.min(4, Math.floor((bottom - lip - y0) / rowH)));
    for (var r = 0; r < rows; r++) {
      var y = y0 + r * rowH, off = r % 2 ? Math.round(u * 1.5) : 0;
      for (var x = -off; x < w; x += Math.round(u * 3)) {
        rect(buf, w, h, x, y, Math.round(u * 1.5), rowH, DARK);
        rect(buf, w, h, x + Math.round(u * 1.5), y, Math.round(u * 1.5), rowH, INK);
        var g = y + Math.max(1, Math.round(u / 2));
        if (g < y + rowH) rect(buf, w, h, x + u, g, Math.max(1, Math.round(u / 2)), Math.max(1, Math.round(u / 2)), MID);
      }
    }
    /* the eave lip: a dark board with lit rafter ends, and a bracket turned up at each end */
    var ey = bottom - lip;
    rect(buf, w, h, 0, ey, w, lip, DARK);
    rect(buf, w, h, 0, ey, w, Math.max(1, Math.round(u / 2)), INK);
    for (var x2 = Math.round(u); x2 < w - u; x2 += Math.round(u * 3)) {
      rect(buf, w, h, x2, ey + Math.max(1, Math.round(u / 2)), Math.max(1, Math.round(u / 2)), Math.max(1, Math.round(lip / 2)), MID);
    }
    rect(buf, w, h, 0, ey - Math.max(1, Math.round(u / 2)), Math.round(u * 2), Math.max(1, Math.round(u / 2)), MID);
    rect(buf, w, h, w - Math.round(u * 2), ey - Math.max(1, Math.round(u / 2)), Math.round(u * 2), Math.max(1, Math.round(u / 2)), MID);
    rect(buf, w, h, 0, ey - Math.round(u * 1.5), Math.max(1, Math.round(u / 2)), Math.round(u * 1.5), DARK);
    rect(buf, w, h, w - Math.max(1, Math.round(u / 2)), ey - Math.round(u * 1.5), Math.max(1, Math.round(u / 2)), Math.round(u * 1.5), DARK);
    grain(buf, w, h, 0, 0, w, bottom, u, rand, DARK, Math.round(w / (u * 14)));
  }

  /* the shrine's name board: a gold rim, an ink lacquer field and the old characters; with `plain`,
     the title screen's board carries a brass coin instead of the name */
  function plaque(buf, w, h, cx, bottom, u, scale, tight, plain) {
    var glyphW = 12 * scale, gap = tight ? 0 : scale, pad = tight ? 1 : 3 * scale;
    var rim = tight ? 1 : Math.max(1, Math.round(u * 0.8));
    var pw = glyphW * 3 + gap * 2 + pad * 2, ph = glyphW + pad * 2;
    var x = Math.round(cx - pw / 2), y = Math.round(bottom - ph);
    if (x < 1 || x + pw > w - 1 || y < 1) return null;
    rect(buf, w, h, x, y, pw, ph, PAPER);
    rect(buf, w, h, x + rim, y + rim, pw - rim * 2, ph - rim * 2, INK);
    rect(buf, w, h, x + rim * 2, y + rim * 2, pw - rim * 4, Math.max(1, Math.round(rim / 2)), MID);
    if (plain) {
      var r = Math.max(2, Math.min(Math.round(ph / 2) - 2, Math.round(4.5 * scale)));
      var cy = y + Math.round(ph / 2), hole = Math.max(2, Math.round(r * 0.9));
      disc(buf, w, h, cx, cy, r, MID, true);
      disc(buf, w, h, cx, cy, r, DARK, false);
      rect(buf, w, h, cx - hole / 2, cy - hole / 2, hole, hole, INK);
      put(buf, w, h, cx, cy - r, PAPER); put(buf, w, h, cx, cy + r, PAPER);
      put(buf, w, h, cx - r, cy, PAPER); put(buf, w, h, cx + r, cy, PAPER);
    } else {
      for (var k = 0; k < 3; k++) {
        var gx = x + pad + k * (glyphW + gap), gy = y + pad;
        var rows = GLYPHS[["镇", "妖", "塔"][k]];
        for (var r2 = 0; r2 < rows.length; r2++) for (var c = 0; c < rows[r2].length; c++) {
          if (rows[r2][c] === "#") rect(buf, w, h, gx + c * scale, gy + r2 * scale, scale, scale, PAPER);
        }
      }
    }
    return { x0: x, y0: y, x1: x + pw, y1: y + ph };
  }

  /* a paper ofuda strip: ink hooks and a seal, never a blank piece of paper */
  function ofuda(buf, w, h, cx, top, u, len) {
    var ww = Math.max(2, u * 2), hh = Math.max(u * 4, len);
    var x = Math.round(cx - ww / 2), y = Math.round(top);
    rect(buf, w, h, x, y, ww, hh, PAPER);
    rect(buf, w, h, x, y, ww, Math.max(1, Math.round(u / 2)), INK);
    for (var k = 1; k * u < hh - u; k += 2) {
      var ww2 = Math.max(1, Math.round(u * (k % 4 === 1 ? 1.1 : 0.6)));
      rect(buf, w, h, x + Math.max(1, Math.round((ww - ww2) / 2)), y + k * u, ww2, Math.max(1, Math.round(u / 2)), INK);
    }
    rect(buf, w, h, x + Math.max(1, Math.round((ww - u) / 2)), y + hh - u * 2, Math.max(1, u), Math.max(1, u), DARK);
  }

  /* a hanging lantern: a cord from the eave, a dark cap, a lit paper body, a tassel and a halo */
  function lantern(buf, w, h, cx, top, bottom, u) {
    var bh = Math.max(u * 4, Math.round(u * 6)), bw = Math.max(u * 2, Math.round(u * 3));
    var y = Math.round(bottom - bh);
    if (y <= top + u) return;
    rect(buf, w, h, cx - Math.max(1, Math.round(u / 2)), top, Math.max(1, Math.round(u / 2)), y - top, DARK);
    /* a thin halo down each side, in the checker of the dither rather than a fifth colour */
    for (var yy = y - u; yy <= y + bh; yy += Math.max(1, Math.round(u / 2))) {
      put(buf, w, h, cx - Math.round(bw / 2) - u, yy, MID);
      put(buf, w, h, cx + Math.round(bw / 2) + u, yy, MID);
    }
    rect(buf, w, h, cx - Math.round(bw / 2), y, bw, bh, PAPER);
    rect(buf, w, h, cx - Math.round(bw / 2), y, Math.max(1, Math.round(bw / 3)), bh, MID);
    for (var k = 1; k < 4; k++) {
      var lx = cx - Math.round(bw / 2) + Math.round(bw * k / 4);
      rect(buf, w, h, lx, y + Math.max(1, Math.round(u / 2)), Math.max(1, Math.round(u / 2)), bh - u, INK);
    }
    rect(buf, w, h, cx - Math.round(bw / 2) - u / 2, y - Math.max(1, Math.round(u / 2)), bw + u, Math.max(1, Math.round(u / 2)), INK);
    rect(buf, w, h, cx - Math.round(bw / 2) - u / 2, y + bh, bw + u, Math.max(1, Math.round(u / 2)), INK);
    rect(buf, w, h, cx - Math.max(1, Math.round(u / 2)), y + bh + Math.round(u / 2), Math.max(1, u), u, DARK);
    for (var t = 0; t < 3; t++) rect(buf, w, h, cx - u / 2 - t * u / 2, y + bh + u * 1.5 + t * u, u + t * u, Math.max(1, Math.round(u / 2)), INK);
  }

  /* a stone lantern on the terrace: base, shaft, a lit box, a roof cap and a finial */
  function stoneLamp(buf, w, h, cx, baseY, u, s) {
    s = s || 1;
    var x = Math.round(cx), bw = Math.max(3, u * 3 * s), bh = Math.max(2, u * 2 * s), top = baseY - u * 8 * s;
    rect(buf, w, h, x - bw / 2, baseY - u * s, bw, u * s, DARK);
    rect(buf, w, h, x - Math.max(1, u / 2), top + u * 4 * s, Math.max(1, u * s), baseY - top - u * 4 * s, DARK);
    rect(buf, w, h, x - Math.max(1, u / 2), top + u * 4 * s, Math.max(1, Math.round(u / 2)), baseY - top - u * 4 * s, MID);
    rect(buf, w, h, x - bw / 2, top + u * 2 * s, bw, bh, DARK);
    rect(buf, w, h, x - bw / 2 + Math.max(1, u / 2), top + u * 2 * s + Math.max(1, u / 2), bw - u, bh - u, PAPER);
    rect(buf, w, h, x - Math.max(1, u / 2), top + u * 2 * s + Math.max(1, u / 2), Math.max(1, u / 2), bh - u, MID);
    rect(buf, w, h, x - bw, top + u * 2 * s, bw * 2, Math.max(1, Math.round(u / 2)), INK);
    rect(buf, w, h, x - bw, top + u * 2 * s - Math.max(1, Math.round(u / 2)), bw * 2, Math.max(1, Math.round(u / 2)), DARK);
    rect(buf, w, h, x - Math.max(1, Math.round(u / 2)), top, Math.max(1, u * s), Math.max(1, Math.round(u / 2)), MID);
  }

  /* a framed lattice panel: small windows, not a graph over the whole wall */
  function latticePanel(buf, w, h, x0, y0, x1, y1, u, rand) {
    if (x1 - x0 < u * 3 || y1 - y0 < u * 3) return;
    rect(buf, w, h, x0, y0, x1 - x0, y1 - y0, INK);
    rect(buf, w, h, x0 + u, y0 + u, x1 - x0 - u * 2, y1 - y0 - u * 2, DARK);
    var cols = Math.max(2, Math.round((x1 - x0) / (u * 5))), rows = Math.max(2, Math.round((y1 - y0) / (u * 5)));
    var cw = (x1 - x0) / cols, rh = (y1 - y0) / rows;
    for (var c = 1; c < cols; c++) rect(buf, w, h, x0 + c * cw, y0, Math.max(1, Math.round(u / 2)), y1 - y0, MID);
    for (var r = 1; r < rows; r++) rect(buf, w, h, x0, y0 + r * rh, x1 - x0, Math.max(1, Math.round(u / 2)), MID);
    for (var rr = 0; rr < rows; rr++) for (var cc = 0; cc < cols; cc++) {
      if ((rr + cc) % 3 === 0) {
        var cx = x0 + (cc + 0.5) * cw, cy = y0 + (rr + 0.5) * rh;
        rect(buf, w, h, cx - u, cy, u * 2, Math.max(1, Math.round(u / 2)), INK);
      }
    }
    grain(buf, w, h, x0, y0, x1, y1, u, rand, MID, 2);
  }

  function topPanel(buf, w, h, x0, y0, x1, u, rand, plain) {
    var t = y0;
    if (t < 3) return;
    /* a short stage keeps a compact name board: the lintel and the shrine's title, no more */
    var compact = t < Math.round(u * 12);
    var beam = compact ? clamp(Math.round(u / 2), 1, Math.max(1, Math.floor(t * 0.2)))
      : clamp(Math.round(u * 2), 1, Math.max(1, Math.floor(t * 0.25)));
    var lintel = y0 - beam;
    /* the lintel over the window, with a lit edge and rafter blocks */
    rect(buf, w, h, 0, lintel, w, beam, DARK);
    rect(buf, w, h, 0, lintel, w, Math.max(1, Math.round(u / 2)), PAPER);
    rect(buf, w, h, 0, lintel + Math.max(1, Math.round(u / 2)), w, Math.max(1, Math.round(u / 2)), INK);
    for (var bx = Math.round(u * 2); bx < w - u; bx += Math.round(u * 6)) {
      rect(buf, w, h, bx, lintel + u, Math.max(1, u), Math.max(1, Math.round(u / 2)), MID);
    }

    if (compact) {
      rect(buf, w, h, 0, 0, w, Math.max(1, Math.round(u / 2)), PAPER);
      if (lintel - 14 >= 1) plaque(buf, w, h, (x0 + x1) / 2, lintel, u, 1, true, plain);
      rect(buf, w, h, 0, 0, Math.max(1, u), Math.max(1, u), MID);
      rect(buf, w, h, w - Math.max(1, u), 0, Math.max(1, u), Math.max(1, u), MID);
      return;
    }

    var roofH = clamp(Math.round(t * 0.28), Math.round(u * 3), Math.round(u * 10));
    roof(buf, w, h, roofH, u, rand);
    var wallTop = roofH, wallBot = lintel;
    if (wallBot - wallTop < u * 4) return;
    rect(buf, w, h, 0, wallTop, w, wallBot - wallTop, DARK);
    /* broad wall boards, not a grid: a shadow groove every few art pixels */
    for (var gx = x0 + u * 7; gx < x1 - u * 4; gx += u * 13) {
      rect(buf, w, h, gx, wallTop, Math.max(1, Math.round(u / 2)), wallBot - wallTop, INK);
      rect(buf, w, h, gx + Math.max(1, Math.round(u / 2)), wallTop, Math.max(1, Math.round(u / 2)), wallBot - wallTop, MID);
    }
    grain(buf, w, h, 0, wallTop, w, wallBot, u, rand, INK, Math.round(w / (u * 10)));

    /* the plaque sits just above the lintel */
    var s = clamp(Math.floor((wallBot - wallTop - u * 4) / 18), 1, 3), mark = null;
    while (s >= 1) {
      if (wallBot - u * 2 - 18 * s >= wallTop + u * 2) {
        mark = plaque(buf, w, h, (x0 + x1) / 2, wallBot - u * 2, u, s, false, plain);
        if (mark) break;
      }
      s--;
    }
    /* a wall too shallow for the padded board still carries the tight one */
    if (!mark && wallBot - u - 14 >= wallTop) mark = plaque(buf, w, h, (x0 + x1) / 2, wallBot - u, u, 1, true, plain);
    if (!mark) mark = plaque(buf, w, h, (x0 + x1) / 2, lintel, u, 1, true, plain);
    var pw = mark ? mark.x1 - mark.x0 : Math.round((x1 - x0) * 0.5);
    var leftPost = (x0 + x1) / 2 - pw / 2 - u * 3;
    var rightPost = (x0 + x1) / 2 + pw / 2 + u * 3;
    /* two dark posts frame the name board */
    [leftPost, rightPost].forEach(function (px) {
      if (px < x0 + u * 2 || px > x1 - u * 2) return;
      rect(buf, w, h, px - Math.max(1, Math.round(u / 2)), wallTop, Math.max(1, Math.round(u / 2)), wallBot - wallTop, INK);
      rect(buf, w, h, px, wallTop, Math.max(1, u), wallBot - wallTop, DARK);
      rect(buf, w, h, px + Math.max(1, u), wallTop, Math.max(1, Math.round(u / 2)), wallBot - wallTop, MID);
      rect(buf, w, h, px - u, wallTop, u * 3, Math.max(1, Math.round(u / 2)), INK);
      rect(buf, w, h, px - u, wallBot - Math.max(1, Math.round(u / 2)), u * 3, Math.max(1, Math.round(u / 2)), INK);
    });

    /* the transom: one row of small windows under the eaves, only where a storey has room for it */
    var th = wallBot - wallTop > u * 12 ? Math.min(u * 3, wallBot - wallTop - u * 4) : 0;
    if (th >= u * 2) latticePanel(buf, w, h, leftPost + u * 2, wallTop + u, Math.max(leftPost + u * 3, rightPost - u * 2), wallTop + u + th, u, rand);

    /* one tall lattice window over the plaque when the wall is deep enough to have a storey */
    if (mark && mark.y0 - (wallTop + th + u * 2) > u * 5) {
      var lw = Math.min(pw, (rightPost - leftPost) - u * 4);
      latticePanel(buf, w, h, (x0 + x1) / 2 - lw / 2, wallTop + th + u * 2, (x0 + x1) / 2 + lw / 2, mark.y0 - u * 2, u, rand);
    }

    /* lanterns hang in the outer bays, their cords from the transom */
    var hangTop = wallTop + th + u * 2;
    var bodyBottom = wallBot - u;
    if (bodyBottom - hangTop > u * 5) {
      var lx = leftPost - u * 6, rx = rightPost + u * 6;
      if (lx > x0 + u * 2) lantern(buf, w, h, lx, hangTop, bodyBottom, u);
      if (rx < x1 - u * 2) lantern(buf, w, h, rx, hangTop, bodyBottom, u);
      /* ofuda on the outer wall, outside the lanterns */
      if (lx - u * 4 > x0 + u * 2) ofuda(buf, w, h, x0 + u * 4, hangTop, u, Math.min(u * 10, bodyBottom - hangTop - u));
      if (rx + u * 4 < x1 - u * 2) ofuda(buf, w, h, x1 - u * 4, hangTop, u, Math.min(u * 10, bodyBottom - hangTop - u));
    } else if (mark) {
      /* on a short wall, the talismans flank the board instead */
      if (mark.x0 - u * 4 > x0 + u * 2) ofuda(buf, w, h, mark.x0 - u * 3, wallTop + u, u, Math.min(u * 7, wallBot - wallTop - u * 2));
      if (mark.x1 + u * 4 < x1 - u * 2) ofuda(buf, w, h, mark.x1 + u * 3, wallTop + u, u, Math.min(u * 7, wallBot - wallTop - u * 2));
    }
  }

  function bottomPanel(buf, w, h, y1, u, rand) {
    var b = h - y1;
    if (b < 1) return;
    /* the sill: a bright edge, a dark course, then the stone */
    rect(buf, w, h, 0, y1, w, Math.max(1, Math.round(u / 2)), PAPER);
    rect(buf, w, h, 0, y1 + Math.max(1, Math.round(u / 2)), w, Math.max(1, u), DARK);
    rect(buf, w, h, 0, y1 + Math.max(1, Math.round(u * 1.5)), w, Math.max(1, Math.round(u / 2)), INK);

    var top = y1 + Math.round(u * 2);
    if (top >= h) return;
    var depth = h - top;
    rect(buf, w, h, 0, top, w, depth, DARK);
    /* large stones: fewer courses as the terrace deepens, so it reads as masonry and not as stripes */
    var course = clamp(Math.round(b * 0.14), Math.round(u * 3), Math.round(u * 8));
    var block = clamp(Math.round(w * 0.1), Math.round(u * 10), Math.round(u * 22));
    for (var y = top, r = 0; y < h; y += course, r++) {
      rect(buf, w, h, 0, y, w, Math.max(1, Math.round(u / 2)), MID);
      rect(buf, w, h, 0, y + Math.max(1, Math.round(u / 2)), w, Math.max(1, Math.round(u / 2)), INK);
      var off = r % 2 ? Math.round(block / 2) : 0;
      for (var x = -off; x < w; x += block) {
        rect(buf, w, h, x, y, Math.max(1, Math.round(u / 2)), course, INK);
        if (rand() < 0.5) rect(buf, w, h, x + Math.round(u * 2), y + Math.round(course / 2), Math.max(1, u), Math.max(1, Math.round(u / 2)), MID);
      }
    }
    grain(buf, w, h, 0, top, w, h, u, rand, PAPER, Math.round(w / (u * 22)));

    var deep = depth >= u * 6;
    var steps = deep ? clamp(Math.floor(depth / (u * 5)), 2, 6) : 0;
    var stepH = steps ? Math.max(2, Math.floor(depth * 0.42 / steps)) : 0;
    /* the stair: wide at the bottom, rising to the window, its treads lit against the dark stone */
    if (deep) {
      var sw = Math.min(Math.round(w * 0.5), u * 28);
      for (var s = 0; s < steps; s++) {
        var yy = h - (s + 1) * stepH, bw = sw - s * u * 2;
        if (bw < u * 4) break;
        var sx = Math.round((w - bw) / 2);
        rect(buf, w, h, sx, yy, bw, stepH, INK);
        rect(buf, w, h, sx, yy, bw, Math.max(1, Math.round(u / 2)), MID);
        rect(buf, w, h, sx, yy, Math.max(1, Math.round(u / 2)), stepH, DARK);
        rect(buf, w, h, sx + bw - Math.max(1, Math.round(u / 2)), yy, Math.max(1, Math.round(u / 2)), stepH, DARK);
        /* a pale nosing, a step's wear */
        if (rand() < 0.45) rect(buf, w, h, sx + u * 2, yy + Math.max(1, Math.round(u / 2)), Math.max(1, u), Math.max(1, Math.round(u / 2)), PAPER);
      }
    }
    /* the censer on the terrace, clear under the window and over the stair */
    if (depth >= u * 6) {
      var cw = clamp(Math.round(depth * 0.2), u * 8, u * 20), chh = Math.max(u * 4, Math.round(cw * 0.55));
      var cy = clamp(y1 + depth * 0.22, top + u, Math.max(top + u, h - steps * stepH - chh - u * 2));
      if (cy + chh + u * 2 <= h) {
        /* a bowl with two ears, three feet and a live ember */
        rect(buf, w, h, w / 2 - cw / 2, cy, cw, chh, MID);
        rect(buf, w, h, w / 2 - cw / 2, cy, cw, Math.max(1, Math.round(u / 2)), INK);
        /* the belly falls dark, with a lit rim and three studs so it is not a blank pale box */
        rect(buf, w, h, w / 2 - cw / 2, cy + Math.round(chh * 0.55), cw, chh - Math.round(chh * 0.55), DARK);
        rect(buf, w, h, w / 2 + cw / 2 - Math.max(2, u * 2), cy + u, Math.max(2, u * 2), chh - u, INK);
        rect(buf, w, h, w / 2 - cw / 2 + Math.max(1, u / 2), cy + u, Math.max(1, u), chh - u * 2, MID);
        rect(buf, w, h, w / 2 - cw / 2, cy + Math.round(chh * 0.5), cw, Math.max(1, Math.round(u / 2)), INK);
        for (var k2 = -1; k2 <= 1; k2++) {
          rect(buf, w, h, w / 2 + k2 * u * 3, cy + u, Math.max(1, u), Math.max(1, u), INK);
          rect(buf, w, h, w / 2 + k2 * u * 3, cy + u + Math.max(1, u), Math.max(1, u), Math.max(1, Math.round(u / 2)), DARK);
        }
        rect(buf, w, h, w / 2 - cw / 2, cy + chh - u, cw, u, DARK);
        rect(buf, w, h, w / 2 - cw / 2 - u, cy + u, u * 2, Math.max(1, Math.round(u / 2)), MID);
        rect(buf, w, h, w / 2 + cw / 2 - u, cy + u, u * 2, Math.max(1, Math.round(u / 2)), MID);
        rect(buf, w, h, w / 2 - cw / 4, cy + chh, Math.max(1, u), u * 2, DARK);
        rect(buf, w, h, w / 2 + cw / 4 - u, cy + chh, Math.max(1, u), u * 2, DARK);
        rect(buf, w, h, w / 2 - u, cy + u, u * 2, Math.max(1, Math.round(u / 2)), PAPER);
        for (var k = 0; k < 5; k++) put(buf, w, h, w / 2 + (k % 2 ? -1 : 1) * u * (1 + k), cy + u * 2 - k * u, MID);
        for (var m = 0; m < 4; m++) put(buf, w, h, w / 2 + (m % 2 ? -1 : 1) * u * (1 + m % 2), cy - u * (2 + m), MID);
      }
    }
    /* two stone lanterns stand on the terrace when there is room */
    if (depth >= u * 14) {
      var ls = clamp(Math.round(depth / (u * 14)), 1, 3);
      stoneLamp(buf, w, h, w * 0.24, h - u, u, ls);
      stoneLamp(buf, w, h, w * 0.76, h - u, u, ls);
    }
  }

  function sidePanel(buf, w, h, x0, x1, y0, y1, u, rand, left) {
    var sw = x1 - x0;
    if (sw < 1) return;
    rect(buf, w, h, x0, 0, sw, h, INK);
    var inset = Math.max(1, Math.round(u / 2));
    rect(buf, w, h, x0 + inset, 0, Math.max(1, sw - inset * 2), h, DARK);
    if (sw >= u * 2) rect(buf, w, h, left ? x1 - inset : x0, 0, inset, h, MID);
    if (sw >= u * 3) {
      var cx = x0 + Math.round(sw / 2);
      rect(buf, w, h, cx - Math.max(1, Math.round(u / 2)), 0, Math.max(1, u), h, INK);
      rect(buf, w, h, cx, 0, Math.max(1, Math.round(u / 2)), h, MID);
      /* carved diamonds down the post */
      for (var y = y0 + u * 4; y < y1 - u * 4; y += u * 12) {
        var r = Math.max(1, Math.round(u * 1.2));
        for (var k = 0; k <= r; k++) {
          put(buf, w, h, cx - k, y, MID); put(buf, w, h, cx + k, y, MID);
          put(buf, w, h, cx, y - k, MID); put(buf, w, h, cx, y + k, MID);
        }
        rect(buf, w, h, cx - Math.max(1, Math.round(u / 2)), y - Math.max(1, Math.round(u / 2)), Math.max(1, u), Math.max(1, u), PAPER);
      }
    }
    if (sw >= u * 4 && y1 - y0 > u * 18) {
      ofuda(buf, w, h, (x0 + x1) / 2, y0 + u * 4, u, Math.min(u * 9, (y1 - y0) / 3));
      if (y1 - y0 > u * 36) ofuda(buf, w, h, (x0 + x1) / 2, y1 - u * 13, u, u * 9);
    }
    /* a capital at each end, where the post meets the roof and the terrace */
    var cap = Math.max(1, Math.round(u * 1.5));
    rect(buf, w, h, x0, 0, sw, cap, DARK);
    rect(buf, w, h, x0, cap, sw, Math.max(1, Math.round(u / 2)), INK);
    rect(buf, w, h, x0, h - cap, sw, cap, DARK);
    rect(buf, w, h, x0, h - cap - Math.max(1, Math.round(u / 2)), sw, Math.max(1, Math.round(u / 2)), INK);
    rect(buf, w, h, left ? x0 : x1 - Math.max(1, u), cap, Math.max(1, u), Math.max(1, u), PAPER);
    rect(buf, w, h, left ? x0 : x1 - Math.max(1, u), h - cap - u, Math.max(1, u), Math.max(1, u), PAPER);
    grain(buf, w, h, x0, 0, x1, h, u, rand, DARK, Math.round(h / (u * 18)));
  }

  /* the carved inner frame of the window: ink at the glass, a gold bead, a dark rebate */
  function windowTrim(buf, w, h, x0, y0, x1, y1, u) {
    var bead = Math.max(1, Math.round(u / 2)), reb = Math.max(1, Math.round(u / 2));
    rect(buf, w, h, x0 - bead, y0 - bead, (x1 - x0) + bead * 2, bead, PAPER);
    rect(buf, w, h, x0 - bead, y1, (x1 - x0) + bead * 2, bead, PAPER);
    rect(buf, w, h, x0 - bead, y0 - bead, bead, (y1 - y0) + bead * 2, PAPER);
    rect(buf, w, h, x1, y0 - bead, bead, (y1 - y0) + bead * 2, PAPER);
    rect(buf, w, h, x0 - bead * 2 - reb, y0 - bead * 2 - reb, (x1 - x0) + (bead + reb) * 2, reb, INK);
    rect(buf, w, h, x0 - bead * 2 - reb, y1 + bead, (x1 - x0) + (bead + reb) * 2, reb, INK);
    rect(buf, w, h, x0 - bead * 2 - reb, y0 - bead * 2 - reb, reb, (y1 - y0) + (bead + reb) * 2, INK);
    rect(buf, w, h, x1 + bead, y0 - bead * 2 - reb, reb, (y1 - y0) + (bead + reb) * 2, INK);
  }

  /* the stage's own edge: a dark lacquer band with a brass pin at each corner */
  function outerBand(buf, w, h, u) {
    var a = Math.max(1, Math.round(u / 2)), b = Math.max(1, u);
    rect(buf, w, h, 0, 0, w, a, INK);
    rect(buf, w, h, 0, h - a, w, a, INK);
    rect(buf, w, h, 0, 0, a, h, INK);
    rect(buf, w, h, w - a, 0, a, h, INK);
    rect(buf, w, h, a, a, w - a * 2, b, DARK);
    rect(buf, w, h, a, h - a - b, w - a * 2, b, DARK);
    rect(buf, w, h, a, a, b, h - a * 2, DARK);
    rect(buf, w, h, w - a - b, a, b, h - a * 2, DARK);
    var p = Math.max(1, Math.round(u / 2));
    [[a + b, a + b], [w - a - b - p, a + b], [a + b, h - a - b - p], [w - a - b - p, h - a - b - p]].forEach(function (q) {
      rect(buf, w, h, q[0], q[1], p, p, MID);
      rect(buf, w, h, q[0] + p, q[1] + p, p, p, PAPER);
    });
  }

  /* paint the whole stage: the view is left alone (the game canvas covers it), everything else is scenery */
  function paint(W, H, view, onTitle) {
    W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
    if (onTitle == null) onTitle = titleMode;
    var buf = new Uint8Array(W * H);
    buf.fill(INK);
    var u = Math.max(1, Math.round(view.k || 1));
    var x0 = clamp(Math.round(view.x), 0, W), y0 = clamp(Math.round(view.y), 0, H);
    var x1 = clamp(Math.round(view.x + view.w), 0, W), y1 = clamp(Math.round(view.y + view.h), 0, H);
    var rand = rng(W * 73856093 ^ H * 19349663 ^ x0 * 83492791 ^ y0 * 2654435761);
    if (x1 > x0 && y1 > y0) {
      topPanel(buf, W, H, x0, y0, x1, u, rand, onTitle);
      bottomPanel(buf, W, H, y1, u, rand);
      sidePanel(buf, W, H, 0, x0, y0, y1, u, rand, true);
      sidePanel(buf, W, H, x1, W, y0, y1, u, rand, false);
      windowTrim(buf, W, H, x0, y0, x1, y1, u);
    }
    outerBand(buf, W, H, u);
    return buf;
  }

  /* ---------------- the page ---------------- */
  /* the background canvas is resized to the stage's CSS pixels, painted once per layout, and never
     listens for a pointer: a touch outside the game canvas is scenery and goes nowhere. */
  function attach(stage, art, view) {
    var canvas = view && view.querySelector ? view.querySelector("canvas") : null;
    if (!canvas) return null;
    var last = "", raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    function draw() {
      var sr = stage.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      var W = Math.max(1, Math.round(sr.width)), H = Math.max(1, Math.round(sr.height));
      var v = { x: cr.left - sr.left, y: cr.top - sr.top, w: cr.width, h: cr.height, k: cr.width / 160 };
      var key = [W, H, Math.round(v.x * 4), Math.round(v.y * 4), Math.round(v.w * 4), Math.round(v.h * 4)].join(",");
      if (key === last) return;
      last = key;
      var buf = paint(W, H, v, titleMode), img;
      if (art.width !== W) art.width = W;
      if (art.height !== H) art.height = H;
      var ctx = art.getContext("2d");
      if (!ctx) return;
      img = ctx.createImageData(W, H);
      var d = img.data, rgb = TONES.map(function (hex) {
        return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      });
      for (var i = 0; i < W * H; i++) {
        var c = rgb[buf[i]], o = i * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      art.__paint = W + "x" + H;
      art.__title = titleMode ? "1" : "0";
    }
    repaint = function () { last = ""; draw(); };
    function sync() { repaint(); }
    /* lo-game fits once when it starts; paint after the first layout and again after the font settles */
    raf(function () { draw(); raf(draw); });
    window.addEventListener("resize", sync);
    /* the wrapper and the canvas can settle without a window resize on a phone's bars */
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(sync);
      ro.observe(stage); ro.observe(canvas);
    }
    return { draw: sync };
  }

  function setTitle(on) {
    var next = !!on;
    if (next === titleMode) return;
    titleMode = next;
    if (repaint) repaint();
  }

  return { paint: paint, viewRect: viewRect, attach: attach, setTitle: setTitle, TONES: TONES, INSET: INSET };
})();
