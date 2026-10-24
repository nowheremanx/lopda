/* LuckyWay 神位罗盘: hold the handheld flat like a luopan on an almanac page; the 天盘
   turns under fixed cross threads and shows the five lucky gods of the day. Everything is
   four-tone lo-game drawing, so the text stays upright while the dial positions turn.
   MIT License. Copyright (c) 2026 Haowei Wu. */

var game = LoGame.create({ width: 216, height: 240, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

var W = game.width, CX = W / 2, CY = 106;      /* 216 x 240; the luopan sits on an 180 x 180 plate */
var PLATE = 180, PLATE_X = (W - PLATE) / 2, PLATE_Y = 16;
var DIAL_OUT = 88, DIAL_IN = 86, TRI_IN = 72, TICK_IN = 68, LABEL_R = 58, WELL = 22;
var PANEL_X = 8, PANEL_Y = 32, PANEL_W = 200, PANEL_H = 163;

/* English display data only: Chinese dates use 月/日, so these names are not passed through T(). */
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var DIRS = [
  T({ zh: "北", en: "N" }), T({ zh: "东北", en: "NE" }), T({ zh: "东", en: "E" }), T({ zh: "东南", en: "SE" }),
  T({ zh: "南", en: "S" }), T({ zh: "西南", en: "SW" }), T({ zh: "西", en: "W" }), T({ zh: "西北", en: "NW" })
];
/* The five names stay Chinese in both languages, like the 干支: they are the almanac's own
   terms, and the A panel explains each in English. The dial uses one-character seals. */
var GODS = [
  { short: T({ zh: "喜", en: "喜" }), name: T({ zh: "喜神", en: "喜神" }), bring: T({ zh: "喜事、人缘", en: "joy, friends" }) },
  { short: T({ zh: "财", en: "财" }), name: T({ zh: "财神", en: "财神" }), bring: T({ zh: "财路、生意", en: "money, trade" }) },
  { short: T({ zh: "福", en: "福" }), name: T({ zh: "福神", en: "福神" }), bring: T({ zh: "平安、福气", en: "peace, luck" }) },
  { short: T({ zh: "阳", en: "阳" }), name: T({ zh: "阳贵", en: "阳贵" }), bring: T({ zh: "贵人相助（白天）", en: "a helper, by day" }) },
  { short: T({ zh: "阴", en: "阴" }), name: T({ zh: "阴贵", en: "阴贵" }), bring: T({ zh: "贵人相助（夜里）", en: "a helper, by night" }) }
];

/* Seal positions [dial angle, radius] for stems 甲..癸, in xi/cai/fu/yang/yin order.
   The 15 x 15 frames are precomputed to keep every pair of seals, and every seal and
   direction label, more than a frame apart at all 32 headings; crowded directions fan. */
var SEAL_LAYOUT = [
  [[48.4, 33.0], [80.4, 40.0], [345.6, 40.0], [224.5, 33.4], [16.4, 40.0]],
  [[315.5, 33.0], [44.4, 33.0], [209.5, 37.5], [242.0, 38.3], [0.2, 35.0]],
  [[235.8, 35.3], [202.8, 40.3], [334.7, 40.4], [269.4, 38.0], [302.9, 35.2]],
  [[180.2, 33.3], [225.2, 33.0], [135.6, 33.9], [315.1, 33.7], [270.1, 33.9]],
  [[135.8, 33.7], [357.6, 35.9], [64.9, 40.1], [32.2, 35.9], [226.5, 33.3]],
  [[57.9, 34.0], [318.0, 33.9], [353.5, 36.8], [25.4, 40.0], [225.2, 32.9]],
  [[315.4, 33.5], [90.4, 33.9], [225.6, 33.0], [179.4, 33.8], [45.1, 33.9]],
  [[225.0, 33.0], [90.3, 33.6], [315.2, 33.2], [45.2, 33.0], [180.4, 34.2]],
  [[173.8, 39.0], [206.1, 39.5], [140.6, 33.6], [77.2, 40.7], [107.8, 40.9]],
  [[118.0, 38.1], [184.4, 37.0], [44.4, 32.7], [150.9, 37.5], [84.8, 37.2]]
];

/* 后天八卦, bottom line first: 北 坎, 东北 艮, 东 震, 东南 巽, 南 离, 西南 坤, 西 兑, 西北 乾. */
var TRIGRAMS = [
  ["yin", "yang", "yin"], ["yin", "yin", "yang"], ["yang", "yin", "yin"], ["yin", "yang", "yang"],
  ["yang", "yin", "yang"], ["yin", "yin", "yin"], ["yang", "yang", "yin"], ["yang", "yang", "yang"]
];

/* Wood grain, fixed once: [y, x0, x1] in screen coordinates. The dial covers the middle. */
var GRAIN = [
  [26, 22, 194], [44, 22, 82], [44, 92, 194], [62, 22, 194], [80, 22, 64], [80, 74, 194],
  [118, 22, 194], [136, 22, 90], [136, 100, 194], [154, 22, 194], [174, 22, 70], [174, 80, 194]
];
var NO_COMPASS = T({ zh: "没有指南针：用左右键转", en: "No compass: use Left/Right" });
var MOTION_OFF = T({ zh: "感应未允许：用左右键转", en: "Motion off: use Left/Right" });
var HINT = T({ zh: "旧历书上的说法，图个吉利", en: "Old almanac lore, just for luck." });
var KEY_LINE = T({ zh: "A 说明 · 上下换日 · START 今天", en: "A info · ↑↓ day · START today" });
var PANEL_TITLE = T({ zh: "这一天的五位", en: "That day's five" });
var PANEL_HINT = T({ zh: "平放手机；方向不对就把手机画几个 8 字", en: "Hold it flat; if it is off, wave the phone in a figure 8." });
var PANEL_CLOSE = T({ zh: "A/B 关闭 · 上下换日", en: "A/B close · ↑↓ day" });

/* ---- what the screen is showing ---- */
var offset = 0;                 /* days from today; today is derived every frame so midnight needs no timer */
var panel = false, lastFaced;   /* undefined until the first real sector is known */

function shownDate() {
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12, 0, 0, 0);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}
function pillarOf(dt) { return LUCK.pillar(dt.y, dt.m, dt.d); }
function dirName(deg) { return DIRS[((deg / 45) % 8 + 8) % 8]; }
function godList(stem, deg) {
  var gd = LUCK.gods(stem), out = [];
  if (gd.xi === deg) out.push(0);
  if (gd.cai === deg) out.push(1);
  if (gd.fu === deg) out.push(2);
  if (gd.yang === deg) out.push(3);
  if (gd.yin === deg) out.push(4);
  return out;
}
function headerText(dt, p) {
  var text = T({
    zh: dt.m + "月" + dt.d + "日 " + p.name + "日",
    en: MONTHS[dt.m - 1] + " " + dt.d + " · day " + p.name
  });
  if (offset < 0) {
    text += T({ zh: offset === -1 ? " · 昨" : " · 前" + (-offset), en: offset === -1 ? " · prev" : " · prev " + (-offset) });
  } else if (offset > 0) {
    text += T({ zh: offset === 1 ? " · 明" : " · 后" + offset, en: offset === 1 ? " · next" : " · next " + offset });
  }
  return text;
}

/* ---- the compass: PAD.motion + PAD.on("tilt") ----
   The heading is the way the handheld faces, in 32 steps of 11.25 degrees (SPEC.md 6.4);
   null means this phone has no magnetometer, so keys take over. Left/Right turn the dial
   by 45 degrees, a full sector, so the bottom line always names a whole direction.
   The wanted flag is the same pattern as tilt-maze: a start() that answers after a pause
   must stop instead of leaving the sensor on. */
var HAS_MOTION = typeof PAD !== "undefined" && !!PAD.motion;
var wanted = false, wasWanted = false, live = false, denied = false, startSeq = 0;
var heading = null, lastHeading = null, compass = false, keyHeading = 0;

function sfx(name) { if (typeof PAD !== "undefined" && PAD.sfx) PAD.sfx(name); }
function aimDial(deg) {
  /* turn the short way round when the heading crosses 0/360 */
  var target = deg + Math.round((dialTo - deg) / 360) * 360;
  if (target === dialTo) return;
  dialFrom = dialAngle;
  dialTo = target;
  dialT = 0;
}
function onTilt(t) {
  if (!wanted) return;
  var h = t && typeof t.heading === "number" ? t.heading : null;
  if (h === null) { heading = null; lastHeading = null; return; }
  if (lastHeading === null) { heading = h; lastHeading = h; aimDial(-h); return; }   /* first reading: no tick */
  if (h !== lastHeading) { lastHeading = h; sfx("tick"); aimDial(-h); }
  heading = h;
}
function sensorStart() {
  if (!HAS_MOTION) return;
  wanted = true;
  var seq = ++startSeq;
  PAD.motion.start().then(function (r) {
    /* A second start() makes the runtime cancel the first dialog and answer it "denied".
       Ignore that stale answer, and never stop the sensor: a newer request owns it now. */
    if (seq !== startSeq) return;
    if (!wanted) { PAD.motion.stop(); return; }      /* paused while the player was asked */
    live = r === "on";
    denied = r === "denied";
    if (!live) {
      wanted = false;
      heading = null; lastHeading = null; keyHeading = 0;
      aimDial(0);
    }
  }, function () {
    if (seq !== startSeq) return;
    if (!wanted) return;
    wanted = false; live = false; denied = true;
    heading = null; lastHeading = null; keyHeading = 0;
    aimDial(0);
  });
}
function sensorPause() {
  if (wanted) wasWanted = true;
  wanted = false;
  live = false; heading = null; lastHeading = null;
  if (HAS_MOTION) PAD.motion.stop();
}
function sensorResume() {
  if (HAS_MOTION && (wasWanted || wanted)) { wasWanted = false; sensorStart(); }
}
if (HAS_MOTION) {
  PAD.on("tilt", onTilt);
  /* hiding the app (HOME, lock, another program) must stop the sensor; pagehide is the
     last way out, and pageshow restarts it for a bfcache return */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) sensorPause();
    else sensorResume();
  });
  window.addEventListener("pagehide", sensorPause);
  /* pageshow also fires on the first load; only a bfcache return needs a resume */
  window.addEventListener("pageshow", function (e) { if (e && e.persisted) sensorResume(); });
}

/* ---- easing: each 11.25-degree step glides in about 150 ms, with a tick ---- */
var dialAngle = 0, dialFrom = 0, dialTo = 0, dialT = 1;

function fallbackLine() {
  if (compass) return "";
  if (HAS_MOTION && wanted && !live && !denied) return "";   /* the dialog is still up */
  return denied ? MOTION_OFF : NO_COMPASS;
}
function inDial(x, y) { var dx = x - CX, dy = y - CY; return dx * dx + dy * dy <= (DIAL_OUT + 4) * (DIAL_OUT + 4); }
function openPanel() { panel = true; sfx("tap"); }
function closePanel() { panel = false; sfx("tap"); }

/* ---- keys ---- */
function update(dt) {
  var dtToday = shownDate(), stem = pillarOf(dtToday).stem;

  var nowCompass = live && heading !== null;
  if (nowCompass !== compass) {
    compass = nowCompass;
    if (compass) aimDial(-heading);
    else { keyHeading = 0; aimDial(0); }
  }

  var p = game.pointer, acted = false;
  if (p.pressed) {
    if (panel) closePanel();
    else if (inDial(p.x, p.y)) openPanel();
  }
  if (game.pressed("a")) {
    if (panel) closePanel(); else openPanel();
    acted = true;
  } else if (game.pressed("b")) {
    if (panel) closePanel();
    else if (offset !== 0) { offset = 0; sfx("tap"); }
    acted = true;
  } else if (game.pressed("start")) {
    if (panel) closePanel();
    if (offset !== 0) { offset = 0; sfx("ok"); }
    acted = true;
  }
  if (!acted) {
    if (game.pressed("up")) { offset--; sfx("move"); }        /* yesterday */
    if (game.pressed("down")) { offset++; sfx("move"); }      /* tomorrow */
    if (!panel && !compass) {
      if (game.pressed("left")) {
        keyHeading = (keyHeading + 315) % 360; aimDial(-keyHeading); sfx("tick");
        if (lastFaced === undefined) lastFaced = LUCK.sector(keyHeading);
      }
      if (game.pressed("right")) {
        keyHeading = (keyHeading + 45) % 360; aimDial(-keyHeading); sfx("tick");
        if (lastFaced === undefined) lastFaced = LUCK.sector(keyHeading);
      }
    }
  }

  /* one coin when the sector under the needle gains a god; the first sector is silent.
     While a compass reading may still arrive, wait for it instead of recording the key fallback north. */
  var faced = LUCK.sector(compass ? heading : keyHeading);
  if (lastFaced === undefined) {
    if (compass || !HAS_MOTION || !wanted) lastFaced = faced;
  } else if (faced !== lastFaced) {
    lastFaced = faced;
    if (faced !== null && godList(stem, faced).length) sfx("coin");
  }

  if (dialT < 1) {
    dialT = Math.min(1, dialT + dt / 0.15);
    var k = 1 - (1 - dialT) * (1 - dialT);
    dialAngle = dialFrom + (dialTo - dialFrom) * k;
  }
}

/* ---- drawing: a luopan lying on an almanac page. All positions are absolute. ---- */
var sealBoxes = [], labelBoxes = [];

function polar(deg, r) {
  var a = (deg + dialAngle) * Math.PI / 180;
  return { x: CX + Math.sin(a) * r, y: CY - Math.cos(a) * r };
}
function drawHeader(g, text) {
  g.rect(0, 0, W, 16, g.INK);
  g.text(text, CX, 1, { align: "center", color: g.PAPER });
}
function bolt(g, x, y) { g.rect(x, y, 3, 3, g.INK); g.pixel(x + 1, y + 1, g.PAPER); }
function drawPlate(g) {
  /* the 地盘: a wooden square with a grain of fixed lines and four corner bolts */
  g.rect(PLATE_X, PLATE_Y, PLATE, PLATE, g.MID);
  g.frame(PLATE_X, PLATE_Y, PLATE, PLATE, g.INK);
  g.frame(PLATE_X + 2, PLATE_Y + 2, PLATE - 4, PLATE - 4, g.INK);
  for (var i = 0; i < GRAIN.length; i++) {
    var gr = GRAIN[i];
    g.line(gr[1], gr[0], gr[2], gr[0], g.DARK);
  }
  bolt(g, PLATE_X + 5, PLATE_Y + 5);
  bolt(g, PLATE_X + PLATE - 8, PLATE_Y + 5);
  bolt(g, PLATE_X + 5, PLATE_Y + PLATE - 8);
  bolt(g, PLATE_X + PLATE - 8, PLATE_Y + PLATE - 8);
}
function drawTrigramBand(g) {
  /* a dark dithered ring between the outer rim (86) and the trigram field (72) */
  for (var yy = -DIAL_IN; yy <= DIAL_IN; yy++) {
    var y = CY + yy, xo = Math.floor(Math.sqrt(DIAL_IN * DIAL_IN - yy * yy));
    if (Math.abs(yy) < TRI_IN) {
      var xi = Math.floor(Math.sqrt(TRI_IN * TRI_IN - yy * yy));
      g.dither(CX - xo, y, xo - xi, 1, g.DARK, 2);
      g.dither(CX + xi, y, xo - xi, 1, g.DARK, 2);
    } else {
      g.dither(CX - xo, y, 2 * xo + 1, 1, g.DARK, 2);
    }
  }
}
function drawTrigrams(g) {
  var radii = [76, 78.5, 81];   /* bottom line of the trigram first, nearest the centre */
  for (var i = 0; i < 8; i++) {
    var a = (i * 45 + dialAngle) * Math.PI / 180;
    var ux = Math.sin(a), uy = -Math.cos(a), tx = Math.cos(a), ty = Math.sin(a);
    for (var j = 0; j < 3; j++) {
      var r = radii[j], px = CX + ux * r, py = CY + uy * r;
      if (TRIGRAMS[i][j] === "yang") {
        g.line(px - tx * 8, py - ty * 8, px + tx * 8, py + ty * 8, g.INK);
      } else {
        g.line(px - tx * 8, py - ty * 8, px - tx, py - ty, g.INK);
        g.line(px + tx, py + ty, px + tx * 8, py + ty * 8, g.INK);
      }
    }
  }
}
function drawTicks(g) {
  g.circle(CX, CY, TRI_IN, g.INK, false);
  for (var i = 0; i < 24; i++) {
    var a = i * 15 + dialAngle, r1 = i % 3 === 0 ? TICK_IN - 2 : TICK_IN;
    var p0 = polar(a, TRI_IN), p1 = polar(a, r1);
    g.line(p0.x, p0.y, p1.x, p1.y, g.INK);
  }
}
function drawLabels(g) {
  labelBoxes = [];
  for (var i = 0; i < 8; i++) {
    var p = polar(i * 45, LABEL_R), s = DIRS[i], tw = g.measure(s);
    if (i === 0) {
      /* 北 stands out like the red 子 on a real luopan */
      g.rect(p.x - 8, p.y - 7, 16, 15, g.INK);
      g.text(s, p.x, p.y - 6, { align: "center", color: g.PAPER });
      labelBoxes.push({ x0: p.x - 8, y0: p.y - 7, x1: p.x + 8, y1: p.y + 7 });
    } else {
      g.text(s, p.x, p.y - 6, { align: "center", color: g.INK });
      labelBoxes.push({ x0: p.x - tw / 2 - 1, y0: p.y - 7, x1: p.x + tw / 2 + 1, y1: p.y + 7 });
    }
  }
}
function drawSeals(g, stem) {
  /* the gods as seals on the 天盘; a faced seal reverses to ink with paper text */
  sealBoxes = [];
  var gd = LUCK.gods(stem), dirs = [gd.xi, gd.cai, gd.fu, gd.yang, gd.yin];
  var faced = LUCK.sector(compass ? heading : keyHeading);
  for (var i = 0; i < 5; i++) {
    var lay = SEAL_LAYOUT[stem][i], p = polar(lay[0], lay[1]);
    var x = p.x, y = p.y, s = GODS[i].short;
    if (faced === dirs[i]) {
      g.rect(x - 7, y - 7, 15, 15, g.INK);
      g.text(s, x, y - 6, { align: "center", color: g.PAPER });
    } else {
      g.frame(x - 7, y - 7, 15, 15, g.INK);
      g.text(s, x, y - 6, { align: "center", color: g.INK });
    }
    sealBoxes.push({ x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 });
  }
}
function drawWell(g) {
  /* the 天池: dark well, a paper ring, and the magnetic needle pointing at real north */
  g.circle(CX, CY, WELL, g.INK, true);
  g.circle(CX, CY, WELL - 1, g.PAPER, true);
  g.circle(CX, CY, WELL - 2, g.DARK, true);
  var a = dialAngle * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a), tx = Math.cos(a), ty = Math.sin(a);
  var L = 16, hw = 2.5;
  var n = { x: CX + ux * L, y: CY + uy * L }, s = { x: CX - ux * L, y: CY - uy * L };
  var e = { x: CX + tx * hw, y: CY + ty * hw }, w = { x: CX - tx * hw, y: CY - ty * hw };
  g.line(n.x, n.y, e.x, e.y, g.PAPER); g.line(e.x, e.y, s.x, s.y, g.PAPER);
  g.line(s.x, s.y, w.x, w.y, g.PAPER); g.line(w.x, w.y, n.x, n.y, g.PAPER);
  for (var t = 0; t <= L; t += 2) {   /* fill the north half; the south half stays an outline */
    var ww = hw * t / L, px = CX + ux * t, py = CY + uy * t;
    g.line(px - tx * ww, py - ty * ww, px + tx * ww, py + ty * ww, g.PAPER);
  }
  g.rect(CX - 1, CY - 1, 2, 2, g.INK);
}
function drawDial(g, stem) {
  /* the 天盘: rim, trigram band, ticks, labels, seals and the well all turn with the heading */
  g.circle(CX, CY, DIAL_OUT, g.INK, true);
  g.circle(CX, CY, DIAL_IN, g.PAPER, true);
  drawTrigramBand(g);
  drawTrigrams(g);
  g.circle(CX, CY, TRI_IN, g.INK, false);
  drawTicks(g);
  drawLabels(g);
  drawSeals(g, stem);
  drawWell(g);
}
function blocked(x, y) {
  var i, b;
  for (i = 0; i < sealBoxes.length; i++) {
    b = sealBoxes[i];
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  }
  for (i = 0; i < labelBoxes.length; i++) {
    b = labelBoxes[i];
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}
function drawThreads(g) {
  /* the 天心十字线: fixed cross threads mark the facing; the needle marks real north */
  var x, y;
  for (y = PLATE_Y; y < PLATE_Y + PLATE; y++) {
    if (Math.abs(y - CY) < WELL + 2 || blocked(CX, y)) continue;
    g.pixel(CX, y, g.INK);
  }
  for (x = PLATE_X; x < PLATE_X + PLATE; x++) {
    if (Math.abs(x - CX) < WELL + 2 || blocked(x, CY)) continue;
    g.pixel(x, CY, g.INK);
  }
}
function drawFaceMark(g) {
  /* the fixed mark above the dial: up is the way the player faces.
     A paper tab breaks the ink rim so the small triangle can be seen. */
  g.rect(CX - 5, PLATE_Y, 10, 8, g.PAPER);
  g.line(CX - 4, PLATE_Y + 1, CX + 4, PLATE_Y + 1, g.INK);
  g.line(CX - 4, PLATE_Y + 1, CX, PLATE_Y + 6, g.INK);
  g.line(CX + 4, PLATE_Y + 1, CX, PLATE_Y + 6, g.INK);
}
function drawFallback(g) {
  var why = fallbackLine();
  if (!why) return;
  var tw = g.measure(why), x = Math.round(CX - tw / 2 - 4), y = PLATE_Y, w = tw + 8, h = 15;
  g.rect(x, y, w, h, g.PAPER);
  g.frame(x, y, w, h, g.INK);
  g.text(why, CX, y + 1, { align: "center", color: g.DARK });
}
function drawFaced(g, stem) {
  var deg = LUCK.sector(compass ? heading : keyHeading);
  if (deg === null) return;
  var list = godList(stem, deg), line = T({ zh: "面向 ", en: "Facing " }) + dirName(deg);
  for (var i = 0; i < list.length; i++) line += (i ? " " : " · ") + GODS[list[i]].name;
  g.text(line, CX, 198, { align: "center", color: g.INK });
}
function drawPanel(g, stem) {
  g.window(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
  g.text(PANEL_TITLE, CX, PANEL_Y + 10, { align: "center", color: g.INK });
  var gd = LUCK.gods(stem), rows = [gd.xi, gd.cai, gd.fu, gd.yang, gd.yin];
  for (var i = 0; i < 5; i++) {
    g.text(GODS[i].name + " " + dirName(rows[i]) + " · " + GODS[i].bring, 18, 60 + i * 15, { color: g.INK });
  }
  var lines = g.wrap(PANEL_HINT, 180);
  for (i = 0; i < lines.length; i++) g.text(lines[i], 18, 136 + i * 13, { color: g.DARK });
  g.text(PANEL_CLOSE, CX, 168, { align: "center", color: g.DARK });
}

game.scene("compass", {
  update: update,
  draw: function (g) {
    var dt = shownDate(), p = pillarOf(dt);
    g.clear(g.PAPER);
    drawHeader(g, headerText(dt, p));
    drawPlate(g);
    drawDial(g, p.stem);
    drawThreads(g);
    drawFaceMark(g);
    drawFallback(g);
    drawFaced(g, p.stem);
    g.text(KEY_LINE, CX, 212, { align: "center", color: g.DARK });
    g.text(HINT, CX, 226, { align: "center", color: g.DARK });
    if (panel) drawPanel(g, p.stem);
  }
});

game.start("compass");
sensorStart();
