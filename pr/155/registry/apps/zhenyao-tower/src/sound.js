/* Sound: which song and which ambience each place and moment wants, every sound effect the game makes, and the
   voices in the dialogue. The songs are in src/music/ (MUSIC); docs/decisions.md 12.4 has the track list.

   Songs and ambience are state, not events. Snd.music(id) and Snd.amb(name, level) only say what is wanted;
   Snd.flush(), called once a frame (main.js's scene wrapper), sends the difference. So a cutscene skipped with
   START, which runs every line of its script in one go, ends with exactly the sound it would have had if watched
   (only the last wish counts), no song is started twice, and the runtime's limit of four music calls a second is
   never reached (a new song waits until 0.3 s after the last one). A song already playing is never restarted.
   A song that plays once (the victory, the coda) is left to finish when nothing else is wanted after it.

   Effects: Snd.fx(name) plays an effect of FX below: one sound, or a few in a row (`at`: ms after the first).
   On a runtime without PAD.music (before 0.11.0) there are no sounds of our own: each effect falls back to the
   named sound that stood there before this was written (`old`), or to nothing. Every effect and blip goes through
   one budget: at most 15 in any second (the runtime allows 20), and the typing blips only while fewer than 10
   have gone out, so a blip never takes the place of a hit.

   Voices: lo-game's dialogue box asks for "tick" every third letter it types. Snd.attach(game) wraps game.sfx so that
   tick becomes the speaker's blip (every second one: about 7 a second), and game.say so that it knows who speaks.
   game.say(text, {voice}) picks a voice other than the name tag's; {sounds: {page: fx}} plays an effect instead of
   the page-turn click when that page comes up (each string is one page; keep them short). Nothing here draws or
   uses Math.random, so the picture is the same with or without sound (tests/zhenyao-sound.test.mjs). */
var Snd = (function () {
  var NEW = typeof PAD !== "undefined" && !!PAD.music;

  /* ---------- effects ---------- */
  var sq = function (duty, from, to, ms, vol, o) { return Object.assign({ wave: "square", duty: duty, from: from, to: to, ms: ms, attack: 2, vol: vol }, o); };
  var tri = function (from, to, ms, vol, o) { return Object.assign({ wave: "triangle", from: from, to: to, ms: ms, attack: 2, vol: vol }, o); };
  var nz = function (from, to, ms, vol, o) { return Object.assign({ wave: "noise", from: from, to: to, ms: ms, attack: 2, vol: vol }, o); };
  var at = function (ms, s) { return Object.assign({ at: ms }, s); };
  var vib = function (depth, rate) { return { vibrato: { depth: depth, rate: rate } }; };
  /* the five notes of D 宫 (D E F# A B, high): one for each element's orb in 七级浮屠 */
  var FIVE = [587, 659, 740, 880, 988];
  var FX = {
    /* ---- hits ---- */
    hit: { old: "hit", s: [nz(1800, 300, 140, 0.75)] },                                       /* a foe is struck */
    hurt: { old: "hit", s: [sq(2, 330, 110, 160, 0.55)] },                                     /* the hero is struck */
    noHit: { old: "hit", s: [] },                                                              /* a pill: no blow, no sound */
    down: { old: "tick", s: [nz(700, 60, 450, 0.6)] },                                         /* a foe falls */
    bossDown: { old: "tick", s: [nz(400, 30, 1300, 0.8, { attack: 20 })] },
    weak: { old: "coin", s: [sq(1, 1568, 1568, 70, 0.5), at(60, sq(1, 2093, 2093, 140, 0.5))] },     /* 克制 */
    encounter: { old: "hit", s: [nz(300, 3000, 260, 0.6, { attack: 120 })] },                 /* into a fight: a rising rush */
    encTick: { old: "tick", s: [sq(0, 880, 880, 40, 0.4)] },
    roar: { old: "lose", s: [sq(3, 110, 70, 1000, 0.6, Object.assign({ attack: 80 }, vib(1.5, 7))), nz(250, 60, 900, 0.7, { attack: 40 })] },
    slash: { old: "move", s: [nz(5000, 1500, 90, 0.5)] },                                     /* the plain attack */
    guard: { old: "tap", s: [tri(392, 784, 180, 0.6)] },                                      /* 防御 */
    pill: { old: "coin", s: [tri(587, 587, 90, 0.6), at(80, tri(659, 659, 90, 0.6)), at(160, tri(880, 880, 160, 0.6))] },
    ether: { old: "coin", s: [sq(0, 1175, 1760, 300, 0.35, vib(0.3, 12))] },
    defeat: { old: "lose", s: [sq(2, 440, 110, 1200, 0.5, vib(0.3, 5))] },

    /* ---- the hero's spells (src/spells.js) ---- */
    /* 飞剑诀: the halo of swords rings out; each launch is a hiss through the air */
    swordCast: { old: "ok", s: [sq(0, 1400, 2800, 260, 0.35, Object.assign({ attack: 20 }, vib(0.2, 16)))] },
    swordFly: { old: "tick", s: [nz(2600, 7000, 70, 0.45)] },
    /* 寒潮: a low swell, the wash of the wave, the crack of frost */
    tideCast: { old: "ok", s: [tri(110, 330, 600, 0.7, { attack: 200 })] },
    tideWave: { old: null, s: [nz(300, 1400, 1200, 0.5, { attack: 500, decay: 700 })] },
    tideFrost: { old: "tick", s: [tri(2637, 2637, 60, 0.45, vib(0.5, 20)), at(70, tri(3136, 3136, 120, 0.4, vib(0.5, 20)))] },
    /* 青藤缚: the ground splits, the vines creak tight */
    vineCast: { old: "ok", s: [nz(140, 70, 300, 0.7)] },
    vineSqueeze: { old: "hit", s: [sq(3, 170, 130, 380, 0.45, vib(1, 18))] },
    /* 离火符: a flick of paper, then the fireball */
    charmCast: { old: "ok", s: [nz(7000, 3000, 80, 0.4), at(40, sq(1, 784, 1175, 120, 0.35))] },
    charmFire: { old: "hit", s: [nz(1500, 120, 700, 0.9)] },
    /* 山岳印: a deep hum as the seal comes down, a crash as it lands */
    sealCast: { old: "ok", s: [tri(82, 65, 1200, 0.8, Object.assign({ attack: 300 }, vib(0.3, 4)))] },
    sealSlam: { old: "hit", s: [nz(500, 35, 900, 1)] },
    /* 七级浮屠: five orbs, five notes; the phantom tower hums like a bell; the slam */
    orb0: { old: "tick", s: [sq(1, FIVE[0], FIVE[0], 160, 0.4)] },
    orb1: { old: "tick", s: [sq(1, FIVE[1], FIVE[1], 160, 0.4)] },
    orb2: { old: "tick", s: [sq(1, FIVE[2], FIVE[2], 160, 0.4)] },
    orb3: { old: "tick", s: [sq(1, FIVE[3], FIVE[3], 160, 0.4)] },
    orb4: { old: "tick", s: [sq(1, FIVE[4], FIVE[4], 160, 0.4)] },
    pagodaCast: { old: "ok", s: [tri(196, 196, 1500, 0.7, vib(0.15, 5)), sq(0, 1568, 1568, 600, 0.2)] },
    pagodaSlam: { old: "hit", s: [nz(400, 25, 1400, 1)] },

    /* ---- the foes' moves ---- */
    ember: { old: null, s: [tri(520, 780, 500, 0.45, vib(0.8, 16))] },     /* 狐火: a flickering flame flies */
    lash: { old: null, s: [nz(6000, 1800, 90, 0.5)] },                     /* 缠枝, 铁爪 */
    rock: { old: null, s: [nz(120, 400, 300, 0.5)] },                      /* 落石: heaved up */
    splash: { old: null, s: [nz(3000, 900, 280, 0.5, { attack: 20 })] },  /* 寒涎 */
    gather: { old: null, s: [tri(150, 600, 1400, 0.6, Object.assign({ attack: 900 }, vib(0.6, 9))), nz(600, 2400, 1400, 0.35, { attack: 1000 })] },
    tidal: { old: "lose", s: [nz(150, 1100, 1300, 0.9, { attack: 300 }), sq(3, 98, 65, 1200, 0.5, vib(1, 6))] },  /* 蜃楼潮 */

    /* ---- the map ---- */
    chest: { old: "coin", s: [nz(200, 120, 120, 0.4), at(120, sq(1, 784, 784, 90, 0.5)), at(210, sq(1, 1175, 1175, 160, 0.5))] },
    save: { old: null, s: [tri(880, 880, 1200, 0.55, vib(0.1, 5)), at(150, tri(1318, 1318, 900, 0.3))] },   /* a stone's bell */
    levelUp: { old: null, s: [sq(1, 587, 587, 90, 0.45), at(70, sq(1, 659, 659, 90, 0.45)), at(140, sq(1, 880, 880, 90, 0.45)), at(210, sq(1, 1175, 1175, 260, 0.45))] },
    learn: { old: null, s: [tri(1175, 1760, 400, 0.5, vib(0.3, 10))] },
    jade: { old: "coin", s: [tri(1760, 1760, 900, 0.5, vib(0.08, 6)), sq(0, 2637, 2637, 300, 0.15)] },  /* the pendant lands */
    warm: { old: "ok", s: [tri(262, 392, 1300, 0.6, Object.assign({ attack: 600 }, vib(0.2, 3)))] },     /* it warms in his hand */
    dread: { old: "err", s: [tri(98, 92, 1500, 0.7, Object.assign({ attack: 400 }, vib(0.5, 2)))] }       /* no shadow */
  };

  /* the speakers: one short blip per typed letter or two. From / to step through PITCH so it sounds like speech */
  var VOICES = {
    "阿砚": sq(1, 523, 494, 34, 0.3),
    "师父": sq(2, 247, 233, 46, 0.32),
    "蜃妖": tri(330, 262, 70, 0.5, vib(1.2, 14)),
    "婆婆": tri(698, 659, 50, 0.4, vib(0.4, 9)),
    "阿青": sq(0, 988, 1047, 26, 0.25),
    "樵夫": sq(3, 196, 185, 40, 0.3),
    "": tri(440, 440, 18, 0.3)
  };
  var PITCH = [1, 1.12, 0.94, 1.06, 0.89, 1];

  /* ---------- the budget: what went out in the last second ---------- */
  var CAP = 15, BLIP_CAP = 10, sent = [], game = null, rawSfx = null;
  function room(cap) {
    var now = game.time;
    while (sent.length && sent[0] <= now - 1) sent.shift();
    return sent.length < cap;
  }
  function send(s, cap) {
    if (!room(cap == null ? CAP : cap)) return;
    sent.push(game.time);
    rawSfx(s);
  }

  /* an effect by name; a name that is not in FX is a named sound of the runtime's */
  function fx(name) {
    var e = FX[name];
    if (!e) { send(name); return; }
    if (!NEW) { if (e.old) send(e.old); return; }
    e.s.forEach(function (s) {
      var o = Object.assign({}, s);
      delete o.at;
      if (s.at) game.after(s.at / 1000, function () { send(o); }); else send(o);
    });
  }

  /* ---------- the dialogue's voice ---------- */
  var dlg = null, ticks = 0;
  function blip() {
    if (!dlg) return;
    if (!NEW) { send("tick", BLIP_CAP); return; }
    if (ticks++ % 2) return;
    var v = VOICES[dlg.voice] || VOICES[""], k = PITCH[dlg.n++ % PITCH.length];
    send(Object.assign({}, v, { from: v.from * k, to: v.to * k }), BLIP_CAP);
  }

  /* ---------- songs and ambience ----------
     Each map: [song, ambience, level]. The rain goes with the rain src/weather.js draws (the road and its fights);
     the roof has wind; after the boss the roof has only the wind. The dawn (ending) is set by its cutscene. */
  var PLACES = {
    town: ["town", null, 0], road: ["road", "rain", 0.5], floor1: ["tower", null, 0], floor2: ["towerUp", null, 0],
    top: ["towerUp", "wind", 0.35], ending: [null, "rain", 0.25]
  };
  var ARENA_AMB = { road: ["rain", 0.5], top: ["wind", 0.35] };
  var want = { song: null, amb: null, level: 0 }, out = { song: null, amb: null, level: 0 }, lastPlay = -9;
  var api = {
    FX: FX, VOICES: VOICES,
    attach: function (g) {
      game = g;
      rawSfx = g.sfx;
      var rawSay = g.say;
      /* lo-game's own sounds: the dialogue's tick is the speaker's blip, its page click can be an effect */
      g.sfx = function (s) {
        if (s === "tick" && dlg) return blip();
        if (s === "move" && dlg) {
          dlg.page++;
          if (dlg.sounds && dlg.sounds[dlg.page]) return fx(dlg.sounds[dlg.page]);
        }
        send(s);
      };
      g.say = function (text, o) {
        o = o || {};
        dlg = { voice: o.voice != null ? o.voice : o.name || "", sounds: o.sounds || null, page: 0, n: 0 };
        ticks = 0;
        return rawSay(text, o).then(function (v) { dlg = null; return v; });
      };
    },
    fx: fx,
    /* what should be playing: a song of MUSIC by id, or null for silence */
    music: function (id) { want.song = id || null; },
    amb: function (name, level) { want.amb = name || null; want.level = name ? level : 0; },
    /* once a frame */
    flush: function () {
      if (!game) return;
      if (want.song !== out.song) {
        var cur = out.song && MUSIC[out.song];
        if (!want.song) {
          /* a song that plays once is left to finish */
          if (cur && cur.loop) game.musicStop();
          out.song = null;
        } else if (game.time - lastPlay >= 0.3) {
          var m = MUSIC[want.song];
          game.music(m.song, { loop: m.loop });
          out.song = want.song;
          lastPlay = game.time;
        }
      }
      if (want.amb !== out.amb || want.level !== out.level) {
        game.ambience(want.amb, want.level);
        out.amb = want.amb; out.level = want.level;
      }
    },
    /* a map as it is entered. o.lost: after a lost fight ("眼前一黑" in silence, then the save reloads);
       o.bossBeaten: the roof after the boss */
    place: function (id, o) {
      var p = PLACES[id];
      api.music(o.lost || o.bossBeaten ? null : p[0]);
      api.amb(p[1], p[2]);
    },
    /* a fight: the boss has its own song; the road's rain and the roof's wind go on under it */
    battle: function (area, boss) {
      var a = ARENA_AMB[area];
      api.music(boss ? "boss" : "battle");
      api.amb(a ? a[0] : null, a ? a[1] : 0);
    },
    /* the music room: play this one now, from its start, even if it is the one playing */
    replay: function (id) { out.song = null; api.music(id); },
    /* a fight won: the victory tune, or the old fanfare */
    victory: function () { if (NEW) api.music("victory"); else fx("win"); },
    /* for tests and the music room: what is wanted now */
    wanted: function () { return { song: want.song, amb: want.amb, level: want.level }; },
    hasMusic: function () { return NEW; }
  };
  return api;
})();
