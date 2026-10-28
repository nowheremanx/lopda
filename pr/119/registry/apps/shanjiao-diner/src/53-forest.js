/* The mountain: one screen, three actions, a basket and a knife. */
var FOREST_MAP = [
  "TTTTTTTTDTTTTTTTTT",
  "T.......,........T",
  "T..TT...,...TT...T",
  "T..TT...,...TT...T",
  "T.......,........T",
  "T..~~~..,........T",
  "T..~~~..,........T",
  "T.......,........T",
  "T...TT..,..TT....T",
  "T...TT..,..TT....T",
  "T.......,........T",
  "T..S....,........T",
  "T.......,........T",
  "T.......,........T",
  "T.......,........T",
  "TTTTTTTTETTTTTTTTT"
];
var DEEP_MAP = [
  "TTTTTTTTTTTTTTTTTT",
  "T................T",
  "T.......~~.......T",
  "T.......~~.......T",
  "T..TT........TT..T",
  "T..TT...S....TT..T",
  "T................T",
  "T......#..#......T",
  "T................T",
  "T................T",
  "T...TT......TT...T",
  "T...TT......TT...T",
  "T................T",
  "T................T",
  "T................T",
  "TTTTTTTTTTTTTTTTTT"
];
var FOREST_DECOR = [[2, 3, "bamboo"], [15, 4, "bamboo"], [6, 9, "bamboo"], [12, 12, "bamboo"]];
var NODE_SPOTS = {
  mushroom: [[3, 1], [14, 1], [5, 4], [15, 7], [4, 13], [12, 11]],
  greens: [[2, 7], [13, 4], [6, 12], [15, 13]],
  rice: [[12, 5], [3, 8], [10, 13]],
  fish: [[3, 7], [4, 7], [14, 5], [15, 8]],
  bamboo: [[2, 9], [15, 10], [6, 3]]
};
var DEEP_SPOTS = {
  rare: [[3, 2], [14, 2], [4, 9], [14, 9]],
  mushroom: [[2, 6], [15, 6], [6, 12], [11, 13]]
};
var FOREST_MONSTERS = [
  { id: "boar", x: 4, y: 7 },
  { id: "monkey", x: 13, y: 6 },
  { id: "bamboo", x: 11, y: 10 }
];

var trip = null;

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function someOf(arr, n) { return shuffle(arr).slice(0, n); }

function newTrip() {
  var t = {
    area: "forest", stamina: 4, staminaMax: 4, basket: 0, basketMax: 10,
    nodes: [], monsters: [], shrine: false, deep: false,
    player: { x: 8, y: 13, fx: 8, fy: 13, t: 1, dir: "up", cool: 0 },
    fx: []
  };
  var n = { mushroom: 3, greens: 2, rice: 2, fish: 1, bamboo: 1 };
  if (S.weather === "rain") n.mushroom++;
  for (var k in n) if (Object.prototype.hasOwnProperty.call(n, k)) {
    var spots = someOf(NODE_SPOTS[k] || [], n[k]);
    for (var i = 0; i < spots.length; i++) t.nodes.push({ kind: k, x: spots[i][0], y: spots[i][1] });
  }
  t.monsters = someOf(FOREST_MONSTERS, 2).map(function (m) { return { id: m.id, x: m.x, y: m.y }; });
  return t;
}

function deepTrip(t) {
  t.area = "deep";
  t.deep = true;
  t.player = { x: 8, y: 14, fx: 8, fy: 14, t: 1, dir: "up", cool: 0 };
  t.nodes = [];
  for (var k in DEEP_SPOTS) if (Object.prototype.hasOwnProperty.call(DEEP_SPOTS, k)) {
    var spots = someOf(DEEP_SPOTS[k], k === "rare" ? 2 : 2);
    for (var i = 0; i < spots.length; i++) t.nodes.push({ kind: k, x: spots[i][0], y: spots[i][1] });
  }
  t.monsters = [{ id: "boss", x: 8, y: 4 }];
  if (S.flags.boss) t.monsters = [];
  t.shrine = false;
}

function forestMap() { return trip.area === "deep" ? DEEP_MAP : FOREST_MAP; }
function mapChar(x, y) {
  var m = forestMap();
  if (y < 0 || y >= m.length || x < 0 || x >= m[0].length) return "T";
  return m[y][x];
}
function solidAt(x, y) {
  var c = mapChar(x, y);
  return c === "T" || c === "~" || c === "#";
}
function nodeAt(x, y) {
  for (var i = 0; i < trip.nodes.length; i++) if (trip.nodes[i].x === x && trip.nodes[i].y === y) return trip.nodes[i];
  return null;
}
function monsterAt(x, y) {
  for (var i = 0; i < trip.monsters.length; i++) if (trip.monsters[i].x === x && trip.monsters[i].y === y) return trip.monsters[i];
  return null;
}
function yieldOf(kind) {
  if (kind === "mushroom") return 2 + (S.weather === "rain" ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0);
  if (kind === "fish") return 1 + (Math.random() < 0.5 ? 1 : 0);
  if (kind === "rare") return 1;
  return 2;
}
function addBasket(n) { trip.basket = Math.min(trip.basketMax, trip.basket + n); }

async function endTrip(msg) {
  if (!trip) return;
  busy = true;
  if (msg) sayToast(msg);
  await game.wait(0.7);
  game.go("morning");
}

async function gatherNode(node) {
  if (busy) return;
  busy = true;
  var n = yieldOf(node.kind);
  addIng(node.kind, n);
  addBasket(n);
  trip.stamina--;
  trip.nodes.splice(trip.nodes.indexOf(node), 1);
  trip.fx.push({ text: "+" + n + " " + DATA.ING[node.kind].one, x: node.x * 12, y: 24 + node.y * 12 - 4, until: game.time + 1.2 });
  game.sfx("coin");
  save();
  if (trip.stamina <= 0) { await endTrip("没力气了，回店吧"); return; }
  if (trip.basket >= trip.basketMax) { await endTrip("篮子满了，回店吧"); return; }
  busy = false;
}

async function startBattle(m) {
  trip.stamina--;
  busy = true;
  var res = await game.push("battle", { enemy: m.id, from: trip.area, boss: m.id === "boss" });
  if (!res) res = { result: "flee" };
  if (res.result === "win") {
    trip.monsters.splice(trip.monsters.indexOf(m), 1);
    if (res.drops) for (var i = 0; i < res.drops.length; i++) addBasket(res.drops[i][1]);
    sayToast(m.id === "boss" ? "山魈倒下了。山珍到手。" : "打赢了，食材到手");
    if (m.id === "boss") {
      S.flags.boss = 1;
      unlockDish("god_soup");
      save();
    }
  } else if (res.result === "lose") {
    S.money = Math.max(0, S.money - 5);
    var ids = DATA.ING_ORDER.filter(function (id) { return ing(id) > 0; });
    if (ids.length) addIng(ids[Math.floor(Math.random() * ids.length)], -1);
    save();
    busy = true;
    await game.say(["眼前一黑……", "醒来时，你已经在店里。篮子轻了，钱也少了。"]);
    game.go("morning");
    return;
  } else {
    // ran away: step back
    trip.player.x = trip.player.fx;
    trip.player.y = trip.player.fy;
    trip.player.t = 1;
  }
  busy = false;
  if (trip.stamina <= 0) await endTrip("没力气了，回店吧");
  else if (trip.basket >= trip.basketMax) await endTrip("篮子满了，回店吧");
}

function arrive(x, y) {
  var m = monsterAt(x, y);
  if (m) { startBattle(m); return; }
  var n = nodeAt(x, y);
  if (n) { gatherNode(n); return; }
  if (mapChar(x, y) === "S") {
    if (!trip.shrine) {
      trip.shrine = true;
      if (trip.stamina < trip.staminaMax) trip.stamina = Math.min(trip.staminaMax, trip.stamina + 2);
      game.sfx("ok");
      sayToast("山神泉：力气回来了");
    }
    return;
  }
  if (mapChar(x, y) === "D") {
    if (trip.area === "forest") {
      if (S.flags.deep) {
        game.sfx("move");
        deepTrip(trip);
      } else {
        game.sfx("err");
        sayToast("雾太深，还进不去");
        trip.player.x = 8; trip.player.y = 1; trip.player.fx = 8; trip.player.fy = 1;
      }
    }
  }
}

game.scene("forest", {
  enter: function () {
    trip = newTrip();
    busy = false;
    game.ambience(S.weather === "rain" ? "rain" : "stream", 0.35);
    if (typeof playMusic === "function") playMusic("forest");
  },
  update: function (dt) {
    if (!trip || busy) return;
    if (game.pressed("start")) {
      game.sfx("tap");
      game.push("codex", { from: "forest" });
      return;
    }
    if (game.pressed("b")) {
      if (trip.area === "deep") {
        game.sfx("move");
        trip.area = "forest";
        trip.player = { x: 8, y: 1, fx: 8, fy: 1, t: 1, dir: "down", cool: 0.2 };
        return;
      }
      endTrip("回店");
      return;
    }
    var p = trip.player;
    if (p.t < 1) {
      p.t = Math.min(1, p.t + dt / 0.13);
      if (p.t >= 1) { p.fx = p.x; p.fy = p.y; arrive(p.x, p.y); }
      return;
    }
    p.cool -= dt;
    if (p.cool > 0) return;
    var dx = 0, dy = 0;
    if (game.btn("up")) dy = -1;
    else if (game.btn("down")) dy = 1;
    else if (game.btn("left")) dx = -1;
    else if (game.btn("right")) dx = 1;
    if (!dx && !dy) return;
    p.dir = dy < 0 ? "up" : dy > 0 ? "down" : dx < 0 ? "left" : "right";
    var nx = p.x + dx, ny = p.y + dy;
    if (solidAt(nx, ny)) { p.cool = 0.12; game.sfx("err"); return; }
    p.fx = p.x; p.fy = p.y;
    p.x = nx; p.y = ny; p.t = 0; p.cool = 0.13;
    game.sfx("tick");
  },
  draw: function (g) {
    if (!trip) return;
    var map = forestMap();
    ART.forest(g, map, game.time, trip.area === "deep" ? { weather: "fog" } : S);
    g.clip(0, 24, 216, 192);
    if (trip.area === "deep") {
      g.dither(0, 24, 216, 26, g.INK, 1);
      g.dither(0, 190, 216, 26, g.INK, 1);
      g.dither(0, 24, 18, 192, g.INK, 1);
      g.dither(198, 24, 18, 192, g.INK, 1);
    }
    var items = [];
    for (var r = 0; r < map.length; r++) for (var c = 0; c < map[r].length; c++) {
      var ch = map[r][c], x = c * 12, y = 24 + r * 12;
      if (ch === "T") items.push({ y: y + 12, fn: (function (xx, yy) { return function () { ART.tree(g, xx, yy - 8, game.time); }; })(x, y) });
      if (ch === "S") items.push({ y: y + 12, fn: (function (xx, yy) { return function () { ART.shrine(g, xx - 6, yy - 14, game.time); }; })(x, y) });
      if (ch === "D") items.push({ y: y + 12, fn: (function (xx, yy) { return function () { ART.shrine(g, xx - 6, yy + 2, game.time); }; })(x, y) });
      if (ch === "E") items.push({ y: y + 12, fn: (function (xx, yy) { return function () {
        g.rect(xx - 6, yy + 2, 24, 2, g.DARK); g.rect(xx - 3, yy + 4, 18, 1, g.MID);
        g.rect(xx - 2, yy - 2, 2, 5, g.DARK); g.rect(xx + 12, yy - 2, 2, 5, g.DARK);
      }; })(x, y) });
      if (ch === "T" && (r * 3 + c) % 11 === 0) items.push({ y: y + 14, fn: (function (xx, yy) { return function () { ART.bush(g, xx, yy, game.time); }; })(x, y) });
    }
    for (var d = 0; d < FOREST_DECOR.length; d++) {
      var dec = FOREST_DECOR[d];
      if (trip.area === "forest") {
        items.push({ y: 24 + dec[1] * 12 + 12, fn: (function (xx, yy) { return function () { ART.bambooPlant(g, xx, yy - 8, game.time); }; })(dec[0] * 12, 24 + dec[1] * 12) });
      }
    }
    for (var n = 0; n < trip.nodes.length; n++) {
      var nd = trip.nodes[n];
      items.push({ y: 24 + nd.y * 12 + 12, fn: (function (node) { return function () { ART.node(g, node.kind, node.x * 12, 24 + node.y * 12, game.time); }; })(nd) });
    }
    for (var m = 0; m < trip.monsters.length; m++) {
      var mo = trip.monsters[m];
      items.push({ y: 24 + mo.y * 12 + 12, fn: (function (mon) { return function () { ART.monster(g, mon.id, mon.x * 12, 24 + mon.y * 12, game.time); }; })(mo) });
    }
    var p = trip.player;
    items.push({ y: 24 + p.y * 12 + 12, fn: function () {
      var px = LoGame.lerp(p.fx, p.x, p.t) * 12;
      var py = LoGame.lerp(p.fy, p.y, p.t) * 12 + 18;
      g.dither(px, py + 16, 12, 2, g.DARK, 1);
      var s = p.dir === "up" ? ART.heroUp : p.dir === "down" ? ART.heroDown : ART.heroSide;
      g.sprite(s, px, py + (p.t < 1 ? Math.sin(p.t * Math.PI) * -2 : 0), { flip: p.dir === "left" });
    } });
    items.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < items.length; i++) items[i].fn();
    // pickups float up
    for (var f = 0; f < trip.fx.length; f++) {
      var fx = trip.fx[f];
      if (game.time < fx.until) g.text(fx.text, fx.x, fx.y - (fx.until - game.time) * 8, { color: g.PAPER });
    }
    trip.fx = trip.fx.filter(function (v) { return game.time < v.until; });
    // the icon is 12 px; a name tag appears when the player is next to it
    var near = null;
    for (var nn = 0; nn < trip.nodes.length; nn++) {
      var nd = trip.nodes[nn];
      if (Math.abs(nd.x - p.x) <= 1 && Math.abs(nd.y - p.y) <= 1) { near = nd; break; }
    }
    var nearFoe = null;
    if (!near) {
      for (var nf = 0; nf < trip.monsters.length; nf++) {
        var mo = trip.monsters[nf];
        if (Math.abs(mo.x - p.x) <= 1 && Math.abs(mo.y - p.y) <= 1) { nearFoe = mo; break; }
      }
    }
    var tag = near ? DATA.ING[near.kind].name : nearFoe ? DATA.ENEMIES[nearFoe.id].name : "";
    if (tag) {
      var lw = g.measure(tag) + 8;
      var src = near || nearFoe;
      var lx = Math.max(2, Math.min(216 - lw - 2, src.x * 12 + 6 - lw / 2));
      var ly = Math.max(28, Math.min(200, 24 + src.y * 12 - 14));
      g.window(lx, ly, lw, 14, { thin: true });
      g.text(tag, lx + 4, ly + 2);
    }
    g.clip();
    // HUD
    g.window(6, 4, 204, 22, { thin: true });
    g.text(trip.area === "deep" ? "后山深处" : "后山", 10, 6);
    ART.weatherIcon(g, trip.area === "deep" ? "fog" : S.weather, 66, 8, game.time);
    g.text("体力", 92, 6, { color: g.DARK });
    for (var st = 0; st < trip.staminaMax; st++) {
      g.rect(122 + st * 8, 8, 5, 5, st < trip.stamina ? g.INK : g.MID);
    }
    g.text("篮 " + trip.basket + "/" + trip.basketMax, 202, 6, { align: "right", color: g.DARK });
    UI.footer(g, trip.area === "deep" ? "方向键 走　START 图鉴　B 回后山" : "方向键 走　START 图鉴　B 回店");
    UI.toast(g);
  }
});
