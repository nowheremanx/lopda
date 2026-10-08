/* Lo-PDA service worker. Copyright (c) 2026 Haowei Wu. PolyForm Noncommercial 1.0.0.
 * Shell files: cache first, so the handheld opens offline.
 * Registry index: network first, falling back to the last copy.
 * Fonts: cached the first time they load. */
var VERSION = "lopda-v0.3.0";
var SHELL = ["./", "index.html", "lopda.css", "lopda.js", "platform.js", "../sdk/pad-shim.js",
  "manifest.webmanifest", "vendor/binjgb/binjgb.js", "vendor/binjgb/binjgb.wasm", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  /* cache:"reload" skips the browser's HTTP cache, so a new version never installs stale files */
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.searchParams.has("fresh")) return; /* update checks always go to the network */
  if (url.pathname.endsWith("/registry/index.json")) {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); return res;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  if (url.pathname.indexOf("/registry/apps/") >= 0) return; /* installs go to the network and are hash-checked */
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      var cacheable = res.ok || res.type === "opaque";
      if (cacheable && (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))) {
        var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  }));
});
