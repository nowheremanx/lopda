/* Scenes: the title (camera circling the tower) and the map, where the hero walks tile by tile through the town
   and the maps of src/story.js. SELECT shows how long the last frame took to draw, in every scene, for checking
   speed on a phone. Progress is saved at the save stones; what the player has already seen is saved with it.
   The cutscenes (the boss's entrance, the pendant, the ending) and the credits are at the end of the map scene. */
var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
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
    }
  }));
}

/* ---------- the game's state, and what is saved ----------
   me: the hero as the rules know him (levels, hp, mp, items); battles change it in place.
   flags: what has happened. master: the first talk is done (the road is open); entered, opened, beat: by map,
   by "map:chest index", by "map:enemy digit". lastSave is a copy of the last "progress" written. */
var me = null, flags = null, lastSave = null;
/* runSave: the last stone of THIS run (null in a new game until the first one), the only place a loss goes back to.
   lastSave is the one on disk, which 继续 on the title loads; an older run's save must not catch a new game's loss */
var runSave = null;
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function freshFlags() { return { master: 0, entered: {}, opened: {}, beat: {} }; }
/* the animations and cutscenes seen survive a new game, so they can be skipped from the second time on */
function writeSeen() { game.save("seen", Object.assign({}, Cut.seen, Battle.seen())); }
Cut.onDone = writeSeen;
game.load("seen").then(function (s) {
  if (s && typeof s === "object") { Object.assign(Battle.seen(), s); Object.assign(Cut.seen, s); }
});
game.load("progress").then(function (p) { if (p && p.v === 1 && p.map && p.hero && p.flags) lastSave = p; });

/* ---------- title ---------- */
scene("title", {
  enter: function () { busy = false; },
  draw: function (g) {
    var a = game.time * 0.12, T = town.def.tower;
    frame(g, { x: T.x, y: 4, z: -T.y, yaw: a, pitch: -0.22, dist: 17, time: game.time, fogCull: true }, []);
    g.window(14, 82, 132, 52);
    g.text("镇妖塔·序章", 80, 88, { align: "center" });
    g.text("内置 LX-3D 协处理器", 80, 104, { align: "center", color: g.DARK });
    if (Math.floor(game.time * 2) % 2) g.text("按 A 开始", 80, 119, { align: "center" });
  },
  update: function () {
    if (busy || !game.ok()) return;
    game.sfx("ok");
    busy = true;
    var items = lastSave ? ["继续", "进入小镇", "演武"] : ["进入小镇", "演武"];
    game.choose(items, { y: lastSave ? 66 : 80 }).then(function (i) {
      busy = false;
      var pick = items[i];
      if (pick === "继续") game.go("map", { id: lastSave.map, resume: clone(lastSave) }, { to: LoGame.INK });
      if (pick === "进入小镇") game.go("map", { id: "town", intro: true, fresh: true }, { to: LoGame.INK });
      if (pick === "演武") game.go("battle", { ids: ["golem", "wraith", "bronze"], area: "top", hero: galleryHero(), demo: true, back: "title", from: new Uint8Array(R.image.px) }, { fade: false });
    });
  }
});

/* ---------- 演武: every spell against practice dummies that never strike back ----------
   A showcase for players who only want to watch the effects; it stays in the finished game. */
function galleryHero() { var h = Rules.newHero(10); h.mp = 999; return h; }

/* ---------- the map ---------- */
var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
var NEXT = { floor1: "floor2", floor2: "top" };
var hero, people = [], foes = [], cam, busy = false, cur = null, banner = "";
var INFO = {};
/* what a cutscene adds to the map: stage (extra actors, see Maps.render), glows (point lights that can pulse),
   rip (the ripple over the frame), panel (a full-screen picture, the hand), ended (the end card has been shown) */
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
  game.save("progress", p);
  writeSeen();
}
async function saveStone() {
  busy = true;
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
    game.sfx("coin");
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
    /* the camera drops its eye toward the ground, where the two shadows are, and the last line is said over it */
    C.sfx("err");
    await C.tween(cam, { pitch: -0.52, y: 0.15 }, 0.8, "inOut");
    await C.wait(0.5);
    await Cut.say(bo[1].say.slice(2), { name: bo[1].name });
    /* 「……呵。」: the ripple starts with the line (it is drawn from the clock, which runs under the dialogue) */
    rip.t0 = game.time; rip.k = 1;
    await Cut.say(bo[2].say, { name: bo[2].name });
    var stopMist = C.every(0.04, function () { puff(bx, bz, 3.2); });
    await C.tween(master, { alpha: 0 }, 1.4, "linear");
    stage = [];
    var mirage = bossActor(b, { y: -2.4, alpha: 0 });
    stage.push(mirage);
    C.shake(3, 1.8); C.sfx("hit");
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
    var pend = { art: ART.pendant, x: bx, z: bz, y: 2.8, scale: 0.1, snap: true, sh: 0.5 };
    stage.push(pend);
    glows = [{ x: bx, y: 0.5, z: bz - 0.3, radius: 3.2, base: 1, env: function (t) { return 0.8 + 0.2 * Math.sin(t * 3); } }];
    await C.tween(pend, { y: 0.02 }, 0.45, "in");
    C.sfx("coin");
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
    game.sfx("ok");
    await Cut.say(st.found[2].say);
    await Cut.say(st.found[3].say, { name: st.found[3].name });
    await C.wait(0.3);
  });
  game.go("map", { id: "ending" }, { to: LoGame.INK });
}

/* The ending, at dawn at the tower's gate: the master waits; the hero reports; the close-up of the hand (a full-screen
   2D picture, no text) closing on the pendant in his sleeve; a pause; the master's answer; the master goes in through the
   gate; the last shot pulls back and up from the hero alone, a faint glow at his hand beating like a heart. */
async function ending() {
  busy = true;
  var en = STORY.ending, master = { art: ART.master, x: 6.5, z: -3.5 };
  stage = [master];
  cam.x = 7.5; cam.z = -2.4; cam.pitch = -0.5;
  await Cut.play("ending", async function (C) {
    banner = STORY.places.ending;
    await C.wait(1.8);
    banner = "";
    await walkHero(C, ["down", "down"]);
    hero.face = "left";
    await C.tween(cam, { x: 7, z: -3.2 }, 0.6, "inOut");
    await Cut.dialogue(en.report);
    panel = { f: 0, fade: 1 };
    await C.tween(panel, { fade: 0 }, 0.5, "linear");
    await C.wait(1.3); panel.f = 1;
    await C.wait(0.35); panel.f = 2;
    await C.wait(1.0);
    await C.tween(panel, { fade: 1 }, 0.4, "linear");
    panel = null;
    await C.wait(1.5);
    await Cut.dialogue(en.answer);
    /* he turns away and goes in through the gate, fading in the doorway */
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
    Cut.seen.cleared = true;
    writeSeen();
  },
  update: function (dt) {
    cr.t += dt;
    var lines = STORY.ending.credits;
    if (cr.phase === "end") {
      if (cr.t >= 3) { cr.phase = "roll"; cr.t = 0; cr.y = 150; }
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
  Cut.T.after(sec, function () { if (banner === text) banner = ""; });
}

scene("map", {
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
    banner = "";

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
      if (!args.at) showBanner(name, 1.5);
      flags.entered[cur.id] = 1;
    }
    if (args.at && args.result) afterFight(args);
  },
  exit: function () { Cut.reset(); },
  update: function (dt) {
    Cut.step(dt);
    if (busy) return;
    if (hero.moving) {
      var m = hero.moving;
      m.t = Math.min(1, m.t + dt * 4.2);
      hero.x = m.x0 + (m.x1 - m.x0) * m.t; hero.z = m.z0 + (m.z1 - m.z0) * m.t;
      if (m.t >= 1) { hero.moving = null; arrive(); }
    }
    if (!hero.moving && !busy) {
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
    /* the close-up of the hand covers the whole screen; it comes and goes through a dithered ink */
    if (panel) {
      g.sprite(ART.hand[panel.f], 0, 0);
      if (panel.fade > 0) g.dither(0, 0, 160, 144, g.INK, Math.min(4, Math.ceil(panel.fade * 4)));
    }
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
    return { scene: where, map: cur && cur.id, x: hero && hero.c, y: hero && hero.r, flags: flags, hero: me, ended: ended, credits: cr.phase, cleared: !!Cut.seen.cleared };
  }
};

game.start("title");
