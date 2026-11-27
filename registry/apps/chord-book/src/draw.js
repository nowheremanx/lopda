/* 和弦大全 / Chords: the pictures, drawn as tone buffers (0 ink, 1 dark, 2 mid, 3 paper) and put on a canvas with
   putImageData at one canvas pixel per buffer pixel; CSS scales the canvas by a whole number (sdk/UI.md 11).
   MIT License. Copyright (c) 2026 Haowei Wu. */
var Draw = (function () {
  "use strict";
  var INK = 0, DARK = 1, MID = 2, PAPER = 3;
  var RGB = [[0x1f, 0x2a, 0x14], [0x4a, 0x5a, 0x32], [0x7d, 0x8a, 0x58], [0xa3, 0xad, 0x7e]];

  /* 5 x 7 digits, and T for the thumb */
  var GLYPH = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"]
  };

  /* 3 x 5 letters for the degree map, so "b13" fits between two strings */
  var SMALL = {
    "1": ["010", "110", "010", "010", "111"], "2": ["110", "001", "010", "100", "111"], "3": ["110", "001", "010", "001", "110"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "110", "001", "110"], "6": ["011", "100", "110", "101", "010"],
    "7": ["111", "001", "010", "010", "010"], "9": ["010", "101", "011", "001", "110"],
    "R": ["110", "101", "110", "101", "101"], "b": ["100", "100", "110", "101", "110"], "#": ["101", "111", "101", "111", "101"]
  };

  function Buf(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h); this.px.fill(PAPER); }
  Buf.prototype.set = function (x, y, t) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = t; };
  Buf.prototype.rect = function (x, y, w, h, t) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, t); };
  Buf.prototype.disc = function (cx, cy, r, t) {
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) this.set(cx + x, cy + y, t);
  };
  Buf.prototype.ring = function (cx, cy, r, t) {
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
      var d = x * x + y * y;
      if (d <= r * r + r && d > (r - 1) * (r - 1) + (r - 1)) this.set(cx + x, cy + y, t);
    }
  };
  Buf.prototype.text = function (s, x, y, t) {
    for (var k = 0; k < s.length; k++) {
      var g = GLYPH[s[k]];
      if (g) for (var j = 0; j < 7; j++) for (var i = 0; i < 5; i++) if (g[j][i] === "1") this.set(x + k * 6 + i, y + j, t);
    }
  };
  Buf.prototype.small = function (s, x, y, t) {
    for (var k = 0; k < s.length; k++) {
      var g = SMALL[s[k]];
      if (g) for (var j = 0; j < 5; j++) for (var i = 0; i < 3; i++) if (g[j][i] === "1") this.set(x + k * 4 + i, y + j, t);
    }
  };
  Buf.prototype.cross = function (cx, cy, t) { for (var i = -3; i <= 3; i++) { this.set(cx + i, cy + i, t); this.set(cx + i, cy - i, t); } };

  /* the first fret the box shows: the nut for anything that fits in the first five frets */
  function baseFret(frets) {
    var lo = Infinity, hi = 0;
    for (var i = 0; i < 6; i++) if (frets[i] > 0) { lo = Math.min(lo, frets[i]); hi = Math.max(hi, frets[i]); }
    return hi <= 5 ? 1 : lo;
  }

  /* The chord box: strings upright, low E at the left, five frets. x and o above the nut; a dot with the finger's
     number for each fretted note, a square for the root; a bar for a barre. 104 x 104. */
  var BOX_W = 104, BOX_H = 104, SX = 20, SS = 14, TOP = 16, FS = 17;
  function box(v, rootPc) {
    var b = new Buf(BOX_W, BOX_H), frets = v.frets, base = baseFret(frets), i, s;
    for (s = 0; s < 6; s++) b.rect(SX + s * SS, TOP, 1, 5 * FS + 1, INK);
    for (i = 0; i <= 5; i++) b.rect(SX, TOP + i * FS, 5 * SS + 1, 1, INK);
    if (base === 1) b.rect(SX, TOP - 3, 5 * SS + 1, 4, INK);
    else b.text(String(base), base < 10 ? SX - 11 : SX - 17, TOP + 5, INK);
    for (s = 0; s < 6; s++) {
      var x = SX + s * SS;
      if (frets[s] < 0) b.cross(x, 6, INK);
      else if (frets[s] === 0) b.ring(x, 6, 3, INK);
    }
    /* the barre first, so the dots sit on it */
    if (v.barre) {
      var by = TOP + (v.barre.fret - base) * FS + FS / 2 | 0;
      b.rect(SX + v.barre.from * SS - 3, by - 4, (v.barre.to - v.barre.from) * SS + 7, 9, INK);
    }
    for (s = 0; s < 6; s++) {
      if (frets[s] <= 0) continue;
      var cx = SX + s * SS, cy = TOP + (frets[s] - base) * FS + FS / 2 | 0;
      var root = (Chords.OPEN[s] + frets[s]) % 12 === rootPc;
      if (root) b.rect(cx - 5, cy - 5, 11, 11, INK); else b.disc(cx, cy, 5, INK);
      var f = v.fingers ? v.fingers[s] : 0;
      var inBarre = v.barre && frets[s] === v.barre.fret && s > v.barre.from && s <= v.barre.to;
      if (f && !inBarre) b.text(f === 5 ? "T" : String(f), cx - 2, cy - 3, PAPER);
    }
    return b;
  }

  /* The degree map (1.2.0): the box's five frets (and the open strings when the box starts at the nut) with every place
     named by its degree above the root, so a note to add can be found by the hand: the notes the voicing plays in ink
     tiles, the chord's other tones in dark, every other note in mid. The grid is mid so the names read over it. */
  function rowsOf(frets) {
    var base = baseFret(frets), out = [];
    if (base === 1) out.push(0);
    for (var f = base; f < base + 5; f++) out.push(f);
    return out;
  }
  function mapY(f, base) { return f === 0 ? 6 : TOP + (f - base) * FS + FS / 2 | 0; }
  function map(v, c) {
    var b = new Buf(BOX_W, BOX_H), frets = v.frets, base = baseFret(frets), rows = rowsOf(frets), s, i;
    for (s = 0; s < 6; s++) b.rect(SX + s * SS, TOP, 1, 5 * FS + 1, MID);
    for (i = 0; i <= 5; i++) b.rect(SX, TOP + i * FS, 5 * SS + 1, 1, MID);
    if (base === 1) b.rect(SX, TOP - 3, 5 * SS + 1, 4, INK);
    else b.text(String(base), base < 10 ? SX - 11 : SX - 17, TOP + 5, INK);
    for (s = 0; s < 6; s++) {
      var x = SX + s * SS;
      if (frets[s] < 0 && base > 1) b.cross(x, 6, INK);
      for (i = 0; i < rows.length; i++) {
        var f = rows[i], y = mapY(f, base), d = Chords.degree(c, (Chords.OPEN[s] + f) % 12), w = d.lab.length * 4 - 1;
        var on = frets[s] === f;
        b.rect(x - 6, y - 4, 13, 9, on ? INK : PAPER);
        b.small(d.lab, x - (w >> 1), y - 2, on ? PAPER : d.tone ? DARK : MID);
      }
    }
    return b;
  }
  /* which string and fret a point of the box or the map (in buffer pixels) is on, or null: the same five frets, and the
     open strings above the nut when the box starts there */
  function boxAt(v, bx, by) {
    var frets = v.frets, base = baseFret(frets), rows = rowsOf(frets), s = Math.round((bx - SX) / SS);
    if (s < 0 || s > 5 || Math.abs(bx - (SX + s * SS)) > 7) return null;
    for (var i = 0; i < rows.length; i++) {
      var y = mapY(rows[i], base);
      if (by >= y - (rows[i] === 0 ? 6 : FS / 2) && by < y + (rows[i] === 0 ? 5 : FS / 2)) return { s: s, f: rows[i] };
    }
    return null;
  }

  /* The neck: low E at the bottom as you look down at a guitar on your lap, the nut at the left, 15 frets. Every
     place the chord's notes lie is a small mid dot (a dark one for the root); the voicing shown is in big ink dots. */
  var NECK_W = 150, NECK_H = 72, NX = 12, NF = 9, NS = 10, NY = 6;
  function neck(v, tones, rootPc) {
    var b = new Buf(NECK_W, NECK_H), s, f, i;
    var want = {};
    for (i = 0; i < tones.length; i++) want[tones[i].pc] = true;
    var bottom = NY + 5 * NS;
    /* inlays between the middle strings */
    [3, 5, 7, 9, 15].forEach(function (k) { b.disc(NX + (k - 1) * NF + 4, NY + 2 * NS + 5, 1, MID); });
    b.disc(NX + 11 * NF + 4, NY + NS + 5, 1, MID); b.disc(NX + 11 * NF + 4, NY + 3 * NS + 5, 1, MID);
    for (s = 0; s < 6; s++) b.rect(NX, NY + s * NS, 15 * NF + 1, 1, DARK);
    b.rect(NX - 2, NY, 2, 5 * NS + 1, INK);
    for (f = 1; f <= 15; f++) b.rect(NX + f * NF, NY, 1, 5 * NS + 1, DARK);
    [3, 5, 7, 9, 12, 15].forEach(function (k) {
      var t = String(k), cx = NX + (k - 1) * NF + 5;
      b.text(t, cx - t.length * 3 + 1, bottom + 6, DARK);
    });
    for (s = 0; s < 6; s++) {
      var y = bottom - s * NS;
      for (f = 0; f <= 15; f++) {
        var pc = (Chords.OPEN[s] + f) % 12;
        if (!want[pc]) continue;
        var x = f === 0 ? NX - 7 : NX + (f - 1) * NF + 5;
        if (v && v.frets[s] === f) continue;
        b.disc(x, y, 1, pc === rootPc ? DARK : MID);
      }
      if (!v) continue;
      var vf = v.frets[s];
      if (vf < 0) { for (i = -2; i <= 2; i++) { b.set(NX - 7 + i, y + i, INK); b.set(NX - 7 + i, y - i, INK); } }
      else if (vf === 0) b.ring(NX - 7, y, 3, INK);
      else {
        var vx = NX + (vf - 1) * NF + 5;
        if ((Chords.OPEN[s] + vf) % 12 === rootPc) b.rect(vx - 3, y - 3, 7, 7, INK); else b.disc(vx, y, 3, INK);
      }
    }
    return b;
  }

  /* which string and fret a point of the neck is on, or null: the open strings left of the nut, then frets 1 to 15 */
  function neckAt(bx, by) {
    var s = Math.round((NY + 5 * NS - by) / NS);
    if (s < 0 || s > 5 || Math.abs(NY + 5 * NS - s * NS - by) > NS / 2) return null;
    if (bx < NX - 12 || bx >= NX + 15 * NF) return null;
    return { s: s, f: bx < NX ? 0 : Math.floor((bx - NX) / NF) + 1 };
  }

  /* the buffer onto the canvas, and the canvas to the biggest whole scale that fits maxW x maxH css pixels */
  function paint(canvas, b, maxW, maxH) {
    if (canvas.width !== b.w) canvas.width = b.w;
    if (canvas.height !== b.h) canvas.height = b.h;
    var ctx = canvas.getContext("2d"), img = ctx.createImageData(b.w, b.h), d = img.data;
    for (var i = 0; i < b.px.length; i++) {
      var c = RGB[b.px[i]];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var k = Math.max(1, Math.floor(Math.min(maxW / b.w, maxH / b.h)));
    canvas.style.width = b.w * k + "px";
    canvas.style.height = b.h * k + "px";
    return k;
  }

  return { Buf: Buf, box: box, map: map, boxAt: boxAt, neckAt: neckAt, neck: neck, paint: paint, baseFret: baseFret, BOX_W: BOX_W, BOX_H: BOX_H, NECK_W: NECK_W, NECK_H: NECK_H };
})();
