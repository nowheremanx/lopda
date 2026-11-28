/* The room around the world.  lo-game's fill canvas grows past the 216 x 240
 * screen (sdk/UI.md 13, LO-GAME.md 2.1) and calls this before the world is
 * copied on top, so a tall phone is the diner's wall, shelf and floor, never
 * paper bars.  Scenery only: the day, the money and the reputation stay in the
 * world, where the game draws them.
 *
 * Every band keeps the tone of the world's own edge beside it — the day wall
 * is paper with ink posts, the night wall dark, the mountain's sky mid — so the
 * picture reads as one room.  A band row is never left bare paper, and nothing
 * in a band moves, so the frame stays calm behind menus, dialogs and play.
 */
var BAND_SCREENS = { night: "night", ending: "valley", title: "valley", battle: "battle", forest: "forest" };

function bandKind() {
  return BAND_SCREENS[bandScreen] || "room";
}

function paintBands(s, st) {
  var kind = bandKind();
  if (kind === "room" || kind === "night") roomBands(s, st, kind === "night");
  else if (kind === "valley") valleyBands(s, st, bandScreen);
  else if (kind === "battle") battleBands(s, st);
  else forestBands(s, st);
}

/* ---------------- the diner ---------------- */
function roomBands(s, st, night) {
  var w = st.w, h = st.h, x0 = st.x, y0 = st.y, ww = st.worldW, wh = st.worldH;
  var fb = y0 + wh;
  s.clear(night ? 1 : 3);
  if (y0 > 0) roomCeiling(s, w, y0, night);
  if (fb < h) floorBoards(s, 0, w, fb, h - fb, wh, night);
  if (x0 > 0) roomSide(s, st, 0, x0, night, true);
  if (x0 + ww < w) roomSide(s, st, x0 + ww, w - (x0 + ww), night, false);
}
/* the ceiling over the world: a beam, its posts, the shelf of jars by the
 * right wall and the noren that hangs over the kitchen pass */
function roomCeiling(s, w, rows, night) {
  var wall = night ? 1 : 3, beam = Math.min(4, rows);
  s.rect(0, 0, w, rows, wall);
  s.rect(0, 0, w, beam, 0);
  if (rows > beam) s.rect(0, beam, w, 1, 1);
  var floorLine = rows - 2;
  if (floorLine > beam + 1) {
    for (var px = 18; px < w - 8; px += 46) {
      s.rect(px, beam + 1, 3, floorLine - beam - 1, 0);
      s.rect(px + 3, beam + 1, 1, floorLine - beam - 1, 1);
    }
  }
  if (rows >= 16) jarShelf(s, Math.max(Math.floor(w * 0.5), 40), w - 8, rows - 6, night);
  if (rows >= 26) noren(s, 10, beam + 4, Math.min(Math.floor(w * 0.42), 84),
    Math.min(rows - beam - 14, 34));
  if (rows >= 8) {
    /* the rail the band ends on, so the wall above the screen is wood, not paper */
    s.rect(0, rows - 2, w, 1, 1);
    s.rect(0, rows - 1, w, 1, 0);
  }
}

/* a plank with the restaurant's jars and bottles standing on it */
function jarShelf(s, x0, x1, plank, night) {
  if (x1 - x0 < 24) return;
  var top = plank;
  s.rect(x0, top, x1 - x0, 2, 0);
  s.rect(x0, top + 2, x1 - x0, 1, 1);
  var n = Math.max(3, Math.floor((x1 - x0) / 15));
  var step = (x1 - x0) / n;
  for (var i = 0; i < n; i++) {
    var jx = Math.round(x0 + i * step + step / 2);
    var hgt = Math.min(6 + ((i * 5) % 7), Math.max(2, top - 6));
    var wid = 4 + ((i * 3) % 4);
    var tone = i % 4 === 0 ? 0 : i % 4 === 1 ? 1 : i % 4 === 2 ? 2 : (night ? 3 : 1);
    s.rect(jx - (wid >> 1), top - hgt, wid, hgt, tone);
    if (tone !== 0) s.rect(jx - (wid >> 1), top - hgt, wid, 1, 0);   /* the jar's mouth */
    if (wid > 5) s.pixel(jx, top - hgt + 3, 3);                       /* a glint of glaze */
  }
}

/* the noren over the pass: a rod and four cloth strips, the same cloth the
 * plate's doorway hangs */
function noren(s, x, y, w, h) {
  if (w < 20 || h < 8) return;
  var cloth = 2, edge = 0;                 /* the plate's cloth is mid on either wall */
  s.rect(x - 1, y, w + 2, 1, 0);
  var panels = w >= 60 ? 5 : 4, pw = Math.floor((w - (panels - 1)) / panels);
  for (var i = 0; i < panels; i++) {
    var px0 = x + i * (pw + 1);
    s.rect(px0, y + 1, pw, h, cloth);
    s.rect(px0, y + 1, 1, h, edge);
    s.rect(px0 + pw - 1, y + 1, 1, h, edge);
    s.rect(px0, y + h, pw, 1, edge);
    s.rect(px0 + 1, y + Math.floor(h * 0.62), Math.max(1, pw - 2), 1, 1);
    if (i === ((panels - 1) >> 1)) s.circle(px0 + (pw >> 1), y + Math.floor(h * 0.32), 2, 3, true);
  }
}

/* the side columns: the wall's rails and post beside the world's own ink edge,
 * then the floor boards below the rail.  A stage too short for the world's
 * width grows these instead of showing paper. */
function roomSide(s, st, rx, rw, night, left) {
  var top = st.y, wh = st.worldH, wallH = Math.min(96, wh);
  var post = Math.min(3, rw);
  s.rect(rx, top, rw, wallH, night ? 1 : 3);
  s.rect(rx, top + 28, rw, 3, 0);
  s.rect(rx, top + 92, rw, Math.min(4, Math.max(0, wh - 92)), 0);
  if (post > 0) {
    var px = left ? rx + rw - post : rx;
    s.rect(px, top, post, wallH, 0);
    var edge = left ? px - 1 : px + post;
    if (rw - post > 1 && edge >= rx && edge < rx + rw) s.rect(edge, top, 1, wallH, 1);
  }
  if (wh > wallH) floorBoards(s, rx, rw, top + wallH, wh - wallH, wallH, night);
}

/* floor boards: the plate's own rhythm (a seam every 12 world rows, the first
 * at world row 240, the row after the world's bottom) carries on past the edge */
function floorBoards(s, rx, rw, ry, rh, worldY, night) {
  var floor = night ? 1 : 2, seam = night ? 0 : 1, joint = night ? 0 : 1;
  for (var i = 0; i < rh; i++) {
    var y = ry + i, wy = worldY + i, plank = Math.floor(wy / 12);
    if (wy % 12 === 0) {
      s.rect(rx, y, rw, 1, seam);
      continue;
    }
    s.rect(rx, y, rw, 1, floor);
    if (!night && wy % 12 === 1) {
      /* a short lit edge on the plank, in runs: never a row of bare paper */
      for (var sx = rx + 2 + (plank * 7) % 9; sx < rx + rw - 6; sx += 19) s.rect(sx, y, 9, 1, 3);
    }
    if (night && wy % 12 === 2) s.dither(rx, y, rw, 1, 2, 1);
    var jx = rx + (plank * 37) % 96;
    if (jx < rx + rw) s.rect(jx, y, 1, 1, joint);
  }
}

/* ---------------- the mountain ---------------- */
function valleyBands(s, st, screen) {
  var w = st.w, h = st.h, x0 = st.x, y0 = st.y, ww = st.worldW, wh = st.worldH;
  var fb = y0 + wh;
  s.clear(screen === "ending" ? 3 : 2);
  if (y0 > 0) valleySky(s, w, y0, screen);
  if (fb < h) valleyGround(s, 0, w, fb, h - fb, screen);
  if (x0 > 0) valleySide(s, st, 0, x0, screen);
  if (x0 + ww < w) valleySide(s, st, x0 + ww, w - (x0 + ww), screen);
}

function valleySky(s, w, rows, screen) {
  if (screen === "ending") {
    /* the ending's sky is a mid dither on paper: keep the band the same sky */
    s.rect(0, 0, w, rows, 3);
    s.dither(0, 0, w, rows, 2, 1);
    for (var b = 0; b < 3; b++) {
      var bx = Math.round(w * (0.18 + b * 0.3)), by = Math.round(rows * (0.34 + b * 0.14));
      if (by < rows - 2) {
        s.line(bx, by, bx + 3, by - 2, 1);
        s.line(bx + 3, by - 2, bx + 6, by, 1);
      }
    }
    return;
  }
  /* the title's sky: the plate's mid, its paper stars and a couple of clouds */
  s.rect(0, 0, w, rows, 2);
  for (var i = 0; i < 46; i++) {
    var sx = (i * 53 + 11) % w, sy = (i * 29 + 7) % rows;
    s.rect(sx, sy, i % 3 === 0 ? 2 : 1, 1, 3);
  }
  for (var c = 0; c < 2; c++) {
    var cx = Math.round(w * (0.18 + c * 0.5)), cy = Math.round(rows * (0.42 + c * 0.2));
    if (cy < rows - 1) {
      s.rect(cx, cy, Math.max(10, Math.round(w * 0.13)), 1, 3);
      s.rect(cx + 4, cy - 2, Math.max(6, Math.round(w * 0.07)), 1, 3);
    }
  }
}

function valleyGround(s, rx, rw, ry, rh, screen) {
  var ending = screen === "ending";
  s.rect(rx, ry, rw, rh, ending ? 3 : 2);
  if (ending) s.dither(rx, ry, rw, rh, 2, 1);
  else {
    /* the title's road runs out of the world's bottom: keep walking it */
    var road = Math.max(24, Math.round(rw * 0.19)), rx0 = Math.round(rw / 2 - road / 2);
    s.rect(rx0, ry, road, rh, 3);
    s.rect(rx0 - 1, ry, 1, rh, 1);
    s.rect(rx0 + road, ry, 1, rh, 1);
    for (var sy = ry + 3; sy < ry + rh; sy += 6) s.rect(rx0, sy, road, 1, 2);
  }
  /* grass and stones, the plate's own ground cover */
  for (var gx = rx + 5; gx < rx + rw - 2; gx += 23) {
    var gy = ry + 2 + (gx * 7) % Math.max(1, rh - 3);
    s.rect(gx, gy, 3, 1, 1);
    s.rect(gx + 1, gy >= ry + 2 ? gy - 2 : gy, 1, 2, 1);
  }
}

function valleySide(s, st, rx, rw, screen) {
  var top = st.y, wh = st.worldH, horizon = Math.min(126, wh);
  var sky = screen === "ending" ? 3 : 2;
  s.rect(rx, top, rw, wh, sky);
  if (screen === "ending") s.dither(rx, top, rw, wh, 2, 1);
  if (wh > horizon) {
    s.rect(rx, top + horizon, rw, wh - horizon, screen === "ending" ? 3 : 2);
    s.rect(rx, top + horizon, rw, 1, 1);
    s.dither(rx, top + horizon + 1, rw, 2, 1, 1);
    for (var gx = rx + 2; gx < rx + rw; gx += 9) s.rect(gx, top + horizon + 6 + (gx * 5) % 9, 2, 1, 1);
  }
  if (screen === "title") {
    for (var i = 0; i < rw * wh / 70; i++) {
      var sx = rx + (i * 17 + 3) % rw, sy = top + (i * 31 + 5) % Math.max(1, horizon);
      s.pixel(sx, sy, 3);
    }
  }
}

/* ---------------- the fight on the mountain ---------------- */
function battleBands(s, st) {
  var w = st.w, h = st.h, x0 = st.x, y0 = st.y, ww = st.worldW, wh = st.worldH;
  var deep = typeof B !== "undefined" && B && B.from === "deep";
  var stage = deep ? 1 : 3, sky = deep ? 1 : 2;
  var fb = y0 + wh, cut = Math.min(108, wh);            /* the world's stage starts at y 108 */
  s.clear(sky);
  if (y0 > 0) {
    s.rect(0, 0, w, y0, sky);
    /* the fight's own shafts of light, stacked up the band */
    for (var b = 0; b * 72 - 18 < w; b++) {
      for (var j = 0; j < 12; j++) {
        var bx = 18 + b * 72 + j * 2, by = y0 - 8 - j * 9;
        if (by > -8) s.rect(bx, Math.max(-8, by), 4, Math.min(8, y0), 3);
      }
    }
    if (deep) s.dither(0, 0, w, y0, 0, 2);
  }
  if (fb < h) {
    s.rect(0, fb, w, h - fb, stage);
    s.dither(0, fb, w, Math.min(4, h - fb), 2, 1);
    for (var i = 0; i < (h - fb) / 3; i++) {
      var gx = (i * 37 + 5) % w, gy = fb + 3 + (i * 17) % Math.max(1, h - fb - 3);
      s.rect(gx, gy, 5, 1, 2);
      if (i % 3 === 0) s.rect(gx + 2, Math.max(fb, gy - 2), 1, 2, 1);
    }
  }
  if (x0 > 0) battleSide(s, st, 0, x0, cut, sky, stage, deep);
  if (x0 + ww < w) battleSide(s, st, x0 + ww, w - (x0 + ww), cut, sky, stage, deep);
}

function battleSide(s, st, rx, rw, cut, sky, stage, deep) {
  var top = st.y, wh = st.worldH;
  s.rect(rx, top, rw, wh, sky);
  var cutH = Math.max(0, Math.min(cut, wh));
  if (cutH < wh) {
    s.rect(rx, top + cutH, rw, wh - cutH, stage);
    s.dither(rx, top + cutH, rw, Math.min(4, wh - cutH), 2, 1);
    for (var gy = top + cutH + 5; gy < top + wh; gy += 7) s.rect(rx + 2, gy, Math.max(1, rw - 4), 1, 2);
  }
  if (deep) s.dither(rx, top, rw, cutH, 0, 2);
}

/* ---------------- the forest ---------------- */
function forestBands(s, st) {
  var w = st.w, h = st.h, x0 = st.x, y0 = st.y, ww = st.worldW, wh = st.worldH;
  var fb = y0 + wh;
  s.clear(2);
  if (y0 > 0) {
    /* the canopy hangs over the top of the map */
    s.rect(0, 0, w, y0, 2);
    for (var c = 0; c < w; c += 17) {
      var ch = 6 + ((c / 17 | 0) * 7) % Math.max(3, y0 - 4);
      s.rect(c, 0, 15, ch, 0);
      s.rect(c + 2, ch - 3, 11, 3, 0);
      s.rect(c + 4, ch - 5, 5, 2, 0);
      s.rect(c + 6, ch - 2, 2, 2, 1);
    }
    s.rect(0, y0 - 1, w, 1, 1);
  }
  if (fb < h) {
    s.rect(0, fb, w, h - fb, 2);
    for (var i = 0; i < (h - fb) / 2; i++) {
      var gx = (i * 29 + 3) % w, gy = fb + 2 + (i * 11) % Math.max(1, h - fb - 2);
      s.rect(gx, gy, 3, 1, 1);
      if (i % 3 === 0) s.rect(gx + 1, Math.max(fb, gy - 2), 1, 2, 1);
    }
    s.rect(0, fb, w, 1, 1);
  }
  if (x0 > 0) forestSide(s, st, 0, x0);
  if (x0 + ww < w) forestSide(s, st, x0 + ww, w - (x0 + ww));
}

function forestSide(s, st, rx, rw) {
  var top = st.y, wh = st.worldH, mid = rx + (rw >> 1);
  s.rect(rx, top, rw, wh, 2);
  /* the canopy only along the top edge; the rest is the wood's floor and trees */
  s.rect(rx, top, rw, 3, 1);
  s.dither(rx, top + 3, rw, 3, 1, 1);
  for (var ty = top + 18; ty < top + wh; ty += 52) {
    var th = Math.min(34, top + wh - ty);
    s.rect(mid, ty, 3, th, 0);
    s.rect(mid + 3, ty, 1, th, 1);
    s.rect(mid - 3, ty + 4, 9, 2, 0);
  }
  for (var gy = top + 12; gy < top + wh; gy += 13) {
    var gx = rx + 2 + (gy * 3) % Math.max(1, rw - 4);
    s.rect(gx, gy, 2, 1, 1);
  }
}
