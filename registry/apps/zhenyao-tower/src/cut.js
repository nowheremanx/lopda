/* Cutscenes: a clock of their own (tween, after, every, wait, flash, shake, sfx), like Battle.T in
   src/battle.js, so a scene the player has seen before can be cut short.
     Cut.play(key, fn)  runs fn(Cut.T). The first time it plays in full. After that A cuts it short:
                        every pending tween and timer finishes at once, new ones finish as they are made,
                        and a dialogue that is open closes. One press of A is the whole skip.
     Cut.say(pages)     the dialogue inside a cutscene: [{name, say: [lines]}]; it resolves at once while skipping.
   lo-game only updates the top scene, so while a dialogue is open the map scene's update does not run.
   That is why the skip is watched by a lo-game timer (those run under overlays), and the clock itself is stepped
   by the map scene: Cut.step(dt). Keys of cutscenes seen go into Cut.seen; main.js saves them with the game. */
var Cut = (function () {
  var EASE = {
    linear: function (t) { return t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    "in": function (t) { return t * t; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  };
  var tweens = [], timers = [], none = function () {};
  var skip = false, open = 0, playing = false;
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
  self.reset = function () { tweens = []; timers = []; skip = false; open = 0; playing = false; };

  function cut() {
    skip = true;
    var tw = tweens, tm = timers;
    tweens = []; timers = [];
    tw.forEach(settle);
    tm.forEach(function (t) { if (!t.dead && !t.every) t.fn(); });
    /* an open dialogue closes; its Cut.say resolves and the script runs on, skipping */
    while (open > 0) { open--; game.pop(); }
  }

  self.say = function (pages, o) {
    if (skip) return Promise.resolve();
    open++;
    return game.say(pages, o || {}).then(function () { if (open > 0) open--; });
  };
  /* [{name, say: [lines]}]: one box per page */
  self.dialogue = async function (pages) {
    for (var i = 0; i < pages.length; i++) await self.say(pages[i].say, pages[i].name ? { name: pages[i].name } : {});
  };

  self.skipping = function () { return skip; };
  self.playing = function () { return playing; };
  self.T = T;

  self.play = async function (key, fn) {
    var again = !!self.seen[key], stop = null;
    self.seen[key] = true;
    skip = false; playing = true;
    if (again) stop = game.every(1 / 60, function () { if (!skip && game.ok()) cut(); });
    try { await fn(T); }
    finally {
      if (stop) stop();
      skip = false; playing = false;
      if (self.onDone) self.onDone(key);
    }
  };
  return self;
})();
