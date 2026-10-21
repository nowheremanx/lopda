/* fake-yu / music.js — three public-domain tunes arranged for Lo-PDA's four channels.
 *
 * Every chart is generated from the same note list that writes the melody channel, so what the
 * player hears and what the player hits cannot drift apart. One A key, one line of notes; the
 * pitch is only a picture on the staff.
 *
 * Sources (all public domain, arrangements written for this app):
 *   小星星 / Twinkle — "Ah! vous dirai-je, maman", French folk song, 1761.
 *   欢乐颂 / Ode to Joy — Beethoven, Symphony No. 9, fourth movement, 1824.
 *   山魔王的宫殿 / In the Hall of the Mountain King — Grieg, Peer Gynt Suite No. 1, 1875.
 * MML is described in SPEC.md 6.3. The score strings here are original reductions for this chip.
 */

var FAKE_SONGS = (function () {
  "use strict";

  var CH = {
    C: ["c4", "e4", "g4"], G: ["g3", "b3", "d4"], Am: ["a3", "c4", "e4"],
    F: ["f3", "a3", "c4"], Dm: ["d4", "f4", "a4"], Em: ["e4", "g4", "b4"],
    Bm: ["b3", "d4", "f+4"], A: ["a3", "c+4", "e4"], D: ["d4", "f+4", "a4"],
    E: ["e4", "g+4", "b4"], B: ["b3", "d+4", "f+4"], Gm: ["g3", "b-3", "d4"],
    Bb: ["b-3", "d4", "f4"], Cm: ["c4", "e-4", "g4"]
  };

  var P2_PAT = {
    sparse: [0, "r", 2, "r", 1, "r", 2, "r"],
    alberti: [0, 2, 1, 2, 0, 2, 1, 2],
    offbeat: [0, 0, 1, 2, 0, 0, 1, 2],
    rolling: [0, 1, 2, 1, 0, 1, 2, 1]
  };
  var TRI_PAT = { soft: [0, 2, 0, 2], walk: [0, 2, 0, 2], pump: [0, 0, 2, 2], low: [0, 0, 0, 2] };
  var NOISE_PAT = {
    soft: ["X", "r", "x", "r", "X", "r", "x", "x"],
    march: ["X", "x", "x", "x", "X", "x", "x", "x"],
    gallop: ["X", "x", "x", "x", "X", "x", "x", "x"],
    wild: ["X", "x", "X", "x", "X", "x", "X", "x"]
  };

  var LEN = { 0.25: "16", 0.5: "8", 0.75: "8.", 1: "4", 1.5: "4.", 1.75: "4..", 2: "2", 3: "2.", 4: "1", 6: "1." };

  function noteParts(n) {
    var m = /^([a-g])([+-]?)(\d)$/.exec(n);
    if (!m) throw new Error("bad note " + n);
    return { letter: m[1], acc: m[2], oct: +m[3] };
  }
  function semitone(letter) {
    return { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[letter];
  }
  function midi(n) {
    var p = noteParts(n);
    return (p.oct + 1) * 12 + semitone(p.letter) + (p.acc === "+" ? 1 : p.acc === "-" ? -1 : 0);
  }
  function freq(n) { return 440 * Math.pow(2, (midi(n) - 69) / 12); }
  function shift(n, octaves) {
    var p = noteParts(n);
    return p.letter + p.acc + (p.oct + octaves);
  }
  function tone(t, def) {
    if (t === def) return "";
    var s = LEN[t];
    if (!s) throw new Error("unsupported length " + t);
    return s;
  }
  function event(s) {
    var m = /^([a-gr])([+-]?)(\d)?:([0-9.]+)([!~]?)$/.exec(s);
    if (!m) throw new Error("bad event " + s);
    return {
      n: m[1] === "r" ? "r" : m[1] + m[2] + m[3],
      d: +m[4],
      chart: m[5] === "!" ? 0 : 1,
      hold: m[5] === "~"
    };
  }
  function events(text) { return text.trim().split(/\s+/).map(event); }

  /* melody channel: one octave command only when the octave changes */
  function melodyMML(evs, header) {
    var out = header, oct = null;
    evs.forEach(function (e) {
      if (e.n === "r") { out += " r" + tone(e.d, 0.5); return; }
      var p = noteParts(e.n);
      if (p.oct !== oct) { out += " o" + p.oct; oct = p.oct; }
      out += " " + p.letter + p.acc + tone(e.d, 0.5);
    });
    return out;
  }

  /* a list of [note, beats] pairs to MML, for the backing channels */
  function channelMML(list, header, def) {
    var out = header, oct = null;
    list.forEach(function (it) {
      var n = it[0], d = it[1];
      if (n === "r") { out += " r" + tone(d, def); return; }
      if (n === "x" || n === "X") { out += " " + n + tone(d, def); return; }
      var p = noteParts(n);
      if (p.oct !== oct) { out += " o" + p.oct; oct = p.oct; }
      out += " " + p.letter + p.acc + tone(d, def);
    });
    return out;
  }

  function backing(bars, style) {
    var p2 = [], tri = [], noise = [], p2pat = P2_PAT[style.p2] || P2_PAT.alberti;
    var tripat = TRI_PAT[style.tri] || TRI_PAT.walk, npat = NOISE_PAT[style.noise] || NOISE_PAT.soft;
    bars.forEach(function (name) {
      var c = CH[name];
      if (!c) throw new Error("unknown chord " + name);
      p2pat.forEach(function (i) { p2.push(i === "r" ? ["r", 0.5] : [c[i], 0.5]); });
      tripat.forEach(function (i) { tri.push([shift(c[i], -2), 1]); });
      npat.forEach(function (t, i) {
        if (t === "r") noise.push(["r", 0.5, 0]);
        else noise.push([t, 0.5, i === 0 || i === 4 ? (style.loud || 5) : 3]);
      });
    });
    return {
      p2: channelMML(p2, "@0 v" + (style.p2vol || 7) + " l8", 0.5),
      tri: channelMML(tri, "v" + (style.trivol || 11) + " l4", 1),
      noise: noiseMML(noise)
    };
  }
  function noiseMML(list) {
    var out = "l8";
    list.forEach(function (it) {
      if (it[0] === "r") out += " r" + tone(it[1], 0.5);
      else out += " v" + it[2] + " " + it[0] + tone(it[1], 0.5);
    });
    return out;
  }

  function inWatch(t, d, watch) {
    return watch.some(function (w) { return t < w[1] && t + d > w[0]; });
  }

  function build(def) {
    var evs = events(def.events), beat = 0;
    evs.forEach(function (e) { e.t = beat; beat += e.d; });
    if (beat % 4) throw new Error(def.id + ": " + beat + " beats is not a whole number of bars");
    if (def.bars.length !== beat / 4) throw new Error(def.id + ": " + def.bars.length + " chords for " + beat / 4 + " bars");
    var bpm = def.bpm, beatSec = 60 / bpm;
    var watch = def.watch || [];
    var chart = [];
    evs.forEach(function (e) {
      if (!e.chart || e.n === "r") return;
      if (inWatch(e.t, e.d, watch)) return;
      chart.push({ t: e.t * beatSec, end: (e.t + e.d) * beatSec, d: e.d, hold: e.hold, note: e.n, f: freq(e.n) });
    });
    for (var i = 1; i < chart.length; i++) {
      if (chart[i].t < chart[i - 1].end - 0.001) throw new Error(def.id + ": notes overlap at chart " + i);
    }
    var back = backing(def.bars, def.style);
    return {
      id: def.id, name: def.name, short: def.short, credit: def.credit, bpm: bpm,
      difficulty: def.difficulty, seconds: beat * beatSec,
      music: { bpm: bpm, p1: melodyMML(evs, "@" + (def.duty == null ? 1 : def.duty) + " v" + (def.sound || 11) + " l8"), p2: back.p2, tri: back.tri, noise: back.noise },
      chart: chart, watch: watch.map(function (w) { return [w[0] * beatSec, w[1] * beatSec]; }), totalBeats: beat
    };
  }

  /* ---- 1. Twinkle, 100 bpm, 16 bars: 2 intro + 12 melody + 2 outro ---- */
  var twinkle = build({
    id: "twinkle", bpm: 100, difficulty: 1, duty: 1, sound: 11,
    name: { zh: "小星星", en: "Twinkle" }, short: { zh: "小星星", en: "Twinkle" },
    credit: { zh: "法国童谣 1761", en: "French folk 1761" },
    watch: [[32, 36]],
    bars: ["C", "G", "C", "C", "F", "C", "G", "G", "G", "G", "C", "C", "F", "C", "G", "C"],
    style: { p2: "sparse", tri: "soft", noise: "soft", p2vol: 6, trivol: 11, loud: 4 },
    events: [
      "r:4 r:4",
      "c4:1 c4:1 g4:1 g4:1 a4:1 a4:1 g4:1.5~ r:0.5",
      "f4:1 f4:1 e4:1 e4:1 d4:1 d4:1 c4:1.5~ r:0.5",
      "g4:1 g4:1 f4:1 f4:1 e4:1 e4:1 d4:1.5~ r:0.5",
      "g4:1 g4:1 f4:1 f4:1 e4:1 e4:1 d4:1.5~ r:0.5",
      "c4:1 c4:1 g4:1 g4:1 a4:1 a4:1 g4:1.5~ r:0.5",
      "f4:1 f4:1 e4:1 e4:1 d4:1 d4:1 c4:1.5~ r:0.5",
      "c4:1! e4:1! g4:2! c5:4!"
    ].join(" ")
  });

  /* ---- 2. Ode to Joy, 112 bpm, 20 bars: 2 intro + 16 melody + 2 outro ---- */
  var ode = build({
    id: "ode", bpm: 112, difficulty: 2, duty: 2, sound: 12,
    name: { zh: "欢乐颂", en: "Ode to Joy" }, short: { zh: "欢乐颂", en: "Ode" },
    credit: { zh: "贝多芬 1824", en: "Beethoven 1824" },
    watch: [[48, 52], [60, 64]],
    bars: ["C", "G", "C", "G", "C", "G", "Am", "C",
           "C", "G", "C", "G", "C", "G", "Am", "C",
           "G", "C", "G", "C"],
    style: { p2: "alberti", tri: "walk", noise: "march", p2vol: 7, trivol: 11, loud: 5 },
    events: [
      "r:4 r:4",
      "e4:1 e4:1 f4:1 g4:1",
      "g4:1 f4:1 e4:1 d4:1",
      "c4:1 c4:1 d4:1 e4:1",
      "e4:1.5 d4:0.5 d4:1.5~ r:0.5",
      "e4:1 e4:1 f4:1 g4:1",
      "g4:1 f4:1 e4:1 d4:1",
      "c4:1 c4:1 d4:1 e4:1",
      "d4:1.5 c4:0.5 c4:1.5~ r:0.5",
      "e4:1 e4:1 f4:1 g4:1",
      "g4:1 f4:1 e4:1 d4:1",
      "c4:1 c4:1 d4:1 e4:1",
      "e4:1.5 d4:0.5 d4:1.5~ r:0.5",
      "e4:1 e4:1 f4:1 g4:1",
      "g4:1 f4:1 e4:1 d4:1",
      "c4:1 c4:1 d4:1 e4:1",
      "d4:1.5 c4:0.5 c4:1.5~ r:0.5",
      "c4:1! e4:1! g4:2! c5:4!"
    ].join(" ")
  });

  /* ---- 3. Mountain King, 144 bpm, 28 bars: 2 intro + 24 melody + 2 outro ---- */
  var mountain = build({
    id: "mountain", bpm: 144, difficulty: 3, duty: 1, sound: 12,
    name: { zh: "山魔王的宫殿", en: "Mountain King" }, short: { zh: "山魔王", en: "Mountain" },
    credit: { zh: "格里格 1875", en: "Grieg 1875" },
    watch: [[56, 60]],
    bars: ["Bm", "Bm",
           "Bm", "Bm", "Bm", "Bm", "A", "A", "Bm", "Bm",
           "Bm", "Bm", "Bm", "Bm", "A", "A", "Bm", "Bm",
           "Bm", "Bm", "G", "G", "D", "D", "A", "Bm",
           "Bm", "Bm"],
    style: { p2: "offbeat", tri: "pump", noise: "gallop", p2vol: 7, trivol: 11, loud: 6 },
    events: [
      "r:4 r:4",
      /* A: quarter-note statement */
      "b3:1 d4:1 e4:1 f+4:1", "f+4:1 e4:1 d4:1 b3:1",
      "b3:1 d4:1 e4:1 f+4:1", "f+4:1 e4:1 d4:1 b3:1",
      "a3:1 c+4:1 d4:1 e4:1", "e4:1 d4:1 c+4:1 a3:1",
      "b3:1 d4:1 e4:1 f+4:1", "f+4:1 e4:1 d4:1 b3:1",
      /* B: the original eighth-note gallop, chart on the quarters */
      "b3:0.5 d4:0.5! e4:0.5 f+4:0.5! f+4:0.5 e4:0.5! d4:0.5 b3:0.5!",
      "b3:0.5 d4:0.5! e4:0.5 f+4:0.5! f+4:0.5 e4:0.5! d4:0.5 b3:0.5!",
      "b3:0.5 d4:0.5! e4:0.5 f+4:0.5! f+4:0.5 e4:0.5! d4:0.5 b3:0.5!",
      "b3:0.5 d4:0.5! e4:0.5 f+4:0.5! f+4:0.5 e4:0.5! d4:0.5 b3:0.5!",
      "a3:0.5 c+4:0.5! d4:0.5 e4:0.5! e4:0.5 d4:0.5! c+4:0.5 a3:0.5!",
      "a3:0.5 c+4:0.5! d4:0.5 e4:0.5! e4:0.5 d4:0.5! c+4:0.5 a3:0.5!",
      "b3:0.5 d4:0.5! e4:0.5 f+4:0.5! f+4:0.5 e4:0.5! d4:0.5 b3:0.5!",
      "b3:0.5 d4:0.5! e4:0.5 f+4:0.5! f+4:0.5 e4:0.5! d4:0.5 b3:0.5!",
      /* C: up an octave, quarter notes, the roof comes off */
      "b4:1 d5:1 e5:1 f+5:1", "f+5:1 e5:1 d5:1 b4:1",
      "b4:1 d5:1 e5:1 f+5:1", "f+5:1 e5:1 d5:1 b4:1",
      "a4:1 c+5:1 d5:1 e5:1", "e5:1 d5:1 c+5:1 a4:1",
      "b4:1 d5:1 e5:1 f+5:1", "f+5:1 e5:1 d5:1 b4:1",
      "b3:1! d4:1! f+4:2! b3:4!"
    ].join(" ")
  });

  return [twinkle, ode, mountain];
})();

if (typeof module !== "undefined" && module.exports) module.exports = { FAKE_SONGS: FAKE_SONGS };
