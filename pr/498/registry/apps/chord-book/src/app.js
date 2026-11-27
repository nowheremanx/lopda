/* 和弦大全 / Chords: the screens. The main screen shows one chord's voicings one at a time (box or neck); the picker
   chooses a root, a quality and a bass; the finder names the chord your fingers make. docs/design/chord-book.md 3-8.
   MIT License. Copyright (c) 2026 Haowei Wu. */
(function () {
  "use strict";
  var EN = PAD.lang === "en";
  var T = EN ? {
    strum: "Strum", arp: "Arpeggio", prev: "Prev", next: "Next", common: "Common", pos: "Position", box: "Box", neck: "Neck",
    open: "open", fret: "fret {n}", of: "{i} / {n}", back: "Back", ok: "OK", pick: "Pick a chord", find: "Find",
    search: "C#m7b5, D/F#, Bbmaj7", unknown: "Unknown chord", root: "Root", bass: "Bass", none: "none", recent: "Recent",
    byFrets: "Find by frets", sound: "Sound", vol: ["Off", "Low", "Mid"], see: "Show chord",
    listen: "Play", noChord: "Not a common chord", also: "also ", posLabel: "fret {n}",
    bassLab: "bass", held: "hold for arpeggio", order: "Shape order", orders: ["Common first", "By fret"]
  } : {
    strum: "扫弦", arp: "分解", prev: "上一个", next: "下一个", common: "常用", pos: "把位", box: "框图", neck: "指板",
    open: "开放", fret: "第 {n} 把位", of: "{i} / {n}", back: "返回", ok: "好", pick: "选和弦", find: "找",
    search: "C#m7b5、D/F#、Bbmaj7", unknown: "认不出这个和弦", root: "根音", bass: "低音（斜线和弦）", none: "无", recent: "最近看过",
    byFrets: "在指板上点出和弦", sound: "声音", vol: ["关", "小", "中"], see: "看这个和弦",
    listen: "听", noChord: "不是常见和弦", also: "也读作 ", posLabel: "{n} 品起",
    bassLab: "低音", held: "长按是分解", order: "按法顺序", orders: ["常用在前", "按把位"]
  };
  function t(k, vars) { var s = T[k]; if (vars) for (var v in vars) s = s.replace("{" + v + "}", vars[v]); return s; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function sfx(n) { try { PAD.sfx(n); } catch (e) {} }

  /* ---------------- state and save (section 5) ---------------- */
  var set = { v: 1, cur: { root: 0, q: "", bass: null, i: 0 }, sort: "common", view: "box", vol: 2, recent: [] };
  var temp = null;          /* a voicing from the finder that is not in the chord's list: shown first until the chord changes */
  var saveTimer = 0;
  function store() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { PAD.save("set", set); }, 300); }
  function adopt(s) {
    if (!s || s.v !== 1 || !s.cur) return;
    var c = s.cur;
    if (typeof c.root === "number" && c.root >= 0 && c.root < 12 && Chords.qual(c.q) &&
      (c.bass === null || (typeof c.bass === "number" && c.bass >= 0 && c.bass < 12)))
      set.cur = { root: c.root, q: c.q, bass: c.bass === c.root ? null : c.bass, i: Math.max(0, c.i | 0) };
    if (s.sort === "pos" || s.sort === "common") set.sort = s.sort;
    if (s.view === "neck" || s.view === "box") set.view = s.view;
    if (s.vol === 0 || s.vol === 1 || s.vol === 2) set.vol = s.vol;
    if (Array.isArray(s.recent)) set.recent = s.recent.filter(function (n) { return typeof n === "string" && Chords.parse(n); }).slice(0, 8);
  }
  function chord() { return { root: set.cur.root, q: set.cur.q, bass: set.cur.bass }; }
  function list() {
    var all = Chords.voicings(chord());
    all = set.sort === "pos" ? Chords.byPosition(all) : all;
    if (temp && temp.name === Chords.name(chord())) all = [temp.v].concat(all);
    return all;
  }
  function remember() {
    var n = Chords.name(chord());
    set.recent = [n].concat(set.recent.filter(function (r) { return r !== n; })).slice(0, 8);
  }
  function go(c, i) {
    if (Chords.name(c) !== Chords.name(chord())) temp = null;
    set.cur = { root: c.root, q: c.q, bass: c.bass === undefined ? null : c.bass, i: i || 0 };
    remember(); store(); show();
  }

  /* ---------------- the main screen ---------------- */
  var cv = $("pic"), wrap = $("pwrap");
  function current() {
    var l = list();
    if (set.cur.i >= l.length) set.cur.i = l.length - 1;
    if (set.cur.i < 0) set.cur.i = 0;
    return { list: l, v: l[set.cur.i] };
  }
  function show() {
    var c = chord(), Q = Chords.qual(c.q), cur = current(), v = cur.v;
    $("cname").textContent = Chords.name(c);
    $("qname").textContent = EN ? Q.en : Q.zh;
    $("view").textContent = set.view === "neck" ? t("neck") : t("box");
    $("view").classList.toggle("on", set.view === "neck");
    $("line").textContent = v ? Chords.fretText(v.frets) + " · " + t("of", { i: set.cur.i + 1, n: cur.list.length }) + " · " +
      (v.pos === 0 ? t("open") : t("fret", { n: v.pos })) : "";
    var tones = Chords.tones(c), row = $("tones");
    row.innerHTML = "";
    tones.forEach(function (x) {
      var cell = el("button", "tone");
      cell.appendChild(el("b", "", Chords.NAMES[x.pc]));
      cell.appendChild(el("span", "", x.lab === "/" ? t("bassLab") : x.lab));
      cell.addEventListener("click", function () { playTone(x); });
      row.appendChild(cell);
    });
    paint();
  }
  function paint() {
    var cur = current(), c = chord();
    if (!cur.v) return;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    var b = set.view === "neck" ? Draw.neck(cur.v, Chords.tones(c), c.root) : Draw.box(cur.v, c.root);
    Draw.paint(cv, b, Math.max(1, w), Math.max(1, h));
  }
  function step(d) {
    var n = list().length;
    if (!n) return;
    set.cur.i = (set.cur.i + d + n) % n;
    sfx("move"); store(); show();
  }
  function stepQual(d) {
    var qi = Chords.QUALS.indexOf(Chords.qual(set.cur.q)), n = Chords.QUALS.length;
    go({ root: set.cur.root, q: Chords.QUALS[(qi + d + n) % n].id, bass: set.cur.bass }, 0);
    sfx("tick");
  }
  function notesOf(v) { return Chords.midiOf(v.frets); }
  /* one chord tone on its own, so the intervals can be heard: every tone is counted up from the root as the voicing plays
     it (its lowest root, or the first root above the bass when the voicing leaves the root out), so R, 3, 5, b7, 9 climb
     in order; a slash chord's extra bass is the voicing's lowest note */
  function toneMidi(v, x) {
    var notes = notesOf(v), low = Math.min.apply(null, notes), root = set.cur.root, r = null;
    if (x.iv === null) return low;
    notes.forEach(function (n) { if (Chords.mod12(n) === root && (r === null || n < r)) r = n; });
    if (r === null) r = low + Chords.mod12(root - low);
    return r + x.iv;
  }
  function playTone(x) {
    var v = current().v;
    if (!v || !Guitar.play([toneMidi(v, x)], 0, true)) sfx(Guitar.level() ? "tap" : "err");
  }
  function strum(arp) {
    var v = current().v;
    if (!v) return;
    if (!Guitar.play(notesOf(v), arp ? 0.18 : 0.012)) sfx(Guitar.level() ? "tap" : "err");
  }

  /* the diagram: a tap strums, a swipe changes the voicing */
  (function () {
    var x0 = null, y0 = 0;
    wrap.addEventListener("pointerdown", function (e) { x0 = e.clientX; y0 = e.clientY; });
    wrap.addEventListener("pointercancel", function () { x0 = null; });
    wrap.addEventListener("pointerup", function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) strum(false);
    });
  })();
  /* the strum button: a short press strums, a long one (decided on release, where the phone lets sound start) arpeggiates */
  (function () {
    var b = $("strum"), down = 0, timer = 0;
    b.addEventListener("pointerdown", function () {
      down = Date.now();
      timer = setTimeout(function () { b.textContent = t("arp"); }, 400);
    });
    function end(play) {
      clearTimeout(timer);
      if (!down) return;
      var long = Date.now() - down >= 400;
      down = 0;
      b.textContent = t("strum");
      if (play) strum(long);
    }
    b.addEventListener("pointerup", function () { end(true); });
    b.addEventListener("pointercancel", function () { end(false); });
    b.addEventListener("pointerleave", function () { end(false); });
    b.addEventListener("click", function (e) { if (e.detail === 0) strum(false); });
  })();
  $("prev").addEventListener("click", function () { step(-1); });
  $("next").addEventListener("click", function () { step(1); });
  function toggleSort() { setSort(set.sort === "pos" ? "common" : "pos"); }
  function setSort(to) {
    var v = current().v;
    set.sort = to;
    /* stay on the same voicing in the new order */
    var l = list(), id = v ? v.frets.join(",") : "";
    set.cur.i = Math.max(0, l.map(function (x) { return x.frets.join(","); }).indexOf(id));
    sfx("tick"); store(); show();
  }
  $("view").addEventListener("click", function () { set.view = set.view === "neck" ? "box" : "neck"; sfx("tick"); store(); show(); });
  $("cname").parentNode.addEventListener("click", function () { openPicker(); });

  /* ---------------- the picker (section 3.3) ---------------- */
  var pick = null;   /* {root, q, bass} while the picker is open */
  var picker = $("picker");
  function openPicker() {
    pick = chord();
    picker.classList.add("open");
    $("q").value = "";
    $("msg").textContent = "";
    buildPicker();
    $("pmain").scrollTop = 0;
    sfx("tap");
  }
  function closePicker() { picker.classList.remove("open"); pick = null; show(); }
  function choice(label, on, fn, cls) {
    var b = el("button", (cls || "") + (on ? " sel" : ""), label);
    b.addEventListener("click", fn);
    return b;
  }
  function buildPicker() {
    $("ptitle").textContent = Chords.name(pick);
    var roots = $("roots"); roots.innerHTML = "";
    Chords.NAMES.forEach(function (n, pc) {
      roots.appendChild(choice(n, pick.root === pc, function () { pick.root = pc; if (pick.bass === pc) pick.bass = null; sfx("tick"); buildPicker(); }));
    });
    var quals = $("quals"); quals.innerHTML = "";
    Chords.GROUPS.forEach(function (g, gi) {
      quals.appendChild(el("h3", "", EN ? g.en : g.zh));
      var grid = el("div", "grid3");
      Chords.QUALS.forEach(function (Q) {
        if (Q.group !== gi) return;
        var b = choice("", pick.q === Q.id, function () { pick.q = Q.id; sfx("tick"); buildPicker(); }, "qual");
        b.appendChild(el("b", "", Q.id || "maj"));
        b.appendChild(el("span", "", EN ? Q.en : Q.zh));
        grid.appendChild(b);
      });
      quals.appendChild(grid);
    });
    var bass = $("basses"); bass.innerHTML = "";
    bass.appendChild(choice(t("none"), pick.bass === null, function () { pick.bass = null; sfx("tick"); buildPicker(); }));
    Chords.NAMES.forEach(function (n, pc) {
      if (pc === pick.root) return;
      bass.appendChild(choice(n, pick.bass === pc, function () { pick.bass = pc; sfx("tick"); buildPicker(); }));
    });
    var rec = $("recent"); rec.innerHTML = "";
    set.recent.forEach(function (n) {
      rec.appendChild(choice(n, false, function () { var c = Chords.parse(n); if (!c) return; sfx("ok"); go(c, 0); closePicker(); }));
    });
    $("recentH").style.display = set.recent.length ? "" : "none";
    var ord = $("sorts"); ord.innerHTML = "";
    ["common", "pos"].forEach(function (id, i) {
      ord.appendChild(choice(T.orders[i], set.sort === id, function () { if (set.sort !== id) setSort(id); else sfx("tick"); buildPicker(); }));
    });
    var vol = $("vol"); vol.innerHTML = "";
    T.vol.forEach(function (label, i) {
      vol.appendChild(choice(label, set.vol === i, function () {
        set.vol = i; Guitar.setLevel(i); store(); buildPicker();
        if (i) Guitar.play([52, 59, 64], 0.012); else sfx("tick");
      }));
    });
  }
  function applyPick() { sfx("ok"); go(pick, 0); closePicker(); }
  function search() {
    var c = Chords.parse($("q").value);
    if (!c) { $("msg").textContent = t("unknown"); sfx("err"); return; }
    $("q").blur();
    pick = c; applyPick();
  }
  $("pback").addEventListener("click", function () { sfx("tap"); closePicker(); });
  $("pok").addEventListener("click", applyPick);
  $("qgo").addEventListener("click", search);
  $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); search(); } });
  $("tofind").addEventListener("click", function () { picker.classList.remove("open"); pick = null; openFinder(); });

  /* ---------------- the finder (section 3.4) ---------------- */
  var fs = null;     /* {frets, base} */
  var finder = $("finder");
  function openFinder() {
    var v = current().v, frets = v ? v.frets.slice() : [-1, 3, 2, 0, 1, 0];
    fs = { frets: frets, base: Math.min(12, Draw.baseFret(frets)) };
    finder.classList.add("open");
    buildFinder();
    sfx("tap");
  }
  function closeFinder() { finder.classList.remove("open"); fs = null; show(); }
  function buildFinder() {
    var xo = $("xo"); xo.innerHTML = "";
    fs.frets.forEach(function (f, s) {
      var b = choice(f < 0 ? "x" : f === 0 ? "o" : String(f), f <= 0, function () {
        fs.frets[s] = fs.frets[s] === 0 ? -1 : 0; sfx("tick"); buildFinder();
      }, "xo");
      xo.appendChild(b);
    });
    $("fpos").textContent = t("posLabel", { n: fs.base });
    var grid = $("frets"); grid.innerHTML = "";
    for (var r = 0; r < 5; r++) for (var s = 0; s < 6; s++) (function (s, f) {
      var b = choice(String(f), fs.frets[s] === f, function () {
        fs.frets[s] = fs.frets[s] === f ? 0 : f; sfx("tick"); buildFinder();
      }, "cell");
      grid.appendChild(b);
    })(s, fs.base + r);
    var ids = Chords.identify(fs.frets), out = $("fname"), alt = $("falt");
    if (ids.length) {
      out.textContent = Chords.name(ids[0]);
      alt.textContent = ids.length > 1 ? t("also") + ids.slice(1).map(Chords.name).join(", ") : "";
    } else {
      out.textContent = t("noChord");
      var seen = {}, names = [];
      Chords.midiOf(fs.frets).forEach(function (m) { var n = Chords.NAMES[m % 12]; if (!seen[n]) { seen[n] = 1; names.push(n); } });
      alt.textContent = names.join(" ");
    }
    $("fsee").disabled = !ids.length;
  }
  function moveBase(d) {
    var b = fs.base + d;
    if (b < 1 || b > 12) { sfx("err"); return; }
    fs.base = b; sfx("tick"); buildFinder();
  }
  function seeFound() {
    var ids = Chords.identify(fs.frets);
    if (!ids.length) { sfx("err"); return; }
    var c = { root: ids[0].root, q: ids[0].q, bass: ids[0].bass }, frets = fs.frets.slice();
    var l = Chords.voicings(c);
    l = set.sort === "pos" ? Chords.byPosition(l) : l;
    var i = l.map(function (v) { return v.frets.join(","); }).indexOf(frets.join(","));
    temp = null;
    if (i < 0) {
      var fc = Chords.fingerCount(frets);
      temp = { name: Chords.name(c), v: { frets: frets, fingers: Chords.assignFingers(frets), tier: 0, rank: 0, pos: Chords.position(frets), barre: fc.barre } };
      i = 0;
    }
    sfx("ok");
    finder.classList.remove("open"); fs = null;
    set.cur = { root: c.root, q: c.q, bass: c.bass, i: i };
    remember(); store(); show();
  }
  $("fback").addEventListener("click", function () { sfx("tap"); closeFinder(); });
  $("fdown").addEventListener("click", function () { moveBase(-1); });
  $("fup").addEventListener("click", function () { moveBase(1); });
  $("fplay").addEventListener("click", function () {
    var n = Chords.midiOf(fs.frets);
    if (!n.length || !Guitar.play(n, 0.012)) sfx("err");
  });
  $("fsee").addEventListener("click", seeFound);

  /* ---------------- keys (section 7) ---------------- */
  PAD.on("press", function (k) {
    if (fs) {
      if (k === "b") { sfx("tap"); closeFinder(); }
      else if (k === "a" || k === "start") seeFound();
      else if (k === "left") moveBase(-1);
      else if (k === "right") moveBase(1);
      return;
    }
    if (pick) {
      if (document.activeElement === $("q")) return;
      if (k === "b") { sfx("tap"); closePicker(); }
      else if (k === "a" || k === "start") applyPick();
      else if (k === "left" || k === "right") { pick.root = (pick.root + (k === "left" ? 11 : 1)) % 12; if (pick.bass === pick.root) pick.bass = null; sfx("tick"); buildPicker(); }
      else if (k === "up" || k === "down") {
        var n = Chords.QUALS.length, qi = Chords.QUALS.indexOf(Chords.qual(pick.q));
        pick.q = Chords.QUALS[(qi + (k === "up" ? n - 1 : 1)) % n].id; sfx("tick"); buildPicker();
      }
      return;
    }
    if (k === "left") step(-1);
    else if (k === "right") step(1);
    else if (k === "up") stepQual(-1);
    else if (k === "down") stepQual(1);
    else if (k === "a") strum(false);
    else if (k === "start") openPicker();
    else if (k === "select") toggleSort();
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(paint, 60); });

  /* fixed words */
  $("prev").textContent = t("prev"); $("next").textContent = t("next"); $("strum").textContent = t("strum");
  $("strum").title = t("held");
  $("pback").textContent = t("back"); $("pok").textContent = t("ok"); $("qgo").textContent = t("find");
  $("q").placeholder = t("search"); $("rootH").textContent = t("root"); $("bassH").textContent = t("bass");
  $("recentH").textContent = t("recent"); $("tofind").textContent = t("byFrets"); $("volH").textContent = t("sound");
  $("sortH").textContent = t("order");
  $("fback").textContent = t("back");
  $("fplay").textContent = t("listen"); $("fsee").textContent = t("see");
  document.documentElement.lang = EN ? "en" : "zh";

  function begin(s) {
    adopt(s);
    Guitar.setLevel(set.vol);
    show();
    /* the first paint can come before the layout settles */
    requestAnimationFrame(paint);
  }
  PAD.load("set").then(begin, function () { begin(null); });
})();
