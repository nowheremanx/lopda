/* Scenes: the title (camera circling the tower) and the map, where the hero walks tile by tile through the town
   and the maps of src/story.js. SELECT shows how long the last frame took to draw, in every scene, for checking
   speed on a phone. Progress is saved at the save stones; what the player has already seen is saved with it.
   The cutscenes (the boss's entrance, the pendant, the ending) and the credits are at the end of the map scene.
   Sound (src/sound.js): each scene says which song and ambience it wants; the wrapper below sends them once a frame. */
var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
Snd.attach(game);
var R = Lo3D.create({ width: 160, height: 144 });
var town = World.build(TOWN);
var CAM = { pitch: -0.62, dist: 8.5 };
var perf = { show: false, ms: 0 };
var where = "title";

function frame(g, view, actors) { g.sprite(World.render(R, town, view, actors), 0, 0); }
/* every scene goes through this: SELECT toggles the frame time, which is drawn after the scene and its HUD.
   Only the overlays lo-game draws itself (dialogue, menus) come later; they sit at the bottom or the middle */
function scene(name, def) {
  var update = def.update, draw = def.draw;
  return game.scene(name, Object.assign({}, def, {
    update: function (dt) { where = name; if (game.pressed("select")) perf.show = !perf.show; if (update) update(dt); },
    draw: function (g) {
      var t0 = performance.now();
      draw(g);
      perf.ms = perf.ms * 0.9 + (performance.now() - t0) * 0.1;
      if (perf.show) { g.origin(0, 0); g.clip(); g.rect(0, 0, 50, 14, g.INK); g.text(perf.ms.toFixed(1) + " ms", 2, 1, { color: g.PAPER }); }
      Snd.flush();
    }
  }));
}

/* ---------- the game's state, and what is saved ----------
   me: the hero as the rules know him (levels, hp, mp, items); battles change it in place.
   flags: what has happened. master: the first talk is done (the road is open); entered, opened, beat: by map,
   by "map:chest index", by "map:enemy digit". lastSave is a copy of the last "progress" written. */
var me = null, flags = null, lastSave = null;
/* savesReady: both documents ("seen" and "progress") have been read or have failed. The title's menu waits for it,
   so it never opens on half a save (the item list and the floor come from them). */
var savesReady = false, saveLoads = 0;
function saveLoaded() { if (++saveLoads >= 2) savesReady = true; }
function saveFailed(e) { lockSaves(e); saveLoaded(); }
/* runSave: the last stone of THIS run (null in a new game until the first one), the only place a loss goes back to.
   lastSave is the one on disk, which 继续 on the title loads; an older run's save must not catch a new game's loss */
var runSave = null;
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function freshFlags() { return { master: 0, entered: {}, opened: {}, beat: {} }; }
/* the animations and cutscenes seen survive a new game, so they can be skipped from the second time on */
/* saveLocked: the saves on disk cannot be read ("corrupt") or come from a newer version ("newer"). They are kept as
   they are: nothing is written, and the title offers no new game over them (SPEC.md section 8). The runtime itself
   refuses this app's writes until the player clears a damaged save in Settings */
var saveLocked = null;
function lockSaves(e) { if (!saveLocked) saveLocked = e && e.code === "newer" ? "newer" : "corrupt"; }
function writeSeen() { if (saveLocked) return; game.save("seen", Object.assign({}, Cut.seen, Battle.seen())); }
Cut.onDone = writeSeen;
game.load("seen").then(function (s) {
  if (s && typeof s === "object") { Object.assign(Battle.seen(), s); Object.assign(Cut.seen, s); }
  saveLoaded();
}, saveFailed);
game.load("progress").then(function (p) {
  if (p && p.v === 1 && p.map && p.hero && p.flags) lastSave = p;
  else if (p && typeof p.v === "number" && p.v > 1) saveLocked = "newer";
  saveLoaded();
}, saveFailed);

/* ---------- title ----------
   The 3D tower is the cover; the menu is drawn on this page, in a window under it, not as a lo-game overlay. A or
   START opens it, Up/Down moves (wrapping, like the field menu), A/START picks, B closes it, a tap picks a row.
   The rows carry their own state: 继续 the saved floor, 听曲 its lock until the game is cleared. The list is only
   built once both save documents are in (savesReady), so it can never show half a save. */
var titleMenu = false, titleSel = 0;
/* every title string, in both languages: the app is Chinese, but PAD.lang is honoured here as elsewhere */
function titleText(zh, en, vars) { return game.t({ zh: zh, en: en }, vars); }
function titleLockedText() {
  return saveLocked === "newer" ? titleText("存档较新，请更新", "Save is newer")
    : saveLocked ? titleText("存档读不出来", "Save unreadable") : "";
}
function titleFloor(id) {
  var n = { floor1: 1, floor2: 2, top: 3 }[id];
  if (n) return titleText("第 {n} 层", "Floor {n}", { n: n });
  if (id === "town") return titleText("小镇", "Town");
  if (id === "road") return titleText("山道", "Mountain road");
  return titleText("存档", "Save");
}
/* 2 to 4 rows, read every frame so a save that arrives late (or is cleared) shows at once.
   Over a save that cannot be read there is no new game, as before: 演武 is the safe thing to play. */
function titleItems() {
  var items = [], locked = !Cut.seen.cleared;
  var gallery = { id: "gallery", label: { zh: "演武", en: "Practice" }, status: { zh: "木人", en: "Dummies" } };
  /* over an unreadable save 演武 is the only way to play, so it is the whole list */
  if (saveLocked) items.push(gallery);
  else {
    if (lastSave) items.push({ id: "continue", label: { zh: "继续", en: "Continue" }, status: titleFloor(lastSave.map) });
    items.push({ id: "new", label: { zh: "新游戏", en: "New game" },
      status: lastSave ? { zh: "从头开始", en: "Start over" } : null });
    items.push(gallery);
  }
  items.push({ id: "music", label: { zh: "听曲", en: "Music" }, locked: locked,
    status: locked ? { zh: "通关后", en: "Clear first" } : null });
  return items;
}
/* the menu's window and rows: bottom-anchored above the hint bar; fewer rows get taller targets.
   An unreadable save adds one line at the top of the window (the reason there is no 新游戏). */
var TITLE_ROW_BOTTOM = 124;
function titleLayout(n) {
  var rowH = n <= 2 ? 22 : n === 3 ? 18 : 16;
  var note = saveLocked ? 18 : 0;
  var h = n * rowH + 8 + note, y = TITLE_ROW_BOTTOM - h;
  return { x: 8, y: y, w: 144, h: h, rowH: rowH, note: note,
    ty: function (i) { return y + 4 + note + i * rowH + Math.floor((rowH - 14) / 2); } };
}
/* a tap on a row (the row's whole strip, so a finger does not have to hit the letters) or -1 elsewhere */
function titleTap(n) {
  var L = titleLayout(n), p = game.pointer;
  if (p.x < L.x || p.x >= L.x + L.w || p.y < L.y || p.y >= L.y + L.h) return -1;
  var i = Math.floor((p.y - (L.y + 4 + L.note)) / L.rowH);
  return i >= 0 && i < n ? i : -1;
}
/* a locked label: dark text with the app's dotted strike (the field menu's offText, in the menu's colours) */
function titleStruck(g, text, x, y, color) {
  g.text(text, x, y, { color: color });
  var w = g.measure(text);
  for (var k = 0; k < w; k += 2) g.rect(x + k, y + 6, 1, 1, color);
}
function titleOpen(it) {
  busy = true;
  if (it.id === "continue") game.go("map", { id: lastSave.map, resume: clone(lastSave) }, { to: LoGame.INK });
  else if (it.id === "new") game.go("map", { id: "town", intro: true, fresh: true }, { to: LoGame.INK });
  else if (it.id === "gallery") game.go("battle", { ids: ["golem", "wraith", "bronze"], area: "top", hero: galleryHero(), demo: true, back: "title", from: new Uint8Array(R.image.px) }, { fade: false });
  else if (it.id === "music") game.push(musicRoom()).then(function () { busy = false; Snd.music("title"); });
  else busy = false;
}
function titleDrawPlaque(g) {
  var title = titleText("镇妖塔·序章", "Pagoda: Prologue"), tw = g.measure(title) + 16;
  g.window(Math.round(80 - tw / 2), 3, tw, 18);
  g.text(title, 80, 5, { align: "center" });
}
function titleDrawPrompt(g) {
  var err = titleLockedText();
  var sub = err || titleText("内置 LX-3D 协处理器", "Built-in LX-3D chip");
  var prompt = !savesReady ? titleText("读取存档…", "Loading save…") : titleText("按 A 开始", "Press A");
  var w = Math.max(g.measure(sub), g.measure(prompt)) + 18;
  g.window(Math.round(80 - w / 2), 88, w, 44);
  g.text(sub, 80, 94, { align: "center", color: err ? g.INK : g.DARK });
  g.text(prompt, 80, 112, { align: "center" });
}
function titleDrawMenu(g) {
  var items = titleItems(), L = titleLayout(items.length);
  g.window(L.x, L.y, L.w, L.h);
  if (saveLocked) g.text(titleLockedText(), 80, L.y + 5, { align: "center", color: g.DARK });
  for (var i = 0; i < items.length; i++) {
    var it = items[i], ty = L.ty(i), on = i === titleSel, locked = !!it.locked;
    var color = on ? g.PAPER : g.INK;
    if (on) {
      var bh = Math.min(L.rowH, 16), by = ty - Math.floor((bh - 13) / 2);
      g.rect(L.x + 2, by, L.w - 4, bh, g.INK);
      g.arrow(L.x + 5, ty + 3, "right", g.PAPER);
    }
    if (locked) titleStruck(g, game.t(it.label), L.x + 16, ty, on ? g.MID : g.DARK);
    else g.text(game.t(it.label), L.x + 16, ty, { color: color });
    if (it.status) g.text(game.t(it.status), L.x + L.w - 8, ty, { align: "right", color: on ? g.MID : g.DARK });
  }
  var hint = titleText("↑↓ 选 · A 确定", "↑↓ select · A ok"), hw = g.measure(hint) + 14;
  g.window(Math.round(80 - hw / 2), 126, hw, 18);
  g.text(hint, 80, 130, { align: "center" });
}
var TITLE = scene("title", {
  enter: function () { busy = false; titleMenu = false; titleSel = 0; Snd.music("title"); Snd.amb(null); },
  draw: function (g) {
    var a = game.time * 0.12, T = town.def.tower;
    frame(g, { x: T.x, y: 4, z: -T.y, yaw: a, pitch: -0.22, dist: 17, time: game.time, fogCull: true }, []);
    titleDrawPlaque(g);
    /* the menu and the prompt belong to this page: while an overlay (the music room) is on top, neither is drawn */
    if (game.top() === TITLE) {
      if (titleMenu) titleDrawMenu(g);
      else titleDrawPrompt(g);
    }
  },
  update: function () {
    if (busy || !savesReady || game.top() !== TITLE) return;
    var items = titleItems();
    if (titleSel >= items.length) titleSel = items.length - 1;
    if (!titleMenu) {
      if (game.pressed("a") || game.pressed("start") || game.pointer.pressed) { game.sfx("tap"); titleMenu = true; titleSel = 0; }
      return;
    }
    var d = game.dir(), pick = -1;
    if (d.y) { titleSel = (titleSel + d.y + items.length) % items.length; game.sfx("move"); }
    if (game.pressed("a") || game.pressed("start")) pick = titleSel;
    else if (game.pressed("b")) { titleMenu = false; game.sfx("miss"); return; }
    else if (game.pointer.pressed) {
      var tap = titleTap(items.length);
      if (tap < 0) { titleMenu = false; game.sfx("miss"); return; }
      titleSel = tap; pick = tap;
    }
    if (pick < 0) return;
    var it = items[pick];
    if (it.locked) { game.sfx("err"); return; }
    game.sfx("ok");
    titleOpen(it);
  }
});

/* ---------- 听曲: the music room ----------
   Every piece in the game, in the order they come. Drawn like lo-game's own menu (a window, the arrow, the title in
   dark), six rows at a time with the battle list's scroll marks. A or START plays the piece from its start and the list
   stays open; B goes back to the title and its music. */
var TRACKS = ["title", "town", "road", "tower", "towerUp", "battle", "victory", "boss", "dawn", "coda"];
function musicRoom() {
  var gg = game.g, sel = 0, top = 0, ROWS = 6, pad = 6, rowH = gg.lineHeight + 2;
  var names = TRACKS.map(function (id) { return MUSIC[id].name; });
  var w = Math.max.apply(null, names.concat(["听曲"]).map(gg.measure)) + pad * 2 + 18;
  var h = (ROWS + 1) * rowH + pad * 2 - 2, x = Math.round((160 - w) / 2), y = Math.round((144 - h) / 2);
  return {
    update: function () {
      var d = game.dir(), pick = -1;
      if (d.y) { sel = (sel + d.y + TRACKS.length) % TRACKS.length; game.sfx("move"); }
      if (game.pressed("a") || game.pressed("start")) pick = sel;
      else if (game.pressed("b")) { game.sfx("miss"); game.pop(); return; }
      else if (game.pointer.pressed) {
        var r = Math.floor((game.pointer.y - y - pad - rowH) / rowH);
        if (game.pointer.x >= x && game.pointer.x < x + w && r >= 0 && r < ROWS && top + r < TRACKS.length) pick = sel = top + r;
        else { game.sfx("miss"); game.pop(); return; }
      }
      if (sel < top) top = sel;
      if (sel >= top + ROWS) top = sel - ROWS + 1;
      if (pick >= 0) Snd.replay(TRACKS[pick]);
    },
    draw: function (g) {
      g.origin(0, 0); g.clip();
      g.window(x, y, w, h);
      var ty = y + pad;
      g.text("听曲", x + pad, ty, { color: g.DARK });
      if (top > 0) for (var u = 0; u < 4; u++) g.rect(x + w - 7 - u, ty + 3 + u, 1 + 2 * u, 1, g.INK);
      ty += rowH;
      for (var k = top; k < top + ROWS && k < TRACKS.length; k++) {
        if (k === sel) g.arrow(x + pad - 1, ty + 3, "right");
        g.text(names[k], x + pad + 8, ty);
        ty += rowH;
      }
      if (top + ROWS < TRACKS.length && Math.floor(game.time * 3) % 2) g.arrow(x + w - 10, y + h - 7, "down");
    }
  };
}

/* ---------- 演武: every spell against practice dummies that never strike back ----------
   A showcase for players who only want to watch the effects; it stays in the finished game. */
function galleryHero() { var h = Rules.newHero(10); h.mp = 999; return h; }

/* ---------- the map ---------- */
var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
var NEXT = { floor1: "floor2", floor2: "top" };
var hero, people = [], foes = [], cam, busy = false, cur = null, banner = "";
/* The key hint at the bottom of a map, for a player who does not know that A talks and START opens the menu.
   It is shown on arrival, and again after a while standing still with nothing pressed; any input puts it away.
   hintT: seconds of hint left; idleT: seconds since the last input while nothing else is going on. */
var HINT = "A 说话 · START 菜单", HINT_SEC = 4, IDLE_SEC = 6;
var hintT = 0, idleT = 0;
var HINT_BTNS = ["up", "down", "left", "right", "a", "b", "start", "select"];
var INFO = {};
/* what a cutscene adds to the map: stage (extra actors, see Maps.render), glows (point lights that can pulse),
   rip (the ripple over the frame), panel (a cut-in band: the hand, the master's face), ended (the end card has been shown) */
var stage = [], glows = [], rip = { k: 0, t0: 0 }, panel = null, ended = false, fxT = 0;

/* a map as the scene needs it: the town from src/town.js, the others from STORY (the 3D scene is built on first use) */
function mapInfo(id) {
  if (INFO[id]) return INFO[id];
  var info;
  if (id === "town") info = { id: id, kind: "town", rows: TOWN.map, world: town, start: TOWN.start, def: null, P: null };
  else if (id === "ending") {
    /* the road again, at dawn, from the tower's gate: nothing on it to fight, open or talk to */
    info = Object.assign({}, mapInfo("road"), { id: id, dawn: true, base: "road", start: { x: 7, y: 1, face: "down" } });
  } else {
    var d = STORY[id];
    info = { id: id, kind: d.kind, rows: d.map, world: Maps.build(d), start: d.start, def: d, P: Maps.parse(d) };
  }
  info.w = info.world.width; info.h = info.world.height;
  return (INFO[id] = info);
}

function blocked(c, r) {
  if (c < 0 || r < 0 || c >= cur.w || r >= cur.h) return true;
  if (cur.world.solid[c + "," + r]) return true;
  if (foes.some(function (f) { return f.c === c && f.r === r; })) return true;
  return people.some(function (p) { return p.x === c && p.y === r; });
}
function openedNow() {
  var o = {};
  if (cur.P) cur.P.chests.forEach(function (p, i) { if (flags.opened[(cur.base || cur.id) + ":" + i]) o[i] = true; });
  return o;
}
/* what stands on a tile that you can talk to: a person, a door, the well, a stone, a chest, the mural */
function thingAt(c, r) {
  var p = people.filter(function (q) { return q.x === c && q.y === r; })[0];
  if (p) return { kind: "person", p: p };
  var at = function (list) { return list.filter(function (q) { return q.c === c && q.r === r; })[0]; };
  if (cur.id === "town") {
    var all = TOWN.things.concat(town.spots), well = TOWN.map[r] && TOWN.map[r][c] === "W";
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      if (s.y === 0 || s.y === TOWN.map.length - 1) continue;
      if (well && TOWN.map[s.y][s.x] === "W") return { kind: "pages", pages: STORY.town.well };
      if (s.x === c && s.y === r) return { kind: "pages", pages: [{ say: s.say }] };
    }
    return null;
  }
  if (at(cur.P.saves)) return { kind: "save" };
  var ch = at(cur.P.chests);
  if (ch) return { kind: "chest", i: cur.P.chests.indexOf(ch) };
  if (at(cur.P.murals)) return { kind: "pages", pages: STORY.floor2.mural };
  return null;
}

async function saySeq(pages) {
  for (var i = 0; i < pages.length; i++) await game.say(pages[i].say, pages[i].name ? { name: pages[i].name } : {});
}
async function talk(pages) {
  busy = true;
  await saySeq(pages);
  busy = false;
}
function toMap(id) { return game.go("map", { id: id }, { to: LoGame.INK }); }

/* progress: written at the save stones. The seen-list goes with it */
function doSave() {
  var p = { v: 1, map: cur.id, x: hero.c, y: hero.r, face: hero.face, hero: clone(me), flags: clone(flags) };
  lastSave = clone(p);
  runSave = clone(p);
  if (!saveLocked) game.save("progress", p);
  writeSeen();
}
async function saveStone() {
  busy = true;
  Snd.fx("save");
  await saySeq(STORY.save);
  Rules.rest(me);
  doSave();
  busy = false;
}
async function openChest(i) {
  busy = true;
  var key = cur.id + ":" + i, id = cur.def.chests[i];
  if (flags.opened[key]) await game.say(STORY.chestEmpty);
  else {
    flags.opened[key] = 1;
    me.items[id] = (me.items[id] || 0) + 1;
    Snd.fx("chest");
    await game.say(STORY.chest.replace("{item}", BATTLE.ITEMS[id].name));
  }
  busy = false;
}
async function talkMaster(p) {
  busy = true;
  if (flags.master) await saySeq(STORY.town.masterAgain);
  else {
    /* the camera leans toward him while he speaks; the first talk is what opens the road */
    await Cut.play("town:master", async function (C) {
      await C.tween(cam, { x: (hero.x + p.x + 0.5) / 2 + 0.5, z: (hero.z - p.y - 0.5) / 2 }, 0.6, "inOut");
      await Cut.dialogue(STORY.town.master);
      flags.master = 1;
      await C.tween(cam, { x: hero.x, z: hero.z }, 0.5, "inOut");
    });
  }
  busy = false;
}
function interact(f) {
  if (f.kind === "save") return saveStone();
  if (f.kind === "chest") return openChest(f.i);
  if (f.kind === "pages") return talk(f.pages);
  var p = f.p;
  if (p.who === "master") return talkMaster(p);
  return talk(p.pages);
}

/* ---------- fights on the map ----------
   An enemy is drawn where its digit stands. Finishing a step within one tile of it (diagonals count) starts its
   fight. Won: it is gone for good. Fled: it stays and the hero is back on the tile he came from. */
function fight(key, ids, area, at) {
  busy = true;
  /* at: where the hero stands when he comes back, when a cutscene has moved him from where he started it */
  var back = { id: cur.id, key: key, at: at || { c: hero.c, r: hero.r, face: hero.face }, prev: at ? { c: at.c, r: at.r } : { c: hero.pc, r: hero.pr } };
  game.go("battle", { ids: ids, area: area, hero: me, back: "map", backArgs: back, from: new Uint8Array(R.image.px) }, { fade: false });
}
/* ---------- the cutscenes ----------
   Each is one Cut.play: the first time in full, then one press of A runs it to its end state. A script must therefore
   leave things as it wants them at its end whether or not it was skipped, and change the game's state (healing, flags)
   in plain code, not in a timer. Everything on screen that a cutscene adds goes through `stage` (actors), `glows`
   (lights), FX particles, `rip` (the ripple) and `panel`; the map scene draws them. */

/* the hero walks a scripted way, tile by tile (his own walking is off while the scene is busy) */
async function walkHero(C, dirs) {
  hero.walking = true;
  for (var i = 0; i < dirs.length; i++) {
    var d = dirs[i], c = hero.c + DIRS[d][0], r = hero.r + DIRS[d][1];
    hero.face = d; hero.pc = hero.c; hero.pr = hero.r; hero.c = c; hero.r = r; hero.step++;
    await C.tween(hero, { x: c + 0.5, z: -r - 0.5 }, 0.26, "linear");
  }
  hero.walking = false;
}
/* the buttons that lead from one tile to another: sideways first, then up or down */
function route(c0, r0, c1, r1) {
  var d = [], i;
  for (i = c0; i < c1; i++) d.push("right");
  for (i = c0; i > c1; i--) d.push("left");
  for (i = r0; i < r1; i++) d.push("down");
  for (i = r0; i > r1; i--) d.push("up");
  return d;
}
/* two specks of mist or light rising from around (x, z); called every few hundredths of a second */
function puff(x, z, spread, tone) {
  for (var i = 0; i < 2; i++) {
    FX.spawn({ x: x + (Math.random() - 0.5) * spread, y: 0.05 + Math.random() * 0.3, z: z + (Math.random() - 0.5) * spread * 0.5,
      vx: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.9, vz: 0, life: 1.3 + Math.random() * 1.2,
      tone: tone == null ? (Math.random() < 0.6 ? 3 : 2) : tone, size: 0.05 + Math.random() * 0.09 });
  }
}
/* the boss is drawn like in the battle. lo-3d examples: snap rounds the sprite to a whole multiple of its pixels, so the
   big close sprite has no uneven pixels; alpha (a tween, see the callers) fades it in and out, where it used to blink */
function bossActor(b, o) {
  return Object.assign({ art: B_ART.mirage, x: b.c + 0.5, z: -b.r - 0.5, scale: 0.07, snap: true, sh: 2.2 }, o);
}

/* The roof, the first step past the boss row: the master waits at the B tile. He has no shadow (Lo3D.shadow is drawn
   for every actor, so he is drawn with noShadow: the clue), and the camera comes in low to show his feet and the hero's
   shadow next to them. At 「……呵。」 the frame ripples (FX.wave on the frame's pixels), the master fades out (an sprite
   alpha tween), mist rises, and the 蜃妖 rises out of it (alpha in, snap, screen shake). Then the fight. */
async function startBoss() {
  busy = true;
  var b = cur.P.boss, bx = b.c + 0.5, bz = -b.r - 0.5, bo = STORY.top.boss;
  /* lo-3d example: Maps.render gives every actor a Lo3D.shadow; noShadow leaves it off, and that is the whole clue */
  var master = { art: ART.master, x: bx, z: bz, noShadow: true, alpha: 1 };
  await Cut.play("top:boss", async function (C) {
    stage = [master];
    cam.snap = true;
    /* to a place beside and below him, and the camera low and close, so both pairs of feet are in it */
    var go = walkHero(C, route(hero.c, hero.r, 5, 3));
    await C.tween(cam, { x: bx - 0.5, z: bz - 0.7, y: 0.4, pitch: -0.34, dist: 4.4 }, 1.4, "inOut");
    await go;
    hero.face = "up";
    await Cut.say(bo[0].say, { name: bo[0].name });
    await Cut.say(bo[1].say.slice(0, 2), { name: bo[1].name });
    /* the camera drops its eye toward the ground, where the two shadows are, and the last line is said over it.
       The music stops here: the wind alone until the mirage rises */
    Snd.music(null);
    C.sfx("dread");
    await C.tween(cam, { pitch: -0.52, y: 0.15 }, 0.8, "inOut");
    await C.wait(0.5);
    await Cut.say(bo[1].say.slice(2), { name: bo[1].name });
    /* 「……呵。」: the ripple starts with the line (it is drawn from the clock, which runs under the dialogue) */
    rip.t0 = game.time; rip.k = 1;
    /* the name tag still says 师父, but the voice is already the mirage's */
    await Cut.say(bo[2].say, { name: bo[2].name, voice: "蜃妖" });
    var stopMist = C.every(0.04, function () { puff(bx, bz, 3.2); });
    await C.tween(master, { alpha: 0 }, 1.4, "linear");
    stage = [];
    var mirage = bossActor(b, { y: -2.4, alpha: 0 });
    stage.push(mirage);
    C.shake(3, 1.8); C.sfx("roar");
    Snd.music("boss");
    await Promise.all([C.tween(mirage, { y: 0, alpha: 1 }, 1.9, "out"), C.tween(rip, { k: 0 }, 2.4, "linear")]);
    stopMist();
    await C.wait(0.4);
    await Cut.say(bo[3].say, { name: bo[3].name });
  });
  /* the hero comes back to the tiles south of the boss (three, as in `afterBoss`), so the pendant scene starts where it should */
  fight("top:B", BATTLE.ROUTE[3].fights[0], BATTLE.ROUTE[3].area, { c: 6, r: 5, face: "up" });
}

/* The roof after the fight: the mirage flickers at half strength (alpha pulsing in steps, not blinking) while it speaks,
   dissolves (alpha 1 to 0, mist rising), and leaves the pendant, which falls and lies glowing. The hero walks to it;
   when it warms in his hand his HP and MP come back (Rules.rest) with a small glow. Then ink, and the ending. */
async function afterBoss() {
  busy = true;
  var b = cur.P.boss, bx = b.c + 0.5, bz = -b.r - 0.5, st = STORY.top, ghost = bossActor(b, { scale: 0.1, pulse: [0.5, 0.2, 3.2] });
  stage = [ghost];
  await Cut.play("top:pendant", async function (C) {
    cam.snap = true;
    await C.tween(cam, { x: bx - 0.6, z: bz - 1.9, y: 0.4, pitch: -0.45, dist: 5 }, 1, "inOut");
    await Cut.dialogue(st.pendant);
    /* a last surge, then it comes apart into the mist */
    ghost.alpha = 0.5 + 0.2 * Math.sin(game.time * 3.2); ghost.pulse = null;
    await C.tween(ghost, { alpha: 1 }, 0.3, "out");
    var stopMist = C.every(0.03, function () { puff(bx, bz + 0.2, 3); });
    await C.tween(ghost, { alpha: 0, y: 0.5 }, 1.5, "linear");
    stopMist();
    stage = [];
    /* the pendant falls where he stood, and lies there with a soft glow and a few sparks */
    var pend = { art: ART.jade, x: bx, z: bz, y: 2.8, snap: true, sh: 0.3 };
    stage.push(pend);
    glows = [{ x: bx, y: 0.2, z: bz - 0.3, radius: 3.2, base: 1, dot: 0, env: function (t) { return 0.6 + 0.4 * Math.sin(t * 3.4); } }];
    await C.tween(pend, { y: 0.02 }, 0.45, "in");
    C.sfx("jade");
    await C.tween(pend, { y: 0.3 }, 0.14, "out");
    await C.tween(pend, { y: 0.02 }, 0.14, "in");
    C.every(0.25, function () { FX.spawn({ x: bx + (Math.random() - 0.5) * 0.5, y: 0.2, z: bz + (Math.random() - 0.5) * 0.3, vy: 0.5, life: 0.9, tone: 3, size: 0.05 }); });
    await C.wait(0.7);
    var look = C.tween(cam, { x: bx - 0.9, z: bz - 0.1, dist: 4.8 }, 1.3, "inOut");
    await walkHero(C, route(hero.c, hero.r, 5, 2));
    await look;
    hero.face = "right";
    await Cut.say(st.found[0].say);
    await Cut.say(st.found[1].say, { name: st.found[1].name });
    /* he takes it up; it is warm. Hurt and tired no more: the stone's rest, with a glow on him */
    await C.tween(pend, { x: hero.x + 0.2, z: hero.z, y: 0.5 }, 0.35, "inOut");
    stage = [];
    Rules.rest(me);
    glows = [{ x: hero.x, y: 0.6, z: hero.z - 0.2, radius: 3, base: 1.1, t0: game.time, env: function (t, gl) { var k = t - gl.t0; return Math.max(0, k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 1.6); } }];
    for (var i = 0; i < 16; i++) FX.spawn({ x: hero.x + (Math.random() - 0.5) * 0.8, y: 0.1 + Math.random() * 0.5, z: hero.z + (Math.random() - 0.5) * 0.4,
      vy: 0.6 + Math.random() * 0.8, life: 0.9 + Math.random() * 0.6, tone: 3, size: 0.05 });
    Snd.fx("warm");
    await Cut.say(st.found[2].say);
    await Cut.say(st.found[3].say, { name: st.found[3].name });
    await C.wait(0.3);
  });
  game.go("map", { id: "ending" }, { to: LoGame.INK });
}

/* The ending, at dawn at the tower's gate: the master waits; the hero reports; the cut-ins (2D pixel bands, no text): the pendant on his palm, the master's
   face, the hand closing on the pendant and lowering out of the frame; a pause; the master's answer; the master goes in through the
   gate; the last shot pulls back and up from the hero alone, a faint glow at his hand beating like a heart. */
async function ending() {
  busy = true;
  var en = STORY.ending, master = { art: ART.master, x: 6.5, z: -3.5 };
  stage = [master];
  cam.x = 7.5; cam.z = -2.4; cam.pitch = -0.5;
  await Cut.play("ending", async function (C) {
    /* the last of the rain (src/sound.js's PLACES) under the name of the place; then dawn, and the stream */
    banner = STORY.places.ending;
    await C.wait(1.8);
    banner = "";
    Snd.music("dawn");
    Snd.amb("stream", 0.3);
    await walkHero(C, ["down", "down"]);
    hero.face = "left";
    await C.tween(cam, { x: 7, z: -3.2 }, 0.6, "inOut");
    await Cut.dialogue(en.report);
    /* the cut-ins: a band slides over the darkened scene. The palm with the pendant, the master's face, then the
       fingers close over the pendant and the fist goes down out of the frame */
    var cutin = function (name) { panel.art = ART.cutin(name); };
    panel = { art: ART.cutin("palm"), x: 160, dark: 0 };
    C.tween(panel, { dark: 1 }, 0.35, "linear");
    await C.tween(panel, { x: 0 }, 0.35, "out");
    await C.wait(1.5);
    await C.tween(panel, { x: -160 }, 0.2, "in");
    cutin("master"); panel.x = 160;
    await C.tween(panel, { x: 0 }, 0.2, "out");
    await C.wait(1.8);
    await C.tween(panel, { x: -160 }, 0.2, "in");
    cutin("palm"); panel.x = 160;
    await C.tween(panel, { x: 0 }, 0.2, "out");
    await C.wait(0.5);
    cutin("curl1"); await C.wait(0.25);
    /* the hand closes: the music stops, and the rest of the scene is the stream and the master's pause */
    cutin("fist"); Snd.music(null); await C.wait(0.7);
    for (var di = 0; di < 4; di++) { cutin("down" + di); await C.wait(0.14); }
    await C.tween(panel, { dark: 0 }, 0.3, "linear");
    panel = null;
    await C.wait(1.5);
    await Cut.dialogue(en.answer);
    /* he turns away and goes in through the gate, fading in the doorway. 未完 plays once, over the last shot and 序章 完 */
    Snd.music("coda");
    await C.tween(master, { z: -1.45 }, 1.5, "inOut");
    await C.tween(master, { z: -0.95, alpha: 0 }, 0.8, "linear");
    stage = [];
    hero.face = "up";
    await C.wait(0.9);
    /* a beat at his right hand: two soft pulses, a pause */
    var bump = function (p, c) { return Math.max(0, 1 - Math.abs(p - c) / 0.14); };
    glows = [{ x: hero.x + 0.32, y: 0.32, z: hero.z - 0.1, radius: 3, base: 1.6, dot: 0.22,
      env: function (t) { var p = t % 1.2; return Math.max(bump(p, 0.1), 0.7 * bump(p, 0.38)); } }];
    await C.tween(cam, { x: hero.x, z: hero.z + 2, y: 6.5, pitch: -0.08, dist: 18 }, 7, "inOut");
    await C.wait(2);
  });
  glows = [];
  game.go("credits", null, { to: LoGame.INK });
}

/* 序章 完, the credits and 待续, on ink. A skips the roll to 待续, then A goes back to the title.
   Reaching this scene is clearing the game: it is saved with the seen-list (the progress save stays as it was). */
var cr = { phase: "end", t: 0, y: 0 };
scene("credits", {
  enter: function () {
    ended = true;
    cr = { phase: "end", t: 0, y: 150 };
    Snd.amb(null);
    Cut.seen.cleared = true;
    writeSeen();
  },
  update: function (dt) {
    cr.t += dt;
    var lines = STORY.ending.credits;
    if (cr.phase === "end") {
      /* the credits roll to the title's music */
      if (cr.t >= 3) { cr.phase = "roll"; cr.t = 0; cr.y = 150; Snd.music("title"); }
    } else if (cr.phase === "roll") {
      cr.y -= 16 * dt;
      if ((game.ok() && cr.t > 0.3) || cr.y + lines.length * 14 < -4) { cr.phase = "next"; cr.t = 0; }
    } else if (game.ok() && cr.t > 0.4) {
      game.sfx("ok");
      game.go("title", null, { to: LoGame.INK });
    }
  },
  draw: function (g) {
    var en = STORY.ending;
    g.clear(g.INK);
    if (cr.phase === "end") g.text(en.end, 80, 66, { align: "center", color: g.PAPER });
    else if (cr.phase === "roll") {
      en.credits.forEach(function (line, i) {
        var y = Math.round(cr.y + i * 14);
        /* a line after a gap is a heading: mid; the first line and the last stay paper */
        var head = i > 0 && i < en.credits.length - 1 && en.credits[i - 1] === "";
        if (line && y > -14 && y < 144) g.text(line, 80, y, { align: "center", color: head ? g.MID : g.PAPER });
      });
    } else {
      g.text(en.next[0], 80, 52, { align: "center", color: g.PAPER });
      g.text(en.next[1], 80, 72, { align: "center", color: g.PAPER });
      if (Math.floor(game.time * 2) % 2) g.arrow(77, 116, "down", g.MID);
    }
  }
});

function arrive() {
  var near = foes.filter(function (f) { return Math.max(Math.abs(f.c - hero.c), Math.abs(f.r - hero.r)) <= 1; });
  if (near.length) {
    near.sort(function (a, b) { return a.k - b.k; });
    fight(near[0].key, near[0].ids, near[0].area);
  } else if (cur.id === "top" && hero.r <= STORY.top.bossRow && !flags.beat["top:B"]) {
    busy = true;
    startBoss();
  }
}
async function afterFight(args) {
  busy = true;
  await game.wait(0.45);
  if (args.result === "lose") {
    await saySeq(STORY.lose);
    if (runSave) game.go("map", { id: runSave.map, resume: clone(runSave) }, { to: LoGame.INK });
    else game.go("title", null, { to: LoGame.INK });
    return;
  }
  if (args.result === "win" && args.key === "top:B") { afterBoss(); return; }
  busy = false;
}

/* walking off the map's open edges, or into its gate and stairs */
function edge(c, r) {
  var north = r < 0, id = cur.id;
  if (id === "town") {
    if (!north) return talk(STORY.town.south);
    if (flags.master) { busy = true; return toMap("road"); }
    return talk(STORY.town.northClosed);
  }
  if (!north && cur.def.south) return talk(cur.def.south);
  game.sfx("tick");
}
async function leave(to, pages) {
  busy = true;
  game.sfx("ok");
  if (pages) await saySeq(pages);
  toMap(to);
}
function bump(c, r, dir) {
  var ch = cur.rows[r] && cur.rows[r][c];
  if (ch === "G") return leave("floor1", cur.def.gate);
  if (ch === "^" && NEXT[cur.id]) return leave(NEXT[cur.id]);
  if (game.pressed(dir)) {
    if (ch === "v" && cur.def && cur.def.south) return talk(cur.def.south);
    game.sfx("tick");
  }
}

/* the banner with the place's name, for a moment */
function showBanner(text, sec) {
  banner = text;
  Cut.T.after(sec == null ? 3 : sec, function () { if (banner === text) banner = ""; });
}

/* the hint is drawn over the map alone: never under a dialogue, a cutscene, the skip question or the field menu */
function hintOn() { return hintT > 0 && !busy && !fm && game.top() === MAP; }
function anyInput() {
  for (var i = 0; i < HINT_BTNS.length; i++) if (game.pressed(HINT_BTNS[i]) || game.btn(HINT_BTNS[i])) return true;
  return !!(game.pointer && game.pointer.pressed);
}

/* ---------- the field menu ----------
   START on a map, when nothing else is going on: 物品 (eat a pill), 状态, 返回. No saving here; that stays at the
   stones. fm is null while closed, else {kind: "main"|"items"|"status", i, msg}. The rule for an item is Rules.useItem,
   the same one a battle uses. */
var fm = null;
var FM_MAIN = ["物品", "状态", "返回"];
function fmOpen() { fm = { kind: "main", i: 0, msg: "" }; game.sfx("tap"); }
function fmEffect(id) { var it = BATTLE.ITEMS[id]; return it.hp ? "体力+" + it.hp : "法力+" + it.mp; }
/* a tap on the field menu: {row} on one of the rows of the window that holds the list, {out: true} outside every
   window of the screen, null for none (fmDraw draws the same boxes) */
function fmTap() {
  var p = game.pointer;
  if (!p.pressed) return null;
  var x = p.x, y = p.y;
  if (fm.kind === "main") {
    if (x >= 104 && x < 156 && y >= 8 && y < 56) {
      var r = Math.floor((y - 13) / 13);
      return r >= 0 && r < FM_MAIN.length ? { row: r } : {};
    }
    return { out: true };
  }
  if (fm.kind === "items") {
    if (y >= 100) {
      var k = Math.floor((y - 104) / 15);
      return k >= 0 && k < BATTLE.ITEM_ORDER.length ? { row: k } : {};
    }
    return y >= 8 && y < 42 ? {} : { out: true };
  }
  return { out: true };
}
function fmUpdate() {
  var d = game.dir(), tap = fmTap();
  /* touch: a row selects and acts like A; a tap outside the windows is B; the status page closes on any tap */
  var ok = game.pressed("a"), back = game.pressed("b") || !!(tap && tap.out);
  if (tap && tap.row != null) { fm.i = tap.row; ok = true; }
  if (fm.kind === "main") {
    if (d.y) { fm.i = (fm.i + d.y + FM_MAIN.length) % FM_MAIN.length; game.sfx("move"); }
    if (back || game.pressed("start")) { fm = null; game.sfx("tap"); }
    else if (ok) {
      game.sfx("ok");
      if (fm.i === 0) fm = { kind: "items", i: 0, msg: "" };
      else if (fm.i === 1) fm = { kind: "status", i: 1, msg: "" };
      else fm = null;
    }
  } else if (fm.kind === "items") {
    if (d.y) { fm.i = (fm.i + d.y + BATTLE.ITEM_ORDER.length) % BATTLE.ITEM_ORDER.length; fm.msg = ""; game.sfx("move"); }
    if (back) { fm = { kind: "main", i: 0, msg: "" }; game.sfx("tap"); }
    else if (ok) {
      var id = BATTLE.ITEM_ORDER[fm.i], got = Rules.useItem(me, id);
      if (got) { fm.msg = fmEffect(id).replace(/\d+/, got.hp || got.mp); game.sfx("ok"); }
      else { fm.msg = me.items[id] > 0 ? "已经满了" : "没有了"; game.sfx("err"); }
    }
  } else if (back || ok || tap) { fm = { kind: "main", i: 1, msg: "" }; game.sfx("tap"); }
}
/* a row that can't be chosen: dark text struck through with a dotted line (battle.js draws its own the same way) */
function offText(g, text, x, y, o) {
  o = o || {};
  var w = g.measure(text), x0 = o.align === "right" ? x - w : x, ly = y + Math.round(g.lineHeight / 2) - 1;
  g.text(text, x, y, { align: o.align, color: g.DARK });
  for (var k = 0; k < w; k += 2) g.rect(x0 + k, ly, 1, 1, g.DARK);
}
function fmDraw(g) {
  var s = Rules.stats(me.level);
  if (fm.kind === "main") {
    g.window(104, 8, 52, 48);
    FM_MAIN.forEach(function (t, i) {
      if (i === fm.i) g.arrow(108, 17 + i * 13, "right");
      g.text(t, 118, 14 + i * 13);
    });
  } else if (fm.kind === "items") {
    g.window(0, 8, 160, 34);
    g.text("体力 " + me.hp + "/" + s.maxHp, 8, 13);
    g.text("法力 " + me.mp + "/" + s.maxMp, 152, 13, { align: "right" });
    g.text(fm.msg, 80, 27, { align: "center", color: g.DARK });
    g.window(0, 100, 160, 44);
    BATTLE.ITEM_ORDER.forEach(function (id, i) {
      var y = 106 + i * 15, none = !(me.items[id] > 0);
      if (i === fm.i) g.arrow(5, y + 3, "right");
      /* none left: dark and struck through, as in battle (mid on paper can't be read on a phone) */
      if (none) offText(g, BATTLE.ITEMS[id].name, 13, y);
      else g.text(BATTLE.ITEMS[id].name, 13, y);
      g.text(fmEffect(id), 90, y, { color: g.DARK });
      if (none) offText(g, "x0", 154, y, { align: "right" });
      else g.text("x" + me.items[id], 154, y, { align: "right" });
    });
  } else {
    var next = me.level >= BATTLE.XP.length - 1 ? "满级" : String(BATTLE.XP[me.level + 1] - me.xp);
    var rows = [["等级", String(me.level)], ["体力", me.hp + "/" + s.maxHp], ["法力", me.mp + "/" + s.maxMp],
      ["经验", String(me.xp)], ["升级还需", next]];
    g.window(14, 16, 132, 80);
    rows.forEach(function (r, i) {
      g.text(r[0], 24, 22 + i * 14, { color: g.DARK });
      g.text(r[1], 136, 22 + i * 14, { align: "right" });
    });
  }
}

var MAP = scene("map", {
  enter: async function (args) {
    args = args || {};
    Cut.reset();
    busy = false;
    stage = []; glows = []; rip.k = 0; panel = null; FX.reset(); fxT = game.time;
    cur = mapInfo(args.id || "town");
    if (args.fresh) { me = Rules.newHero(1); flags = freshFlags(); runSave = null; ended = false; }
    if (args.resume) { me = args.resume.hero; flags = args.resume.flags; runSave = clone(args.resume); }
    if (args.hero) me = args.hero;
    if (args.flags) flags = args.flags;
    if (!me) { me = Rules.newHero(1); flags = flags || freshFlags(); }
    var s = cur.start, c = s.x, r = s.y, face = s.face, prev = null;
    if (args.resume) { c = args.resume.x; r = args.resume.y; face = args.resume.face; }
    if (args.x != null) { c = args.x; r = args.y; }
    if (args.at) {
      /* back from a fight: a win or a loss stays where it was; a flight steps back */
      c = args.at.c; r = args.at.r; face = args.at.face;
      if (args.result === "fled") { c = args.prev.c; r = args.prev.r; }
      if (args.result === "win") flags.beat[args.key] = 1;
    }
    hero = { c: c, r: r, pc: c, pr: r, x: c + 0.5, z: -r - 0.5, face: face, step: 0, moving: null };
    cam = { x: hero.x, z: hero.z, pitch: CAM.pitch, dist: CAM.dist, y: 0, yaw: 0, snap: false };
    banner = ""; fm = null;
    Snd.place(cur.id, { lost: args.result === "lose", bossBeaten: cur.id === "top" && !!flags.beat["top:B"] });

    people = cur.dawn ? [] : cur.id === "town"
      ? TOWN.people.map(function (p) { return { x: p.x, y: p.y, art: ART[p.art], name: p.name, who: p.art, pages: STORY.town[p.art] }; })
      : cur.P.people.map(function (p, i) { var d = cur.def.people[i]; return { x: p.c, y: p.r, art: ART[d.art], name: d.name, pages: [{ name: d.name, say: d.say }] }; });
    var part = cur.def ? BATTLE.ROUTE[cur.def.part] : null;
    foes = !cur.P || cur.dawn ? [] : cur.P.foes.filter(function (f) { return !flags.beat[cur.id + ":" + f.k]; }).map(function (f) {
      var ids = part.fights[f.k - 1];
      return { c: f.c, r: f.r, k: f.k, key: cur.id + ":" + f.k, ids: ids, area: part.area, art: B_ART[BATTLE.ENEMIES[ids[0]].art] };
    });

    if (cur.dawn) { ending(); return; }
    var name = cur.id === "town" ? TOWN.name : STORY.places[cur.id];
    if (args.intro) {
      /* the camera starts on the tower and comes down the road to the hero */
      busy = true;
      await Cut.play("town:intro", async function (C) {
        cam.x = TOWN.tower.x; cam.z = -TOWN.tower.y + 2; cam.pitch = -0.25; cam.dist = 14;
        await C.wait(0.6);
        await C.tween(cam, { x: hero.x, z: hero.z, pitch: CAM.pitch, dist: CAM.dist }, 3.2, "inOut");
        await Cut.dialogue(STORY.town.intro);
      });
      flags.entered.town = 1;
      busy = false;
    } else if (!args.at && !args.resume && !flags.entered[cur.id] && cur.def && cur.def.enter) {
      busy = true;
      await Cut.play("enter:" + cur.id, async function (C) {
        banner = name;
        await C.wait(1.5);
        banner = "";
        await Cut.dialogue(cur.def.enter);
      });
      flags.entered[cur.id] = 1;
      busy = false;
    } else {
      if (!args.at) showBanner(name);
      flags.entered[cur.id] = 1;
    }
    if (args.at && args.result) afterFight(args);
    /* the key hint on every arrival; a cutscene or the ending that follows keeps it off the screen */
    hintT = HINT_SEC; idleT = 0;
  },
  exit: function () { Cut.reset(); },
  update: function (dt) {
    Cut.step(dt);
    /* the hint goes at the first touch; input is read once, the key block below uses it again */
    var input = anyInput();
    if (input) { hintT = 0; idleT = 0; }
    if (busy) { idleT = 0; return; }
    if (fm) { idleT = 0; fmUpdate(); return; }
    if (hero.moving) {
      var m = hero.moving;
      m.t = Math.min(1, m.t + dt * 4.2);
      hero.x = m.x0 + (m.x1 - m.x0) * m.t; hero.z = m.z0 + (m.z1 - m.z0) * m.t;
      if (m.t >= 1) { hero.moving = null; arrive(); }
    }
    if (!hero.moving && !busy) {
      if (game.pressed("start")) { fmOpen(); return; }
      var dir = null;
      ["up", "down", "left", "right"].forEach(function (d) { if (game.btn(d)) dir = dir || d; });
      if (dir) {
        hero.face = dir;
        var c = hero.c + DIRS[dir][0], r = hero.r + DIRS[dir][1];
        if (!blocked(c, r)) {
          hero.moving = { x0: hero.x, z0: hero.z, x1: c + 0.5, z1: -r - 0.5, t: 0 };
          hero.pc = hero.c; hero.pr = hero.r;
          hero.c = c; hero.r = r; hero.step++;
        } else if (r < 0 || r >= cur.h) {
          if (game.pressed(dir)) edge(c, r);
        } else bump(c, r, dir);
      } else if (game.pressed("a")) {
        var f = thingAt(hero.c + DIRS[hero.face][0], hero.r + DIRS[hero.face][1]);
        if (f) { game.sfx("tap"); interact(f); }
      }
    }
    /* the camera trails the hero a little */
    cam.x += (hero.x - cam.x) * Math.min(1, dt * 8);
    cam.z += (hero.z - cam.z) * Math.min(1, dt * 8);
    /* the key hint: back after six seconds standing still with nothing pressed */
    if (hintT > 0) hintT = Math.max(0, hintT - dt);
    if (input || hero.moving) idleT = 0; else idleT += dt;
    if (idleT >= IDLE_SEC) { idleT = 0; hintT = HINT_SEC; }
  },
  draw: function (g) {
    /* hero.walking: a cutscene walks him by tweening x and z, so the stride follows the clock instead of a step's progress */
    var walk = hero.moving ? Math.floor(hero.moving.t * 2 + hero.step) % 2 : hero.walking ? Math.floor(game.time * 8.4 + hero.step) % 2 : 0;
    var art = hero.face === "up" ? (walk ? ART.heroUp1 : ART.heroUp0)
      : hero.face === "down" ? (walk ? ART.heroDown1 : ART.heroDown0)
      : (walk ? ART.heroSide1 : ART.heroSide0);
    var t = game.time;
    var snap = cam.snap;
    var actors = people.map(function (p) { return { art: p.art, x: p.x + 0.5, z: -p.y - 0.5, snap: snap }; });
    /* enemies idle: the floaters bob, the others turn about now and then */
    foes.forEach(function (f) {
      var float = f.art === B_ART.fox || f.art === B_ART.wraith;
      actors.push({ art: f.art, x: f.c + 0.5, z: -f.r - 0.5, y: float ? 0.2 + Math.sin(t * 3 + f.k) * 0.08 : 0,
        flip: !float && Math.floor(t * 1.4 + f.k) % 2 === 1, sh: f.art.w / 14 });
    });
    /* a cutscene's actors; one that pulses has its alpha worked out from the clock, so it moves under a dialogue too */
    stage.forEach(function (a) {
      var o = Object.assign({}, a);
      if (a.pulse) o.alpha = a.pulse[0] + a.pulse[1] * Math.sin(t * a.pulse[2]);
      actors.push(o);
    });
    actors.push({ art: art, x: hero.x, z: hero.z, flip: hero.face === "right", snap: snap });
    var view = { x: cam.x, z: cam.z, pitch: cam.pitch, dist: cam.dist, time: t };
    if (cur.kind === "town") frame(g, view, actors);
    else {
      view.weather = cur.dawn ? null : cur.def.weather;
      view.y = cam.y; view.yaw = cam.yaw;
      if (cur.dawn) { view.dawn = true; view.lamp = 0.3; }
      /* particles and glows step by the clock in draw, which also runs while a dialogue is open */
      var dt = game.time - fxT;
      fxT = game.time;
      if (dt > 0 && dt < 0.2) FX.step(dt);
      var lights = [];
      glows.forEach(function (gl) {
        var p = gl.base * gl.env(t, gl);
        if (p > 0.02) lights.push({ x: gl.x, y: gl.y, z: gl.z, radius: gl.radius, power: p });
      });
      var img = Maps.render(R, cur.world, view, actors, { opened: openedNow(), hero: hero, lights: lights, after: function (RR) {
        FX.drawParts(RR);
        glows.forEach(function (gl) { if (gl.dot != null && gl.env(t, gl) > 0.45) RR.dot([gl.x, gl.y, gl.z - 0.12], 3, gl.dot); });
      } });
      if (rip.k > 0.01) FX.wave(img.px, rip.k * 2.6 * Math.min(1, (t - rip.t0) * 3), 0.28, t * 8, 0, 144);
      g.sprite(img, 0, 0);
    }
    if (banner) {
      var w = g.measure(banner) + 14;
      g.window(Math.round(80 - w / 2), 6, w, 18);
      g.text(banner, 80, 10, { align: "center" });
    }
    /* the key hint at the bottom, the banner's mirror: inside the 160 x 144 screen and clear of the hero */
    if (hintOn()) {
      var hw = g.measure(HINT) + 14;
      g.window(Math.round(80 - hw / 2), 122, hw, 18);
      g.text(HINT, 80, 126, { align: "center" });
    }
    /* a cut-in is a band across the middle of the screen; the scene behind it is darkened */
    if (panel) {
      if (panel.dark > 0) g.dither(0, 0, 160, 144, g.INK, Math.min(3, Math.ceil(panel.dark * 3)));
      g.sprite(panel.art, Math.round(panel.x), 24);
    }
    if (fm && !busy) fmDraw(g);
    Cut.draw(g);
  }
});

scene("battle", Battle.scene);

/* For tests only, never on screen (the fight list would spoil the route):
   ZT.fight(part, k) starts fight k of BATTLE.ROUTE[part] with the hero a player would have there, every earlier fight
   won and item found. ZT.goto(map, {x, y, entered}) starts on a map (at its start unless x, y; entered: skip its first words) as a player arriving there:
   the same hero, the earlier maps' enemies beaten and chests opened. ZT.state() reads where the game is. */
var ZT = {
  heroAt: function (p, k) {
    var h = Rules.newHero(1), xp = 0;
    BATTLE.ROUTE.forEach(function (part, pi) {
      if (pi > p) return;
      Object.keys(part.found).forEach(function (id) { h.items[id] = (h.items[id] || 0) + part.found[id]; });
      part.fights.forEach(function (ids, fi) {
        if (pi < p || fi < k) ids.forEach(function (id) { xp += BATTLE.ENEMIES[id].xp; });
      });
    });
    h.xp = xp; h.level = Rules.levelFor(xp);
    Rules.rest(h);
    return h;
  },
  fight: function (p, k) {
    var part = BATTLE.ROUTE[p];
    game.go("battle", { ids: part.fights[k], area: part.area, hero: ZT.heroAt(p, k), back: "title", from: new Uint8Array(R.image.px) }, { fade: false });
  },
  goto: function (id, o) {
    o = o || {};
    /* "ending" is the dawn scene after the roof: every map is behind the hero. o.win: the roof's boss has just fallen */
    var part = id === "town" ? 0 : id === "ending" ? 4 : STORY[id].part, f = freshFlags();
    f.master = id === "town" ? 0 : 1;
    if (o.entered) f.entered[id] = 1;
    ["road", "floor1", "floor2", "top"].forEach(function (m) {
      if (id === "town" || STORY[m].part >= part) return;
      f.entered[m] = 1;
      STORY[m].chests.forEach(function (_, i) { f.opened[m + ":" + i] = 1; });
      BATTLE.ROUTE[STORY[m].part].fights.forEach(function (_, k) { f.beat[m + ":" + (k + 1)] = 1; });
    });
    var won = o.win ? { at: { c: 6, r: 5, face: "up" }, prev: { c: 6, r: 5 }, result: "win", key: "top:B" } : {};
    game.go("map", Object.assign({ id: id, hero: ZT.heroAt(part > 3 ? 3 : part, part > 3 ? 1 : 0), flags: f, x: o.x, y: o.y }, won), { fade: false });
  },
  state: function () {
    return { scene: where, map: cur && cur.id, x: hero && hero.c, y: hero && hero.r, flags: flags, hero: me, ended: ended, credits: cr.phase, cleared: !!Cut.seen.cleared,
      hint: hintOn(), sound: Snd.wanted() };
  }
};

game.start("title");
