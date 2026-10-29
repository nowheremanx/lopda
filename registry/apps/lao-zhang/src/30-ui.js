/* 矿工老张: DOM screens, the chin buttons, touch, sound and the page loop. */
var GM = (typeof GM !== "undefined" && GM) || {};

GM.ui = (function () {
  var LANG = (typeof PAD !== "undefined" && PAD.lang === "en") ? "en" : "zh";
  var T = GM.text(LANG);
  var state, ctx, cv, ov, introEl, dynBtn, dynIcon, dynCount, foot, lv, cash, tm, bar;
  var last = 0, lastScreen = "", lastHud = "", lastDyn = "", lastFoot = "", lastIntro = "";
  var lastJingleId = 0;

  function $(id) { return document.getElementById(id); }
  function money(n) { return "$" + GM.money(n); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function init(st) {
    state = st;
    cv = $("c");
    ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ov = $("ov");
    introEl = $("intro");
    dynBtn = $("dyn");
    dynIcon = $("dynicon");
    dynCount = $("dyncount");
    foot = $("foot");
    lv = $("lv");
    cash = $("cash");
    tm = $("tm");
    bar = $("barfill");
    document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
    document.title = T.title;
    if (dynIcon && GM.SPR) {
      var dctx = dynIcon.getContext("2d");
      dctx.imageSmoothingEnabled = false;
      dctx.drawImage(GM.spriteCanvas(GM.SPR.dynIcon), 0, 0);
    }
    cv.addEventListener("pointerdown", onCanvas);
    dynBtn.addEventListener("click", onDyn);
    ov.addEventListener("click", onOverlay);
    addEventListener("resize", fit);
    document.addEventListener("visibilitychange", onVis);
    if (typeof PAD !== "undefined" && PAD.on) PAD.on("press", onPad);
    fit();
    updateHud(true);
    updateDyn(true);
    updateFoot(true);
  }

  function setBest(info) {
    var incoming = (info && info.best) || { level: 0, bank: 0 };
    if (!GM.better(state.best, incoming)) state.best = incoming;
    state.bestBlocked = !(info && info.ok);
    state.saveMsg = info && info.corrupt ? T.saveFail : info && info.newer ? T.saveNewer : "";
  }

  function shell(cls, body, footer) {
    return '<div class="sbody ' + cls + '">' + body + '</div><div class="ofoot">' + esc(footer) + "</div>";
  }

  function render(screen) {
    var i, item, have, can, sel, price, rows, best, warn, extra, rec, next, target, short;
    if (screen === "title") {
      best = state.best.level > 0
        ? GM.fmt(T.best, { l: state.best.level, b: GM.money(state.best.bank) })
        : T.noBest;
      warn = state.saveMsg ? '<p class="warn">' + esc(state.saveMsg) + "</p>" : "";
      return shell("center",
        '<canvas id="logo" width="16" height="16" aria-hidden="true"></canvas>' +
        "<h1>" + esc(T.title) + "</h1>" +
        '<p class="sub">' + esc(T.sub) + "</p>" +
        '<p class="tip">' + esc(T.tip) + "</p>" +
        '<button type="button" class="primary" data-act="start">' + esc(T.start) + "</button>" +
        '<p class="best">' + esc(best) + "</p>" + warn,
        T.footTitle);
    }
    if (screen === "paused") {
      return shell("center",
        "<h1>" + esc(T.pause) + "</h1>" +
        "<p>" + esc(GM.fmt(T.level, { n: state.level })) + " · " + esc(GM.fmt(T.shopCash, { b: GM.money(state.bank) })) + "</p>" +
        '<button type="button" class="primary" data-act="resume">' + esc(T.resume) + "</button>",
        T.footPause);
    }
    if (screen === "clear") {
      extra = Math.max(0, state.bank - state.target);
      rec = state.newBest ? '<p class="best">' + esc(T.record) + "</p>" : "";
      return shell("center",
        "<h1>" + esc(T.clear) + "</h1>" +
        '<p class="big cashline">' + esc(GM.fmt(T.clearLine, { b: GM.money(state.bank), t: GM.money(state.target) })) + "</p>" +
        '<p class="small">' + esc(GM.fmt(T.extra, { d: GM.money(extra) })) + "</p>" + rec +
        '<button type="button" class="primary" data-act="shop">' + esc(T.shopBtn) + "</button>",
        T.footClear);
    }
    if (screen === "shop") {
      next = state.level + 1;
      target = GM.targetFor(next);
      rows = "";
      for (i = 0; i < GM.SHOP.length; i++) {
        item = GM.SHOP[i];
        have = state[item.key] || 0;
        can = have < item.max && state.bank >= item.price;
        sel = state.shopCursor === i;
        if (have >= item.max) price = T.max;
        else if (state.bank < item.price) price = GM.fmt(T.shortPrice, { d: GM.money(item.price - state.bank) });
        else price = money(item.price);
        rows += '<button type="button" class="row' + (sel ? " sel" : "") + (can ? "" : " off") + '" data-act="buy" data-i="' + i + '">' +
          '<span class="nm">' + esc(T.shopNames[i]) + " <i>" + esc(GM.fmt(T.owned, { n: have, m: item.max })) + "</i>" +
          "<small>" + esc(T.shopDescs[i]) + "</small></span>" +
          '<span class="pr">' + esc(price) + "</span></button>";
      }
      return shell("shop",
        '<div class="shophead"><b>' + esc(GM.fmt(T.shopTitle, { n: next })) + "</b><span>" +
        esc(GM.fmt(T.shopCash, { b: GM.money(state.bank) })) + "</span></div>" +
        '<p class="small nextline">' + esc(GM.fmt(T.nextTarget, { t: GM.money(target) })) + "</p>" +
        rows +
        '<button type="button" class="next' + (state.shopCursor === 4 ? " sel" : "") + '" data-act="next">' + esc(T.next) + "</button>",
        T.footShop);
    }
    if (screen === "over") {
      short = Math.max(0, state.target - state.bank);
      return shell("center",
        "<h1>" + esc(T.over) + "</h1>" +
        '<p class="big">' + esc(GM.fmt(T.overShort, { d: GM.money(short) })) + "</p>" +
        '<p class="small">' + esc(GM.fmt(T.clearLine, { b: GM.money(state.bank), t: GM.money(state.target) })) + "</p>" +
        '<button type="button" class="primary" data-act="retry">' + esc(T.retry) + "</button>" +
        '<button type="button" class="ghost" data-act="title">' + esc(T.toTitle) + "</button>",
        T.footOver);
    }
    if (screen === "victory") {
      rec = state.newBest ? '<p class="best">' + esc(T.record) + "</p>" : "";
      return shell("center",
        "<h1>" + esc(T.victory) + "</h1>" +
        "<p>" + esc(T.victoryLine) + "</p>" +
        '<p class="big">' + esc(GM.fmt(T.shopCash, { b: GM.money(state.bank) })) + "</p>" + rec +
        '<button type="button" class="primary" data-act="endless">' + esc(T.keep) + "</button>" +
        '<button type="button" class="ghost" data-act="title">' + esc(T.toTitle) + "</button>",
        T.footVictory);
    }
    return "";
  }

  function post(screen) {
    if (screen !== "title") return;
    var logo = $("logo");
    if (!logo) return;
    logo.style.width = "64px";
    logo.style.height = "64px";
    var lctx = logo.getContext("2d");
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(GM.iconCanvas(), 0, 0);
  }

  function enter(screen) {
    if (!state) return;
    lastScreen = screen;
    var full = screen !== "play" && screen !== "intro";
    ov.hidden = !full;
    if (full) {
      ov.innerHTML = render(screen);
      ov.scrollTop = 0;
      post(screen);
    } else {
      ov.innerHTML = "";
    }
    updateFoot(true);
    updateHud(true);
    updateDyn(true);
    updateIntro();
    musicFor(screen);
  }

  function updateHud(force) {
    var sec = Math.ceil(state.time);
    var key = state.screen + "|" + state.level + "|" + state.bank + "|" + state.target + "|" + sec + "|" + (state.bank >= state.target);
    if (!force && key === lastHud) return;
    lastHud = key;
    lv.textContent = GM.fmt(T.level, { n: state.level });
    cash.textContent = money(state.bank) + " / " + GM.money(state.target);
    cash.className = state.bank >= state.target ? "met" : "";
    tm.textContent = GM.fmt(T.time, { n: sec });
    tm.className = sec <= 10 && state.screen === "play" ? "low" : "";
    bar.style.width = Math.max(0, Math.min(100, Math.round(state.bank / (state.target || 1) * 100))) + "%";
  }

  function updateDyn(force) {
    var show = (state.screen === "play" || state.screen === "intro") && state.dynamite > 0;
    if (!show) {
      if (!dynBtn.hidden) dynBtn.hidden = true;
      lastDyn = "";
      return;
    }
    var key = state.dynamite + "|" + (state.hook.item ? 1 : 0) + "|" + state.screen;
    if (!force && key === lastDyn) return;
    lastDyn = key;
    dynBtn.hidden = false;
    dynCount.textContent = "×" + state.dynamite;
    dynBtn.className = state.hook.item ? "on" : "off";
  }

  function updateFoot(force) {
    var text;
    if (state.screen === "play" || state.screen === "intro") text = state.dynamite > 0 ? T.footPlayDyn : T.footPlay;
    else if (state.screen === "paused") text = T.footPause;
    else if (state.screen === "clear") text = T.footClear;
    else if (state.screen === "shop") text = T.footShop;
    else if (state.screen === "over") text = T.footOver;
    else if (state.screen === "victory") text = T.footVictory;
    else text = T.footTitle;
    if (!force && text === lastFoot) return;
    lastFoot = text;
    foot.textContent = text;
  }

  function updateIntro() {
    if (state.screen !== "intro") {
      if (!introEl.hidden) introEl.hidden = true;
      lastIntro = "";
      return;
    }
    var tip = state.level === 1 ? T.tip1 : state.level === 4 ? T.tip4 : state.level === 7 ? T.tip7 : T.tipDefault;
    var html = "<b>" + esc(GM.fmt(T.intro, { n: state.level, t: GM.money(state.target) })) + "</b><span>" + esc(tip) + "</span>";
    if (html === lastIntro) return;
    lastIntro = html;
    introEl.innerHTML = html;
    introEl.hidden = false;
  }

  function sfx(sound) {
    if (typeof PAD === "undefined" || !PAD.sfx) return;
    try { PAD.sfx(sound); }
    catch (e) { try { if (typeof sound !== "string") PAD.sfx("hit"); } catch (e2) {} }
  }

  function pump() {
    var n = 0;
    while (state.events.length && n++ < 60) {
      var ev = state.events.shift();
      if (ev === "fire") sfx("tap");
      else if (ev === "grab") sfx("hit");
      else if (ev === "coin") sfx("coin");
      else if (ev === "gem") sfx(GM.SFX.chime);
      else if (ev === "junk") sfx("miss");
      else if (ev === "boom") sfx(GM.SFX.boom);
      else if (ev === "tick") sfx("tick");
      else if (ev === "clear") sfx("win");
      else if (ev === "fail") sfx("lose");
      else if (ev === "buy") sfx("ok");
      else if (ev === "err") sfx("err");
      else if (ev === "move") sfx("move");
      if (ev === "clear" || ev === "fail") saveBest();
    }
  }

  function saveBest() {
    if (!state.bestDirty || state.bestBlocked) return;
    if (typeof PAD === "undefined" || !PAD.save) return;
    try {
      var r = PAD.save("best", GM.bestPayload(state));
      if (r && typeof r.catch === "function") {
        r.catch(function () { state.bestBlocked = true; state.saveMsg = T.saveWrite; });
      }
      try { if (PAD.setSchema) PAD.setSchema(1); } catch (e) {}
      state.bestDirty = false;
    } catch (e) {
      state.bestBlocked = true;
      state.saveMsg = T.saveWrite;
    }
  }

  function musicFor(screen) {
    if (typeof PAD === "undefined" || !PAD.music) return;
    if (screen === "intro") {
      if (state.jingleId !== lastJingleId) {
        lastJingleId = state.jingleId;
        try { PAD.music.play(GM.JINGLE, { loop: false }); } catch (e) {}
      }
    } else if (screen !== "play") {
      try { PAD.music.stop(); } catch (e) {}
    }
  }

  function startRun() {
    GM.startRun(state);
    enter(state.screen);
  }

  function openShop() {
    GM.openShop(state);
    enter("shop");
  }

  function shopNext() {
    GM.shopNext(state);
    pump();
    enter(state.screen);
  }

  function onCanvas(e) {
    if (state.screen === "play") {
      GM.fire(state);
      pump();
    } else if (state.screen === "intro") {
      state.introT = 0;
    }
    e.preventDefault();
  }

  function onDyn(e) {
    if (state.screen !== "play") return;
    if (!GM.useDynamite(state)) sfx("err");
    pump();
    e.preventDefault();
  }

  function onOverlay(e) {
    var el = e.target;
    while (el && el !== ov && !(el.getAttribute && el.getAttribute("data-act"))) el = el.parentNode;
    if (!el || el === ov) return;
    var act = el.getAttribute("data-act");
    var i = +(el.getAttribute("data-i") || 0);
    if (act === "start" || act === "retry") startRun();
    else if (act === "resume") { GM.resume(state); enter(state.screen); }
    else if (act === "shop" || act === "endless") openShop();
    else if (act === "buy") { GM.buy(state, i); pump(); enter("shop"); }
    else if (act === "next") shopNext();
    else if (act === "title") { GM.toTitle(state); enter("title"); }
    e.preventDefault();
  }

  function onPad(btn) {
    var s = state.screen;
    if (s === "title") {
      if (btn === "a" || btn === "start") startRun();
      return;
    }
    if (s === "intro") {
      if (btn === "a") { state.introT = 0; return; }
      if (btn === "start" && GM.pause(state)) enter("paused");
      return;
    }
    if (s === "play") {
      if (btn === "a") { GM.fire(state); pump(); }
      else if (btn === "b" && state.dynamite > 0) {
        if (!GM.useDynamite(state)) sfx("err");
        pump();
      } else if (btn === "start" && GM.pause(state)) enter("paused");
      return;
    }
    if (s === "paused") {
      if (btn === "a" || btn === "start") { GM.resume(state); enter(state.screen); }
      return;
    }
    if (s === "clear") {
      if (btn === "a" || btn === "start") openShop();
      return;
    }
    if (s === "shop") {
      if (btn === "up") { GM.moveShop(state, -1); pump(); enter("shop"); }
      else if (btn === "down") { GM.moveShop(state, 1); pump(); enter("shop"); }
      else if (btn === "a" || btn === "start") {
        if (state.shopCursor === 4) shopNext();
        else { GM.buy(state, state.shopCursor); pump(); enter("shop"); }
      } else if (btn === "b") shopNext();
      return;
    }
    if (s === "over") {
      if (btn === "a" || btn === "start") startRun();
      else if (btn === "b") { GM.toTitle(state); enter("title"); }
      return;
    }
    if (s === "victory") {
      if (btn === "a" || btn === "start") openShop();
      else if (btn === "b") { GM.toTitle(state); enter("title"); }
    }
  }

  function onVis() {
    if (document.hidden && (state.screen === "play" || state.screen === "intro") && GM.pause(state)) enter("paused");
  }

  function fit() {
    if (!cv) return;
    var stage = $("stage");
    var aw = stage.clientWidth - 12, ah = stage.clientHeight - 12;
    if (aw < 40 || ah < 40) return;
    var k = Math.min(aw / GM.BW, ah / GM.BH);
    var dpr = window.devicePixelRatio || 1;
    var kk = Math.floor(k * dpr) / dpr;
    if (kk < k * 0.9) kk = k;
    kk = Math.max(0.75, kk);
    cv.style.width = Math.round(GM.BW * kk) + "px";
    cv.style.height = Math.round(GM.BH * kk) + "px";
  }

  function loop(now) {
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (state.screen === "play" || state.screen === "intro") {
      GM.update(state, dt);
      pump();
      if (state.screen !== lastScreen) enter(state.screen);
      if (state.screen === "play" || state.screen === "intro") {
        updateHud();
        updateDyn();
        updateFoot();
        updateIntro();
        GM.draw(ctx, state);
      }
    } else if (state.screen !== lastScreen) {
      enter(state.screen);
    }
    requestAnimationFrame(loop);
  }

  return {
    init: init,
    setBest: setBest,
    enter: enter,
    loop: loop,
    fit: fit,
    pump: pump,
    lang: LANG,
    text: T
  };
})();
