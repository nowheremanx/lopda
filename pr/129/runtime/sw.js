/* Lo-PDA service worker. Copyright (c) 2026 Haowei Wu. MIT License.
 * Shell files: cache first, so the handheld opens offline.
 * Registry index: network first, falling back to the last copy.
 * Registry apps: network first (installs are hash-checked); the preinstalled ones fall back to the copy cached here,
 * so a first start without network can still install them.
 * The cache is named after this worker's scope as well as its version: GitHub Pages PR previews (pr/<n>/runtime/)
 * share Cache Storage with the real site, and each worker only ever deletes its own scope's old caches. */
var VERSION = "lopda-v0.49.0+307c7fd";
var CACHE = VERSION + " " + self.registration.scope;
var SHELL = ["./", "index.html", "lopda.css", "strings.js", "platform.js", "lunar.js", "stardict.js", "wordlist.js", "bookparse.js", "textsel.js", "chip.js", "sensors.js", "speech.js", "lenses.js", "finder.js", "negative.js", "exif.js", "geotag.js", "develop.js", "notetext.js", "petsim.js", "petart.js", "petplay.js", "zip.js", "backup.js", "ai.js", "studio-song.js", "studio-synth.js", "studio-tape.js", "wav.js", "vendor/qrcode-generator/qrcode.js", "qr.js", "appsaves.js", "acoustic.js", "acoustic-link.js", "core.js",
  "apps/notes.js", "apps/calendar.js", "apps/dict.js", "apps/reader.js", "apps/camera.js", "apps/darkroom.js", "apps/studio.js", "apps/cart.js", "apps/radio.js", "apps/pet.js", "apps/snap.js", "apps/store.js", "apps/scripts-templates.js", "apps/scripts.js", "apps/settings.js", "boot.js", "../sdk/pad-shim.js",
  "fonts/fonts.css", "vendor/holiday-cn/2026.json",
  "vendor/ecdict/ecdict.ifo", "vendor/ecdict/ecdict.idx", "vendor/ecdict/ecdict.dict.dz", "vendor/ecdict/ecdict.lemma.gz", "vendor/ecdict/ecdict.words.gz",
  "books/lunyu.txt", "books/alice.txt",
  "../registry/index.json", "../registry/apps/calculator/index.html", "../registry/apps/paint/index.html",
  "manifest.webmanifest", "vendor/binjgb/binjgb.js", "vendor/binjgb/binjgb.wasm", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  /* cache:"reload" skips the browser's HTTP cache, so a new version never installs stale files */
  var reload = function (u) { return new Request(u, { cache: "reload" }); };
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL.map(reload)).then(function () {
      /* the font files are the url()s in fonts/fonts.css (one per unicode-range slice) */
      return c.match("fonts/fonts.css").then(function (r) { return r.text(); }).then(function (css) {
        var urls = [], re = /url\(([^)]+)\)/g, m;
        while ((m = re.exec(css))) urls.push("fonts/" + m[1]);
        return c.addAll(urls.map(reload));
      });
    });
  }).then(function () { return self.skipWaiting(); }));
});
/* Caches from before 0.5.0 were named by version alone ("lopda-v0.4.1"); whichever worker activates first clears them. */
function mine(k) { return k !== CACHE && (/^lopda-v[^ ]+$/.test(k) || k.slice(k.indexOf(" ") + 1) === self.registration.scope); }
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(mine).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function cached(req) { return caches.open(CACHE).then(function (c) { return c.match(req); }); }
function keep(req, res) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.searchParams.has("fresh")) return; /* update checks always go to the network */
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith("/registry/index.json")) {
    e.respondWith(fetch(req).then(function (res) { if (res.ok) keep(req, res); return res; }).catch(function () { return cached(req); }));
    return;
  }
  if (url.pathname.indexOf("/registry/apps/") >= 0) {
    e.respondWith(fetch(req).catch(function () { return cached(req).then(function (hit) { return hit || Response.error(); }); }));
    return;
  }
  e.respondWith(cached(req).then(function (hit) {
    return hit || fetch(req).then(function (res) { if (res.ok) keep(req, res); return res; });
  }));
});
