/* 和弦大全 / Chords: chord progressions (和弦连接). A hand-written table of common progressions, each in degrees of its key
   with a short note on why it works; forChord() finds the ones a chord belongs to and spells them in that chord's key.
   Every one of the 19 qualities appears in at least one progression (tests/chord-book.test.mjs). Pure: no DOM, no PAD.
   A progression is not anyone's property; the notes are our own words. Pachelbel's canon (1680s) is public domain.
   MIT License. Copyright (c) 2026 Haowei Wu. */
var Progs = (function () {
  "use strict";
  function mod12(n) { return ((n % 12) + 12) % 12; }

  /* ch: [semitones from the key's tonic, quality id, bass in semitones from the tonic (slash chords only)];
     rn: each chord's Roman numeral; bassStep: the 0-based key degree of a slash bass, so V6 is spelled from the numeral
     itself; legend: a line under the numerals when it teaches their inversions; key: "maj" or "min" (the tonic of a
     minor key is its i) */
  var LIST = [
    { id: "pop", key: "maj", zh: "流行四和弦", en: "Pop four",
      ch: [[0, ""], [7, ""], [9, "m"], [5, ""]], rn: ["I", "V", "vi", "IV"],
      why: {
        zh: "四个都是大调自己的三和弦，相邻两个至少共用一个音，所以换得顺。V 不回 I 而去 vi，留个悬念；IV 再把耳朵推回 I，于是能一直循环。",
        en: "All four are the key's own triads, and each pair shares at least one note, so the changes are smooth. V goes to vi instead of home, which keeps you waiting; IV then leads back to I, so it loops forever."
      } },
    { id: "sad", key: "maj", zh: "从 vi 开始的四和弦", en: "Pop four from vi",
      ch: [[9, "m"], [5, ""], [0, ""], [7, ""]], rn: ["vi", "IV", "I", "V"],
      why: {
        zh: "和流行四和弦是同一组和弦，只是从小和弦 vi 开始。耳朵先把 vi 当成家，整段听着更伤感；V 最后又把它拉回 vi。",
        en: "The same four chords as the pop four, started on the minor vi. The ear takes vi as home, so it sounds sadder, and V at the end pulls back to vi."
      } },
    { id: "fifties", key: "maj", zh: "五十年代进行", en: "Fifties progression",
      ch: [[0, ""], [9, "m"], [5, ""], [7, ""]], rn: ["I", "vi", "IV", "V"],
      why: {
        zh: "I 和 vi 共用两个音，像同一个和弦换了颜色。IV、V 一级一级往上走，V 里的导音（大调第七级）离主音只差半音，所以又想回到 I 重新开始。",
        en: "I and vi share two notes, like one chord changing colour. IV and V climb step by step, and V holds the leading tone, a half step below the tonic, so it wants to start again on I."
      } },
    { id: "three", key: "maj", zh: "三个主要和弦", en: "The three primary chords",
      ch: [[0, ""], [5, ""], [7, ""], [0, ""]], rn: ["I", "IV", "V", "I"],
      why: {
        zh: "I、IV、V 三个和弦合起来正好是大调的七个音。V 带着导音，最想回家，所以 V 到 I 是最有力的结束（正格终止）。",
        en: "Together I, IV and V hold all seven notes of the major scale. V carries the leading tone and wants home most, so V to I is the strongest ending (an authentic cadence)."
      } },
    { id: "plagal", key: "maj", zh: "变格终止", en: "Plagal cadence",
      ch: [[0, ""], [5, ""], [0, ""]], rn: ["I", "IV", "I"],
      why: {
        zh: "IV 回 I 没有导音，两个和弦又共用主音，所以结束得比 V 到 I 柔和。教堂里唱的「阿门」就是这一下。",
        en: "IV back to I has no leading tone, and the two chords share the tonic, so it ends more gently than V to I. It is the sung \"Amen\" at the end of a hymn."
      } },
    { id: "circle", key: "maj", zh: "五度圈", en: "Circle of fifths",
      ch: [[0, ""], [5, ""], [11, "dim"], [4, "m"], [9, "m"], [2, "m"], [7, ""], [0, ""]],
      rn: ["I", "IV", "vii°", "iii", "vi", "ii", "V", "I"],
      why: {
        zh: "根音每次往下五度（IV 到 vii° 那一步是减五度，好留在调里），走遍大调的七个和弦再回家。每一步都是最有力的根音进行，所以听着顺理成章。vii° 是减三和弦，因为大调里它的五音比纯五度少半音。",
        en: "Each root falls a fifth (IV to vii° is a diminished fifth, to stay in the key), through all seven chords of the key and home. Every step is the strongest root move there is, so it sounds inevitable. vii° is diminished because, in the key, its fifth is a half step short."
      } },
    { id: "canon", key: "maj", zh: "卡农进行", en: "Canon progression",
      ch: [[0, ""], [7, "", 11], [9, "m"], [4, "m", 7], [5, ""], [0, "", 4], [5, ""], [7, ""]],
      rn: ["I", "V6", "vi", "iii6", "IV", "I6", "IV", "V"], bassStep: [null, 6, null, 4, null, 2, null, null],
      legend: { zh: "6 = 第一转位（三音在低音），6/4 = 第二转位（五音在低音）", en: "6 = first inversion (third in the bass), 6/4 = second inversion (fifth in the bass)" },
      why: {
        zh: "低音从主音一级一级往下走（do、ti、la、sol、fa、mi），上面的和弦跟着换；斜线和弦就是为了把低音排成这一条线。这是帕赫贝尔《卡农》（17 世纪，公有领域）的骨架。",
        en: "The bass walks down the scale from the tonic (do, ti, la, sol, fa, mi) while the chords change above it; the slash chords are there to keep that line. It is the frame of Pachelbel's Canon (17th century, public domain)."
      } },
    { id: "ii-V-I", key: "maj", zh: "二五一", en: "ii–V–I",
      ch: [[2, "m7"], [7, "7"], [0, "maj7"]], rn: ["ii7", "V7", "Imaj7"],
      why: {
        zh: "根音每次往下五度。更妙的是三音和七音（引导音 guide tones）：ii7 的七音降半音成 V7 的三音，V7 的七音降半音成 Imaj7 的三音，另一个音不动。声部几乎不用走，所以爵士里到处都是。",
        en: "Each root falls a fifth. Better still, the 3rds and 7ths (guide tones): the 7th of ii7 falls a half step to the 3rd of V7, the 7th of V7 falls a half step to the 3rd of Imaj7, and the other note stays. The voices barely move, which is why jazz is full of it."
      } },
    { id: "minor-ii-V-i", key: "min", zh: "小调二五一", en: "Minor ii–V–i",
      ch: [[2, "m7b5"], [7, "7"], [0, "m"]], rn: ["iiø7", "V7", "i"],
      why: {
        zh: "小调里 ii 自然是半减七。V 借了和声小调升高的第七级，成了属七，带着导音，所以 V7 到 i 和大调一样有力，落下来却是小和弦。",
        en: "In a minor key ii is naturally half-diminished. V borrows the raised 7th of the harmonic minor and becomes a dominant 7th with a leading tone, so V7 to i is as strong as in major but lands on a minor chord."
      } },
    { id: "minor-cadence", key: "min", zh: "小调终止", en: "Minor cadence",
      ch: [[0, "m"], [5, "m"], [7, ""], [0, "m"]], rn: ["i", "iv", "V", "i"],
      why: {
        zh: "小调本来的 v 是小和弦，没有导音，回 i 的劲不够。把它换成大三和弦 V（借和声小调的升七级），才有半音往上落到主音的拉力。",
        en: "The minor key's own v is a minor chord with no leading tone, so it pulls weakly. Making it major (borrowing the harmonic minor's raised 7th) gives the half step up into the tonic."
      } },
    { id: "andalusian", key: "min", zh: "安达卢西亚终止", en: "Andalusian cadence",
      ch: [[0, "m"], [10, ""], [8, ""], [7, ""]], rn: ["i", "bVII", "bVI", "V"],
      why: {
        zh: "低音沿着小调音阶一级一级往下走（la、sol、fa、mi），最后停在大三和弦 V 上；V 的导音想回 i，所以能一圈一圈转下去。弗拉门戈常用。",
        en: "The bass steps down the minor scale (la, sol, fa, mi) and stops on a major V, whose leading tone wants i again, so it can go round and round. Flamenco lives on it."
      } },
    { id: "minor-iv", key: "maj", zh: "借来的小四级", en: "Borrowed minor iv",
      ch: [[0, ""], [5, ""], [5, "m"], [0, ""]], rn: ["I", "IV", "iv", "I"],
      why: {
        zh: "iv 是从同名小调借来的：IV 的三音降半音（C 调里 F 和弦的 A 变成 Ab），再往下半音落到 I 的五音（G）。就这一个半音下行，听着带点伤感。",
        en: "iv is borrowed from the parallel minor: the 3rd of IV drops a half step (in C, the A of F becomes Ab), then falls another half step to the 5th of I (G). That one creeping line is the bittersweet sound."
      } },
    { id: "sus", key: "maj", zh: "挂留与解决", en: "Suspensions resolving",
      ch: [[0, "sus2"], [0, "sus4"], [0, ""]], rn: ["Isus2", "Isus4", "I"],
      why: {
        zh: "挂留和弦没有三音，听不出大小，像悬在半空。挂二的二音往上、挂四的四音往下，最后都落到三音上，和弦才「落地」。",
        en: "A sus chord has no 3rd, so it is neither major nor minor and seems to hang. The 2 rises and the 4 falls, both onto the 3rd, and only then does the chord land."
      } },
    { id: "dom-sus", key: "maj", zh: "属七挂四", en: "Dominant sus",
      ch: [[7, "7sus4"], [7, "7"], [0, ""]], rn: ["V7sus4", "V7", "I"],
      why: {
        zh: "V7sus4 把导音换成了主音，属和弦的张力先压着；挂四落到三音（导音），张力出来，再解决到 I。等于解决了两次。",
        en: "V7sus4 swaps the leading tone for the tonic, holding the dominant's tension back; the 4 falls to the 3rd (the leading tone), the tension arrives, and then it resolves to I. Two resolutions in a row."
      } },
    { id: "cliche", key: "maj", zh: "半音线（大调）", en: "Line cliché (major)",
      ch: [[0, ""], [0, "aug"], [0, "6"], [0, "7"], [5, ""]], rn: ["I", "I+", "I(add6)", "I7", "IV"],
      why: {
        zh: "根音不动，只有一个声部从五音半音往上爬（C 调里 G、G#、A、Bb），一条线把四个和弦串起来；最后 Bb 落到 IV 的三音 A。常用来做过门。",
        en: "The root stays while one voice climbs from the 5th in half steps (in C: G, G#, A, Bb), threading four chords on one line; the Bb then falls to the A of IV. A favourite way into a new section."
      } },
    { id: "minor-cliche", key: "min", zh: "半音线（小调）", en: "Line cliché (minor)",
      ch: [[0, "m"], [0, "mmaj7"], [0, "m7"], [0, "m6"]], rn: ["i", "i(maj7)", "i7", "i(add6)"],
      why: {
        zh: "根音不动，一个声部 G#→G→F# 半音下行（A 小调里）；四个和弦名字变了，其实只有一个音在动。小大七那一下最紧张，很像电影里的悬疑配乐。",
        en: "The root stays while one voice falls G#-G-F# in half steps (in A minor): four chord names, one moving note. The minor-major 7th is the tense one, the sound of a film's suspense scene."
      } },
    { id: "dim-passing", key: "maj", zh: "减七经过", en: "Passing diminished",
      ch: [[0, ""], [1, "dim7"], [2, "m"], [7, ""]], rn: ["I", "#I°7", "ii", "V"],
      why: {
        zh: "#I°7 夹在 I 和 ii 中间，低音半音往上走（C、C#、D）。减七和弦全是小三度叠起来的，哪个音都想往外走半音，正好推进 ii。",
        en: "#I°7 sits between I and ii with the bass rising in half steps (C, C#, D). A diminished 7th is stacked minor thirds and every note wants to move a half step, which pushes straight into ii."
      } },
    { id: "blues", key: "maj", zh: "十二小节布鲁斯", en: "Twelve-bar blues",
      ch: [[0, "7"], [5, "7"], [0, "7"], [7, "7"], [5, "7"], [0, "7"]], rn: ["I7", "IV7", "I7", "V7", "IV7", "I7"],
      bars: [4, 2, 2, 1, 1, 2],
      why: {
        zh: "四小节 I7、两小节 IV7、两小节 I7、一小节 V7、一小节 IV7、两小节 I7。三个都是属七和弦，按规矩都该解决，布鲁斯偏不解决，这股一直绷着的劲就是它的味道。",
        en: "Four bars of I7, two of IV7, two of I7, one of V7, one of IV7 and two of I7. All three are dominant 7ths that by the rules should resolve, and the blues never lets them: that unrelieved pull is its flavour."
      } },
    { id: "power", key: "maj", zh: "强力和弦摇滚", en: "Power-chord rock",
      ch: [[0, "5"], [10, "5"], [5, "5"]], rn: ["I5", "bVII5", "IV5"],
      why: {
        zh: "强力和弦只有根音和五音，没有三音，不分大小，所以可以随便借 bVII（混合利底亚 Mixolydian 的味道）。开了失真也不会糊，摇滚的标准配置。",
        en: "A power chord is just root and 5th with no 3rd, neither major nor minor, so the bVII (a Mixolydian colour) slots right in. It stays clear under distortion, the rock standard."
      } },
    { id: "maj7-float", key: "maj", zh: "大七漂浮", en: "Floating major 7ths",
      ch: [[0, "maj7"], [5, "maj7"]], rn: ["Imaj7", "IVmaj7"],
      why: {
        zh: "两个大七和弦来回，Cmaj7 和 Fmaj7 共用 C 和 E 两个音，换的时候几乎不动；大七度那点不协和让它一直有点飘，不想落地。",
        en: "Two major 7ths back and forth: Cmaj7 and Fmaj7 share C and E, so little moves, and the slight rub of the major 7th keeps it floating instead of landing."
      } },
    { id: "add9-pop", key: "maj", zh: "加了颜色的流行四和弦", en: "Pop four with colour",
      ch: [[0, "add9"], [7, ""], [9, "m7"], [5, "add9"]], rn: ["Iadd9", "V", "vi7", "IVadd9"],
      why: {
        zh: "就是流行四和弦，只在 I、IV 上加九音、vi 上加七音。这些音都在大调音阶里，加了不改和弦的作用，只让声音更亮、更开阔。",
        en: "The pop four again with a 9th on I and IV and a 7th on vi. Those notes are all in the key, so they change no chord's job, only make the sound brighter and more open."
      } },
    { id: "funk9", key: "maj", zh: "九和弦律动", en: "Ninth-chord groove",
      ch: [[0, "9"], [5, "9"]], rn: ["I9", "IV9"],
      why: {
        zh: "九和弦是属七再加九音，不急着解决，只想律动。I9 和 IV9 之间好几个音只移半音（C 调里 E 到 Eb、Bb 到 A），所以放克常常一整首就靠这两个。",
        en: "A 9th chord is a dominant 7th plus the 9th: in no hurry to resolve, made to groove. Several notes move only a half step between I9 and IV9 (in C, E to Eb and Bb to A), so a funk tune can run on these two alone."
      } },
    { id: "minor9", key: "min", zh: "小九和弦", en: "Minor ninths",
      ch: [[0, "m9"], [5, "m9"]], rn: ["im9", "ivm9"],
      why: {
        zh: "九音给小和弦加了一点亮色，听着柔。根音往上四度是最常见的进行之一，但两个都是小和弦，没有 V 到 I 那种结束感，适合一直反复，neo-soul 常用。",
        en: "The 9th brightens a minor chord and softens it. Up a fourth is one of the commonest root moves, but with two minor chords there is no V-to-I sense of ending, so it can repeat for ever, as neo-soul does."
      } }
  ];

  function bassOk(slot, c, strict) {
    if (!strict) return true;
    if (c.bass === null || c.bass === undefined) return slot[2] === undefined;
    return slot[2] !== undefined && mod12(slot[2] - slot[0]) === mod12(c.bass - c.root);
  }
  /* the slot a chord takes in a progression: its tonic slot if it has one there, else the first that fits */
  function find(p, c, strict) {
    var first = -1;
    for (var i = 0; i < p.ch.length; i++) {
      if (p.ch[i][1] !== c.q || !bassOk(p.ch[i], c, strict)) continue;
      if (p.ch[i][0] === 0) return i;
      if (first < 0) first = i;
    }
    return first;
  }

  /* spelling in the key: the tonic's name from the usual key signature, then each chord's letter counted up the scale from
     its Roman numeral (so #I°7 in G is G#°7, not Ab°7); the app's fixed names if that would need a double sharp or flat */
  var LET = "CDEFGAB", NAT = [0, 2, 4, 5, 7, 9, 11];
  var MAJ_KEY = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var MIN_KEY = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  var DEG = ["I", "II", "III", "IV", "V", "VI", "VII"];
  function stepOf(rn) { return DEG.indexOf(/^[b#]?(VII|VI|IV|V|III|II|I)/i.exec(rn)[1].toUpperCase()); }
  function letter(tonic, step, pc) {
    var L = (LET.indexOf(tonic.charAt(0)) + step) % 7, acc = mod12(pc - NAT[L]);
    return acc === 0 ? LET.charAt(L) : acc === 1 ? LET.charAt(L) + "#" : acc === 11 ? LET.charAt(L) + "b" : null;
  }
  var ALT = { 1: ["C#", "Db"], 3: ["D#", "Eb"], 6: ["F#", "Gb"], 8: ["G#", "Ab"], 10: ["A#", "Bb"] };
  function keyName(key, mode) { return (mode === "min" ? MIN_KEY : MAJ_KEY)[key]; }
  /* the key's name: the usual one, unless the other spelling is the one that keeps the chord you looked up spelled as
     you looked it up (Ebm as vi is in Gb major, not F#) */
  function tonicFor(p, key, at, c) {
    var usual = keyName(key, p.key), want = Chords.NAMES[c.root], step = stepOf(p.rn[at]);
    if (letter(usual, step, c.root) === want || !ALT[key]) return usual;
    var other = ALT[key][0] === usual ? ALT[key][1] : ALT[key][0];
    return letter(other, step, c.root) === want ? other : usual;
  }
  function spell(p, tonic, i, c) {
    var rn = p.rn[i];
    var root = letter(tonic, stepOf(rn), c.root) || Chords.NAMES[c.root];
    var out = root + Chords.name({ root: 0, q: c.q, bass: null }).slice(1);
    if (c.bass !== null) {
      var step = p.bassStep && p.bassStep[i] != null ? p.bassStep[i] : null;
      out += "/" + ((step !== null && letter(tonic, step, c.bass)) || Chords.NAMES[c.bass]);
    }
    return out;
  }

  /* the progressions a chord appears in, each spelled in the key that puts the chord in its slot (find). A slash chord
     takes slots with the same bass; failing that, any slot of its quality, listed after the exact ones. Then
     progressions where the chord is the tonic come first, otherwise the table's order. */
  function forChord(c) {
    var out = [];
    LIST.forEach(function (p, n) {
      var at = find(p, c, true), exact = true;
      if (at < 0 && c.bass !== null && c.bass !== undefined) { at = find(p, c, false); exact = false; }
      if (at < 0) return;
      var key = mod12(c.root - p.ch[at][0]);
      var chords = p.ch.map(function (s) {
        return { root: mod12(key + s[0]), q: s[1], bass: s[2] === undefined ? null : mod12(key + s[2]) };
      });
      var tonic = tonicFor(p, key, at, c);
      out.push({
        p: p, key: key, keyName: tonic, at: at, n: n, exact: exact, chords: chords,
        names: chords.map(function (x, i) { return spell(p, tonic, i, x); })
      });
    });
    out.sort(function (a, b) {
      return (a.exact ? 0 : 1) - (b.exact ? 0 : 1) || (a.p.ch[a.at][0] === 0 ? 0 : 1) - (b.p.ch[b.at][0] === 0 ? 0 : 1) || a.n - b.n;
    });
    return out;
  }
  /* the voicing to play for a chord in a progression: among its 8 commonest, the one nearest the fret position the player
     is at, so the hand stays in one place (the commonest wins a tie) */
  function nearVoicing(list, pos) {
    var best = null, d = 99;
    list.slice(0, 8).forEach(function (v) { var e = Math.abs(v.pos - pos); if (e < d) { d = e; best = v; } });
    return best;
  }

  return { LIST: LIST, forChord: forChord, nearVoicing: nearVoicing, keyName: keyName };
})();
