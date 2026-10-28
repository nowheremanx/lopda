/* 矿工老张: the game itself. Everything here is plain state plus functions, so the
   tests can run it without a browser. The art, DOM and PAD calls live in the next files. */
var GM = (typeof GM !== "undefined" && GM) || {};

GM.rng = function (seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

GM.targetFor = function (n) {
  if (n <= GM.PLAY_LEVELS) return GM.TARGETS[n - 1] || GM.TARGETS[0];
  var t = GM.TARGETS[GM.PLAY_LEVELS - 1];
  for (var i = GM.PLAY_LEVELS + 1; i <= n; i++) {
    t += GM.ENDLESS_FIRST_STEP + (i - GM.PLAY_LEVELS - 1) * GM.ENDLESS_GROW;
  }
  return t;
};

GM.moleCarry = function (n) {
  return n >= 6 ? "diamond" : "goldM";
};

GM.moleValue = function (n) {
  return GM.ITEMS[GM.moleCarry(n)].value;
};

GM.recipeFor = function (n) {
  var r, i;
  if (n <= GM.PLAY_LEVELS) {
    r = {};
    for (i in GM.LEVELS[n - 1]) if (Object.prototype.hasOwnProperty.call(GM.LEVELS[n - 1], i)) r[i] = GM.LEVELS[n - 1][i];
    return r;
  }
  r = {};
  for (i in GM.LEVELS[GM.PLAY_LEVELS - 1]) {
    if (Object.prototype.hasOwnProperty.call(GM.LEVELS[GM.PLAY_LEVELS - 1], i)) r[i] = GM.LEVELS[GM.PLAY_LEVELS - 1][i];
  }
  var extra = n - GM.PLAY_LEVELS;
  r.goldM += Math.min(6, Math.ceil(extra / 2));
  r.goldL += Math.min(4, Math.floor(extra / 2));
  r.diamond += Math.min(5, Math.floor(extra / 2));
  r.bag += Math.min(3, Math.floor(extra / 3));
  r.tnt = Math.min(4, r.tnt + Math.floor(extra / 3));
  r.mole = Math.min(4, r.mole + Math.floor(extra / 2));
  /* never turn the mine into a solid wall: shed the cheapest things first */
  var drop = ["bone", "skull", "rockS", "goldS", "bag", "rockL", "goldM", "goldL", "diamond", "mole", "tnt"];
  var total = GM.recipeCount(r);
  while (total > 36) {
    for (i = 0; i < drop.length; i++) {
      if (r[drop[i]] > 0) { r[drop[i]]--; total--; break; }
    }
  }
  return r;
};

GM.recipeCount = function (recipe) {
  var n = 0;
  for (var k in recipe) if (Object.prototype.hasOwnProperty.call(recipe, k)) n += recipe[k] || 0;
  return n;
};

GM.rockValue = function (type, book) {
  return GM.ITEMS[type].value * (book ? 3 : 1);
};

GM.bagValue = function (rng, clover) {
  var mult = 1 + 0.5 * (clover || 0);
  var v = (GM.ITEMS.bag.min + rng() * (GM.ITEMS.bag.max - GM.ITEMS.bag.min)) * mult;
  return Math.max(10, Math.round(v / 10) * 10);
};

GM.recipeValue = function (n, clover, book) {
  var r = GM.recipeFor(n), min = 0, max = 0, k, c;
  r.diamond = (r.diamond || 0) + (clover || 0);
  for (k in r) {
    if (!Object.prototype.hasOwnProperty.call(r, k) || !r[k]) continue;
    c = r[k];
    if (k === "bag") {
      min += c * GM.ITEMS.bag.min * (1 + 0.5 * (clover || 0));
      max += c * GM.ITEMS.bag.max * (1 + 0.5 * (clover || 0));
    } else if (k === "mole") {
      min += c * GM.moleValue(n);
      max += c * GM.moleValue(n);
    } else if (k === "rockS" || k === "rockL") {
      min += c * GM.rockValue(k, book);
      max += c * GM.rockValue(k, book);
    } else {
      min += c * GM.ITEMS[k].value;
      max += c * GM.ITEMS[k].value;
    }
  }
  return { min: min, max: max };
};

GM.newState = function () {
  return {
    screen: "title",
    level: 1,
    bank: 0,
    target: GM.TARGETS[0],
    time: GM.LEVEL_TIME,
    items: [],
    hook: { state: "swing", len: GM.IDLE_ROPE, angle: 0, item: null },
    dynamite: 0,
    strength: 0,
    clover: 0,
    book: 0,
    shopCursor: 4,
    runSeed: 1,
    levelSeed: 1,
    rng: GM.rng(1),
    swingT: 0,
    introT: 0,
    resumeTo: "play",
    lastSec: GM.LEVEL_TIME,
    events: [],
    floats: [],
    particles: [],
    blasts: [],
    shake: 0,
    anim: 0,
    best: { level: 0, bank: 0 },
    bestBlocked: false,
    bestDirty: false,
    newBest: false,
    saveMsg: "",
    wonOnce: false,
    bg: null,
    bgKey: ""
  };
};

GM.startRun = function (state, seed) {
  state.level = 1;
  state.bank = 0;
  state.dynamite = 0;
  state.strength = 0;
  state.clover = 0;
  state.book = 0;
  state.wonOnce = false;
  state.bestDirty = false;
  state.newBest = false;
  state.runSeed = (seed || Math.floor(Math.random() * 2147483000) + 1) >>> 0;
  GM.startLevel(state, 1);
};

GM.startLevel = function (state, n) {
  state.level = n;
  state.target = GM.targetFor(n);
  state.time = GM.LEVEL_TIME;
  state.lastSec = GM.LEVEL_TIME;
  state.levelSeed = (state.runSeed + n * 7919) >>> 0;
  state.rng = GM.rng(state.levelSeed);
  state.items = GM.generate(state, n);
  state.hook = { state: "swing", len: GM.IDLE_ROPE, angle: 0, item: null };
  state.swingT = 0;
  state.introT = 1.25;
  state.shopCursor = 4;
  state.events = [];
  state.floats = [];
  state.particles = [];
  state.blasts = [];
  state.shake = 0;
  state.anim = 0;
  state.bestDirty = false;
  state.newBest = false;
  state.bg = null;
  state.bgKey = "";
  state.screen = "intro";
};

GM.makeItem = function (state, type, x, y, rng) {
  var spec = GM.ITEMS[type];
  var it = {
    type: type,
    kind: spec.kind,
    sprite: spec.sprite,
    x: x,
    y: y,
    r: spec.r,
    weight: spec.weight,
    value: spec.value,
    fuse: 0
  };
  if (type === "bag") it.value = GM.bagValue(rng, state.clover);
  if (type === "rockS" || type === "rockL") it.value = GM.rockValue(type, state.book);
  if (type === "mole") {
    it.carry = GM.moleCarry(state.level);
    it.value = GM.ITEMS[it.carry].value;
    it.dir = rng() < 0.5 ? -1 : 1;
    it.speed = 11 + Math.min(10, state.level * 0.9);
    it.minX = 18;
    it.maxX = 142;
  }
  return it;
};

GM.overlaps = function (x, y, r, items, gap) {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.type === "mole") continue;
    var dx = it.x - x, dy = it.y - y, rr = it.r + r + (gap == null ? 2 : gap);
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
};

GM.generate = function (state, n) {
  var recipe = GM.recipeFor(n);
  recipe.diamond = (recipe.diamond || 0) + (state.clover || 0);
  var rng = state.rng || GM.rng(state.levelSeed || 1);
  var items = [];
  var order = ["diamond", "goldL", "goldM", "bag", "goldS", "rockL", "rockS", "skull", "bone", "tnt"];
  var i, j, type, count, spec, pref, x, y, r, tries, placed, gap;

  for (i = 0; i < order.length; i++) {
    type = order[i];
    count = recipe[type] || 0;
    spec = GM.ITEMS[type];
    pref = spec.pref;
    r = spec.r;
    for (j = 0; j < count; j++) {
      placed = false;
      for (gap = 2; gap >= 0 && !placed; gap -= 2) {
        for (tries = 0; tries < 170 && !placed; tries++) {
          x = r + 4 + rng() * (GM.W - 2 * r - 8);
          var yMin = Math.max(GM.GROUND + 15, pref[0]);
          var yMax = Math.min(GM.H - r - 4, pref[1]);
          if (yMax < yMin) yMin = yMax;
          y = yMin + rng() * Math.max(1, yMax - yMin);
          if (!GM.overlaps(x, y, r, items, gap)) {
            items.push(GM.makeItem(state, type, x, y, rng));
            placed = true;
          }
        }
      }
    }
  }

  /* the mole runs along a lane of its own; it may pass in front of the static loot */
  var moles = recipe.mole || 0;
  for (i = 0; i < moles; i++) {
    items.push(GM.makeItem(state, "mole", 24 + rng() * 112, 84 + rng() * 28, rng));
  }
  return items;
};

GM.countItems = function (items, type) {
  var n = 0;
  for (var i = 0; i < items.length; i++) if (items[i].type === type) n++;
  return n;
};

GM.tip = function (hook) {
  return {
    x: GM.ANCHOR.x + Math.sin(hook.angle) * hook.len,
    y: GM.ANCHOR.y + Math.cos(hook.angle) * hook.len
  };
};

GM.retractSpeed = function (item, strength) {
  return Math.min(300, GM.BASE_SPEED / Math.max(0.4, item.weight) * (1 + GM.STRENGTH_STEP * (strength || 0)));
};

GM.fire = function (state) {
  if (state.screen !== "play" || state.hook.state !== "swing") return false;
  state.hook.state = "out";
  state.hook.len = GM.IDLE_ROPE;
  state.events.push("fire");
  return true;
};

GM.useDynamite = function (state) {
  if (state.screen !== "play" || state.hook.state !== "back" || !state.hook.item || state.dynamite <= 0) return false;
  state.dynamite--;
  var it = state.hook.item;
  var p = GM.tip(state.hook);
  if (it.kind === "tnt") {
    GM.explode(state, p.x, p.y);
  } else {
    GM.addParticles(state, p.x, p.y, 10, ["mid", "dark"]);
    state.events.push("boom");
    state.shake = 0.22;
    state.hook.item = null;
  }
  return true;
};

GM.attach = function (state, index) {
  var it = state.items[index];
  state.items.splice(index, 1);
  state.hook.item = it;
  state.hook.state = "back";
  if (it.kind === "tnt") it.fuse = 1.0;
  var p = GM.tip(state.hook);
  GM.addParticles(state, p.x, p.y, 5, ["mid", "dark"]);
  state.events.push("grab");
  return it;
};

GM.collect = function (state) {
  var it = state.hook.item;
  if (!it) return;
  var p = GM.tip(state.hook);
  state.hook.item = null;
  state.hook.state = "swing";
  state.hook.len = GM.IDLE_ROPE;
  if (it.kind === "tnt") {
    GM.explode(state, p.x, p.y);
    return;
  }
  state.bank += it.value;
  var ev = it.kind === "gem" ? "gem" : (it.kind === "junk" || it.kind === "rock") ? "junk" : "coin";
  state.events.push(ev);
  if (it.value > 0) GM.addFloat(state, GM.ANCHOR.x, 6, "+" + it.value);
  if (it.kind === "gem") GM.addParticles(state, p.x, p.y, 10, ["paper"]);
};

GM.explode = function (state, x, y) {
  var keep = [], i, it;
  for (i = 0; i < state.items.length; i++) {
    it = state.items[i];
    var dx = it.x - x, dy = it.y - y;
    if (dx * dx + dy * dy <= 30 * 30) {
      GM.addParticles(state, it.x, it.y, 6, ["mid", "dark", "paper"]);
    } else {
      keep.push(it);
    }
  }
  state.items = keep;
  state.hook.item = null;
  state.hook.state = "back";
  state.blasts.push({ x: x, y: y, t: 0, life: 0.55 });
  state.shake = 0.4;
  state.events.push("boom");
};

GM.addFloat = function (state, x, y, text) {
  state.floats.push({ x: x, y: y, text: text, t: 0, life: 0.85 });
};

GM.addParticles = function (state, x, y, n, colors) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    var s = 8 + Math.random() * 28;
    state.particles.push({
      x: x,
      y: y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 8,
      t: 0,
      life: 0.35 + Math.random() * 0.35,
      color: colors[i % colors.length]
    });
  }
};

GM.updateEffects = function (state, dt) {
  var out = [], i, e;
  for (i = 0; i < state.floats.length; i++) {
    e = state.floats[i];
    e.t += dt;
    if (e.t < e.life) out.push(e);
  }
  state.floats = out;
  out = [];
  for (i = 0; i < state.particles.length; i++) {
    e = state.particles[i];
    e.t += dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += 90 * dt;
    if (e.t < e.life) out.push(e);
  }
  state.particles = out;
  out = [];
  for (i = 0; i < state.blasts.length; i++) {
    e = state.blasts[i];
    e.t += dt;
    if (e.t < e.life) out.push(e);
  }
  state.blasts = out;
};

GM.finishLevel = function (state) {
  if (state.bank >= state.target) {
    GM.recordBest(state, state.level, state.bank);
    state.events.push("clear");
    if (state.level === GM.PLAY_LEVELS && !state.wonOnce) {
      state.wonOnce = true;
      state.screen = "victory";
    } else {
      state.screen = "clear";
    }
  } else {
    GM.recordBest(state, Math.max(0, state.level - 1), state.bank);
    state.events.push("fail");
    state.screen = "over";
  }
};

GM.better = function (a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.level !== b.level) return a.level > b.level;
  return a.bank > b.bank;
};

GM.recordBest = function (state, level, bank) {
  var next = { level: level, bank: bank };
  if (!GM.better(next, state.best)) return false;
  state.best = next;
  state.bestDirty = true;
  state.newBest = true;
  return true;
};

GM.bestPayload = function (state) {
  return { v: 1, level: state.best.level, bank: state.best.bank };
};

GM.readBest = function (raw) {
  var empty = { level: 0, bank: 0 };
  if (raw == null) return { ok: true, best: empty };
  if (typeof raw !== "object" || raw.length != null) return { ok: false, corrupt: true, best: empty };
  var v = raw.v;
  if (typeof v !== "number" || Math.floor(v) !== v) return { ok: false, corrupt: true, best: empty };
  if (v > 1) return { ok: false, newer: true, best: empty };
  if (v !== 1) return { ok: false, corrupt: true, best: empty };
  var level = raw.level, bank = raw.bank;
  if (typeof level !== "number" || Math.floor(level) !== level || level < 0 || level > 9999) {
    return { ok: false, corrupt: true, best: empty };
  }
  if (typeof bank !== "number" || Math.floor(bank) !== bank || bank < 0 || bank > 999999999) {
    return { ok: false, corrupt: true, best: empty };
  }
  return { ok: true, best: { level: level, bank: bank } };
};

GM.openShop = function (state) {
  state.shopCursor = 4;
  state.screen = "shop";
  state.events = [];
};

GM.shopNext = function (state) {
  GM.startLevel(state, state.level + 1);
};

GM.moveShop = function (state, dir) {
  state.shopCursor = (state.shopCursor + dir + 5) % 5;
  state.events.push("move");
};

GM.buy = function (state, idx) {
  var item = GM.SHOP[idx];
  if (!item) { state.events.push("err"); return false; }
  var have = state[item.key] || 0;
  if (have >= item.max || state.bank < item.price) {
    state.events.push("err");
    return false;
  }
  state.bank -= item.price;
  state[item.key] = have + 1;
  state.events.push("buy");
  return true;
};

GM.pause = function (state) {
  if (state.screen !== "play" && state.screen !== "intro") return false;
  state.resumeTo = state.screen;
  state.screen = "paused";
  return true;
};

GM.resume = function (state) {
  if (state.screen !== "paused") return false;
  state.screen = state.resumeTo || "play";
  return true;
};

GM.toTitle = function (state) {
  state.screen = "title";
  state.events = [];
};

GM.moveMoles = function (state, dt) {
  for (var i = 0; i < state.items.length; i++) {
    var it = state.items[i];
    if (it.type !== "mole") continue;
    it.x += it.dir * it.speed * dt;
    if (it.x < it.minX) { it.x = it.minX; it.dir = 1; }
    if (it.x > it.maxX) { it.x = it.maxX; it.dir = -1; }
  }
};

GM.stepHook = function (state, dt) {
  var hook = state.hook;
  if (hook.state === "out") {
    hook.len += GM.OUT_SPEED * dt;
    var p = GM.tip(hook);
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      var dx = it.x - p.x, dy = it.y - p.y;
      if (dx * dx + dy * dy <= (it.r + 4) * (it.r + 4)) {
        GM.attach(state, i);
        return;
      }
    }
    if (hook.len >= GM.MAX_ROPE || p.x < 3 || p.x > GM.W - 3 || p.y > GM.H - 2) {
      hook.state = "back";
    }
    return;
  }
  if (hook.state !== "back") return;

  if (hook.item && hook.item.kind === "tnt") {
    hook.item.fuse -= dt;
    if (hook.item.fuse <= 0) {
      var q = GM.tip(hook);
      GM.explode(state, q.x, q.y);
      return;
    }
  }
  var speed = hook.item ? GM.retractSpeed(hook.item, state.strength) : GM.EMPTY_SPEED;
  hook.len -= speed * dt;
  if (hook.item && hook.len <= 10) {
    GM.collect(state);
    return;
  }
  if (!hook.item && hook.len <= GM.IDLE_ROPE) {
    hook.len = GM.IDLE_ROPE;
    hook.state = "swing";
  }
};

GM.update = function (state, dt) {
  dt = Math.min(0.1, Math.max(0, dt));
  if (dt <= 0) return;

  if (state.screen === "intro") {
    state.anim += dt;
    state.introT -= dt;
    if (state.hook.state === "swing") {
      state.swingT += dt;
      state.hook.angle = Math.sin(state.swingT * Math.PI * 2 / GM.PERIOD) * GM.SWING;
    }
    if (state.introT <= 0) {
      state.screen = "play";
      state.time = GM.LEVEL_TIME;
      state.lastSec = GM.LEVEL_TIME;
    }
    return;
  }
  if (state.screen !== "play") return;

  state.anim += dt;
  state.time -= dt;
  if (state.time <= 0) {
    state.time = 0;
    GM.finishLevel(state);
    return;
  }
  var sec = Math.ceil(state.time);
  if (sec !== state.lastSec) {
    state.lastSec = sec;
    if (sec <= 10) state.events.push("tick");
  }

  if (state.hook.state === "swing") {
    state.swingT += dt;
    state.hook.angle = Math.sin(state.swingT * Math.PI * 2 / GM.PERIOD) * GM.SWING;
  }
  GM.moveMoles(state, dt);
  var left = dt;
  while (left > 0 && state.screen === "play") {
    var h = Math.min(0.016, left);
    GM.stepHook(state, h);
    left -= h;
  }
  GM.updateEffects(state, dt);
  state.shake = Math.max(0, state.shake - dt);
};
