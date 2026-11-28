/* 和弦大全 / Chords: the chord maths, free of the DOM and of PAD so tests/chord-book.test.mjs runs it in Node.
   Standard tuning only. Every voicing is either from the hand-written table of common shapes below or computed by
   generate(); nothing comes from an outside chord database (docs/design/chord-book.md section 2).
   MIT License. Copyright (c) 2026 Haowei Wu. */
var Chords = (function () {
  "use strict";

  var OPEN = [40, 45, 50, 55, 59, 64];          /* E2 A2 D3 G3 B3 E4, low string first */
  var MAX_FRET = 15, SPAN = 3, LIMIT = 24;
  /* the note names shown, the same set the four-track uses */
  var NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /* The 19 qualities of version 1, in the order the picker lists them (section 2.1). iv: semitones above the root;
     lab: how each interval is written; opt: intervals a voicing may leave out (the fifth). group: the picker's
     heading; common: how readily identify() picks it when two names fit the same notes. */
  var QUALS = [
    { id: "",      zh: "大三",   en: "major",       iv: [0, 4, 7],         lab: ["R", "3", "5"],                 opt: [],  group: 0, common: 1 },
    { id: "m",     zh: "小三",   en: "minor",       iv: [0, 3, 7],         lab: ["R", "b3", "5"],                opt: [],  group: 0, common: 1 },
    { id: "dim",   zh: "减三",   en: "diminished",  iv: [0, 3, 6],         lab: ["R", "b3", "b5"],               opt: [],  group: 0, common: 0.4 },
    { id: "aug",   zh: "增三",   en: "augmented",   iv: [0, 4, 8],         lab: ["R", "3", "#5"],                opt: [],  group: 0, common: 0.4 },
    { id: "5",     zh: "强力",   en: "power",       iv: [0, 7],            lab: ["R", "5"],                      opt: [],  group: 0, common: 0.5 },
    { id: "7",     zh: "属七",   en: "dominant 7",  iv: [0, 4, 7, 10],     lab: ["R", "3", "5", "b7"],           opt: [7], group: 1, common: 0.8 },
    { id: "maj7",  zh: "大七",   en: "major 7",     iv: [0, 4, 7, 11],     lab: ["R", "3", "5", "7"],            opt: [7], group: 1, common: 0.7 },
    { id: "m7",    zh: "小七",   en: "minor 7",     iv: [0, 3, 7, 10],     lab: ["R", "b3", "5", "b7"],          opt: [7], group: 1, common: 0.8 },
    { id: "m7b5",  zh: "半减七", en: "half-dim",    iv: [0, 3, 6, 10],     lab: ["R", "b3", "b5", "b7"],         opt: [],  group: 1, common: 0.5 },
    { id: "dim7",  zh: "减七",   en: "dim 7",       iv: [0, 3, 6, 9],      lab: ["R", "b3", "b5", "bb7"],        opt: [],  group: 1, common: 0.5 },
    { id: "mmaj7", zh: "小大七", en: "minor maj7",  iv: [0, 3, 7, 11],     lab: ["R", "b3", "5", "7"],           opt: [7], group: 1, common: 0.3, show: "m(maj7)" },
    { id: "sus2",  zh: "挂二",   en: "sus2",        iv: [0, 2, 7],         lab: ["R", "2", "5"],                 opt: [],  group: 2, common: 0.6 },
    { id: "sus4",  zh: "挂四",   en: "sus4",        iv: [0, 5, 7],         lab: ["R", "4", "5"],                 opt: [],  group: 2, common: 0.6 },
    { id: "7sus4", zh: "属七挂四", en: "7sus4",     iv: [0, 5, 7, 10],     lab: ["R", "4", "5", "b7"],           opt: [7], group: 2, common: 0.5 },
    { id: "add9",  zh: "加九",   en: "add9",        iv: [0, 2, 4, 7],      lab: ["R", "9", "3", "5"],            opt: [7], group: 3, common: 0.5 },
    { id: "6",     zh: "大六",   en: "major 6",     iv: [0, 4, 7, 9],      lab: ["R", "3", "5", "6"],            opt: [7], group: 3, common: 0.4 },
    { id: "m6",    zh: "小六",   en: "minor 6",     iv: [0, 3, 7, 9],      lab: ["R", "b3", "5", "6"],           opt: [7], group: 3, common: 0.4 },
    { id: "9",     zh: "属九",   en: "dominant 9",  iv: [0, 2, 4, 7, 10],  lab: ["R", "9", "3", "5", "b7"],      opt: [7], group: 4, common: 0.4 },
    { id: "m9",    zh: "小九",   en: "minor 9",     iv: [0, 2, 3, 7, 10],  lab: ["R", "9", "b3", "5", "b7"],     opt: [7], group: 4, common: 0.4 }
  ];
  var GROUPS = [{ zh: "三和弦", en: "Triads" }, { zh: "七和弦", en: "Sevenths" }, { zh: "挂留", en: "Suspended" },
    { zh: "加音、六", en: "Added, sixths" }, { zh: "九和弦", en: "Ninths" }];
  var QI = {};
  QUALS.forEach(function (q, i) { QI[q.id] = i; });

  /* Names people write for each quality (section 2.2). Looked up as written first, then lower-cased for the
     longer ones, so "Cmaj7" and "CMAJ7" both work but "CM" (major) and "Cm" (minor) stay apart. */
  var ALIAS = {
    "": "", "maj": "", "M": "", "major": "",
    "m": "m", "min": "m", "-": "m", "minor": "m",
    "dim": "dim", "°": "dim", "o": "dim",
    "aug": "aug", "+": "aug", "+5": "aug", "#5": "aug",
    "5": "5",
    "7": "7", "dom7": "7",
    "maj7": "maj7", "M7": "maj7", "Δ": "maj7", "Δ7": "maj7", "ma7": "maj7", "j7": "maj7",
    "m7": "m7", "min7": "m7", "-7": "m7",
    "m7b5": "m7b5", "ø": "m7b5", "ø7": "m7b5", "m7-5": "m7b5", "-7b5": "m7b5", "min7b5": "m7b5",
    "dim7": "dim7", "°7": "dim7", "o7": "dim7",
    "mmaj7": "mmaj7", "mM7": "mmaj7", "m(maj7)": "mmaj7", "mΔ": "mmaj7", "mΔ7": "mmaj7", "-Δ7": "mmaj7", "minmaj7": "mmaj7",
    "sus2": "sus2", "sus4": "sus4", "sus": "sus4", "7sus4": "7sus4", "7sus": "7sus4",
    "add9": "add9", "add2": "add9", "(add9)": "add9",
    "6": "6", "maj6": "6", "M6": "6", "m6": "m6", "min6": "m6", "-6": "m6",
    "9": "9", "m9": "m9", "min9": "m9", "-9": "m9"
  };
  var ALIAS_LOWER = {};
  Object.keys(ALIAS).forEach(function (k) { if (k.length >= 3) ALIAS_LOWER[k.toLowerCase()] = ALIAS[k]; });

  function mod12(n) { return ((n % 12) + 12) % 12; }
  function pcOf(s) {
    var m = /^([A-Ga-g])([#b]*)$/.exec(s);
    if (!m) return null;
    var pc = LETTER[m[1].toUpperCase()];
    for (var i = 0; i < m[2].length; i++) pc += m[2][i] === "#" ? 1 : -1;
    return mod12(pc);
  }
  /* "C#m7b5", "d/f#", "Bb maj7", "E♭m" -> {root, q, bass} with bass null for a plain chord; null if it is not a chord */
  function parse(text) {
    if (typeof text !== "string") return null;
    var s = text.replace(/\s+/g, "").replace(/♯/g, "#").replace(/♭/g, "b");
    var m = /^([A-Ga-g])(#|bb|b)?(.*?)(?:\/([A-Ga-g](?:#|b)?))?$/.exec(s);
    if (!m) return null;
    var root = pcOf(m[1] + (m[2] || ""));
    var q = Object.prototype.hasOwnProperty.call(ALIAS, m[3]) ? ALIAS[m[3]]
      : Object.prototype.hasOwnProperty.call(ALIAS_LOWER, m[3].toLowerCase()) && m[3].length >= 3 ? ALIAS_LOWER[m[3].toLowerCase()] : null;
    if (root === null || q === null) return null;
    var bass = m[4] ? pcOf(m[4]) : null;
    if (m[4] && bass === null) return null;
    if (bass === root) bass = null;
    return { root: root, q: q, bass: bass };
  }
  /* the name a player writes: the quality's own spelling where it has one (Am(maj7), not Ammaj7) */
  function name(c) { var Q = qual(c.q); return NAMES[c.root] + (Q && Q.show ? Q.show : c.q) + (c.bass === null || c.bass === undefined ? "" : "/" + NAMES[c.bass]); }
  function qual(id) { return Object.prototype.hasOwnProperty.call(QI, id) ? QUALS[QI[id]] : null; }

  /* the chord's notes and how each is written, bass first when it is not a chord tone */
  function tones(c) {
    var Q = qual(c.q), out = [];
    if (c.bass !== null && c.bass !== undefined && Q.iv.map(function (i) { return mod12(c.root + i); }).indexOf(c.bass) < 0)
      out.push({ pc: c.bass, lab: "/", iv: null });
    /* listed as they stack up from the root: a 9 is a ninth (14 semitones), not a second, so it comes last */
    var up = [];
    for (var i = 0; i < Q.iv.length; i++) up.push({ pc: mod12(c.root + Q.iv[i]), lab: Q.lab[i], iv: Q.lab[i] === "9" ? Q.iv[i] + 12 : Q.iv[i] });
    up.sort(function (a, b) { return a.iv - b.iv; });
    return out.concat(up);
  }

  /* the degree of any pitch class above the chord's root: the chord's own tones as the chord writes them (4 in a sus4,
     6 in a 6 chord), every other note as an upper extension, the way a player looks for one to add (11, not 4) */
  var EXT = ["R", "b9", "9", "b3", "3", "11", "#11", "5", "b13", "13", "b7", "7"];
  function degree(c, pc) {
    var Q = qual(c.q);
    for (var i = 0; i < Q.iv.length; i++) if (mod12(c.root + Q.iv[i]) === pc) return { lab: Q.lab[i], tone: true };
    return { lab: EXT[mod12(pc - c.root)], tone: false };
  }

  /* what each string of a voicing sounds, low E first: null for a muted string, else its pitch and the degree it is in the
     chord (R, 3, 5, b7, 9...), "/" for a slash chord's extra bass. An open C is x, R, 3, 5, R, 3: five notes, not three. */
  function strings(frets, c) {
    var ts = tones(c), out = [];
    for (var s = 0; s < 6; s++) {
      if (frets[s] < 0) { out.push(null); continue; }
      var m = OPEN[s] + frets[s], pc = mod12(m), lab = "";
      for (var i = 0; i < ts.length; i++) if (ts[i].pc === pc) { lab = ts[i].lab; break; }
      out.push({ s: s, midi: m, pc: pc, lab: lab });
    }
    return out;
  }

  /* ---------------- the hand-written shapes (section 2.3) ---------------- */
  function fr(s) {
    var out = [], i = 0;
    while (i < s.length) {
      if (s[i] === "(") { var j = s.indexOf(")", i); out.push(parseInt(s.slice(i + 1, j), 10)); i = j + 1; }
      else { out.push(s[i] === "x" ? -1 : parseInt(s[i], 10)); i++; }
    }
    return out;
  }
  /* open chords: [chord, frets, fingers] in the order they are best known; T in fingers is the thumb */
  var OPENS = [
    ["C", "x32010", "032010"], ["A", "x02220", "001230"], ["G", "320003", "210003"], ["G", "320033", "210034"],
    ["E", "022100", "023100"], ["D", "xx0232", "000132"],
    ["Am", "x02210", "002310"], ["Em", "022000", "023000"], ["Dm", "xx0231", "000231"],
    ["C7", "x32310", "032410"], ["A7", "x02020", "002030"], ["G7", "320001", "320001"], ["E7", "020100", "020100"],
    ["D7", "xx0212", "000213"], ["B7", "x21202", "021304"],
    ["Am7", "x02010", "002010"], ["Em7", "022030", "023040"], ["Em7", "020000", "020000"], ["Dm7", "xx0211", "000211"],
    ["Cmaj7", "x32000", "032000"], ["Amaj7", "x02120", "002130"], ["Gmaj7", "320002", "320001"], ["Emaj7", "021100", "031200"],
    ["Dmaj7", "xx0222", "000111"], ["Fmaj7", "xx3210", "003210"],
    ["Asus2", "x02200", "001200"], ["Dsus2", "xx0230", "000130"], ["Esus4", "022200", "023400"], ["Asus4", "x02230", "001230"],
    ["Dsus4", "xx0233", "000134"], ["A7sus4", "x02030", "002030"], ["E7sus4", "020200", "020300"],
    ["Cadd9", "x32030", "021030"], ["D6", "xx0202", "000203"], ["A6", "x02222", "001111"], ["Am6", "x02212", "002314"],
    ["Em6", "022020", "023040"], ["C9", "x32333", "021333"], ["E9", "020102", "020103"],
    ["E5", "022xxx", "012000"], ["A5", "x022xx", "001200"], ["D5", "xx023x", "000120"],
    ["Edim7", "012020", "012030"], ["Ammaj7", "x02110", "003120"],
    /* slash chords */
    ["D/F#", "2x0232", "T00132"], ["G/B", "x20003", "010003"], ["C/G", "332010", "432010"], ["C/E", "032010", "032010"],
    ["Am/G", "3x2210", "402310"], ["F/C", "x33211", "034211"], ["D/A", "x00232", "000132"], ["Am/E", "002210", "002310"]
  ];
  /* movable shapes: [quality, string the root is on (0 = low E), offsets from the root's fret (null = muted),
     fingers, tier]. E and A shapes are the barre chords everyone learns (tier 80); D and C shapes less so (60). */
  var MOVABLE = [
    ["", 0, [0, 2, 2, 1, 0, 0], "134211", 80], ["m", 0, [0, 2, 2, 0, 0, 0], "134111", 80],
    ["7", 0, [0, 2, 0, 1, 0, 0], "131211", 80], ["m7", 0, [0, 2, 0, 0, 0, 0], "131111", 80],
    ["maj7", 0, [0, null, 1, 1, 0, null], "103420", 80], ["7sus4", 0, [0, 2, 0, 2, 0, 0], "131411", 80],
    ["m7b5", 0, [0, null, 0, 0, -1, null], "203410", 80], ["5", 0, [0, 2, 2, null, null, null], "134000", 80],
    ["dim7", 0, [0, null, -1, 0, -1, null], "201310", 80],
    ["", 1, [null, 0, 2, 2, 2, 0], "013331", 80], ["m", 1, [null, 0, 2, 2, 1, 0], "013421", 80],
    ["7", 1, [null, 0, 2, 0, 2, 0], "013141", 80], ["m7", 1, [null, 0, 2, 0, 1, 0], "013121", 80],
    ["maj7", 1, [null, 0, 2, 1, 2, 0], "013241", 80], ["sus2", 1, [null, 0, 2, 2, 0, 0], "013411", 80],
    ["sus4", 1, [null, 0, 2, 2, 3, 0], "012341", 80], ["6", 1, [null, 0, 2, 2, 2, 2], "013333", 80],
    ["9", 1, [null, 0, -1, 0, 0, 0], "021333", 80], ["m9", 1, [null, 0, -2, 0, 0, 0], "021333", 80],
    ["dim7", 1, [null, 0, 1, -1, 1, null], "023140", 80], ["m7b5", 1, [null, 0, 1, 0, 1, null], "013240", 80],
    ["dim", 1, [null, 0, 1, 2, 1, null], "012430", 80], ["aug", 1, [null, 0, -1, -2, -2, null], "032110", 80],
    ["mmaj7", 1, [null, 0, 2, 1, 1, 0], "014231", 80], ["m6", 1, [null, 0, null, -1, 1, 0], "020143", 80],
    ["add9", 1, [null, 0, -1, -3, 0, null], "032140", 80], ["5", 1, [null, 0, 2, 2, null, null], "013400", 80],
    ["", 2, [null, null, 0, 2, 3, 2], "001243", 60], ["m", 2, [null, null, 0, 2, 3, 1], "001342", 60],
    ["", 1, [null, 3, 2, 0, 1, 0], "043121", 60]
  ];
  /* the C shape's root sits on the A string three frets above its lowest fret: its offsets are counted from that
     lowest fret, and ROOT_AT says where the root is */
  var ROOT_AT = { 29: 3 };

  function fingersOf(s) { return s.split("").map(function (c) { return c === "T" ? 5 : parseInt(c, 10); }); }

  var SHAPES = null;   /* chord key -> list of {frets, fingers, tier, order}, built once */
  function key(c) { return c.root + ":" + c.q + ":" + (c.bass === null || c.bass === undefined ? "" : c.bass); }
  function addShape(c, frets, fingers, tier, order) {
    var k = key(c);
    (SHAPES[k] = SHAPES[k] || []).push({ frets: frets, fingers: fingers, tier: tier, order: order });
  }
  function shapes() {
    if (SHAPES) return SHAPES;
    SHAPES = {};
    OPENS.forEach(function (o, i) { addShape(parse(o[0]), fr(o[1]), fingersOf(o[2]), 100, i); });
    MOVABLE.forEach(function (m, mi) {
      var Q = qual(m[0]), s = m[1], off = m[2], rootAt = ROOT_AT[mi] || 0;
      var low = Math.min.apply(null, off.filter(function (o) { return o !== null; }));
      for (var root = 0; root < 12; root++) {
        var r = mod12(root - OPEN[s] - rootAt);
        if (r + low < 0) r += 12;
        for (; r + Math.max.apply(null, off.filter(function (o) { return o !== null; })) <= MAX_FRET; r += 12) {
          var frets = off.map(function (o) { return o === null ? -1 : r + o; });
          /* a shape that lands on the nut with every fret open is an open chord already in OPENS, or not a shape */
          if (frets.every(function (f) { return f <= 0; })) continue;
          addShape({ root: root, q: Q.id, bass: null }, frets, fingersOf(m[3]).map(function (f, i) { return frets[i] === 0 ? 0 : f; }), m[4], 1000 + mi);
        }
      }
    });
    return SHAPES;
  }

  /* ---------------- the generator (section 2.4) ---------------- */
  function midiOf(frets) { var out = []; for (var i = 0; i < 6; i++) if (frets[i] >= 0) out.push(OPEN[i] + frets[i]); return out; }
  /* which fingers a hand needs: a barre on the lowest fret when two or more strings share it and nothing between
     them is lower (an open or muted string cannot sit under a barre); one finger for every other fretted note */
  function fingerCount(frets) {
    var lo = Infinity, i, n = 0;
    for (i = 0; i < 6; i++) if (frets[i] > 0) { n++; if (frets[i] < lo) lo = frets[i]; }
    if (!n) return { n: 0, barre: null };
    var a = -1, z = -1;
    for (i = 0; i < 6; i++) if (frets[i] === lo) { if (a < 0) a = i; z = i; }
    var count = 0;
    for (i = a; i <= z; i++) if (frets[i] === lo) count++;
    if (count >= 2) {
      var ok = true;
      for (i = a; i <= z; i++) if (frets[i] < lo) ok = false;
      if (ok) return { n: n - count + 1, barre: { fret: lo, from: a, to: z } };
    }
    return { n: n, barre: null };
  }
  /* The barre a shape's own fingers show (1.4.1): the lowest fret where one finger 1-4 holds two or more sounding
     strings, spanning the first and the last of them. A string under that span that is open, muted or lower than the
     barre means the finger cannot be lying across it, so there is no barre at that fret. Finger 1 is the usual index
     barre; C9 x32333 is barred by the ring finger across G-B-E (1.4.4). Hand-written shapes know their fingering;
     fingerCount guesses from the frets alone, which would turn D xx0232 (three separate fingers) into a barre. */
  function barreFromFingers(frets, fingers) {
    var best = null, k, i, j, a, z, ok;
    for (k = 1; k <= 4; k++) {
      var held = [];
      for (i = 0; i < 6; i++) if (frets[i] > 0 && fingers[i] === k) held.push(i);
      if (held.length < 2) continue;
      for (i = 0; i < held.length; i++) {
        var f = frets[held[i]], n = 0;
        for (j = 0; j < held.length; j++) if (frets[held[j]] === f) n++;
        if (n < 2 || (best && f >= best.fret)) continue;
        a = -1; z = -1;
        for (j = 0; j < 6; j++) if (frets[j] === f && fingers[j] === k) { if (a < 0) a = j; z = j; }
        ok = true;
        for (j = a; j <= z; j++) if (frets[j] < f) ok = false;
        if (ok) best = { fret: f, from: a, to: z, finger: k };
      }
    }
    return best;
  }
  /* fingers for a computed voicing: index on the barre, then the other notes by fret and string */
  function assignFingers(frets) {
    var fc = fingerCount(frets), out = [0, 0, 0, 0, 0, 0], notes = [], i, f = 1;
    for (i = 0; i < 6; i++) if (frets[i] > 0) {
      if (fc.barre && frets[i] === fc.barre.fret && i >= fc.barre.from && i <= fc.barre.to) out[i] = 1;
      else notes.push(i);
    }
    if (fc.barre) f = 2;
    notes.sort(function (x, y) { return frets[x] - frets[y] || x - y; });
    for (i = 0; i < notes.length; i++) out[notes[i]] = Math.min(4, f + i);
    return out;
  }
  function position(frets) {
    var lo = Infinity, hi = 0, open = false;
    for (var i = 0; i < 6; i++) { if (frets[i] > 0) { lo = Math.min(lo, frets[i]); hi = Math.max(hi, frets[i]); } if (frets[i] === 0) open = true; }
    if (lo === Infinity) return 0;
    return open && hi <= 4 ? 0 : lo;
  }
  /* how easy and familiar a voicing is: higher is more common (weights of section 2.4) */
  function score(frets) {
    var sounding = 0, lo = Infinity, hi = 0, open = 0, i, first = -1, gaps = 0;
    for (i = 0; i < 6; i++) {
      if (frets[i] >= 0) { sounding++; if (first < 0) first = i; }
      if (frets[i] > 0) { lo = Math.min(lo, frets[i]); hi = Math.max(hi, frets[i]); }
      if (frets[i] === 0) open++;
    }
    for (i = first; i < 6; i++) if (frets[i] < 0) gaps++;
    var fc = fingerCount(frets), span = lo === Infinity ? 0 : hi - lo, low = lo === Infinity ? 0 : lo;
    var s = sounding - 0.7 * fc.n - 0.8 * span - 0.25 * low - 2 * gaps;
    if (open && low <= 3) s += 2.5;
    if (fc.barre) s -= 1;
    return s;
  }
  /* every voicing of a chord within a 4-fret hand position: the lowest note is the bass (the root, or a slash chord's
     bass), every note is a chord tone, every required tone is there, at least 4 strings (2 for a power chord), muted
     strings only at the low side plus one in the middle, at most 4 fingers. */
  function generate(c) {
    var Q = qual(c.q), bass = c.bass === null || c.bass === undefined ? c.root : c.bass;
    var allowed = [], need = [], i;
    for (i = 0; i < 12; i++) allowed.push(false);
    Q.iv.forEach(function (v) { allowed[mod12(c.root + v)] = true; if (Q.opt.indexOf(v) < 0) need.push(mod12(c.root + v)); });
    allowed[bass] = true;
    if (need.indexOf(bass) < 0) need.push(bass);
    var minStrings = Q.id === "5" ? 2 : Math.min(4, Q.iv.length + 1);
    var seen = {}, out = [], frets = [0, 0, 0, 0, 0, 0];
    function finish() {
      var notes = midiOf(frets);
      if (notes.length < minStrings) return;
      var lowest = Math.min.apply(null, notes);
      if (mod12(lowest) !== bass) return;
      var have = {};
      notes.forEach(function (n) { have[mod12(n)] = true; });
      for (var k = 0; k < need.length; k++) if (!have[need[k]]) return;
      if (fingerCount(frets).n > 4) return;
      var id = frets.join(",");
      if (seen[id]) return;
      seen[id] = true;
      out.push(frets.slice());
    }
    function walk(s, lo, hi, started, gaps) {
      if (s === 6) { finish(); return; }
      /* muted */
      if (!started || gaps === 0) { frets[s] = -1; walk(s + 1, lo, hi, started, started ? gaps + 1 : 0); }
      /* open */
      if (allowed[mod12(OPEN[s])]) { frets[s] = 0; walk(s + 1, lo, hi, true, gaps); }
      for (var f = lo; f <= hi; f++) if (allowed[mod12(OPEN[s] + f)]) { frets[s] = f; walk(s + 1, lo, hi, true, gaps); }
    }
    for (var start = 1; start + SPAN <= MAX_FRET; start++) walk(0, start, start + SPAN, false, 0);
    return out;
  }

  var CACHE = {};
  /* the voicings of a chord, most common first (section 2.5): the hand-written shapes by tier, then the computed ones
     by score, at most LIMIT. Each is {frets, fingers, tier, pos, rank, barre}. */
  function voicings(c) {
    var k = key(c);
    if (CACHE[k]) return CACHE[k];
    var list = [], seen = {};
    (shapes()[k] || []).forEach(function (s) {
      var id = s.frets.join(",");
      if (seen[id]) return;
      seen[id] = true;
      /* among the barre shapes the one lower on the neck wins: Bm is x24432 before 799777 */
      list.push({ frets: s.frets, fingers: s.fingers, tier: s.tier,
        rank: s.tier - s.order * 0.001 + (s.tier === 100 ? 0 : score(s.frets) - 0.3 * position(s.frets)) });
    });
    generate(c).forEach(function (f) {
      var id = f.join(",");
      if (seen[id]) return;
      seen[id] = true;
      list.push({ frets: f, fingers: assignFingers(f), tier: 0, rank: score(f) });
    });
    list.sort(function (a, b) { return b.rank - a.rank; });
    list = list.slice(0, LIMIT);
    list.forEach(function (v) {
      v.pos = position(v.frets);
      v.barre = v.tier > 0 ? barreFromFingers(v.frets, v.fingers) : fingerCount(v.frets).barre;
    });
    CACHE[k] = list;
    return list;
  }
  /* the same voicings in "position" order: open chords first, then up the neck, the common ones first at each fret */
  function byPosition(list) {
    return list.slice().sort(function (a, b) { return a.pos - b.pos || b.rank - a.rank; });
  }
  function fretText(frets) {
    return frets.map(function (f) { return f < 0 ? "x" : f < 10 ? String(f) : "(" + f + ")"; }).join("");
  }

  /* ---------------- naming a voicing (section 3.4) ---------------- */
  /* frets -> up to three names, best first: [{root, q, bass, score}], or [] when the notes are no chord of the 19.
     The notes' pitch classes must hold every required tone of the quality and nothing outside it but the bass. */
  function identify(frets) {
    var notes = midiOf(frets);
    if (notes.length < 2) return [];
    var bass = mod12(Math.min.apply(null, notes)), have = {}, set = [];
    notes.forEach(function (n) { if (!have[mod12(n)]) { have[mod12(n)] = true; set.push(mod12(n)); } });
    var found = [];
    for (var root = 0; root < 12; root++) {
      if (!have[root]) continue;
      for (var qi = 0; qi < QUALS.length; qi++) {
        var Q = QUALS[qi], want = {}, ok = true, missing = 0;
        Q.iv.forEach(function (v) { want[mod12(root + v)] = true; });
        for (var j = 0; j < Q.iv.length; j++) {
          if (!have[mod12(root + Q.iv[j])]) { if (Q.opt.indexOf(Q.iv[j]) >= 0) missing++; else ok = false; }
        }
        if (!ok) continue;
        var slash = bass !== root, extra = 0;
        set.forEach(function (pc) { if (!want[pc] && !(slash && pc === bass)) extra++; });
        if (extra) continue;
        /* a bass that is not a chord tone may appear only once, as the bass */
        if (Q.id === "5" && set.length > 2) continue;
        var s = (slash ? -1 : 2) + Q.common - 0.5 * missing;
        found.push({ root: root, q: Q.id, bass: slash ? bass : null, score: s });
      }
    }
    found.sort(function (a, b) { return b.score - a.score; });
    return found.slice(0, 3);
  }

  return {
    OPEN: OPEN, NAMES: NAMES, QUALS: QUALS, GROUPS: GROUPS, LIMIT: LIMIT, MAX_FRET: MAX_FRET,
    OPENS: OPENS, MOVABLE: MOVABLE, ROOT_AT: ROOT_AT,
    parse: parse, name: name, qual: qual, tones: tones, strings: strings, degree: degree, mod12: mod12, fr: fr,
    shapes: shapes, generate: generate, voicings: voicings, byPosition: byPosition, score: score,
    fingerCount: fingerCount, assignFingers: assignFingers, barreFromFingers: barreFromFingers, position: position,
    midiOf: midiOf, fretText: fretText,
    identify: identify
  };
})();
