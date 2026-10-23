/*
 * Lo-PDA PAD bridge (app side). MIT License, see sdk/LICENSE.
 *
 * The runtime serialises lopdaPadShim with Function.prototype.toString() and
 * injects it as the first script of every app, so it must stay self-contained:
 * no closures over outer variables, no imports.
 *
 * The runtime calls it with options: lopdaPadShim({lang:"zh"|"en", music:true, ambience:true, sensors:true, notes:true, say:true, camera:true, dict:true}).
 * Older runtimes pass none, so PAD.lang is undefined there and apps fall back to their own default; PAD.music is likewise undefined
 * unless the runtime can play it (runtime 0.11.0 and later, and sdk/dev.html), PAD.ambience (0.13.0 and later),
 * PAD.motion and PAD.mic (0.24.0 and later), PAD.notes and PAD.say (0.26.0 and later; Japanese say in 0.29.0),
 * PAD.camera (0.28.0 and later) and PAD.dict (0.34.0 and later).
 *
 * Messages app -> runtime:  {pad:1, op:"save"|"load"|"remove"|"error"|"exit", ...}
 *                           {pad:1, op:"sfx", name}  or  {pad:1, op:"sfx", params:{wave, duty, from, to, ms, attack, decay, vol, vibrato:{depth, rate}}}
 *                           {pad:1, op:"music", action:"play", song:{bpm, p1, p2, tri, noise}, loop}  or  {..., action:"stop"}
 *                           {pad:1, op:"ambience", name, level}   (name null: fade out)
 *                           {pad:1, op:"file", i, kind:"export", name, type, data}   (needs "files")
 *                           {pad:1, op:"file", i, kind:"import", accept}
 *                           {pad:1, op:"sense", i, kind:"motion"|"mic", action:"start"}   (needs "motion" / "mic")
 *                           {pad:1, op:"sense", kind, action:"stop"|"zero"}
 *                           {pad:1, op:"notes", i, title, text}   (needs "notes")
 *                           {pad:1, op:"say", i, text, lang}
 *                           {pad:1, op:"snap", i, size:"small"|"large"}   (needs "camera")
 *                           {pad:1, op:"dict", i, kind:"words", q}  or  {pad:1, op:"dict", i, kind:"lookup", word}
 * Messages runtime -> app:  {pad:1, op:"loaded", i, v}
 *                           {pad:1, op:"filed", i, v}  or  {pad:1, op:"filed", i, error}
 *                           {pad:1, op:"sensed", i, v}   v: "on" | "denied" | "none"
 *                           {pad:1, op:"noted", i, v}   v: "saved" | "denied"
 *                           {pad:1, op:"said", i, v}    v: "done" | "stopped" | "unavailable"
 *                           {pad:1, op:"snapped", i, v}  v: {w, h, px: Uint8Array of w*h tones 0-3} | null
 *                           {pad:1, op:"dicted", i, v}  or  {pad:1, op:"dicted", i, error}   v: a words page, an entry or null
 *                           {pad:1, op:"tilt", x, y, heading}  {pad:1, op:"shake"}  {pad:1, op:"sound", level, pitch}
 *                           {pad:1, op:"button", b, down}   (chin buttons, lopda/1)
 *                           {pad:1, op:"release-all"}
 */
function lopdaPadShim(opts) {
  var seq = 0, waiting = {}, filing = {}, sensing = {}, noting = {}, saying = {}, snapping = {}, dicting = {};
  var post = function (msg) { msg.pad = 1; parent.postMessage(msg, "*"); };
  var TONES = ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"];
  var LANG = opts && (opts.lang === "zh" || opts.lang === "en") ? opts.lang : undefined;
  var MUSIC = !!(opts && opts.music === true), AMBIENCE = !!(opts && opts.ambience === true), SENSORS = !!(opts && opts.sensors === true);
  var NOTES = !!(opts && opts.notes === true), SAY = !!(opts && opts.say === true), CAMERA = !!(opts && opts.camera === true);
  var DICT = !!(opts && opts.dict === true);

  /* Buttons (lopda/1): the runtime forwards the chin keys; the keyboard works too. */
  var BUTTONS = ["up", "down", "left", "right", "a", "b", "start", "select"];
  var SOUNDS = ["tap", "tick", "move", "ok", "err", "hit", "miss", "coin", "win", "lose"];
  var KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    x: "a", X: "a", z: "b", Z: "b", Enter: "start", Shift: "select" };
  var held = {}, on = { press: [], release: [], tilt: [], shake: [], sound: [] };
  var listening = function () { return on.press.length + on.release.length > 0; };
  var emit = function (type, arg) {
    on[type].slice().forEach(function (f) {
      try { f(arg); } catch (err) { setTimeout(function () { throw err; }); }
    });
  };
  var setButton = function (b, down) {
    if (BUTTONS.indexOf(b) < 0 || !!held[b] === down) return;
    held[b] = down;
    emit(down ? "press" : "release", b);
  };
  var releaseAll = function () { BUTTONS.forEach(function (b) { setButton(b, false); }); };

  /* Files ("permissions": ["files"]): the runtime asks the player on its own dialog every time,
     then opens the share sheet or the file picker. One file at most 2 MB. */
  var FILE_MAX = 2 * 1024 * 1024;
  var bytesOf = function (data) {
    var m = /^data:[^,]*?(;base64)?,/.exec(data);
    if (!m) return unescape(encodeURIComponent(data)).length;   /* text: its UTF-8 size */
    var body = data.length - m[0].length;
    return m[1] ? Math.floor(body * 3 / 4) : body;
  };
  /* Sound (docs/design/pad-audio.md). Only plain data crosses to the runtime: numbers and strings are copied,
     anything else is left for the runtime to refuse or ignore. The runtime clamps and checks everything again. */
  var plain = function (o, keys) {
    var out = {};
    if (!o || typeof o !== "object") return out;
    (keys || Object.keys(o)).forEach(function (k) {
      var v = o[k];
      if (typeof v === "number" || typeof v === "string") out[k] = v;
      else if (v !== undefined) out[k] = String(v);
    });
    return out;
  };
  var SFX_KEYS = ["wave", "duty", "from", "to", "ms", "attack", "decay", "vol"];
  var sfxParams = function (s) {
    var p = plain(s, SFX_KEYS.filter(function (k) { return k in s; }));
    if (s.vibrato && typeof s.vibrato === "object") p.vibrato = plain(s.vibrato, ["depth", "rate"].filter(function (k) { return k in s.vibrato; }));
    return p;
  };
  /* ambience(name, level): one of rain waves waterfall wind fire stream, level 0-1; ambience(null) fades it out */
  var ambience = !AMBIENCE ? undefined : function (name, level) {
    var msg = { op: "ambience", name: name == null ? null : String(name) };
    if (level !== undefined) msg.level = typeof level === "number" ? level : String(level);
    post(msg);
  };
  var music = !MUSIC ? undefined : Object.freeze({
    /* play(song, {loop}) replaces whatever is playing; loops unless loop is false. A score that does not
       parse is reported like an uncaught error (the runtime's error box, the harness log). */
    play: function (song, o) { post({ op: "music", action: "play", song: plain(song), loop: !(o && o.loop === false) }); },
    stop: function () { post({ op: "music", action: "stop" }); }
  });

  /* Tilt and the microphone ("permissions": ["motion"] / ["mic"]): the runtime asks the player and the phone, reads the
     sensors itself and sends only coarse numbers (docs/design/pad-sensors.md). start() -> Promise<"on" | "denied" | "none"> */
  var senseStart = function (kind) {
    return new Promise(function (resolve) {
      var i = ++seq; sensing[i] = resolve;
      post({ op: "sense", i: i, kind: kind, action: "start" });
    });
  };
  var senseCall = function (kind, action) { post({ op: "sense", kind: kind, action: action }); };
  var motion = !SENSORS ? undefined : Object.freeze({
    start: function () { return senseStart("motion"); },
    stop: function () { senseCall("motion", "stop"); },
    zero: function () { senseCall("motion", "zero"); }   /* y = 0 is the way the phone is held now */
  });
  var mic = !SENSORS ? undefined : Object.freeze({
    start: function () { return senseStart("mic"); },
    stop: function () { senseCall("mic", "stop"); }
  });
  /* Notes ("permissions": ["notes"]): every append shows the runtime's own dialog with the text; the player says yes or no.
     The runtime checks the title (one line, at most 64 characters) and the text (at most 4 KB) and answers "denied" past them.
     append(title, text) -> Promise<"saved" | "denied"> */
  var ask = function (table, msg) {
    return new Promise(function (resolve) {
      var i = ++seq; table[i] = resolve;
      msg.i = i; post(msg);
    });
  };
  var str = function (v) { return typeof v === "string" ? v : v == null ? "" : String(v); };
  var notes = !NOTES ? undefined : Object.freeze({
    append: function (title, text) { return ask(noting, { op: "notes", title: str(title), text: str(text) }); }
  });
  /* say(text, {lang}) -> Promise<"done" | "stopped" | "unavailable">: the phone's own voice, no permission. lang "zh", "en"
     or "ja", PAD.lang by default; at most 200 characters (the rest is cut), once a second; a new call stops the one speaking */
  var say = !SAY ? undefined : function (text, o) {
    var l = o && (o.lang === "zh" || o.lang === "en" || o.lang === "ja") ? o.lang : LANG || "zh";
    return ask(saying, { op: "say", text: Array.from(str(text)).slice(0, 200).join(""), lang: l });
  };
  if (say) say.languages = Object.freeze(["zh", "en", "ja"]);
  /* The camera ("permissions": ["camera"]): every snap opens the runtime's own viewfinder over the app; the player shoots or
     cancels. snap({size}) -> Promise<{w, h, px} | null>, size "small" (128x112, the default) or "large" (256x224); px is a
     Uint8Array of w*h tone indices, 0 = ink ... 3 = paper (PAD.TONES), row by row. null: refused, cancelled, no camera,
     or a snap already open */
  var camera = !CAMERA ? undefined : Object.freeze({
    snap: function (o) { return ask(snapping, { op: "snap", size: o && o.size === "large" ? "large" : "small" }); }
  });
  /* a picture from the runtime, checked: one of the two sizes, tones 0-3 only */
  var picture = function (v) {
    if (!v || typeof v !== "object" || !(v.px instanceof Uint8Array)) return null;
    if (!((v.w === 128 && v.h === 112) || (v.w === 256 && v.h === 224)) || v.px.length !== v.w * v.h) return null;
    for (var i = 0; i < v.px.length; i++) if (v.px[i] > 3) return null;
    return { w: v.w, h: v.h, px: v.px };
  };
  var num = function (v, lo, hi) { return typeof v === "number" && v >= lo && v <= hi; };
  /* The dictionary (runtime 0.34.0, SPEC.md 6.7): read-only queries on the built-in ECDICT, no permission and no dialog.
     words(q) -> Promise<{words, more} | null>, lookup(word) -> Promise<{word, form?, zh, en} | null>; null: the dictionary
     cannot be read, or more than 10 calls in a second (words and lookup together). A bad query rejects, as PAD.exportFile
     rejects bad arguments; unhandled it reaches the runtime's error box. */
  var dictAsk = function (kind, msg) {
    return new Promise(function (resolve, reject) {
      var i = ++seq; dicting[i] = { resolve: resolve, reject: reject, kind: kind };
      msg.op = "dict"; msg.kind = kind; msg.i = i; post(msg);
    });
  };
  /* what comes back is checked here before an app sees it: anything unexpected reads as null */
  var stringsOnly = function (a) {
    if (!Array.isArray(a)) return null;
    for (var i = 0; i < a.length; i++) if (typeof a[i] !== "string") return null;
    return a.slice();
  };
  var wordPage = function (v) {
    if (!v || typeof v !== "object") return null;
    var words = stringsOnly(v.words);
    return words ? { words: words, more: !!v.more } : null;
  };
  var wordEntry = function (v) {
    if (!v || typeof v !== "object" || typeof v.word !== "string") return null;
    var zh = stringsOnly(v.zh), en = stringsOnly(v.en), out;
    if (!zh || !en) return null;
    out = { word: v.word, zh: zh, en: en };
    if (typeof v.form === "string") out.form = v.form;
    return out;
  };
  /* a words() query as plain data. plain() drops what cannot be copied; len is the one field that is an array,
     [min, max], and it must stay one for the runtime's check (SPEC.md 6.7) */
  var queryOf = function (q) {
    var out = plain(q);
    if (q && typeof q === "object" && Array.isArray(q.len)) {
      out.len = q.len.map(function (v) { return typeof v === "number" || typeof v === "string" ? v : String(v); });
    }
    return out;
  };
  var dict = !DICT ? undefined : Object.freeze({
    version: "ecdict-1",
    words: function (q) { return dictAsk("words", { q: queryOf(q) }); },
    lookup: function (word) { return dictAsk("lookup", { word: str(word) }); }
  });

  var fileOp = function (msg) {
    return new Promise(function (resolve, reject) {
      var i = ++seq; filing[i] = { resolve: resolve, reject: reject };
      msg.op = "file"; msg.i = i; post(msg);
    });
  };

  window.PAD = Object.freeze({
    spec: "lopda/1",
    lang: LANG,
    TONES: Object.freeze(TONES.slice()),
    BUTTONS: Object.freeze(BUTTONS.slice()),
    SOUNDS: Object.freeze(SOUNDS.slice()),
    save: function (k, v) { post({ op: "save", k: String(k), v: v }); },
    remove: function (k) { post({ op: "remove", k: String(k) }); },
    load: function (k) {
      return new Promise(function (resolve) {
        var i = ++seq; waiting[i] = resolve;
        post({ op: "load", k: String(k), i: i });
      });
    },
    exit: function () { post({ op: "exit" }); },
    /* sfx("coin"), one of SOUNDS, or sfx({wave, from, to, ms, ...}), a sound of the app's own */
    sfx: function (s) {
      if (typeof s === "string") { if (SOUNDS.indexOf(s) >= 0) post({ op: "sfx", name: s }); }
      else if (s && typeof s === "object") post({ op: "sfx", params: sfxParams(s) });
    },
    music: music,
    ambience: ambience,
    motion: motion,
    mic: mic,
    notes: notes,
    say: say,
    camera: camera,
    dict: dict,
    on: function (type, fn) { if (on[type] && typeof fn === "function") on[type].push(fn); },
    off: function (type, fn) { if (on[type]) on[type] = on[type].filter(function (f) { return f !== fn; }); },
    isDown: function (b) { return !!held[b]; },
    /* -> Promise<"saved" | "cancelled">. data: a data: URL (images) or a string (text). */
    exportFile: function (o) {
      o = o || {};
      if (typeof o.name !== "string" || !o.name || typeof o.data !== "string") return Promise.reject(new Error("PAD.exportFile needs {name, type, data}"));
      if (bytesOf(o.data) > FILE_MAX) return Promise.reject(new Error("PAD.exportFile: a file is at most 2 MB"));
      return fileOp({ kind: "export", name: o.name, type: typeof o.type === "string" ? o.type : "", data: o.data });
    },
    /* -> Promise<{name, type, data} | null>; null when the player cancels. accept: MIME types such as "image/*" */
    importFile: function (o) {
      var acc = o && Array.isArray(o.accept) ? o.accept.filter(function (a) { return typeof a === "string"; }) : [];
      return fileOp({ kind: "import", accept: acc });
    }
  });

  addEventListener("message", function (e) {
    var d = e.data; if (!d || !d.pad || e.source !== parent) return;
    if (d.op === "loaded" && waiting[d.i]) { waiting[d.i](d.v); delete waiting[d.i]; }
    else if (d.op === "filed" && filing[d.i]) {
      var f = filing[d.i]; delete filing[d.i];
      if (d.error) f.reject(new Error(String(d.error))); else f.resolve(d.v);
    }
    else if (d.op === "sensed" && sensing[d.i]) {
      var r = sensing[d.i]; delete sensing[d.i];
      r(d.v === "on" || d.v === "none" ? d.v : "denied");
    }
    else if (d.op === "noted" && noting[d.i]) { var n = noting[d.i]; delete noting[d.i]; n(d.v === "saved" ? "saved" : "denied"); }
    else if (d.op === "said" && saying[d.i]) { var w = saying[d.i]; delete saying[d.i]; w(d.v === "done" || d.v === "stopped" ? d.v : "unavailable"); }
    else if (d.op === "snapped" && snapping[d.i]) { var c = snapping[d.i]; delete snapping[d.i]; c(picture(d.v)); }
    else if (d.op === "dicted" && dicting[d.i]) {
      var g = dicting[d.i]; delete dicting[d.i];
      if (d.error != null) g.reject(new Error("PAD.dict." + g.kind + ": " + String(d.error)));
      else g.resolve(g.kind === "words" ? wordPage(d.v) : wordEntry(d.v));
    }
    else if (d.op === "tilt" && SENSORS && num(d.x, -1, 1) && num(d.y, -1, 1))
      emit("tilt", { x: d.x, y: d.y, heading: num(d.heading, 0, 360) ? d.heading : null });
    else if (d.op === "shake" && SENSORS) emit("shake");
    else if (d.op === "sound" && SENSORS && num(d.level, 0, 1))
      emit("sound", { level: d.level, pitch: num(d.pitch, 1, 20000) ? d.pitch : null });
    else if (d.op === "button") setButton(String(d.b), !!d.down);
    else if (d.op === "release-all") releaseAll();
  });
  var typing = function (t) { return t && (t.nodeName === "INPUT" || t.nodeName === "TEXTAREA" || t.isContentEditable); };
  addEventListener("keydown", function (e) {
    var b = KEYS[e.key]; if (!b || !listening() || typing(e.target)) return;
    e.preventDefault(); if (!e.repeat) setButton(b, true);
  });
  addEventListener("keyup", function (e) { var b = KEYS[e.key]; if (b) setButton(b, false); });
  addEventListener("blur", releaseAll);
  addEventListener("error", function (e) {
    post({
      op: "error",
      msg: String(e.message) + " @" + e.lineno + ":" + e.colno,
      line: e.lineno || 0,
      col: e.colno || 0,
      stack: e.error && e.error.stack ? String(e.error.stack) : ""
    });
  });
  addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    post({
      op: "error",
      msg: "Promise: " + String((r && r.message) || r),
      stack: r && r.stack ? String(r.stack) : ""
    });
  });

  /* The screen has no colour glyphs: strip emoji from DOM text and canvas text. */
  try {
    var E = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
    var clean = function (t) { return String(t).replace(E, ""); };
    var P = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (P) {
      ["fillText", "strokeText"].forEach(function (m) {
        var o = P[m];
        P[m] = function (t) { var a = Array.prototype.slice.call(arguments); a[0] = clean(t); return o.apply(this, a); };
      });
      var mt = P.measureText; P.measureText = function (t) { return mt.call(this, clean(t)); };
    }
    var scrub = function (node) {
      if (node.nodeType === 3) { var v = clean(node.nodeValue); if (v !== node.nodeValue) node.nodeValue = v; return; }
      if (node.nodeName === "SCRIPT" || node.nodeName === "STYLE") return;
      for (var c = node.firstChild; c; c = c.nextSibling) scrub(c);
    };
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === "characterData") scrub(m.target);
        for (var i = 0; i < m.addedNodes.length; i++) scrub(m.addedNodes[i]);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (err) { /* older engines: skip the scrubber */ }
}

/* The CSP every app runs under. Kept here so the runtime and the dev harness agree. */
var LOPDA_APP_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'";

/* Wrap an app's HTML: CSP meta first, then the bridge, then the app.
   opts.lang ("zh" | "en") becomes PAD.lang inside the app; opts.music (true) gives it PAD.music, opts.ambience (true) PAD.ambience,
   opts.sensors (true) PAD.motion and PAD.mic, opts.notes (true) PAD.notes, opts.say (true) PAD.say,
   opts.camera (true) PAD.camera, opts.dict (true) PAD.dict. */
function lopdaWrapApp(html, opts) {
  var o = {};
  if (opts && (opts.lang === "zh" || opts.lang === "en")) o.lang = opts.lang;
  if (opts && opts.music === true) o.music = true;
  if (opts && opts.ambience === true) o.ambience = true;
  if (opts && opts.sensors === true) o.sensors = true;
  if (opts && opts.notes === true) o.notes = true;
  if (opts && opts.say === true) o.say = true;
  if (opts && opts.camera === true) o.camera = true;
  if (opts && opts.dict === true) o.dict = true;
  var head = '<meta http-equiv="Content-Security-Policy" content="' + LOPDA_APP_CSP + '">' +
    "<style>*{touch-action:manipulation;-webkit-tap-highlight-color:transparent}</style>" +
    "<script>(" + lopdaPadShim.toString() + ")(" + (Object.keys(o).length ? JSON.stringify(o) : "") + ");<\/script>";
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, function (m) { return m + head; });
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, function (m) { return m + "<head>" + head + "</head>"; });
  return "<!doctype html><html><head>" + head + "</head><body>" + html + "</body></html>";
}
