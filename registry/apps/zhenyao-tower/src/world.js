/* The 3D world: turns a map (src/town.js) into lo-3d meshes, lights and colliders, and draws a frame.
   Tile (col, row) covers x in [col, col+1] and z in [-row-1, -row]: north is +z, away from the camera. */
var World = (function () {
  var sub = Lo3D.sub, cross = Lo3D.cross, dot = Lo3D.dot;
  var CHUNK = 4;

  /* a stable 0..1 number per tile, for texture and scattered trees */
  function hash(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* a mesh under construction; every face is wound so it is seen from the side `out` points to */
  function builder() {
    var m = { v: [], t: [], c: [] };
    m.tri = function (a, b, c, out, alb) {
      var i = m.v.length;
      m.v.push(a, b, c);
      m.t.push(dot(cross(sub(b, a), sub(c, a)), out) <= 0 ? [i, i + 1, i + 2] : [i, i + 2, i + 1]);
      m.c.push(alb);
    };
    m.quad = function (a, b, c, d, out, alb) { m.tri(a, b, c, out, alb); m.tri(a, c, d, out, alb); };
    /* an axis-aligned box from (x0,y0,z0) to (x1,y1,z1); no bottom, top optional */
    m.box = function (x0, y0, z0, x1, y1, z1, alb, top) {
      m.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], alb);
      m.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], alb);
      m.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], alb);
      m.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], alb);
      if (top !== false) m.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], top == null || top === true ? alb : top);
    };
    /* an n-sided cone standing at (x, y, z) */
    m.cone = function (x, y, z, r, h, n, alb, turn) {
      for (var i = 0; i < n; i++) {
        var a0 = (i / n + (turn || 0)) * Math.PI * 2, a1 = ((i + 1) / n + (turn || 0)) * Math.PI * 2, am = (a0 + a1) / 2;
        m.tri([x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x, y + h, z],
          [Math.cos(am), r / h, Math.sin(am)], alb);
      }
    };
    /* a four-sided roof: from a w x d rectangle at height y, rising to a ridge (ridge > 0) or a point */
    m.roof = function (x0, z0, x1, z1, y, h, ridge, alb) {
      var xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, r = ridge || 0;
      var A = [xm - r, y + h, zm], B = [xm + r, y + h, zm];
      m.quad([x0, y, z0], [x1, y, z0], B, A, [0, 1, -1], alb);
      m.quad([x0, y, z1], [x1, y, z1], B, A, [0, 1, 1], alb);
      m.tri([x0, y, z0], [x0, y, z1], A, [-1, 1, 0], alb);
      m.tri([x1, y, z0], [x1, y, z1], B, [1, 1, 0], alb);
    };
    return m;
  }

  /* low-poly pines; the forest outside the town gets the cheaper kind */
  function tree(m, x, z, s, cheap) {
    if (cheap) { m.cone(x, 0, z, 0.6 * s, 1.7 * s, 5, 0.42, 0.1); return; }
    m.cone(x, 0, z, 0.1, 0.6 * s, 3, 0.3, 0);
    m.cone(x, 0.35 * s, z, 0.62 * s, 0.85 * s, 6, 0.42, 0.08);
    m.cone(x, 0.85 * s, z, 0.45 * s, 0.75 * s, 5, 0.5, 0);
  }

  function build(def) {
    var rows = def.map, MW = rows[0].length, MH = rows.length;
    var at = function (c, r) { return r < 0 || r >= MH || c < 0 || c >= MW ? null : rows[r][c]; };
    var solid = {}, chunks = {}, glow = builder(), lights = [], spots = [];
    function chunk(c, r) {
      var k = Math.floor(c / CHUNK) + "," + Math.floor(r / CHUNK);
      if (!chunks[k]) { chunks[k] = builder(); chunks[k].cx = (Math.floor(c / CHUNK) + 0.5) * CHUNK; chunks[k].cz = -(Math.floor(r / CHUNK) + 0.5) * CHUNK; }
      return chunks[k];
    }
    function ground(m, c, r, alb) { m.quad([c, 0, -r], [c + 1, 0, -r], [c + 1, 0, -r - 1], [c, 0, -r - 1], [0, 1, 0], alb); }

    /* the map itself, plus a band of forest around it and a clearing for the tower up north */
    var T = def.tower, M = 7;
    for (var r = T.y - 6; r < MH + M; r++) for (var c = -M; c < MW + M; c++) {
      var ch = at(c, r), m = chunk(c, r), h = hash(c, r);
      if (ch === null) {
        var dt = Math.abs(c + 0.5 - T.x) + Math.abs(r + 0.5 - T.y);
        var road = r < 0 && (c === 11 || c === 12) && r > T.y + 2;
        ground(m, c, r, road ? 0.8 : 0.42 + h * 0.06);
        if (!road && dt > 5.5 && h < 0.4) tree(m, c + 0.3 + h * 0.4, -r - 0.3 - hash(r, c) * 0.4, 0.9 + h * 0.6, true);
        continue;
      }
      if (ch !== "#" && ch !== "D") ground(m, c, r, ch === "," ? 0.92 + h * 0.04 : ch === "W" ? 0.8 : 0.5 + h * 0.06);
      if (ch === "T") { tree(m, c + 0.5, -r - 0.5, 1 + h * 0.3); solid[c + "," + r] = 1; }
      if (ch === "L") {
        m.box(c + 0.44, 0, -r - 0.56, c + 0.56, 1.3, -r - 0.44, 0.2);
        glow.box(c + 0.33, 1.3, -r - 0.67, c + 0.67, 1.72, -r - 0.33, 0.9);
        lights.push({ x: c + 0.5, y: 1.5, z: -r - 0.5, radius: 3.6, power: 1.1, base: 1.1, seed: h * 10 });
        solid[c + "," + r] = 1;
      }
      if (ch === "#" || ch === "D" || ch === "W") solid[c + "," + r] = 1;
    }

    /* houses: each rectangle of # and D; the door is on the south wall */
    var seen = {};
    for (r = 0; r < MH; r++) for (c = 0; c < MW; c++) {
      if ("#D".indexOf(at(c, r)) < 0 || seen[c + "," + r]) continue;
      var w = 0, d = 0;
      while ("#D".indexOf(at(c + w, r) || ".") >= 0) w++;
      while ("#D".indexOf(at(c, r + d) || ".") >= 0) d++;
      for (var yy = 0; yy < d; yy++) for (var xx = 0; xx < w; xx++) seen[(c + xx) + "," + (r + yy)] = 1;
      var m2 = chunk(c, r), x0 = c + 0.05, x1 = c + w - 0.05, zN = -r - 0.05, zS = -r - d + 0.05, hh = 1.5 + (w * d > 12 ? 0.3 : 0);
      m2.box(x0, 0, zS, x1, hh, zN, 1.5, false);
      m2.box(x0 - 0.05, 0, zS - 0.05, x1 + 0.05, 0.2, zN + 0.05, 0.7, 0.7);    /* stone footing */
      m2.roof(x0 - 0.35, zS - 0.4, x1 + 0.35, zN + 0.4, hh, 1.0, (w - d) / 2 > 0 ? (w - d) / 2 : 0.01, 0.34);
      for (xx = 0; xx < w; xx++) {
        var cx = c + xx + 0.5;
        if (at(c + xx, r + d - 1) === "D") {
          m2.quad([cx - 0.3, 0, zS - 0.01], [cx + 0.3, 0, zS - 0.01], [cx + 0.3, 1.0, zS - 0.01], [cx - 0.3, 1.0, zS - 0.01], [0, 0, -1], 0.12);
          spots.push({ x: c + xx, y: r + d - 1, say: ["门关着。"] });
        } else if (xx % 2 === 1) {
          /* a lit paper window, and the glow it throws on the street */
          glow.quad([cx - 0.25, 0.65, zS - 0.01], [cx + 0.25, 0.65, zS - 0.01], [cx + 0.25, 1.1, zS - 0.01], [cx - 0.25, 1.1, zS - 0.01], [0, 0, -1], 0.75);
          lights.push({ x: cx, y: 0.9, z: zS - 0.6, radius: 1.8, power: 0.55, base: 0.55, seed: cx });
        }
      }
    }

    /* the well in the square */
    var wl = def.map.join("\n").split("\n");
    for (r = 0; r < MH; r++) { c = wl[r].indexOf("WW"); if (c >= 0) break; }
    var wm = chunk(c, r), wx = c + 1, wz = -r - 1;
    wm.box(wx - 0.8, 0, wz - 0.8, wx + 0.8, 0.55, wz + 0.8, 1.1, false);
    wm.quad([wx - 0.8, 0.55, wz - 0.8], [wx + 0.8, 0.55, wz - 0.8], [wx + 0.8, 0.55, wz + 0.8], [wx - 0.8, 0.55, wz + 0.8], [0, 1, 0], 0.05);
    wm.box(wx - 0.75, 0.55, wz - 0.06, wx - 0.6, 1.6, wz + 0.06, 0.25);
    wm.box(wx + 0.6, 0.55, wz - 0.06, wx + 0.75, 1.6, wz + 0.06, 0.25);
    wm.roof(wx - 1.0, wz - 0.6, wx + 1.0, wz + 0.6, 1.6, 0.5, 0.6, 0.22);

    /* the tower: seven storeys, each with flared eaves, and a light at the top */
    var tw = builder(), tx = T.x, tz = -T.y, y = 0;
    tw.box(tx - 2.2, 0, tz - 2.2, tx + 2.2, 0.5, tz + 2.2, 0.4);
    y = 0.5;
    for (var i = 0; i < 7; i++) {
      var s = 1.5 - i * 0.14, hgt = 1.5 - i * 0.08;
      tw.box(tx - s, y, tz - s, tx + s, y + hgt, tz + s, 1.2, false);
      tw.roof(tx - s - 0.55, tz - s - 0.55, tx + s + 0.55, tz + s + 0.55, y + hgt, 0.45, 0.01, 0.2);
      y += hgt + 0.3;
    }
    tw.cone(tx, y - 0.3, tz, 0.35, 2.2, 4, 0.3, 0.125);
    glow.box(tx - 0.25, y - 1.6, tz - 1.0, tx + 0.25, y - 1.1, tz - 0.99, 1);
    lights.push({ x: tx, y: y - 1.3, z: tz - 1.6, radius: 3, power: 0.8, base: 0.8, seed: 3 });

    var list = Object.keys(chunks).map(function (k) { return chunks[k]; });
    return { def: def, chunks: list, glow: glow, tower: tw, lights: lights, solid: solid, spots: spots, width: MW, height: MH };
  }

  /* far-off points for stars: fixed positions, drawn over the sky only */
  var STARS = [];
  for (var s = 0; s < 40; s++) STARS.push([hash(s, 7) * 120 - 50, 18 + hash(s, 9) * 30, 70 + hash(s, 3) * 20]);
  var SHADOW = (function () { var m = builder(); m.cone(0, 0.03, 0, 0.36, 0.0001, 8, 0.02); return m; })();

  /* draw a frame. view: {x, y, z (what the camera looks at), yaw, pitch, dist, time}; actors: [{art, x, z, flip}] */
  function render(R, w, view, actors) {
    var cam = R.camera;
    cam.x = view.x; cam.y = view.y || 0; cam.z = view.z; cam.yaw = view.yaw || 0; cam.pitch = view.pitch; cam.dist = view.dist; cam.focal = 136;
    R.sun = { dir: Lo3D.norm([-0.4, 0.7, -0.6]), ambient: 0.3, diffuse: 0.5 };
    R.fog = { near: view.dist + 3, far: view.dist + 24, lum: 0.5 };
    R.focus = { near: view.dist - 4, far: view.dist + 9 };
    R.near = 0.3;
    /* lanterns flicker; only lights near the camera's target are worth their per-pixel cost */
    var t = view.time || 0;
    R.lights = w.lights.filter(function (L) {
      L.power = L.base * (0.86 + 0.14 * Math.sin(t * 11 + L.seed * 7) * Math.sin(t * 4.3 + L.seed));
      var dx = L.x - view.x, dz = L.z - view.z;
      return dx * dx + dz * dz < 13 * 13 || L.y > 5;
    });
    R.clear(function (yy) { return 0.12 + 0.38 * Math.min(1, yy / 60); });
    /* a chunk is drawn when the screen rectangle of its box (ground to treetops) overlaps the screen */
    w.chunks.forEach(function (m) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, h = CHUNK / 2 + 0.5;
      for (var i = 0; i < 8; i++) {
        var p = R.project([m.cx + (i & 1 ? h : -h), i & 2 ? 3 : 0, m.cz + (i & 4 ? h : -h)]);
        if (!p) { x0 = -1e9; x1 = 1e9; y0 = -1e9; y1 = 1e9; break; }
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
      if (x1 >= 0 && x0 < R.width && y1 >= 0 && y0 < R.height && (m.cz - view.z) < view.dist + 22) R.draw(m);
    });
    R.draw(w.tower);
    R.draw(w.glow, null, { bias: 0.5 });
    actors.forEach(function (a) { R.draw(SHADOW, function (p) { return [p[0] + a.x, p[1], p[2] + a.z]; }); });
    actors.forEach(function (a) { R.sprite(a.art, a.x, 0, a.z, { scale: 1 / 16, flip: a.flip, crisp: true }); });
    R.present();
    STARS.forEach(function (p, i) { if ((i * 7 + Math.floor(t * 2)) % 23) R.dot([p[0] + view.x, p[1], p[2] + view.z], 3, 0); });
    return R.image;
  }

  return { build: build, render: render, hash: hash };
})();
