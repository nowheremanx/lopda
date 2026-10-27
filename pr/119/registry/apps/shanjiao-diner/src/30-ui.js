/* Small widgets shared by the scenes. */
var UI = {};

UI.header = function (g, s, label) {
  g.window(6, 4, 204, 24, { thin: true });
  g.text(label || ("第 " + s.day + " 天"), 10, 6);
  ART.weatherIcon(g, s.weather, 74, 8, game.time);
  g.text(DATA.WEATHER[s.weather].name, 89, 6, { color: g.DARK });
  g.text("名声 " + s.rep, 112, 6, { color: g.DARK });
  ART.coin(g, 166, 8);
  g.text(String(s.money), 176, 6);
  g.text("文", 202, 6, { color: g.DARK });
};

UI.footer = function (g, text, color) {
  g.text(text, 108, 224, { align: "center", color: color == null ? g.DARK : color });
};

UI.window = function (g, x, y, w, h, opts) {
  g.window(x, y, w, h, opts || {});
};

UI.panel = function (g, x, y, w, h, title) {
  g.window(x, y, w, h);
  if (title) {
    g.rect(x + 5, y + 2, g.measure(title) + 2, 12, g.PAPER);
    g.text(title, x + 6, y + 2, { color: g.DARK });
  }
};

UI.hearts = function (g, x, y, n, max) {
  for (var i = 0; i < (max || 5); i++) ART.heart(g, x + i * 9, y, i < n);
};

UI.stars = function (g, x, y, n) {
  for (var i = 0; i < 5; i++) ART.star(g, x + i * 8, y, i < n ? g.INK : g.MID);
};

UI.bar = function (g, x, y, w, h, v, max, color) {
  g.rect(x, y, w, h, g.MID);
  g.rect(x, y, Math.round(w * Math.max(0, Math.min(1, v / max))), h, color == null ? g.INK : color);
};

UI.money = function (g, x, y, n, right) {
  ART.coin(g, x, y);
  g.text((right ? "" : "") + n, x + 10, y - 2);
};

UI.actionBar = function (g, items, sel, y) {
  y = y == null ? 194 : y;
  g.window(6, y, 204, 22, { thin: true });
  var xs = [12, 52, 92, 132, 172];
  for (var i = 0; i < items.length; i++) {
    var it = items[i], x = xs[i];
    if (i === sel) {
      g.rect(x - 5, y + 2, 36, 18, g.INK);
      g.text(it.label, x, y + 4, { color: g.PAPER });
    } else {
      g.text(it.label, x, y + 4, { color: it.disabled ? g.DARK : g.INK });
    }
  }
};

UI.arrow = function (g, x, y, color) {
  g.arrow(x, y, "right", color == null ? g.INK : color);
};

UI.toast = function (g) {
  if (game.time < toast.until && toast.text) {
    g.window(16, 116, 184, 20, { thin: true });
    g.text(toast.text, 108, 118, { align: "center" });
  }
};

UI.help = function (g, page) {
  g.clear(g.PAPER);
  UI.header(g, S || { day: 1, weather: "sunny", rep: 1, money: 0 }, "说明");
  g.window(6, 32, 204, 184);
  g.text("怎么玩", 14, 36, { color: g.DARK });
  var lines = [
    "早上有 2 个行动：出门、备菜。",
    "先出门采买，回来再备菜；",
    "出门去后山采食材、打山兽。",
    "傍晚开门，客人点单，按 A 上菜。",
    "打烊后看账，第四天和第七天交租。",
    "第七天山神宴：备好三道菜。",
    "",
    "方向键 选    A 好    B 返回",
    "START 暂停 / 存档",
    "",
    "钱、好感和名声都会留到第二天。",
    "常客好感 3 心，会来帮你。"
  ];
  for (var i = 0; i < lines.length; i++) g.text(lines[i], 14, 52 + i * 15, { color: i === 7 ? g.DARK : g.INK });
  UI.footer(g, "A / B 返回");
};
