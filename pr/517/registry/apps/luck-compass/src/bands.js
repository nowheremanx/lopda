/* 玄机阁's bands: the night sky over the shop and the altar table the almanac page lies on.
   lo-game 1.5.0's fill layout grows the canvas around the 216 x 240 page (sdk/UI.md 13), and `bands` paints
   the whole canvas before the page is copied into its rect, so no paper is left at a phone's edges.
   The scenery is fixed and flat on purpose (UI.md 11): stars, one moon, a few clouds, and the old shop's
   candle, censer and almanacs on the table, drawn from the stage box alone, so a screenshot is repeatable.
   MIT License. Copyright (c) 2026 Haowei Wu. */
var LUCK_BANDS = (function () {
  "use strict";

  /* Fixed stars, never animated: the sky looks the same every frame and in a screenshot. */
  var STARS = [];
  (function () {
    var seed = 0x5f3a91d7;
    function next() {
      seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296;
    }
    for (var i = 0; i < 120; i++) {
      /* mostly paper points, a quarter of them mid, so the field has depth without a dither */
      STARS.push({ u: next(), v: next(), t: i % 4 === 0 ? 2 : 3 });
    }
  })();

  function moonRadius(sky) { return Math.max(4, Math.min(11, Math.floor(sky * 0.17))); }

  /* the sky above the page: stars, a full moon and a few still clouds, no bar at the horizon, so the
     page's dark header joins the night cleanly on every screen */
  function paintSky(s, w, sky) {
    var r0 = moonRadius(sky), moon = { x: Math.round(w * 0.76), y: Math.round(sky * 0.4), r: r0 + 2 };
    var i, st, x, y;
    for (i = 0; i < STARS.length; i++) {
      st = STARS[i];
      x = Math.round(st.u * w); y = 1 + Math.round(st.v * (sky - 3));
      if (y >= sky - 1) continue;
      if ((x - moon.x) * (x - moon.x) + (y - moon.y) * (y - moon.y) <= moon.r * moon.r) continue;
      s.pixel(x, y, st.t);
    }
    if (sky >= 18) {
      var mx = moon.x, my = moon.y, r = r0;
      s.circle(mx, my, r, s.PAPER, true);
      /* three flat craters, sized with the moon so a tall sky keeps a small face */
      var k = Math.max(1, Math.floor(r / 4));
      s.rect(mx - k * 2, my - k, k, k, s.DARK);
      s.rect(mx + k, my + Math.floor(k / 2), Math.max(1, k - 1), Math.max(1, k - 1), s.DARK);
      s.pixel(mx + k * 2, my - k * 2, s.DARK);
    }
    /* three clouds well above the roof, each a lump of lumps, so the page's dark header joins the night */
    var puffs = [[0.17, 0.40, 1.15], [0.44, 0.63, 0.9], [0.63, 0.30, 0.8]];
    for (i = 0; i < puffs.length; i++) {
      var ccx = Math.round(puffs[i][0] * w), cbase = Math.round(puffs[i][1] * sky);
      var cr = Math.max(2, Math.min(7, Math.round(sky * 0.075 * puffs[i][2])));
      if (cbase - cr * 2 < 2) continue;
      s.circle(ccx - cr, cbase - Math.round(cr * 0.6), Math.round(cr * 0.8), s.MID, true);
      s.circle(ccx + cr, cbase - Math.round(cr * 0.65), Math.round(cr * 0.75), s.MID, true);
      s.circle(ccx, cbase - cr, cr, s.MID, true);
      s.rect(ccx - Math.round(cr * 1.6), cbase - 2, Math.round(cr * 3.2), 2, s.MID);
      s.rect(ccx - 1, cbase - cr * 2, 3, 1, s.PAPER);        /* the moonlit top edge */
    }
  }

  /* the altar: a dark room, the page's shadow on the wall, and the table with candle, censer and books */
  function paintAltar(s, w, top, fh) {
    if (fh < 3) return;
    var tableY = top + Math.max(6, Math.round(fh * 0.5));
    s.rect(0, top, w, 1, s.DARK);                            /* the page's edge shadow */
    s.dither(0, top + 1, w, Math.min(3, fh - 1), s.DARK, 1); /* and a soft fall on the wall */
    var oh = Math.max(6, Math.min(34, tableY - top - 5));   /* the candle's flame needs three rows of its own */
    paintCandle(s, Math.round(w * 0.16), tableY, oh);
    paintCenser(s, Math.round(w * 0.5), tableY, oh);
    paintBooks(s, Math.round(w * 0.84), tableY, oh);
    /* the table: one lit edge, then the dark wooden front with a recessed panel and two ring pulls */
    s.rect(0, tableY, w, 1, s.MID);
    var front = tableY + 1, frontH = top + fh - front;
    if (frontH > 0) s.rect(0, front, w, frontH, s.DARK);
    if (frontH >= 12) {
      s.frame(5, front + 3, w - 10, frontH - 6, s.INK);
      if (frontH >= 20) {
        var py = front + Math.round(frontH * 0.55);
        s.circle(Math.round(w * 0.34), py, 2, s.MID, false);
        s.circle(Math.round(w * 0.66), py, 2, s.MID, false);
      }
    }
  }

  /* a candle in a dish: the one bright thing on the altar, so the band reads as a lit room */
  function paintCandle(s, cx, baseY, oh) {
    var bodyH = Math.max(3, oh - 4), footY = baseY - 3, topY = footY - bodyH;
    s.rect(cx - 4, footY, 9, 3, s.INK);
    s.rect(cx - 3, footY, 7, 1, s.MID);
    s.rect(cx - 2, topY, 5, bodyH, s.PAPER);
    s.rect(cx - 2, topY + 1, 1, bodyH - 2, s.MID);           /* the lit side of the wax */
    s.pixel(cx + 1, topY + Math.floor(bodyH / 2), s.DARK);   /* one drip */
    s.rect(cx, topY - 1, 1, 1, s.INK);                       /* the wick */
    s.pixel(cx, topY - 4, s.PAPER);
    s.rect(cx - 1, topY - 3, 3, 1, s.PAPER);
    s.pixel(cx, topY - 2, s.MID);
  }

  /* the censer: a bowl with two ears, three legs and three sticks, one thin wisp of smoke */
  function paintCenser(s, cx, baseY, oh) {
    var bowlH = Math.max(4, Math.round(oh * 0.4)), rimY = baseY - 2 - bowlH, i, ww;
    for (i = 0; i < bowlH; i++) {
      ww = Math.max(4, Math.round(16 - i * 7 / bowlH));
      s.rect(cx - Math.round(ww / 2), rimY + i, ww, 1, i === 0 ? s.INK : s.MID);
    }
    s.rect(cx - 10, rimY, 3, 2, s.MID);                      /* ears */
    s.rect(cx + 8, rimY, 3, 2, s.MID);
    s.rect(cx - 6, baseY - 2, 1, 2, s.MID);                  /* legs */
    s.rect(cx - 1, baseY - 2, 1, 2, s.MID);
    s.rect(cx + 5, baseY - 2, 1, 2, s.MID);
    for (i = -1; i <= 1; i++) {                              /* the sticks */
      s.rect(cx + i * 2, rimY - 3, 1, 3, s.MID);
      s.pixel(cx + i * 2, rimY - 4, s.PAPER);
    }
    /* one wisp, every other row, curling left: still, not a plume */
    if (oh >= 14) {
      s.pixel(cx + 1, rimY - 6, s.MID);
      s.pixel(cx + 2, rimY - 7, s.DARK);
      s.pixel(cx + 1, rimY - 8, s.MID);
      s.pixel(cx, rimY - 9, s.DARK);
    }
  }

  /* the shop's old almanacs, stacked corner to the viewer: dark covers, paper page edges */
  function paintBooks(s, cx, baseY, oh) {
    var bw = Math.max(14, Math.min(26, Math.round(oh * 1.2))), bh = Math.max(3, Math.round(oh / 5));
    var x = cx - Math.round(bw / 2), y = baseY - bh;
    s.rect(x, y, bw, bh, s.DARK);
    s.rect(x, y + bh - 1, bw, 1, s.PAPER);
    s.rect(x + 1, y, 1, bh - 1, s.MID);
    x += 3; y -= bh - 1; bw -= 5;
    s.rect(x, y, bw, bh, s.DARK);
    s.rect(x, y + bh - 1, bw, 1, s.PAPER);
    s.rect(x + 1, y, 1, bh - 1, s.MID);
  }

  /* a stage too short for the page's width: the dark cabinet on each side, not paper */
  function paintSide(s, x, pw, h, left) {
    s.rect(x, 0, pw, h, s.INK);
    s.rect(left ? x + pw - 1 : x, 0, 1, h, s.DARK);
    for (var gx = x + 4; gx < x + pw - 2; gx += 6) s.dither(gx, 0, 1, h, s.DARK, 1);
    s.rect(left ? x + 2 : x + pw - 3, Math.round(h * 0.28), 1, 2, s.MID);
    s.rect(left ? x + 2 : x + pw - 3, Math.round(h * 0.68), 1, 2, s.MID);
  }

  function paint(s, st) {
    var w = st.w, h = st.h, x = st.x, y = st.y, worldR = x + st.worldW, worldB = y + st.worldH;
    s.clear(s.INK);
    if (y > 0) paintSky(s, w, y);
    if (h > worldB) paintAltar(s, w, worldB, h - worldB);
    if (x > 0) paintSide(s, 0, x, h, true);
    if (w > worldR) paintSide(s, worldR, w - worldR, h, false);
  }

  return { paint: paint };
})();
