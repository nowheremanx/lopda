/* Scenes: the title (camera circling the tower) and the map, where the hero walks tile by tile through the town
   and the maps of src/story.js. SELECT shows how long the last frame took to draw, in every scene, for checking
   speed on a phone. Progress is saved at the save stones; what the player has already seen is saved with it. */
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
    frame(g, { x: T.x, y: 4, z: -T.y, yaw: a, pitch: -0.22, dist: 17, time: game.time }, []);
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

/* a map as the scene needs it: the town from src/town.js, the others from STORY (the 3D scene is built on first use) */
function mapInfo(id) {
  if (INFO[id]) return INFO[id];
  var info;
  if (id === "town") info = { id: id, kind: "town", rows: TOWN.map, world: town, start: TOWN.start, def: null, P: null };
  else {
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
  if (cur.P) cur.P.chests.forEach(function (p, i) { if (flags.opened[cur.id + ":" + i]) o[i] = true; });
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
function fight(key, ids, area) {
  busy = true;
  var back = { id: cur.id, key: key, at: { c: hero.c, r: hero.r, face: hero.face }, prev: { c: hero.pc, r: hero.pr } };
  game.go("battle", { ids: ids, area: area, hero: me, back: "map", backArgs: back, from: new Uint8Array(R.image.px) }, { fade: false });
}
/* phase 2 replaces these two with the cutscenes (the master's entrance; the pendant, the ending and the credits) */
function startBoss() { fight("top:B", BATTLE.ROUTE[3].fights[0], BATTLE.ROUTE[3].area); }
function afterBoss() { game.go("title", null, { to: LoGame.INK }); }

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
    if (lastSave) game.go("map", { id: lastSave.map, resume: clone(lastSave) }, { to: LoGame.INK });
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
    cur = mapInfo(args.id || "town");
    if (args.fresh) { me = Rules.newHero(1); flags = freshFlags(); }
    if (args.resume) { me = args.resume.hero; flags = args.resume.flags; }
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
    cam = { x: hero.x, z: hero.z, pitch: CAM.pitch, dist: CAM.dist };
    banner = "";

    people = cur.id === "town"
      ? TOWN.people.map(function (p) { return { x: p.x, y: p.y, art: ART[p.art], name: p.name, who: p.art, pages: STORY.town[p.art] }; })
      : cur.P.people.map(function (p, i) { var d = cur.def.people[i]; return { x: p.c, y: p.r, art: ART[d.art], name: d.name, pages: [{ name: d.name, say: d.say }] }; });
    var part = cur.def ? BATTLE.ROUTE[cur.def.part] : null;
    foes = !cur.P ? [] : cur.P.foes.filter(function (f) { return !flags.beat[cur.id + ":" + f.k]; }).map(function (f) {
      var ids = part.fights[f.k - 1];
      return { c: f.c, r: f.r, k: f.k, key: cur.id + ":" + f.k, ids: ids, area: part.area, art: B_ART[BATTLE.ENEMIES[ids[0]].art] };
    });

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
    var walk = hero.moving ? Math.floor(hero.moving.t * 2 + hero.step) % 2 : 0;
    var art = hero.face === "up" ? (walk ? ART.heroUp1 : ART.heroUp0)
      : hero.face === "down" ? (walk ? ART.heroDown1 : ART.heroDown0)
      : (walk ? ART.heroSide1 : ART.heroSide0);
    var t = game.time;
    var actors = people.map(function (p) { return { art: p.art, x: p.x + 0.5, z: -p.y - 0.5 }; });
    /* enemies idle: the floaters bob, the others turn about now and then */
    foes.forEach(function (f) {
      var float = f.art === B_ART.fox || f.art === B_ART.wraith;
      actors.push({ art: f.art, x: f.c + 0.5, z: -f.r - 0.5, y: float ? 0.2 + Math.sin(t * 3 + f.k) * 0.08 : 0,
        flip: !float && Math.floor(t * 1.4 + f.k) % 2 === 1, sh: f.art.w / 14 });
    });
    actors.push({ art: art, x: hero.x, z: hero.z, flip: hero.face === "right" });
    var view = { x: cam.x, z: cam.z, pitch: cam.pitch, dist: cam.dist, time: t };
    if (cur.kind === "town") frame(g, view, actors);
    else {
      view.weather = cur.def.weather;
      g.sprite(Maps.render(R, cur.world, view, actors, { opened: openedNow(), hero: hero }), 0, 0);
    }
    if (banner) {
      var w = g.measure(banner) + 14;
      g.window(Math.round(80 - w / 2), 6, w, 18);
      g.text(banner, 80, 10, { align: "center" });
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
    var part = id === "town" ? 0 : STORY[id].part, f = freshFlags();
    f.master = id === "town" ? 0 : 1;
    if (o.entered) f.entered[id] = 1;
    ["road", "floor1", "floor2", "top"].forEach(function (m) {
      if (id === "town" || STORY[m].part >= part) return;
      f.entered[m] = 1;
      STORY[m].chests.forEach(function (_, i) { f.opened[m + ":" + i] = 1; });
      BATTLE.ROUTE[STORY[m].part].fights.forEach(function (_, k) { f.beat[m + ":" + (k + 1)] = 1; });
    });
    game.go("map", { id: id, hero: ZT.heroAt(part, 0), flags: f, x: o.x, y: o.y }, { fade: false });
  },
  state: function () {
    return { scene: where, map: cur && cur.id, x: hero && hero.c, y: hero && hero.r, flags: flags, hero: me };
  }
};

game.start("title");
