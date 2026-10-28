/* 山脚小馆 — the game object and a few globals. */
var game = LoGame.create({ width: 216, height: 240, lang: "zh" });

/* Every scene gets two hooks for free: SELECT toggles the layout grid, and the
 * grid is painted after the scene so a stray label cannot hide it. */
var sceneBase = game.scene;
game.scene = function (name, def) {
  var update = def.update, draw = def.draw;
  def.update = function (dt) {
    if (game.pressed("select")) {
      UI.debugOn = !UI.debugOn;
      sayToast(UI.debugOn ? "布局网格：开" : "布局网格：关");
      game.sfx("tick");
    }
    if (update) update.call(this, dt);
  };
  def.draw = function (g) {
    if (draw) draw.call(this, g);
    if (UI.debugOn && typeof UI !== "undefined") UI.debug(g);
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
