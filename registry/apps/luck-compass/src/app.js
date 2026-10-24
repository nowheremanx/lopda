/* LuckyWay 神位罗盘: hold the handheld flat like a compass; the dial turns under a fixed
   needle and shows today's 喜神, 财神 and 福神. Everything is drawn on lo-game's four-tone
   screen, so text stays upright while only the labels' positions turn around the dial.
   MIT License. Copyright (c) 2026 Haowei Wu. */

var game = LoGame.create({ width: 216, height: 240, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

var W = game.width, CX = W / 2, CY = 120, RING = 84;
var PANEL_X = 14, PANEL_Y = 34, PANEL_W = 188, PANEL_H = 170;

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var DIRS = [
  T({ zh: "北", en: "N" }), T({ zh: "东北", en: "NE" }), T({ zh: "东", en: "E" }), T({ zh: "东南", en: "SE" }),
  T({ zh: "南", en: "S" }), T({ zh: "西南", en: "SW" }), T({ zh: "西", en: "W" }), T({ zh: "西北", en: "NW" })
];
/* the three names are the almanac's own terms; English gets a romanisation, the meaning
   goes in the A panel */
var GODS = [
  { name: T({ zh: "喜神", en: "Xishen" }), bring: T({ zh: "喜事、人缘", en: "joy, friends" }) },
  { name: T({ zh: "财神", en: "Caishen" }), bring: T({ zh: "财路、生意", en: "money, trade" }) },
  { name: T({ zh: "福神", en: "Fushen" }), bring: T({ zh: "平安、福气", en: "peace, luck" }) }
];
var NO_COMPASS = T({ zh: "没有指南针：用左右键转", en: "No compass: use Left/Right" });
var MOTION_OFF = T({ zh: "感应未允许：用左右键转", en: "Motion off: use Left/Right" });
var HINT = T({ zh: "旧历书上的说法，图个吉利", en: "An old almanac custom, just for luck." });
var PANEL_TITLE = T({ zh: "这一天的三位", en: "That day's three" });
var PANEL_HINT = T({ zh: "平放手机；方向不对就把手机画几个 8 字", en: "Hold it flat; if it is off, wave the phone in a figure 8." });
var PANEL_CLOSE = T({ zh: "A/B 关闭 · 上下换日", en: "A/B close · ↑↓ day" });

/* ---- what the screen is showing ---- */
var offset = 0;                 /* days from today; today is derived every frame so midnight needs no timer */
var panel = false, lastFaced = 0;

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
var wanted = false, wasWanted = false, live = false, denied = false;
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
  if (h !== lastHeading) { lastHeading = h; sfx("tick"); aimDial(-h); }
  heading = h;
}
function sensorStart() {
  if (!HAS_MOTION) return;
  wanted = true;
  PAD.motion.start().then(function (r) {
    if (!wanted) { PAD.motion.stop(); return; }      /* paused while the player was asked */
    live = r === "on";
    denied = r === "denied";
    if (!live) {
      wanted = false;
      heading = null; lastHeading = null; keyHeading = 0;
      aimDial(0);
    }
  }, function () {
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
  window.addEventListener("pageshow", sensorResume);
}

/* ---- easing: each 11.25-degree step glides in about 150 ms, with a tick ---- */
var dialAngle = 0, dialFrom = 0, dialTo = 0, dialT = 1;

function fallbackLine() {
  if (compass) return "";
  if (HAS_MOTION && wanted && !live && !denied) return "";   /* the dialog is still up */
  return denied ? MOTION_OFF : NO_COMPASS;
}
function inDial(x, y) { var dx = x - CX, dy = y - CY; return dx * dx + dy * dy <= (RING + 4) * (RING + 4); }
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
      if (game.pressed("left")) { keyHeading = (keyHeading + 315) % 360; aimDial(-keyHeading); sfx("tick"); }
      if (game.pressed("right")) { keyHeading = (keyHeading + 45) % 360; aimDial(-keyHeading); sfx("tick"); }
    }
  }

  /* one coin when the sector under the needle gains a god; not when the app opens */
  var faced = LUCK.sector(compass ? heading : keyHeading);
  if (faced !== lastFaced) {
    lastFaced = faced;
    if (faced !== null && godList(stem, faced).length) sfx("coin");
  }

  if (dialT < 1) {
    dialT = Math.min(1, dialT + dt / 0.15);
    var k = 1 - (1 - dialT) * (1 - dialT);
    dialAngle = dialFrom + (dialTo - dialFrom) * k;
  }
}

/* ---- drawing ---- */
function polar(deg, r) {
  var a = (deg + dialAngle) * Math.PI / 180;
  return { x: CX + Math.sin(a) * r, y: CY - Math.cos(a) * r };
}
function drawDial(g, stem) {
  g.circle(CX, CY, RING, g.INK, false);
  for (var i = 0; i < 16; i++) {
    var a = i * 22.5, p0 = polar(a, RING), p1 = polar(a, 80);
    g.line(p0.x, p0.y, p1.x, p1.y, i % 2 ? g.MID : g.INK);
  }
  for (i = 0; i < 8; i++) {
    var pos = polar(i * 45, 65);
    g.text(DIRS[i], pos.x, pos.y - 6, { align: "center", color: g.INK });
  }

  var faced = LUCK.sector(compass ? heading : keyHeading);
  for (i = 0; i < 8; i++) {
    var deg = i * 45, list = godList(stem, deg);
    if (!list.length) continue;
    /* two gods on one direction stack inward; the table never puts three there */
    var radii = list.length === 1 ? [33] : list.length === 2 ? [17, 39] : [15, 27, 39];
    for (var j = 0; j < list.length; j++) {
      var gp = polar(deg, radii[j]);
      var name = GODS[list[j]].name, tw = g.measure(name), ty = gp.y - 6;
      if (faced === deg) {
        g.rect(gp.x - tw / 2 - 2, ty - 1, tw + 4, 14, g.INK);
        g.text(name, gp.x, ty, { align: "center", color: g.PAPER });
      } else {
        g.text(name, gp.x, ty, { align: "center", color: g.INK });
      }
    }
  }

  /* the fixed needle: straight up is the way the player faces */
  g.line(CX, CY + 6, CX, CY - 8, g.INK);
  g.line(CX, CY - 8, CX - 3, CY - 4, g.INK);
  g.line(CX, CY - 8, CX + 3, CY - 4, g.INK);
  g.circle(CX, CY, 1, g.INK, true);
}
function drawFaced(g, stem) {
  var deg = LUCK.sector(compass ? heading : keyHeading);
  if (deg === null) return;
  var list = godList(stem, deg), line = dirName(deg);
  for (var i = 0; i < list.length; i++) line += (i ? " " : " · ") + GODS[list[i]].name;
  g.text(line, CX, 207, { align: "center", color: g.INK });
}
function drawPanel(g, stem) {
  g.window(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
  g.text(PANEL_TITLE, CX, 52, { align: "center", color: g.INK });
  var gd = LUCK.gods(stem), rows = [gd.xi, gd.cai, gd.fu];
  for (var i = 0; i < 3; i++) {
    g.text(GODS[i].name + " " + dirName(rows[i]) + " · " + GODS[i].bring, 24, 70 + i * 18, { color: g.INK });
  }
  var lines = g.wrap(PANEL_HINT, 176);
  for (i = 0; i < lines.length; i++) g.text(lines[i], 24, 128 + i * 13, { color: g.DARK });
  g.text(PANEL_CLOSE, CX, 172, { align: "center", color: g.DARK });
}

game.scene("compass", {
  update: update,
  draw: function (g) {
    var dt = shownDate(), p = pillarOf(dt);
    g.clear(g.PAPER);
    g.text(headerText(dt, p), CX, 3, { align: "center", color: g.INK });
    var why = fallbackLine();
    if (why) g.text(why, CX, 19, { align: "center", color: g.DARK });
    drawDial(g, p.stem);
    drawFaced(g, p.stem);
    g.text(HINT, CX, 224, { align: "center", color: g.DARK });
    if (panel) drawPanel(g, p.stem);
  }
});

game.start("compass");
sensorStart();
