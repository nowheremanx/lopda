/* Evening service: four tables, a clock, and a finite number of portions. */
var SERV = null;

function clk(min) {
  var h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}
function tablePos(i) {
  return ART.TABLES[i];
}
function seatPos(i) {
  var p = tablePos(i);
  return { x: p[0] + 16, y: p[1] - 20 };
}
function randomDish() {
  if (!S.menu.length) return null;
  var total = 0, i;
  for (i = 0; i < S.menu.length; i++) total += DATA.DISHES[S.menu[i]].appeal;
  var r = Math.random() * total;
  for (i = 0; i < S.menu.length; i++) {
    r -= DATA.DISHES[S.menu[i]].appeal;
    if (r <= 0) return S.menu[i];
  }
  return S.menu[S.menu.length - 1];
}
function bestDish() {
  var best = null;
  for (var i = 0; i < S.menu.length; i++) {
    if (!best || DATA.DISHES[S.menu[i]].price > DATA.DISHES[best].price) best = S.menu[i];
  }
  return best;
}
function hasDish(id) { return S.menu.indexOf(id) >= 0; }

function makeCustomer(dish, who) {
  var pat = (who ? 22 : 17) + (hasUpgrade("table") ? 4 : 0);
  return {
    dish: dish, who: who || null, state: "queue", seat: -1,
    patience: pat, maxPatience: pat,
    x: 202, y: 132, fx: 202, fy: 132, tx: 202, ty: 132, t: 1,
    eatT: 0, variant: Math.floor(Math.random() * 3)
  };
}

function buildSchedule() {
  var list = [];
  var n = serveCount();
  var first = 18 * 60 + 10, span = 200;
  for (var i = 0; i < n; i++) {
    var dish = randomDish();
    if (!dish) break;
    list.push({ time: first + Math.round(i * span / n) + rnd(-3, 3), dish: dish, who: null });
  }
  function add(who, dish, time) {
    if (!dish) return;
    list.push({ time: time, dish: dish, who: who });
  }
  if (S.day === 1 && !seen("svc_ahe")) add("ahe", hasDish("mushroom_soup") ? "mushroom_soup" : bestDish(), 19 * 60);
  if (S.day === 2 && !seen("svc_zhou")) add("zhou", hasDish("grilled_fish") ? "grilled_fish" : bestDish(), 19 * 60 + 20);
  if (S.day === 3 && !seen("svc_yan")) add("yan", hasDish("pork") ? "pork" : hasDish("bamboo_pork") ? "bamboo_pork" : bestDish(), 20 * 60);
  if (S.day === 5 && !seen("svc_critic")) add("critic", hasDish("mushroom_pot") ? "mushroom_pot" : bestDish(), 20 * 60);
  if (S.day === 7) {
    add("po", hasDish("god_soup") ? "god_soup" : bestDish(), 18 * 60 + 30);
    add("zhou", hasDish("grilled_fish") ? "grilled_fish" : bestDish(), 19 * 60 + 30);
    add("ahe", hasDish("mushroom_soup") ? "mushroom_soup" : bestDish(), 20 * 60 + 30);
  }
  list.sort(function (a, b) { return a.time - b.time; });
  return list;
}

function freeSeat() {
  for (var i = 0; i < SERV.seats; i++) if (!SERV.tables[i]) return i;
  return -1;
}
function seatCustomer(c, seat) {
  var p = seatPos(seat);
  c.seat = seat;
  c.state = "sit";
  c.fx = c.x; c.fy = c.y;
  c.tx = p.x; c.ty = p.y;
  c.t = 0;
  SERV.tables[seat] = c;
}
function queueCustomer(c) {
  if (SERV.queue.length >= (2 + (hasUpgrade("table") ? 1 : 0))) { lostCustomer(c, "门口排不下了"); return; }
  c.state = "queue";
  c.x = 202; c.y = 132 + SERV.queue.length * 18;
  c.fx = c.x; c.fy = c.y;
  c.t = 1;
  SERV.queue.push(c);
  SERV.customers.push(c);
}
function lostCustomer(c, msg) {
  SERV.lost++;
  SERV.repDelta--;
  if (c.who) {
    if (S.day === 7) S.flags.vipFail = (S.flags.vipFail || 0) + 1;
    SERV.storyQueue.push({ who: c.who, dish: c.dish, lost: true });
  }
  if (msg) sayToast(msg);
}
function payCustomer(c) {
  var d = DATA.DISHES[c.dish];
  if (!d) return;
  var tip = 1 + (c.patience > c.maxPatience * 0.5 ? 1 : 0) + (c.who ? 1 : 0);
  S.money += d.price + tip;
  SERV.earned += d.price;
  SERV.tips += tip;
  SERV.served++;
  SERV.repDelta++;
  sayToast("+" + (d.price + tip) + " 文");
  var fp = c.seat >= 0 ? seatPos(c.seat) : { x: c.x, y: c.y };
  SERV.fx.push({ text: "+" + (d.price + tip) + "文", x: fp.x, y: fp.y - 18, until: game.time + 1.2 });
  if (tip > 1) SERV.fx.push({ text: "好", x: fp.x + 28, y: fp.y - 20, until: game.time + 1.2 });
  if (S.day === 7 && c.who) {
    if (!S.flags["vip_" + c.who]) {
      var ok = (c.who === "po" && c.dish === "god_soup") || (c.who === "zhou" && c.dish === "grilled_fish") || (c.who === "ahe" && c.dish === "mushroom_soup");
      if (ok) S.flags.vip = (S.flags.vip || 0) + 1;
      else S.flags.vipFail = (S.flags.vipFail || 0) + 1;
      S.flags["vip_" + c.who] = 1;
    }
    if (!seen("svc7_" + c.who)) SERV.storyQueue.push({ who: c.who, dish: c.dish, lost: false });
  } else if (c.who && !seen("svc_" + c.who)) {
    SERV.storyQueue.push({ who: c.who, dish: c.dish, lost: false });
  }
}
function startLeaving(c) {
  if (c.seat >= 0 && SERV.tables[c.seat] === c) SERV.tables[c.seat] = null;
  c.queue = false;
  var qi = SERV.queue.indexOf(c);
  if (qi >= 0) SERV.queue.splice(qi, 1);
  c.state = "leave";
  c.fx = c.x; c.fy = c.y;
  c.tx = 202; c.ty = 132;
  c.t = 0;
}
function removeCustomer(c) {
  var i = SERV.customers.indexOf(c);
  if (i >= 0) SERV.customers.splice(i, 1);
}
function seatFromQueue() {
  if (!SERV.queue.length) return;
  var seat = freeSeat();
  if (seat < 0) return;
  var c = SERV.queue.shift();
  c.state = "sit";
  c.seat = seat;
  var p = seatPos(seat);
  c.fx = c.x; c.fy = c.y;
  c.tx = p.x; c.ty = p.y;
  c.t = 0;
  SERV.tables[seat] = c;
}

async function serveSeat(i) {
  if (SERV.busy || SERV.menuOpen || SERV.paused) return;
  var c = SERV.tables[i];
  if (!c || c.state !== "wait") { game.sfx("err"); return; }
  if (stockOf(c.dish) <= 0) {
    game.sfx("err");
    sayToast("「" + DATA.DISHES[c.dish].name + "」卖完了");
    c.patience -= 4;
    if (c.patience <= 0) { lostCustomer(c, "客人等走了"); startLeaving(c); seatFromQueue(); }
    return;
  }
  SERV.busy = true;
  SERV.waiter.action = "serve";
  var p = seatPos(i);
  SERV.waiter.fx = SERV.waiter.x; SERV.waiter.fy = SERV.waiter.y;
  SERV.waiter.tx = p.x; SERV.waiter.ty = p.y + 2; SERV.waiter.t = 0;
  await game.wait(0.24);
  if (useStock(c.dish)) {
    c.state = "eat";
    c.eatT = 2.3;
    game.sfx("ok");
    SERV.fx.push({ text: "上菜", x: p.x, y: p.y - 8, until: game.time + 0.8 });
  }
  await game.wait(0.24);
  SERV.waiter.fx = SERV.waiter.x; SERV.waiter.fy = SERV.waiter.y;
  SERV.waiter.tx = 120; SERV.waiter.ty = 170; SERV.waiter.t = 0;
  SERV.waiter.action = "";
  await game.wait(0.24);
  SERV.busy = false;
}

async function autoServe() {
  if (SERV.busy || SERV.menuOpen || SERV.paused) return false;
  for (var i = 0; i < SERV.seats; i++) {
    var c = SERV.tables[i];
    if (c && c.state === "wait" && stockOf(c.dish) > 0) {
      if (!useStock(c.dish)) continue;
      c.state = "eat";
      c.eatT = 2.1;
      SERV.fx.push({ text: "阿禾", x: seatPos(i).x, y: seatPos(i).y - 10, until: game.time + 1 });
      game.sfx("tick");
      if (c.who && (S.day === 7 ? !S.flags["vip_" + c.who] : !seen("svc_" + c.who))) {
        SERV.storyQueue.push({ who: c.who, dish: c.dish, lost: false });
      }
      return true;
    }
  }
  return false;
}

function finishService(early) {
  if (SERV.done) return;
  SERV.done = true;
  // pay the people already eating, lose the rest
  for (var i = 0; i < SERV.customers.length; i++) {
    var c = SERV.customers[i];
    if (c.state === "eat") payCustomer(c);
    else if (c.state !== "leave") lostCustomer(c, null);
  }
  var rep = Math.round(SERV.served / 3) - SERV.lost;
  addRep(rep);
  SERV.repDelta = rep;
  S.phase = "night";
  S.lastLedger = {
    served: SERV.served, lost: SERV.lost, earned: SERV.earned, tips: SERV.tips,
    repDelta: rep, leftover: stockTotal(), early: !!early
  };
  S.stats.served += SERV.served;
  S.stats.lost += SERV.lost;
  S.stats.earned += SERV.earned;
  S.stats.tips += SERV.tips;
  save();
  game.go("night");
}

game.scene("service", {
  enter: function () {
    var seats = tableCount();
    SERV = {
      clock: 1080, end: 1320, seats: seats, sel: 0,
      tables: new Array(seats).fill(null), queue: [], customers: [],
      schedule: buildSchedule(), spawnAt: 0,
      served: 0, lost: 0, earned: 0, tips: 0, repDelta: 0,
      busy: false, menuOpen: false, paused: false, pauseSel: 0,
      done: false, storyQueue: [], fx: [], staffTimer: 5,
      waiter: { x: 120, y: 170, fx: 120, fy: 170, tx: 120, ty: 170, t: 1, action: "" }
    };
    game.ambience(S.weather === "rain" ? "rain" : null, 0.3);
    if (typeof playMusic === "function") playMusic("service");
    save();
  },
  update: function (dt) {
    if (!SERV || SERV.done) return;
    if (SERV.paused) {
      if (game.repeat("left") || game.repeat("up")) { SERV.pauseSel = (SERV.pauseSel + 1) % 2; game.sfx("move"); }
      if (game.repeat("right") || game.repeat("down")) { SERV.pauseSel = (SERV.pauseSel + 1) % 2; game.sfx("move"); }
      if (game.pressed("a")) {
        if (SERV.pauseSel === 0) { SERV.paused = false; game.sfx("tap"); }
        else { game.sfx("tap"); finishService(true); }
      }
      if (game.pressed("start")) { SERV.paused = false; game.sfx("tap"); }
      return;
    }
    if (SERV.menuOpen) {
      if (game.pressed("b") || game.pressed("a") || game.pressed("start")) { SERV.menuOpen = false; game.sfx("tap"); }
      return;
    }
    if (game.pressed("start")) { SERV.paused = true; SERV.pauseSel = 0; game.sfx("tap"); return; }
    if (game.pressed("b")) { SERV.menuOpen = true; game.sfx("tap"); return; }
    if (SERV.busy) return;
    if (game.repeat("left")) { SERV.sel = (SERV.sel + SERV.seats - 1) % SERV.seats; game.sfx("move"); }
    if (game.repeat("right")) { SERV.sel = (SERV.sel + 1) % SERV.seats; game.sfx("move"); }
    if (game.pressed("a")) serveSeat(SERV.sel);
    // story
    if (SERV.storyQueue.length) {
      var st = SERV.storyQueue.shift();
      if (st.lost) { SERV.busy = false; return; }
      SERV.busy = true;
      var p = S.day === 7 ? FestivalStory(st.who, st.dish, false) : ServiceStory(st.who, st.dish, false);
      if (p && p.then) p.then(function () { SERV.busy = false; });
      else SERV.busy = false;
      return;
    }
    // clock
    SERV.clock += dt / 0.45;
    if (SERV.clock >= SERV.end) { finishService(false); return; }
    // arrivals
    while (SERV.spawnAt < SERV.schedule.length && SERV.clock >= SERV.schedule[SERV.spawnAt].time) {
      var sc = SERV.schedule[SERV.spawnAt++];
      if (!sc.dish) continue;
      var c = makeCustomer(sc.dish, sc.who);
      var seat = freeSeat();
      if (seat >= 0) { SERV.customers.push(c); seatCustomer(c, seat); }
      else queueCustomer(c);
    }
    // people
    for (var i = SERV.customers.length - 1; i >= 0; i--) {
      var c = SERV.customers[i];
      if (c.t < 1) {
        c.t = Math.min(1, c.t + dt / 0.38);
        c.x = LoGame.lerp(c.fx, c.tx, c.t);
        c.y = LoGame.lerp(c.fy, c.ty, c.t);
        if (c.t >= 1 && c.state === "sit") { c.state = "wait"; c.patience = c.maxPatience; }
        if (c.t >= 1 && c.state === "leave") { removeCustomer(c); seatFromQueue(); }
        continue;
      }
      if (c.state === "wait" || c.state === "queue") {
        c.patience -= dt;
        if (c.patience <= 0) {
          lostCustomer(c, c.state === "queue" ? "等位的客人走了" : "客人等走了");
          startLeaving(c);
          seatFromQueue();
        }
      } else if (c.state === "eat") {
        c.eatT -= dt;
        if (c.eatT <= 0) { payCustomer(c); startLeaving(c); seatFromQueue(); }
      }
    }
    // waiter
    var w = SERV.waiter;
    if (w.t < 1) {
      w.t = Math.min(1, w.t + dt / 0.3);
      w.x = LoGame.lerp(w.fx, w.tx, w.t);
      w.y = LoGame.lerp(w.fy, w.ty, w.t);
    }
    // staff
    if (S.staff === "ahe") {
      SERV.staffTimer -= dt;
      if (SERV.staffTimer <= 0) {
        autoServe();
        SERV.staffTimer = 6;
      }
    }
    // floating text
    SERV.fx = SERV.fx.filter(function (v) { return game.time < v.until; });
  },
  draw: function (g) {
    if (!SERV) return;
    ART.room(g, S, "service", game.time, SERV.sel);
    // selected table marker
    var sp = tablePos(SERV.sel);
    g.arrow(sp[0] + 18, sp[1] - 12, "down", g.INK);
    // customers
    for (var i = 0; i < SERV.customers.length; i++) {
      var c = SERV.customers[i];
      if (c.state === "leave" || c.state === "sit" || c.state === "wait" || c.state === "queue") drawCustomer(g, c);
      if (c.state === "eat") {
        drawCustomer(g, c);
        var tp = tablePos(c.seat);
        g.rect(tp[0] + 18, tp[1] - 2, 8, 4, g.INK);
        g.rect(tp[0] + 19, tp[1] - 3, 6, 2, g.PAPER);
        ART.steam(g, tp[0] + 20, tp[1] - 6, game.time);
      }
      if (c.state === "wait") drawOrder(g, c);
      if (c.state === "queue") drawQueueOrder(g, c);
    }
    // waiter
    var w = SERV.waiter;
    g.dither(w.x, w.y + 17, 12, 2, g.DARK, 1);
    g.sprite(w.action === "serve" ? ART.big.heroSide : ART.big.heroDown, w.x - 2, w.y - 6, { flip: w.tx < 100 });
    if (w.action === "serve") {
      g.rect(w.x + 10, w.y + 4, 12, 3, g.INK);
      g.rect(w.x + 13, w.y + 2, 6, 2, g.PAPER);
    }
    // staff
    if (S.staff === "ahe") {
      g.sprite(ART.big.ahe, 120, 90);
    }
    // header
    UI.header(g, S, clk(SERV.clock));
    // footer / action bar
    g.window(6, 194, 204, 20, { thin: true });
    g.text("A 上菜　B 菜单", 12, 197);
    g.text("客 " + SERV.served + " / 走 " + SERV.lost, 204, 197, { align: "right", color: g.DARK });
    UI.footer(g, "←→ 选桌　START 暂停");
    // floating text
    for (var f = 0; f < SERV.fx.length; f++) {
      var fx = SERV.fx[f];
      if (game.time < fx.until) g.text(fx.text, fx.x, fx.y - (fx.until - game.time) * 8, { color: g.INK });
    }
    UI.toast(g);
    if (SERV.menuOpen) drawMenu(g);
    if (SERV.paused) drawPause(g);
  }
});

function customerSprite(c) {
  if (c.who === "ahe") return ART.big.ahe;
  if (c.who === "zhou") return ART.big.zhou;
  if (c.who === "yan") return ART.big.yan;
  if (c.who === "po") return ART.big.po;
  if (c.who === "critic") return ART.big.guestC;
  return c.variant === 0 ? ART.big.guestA : c.variant === 1 ? ART.big.guestB : ART.big.guestC;
}
function drawCustomer(g, c) {
  g.dither(c.x - 2, c.y + 17, 16, 2, g.DARK, 1);
  g.sprite(customerSprite(c), c.x - 2, c.y - 6);
  if (c.state === "wait" && c.patience < c.maxPatience * 0.35 && Math.floor(game.time * 6) % 2 === 0) {
    g.text("!", c.x + 2, c.y - 14, { color: g.INK });
  }
}
function drawOrder(g, c) {
  var tp = tablePos(c.seat);
  var x = tp[0] + 2, y = tp[1] - 44;
  g.window(x, y, 58, 18, { thin: true });
  g.text(DATA.DISHES[c.dish].name, x + 4, y + 2);
  if (c.who) ART.heart(g, x + 44, y + 5, true);
  var frac = Math.max(0, c.patience / c.maxPatience);
  g.rect(x + 2, y + 18, 54, 2, g.MID);
  g.rect(x + 2, y + 18, Math.round(54 * frac), 2, frac < 0.35 ? g.INK : g.DARK);
  g.rect(x + 14, y - 2, 2, 3, g.INK);
}
function drawQueueOrder(g, c) {
  g.rect(c.x - 6, c.y - 6, 24, 2, g.MID);
  g.rect(c.x - 6, c.y - 6, Math.round(24 * Math.max(0, c.patience / c.maxPatience)), 2, g.DARK);
}
function drawMenu(g) {
  g.window(20, 52, 176, 128);
  g.text("今日余量", 28, 56, { color: g.DARK });
  for (var i = 0; i < S.menu.length; i++) {
    var id = S.menu[i], y = 76 + i * 17;
    ART.dish(g, id, 26, y - 1, game.time);
    g.text(DATA.DISHES[id].name, 50, y);
    g.text("× " + stockOf(id), 186, y, { align: "right", color: stockOf(id) ? g.INK : g.DARK });
  }
  g.text("A / B 返回", 108, 168, { align: "center", color: g.DARK });
}
function drawPause(g) {
  g.window(48, 76, 120, 74);
  g.text("暂停", 108, 80, { align: "center", color: g.DARK });
  var opts = ["继续", "打烊"];
  for (var i = 0; i < 2; i++) {
    if (i === SERV.pauseSel) { g.rect(60, 98 + i * 20, 96, 16, g.INK); g.text(opts[i], 68, 100 + i * 20, { color: g.PAPER }); }
    else g.text(opts[i], 68, 100 + i * 20);
  }
  g.text("START 继续", 108, 140, { align: "center", color: g.DARK });
}

function FestivalStory(who, dish, lost) {
  return (async function () {
    if (lost) return;
    var ok = (who === "po" && dish === "god_soup") || (who === "zhou" && dish === "grilled_fish") || (who === "ahe" && dish === "mushroom_soup");
    var pages = who === "po"
      ? (ok ? ["这碗羹……山神会记得。", "小馆保住了。"] : ["心意到了。", "明年再说明年的话。"])
      : who === "zhou"
        ? (ok ? ["这条鱼，烤得正好。", "山神宴上，得有这一口。"] : ["鱼不错。", "下次再早一点。"])
        : (ok ? ["这碗汤，还是我娘的味道。", "我明年还来。"] : ["人多，难为你了。", "汤还是热的。"]);
    await game.push("event", { who: who, bg: "shop", pages: pages, cancel: false });
    mark("svc7_" + who);
  })();
}
