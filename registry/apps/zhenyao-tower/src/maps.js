/* The 3D scenes of the maps after the town (STORY.road, floor1, floor2, top in src/story.js). The town stays in
   src/world.js; this file borrows its helpers (World.hash, World.tree, World.pagoda) and its way of drawing:
   a map becomes a few chunked meshes plus lights, and a frame draws only the chunks on screen.
   Kinds: "road" (night mountain path, rain), "tower" (inside, dark, braziers), "roof" (the top, open sky).
   Tile (col, row) covers x in [col, col+1] and z in [-row-1, -row], like the town: north is +z.
   Walls with floor to their north are low (0.6), or the hero would vanish behind them: the camera looks
   down at 35 degrees, so a wall hides what stands right behind it. Walls with wall behind them are tall. */
var Maps = (function () {
  var builder = Lo3D.builder, hash = World.hash, CHUNK = 4;

  /* what a map holds, in reading order: where people, chests, enemies, the boss and the stones stand */
  function parse(def) {
    var rows = def.map, o = { w: rows[0].length, h: rows.length, people: [], chests: [], foes: [], boss: null, saves: [], murals: [] };
    rows.forEach(function (row, r) {
      for (var c = 0; c < row.length; c++) {
        var ch = row[c], p = { c: c, r: r };
        if (ch === "N") o.people.push(p);
        else if (ch === "C") o.chests.push(p);
        else if (ch === "$") o.saves.push(p);
        else if (ch === "M") o.murals.push(p);
        else if (ch === "B") o.boss = p;
        else if (ch >= "1" && ch <= "5") { p.k = +ch; o.foes.push(p); }
      }
    });
    return o;
  }

  /* ---------- pieces ---------- */
  function lantern(m, glow, lights, c, r, seed) {
    m.box(c + 0.44, 0, -r - 0.56, c + 0.56, 1.3, -r - 0.44, 0.2);
    glow.box(c + 0.33, 1.3, -r - 0.67, c + 0.67, 1.72, -r - 0.33, 0.9);
    lights.push({ x: c + 0.5, y: 1.5, z: -r - 0.5, radius: 3.6, power: 1.1, base: 1.1, seed: seed * 10 });
  }
  function brazier(m, glow, lights, c, r, seed) {
    var x = c + 0.5, z = -r - 0.5;
    m.box(x - 0.08, 0, z - 0.08, x + 0.08, 0.55, z + 0.08, 0.25);
    m.box(x - 0.3, 0.55, z - 0.3, x + 0.3, 0.75, z + 0.3, 0.3, 0.12);
    glow.cone(x, 0.72, z, 0.2, 0.55, 4, 0.95, 0.125);
    lights.push({ x: x, y: 1.0, z: z, radius: 5, power: 1.0, base: 1.0, seed: seed * 10 });
  }
  function pillar(m, c, r) {
    var x = c + 0.5, z = -r - 0.5;
    m.box(x - 0.4, 0, z - 0.4, x + 0.4, 0.22, z + 0.4, 0.62);
    m.box(x - 0.28, 0.22, z - 0.28, x + 0.28, 2.4, z + 0.28, 0.55, false);
    m.box(x - 0.38, 2.4, z - 0.38, x + 0.38, 2.6, z + 0.38, 0.62);
  }
  /* a small carved stele; the frame of its rune glows */
  function stele(m, glow, lights, c, r) {
    var x = c + 0.5, z = -r - 0.5, zf = z - 0.105;
    m.box(x - 0.34, 0, z - 0.22, x + 0.34, 0.14, z + 0.22, 0.6);
    m.box(x - 0.24, 0.14, z - 0.1, x + 0.24, 1.1, z + 0.1, 0.5, 0.62);
    m.box(x - 0.29, 1.1, z - 0.14, x + 0.29, 1.2, z + 0.14, 0.6);
    var f = function (x0, y0, x1, y1) { glow.quad([x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], [0, 0, -1], 0.95); };
    f(x - 0.16, 0.32, x + 0.16, 0.38); f(x - 0.16, 0.9, x + 0.16, 0.96);
    f(x - 0.16, 0.32, x - 0.1, 0.96); f(x + 0.1, 0.32, x + 0.16, 0.96);
    f(x - 0.03, 0.46, x + 0.03, 0.82);
    lights.push({ x: x, y: 1.0, z: z - 0.5, radius: 2.6, power: 0.8, base: 0.8, seed: c + r });
  }
  function rock(m, c, r, h) {
    var x = c + 0.5, z = -r - 0.5;
    m.cone(x - 0.05, 0, z, 0.52 + h * 0.1, 0.6 + h * 0.3, 5, 0.62, h);
    m.cone(x + 0.25, 0, z - 0.15, 0.3, 0.38, 5, 0.52, h * 2);
  }
  /* a chest: closed, or open with the lid thrown back and a dark mouth */
  function chest(c, r) {
    var x = c + 0.5, z = -r - 0.5, x0 = x - 0.32, x1 = x + 0.32, z0 = z - 0.22, z1 = z + 0.22;
    var a = builder(), o = builder();
    a.box(x0, 0, z0, x1, 0.34, z1, 0.3);
    a.box(x0 - 0.02, 0.34, z0 - 0.02, x1 + 0.02, 0.5, z1 + 0.02, 0.4, 0.5);
    a.quad([x - 0.06, 0.28, z0 - 0.025], [x + 0.06, 0.28, z0 - 0.025], [x + 0.06, 0.44, z0 - 0.025], [x - 0.06, 0.44, z0 - 0.025], [0, 0, -1], 1.4);
    o.box(x0, 0, z0, x1, 0.34, z1, 0.3, false);
    o.quad([x0 + 0.04, 0.34, z0 + 0.04], [x1 - 0.04, 0.34, z0 + 0.04], [x1 - 0.04, 0.34, z1 - 0.04], [x0 + 0.04, 0.34, z1 - 0.04], [0, 1, 0], 0.03);
    o.quad([x0, 0.34, z1], [x1, 0.34, z1], [x1, 0.72, z1 + 0.16], [x0, 0.72, z1 + 0.16], [0, 0.5, -1], 0.34);
    return { c: c, r: r, closed: a, open: o };
  }
  /* stairs up in a wall row: four steps rising north */
  function stairsUp(m, glow, lights, c, r) {
    var zs = -r - 1;
    for (var i = 0; i < 4; i++) m.box(c + 0.06, 0, zs + 0.25 * i, c + 0.94, 0.2 * (i + 1), zs + 0.25 * (i + 1), 0.46, 0.8 - i * 0.04);
    glow.quad([c + 0.06, 2.0, zs - 0.01], [c + 0.94, 2.0, zs - 0.01], [c + 0.94, 2.1, zs - 0.01], [c + 0.06, 2.1, zs - 0.01], [0, 0, -1], 0.9);
    lights.push({ x: c + 0.5, y: 1.4, z: zs - 0.3, radius: 3, power: 0.7, base: 0.7, seed: c * 3 + r });
  }
  /* stairs down: the floor sinks into three darker strips */
  function stairsDown(m, c, r) {
    var zs = -r - 1, a = [0.4, 0.24, 0.1];
    for (var i = 0; i < 3; i++) m.quad([c, 0.01, zs + i / 3], [c + 1, 0.01, zs + i / 3], [c + 1, 0.01, zs + (i + 1) / 3], [c, 0.01, zs + (i + 1) / 3], [0, 1, 0], a[2 - i]);
  }

  /* ---------- the build ---------- */
  function build(def) {
    var P = parse(def), rows = def.map, W = P.w, H = P.h, kind = def.kind;
    var at = function (c, r) { return r < 0 || r >= H || c < 0 || c >= W ? null : rows[r][c]; };
    var wallCh = function (ch) { return kind !== "roof" && (ch === "X" || ch === "G" || ch === "M"); };
    var chunks = {}, glow = builder(), far = builder(), lights = [], solid = {}, WH = {}, pillars = [];
    function chunk(c, r) {
      var k = Math.floor(c / CHUNK) + "," + Math.floor(r / CHUNK);
      if (!chunks[k]) { chunks[k] = builder(); chunks[k].cx = (Math.floor(c / CHUNK) + 0.5) * CHUNK; chunks[k].cz = -(Math.floor(r / CHUNK) + 0.5) * CHUNK; chunks[k].top = 1; }
      return chunks[k];
    }
    function up(m, y) { if (y > m.top) m.top = y; }
    function ground(m, c, r, alb) { m.quad([c, 0, -r], [c + 1, 0, -r], [c + 1, 0, -r - 1], [c, 0, -r - 1], [0, 1, 0], alb); }
    function wallH(c, r) {
      var ch = at(c, r), n = at(c, r - 1), h = hash(c, r);
      if (ch === "G") return 2.8;
      if (ch === "M") return 1.2;
      if (kind === "road" && r === 0) return 2.8;
      var back = n === null || n === "X" || n === "G" || n === "^";
      return kind === "road" ? (back ? 2.1 + h * 1.5 : 0.55 + h * 0.35) : (back ? 2.6 : 0.6);
    }
    function heightAt(c, r) { return wallCh(at(c, r)) ? WH[c + "," + r] : 0; }

    /* a wall block: only the faces that can be seen, up to the neighbour's height */
    function wall(c, r) {
      var m = chunk(c, r), h = WH[c + "," + r], hv = hash(c, r), road = kind === "road";
      var side = road ? 0.32 + hv * 0.1 : (c + r) & 1 ? 0.36 : 0.32, top = road ? 0.42 + hv * 0.08 : 0.72;
      var zs = -r - 1, zn = -r, hs = heightAt(c, r + 1), hw = heightAt(c - 1, r), he = heightAt(c + 1, r);
      up(m, h);
      if (hs < h) m.quad([c, hs, zs], [c + 1, hs, zs], [c + 1, h, zs], [c, h, zs], [0, 0, -1], side);
      if (hw < h) m.quad([c, hw, zn], [c, hw, zs], [c, h, zs], [c, h, zn], [-1, 0, 0], side * 0.85);
      if (he < h) m.quad([c + 1, he, zs], [c + 1, he, zn], [c + 1, h, zn], [c + 1, h, zs], [1, 0, 0], side * 0.85);
      m.quad([c, h, zs], [c + 1, h, zs], [c + 1, h, zn], [c, h, zn], [0, 1, 0], top);
    }

    var r, c, ch, m, h;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (wallCh(at(c, r))) WH[c + "," + r] = wallH(c, r);

    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      ch = at(c, r); m = chunk(c, r); h = hash(c, r);
      if (ch !== "." && ch !== "," && !(ch >= "1" && ch <= "5")) solid[c + "," + r] = 1;
      if (wallCh(ch)) { wall(c, r); continue; }
      /* the floor under everything else */
      if (kind === "road") ground(m, c, r, ch === "," ? 0.88 + h * 0.05 : 0.42 + h * 0.07);
      else if (kind === "tower") ground(m, c, r, ch === "," ? 0.36 + h * 0.03 : ((c + r) & 1 ? 0.6 : 0.54) + h * 0.05);
      else ground(m, c, r, ch === "," ? 0.68 : (c & 1 ? 0.42 : 0.47) + h * 0.03);
      if (ch === "T") {
        var cheap = true, dr, dc;
        for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) { var nb = at(c + dc, r + dr); if (nb !== "T" && nb !== "X") cheap = false; }
        World.tree(m, c + 0.5 + (h - 0.5) * 0.3, -r - 0.5 + (hash(r, c) - 0.5) * 0.3, 1 + h * 0.3, cheap);
        up(m, 2.9);
      } else if (ch === "R") { rock(m, c, r, h); up(m, 1.2); }
      else if (ch === "L") { lantern(m, glow, lights, c, r, h); up(m, 1.8); }
      else if (ch === "F") { brazier(m, glow, lights, c, r, h); up(m, 1.3); }
      else if (ch === "P") { var pm = builder(); pillar(pm, c, r); pillars.push({ x: c + 0.5, z: -r - 0.5, mesh: pm }); }
      else if (ch === "$") { stele(m, glow, lights, c, r); up(m, 1.3); }
      else if (ch === "^") { stairsUp(m, glow, lights, c, r); up(m, 2.2); }
      else if (ch === "v") stairsDown(m, c, r);
    }

    /* the roof's railing: one rail per run of X, with a post at each end and every other tile */
    if (kind === "roof") {
      var rail = function (m2, x0, z0, x1, z1) { m2.box(x0, 0.72, z0, x1, 0.86, z1, 0.7); };
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
        if (at(c, r) !== "X") continue;
        m = chunk(c, r); up(m, 1);
        var cx = c + 0.5, cz = -r - 0.5;
        if ((c + r) % 2 === 0 || at(c + 1, r) !== "X" || at(c - 1, r) !== "X") m.box(cx - 0.07, 0, cz - 0.07, cx + 0.07, 0.9, cz + 0.07, 0.62);
        if (at(c + 1, r) === "X") rail(m, cx, cz - 0.05, cx + 1, cz + 0.05);
        if (at(c, r + 1) === "X") rail(m, cx - 0.05, cz - 1, cx + 0.05, cz);
      }
      /* the tower's body under the roof, a sea of cloud far below, and peaks standing out of it */
      far.box(-0.4, -4, -H - 0.4, W + 0.4, 0, 0.4, 0.4, false);
      far.quad([-70, -6, -70], [70, -6, -70], [70, -6, 70], [-70, -6, 70], [0, 1, 0], 0.62);
      for (var pk = 0; pk < 12; pk++) {
        var pa = pk / 12 * Math.PI * 2 + 0.2, pr = 26 + hash(pk, 4) * 14;
        far.cone(W / 2 + Math.cos(pa) * pr, -6, -H / 2 + Math.sin(pa) * pr, 6 + hash(pk, 5) * 4, 12 + hash(pk, 6) * 8, 5, 0.34, 0.1);
      }
      /* a low dais where the boss stands */
      if (P.boss) {
        var bx = P.boss.c + 0.5, bz = -P.boss.r - 0.5;
        m = chunk(P.boss.c, P.boss.r);
        m.box(bx - 2, 0, bz - 1.6, bx + 2, 0.08, bz + 1.6, 0.72, 0.8);
        m.box(bx - 1.4, 0.08, bz - 1.1, bx + 1.4, 0.14, bz + 1.1, 0.6, 0.66);
      }
    }

    /* the road: the path runs on past the south edge, and the tower's gate stands at the north */
    if (kind === "road") {
      for (r = H; r < H + 5; r++) for (c = 0; c < W; c++) {
        m = chunk(c, r); h = hash(c, r);
        var path = at(c, H - 1) === ",";
        ground(m, c, r, path ? 0.88 + h * 0.05 : 0.42 + h * 0.07);
        if (!path && h < 0.5) { World.tree(m, c + 0.5, -r - 0.5, 1.1 + h * 0.4, true); up(m, 2.9); }
      }
      var gx = rows[0].indexOf("G"), gw = rows[0].lastIndexOf("G") - gx + 1, zf = -1.02;
      m = chunk(gx, 0);
      m.quad([gx + 0.2, 0, zf], [gx + gw - 0.2, 0, zf], [gx + gw - 0.2, 2.0, zf], [gx + 0.2, 2.0, zf], [0, 0, -1], 0.03);
      m.box(gx - 0.05, 0, -1.25, gx + 0.2, 2.1, zf, 0.7);
      m.box(gx + gw - 0.2, 0, -1.25, gx + gw + 0.05, 2.1, zf, 0.7);
      m.roof(gx - 0.5, -1.7, gx + gw + 0.5, -0.9, 2.1, 0.5, gw / 2 + 0.2, 0.26);
      up(m, 2.8);
      glow.quad([gx + 0.5, 2.5, -1.03], [gx + gw - 0.5, 2.5, -1.03], [gx + gw - 0.5, 2.66, -1.03], [gx + 0.5, 2.66, -1.03], [0, 0, -1], 0.9);
      lights.push({ x: gx + gw / 2, y: 1.8, z: -2.2, radius: 4.6, power: 0.9, base: 0.9, seed: 5 });
      /* the pagoda rises behind the facade; its lower storeys hide behind it */
      far.box(gx + gw / 2 - 3.4, 0, 0.2, gx + gw / 2 + 3.4, 0.5, 5.8, 0.4);
      World.pagoda(far, gx + gw / 2, 0.5, 2.8, 1.25);
    }

    var chestsList = P.chests.map(function (p, i) { var o = chest(p.c, p.r); o.i = i; return o; });
    /* the mural: ART.mural cut into runs of pixels, as quads on the wall's south face. A billboard would be
       hidden by the wall above its feet (the camera looks down), so the relief is real geometry. It goes in the
       glow mesh, so the carved lines catch light: paper for the outer rings, mid for the inner ones */
    P.murals.forEach(function (p) {
      var A = ART.mural, k = 1 / 16, x0 = p.c + 0.5 - A.w * k / 2, y0 = 0.16, z = -p.r - 1.012;
      for (var row = 0; row < A.h; row++) {
        for (var col = 0; col < A.w; col++) {
          var tone = A.px[row * A.w + col], end = col;
          if (tone === 255) continue;
          while (end + 1 < A.w && A.px[row * A.w + end + 1] === tone) end++;
          var ya = y0 + (A.h - 1 - row) * k, xa = x0 + col * k, xb = x0 + (end + 1) * k, a = tone === 3 ? 0.5 : tone === 2 ? 0.14 : 0.02;
          glow.quad([xa, ya, z], [xb, ya, z], [xb, ya + k, z], [xa, ya + k, z], [0, 0, -1], a);
          col = end;
        }
      }
    });
    return {
      def: def, kind: kind, chunks: Object.keys(chunks).map(function (k) { return chunks[k]; }), glow: glow, far: far,
      lights: lights, solid: solid, width: W, height: H, chests: chestsList, pillars: pillars, parsed: P
    };
  }

  /* ---------- drawing ---------- */
  var KIND = {
    road: { sky: [0.1, 0.42], amb: 0.26, dif: 0.42, fog: 0.35, near: 3, far: 24 },
    tower: { sky: [0.02, 0.07], amb: 0.22, dif: 0.32, fog: 0.08, near: 2, far: 18 },
    roof: { sky: [0.14, 0.5], amb: 0.3, dif: 0.46, fog: 0.4, near: 3, far: 26 }
  };
  var STARS = [];
  for (var s = 0; s < 40; s++) STARS.push([hash(s, 7) * 120 - 50, 18 + hash(s, 9) * 30, 70 + hash(s, 3) * 20]);
  var SHADOW = Lo3D.shadow(0.36, 8);
  var MAX_LIGHTS = 12;

  /* view: {x, y, z, pitch, dist, time, weather}; actors: [{art, x, z, y, flip, sh}]; st: {opened: {chest index: true}, hero: {x, z}} */
  function render(R, w, view, actors, st) {
    var cam = R.camera, K = KIND[w.kind], t = view.time || 0;
    cam.x = view.x; cam.y = view.y || 0; cam.z = view.z; cam.yaw = view.yaw || 0; cam.pitch = view.pitch; cam.dist = view.dist; cam.focal = 136;
    R.sun = { dir: Lo3D.norm([-0.4, 0.7, -0.6]), ambient: K.amb, diffuse: K.dif };
    R.fog = { near: view.dist + K.near, far: view.dist + K.far, lum: K.fog };
    R.focus = { near: view.dist - 4, far: view.dist + 9 };
    R.near = 0.3;
    /* the nearest few lights only: each costs per pixel */
    var ls = w.lights.map(function (L) {
      L.power = L.base * (0.86 + 0.14 * Math.sin(t * 11 + L.seed * 7) * Math.sin(t * 4.3 + L.seed));
      var dx = L.x - view.x, dz = L.z - view.z;
      L.d = dx * dx + dz * dz;
      return L;
    }).filter(function (L) { return L.d < 13 * 13; });
    if (ls.length > MAX_LIGHTS) ls = ls.sort(function (a, b) { return a.d - b.d; }).slice(0, MAX_LIGHTS);
    R.lights = ls;
    R.clear(function (yy) { return K.sky[0] + (K.sky[1] - K.sky[0]) * Math.min(1, yy / 60); });
    w.chunks.forEach(function (m) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, h = CHUNK / 2 + 0.5;
      for (var i = 0; i < 8; i++) {
        var p = R.project([m.cx + (i & 1 ? h : -h), i & 2 ? m.top : 0, m.cz + (i & 4 ? h : -h)]);
        if (!p) { x0 = -1e9; x1 = 1e9; y0 = -1e9; y1 = 1e9; break; }
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
      if (x1 >= 0 && x0 < R.width && y1 >= 0 && y0 < R.height && (m.cz - view.z) < view.dist + 22) R.draw(m);
    });
    if (w.far.t.length) R.draw(w.far);
    R.draw(w.glow, null, { bias: 0.5 });
    /* a pillar in front of the hero (within a few tiles south of him) turns see-through, or it would hide him */
    w.pillars.forEach(function (p) {
      var dz = st && st.hero ? st.hero.z - p.z : 99, dx = st && st.hero ? Math.abs(st.hero.x - p.x) : 99;
      if (p.z - view.z > view.dist + 14 || view.z - p.z > view.dist) return;
      R.draw(p.mesh, null, dz > 0.2 && dz < 3.9 && dx < 0.9 ? { alpha: 0.25 } : null);
    });
    w.chests.forEach(function (c) { R.draw(st && st.opened && st.opened[c.i] ? c.open : c.closed); });
    actors.forEach(function (a) { R.draw(SHADOW, function (p) { var k = a.sh || 1; return [p[0] * k + a.x, p[1], p[2] * k + a.z]; }); });
    actors.forEach(function (a) { R.sprite(a.art, a.x, a.y || 0, a.z, { scale: 1 / 16, flip: a.flip, crisp: true }); });
    R.present();
    if (w.kind !== "tower") STARS.forEach(function (p, i) { if ((i * 7 + Math.floor(t * 2)) % 23) R.dot([p[0] + view.x, p[1], p[2] + view.z], 3, 0); });
    if (view.weather === "rain") Weather.rain(R, view, t);
    return R.image;
  }

  return { parse: parse, build: build, render: render };
})();
