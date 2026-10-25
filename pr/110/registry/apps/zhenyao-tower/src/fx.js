/* Battle effects: particles, timed layers, and post-processing on the lo-3d tone image (R.image.px).
   They live in this game, not in lo-3d: no other app needs them yet, and a lo-3d release is permanent,
   so the API should be proven by a second user first.
   A layer is {life, draw(R, t), lights(t), dots(R, t), post(px, t)}; every part is optional, t counts up from 0. */
var FX = (function () {
  var W = 160, H = 144, tmp = new Uint8Array(W * H);
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var parts = [], layers = [];

  /* ---------- post-processing: px is a W*H array of tones 0-3 ---------- */
  function invert(px) { for (var i = 0; i < px.length; i++) px[i] = 3 - px[i]; }
  /* raster wave: each row slides sideways, like heat haze or a scanline effect on old hardware */
  function wave(px, amp, freq, phase, y0, y1) {
    tmp.set(px);
    y0 = Math.max(0, y0 || 0); y1 = Math.min(H, y1 == null ? H : y1);
    for (var y = y0; y < y1; y++) {
      var s = Math.round(amp * Math.sin(y * freq + phase)), row = y * W;
      if (!s) continue;
      for (var x = 0; x < W; x++) { var sx = x - s; px[row + x] = tmp[row + (sx < 0 ? 0 : sx >= W ? W - 1 : sx)]; }
    }
  }
  /* zoom by k around (cx, cy); nearest pixel, so it stays crisp */
  function zoom(px, k, cx, cy) {
    if (Math.abs(k - 1) < 0.01) return;
    tmp.set(px);
    for (var y = 0; y < H; y++) {
      var sy = Math.round(cy + (y - cy) / k); sy = sy < 0 ? 0 : sy >= H ? H - 1 : sy;
      for (var x = 0; x < W; x++) {
        var sx = Math.round(cx + (x - cx) / k); sx = sx < 0 ? 0 : sx >= W ? W - 1 : sx;
        px[y * W + x] = tmp[sy * W + sx];
      }
    }
  }
  /* big square pixels of size n */
  function mosaic(px, n) {
    n = Math.max(1, Math.round(n));
    if (n < 2) return;
    for (var y = 0; y < H; y += n) for (var x = 0; x < W; x += n) {
      var v = px[Math.min(H - 1, y + (n >> 1)) * W + Math.min(W - 1, x + (n >> 1))];
      for (var yy = y; yy < Math.min(H, y + n); yy++) for (var xx = x; xx < Math.min(W, x + n); xx++) px[yy * W + xx] = v;
    }
  }
  /* cover a fraction f (0..1) of the pixels with one tone, in Bayer order: a dithered fade */
  function cover(px, tone, f, x0, y0, x1, y1) {
    var th = f * 16;
    if (th <= 0) return;
    x0 = x0 || 0; y0 = y0 || 0; x1 = x1 == null ? W : x1; y1 = y1 == null ? H : y1;
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) if (BAYER[(y & 3) * 4 + (x & 3)] < th) px[y * W + x] = tone;
  }
  /* n lines from radius r0 to r1 around (cx, cy): speed lines for a hit on the weakness */
  function rays(px, cx, cy, r0, r1, n, tone, rot) {
    for (var i = 0; i < n; i++) {
      var a = rot + i / n * Math.PI * 2 + (i % 3) * 0.07, c = Math.cos(a), s = Math.sin(a);
      var len = r1 - (i % 2) * (r1 - r0) * 0.35;
      for (var r = r0; r < len; r += 0.7) {
        var x = Math.round(cx + c * r), y = Math.round(cy + s * r);
        if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = tone;
      }
    }
  }
  /* a dithered disc of light or dark around (cx, cy), stronger at the centre */
  function glow(px, cx, cy, r, tone, k) {
    for (var y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, cy + r); y++) for (var x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, cx + r); x++) {
      var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r;
      if (d < 1 && BAYER[(y & 3) * 4 + (x & 3)] < (1 - d) * 16 * k) px[y * W + x] = tone;
    }
  }

  /* ---------- particles: {x, y, z, vx, vy, vz, life, tone, size, grav, drag, trail} ---------- */
  function spawn(p) {
    p.age = 0; p.vx = p.vx || 0; p.vy = p.vy || 0; p.vz = p.vz || 0;
    p.life = p.life || 1; p.tone = p.tone == null ? 3 : p.tone;
    parts.push(p);
    return p;
  }
  function emit(n, fn) { for (var i = 0; i < n; i++) spawn(fn(i, Math.random())); }
  /* a ball of n particles flying out from a point */
  function burst(x, y, z, n, speed, o) {
    o = o || {};
    emit(n, function () {
      var a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), c = Math.sqrt(1 - e * e);
      return { x: x, y: y, z: z, vx: Math.cos(a) * c * s, vy: e * s + (o.up || 0), vz: Math.sin(a) * c * s,
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.6), tone: o.tone, size: o.size || 0, grav: o.grav || 0, drag: o.drag || 0, trail: o.trail };
    });
  }
  function stepParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.px = p.x; p.py = p.y; p.pz = p.z;
      if (p.drag) { var k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vy -= (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
  }
  function drawParts(R) {
    parts.forEach(function (p) {
      /* blink out over the last fifth of a life */
      if (p.age > p.life * 0.8 && (Math.floor(p.age * 30) & 1)) return;
      if (p.trail) R.streak([p.x - p.vx * p.trail, p.y - p.vy * p.trail, p.z - p.vz * p.trail], [p.x, p.y, p.z], p.tone);
      else R.dot([p.x, p.y, p.z], p.tone, p.size);
    });
  }

  /* ---------- layers ---------- */
  /* returns a function that removes the layer; its .layer is the layer itself (for its clock, .t) */
  function layer(o) {
    o.t = 0; layers.push(o);
    var remove = function () { var i = layers.indexOf(o); if (i >= 0) layers.splice(i, 1); };
    remove.layer = o;
    return remove;
  }
  /* frozen: a hit-stop; only layers marked always (the hit-stop itself) move on */
  function step(dt, frozen) {
    if (!frozen) stepParts(dt);
    for (var i = layers.length - 1; i >= 0; i--) {
      var L = layers[i];
      if (frozen && !L.always) continue;
      L.t += dt;
      if (L.life && L.t >= L.life) layers.splice(i, 1);
    }
  }
  function each(name, a, b) { layers.forEach(function (L) { if (L[name]) L[name](a, L.t, b); }); }
  function lights() {
    var out = [];
    layers.forEach(function (L) { if (L.lights) out = out.concat(L.lights(L.t) || []); });
    return out;
  }
  function reset() { parts.length = 0; layers.length = 0; }

  /* ---------- small meshes ---------- */
  /* a flying-sword blade along +z, from the hilt (z -0.3) to the tip (z 0.55); diamond in section so it shows from any side.
     Two meshes, because each is drawn in a fixed tone (lo-3d `tone`): the blade in paper, the hilt and guard in dark and mid.
     Fixed tones keep the sword readable on any background, so the scene does not have to be darkened around it. */
  var BLADE_V = [[0, 0, 0.55], [0.08, 0, 0.1], [0, 0.08, 0.1], [-0.08, 0, 0.1], [0, -0.08, 0.1], [0, 0, -0.3], [0.17, 0, 0.06], [-0.17, 0, 0.06], [0, 0, 0.0]];
  var BLADE = { v: BLADE_V, t: [[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4]], two: true };
  var HILT = { v: BLADE_V, t: [[5, 1, 2], [5, 2, 3], [5, 3, 4], [5, 4, 1]], two: true };
  var GUARD = { v: BLADE_V, t: [[6, 8, 7], [6, 7, 8]], two: true };
  /* model -> world for a mesh pointing along d (unit vector), scaled by s, at p */
  function aim(p, d, s, spin) {
    var yaw = Math.atan2(d[0], d[2]), pitch = -Math.asin(Math.max(-1, Math.min(1, d[1])));
    return function (q) {
      var v = Lo3D.rotY(Lo3D.rotX(Lo3D.rotZ([q[0] * s, q[1] * s, q[2] * s], spin || 0), pitch), yaw);
      return [v[0] + p[0], v[1] + p[1], v[2] + p[2]];
    };
  }
  function at(p, s, ry) {
    return function (q) {
      var v = ry ? Lo3D.rotY(q, ry) : q;
      return [v[0] * s + p[0], v[1] * s + p[1], v[2] * s + p[2]];
    };
  }
  /* ---------- ribbon trails ---------- */
  /* Keep the last few positions of a moving thing: push(hist, p, n) adds p (unless it has not moved) and keeps n. */
  function push(hist, p, n) {
    var q = hist[hist.length - 1];
    if (q && Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-3) return;
    hist.push(p.slice());
    if (hist.length > n) hist.shift();
  }
  /* A trail drawn as a lo-3d ribbon along the recent positions (oldest first), tapering to nothing at the tail.
     The band always faces the camera (its `up` is the direction to the eye), so it never turns edge-on, and it is
     one-sided in lo-3d, hence `two: true`. The older half is drawn at alpha 0.5, the newer half solid: a fade
     built from two ribbons. `tone` keeps it paper white on any background (no darkening needed behind it). */
  function trail(R, hist, width, tone) {
    var n = hist.length;
    if (n < 3) return;
    var c = R.camera, up = Lo3D.rotY(Lo3D.rotX([0, 0, -1], -c.pitch), c.yaw), mid = n >> 1;
    [[0, mid, 0.5], [mid, n - 1, 1]].forEach(function (h) {
      var path = hist.slice(h[0], h[1] + 1);
      if (path.length < 2) return;
      var m = Lo3D.builder().ribbon(path, function (t) { return width * (h[0] + t * (h[1] - h[0])) / (n - 1); }, 1, up);
      R.draw(m, null, { tone: tone == null ? 3 : tone, alpha: h[2], two: true });
    });
  }
  var BALL = Lo3D.ico(1), CUBE = Lo3D.box(1, 1, 1);

  return {
    W: W, H: H, invert: invert, wave: wave, zoom: zoom, mosaic: mosaic, cover: cover, rays: rays, glow: glow,
    spawn: spawn, emit: emit, burst: burst, drawParts: drawParts, parts: parts,
    layer: layer, step: step, each: each, lights: lights, reset: reset,
    BLADE: BLADE, HILT: HILT, GUARD: GUARD, push: push, trail: trail, BALL: BALL, CUBE: CUBE, aim: aim, at: at
  };
})();
