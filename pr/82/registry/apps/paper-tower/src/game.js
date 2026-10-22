/* Paper Tower: the game. A twelve-page tower-climbing RPG in the classic key-and-door tradition:
   walk, open doors, take stones, fight with arithmetic, buy from four shops, find the folds.
   Everything visible is drawn on lo-game's 160x144 four-tone screen. MIT License. */
var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

var D = PT.DATA, R = PT.RULES, A = PT.ART, M = PT.MUSIC;
var HUD = 30, TS = 16, VIEW_H = 144 - HUD, VIEW_W = 160, MAP_W = 11 * TS, MAP_H = 11 * TS;
var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
var SLOT_KEYS = ["auto", "slot1", "slot2", "slot3"];
var S = null, busy = false, musicId = null;
var toastMsg = null, toastT = 0, banner = null, bannerT = 0;

function t(zh, en) { return T({ zh: zh, en: en }); }
function tname(o) { return T(o); }
function sfx(id) { if (PT.SFX[id]) game.sfx(PT.SFX[id]); else game.sfx(id); }
function pct(a, b) { return b <= 0 ? 0 : Math.max(0, Math.min(1, a / b)); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function clock(sec) { var m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ":" + pad2(s); }
function when(ms) {
  var d = new Date(ms || 0);
  return (d.getMonth() + 1) + "/" + d.getDate();
}
function toast(msg) { toastMsg = msg; toastT = 2.4; }
function music(id) {
  if (musicId === id) return;
  musicId = id;
  var song = id ? (id.indexOf("zone") === 0 ? M.zone[+id.slice(4)] : M[id]) : null;
  if (song) game.music(song); else if (id === null) game.musicStop();
}
function zoneMusic(n) { return "zone" + D.zoneOf(n); }
function setAmbience(n) {
  var z = D.zoneOf(n);
  if (z === 1) game.ambience("wind", 0.13);
  else if (z === 2) game.ambience("fire", 0.2);
  else game.ambience(null);
}
function pack() { var o = R.clone(S); o.savedAt = Date.now(); return o; }
function saveAuto() { if (S) game.save("auto", pack()); }
function loadRun(key) { return game.load(key).then(function (v) { return v ? R.hydrate(v) : null; }); }

/* ---------- title screen ---------- */
var FIVE = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"]
};
function bigText(g, str, x, y, k, tone) {
  var w = 0, i;
  for (i = 0; i < str.length; i++) w += 6 * k;
  var left = Math.round(x - w / 2);
  for (i = 0; i < str.length; i++) {
    var gl = FIVE[str.charAt(i)];
    if (gl) for (var j = 0; j < 7; j++) for (var q = 0; q < 5; q++) if (gl[j].charAt(q) === "1") g.rect(left + i * 6 * k + q * k, y + j * k, k, k, tone);
  }
}
function titleTower(g, time) {
  var cx = 80, base = 80;
  g.dither(0, 0, 160, 144, 3, 1);
  for (var i = 0; i < 18; i++) {
    var sx = (i * 43 + 11) % 150 + 5, sy = (i * 29 + Math.floor(time * 6)) % 120;
    g.pixel(sx, sy, i % 3 ? 2 : 3);
  }
  for (i = 0; i < 14; i++) {
    var rx = (i * 37 + Math.floor(time * 24)) % 170 - 5, ry = (i * 23 + Math.floor(time * 15)) % 150;
    g.line(rx, ry, rx + 2, ry + 5, 2);
  }
  /* a lamp and its tower, folded from seven strips of paper */
  g.rect(cx - 6, 22, 12, 9, 3);
  g.rect(cx - 4, 17, 8, 6, 3);
  g.rect(cx - 2, 14, 4, 4, 2);
  if (Math.floor(time * 5) % 2 === 0) g.rect(cx - 1, 11, 2, 4, 0);
  for (i = 0; i < 7; i++) {
    var w = 52 - i * 6, y = 31 + i * 7;
    g.rect(cx - w / 2, y, w, 7, i % 2 ? 2 : 1);
    g.frame(cx - w / 2, y, w, 7, 0);
    if (i % 2 === 0) {
      g.rect(cx - 2, y + 2, 4, 4, 3);
      g.rect(cx - 8, y + 2, 4, 4, 3);
      g.rect(cx + 4, y + 2, 4, 4, 3);
    }
  }
  g.rect(cx - 34, base, 68, 4, 0);
  g.line(cx - 34, base, cx - 42, base + 8, 0);
  g.line(cx + 34, base, cx + 42, base + 8, 0);
  for (i = 0; i < 3; i++) {
    var px = 20 + i * 52 + Math.floor(time * 6 + i * 17) % 10, py = 46 + i * 20 + Math.floor(time * 4 + i * 9) % 7;
    g.rect(px, py, 10, 7, 3); g.frame(px, py, 10, 7, 0); g.line(px, py + 7, px + 10, py, 2);
  }
}
var titleAuto = null, titleMeta = null;
game.scene("title", {
  enter: function () {
    S = null; busy = false; titleAuto = null; titleMeta = null;
    music("title"); game.ambience(null);
    loadRun("auto").then(function (v) { titleAuto = v; });
    game.load("meta").then(function (v) { titleMeta = v; });
  },
  update: function (dt) {
    if (busy) return;
    if (game.pressed("a") || game.pressed("start") || game.pointer.pressed) titleMenu();
  },
  draw: function (g) {
    g.clear(g.INK);
    titleTower(g, game.time);
    g.dither(0, 82, 160, 62, 0, 3);
    bigText(g, "PAPER TOWER", 80, 88, 2, g.PAPER);
    g.text(titleMeta && titleMeta.cleared ? t("灯已点亮", "the lamp is lit") : t("纸 塔", "a twelve-page climb"), 80, 108, { align: "center", color: g.PAPER });
    if (Math.floor(game.time * 2) % 2 === 0) g.text(t("按 A 开始", "PRESS A"), 80, 130, { align: "center", color: g.PAPER });
  }
});
async function titleMenu() {
  busy = true;
  var items = [], acts = [];
  if (titleAuto) { items.push(t("继续　第 {n} 页", "Continue　page {n}").replace("{n}", titleAuto.floor)); acts.push("continue"); }
  items.push(t("新的一页", "A new page")); acts.push("new");
  items.push(t("读取存档", "Load a save")); acts.push("load");
  items.push(t("怎么玩", "How to play")); acts.push("help");
  var i = await game.choose(items, { title: t("纸塔", "Paper Tower") });
  if (i < 0) { busy = false; return; }
  var act = acts[i];
  if (act === "continue") { S = titleAuto; busy = false; goPlay(); return; }
  if (act === "new") {
    if (titleAuto) {
      var c = await game.choose([t("从头开始", "Start over"), t("再想想", "Not yet")], { title: t("盖过自动存档？", "Replace the auto save?") });
      if (c !== 0) { busy = false; return; }
    }
    S = R.newGame(); saveAuto(); busy = false; goPlay(); return;
  }
  if (act === "load") {
    var v = await game.push(slotsScene("load"));
    if (v) { S = v; saveAuto(); busy = false; goPlay(); return; }
    busy = false; return;
  }
  await helpPages();
  busy = false;
}
function goPlay() {
  syncHeroBase();
  banner = null; bannerT = 0; toastT = 0;
  game.go("play", null, { fade: true });
}

/* ---------- the play scene ---------- */
var p = { px: 0, py: 0, dir: "down", moving: null, autoPath: null, autoAct: null, autoT: 0, holdT: 0, lastDir: null };
function syncHeroBase() {
  if (!S) return;
  p.px = S.x * TS; p.py = S.y * TS; p.moving = null; p.autoPath = null; p.autoAct = null;
}
function syncHero() { if (S) { p.px = S.x * TS; p.py = S.y * TS; p.moving = null; } }
function camera() { return LoGame.camera(p.px + 8, p.py + 8, VIEW_W, VIEW_H, MAP_W, MAP_H); }
function facingTile() {
  var d = DIRS[p.dir]; return { x: S.x + d[0], y: S.y + d[1] };
}
function tileText(ch, x, y) {
  if (ch === "#") return null;
  if (ch === "%") return t("墙上有折缝。", "A seam in the wall.");
  if (D.isMonster(ch) || ch === "z" || ch === "Z") {
    var m = R.monsterFor(S, ch);
    return m ? tname(m.name) : null;
  }
  if (D.isDoor(ch)) return t("用钥匙开门。", "Open it with a key.");
  if (ch === "m") return t("墨铺。按 A 交易。", "Ink shop. A to trade.");
  if (ch === "n") return t("有人。按 A 说话。", "Someone. A to talk.");
  if (ch === "f") return t("一眼墨泉。", "An ink spring.");
  if (ch === "L") return t("长明灯。", "The Everlamp.");
  if (D.isStair(ch)) return ch === ">" ? t("上一页。", "Up a page.") : t("下一页。", "Down a page.");
  return null;
}
function heldDir() {
  var dirs = ["up", "down", "left", "right"];
  if (p.lastDir && game.btn(p.lastDir)) return p.lastDir;
  for (var i = 0; i < dirs.length; i++) if (game.btn(dirs[i])) return dirs[i];
  return null;
}
game.scene("play", {
  enter: function () {
    busy = false; syncHeroBase();
    toastT = 0; toastMsg = null;
    banner = D.FLOOR_NAMES[S.floor - 1]; bannerT = 1.8;
    music(zoneMusic(S.floor)); setAmbience(S.floor);
    if (!S.flags.intro) {
      S.flags.intro = true; saveAuto(); busy = true; bannerT = 0;
      game.say([
        t("纸塔的灯灭了。十二页纸一起发软，边角往里卷。", "The tower's lamp is out. Twelve pages are going soft, curling at the edges."),
        t("你是阿折，送信人。带着最后一根火柴，从第一页爬到灯座。", "You are A Zhe, a courier. Carry the last match from page one to the lamp stand."),
        t("方向键走。A 开门、说话、打怪。START 菜单，SELECT 摸身边的墙。", "Arrows walk. A opens, talks and fights. START menu, SELECT feels the wall."),
        t("有些怪守在门口，绕不过去；先看损耗再动手。", "Some monsters hold a doorway. You cannot walk around them; read the cost first."),
        t("打不过就回墨铺。败北只回本页入口，金币少两成。", "Stuck? Go back to a shop. Falling only returns you here, minus a fifth of your gold.")
      ], { name: t("纸塔", "Paper Tower") }).then(function () { busy = false; });
    }
  },
  update: function (dt) {
    if (!S) return;
    S.time += dt;
    if (bannerT > 0) bannerT -= dt;
    if (toastT > 0) toastT -= dt;
    if (p.holdT > 0) p.holdT -= dt;
    if (busy) return;
    if (p.moving) { advanceMove(dt); return; }
    var d = game.dir();
    if (d.x || d.y) {
      p.autoPath = null; p.autoAct = null;
      p.lastDir = d.y ? (d.y < 0 ? "up" : "down") : (d.x < 0 ? "left" : "right");
      if (tryMove(p.lastDir)) p.holdT = 0; else p.holdT = 0.12;
      return;
    }
    var hd = heldDir();
    if (hd) {
      p.autoPath = null; p.autoAct = null;
      if (p.holdT <= 0) {
        if (tryMove(hd)) p.holdT = 0; else p.holdT = 0.12;
      }
      return;
    }
    if (p.autoPath) {
      if (game.pressed("start") || game.pressed("b") || game.pressed("a") || game.pressed("select") || game.pointer.pressed) {
        p.autoPath = null; p.autoAct = null;
      } else { autoWalk(dt); return; }
    }
    if (game.pressed("start") || game.pressed("b")) { openMenu(); return; }
    if (game.pressed("select")) { revealSecrets(); return; }
    if (game.pressed("a")) { actFacing(); return; }
    if (game.pointer.pressed) tapMap(game.pointer.x, game.pointer.y);
  },
  draw: drawPlay
});
function advanceMove(dt) {
  var m = p.moving;
  m.t += dt / 0.1;
  if (m.t >= 1) {
    p.px = m.tx * TS; p.py = m.ty * TS; p.dir = m.dir; p.moving = null;
    arrive();
  } else {
    p.px = LoGame.lerp(m.fx * TS, m.tx * TS, m.t);
    p.py = LoGame.lerp(m.fy * TS, m.ty * TS, m.t);
  }
}
function walkTo(nx, ny, dir) {
  var m = { fx: S.x, fy: S.y, tx: nx, ty: ny, dir: dir, t: 0 };
  S.x = nx; S.y = ny; p.moving = m;
  sfx("step");
}
function tryMove(dir) {
  var d = DIRS[dir]; p.dir = dir;
  var nx = S.x + d[0], ny = S.y + d[1];
  if (!R.inside(nx, ny)) return false;
  var ch = R.tile(S, nx, ny);
  if (ch === "%") {
    R.reveal(S, nx, ny); sfx("secret"); toast(t("折缝开了。", "The seam opens.")); saveAuto(); return false;
  }
  if (ch === "#") { sfx("bump"); return false; }
  if (ch === "m" || ch === "n") { sfx("bump"); toast(tileText(ch, nx, ny)); return false; }
  if (D.isMonster(ch) || ch === "z" || ch === "Z") { fightAt(nx, ny, ch); return false; }
  if (D.isDoor(ch)) {
    var r = R.openDoor(S, nx, ny);
    if (r.ok) { sfx("door"); toast(t("门开了。", "The door opens.")); saveAuto(); }
    else { sfx("denied"); toast(t("没有{key}。", "No {key}.").replace("{key}", tname(D.KEY_NAMES[r.key]))); }
    return false;
  }
  walkTo(nx, ny, dir);
  return true;
}
function arrive() {
  S.steps++;
  var ch = R.tile(S, S.x, S.y);
  if (ch === "~") {
    var lost = R.poison(S);
    sfx("hurt"); toast(t("毒页 -{n}", "Poison -{n}").replace("{n}", lost));
    return;
  }
  if (D.isItem(ch)) {
    var got = R.take(S, ch);
    if (got) {
      if (got.kind === "key") { sfx("key"); toast(tname(got.name) + " +1"); }
      else if (got.kind === "gold") { sfx("gold"); toast(tname(got.name) + " +" + got.amount); }
      else if (got.kind === "wick") { sfx("secret"); toast(t("灯芯 +1", "Wick +1") + "　" + S.wicks + "/3"); saveAuto(); }
      else if (got.kind === "hp") { sfx("potion"); toast(tname(got.name) + " +" + got.amount); }
      else if (got.kind === "bomb") { sfx("coin"); toast(t("炸弹 +1　菜单里使用", "Bomb +1　use it from the menu")); }
      else if (got.kind === "holy") { sfx("heal"); toast(t("圣水 +1　菜单里使用", "Holy water +1　use it from the menu")); }
      else { sfx("gem"); toast(tname(got.name) + " +" + got.amount); }
    }
    return;
  }
  if (ch === "f") {
    if (R.drink(S)) { sfx("heal"); toast(t("墨泉满上了。", "The spring fills you.")); saveAuto(); }
    else toast(t("这眼泉已经干了。", "This spring has run dry."));
    return;
  }
  if (ch === ">") { goFloor(1); return; }
  if (ch === "<") {
    if (S.floor === 1) { sfx("bump"); toast(t("塔门在身后合上了。", "The gate closed behind you.")); }
    else goFloor(-1);
    return;
  }
  if (ch === "L") { reachLamp(); return; }
}
async function goFloor(delta) {
  if (delta > 0 && S.floor >= 12) return;
  if (delta < 0 && S.floor <= 1) return;
  sfx("page"); busy = true;
  /* Cover the old page first, then change it. The outgoing scene must never be
     redrawn after S.floor has moved: it would show the next page's number, and
     the next page's untouched monsters, under the old floor's banner. */
  await game.fade("out", 0.16);
  var moved = delta > 0 ? R.nextFloor(S) : R.prevFloor(S);
  if (!moved) { await game.fade("in", 0.16); busy = false; return; }
  saveAuto();
  await game.go("play", null, { fade: false });
  busy = true;
  await game.fade("in", 0.16);
  busy = false;
}
async function fightAt(x, y, ch) {
  busy = true;
  var m = R.monsterFor(S, ch);
  if (m && !S.flags["seen:" + ch]) S.flags["seen:" + ch] = true;
  var res = await game.push("battle", { ch: ch, x: x, y: y });
  busy = false;
  syncHero();
  music(zoneMusic(S.floor));
  if (!res) return;
  if (res.won) {
    saveAuto();
    if (res.boss) toast(t("守页的怪倒下了。", "The page's keeper falls."));
    else toast(t("损耗 {n}　得 {g} 金", "Lost {n}　got {g}g").replace("{n}", res.loss).replace("{g}", res.gold));
  } else if (res.died) {
    toast(t("丢了 {n} 金，回到本页入口。", "Lost {n}g. Back at the page's entrance.").replace("{n}", res.lost));
  } else if (res.blocked) {
    toast(t("攻不破它的守。", "You cannot break its guard."));
  }
}
async function actFacing() {
  var f = facingTile(), ch = R.tile(S, f.x, f.y);
  if (ch === "m") { await openShop(); return; }
  if (ch === "n") { await talk(); return; }
  if (D.isMonster(ch) || ch === "z" || ch === "Z") { await fightAt(f.x, f.y, ch); return; }
  if (D.isDoor(ch)) {
    var r = R.openDoor(S, f.x, f.y);
    if (r.ok) { sfx("door"); toast(t("门开了。", "The door opens.")); saveAuto(); }
    else { sfx("denied"); toast(t("没有{key}。", "No {key}.").replace("{key}", tname(D.KEY_NAMES[r.key]))); }
    return;
  }
  if (ch === "%") { R.reveal(S, f.x, f.y); sfx("secret"); toast(t("折缝开了。", "The seam opens.")); saveAuto(); return; }
  if (ch === "L") { reachLamp(); return; }
  if (ch === "f") {
    if (R.drink(S)) { sfx("heal"); toast(t("墨泉满上了。", "The spring fills you.")); saveAuto(); }
    else toast(t("这眼泉已经干了。", "This spring has run dry."));
    return;
  }
  sfx("tap");
  var here = R.tile(S, S.x, S.y);
  if (here === "L") reachLamp();
  else toast(t("第 {n} 页　{name}", "Page {n}　{name}").replace("{n}", S.floor).replace("{name}", tname(D.FLOOR_NAMES[S.floor - 1])));
}
function revealSecrets() {
  /* no free map-wide reveal: feel the wall next to you, or bump into it */
  var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]], found = 0;
  for (var i = 0; i < dirs.length; i++) {
    var x = S.x + dirs[i][0], y = S.y + dirs[i][1];
    if (R.reveal(S, x, y)) found++;
  }
  if (found) { sfx("secret"); toast(t("身边的折缝开了。", "A seam opens beside you.")); saveAuto(); }
  else { sfx("bump"); toast(t("身边没有折缝。撞一撞可疑的墙。", "No seam here. Bump a suspicious wall.")); }
}
function reachLamp() {
  if (!S.flags["boss:12"]) { sfx("denied"); toast(t("蠹王还坐在灯座上。", "The King still sits on the lamp stand.")); return; }
  game.go("ending", null, { fade: true, to: game.INK });
}

/* ---------- touching the map ---------- */
function tapMap(px, py) {
  if (py < HUD) return;
  var cam = camera();
  var tx = Math.floor((px + cam.x) / TS), ty = Math.floor((py - HUD + cam.y) / TS);
  if (!R.inside(tx, ty)) return;
  if (tx === S.x && ty === S.y) { actFacing(); return; }
  if (Math.abs(tx - S.x) + Math.abs(ty - S.y) === 1) {
    actTile(tx, ty);
    return;
  }
  var path = findPath(tx, ty);
  if (!path) { sfx("bump"); return; }
  p.autoPath = path.path; p.autoAct = path.act; p.autoT = 0;
}
function actTile(x, y) {
  var ch = R.tile(S, x, y);
  if (ch === "m" || ch === "n" || D.isMonster(ch) || ch === "z" || ch === "Z" || D.isDoor(ch) || ch === "%" || ch === "L" || ch === "f") {
    var dx = x - S.x, dy = y - S.y;
    if (dx) p.dir = dx > 0 ? "right" : "left"; else if (dy) p.dir = dy > 0 ? "down" : "up";
    if (ch === "m") openShop();
    else if (ch === "n") talk();
    else if (D.isMonster(ch) || ch === "z" || ch === "Z") fightAt(x, y, ch);
    else if (D.isDoor(ch)) {
      var r = R.openDoor(S, x, y);
      if (r.ok) { sfx("door"); toast(t("门开了。", "The door opens.")); saveAuto(); }
      else { sfx("denied"); toast(t("没有{key}。", "No {key}.").replace("{key}", tname(D.KEY_NAMES[r.key]))); }
    } else if (ch === "%") { R.reveal(S, x, y); sfx("secret"); toast(t("折缝开了。", "The seam opens.")); saveAuto(); }
    else if (ch === "L") reachLamp();
    else if (ch === "f") walkTo(x, y, p.dir);
    return;
  }
  tryMove(x > S.x ? "right" : x < S.x ? "left" : y > S.y ? "down" : "up");
}
function autoWalk(dt) {
  p.autoT += dt;
  if (p.autoT < 0.095) return;
  p.autoT = 0;
  if (!p.autoPath.length) {
    var a = p.autoAct; p.autoPath = null; p.autoAct = null;
    if (a) actTile(a.x, a.y);
    return;
  }
  var n = p.autoPath[0];
  var ch = R.tile(S, n.x, n.y);
  if (D.isMonster(ch) || ch === "z" || ch === "Z" || D.isDoor(ch) || ch === "%" || ch === "m" || ch === "n") {
    p.autoPath = null; p.autoAct = null; actTile(n.x, n.y); return;
  }
  if (!R.walkable(S, n.x, n.y)) { p.autoPath = null; p.autoAct = null; return; }
  p.autoPath.shift();
  var dir = n.x > S.x ? "right" : n.x < S.x ? "left" : n.y > S.y ? "down" : "up";
  walkTo(n.x, n.y, dir);
}
function findPath(tx, ty) {
  var start = S.x + "," + S.y;
  var seen = {}; seen[start] = null;
  var q = [{ x: S.x, y: S.y }], found = null, i;
  var targets = [];
  if (R.walkable(S, tx, ty)) targets.push({ x: tx, y: ty, act: null });
  else {
    var nb = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (i = 0; i < nb.length; i++) targets.push({ x: tx + nb[i][0], y: ty + nb[i][1], act: { x: tx, y: ty } });
  }
  var goal = {};
  for (i = 0; i < targets.length; i++) if (R.inside(targets[i].x, targets[i].y) && R.walkable(S, targets[i].x, targets[i].y)) goal[targets[i].x + "," + targets[i].y] = targets[i];
  var passable = function (x, y) {
    if (!R.walkable(S, x, y)) return false;
    if (D.isStair(R.tile(S, x, y))) return goal[x + "," + y] != null;
    return true;
  };
  while (q.length) {
    var c = q.shift(), k = c.x + "," + c.y;
    if (goal[k]) { found = goal[k]; break; }
    var dd = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (i = 0; i < dd.length; i++) {
      var nx = c.x + dd[i][0], ny = c.y + dd[i][1], nk = nx + "," + ny;
      if (seen[nk] !== undefined || !passable(nx, ny)) continue;
      if (nx === tx && ny === ty) continue;
      seen[nk] = k; q.push({ x: nx, y: ny });
    }
  }
  if (!found) return null;
  var path = [], at = found.x + "," + found.y;
  while (at && at !== start) {
    var parts = at.split(",");
    path.unshift({ x: +parts[0], y: +parts[1] });
    at = seen[at];
  }
  return { path: path, act: found.act || null };
}

/* ---------- drawing the tower ---------- */
function drawSprite(g, s, x, y, k, opt) {
  k = k || 1;
  if (!s || !s.px) return;
  for (var j = 0; j < s.h; j++) for (var i = 0; i < s.w; i++) {
    var tone = s.px[j * s.w + i];
    if (tone === 255) continue;
    if (opt && opt.color != null) tone = opt.color;
    g.rect(x + i * k, y + j * k, k, k, tone);
  }
}
function drawPlay(g) {
  var cam = camera(), z = D.zoneOf(S.floor);
  g.clear(g.INK);
  g.origin(0, HUD); g.clip(0, 0, VIEW_W, VIEW_H);
  g.origin(-cam.x, HUD - cam.y);
  var x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS));
  var x1 = Math.min(10, Math.ceil((cam.x + VIEW_W) / TS)), y1 = Math.min(10, Math.ceil((cam.y + VIEW_H) / TS));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var ch = R.tile(S, x, y);
    g.sprite(A["floor" + z], x * TS, y * TS);
    if (ch === "#") g.sprite(A["wall" + z], x * TS, y * TS);
    else if (ch === "%") { g.sprite(A["wall" + z], x * TS, y * TS); drawCrack(g, x * TS, y * TS); }
    else drawThing(g, ch, x, y, z);
  }
  var bob = p.moving ? 0 : (Math.floor(game.time * 2.2) % 2);
  var art = p.dir === "up" ? (bob ? A.heroUp2 : A.heroUp) : p.dir === "down" ? (bob ? A.heroDown2 : A.heroDown) : (bob ? A.heroSide2 : A.heroSide);
  g.sprite(art, Math.round(p.px), Math.round(p.py), { flip: p.dir === "left" });
  g.origin(0, 0); g.clip();
  drawHUD(g);
  if (bannerT > 0 && toastT <= 0) drawBanner(g);
  if (toastT > 0 && toastMsg) drawToast(g);
  drawForecast(g);
}
function drawCrack(g, x, y) {
  g.line(x + 3, y + 5, x + 9, y + 9, 3);
  g.line(x + 9, y + 9, x + 7, y + 13, 0);
  g.pixel(x + 10, y + 10, 3);
}
function drawThing(g, ch, x, y, z) {
  var px = x * TS, py = y * TS, bob = Math.floor(game.time * 3 + x + y) % 2;
  if (ch === ".") return;
  if (ch === "~") { g.sprite(A.poison, px, py); return; }
  if (ch === ">") { g.sprite(A.up, px, py); return; }
  if (ch === "<") { g.sprite(A.down, px, py); return; }
  if (ch === "Y") { g.sprite(A.doorY, px, py); return; }
  if (ch === "B") { g.sprite(A.doorB, px, py); return; }
  if (ch === "R") { g.sprite(A.doorR, px, py); return; }
  if (ch === "m") { g.sprite(A.shop, px, py); return; }
  if (ch === "f") {
    g.sprite(A.fountain, px, py, S.flags["fountain:" + S.floor] ? { color: g.DARK } : null);
    return;
  }
  if (ch === "L") {
    g.sprite(S.flags["boss:12"] ? A.lampLit : A.lamp, px, py);
    if (S.flags["boss:12"] && Math.floor(game.time * 6) % 2 === 0) g.rect(px + 7, py + 4, 2, 2, 3);
    return;
  }
  if (ch === "n") {
    var npc = D.NPCS[S.floor];
    if (npc) g.sprite(A[npc.art], px, py);
    return;
  }
  if (D.isItem(ch)) {
    var it = D.itemAt(ch, z);
    if (ch === "y") g.sprite(A.keyY, px, py - bob);
    else if (ch === "b") g.sprite(A.keyB, px, py - bob);
    else if (ch === "r") g.sprite(A.keyR, px, py - bob);
    else if (it) g.sprite(A[it.art], px, py - bob);
    return;
  }
  if (D.isMonster(ch) || ch === "z" || ch === "Z") {
    var m = R.monsterFor(S, ch);
    if (!m) return;
    if (m.boss) g.dither(px - 1, py - 1, 18, 18, 2, 1);
    g.sprite(A[m.art], px, py - (m.boss ? 0 : bob));
    return;
  }
}
function short(n) { return n >= 100000 ? Math.floor(n / 1000) + "k" : String(n); }
function drawHUD(g) {
  g.window(0, 0, 160, HUD, { thin: true });
  g.sprite(A.heart, 4, 4);
  g.text(S.hp + "/" + S.hpMax, 14, 2);
  g.sprite(A.coinIcon, 106, 4);
  g.text(short(S.gold), 116, 2);
  g.sprite(A.keyIcon, 4, 17);
  g.text(S.keys.y + "/" + S.keys.b + "/" + S.keys.r, 14, 16);
  g.sprite(A.swordIcon, 70, 17);
  g.text(String(S.atk), 80, 16);
  g.sprite(A.shieldIcon, 111, 17);
  g.text(String(S.def), 121, 16);
}
function drawBanner(g) {
  g.window(10, 48, 140, 24, { thin: true });
  g.text(t("第 {n} 页　{name}", "Page {n}　{name}").replace("{n}", S.floor).replace("{name}", tname(banner)), 80, 53, { align: "center" });
}
function drawToast(g) {
  var lines = g.wrap(toastMsg, 142);
  var h = lines.length * 14 + 6;
  g.window(4, HUD + 4, 152, h, { thin: true });
  for (var i = 0; i < lines.length; i++) g.text(lines[i], 9, HUD + 7 + i * 14, { color: g.INK });
}
function drawForecast(g) {
  if (p.moving || toastT > 0) return;
  var f = facingTile(), ch = R.tile(S, f.x, f.y);
  if (!(D.isMonster(ch) || ch === "z" || ch === "Z")) return;
  var m = R.monsterFor(S, ch), fc = R.forecast(S, m);
  var tag = fc.ability ? tname(D.ABILITY_NAMES[fc.ability]) : "";
  var text = !fc.can ? t("攻不破", "No damage") : fc.win ? t("损耗 {n}", "Lose {n}").replace("{n}", fc.loss) : t("会倒下", "You would fall");
  if (tag) text += " " + tag;
  var w = 70;
  g.window(VIEW_W - w - 2, HUD + 4, w, 18, { thin: true });
  g.text(text, VIEW_W - w + 4, HUD + 7);
}

/* ---------- menus and overlays ---------- */
async function openMenu() {
  if (busy) return;
  busy = true;
  var items = [t("状态", "Status"), t("图鉴", "Bestiary"), t("地图", "Map")];
  var acts = ["status", "bestiary", "map"];
  if (S.items.bomb + S.items.holy > 0) { items.push(t("道具", "Items")); acts.push("items"); }
  items.push(t("存档", "Save")); acts.push("save");
  items.push(t("说明", "How to play")); acts.push("help");
  items.push(t("回标题", "Title")); acts.push("title");
  var i = await game.choose(items, { title: t("第 {n} 页　{name}", "Page {n}　{name}").replace("{n}", S.floor).replace("{name}", tname(D.FLOOR_NAMES[S.floor - 1])) });
  if (i < 0) { busy = false; return; }
  var act = acts[i];
  if (act === "status") await game.push(statusScene());
  else if (act === "bestiary") await game.push(bestiaryScene());
  else if (act === "map") await game.push(mapScene());
  else if (act === "items") await game.push(itemScene());
  else if (act === "save") { await game.push(slotsScene("save")); }
  else if (act === "help") await helpPages();
  else if (act === "title") {
    var c = await game.choose([t("存好并回去", "Save and go"), t("留在这里", "Stay")], { title: t("回标题？", "Back to the title?") });
    if (c === 0) { saveAuto(); busy = false; music("title"); game.go("title", null, { fade: true }); return; }
  }
  busy = false;
}
async function helpPages() {
  await game.say([
    t("你是阿折，纸塔里的送信人。塔顶的长明灯灭了，纸开始发软。", "You are A Zhe, a courier in the paper tower. The Everlamp is out, and the paper is going soft."),
    t("爬上十二页，把灯点回来。蠹王在灯座上。", "Climb twelve pages and light it again. The Bookworm King sits on the lamp stand."),
    t("方向键走。A 说话、开门、打怪。START 或 B 打开菜单。", "Arrows walk. A talks, opens and fights. START or B opens the menu."),
    t("SELECT 摸身边的折缝；也能直接撞可疑的墙。", "SELECT feels for a seam beside you; bumping a suspicious wall works too."),
    t("走进怪物会开战。左上角写着这一战会损耗多少。", "Walking into a monster starts a fight. The corner shows what it will cost."),
    t("守门的怪是排好的：墨滴、纸虫、有甲的钉书虫、先手的灰蛾……先看损耗，再决定打不打。", "The gatekeepers come in order: ink drops, paper mites, armored staples, first-striking moths... Read the cost before you swing."),
    t("有些小房间门口站着怪，里面是宝物。先看损耗，再决定进不进。", "Some small rooms keep a monster at the door and treasure inside. Read the cost before you enter."),
    t("菜单里的「道具」能用炸弹和圣水。炸弹对守页的怪无效。", "The Items entry spends bombs and holy water. Bombs do not work on keepers."),
    t("打不过就回商店。三间墨铺，越买越贵，货也有限。", "Stuck? Go back to a shop. Three shops, rising prices, limited stock."),
    t("败北不会结束游戏：塔把你折回本页入口，只收两成金币。", "Defeat is not the end: the tower folds you back to this page's entrance and takes a fifth of your gold."),
    t("三根灯芯在三、七、十一页的折缝里。带齐了，蠹王会弱一些。", "Three wicks wait in the seams of pages three, seven and eleven. With all three, the King is weaker.")
  ], { name: t("怎么玩", "How to play") });
}

function statusScene() {
  return {
    update: function () { if (game.pressed("a") || game.pressed("b") || game.pressed("start") || game.pointer.pressed) game.pop(); },
    draw: function (g) {
      g.clear(g.PAPER); g.window(6, 6, 148, 132);
      g.text(t("状 态　{name}", "STATUS　{name}").replace("{name}", tname(D.ZONES[D.zoneOf(S.floor)].name)), 80, 10, { align: "center" });
      var y = 26, lh = 14;
      g.text(t("页　第 {n} 页　{name}", "Page {n}　{name}").replace("{n}", S.floor).replace("{name}", tname(D.FLOOR_NAMES[S.floor - 1])), 12, y); y += lh;
      g.text(t("生命　{hp} / {max}", "HP　{hp} / {max}").replace("{hp}", S.hp).replace("{max}", S.hpMax), 12, y); y += lh;
      g.text(t("攻击　{a}　　守　{d}", "ATK　{a}　　DEF　{d}").replace("{a}", S.atk).replace("{d}", S.def), 12, y); y += lh;
      g.text(t("金币　{g}　　灯芯　{w}/3", "Gold　{g}　　Wicks　{w}/3").replace("{g}", S.gold).replace("{w}", S.wicks), 12, y); y += lh;
      g.text(t("黄 {y}　蓝 {b}　红 {r}", "Keys {y}/{b}/{r}").replace("{y}", S.keys.y).replace("{b}", S.keys.b).replace("{r}", S.keys.r), 12, y); y += lh;
      g.text(t("炸弹 {b}　圣水 {h}", "Bombs {b}　Holy {h}").replace("{b}", S.items.bomb).replace("{h}", S.items.holy), 12, y); y += lh;
      g.text(t("用时 {t}　倒下 {d}", "Time {t}　Falls {d}").replace("{t}", clock(S.time)).replace("{d}", S.deaths), 12, y);
      g.text(t("A / B 关", "A / B close"), 80, 124, { align: "center", color: g.DARK });
    }
  };
}

function itemScene() {
  var sel = 0, msg = null, msgT = 0;
  function list() {
    var out = [];
    if (S.items.bomb > 0) out.push({ id: "bomb", name: t("炸弹", "Bomb"), n: S.items.bomb, art: A.bomb });
    if (S.items.holy > 0) out.push({ id: "holy", name: t("圣水", "Holy water"), n: S.items.holy, art: A.holyWater });
    return out;
  }
  return {
    update: function (dt) {
      if (msgT > 0) msgT -= dt;
      var rows = list();
      if (!rows.length) { if (game.ok() || game.pressed("b") || game.pressed("start")) game.pop(); return; }
      sel = LoGame.clamp(sel, 0, rows.length - 1);
      var d = game.dir(0.25, 0.1);
      if (d.y) { sel = (sel + d.y + rows.length) % rows.length; sfx("move"); }
      if (game.pressed("b") || game.pressed("start")) { game.pop(); return; }
      var tapped = game.pointer.pressed;
      if (tapped) {
        var row = Math.floor((game.pointer.y - 30) / 22);
        if (row >= 0 && row < rows.length) sel = row;
      }
      if (game.pressed("a") || tapped) {
        if (rows[sel].id === "bomb") {
          var f = facingTile(), ch = R.tile(S, f.x, f.y), m = R.monsterFor(S, ch);
          if (!m) { sfx("denied"); msg = t("面前没有怪。", "No monster in front."); msgT = 1.4; }
          else if (m.boss) { sfx("denied"); msg = t("守页的怪不吃炸弹。", "The keeper ignores bombs."); msgT = 1.4; }
          else {
            var r = R.useBomb(S, ch, f.x, f.y);
            if (r.ok) { sfx("win"); saveAuto(); msg = t("炸掉了{n}。", "Bombed {n}.").replace("{n}", tname(r.monster.name)); msgT = 1.4; }
            else { sfx("denied"); msg = t("用不了。", "Cannot use it."); msgT = 1.2; }
          }
        } else {
          var h = R.useHoly(S);
          if (h.ok) { sfx("heal"); saveAuto(); msg = t("生命满了，折缝开了。", "HP full, seams open."); msgT = 1.4; }
          else { sfx("denied"); msg = t("用不了。", "Cannot use it."); msgT = 1.2; }
        }
      }
    },
    draw: function (g) {
      g.clear(g.PAPER); g.window(2, 2, 156, 140, { thin: true });
      g.text(t("道 具", "ITEMS"), 80, 5, { align: "center" });
      var rows = list();
      if (!rows.length) { g.text(t("用完了。", "All used."), 80, 64, { align: "center" }); return; }
      for (var i = 0; i < rows.length; i++) {
        var y = 30 + i * 22;
        if (i === sel) g.rect(5, y - 2, 150, 20, g.INK);
        var col = i === sel ? g.PAPER : g.INK;
        g.sprite(rows[i].art, 8, y - 1);
        g.text(rows[i].name, 28, y, { color: col });
        g.text("x" + rows[i].n, 150, y, { color: col, align: "right" });
      }
      g.text(msg || t("A 用　B 走", "A use　B leave"), 80, 124, { align: "center", color: g.DARK });
    }
  };
}

function bestiaryScene() {
  var sel = 0, top = 0, per = 6;
  var rows = [];
  var z = D.zoneOf(S.floor);
  Object.keys(D.MONSTERS).forEach(function (ch) {
    var m = D.monsterAt(ch, z);
    if (m && S.flags["seen:" + ch]) rows.push({ ch: ch, m: m });
  });
  if (D.BOSSES[S.floor] && S.flags["seen:" + (S.floor === 12 ? "Z" : "z")]) {
    rows.push({ ch: S.floor === 12 ? "Z" : "z", m: R.monsterFor(S, S.floor === 12 ? "Z" : "z") });
  }
  return {
    update: function () {
      var d = game.dir(0.3, 0.1);
      if (d.y) { sel = LoGame.clamp(sel + d.y, 0, rows.length - 1); sfx("move"); }
      if (sel < top) top = sel;
      if (sel >= top + per) top = sel - per + 1;
      if (game.pointer.pressed) {
        var row = Math.floor((game.pointer.y - 29) / 14);
        var at = top + row;
        if (row >= 0 && row < per && at >= 0 && at < rows.length) { sel = at; sfx("move"); return; }
        game.pop(); return;
      }
      if (game.pressed("a") || game.pressed("b") || game.pressed("start")) game.pop();
    },
    draw: function (g) {
      g.clear(g.PAPER); g.window(2, 2, 156, 140, { thin: true });
      g.text(t("图鉴　第 {n} 区", "BESTIARY　zone {n}").replace("{n}", z + 1), 80, 5, { align: "center" });
      g.text(t("名", "name"), 22, 18, { color: g.DARK });
      g.text(t("损耗", "cost"), 150, 18, { align: "right", color: g.DARK });
      if (!rows.length) {
        g.text(t("还没遇到怪物。", "No monster met yet."), 80, 66, { align: "center" });
        g.text(t("A / B 关", "A / B close"), 80, 130, { align: "center", color: g.DARK });
        return;
      }
      for (var i = top; i < Math.min(rows.length, top + per); i++) {
        var r = rows[i], y = 31 + (i - top) * 14;
        if (i === sel) g.rect(4, y - 2, 152, 14, g.INK);
        var col = i === sel ? g.PAPER : g.INK;
        g.sprite(A[r.m.art], 4, y - 2);
        g.text(tname(r.m.name), 22, y, { color: col });
        if (r.m.ability) g.text(tname(D.ABILITY_NAMES[r.m.ability]), 122, y, { color: i === sel ? g.PAPER : g.DARK, align: "right" });
        var f = R.forecast(S, r.m);
        g.text(!f.can ? t("-", "-") : String(f.loss), 150, y, { color: col, align: "right" });
      }
      var cur = rows[sel];
      if (cur) {
        var ff = R.forecast(S, cur.m);
        g.text(t("HP {h}　攻 {a}　守 {d}", "HP {h}　ATK {a}　DEF {d}").replace("{h}", cur.m.hp).replace("{a}", cur.m.atk).replace("{d}", cur.m.def), 80, 115, { align: "center", color: g.DARK });
        if (!ff.can) g.text(t("攻不破", "no damage"), 80, 127, { align: "center", color: g.INK });
        else g.text(t("损耗 {n}　{ab}", "costs {n}　{ab}").replace("{n}", ff.loss).replace("{ab}", cur.m.ability ? tname(D.ABILITY_NAMES[cur.m.ability]) : t("-", "-")), 80, 127, { align: "center", color: g.INK });
      }
    }
  };
}

function mapScene() {
  return {
    update: function () { if (game.pressed("a") || game.pressed("b") || game.pressed("start") || game.pointer.pressed) game.pop(); },
    draw: function (g) {
      g.clear(g.PAPER); g.window(2, 2, 156, 140, { thin: true });
      g.text(t("第 {n} 页　{name}", "Page {n}　{name}").replace("{n}", S.floor).replace("{name}", tname(D.FLOOR_NAMES[S.floor - 1])), 80, 3, { align: "center" });
      g.text(t("折缝 {s}　灯芯 {w}/3", "seams {s}　wicks {w}/3").replace("{s}", R.secrets(S).length).replace("{w}", S.wicks), 80, 16, { align: "center", color: g.DARK });
      var ox = 25, oy = 30, k = 10;
      for (var y = 0; y < 11; y++) for (var x = 0; x < 11; x++) {
        var ch = R.tile(S, x, y), px = ox + x * k, py = oy + y * k;
        g.rect(px, py, k, k, g.PAPER);
        if (ch === "#") g.rect(px, py, k, k, g.INK);
        else if (ch === "%") { g.rect(px, py, k, k, g.DARK); g.line(px + 2, py + 3, px + 7, py + 7, g.PAPER); }
        else if (ch === "Y" || ch === "B" || ch === "R") g.rect(px + 1, py + 1, k - 2, k - 2, ch === "Y" ? g.MID : g.DARK);
        else if (D.isMonster(ch) || ch === "z" || ch === "Z") g.rect(px + 2, py + 2, k - 4, k - 4, g.INK);
        else if (ch === "m") g.rect(px + 2, py + 2, k - 4, k - 4, g.DARK);
        else if (ch === "n") g.rect(px + 3, py + 3, k - 6, k - 6, g.DARK);
        else if (ch === "f") { g.rect(px + 3, py + 3, 4, 4, g.MID); }
        else if (ch === ">" || ch === "<") g.rect(px + 2, py + 4, k - 4, 2, g.INK);
        else if (D.isItem(ch)) g.rect(px + 4, py + 4, 2, 2, g.INK);
        else if (ch === "L") { g.rect(px + 4, py + 3, 2, 4, g.INK); g.rect(px + 2, py + 2, 6, 2, g.MID); }
      }
      g.rect(ox + S.x * k + 2, oy + S.y * k + 2, 6, 6, g.INK);
      g.rect(ox + S.x * k + 3, oy + S.y * k + 3, 4, 4, g.PAPER);
    }
  };
}

function shopScene() {
  var sh = D.SHOPS[S.floor], sel = 0, msg = null, msgT = 0;
  function label(it) {
    if (it.id === "atk") return t("攻 +{n}", "ATK +{n}").replace("{n}", it.amount);
    if (it.id === "def") return t("守 +{n}", "DEF +{n}").replace("{n}", it.amount);
    if (it.id === "hp") return t("生命 +{n}", "HP +{n}").replace("{n}", it.amount);
    return tname(D.KEY_NAMES[it.id]);
  }
  return {
    update: function (dt) {
      if (msgT > 0) msgT -= dt;
      var d = game.dir(0.25, 0.1);
      if (d.y) { sel = (sel + d.y + sh.stock.length) % sh.stock.length; sfx("move"); }
      if (game.pressed("b") || game.pressed("start")) { game.pop(); return; }
      var tapped = game.pointer.pressed;
      if (tapped) {
        var row = Math.floor((game.pointer.y - 30) / 16);
        if (row < 0 || row >= sh.stock.length) { game.pop(); return; }
        sel = row;
      }
      if (game.pressed("a") || tapped) {
        var r = R.buy(S, sel);
        if (r.ok) { sfx("buy"); saveAuto(); msg = t("买下了。", "Bought."); msgT = 1.2; }
        else if (r.reason === "gold") { sfx("denied"); msg = t("钱不够。", "Not enough gold."); msgT = 1.2; }
        else if (r.reason === "sold") { sfx("denied"); msg = t("卖完了。", "Sold out."); msgT = 1.2; }
      }
    },
    draw: function (g) {
      g.clear(g.PAPER); g.window(2, 2, 156, 140, { thin: true });
      g.text(tname(sh.name), 80, 4, { align: "center" });
      g.text(t("金 {g}", "Gold {g}").replace("{g}", S.gold), 152, 16, { align: "right", color: g.DARK });
      for (var i = 0; i < sh.stock.length; i++) {
        var it = sh.stock[i], left = R.stockLeft(S, i), y = 30 + i * 16;
        if (i === sel) g.rect(5, y - 1, 150, 15, g.INK);
        var col = i === sel ? g.PAPER : g.INK;
        g.text(label(it), 10, y, { color: col });
        g.text(left ? R.price(S, i) + "g" : t("售罄", "sold"), 110, y, { color: col });
        g.text("x" + left, 150, y, { color: col, align: "right" });
      }
      g.text(msg || t("A 买　B 走", "A buy　B leave"), 80, 126, { align: "center", color: g.DARK });
    }
  };
}
async function openShop() {
  if (busy) return;
  busy = true; sfx("tap");
  await game.push(shopScene());
  busy = false;
}

function slotsScene(mode) {
  var ready = false, infos = [], sel = 0, msg = null, msgT = 0;
  Promise.all(SLOT_KEYS.map(function (k) { return game.load(k); })).then(function (vals) {
    infos = vals.map(function (v, i) { return { key: SLOT_KEYS[i], v: v ? R.hydrate(v) : null, raw: v }; });
    ready = true;
  });
  function label(i) { return i === 0 ? t("自动", "Auto") : t("存档 {n}", "Slot {n}").replace("{n}", i); }
  return {
    update: function (dt) {
      if (msgT > 0) msgT -= dt;
      if (!ready) return;
      var d = game.dir(0.25, 0.1);
      if (d.y) { sel = (sel + d.y + 4) % 4; sfx("move"); }
      if (game.pressed("b") || game.pressed("start")) { game.pop(); return; }
      var tapped = game.pointer.pressed;
      if (tapped) {
        var row = Math.floor((game.pointer.y - 22) / 25);
        if (row < 0 || row > 3) { game.pop(); return; }
        sel = row;
      }
      if (game.pressed("a") || tapped) {
        var it = infos[sel];
        if (mode === "save") {
          game.save(it.key, pack()); infos[sel] = { key: it.key, v: S, raw: pack() }; sfx("save"); msg = t("存好了。", "Saved."); msgT = 1.2;
        } else {
          if (!it.v) { sfx("denied"); msg = t("空的。", "Empty."); msgT = 1.2; return; }
          sfx("save"); game.pop(it.v); return;
        }
      }
    },
    draw: function (g) {
      g.clear(g.PAPER); g.window(2, 2, 156, 140, { thin: true });
      g.text(mode === "save" ? t("存 档", "SAVE") : t("读 档", "LOAD"), 80, 5, { align: "center" });
      if (!ready) { g.text(t("读取中...", "Reading..."), 80, 60, { align: "center" }); return; }
      for (var i = 0; i < 4; i++) {
        var y = 22 + i * 25, it = infos[i], v = it && it.v;
        if (i === sel) g.rect(4, y - 2, 152, 24, g.INK);
        var col = i === sel ? g.PAPER : g.INK;
        g.text(label(i), 9, y, { color: col });
        if (v) {
          g.text(t("第{n}页", "p{n}").replace("{n}", v.floor), 48, y, { color: col });
          g.text(v.hp + "/" + v.hpMax, 9, y + 11, { color: col });
          g.text(when(it.raw && it.raw.savedAt), 150, y + 12, { color: i === sel ? g.PAPER : g.DARK, align: "right" });
        } else g.text(t("空", "empty"), 48, y, { color: col });
      }
      g.text(msg || (mode === "save" ? t("A 存　B 走", "A save　B leave") : t("A 读　B 走", "A load　B leave")), 80, 127, { align: "center", color: g.DARK });
    }
  };
}
async function talk() {
  var npc = D.NPCS[S.floor];
  if (!npc) return;
  busy = true;
  await game.say(npc.lines.map(function (l) { return tname(l); }), { name: tname(npc.name) });
  if (npc.choice && !S.flags["gift:" + S.floor]) {
    var i = await game.choose(npc.choice.map(function (c) { return tname(c); }), { title: tname(npc.name) });
    if (i === 0) { S.atk += npc.gift; sfx("gem"); toast(t("攻 +{n}", "ATK +{n}").replace("{n}", npc.gift)); }
    else if (i === 1) { S.def += npc.gift; sfx("gem"); toast(t("守 +{n}", "DEF +{n}").replace("{n}", npc.gift)); }
    if (i >= 0) { S.flags["gift:" + S.floor] = true; saveAuto(); }
  }
  busy = false;
}

/* ---------- battle ---------- */
var B = null;
game.scene("battle", {
  enter: async function (args) {
    var m = R.monsterFor(S, args.ch), f = R.forecast(S, m);
    B = { m: m, f: f, args: args, phase: "intro", hero0: S.hp, hero1: S.hp, foe0: m.hp, foe1: m.hp, heroShown: S.hp, foeShown: m.hp,
      result: null, loss: 0, gold: 0, float: null, floatT: 0, floatX: 80, floatY: 70, t: 0 };
    music(m.boss ? "boss" : "battle"); sfx("page");
    if (m.boss) await game.say(m.say.map(function (l) { return tname(l); }), { name: tname(m.name) });
    if (!f.can) {
      B.phase = "result"; B.result = "blocked"; await game.wait(0.45);
      return;
    }
    if (!f.win) {
      B.result = "die"; B.hero1 = 0; B.loss = f.loss;
    } else {
      var res = R.fight(S, args.ch, args.x, args.y);
      B.result = "win"; B.hero1 = S.hp; B.loss = res.loss; B.gold = res.gold; B.foe1 = 0;
    }
    B.phase = "fight";
    var rounds = m.boss ? 4 : 3;
    for (var r = 0; r < rounds; r++) {
      B.float = String(Math.max(1, Math.round(m.hp / rounds)));
      B.floatT = 0.35; B.floatX = 112; B.floatY = 46;
      sfx("hit"); game.flash(0.04);
      await game.wait(0.22);
      var remain = B.result === "die" ? 0.4 : 0;
      B.foeShown = Math.round(m.hp * (1 - (1 - remain) * ((r + 1) / rounds)));
      B.float = String(Math.max(0, Math.round((B.hero0 - B.hero1) / rounds)));
      B.floatT = 0.35; B.floatX = 40; B.floatY = 74;
      sfx(r === rounds - 1 && B.result === "die" ? "lose" : "hurt");
      if (m.boss) game.shake(3, 0.22); else game.shake(1, 0.12);
      B.heroShown = Math.round(B.hero0 + (B.hero1 - B.hero0) * ((r + 1) / rounds));
      await game.wait(0.24);
    }
    B.foeShown = B.foe1; B.heroShown = B.hero1;
    B.floatT = 0; B.phase = "result";
    if (B.result === "win") sfx("win");
  },
  update: function (dt) {
    if (!B) return;
    if (B.floatT > 0) B.floatT -= dt;
    if (B.phase === "result" && game.ok()) finishBattle();
  },
  draw: function (g) {
    if (!B) { g.clear(g.INK); return; }
    g.clear(g.DARK);
    g.dither(0, 0, 160, 144, 1, 2);
    g.dither(0, 38, 160, 106, 0, 1);
    var m = B.m;
    g.text(tname(m.name), 80, 4, { align: "center", color: g.PAPER });
    bar(g, 20, 17, 120, 6, pct(B.foeShown, B.foe0), g.PAPER);
    var hs = m.boss ? 4 : 3, ms = m.boss ? 4 : 3;
    drawSprite(g, A.heroDown, 8, 62 - 8 * (hs - 2), 2, null);
    drawSprite(g, A[m.art], m.boss ? 86 : 96, 44, ms, null);
    g.text(t("生命", "HP"), 8, 112, { color: g.PAPER });
    bar(g, 32, 112, 120, 8, pct(B.heroShown, B.hero0), g.PAPER);
    g.text(B.heroShown + "/" + B.hero0, 80, 121, { align: "center", color: g.MID });
    if (B.floatT > 0 && B.float) g.text(B.float, B.floatX, B.floatY, { align: "center", color: g.PAPER });
    if (B.phase === "result") drawBattleResult(g);
  }
});
function bar(g, x, y, w, h, v, tone) {
  g.frame(x, y, w, h, g.PAPER);
  g.rect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * v)), h - 2, tone);
}
function drawBattleResult(g) {
  g.window(24, 50, 112, 58);
  var y = 57;
  if (B.result === "blocked") {
    g.text(t("攻不破。", "No damage."), 80, y, { align: "center" }); y += 16;
    g.text(t("回去加攻。", "Raise your ATK."), 80, y, { align: "center", color: g.DARK });
  } else if (B.result === "die") {
    g.text(t("你倒下了。", "You fall."), 80, y, { align: "center" }); y += 16;
    g.text(t("损耗 {n}", "Loss {n}").replace("{n}", B.loss), 80, y, { align: "center" });
  } else {
    g.text(t("胜　损耗 {n}", "Win　lost {n}").replace("{n}", B.loss), 80, y, { align: "center" }); y += 16;
    g.text(B.m.boss ? t("金 +{g}　路开", "Gold +{g}　up").replace("{g}", B.gold) : t("金 +{g}", "Gold +{g}").replace("{g}", B.gold), 80, y, { align: "center" });
  }
  if (Math.floor(game.time * 2) % 2 === 0) g.text(t("A 继续", "A continue"), 80, 96, { align: "center", color: g.DARK });
}
function finishBattle() {
  var result = B.result, loss = B.loss;
  if (result === "die") {
    var rv = R.revive(S);
    game.pop({ won: false, died: true, lost: rv.lost });
    return;
  }
  game.pop({ won: result === "win", blocked: result === "blocked", loss: loss, gold: B.gold, boss: !!B.m.boss });
}

function rankOf(S) {
  var score = (S.flags["boss:12"] ? 2000 : 0) + S.wicks * 1000 + Math.floor(S.hp / 50) + S.gold * 2 - S.steps * 5 - S.deaths * 300;
  return { score: score, rank: score >= 8000 ? "S" : score >= 7000 ? "A" : score >= 6000 ? "B" : "C" };
}

/* ---------- the lamp ---------- */
game.scene("ending", {
  enter: async function () {
    endingPhase = "intro";
    music("ending"); game.ambience("fire", 0.3);
    var many = S.wicks >= D.WICKS;
    endingRank = rankOf(S);
    await game.say([
      t("你踩上灯座。蠹王化成一小撮墨灰，落在纸上。", "You step onto the lamp stand. The King crumbles into a pinch of ink ash."),
      t("三根灯芯一起点着了。纸塔轻轻响了一声，像合上一本书。", "Three wicks catch together. The tower makes one soft sound, like a book closing."),
      t("守灯人从灯影里走出来。她说，塔不必再折了。", "The lamp keeper steps out of the shadow. She says the tower need not fold again."),
      t("你把最后一封信放在灯下。收信人写着：下一个爬上来的人。", "You leave the last letter under the lamp. It is addressed to whoever climbs next.")
    ], { name: t("长明灯", "The Everlamp") });
    if (S.wicks === 0) {
      await game.say(t("你只带了那根火柴。火苗很小，但够亮。", "You had only the match. The flame is small, but it is enough."), { name: t("守灯人", "Lamp Keeper") });
    } else if (!many) {
      await game.say(t("灯芯不够三根。火苗矮一点，像在打盹。", "Fewer than three wicks. The flame is shorter, as if dozing."), { name: t("守灯人", "Lamp Keeper") });
    }
    S.flags.cleared = true; S.flags["boss:12"] = true;
    saveAuto();
    var old = await game.load("meta");
    var best = Math.max((old && old.best) || 0, R.score(S));
    game.save("meta", { cleared: true, best: best, wicks: S.wicks, at: Date.now() });
    endingPhase = "done";
  },
  update: function () {
    if (endingPhase === "done" && (game.pressed("a") || game.pressed("start") || game.pointer.pressed)) {
      music("title"); game.ambience(null);
      game.go("title", null, { fade: true });
    }
  },
  draw: function (g) {
    g.clear(g.INK);
    /* the lamp on its stand, a halo of paper light, the courier and the keeper below */
    for (var i = 0; i < 26; i++) {
      var sx = (i * 43 + 17) % 150 + 5, sy = (i * 31 + Math.floor(game.time * 4)) % 88;
      g.pixel(sx, sy, i % 4 ? 2 : 3);
    }
    g.circle(80, 44, 34, 2, false);
    g.circle(80, 44, 28, 3, false);
    g.circle(80, 44, 22, 2, false);
    drawSprite(g, A.lampLit, 64, 20, 2, null);
    g.rect(62, 52, 36, 3, 3);
    g.rect(68, 55, 24, 3, 2);
    g.rect(72, 58, 16, 2, 1);
    drawSprite(g, A.heroDown, 34, 62, 2, null);
    drawSprite(g, A.keeper, 94, 62, 2, null);
    for (i = 0; i < 7; i++) {
      var fx = 66 + (i * 5), fy = 12 + Math.floor(game.time * 5 + i * 3) % 8;
      g.pixel(fx, fy, i % 2 ? 3 : 2);
    }
    if (endingPhase === "done") {
      g.text(t("长 明 灯　{rank}", "THE EVERLAMP　{rank}").replace("{rank}", endingRank.rank), 80, 98, { align: "center", color: g.PAPER });
      g.text(t("第{n}页　胜{k}　灯芯{w}/3", "p{n}　wins {k}　wicks {w}/3").replace("{n}", S.floor).replace("{k}", S.kills).replace("{w}", S.wicks), 80, 114, { align: "center", color: g.MID });
      if (Math.floor(game.time * 2) % 2 === 0) g.text(t("A 回到封面", "A to the cover"), 80, 130, { align: "center", color: g.PAPER });
    }
  }
});
var endingPhase = "intro", endingRank = { score: 0, rank: "C" };

game.start("title");
