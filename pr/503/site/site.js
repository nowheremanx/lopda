/* Lo-PDA website: the top bar every page shares, and the page language.
 *
 * A page loads site/site.css in its head and puts this script where the bar goes:
 *   <script src="site/site.js" data-root="" data-page="home"></script>          (the landing page)
 *   <script src="../site/site.js" data-root="../" data-page="gallery"></script>  (a page one folder down)
 * data-root leads back to the site's root; data-page marks the current page in the bar ("home", "gallery", "events").
 * The script writes the bar in place while the page loads, so it never flashes in late.
 *
 * The language: the visitor's choice (kept in localStorage) wins, else the phone's. window.LopdaSite.lang is "en" or
 * "zh"; LopdaSite.onLang(fn) calls fn(lang) after each switch, so the page redraws its own text. The bar's button switches.
 * To add a page to the bar, add it to LINKS below; every page picks it up. MIT License, see LICENSE.
 */
(function () {
  var me = document.currentScript, root = me.getAttribute("data-root") || "", page = me.getAttribute("data-page") || "";
  var KEY = "lopda-landing-lang";
  var T = {
    en: { home: "Home", gallery: "Gallery", events: "Events", open: "Open", lang: "中文" },
    zh: { home: "首页", gallery: "精选", events: "活动", open: "打开", lang: "EN" }
  };
  /* [label key, where it goes, the page it is]: the site's pages only. The landing page's sections had links here too
     (camera, inside, apps, make an app), but a bar of eight items was too busy and did not fit a phone (owner,
     2026-11-26); the landing page is one scroll. Home is spelled out: not everyone knows the mark leads back
     (owner, 2026-11-26). */
  var LINKS = [["home", "", "home"], ["gallery", "gallery/", "gallery"], ["events", "events/", "events"]];

  var lang = null;
  try { lang = localStorage.getItem(KEY); } catch (e) {}
  if (lang !== "zh" && lang !== "en") lang = /^zh/i.test(navigator.language || "") ? "zh" : "en";
  document.documentElement.lang = lang === "zh" ? "zh" : "en";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var html = '<nav class="site"><div class="in"><a class="mark" href="' + esc(page === "home" ? "#top" : root || "./") + '">LO-PDA</a>';
  LINKS.forEach(function (l) {
    var href = l[2] === page ? (page === "home" ? "#top" : "./") : root + l[1] || "./";
    html += '<a class="l" data-k="' + l[0] + '" href="' + esc(href) + '"' + (l[2] && l[2] === page ? ' aria-current="page"' : "") + ">" + esc(T[lang][l[0]]) + "</a>";
  });
  html += '<a class="l gh" href="https://github.com/nowheremanx/lopda">GitHub</a>' +
    '<button class="lang" type="button" id="lang">' + esc(T[lang].lang) + "</button>" +
    '<a class="open" data-k="open" href="' + esc(root + "runtime/") + '">' + esc(T[lang].open) + "</a></div></nav>";
  me.insertAdjacentHTML("beforebegin", html);
  var nav = me.previousElementSibling, listeners = [];

  function setLang(l) {
    lang = l === "zh" ? "zh" : "en";
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    document.documentElement.lang = lang;
    var ks = nav.querySelectorAll("[data-k]");
    for (var i = 0; i < ks.length; i++) ks[i].textContent = T[lang][ks[i].getAttribute("data-k")];
    nav.querySelector(".lang").textContent = T[lang].lang;
    site.lang = lang;
    listeners.forEach(function (fn) { fn(lang); });
  }
  nav.querySelector(".lang").addEventListener("click", function () { setLang(lang === "zh" ? "en" : "zh"); });
  var site = window.LopdaSite = { lang: lang, setLang: setLang, onLang: function (fn) { listeners.push(fn); } };
})();
