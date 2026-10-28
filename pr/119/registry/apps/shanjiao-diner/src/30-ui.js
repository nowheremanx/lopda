/* The UI kit: every screen lays out inside the same five bands.
 *
 *   y=4   header    24 high   title, weather, reputation, money
 *   y=32  body     158 high   the screen's one job
 *   y=194 action    22 high   the buttons that work here
 *   y=224 footer    12 high   one line naming the keys
 *
 * Screens never place text at a raw x/y again without asking `UI.text` to fit
 * it.  That one rule is what stops the old "今日 / 山菇汤 / 酒" pile-up: a
 * measured header, a list that scrolls inside its own box, and order tags
 * drawn in the wall band instead of on top of the tables.
 */
var UI = (function () {
  var R = {
    W: 216, H: 240,
    header: { x: 6, y: 4, w: 204, h: 24 },
    body: { x: 6, y: 32, w: 204, h: 158 },
    action: { x: 6, y: 194, w: 204, h: 22 },
    footer: { x: 6, y: 224, w: 204, h: 12 },
    pad: 6, gap: 4, row: 15
  };

  function ellipsis(g, str, maxW) {
    str = String(str == null ? "" : str);
    if (g.measure(str) <= maxW) return str;
    var dots = "…";
    if (g.measure(dots) > maxW) return "";
    var out = "";
    var chars = Array.from(str);
    for (var i = 0; i < chars.length; i++) {
      var next = out + chars[i];
      if (g.measure(next + dots) > maxW) break;
      out = next;
    }
    return out + dots;
  }

  function text(g, str, x, y, o) {
    o = o || {};
    var s = String(str == null ? "" : str);
    if (o.fit) s = ellipsis(g, s, o.fit);
    var opt = { color: o.color, align: o.align, width: o.width, shadow: o.shadow };
    return g.text(s, x, y, opt);
  }

  function right(g, str, xRight, y, o) {
    o = o || {};
    return text(g, str, xRight, y, { color: o.color, align: "right", fit: o.fit });
  }

  /* The header's right cluster is measured from the right edge inward, so a
   * four-digit purse pushes the reputation left instead of off the screen. */
  function header(g, s, title) {
    g.window(R.header.x, R.header.y, R.header.w, R.header.h, { thin: true });
    s = s || { day: 1, weather: "sunny", rep: 1, money: 0 };
    var rightEdge = 202;
    var money = String(s.money == null ? 0 : s.money);
    var moneyW = g.measure(money);
    text(g, "文", rightEdge, 6, { color: g.DARK, align: "right" });
    right(g, money, rightEdge - 10, 6);
    ART.coin(g, rightEdge - 10 - moneyW - 10, 8);
    var x = rightEdge - 10 - moneyW - 18;
    var rep = "名声 " + s.rep;
    right(g, rep, x, 6, { color: g.DARK });
    x -= g.measure(rep) + 8;
    var weather = DATA.WEATHER[s.weather] ? DATA.WEATHER[s.weather].name : "";
    right(g, weather, x, 6, { color: g.DARK });
    x -= g.measure(weather) + 3;
    ART.weatherIcon(g, s.weather, x - 9, 8, game.time);
    x -= 12;
    text(g, title || ("第 " + s.day + " 天"), 10, 6, { fit: Math.max(20, x - 12) });
  }

  function footer(g, str, color) {
    // a paper strip keeps the hint readable over the night floor and the wood
    g.rect(0, R.footer.y - 4, R.W, R.H - (R.footer.y - 4), g.PAPER);
    g.rect(0, R.footer.y - 4, R.W, 1, g.MID);
    text(g, str, R.footer.x + R.footer.w / 2, R.footer.y, {
      align: "center", color: color == null ? g.DARK : color, fit: R.footer.w
    });
  }

  function panel(g, x, y, w, h, title) {
    g.window(x, y, w, h);
    if (title) {
      var tw = g.measure(title) + 4;
      g.rect(x + 5, y + 2, tw, 12, g.PAPER);
      text(g, title, x + 7, y + 1, { color: g.DARK, fit: w - 12 });
    }
  }

  function label(g, str, x, y, color) {
    text(g, str, x, y, { color: color == null ? g.DARK : color, fit: R.body.w });
  }

  function value(g, str, xRight, y, color) {
    right(g, str, xRight, y, { color: color });
  }

  /* one row of columns: [{x,w,align,text,color}], each one clipped to its cell */
  function columns(g, y, cols) {
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i], fit = c.w == null ? null : c.w;
      if (fit) {
        g.clip(c.x, y - 1, c.w, 14);
        text(g, c.text, c.align === "right" ? c.x + c.w : c.x, y, {
          align: c.align || "left", color: c.color, fit: fit
        });
        g.clip();
      } else {
        text(g, c.text, c.x, y, { align: c.align || "left", color: c.color });
      }
    }
  }

  function bar(g, x, y, w, h, v, max, color) {
    g.rect(x, y, w, h, g.MID);
    var f = max ? Math.max(0, Math.min(1, v / max)) : 0;
    if (f > 0) g.rect(x, y, Math.max(1, Math.round(w * f)), h, color == null ? g.INK : color);
  }

  /* a scrolling list: `draw(g, index, y)` paints one row; the kit owns the
   * window, the cursor, the scroll and the up/down hints. */
  function list(g, o) {
    var rowH = o.rowH || R.row;
    var visible = Math.max(1, Math.floor(o.h / rowH));
    var scroll = o.scroll == null ? 0 : o.scroll;
    if (o.sel < scroll) scroll = o.sel;
    if (o.sel >= scroll + visible) scroll = o.sel - visible + 1;
    if (typeof o.onScroll === "function") o.onScroll(scroll);
    g.clip(o.x, o.y, o.w, o.h);
    for (var i = 0; i < visible && scroll + i < o.count; i++) {
      var idx = scroll + i, y = o.y + i * rowH;
      if (idx === o.sel) g.rect(o.x, y - 1, o.w, rowH - 1, g.INK);
      o.draw(g, idx, y, idx === o.sel);
    }
    g.clip();
    // a 2 px scrollbar instead of arrows: it never sits on the last column
    if (o.count > visible) {
      var trackY = o.y, trackH = o.h;
      var thumbH = Math.max(8, Math.round(trackH * visible / o.count));
      var thumbY = trackY + Math.round((trackH - thumbH) * scroll / Math.max(1, o.count - visible));
      g.rect(o.x + o.w - 2, trackY, 1, trackH, g.MID);
      g.rect(o.x + o.w - 3, thumbY, 2, thumbH, g.DARK);
    }
    return scroll;
  }

  /* a table order tag in the wall band: table number, dish, patience */
  function orderTag(g, x, y, label, frac, selected, number) {
    g.window(x, y, 52, 16, { thin: true });
    if (selected) g.rect(x + 1, y + 1, 50, 14, g.INK);
    text(g, label, x + 3, y + 1, { color: selected ? g.PAPER : g.INK, fit: 38 });
    if (number) right(g, String(number), x + 48, y + 1, { color: selected ? g.PAPER : g.DARK, fit: 8 });
    g.rect(x + 3, y + 13, 46, 2, selected ? g.DARK : g.MID);
    var w = Math.max(0, Math.min(1, frac));
    if (w > 0) g.rect(x + 3, y + 13, Math.max(1, Math.round(46 * w)), 2, selected ? g.PAPER : (w < 0.35 ? g.INK : g.DARK));
  }

  function actionBar(g, items, sel, y) {
    y = y == null ? R.action.y : y;
    g.window(R.action.x, y, R.action.w, R.action.h, { thin: true });
    var n = items.length || 1;
    var cell = Math.floor((R.action.w - 8) / n);
    for (var i = 0; i < items.length; i++) {
      var it = items[i], x = R.action.x + 4 + i * cell;
      if (i === sel) {
        g.rect(x, y + 2, cell - 2, 18, g.INK);
        text(g, it.label, x + 4, y + 4, { color: g.PAPER, fit: cell - 8 });
      } else {
        text(g, it.label, x + 4, y + 4, { color: it.disabled ? g.DARK : g.INK, fit: cell - 8 });
      }
    }
  }

  function toast(g, y) {
    if (game.time < toast.until && toast.text) {
      y = y == null ? 168 : y;
      var w = Math.min(184, g.measure(toast.text) + 16);
      g.window((R.W - w) / 2, y, w, 20, { thin: true });
      text(g, toast.text, R.W / 2, y + 2, { align: "center", fit: w - 12 });
    }
  }

  function help(g, page) {
    g.clear(g.PAPER);
    header(g, S || { day: 1, weather: "sunny", rep: 1, money: 0 }, "说明");
    g.window(6, 32, 204, 184);
    text(g, "怎么玩", 14, 36, { color: g.DARK });
    var lines = [
      "早上有 2 个行动：出门、备菜。",
      "先出门采买，回来再备菜；",
      "出门去后山采食材、打山兽。",
      "傍晚开门，客人点单，按 A 上菜。",
      "打烊看账，初四、初七交租。",
      "第七天山神宴：备好三道菜。",
      "图鉴：早市或后山 START。",
      "方向键 选    A 好    B 返回",
      "START 暂停 / 存档",
      "",
      "钱、好感、名声都留到明天。",
      "常客好感 3 心，会来帮你。"
    ];
    for (var i = 0; i < lines.length; i++) {
      text(g, lines[i], 14, 52 + i * 14, { color: i === 7 ? g.DARK : g.INK, fit: 188 });
    }
    footer(g, "A / B 返回");
  }

  /* optional: the 8-pixel grid and the four bands, for catching a stray label */
  function debug(g) {
    for (var x = 0; x < R.W; x += 8) g.rect(x, 0, 1, R.H, g.MID);
    for (var y = 0; y < R.H; y += 8) g.rect(0, y, R.W, 1, g.MID);
    g.frame(R.header.x, R.header.y, R.header.w, R.header.h, g.INK);
    g.frame(R.body.x, R.body.y, R.body.w, R.body.h, g.INK);
    g.frame(R.action.x, R.action.y, R.action.w, R.action.h, g.INK);
    text(g, "H", 8, 4, { color: g.INK });
    text(g, "B", 8, 32, { color: g.INK });
    text(g, "A", 8, 194, { color: g.INK });
    text(g, "F", 8, 224, { color: g.INK });
  }

  return {
    R: R, debugOn: false,
    ellipsis: ellipsis, text: text, right: right,
    header: header, footer: footer, panel: panel, label: label, value: value,
    columns: columns, bar: bar, list: list, orderTag: orderTag,
    actionBar: actionBar, toast: toast, help: help, debug: debug,
    window: function (g, x, y, w, h, opts) { g.window(x, y, w, h, opts || {}); },
    hearts: function (g, x, y, n, max) { for (var i = 0; i < (max || 5); i++) ART.heart(g, x + i * 9, y, i < n); },
    stars: function (g, x, y, n) { for (var i = 0; i < 5; i++) ART.star(g, x + i * 8, y, i < n ? g.INK : g.MID); },
    money: function (g, x, y, n) { ART.coin(g, x, y); text(g, String(n), x + 10, y - 2, { fit: 60 }); },
    arrow: function (g, x, y, color) { g.arrow(x, y, "right", color == null ? g.INK : color); }
  };
})();
