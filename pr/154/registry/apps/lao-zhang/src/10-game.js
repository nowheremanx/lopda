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

/* Most moles are worthless; the rare one carries a diamond. */
GM.moleGemChance = function (n) {
  return Math.min(0.48, 0.16 + (n || 1) * 0.028);
};

GM.moleCarry = function (n, rng) {
  return rng() < GM.moleGemChance(n) ? "diamond" : "none";
};

GM.moleValue = function (n) {
  return GM.moleGemChance(n) * GM.ITEMS.diamond.value;
};

/* A bag is a little lottery: cash, dynamite or a strength burst. */
GM.bagReward = function (rng, clover) {
  var r = rng();
  if (r < 0.22) return { kind: "dynamite", value: rng() < 0.25 ? 2 : 1 };
  if (r < 0.42) return { kind: "strength", value: 1 };
  var mult = 1 + 0.5 * (clover || 0);
  var v = (GM.ITEMS.bag.min + rng() * (GM.ITEMS.bag.max - GM.ITEMS.bag.min)) * mult;
  return { kind: "cash", value: Math.max(10, Math.round(v / 10) * 10) };
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
  var drop = ["bone", "skull", "rockS", "goldS", "bag", "rockL", "goldM", "goldL", "diamond", "mine", "mole", "tnt"];
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

GM.recipeValue = function (n, clover, book) {
  var r = GM.recipeFor(n), min = 0, max = 0, k, c;
  r.diamond = (r.diamond || 0) + (clover || 0);
  for (k in r) {
    if (!Object.prototype.hasOwnProperty.call(r, k) || !r[k]) continue;
    c = r[k];
    if (k === "bag") {
      /* only the cash roll counts as guaranteed loot; dynamite and strength are a bonus */
      min += c * GM.ITEMS.bag.min * 0.58 * (1 + 0.5 * (clover || 0));
      max += c * GM.ITEMS.bag.max * 0.58 * (1 + 0.5 * (clover || 0));
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
    bomb: null,
    dynamite: 0,
    strength: 0,
    clover: 0,
    book: 0,
    shopCursor: 4,
    shopOffers: [],
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
    throwT: 0,
    rival: null,
    best: { level: 0, bank: 0 },
    bestBlocked: false,
    bestDirty: false,
    newBest: false,
    saveMsg: "",
    run: null,
    runBlocked: false,
    runDirty: false,
    runMsg: "",
    menuCursor: 0,
    pauseCursor: 0,
    confirmCursor: 0,
    wonOnce: false,
    jingleId: 0,
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
  state.jingleId = (state.jingleId || 0) + 1;
  state.lastSec = GM.LEVEL_TIME;
  state.levelSeed = (state.runSeed + n * 7919) >>> 0;
  state.rng = GM.rng(state.levelSeed);
  state.items = GM.generate(state, n);
  state.rival = n > GM.PLAY_LEVELS ? GM.startRival(state, n) : null;
  state.hook = { state: "swing", len: GM.IDLE_ROPE, angle: 0, item: null };
  state.bomb = null;
  GM.setRun(state, n);
  state.swingT = 0;
  state.introT = 1.25;
  state.shopCursor = 4;
  state.shopOffers = [];
  state.events = [];
  state.floats = [];
  state.particles = [];
  state.blasts = [];
  state.shake = 0;
  state.anim = 0;
  state.throwT = 0;
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
  if (type === "bag") {
    it.reward = GM.bagReward(rng, state.clover);
    it.value = it.reward.kind === "cash" ? it.reward.value : 0;
  }
  if (type === "rockS" || type === "rockL") it.value = GM.rockValue(type, state.book);
  if (type === "mole") {
    it.carry = GM.moleCarry(state.level, rng);
    it.value = it.carry === "diamond" ? GM.ITEMS.diamond.value : 0;
    it.dir = rng() < 0.5 ? -1 : 1;
    it.speed = 11 + Math.min(10, state.level * 0.9);
    it.minX = 18;
    it.maxX = 142;
  }
  return it;
};

GM.overlaps = function (x, y, r, items, gap, except) {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it === except || it.type === "mole") continue;
    var dx = it.x - x, dy = it.y - y, rr = it.r + r + (gap == null ? 2 : gap);
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
};

/* The hook is a pendulum: an item high in a far corner can be outside its arc or
   beyond the rope. Every generated item must sit inside the reachable wedge. */
GM.reachable = function (x, y, r) {
  var dx = x - GM.ANCHOR.x, dy = y - GM.ANCHOR.y;
  var d = Math.sqrt(dx * dx + dy * dy);
  if (d + (r || 0) + 3 > GM.MAX_ROPE) return false;
  return Math.abs(Math.atan2(dx, dy)) <= GM.SWING - 0.05;
};

GM.spotOK = function (x, y, r, items, gap, except) {
  if (x < r + 3 || x > GM.W - r - 3) return false;
  if (y < GM.GROUND + 14 || y > GM.H - r - 3) return false;
  if (!GM.reachable(x, y, r)) return false;
  return !GM.overlaps(x, y, r, items, gap, except);
};

/* How each written level arranges its mine. More vaults means more TNT sitting on
   the good stuff; more walls and shields mean more rocks between the hook and the gold. */
GM.MAP_THEMES = [
  { clusters: 2, cluster: [2, 3], vaults: 0, walls: 0, shields: 0, bagsShielded: 0, deep: 0.15 },
  { clusters: 3, cluster: [2, 3], vaults: 0, walls: 0, shields: 1, bagsShielded: 0, deep: 0.25 },
  { clusters: 3, cluster: [2, 3], vaults: 1, walls: 0, shields: 1, bagsShielded: 0, deep: 0.35 },
  { clusters: 2, cluster: [2, 3], vaults: 1, walls: 1, shields: 2, bagsShielded: 0, deep: 0.45 },
  { clusters: 3, cluster: [2, 4], vaults: 1, walls: 0, shields: 1, bagsShielded: 1, deep: 0.40 },
  { clusters: 2, cluster: [3, 4], vaults: 2, walls: 1, shields: 2, bagsShielded: 1, deep: 0.50 },
  { clusters: 3, cluster: [2, 4], vaults: 1, walls: 0, shields: 1, bagsShielded: 2, deep: 0.45 },
  { clusters: 2, cluster: [3, 4], vaults: 2, walls: 2, shields: 3, bagsShielded: 1, deep: 0.55 },
  { clusters: 2, cluster: [3, 4], vaults: 3, walls: 1, shields: 2, bagsShielded: 1, deep: 0.65 },
  { clusters: 2, cluster: [3, 5], vaults: 3, walls: 2, shields: 3, bagsShielded: 1, deep: 0.70 }
];

GM.generate = function (state, n) {
  var recipe = GM.recipeFor(n);
  recipe.diamond = (recipe.diamond || 0) + (state.clover || 0);
  var rng = state.rng || GM.rng(state.levelSeed || 1);
  var items = [];
  var left = {}, k, i, j, tries, a, d, p, q, it, spec, val, dx, dy;
  for (k in recipe) if (Object.prototype.hasOwnProperty.call(recipe, k)) left[k] = recipe[k] || 0;
  var theme = GM.MAP_THEMES[Math.min(GM.MAP_THEMES.length - 1, Math.max(0, n - 1))];
  var zones = [];

  function has(type) { return (left[type] || 0) > 0; }
  function spend(type) { left[type] = (left[type] || 0) - 1; }

  function segDist2(px, py, x0, y0, x1, y1) {
    var vx = x1 - x0, vy = y1 - y0;
    var len2 = vx * vx + vy * vy;
    var t = len2 ? ((px - x0) * vx + (py - y0) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = x0 + vx * t, qy = y0 + vy * t;
    return (px - qx) * (px - qx) + (py - qy) * (py - qy);
  }

  function zoneHit(x, y, r) {
    for (var zi = 0; zi < zones.length; zi++) {
      var z = zones[zi];
      if (z.kind === "line") {
        if (segDist2(x, y, z.x0, z.y0, z.x1, z.y1) <= (z.w + r) * (z.w + r)) return true;
      } else {
        var zx = x - z.x, zy = y - z.y, zr = z.r + r;
        if (zx * zx + zy * zy <= zr * zr) return true;
      }
    }
    return false;
  }

  function valid(x, y, r, gap, except) {
    return !zoneHit(x, y, r) && GM.spotOK(x, y, r, items, gap, except);
  }

  function place(type, x, y, gap) {
    spec = GM.ITEMS[type];
    if (!valid(x, y, spec.r, gap == null ? 2 : gap)) return null;
    it = GM.makeItem(state, type, x, y, rng);
    items.push(it);
    return it;
  }

  function addAt(type, x, y, gap) {
    it = place(type, x, y, gap);
    if (it) spend(type);
    return it;
  }

  function find(type, y0, y1, x0, x1, gap) {
    spec = GM.ITEMS[type];
    var xMin = Math.max(spec.r + 3, x0 == null ? 0 : x0);
    var xMax = Math.min(GM.W - spec.r - 3, x1 == null ? GM.W : x1);
    var yy0 = Math.max(GM.GROUND + 14, y0 == null ? 0 : y0);
    var yy1 = Math.min(GM.H - spec.r - 3, y1 == null ? GM.H : y1);
    if (yy1 < yy0) yy1 = yy0;
    for (var t = 0; t < 260; t++) {
      var x = xMin + rng() * (xMax - xMin);
      var y = yy0 + rng() * (yy1 - yy0);
      if (valid(x, y, spec.r, gap == null ? 2 : gap)) return { x: x, y: y };
    }
    return null;
  }

  function anySpot(type) {
    spec = GM.ITEMS[type];
    var yy, xx;
    for (yy = GM.GROUND + 14; yy <= GM.H - spec.r - 4; yy += 2) {
      for (xx = spec.r + 4; xx <= GM.W - spec.r - 4; xx += 2) {
        if (valid(xx, yy, spec.r, 0)) return { x: xx, y: yy };
      }
    }
    for (yy = GM.GROUND + 14; yy <= GM.H - spec.r - 4; yy++) {
      for (xx = spec.r + 4; xx <= GM.W - spec.r - 4; xx++) {
        if (valid(xx, yy, spec.r, 0)) return { x: xx, y: yy };
      }
    }
    return null;
  }

  function scatter(type) {
    spec = GM.ITEMS[type];
    var y0 = Math.max(spec.pref[0], GM.GROUND + 14);
    var y1 = Math.min(spec.pref[1] + (theme.deep > 0.4 ? 6 : 0), GM.H - spec.r - 4);
    p = find(type, y0, y1, null, null, 2);
    if (!p) p = find(type, y0, y1, null, null, 0);
    if (!p) p = anySpot(type);
    return p ? addAt(type, p.x, p.y, 0) : null;
  }

  /* A hand-built set piece goes down first and takes its pieces out of the recipe.
     If the counts or the fixed spots do not fit, fall back to the ordinary mine. */
  function puzzle() {
    var def = GM.PUZZLES[n], counts = {}, placed = [], placedFree = [], ok = true, pi;
    if (!def) return false;
    for (pi = 0; pi < def.pieces.length; pi++) {
      var pt = def.pieces[pi];
      if (!pt.free) counts[pt.type] = (counts[pt.type] || 0) + 1;
    }
    for (var ct in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, ct) && (left[ct] || 0) < counts[ct]) return false;
    }
    for (pi = 0; pi < def.pieces.length; pi++) {
      var piece = def.pieces[pi];
      spec = GM.ITEMS[piece.type];
      if (!spec || !GM.spotOK(piece.x, piece.y, spec.r, items, 0)) { ok = false; break; }
      it = GM.makeItem(state, piece.type, piece.x, piece.y, rng);
      it.puzzle = true;
      items.push(it);
      if (!piece.free) spend(piece.type);
      placed.push(it);
      placedFree.push(!!piece.free);
    }
    if (!ok) {
      for (pi = 0; pi < placed.length; pi++) {
        if (!placedFree[pi]) left[placed[pi].type] = (left[placed[pi].type] || 0) + 1;
      }
      for (pi = 0; pi < placed.length; pi++) {
        var at = items.indexOf(placed[pi]);
        if (at >= 0) items.splice(at, 1);
      }
      return false;
    }
    for (pi = 0; pi < (def.lines || []).length; pi++) {
      var ln = def.lines[pi];
      zones.push({ kind: "line", x0: ln.x0, y0: ln.y0, x1: ln.x1, y1: ln.y1, w: ln.w });
    }
    for (pi = 0; pi < (def.circles || []).length; pi++) {
      var ci = def.circles[pi];
      zones.push({ kind: "circle", x: ci.x, y: ci.y, r: ci.r });
    }
    return true;
  }

  puzzle();

  function cluster(type, count) {
    count = Math.min(count, left[type] || 0);
    if (count <= 0) return 0;
    spec = GM.ITEMS[type];
    p = find(type, spec.pref[0], spec.pref[1], 12, GM.W - 12, 2);
    if (!p) return 0;
    var made = addAt(type, p.x, p.y, 2) ? 1 : 0;
    for (j = 1; j < count; j++) {
      for (tries = 0; tries < 60; tries++) {
        a = rng() * Math.PI * 2;
        d = spec.r * 1.8 + rng() * spec.r * 1.2;
        if (addAt(type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1)) {
          made++;
          break;
        }
      }
    }
    return made;
  }

  function vein(type, count) {
    count = Math.min(count, left[type] || 0);
    if (count <= 0) return 0;
    spec = GM.ITEMS[type];
    p = find(type, spec.pref[0], spec.pref[1], 16, GM.W - 16, 2);
    if (!p) return 0;
    a = (rng() < 0.5 ? 0.42 : -0.42) + (rng() < 0.5 ? 0 : Math.PI);
    var step = spec.r * 1.9 + 2;
    var made = 0;
    for (j = 0; j < count; j++) {
      if (addAt(type, p.x + Math.cos(a) * step * j, p.y + Math.sin(a) * step * j, 1)) made++;
    }
    return made;
  }

  function vault() {
    if (!has("tnt")) return false;
    var vt = has("diamond") ? "diamond" : has("goldL") ? "goldL" : has("goldM") ? "goldM" : null;
    if (!vt) return false;
    var vs = GM.ITEMS[vt];
    p = find(vt, Math.max(96, vs.pref[0]), GM.H - vs.r - 6, 12, GM.W - 12, 2);
    if (!p) p = find(vt, vs.pref[0], vs.pref[1], null, null, 2);
    if (!p) return false;
    val = addAt(vt, p.x, p.y, 2);
    if (!val) return false;
    val.guarded = true;

    var tsp = GM.ITEMS.tnt, bomb = null;
    var toA = Math.atan2(GM.ANCHOR.y - val.y, GM.ANCHOR.x - val.x);
    for (tries = 0; tries < 90 && !bomb; tries++) {
      a = toA + (rng() - 0.5) * 1.1;
      d = val.r + tsp.r + 2 + rng() * 6;
      bomb = place("tnt", val.x + Math.cos(a) * d, val.y + Math.sin(a) * d, 1);
    }
    if (!bomb) {
      /* nothing fits: give the valuable back and let the fallback guard pass try */
      items.pop();
      left[vt]++;
      return false;
    }
    spend("tnt");

    /* a second piece of loot on the far side of the TNT, so a missed aim is expensive */
    var vt2 = has("diamond") ? "diamond" : has("goldL") ? "goldL" : has("goldM") ? "goldM" : null;
    if (vt2) {
      var v2 = GM.ITEMS[vt2];
      for (tries = 0; tries < 60; tries++) {
        a = rng() * Math.PI * 2;
        d = bomb.r + v2.r + 2 + rng() * 18;
        if (addAt(vt2, bomb.x + Math.cos(a) * d, bomb.y + Math.sin(a) * d, 1)) break;
      }
    }
    return true;
  }

  function guardTnt() {
    if (!has("tnt")) return false;
    var vals = [];
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.kind === "gem" || it.type === "goldL" || it.type === "goldM" || it.kind === "bag") vals.push(it);
    }
    if (!vals.length) return false;
    val = vals[Math.floor(rng() * vals.length) % vals.length];
    var tsp = GM.ITEMS.tnt, bomb = null;
    var toA = Math.atan2(GM.ANCHOR.y - val.y, GM.ANCHOR.x - val.x);
    for (tries = 0; tries < 120 && !bomb; tries++) {
      a = toA + (rng() - 0.5) * 1.1;
      d = val.r + tsp.r + 2 + rng() * 6;
      bomb = place("tnt", val.x + Math.cos(a) * d, val.y + Math.sin(a) * d, 1);
    }
    if (bomb) { spend("tnt"); return true; }
    return false;
  }

  function shield(target, rockType) {
    if (!target || target.shielded || !has(rockType)) return false;
    spec = GM.ITEMS[rockType];
    var dx = GM.ANCHOR.x - target.x, dy = GM.ANCHOR.y - target.y;
    d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / d, uy = dy / d, px = -uy, py = ux;
    for (tries = 0; tries < 40; tries++) {
      var off = (rng() - 0.5) * (spec.r > 9 ? 8 : 4);
      var dist = 32 + rng() * 9;
      if (addAt(rockType, target.x + ux * dist + px * off, target.y + uy * dist + py * off, 1)) {
        target.shielded = true;
        return true;
      }
    }
    return false;
  }

  function wall(rockType, count) {
    spec = GM.ITEMS[rockType];
    var y = 76 + rng() * 32;
    var step = spec.r * 2 + 2;
    var x0 = 16 + rng() * Math.max(8, GM.W - 32 - count * step);
    var made = 0;
    for (j = 0; j < count; j++) {
      var typeNow = has(rockType) ? rockType : (has("rockS") ? "rockS" : null);
      if (!typeNow) break;
      spec = GM.ITEMS[typeNow];
      if (addAt(typeNow, x0 + j * step, y + (rng() < 0.25 ? 2 : 0), 1)) made++;
    }
    return made;
  }

  /* 1. TNT vaults, then any spare TNT guards the nearest treasure */
  var vaults = Math.min(theme.vaults, left.tnt || 0);
  for (i = 0; i < vaults; i++) vault();
  for (i = 0; i < 8 && has("tnt"); i++) if (!guardTnt()) break;

  /* 2. gold veins: short clusters rather than an even sprinkle */
  for (i = 0; i < theme.clusters; i++) {
    var ct = has("goldL") ? "goldL" : has("goldM") ? "goldM" : has("goldS") ? "goldS" : null;
    if (!ct) break;
    var size = theme.cluster[0] + Math.floor(rng() * (theme.cluster[1] - theme.cluster[0] + 1));
    if (n >= 5 && i % 2 === 0) vein(ct, size);
    else cluster(ct, size);
  }

  /* 3. diamonds not used in a vault go deep */
  while (has("diamond")) {
    var ds = GM.ITEMS.diamond;
    p = find("diamond", Math.max(100, ds.pref[0]), GM.H - ds.r - 6, 12, GM.W - 12, 1);
    if (!p) p = find("diamond", ds.pref[0], ds.pref[1], null, null, 0);
    if (!p || !addAt("diamond", p.x, p.y, 0)) break;
  }

  /* 4. bags: a few sit in a pocket behind a rock, the rest are scattered */
  for (i = 0; i < theme.bagsShielded && has("bag"); i++) {
    var bags = [];
    for (j = 0; j < items.length; j++) if (items[j].kind === "bag" && !items[j].shielded) bags.push(items[j]);
    if (!bags.length) break;
    if (!shield(bags[Math.floor(rng() * bags.length) % bags.length], has("rockL") ? "rockL" : "rockS")) break;
  }
  while (has("bag")) if (!scatter("bag")) break;

  /* 5. rock walls and shields in front of the best pieces */
  for (i = 0; i < theme.walls; i++) wall(has("rockL") ? "rockL" : "rockS", 3 + Math.floor(rng() * 2));
  for (i = 0; i < theme.shields; i++) {
    var guarded = [];
    for (j = 0; j < items.length; j++) {
      it = items[j];
      if (!it.shielded && (it.kind === "gem" || it.type === "goldL" || it.type === "goldM")) guarded.push(it);
    }
    if (!guarded.length) break;
    shield(guarded[Math.floor(rng() * guarded.length) % guarded.length], has("rockL") ? "rockL" : "rockS");
  }

  /* 6. everything else, cheapest last */
  var order = ["bone", "skull", "rockL", "rockS", "goldS", "goldM", "goldL", "mine", "tnt"];
  for (i = 0; i < order.length; i++) {
    while (has(order[i])) if (!scatter(order[i])) break;
  }
  var progress = true;
  while (progress) {
    progress = false;
    for (k in left) {
      if (k === "mole" || !has(k)) continue;
      if (scatter(k)) progress = true;
    }
  }

  /* 7. final safety: every TNT must sit within blast range of something worth taking */
  for (i = 0; i < items.length; i++) {
    it = items[i];
    if (it.type !== "tnt" || it.puzzle) continue;
    var near = false;
    for (j = 0; j < items.length; j++) {
      val = items[j];
      if (val === it || val.type === "mole" || val.type === "tnt" || val.type === "mine") continue;
      if (val.kind === "junk" || val.kind === "rock" || val.kind === "sealed") continue;
      dx = val.x - it.x; dy = val.y - it.y;
      if (dx * dx + dy * dy <= 29 * 29) { near = true; break; }
    }
    if (near) continue;
    for (j = 0; j < items.length && !near; j++) {
      val = items[j];
      if (val === it || val.type === "mole" || val.type === "tnt" || val.type === "mine") continue;
      if (val.kind === "junk" || val.kind === "rock" || val.kind === "sealed") continue;
      var toA = Math.atan2(GM.ANCHOR.y - val.y, GM.ANCHOR.x - val.x);
      for (tries = 0; tries < 50 && !near; tries++) {
        a = toA + (rng() - 0.5) * 1.1;
        d = val.r + it.r + 2 + rng() * 6;
        var nx = val.x + Math.cos(a) * d, ny = val.y + Math.sin(a) * d;
        if (valid(nx, ny, it.r, 1, it)) {
          it.x = nx;
          it.y = ny;
          near = true;
        }
      }
    }
  }

  /* the mole runs along a lane of its own; it may pass in front of the static loot */
  var moles = recipe.mole || 0;
  for (i = 0; i < moles; i++) {
    items.push(GM.makeItem(state, "mole", 24 + rng() * 112, 86 + rng() * 22, rng));
  }
  return items;
};

GM.countItems = function (items, type) {
  var n = 0;
  for (var i = 0; i < items.length; i++) if (items[i].type === type) n++;
  return n;
};

GM.tip = function (hook, anchor) {
  anchor = anchor || GM.ANCHOR;
  return {
    x: anchor.x + Math.sin(hook.angle) * hook.len,
    y: anchor.y + Math.cos(hook.angle) * hook.len
  };
};

/* the caught item hangs from the near edge, not from its centre */
GM.heldPos = function (hook, anchor) {
  var tip = GM.tip(hook, anchor);
  if (!hook.item) return tip;
  var off = hook.item.r + 2;
  return {
    x: tip.x + Math.sin(hook.angle) * off,
    y: tip.y + Math.cos(hook.angle) * off
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
  if (state.screen !== "play" || state.hook.state !== "back" || !state.hook.item ||
      state.dynamite <= 0 || state.bomb) return false;
  state.dynamite--;
  var p = GM.heldPos(state.hook);
  state.bomb = {
    t: 0,
    dur: 0.38,
    sx: GM.ANCHOR.x + 6,
    sy: GM.ANCHOR.y - 9,
    tx: p.x,
    ty: p.y,
    item: state.hook.item
  };
  state.throwT = GM.THROW_TIME;
  state.events.push("throw");
  return true;
};

GM.bombPos = function (b) {
  var p = Math.min(1, b.t / b.dur);
  return {
    x: b.sx + (b.tx - b.sx) * p,
    y: b.sy + (b.ty - b.sy) * p - Math.sin(p * Math.PI) * 7
  };
};

GM.resolveBomb = function (state) {
  var b = state.bomb;
  if (!b) return;
  state.bomb = null;
  var it = b.item, big = !!(it && it.kind === "tnt");
  if (state.hook.item === it) {
    state.hook.item = null;
    state.hook.state = "back";
  }
  /* A thrown bomb always wrecks what is around it. Landing it on a timed bomb
     that is already on the rope turns the small blast into the wide one. */
  GM.detonate(state, b.tx, b.ty, big ? GM.BIG_BLAST : GM.BLAST, big ? "bigboom" : "boom");
};

GM.updateBomb = function (state, dt) {
  if (!state.bomb) return;
  state.bomb.t += dt;
  if (state.bomb.t >= state.bomb.dur) GM.resolveBomb(state);
};

GM.attach = function (state, index) {
  var it = state.items[index];
  if (it.kind === "sealed") {
    /* banded stone: the claw rings off it and comes back empty; only a blast moves it */
    state.hook.state = "back";
    var tip = GM.tip(state.hook);
    GM.addParticles(state, tip.x, tip.y, 4, ["paper", "mid"]);
    state.events.push("clank");
    return null;
  }
  state.items.splice(index, 1);
  if (it.kind === "mine") {
    /* a mine does not ride the rope: the hook touching it sets it off on the spot */
    state.hook.item = null;
    state.hook.state = "back";
    GM.detonate(state, it.x, it.y, GM.BLAST, "mine");
    return null;
  }
  state.hook.item = it;
  state.hook.state = "back";
  if (it.kind === "tnt") {
    /* The fuse is part of the ride back, not a countdown at the spot: it blows up
       somewhere on the way in, after the player has committed to the grab. */
    var ride = Math.max(0.001, state.hook.len - 2) / GM.retractSpeed(it, state.strength);
    it.fuse = Math.max(0.16, Math.min(1.05, ride * 0.58));
  }
  var p = GM.tip(state.hook);
  GM.addParticles(state, p.x, p.y, 5, ["mid", "dark"]);
  state.events.push("grab");
  return it;
};

GM.collect = function (state) {
  var it = state.hook.item;
  if (!it) return;
  var p = GM.heldPos(state.hook);
  state.hook.item = null;
  state.hook.state = "swing";
  state.hook.len = GM.IDLE_ROPE;
  if (it.kind === "tnt") {
    GM.detonate(state, p.x, p.y, GM.BLAST, "boom");
    return;
  }
  if (it.kind === "bag") {
    var rw = it.reward || { kind: "cash", value: it.value || 0 };
    if (rw.kind === "cash") {
      state.bank += rw.value;
      state.events.push("coin");
      GM.addFloat(state, GM.ANCHOR.x, 6, "+" + rw.value);
    } else if (rw.kind === "dynamite") {
      state.dynamite += rw.value;
      state.events.push("buy");
      GM.addFloat(state, GM.ANCHOR.x, 6, "×" + rw.value);
    } else {
      state.strength = Math.min(3, state.strength + rw.value);
      state.events.push("gem");
      GM.addFloat(state, GM.ANCHOR.x, 6, "×" + rw.value);
    }
    GM.addParticles(state, p.x, p.y, 8, ["paper", "mid"]);
    return;
  }
  state.bank += it.value;
  var ev = it.kind === "gem" ? "gem"
    : (it.kind === "junk" || it.kind === "rock") ? "junk"
    : it.kind === "mole" ? (it.value > 0 ? "gem" : "junk")
    : "coin";
  state.events.push(ev);
  if (it.value > 0) GM.addFloat(state, GM.ANCHOR.x, 6, "+" + it.value);
  if (it.kind === "gem") GM.addParticles(state, p.x, p.y, 10, ["paper"]);
};

/* One blast. Everything inside the circle is destroyed; a mine or a timed bomb
   inside it goes off in turn, so bombs set off bombs. The source's own item is
   removed by its caller; a held item in range is knocked off the hook. */
/* ---- Old Wang: the rival in the endless levels ------------------------- */

GM.itemValue = function (it) {
  if (!it) return 0;
  if (it.type === "bag") {
    if (it.reward && it.reward.kind === "cash") return it.reward.value || 0;
    return 240;
  }
  if (it.type === "mole") return it.carry === "diamond" ? GM.ITEMS.diamond.value : 0;
  if (it.kind === "tnt" || it.kind === "mine" || it.kind === "sealed") return 0;
  return it.value || 0;
};

GM.rivalParams = function (n) {
  var over = Math.max(1, n - GM.PLAY_LEVELS);
  return {
    over: over,
    shotGap: Math.max(1.25, 4.4 - over * 0.25),
    aimError: Math.max(0.015, 0.20 - over * 0.018),
    smart: Math.min(0.95, 0.18 + over * 0.08),
    outSpeed: Math.min(200, 108 + over * 6),
    swingPeriod: Math.max(2.3, 4.0 - over * 0.12),
    strength: Math.min(4, Math.floor(over / 4)),
    speedMul: Math.min(1.3, 0.9 + over * 0.03),
    tauntDur: Math.max(0.55, 1.25 - over * 0.04),
    maxRope: Math.min(GM.RIVAL_MAX_ROPE, 136 + over * 2)
  };
};

GM.startRival = function (state, n) {
  var p = GM.rivalParams(n);
  state.rival = {
    active: true,
    anchor: { x: GM.RIVAL_X, y: GM.ANCHOR.y },
    hook: { state: "swing", len: GM.IDLE_ROPE, angle: 0, item: null },
    swingT: Math.random() * p.swingPeriod,
    cooldown: 0.8 + Math.random() * 0.7,
    target: null,
    wantAngle: 0,
    p: p,
    haul: 0,
    steals: 0,
    tauntT: 0,
    tauntDur: p.tauntDur,
    tauntKind: 0,
    tauntText: "",
    tauntItem: null
  };
  return state.rival;
};

/* the first solid thing a rope fired from this anchor would touch */
GM.firstHitFrom = function (anchor, item, items) {
  var ax = anchor.x, ay = anchor.y;
  var dx = item.x - ax, dy = item.y - ay;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return item;
  var ux = dx / len, uy = dy / len;
  var best = item, bestT = len;
  for (var i = 0; i < items.length; i++) {
    var other = items[i];
    if (other === item) continue;
    var ox = other.x - ax, oy = other.y - ay;
    var proj = ox * ux + oy * uy;
    if (proj <= 0 || proj > len) continue;
    var perp = Math.abs(-ox * uy + oy * ux);
    if (perp <= other.r + 4 && proj < bestT) { best = other; bestT = proj; }
  }
  return best;
};

GM.rivalPick = function (state) {
  var r = state.rival, items = state.items, pool = [], best = null, bestScore = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.type === "sealed") continue;
    var dx = it.x - r.anchor.x, dy = it.y - r.anchor.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d + it.r + 3 > r.p.maxRope) continue;
    var a = Math.atan2(dx, dy);
    if (Math.abs(a) > GM.SWING - 0.05) continue;
    pool.push(it);
    var v = GM.itemValue(it);
    if (v <= 0) v = (it.kind === "tnt" || it.kind === "mine") ? 20 : 1;
    var score = v / (0.6 + d / 60);
    if (GM.firstHitFrom(r.anchor, it, items) !== it) score *= 0.25;
    if (it.kind === "junk" || it.kind === "rock") score *= 0.2;
    if (it.kind === "tnt" || it.kind === "mine") score *= 0.12;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  if (best && Math.random() > r.p.smart && pool.length) {
    /* a clumsy Wang grabs whatever is nearest his swing */
    best = pool[Math.floor(Math.random() * pool.length)];
  }
  return best;
};

GM.rivalFire = function (state) {
  var r = state.rival;
  if (!r || r.tauntT > 0 || r.hook.state !== "swing") return false;
  r.hook.state = "out";
  r.hook.len = GM.IDLE_ROPE;
  r.target = null;
  state.events.push("rivalFire");
  return true;
};

GM.rivalAttach = function (state, index) {
  var r = state.rival, h = r.hook, it = state.items[index];
  if (it.kind === "sealed") {
    h.state = "back";
    var p0 = GM.tip(h, r.anchor);
    GM.addParticles(state, p0.x, p0.y, 4, ["paper", "mid"]);
    state.events.push("rivalClank");
    return null;
  }
  if (it.kind === "mine") {
    state.items.splice(index, 1);
    h.state = "back";
    GM.detonate(state, it.x, it.y, GM.BLAST, "rivalMine");
    r.cooldown = Math.max(r.cooldown, 0.3);
    return null;
  }
  state.items.splice(index, 1);
  h.item = it;
  h.state = "back";
  if (it.kind === "tnt") {
    var speed = GM.retractSpeed(it, r.p.strength) * r.p.speedMul;
    var ride = Math.max(0.001, h.len - 2) / speed;
    it.fuse = Math.max(0.16, Math.min(1.05, ride * 0.58));
  }
  var p1 = GM.tip(h, r.anchor);
  GM.addParticles(state, p1.x, p1.y, 4, ["mid", "dark"]);
  state.events.push("rivalGrab");
  return it;
};

GM.rivalCollect = function (state) {
  var r = state.rival, h = r.hook, it = h.item;
  if (!it) return;
  var value = GM.itemValue(it);
  h.item = null;
  h.state = "swing";
  h.len = GM.IDLE_ROPE;
  if (it.kind === "tnt") {
    var q = GM.heldPos(h, r.anchor);
    GM.detonate(state, q.x, q.y, GM.BLAST, "rivalBoom");
    return;
  }
  r.haul += value;
  r.steals++;
  r.cooldown = r.p.shotGap * (0.85 + Math.random() * 0.3);
  r.tauntT = r.tauntDur;
  r.tauntKind = Math.floor(Math.random() * 4);
  r.tauntText = ["HA!", "LOL", "NOOB", "MINE"][r.tauntKind];
  r.tauntItem = it;
  state.events.push("rivalTaunt");
};

GM.stepRival = function (state, dt) {
  var r = state.rival;
  if (!r) return;
  var h = r.hook;
  if (h.state === "out") {
    h.len += r.p.outSpeed * dt;
    var p = GM.tip(h, r.anchor);
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      var dx = it.x - p.x, dy = it.y - p.y;
      if (dx * dx + dy * dy <= (it.r + 4) * (it.r + 4)) {
        GM.rivalAttach(state, i);
        return;
      }
    }
    if (h.len >= r.p.maxRope || p.x < 3 || p.x > GM.W - 3 || p.y > GM.H - 2) h.state = "back";
    return;
  }
  if (h.state !== "back") return;
  if (h.item && h.item.kind === "tnt") {
    h.item.fuse -= dt;
    if (h.item.fuse <= 0) {
      var q = GM.heldPos(h, r.anchor);
      GM.detonate(state, q.x, q.y, GM.BLAST, "rivalBoom");
      return;
    }
  }
  var speed = h.item ? GM.retractSpeed(h.item, r.p.strength) * r.p.speedMul : GM.EMPTY_SPEED * 0.9;
  h.len -= speed * dt;
  if (h.item && h.len <= 2) {
    GM.rivalCollect(state);
    return;
  }
  if (!h.item && h.len <= GM.IDLE_ROPE) {
    h.len = GM.IDLE_ROPE;
    h.state = "swing";
    if (r.cooldown < 0.25) r.cooldown = 0.25;
  }
};

GM.updateRival = function (state, dt) {
  var r = state.rival;
  if (!r) return;
  if (r.tauntT > 0) {
    r.tauntT = Math.max(0, r.tauntT - dt);
    if (r.tauntT <= 0) {
      r.tauntText = "";
      r.hook.len = GM.IDLE_ROPE;
      r.hook.state = "swing";
      r.target = null;
      if (r.cooldown < 0.25) r.cooldown = 0.25;
    }
    return;
  }
  r.cooldown = Math.max(0, r.cooldown - dt);
  var h = r.hook;
  if (h.state !== "swing") {
    var left = dt;
    while (left > 0) {
      var step = Math.min(0.016, left);
      GM.stepRival(state, step);
      left -= step;
    }
    return;
  }
  var prev = h.angle;
  r.swingT += dt;
  h.angle = Math.sin(r.swingT * Math.PI * 2 / r.p.swingPeriod) * GM.SWING;
  if (r.cooldown > 0) return;
  if (!r.target || state.items.indexOf(r.target) < 0) {
    r.target = GM.rivalPick(state);
    if (r.target) {
      var want = Math.atan2(r.target.x - r.anchor.x, r.target.y - r.anchor.y);
      var err = (Math.random() * 2 - 1) * r.p.aimError;
      r.wantAngle = Math.max(-GM.SWING + 0.06, Math.min(GM.SWING - 0.06, want + err));
    }
  }
  if (!r.target) return;
  if ((prev - r.wantAngle) * (h.angle - r.wantAngle) <= 0 && Math.abs(h.angle - prev) < 0.6) {
    GM.rivalFire(state);
  }
};

GM.detonate = function (state, x, y, radius, ev) {
  radius = radius || GM.BLAST;
  var big = radius >= GM.BIG_BLAST;
  var keep = [], chain = [], i, it, dx, dy;
  for (i = 0; i < state.items.length; i++) {
    it = state.items[i];
    dx = it.x - x; dy = it.y - y;
    if (dx * dx + dy * dy <= radius * radius) {
      GM.addParticles(state, it.x, it.y, 6, ["mid", "dark", "paper"]);
      if (it.kind === "tnt" || it.kind === "mine") chain.push({ x: it.x, y: it.y });
    } else {
      keep.push(it);
    }
  }
  state.items = keep;
  if (state.hook.item) {
    var hp = GM.heldPos(state.hook);
    dx = hp.x - x; dy = hp.y - y;
    if (dx * dx + dy * dy <= radius * radius) state.hook.item = null;
  }
  if (state.rival && state.rival.hook.item) {
    var rp = GM.heldPos(state.rival.hook, state.rival.anchor);
    dx = rp.x - x; dy = rp.y - y;
    if (dx * dx + dy * dy <= radius * radius) {
      state.rival.hook.item = null;
      state.rival.hook.state = "back";
    }
  }
  if (state.hook.state === "out") state.hook.state = "back";
  state.blasts.push({ x: x, y: y, t: 0, life: big ? 0.78 : 0.55, r: radius, big: big });
  state.shake = Math.max(state.shake, big ? 0.72 : 0.4);
  state.events.push(ev || (big ? "bigboom" : "boom"));
  if (big) GM.addParticles(state, x, y, 18, ["paper", "mid", "dark"]);
  for (i = 0; i < chain.length; i++) {
    GM.detonate(state, chain[i].x, chain[i].y, GM.BLAST, "chain");
  }
};

GM.explode = function (state, x, y, radius, ev) {
  GM.detonate(state, x, y, radius, ev);
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
  /* strength, clover and the rock book are one-level purchases; they end with the level */
  state.strength = 0;
  state.clover = 0;
  state.book = 0;
  if (state.bank >= state.target) {
    GM.recordBest(state, state.level, state.bank);
    GM.setRun(state, state.level + 1);
    state.events.push("clear");
    if (state.level === GM.PLAY_LEVELS && !state.wonOnce) {
      state.wonOnce = true;
      state.screen = "victory";
    } else {
      state.screen = "clear";
    }
  } else {
    GM.recordBest(state, Math.max(0, state.level - 1), state.bank);
    GM.clearRun(state);
    state.events.push("fail");
    state.screen = "over";
  }
};

GM.setRun = function (state, level) {
  state.run = {
    level: level,
    bank: state.bank,
    dynamite: state.dynamite,
    strength: state.strength,
    clover: state.clover,
    book: state.book,
    runSeed: state.runSeed
  };
  state.runDirty = true;
};

GM.clearRun = function (state) {
  state.run = null;
  state.runDirty = true;
};

GM.runPayload = function (state) {
  var r = state.run;
  if (!r) return null;
  return {
    v: 1,
    level: r.level,
    bank: r.bank,
    dynamite: r.dynamite,
    strength: r.strength,
    clover: r.clover,
    book: r.book,
    runSeed: r.runSeed
  };
};

GM.readRun = function (raw) {
  if (raw == null) return { ok: true, run: null };
  if (typeof raw !== "object" || raw.length != null) return { ok: false, corrupt: true, run: null };
  var v = raw.v;
  if (typeof v !== "number" || Math.floor(v) !== v) return { ok: false, corrupt: true, run: null };
  if (v > 1) return { ok: false, newer: true, run: null };
  if (v !== 1) return { ok: false, corrupt: true, run: null };
  var nums = ["level", "bank", "dynamite", "strength", "clover", "book", "runSeed"];
  for (var i = 0; i < nums.length; i++) {
    var n = raw[nums[i]];
    if (typeof n !== "number" || Math.floor(n) !== n || n < 0) return { ok: false, corrupt: true, run: null };
  }
  if (raw.level < 1 || raw.level > 9999) return { ok: false, corrupt: true, run: null };
  if (raw.dynamite > GM.DYNAMITE_HARD_CAP || raw.strength > 3 || raw.clover > 2 || raw.book > 1) {
    return { ok: false, corrupt: true, run: null };
  }
  if (raw.runSeed < 1 || raw.runSeed > 4294967295) return { ok: false, corrupt: true, run: null };
  return {
    ok: true,
    run: {
      level: raw.level, bank: raw.bank, dynamite: raw.dynamite, strength: raw.strength,
      clover: raw.clover, book: raw.book, runSeed: raw.runSeed
    }
  };
};

GM.continueRun = function (state) {
  var r = state.run;
  if (!r) return false;
  state.runSeed = r.runSeed >>> 0;
  state.bank = r.bank;
  state.dynamite = r.dynamite;
  state.strength = r.strength;
  state.clover = r.clover;
  state.book = r.book;
  state.wonOnce = r.level > GM.PLAY_LEVELS;
  GM.startLevel(state, r.level);
  return true;
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
  state.shopOffers = GM.shopOffers(state, state.level + 1);
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
  var offers = state.shopOffers && state.shopOffers.length ? state.shopOffers : GM.shopOffers(state, state.level + 1);
  var item = offers[idx];
  if (!item || !item.available) { state.events.push("err"); return false; }
  var have = state[item.key] || 0;
  if ((item.max != null && have >= item.max) || state.bank < item.price) {
    state.events.push("err");
    return false;
  }
  state.bank -= item.price;
  state[item.key] = have + 1;
  state.shopOffers = offers;
  GM.setRun(state, state.level + 1);
  state.events.push("buy");
  return true;
};

GM.pause = function (state) {
  if (state.screen !== "play" && state.screen !== "intro") return false;
  state.resumeTo = state.screen;
  state.pauseCursor = 0;
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
  state.menuCursor = state.run ? 0 : 1;
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
      var q = GM.heldPos(hook);
      GM.detonate(state, q.x, q.y, GM.BLAST, "boom");
      return;
    }
  }
  var speed = hook.item ? GM.retractSpeed(hook.item, state.strength) : GM.EMPTY_SPEED;
  hook.len -= speed * dt;
  if (hook.item && hook.len <= 2) {
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
  if (state.throwT > 0) state.throwT = Math.max(0, state.throwT - dt);
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
  if (state.rival) GM.updateRival(state, dt);
  if (state.bomb) {
    GM.updateBomb(state, dt);
  } else {
    var left = dt;
    while (left > 0 && state.screen === "play") {
      var h = Math.min(0.016, left);
      GM.stepHook(state, h);
      left -= h;
    }
  }
  /* nothing left to catch: do not make the player sit out the rest of the clock */
  var rivalBusy = state.rival && (state.rival.hook.item || state.rival.tauntT > 0);
  if (state.screen === "play" && state.items.length === 0 && !state.hook.item && !rivalBusy) {
    GM.finishLevel(state);
    return;
  }
  GM.updateEffects(state, dt);
  state.shake = Math.max(0, state.shake - dt);
};
