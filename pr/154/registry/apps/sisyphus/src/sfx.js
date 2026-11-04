/* Sisyphus: synthesized sounds. No samples: the runtime's chip follows the player's volume,
   the silent switch and the app's lifecycle. (A recorded sample can replace these later,
   once PAD.sample exists; see drafts/sisyphus/RESEARCH.md.) */
var SFX = (function () {
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function heave(game, hard) {
    game.sfx({
      wave: "square", duty: 1, from: hard ? 118 : 148, to: hard ? 76 : 94,
      ms: hard ? 430 : 320, attack: 30, decay: hard ? 380 : 280,
      vol: hard ? 0.34 : 0.28,
      vibrato: { depth: hard ? 1.5 : 1.05, rate: rnd(4.8, 6.2) }
    });
    game.sfx({ wave: "noise", from: rnd(700, 900), to: 280, ms: 190, attack: 20, decay: 170, vol: 0.09 });
  }

  function breath(game) {
    game.sfx({ wave: "noise", from: rnd(620, 860), to: 260, ms: rnd(160, 230), attack: 18, decay: 180, vol: 0.065 });
  }

  function step(game) {
    game.sfx({ wave: "noise", from: rnd(1100, 1500), to: 520, ms: 55, attack: 2, decay: 50, vol: 0.055 });
  }

  function scrape(game) {
    game.sfx({ wave: "noise", from: 170, to: 58, ms: 420, attack: 10, decay: 400, vol: 0.12 });
  }

  function slip(game) {
    game.sfx({ wave: "noise", from: 1250, to: 320, ms: 120, attack: 2, decay: 110, vol: 0.10 });
  }

  function rumble(game) {
    game.sfx({ wave: "noise", from: 92, to: 24, ms: 1400, attack: 20, decay: 1360, vol: 0.34 });
    game.sfx({ wave: "square", duty: 2, from: 54, to: 30, ms: 1150, attack: 30, decay: 1100, vol: 0.14 });
  }

  function gong(game) {
    game.sfx({ wave: "noise", from: 270, to: 38, ms: 1400, attack: 8, decay: 1380, vol: 0.28 });
    game.sfx({ wave: "triangle", from: 94, to: 58, ms: 1000, attack: 5, decay: 980, vol: 0.20 });
  }

  function chime(game) {
    game.sfx({ wave: "triangle", from: 880, to: 660, ms: 520, attack: 4, decay: 500, vol: 0.10 });
  }

  function click(game) { game.sfx("tap"); }
  function move(game) { game.sfx("move"); }
  function denied(game) { game.sfx("err"); }

  return { heave: heave, breath: breath, step: step, scrape: scrape, slip: slip,
    rumble: rumble, gong: gong, chime: chime, click: click, move: move, denied: denied };
})();
