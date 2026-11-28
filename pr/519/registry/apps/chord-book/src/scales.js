/* 和弦大全 / Chords: the improv view's scales (即兴, version 1.4). Chord-scale theory: each chord quality has a few scales
   (modes) a player can improvise over it with, the commonest first. Every note of the chosen scale, plus every chord tone,
   is one of four kinds: the root, a chord tone (the safest to land on), a tension (colour you can hold) and an avoid note
   (a half step over a chord tone where it clashes, or the 3 over a sus4: play it in passing, do not hold it). The kinds
   are written by hand per
   chord and scale, not derived from one rule, because the textbook exceptions (b9 over a dominant) matter.
   With a key (the chord opened from a progression) the default is the first scale whose every note lies in that key or
   in the chord, so Em7 in C major opens on Phrygian. Pure: no DOM, no PAD. MIT License. Copyright (c) 2026 Haowei Wu. */
var Scales = (function () {
  "use strict";
  function mod12(n) { return ((n % 12) + 12) % 12; }

  /* iv: semitones above the root; lab: how each is written when it is not one of the chord's own tones */
  var S = {
    ionian:     { zh: "Ionian（大调）", en: "Ionian (major)", iv: [0, 2, 4, 5, 7, 9, 11], lab: ["R", "9", "3", "11", "5", "13", "7"],
      why: { zh: "大调本身，最稳的选择。", en: "The major scale itself, the safe choice." } },
    lydian:     { zh: "Lydian", en: "Lydian", iv: [0, 2, 4, 6, 7, 9, 11], lab: ["R", "9", "3", "#11", "5", "13", "7"],
      why: { zh: "大调把 11 升成 #11，听着更亮、更飘。", en: "Major with 11 raised to #11: brighter and floating." } },
    mixolydian: { zh: "Mixolydian", en: "Mixolydian", iv: [0, 2, 4, 5, 7, 9, 10], lab: ["R", "9", "3", "11", "5", "13", "b7"],
      why: { zh: "大调把 7 降成 b7，属七和弦自己的音阶。", en: "Major with a b7, the dominant chord's own scale." } },
    lyddom:     { zh: "Lydian dominant", en: "Lydian dominant", iv: [0, 2, 4, 6, 7, 9, 10], lab: ["R", "9", "3", "#11", "5", "13", "b7"],
      why: { zh: "Mixolydian 把 11 升成 #11，听着更开阔。", en: "Mixolydian with #11: a wider sound." } },
    altered:    { zh: "Altered（变化音阶）", en: "Altered", iv: [0, 1, 3, 4, 6, 8, 10], lab: ["R", "b9", "#9", "3", "#11", "b13", "b7"],
      why: { zh: "除了 R、3、b7，每个延伸音都变过。张力最大，适合马上要回主和弦的属七。", en: "Every tension altered. The tensest sound, for a 7 chord about to resolve." } },
    hwdim:      { zh: "半全减音阶", en: "Half-whole diminished", iv: [0, 1, 3, 4, 6, 7, 9, 10], lab: ["R", "b9", "#9", "3", "#11", "5", "13", "b7"],
      why: { zh: "半音、全音轮流，b9、#9、#11、13 都在，爵士里常用。", en: "Half step, whole step, repeat: b9, #9, #11 and 13 all at once." } },
    mixob13:    { zh: "Mixolydian b13", en: "Mixolydian b13", iv: [0, 2, 4, 5, 7, 8, 10], lab: ["R", "9", "3", "11", "5", "b13", "b7"],
      why: { zh: "Mixolydian 把 13 降成 b13，属七要去小和弦时常用。", en: "Mixolydian with b13, for a 7 chord heading to a minor chord." } },
    phrygdom:   { zh: "Phrygian dominant", en: "Phrygian dominant", iv: [0, 1, 4, 5, 7, 8, 10], lab: ["R", "b9", "3", "11", "5", "b13", "b7"],
      why: { zh: "和声小调从第五级开始，小调里 V7 的音阶，b9 和 b13 都往主和弦拉。", en: "Harmonic minor from its fifth: a minor key's V7. b9 and b13 pull home." } },
    dorian:     { zh: "Dorian", en: "Dorian", iv: [0, 2, 3, 5, 7, 9, 10], lab: ["R", "9", "b3", "11", "5", "13", "b7"],
      why: { zh: "小调里最亮的一种，13 让它没那么伤感。放克和爵士的小和弦多用它。", en: "The brightest minor: the 13 lifts it. Funk and jazz use it on minor chords." } },
    aeolian:    { zh: "Aeolian（自然小调）", en: "Aeolian (natural minor)", iv: [0, 2, 3, 5, 7, 8, 10], lab: ["R", "9", "b3", "11", "5", "b13", "b7"],
      why: { zh: "自然小调，比 Dorian 忧伤。", en: "Natural minor, sadder than Dorian." } },
    phrygian:   { zh: "Phrygian", en: "Phrygian", iv: [0, 1, 3, 5, 7, 8, 10], lab: ["R", "b9", "b3", "11", "5", "b13", "b7"],
      why: { zh: "b9 带一点西班牙味。", en: "The b9 gives it a Spanish colour." } },
    locrian:    { zh: "Locrian", en: "Locrian", iv: [0, 1, 3, 5, 6, 8, 10], lab: ["R", "b9", "b3", "11", "b5", "b13", "b7"],
      why: { zh: "减三和弦的 Locrian（大调 vii°），半减七也用它。", en: "Locrian, the scale of the major key's vii°, also the half-diminished chord's." } },
    locrian2:   { zh: "Locrian #2", en: "Locrian #2", iv: [0, 2, 3, 5, 6, 8, 10], lab: ["R", "9", "b3", "11", "b5", "b13", "b7"],
      why: { zh: "Locrian 把 b9 换成 9，更顺耳。", en: "Locrian with 9 instead of b9: smoother." } },
    whdim:      { zh: "全半减音阶", en: "Whole-half diminished", iv: [0, 2, 3, 5, 6, 8, 9, 11], lab: ["R", "9", "b3", "11", "b5", "b13", "13", "7"],
      why: { zh: "全音、半音轮流，减七和弦的音阶，每个延伸音都能用。", en: "Whole step, half step, repeat: the dim 7's scale, every tension works." } },
    wholetone:  { zh: "全音音阶", en: "Whole tone", iv: [0, 2, 4, 6, 8, 10], lab: ["R", "9", "3", "#11", "#5", "b7"],
      why: { zh: "六个音全隔全音，增三和弦的音阶，听着像在做梦。", en: "Six notes, all whole steps: the augmented chord's dreamy scale." } },
    melmin:     { zh: "旋律小调", en: "Melodic minor", iv: [0, 2, 3, 5, 7, 9, 11], lab: ["R", "9", "b3", "11", "5", "13", "7"],
      why: { zh: "小调配大七，小大七和弦自己的音阶。", en: "Minor with a major 7: the minor-major 7's own scale." } },
    harmmin:    { zh: "和声小调", en: "Harmonic minor", iv: [0, 2, 3, 5, 7, 8, 11], lab: ["R", "9", "b3", "11", "5", "b13", "7"],
      why: { zh: "b13 到 7 隔了一个半全音，有中东味。", en: "The wide gap from b13 to 7 sounds Middle Eastern." } },
    majpent:    { zh: "大调五声", en: "Major pentatonic", iv: [0, 2, 4, 7, 9], lab: ["R", "9", "3", "5", "13"],
      why: { zh: "大调去掉 4 和 7，五个音都不撞，最不容易弹错；maj7 上再把 7 作为和弦音补回来。", en: "Major without 4 and 7: nothing clashes, the hardest to get wrong; on a maj7 the 7 comes back as a chord tone." } },
    minpent:    { zh: "小调五声", en: "Minor pentatonic", iv: [0, 3, 5, 7, 10], lab: ["R", "b3", "11", "5", "b7"],
      why: { zh: "五个音都不撞，摇滚和布鲁斯的即兴多从这里开始。", en: "Five notes, nothing clashes. Rock and blues solos start here." } },
    blues:      { zh: "布鲁斯音阶", en: "Blues scale", iv: [0, 3, 5, 6, 7, 10], lab: ["R", "b3", "11", "b5", "5", "b7"],
      why: { zh: "小调五声加 b5 蓝调音。在属七上 b3 磨着 3，就是布鲁斯味。", en: "Minor pentatonic plus the blue b5. Over a 7 chord, b3 rubbing on 3 is the blues." } }
  };

  /* per quality: [scale, avoid notes in semitones above the root], the commonest first (docs/design/chord-book.md 14) */
  var FOR = {
    "":    [["ionian", [5]], ["lydian"], ["majpent"], ["mixolydian", [5]]],
    "m":   [["aeolian", [8]], ["dorian"], ["phrygian", [1, 8]], ["minpent"]],
    "dim": [["locrian", [1]], ["whdim"]],
    "aug": [["wholetone"]],
    "5":   [["minpent"], ["blues"], ["majpent"]],
    "7":   [["mixolydian", [5]], ["blues"], ["lyddom"], ["altered"], ["hwdim"], ["mixob13", [5]], ["phrygdom", [5]]],
    "maj7": [["ionian", [5]], ["lydian"], ["majpent"]],
    "m7":  [["dorian"], ["aeolian", [8]], ["phrygian", [1, 8]], ["minpent"], ["blues"]],
    "m7b5": [["locrian", [1]], ["locrian2"]],
    "dim7": [["whdim"]],
    "mmaj7": [["melmin"], ["harmmin", [8]]],
    "sus2": [["majpent"], ["mixolydian"], ["ionian"]],
    "sus4": [["mixolydian", [4]], ["ionian", [4]], ["minpent"]],
    "7sus4": [["mixolydian", [4]], ["dorian"], ["minpent"]],
    "add9": [["ionian", [5]], ["lydian"], ["majpent"]],
    "6":   [["ionian", [5]], ["lydian"], ["majpent"]],
    "m6":  [["dorian"], ["melmin"]],
    "9":   [["mixolydian", [5]], ["lyddom"], ["mixob13", [5]]],
    "m9":  [["dorian"], ["aeolian", [8]], ["minpent"]],
    "maj9": [["ionian", [5]], ["lydian"], ["majpent"]],
    "13":  [["mixolydian", [5]], ["lyddom"], ["blues"]],
    "7#9": [["altered"], ["hwdim"], ["mixolydian"]],
    "6/9": [["ionian", [5]], ["lydian"], ["majpent"]],
    "m11": [["dorian"], ["aeolian", [8]], ["minpent"]],
    "add11": [["ionian"], ["mixolydian"]]
  };
  var MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
  /* the labs the line reads after the chord's run: a natural 9 always (1.4.2). A b9, #9, 13 or b13 joins it only when
     the chord itself owns one of those colours (13, 7#9, later b9...); then the whole altered/13 group reads after the
     run. In the existing 19 such notes are scale tensions and keep their old pitch order. An 11 sounds between the 3rd
     and the 5th and stays in the run's pitch order. */
  var UPPER = { "9": true, "b9": true, "#9": true, "13": true, "b13": true };

  /* one option: the scale's notes and the chord's tones together, low to high, each {iv, pc, lab, kind} with kind
     "r" root, "c" chord tone, "t" tension, "a" avoid. A chord tone keeps the chord's own name (the 6 of a 6 chord). */
  function option(c, pair) {
    var Q = Chords.qual(c.q), sc = S[pair[0]], avoid = pair[1] || [], by = {};
    sc.iv.forEach(function (v, i) {
      by[v] = { iv: v, lab: sc.lab[i], kind: v === 0 ? "r" : avoid.indexOf(v) >= 0 ? "a" : "t" };
    });
    Q.iv.forEach(function (v, i) {
      by[v] = { iv: v, lab: Q.lab[i], kind: v === 0 ? "r" : "c" };
    });
    var notes = Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).map(function (v) {
      var n = by[v];
      n.pc = mod12(c.root + v);
      return n;
    });
    /* the line reads left to right. The 9 is read last (1.4.2); a b9, #9, 13 or b13 is read last only when the chord
       itself has one, so the old 19 keep their order and C13 / C7#9 put their own colour after the run. An 11 stays
       where it sounds, between the 3rd and the 5th (1.4.7). */
    var owns = false;
    Q.lab.forEach(function (l) { if (l !== "9" && UPPER[l]) owns = true; });
    function upper(n) { return n.lab === "9" || (owns && UPPER[n.lab]); }
    var line = notes.filter(function (n) { return !upper(n); })
      .concat(notes.filter(upper).sort(function (a, b) { return a.iv - b.iv; }));
    /* the avoid notes said in words after the scale's own line: which chord tone each sits a half step over, or for a
       sus4 that the 3 would undo the suspension */
    var zh = [], en = [];
    notes.forEach(function (n) {
      if (n.kind !== "a") return;
      var under = null;
      Q.iv.forEach(function (v, i) { if (mod12(n.iv - v) === 1) under = Q.lab[i]; });
      if (under) { zh.push(n.lab + " 比 " + under + " 高半音"); en.push(n.lab + " is a half step over " + under); }
      else { zh.push(n.lab + " 会把挂留解决掉"); en.push(n.lab + " would undo the sus"); }
    });
    var why = { zh: sc.why.zh + (zh.length ? zh.join("，") + "，经过就好，别停在上面。" : ""),
      en: sc.why.en + (en.length ? " " + en.join(", ") + ": pass through, don't hold it." : "") };
    return { id: pair[0], zh: sc.zh, en: sc.en, why: why, notes: notes, line: line };
  }
  /* a chord's scales {list, def, inKey}: def is the one to show first. With ctx {key: tonic pc, minor} it is the first
     seven-note scale whose notes all lie in the key's scale or the chord (inKey true); otherwise, or when none does, 0. */
  function forChord(c, ctx) {
    var pairs = FOR[Chords.qual(c.q).id] || FOR[""], list = pairs.map(function (p) { return option(c, p); }), def = 0, inKey = false;
    if (ctx) {
      var ok = {};
      (ctx.minor ? MINOR : MAJOR).forEach(function (v) { ok[mod12(ctx.key + v)] = true; });
      Chords.tones(c).forEach(function (x) { ok[x.pc] = true; });
      for (var i = 0; i < list.length; i++) {
        var sc = S[list[i].id];
        if (sc.iv.length !== 7) continue;
        if (sc.iv.every(function (v) { return ok[mod12(c.root + v)]; })) { def = i; inKey = true; break; }
      }
    }
    return { list: list, def: def, inKey: inKey };
  }

  return { S: S, FOR: FOR, forChord: forChord };
})();
