/* Cutscenes: a clock of their own (tween, after, every, wait, flash, shake, sfx), like Battle.T in
   src/battle.js, so a cutscene can be fast-forwarded or skipped.
     Cut.play(key, fn)  runs fn(Cut.T).
     Cut.say(pages)     the dialogue inside a cutscene: [{name, say: [lines]}].
   What the player can do, as in most console RPGs (owner, 2026-10-11):
     - Dialogue is never skipped by A: A turns the page (and first completes a page still typing).
     - Fast-forward, in a cutscene seen before: A while no dialogue is open shows a small 「快进 A　取消 B」 in the
       corner; A again runs the motion to the next line of dialogue, B or two seconds hide it. The extra press is
       there because A is also the page key: a player hammering A through the lines must not lose the next scene.
     - Skip, in any cutscene, the first viewing too: START asks 「跳过这段剧情？」 and pauses; A skips the whole cutscene,
       dialogue included, to the same end state as watching it; B goes back.
   lo-game updates only the top scene, so while a dialogue is open the map scene's update does not run: the buttons
   are watched by a lo-game timer (timers run under overlays, before the top scene's update), and the question is an
   overlay of its own, so the dialogue under it does not see the A that answers it. The clock is stepped by the map
   scene (Cut.step(dt)), so it stands still while the question is open. Keys of cutscenes seen go into Cut.seen. */
var Cut = (function () {
  var EASE = {
    linear: function (t) { return t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    "in": function (t) { return t * t; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  };
  var tweens = [], timers = [], none = function () {};
  var skip = false, all = false, open = 0, playing = false, hint = 0, asking = false;
  var self = { seen: {}, onDone: null };

  function settle(w) { for (var p in w.to) w.obj[p] = w.to[p]; w.done(); }
  var T = {
    tween: function (obj, to, sec, ease) {
      return new Promise(function (res) {
        var w = { obj: obj, from: {}, to: to, dur: Math.max(1 / 60, sec), t: 0, ease: EASE[ease || "out"] || EASE.out, done: res };
        for (var p in to) w.from[p] = obj[p];
        if (skip) settle(w); else tweens.push(w);
      });
    },
    after: function (sec, fn) {
      if (skip) { fn(); return none; }
      var t = { left: sec, fn: fn };
      timers.push(t);
      return function () { t.dead = true; };
    },
    /* repeating timers drive motion only; a cut drops them */
    every: function (sec, fn) {
      if (skip) return none;
      var t = { left: sec, every: sec, fn: fn };
      timers.push(t);
      return function () { t.dead = true; };
    },
    wait: function (sec) { return new Promise(function (res) { T.after(sec, res); }); },
    flash: function (sec) { if (!skip) game.flash(sec); },
    shake: function (a, sec) { if (!skip) game.shake(a, sec); },
    sfx: function (name) { if (!skip) game.sfx(name); }
  };

  /* called by the map scene's update, also while the scene is busy with a cutscene */
  self.step = function (dt) {
    tweens = tweens.filter(function (w) {
      w.t = Math.min(1, w.t + dt / w.dur);
      var k = w.ease(w.t);
      for (var p in w.to) w.obj[p] = w.from[p] + (w.to[p] - w.from[p]) * k;
      if (w.t >= 1) { w.done(); return false; }
      return true;
    });
    var due = [];
    timers = timers.filter(function (t) {
      if (t.dead) return false;
      t.left -= dt;
      if (t.left > 0) return true;
      due.push(t);
      if (t.every) { t.left += t.every; return true; }
      return false;
    });
    due.forEach(function (t) { if (!t.dead) t.fn(); });
  };
  /* leaving the scene: nothing may fire later */
  self.reset = function () { tweens = []; timers = []; skip = false; all = false; open = 0; playing = false; hint = 0; asking = false; };

  function cut() {
    skip = true;
    var tw = tweens, tm = timers;
    tweens = []; timers = [];
    tw.forEach(settle);
    tm.forEach(function (t) { if (!t.dead && !t.every) t.fn(); });
  }

  /* the whole cutscene: every tween and timer to its end, the open dialogue closed, the rest of the lines passed over */
  function skipAll() {
    all = true; hint = 0;
    cut();
    while (open > 0) { open--; game.pop(); }
  }
  /* 「跳过这段剧情？」: an overlay, so the dialogue under it (if any) waits; resolves true for A, false for B */
  function ask() {
    asking = true; hint = 0;
    game.sfx("tap");
    return game.push({
      update: function () {
        if (game.pressed("a")) { game.sfx("ok"); game.pop(true); }
        else if (game.pressed("b")) { game.sfx("tap"); game.pop(false); }
      },
      draw: function (g) {
        g.window(22, 36, 116, 38);
        g.text("跳过这段剧情？", 80, 41, { align: "center" });
        g.text("A 是　B 否", 80, 57, { align: "center", color: g.DARK });
      }
    }).then(function (yes) { asking = false; if (yes && playing && !all) skipAll(); });
  }
  /* the corner hint for a fast-forward, drawn by the map scene over the picture */
  self.draw = function (g) {
    if (!hint || game.time > hint || open > 0 || asking) return;
    var t = "快进 A　取消 B", w = g.measure(t) + 12;
    g.window(158 - w, 122, w, 20, { thin: true });
    g.text(t, 158 - w / 2, 126, { align: "center" });
  };

  self.say = function (pages, o) {
    if (all) return Promise.resolve();
    skip = false; hint = 0;
    open++;
    return game.say(pages, o || {}).then(function () { if (open > 0) open--; });
  };
  /* [{name, say: [lines]}]: one box per page */
  self.dialogue = async function (pages) {
    for (var i = 0; i < pages.length; i++) await self.say(pages[i].say, pages[i].name ? { name: pages[i].name } : {});
  };

  self.skipping = function () { return skip; };
  /* for tests: the corner hint, the question, a whole-cutscene skip */
  self.state = function () { return { hint: !!hint && game.time <= hint, asking: asking, all: all }; };
  self.playing = function () { return playing; };
  self.T = T;

  self.play = async function (key, fn) {
    var again = !!self.seen[key];
    self.seen[key] = true;
    skip = false; all = false; hint = 0; playing = true;
    var stop = game.every(1 / 60, function () {
      if (asking || all) return;
      if (game.pressed("start")) { ask(); return; }
      /* fast-forward: only in a cutscene seen before, only while no dialogue is open (there A turns the page) */
      if (!again || skip || open > 0) return;
      if (hint && game.time > hint) hint = 0;
      if (hint && game.pressed("b")) { hint = 0; game.sfx("tap"); }
      else if (game.pressed("a") || game.pointer.pressed) {
        if (hint) { hint = 0; cut(); } else hint = game.time + 2;
      }
    });
    try { await fn(T); }
    finally {
      stop();
      skip = false; all = false; hint = 0; playing = false;
      if (self.onDone) self.onDone(key);
    }
  };
  return self;
})();
