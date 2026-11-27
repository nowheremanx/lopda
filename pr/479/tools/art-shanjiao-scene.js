/* Draws the three background plates for 山脚小馆 at exactly 216 x 240.
 * Browser-side helper for tools/art-shanjiao.mjs.  Only the four palette
 * colours are used; every shape is filled on integer pixels, so the result
 * needs no quantisation and no antialiasing.
 *
 *   roomDay    the diner, daylight      (morning + service)
 *   roomNight  the diner, after dark    (night + story)
 *   mountain   the mountain valley      (title + battle)
 *
 * Dynamic things stay out: tables, people, the cat, steam, rain, lantern glow,
 * the scroll and the today board are drawn by the game on top.
 */
(function () {
  var W = 216, H = 240;
  var P = ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"];
  var ctx = null, seed = 1;
  var B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function rect(x, y, w, h, c) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > W) w = W - x;
    if (y + h > H) h = H - y;
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = P[c]; ctx.fillRect(x, y, w, h);
  }
  function px(x, y, c) { rect(x, y, 1, 1, c); }
  function line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var e = dx + dy;
    for (;;) {
      px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  function dither(x, y, w, h, c, level) {
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      if (B[(y + yy) & 3][(x + xx) & 3] < level * 4) px(x + xx, y + yy, c);
    }
  }
  function poly(pts, c) {
    var minY = 999, maxY = -1, i;
    for (i = 0; i < pts.length; i++) { if (pts[i][1] < minY) minY = pts[i][1]; if (pts[i][1] > maxY) maxY = pts[i][1]; }
    for (var y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      var xs = [];
      for (i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
      xs.sort(function (p, q) { return p - q; });
      for (i = 0; i + 1 < xs.length; i += 2) {
        var x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
        if (x1 > x0) rect(x0, y, x1 - x0, 1, c);
      }
    }
  }
  function disc(cx, cy, r, c) {
    for (var y = -r; y <= r; y++) {
      var x = Math.floor(Math.sqrt(r * r - y * y));
      rect(cx - x, cy + y, x * 2 + 1, 1, c);
    }
  }
  function ring(cx, cy, r, c) {
    for (var a = 0; a < 360; a += 4) {
      px(Math.round(cx + Math.cos(a * Math.PI / 180) * r), Math.round(cy + Math.sin(a * Math.PI / 180) * r), c);
    }
  }
  function wood(x, y, w, h, dark) {
    // a horizontal grain: two or three short lines per band
    for (var i = 0; i < Math.max(2, w / 9); i++) {
      var gx = x + Math.floor(rnd() * Math.max(1, w - 4));
      var gy = y + Math.floor(rnd() * h);
      rect(gx, gy, 2 + Math.floor(rnd() * 4), 1, dark);
    }
  }
  function plaster(x, y, w, h, tone) {
    for (var i = 0; i < Math.max(4, w * h / 90); i++) {
      var px0 = x + Math.floor(rnd() * w), py0 = y + Math.floor(rnd() * h);
      rect(px0, py0, 1 + Math.floor(rnd() * 5), 1, tone);
    }
  }
  function pine(x, y, k) {
    var h = Math.round(34 * k);
    for (var j = 0; j < h; j++) {
      var half = Math.round(j * 0.36 * k);
      rect(x + Math.round(7 * k) - half, y + j, half * 2 + 1, 1, 0);
    }
    rect(x + Math.round(6 * k), y + h, Math.max(1, Math.round(2 * k)), Math.round(8 * k), 0);
  }
  function lantern(x, y, night) {
    line(x + 6, y - 4, x + 6, y, 0);
    rect(x + 2, y - 2, 9, 2, 0);
    rect(x, y, 13, 15, 0);
    rect(x + 2, y + 1, 9, 13, night ? 3 : 2);
    for (var i = 0; i < 4; i++) rect(x + 2, y + 3 + i * 3, 9, 1, night ? 1 : 1);
    rect(x + 1, y + 14, 11, 2, 0);
    px(x + 6, y + 16, 2);
  }

  function room(night) {
    seed = night ? 77 : 11;
    var wall = night ? 1 : 3;
    var wallPatch = night ? 2 : 2;
    var floor = night ? 1 : 2;
    var floorLine = night ? 0 : 1;
    var floorHi = night ? 2 : 3;

    // wall, plaster and timber
    rect(0, 0, W, 96, wall);
    plaster(0, 28, W, 68, wallPatch);
    rect(0, 28, W, 3, 0);
    rect(0, 29, W, 1, 1);
    rect(0, 92, W, 4, 0);
    rect(0, 93, W, 1, 1);
    rect(0, 0, 4, 96, 0);
    rect(212, 0, 4, 96, 0);
    [68, 104, 164].forEach(function (x) {
      rect(x, 30, 3, 64, 0);
      rect(x + 1, 32, 1, 60, 1);
      wood(x - 1, 32, 4, 60, 0);
    });
    // a low rail above the floor
    rect(0, 88, W, 2, 0);

    // high window
    rect(166, 31, 28, 18, 0);
    rect(168, 33, 24, 14, night ? 0 : 3);
    if (night) {
      disc(181, 39, 5, 3);
      rect(169, 42, 22, 5, 1);
      poly([[169, 42], [174, 38], [179, 42], [184, 36], [189, 42], [191, 42], [191, 47], [169, 47]], 0);
    } else {
      poly([[168, 43], [174, 38], [180, 43], [186, 37], [192, 43], [192, 45], [168, 45]], 2);
      pine(186, 35, 0.35);
    }
    rect(180, 33, 1, 14, 0);
    rect(168, 40, 24, 1, 0);
    rect(164, 49, 32, 2, 0);
    wood(164, 49, 32, 2, 1);

    // kitchen pass: the dark mouth on the left
    rect(6, 36, 62, 56, 0);
    rect(8, 38, 58, 52, 1);
    rect(10, 40, 54, 48, night ? 1 : 2);
    if (night) dither(10, 40, 54, 30, 0, 1);
    rect(10, 62, 54, 2, 0);
    rect(10, 63, 54, 1, 1);
    // hanging cloth
    rect(12, 40, 16, 13, night ? 2 : 3);
    for (var ch = 0; ch < 4; ch++) rect(13 + ch * 4, 41, 1, 11, night ? 1 : 2);
    rect(12, 53, 16, 1, 0);
    // pots and bowls
    rect(14, 66, 18, 11, 0);
    rect(16, 67, 14, 8, night ? 3 : 3);
    rect(18, 68, 10, 3, night ? 2 : 2);
    rect(13, 66, 20, 2, 0);
    for (var b = 0; b < 3; b++) {
      rect(36 + b * 8, 68, 7, 2, 0);
      rect(37 + b * 8, 67, 5, 1, night ? 3 : 3);
    }
    // a ladle
    line(50, 56, 54, 64, 0);
    rect(52, 64, 4, 2, 0);
    // steam is dynamic; a little soot stays on the wall
    if (night) {
      dither(14, 70, 36, 14, 3, 1);
    }

    // counter
    rect(6, 100, 62, 4, 0);
    rect(8, 100, 58, 1, night ? 1 : 3);
    rect(6, 104, 62, 44, night ? 0 : 1);
    rect(8, 106, 58, 40, night ? 1 : 2);
    wood(8, 106, 58, 40, night ? 0 : 1);
    rect(36, 108, 22, 12, night ? 0 : 1);
    rect(38, 110, 18, 8, night ? 2 : 3);
    rect(40, 112, 14, 1, night ? 1 : 2);
    // pot on the counter
    rect(12, 104, 18, 8, 0);
    rect(14, 105, 14, 6, night ? 3 : 3);
    rect(16, 106, 10, 2, night ? 2 : 2);
    // bowls and a jar
    for (var k = 0; k < 3; k++) rect(40 + k * 7, 114, 6, 2, 0);
    rect(10, 132, 10, 12, 0);
    rect(11, 133, 8, 10, night ? 2 : 3);
    rect(52, 130, 10, 14, 0);
    rect(53, 131, 8, 12, night ? 2 : 3);
    rect(54, 132, 6, 2, 0);

    // sliding door
    rect(192, 102, 20, 68, 0);
    rect(194, 104, 16, 64, night ? 1 : 3);
    rect(196, 106, 12, 60, night ? 1 : 2);
    rect(196, 106, 12, 1, night ? 2 : 3);
    rect(201, 106, 1, 60, 0);
    rect(196, 122, 12, 1, 0);
    rect(196, 144, 12, 1, 0);
    if (night) {
      rect(198, 108, 5, 12, 3);
      disc(200, 114, 2, 3);
    } else {
      dither(197, 108, 10, 12, 3, 1);
    }
    // noren
    rect(192, 100, 20, 9, 0);
    rect(194, 101, 16, 7, night ? 2 : 3);
    for (var n = 0; n < 4; n++) rect(195 + n * 4, 102, 1, 5, night ? 1 : 2);
    disc(202, 104, 2, night ? 1 : 2);
    // step
    rect(190, 168, 24, 2, 0);
    rect(192, 170, 20, 2, night ? 1 : 2);

    // lanterns
    lantern(72, 32, night);
    lantern(196, 96, night);
    if (night) {
      dither(60, 26, 36, 30, 3, 1);
      dither(184, 88, 32, 30, 3, 1);
      dither(12, 54, 52, 32, 3, 1);
    }

    // floor
    rect(0, 96, W, 144, floor);
    rect(0, 96, W, 5, 0);
    rect(0, 97, W, 1, night ? 1 : 2);
    for (var fy = 108; fy < H; fy += 12) {
      rect(0, fy, W, 1, floorLine);
      if (!night) rect(0, fy + 1, W, 1, 3);
      else dither(0, fy + 1, W, 2, 2, 1);
    }
    for (var fy2 = 108; fy2 < H; fy2 += 12) {
      for (var sx = (fy2 * 37) % 216; sx < W; sx += 48) rect(sx, fy2, 1, 12, floorLine);
    }
    // light pools
    if (night) {
      dither(150, 100, 66, 80, 3, 1);
      dither(60, 96, 40, 40, 3, 1);
      dither(10, 140, 50, 40, 3, 1);
    } else {
      dither(156, 100, 60, 70, 3, 1);
      dither(6, 96, 40, 26, 3, 1);
    }
    // straw and crumbs
    for (var s = 0; s < 40; s++) {
      var sx2 = Math.floor(rnd() * W), sy2 = 108 + Math.floor(rnd() * 128);
      px(sx2, sy2, night ? 2 : 1);
    }
  }

  function mountain() {
    seed = 303;
    // sky
    rect(0, 0, W, H, 3);
    dither(0, 0, W, 40, 2, 1);
    // sun
    disc(172, 30, 14, 2);
    disc(172, 30, 11, 3);
    for (var a = 0; a < 360; a += 20) {
      var ax = Math.cos(a * Math.PI / 180), ay = Math.sin(a * Math.PI / 180);
      line(172 + ax * 18, 30 + ay * 18, 172 + ax * 24, 30 + ay * 24, 2);
    }
    // clouds
    for (var c = 0; c < 4; c++) {
      var cx = 8 + c * 56, cy = 16 + (c % 2) * 9;
      dither(cx, cy, 36, 5, 3, 2);
      dither(cx + 6, cy + 3, 24, 3, 3, 2);
      dither(cx + 12, cy + 1, 12, 2, 3, 3);
    }
    // far ridge
    poly([[0, 92], [16, 72], [30, 82], [46, 64], [62, 80], [80, 58], [98, 78], [116, 62], [134, 80], [154, 66], [176, 82], [196, 70], [216, 78], [216, 128], [0, 128]], 2);
    dither(52, 68, 28, 18, 1, 1);
    dither(130, 72, 32, 16, 1, 1);
    // mid ridge
    poly([[0, 110], [22, 92], [42, 104], [64, 86], [88, 104], [112, 88], [138, 106], [162, 92], [186, 108], [206, 98], [216, 104], [216, 150], [0, 150]], 1);
    dither(20, 100, 40, 16, 0, 1);
    dither(150, 100, 50, 18, 0, 1);
    // near ridge
    poly([[0, 132], [24, 116], [50, 130], [78, 110], [106, 130], [136, 114], [164, 132], [190, 120], [216, 128], [216, 178], [0, 178]], 0);
    // mist
    dither(0, 104, W, 10, 3, 2);
    dither(0, 128, W, 8, 3, 1);
    dither(0, 164, W, 8, 3, 2);
    // pines
    pine(4, 62, 1.3);
    pine(188, 64, 1.45);
    pine(26, 94, 0.7);
    pine(166, 92, 0.8);
    pine(58, 106, 0.5);
    // ground
    rect(0, 148, W, 92, 2);
    dither(0, 148, W, 10, 1, 1);
    for (var gy = 156; gy < H; gy += 7) {
      dither(0, gy, W, 1, 1, 1);
    }
    // path
    for (var py = 160; py < 240; py += 8) {
      var half = 10 + Math.floor((py - 160) / 5);
      rect(108 - half, py, half * 2, 5, 3);
      rect(110 - half, py, half * 2, 1, 2);
      rect(108 - half, py + 5, half * 2, 1, 1);
    }
    // torii on the right
    rect(158, 126, 40, 3, 0);
    rect(162, 132, 32, 2, 0);
    rect(164, 134, 4, 28, 0);
    rect(188, 134, 4, 28, 0);
    rect(170, 138, 16, 2, 0);
    // stone lantern on the left
    rect(28, 156, 14, 4, 0);
    rect(31, 160, 8, 14, 0);
    rect(28, 174, 14, 4, 0);
    rect(30, 150, 10, 7, 3);
    rect(30, 150, 10, 1, 1);
    dither(31, 152, 8, 4, 3, 1);
    // grass tufts
    for (var i = 0; i < 70; i++) {
      var gx = Math.floor(rnd() * W), gy2 = 150 + Math.floor(rnd() * 88);
      if (gx > 96 && gx < 120 && gy2 > 160) continue;
      px(gx, gy2, rnd() < 0.5 ? 1 : 0);
      if (rnd() < 0.3) px(gx, gy2 - 1, 1);
    }
  }

  window.PLATE = {
    draw: function (name) {
      var c = document.getElementById("c");
      c.width = W; c.height = H;
      ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      if (name === "roomDay") room(false);
      else if (name === "roomNight") room(true);
      else if (name === "mountain") mountain();
      else throw new Error("unknown plate " + name);
      var img = ctx.getImageData(0, 0, W, H);
      return { w: W, h: H, data: Array.from(img.data) };
    }
  };
})();
