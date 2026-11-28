/* 矿工老张: DOM screens, the chin buttons, touch, sound and the page loop. */
var GM = (typeof GM !== "undefined" && GM) || {};

GM.ui = (function () {
  var LANG = (typeof PAD !== "undefined" && PAD.lang === "en") ? "en" : "zh";
  var T = GM.text(LANG);
  var state, ctx, cv, ov, introEl;
  var last = 0, lastScreen = "", lastIntro = "";
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
    /* the scoreboard is painted in the sky above the mine (src/22-hud.js), in this language */
    GM.hudT = T;
    document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
    document.title = T.title;
    cv.addEventListener("pointerdown", onCanvas);
    ov.addEventListener("click", onOverlay);
    addEventListener("resize", fit);
    document.addEventListener("visibilitychange", onVis);
    if (typeof PAD !== "undefined" && PAD.on) PAD.on("press", onPad);
    fit();
  }

  function setBest(info) {
    var incoming = (info && info.best) || { level: 0, bank: 0 };
    if (!GM.better(state.best, incoming)) state.best = incoming;
    state.bestBlocked = !(info && info.ok);
    state.saveMsg = info && info.corrupt ? T.saveFail : info && info.newer ? T.saveNewer : "";
  }

  function setRun(info) {
    state.run = (info && info.run) || null;
    state.runBlocked = !(info && info.ok);
    state.runMsg = info && info.corrupt ? T.runFail : info && info.newer ? T.runNewer : "";
    state.runDirty = false;
    if (state.run) state.menuCursor = 0;
    else if (state.menuCursor === 0) state.menuCursor = 1;
  }

  function saveRun() {
    if (!state.runDirty || state.runBlocked) return;
    if (typeof PAD === "undefined") return;
    try {
      if (state.run) {
        if (PAD.save) PAD.save("run", GM.runPayload(state));
        if (PAD.setSchema) PAD.setSchema(1);
      } else if (PAD.remove) {
        PAD.remove("run");
      }
      state.runDirty = false;
    } catch (e) {
      state.runBlocked = true;
      state.runMsg = T.runWrite;
    }
  }

  function row(sel, act, name, sub, off) {
    return '<button type="button" class="mrow' + (sel ? " sel" : "") + (off ? " off" : "") + '" data-act="' + act + '">' +
      "<b>" + esc(name) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</button>";
  }

  function codexValue(type) {
    var it = GM.ITEMS[type];
    if (type === "bag") return T.codexRandom;
    if (type === "tnt" || type === "mine" || type === "sealed") return T.codexBoom;
    if (type === "mole") return T.codexMole;
    return money(it.value);
  }

  function codexWeight(type) {
    var w = GM.ITEMS[type].weight;
    return w <= 1 ? T.codexLight : w <= 2.4 ? T.codexMid : T.codexHeavy;
  }

  function shell(cls, body, footer) {
    return '<div class="sbody ' + cls + '">' + body + '</div><div class="ofoot">' + esc(footer) + "</div>";
  }

  /* what the title menu shows: continue (only with a run in progress, its level and cash on the bar while it is
     chosen), new run, the codex; the record or a save warning on the bar otherwise. The menu's index is not
     state.menuCursor (0 continue, 1 new, 2 codex): without a run the menu starts at new. */
  function titleOffset() { return state.run ? 0 : 1; }
  function titleSpec() {
    /* a run that ended on level 1 still has its cash on record (recordBest keeps level 0 with a bank) */
    var best = state.best.level > 0
      ? GM.fmt(T.best, { l: state.best.level, b: GM.money(state.best.bank) })
      : state.best.bank > 0 ? GM.fmt(T.bestNoClear, { b: GM.money(state.best.bank) })
      : T.noBest;
    /* with a run on record, a new game throws it away (the confirm screen says so): 重新开始; without one, 新游戏 */
    var items = [{ label: state.run ? T.menuNew : T.menuFresh }, { label: T.menuCodex }];
    if (state.run) items.unshift({ label: T.menuContinue, status: GM.fmt(T.menuContinueAt, { n: state.run.level, b: GM.money(state.run.bank) }) });
    return {
      items: items,
      index: Math.max(0, state.menuCursor - titleOffset()),
      note: state.saveMsg || state.runMsg || best,
      hint: T.titleHint
    };
  }

  function render(screen) {
    var i, item, have, can, sel, price, rows, best, warn, extra, rec, next, target, short;
    if (screen === "title") {
      /* the shared title screen (sdk/lo-title.js): post("title") mounts it on this canvas; the menu turns by
         itself, so a cursor move does not redraw the screen */
      return '<canvas id="tt" class="lotitle"></canvas><h1 class="vh">' + esc(T.title) + "</h1>";
    }
    if (screen === "paused") {
      return shell("center",
        "<h1>" + esc(T.pause) + "</h1>" +
        "<p>" + esc(GM.fmt(T.level, { n: state.level })) + " · " + esc(GM.fmt(T.shopCash, { b: GM.money(state.bank) })) + "</p>" +
        '<div class="menu">' +
          row(state.pauseCursor === 0, "resume", T.resume, "", false) +
          row(state.pauseCursor === 1, "pauseTitle", T.pauseMenu, "", false) +
        "</div>",
        T.pauseFoot);
    }
    if (screen === "confirm") {
      var runLevel = state.run ? state.run.level : 1;
      return shell("center",
        "<h1>" + esc(T.confirmTitle) + "</h1>" +
        "<p>" + esc(GM.fmt(T.confirmText, { n: runLevel })) + "</p>" +
        '<div class="menu">' +
          row(state.confirmCursor === 0, "menu", T.confirmCancel, "", false) +
          row(state.confirmCursor === 1, "restartRun", T.confirmRestart, "", false) +
        "</div>",
        T.confirmFoot);
    }
    if (screen === "codex") {
      var cells = "";
      for (i = 0; i < GM.ITEM_ORDER.length; i++) {
        var ct = GM.ITEM_ORDER[i];
        /* the mole's line is long: it takes the whole last row, its picture beside the words */
        var wide = ct === "mole";
        cells += '<div class="ccell' + (wide ? " wide" : "") + '">' +
          '<canvas width="32" height="32" data-item="' + ct + '" aria-hidden="true"></canvas>' +
          "<div><b>" + esc(T.codexNames[i]) + "</b>" +
          "<span>" + esc(codexValue(ct)) + "</span>" +
          "<em>" + esc(codexWeight(ct)) + "</em></div></div>";
      }
      /* no on-screen back button: B goes back, and the key line under the page already says so */
      return shell("codex",
        "<h1>" + esc(T.codexTitle) + "</h1>" +
        '<p class="small">' + esc(T.codexHint) + "</p>" +
        '<div class="cgrid">' + cells + "</div>",
        T.codexFoot);
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
      var offers = state.shopOffers && state.shopOffers.length ? state.shopOffers : GM.shopOffers(state, next);
      for (i = 0; i < offers.length; i++) {
        item = offers[i];
        have = state[item.key] || 0;
        var bought = (state.shopBought && state.shopBought[item.key]) || 0;
        var capped = item.max != null && bought >= item.max;
        can = item.available && !capped && state.bank >= item.price;
        sel = state.shopCursor === i;
        if (!item.available) price = T.soldOut;
        else if (capped) price = T.shopBought;
        else if (state.bank < item.price) price = GM.fmt(T.shortPrice, { d: GM.money(item.price - state.bank) });
        else price = money(item.price) + (item.priceUp ? " " + T.priceUp : "");
        var ownedText = item.max == null || item.key === "dynamite"
          ? GM.fmt(T.ownedMany, { n: have })
          : GM.fmt(T.owned, { n: have, m: item.max });
        rows += '<button type="button" class="row' + (sel ? " sel" : "") + (can ? "" : " off") + '" data-act="buy" data-i="' + i + '">' +
          '<canvas class="sic" width="16" height="16" data-icon="' + ["dynIcon", "shopStrength", "shopClover", "shopBook"][i] + '" aria-hidden="true"></canvas>' +
          '<span class="nm">' + esc(T.shopNames[i]) + " <i>" + esc(ownedText) + "</i>" +
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
        '<p class="small">' + esc(T.overRun) + "</p>" +
        '<div class="menu">' +
          row(state.endCursor !== 1, "retry", T.retry, "", false) +
          row(state.endCursor === 1, "title", T.toTitle, "", false) +
        "</div>",
        T.footOver);
    }
    if (screen === "victory") {
      rec = state.newBest ? '<p class="best">' + esc(T.record) + "</p>" : "";
      return shell("center",
        "<h1>" + esc(T.victory) + "</h1>" +
        "<p>" + esc(T.victoryLine) + "</p>" +
        '<p class="big">' + esc(GM.fmt(T.shopCash, { b: GM.money(state.bank) })) + "</p>" + rec +
        '<div class="menu">' +
          row(state.endCursor !== 1, "endless", T.keep, "", false) +
          row(state.endCursor === 1, "title", T.toTitle, "", false) +
        "</div>",
        T.footVictory);
    }
    return "";
  }

  function post(screen) {
    var i, c, spr;
    if (screen === "title") {
      mountTitle();
      return;
    }
    if (screen === "shop") {
      var icons = ov.querySelectorAll("canvas[data-icon]");
      for (i = 0; i < icons.length; i++) {
        c = icons[i];
        spr = GM.SPR[c.getAttribute("data-icon")];
        if (!spr) continue;
        GM.paintSprite(c, spr, GM.MID, false);
      }
    }
    if (screen === "codex") {
      var items = ov.querySelectorAll("canvas[data-item]");
      for (i = 0; i < items.length; i++) {
        c = items[i];
        var type = c.getAttribute("data-item");
        spr = GM.SPR[type === "mole" ? "moleIcon" : type];
        if (!spr) continue;
        GM.paintSprite(c, spr, GM.DARK, true);
      }
    }
  }

  /* The title screen: the picture, the name painted over its sky and the menu, all drawn by sdk/lo-title.js */
  var titleMenu = null, titleArt = null;
  /* lo-title's default is 6 LCD pixels a font pixel; the owner asked for one step smaller on a phone (PR #517) */
  var TITLE_MAX_SCALE = 5;
  function mountTitle() {
    /* coming back from pause or the end screen replaces the canvas, so the old menu's resize listener and its
       full-screen buffers must go with it (lo-title 0.1.1's destroy) */
    if (titleMenu) { titleMenu.destroy(); titleMenu = null; }
    var c = $("tt");
    if (!c || typeof LoTitle === "undefined") return;
    if (!titleArt) titleArt = { w: GM.titleArt.W, h: GM.titleArt.H, px: GM.titleArt.draw(LANG, true) };
    var spec = titleSpec(), name = GM.titleArt.words(LANG);
    spec.art = titleArt;
    /* the name on the sky left of the winch; the fog may cover the picture from the claw on the nugget down */
    spec.title = { text: name.text, sub: name.sub, x: 17, y: 6, w: 86 };
    spec.calm = 141;
    /* one step under lo-title's own cap: at 6 the chosen word on a phone ran almost the whole screen wide and read
       too large (owner, PR #517); 5 keeps it the one big thing without crowding the name and the bar. The shorter
       menu makes menuStart() drop the fog top and the neighbour words a few pixels lower; the bar stays put. */
    spec.maxScale = TITLE_MAX_SCALE;
    spec.onMove = function (i) { state.menuCursor = i + titleOffset(); sfx("move"); };
    spec.onPick = function (i) { state.menuCursor = i + titleOffset(); chooseMenu(); };
    titleMenu = LoTitle.mount(c, spec);
  }

  function enter(screen) {
    if (!state) return;
    var prev = lastScreen;
    lastScreen = screen;
    var full = screen !== "play" && screen !== "intro";
    ov.hidden = !full;
    if (full) {
      /* a cursor move redraws the same screen: keep where its list was scrolled, then bring the cursor's row
         into view (UI.md 5: the cursor is always on the screen; the English shop is taller than 359 px) */
      var body = ov.querySelector(".sbody"), top = prev === screen && body ? body.scrollTop || 0 : 0;
      ov.innerHTML = render(screen);
      ov.scrollTop = 0;
      body = ov.querySelector(".sbody");
      if (body) {
        body.scrollTop = top;
        var cur = body.querySelector(".sel");
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
      }
      post(screen);
    } else {
      ov.innerHTML = "";
    }
    updateIntro();
    musicFor(screen);
    saveRun();
  }

  function updateIntro() {
    if (state.screen !== "intro") {
      if (!introEl.hidden) introEl.hidden = true;
      lastIntro = "";
      return;
    }
    var tip = state.level === 1 ? T.tip1 : state.level === 2 ? T.tip2
      : state.level === 3 ? T.tip4 : state.level === 4 ? T.tipMine
      : state.level === 5 ? T.tip7 : state.level === 6 ? T.tip6
      : state.level === 7 ? T.tipChain : state.level === 9 ? T.tipBig
      : state.level === 11 ? T.tipWang : T.tipDefault;
    var buff = [];
    if (state.strength) buff.push(T.buffNames[0]);
    if (state.clover) buff.push(T.buffNames[1]);
    if (state.book) buff.push(T.buffNames[2]);
    /* the keys are taught here, while the level opens: during play the whole screen is the mine */
    var html = "<b>" + esc(GM.fmt(T.intro, { n: state.level, t: GM.money(state.target) })) + "</b><span>" + esc(tip) + "</span>" +
      (buff.length ? "<span>" + esc(GM.fmt(T.buffIntro, { b: buff.join(" · ") })) + "</span>" : "") +
      '<span class="keys">' + esc(GM.footPlayText(LANG, state.dynamite > 0 ? state.dynamite : 0)) + "</span>";
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
      else if (ev === "throw") sfx(GM.SFX.throw);
      else if (ev === "grab") { sfx(GM.SFX.grab); sfx(GM.SFX.grabBody); }
      else if (ev === "coin") sfx(GM.SFX.coin);
      else if (ev === "gem") sfx(GM.SFX.chime);
      else if (ev === "junk") sfx("miss");
      else if (ev === "boom") sfx(GM.SFX.boom);
      else if (ev === "bigboom") sfx(GM.SFX.bigboom);
      else if (ev === "chain") sfx(GM.SFX.chain);
      else if (ev === "mine") sfx(GM.SFX.mine);
      else if (ev === "clank") sfx(GM.SFX.clank);
      else if (ev === "rivalFire") sfx(GM.SFX.rivalFire);
      else if (ev === "rivalGrab") sfx(GM.SFX.grabBody);
      else if (ev === "rivalTaunt") sfx(GM.SFX.taunt);
      else if (ev === "rivalBoom") sfx(GM.SFX.boom);
      else if (ev === "rivalMine") sfx(GM.SFX.mine);
      else if (ev === "rivalClank") sfx(GM.SFX.clank);
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

  function continueGame() {
    if (!state.run) { sfx("err"); return; }
    GM.continueRun(state);
    pump();
    enter(state.screen);
  }

  function newGame() {
    if (state.run) {
      state.screen = "confirm";
      state.confirmCursor = 0;
      enter("confirm");
    } else {
      GM.startRun(state);
      pump();
      enter(state.screen);
    }
  }

  function openCodex() {
    state.screen = "codex";
    enter("codex");
  }

  function chooseMenu() {
    if (state.loading) return;
    if (state.menuCursor === 0) continueGame();
    else if (state.menuCursor === 1) newGame();
    else openCodex();
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

  function onOverlay(e) {
    var el = e.target;
    while (el && el !== ov && !(el.getAttribute && el.getAttribute("data-act"))) el = el.parentNode;
    if (!el || el === ov) return;
    var act = el.getAttribute("data-act");
    var i = +(el.getAttribute("data-i") || 0);
    var prev = state.screen;
    if ((act === "continue" || act === "new" || act === "codex") && state.loading) { e.preventDefault(); return; }
    if (act === "continue") continueGame();
    else if (act === "new") newGame();
    else if (act === "codex") openCodex();
    else if (act === "restartRun") { GM.startRun(state); pump(); enter(state.screen); }
    else if (act === "retry") startRun();
    else if (act === "resume") { GM.resume(state); enter(state.screen); }
    else if (act === "menu" || act === "pauseTitle" || act === "title") {
      GM.toTitle(state);
      if (prev === "codex") state.menuCursor = 2;
      enter("title");
    }
    else if (act === "shop" || act === "endless") openShop();
    else if (act === "buy") { GM.buy(state, i); pump(); enter("shop"); }
    else if (act === "next") shopNext();
    e.preventDefault();
  }

  function onPad(btn) {
    var s = state.screen;
    if (s === "title") {
      if (titleMenu) titleMenu.press(btn);
      return;
    }
    if (s === "confirm") {
      if (btn === "up" || btn === "down") {
        state.confirmCursor = 1 - state.confirmCursor;
        sfx("move");
        enter("confirm");
        return;
      }
      if (btn === "a" || btn === "start") {
        if (state.confirmCursor === 0) {
          GM.toTitle(state);
          enter("title");
        } else {
          GM.startRun(state);
          pump();
          enter(state.screen);
        }
      } else if (btn === "b") {
        GM.toTitle(state);
        enter("title");
      }
      return;
    }
    if (s === "codex") {
      if (btn === "a" || btn === "b" || btn === "start") {
        GM.toTitle(state);
        state.menuCursor = 2;
        enter("title");
      }
      return;
    }
    if (s === "intro") {
      if (btn === "a") { state.introT = 0; return; }
      if (btn === "start" && GM.pause(state)) enter("paused");
      return;
    }
    if (s === "play") {
      if (btn === "a") { GM.fire(state); pump(); }
      else if (btn === "b") {
        /* with no stick in the pack B still answers, so the key never feels dead */
        if (!GM.useDynamite(state)) sfx("err");
        pump();
      } else if (btn === "start" && GM.pause(state)) enter("paused");
      return;
    }
    if (s === "paused") {
      if (btn === "up" || btn === "down") {
        state.pauseCursor = 1 - state.pauseCursor;
        sfx("move");
        enter("paused");
        return;
      }
      /* START always resumes, as the footer says; only A acts on the cursor (#344) */
      if (btn === "start" || (btn === "a" && state.pauseCursor === 0)) { GM.resume(state); enter(state.screen); }
      else if (btn === "a") { GM.toTitle(state); enter("title"); }
      else if (btn === "b") {
        GM.resume(state);
        enter(state.screen);
      }
      return;
    }
    if (s === "clear") {
      if (btn === "a" || btn === "start") openShop();
      return;
    }
    if (s === "shop") {
      if (btn === "up") { GM.moveShop(state, -1); pump(); enter("shop"); }
      else if (btn === "down") { GM.moveShop(state, 1); pump(); enter("shop"); }
      /* only A buys, as the footer says; START goes on to the next level like B, so a stray press spends nothing */
      else if (btn === "a") {
        if (state.shopCursor === 4) shopNext();
        else { GM.buy(state, state.shopCursor); pump(); enter("shop"); }
      } else if (btn === "b" || btn === "start") shopNext();
      return;
    }
    /* the end screens are a two-row menu like the pause menu: up and down move, A takes the chosen row,
       START takes the first (play on), B goes to the title */
    if (s === "over" || s === "victory") {
      if (btn === "up" || btn === "down") {
        state.endCursor = state.endCursor === 1 ? 0 : 1;
        sfx("move");
        enter(s);
      } else if (btn === "b" || (btn === "a" && state.endCursor === 1)) {
        state.endCursor = 0;
        GM.toTitle(state); enter("title");
      } else if (btn === "a" || btn === "start") {
        state.endCursor = 0;
        if (s === "over") startRun(); else openShop();
      }
    }
  }

  function onVis() {
    if (document.hidden && (state.screen === "play" || state.screen === "intro") && GM.pause(state)) enter("paused");
  }

  /* the canvas fills the stage: 320 columns across the width, as many rows as the height allows; the mine keeps
     its 320 x 288 and the rows left over become sky and bedrock (GM.frameLayout) */
  var fitW = 0, fitH = 0, stageEl = null;
  function fit() {
    if (!cv) return;
    var stage = stageEl || (stageEl = $("stage")), r = stage.getBoundingClientRect(), w = r.width, h = r.height;
    fitW = stage.clientWidth; fitH = stage.clientHeight;
    if (w < 40 || h < 40) return;
    var L = GM.frameLayout(w, h);
    if (cv.width !== L.W) cv.width = L.W;
    if (cv.height !== L.H) cv.height = L.H;
    GM.setLayout(L);
    /* exact sizes, not rounded: a rounded width left a line of paper down each side on an iPhone */
    cv.style.width = (L.W * L.k) + "px";
    cv.style.height = (L.H * L.k) + "px";
    if (state && (state.screen === "play" || state.screen === "intro")) GM.draw(ctx, state);
  }

  function loop(now) {
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    /* the handheld can size this page after it starts (on an iPhone the chin pad and the safe areas settle late)
       and a resize event does not always follow; a stage that changed size is fitted again here, or the mine
       stays as small as the first, unsettled size and leaves paper at both sides */
    if (stageEl && (stageEl.clientWidth !== fitW || stageEl.clientHeight !== fitH)) fit();
    if (state.screen === "play" || state.screen === "intro") {
      GM.update(state, dt);
      pump();
      if (state.screen !== lastScreen) enter(state.screen);
      if (state.screen === "play" || state.screen === "intro") {
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
    setRun: setRun,
    enter: enter,
    loop: loop,
    fit: fit,
    pump: pump,
    lang: LANG,
    text: T
  };
})();
