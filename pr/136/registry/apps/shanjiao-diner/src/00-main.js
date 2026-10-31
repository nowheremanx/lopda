/* 山脚小馆 — the game object and a few globals. */
var game = LoGame.create({ width: 216, height: 240, lang: "zh" });

/* SELECT opens the codex from any playable scene.  It used to toggle a
 * layout grid, which looked like a bug to players; the grid is still in
 * UI.debug for development, but no key in the game reaches it. */
var sceneBase = game.scene;
game.scene = function (name, def) {
  var update = def.update;
  def.update = function (dt) {
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
