/* 矿工老张: the screen around the mine.
   The mine is always 160 x 144 (320 x 288 on the framebuffer): its levels, its items and the hook's reach do not
   change with the phone. A phone's screen is taller than that, so the canvas grows to fill it:
   - above the mine, a taller sky with the scoreboard painted in it (level, cash, target, time, dynamite);
   - on tall phones, below the mine, a band of bedrock where the mine carts fill up as the cash comes in
     (Old Wang's cart beside it once he digs).
   Neither band is part of the mine and the hook never reaches them; Old Wang, his taunts and his label stay inside
   the mine's own sky, so the scoreboard never covers him and he never covers it.
   Everything is drawn in the four tones with putImageData, like the mine. */
var GM = (typeof GM !== "undefined" && GM) || {};

GM.SKY_MIN = 56;     /* framebuffer rows the full scoreboard needs: label, cash at 2x, the gauge */
GM.SKY_SLIM = 18;    /* a short screen (Safari with its bars) gets the scoreboard on one line instead */
GM.ROCK_MIN = 48;    /* the bedrock band only when it has room for a cart on its rails */

/* The canvas for a stage of w x h CSS pixels: it always covers the stage, edge to edge, with no paper left over.
   - Normally it is the mine's 320 columns across the width and as many rows as the height allows (rounded up: part
     of the last row is cut off by the stage). Rows over the mine's 288 become sky; on tall phones, also bedrock.
   - Under SKY_MIN rows of sky the scoreboard goes slim (one line).
   - A stage too short for even that (Safari with its bars, a desktop window) fits by height instead, and the canvas
     grows wider than the mine: the columns at each side carry the sky, the ground and the dirt on (GM.paintSides),
     never items, and the hook never reaches them.
   Returns {W, H, x0, sky, rock, k, slim}: canvas columns and rows, the mine's left edge, sky rows above the mine,
   bedrock rows below it, CSS pixels a canvas pixel. */
GM.frameLayout = function (w, h) {
  var W = GM.BW, H = GM.BH + GM.SKY_MIN, k = 1;
  if (w > 0 && h > 0) {
    k = w / GM.BW;
    H = Math.ceil(h / k - 0.01);
    if (H < GM.BH + GM.SKY_SLIM) {
      /* a little short (a phone in Safari): the slim line; far too short (a wide window): the full scoreboard */
      H = H >= GM.BH ? GM.BH + GM.SKY_SLIM : GM.BH + GM.SKY_MIN;
      k = h / H;
      W = Math.max(GM.BW, Math.ceil(w / k - 0.01));
    }
  }
  var extra = H - GM.BH, sky = extra, rock = 0;
  if (extra >= GM.SKY_MIN + GM.ROCK_MIN + 20) {
    /* a little under half of what is left goes to the sky, so the mine sits low like a real dig */
    sky = Math.max(GM.SKY_MIN + 16, Math.min(104, Math.round(extra * 0.45)));
    rock = extra - sky;
  }
  return { W: W, H: H, x0: Math.floor((W - GM.BW) / 2), sky: sky, rock: rock, k: k, slim: sky < GM.SKY_MIN };
};

GM.L = GM.frameLayout(0, 0);
GM.setLayout = function (L) { GM.L = L; GM._skyKey = GM._rockKey = GM._sideKey = ""; GM._skyImg = GM._rockImg = null; };

/* ---------- lopix12 for the scoreboard ----------
   The app carries lopix12 (sdk/fonts, OFL) for its title screen: tools/bundle-app.mjs writes the glyphs it uses into
   the data-lo-font block, which hands them to LoTitle.font. The scoreboard reads the same block, so both screens
   share one font and one copy of it. Without the block (a test's fake page) the scoreboard falls back to the
   mine's 3 x 5 digits. */
GM.hudFont = function () {
  if (GM._hudFont !== undefined) return GM._hudFont;
  GM._hudFont = null;
  try {
    var el = typeof document !== "undefined" && document.querySelector && document.querySelector("script[data-lo-font]");
    var m = el && /LoTitle\.font\((\{.*\})\)/.exec(el.textContent || "");
    if (m) GM._hudFont = JSON.parse(m[1]);
  } catch (e) { GM._hudFont = null; }
  return GM._hudFont;
};

GM._hudGlyphs = {};
GM.hudGlyph = function (ch) {
  if (GM._hudGlyphs[ch]) return GM._hudGlyphs[ch];
  var F = GM.hudFont(), h = F ? F.cell : 13, src = F && (F.glyphs[ch] || F.glyphs["?"]), adv = 6, m, i;
  if (src) {
    var cut = src.indexOf(":"), raw = atob(src.slice(cut + 1));
    adv = +src.slice(0, cut);
    m = new Uint8Array(h * adv);
    for (i = 0; i < h * adv; i++) m[i] = (raw.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  } else {
    m = new Uint8Array(h * adv);
  }
  return (GM._hudGlyphs[ch] = { w: adv, h: h, m: m });
};

/* a band: one tone index a pixel, 320 wide; the canvas rows above or below the mine */
GM.band = function (h, w) { w = w || GM.L.W; return { w: w, h: h, b: new Uint8Array(w * Math.max(1, h)) }; };
GM.bandRect = function (bd, x, y, w, h, c) {
  var x0 = Math.max(0, Math.round(x)), x1 = Math.min(bd.w, Math.round(x + w));
  var y0 = Math.max(0, Math.round(y)), y1 = Math.min(bd.h, Math.round(y + h)), yy, xx;
  for (yy = y0; yy < y1; yy++) for (xx = x0; xx < x1; xx++) bd.b[yy * bd.w + xx] = c;
};
/* a sprite into a band; with a tone, its outline and fill all in that one tone (a faint silhouette) */
GM.bandSprite = function (bd, s, x, y, tone) {
  for (var sy = 0; sy < s.h; sy++) {
    for (var sx = 0; sx < s.w; sx++) {
      var c = s.b[sy * s.w + sx];
      if (c !== GM.CLEAR) GM.bandRect(bd, x + sx, y + sy, 1, 1, tone != null && c !== GM.PAPER ? tone : c);
    }
  }
};
GM.hudWidth = function (s, k) {
  if (!GM.hudFont()) return GM.textWidth(s, 2 * (k || 1));
  var w = 0, a = Array.from(String(s));
  for (var i = 0; i < a.length; i++) w += GM.hudGlyph(a[i]).w * (k || 1);
  return w;
};
/* text at (x, y), its cell's top; k framebuffer pixels a font pixel. Returns the x after it. */
GM.hudText = function (bd, s, x, y, c, k) {
  k = k || 1;
  if (!GM.hudFont()) {
    var f = GM.FONT3, t = String(s), i, j, q, kk = 2 * k;
    for (i = 0; i < t.length; i++) {
      var g = f[t.charAt(i)] || f["?"];
      for (j = 0; j < g.length; j++) for (q = 0; q < 3; q++) if (g[j].charAt(q) === "1") GM.bandRect(bd, x + i * 4 * kk + q * kk, y + 1 + j * kk, kk, kk, c);
    }
    return x + GM.textWidth(t, kk);
  }
  var a = Array.from(String(s)), cx = x;
  for (var n = 0; n < a.length; n++) {
    var gl = GM.hudGlyph(a[n]);
    for (var yy = 0; yy < gl.h; yy++) {
      for (var xx = 0; xx < gl.w; xx++) if (gl.m[yy * gl.w + xx]) GM.bandRect(bd, cx + xx * k, y + yy * k, k, k, c);
    }
    cx += gl.w * k;
  }
  return cx;
};

/* ---------- the sky: the scoreboard ---------- */
GM.skyKey = function (state, T) {
  var sec = Math.ceil(state.time);
  return [GM.L.sky, state.level, state.bank, state.target, sec, state.screen === "play" && sec <= 10, state.dynamite, T.level].join("|");
};

/* the slim scoreboard: one line, level and cash on the left with a short gauge, dynamite and seconds on the right */
GM.paintSkySlim = function (bd, state, T) {
  var W = bd.w, H = bd.h, y = Math.max(0, Math.round((H - 13) / 2)), x;
  var met = state.bank >= state.target;
  GM.bandRect(bd, 0, 0, W, H, GM.PAPER);
  x = GM.hudText(bd, GM.fmt(T.level, { n: state.level }), 6, y, GM.DARK, 1) + 6;
  x = GM.hudText(bd, "$" + GM.money(state.bank), x, y, GM.INK, 1);
  if (met) {
    GM.bandRect(bd, x + 3, y - 1, GM.hudWidth(T.hudMet) + 6, 14, GM.INK);
    x = GM.hudText(bd, T.hudMet, x + 6, y, GM.PAPER, 1) + 3;
  } else {
    x = GM.hudText(bd, "/" + GM.money(state.target), x, y, GM.DARK, 1);
  }
  var gw = 34, gx = x + 6, fill = met ? 1 : GM.levelShare(state, state.bank - (state.levelBank || 0));
  GM.bandRect(bd, gx, y + 4, gw, 6, GM.INK);
  GM.bandRect(bd, gx + 1, y + 5, gw - 2, 4, GM.MID);
  GM.bandRect(bd, gx + 1, y + 5, Math.round((gw - 2) * fill), 4, GM.INK);
  var sec = Math.max(0, Math.ceil(state.time)), st = sec + T.hudSec, sw = GM.hudWidth(st);
  var low = state.screen === "play" && sec <= 10;
  if (low) GM.bandRect(bd, W - 6 - sw - 3, y - 1, sw + 6, 14, GM.INK);
  GM.hudText(bd, st, W - 6 - sw, y, low ? GM.PAPER : GM.INK, 1);
  var dn = "×" + Math.max(0, state.dynamite || 0), dw = GM.hudWidth(dn), dx = W - 6 - sw - 12 - dw;
  GM.hudText(bd, dn, dx, y, state.dynamite > 0 ? GM.INK : GM.MID, 1);
  GM.bandSprite(bd, GM.SPR.dynIcon, dx - 15, y - 2, state.dynamite > 0 ? null : GM.MID);
};

GM.paintSky = function (bd, state, T) {
  var W = bd.w, H = bd.h, i;
  if (GM.L.slim) { GM.paintSkySlim(bd, state, T); return; }
  GM.bandRect(bd, 0, 0, W, H, GM.PAPER);
  /* a few clouds where the sky is tall enough, between the two halves of the scoreboard, never under its words */
  if (H >= 72) {
    var clouds = [[156, H - 30, 30], [206, H - 46, 22], [126, H - 58, 18]];
    for (i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      if (c[1] < 6) continue;
      GM.bandRect(bd, c[0], c[1], c[2], 3, GM.MID);
      GM.bandRect(bd, c[0] + 4, c[1] - 3, c[2] - 10, 3, GM.MID);
      GM.bandRect(bd, c[0] + 9, c[1] - 5, Math.max(4, c[2] - 20), 2, GM.MID);
    }
  }
  var top = Math.max(2, Math.round((H - 54) / 2));
  var met = state.bank >= state.target;

  /* left: the level, the cash big, the target after it, and how far the cash has come */
  GM.hudText(bd, GM.fmt(T.level, { n: state.level }), 8, top, GM.DARK, 1);
  var cash = "$" + GM.money(state.bank);
  var x = GM.hudText(bd, cash, 8, top + 13, GM.INK, 2) + 4;
  if (met) {
    var mw = GM.hudWidth(T.hudMet) + 6;
    GM.bandRect(bd, x, top + 24, mw, 14, GM.INK);
    GM.hudText(bd, T.hudMet, x + 3, top + 25, GM.PAPER, 1);
  } else {
    GM.hudText(bd, "/" + GM.money(state.target), x, top + 26, GM.DARK, 1);
  }
  var gw = 132, gy = top + 43, fill = met ? 1 : GM.levelShare(state, state.bank - (state.levelBank || 0));
  GM.bandRect(bd, 8, gy, gw, 8, GM.INK);
  GM.bandRect(bd, 10, gy + 2, gw - 4, 4, GM.PAPER);
  for (i = 0; i < gw - 4; i += 2) GM.bandRect(bd, 10 + i, gy + 2 + (i >> 1) % 2 * 2, 1, 2, GM.MID);
  GM.bandRect(bd, 10, gy + 2, Math.round((gw - 4) * fill), 4, GM.INK);

  /* right: the seconds left; the last ten turn over like the old bar did */
  var sec = Math.max(0, Math.ceil(state.time)), s = String(sec);
  var low = state.screen === "play" && sec <= 10;
  GM.hudText(bd, T.hudTime, W - 8 - GM.hudWidth(T.hudTime), top, GM.DARK, 1);
  var sw = GM.hudWidth(s, 2), uw = GM.hudWidth(T.hudSec), sx = W - 8 - uw - sw;
  if (low) GM.bandRect(bd, sx - 4, top + 13, sw + uw + 8, 28, GM.INK);
  GM.hudText(bd, s, sx, top + 13, low ? GM.PAPER : GM.INK, 2);
  GM.hudText(bd, T.hudSec, sx + sw, top + 26, low ? GM.PAPER : GM.DARK, 1);

  /* the dynamite under the clock: always there, so B is never a mystery; faint when there is none */
  var dn = "×" + Math.max(0, state.dynamite || 0), dw = GM.hudWidth(dn);
  var dx = W - 8 - dw - 18;
  GM.bandSprite(bd, GM.SPR.dynIcon, dx, top + 39, state.dynamite > 0 ? null : GM.MID);
  GM.hudText(bd, dn, W - 8 - dw, top + 41, state.dynamite > 0 ? GM.INK : GM.MID, 1);
};

/* ---------- the bedrock: the carts ---------- */
/* how far this level has come: the cash is counted over the whole run, so the gauge and the carts count from what
   the level started with (a level 11 that starts at $41,500 of $43,900 would otherwise open nearly full) */
GM.levelShare = function (state, amount) {
  var start = state.levelBank || 0, need = Math.max(1, (state.target || 0) - start);
  return Math.max(0, Math.min(1, amount / need));
};
GM.cartPile = function (share) { return Math.floor(6 * share); };

GM.rockKey = function (state) {
  var r = state.rival;
  return [GM.L.rock, state.bank >= state.target, GM.cartPile(GM.levelShare(state, state.bank - (state.levelBank || 0))),
    r ? GM.cartPile(GM.levelShare(state, r.haul)) : -1].join("|");
};

/* a nugget in a cart: bright on the dark rock, so no ink outline (the mine's own small gold has one and vanishes here) */
GM.bandNugget = function (bd, x, y) {
  GM.bandRect(bd, x + 2, y, 6, 1, GM.MID);
  GM.bandRect(bd, x + 1, y + 1, 8, 1, GM.MID);
  GM.bandRect(bd, x + 2, y + 1, 2, 1, GM.PAPER);
  GM.bandRect(bd, x, y + 2, 10, 2, GM.MID);
  GM.bandRect(bd, x + 6, y + 2, 4, 2, GM.DARK);
  GM.bandRect(bd, x + 1, y + 4, 8, 1, GM.DARK);
};

GM.drawCart = function (bd, x, y, pile, full, label) {
  var i;
  /* the load first, so the cart's rim covers its bottom */
  var spots = [[4, 0], [18, -1], [32, 0], [11, -6], [25, -6], [18, -11]];
  for (i = 0; i < pile; i++) GM.bandNugget(bd, x + 10 + spots[i][0], y - 5 + spots[i][1]);
  if (full) GM.bandSprite(bd, GM.SPR.miniGem, x + 44, y - 12);
  GM.bandRect(bd, x, y, 64, 20, GM.MID);
  GM.bandRect(bd, x + 2, y + 2, 60, 16, GM.DARK);
  GM.bandRect(bd, x + 2, y + 9, 60, 1, GM.MID);
  GM.bandRect(bd, x + 6, y + 4, 2, 2, GM.MID);
  GM.bandRect(bd, x + 56, y + 4, 2, 2, GM.MID);
  if (label) GM.hudText(bd, label, x + 26, y + 4, GM.PAPER, 1);
  for (i = 0; i < 2; i++) {
    var wx = x + 8 + i * 38;
    GM.bandRect(bd, wx, y + 18, 10, 8, GM.MID);
    GM.bandRect(bd, wx + 3, y + 21, 4, 2, GM.INK);
  }
};

GM.paintRock = function (bd, state) {
  var W = bd.w, H = bd.h, i;
  GM.bandRect(bd, 0, 0, W, H, GM.INK);
  GM.bandRect(bd, 0, 0, W, 2, GM.DARK);
  /* the stones of the bedrock: a fixed pattern, so the band never flickers between levels */
  var stoneH = Math.max(10, H - 46);
  for (i = 0; i < 18; i++) {
    var sx = (i * 61 + (i % 3) * 17) % (W - 18), sy = 8 + (i * 41) % stoneH, sw = 10 + (i * 7) % 16;
    GM.bandRect(bd, sx + 1, sy, sw - 2, 1, GM.DARK);
    GM.bandRect(bd, sx, sy + 1, sw, 4, GM.DARK);
    GM.bandRect(bd, sx + 1, sy + 5, sw - 2, 1, GM.DARK);
    GM.bandRect(bd, sx + 2, sy + 1, 3, 1, GM.MID);
  }
  /* the rails, near the bottom, on a clear strip of rock */
  var ry = H - 14;
  GM.bandRect(bd, 0, ry - 34, W, 48, GM.INK);
  GM.bandRect(bd, 0, ry, W, 2, GM.MID);
  GM.bandRect(bd, 0, ry + 7, W, 2, GM.MID);
  for (i = 2; i < W; i += 12) GM.bandRect(bd, i, ry + 2, 6, 5, GM.DARK);
  var mine = GM.cartPile(GM.levelShare(state, state.bank - (state.levelBank || 0)));
  GM.drawCart(bd, 20, ry - 26, mine, state.bank >= state.target, "");
  if (state.rival) {
    var his = GM.cartPile(GM.levelShare(state, state.rival.haul));
    GM.drawCart(bd, W - 84, ry - 26, his, false, "王");
  }
};

/* paint the two bands when what they show has changed; the mine itself is put every frame by GM.present */
/* the columns beside the mine on a wide canvas: each row carries on what the mine's edge column shows (sky, hills,
   the ground line, the seam), and the dirt below gets the same sparse specks; nothing else */
GM.paintSides = function (ctx, state) {
  var L = GM.L, bg = state.bg, wl = L.x0, wr = L.W - GM.BW - L.x0, side, w, x0, img, u32, x, y, t, edge, h;
  if (!bg) return;
  var dirtTop = (GM.GROUND + 7) * GM.SCALE;
  for (side = 0; side < 2; side++) {
    w = side ? wr : wl;
    if (w <= 0) continue;
    x0 = side ? L.x0 + GM.BW : 0;
    edge = side ? GM.BW - 1 : 0;
    img = ctx.createImageData(w, GM.BH);
    u32 = new Uint32Array(img.data.buffer);
    for (y = 0; y < GM.BH; y++) {
      for (x = 0; x < w; x++) {
        if (y < dirtTop) t = bg[y * GM.BW + edge];
        else {
          h = (Math.imul((x0 + x) >> 1, 73856093) ^ Math.imul(y >> 1, 19349663)) >>> 0;
          t = h % 53 === 0 ? GM.MID : GM.DARK;
        }
        u32[y * w + x] = GM.RGB32[t === GM.CLEAR ? GM.PAPER : t];
      }
    }
    ctx.putImageData(img, x0, L.sky);
  }
};

GM.paintBands = function (ctx, state, T) {
  var L = GM.L, img, bd, u32, i, key;
  if (L.W > GM.BW) {
    key = L.W + "|" + L.H + "|" + state.bgKey;
    if (key !== GM._sideKey) { GM._sideKey = key; GM.paintSides(ctx, state); }
  }
  if (L.sky > 0) {
    key = GM.skyKey(state, T);
    if (key !== GM._skyKey) {
      GM._skyKey = key;
      bd = GM.band(L.sky);
      GM.paintSky(bd, state, T);
      img = GM._skyImg || (GM._skyImg = ctx.createImageData(L.W, L.sky));
      u32 = new Uint32Array(img.data.buffer);
      for (i = 0; i < bd.b.length; i++) u32[i] = GM.RGB32[bd.b[i]];
      ctx.putImageData(img, 0, 0);
    }
  }
  if (L.rock > 0) {
    key = GM.rockKey(state);
    if (key !== GM._rockKey) {
      GM._rockKey = key;
      bd = GM.band(L.rock);
      GM.paintRock(bd, state);
      img = GM._rockImg || (GM._rockImg = ctx.createImageData(L.W, L.rock));
      u32 = new Uint32Array(img.data.buffer);
      for (i = 0; i < bd.b.length; i++) u32[i] = GM.RGB32[bd.b[i]];
      ctx.putImageData(img, 0, L.sky + GM.BH);
    }
  }
};
