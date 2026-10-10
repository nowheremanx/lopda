/*
 * lo-3d.js 1.0.0, a small software 3D renderer for Lo-PDA apps.
 * MIT License. Copyright (c) 2026 Haowei Wu. See sdk/LICENSE.
 *
 * Paste-in library, like lo-game.js: an app carries its own copy inside a script tag
 * marked data-lo-3d="1.0.0", and `node tools/bundle-app.mjs registry/apps/<id>` fills it in.
 * Do not edit the copy inside an app; the checker verifies it.
 *
 * Pipeline: triangles and billboard sprites are rasterised into a luminance buffer with a
 * z-buffer (flat sun shading and fog per surface, point lights per pixel), then a 4x4 Bayer
 * dither turns luminance into the four tones 0-3. The result is a lo-game sprite
 * ({w, h, px}), so a lo-game app draws it with g.sprite(r.image, 0, 0).
 * Reference: sdk/LO-3D.md
 */
var Lo3D = (function () {
  "use strict";

  var VERSION = "1.0.0";
  var TONES = ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"];
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var CLEAR = 255;   /* a transparent sprite pixel, as in lo-game */
  var FAR = 1e9;

  /* ---------------- vector helpers: points are [x, y, z] arrays ---------------- */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
  function rotZ(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }

  /* ---------------- meshes: {v: [[x,y,z]...], t: [[a,b,c]...], c: [albedo per triangle], two} ----------------
     World axes: x right, y up, z away from the camera at yaw 0. A face is seen from the side where its
     corners run counter-clockwise; `two: true` draws both sides. */
  function box(w, h, d) {
    var v = [], t = [], i, x = w / 2, y = h / 2, z = d / 2;
    for (i = 0; i < 8; i++) v.push([(i & 1 ? x : -x), (i & 2 ? y : -y), (i & 4 ? z : -z)]);
    var q = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    for (i = 0; i < 6; i++) t.push([q[i][0], q[i][2], q[i][1]], [q[i][0], q[i][3], q[i][2]]);
    return { v: v, t: t };
  }
  function ico(r) {
    var g = (1 + Math.sqrt(5)) / 2, v = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]];
    var t = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (var i = 0; i < v.length; i++) { var n = norm(v[i]); v[i] = [n[0] * r, n[1] * r, n[2] * r]; }
    return { v: v, t: t.map(function (f) { return [f[0], f[2], f[1]]; }) };
  }
  /* a copy of a mesh with every vertex passed through fn(p) -> p; albedo `c` and `two` are kept */
  function transform(mesh, fn) {
    return { v: mesh.v.map(function (p) { return fn(p.slice()); }), t: mesh.t, c: mesh.c, two: mesh.two };
  }
  function move(mesh, dx, dy, dz) { return transform(mesh, function (p) { return [p[0] + dx, p[1] + dy, p[2] + dz]; }); }
  /* paint a whole mesh one albedo (0..1) */
  function paint(mesh, albedo) { var c = []; for (var i = 0; i < mesh.t.length; i++) c.push(albedo); return { v: mesh.v, t: mesh.t, c: c, two: mesh.two }; }
  /* one mesh from many: draw a static scene in a single call */
  function merge(list) {
    var v = [], t = [], c = [], two = false;
    list.forEach(function (m) {
      var base = v.length;
      m.v.forEach(function (p) { v.push(p); });
      m.t.forEach(function (tr, i) { t.push([tr[0] + base, tr[1] + base, tr[2] + base]); c.push(m.c ? m.c[i] : 1); });
      if (m.two) two = true;
    });
    return { v: v, t: t, c: c, two: two };
  }

  /* ---------------- the renderer ---------------- */
  function create(opt) {
    opt = opt || {};
    var W = opt.width || 160, H = opt.height || 144, N = W * H;
    var lum = new Float32Array(N), depth = new Float32Array(N);
    /* per-pixel data for point lights, made on first use: albedo, view-space normal, true view depth */
    var alb = null, nxb = null, nyb = null, nzb = null, vzb = null;
    var px = new Uint8Array(N);
    var THR = BAYER.map(function (b) { return (b + 0.5) / 16; });

    var r = {
      width: W, height: H,
      image: { w: W, h: H, px: px },   /* tones 0-3, a lo-game sprite */
      lum: lum, depth: depth,
      /* view(p) = rotX(rotY(p - (x,y,z), -yaw), pitch) + (0, 0, dist): an eye at (x,y,z) when dist is 0,
         or a camera orbiting the point (x,y,z) at distance dist */
      camera: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, dist: 0, focal: 120 },
      near: 0.2,
      clip: true,        /* clip triangles at the near plane; false skips any triangle that crosses it */
      sun: { dir: norm([-0.5, 0.8, -0.4]), ambient: 0.12, diffuse: 0.88 },   /* dir points toward the sun */
      lights: [],        /* point lights: {x, y, z, radius, power} */
      fog: null,         /* {near, far, lum}: surfaces fade to lum between the two view depths */
      focus: null,       /* {near, far}: outside these view depths the dither is twice as coarse */
      stats: { tris: 0 }
    };
    var cam, cy, sy, cp, sp, F, near, fog, fNear, fSpan, fLum;
    function begin() {
      cam = r.camera; cy = Math.cos(-cam.yaw); sy = Math.sin(-cam.yaw); cp = Math.cos(cam.pitch); sp = Math.sin(cam.pitch);
      F = cam.focal; near = r.near; fog = r.fog;
      if (fog) { fNear = fog.near; fSpan = fog.far - fog.near; fLum = fog.lum; }
      if (r.lights.length && !alb) {
        alb = new Float32Array(N); nxb = new Float32Array(N); nyb = new Float32Array(N); nzb = new Float32Array(N); vzb = new Float32Array(N);
      }
    }
    /* world -> view space */
    function view(p) {
      var x = p[0] - cam.x, y = p[1] - cam.y, z = p[2] - cam.z;
      var q0 = x * cy + z * sy, q2 = -x * sy + z * cy;
      return [q0, y * cp - q2 * sp, y * sp + q2 * cp + cam.dist];
    }
    function dir(n) { var q0 = n[0] * cy + n[2] * sy, q2 = -n[0] * sy + n[2] * cy; return [q0, n[1] * cp - q2 * sp, n[1] * sp + q2 * cp]; }
    function proj(q) { return [W / 2 + q[0] * F / q[2], H / 2 - q[1] * F / q[2], q[2]]; }

    r.clear = function (v) {
      depth.fill(FAR);
      if (alb) alb.fill(0);
      if (typeof v === "function") { for (var y = 0; y < H; y++) { var l = v(y); for (var x = 0; x < W; x++) lum[y * W + x] = l; } }
      else lum.fill(v == null ? 1 : v);
      r.stats.tris = 0;
    };
    r.clearDepth = function () { depth.fill(FAR); };
    /* world point -> [screenX, screenY, viewDepth], or null behind the near plane */
    r.project = function (p) { begin(); var q = view(p); return q[2] < near ? null : proj(q); };

    /* rasterise one screen triangle; L is its fogless luminance, n its view-space normal (for point lights) */
    function tri(A, B, C, L, a, n) {
      var minx = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      var miny = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      var area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (area === 0) return;
      var ia = 1 / area, x, y, lit = n && a > 0;
      var iA = 1 / A[2], iB = 1 / B[2], iC = 1 / C[2];
      for (y = miny; y <= maxy; y++) {
        var py = y + 0.5;
        for (x = minx; x <= maxx; x++) {
          var pxx = x + 0.5;
          var w0 = ((B[0] - pxx) * (C[1] - py) - (B[1] - py) * (C[0] - pxx)) * ia;
          var w1 = ((C[0] - pxx) * (A[1] - py) - (C[1] - py) * (A[0] - pxx)) * ia;
          var w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          var z = w0 * A[2] + w1 * B[2] + w2 * C[2], k = y * W + x;
          if (z < depth[k]) {
            depth[k] = z;
            var l = L;
            if (fog) { var f = Math.min(1, Math.max(0, (z - fNear) / fSpan)); l = l * (1 - f) + fLum * f; }
            lum[k] = l;
            if (alb) {
              if (lit) { alb[k] = a; nxb[k] = n[0]; nyb[k] = n[1]; nzb[k] = n[2]; vzb[k] = 1 / (w0 * iA + w1 * iB + w2 * iC); }
              else alb[k] = 0;
            }
          }
        }
      }
    }
    /* a screen-space line into the luminance buffer, no depth: wireframes */
    function line(A, B, l) {
      var x0 = Math.round(A[0]), y0 = Math.round(A[1]), x1 = Math.round(B[0]), y1 = Math.round(B[1]);
      var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy2 = y0 < y1 ? 1 : -1, e = dx + dy, guard = 0;
      while (guard++ < 600) {
        if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) { lum[y0 * W + x0] = l; if (alb) alb[y0 * W + x0] = 0; }
        if (x0 === x1 && y0 === y1) break;
        var e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy2; }
      }
    }
    /* the part of a view-space triangle in front of the near plane, as 0-2 triangles */
    function clipNear(a, b, c) {
      var src = [a, b, c], out = [];
      for (var i = 0; i < 3; i++) {
        var p = src[i], q = src[(i + 1) % 3], pin = p[2] >= near, qin = q[2] >= near;
        if (pin) out.push(p);
        if (pin !== qin) { var t = (near - p[2]) / (q[2] - p[2]); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, near]); }
      }
      return out.length === 4 ? [[out[0], out[1], out[2]], [out[0], out[2], out[3]]] : out.length === 3 ? [out] : [];
    }

    /* draw a mesh; fn maps a model-space vertex to world space (omit for meshes already in place).
       o: {bias: added luminance (glow), wire: outline instead of fill, albedo: default 1, two: both sides} */
    r.draw = function (mesh, fn, o) {
      o = o || {};
      begin();
      var n = mesh.v.length, wv = new Array(n), vv = new Array(n), sv = new Array(n), i;
      var sun = r.sun, LIGHT = sun.dir, amb = sun.ambient, dif = sun.diffuse, bias = o.bias || 0;
      var two = mesh.two || o.two, wire = o.wire, cols = mesh.c, base = o.albedo == null ? 1 : o.albedo;
      var wantN = !!alb && r.lights.length > 0;
      for (i = 0; i < n; i++) { wv[i] = fn ? fn(mesh.v[i]) : mesh.v[i]; vv[i] = view(wv[i]); sv[i] = vv[i][2] < near ? null : proj(vv[i]); }
      /* a mesh drawn in place keeps its face normals between frames */
      var normals = fn ? null : mesh.normals || (mesh.normals = mesh.t.map(function (f) { return norm(cross(sub(mesh.v[f[1]], mesh.v[f[0]]), sub(mesh.v[f[2]], mesh.v[f[0]]))); }));
      for (i = 0; i < mesh.t.length; i++) {
        var t = mesh.t[i], A = sv[t[0]], B = sv[t[1]], C = sv[t[2]], parts = null;
        if (!A || !B || !C) {
          if (wire || !r.clip) continue;
          parts = clipNear(vv[t[0]], vv[t[1]], vv[t[2]]);
          if (!parts.length) continue;
          parts = parts.map(function (p) { return [proj(p[0]), proj(p[1]), proj(p[2])]; });
          A = parts[0][0]; B = parts[0][1]; C = parts[0][2];
        }
        var area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        if (wire) {
          if (area > 0 && !two) continue;
          line(A, B, 0); line(B, C, 0); line(C, A, 0); r.stats.tris++;
          continue;
        }
        if (area >= 0 && !two) continue;
        /* counter-clockwise faces in a left-handed world: nn points into the surface, away from the viewer */
        var nn = normals ? normals[i] : norm(cross(sub(wv[t[1]], wv[t[0]]), sub(wv[t[2]], wv[t[0]])));
        if (area > 0) nn = [-nn[0], -nn[1], -nn[2]];
        var d = nn[0] * LIGHT[0] + nn[1] * LIGHT[1] + nn[2] * LIGHT[2];
        var a = cols ? cols[i] * base : base;
        var L = a === 1 ? amb + dif * Math.max(0, -d) + bias : a * (amb + dif * Math.max(0, -d)) + bias;
        var vn = wantN ? dir([-nn[0], -nn[1], -nn[2]]) : null;
        if (parts) for (var j = 0; j < parts.length; j++) tri(parts[j][0], parts[j][1], parts[j][2], L, a, vn);
        else tri(A, B, C, L, a, vn);
        r.stats.tris++;
      }
    };

    /* an upright sprite that always faces the camera, depth-tested against the scene.
       o: {scale: world units per sprite pixel (1/16), anchor: "bottom" | "center", flip, map: [t0..t3],
           shade: luminance factor (1), lit: true to take point lights,
           crisp: near 1:1 size, draw at exactly 1:1 on whole pixels, so characters stay readable} */
    r.sprite = function (s, x, y, z, o) {
      o = o || {};
      begin();
      var q = view([x, y, z]);
      if (q[2] < near) return;
      var P = proj(q), k = (o.scale || 1 / 16) * F / q[2];
      if (o.crisp && k > 0.7 && k < 1.45) k = 1;
      var sw = s.w * k, sh = s.h * k;
      var left = P[0] - sw / 2, top = o.anchor === "center" ? P[1] - sh / 2 : P[1] - sh;
      if (o.crisp) { left = Math.round(left); top = Math.round(top); }
      var x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W - 1, Math.ceil(left + sw));
      var y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H - 1, Math.ceil(top + sh));
      var zz = q[2], shade = o.shade == null ? 1 : o.shade, map = o.map, lit = o.lit && alb, ff = 0;
      if (fog) ff = Math.min(1, Math.max(0, (zz - fNear) / fSpan));
      for (var yy = y0; yy <= y1; yy++) {
        var v = Math.floor((yy + 0.5 - top) / k);
        if (v < 0 || v >= s.h) continue;
        for (var xx = x0; xx <= x1; xx++) {
          var u = Math.floor((xx + 0.5 - left) / k);
          if (u < 0 || u >= s.w) continue;
          var c = s.px[v * s.w + (o.flip ? s.w - 1 - u : u)];
          if (c === CLEAR) continue;
          var kk = yy * W + xx;
          if (zz >= depth[kk]) continue;
          depth[kk] = zz;
          var tone = (map ? map[c] : c) / 3, l = tone * shade;
          lum[kk] = fog ? l * (1 - ff) + fLum * ff : l;
          if (alb) {
            if (lit) { alb[kk] = tone; nxb[kk] = 0; nyb[kk] = 0; nzb[kk] = -1; vzb[kk] = zz; }
            else alb[kk] = 0;
          }
        }
      }
    };

    /* luminance -> tones: point lights, then the dither. Returns r.image. */
    var acc = new Float32Array(N);
    r.present = function () {
      begin();
      var i, x, y, k, foc = r.focus, lit = false, hw = W / 2, hh = H / 2;
      /* each point light only visits the pixels inside its sphere's screen rectangle */
      if (alb && r.lights.length) {
        acc.fill(0);
        r.lights.forEach(function (L) {
          var q = view([L.x, L.y, L.z]), rad = L.radius, r2 = rad * rad, pw = L.power == null ? 1 : L.power;
          if (q[2] + rad < near) return;
          var zf = Math.max(near, q[2] - rad), half = rad * F / zf, cx = hw + q[0] * F / zf, cyy = hh - q[1] * F / zf;
          if (q[2] - rad > near) { var P = proj(q); cx = P[0]; cyy = P[1]; }
          var x0 = Math.max(0, Math.floor(cx - half)), x1 = Math.min(W - 1, Math.ceil(cx + half));
          var y0 = Math.max(0, Math.floor(cyy - half)), y1 = Math.min(H - 1, Math.ceil(cyy + half));
          for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
            var kk = yy * W + xx;
            if (alb[kk] <= 0 || depth[kk] >= FAR) continue;
            var Z = vzb[kk], dx = q[0] - (xx + 0.5 - hw) * Z / F, dy = q[1] - (hh - yy - 0.5) * Z / F, dz = q[2] - Z;
            var d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2) continue;
            var ndl = (nxb[kk] * dx + nyb[kk] * dy + nzb[kk] * dz) / (Math.sqrt(d2) || 1);
            if (ndl <= 0) continue;
            var att = 1 - d2 / r2;
            acc[kk] += pw * att * att * ndl;
            lit = true;
          }
        });
      }
      for (y = 0, k = 0; y < H; y++) for (x = 0; x < W; x++, k++) {
        var l = lum[k], z = depth[k];
        if (lit && acc[k]) l += alb[k] * acc[k] * (fog ? 1 - Math.min(1, Math.max(0, (z - fNear) / fSpan)) : 1);
        var coarse = foc && z < FAR && (z < foc.near || z > foc.far);
        var lv = coarse ? l * 3 + THR[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] - 0.5 : l * 3 + THR[(y & 3) * 4 + (x & 3)] - 0.5;
        px[k] = lv < 0.5 ? 0 : lv < 1.5 ? 1 : lv < 2.5 ? 2 : 3;
      }
      return r.image;
    };

    /* after present: particles straight into the tone image, hidden behind nearer surfaces */
    r.dot = function (p, tone, size) {
      begin();
      var q = view(p); if (q[2] < near) return;
      var P = proj(q), s = Math.max(1, Math.round((size || 0) * F / q[2])), x0 = Math.round(P[0] - s / 2), y0 = Math.round(P[1] - s / 2);
      for (var yy = y0; yy < y0 + s; yy++) for (var xx = x0; xx < x0 + s; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        var k = yy * W + xx; if (q[2] < depth[k]) px[k] = tone;
      }
    };
    r.streak = function (a, b, tone) {
      begin();
      var qa = view(a), qb = view(b); if (qa[2] < near || qb[2] < near) return;
      var A = proj(qa), B = proj(qb), n = Math.max(1, Math.ceil(Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1]))));
      for (var i = 0; i <= n; i++) {
        var t = i / n, xx = Math.round(A[0] + (B[0] - A[0]) * t), yy = Math.round(A[1] + (B[1] - A[1]) * t);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        var k = yy * W + xx; if (A[2] + (B[2] - A[2]) * t < depth[k]) px[k] = tone;
      }
    };

    /* for apps without lo-game: write the tone image into a canvas ImageData of the same size */
    var RGB = TONES.map(function (h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; });
    r.paint = function (imageData) {
      var d = imageData.data;
      for (var i = 0, o = 0; i < N; i++, o += 4) { var c = RGB[px[i]]; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
      return imageData;
    };

    r.clear(1);
    return r;
  }

  return {
    VERSION: VERSION, TONES: TONES.slice(), create: create,
    add: add, sub: sub, scale: scale, dot: dot, cross: cross, norm: norm, rotX: rotX, rotY: rotY, rotZ: rotZ,
    box: box, ico: ico, transform: transform, move: move, paint: paint, merge: merge
  };
})();
