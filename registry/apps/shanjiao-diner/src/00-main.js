/* 山脚小馆 — the game object and a few globals. */
var game = LoGame.create({ width: 216, height: 240, lang: "zh" });
var T = game.t;
var W = 216, H = 240;
var SAVE_KEY = "diner";
var SAVE_VERSION = 1;
var busy = false;
var toast = { text: "", until: 0 };
function sayToast(text) { toast.text = text; toast.until = game.time + 2.6; }
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";
