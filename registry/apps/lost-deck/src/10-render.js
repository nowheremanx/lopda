/* Lost Deck: the raycaster. One ray per screen column walks the map grid (DDA), finds the first wall
   or door and draws a textured strip; floor and ceiling are cast row by row; sprites are scaled
   billboards clipped against a depth buffer. Light falls off with distance in four tones, the
   fraction between two tones spread by a 4 x 4 ordered dither. Everything lands in a small tone
   buffer that the game copies onto lo-game's screen. MIT License. */
(function () {
  "use strict";
  var LD = window.LD;
  var W = 160, VH = 128;
  var FOV = 0.66;                     /* half the view plane: about 66 degrees across */
  var PROJ = (W / 2) / FOV;           /* pixels per unit of height at distance 1 */
  var fb = new Uint8Array(W * VH);
  var zbuf = new Float32Array(W);
  var col = new Float32Array(W);   /* the darkening rate per column, kept between frames */
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (v) { return (v + 0.5) / 16; });

  /* a ray from (px, py) along (rx, ry); returns the perpendicular distance and what it hit.
     Doors sit half way into their cell and slide open along it; the cells beside them show a striped jamb. */
  var hit = { d: 0, tex: 0, u: 0, side: 0, cx: 0, cy: 0 };
  function cast(M, px, py, rx, ry, seen) {
    var mx = px | 0, my = py | 0;
    var ddx = rx === 0 ? 1e30 : Math.abs(1 / rx), ddy = ry === 0 ? 1e30 : Math.abs(1 / ry);
    var sx, sy, sdx, sdy;
    if (rx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
    if (ry < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }
    var side = 0, prevDoor = false, w = M.w, cells = M.cells;
    for (var n = 0; n < 64; n++) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      if (mx < 0 || my < 0 || mx >= w || my >= M.h) { hit.d = 60; hit.tex = 1; hit.u = 0; hit.side = side; return hit; }
      var i = my * w + mx, c = cells[i];
      if (seen) seen[i] = 1;
      if (c === 0) { prevDoor = false; continue; }
      if (c >= 10 && c <= 14) {
        /* a door: its plane runs through the middle of the cell */
        var open = M.open[i], t, f;
        if (M.axis[i] === 0) {           /* the door faces x: plane at x = mx + 0.5 */
          if (rx === 0) { prevDoor = true; continue; }
          t = (mx + 0.5 - px) / rx; f = py + t * ry - my;
        } else {
          if (ry === 0) { prevDoor = true; continue; }
          t = (my + 0.5 - py) / ry; f = px + t * rx - mx;
        }
        if (t > 0 && f >= 0 && f < 1 && f >= open) {
          hit.d = t; hit.tex = c; hit.u = f - open; hit.side = M.axis[i]; hit.cx = mx; hit.cy = my; return hit;
        }
        prevDoor = true;
        continue;
      }
      var d = side === 0 ? sdx - ddx : sdy - ddy, u;
      if (side === 0) { u = py + d * ry; } else { u = px + d * rx; }
      u -= Math.floor(u);
      if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) u = 1 - u;
      hit.d = d; hit.tex = prevDoor ? "jamb" : c; hit.u = u; hit.side = side; hit.cx = mx; hit.cy = my;
      return hit;
    }
    hit.d = 60; hit.tex = 1; return hit;
  }

  function texOf(id, time, M) {
    var t = LD.TEX[id];
    if (id === 8) return t[M.lit ? 1 : 0];   /* the switch shows which way it was thrown */
    if (Array.isArray(t)) t = t[Math.floor(time * 2) % t.length];
    return t;
  }

  /* how much darker a point is: distance falloff, plus the torch cone on dark decks */
  function shadeK(view, x) {
    if (!view.dark) return view.fog;
    var cx = (x - W / 2) / (W / 2);
    return view.fog + view.dark * Math.min(1, cx * cx * 2.2);
  }

  /* draw the view. view: {x, y, a, bob, fog, dark, time, flash}; M: the map; sprites: [{x, y, s, h, z, flash}] */
  function render(M, view, sprites) {
    var px = view.x, py = view.y, dx = Math.cos(view.a), dy = Math.sin(view.a);
    var plx = -dy * FOV, ply = dx * FOV;
    var hz = (VH >> 1) + (view.bob | 0), time = view.time;
    var FL = LD.FLOOR, CE = LD.CEIL, SL = LD.SLIME, fp = FL.px, cp = CE.px, sp = SL.px;
    for (var x0 = 0; x0 < W; x0++) col[x0] = shadeK(view, x0);
    var base = view.light || 0;
    /* floor and ceiling */
    var rx0 = dx - plx, ry0 = dy - ply, rx1 = dx + plx, ry1 = dy + ply;
    for (var y = 0; y < VH; y++) {
      var p = y - hz, isFloor = p > 0;
      if (p === 0) { for (var xh = 0; xh < W; xh++) fb[y * W + xh] = 0; continue; }
      var rowD = (PROJ * 0.5) / Math.abs(p);
      var stx = rowD * (rx1 - rx0) / W, sty = rowD * (ry1 - ry0) / W;
      var fx = px + rowD * rx0, fy = py + rowD * ry0, row = y * W, by = (y & 3) * 4;
      var far = rowD > 3.2;   /* far away the grating would only shimmer: show its average tone */
      for (var x = 0; x < W; x++) {
        var cxI = fx | 0, cyI = fy | 0;
        var tu = ((fx - cxI) * 16) | 0, tv = ((fy - cyI) * 16) | 0, ti = tv * 16 + tu, tone;
        if (isFloor) {
          tone = (M.slime && cxI >= 0 && cyI >= 0 && cxI < M.w && cyI < M.h && M.slime[cyI * M.w + cxI]) ? sp[ti] : far ? 2 : fp[ti];
        } else tone = far && cp[ti] < 3 ? 1 : cp[ti];
        var s = (rowD * col[x] - base + BAYER[by + (x & 3)]) | 0;
        tone -= s < 0 ? 0 : s;
        fb[row + x] = tone < 0 ? 0 : tone;
        fx += stx; fy += sty;
      }
    }
    /* walls */
    for (var x2 = 0; x2 < W; x2++) {
      var cam = 2 * x2 / W - 1, rdx = dx + plx * cam, rdy = dy + ply * cam;
      var h = cast(M, px, py, rdx, rdy, M.seen);
      var d = h.d < 0.05 ? 0.05 : h.d;
      zbuf[x2] = d;
      var tex = texOf(h.tex, time, M), tw = tex.w, tp = tex.px;
      var lh = PROJ / d, top = hz - lh / 2;
      var y0 = top < 0 ? 0 : Math.ceil(top), y1 = Math.min(VH, Math.ceil(hz + lh / 2));
      var u = (h.u * tw) | 0; if (u >= tw) u = tw - 1;
      var kd = d * col[x2] + (h.side ? 0.55 : 0) - base, step = tex.h / lh;
      for (var y2 = y0; y2 < y1; y2++) {
        var v = ((y2 - top) * step) | 0; if (v >= tex.h) v = tex.h - 1;
        var t2 = tp[v * tw + u];
        var s2 = (kd + BAYER[(y2 & 3) * 4 + (x2 & 3)]) | 0;
        t2 -= s2 < 0 ? 0 : s2;
        fb[y2 * W + x2] = t2 < 0 ? 0 : t2;
      }
    }
    /* sprites, far to near */
    var inv = 1 / (plx * dy - dx * ply), list = [];
    for (var k = 0; k < sprites.length; k++) {
      var o = sprites[k], ox = o.x - px, oy = o.y - py;
      var tx = inv * (dy * ox - dx * oy), ty = inv * (-ply * ox + plx * oy);
      if (ty < 0.12) continue;
      o._tx = tx; o._ty = ty; list.push(o);
    }
    list.sort(function (a, b) { return b._ty - a._ty; });
    for (var m = 0; m < list.length; m++) drawSprite(list[m], hz, view);
    return { fb: fb, zbuf: zbuf };
  }

  function drawSprite(o, hz, view) {
    var s = o.s; if (!s) return;
    var ty = o._ty, sxc = (W / 2) * (1 + o._tx / ty);
    var hpx = PROJ * o.h / ty, wpx = hpx * s.w / s.h * (o.wide || 1);
    var bottom = hz + PROJ * (0.5 - (o.z || 0)) / ty, top = bottom - hpx, left = sxc - wpx / 2;
    var x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(W, Math.ceil(left + wpx));
    var y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(VH, Math.ceil(bottom));
    if (x0 >= x1 || y0 >= y1) return;
    var kd = o.glow ? -1 : ty * shadeK(view, sxc | 0) * 0.6 - (view.light || 0), sw = s.w, sh = s.h, px = s.px;
    var flash = o.flash, fx = sw / wpx, fy = sh / hpx;
    for (var x = x0; x < x1; x++) {
      if (zbuf[x] < ty) continue;
      var u = ((x - left) * fx) | 0; if (u >= sw) u = sw - 1;
      if (o.flip) u = sw - 1 - u;
      for (var y = y0; y < y1; y++) {
        var v = ((y - top) * fy) | 0; if (v >= sh) v = sh - 1;
        var t = px[v * sw + u];
        if (t === 255) continue;
        if (flash) t = 3;
        else {
          var sh2 = (kd + BAYER[(y & 3) * 4 + (x & 3)]) | 0;
          t -= sh2 < 0 ? 0 : sh2; if (t < 0) t = 0;
        }
        fb[y * W + x] = t;
      }
    }
  }

  LD.R = { W: W, VH: VH, PROJ: PROJ, FOV: FOV, render: render, cast: cast, fb: fb, zbuf: zbuf, BAYER: BAYER };
})();
