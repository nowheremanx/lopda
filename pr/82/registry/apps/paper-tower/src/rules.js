/* Paper Tower: the rules. Pure functions over a plain state object: no drawing, no input, no PAD,
   so the same arithmetic runs in the game, in the tests and in the balance walker.
   A fight is deterministic: hits = ceil(monster hp / (atk - monster def)), and every hit costs
   max(0, monster atk - def). You win only if that total is strictly less than your hp. */
var PT = PT || {};
PT.RULES = (function () {
  "use strict";
  var D = PT.DATA;
  var VERSION = 2;

  function start() { return findChar(1, "<") || { x: 2, y: 9 }; }

  function newGame() {
    var p = start();
    return {
      v: VERSION, floor: 1, x: p.x, y: p.y,
      hp: 1200, hpMax: 1200, atk: 10, def: 10, gold: 0,
      keys: { y: 1, b: 0, r: 0 },
      mods: {}, flags: {}, visited: { "1": true },
      kills: 0, steps: 0, time: 0, wicks: 0, deaths: 0
    };
  }

  function clone(S) { return JSON.parse(JSON.stringify(S)); }

  function hydrate(raw) {
    if (!raw || raw.v !== VERSION || typeof raw.floor !== "number") return null;
    var S = newGame();
    for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) S[k] = raw[k];
    S.keys = S.keys || { y: 0, b: 0, r: 0 };
    S.mods = S.mods || {}; S.flags = S.flags || {}; S.visited = S.visited || { "1": true };
    return S;
  }

  function findChar(n, ch) {
    var f = D.floor(n);
    if (!f) return null;
    for (var y = 0; y < f.map.length; y++) for (var x = 0; x < f.map[y].length; x++) if (f.map[y][x] === ch) return { x: x, y: y };
    return null;
  }

  function tile(S, x, y) {
    var f = S.floor, k = f + "," + x + "," + y;
    if (S.mods[k] != null) return S.mods[k];
    return D.at(f, x, y);
  }
  function setTile(S, x, y, ch) { S.mods[S.floor + "," + x + "," + y] = ch; }
  function inside(x, y) { return x >= 0 && y >= 0 && x < 11 && y < 11; }

  function isSolid(S, x, y) {
    if (!inside(x, y)) return true;
    var ch = tile(S, x, y);
    return ch === "#" || ch === "%" || ch === "m" || ch === "n" || ch === "Y" || ch === "B" || ch === "R" ||
      !!D.monsterAt(ch, D.zoneOf(S.floor)) || ch === "z" || ch === "Z";
  }

  function walkable(S, x, y) { return !isSolid(S, x, y); }

  /* The king is softer when all three wicks are carried. Rounding is applied once, here. */
  function monsterFor(S, ch) {
    var zone = D.zoneOf(S.floor), m = null;
    if (ch === "z" || ch === "Z") {
      if ((ch === "Z") !== (S.floor === 50)) return null;
      m = D.bossAt(S.floor);
    } else m = D.monsterAt(ch, zone);
    if (!m) return null;
    if (m.boss && S.floor === 50 && S.wicks >= D.WICKS) {
      m = clone(m);
      m.atk = Math.round(m.atk * 0.8);
      m.def = Math.round(m.def * 0.8);
      m.weakened = true;
    }
    return m;
  }
  /* what the fight would cost, shown before it starts and in the bestiary */
  function forecast(S, m) {
    if (!m) return { can: false, reason: "none", loss: 0, hits: 0, damage: 1 };
    var damage = S.atk - m.def;
    if (damage <= 0) return { can: false, reason: "def", loss: 0, hits: 0, damage: damage };
    var hits = Math.ceil(m.hp / damage);
    var loss = Math.max(0, m.atk - S.def) * hits;
    return { can: true, win: loss < S.hp, loss: loss, hits: hits, damage: damage, survive: S.hp - loss };
  }

  function fight(S, ch, x, y) {
    if (x != null && tile(S, x, y) !== ch) return { ok: false, reason: "empty" };
    var m = monsterFor(S, ch), f = forecast(S, m);
    if (!f.can) return { ok: false, reason: "def", monster: m };
    if (f.loss >= S.hp) return { ok: false, reason: "die", monster: m, loss: f.loss };
    S.hp -= f.loss;
    S.gold += m.gold;
    S.kills++;
    if (m.boss) S.flags["boss:" + S.floor] = true;
    if (x != null) setTile(S, x, y, ".");
    return { ok: true, monster: m, loss: f.loss, gold: m.gold, hits: f.hits };
  }

  function take(S, ch) {
    var zone = D.zoneOf(S.floor), it = D.itemAt(ch, zone), out = { kind: "", name: null, amount: 0, key: null };
    if (ch === "y" || ch === "b" || ch === "r") {
      S.keys[ch]++;
      out.kind = "key"; out.key = ch; out.amount = 1;
      out.name = { zh: D.KEY_NAMES[ch].zh, en: D.KEY_NAMES[ch].en };
      setTile(S, S.x, S.y, ".");
      return out;
    }
    if (!it) return null;
    out.kind = it.kind; out.name = it.name; out.amount = it.amount;
    if (it.kind === "hp") { S.hpMax += it.amount; S.hp += it.amount; }
    else if (it.kind === "atk") S.atk += it.amount;
    else if (it.kind === "def") S.def += it.amount;
    else if (it.kind === "gold") S.gold += it.amount;
    else if (it.kind === "wick") S.wicks += it.amount;
    setTile(S, S.x, S.y, ".");
    return out;
  }

  function doorAt(S, x, y) {
    var ch = tile(S, x, y), key = D.isDoor(ch) ? D.doorKey(ch) : null;
    return { ch: ch, key: key };
  }
  function openDoor(S, x, y) {
    var d = doorAt(S, x, y);
    if (!d.key) return { ok: false, reason: "none" };
    if (!S.keys[d.key]) return { ok: false, reason: "key", key: d.key };
    S.keys[d.key]--;
    S.mods[S.floor + "," + x + "," + y] = ".";
    return { ok: true, key: d.key };
  }

  function reveal(S, x, y) {
    if (tile(S, x, y) !== "%") return false;
    setTile(S, x, y, ".");
    return true;
  }
  function secrets(S) {
    var f = D.floor(S.floor), out = [];
    for (var y = 0; y < 11; y++) for (var x = 0; x < 11; x++) if (tile(S, x, y) === "%") out.push({ x: x, y: y });
    return out;
  }

  /* shops: stock counts live in flags, so an undo or a reload cannot buy twice */
  function shopAt(S) { return D.SHOPS[S.floor] || null; }
  function bought(S, i) { return S.flags["shop:" + S.floor + ":" + i] || 0; }
  function stockLeft(S, i) { var sh = shopAt(S); return sh ? Math.max(0, sh.stock[i].times - bought(S, i)) : 0; }
  function buy(S, i) {
    var sh = shopAt(S); if (!sh || !sh.stock[i]) return { ok: false, reason: "none" };
    var it = sh.stock[i], left = stockLeft(S, i);
    if (!left) return { ok: false, reason: "sold" };
    if (S.gold < it.price) return { ok: false, reason: "gold" };
    S.gold -= it.price;
    S.flags["shop:" + S.floor + ":" + i] = bought(S, i) + 1;
    if (it.id === "atk") S.atk += it.amount;
    else if (it.id === "def") S.def += it.amount;
    else if (it.id === "hp") { S.hpMax += it.amount; S.hp += it.amount; }
    else S.keys[it.id]++;
    return { ok: true, id: it.id, amount: it.amount, price: it.price };
  }

  function drink(S) {
    if (S.flags["fountain:" + S.floor]) return false;
    S.flags["fountain:" + S.floor] = true;
    S.hp = S.hpMax;
    return true;
  }

  /* no game over: the tower folds you back to this page's entrance, a little poorer */
  function revive(S) {
    var p = findChar(S.floor, "<") || { x: S.x, y: S.y };
    var lost = Math.floor(S.gold * 0.2);
    S.gold -= lost;
    S.deaths++;
    S.hp = S.hpMax;
    S.x = p.x; S.y = p.y;
    return { lost: lost, x: p.x, y: p.y };
  }

  function nextFloor(S) {
    var p = findChar(S.floor + 1, "<");
    if (!p) return false;
    S.floor++;
    S.x = p.x; S.y = p.y;
    S.visited[String(S.floor)] = true;
    return true;
  }
  function prevFloor(S) {
    if (S.floor <= 1) return false;
    var p = findChar(S.floor - 1, ">");
    if (!p) return false;
    S.floor--;
    S.x = p.x; S.y = p.y;
    S.visited[String(S.floor)] = true;
    return true;
  }

  /* fast travel: only the four folds, and only once they have been visited */
  function travelTargets(S) {
    return [1, 11, 21, 31, 41].filter(function (n) { return n !== S.floor && S.visited[String(n)]; });
  }
  function travel(S, n) {
    if (travelTargets(S).indexOf(n) < 0) return false;
    var p = findChar(n, "<");
    if (!p) return false;
    S.floor = n; S.x = p.x; S.y = p.y;
    S.visited[String(n)] = true;
    return true;
  }

  function score(S) {
    return (S.floor - 1) * 100 + S.kills * 10 + S.wicks * 500 + (S.flags["boss:50"] ? 5000 : 0);
  }

  return {
    VERSION: VERSION, newGame: newGame, clone: clone, hydrate: hydrate, findChar: findChar,
    tile: tile, setTile: setTile, inside: inside, isSolid: isSolid, walkable: walkable,
    monsterFor: monsterFor, forecast: forecast, fight: fight, take: take, doorAt: doorAt,
    openDoor: openDoor, reveal: reveal, secrets: secrets, shopAt: shopAt, stockLeft: stockLeft,
    bought: bought, buy: buy, drink: drink, revive: revive, nextFloor: nextFloor, prevFloor: prevFloor,
    travelTargets: travelTargets, travel: travel, score: score
  };
})();
