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
    "F#m": ["f+3", "a3", "c+4"], "C#m": ["c+4", "e4", "g+4"], "G#m": ["g+3", "b3", "d+4"],
    "F#": ["f+3", "a+3", "c+4"], "C#": ["c+4", "e+4", "g+4"], "G#": ["g+3", "b+3", "d+4"]
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
  /* shorter forms for 3/4 bars and for two chords in one 4/4 bar */
  var P2_SHORT = {
    6: {
      sparse: [0, "r", 2, "r", 1, "r"], alberti: [0, 1, 2, 2, 1, 0],
      offbeat: [0, 1, 2, 0, 1, 2], rolling: [0, 1, 2, 1, 2, 0],
      cascade: [0, 1, 2, 1, 0, 1], clock: [0, 2, 1, 2, 0, 1], waltz: [0, 1, 2, 1, 0, 1]
    },
    4: {
      sparse: [0, "r", 1, "r"], alberti: [0, 2, 1, 2], offbeat: [0, 1, 2, 1],
      rolling: [0, 1, 2, 1], cascade: [0, 1, 2, 1], clock: [0, 2, 0, 2], waltz: [0, 1, 2, 1]
    }
  };
  var NOISE_SHORT = {
    6: {
      soft: ["X", "r", "x", "r", "X", "r"], march: ["X", "x", "x", "X", "x", "x"],
      gallop: ["X", "x", "x", "X", "x", "x"], wild: ["X", "x", "X", "x", "X", "x"],
      brush: ["x", "r", "x", "r", "x", "r"], fanfare: ["X", "r", "x", "X", "x", "r"],
      storm: ["X", "x", "X", "x", "x", "x"]
    }
  };
  function patternFor(name, slots, table, short) {
    var p = table[name] || table.alberti || table.soft;
    if (p.length === slots) return p;
    if (short && short[slots] && short[slots][name]) return short[slots][name];
    var out = [];
    for (var i = 0; i < slots; i++) out.push(p[i % p.length]);
    return out;
  }
  function triPattern(name, slots) {
    if (slots === 4) return TRI_PAT[name] || TRI_PAT.walk;
    if (slots === 3) return [0, 1, 2];
    if (slots === 2) return [0, 2];
    if (slots === 1) return [0];
    var out = [];
    for (var i = 0; i < slots; i++) out.push(i % 3);
    return out;
  }
  function repeatChords(prog, times) {
    var out = [];
    for (var i = 0; i < times; i++) out = out.concat(prog);
    return out;
  }

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

  function backing(bars, style, meter, chordsPerBar) {
    meter = meter || 4; chordsPerBar = chordsPerBar || 1;
    var p2 = [], tri = [], noise = [];
    var barsCount = bars.length / chordsPerBar;
    var slotsPerChord = Math.round(meter * 2 / chordsPerBar);
    var triSlots = Math.round(meter / chordsPerBar);
    var p2pat = patternFor(style.p2, slotsPerChord, P2_PAT, P2_SHORT);
    var npat = patternFor(style.noise, meter * 2, NOISE_PAT, NOISE_SHORT);
    for (var bar = 0; bar < barsCount; bar++) {
      for (var k = 0; k < chordsPerBar; k++) {
        var name = bars[bar * chordsPerBar + k];
        var c = CH[name];
        if (!c) throw new Error("unknown chord " + name);
        p2pat.forEach(function (i) { p2.push(i === "r" ? ["r", 0.5] : [c[i], 0.5]); });
        if (style.tri === "bass") {
          tri.push([shift(c[0], -2), meter / chordsPerBar]);
        } else {
          var tp = triPattern(style.tri, triSlots);
          tp.forEach(function (i) { tri.push([shift(c[i], -2), meter / chordsPerBar / triSlots]); });
        }
      }
      npat.forEach(function (t, i) {
        if (t === "r") noise.push(["r", 0.5, 0]);
        else noise.push([t, 0.5, i === 0 || i === 4 ? (style.loud || 5) : 3]);
      });
    }
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
    var meter = def.meter || 4;
    var chordsPerBar = def.chordsPerBar || 1;
    if (Math.abs(beat % meter) > 1e-9) throw new Error(def.id + ": " + beat + " beats is not a whole number of " + meter + "/4 bars");
    if (Math.abs(def.bars.length * meter / chordsPerBar - beat) > 1e-9) {
      throw new Error(def.id + ": " + def.bars.length + " chords for " + beat + " beats at " + chordsPerBar + "/bar");
    }
    var bpm = def.bpm, beatSec = 60 / bpm;
    var watch = def.watch || [];
    function makeChart(all) {
      var out = [];
      evs.forEach(function (e) {
        if (e.n === "r") return;
        if (!all && !e.chart) return;
        if (inWatch(e.t, e.d, watch)) return;
        out.push({ t: e.t * beatSec, end: (e.t + e.d) * beatSec, d: e.d, hold: e.hold, lane: e.lane, note: e.n, f: freq(e.n) });
      });
      /* The gaze sits on a musical boundary: the last note before it is a hold that ends
         when the eye opens, and the first note after it is a hold that begins when the
         eye closes. That gives the player a release cue and a re-entry cue without any
         extra sensor. */
      watch.forEach(function (w) {
        var ws = w[0] * beatSec, we = w[1] * beatSec;
        var pre = null, post = null;
        out.forEach(function (n) {
          if (n.lane !== "a") return;
          if (n.end <= ws + 0.001 && n.end >= ws - 0.08) pre = n;
          if (Math.abs(n.t - we) <= 0.02) post = n;
        });
        if (pre) { pre.hold = true; pre.end = ws; }
        if (post) post.hold = true;
      });
      for (var i = 1; i < out.length; i++) {
        if (out[i].t < out[i - 1].end - 0.001) throw new Error(def.id + ": notes overlap at chart " + i);
      }
      return out;
    }
    var chart = makeChart(false);
    /* Encore keeps the notes that the normal chart leaves as decoration (`!`). The music
       is the same; the player has to play more of it. */
    var encore = makeChart(true);
    var back = backing(def.bars, def.style, meter, chordsPerBar);
    var header = "@" + (def.duty == null ? 1 : def.duty) + " v" + (def.sound || 11) + " l8";
    function resumeAt(startBeat) {
      startBeat = Math.max(0, Math.min(beat - meter, Math.floor(startBeat / meter) * meter));
      var rest = evs.filter(function (e) { return e.t >= startBeat; });
      var bars = def.bars.slice(startBeat / meter * chordsPerBar);
      var b2 = backing(bars, def.style, meter, chordsPerBar);
      return { bpm: bpm, p1: melodyMML(rest, header), p2: b2.p2, tri: b2.tri, noise: b2.noise };
    }
    var music = { bpm: bpm, p1: melodyMML(evs, header), p2: back.p2, tri: back.tri, noise: back.noise };
    var mmlLen = music.p1.length + music.p2.length + music.tri.length + music.noise.length;
    if (mmlLen > 8192) throw new Error(def.id + ": MML is " + mmlLen + " characters (limit 8192)");
    return {
      id: def.id, act: def.act || 1, venue: def.venue || "hall",
      name: def.name, short: def.short, credit: def.credit, bpm: bpm,
      difficulty: def.difficulty, seconds: beat * beatSec,
      meter: meter, chordsPerBar: chordsPerBar,
      tag: def.tag || { zh: "", en: "" },
      music: music,
      resumeAt: resumeAt,
      chart: chart, encoreChart: encore, watch: watch.map(function (w) { return [w[0] * beatSec, w[1] * beatSec]; }), totalBeats: beat
    };
  }

  /* ---- 1. Twinkle, 100 bpm, 20 bars: 2 intro + 12 melody + 4 high verse + 2 outro ---- */
  var twinkle = build({
    id: "twinkle", act: 1, venue: "hall", bpm: 100, difficulty: 1, duty: 1, sound: 11,
    name: { zh: "小星星", en: "Twinkle" }, short: { zh: "小星星", en: "Twinkle" },
    credit: { zh: "法国童谣 1761", en: "French folk 1761" },
    tag: { zh: "第一课", en: "First lesson" },
    watch: [[31.5, 36]],
    bars: ["C", "G", "C", "C", "F", "C", "G", "G", "G", "G", "C", "C", "F", "C",
           "C", "C", "F", "C", "G", "C"],
    style: { p2: "sparse", tri: "soft", noise: "soft", p2vol: 6, trivol: 11, loud: 4 },
    events: [
      "r:4 r:4",
      "c4:1 c4:1 g4:1 g4:1 a4:1 a4:1 g4:1.5~ r:0.5",
      "f4:1 f4:1 e4:1 e4:1 d4:1 d4:1 c4:1.5~ r:0.5",
      "g4:1 g4:1 f4:1 f4:1 e4:1 e4:1 d4:1.5~ r:0.5",
      "g4:1 g4:1 f4:1 f4:1 e4:1 e4:1 d4:1.5~ r:0.5",
      "c4:1 c4:1 g4:1 g4:1 a4:1 a4:1 g4:1.5~ r:0.5",
      "f4:1 f4:1 e4:1 e4:1 d4:1 d4:1 c4:1.5~ r:0.5",
      "c5:1 c5:1 g4:1 g4:1 a4:1 a4:1 g4:1.5~ r:0.5",
      "f4:1 f4:1 e4:1 e4:1 d4:1 d4:1 c4:1.5~ r:0.5",
      "c4:1! e4:1! g4:2! c5:4!"
    ].join(" ")
  });

  /* ---- 2. Ode to Joy, 112 bpm, 32 bars: theme, B section, theme again ---- */
  var ode = build({
    id: "ode", act: 1, venue: "hall", bpm: 112, difficulty: 3, duty: 2, sound: 12,
    name: { zh: "欢乐颂", en: "Ode to Joy" }, short: { zh: "欢乐颂", en: "Ode" },
    credit: { zh: "贝多芬 1824", en: "Beethoven 1824" },
    tag: { zh: "长音", en: "Holds" },
    watch: [[71.5, 76], [103.5, 108]],
    bars: ["C", "G",
           "C", "G", "C", "G", "Am", "C",
           "C", "G", "C", "G", "C", "G", "Am", "C",
           "G", "C", "G", "C",
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
      "d4:1 d4:1 e4:1 c4:1",
      "d4:1 e4:1 f4:1 e4:1",
      "d4:1 e4:1 f4:1 e4:1",
      "c4:1 d4:1 g3:1 e4:1",
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

  /* ---- 3. Greensleeves, 96 bpm, 28 bars: A A' B coda; the first chime notes ---- */
  var green = build({
    id: "greensleeves", act: 1, venue: "garden", bpm: 96, difficulty: 3, duty: 1, sound: 11,
    name: { zh: "绿袖子", en: "Greensleeves" }, short: { zh: "绿袖子", en: "Greensleeves" },
    credit: { zh: "英国民谣 16 世纪", en: "English folk, 16th c." },
    tag: { zh: "新键 B", en: "New key B" },
    watch: [[72, 76], [104, 108]],
    bars: ["Am", "Am",
           "Am", "C", "G", "Am", "Am", "C", "G", "Am",
           "C", "G", "Em", "Am", "C", "G", "Em", "Am",
           "C", "G", "Am", "C", "Am", "C", "G", "Am",
           "C", "Am"],
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
      "a3:4",
      "c4:2 e4:1 g4:1",
      "e4:2 d4:1 c4:1",
      "b3:2 a3:1 b3:1",
      "c4:4",
      "a3:2 c4:1 d4:1",
      "e4:2 g4:1^ e4:1",
      "d4:2 c4:1 b3:1",
      "a3:4",
      "e4:1.5 d4:0.5 c4:2",
      "a3:4"
    ].join(" ")
  });

  /* ---- 4. Canon, 108 bpm, 36 bars: the act-one finale, now with the real harmony ---- */
  var canon = build({
    id: "canon", act: 1, venue: "hall", bpm: 108, difficulty: 3, duty: 2, sound: 12,
    name: { zh: "卡农", en: "Canon" }, short: { zh: "卡农", en: "Canon" },
    credit: { zh: "帕赫贝尔 约 1680", en: "Pachelbel c. 1680" },
    tag: { zh: "第二声部", en: "Second voice" },
    watch: [[56, 60], [88, 92]],
    chordsPerBar: 2,
    bars: ["D", "A", "D", "A"].concat(
      repeatChords(["D", "A", "Bm", "F#m", "G", "D", "G", "A"], 8),
      ["D", "A", "D", "A"]),
    style: { p2: "cascade", tri: "bass", noise: "march", p2vol: 7, trivol: 11, loud: 5 },
    events: [
      "r:4 r:4",
      "f+5:2 e5:2 d5:2 c+5:2 b4:2 a4:2 b4:2 c+5:2",
      "f+5:2^ e5:2 d5:2 c+5:2 b4:2 a4:2 b4:2 c+5:2",
      "f+5:1 f+5:1 e5:1 e5:1 d5:1 d5:1 c+5:1 c+5:1 b4:1 b4:1 a4:1 a4:1 b4:1 b4:1 c+5:1 c+5:1",
      "f+5:0.5 e5:0.5! d5:0.5 e5:0.5! c+5:0.5 b4:0.5! a4:0.5 b4:0.5!",
      "b4:0.5 d5:0.5! f+5:0.5 d5:0.5! c+5:0.5 a4:0.5! f+4:0.5 a4:0.5!",
      "b4:0.5 d5:0.5! g5:0.5 d5:0.5! a4:0.5 f+4:0.5! d4:0.5 f+4:0.5!",
      "g4:0.5 b4:0.5! d5:0.5 b4:0.5! a4:0.5 c+5:0.5! e5:0.5 c+5:0.5!",
      "f+5:2^ e5:2 d5:2^ c+5:2 b4:2^ a4:2 b4:2^ c+5:2",
      "f+5:1 f+5:1! e5:1 e5:1! d5:1 d5:1! c+5:1 c+5:1! b4:1 b4:1! a4:1 a4:1! b4:1 b4:1! c+5:1 c+5:1!",
      "f+5:0.5 e5:0.5! d5:0.5! e5:0.5! c+5:0.5 b4:0.5! a4:0.5! b4:0.5!",
      "b4:0.5 d5:0.5! f+5:0.5! d5:0.5! c+5:0.5 a4:0.5! f+4:0.5! a4:0.5!",
      "b4:0.5 d5:0.5! g5:0.5! d5:0.5! a4:0.5 f+4:0.5! d4:0.5! f+4:0.5!",
      "g4:0.5 b4:0.5! d5:0.5! b4:0.5! a4:0.5 c+5:0.5! e5:0.5! c+5:0.5!",
      "f+5:2 e5:2 d5:2 c+5:2 b4:2 a4:2 d5:4!",
      "r:4 r:4"
    ].join(" ")
  });

  /* ---- 5. Mountain King, 144 bpm, 42 bars: the throne-room test ---- */
  var mountain = build({
    id: "mountain", act: 2, venue: "throne", bpm: 144, difficulty: 4, duty: 1, sound: 12,
    name: { zh: "山魔王的宫殿", en: "Mountain King" }, short: { zh: "山魔王", en: "Mountain" },
    credit: { zh: "格里格 1875", en: "Grieg 1875" },
    tag: { zh: "加速", en: "Accelerando" },
    watch: [[104, 112], [144, 148]],
    bars: ["Bm", "Bm",
           "Bm", "Bm", "Bm", "Bm", "A", "A", "Bm", "Bm",
           "Bm", "Bm", "Bm", "Bm", "A", "A", "Bm", "Bm",
           "Bm", "Bm", "G", "G", "D", "D", "A", "Bm",
           "Bm", "Bm",
           "Bm", "Bm", "Bm", "Bm", "G", "G", "A", "A",
           "Bm", "Bm", "A", "A", "Bm", "Bm"],
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
      "b3:1! d4:1! f+4:2! b3:4!",
      /* D: the full court, octaves doubled, then the theme returns */
      "b4:1 d5:1 e5:1 f+5:1^", "f+5:1 e5:1 d5:1 b4:1",
      "b4:1 d5:1 e5:1 f+5:1^", "f+5:1 e5:1 d5:1 b4:1",
      "g4:1 b4:1 d5:1 g5:1^", "g5:1 f+5:1 e5:1 d5:1",
      "a4:1 c+5:1 e5:1 a5:1^", "a5:1 e5:1 c+5:1 a4:1",
      "b4:1 d5:1 e5:1 f+5:1^", "f+5:1 e5:1 d5:1 b4:1",
      "a4:1 c+5:1 d5:1 e5:1^", "e5:1 d5:1 c+5:1 a4:1",
      "b3:1! d4:1! f+4:2! b3:4!"
    ].join(" ")
  });

  /* ---- 6. Turkish March, 132 bpm, 40 bars: A B A C A coda, close to the real rondo ---- */
  var turkish = build({
    id: "turkish", act: 2, venue: "throne", bpm: 132, difficulty: 4, duty: 2, sound: 12,
    name: { zh: "土耳其进行曲", en: "Turkish March" }, short: { zh: "土耳其", en: "Turkish" },
    credit: { zh: "莫扎特 1783", en: "Mozart 1783" },
    tag: { zh: "八分音符", en: "Eighths" },
    watch: [[32, 36], [88, 92], [120, 124]],
    bars: ["Am", "E",
           "Am", "E", "Am", "Am", "E", "Am",
           "C", "G", "Dm", "G", "C", "C", "Dm", "C",
           "Am", "E", "Am", "Am", "E", "Am",
           "A", "E", "A", "A", "F#m", "F#m", "D", "E",
           "Am", "E", "Am", "Am", "E", "Am",
           "Am", "Am", "Dm", "Am"],
    style: { p2: "clock", tri: "march", noise: "fanfare", p2vol: 7, trivol: 11, loud: 5 },
    events: [
      "r:4 r:4",
      /* A: the real opening turn, with the rests and the D# */
      "b3:0.5 a3:0.5! g+3:0.5 a3:0.5! c4:0.5 d4:0.5! c4:0.5 b3:0.5!",
      "c4:0.5 e4:0.5! f4:0.5 e4:0.5! d+4:0.5 e4:0.5! b3:0.5 a3:0.5!",
      "g+3:0.5 a3:0.5! b3:0.5 a3:0.5! g+3:0.5 a3:0.5! c4:0.5 a3:0.5!",
      "c4:0.5 b3:0.5! a3:0.5 g3:0.5! a3:0.5 b3:0.5! a3:0.5 g3:0.5!",
      "e4:0.5 d4:0.5! c4:0.5 b3:0.5! a3:1 e3:1!",
      "a3:1 c4:1! e4:2",
      /* B: the C-major march, octaves in the left hand, Janissary chimes */
      "c5:0.5^ g4:0.5 c5:0.5 g4:0.5 e5:0.5 c5:0.5 e5:0.5 c5:0.5",
      "g5:0.5 e5:0.5 g5:0.5 e5:0.5 c5:1 g4:1",
      "d5:0.5^ a4:0.5 d5:0.5 a4:0.5 f5:0.5 d5:0.5 f5:0.5 d5:0.5",
      "a5:0.5 f5:0.5 a5:0.5 f5:0.5 d5:1 g4:1",
      "e5:0.5^ c5:0.5 e5:0.5 c5:0.5 g5:0.5 e5:0.5 g5:0.5 e5:0.5",
      "c6:1 g5:1 e5:1 c5:1",
      "d5:0.5^ f5:0.5 a5:0.5 f5:0.5 d5:0.5 f5:0.5 a5:0.5 f5:0.5",
      "c5:1 e5:1 g5:1 c5:1",
      /* A again, lightly varied */
      "b3:0.5^ a3:0.5! g+3:0.5 a3:0.5! c4:0.5 d4:0.5! c4:0.5 b3:0.5!",
      "c4:0.5 e4:0.5! f4:0.5 e4:0.5! d+4:0.5 e4:0.5! b3:0.5 a3:0.5!",
      "g+3:0.5 a3:0.5! b3:0.5 a3:0.5! g+3:0.5 a3:0.5! c4:0.5 a3:0.5!",
      "c4:0.5^ b3:0.5! a3:0.5 g3:0.5! a3:0.5 b3:0.5! a3:0.5 g3:0.5!",
      "e4:0.5 d4:0.5! c4:0.5 b3:0.5! a3:1 e3:1!",
      "a3:1 c4:1! e4:2",
      /* C: A major, the octave section */
      "a4:0.5 b4:0.5 c+5:1 a4:0.5 b4:0.5 c+5:0.5 b4:0.5",
      "a4:0.5 g+4:0.5 f+4:0.5 g+4:0.5 a4:0.5 b4:0.5 g+4:0.5 e4:0.5",
      "a4:0.5 b4:0.5 c+5:1 a4:0.5 b4:0.5 c+5:0.5 b4:0.5",
      "a4:0.5 g+4:0.5 f+4:0.5 b4:0.5 g+4:0.5 e4:0.5 a4:1",
      "c+5:0.5 d5:0.5 c+5:0.5 b4:0.5 a4:0.5 b4:0.5 a4:0.5 g+4:0.5",
      "f+4:0.5 a4:0.5 g+4:0.5 f+4:0.5 e+4:0.5 f+4:0.5 g+4:0.5 e+4:0.5",
      "f+4:0.5 g+4:0.5 a4:0.5 b4:0.5 c+5:1 a4:1",
      "b4:1 g+4:1 e4:1 a4:1",
      /* A up an octave, the last statement */
      "b4:0.5 a4:0.5! g+4:0.5 a4:0.5! c5:0.5 d5:0.5! c5:0.5 b4:0.5!",
      "c5:0.5 e5:0.5! f5:0.5 e5:0.5! d+5:0.5 e5:0.5! b4:0.5 a4:0.5!",
      "g+4:0.5 a4:0.5! b4:0.5 a4:0.5! g+4:0.5 a4:0.5! c5:0.5 a4:0.5!",
      "c5:0.5 b4:0.5! a4:0.5 g4:0.5! a4:0.5 b4:0.5! a4:0.5 g4:0.5!",
      "e5:0.5 d5:0.5! c5:0.5 b4:0.5! a4:1 e4:1!",
      "a4:1 c5:1! e5:2",
      /* Coda */
      "a4:0.5 g4:0.5 f4:0.5 e4:0.5 d4:0.5 e4:0.5 f4:0.5 g4:0.5",
      "a4:0.5 b4:0.5 c5:0.5 b4:0.5 a4:0.5 g4:0.5 f4:0.5 e4:0.5",
      "d4:0.5 e4:0.5 f4:0.5 g4:0.5 a4:1 b4:1",
      "a4:4!"
    ].join(" ")
  });

  /* ---- 7. Swan Lake, 88 bpm, 32 bars: long holds under the king's eye ---- */
  var swan = build({
    id: "swan", act: 2, venue: "moon", bpm: 88, difficulty: 3, duty: 1, sound: 11,
    name: { zh: "天鹅湖", en: "Swan Lake" }, short: { zh: "天鹅湖", en: "Swan Lake" },
    credit: { zh: "柴可夫斯基 1876", en: "Tchaikovsky 1876" },
    tag: { zh: "长音与注视", en: "Holds & eyes" },
    watch: [[40, 46], [72, 76], [104, 110]],
    bars: ["Bm", "Em",
           "Bm", "Em", "Bm", "F#m", "D", "Em", "F#m", "Bm",
           "Bm", "Em", "Bm", "F#m", "D", "Em", "F#m", "Bm",
           "Bm", "Em",
           "D", "G", "A", "D", "D", "D",
           "Bm", "Em", "Bm", "F#m",
           "Bm", "Bm"],
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
      "b4:4",
      "r:4 b3:4",
      /* the D-major second theme: wider, slower, then back to B minor */
      "d5:2 f+5:1 a5:1",
      "g5:2 f+5:2",
      "e5:2 d5:1 c+5:1",
      "d5:4",
      "a4:2 d5:1 f+5:1",
      "d5:4",
      "b4:2 e5:1 f+5:1",
      "g5:2^ f+5:1 e5:1",
      "d5:2 c+5:1 b4:1",
      "c+5:2 b4:2~",
      "b4:4! r:4"
    ].join(" ")
  });

  /* ---- 8. Hungarian Dance, 152 bpm, 40 bars: the Friska and a coda ---- */
  var hungarian = build({
    id: "hungarian", act: 2, venue: "throne", bpm: 152, difficulty: 4, duty: 1, sound: 12,
    name: { zh: "匈牙利舞曲", en: "Hungarian Dance" }, short: { zh: "匈牙利", en: "Hungarian" },
    credit: { zh: "勃拉姆斯 1869", en: "Brahms 1869" },
    tag: { zh: "最快", en: "Fastest" },
    watch: [[48, 52], [92, 96], [144, 148]],
    bars: ["Am", "E",
           "Am", "E", "Am", "Am", "Am", "E", "Am", "Am",
           "Am", "E", "Am", "Am", "Am", "E", "Am", "Am",
           "Dm", "Am", "E", "Am",
           "Am", "E",
           "A", "A", "A", "A", "A", "A", "A", "A",
           "D", "A", "A", "A",
           "A", "E", "A", "A"],
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
      "a4:4",
      "a3:4 r:4",
      /* Friska: A major, the fast second half */
      "a4:0.5 a4:0.5 a4:0.5 a4:0.5 a4:0.5 b4:0.5 c+5:0.5 b4:0.5",
      "a4:1.5 g+4:0.5 a4:1 b4:1",
      "c+5:0.5 c+5:0.5 c+5:0.5 c+5:0.5 c+5:0.5 d5:0.5 e5:0.5 d5:0.5",
      "c+5:1.5 b4:0.5 a4:2",
      "a4:0.5^ a4:0.5 a4:0.5 a4:0.5 a4:0.5 b4:0.5^ c+5:0.5 b4:0.5",
      "a4:1.5 g+4:0.5 a4:1 b4:1",
      "c+5:0.5 c+5:0.5 c+5:0.5 c+5:0.5 c+5:0.5 d5:0.5^ e5:0.5 d5:0.5",
      "c+5:1.5 b4:0.5 a4:2",
      "e5:0.5 d5:0.5 c+5:0.5 b4:0.5 a4:1 b4:1",
      "c+5:0.5 b4:0.5 a4:0.5 g+4:0.5 a4:1 e4:1",
      "a4:1 c+5:1 e5:2",
      "a4:4",
      "a4:2 e4:2",
      "a4:1 c+5:1 e5:2",
      "a4:4!",
      "r:4"
    ].join(" ")
  });

  /* ---- 9. Für Elise, 116 bpm, 36 bars: the night escape, with the C section ---- */
  var elise = build({
    id: "elise", act: 3, venue: "night", bpm: 116, difficulty: 3, duty: 2, sound: 12,
    name: { zh: "致爱丽丝", en: "Für Elise" }, short: { zh: "致爱丽丝", en: "Für Elise" },
    credit: { zh: "贝多芬 1810", en: "Beethoven 1810" },
    tag: { zh: "一支真曲", en: "A real tune" },
    watch: [[48, 52], [80, 84], [104, 108]],
    bars: ["Am", "E",
           "Am", "Am", "E", "Am", "Am", "Am", "E", "Am",
           "Am", "C", "E", "Am", "Am", "Am", "E", "Am",
           "Am", "E",
           "Am", "Am", "Am", "Am", "E", "Am",
           "Am", "Am", "E", "Am", "Am", "Am", "E", "Am",
           "Am", "Am"],
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
      "a4:4",
      "r:4 a3:4",
      /* C: the stormy episode */
      "a4:0.5 a4:0.5 a4:0.5 a4:0.5 c5:0.5 b4:0.5 a4:0.5 g+4:0.5",
      "a4:0.5 e5:0.5 e5:0.5 e5:0.5 d5:0.5 c5:0.5 b4:0.5 a4:0.5",
      "a4:0.5 a4:0.5 a4:0.5 a4:0.5 c5:0.5 b4:0.5 a4:0.5 g+4:0.5",
      "a4:0.5 e5:0.5 e5:0.5 e5:0.5 d5:0.5 c5:0.5 b4:0.5 a4:0.5",
      "c5:0.5 b4:0.5 a4:0.5 g+4:0.5 a4:0.5 b4:0.5 c5:0.5 d5:0.5",
      "e5:2 d5:1 c5:1",
      /* A returns, then the last chord */
      "e5:0.5 d+5:0.5 e5:0.5 d+5:0.5 e5:0.5 b4:0.5 d5:0.5 c5:0.5",
      "a4:2 r:0.5 c4:0.5 e4:0.5 a4:0.5",
      "b4:2 r:0.5 e4:0.5 g+4:0.5 b4:0.5",
      "c5:2 r:0.5 e4:0.5 e5:0.5 d+5:0.5",
      "e5:0.5 d+5:0.5 e5:0.5 d+5:0.5 e5:0.5 b4:0.5 d5:0.5 c5:0.5",
      "a4:2 r:0.5 c4:0.5 e4:0.5 a4:0.5",
      "b4:2 r:0.5 e4:0.5 c5:0.5 b4:0.5",
      "a4:4~",
      "a4:4",
      "r:4"
    ].join(" ")
  });

  /* ---- 10. Serenade, 90 bpm, 3/4, 36 bars: the honest song at dawn ---- */
  var serenade = build({
    id: "serenade", act: 3, venue: "dawn", bpm: 90, difficulty: 3, duty: 1, sound: 11,
    meter: 3,
    name: { zh: "小夜曲", en: "Serenade" }, short: { zh: "小夜曲", en: "Serenade" },
    credit: { zh: "舒伯特 1828", en: "Schubert 1828" },
    tag: { zh: "终曲", en: "Finale" },
    watch: [[36, 39], [60, 63], [84, 87]],
    bars: ["Dm", "A", "Dm", "A",
           "Dm", "Dm", "Dm", "Gm", "Dm", "Dm", "Dm", "A",
           "Gm", "Dm", "Dm", "A", "A", "Dm", "Dm", "A",
           "Gm", "Dm", "Gm", "Dm", "Gm", "Dm", "A", "Dm",
           "Dm", "Dm", "A", "Dm",
           "Dm", "A", "Dm", "Dm"],
    style: { p2: "waltz", tri: "oom", noise: "brush", p2vol: 5, trivol: 10, loud: 3 },
    events: [
      "r:3 r:3 r:3 r:3",
      /* the five-bar phrase: A G F | F | F E | D C Bb | A */
      "a4:1.5 g4:0.5 f4:1",
      "f4:3",
      "f4:1.5 e4:1.5",
      "d4:0.5 c4:1.5 b-3:1",
      "a3:3",
      "a4:1.5 g4:0.5 f4:1",
      "f4:3",
      "f4:1.5 e4:1.5",
      /* the answer: D C Bb | A | A C# F | E D | E F E | D | A G F | F E */
      "d4:0.5 c4:1.5 b-3:1",
      "a3:3",
      "a3:1.5 c+4:0.5 f4:1",
      "e4:1.5 d4:1.5",
      "e4:1.5 f4:0.5 e4:1",
      "d4:3",
      "a4:1.5 g4:0.5 f4:1",
      "f4:1.5 e4:1.5",
      /* the high verse */
      "d5:1.5 c5:0.5 b-4:1",
      "a4:3",
      "g4:1.5 a4:0.5 b-4:1",
      "a4:3",
      "d5:1.5 c5:0.5 b-4:1",
      "a4:3",
      "e4:1.5 f4:0.5 e4:1",
      "d4:3",
      /* the last descent and the dawn */
      "a4:1.5 g4:0.5 f4:1",
      "f4:3",
      "f4:1.5 e4:1.5",
      "d4:3",
      "a4:2 g4:1",
      "f4:2 e4:1",
      "d4:3!",
      "r:3"
    ].join(" ")
  });

  return [twinkle, ode, green, canon, mountain, turkish, swan, hungarian, elise, serenade];
})();

if (typeof module !== "undefined" && module.exports) module.exports = { FAKE_SONGS: FAKE_SONGS };
