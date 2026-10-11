/*
 * Lo-PDA PAD bridge (app side). MIT License, see sdk/LICENSE.
 *
 * The runtime serialises lopdaPadShim with Function.prototype.toString() and
 * injects it as the first script of every app, so it must stay self-contained:
 * no closures over outer variables, no imports.
 *
 * The runtime calls it with options: lopdaPadShim({lang:"zh"|"en"}). Older runtimes pass none,
 * so PAD.lang is undefined there and apps fall back to their own default.
 *
 * Messages app -> runtime:  {pad:1, op:"save"|"load"|"remove"|"error"|"exit"|"sfx", ...}
 * Messages runtime -> app:  {pad:1, op:"loaded", i, v}
 *                           {pad:1, op:"button", b, down}   (chin buttons, lopda/1)
 *                           {pad:1, op:"release-all"}
 */
function lopdaPadShim(opts) {
  var seq = 0, waiting = {};
  var post = function (msg) { msg.pad = 1; parent.postMessage(msg, "*"); };
  var TONES = ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"];
  var LANG = opts && (opts.lang === "zh" || opts.lang === "en") ? opts.lang : undefined;

  /* Buttons (lopda/1): the runtime forwards the chin keys; the keyboard works too. */
  var BUTTONS = ["up", "down", "left", "right", "a", "b", "start", "select"];
  var SOUNDS = ["tap", "tick", "move", "ok", "err", "hit", "miss", "coin", "win", "lose"];
  var KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    x: "a", X: "a", z: "b", Z: "b", Enter: "start", Shift: "select" };
  var held = {}, on = { press: [], release: [] };
  var listening = function () { return on.press.length + on.release.length > 0; };
  var setButton = function (b, down) {
    if (BUTTONS.indexOf(b) < 0 || !!held[b] === down) return;
    held[b] = down;
    on[down ? "press" : "release"].slice().forEach(function (f) {
      try { f(b); } catch (err) { setTimeout(function () { throw err; }); }
    });
  };
  var releaseAll = function () { BUTTONS.forEach(function (b) { setButton(b, false); }); };

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
    sfx: function (name) { if (SOUNDS.indexOf(name) >= 0) post({ op: "sfx", name: name }); },
    on: function (type, fn) { if (on[type] && typeof fn === "function") on[type].push(fn); },
    off: function (type, fn) { if (on[type]) on[type] = on[type].filter(function (f) { return f !== fn; }); },
    isDown: function (b) { return !!held[b]; }
  });

  addEventListener("message", function (e) {
    var d = e.data; if (!d || !d.pad || e.source !== parent) return;
    if (d.op === "loaded" && waiting[d.i]) { waiting[d.i](d.v); delete waiting[d.i]; }
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
    post({ op: "error", msg: String(e.message) + " @" + e.lineno + ":" + e.colno });
  });
  addEventListener("unhandledrejection", function (e) {
    var r = e.reason; post({ op: "error", msg: "Promise: " + String((r && r.message) || r) });
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
   opts.lang ("zh" | "en") becomes PAD.lang inside the app. */
function lopdaWrapApp(html, opts) {
  var lang = opts && (opts.lang === "zh" || opts.lang === "en") ? opts.lang : null;
  var head = '<meta http-equiv="Content-Security-Policy" content="' + LOPDA_APP_CSP + '">' +
    "<style>*{touch-action:manipulation;-webkit-tap-highlight-color:transparent}</style>" +
    "<script>(" + lopdaPadShim.toString() + ")(" + (lang ? '{"lang":"' + lang + '"}' : "") + ");<\/script>";
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, function (m) { return m + head; });
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, function (m) { return m + "<head>" + head + "</head>"; });
  return "<!doctype html><html><head>" + head + "</head><body>" + html + "</body></html>";
}
