/* Scenes: the title (camera circling the tower) and the town, where the hero walks tile by tile.
   SELECT shows how long the last frame took to render, for checking speed on a phone. */
var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var R = Lo3D.create({ width: 160, height: 144 });
var town = World.build(TOWN);
var CAM = { pitch: -0.62, dist: 8.5 };
var perf = { show: false, ms: 0 };

function frame(g, view, actors) {
  var t0 = performance.now();
  g.sprite(World.render(R, town, view, actors), 0, 0);
  perf.ms = perf.ms * 0.9 + (performance.now() - t0) * 0.1;
  if (perf.show) { g.rect(0, 0, 50, 14, g.INK); g.text(perf.ms.toFixed(1) + " ms", 2, 1, { color: g.PAPER }); }
}
function toggles() { if (game.pressed("select")) perf.show = !perf.show; }

/* ---------- title ---------- */
game.scene("title", {
  draw: function (g) {
    var a = game.time * 0.12, T = town.def.tower;
    frame(g, { x: T.x, y: 4, z: -T.y, yaw: a, pitch: -0.22, dist: 17, time: game.time }, []);
    g.window(14, 82, 132, 52);
    g.text("镇妖塔·外传", 80, 88, { align: "center" });
    g.text("内置 LX-3D 协处理器", 80, 104, { align: "center", color: g.DARK });
    if (Math.floor(game.time * 2) % 2) g.text("按 A 开始", 80, 119, { align: "center" });
  },
  update: function () {
    toggles();
    if (game.ok()) { game.sfx("ok"); game.go("town", { intro: true }, { to: LoGame.INK }); }
  }
});

/* ---------- town ---------- */
var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
var hero, people, cam, busy = false;

function blocked(c, r) {
  if (c < 0 || r < 0 || c >= town.width || r >= town.height) return true;
  if (town.solid[c + "," + r]) return true;
  return people.some(function (p) { return p.x === c && p.y === r; });
}
/* what stands on a tile: a person, a door, the well, a sign */
function thingAt(c, r) {
  var p = people.filter(function (q) { return q.x === c && q.y === r; })[0];
  if (p) return p;
  var all = TOWN.things.concat(town.spots), well = TOWN.map[r] && TOWN.map[r][c] === "W";
  for (var i = 0; i < all.length; i++) {
    var s = all[i];
    if ((s.x === c && s.y === r) || (well && TOWN.map[s.y][s.x] === "W")) return s;
  }
  return null;
}
async function talk(s) {
  busy = true;
  await game.say(s.say, s.name ? { name: s.name } : {});
  busy = false;
}
/* walking off the map's open edges reads the sign there */
function edge(c, r) {
  var row = r < 0 ? 0 : town.height - 1;
  return TOWN.things.filter(function (s) { return s.y === row && Math.abs(s.x - c) <= 1; })[0];
}

game.scene("town", {
  enter: async function (args) {
    var s = TOWN.start;
    hero = { c: s.x, r: s.y, x: s.x + 0.5, z: -s.y - 0.5, face: s.face, step: 0, moving: null };
    people = TOWN.people.map(function (p) { return { x: p.x, y: p.y, art: ART[p.art], name: p.name, say: p.say }; });
    cam = { x: hero.x, z: hero.z, pitch: CAM.pitch, dist: CAM.dist };
    if (args && args.intro) {
      /* the camera starts on the tower and comes down the road to the hero */
      busy = true;
      cam.x = TOWN.tower.x; cam.z = -TOWN.tower.y + 2; cam.pitch = -0.25; cam.dist = 14;
      await game.wait(0.6);
      await game.tween(cam, { x: hero.x, z: hero.z, pitch: CAM.pitch, dist: CAM.dist }, 3.2, "inOut");
      busy = false;
      await talk({ say: ["镇妖塔的封印松了。", "去镇上问问吧。"] });
    }
  },
  update: function (dt) {
    toggles();
    if (busy) return;
    if (hero.moving) {
      var m = hero.moving;
      m.t = Math.min(1, m.t + dt * 4.2);
      hero.x = m.x0 + (m.x1 - m.x0) * m.t; hero.z = m.z0 + (m.z1 - m.z0) * m.t;
      if (m.t >= 1) hero.moving = null;
    }
    if (!hero.moving) {
      var dir = null;
      ["up", "down", "left", "right"].forEach(function (d) { if (game.btn(d)) dir = dir || d; });
      if (dir) {
        hero.face = dir;
        var c = hero.c + DIRS[dir][0], r = hero.r + DIRS[dir][1];
        if (!blocked(c, r)) {
          hero.moving = { x0: hero.x, z0: hero.z, x1: c + 0.5, z1: -r - 0.5, t: 0 };
          hero.c = c; hero.r = r; hero.step++;
        } else if (game.pressed(dir)) {
          var e = (r < 0 || r >= town.height) && edge(c, r);
          if (e) talk(e); else game.sfx("tick");
        }
      } else if (game.pressed("a")) {
        var f = thingAt(hero.c + DIRS[hero.face][0], hero.r + DIRS[hero.face][1]);
        if (f) { game.sfx("tap"); talk(f); }
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
    var actors = people.map(function (p) { return { art: p.art, x: p.x + 0.5, z: -p.y - 0.5 }; });
    actors.push({ art: art, x: hero.x, z: hero.z, flip: hero.face === "right" });
    frame(g, { x: cam.x, z: cam.z, pitch: cam.pitch, dist: cam.dist, time: game.time }, actors);
  }
});

game.start("title");
