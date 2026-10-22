/* fake-yu / music.js — ten public-domain tunes arranged for Lo-PDA's four channels.
 *
 * Every chart is generated from the same note list that writes the melody channel, so what the
 * player hears and what the player hits cannot drift apart. A note is played with A; a note marked
 * ^ is a chime note played with B. The pitch is only a picture on the staff.
 *
 * Sources (all public domain, arrangements written for this app):
 *   小星星 / Twinkle — "Ah! vous dirai-je, maman", French folk song, 1761.
 *   欢乐颂 / Ode to Joy — Beethoven, Symphony No. 9, fourth movement, 1824.
 *   绿袖子 / Greensleeves — English folk song, 16th century.
 *   卡农 / Canon — Pachelbel, Canon in D, c. 1680.
 *   山魔王的宫殿 / Mountain King — Grieg, Peer Gynt Suite No. 1, 1875.
 *   土耳其进行曲 / Turkish March — Mozart, Piano Sonata No. 11, 1783.
 *   天鹅湖 / Swan Lake — Tchaikovsky, Swan Lake, 1876.
 *   匈牙利舞曲 / Hungarian Dance — Brahms, Hungarian Dance No. 5, 1869.
 *   致爱丽丝 / Für Elise — Beethoven, Bagatelle No. 25, 1810.
 *   小夜曲 / Serenade — Schubert, Ständchen, 1828.
 * MML is described in SPEC.md 6.3. The score strings here are original reductions for this chip.
 */

var FAKE_SONGS = (function () {
  "use strict";

  var CH = {
    C: ["c4", "e4", "g4"], G: ["g3", "b3", "d4"], Am: ["a3", "c4", "e4"],
    F: ["f3", "a3", "c4"], Dm: ["d4", "f4", "a4"], Em: ["e4", "g4", "b4"],
    Bm: ["b3", "d4", "f+4"], A: ["a3", "c+4", "e4"], D: ["d4", "f+4", "a4"],
    E: ["e4", "g+4", "b4"], B: ["b3", "d+4", "f+4"], Gm: ["g3", "b-3", "d4"],
    Bb: ["b-3", "d4", "f4"], Cm: ["c4", "e-4", "g4"],
    "F#m": ["f+3", "a3", "c+4"], "C#m": ["c+4", "e4", "g+4"], "G#m": ["g+3", "b3", "d+4"]
  };

  var P2_PAT = {
    sparse: [0, "r", 2, "r", 1, "r", 2, "r"],
    alberti: [0, 2, 1, 2, 0, 2, 1, 2],
    offbeat: [0, 0, 1, 2, 0, 0, 1, 2],
    rolling: [0, 1, 2, 1, 0, 1, 2, 1],
    cascade: [0, 1, 2, 1, 2, 1, 0, 1],
    clock: [0, 2, 0, 2, 0, 2, 1, 2],
    waltz: [0, 1, 2, 1, 0, 1, 2, 1]
  };
  var TRI_PAT = {
    soft: [0, 2, 0, 2], walk: [0, 2, 0, 2], pump: [0, 0, 2, 2], low: [0, 0, 0, 2],
    oom: [0, 1, 2, 1], drone: [0, 0, 0, 0], march: [0, 2, 0, 1]
  };
  var NOISE_PAT = {
    soft: ["X", "r", "x", "r", "X", "r", "x", "x"],
    march: ["X", "x", "x", "x", "X", "x", "x", "x"],
    gallop: ["X", "x", "x", "x", "X", "x", "x", "x"],
    wild: ["X", "x", "X", "x", "X", "x", "X", "x"],
    brush: ["x", "r", "x", "r", "x", "r", "x", "r"],
    fanfare: ["X", "r", "x", "r", "X", "x", "X", "r"],
    storm: ["X", "x", "X", "x", "x", "x", "X", "x"]
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
    var m = /^([a-gr])([+-]?)(\d)?:([0-9.]+)([!~^]?)$/.exec(s);
    if (!m) throw new Error("bad event " + s);
    return {
      n: m[1] === "r" ? "r" : m[1] + m[2] + m[3],
      d: +m[4],
      chart: m[5] === "!" ? 0 : 1,
      hold: m[5] === "~",
      lane: m[5] === "^" ? "b" : "a"
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
      chart.push({ t: e.t * beatSec, end: (e.t + e.d) * beatSec, d: e.d, hold: e.hold, lane: e.lane, note: e.n, f: freq(e.n) });
    });
    /* The gaze sits on a musical boundary: the last note before it is a hold that ends
       when the eye opens, and the first note after it is a hold that begins when the
       eye closes. That gives the player a release cue and a re-entry cue without any
       extra sensor. */
    watch.forEach(function (w) {
      var ws = w[0] * beatSec, we = w[1] * beatSec;
      var pre = null, post = null;
      chart.forEach(function (n) {
        if (n.lane !== "a") return;
        if (n.end <= ws + 0.001 && n.end >= ws - 0.08) pre = n;
        if (Math.abs(n.t - we) <= 0.02) post = n;
      });
      if (pre) { pre.hold = true; pre.end = ws; }
      if (post) post.hold = true;
    });
    for (var i = 1; i < chart.length; i++) {
      if (chart[i].t < chart[i - 1].end - 0.001) throw new Error(def.id + ": notes overlap at chart " + i);
    }
    var back = backing(def.bars, def.style);
    var header = "@" + (def.duty == null ? 1 : def.duty) + " v" + (def.sound || 11) + " l8";
    function resumeAt(startBeat) {
      startBeat = Math.max(0, Math.min(beat - 4, Math.floor(startBeat / 4) * 4));
      var rest = evs.filter(function (e) { return e.t >= startBeat; });
      var bars = def.bars.slice(startBeat / 4);
      var b2 = backing(bars, def.style);
      return { bpm: bpm, p1: melodyMML(rest, header), p2: b2.p2, tri: b2.tri, noise: b2.noise };
    }
    return {
      id: def.id, act: def.act || 1, venue: def.venue || "hall",
      name: def.name, short: def.short, credit: def.credit, bpm: bpm,
      difficulty: def.difficulty, seconds: beat * beatSec,
      tag: def.tag || { zh: "", en: "" },
      music: { bpm: bpm, p1: melodyMML(evs, header), p2: back.p2, tri: back.tri, noise: back.noise },
      resumeAt: resumeAt,
      chart: chart, watch: watch.map(function (w) { return [w[0] * beatSec, w[1] * beatSec]; }), totalBeats: beat
    };
  }

  /* ---- 1. Twinkle, 100 bpm, 16 bars: 2 intro + 12 melody + 2 outro ---- */
  var twinkle = build({
    id: "twinkle", act: 1, venue: "hall", bpm: 100, difficulty: 1, duty: 1, sound: 11,
    name: { zh: "小星星", en: "Twinkle" }, short: { zh: "小星星", en: "Twinkle" },
    credit: { zh: "法国童谣 1761", en: "French folk 1761" },
    tag: { zh: "第一课", en: "First lesson" },
    watch: [[31.5, 36]],
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

  /* ---- 2. Ode to Joy, 112 bpm, 20 bars ---- */
  var ode = build({
    id: "ode", act: 1, venue: "hall", bpm: 112, difficulty: 2, duty: 2, sound: 12,
    name: { zh: "欢乐颂", en: "Ode to Joy" }, short: { zh: "欢乐颂", en: "Ode" },
    credit: { zh: "贝多芬 1824", en: "Beethoven 1824" },
    tag: { zh: "长音", en: "Holds" },
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

  /* ---- 3. Greensleeves, 96 bpm, 18 bars; the first chime notes ---- */
  var green = build({
    id: "greensleeves", act: 1, venue: "garden", bpm: 96, difficulty: 2, duty: 1, sound: 11,
    name: { zh: "绿袖子", en: "Greensleeves" }, short: { zh: "绿袖子", en: "Greensleeves" },
    credit: { zh: "英国民谣 16 世纪", en: "English folk, 16th c." },
    tag: { zh: "新键 B", en: "New key B" },
    watch: [[40, 44]],
    bars: ["Am", "Am",
           "Am", "C", "G", "Am", "Am", "C", "G", "Am",
           "C", "G", "Em", "Am", "C", "G", "Em", "Am"],
    style: { p2: "rolling", tri: "oom", noise: "brush", p2vol: 6, trivol: 11, loud: 4 },
    events: [
      "r:4 r:4",
      "a3:2 c4:1 d4:1",
      "e4:1.5 f4:0.5 e4:1 d4:1",
      "b3:1.5 g3:0.5 a3:1 b3:1",
      "c4:1.5 b3:0.5 a3:2",
      "a3:2 c4:1 d4:1",
      "e4:1.5 f4:0.5 e4:1 d4:1",
      "b3:1.5 g3:0.5 a3:1 b3:1",
      "c4:1.5 b3:0.5 a3:2",
      "e4:1.5 g4:0.5^ e4:1 d4:1",
      "c4:2 b3:1 a3:1",
      "b3:1.5 g3:0.5 a3:1 b3:1",
      "c4:1.5 b3:0.5 a3:2~",
      "e4:1.5 g4:0.5^ e4:1 d4:1",
      "c4:2 b3:1 a3:1",
      "b3:1.5 g3:0.5 a3:1 b3:1",
      "a3:4!"
    ].join(" ")
  });

  /* ---- 4. Canon, 108 bpm, 20 bars: the act-one finale ---- */
  var canon = build({
    id: "canon", act: 1, venue: "hall", bpm: 108, difficulty: 3, duty: 2, sound: 12,
    name: { zh: "卡农", en: "Canon" }, short: { zh: "卡农", en: "Canon" },
    credit: { zh: "帕赫贝尔 约 1680", en: "Pachelbel c. 1680" },
    tag: { zh: "第二声部", en: "Second voice" },
    watch: [[48, 52]],
    bars: ["D", "A",
           "D", "A", "Bm", "F#m", "G", "D", "Em", "A", "D", "A", "Bm", "F#m", "G", "D", "Em", "D",
           "D", "D"],
    style: { p2: "cascade", tri: "walk", noise: "march", p2vol: 7, trivol: 11, loud: 5 },
    events: [
      "r:4 r:4",
      "f+5:2 e5:2",
      "d5:2 c+5:2",
      "b4:2 a4:2",
      "b4:2 c+5:2",
      "d5:2 f+5:2",
      "e5:2 d5:2",
      "b4:2 c+5:2",
      "d5:4",
      "f+5:2 e5:2",
      "d5:2 c+5:2",
      "b4:2 a4:2",
      "b4:2 c+5:2",
      "d5:1^ e5:1^ f+5:2",
      "g5:2^ f+5:2",
      "e5:2 d5:2",
      "d5:4!",
      "r:4 r:4"
    ].join(" ")
  });

  /* ---- 5. Mountain King, 144 bpm, 28 bars: the throne-room test ---- */
  var mountain = build({
    id: "mountain", act: 2, venue: "throne", bpm: 144, difficulty: 3, duty: 1, sound: 12,
    name: { zh: "山魔王的宫殿", en: "Mountain King" }, short: { zh: "山魔王", en: "Mountain" },
    credit: { zh: "格里格 1875", en: "Grieg 1875" },
    tag: { zh: "加速", en: "Accelerando" },
    watch: [[55.5, 60]],
    bars: ["Bm", "Bm",
           "Bm", "Bm", "Bm", "Bm", "A", "A", "Bm", "Bm",
           "Bm", "Bm", "Bm", "Bm", "A", "A", "Bm", "Bm",
           "Bm", "Bm", "G", "G", "D", "D", "A", "Bm",
           "Bm", "Bm"],
    style: { p2: "offbeat", tri: "pump", noise: "gallop", p2vol: 7, trivol: 11, loud: 6 },
    events: [
      "r:4 r:4",
      /* A: quarter-note statement, chime on the last beat of each phrase */
      "b3:1 d4:1 e4:1 f+4:1^", "f+4:1 e4:1 d4:1 b3:1",
      "b3:1 d4:1 e4:1 f+4:1^", "f+4:1 e4:1 d4:1 b3:1",
      "a3:1 c+4:1 d4:1 e4:1^", "e4:1 d4:1 c+4:1 a3:1",
      "b3:1 d4:1 e4:1 f+4:1^", "f+4:1 e4:1 d4:1 b3:1",
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
      "b4:1 d5:1 e5:1 f+5:1^", "f+5:1 e5:1 d5:1 b4:1",
      "b4:1 d5:1 e5:1 f+5:1^", "f+5:1 e5:1 d5:1 b4:1",
      "a4:1 c+5:1 d5:1 e5:1^", "e5:1 d5:1 c+5:1 a4:1",
      "b4:1 d5:1 e5:1 f+5:1^", "f+5:1 e5:1 d5:1 b4:1",
      "b3:1! d4:1! f+4:2! b3:4!"
    ].join(" ")
  });

  /* ---- 6. Turkish March, 132 bpm, 24 bars ---- */
  var turkish = build({
    id: "turkish", act: 2, venue: "throne", bpm: 132, difficulty: 3, duty: 2, sound: 12,
    name: { zh: "土耳其进行曲", en: "Turkish March" }, short: { zh: "土耳其", en: "Turkish" },
    credit: { zh: "莫扎特 1783", en: "Mozart 1783" },
    tag: { zh: "八分音符", en: "Eighths" },
    watch: [[52, 56], [76, 80]],
    bars: ["Am", "E",
           "Am", "E", "Am", "Am", "Am", "E", "Am", "Am",
           "Am", "E", "Am", "Am", "Am", "E", "E", "Am",
           "Dm", "Am", "E", "Am",
           "Am", "E"],
    style: { p2: "clock", tri: "march", noise: "fanfare", p2vol: 7, trivol: 11, loud: 5 },
    events: [
      "r:4 r:4",
      "b3:0.5 a3:0.5 g+3:0.5 a3:0.5 c4:0.5 d4:0.5 c4:0.5 b3:0.5",
      "a3:0.5 b3:0.5 c4:0.5 d4:0.5 e4:1 e4:1",
      "e4:0.5 f4:0.5 g4:0.5 f4:0.5 e4:0.5 d4:0.5 c4:0.5 b3:0.5",
      "a3:1 c4:1 e4:2",
      "b3:0.5 a3:0.5 g+3:0.5 a3:0.5 c4:0.5 d4:0.5 c4:0.5 b3:0.5",
      "a3:0.5 b3:0.5 c4:0.5 d4:0.5 e4:1 a4:1",
      "g4:0.5 f4:0.5 e4:0.5 d4:0.5 c4:0.5 b3:0.5 a3:0.5 g+3:0.5",
      "a3:4!",
      "b3:0.5^ a3:0.5 g+3:0.5 a3:0.5 c4:0.5 d4:0.5 c4:0.5 b3:0.5",
      "a3:0.5 b3:0.5 c4:0.5 d4:0.5 e4:1 e4:1",
      "e4:0.5 f4:0.5 g4:0.5^ f4:0.5 e4:0.5 d4:0.5 c4:0.5 b3:0.5",
      "a3:1 c4:1 e4:2~",
      "b3:0.5 a3:0.5 g+3:0.5 a3:0.5 c4:0.5 d4:0.5 c4:0.5 b3:0.5",
      "a3:0.5 b3:0.5 c4:0.5 d4:0.5 e4:1 a4:1",
      "g4:0.5 f4:0.5 e4:0.5 d4:0.5 c4:0.5 b3:0.5 a3:0.5 g+3:0.5",
      "a3:4!",
      "a4:0.5 g4:0.5 f4:0.5 e4:0.5 d4:0.5 e4:0.5 f4:0.5 g4:0.5",
      "a4:0.5 b4:0.5^ c5:0.5 b4:0.5 a4:0.5 g4:0.5 f4:0.5 e4:0.5",
      "d4:0.5 e4:0.5 f4:0.5 g4:0.5 a4:1 b4:1",
      "a4:4!",
      "r:4 r:4"
    ].join(" ")
  });

  /* ---- 7. Swan Lake, 88 bpm, 20 bars: long holds under the king's eye ---- */
  var swan = build({
    id: "swan", act: 2, venue: "moon", bpm: 88, difficulty: 3, duty: 1, sound: 11,
    name: { zh: "天鹅湖", en: "Swan Lake" }, short: { zh: "天鹅湖", en: "Swan Lake" },
    credit: { zh: "柴可夫斯基 1876", en: "Tchaikovsky 1876" },
    tag: { zh: "长音与注视", en: "Holds & eyes" },
    watch: [[36, 40], [56, 60]],
    bars: ["Bm", "Em",
           "Bm", "Em", "Bm", "F#m", "D", "Em", "F#m", "Bm",
           "Bm", "Em", "Bm", "F#m", "D", "Em", "F#m", "Bm",
           "Bm", "Em"],
    style: { p2: "waltz", tri: "soft", noise: "brush", p2vol: 5, trivol: 10, loud: 3 },
    events: [
      "r:4 r:4",
      "b4:2 e5:1 f+5:1",
      "g5:2^ f+5:1 e5:1",
      "d5:2 c+5:1 b4:1",
      "c+5:2 b4:2~",
      "a4:2 d5:1 e5:1",
      "f+5:2^ e5:1 d5:1",
      "c+5:2 b4:1 a+4:1",
      "b4:4~",
      "b4:2 e5:1 f+5:1",
      "g5:2^ f+5:1 e5:1",
      "d5:2 c+5:1 b4:1",
      "c+5:2 b4:2",
      "a4:2 d5:1 e5:1",
      "f+5:2^ e5:1 d5:1",
      "c+5:2 b4:1 a+4:1",
      "b4:4!",
      "r:4 r:4"
    ].join(" ")
  });

  /* ---- 8. Hungarian Dance, 152 bpm, 24 bars ---- */
  var hungarian = build({
    id: "hungarian", act: 2, venue: "throne", bpm: 152, difficulty: 4, duty: 1, sound: 12,
    name: { zh: "匈牙利舞曲", en: "Hungarian Dance" }, short: { zh: "匈牙利", en: "Hungarian" },
    credit: { zh: "勃拉姆斯 1869", en: "Brahms 1869" },
    tag: { zh: "最快", en: "Fastest" },
    watch: [[48, 52], [68, 72]],
    bars: ["Am", "E",
           "Am", "E", "Am", "Am", "Am", "E", "Am", "Am",
           "Am", "E", "Am", "Am", "Am", "E", "Am", "Am",
           "Dm", "Am", "E", "Am",
           "Am", "E"],
    style: { p2: "offbeat", tri: "pump", noise: "storm", p2vol: 7, trivol: 11, loud: 6 },
    events: [
      "r:4 r:4",
      "a3:0.5 a3:0.5 a3:0.5 a3:0.5 a3:0.5 b3:0.5 c4:0.5 b3:0.5",
      "a3:1.5 g+3:0.5 a3:1 b3:1",
      "c4:0.5 c4:0.5 c4:0.5 c4:0.5 c4:0.5 d4:0.5 e4:0.5 d4:0.5",
      "c4:1.5 b3:0.5 a3:2~",
      "a3:0.5 a3:0.5 a3:0.5 a3:0.5 a3:0.5 b3:0.5 c4:0.5 b3:0.5",
      "a3:1.5 g+3:0.5 a3:1 b3:1",
      "e4:0.5 e4:0.5 e4:0.5 e4:0.5 e4:0.5 f4:0.5 g4:0.5 f4:0.5",
      "e4:1.5 d4:0.5 c4:2",
      "a3:0.5^ a3:0.5 a3:0.5 a3:0.5 a3:0.5 b3:0.5^ c4:0.5 b3:0.5",
      "a3:1.5 g+3:0.5 a3:1 b3:1",
      "c4:0.5 c4:0.5 c4:0.5 c4:0.5 c4:0.5 d4:0.5^ e4:0.5 d4:0.5",
      "c4:1.5 b3:0.5 a3:2~",
      "a3:0.5 a3:0.5 a3:0.5 a3:0.5 a3:0.5 b3:0.5 c4:0.5 b3:0.5",
      "a3:1.5 g+3:0.5 a3:1 b3:1",
      "e4:0.5 e4:0.5 e4:0.5 e4:0.5 e4:0.5 f4:0.5 g4:0.5 f4:0.5",
      "e4:1.5 d4:0.5 c4:2",
      "d4:0.5 e4:0.5 f4:0.5 g4:0.5 a4:1 b4:1",
      "c5:0.5 b4:0.5 a4:0.5 g4:0.5 f4:1 e4:1",
      "d4:0.5^ e4:0.5^ f4:0.5^ g4:0.5^ a4:1 b4:1",
      "a4:4!",
      "r:4 r:4"
    ].join(" ")
  });

  /* ---- 9. Für Elise, 116 bpm, 20 bars: the night escape ---- */
  var elise = build({
    id: "elise", act: 3, venue: "night", bpm: 116, difficulty: 3, duty: 2, sound: 12,
    name: { zh: "致爱丽丝", en: "Für Elise" }, short: { zh: "致爱丽丝", en: "Für Elise" },
    credit: { zh: "贝多芬 1810", en: "Beethoven 1810" },
    tag: { zh: "一支真曲", en: "A real tune" },
    watch: [[24, 28], [48, 52]],
    bars: ["Am", "E",
           "Am", "Am", "E", "Am", "Am", "Am", "E", "Am",
           "Am", "C", "E", "Am", "Am", "Am", "E", "Am",
           "Am", "E"],
    style: { p2: "rolling", tri: "soft", noise: "brush", p2vol: 6, trivol: 10, loud: 4 },
    events: [
      "r:4 r:4",
      "e5:0.5 d+5:0.5 e5:0.5 d+5:0.5 e5:0.5 b4:0.5 d5:0.5 c5:0.5",
      "a4:2 r:0.5 c4:0.5 e4:0.5 a4:0.5",
      "b4:2 r:0.5 e4:0.5 g+4:0.5 b4:0.5",
      "c5:2 r:0.5 e4:0.5 e5:0.5 d+5:0.5",
      "e5:0.5 d+5:0.5 e5:0.5 d+5:0.5 e5:0.5 b4:0.5 d5:0.5 c5:0.5",
      "a4:2 r:0.5 c4:0.5 e4:0.5 a4:0.5",
      "b4:2 r:0.5 e4:0.5 c5:0.5 b4:0.5",
      "a4:4~",
      "c5:0.5^ b4:0.5 a4:0.5 g+4:0.5 a4:0.5 b4:0.5 c5:0.5 d5:0.5",
      "e5:2 r:1 e5:0.5 d5:0.5",
      "c5:0.5 b4:0.5 a4:0.5 g+4:0.5 a4:0.5 b4:0.5 c5:0.5 b4:0.5",
      "a4:4",
      "e5:0.5 d+5:0.5 e5:0.5 d+5:0.5 e5:0.5 b4:0.5 d5:0.5 c5:0.5",
      "a4:2 r:0.5 c4:0.5 e4:0.5 a4:0.5",
      "b4:1 c5:1 d5:1 e5:1",
      "a4:4!",
      "r:4 r:4"
    ].join(" ")
  });

  /* ---- 10. Serenade, 84 bpm, 18 bars: the honest song at dawn ---- */
  var serenade = build({
    id: "serenade", act: 3, venue: "dawn", bpm: 84, difficulty: 2, duty: 1, sound: 11,
    name: { zh: "小夜曲", en: "Serenade" }, short: { zh: "小夜曲", en: "Serenade" },
    credit: { zh: "舒伯特 1828", en: "Schubert 1828" },
    tag: { zh: "终曲", en: "Finale" },
    watch: [[40, 44]],
    bars: ["Am", "E",
           "Am", "C", "G", "E", "Am", "C", "G", "Am",
           "Am", "C", "F", "C", "E", "Am",
           "Am", "E"],
    style: { p2: "cascade", tri: "drone", noise: "brush", p2vol: 5, trivol: 10, loud: 3 },
    events: [
      "r:4 r:4",
      "a3:2 c4:2",
      "e4:2 d4:1 c4:1",
      "b3:2 a3:2",
      "g+3:2 b3:1 e4:1",
      "a4:2^ g4:1 f4:1",
      "e4:2 d4:1 c4:1",
      "d4:2 c4:1 b3:1",
      "a3:4~",
      "a3:2 c4:2",
      "e4:2 g4:2",
      "f4:2 e4:1 d4:1",
      "e4:2 c4:2",
      "d4:2 b3:1 g+3:1",
      "a3:4!",
      "r:4 r:4"
    ].join(" ")
  });

  return [twinkle, ode, green, canon, mountain, turkish, swan, hungarian, elise, serenade];
})();

if (typeof module !== "undefined" && module.exports) module.exports = { FAKE_SONGS: FAKE_SONGS };
