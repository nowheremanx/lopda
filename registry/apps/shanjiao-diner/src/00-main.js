/* 山脚小馆 — the game object and a few globals. */
/* The world stays 216 x 240; on a phone the canvas grows around it and
 * paintBands (src/26-bands.js, loaded after this file) paints the diner's
 * walls, shelf and floor outside it (sdk/UI.md 13).  The wrapper only calls
 * paintBands at draw time, so the name is there by then. */
var game = LoGame.create({
  width: 216, height: 240, lang: "zh", fill: true,
  bands: function (s, stage) { paintBands(s, stage); }
});

/* Which screen's scenery the bands paint.  Set by the scene wrapper below; a
 * dialog or a choice leaves it alone, so its room stays behind it.  The event
 * overlay (dawn, shop, forest) keeps the diner around it too. */
var bandScreen = "title";

/* SELECT opens the codex from any playable scene.  It used to toggle a
 * layout grid, which looked like a bug to players; the grid is still in
 * UI.debug for development, but no key in the game reaches it. */
var sceneBase = game.scene;
game.scene = function (name, def) {
  var update = def.update;
  def.update = function (dt) {
    bandScreen = name;
    var canCodex = !busy && name !== "title" && name !== "help" && name !== "ending" &&
                   name !== "event" && name !== "battle" && name !== "codex";
    if (canCodex && game.pressed("select")) {
      game.sfx("tap");
      game.push("codex", { from: name });
      return;
    }
    if (update) update.call(this, dt);
  };
  return sceneBase.call(game, name, def);
};

var T = game.t;
var W = 216, H = 240;
var SAVE_KEY = "diner";
var SAVE_VERSION = 1;
var busy = false;
var toast = { text: "", until: 0 };
function sayToast(text) { toast.text = text; toast.until = game.time + 2.6; }
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";
