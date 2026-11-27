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
var V_CX = 32, V_CY = 176;                     /* bubble vial on the free 地盘 corner */
var LEVEL = 2 / 32, BUBBLE_MAX = 5;            /* bubble edge reaches the paper at 0.25 */
var BUBBLE_SCALE = BUBBLE_MAX / 0.25;

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
var LAY_FLAT = T({ zh: "放平一点，让气泡回到中间", en: "Lay it flat: bubble to the middle" });
var HINT = T({ zh: "旧历书上的说法，图个吉利", en: "Old almanac lore, just for luck." });
var KEY_LINE = T({ zh: "A 说明 · 上下换日 · START 今天", en: "A info · ↑↓ day · START today" });
/* Without a compass Left/Right turn the dial, so the key line has to say so; the full Chinese
   line is too wide for 216 px, and the English even more so, hence the pairs run together. */
var KEY_LINE_TURN = T({ zh: "←→转 A说明 ↑↓换日 START今天", en: "←→turn A info ↑↓day START today" });
var PANEL_TITLE = T({ zh: "这一天的五位", en: "The day's five gods" });
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
    en: MONTHS[dt.m - 1] + " " + dt.d + " · " + p.name + "日"
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
var section = "counter", motionOwner = null, pendingMotion = false;
/* The heading is only right when the phone lies flat; flat is absolute, unlike y,
   which is relative to start()/zero(). */
var flat = null, flatBadT = 0, bubbleX = 0, bubbleY = 0;

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
  if (!wanted || motionOwner !== "compass" || section !== "compass") return;
  var f = t && t.flat;
  if (f && typeof f === "object" && typeof f.x === "number" && typeof f.y === "number" &&
      isFinite(f.x) && isFinite(f.y)) flat = { x: f.x, y: f.y };
  else flat = null;                       /* older runtime: no level at all */
  var h = t && typeof t.heading === "number" ? t.heading : null;
  if (h === null) { heading = null; lastHeading = null; return; }
  if (lastHeading === null) { heading = h; lastHeading = h; aimDial(-h); return; }   /* first reading: no tick */
  if (h !== lastHeading) { lastHeading = h; sfx("tick"); aimDial(-h); }
  heading = h;
}
function pageVisible() { return typeof document.hidden === "undefined" || !document.hidden; }
function wantedOwner() {
  if (section === "compass") return "compass";
  if (section === "fortune" && slipState.slip === null && !slipState.animating) return "fortune";
  if (section === "hexagram" && guaState.lines.length < 6) return "hexagram";
  return null;
}
function clearMotionReadings() {
  live = false; motionOwner = null; heading = null; lastHeading = null; flatBadT = 0; compass = false;
}
function motionPause(remember) {
  if (remember && (wanted || pendingMotion)) wasWanted = wantedOwner() || motionOwner || wasWanted;
  wanted = false;
  clearMotionReadings();
  if (HAS_MOTION && PAD.motion && typeof PAD.motion.stop === "function") PAD.motion.stop();
}
function sensorStart(owner) {
  if (!HAS_MOTION || !PAD.motion || typeof PAD.motion.start !== "function") return;
  wanted = true;
  motionOwner = owner;
  if (live) return;
  if (pendingMotion) return;
  pendingMotion = true;
  var seq = ++startSeq;
  var result;
  try { result = PAD.motion.start(); }
  catch (e) { result = Promise.reject(e); }
  Promise.resolve(result).then(function (r) {
    if (seq !== startSeq) return;
    pendingMotion = false;
    if (!wanted || !pageVisible() || wantedOwner() !== motionOwner) {
      motionPause(false);
      syncMotion();
      return;
    }
    live = r === "on";
    denied = r === "denied";
    if (!live) {
      wanted = false;
      motionOwner = null;
      heading = null; lastHeading = null; keyHeading = 0;
      aimDial(0);
    }
  }, function () {
    if (seq !== startSeq) return;
    pendingMotion = false;
    if (!wanted) { syncMotion(); return; }
    wanted = false; live = false; denied = true; motionOwner = null;
    heading = null; lastHeading = null; keyHeading = 0;
    aimDial(0);
  });
}
function syncMotion() {
  var owner = pageVisible() ? wantedOwner() : null;
  if (!owner) {
    if (wanted || live) motionPause(false);
    return;
  }
  wasWanted = owner;
  if (!HAS_MOTION) return;
  if (live && motionOwner !== owner) {
    motionPause(false);
    sensorStart(owner);
    return;
  }
  if (live) { wanted = true; motionOwner = owner; return; }
  sensorStart(owner);
}
function sensorResume() {
  var owner = pageVisible() ? wantedOwner() : null;
  if (owner) { wasWanted = owner; sensorStart(owner); }
  else syncMotion();
}
function onShake() {
  if (section === "fortune" && motionOwner === "fortune" && wanted && live &&
      slipState.slip === null && !slipState.animating) drawSlip();
  if (section === "hexagram" && motionOwner === "hexagram" && wanted && live &&
      guaState.lines.length < 6 && !guaState.animating) tossGuaLine();
}
if (typeof PAD !== "undefined" && PAD.on) {
  if (HAS_MOTION) PAD.on("tilt", onTilt);
  if (HAS_MOTION) PAD.on("shake", onShake);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) motionPause(true);
    else sensorResume();
  });
  window.addEventListener("pagehide", function () { motionPause(true); });
  window.addEventListener("pageshow", function (e) {
    if (e && e.persisted) sensorResume();
  });
}

/* ---- easing: each 11.25-degree step glides in about 150 ms, with a tick ---- */
var dialAngle = 0, dialFrom = 0, dialTo = 0, dialT = 1;

/* the dial follows the magnetometer when there is one, and the keys when there is not */
function keyLine() { return compass ? KEY_LINE : KEY_LINE_TURN; }
function fallbackLine() {
  if (compass) return "";
  if (HAS_MOTION && wanted && !live && !denied) return "";   /* the dialog is still up */
  return denied ? MOTION_OFF : NO_COMPASS;
}
function flatLevel() {
  return !!flat && Math.abs(flat.x) <= LEVEL && Math.abs(flat.y) <= LEVEL;
}
function noticeText() {
  var why = fallbackLine();
  if (why) return why;                                      /* no compass wins */
  if (compass && flat && !flatLevel() && flatBadT > 0.5) return LAY_FLAT;
  return "";
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

  flatBadT = compass && flat && !flatLevel() ? flatBadT + dt : 0;
  var tx = 0, ty = 0;
  if (flat) {
    tx = -flat.x * BUBBLE_SCALE;              /* real bubbles run to the high side */
    ty = flat.y * BUBBLE_SCALE;
    var len = Math.sqrt(tx * tx + ty * ty);
    if (len > BUBBLE_MAX) { tx = tx / len * BUBBLE_MAX; ty = ty / len * BUBBLE_MAX; }
  }
  var bk = Math.min(1, dt * 10);              /* about 100 ms */
  bubbleX += (tx - bubbleX) * bk;
  bubbleY += (ty - bubbleY) * bk;

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
function drawVial(g) {
  /* a bubble level on the 地盘: it shows when the heading can be trusted */
  if (!flat) return;
  g.circle(V_CX, V_CY, 8, g.INK, true);
  g.circle(V_CX, V_CY, 7, g.PAPER, true);
  if (flatLevel()) g.circle(V_CX, V_CY, 3, g.INK, true);
  else g.circle(V_CX, V_CY, 3, g.INK, false);
  g.pixel(V_CX - 4, V_CY, g.INK); g.pixel(V_CX + 4, V_CY, g.INK);
  g.pixel(V_CX, V_CY - 4, g.INK); g.pixel(V_CX, V_CY + 4, g.INK);
  var bx = Math.round(V_CX + bubbleX), by = Math.round(V_CY + bubbleY);
  g.circle(bx, by, 2, g.INK, true);
  g.circle(bx, by, 1, g.PAPER, true);
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
function drawNotice(g) {
  var why = noticeText();
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

var slipState = { dateKey: todayKey(), slip: null, written: false, animating: false };
var loadComplete = false, loadFailed = false, slipScroll = 0, appendBusy = false, appendStatus = "";
var REDUCED_MOTION = typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var SECTIONS = [
  { id: "almanac", name: T({ zh: "老黄历", en: "Almanac" }) },
  { id: "fortune", name: T({ zh: "每日一签", en: "Fortune" }) },
  { id: "compass", name: T({ zh: "罗盘", en: "Compass" }) },
  { id: "hexagram", name: T({ zh: "八卦", en: "Hexagram" }) },
  { id: "bazi", name: T({ zh: "八字", en: "Chart" }) }
];
var baziState = { loaded: false, failed: false, saved: null, chart: null, picker: false,
  y: 1990, m: 1, d: 1, hour: null, field: 0 };
var BAZI_HOURS = [
  { label: "早子", en: "Early Rat", hour: 0 }, { label: "丑", en: "Ox", hour: 1 },
  { label: "寅", en: "Tiger", hour: 3 }, { label: "卯", en: "Rabbit", hour: 5 },
  { label: "辰", en: "Dragon", hour: 7 }, { label: "巳", en: "Snake", hour: 9 },
  { label: "午", en: "Horse", hour: 11 }, { label: "未", en: "Goat", hour: 13 },
  { label: "申", en: "Monkey", hour: 15 }, { label: "酉", en: "Rooster", hour: 17 },
  { label: "戌", en: "Dog", hour: 19 }, { label: "亥", en: "Pig", hour: 21 },
  { label: "晚子", en: "Late Rat", hour: 23 }, { label: "不知道", en: "Unknown", hour: null }
];
var counterCursor = 0;
var almanacOffset = 0, almanacScroll = 0, almanacTear = 0, almanacTearDir = 1;
var almanacGodsLine = -1, almanacGodsLineCount = 0, almanacGodsFocused = false;
var almanacRowIndents = [];
var WEEK_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
var WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var ZODIAC_EN = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function todayKey() {
  var d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function prettyDate(dateKey) {
  var p = dateKey.split("-"), m = parseInt(p[1], 10), day = parseInt(p[2], 10);
  var week = new Date(parseInt(p[0], 10), m - 1, day).getDay();
  return game.lang === "en" ? MONTH_EN[m - 1] + " " + day + " · " + WEEK_EN[week] :
    m + "月" + day + "日 · " + WEEK_ZH[week];
}
function syncSlipDate() {
  var key = todayKey();
  if (key === slipState.dateKey) return;
  slipState.dateKey = key;
  slipState.slip = null;
  slipState.written = false;
  slipState.animating = false;
  slipScroll = 0;
  appendStatus = "";
  syncMotion();
}
var guaState = { day: todayKey(), lines: [], loaded: false, failed: false, animating: false };
var guaScroll = 0, guaChart = false, guaPanel = false, guaCursor = 0;
var GUA_ORDER = [2, 7, 1, 0, 5, 6, 3, 4]; /* clockwise from south: 离、坤、兑、乾、坎、艮、震、巽 */
function syncGuaDate() {
  var key = todayKey();
  if (key === guaState.day) return;
  guaState.day = key;
  guaState.lines = [];
  guaState.animating = false;
  guaScroll = 0;
  syncMotion();
}
function saveGua() {
  if (guaState.failed || typeof PAD === "undefined" || typeof PAD.save !== "function") return;
  try { PAD.save("gua", { v: 1, day: guaState.day, lines: guaState.lines.slice() }); } catch (e) {}
}
function readGua() {
  if (typeof PAD === "undefined" || typeof PAD.load !== "function") { guaState.loaded = true; return; }
  var result;
  try { result = PAD.load("gua"); }
  catch (e) { guaState.failed = true; guaState.loaded = true; return; }
  Promise.resolve(result).then(function (d) {
    var valid = d && d.v === 1 && d.day === todayKey() && Array.isArray(d.lines) &&
      d.lines.length >= 1 && d.lines.length <= 6;
    if (valid) for (var i = 0; i < d.lines.length; i++) {
      if (typeof d.lines[i] !== "number" || d.lines[i] < 6 || d.lines[i] > 9 ||
          Math.floor(d.lines[i]) !== d.lines[i]) { valid = false; break; }
    }
    if (valid) { guaState.day = d.day; guaState.lines = d.lines.slice(); }
    guaState.loaded = true;
    syncMotion();
  }, function () {
    guaState.failed = true;
    guaState.loaded = true;
  });
}
function tossGuaLine() {
  syncGuaDate();
  if (!guaState.loaded || guaState.lines.length >= 6 || guaState.animating) return;
  guaState.animating = true;
  syncMotion();
  sfx("tick");
  var span = REDUCED_MOTION ? 0.1 : 0.42;
  if (!REDUCED_MOTION) {
    game.after(0.14, function () { sfx("tick"); });
    game.after(0.28, function () { sfx("tick"); });
  }
  game.after(span, function () {
    guaState.lines.push(YI.castLine(Math.random));
    guaState.animating = false;
    guaScroll = 0;
    saveGua();
    sfx("ok");
    syncMotion();
  });
}
function slipItem() { return SLIPS.DATA[slipState.slip]; }
function slipTitleText() {
  var item = slipItem();
  var label = game.lang === "en" ? "No. " + item.num : "第" + item.num + "签";
  return slipState.dateKey + "  " + label + "  " + item.grade[game.lang] + "\n" +
    item.verse[game.lang].join("\n") + "\n" + item.meaning[game.lang];
}
function saveSlip() {
  if (loadFailed || typeof PAD === "undefined" || typeof PAD.save !== "function") return;
  try {
    PAD.save("slip", { dateKey: slipState.dateKey, slip: slipState.slip, written: slipState.written });
  } catch (e) {}
}
function readSlip() {
  if (typeof PAD === "undefined" || typeof PAD.load !== "function") { loadComplete = true; return; }
  var result;
  try { result = PAD.load("slip"); }
  catch (e) { loadFailed = true; loadComplete = true; return; }
  Promise.resolve(result).then(function (d) {
    if (slipState.slip === null && !slipState.animating && d &&
        d.dateKey === todayKey() && typeof d.slip === "number" &&
        d.slip >= 0 && d.slip < SLIPS.DATA.length && Math.floor(d.slip) === d.slip) {
      slipState.dateKey = d.dateKey;
      slipState.slip = d.slip;
      slipState.written = !!d.written;
    }
    loadComplete = true;
    syncMotion();
  }, function () {
    loadFailed = true;
    loadComplete = true;
  });
}
function drawSlip() {
  syncSlipDate();
  if (!loadComplete || slipState.slip !== null || slipState.animating) return;
  slipState.animating = true;
  syncMotion();
  var span = REDUCED_MOTION ? 0.12 : 0.82;
  var ticks = REDUCED_MOTION ? [0, 0.03, 0.06, 0.09] : [0, 0.21, 0.42, 0.65];
  for (var i = 0; i < ticks.length; i++) {
    game.after(ticks[i], function () { sfx("tick"); });
  }
  game.after(span, function () {
    slipState.slip = SLIPS.slotFor(slipState.dateKey);
    slipState.written = false;
    slipState.animating = false;
    slipScroll = 0;
    appendStatus = "";
    saveSlip();
    sfx("ok");
    syncMotion();
  });
}
function appendSlip() {
  syncSlipDate();
  if (slipState.slip === null || slipState.animating || appendBusy) return;
  if (typeof PAD === "undefined" || !PAD.notes || typeof PAD.notes.append !== "function") return;
  appendBusy = true;
  var title = game.lang === "en" ? "Daily fortune" : "每日一签";
  var result;
  try { result = PAD.notes.append(title, slipTitleText()); }
  catch (e) { result = Promise.reject(e); }
  Promise.resolve(result).then(function (answer) {
    appendBusy = false;
    slipState.written = answer === "saved";
    appendStatus = answer === "saved" ? "saved" : "denied";
    saveSlip();
    if (answer === "saved") sfx("ok");
    else sfx("err");
  }, function () {
    appendBusy = false;
    slipState.written = false;
    appendStatus = "denied";
    saveSlip();
    sfx("err");
  });
}
function openSection(id) {
  if (id !== "counter" && id !== "compass" && id !== "fortune" && id !== "almanac" &&
      id !== "hexagram" && id !== "bazi") return;
  game.go(id, null, { fade: false });
}
function backToCounter() { openSection("counter"); }
function sectionSummary(id) {
  syncSlipDate();
  if (id === "almanac") {
    var today = new Date(), a = ALMANAC.day(today.getFullYear(), today.getMonth() + 1, today.getDate());
    var yi = a.yi, ji = a.ji, zh = game.lang !== "en";
    var full = (zh ? "宜 " : "Do ") + yi.slice(0, 2).join(" ") +
      (zh ? " · 忌 " : " · Avoid ") + ji.slice(0, 2).join(" ");
    if (game.g.measure(full) <= 134) return full;
    var shortLine = (zh ? "宜 " : "Do ") + (yi[0] || "无") +
      (zh ? " · 忌 " : " · Avoid ") + (ji[0] || "无");
    return game.g.measure(shortLine) <= 134 ? shortLine : fitSummary(shortLine, 134);
  }
  if (id === "fortune") {
    if (!loadComplete) return "…";
    if (slipState.slip === null) return T({ zh: "未抽", en: "Not drawn" });
    var item = slipItem();
    return T({ zh: "第 " + item.num + " 签 " + item.grade.zh,
      en: "No. " + item.num + " " + item.grade.en });
  }
  if (id === "hexagram") {
    syncGuaDate();
    if (!guaState.lines.length) return T({ zh: "今日未占", en: "Not cast today" });
    if (guaState.lines.length < 6) return T({ zh: "占卦 " + guaState.lines.length + "/6",
      en: "Casting " + guaState.lines.length + "/6" });
    var hex = YI.primary(guaState.lines);
    return game.lang === "en" ? hex.number + " " + hex.short + " " + hex.name :
      hex.name + " " + hex.short;
  }
  if (id === "bazi") return baziState.chart ?
    T({ zh: "日主 " + baziState.chart.dayMaster, en: "Day master " + baziMasterEnglish(baziState.chart.dayMaster) }) :
    T({ zh: "未填", en: "Not set" });
  /* the counter always speaks of today, whatever day the compass was left on */
  var now = new Date(), p = LUCK.pillar(now.getFullYear(), now.getMonth() + 1, now.getDate()), gods = LUCK.gods(p.stem);
  return GODS[0].name + " " + dirName(gods.xi);
}
function fitSummary(text, max) {
  max = max || 200;
  var value = String(text);
  while (value.length > 1 && game.g.measure(value) > max) value = value.substring(0, value.length - 2) + "…";
  return value;
}
function updateCounter() {
  var p = game.pointer, i;
  if (game.pressed("up")) { counterCursor = (counterCursor + SECTIONS.length - 1) % SECTIONS.length; sfx("move"); }
  if (game.pressed("down")) { counterCursor = (counterCursor + 1) % SECTIONS.length; sfx("move"); }
  if (p.pressed) {
    i = Math.floor((p.y - 43) / 34);
    if (i >= 0 && i < SECTIONS.length) { counterCursor = i; openSection(SECTIONS[i].id); sfx("tap"); return; }
  }
  if (game.pressed("a")) { sfx("tap"); openSection(SECTIONS[counterCursor].id); }
}
function drawCounter(g) {
  g.clear(g.PAPER);
  g.rect(0, 0, W, 38, g.INK);
  g.text(T({ zh: "玄机阁", en: "Oracle" }), CX, 9, { align: "center", color: g.PAPER });
  var entries = SECTIONS.slice(), hexIndex = -1;
  for (var n = 0; n < entries.length; n++) if (entries[n].id === "hexagram") hexIndex = n;
  if (entries.length > 5) {
    var regular = entries.filter(function (entry) { return entry.id !== "hexagram" && entry.id !== "bazi"; });
    var hex = entries.filter(function (entry) { return entry.id === "hexagram"; })[0];
    var bazi = entries.filter(function (entry) { return entry.id === "bazi"; })[0];
    entries = regular.concat(hex ? [hex] : [], bazi ? [bazi] : []);
  } else if (hexIndex >= 0 && entries[entries.length - 1].id !== "bazi" && hexIndex < entries.length - 1) {
    entries.push(entries.splice(hexIndex, 1)[0]);
  }
  for (var i = 0; i < entries.length; i++) {
    var y = 43 + i * 34, summary = fitSummary(sectionSummary(entries[i].id), 134);
    if (i === counterCursor) g.rect(6, y - 2, 204, 31, g.INK);
    g.text(i === counterCursor ? "›" : " ", 8, y + 7, { color: i === counterCursor ? g.PAPER : g.INK });
    g.text(entries[i].name, 21, y + 7, { color: i === counterCursor ? g.PAPER : g.INK });
    g.text(summary, 74, y + 7, { color: i === counterCursor ? g.PAPER : g.INK });
    g.line(8, y + 31, 208, y + 31, g.DARK);
  }
  g.text(T({ zh: "↑↓ 选 · A 进入", en: "↑↓ pick · A open" }), CX, 218,
    { align: "center", color: g.INK });
}

function almanacDate() {
  var now = new Date(), d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + almanacOffset, 12);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), week: d.getDay() };
}
function almanacLunarText(lunar) {
  if (!lunar) return "农历日期不可用";
  var months = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
  var day = lunar.day, days = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十"];
  var dayText;
  if (day <= 10) dayText = days[day - 1];
  else if (day <= 19) dayText = "十" + "一二三四五六七八九".charAt(day - 11);
  else if (day === 20) dayText = "二十";
  else if (day < 30) dayText = "廿" + "一二三四五六七八九".charAt(day - 21);
  else dayText = "三十";
  return "农历" + (lunar.leap ? "闰" : "") + months[lunar.month - 1] + "月" + dayText;
}
function fitPageText(g, text, width) {
  var out = String(text), max = width || 192;
  while (out.length > 1 && g.measure(out) > max) out = out.substring(0, out.length - 2) + "…";
  return out;
}
function pageLines(g, dt, info) {
  var lunar = info.lunar, p = info.pillars, monthName = ALMANAC.name(p.month), dayName = ALMANAC.name(p.day);
  var rows = [], rowIndents = [], keepWhole = [], i, lines, line;
  function addRow(text, indent, keep) {
    rows.push(text);
    rowIndents.push(indent || 0);
    keepWhole.push(!!keep);
  }
  function addActivities(label, terms) {
    var indent = g.measure(label + " "), current = label + " ", hasTerm = false, offset = 0, term, candidate;
    if (!terms.length) terms = ["无"];
    for (var k = 0; k < terms.length; k++) {
      term = terms[k];
      candidate = current + (hasTerm ? " " : "") + term;
      if (g.measure(candidate) <= 192 - offset) {
        current = candidate;
        hasTerm = true;
      } else {
        if (hasTerm) addRow(current, offset, true);
        current = term;
        offset = indent;
        hasTerm = true;
      }
    }
    addRow(current, offset, true);
  }
  if (game.lang === "en") {
    addRow(lunar ? "Lunar " + (lunar.leap ? "leap " : "") + lunar.month + "/" + lunar.day : "Lunar date unavailable");
    addRow("Pillars " + ALMANAC.name(p.year) + "年 " + monthName + "月 " + dayName + "日");
    addRow("Zodiac " + ZODIAC_EN[p.year % 12]);
    addRow(info.term >= 0 ? ALMANAC.TERM_NAMES[info.term] :
      info.nextTerm.days + " days to " + (info.nextTerm.j >= 0 ? ALMANAC.TERM_NAMES[info.nextTerm.j] : "冬至"));
    addRow("Jianchu " + info.jianchu + " · " + info.god + " " + (info.huangdao ? "黄道" : "黑道"));
    addRow("Clash (" + info.chong.pillar + ")" + info.chong.zodiac + " · Sha " + info.sha);
    addRow("Pengzu " + info.pengzu[0]);
    addRow("Pengzu " + info.pengzu[1]);
    addActivities("Do", info.yi);
    addActivities("Avoid", info.ji);
  } else {
    addRow(almanacLunarText(lunar));
    addRow("干支 " + ALMANAC.name(p.year) + "年 " + monthName + "月 " + dayName + "日");
    addRow("生肖 属" + info.zodiac);
    addRow(info.term >= 0 ? ALMANAC.TERM_NAMES[info.term] :
      "距 " + (info.nextTerm.j >= 0 ? ALMANAC.TERM_NAMES[info.nextTerm.j] : "冬至") + " 还有 " + info.nextTerm.days + " 天");
    addRow("建除 " + info.jianchu + "日 · " + info.god + " " + (info.huangdao ? "黄道" : "黑道"));
    addRow("冲 (" + info.chong.pillar + ")" + info.chong.zodiac + " 煞" + info.sha);
    addRow(info.pengzu[0]);
    addRow(info.pengzu[1]);
    addActivities("宜", info.yi);
    addActivities("忌", info.ji);
  }
  var gods = LUCK.gods(p.day % 10);
  var godItems = ["喜神 " + dirName(gods.xi), "财神 " + dirName(gods.cai), "福神 " + dirName(gods.fu)];
  almanacGodsLine = rows.length;
  almanacGodsLineCount = 2;
  addRow(godItems[0] + " · " + godItems[1], 0, true);
  addRow(godItems[2], 0, true);
  for (i = 0; i < rows.length; i++) if (!keepWhole[i]) rows[i] = fitPageText(g, rows[i], 192 - rowIndents[i]);
  almanacRowIndents = rowIndents;
  return rows;
}
function openAlmanacCompass() {
  if (almanacGodsLine + almanacGodsLineCount <= almanacScroll ||
      almanacGodsLine >= almanacScroll + 10) return;
  offset = almanacOffset;
  openSection("compass");
}
function moveAlmanac(days) {
  var dt = almanacDate(), candidate = new Date(dt.y, dt.m - 1, dt.d + days, 12);
  if (candidate.getFullYear() < 1900 || candidate.getFullYear() > 2100) { sfx("err"); return; }
  almanacOffset += days;
  almanacScroll = 0;
  almanacGodsFocused = false;
  almanacTear = REDUCED_MOTION ? 0.08 : 0.25;
  almanacTearDir = days > 0 ? -1 : 1;
  sfx("move");
}
function updateAlmanac(dt) {
  if (almanacTear > 0) almanacTear = Math.max(0, almanacTear - dt);
  if (game.pressed("b")) { backToCounter(); return; }
  if (game.pressed("left")) moveAlmanac(-1);
  if (game.pressed("right")) moveAlmanac(1);
  if (game.pressed("start")) {
    if (almanacOffset !== 0) { almanacOffset = 0; almanacScroll = 0; almanacGodsFocused = false; sfx("ok"); }
  } else if (game.pressed("up")) { almanacScroll = Math.max(0, almanacScroll - 1); almanacGodsFocused = false; sfx("move"); }
  else if (game.pressed("down")) { almanacScroll++; almanacGodsFocused = true; sfx("move"); }
  if (game.pressed("a") && almanacGodsFocused) openAlmanacCompass();
  var pointer = game.pointer;
  if (pointer.pressed && pointer.y >= 56 && pointer.y < 200) {
    var line = almanacScroll + Math.floor((pointer.y - 56) / 14);
    if (line >= almanacGodsLine && line < almanacGodsLine + almanacGodsLineCount) {
      almanacGodsFocused = true; openAlmanacCompass();
    }
  }
  if (almanacGodsLine >= 0 && almanacGodsLine + almanacGodsLineCount > almanacScroll &&
      almanacGodsLine < almanacScroll + 10) {
    /* Once the final row scrolls into view it is the A-key target. */
    if (game.pressed("down")) almanacGodsFocused = true;
  }
}
function drawAlmanac(g) {
  var dt = almanacDate();
  if (dt.y < 1900 || dt.y > 2100) {
    g.clear(g.PAPER);
    g.rect(0, 0, W, 19, g.INK);
    g.text(T({ zh: "老黄历", en: "Almanac" }), CX, 2, { align: "center", color: g.PAPER });
    g.window(7, 25, 202, 178);
    g.text(T({ zh: "仅收 1900—2100 年", en: "Dates: 1900–2100" }), CX, 94, { align: "center", color: g.INK });
    g.text(fitPageText(g, T({ zh: "←→ 回到历书范围", en: "←→ return to range" }), 216), CX, 211,
      { align: "center", color: g.INK });
    g.text(fitPageText(g, HINT, 216), CX, 226, { align: "center", color: g.DARK });
    return;
  }
  dt.week = new Date(dt.y, dt.m - 1, dt.d).getDay();
  var info = ALMANAC.day(dt.y, dt.m, dt.d), rows = pageLines(g, dt, info);
  var shift = almanacTear > 0 ? Math.round(-almanacTearDir * (REDUCED_MOTION ? 8 : 24) *
    (almanacTear / (REDUCED_MOTION ? 0.08 : 0.25))) : 0;
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "老黄历", en: "Almanac" }), CX, 2, { align: "center", color: g.PAPER });
  g.origin(shift, 0);
  g.rect(7, 19, 202, 188, g.PAPER);
  g.frame(7, 19, 202, 188, g.INK);
  g.rect(8, 20, 200, 15, g.MID);
  for (var pin = 17; pin < 204; pin += 12) g.circle(pin, 27, 1, g.INK, true);
  g.rect(12, 35, 25, 18, g.INK);
  g.text(String(dt.d), 24, 37, { align: "center", color: g.PAPER });
  var dateLine = game.lang === "en" ? MONTH_EN[dt.m - 1] + " " + dt.y + " · " + WEEK_EN[dt.week] :
    dt.y + "年 " + dt.m + "月 · " + WEEK_ZH[dt.week];
  g.text(fitPageText(g, dateLine), 43, 36, { color: g.INK });
  g.clip(10, 54, 196, 150);
  var lineH = 14, max = Math.floor(150 / lineH);
  almanacScroll = Math.min(almanacScroll, Math.max(0, rows.length - max));
  for (var i = almanacScroll; i < rows.length && i < almanacScroll + max; i++) {
    var y = 56 + (i - almanacScroll) * lineH;
    if (i >= almanacGodsLine && i < almanacGodsLine + almanacGodsLineCount && almanacGodsFocused) {
      g.rect(10, y - 1, 196, 14, g.MID);
    }
    g.text(rows[i], 12 + almanacRowIndents[i], y, { color: g.INK });
  }
  g.clip();
  g.origin(0, 0);
  var key = T({ zh: "←→翻页 · START今天 · A神位", en: "←→ page · START today · A gods" });
  g.text(fitPageText(g, key, 216), CX, 211, { align: "center", color: g.INK });
  g.text(fitPageText(g, HINT, 216), CX, 226, { align: "center", color: g.DARK });
}

function updateFortune() {
  syncSlipDate();
  if (game.pressed("b")) { backToCounter(); return; }
  if (slipState.slip !== null && !slipState.animating) {
    if (game.pressed("up")) { slipScroll = Math.max(0, slipScroll - 1); sfx("move"); }
    if (game.pressed("down")) { slipScroll++; sfx("move"); }
    if (game.pressed("start") || (game.pointer.pressed && game.pointer.y >= 210)) appendSlip();
  } else if (game.pressed("a") || (game.pointer.pressed && game.pointer.y >= 45 && game.pointer.y <= 208)) {
    drawSlip();
  }
}
function drawCup(g) {
  /* The same rattle is shortened with reduced motion, rather than removed. */
  var shift = slipState.animating ? Math.round(Math.sin(game.time * 46) * 3) : 0;
  g.origin(shift, 0);
  g.circle(CX, 168, 40, g.DARK, true);
  g.rect(CX - 45, 94, 90, 61, g.MID);
  g.line(CX - 45, 154, CX - 37, 168, g.INK);
  g.line(CX - 37, 168, CX + 37, 168, g.INK);
  g.line(CX + 37, 168, CX + 45, 154, g.INK);
  g.line(CX - 46, 95, CX + 46, 95, g.INK);
  g.line(CX - 48, 92, CX + 48, 92, g.INK);
  for (var i = 0; i < 7; i++) {
    var x = CX - 26 + i * 9, top = 49 + (i % 3) * 6;
    g.line(x, top, x + 1, 105, g.INK);
    g.rect(x - 1, top, 4, 5, g.PAPER);
  }
  g.origin(0, 0);
}
function fortuneFooter(g) {
  var line;
  if (!loadComplete) line = T({ zh: "存档读取中…", en: "Reading save…" });
  else if (loadFailed) line = T({ zh: "存档读不出，今天不会保存", en: "Could not read the save; today won't be saved" });
  else if (slipState.slip === null) line = T({ zh: "A 抽签 · 点签筒 · 摇一摇", en: "A draw · tap the cup · shake" });
  else if (typeof PAD === "undefined" || !PAD.notes) line = T({
    zh: "这台掌机太老，不能写记事本。", en: "This handheld is too old to write notes."
  });
  else if (appendBusy) line = T({ zh: "正在写入…", en: "Saving…" });
  else if (appendStatus === "denied") line = T({ zh: "没有写入 · 今天已抽", en: "Not saved · drawn today" });
  else if (slipState.written) line = T({ zh: "已写入", en: "Saved" });
  else line = T({ zh: "START 写入记事本", en: "START to notes" });
  g.rect(0, 210, W, 30, g.PAPER);
  var lines = g.wrap(line, 208);
  for (var i = 0; i < lines.length && i < 2; i++) {
    g.text(lines[i], CX, 211 + i * 13, { align: "center", color: g.DARK });
  }
}
function drawFortune(g) {
  syncSlipDate();
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "每日一签", en: "Fortune" }), CX, 2, { align: "center", color: g.PAPER });
  g.text(prettyDate(slipState.dateKey), CX, 23, { align: "center", color: g.DARK });
  if (slipState.slip === null) {
    drawCup(g);
    if (slipState.animating) {
      g.text(T({ zh: "摇签中…", en: "Shaking…" }), CX, 185, { align: "center", color: g.INK });
    }
  } else {
    var item = slipItem(), grade = item.grade[game.lang];
    g.frame(8, 43, 200, 166, g.INK);
    g.text(T({ zh: "第 " + item.num + " 签", en: "No. " + item.num }), 16, 48, { color: g.INK });
    g.text(grade, 200, 48, { align: "right", color: g.INK });
    var lines = [], j, wrapped;
    for (j = 0; j < item.verse[game.lang].length; j++) {
      wrapped = g.wrap(item.verse[game.lang][j], 180);
      lines = lines.concat(wrapped);
    }
    lines.push("");
    wrapped = g.wrap(item.meaning[game.lang], 180);
    lines = lines.concat(wrapped);
    var lineH = g.lineHeight || 14, max = Math.floor(142 / lineH);
    slipScroll = Math.min(slipScroll, Math.max(0, lines.length - max));
    g.clip(13, 69, 190, 136);
    for (j = slipScroll; j < lines.length && j < slipScroll + max; j++) {
      g.text(lines[j], 18, 70 + (j - slipScroll) * lineH, { color: g.INK });
    }
    g.clip();
  }
  fortuneFooter(g);
}

function guaLine(g, x, y, bits, changing, width, thickness) {
  var tone = g.INK;
  var half = Math.floor((width - 4) / 2);
  if (bits) g.rect(x, y, width, thickness, tone);
  else {
    g.rect(x, y, half, thickness, tone);
    g.rect(x + half + 4, y, width - half - 4, thickness, tone);
  }
  if (changing === 9) {
    g.circle(x + width + 9, y + Math.floor(thickness / 2), 3, tone, false);
    g.pixel(x + width + 9, y + Math.floor(thickness / 2), g.PAPER);
  } else if (changing === 6) {
    var markX = x + width + 6, markY = y - 1;
    g.line(markX, markY, markX + 6, markY + 6, tone);
    g.line(markX + 6, markY, markX, markY + 6, tone);
  }
}
function guaTextLines(g) {
  var h = YI.primary(guaState.lines), changed = YI.changed(guaState.lines), rows = [], wrap, i, names;
  if (guaState.failed) rows.push(T({ zh: "存档读不出，今天不会保存", en: "Could not read the save; today won't be saved" }));
  rows.push(game.lang === "en" ? h.number + " " + h.short + " · " + h.name : h.number + " " + h.name);
  rows = rows.concat(g.wrap("卦辞：" + h.judgment, 196));
  rows = rows.concat(g.wrap("大象：" + h.image, 196));
  if (game.lang === "en") rows = rows.concat(g.wrap(h.english, 196));
  names = YI.changingLines(guaState.lines);
  if (changed) {
    rows.push(T({ zh: "变卦 " + changed.number + " " + changed.name,
      en: "Changes to " + changed.number + " " + changed.short + " · " + changed.name }));
    var positions = ["初", "二", "三", "四", "五", "上"];
    var lineNames = names.map(function (n) { return positions[n - 1]; });
    rows.push(T({ zh: lineNames.join("、") + "爻变",
      en: (names.length > 1 ? "Lines " : "Line ") + names.join(", ") + (names.length > 1 ? " change" : " changes") }));
    rows = rows.concat(g.wrap("卦辞：" + changed.judgment, 196));
  }
  return rows;
}
function drawGuaFigure(g, x, bottom, lines, width, bits) {
  var barWidth = width || 48, thickness = 4;
  for (var i = 0; i < lines.length; i++) {
    guaLine(g, x, bottom - i * 8, bits ? lines[i] : (lines[i] === 6 || lines[i] === 8 ? 0 : 1),
      bits ? null : lines[i], barWidth, thickness);
  }
}
function drawArrow(g, x, y) {
  g.line(x - 9, y, x + 8, y, g.INK);
  g.line(x + 3, y - 5, x + 8, y, g.INK);
  g.line(x + 3, y + 5, x + 8, y, g.INK);
}
function drawTossCoins(g, centerY) {
  for (var i = 0; i < 3; i++) {
    var x = CX - 18 + i * 18, phase = game.time * 28 + i * 2.1;
    var radius = guaState.animating ? Math.max(1, Math.round(Math.abs(Math.sin(phase)) * 6)) : 6;
    var y = centerY == null ? 111 : centerY;
    g.circle(x, y, 7, g.INK, false);
    g.rect(x - radius, y - 1, radius * 2 + 1, 3, g.INK);
    if (!guaState.animating || Math.sin(phase) > 0) g.pixel(x, y, g.PAPER);
  }
}
function updateHexagram() {
  syncGuaDate();
  if (guaChart) { updateGuaChart(); return; }
  if (game.pressed("b")) { backToCounter(); return; }
  if (game.pressed("select")) { guaChart = true; guaPanel = false; sfx("tap"); return; }
  if (guaState.lines.length === 6 && !guaState.animating) {
    if (game.pressed("up")) { guaScroll = Math.max(0, guaScroll - 1); sfx("move"); }
    if (game.pressed("down")) { guaScroll++; sfx("move"); }
  }
  var p = game.pointer;
  if (p.pressed && !guaState.animating && guaState.lines.length < 6 && p.y >= 40 && p.y <= 205) {
    tossGuaLine();
  }
  if (game.pressed("a")) tossGuaLine();
}
function drawHexagram(g) {
  syncGuaDate();
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "八卦", en: "Hexagram" }), CX, 2, { align: "center", color: g.PAPER });
  if (!guaState.loaded) {
    g.text(T({ zh: "存档读取中…", en: "Reading save…" }), CX, 96, { align: "center", color: g.DARK });
  } else if (!guaState.lines.length) {
    g.text(T({ zh: "心里想一个问题，再起卦", en: "Hold one question in mind, then cast" }), CX, 42,
      { align: "center", color: g.INK, width: 204 });
    if (guaState.animating) {
      drawTossCoins(g);
    }
    if (guaState.failed) g.text(T({ zh: "存档读不出，今天不会保存",
      en: "Could not read the save; today won't be saved" }), CX, 190, { align: "center", color: g.DARK, width: 210 });
  } else {
    if (guaState.lines.length === 6) {
      var changedHex = YI.changed(guaState.lines);
      if (changedHex) {
        drawGuaFigure(g, 17, 70, guaState.lines, 48);
        drawArrow(g, CX, 47);
        drawGuaFigure(g, 151, 70, changedHex.lines, 48, true);
      } else {
        drawGuaFigure(g, 81, 70, guaState.lines, 48);
      }
      var rows = guaTextLines(g), lineH = g.lineHeight || 14, max = Math.floor(124 / lineH);
      guaScroll = Math.min(guaScroll, Math.max(0, rows.length - max));
      g.clip(9, 81, 198, 124);
      for (var i = guaScroll; i < rows.length && i < guaScroll + max; i++) {
        g.text(rows[i], 10, 82 + (i - guaScroll) * lineH, { color: g.INK });
      }
      g.clip();
    } else {
      g.text(T({ zh: "占卦 " + guaState.lines.length + "/6",
        en: "Casting " + guaState.lines.length + "/6" }), CX, 34, { align: "center", color: g.INK });
      drawGuaFigure(g, 77, 114 + (guaState.lines.length - 1) * 4, guaState.lines, 48);
      if (guaState.animating) drawTossCoins(g, 174);
    }
  }
  var key = guaState.lines.length === 6 ?
    T({ zh: "↑↓ 读 · SELECT 八卦图", en: "↑↓ read · SELECT trigrams" }) :
    T({ zh: "A 起卦 · SELECT 八卦图", en: "A cast · SELECT trigrams" });
  g.text(fitPageText(g, key, W), CX, 211, { align: "center", color: g.INK });
  g.text(fitPageText(g, HINT, W), CX, 226, { align: "center", color: g.DARK });
}
function trigramDirection(deg) {
  var map = { 0: ["北", "N"], 45: ["东北", "NE"], 90: ["东", "E"], 135: ["东南", "SE"],
    180: ["南", "S"], 225: ["西南", "SW"], 270: ["西", "W"], 315: ["西北", "NW"] };
  return game.lang === "en" ? map[deg][1] : map[deg][0];
}
var CHART_CY = 114;
function trigramPoint(i) {
  var angle = (-90 + i * 45) * Math.PI / 180;
  /* figures 60 px out, names 26 px further: the whole ring fits between the title bar and the key line */
  return { x: CX + Math.cos(angle) * 60, y: CHART_CY + Math.sin(angle) * 60 };
}
function trigramBounds(i) {
  var p = trigramPoint(i), angle = (-90 + i * 45) * Math.PI / 180;
  var lx = p.x + Math.cos(angle) * 26, ly = p.y + Math.sin(angle) * 26;
  var x0 = Math.min(p.x - 12, lx - 7), x1 = Math.max(p.x + 12, lx + 7);
  var y0 = Math.min(p.y - 8, ly - 7), y1 = Math.max(p.y + 9, ly + 7);
  return { x: Math.round(x0 - 2), y: Math.round(y0 - 2),
    w: Math.round(x1 - x0 + 4), h: Math.round(y1 - y0 + 4) };
}
function drawTrigram(g, trigram, x, y, color) {
  for (var j = 0; j < 3; j++) {
    var yy = Math.round(y + 5 - j * 6);
    if (trigram.lines[j]) g.rect(x - 11, yy, 22, 3, color);
    else { g.rect(x - 11, yy, 9, 3, color); g.rect(x + 2, yy, 9, 3, color); }
  }
}
function drawTaiji(g) {
  var x = CX, y = CHART_CY, r = 16;
  g.circle(x, y, r, g.INK, true);
  for (var dy = -15; dy <= 15; dy++) {
    var half = Math.floor(Math.sqrt(r * r - dy * dy));
    g.rect(x - half, y + dy, half, 1, g.PAPER);
  }
  g.circle(x, y - 8, 8, g.PAPER, true);
  g.circle(x, y + 8, 8, g.INK, true);
  g.circle(x, y - 8, 2, g.INK, true);
  g.circle(x, y + 8, 2, g.PAPER, true);
}
function updateGuaChart() {
  var p = game.pointer, i, point, dx, dy, closest = -1, distance = 10000;
  if (game.pressed("select")) { guaChart = false; guaPanel = false; sfx("tap"); return; }
  if (game.pressed("b")) {
    if (guaPanel) guaPanel = false;
    else guaChart = false;
    sfx("tap"); return;
  }
  if (game.pressed("left")) { guaCursor = (guaCursor + 7) % 8; sfx("move"); }
  if (game.pressed("right")) { guaCursor = (guaCursor + 1) % 8; sfx("move"); }
  if (p.pressed) {
    for (i = 0; i < 8; i++) {
      point = trigramPoint(i); dx = p.x - point.x; dy = p.y - point.y;
      if (dx * dx + dy * dy < distance) { distance = dx * dx + dy * dy; closest = i; }
    }
    if (distance < 29 * 29) { guaCursor = closest; guaPanel = true; sfx("tap"); }
  }
  if (game.pressed("a")) { guaPanel = true; sfx("tap"); }
}
function drawGuaChart(g) {
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "后天八卦", en: "Later Heaven" }), CX, 2, { align: "center", color: g.PAPER });
  drawTaiji(g);
  for (var i = 0; i < 8; i++) {
    var t = YI.TRIGRAMS[GUA_ORDER[i]], p = trigramPoint(i);
    var angle = (-90 + i * 45) * Math.PI / 180;
    var lx = p.x + Math.cos(angle) * 26, ly = p.y + Math.sin(angle) * 26;
    var color = g.INK;
    if (i === guaCursor) {
      var box = trigramBounds(i);
      g.rect(box.x, box.y, box.w, box.h, g.INK);
      color = g.PAPER;
    }
    drawTrigram(g, t, p.x, p.y, color);
    g.text(t.name, lx, ly - 6, { align: "center", color: color });
  }
  if (guaPanel) {
    var selected = YI.TRIGRAMS[GUA_ORDER[guaCursor]];
    g.window(22, 63, 172, 101);
    g.text(selected.name, CX, 70, { align: "center", color: g.INK });
    g.text(T({ zh: "卦象 ", en: "Image " }) +
      (game.lang === "en" ? selected.imageEn : selected.image), CX, 89,
      { align: "center", color: g.INK });
    g.text(T({ zh: "家人 ", en: "Family " }) +
      (game.lang === "en" ? selected.familyEn : selected.family), CX, 108,
      { align: "center", color: g.INK });
    g.text(T({ zh: "方位 ", en: "Direction " }) + trigramDirection(selected.direction),
      CX, 127, { align: "center", color: g.INK });
    g.text(T({ zh: "B 关闭", en: "B close" }), CX, 145, { align: "center", color: g.DARK });
  }
  g.text(fitPageText(g, T({ zh: "←→选 · A看 · B/SELECT返回", en: "←→ pick · A view · B/SELECT back" }), W),
    CX, 211, { align: "center", color: g.INK });
  g.text(fitPageText(g, HINT, W), CX, 226, { align: "center", color: g.DARK });
}

function baziHourIndex(hour) {
  for (var i = 0; i < BAZI_HOURS.length; i++) if (BAZI_HOURS[i].hour === hour) return i;
  return BAZI_HOURS.length - 1;
}
function baziHourText(hour) {
  var option = BAZI_HOURS[baziHourIndex(hour)];
  if (option.hour === null) return T({ zh: "不知道", en: "Unknown" });
  var range = option.hour === 0 ? "0-1" : option.hour === 23 ? "23-24" : option.hour + "-" + (option.hour + 2);
  return game.lang === "en" ? option.en + " " + range : option.label + " " + range;
}
function baziMasterEnglish(master) {
  var elements = ["木", "火", "土", "金", "水"], english = ["Wood", "Fire", "Earth", "Metal", "Water"];
  return master.charAt(0) + " " + english[elements.indexOf(master.charAt(1))];
}
function baziHourBranch(hour) {
  return hour === null ? null : LUCK.BRANCHES[Math.floor((hour + 1) / 2) % 12];
}
function validBaziSave(value) {
  return !!(value && value.v === 1 && BAZI.valid(value.y, value.m, value.d) &&
    (value.hour === null || (typeof value.hour === "number" && Math.floor(value.hour) === value.hour &&
      value.hour >= 0 && value.hour <= 23)));
}
function readBazi() {
  if (typeof PAD === "undefined" || typeof PAD.load !== "function") { baziState.loaded = true; return; }
  var result;
  try { result = PAD.load("bazi"); }
  catch (e) { baziState.failed = true; baziState.loaded = true; return; }
  Promise.resolve(result).then(function (value) {
    baziState.loaded = true;
    if (validBaziSave(value)) {
      baziState.saved = { v: 1, y: value.y, m: value.m, d: value.d, hour: value.hour };
      baziState.chart = BAZI.chart(value.y, value.m, value.d, value.hour);
    }
  }, function () {
    baziState.failed = true;
    baziState.loaded = true;
  });
}
function beginBaziEdit() {
  var value = baziState.saved;
  baziState.y = value ? value.y : 1990;
  baziState.m = value ? value.m : 1;
  baziState.d = value ? value.d : 1;
  baziState.hour = value ? value.hour : null;
  baziState.field = 0;
  baziState.picker = true;
}
function saveBazi() {
  var value = { v: 1, y: baziState.y, m: baziState.m, d: baziState.d, hour: baziState.hour };
  baziState.saved = value;
  baziState.chart = BAZI.chart(value.y, value.m, value.d, value.hour);
  baziState.picker = false;
  if (!baziState.failed && typeof PAD !== "undefined" && typeof PAD.save === "function") {
    try { PAD.save("bazi", value); } catch (e) {}
  }
  sfx("ok");
}
function clampBaziDay() {
  var max = new Date(Date.UTC(baziState.y, baziState.m, 0)).getUTCDate();
  baziState.d = Math.min(baziState.d, max);
}
function changeBaziValue(amount) {
  if (baziState.field === 0) {
    baziState.y = Math.max(1900, Math.min(2100, baziState.y + amount));
    clampBaziDay();
  } else if (baziState.field === 1) {
    baziState.m = Math.max(1, Math.min(12, baziState.m + amount));
    clampBaziDay();
  } else if (baziState.field === 2) {
    var max = new Date(Date.UTC(baziState.y, baziState.m, 0)).getUTCDate();
    baziState.d = Math.max(1, Math.min(max, baziState.d + amount));
  } else {
    var index = (baziHourIndex(baziState.hour) + amount + BAZI_HOURS.length) % BAZI_HOURS.length;
    baziState.hour = BAZI_HOURS[index].hour;
  }
  sfx("move");
}
function updateBazi() {
  if (!baziState.loaded) return;
  if (!baziState.saved && !baziState.picker) beginBaziEdit();
  if (baziState.picker) {
    if (game.pressed("b")) {
      baziState.picker = false;
      if (!baziState.saved) backToCounter();
      else sfx("tap");
      return;
    }
    if (game.pressed("left")) { baziState.field = (baziState.field + 3) % 4; sfx("move"); }
    if (game.pressed("right")) { baziState.field = (baziState.field + 1) % 4; sfx("move"); }
    if (game.pressed("up")) changeBaziValue(1);
    if (game.pressed("down")) changeBaziValue(-1);
    if (game.pressed("a")) saveBazi();
    var p = game.pointer;
    if (p.pressed) {
      var row = Math.floor((p.y - 44) / 38);
      if (row >= 0 && row < 4) {
        baziState.field = row;
        if (p.x >= 12 && p.x < 54) changeBaziValue(1);
        else if (p.x >= 162 && p.x < 204) changeBaziValue(-1);
      }
      if (p.y >= 208 && p.y < 239 && p.x > 150) saveBazi();
    }
    return;
  }
  if (game.pressed("b")) { backToCounter(); return; }
  if (game.pressed("start")) { beginBaziEdit(); sfx("tap"); }
}
function drawBaziPicker(g) {
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "八字 · 填写", en: "Chart · Birth" }), CX, 2, { align: "center", color: g.PAPER });
  var names = game.lang === "en" ? ["Year", "Month", "Day", "Hour"] : ["年", "月", "日", "时辰"];
  var values = game.lang === "en" ?
    [String(baziState.y), String(baziState.m), String(baziState.d), baziHourText(baziState.hour)] :
    [baziState.y + "年", baziState.m + "月", baziState.d + "日", baziHourText(baziState.hour)];
  for (var i = 0; i < 4; i++) {
    var y = 44 + i * 38;
    if (i === baziState.field) g.rect(8, y, 200, 34, g.INK);
    var color = i === baziState.field ? g.PAPER : g.INK;
    g.text(names[i], CX, y + 1, { align: "center", color: color });
    g.text(values[i], CX, y + 18, { align: "center", color: color });
    g.frame(12, y + 1, 40, 32, i === baziState.field ? g.PAPER : g.INK);
    g.frame(164, y + 1, 40, 32, i === baziState.field ? g.PAPER : g.INK);
    g.line(27, y + 24, 32, y + 15, color);
    g.line(32, y + 15, 37, y + 24, color);
    g.line(179, y + 12, 184, y + 21, color);
    g.line(184, y + 21, 189, y + 12, color);
  }
  if (baziState.failed) {
    var message = T({ zh: "存档读不出，这次不会保存",
      en: "Could not read; it won't save this time" });
    var messageLines = g.wrap(message, 208);
    for (var line = 0; line < messageLines.length && line < 2; line++)
      g.text(messageLines[line], CX, 184 + line * 13, { align: "center", color: g.DARK });
  }
  g.text(fitPageText(g, T({ zh: "←→选 ↑↓改 A确认 B返回",
    en: "←→ field ↑↓ edit A save B back" }), W), CX, 214, { align: "center", color: g.INK });
  g.text(fitPageText(g, HINT, W), CX, 229, { align: "center", color: g.DARK });
}
function drawBaziChart(g) {
  var chart = baziState.chart;
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "八字", en: "Chart" }), CX, 2, { align: "center", color: g.PAPER });
  var dateLine = game.lang === "en" ?
    baziState.saved.y + "-" + pad2(baziState.saved.m) + "-" + pad2(baziState.saved.d) + " hour " +
      (baziState.saved.hour === null ? "unknown" : baziHourBranch(baziState.saved.hour)) :
    baziState.saved.y + "年" + baziState.saved.m + "月" + baziState.saved.d + "日 " +
      (baziState.saved.hour === null ? "时辰未知" : baziHourBranch(baziState.saved.hour) + "时");
  if (baziState.failed) dateLine += T({ zh: " · 不保存", en: " · no save" });
  g.text(fitPageText(g, dateLine, 212), CX, 22, { align: "center", color: g.INK });
  var columns = [
    { key: "hour", label: T({ zh: "时", en: "Hour" }), x: 29 },
    { key: "day", label: T({ zh: "日", en: "Day" }), x: 81 },
    { key: "month", label: T({ zh: "月", en: "Month" }), x: 135 },
    { key: "year", label: T({ zh: "年", en: "Year" }), x: 187 }
  ];
  for (var i = 0; i < columns.length; i++) {
    var col = columns[i], index = chart[col.key];
    g.text(col.label, col.x, 40, { align: "center", color: g.INK });
    g.frame(col.x - 19, 54, 38, 22, g.INK);
    g.frame(col.x - 19, 78, 38, 22, g.INK);
    g.text(index === null ? T({ zh: "未知", en: "?" }) : LUCK.STEMS[index % 10],
      col.x, 58, { align: "center", color: g.INK });
    g.text(index === null ? T({ zh: "未知", en: "?" }) : LUCK.BRANCHES[index % 12],
      col.x, 82, { align: "center", color: g.INK });
  }
  g.text(T({ zh: "纳音", en: "Na Yin" }), CX, 102, { align: "center", color: g.INK });
  for (i = 0; i < columns.length; i++) {
    var naYinColumn = columns[i], naYinIndex = chart[naYinColumn.key];
    g.text(naYinIndex === null ? T({ zh: "未知", en: "?" }) : chart.nayin[naYinColumn.key],
      naYinColumn.x, 116, { align: "center", color: g.INK });
  }
  var elements = ["木", "火", "土", "金", "水"];
  var labels = game.lang === "en" ? ["Wd", "Fi", "Ea", "Me", "Wa"] : elements;
  var centers = [18, 63, 108, 153, 198];
  g.text(T({ zh: "五行", en: "Elements" }), CX, 130, { align: "center", color: g.INK });
  for (i = 0; i < elements.length; i++) {
    var count = chart.counts[elements[i]], barHeight = Math.min(24, count * 3);
    g.text(labels[i], centers[i], 142, { align: "center", color: g.INK });
    g.frame(centers[i] - 5, 157, 10, 26, g.INK);
    if (barHeight) g.rect(centers[i] - 3, 181 - barHeight, 6, barHeight, g.DARK);
    g.text(String(count), centers[i], 183, { align: "center", color: g.INK });
  }
  var zodiac = game.lang === "en" ? ZODIAC_EN[chart.year % 12] : chart.zodiac;
  var summary = T({ zh: "属" + chart.zodiac + " · 日主 " + chart.dayMaster,
    en: zodiac + " · Day master " + baziMasterEnglish(chart.dayMaster) });
  g.text(summary, CX, 196, { align: "center", color: g.INK });
  g.text(fitPageText(g, T({ zh: "START 修改 · B 返回", en: "START edit · B back" }), W),
    CX, 211, { align: "center", color: g.INK });
  g.text(fitPageText(g, HINT, W), CX, 226, { align: "center", color: g.DARK });
}
function drawBazi(g) {
  if (!baziState.loaded) {
    g.clear(g.PAPER);
    g.rect(0, 0, W, 19, g.INK);
    g.text(T({ zh: "八字", en: "Chart" }), CX, 2, { align: "center", color: g.PAPER });
    g.text(T({ zh: "存档读取中…", en: "Reading save…" }), CX, 112, { align: "center", color: g.DARK });
    return;
  }
  if (baziState.picker || !baziState.chart) drawBaziPicker(g);
  else drawBaziChart(g);
}

game.scene("counter", {
  enter: function () { section = "counter"; syncMotion(); },
  update: updateCounter,
  draw: drawCounter
});
game.scene("fortune", {
  enter: function () { section = "fortune"; slipScroll = 0; syncMotion(); },
  update: updateFortune,
  draw: drawFortune
});
game.scene("almanac", {
  enter: function () { section = "almanac"; almanacScroll = 0; almanacGodsFocused = false; syncMotion(); },
  update: updateAlmanac,
  draw: drawAlmanac
});
game.scene("compass", {
  enter: function () { section = "compass"; syncMotion(); },
  update: function (dt) {
    if (game.pressed("b") && !panel) { backToCounter(); return; }
    update(dt);
  },
  draw: function (g) {
    var dt = shownDate(), p = pillarOf(dt);
    g.clear(g.PAPER);
    drawHeader(g, headerText(dt, p));
    drawPlate(g);
    drawDial(g, p.stem);
    drawVial(g);
    drawThreads(g);
    drawFaceMark(g);
    drawNotice(g);
    drawFaced(g, p.stem);
    g.text(keyLine(), CX, 212, { align: "center", color: g.DARK });
    g.text(HINT, CX, 226, { align: "center", color: g.DARK });
    if (panel) drawPanel(g, p.stem);
  }
});
game.scene("hexagram", {
  enter: function () { section = "hexagram"; guaScroll = 0; syncGuaDate(); syncMotion(); },
  update: updateHexagram,
  draw: function (g) { if (guaChart) drawGuaChart(g); else drawHexagram(g); }
});
game.scene("bazi", {
  enter: function () {
    section = "bazi";
    if (baziState.loaded && !baziState.saved) beginBaziEdit();
    syncMotion();
  },
  update: updateBazi,
  draw: drawBazi
});

readSlip();
readGua();
readBazi();
game.start("counter");
