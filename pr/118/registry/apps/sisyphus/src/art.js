/* Sisyphus: four-tone art. Everything here is placeholder art with a clear shape:
   the artist pass can replace the sprites and terrain without touching the game.
   0 ink, 1 dark, 2 mid, 3 paper; '.' is transparent in sprite text. */
var ART = (function () {
  var W = 160, H = 178;
  var BAYER = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
  ];

  function bayer(x, y) { return (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64; }
  function tone(v, x, y) {
    var t = Math.floor(v + bayer(x, y));
    return t < 0 ? 0 : (t > 3 ? 3 : t);
  }
  function px(g, x, y, v) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    g.pixel(x, y, tone(v, x, y));
  }
  function disc(g, cx, cy, r, v) {
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) px(g, cx + x, cy + y, v);
    }
  }
  function ring(g, cx, cy, r0, r1, v) {
    for (var y = -r1; y <= r1; y++) for (var x = -r1; x <= r1; x++) {
      var d = x * x + y * y;
      if (d >= r0 * r0 && d <= r1 * r1) px(g, cx + x, cy + y, v);
    }
  }
  function line2(g, x0, y0, x1, y1, v) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (;;) {
      px(g, x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }

  /* ---------------- sky ---------------- */
  function sky(g, s) {
    var night = s.mode === "descent";
    var day = night ? 1 : s.p;
    var wet = s.weather === "rain";
    var topV = night ? 0.12 : 3.08 - 2.25 * day - (wet ? 0.28 : 0);
    var horV = night ? 0.92 : 1.85 + 1.15 * Math.sin(day * Math.PI) - (wet ? 0.30 : 0);
    var horizon = 116;
    for (var y = 0; y < H; y++) {
      var v = y < horizon ? topV + (horV - topV) * (y / horizon) : horV;
      for (var x = 0; x < W; x++) px(g, x, y, v);
    }

    var sx = night ? 119 : 124 - 24 * day;
    var sy = night ? 42 : 49 + 37 * day;
    var sr = night ? 8 : 9 - 2 * day;
    if (!wet || night) {
      ring(g, sx, sy, sr + 1, sr + 5, night ? 0.9 : 2.25);
      disc(g, sx, sy, sr, 3);
    }
    if (night) {
      /* a crescent: one dark disc over the paper one */
      for (var yy = -sr; yy <= sr; yy++) for (var xx = -sr; xx <= sr; xx++) {
        var dd = xx * xx + yy * yy;
        if (dd <= (sr - 1) * (sr - 1) && (xx + sr) * (xx + sr) + (yy + 2) * (yy + 2) <= sr * sr) px(g, sx + xx, sy + yy, 0.85);
      }
    }

    /* stars only when the sky is dark enough */
    if (night || day > 0.9) {
      for (var i = 0; i < 34; i++) {
        var stx = (i * 37 + 11) % 154 + 3;
        var sty = (i * 23 + 5) % 76 + 3;
        var dx0 = stx - sx, dy0 = sty - sy;
        if (dx0 * dx0 + dy0 * dy0 < (sr + 8) * (sr + 8)) continue;
        if (Math.sin(s.time * 1.7 + i * 2.3) > -0.72) px(g, stx, sty, i % 5 === 0 ? 3 : 2.4);
      }
    }

    /* slow cloud bands; rain and wind change the pace */
    var wind = s.weather === "wind" ? 2.2 : 1;
    for (var c = 0; c < 3; c++) {
      var cy = 58 + c * 15;
      var off = (s.time * (4 + c) * wind + c * 57) % 240 - 40;
      for (var x2 = 0; x2 < W; x2++) {
        var u = (x2 + off) / 240;
        var band = Math.sin(u * 6.283 * 2 + c) * 0.5 + 0.5;
        if (band > 0.72) {
          var vv = night ? 0.55 : 2.45;
          px(g, x2, cy + Math.sin(x2 * 0.05 + c) * 1.2, vv);
          px(g, x2, cy + 1 + Math.sin(x2 * 0.05 + c) * 1.2, vv - 0.5);
        }
      }
    }

    if (s.weather === "rain") {
      for (var r = 0; r < 68; r++) {
        var rx = (r * 41 + s.time * 31) % 174 - 7;
        var ry = (r * 59 + s.time * 83) % 178;
        line2(g, rx, ry, rx - 1, ry + 3, night ? 2.1 : 1.25);
      }
    }

    if (!night && s.weather !== "rain" && day < 0.82) {
      for (var b = 0; b < 3; b++) {
        var bx = (22 + b * 9 + s.time * 1.6) % (W + 20) - 10;
        var by = 39 + b * 4;
        px(g, bx, by, 1.2); px(g, bx + 1, by - 1, 1.2); px(g, bx + 2, by, 1.2);
      }
    }
  }

  /* ---------------- distant ridges ---------------- */
  function ridges(g, s) {
    var night = s.mode === "descent";
    for (var layer = 0; layer < 2; layer++) {
      var base = 92 + layer * 16 - (s.cam.y - 180) * 0.035;
      var par = s.cam.x * (0.10 + layer * 0.07);
      var v = night ? (layer ? 0.18 : 0.42) : (layer ? 0.95 : 1.65);
      for (var x = 0; x < W; x++) {
        var wx = x + par;
        var yy = base + Math.sin(wx * 0.026 + layer * 2.1) * (5 + layer * 2)
          + Math.sin(wx * 0.071 + layer) * (2.5 + layer);
        var top = Math.round(yy);
        for (var y = top; y < H; y++) px(g, x, y, v - (y - top) * 0.002);
      }
    }
  }

  /* ---------------- cloud sea ---------------- */
  function cloudSea(g, s) {
    var night = s.mode === "descent";
    for (var i = 0; i < 4; i++) {
      var cx = (i * 59 + s.time * 2.5) % 210 - 30;
      var cy = 124 + (i * 7) % 11;
      var w = 26 + (i % 2) * 12;
      for (var x = -w; x <= w; x++) {
        var edge = Math.sin((x / w) * 1.5708);
        var h = Math.max(1, Math.round(edge * 3));
        for (var y = -h; y <= 1; y++) px(g, cx + x, cy + y, night ? 0.75 : 2.35);
      }
    }
  }

  /* ---------------- the mountain and its ledge ---------------- */
  function terrain(g, s) {
    var cam = s.cam;
    var night = s.mode === "descent";
    var summitScreen = WORLD.SUMMIT_X - cam.x;

    for (var x = 0; x < W; x++) {
      var wx = cam.x + x;
      if (wx <= WORLD.SUMMIT_X) {
        var py = WORLD.pathY(wx) - cam.y;

        /* ledge: a pale top edge, a dark underside */
        px(g, x, py - 1, night ? 2.0 : 3.0);
        px(g, x, py, 2.0);
        px(g, x, py + 1, 2.0);
        px(g, x, py + 2, 1.1);
        px(g, x, py + 3, 0.15);

        /* cliff below the ledge */
        var top = Math.max(py + 4, 0);
        for (var y = top; y < H; y++) {
          var d = (y - top) / Math.max(1, H - top);
          var v = night ? 0.72 - d * 0.68 : 1.38 - d * 1.30;
          v += Math.sin(wx * 0.031 + y * 0.14) * 0.055;
          /* large diagonal facets, then the horizontal strata, then the deep cracks */
          var facet = (wx * 0.55 + (y - top) * 1.35) / 46;
          v += ((Math.floor(facet) % 3) - 1) * 0.11;
          if ((facet - Math.floor(facet)) * 46 < 1.4) v -= 0.30;
          if ((y + Math.floor(Math.sin(wx * 0.041) * 4)) % 22 === 0) v -= 0.42;
          if (crack(wx, y)) v = 0.02;
          px(g, x, y, v);
        }
      } else {
        /* the other side: a narrow far ledge, then the cloud sea below it */
        var fy = WORLD.farPathY(wx) - cam.y;
        var band = Math.max(0, Math.min(H, fy + 11));
        for (var y2 = Math.max(0, fy - 1); y2 < band; y2++) {
          var up = y2 < fy + 2;
          var v2 = up ? (night ? 2.0 : 3.0) : (night ? 1.25 : 2.05) - (y2 - fy) * 0.08;
          if ((y2 + Math.floor(Math.sin(wx * 0.05) * 3)) % 7 === 0) v2 -= 0.45;
          px(g, x, y2, v2);
        }
        for (var y3 = band; y3 < H; y3++) {
          var d3 = (y3 - band) / Math.max(1, H - band);
          var v3 = night ? 0.85 - d3 * 0.28 : 2.45 - d3 * 0.72;
          v3 += Math.sin(wx * 0.05 + y3 * 0.19) * 0.14;
          px(g, x, y3, v3);
        }
      }
    }

    /* the crest ends in a small lip; a cairn says someone was here before */
    var su = Math.round(summitScreen);
    if (su > -6 && su < W + 6) {
      for (var i2 = 0; i2 < 4; i2++) {
        px(g, su - 10 + i2, (WORLD.SUMMIT_Y - cam.y) - 2 - i2, 2.2);
        px(g, su - 11 + i2, (WORLD.SUMMIT_Y - cam.y) - 1 - i2, 0.2);
      }
    }

    /* grass tufts, sparse; the mountain is stone, not a meadow */
    for (var i = 0; i < 18; i++) {
      var tx = (i * 53 + 17) % (WORLD.SUMMIT_X - 20) + 10;
      if (tx < cam.x - 6 || tx > cam.x + W + 6) continue;
      var ty = WORLD.pathY(tx) - cam.y;
      if (ty < -4 || ty > H) continue;
      var sx = Math.round(tx - cam.x);
      px(g, sx, ty - 3, 0.3); px(g, sx - 1, ty - 5, 0.3); px(g, sx + 1, ty - 4, 0.3);
    }

    /* loose scree at the foot of the cliff */
    for (var k = 0; k < 46; k++) {
      var pxW = (k * 67 + 31) % WORLD.SUMMIT_X;
      if (pxW < cam.x - 2 || pxW > cam.x + W + 2) continue;
      var pyW = WORLD.pathY(pxW) + 10 + (k * 17) % 40;
      px(g, pxW - cam.x, pyW - cam.y, k % 3 === 0 ? 2.2 : 0.8);
    }
  }

  function crack(wx, y) {
    var cs = [86, 214, 347, 512, 688, 804];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i] + Math.sin(y * 0.07 + i) * 3;
      if (Math.abs(wx - c) < 1.1) return true;
    }
    return false;
  }

  /* ---------------- boulder ---------------- */
  function boulder(g, cx, cy, r, angle, night) {
    /* contact shadow on the ledge */
    line2(g, cx - r + 2, cy + r - 1, cx + r - 2, cy + r - 1, 0.1);
    var reach = r + 3;
    for (var y = -reach; y <= reach; y++) for (var x = -reach; x <= reach; x++) {
      var d = Math.sqrt(x * x + y * y);
      var theta = Math.atan2(y, x) - angle;
      /* a lumpy outline: an off-centre body, three harmonics and two chipped corners */
      var rr = r * (0.91 + 0.115 * Math.sin(theta * 3 + 0.8)
        + 0.070 * Math.sin(theta * 5 - 1.2)
        + 0.045 * Math.sin(theta * 7 + 2.1)
        + 0.050 * Math.sin(theta * 2 - 0.4));
      var chip = Math.atan2(Math.sin(theta - 2.25), Math.cos(theta - 2.25));
      if (Math.abs(chip) < 0.40) rr -= r * 0.20 * (1 - Math.abs(chip) / 0.40);
      var chip2 = Math.atan2(Math.sin(theta + 2.55), Math.cos(theta + 2.55));
      if (Math.abs(chip2) < 0.28) rr -= r * 0.12 * (1 - Math.abs(chip2) / 0.28);
      if (d > rr) continue;
      var sh = (x * 0.62 - y * 0.78) / r;
      var v = 1.08 + sh * 0.95;
      if (d > rr - 1.25) v = 0.06;
      if (d > rr - 1.3 && sh > 0.30) v = 2.9;
      if (sh > 0.48 && bayer(cx + x, cy + y) < 0.52) v = 3;
      px(g, cx + x, cy + y, night ? v - 0.35 : v);
    }
    /* three cracks, turned with the stone */
    var ca = Math.cos(angle), sa = Math.sin(angle);
    var cracks = [
      [[-0.62, -0.18], [-0.18, 0.10], [0.28, 0.02]],
      [[-0.16, -0.66], [0.10, -0.22], [0.22, 0.36]],
      [[0.08, 0.52], [-0.24, 0.30], [-0.54, 0.42]]
    ];
    for (var c = 0; c < cracks.length; c++) {
      var pts = cracks[c];
      for (var p = 1; p < pts.length; p++) {
        var ax = pts[p - 1][0] * r, ay = pts[p - 1][1] * r;
        var bx = pts[p][0] * r, by = pts[p][1] * r;
        for (var t = 0; t <= 1; t += 0.12) {
          var lx = ax + (bx - ax) * t, ly = ay + (by - ay) * t;
          px(g, cx + lx * ca - ly * sa, cy + lx * sa + ly * ca, 0.05);
        }
      }
    }
  }

  /* ---------------- Sisyphus ---------------- */
  function sisyphus(g, sx, sy, pose, phase, bx, by, br, night) {
    var pushing = pose === "push" || pose === "strain";
    var lean = pushing ? 2 : (pose === "slip" ? -1 : 0);
    var crouch = pose === "strain" ? 1 : 0;
    var look = pose === "look" ? 1 : 0;
    var hx = sx + lean;
    var hy = sy - 16 + crouch - look;
    var shoulderY = sy - 12 + crouch;
    var hipY = sy - 4;
    var ink = 0, rim = night ? 2.7 : 2.2, hi = 3;
    var step = Math.sin(phase);

    line2(g, sx - 3, sy - 1, sx + 3, sy - 1, 0.1);

    /* the far arm goes behind the torso, so the pushing pose has depth instead of a belly */
    if (pushing) {
      line2(g, hx - 1, shoulderY + 1, sx - 2, shoulderY + 4, ink);
      line2(g, sx - 2, shoulderY + 4, bx - br + 2, by + 1, ink);
    }

    /* legs: while pushing they shuffle, one foot forward and one back */
    if (pose === "slip") {
      line2(g, sx - 1, hipY, sx - 5, sy, ink); line2(g, sx + 1, hipY, sx + 5, sy, ink);
      line2(g, sx - 6, sy, sx - 4, sy, ink); line2(g, sx + 4, sy, sx + 6, sy, ink);
    } else if (pose === "walk") {
      var sw = Math.sin(phase) * 3;
      line2(g, sx - 1, hipY, sx - sw, sy - (sw > 0 ? 1 : 0), ink);
      line2(g, sx + 1, hipY, sx + sw, sy - (sw < 0 ? 1 : 0), ink);
      line2(g, sx - sw - 1, sy - (sw > 0 ? 1 : 0), sx - sw + 1, sy - (sw > 0 ? 1 : 0), ink);
      line2(g, sx + sw - 1, sy - (sw < 0 ? 1 : 0), sx + sw + 1, sy - (sw < 0 ? 1 : 0), ink);
    } else if (pushing) {
      var stride = step * 2.2;
      var lfx = sx - 2 - stride, rfx = sx + 2 + stride;
      var lfy = sy - (step > 0.30 ? 1 : 0);
      var rfy = sy - (step < -0.30 ? 1 : 0);
      line2(g, sx - 1, hipY, lfx, lfy, ink);
      line2(g, sx + 1, hipY, rfx, rfy, ink);
      line2(g, lfx - 1, lfy, lfx + 1, lfy, ink);
      line2(g, rfx - 1, rfy, rfx + 1, rfy, ink);
      px(g, (sx - 1 + lfx) / 2, (hipY + lfy) / 2, rim);
    } else {
      var stance = pose === "stand" ? 2 : 1;
      line2(g, sx - 1, hipY, sx - stance, sy, ink); line2(g, sx + 1, hipY, sx + stance, sy, ink);
      line2(g, sx - stance - 1, sy, sx - stance + 1, sy, ink);
      line2(g, sx + stance - 1, sy, sx + stance + 1, sy, ink);
    }

    /* torso: wide shoulders, a narrow waist; not a barrel */
    for (var i = 0; i < 8; i++) {
      var t = i / 7;
      var cx = sx + lean * (1 - t);
      var w = i < 2 ? 2 : 1;
      var yy = sy - 12 + crouch + i;
      g.rect(cx - w, yy, w * 2 + 1, 1, ink);
      px(g, cx - w - 1, yy, rim);
      if (i === 0) px(g, cx - w, yy, hi);
    }
    g.rect(sx - 1, hipY, 3, 1, ink);

    /* head and neck */
    g.circle(hx, hy, 2, ink, true);
    px(g, hx - 2, hy - 1, rim); px(g, hx - 1, hy - 2, hi);
    if (night) { px(g, hx + 2, hy - 1, rim); px(g, hx + 1, hy + 1, rim); }
    g.rect(hx - 1, hy + 2, 2, 2, ink);

    /* near arm, in front: one clear arm from shoulder to the stone */
    var shoulderY2 = shoulderY + 1;
    if (pushing) {
      var handX = bx - br + 1, handY = by - 2;
      var ex = hx + 3, ey = shoulderY + 3;
      /* two pixels thick, with a lit top edge, so it reads against the dark stone */
      line2(g, hx + 1, shoulderY2, ex, ey, ink);
      line2(g, hx + 1, shoulderY2 + 1, ex, ey + 1, ink);
      line2(g, ex, ey, handX, handY, ink);
      line2(g, ex, ey + 1, handX, handY + 1, ink);
      line2(g, hx + 1, shoulderY2 - 1, ex, ey - 1, rim);
      line2(g, ex, ey - 1, handX, handY - 1, rim);
      px(g, ex, ey - 1, hi); px(g, handX, handY, hi); px(g, handX, handY - 1, hi);
    } else if (pose === "slip") {
      line2(g, hx + 1, shoulderY2, sx + 5, sy - 17, ink);
      line2(g, hx - 1, shoulderY2, sx - 5, sy - 16, ink);
    } else if (pose === "walk") {
      var sw2 = Math.sin(phase) * 3;
      line2(g, hx + 1, shoulderY2, sx + 2 + sw2, sy - 5, ink);
      line2(g, hx - 1, shoulderY2, sx - 2 - sw2, sy - 5, ink);
    } else {
      line2(g, hx + 1, shoulderY2, sx + 3, sy - 4, ink);
      line2(g, hx - 1, shoulderY2, sx - 3, sy - 4, ink);
    }

    /* a little more rim on the back */
    px(g, sx - 2, sy - 9, rim); px(g, sx - 2, sy - 7, rim);
  }

  /* ---------------- dust ---------------- */
  function spawnDust(s, wx, wy, n, power) {
    for (var i = 0; i < n; i++) {
      s.dust.push({
        x: wx + (Math.random() * 2 - 1) * 4,
        y: wy - Math.random() * 3,
        vx: (Math.random() * 2 - 1) * power,
        vy: -Math.random() * power * 0.7,
        life: 0.45 + Math.random() * 0.7,
        max: 1.2
      });
    }
  }

  function updateDust(s, dt) {
    for (var i = s.dust.length - 1; i >= 0; i--) {
      var p = s.dust[i];
      p.life -= dt;
      if (p.life <= 0) { s.dust.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 18 * dt;
    }
  }

  function drawDust(g, s) {
    for (var i = 0; i < s.dust.length; i++) {
      var p = s.dust[i];
      var x = p.x - s.cam.x, y = p.y - s.cam.y;
      if (x > -2 && x < W + 2 && y > -2 && y < H + 2) {
        px(g, x, y, p.life > 0.45 ? 3 : 2.2);
      }
    }
  }

  /* ---------------- the quote card ---------------- */
  function reveal(g, amount) {
    if (amount >= 1) { g.clear(3); return; }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (bayer(x, y) < amount) g.pixel(x, y, 3);
    }
  }

  function card(g, q, left, right, amount, status, hintText) {
    reveal(g, amount);
    if (amount < 0.72) return;
    g.frame(3, 3, 154, 172, 0);
    g.text(left, 12, 10, { color: 1 });
    if (right) g.text(right, 147, 10, { color: 1, align: "right" });
    g.line(12, 27, 147, 27, 1);

    var y = 34;
    var zh = g.wrap(q.zh, 132);
    for (var i = 0; i < zh.length; i++) { g.text(zh[i], 13, y, { color: 0 }); y += g.lineHeight; }
    y += 4;
    var en = g.wrap(q.en, 132);
    for (var j = 0; j < en.length; j++) { g.text(en[j], 13, y, { color: 1 }); y += g.lineHeight; }

    g.line(12, 138, 147, 138, 1);
    g.text("加缪《西西弗斯神话》", 13, 141, { color: 1 });
    var hint = hintText || "A 记下    B 让它过去";
    if (status === "saving") hint = "写入中…";
    else if (status === "saved") hint = "已写入幸福手册";
    else if (status === "denied") hint = "没有写入";
    g.text(hint, 13, 157, { color: 0 });
  }

  function wipe(g, amount, tone) {
    if (amount >= 1) { g.clear(tone); return; }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x / W > 1 - amount + (bayer(x, y) - 0.5) * 0.055) g.pixel(x, y, tone);
    }
  }

  function drawWorld(g, s) {
    sky(g, s);
    ridges(g, s);
    cloudSea(g, s);
    terrain(g, s);

    var bsx = s.boulderX - s.cam.x, bsy = s.boulderY - s.cam.y;
    var psx = s.playerX - s.cam.x, psy = s.playerY - s.cam.y;
    var night = s.mode === "descent";

    boulder(g, bsx, bsy, s.boulderR, s.boulderAngle, night);
    sisyphus(g, psx, psy, s.pose, s.walkPhase, bsx, bsy, s.boulderR, night);
    drawDust(g, s);
  }

  return {
    W: W, H: H, tone: tone, px: px, disc: disc, line2: line2,
    sky: sky, ridges: ridges, cloudSea: cloudSea, terrain: terrain,
    boulder: boulder, sisyphus: sisyphus, spawnDust: spawnDust, updateDust: updateDust, drawDust: drawDust,
    reveal: reveal, card: card, wipe: wipe, drawWorld: drawWorld
  };
})();
