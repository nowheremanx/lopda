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
var slipRevealAt = -1;
var slipAnimAt = -1, slipAnimSpan = 0.82, slipLiftSpan = 0.62;
var REDUCED_MOTION = typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var SECTIONS = [
  { id: "almanac", name: T({ zh: "老黄历", en: "Almanac" }) },
  { id: "fortune", name: T({ zh: "每日一签", en: "Fortune" }) },
  { id: "compass", name: T({ zh: "罗盘", en: "Compass" }) },
  { id: "hexagram", name: T({ zh: "八卦", en: "I Ching" }) }
];
var counterCursor = 0;
var almanacOffset = 0, almanacScroll = 0, almanacGlossary = false, almanacGlossaryScroll = 0;
/* the tear: forward, the old page peels up from its bottom edge and comes away at the binding, showing the
   new page beneath; back, yesterday's page rolls down over today's. Nothing slides sideways. */
var TEAR_TIME = 0.6, TEAR_TIME_REDUCED = 0.15;
var almanacTear = 0, almanacTearDir = 1, almanacTearFrom = 0, almanacTearScroll = 0;
var almanacLayout = null, almanacTotalHeight = 0, almanacTodayMask = null;
var WEEK_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
var WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var ZODIAC_EN = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];

/* All reading views share one pixel scroller. Keys advance one text line; a touch
   follows the finger exactly and keeps only a brief, clamped flick afterwards. */
function makeScroller(offset) {
  return { offset: offset || 0, max: 0, down: false, moved: false, startY: 0, lastY: 0,
    velocity: 0, held: 0, next: 0, direction: 0 };
}
var slipScroller = makeScroller(), almanacScroller = makeScroller(),
  glossaryScroller = makeScroller(), guaScroller = makeScroller(),
  guaExplainScroller = makeScroller();
var scrollGestureMoved = false;
function scrollUpdate(sc, area, total, dt, lineHeight) {
  var p = game.pointer, max = Math.max(0, total - area.h), dir = 0, releasedNow = false;
  sc.max = max;
  sc.offset = Math.max(0, Math.min(max, sc.offset));
  if (game.pressed("up") || game.btn("up")) dir = -1;
  else if (game.pressed("down") || game.btn("down")) dir = 1;
  if (dir) {
    if (dir !== sc.direction || game.pressed(dir < 0 ? "up" : "down")) {
      sc.offset += dir * lineHeight;
      sc.held = 0; sc.next = 0.34; sc.direction = dir;
      sfx("move");
    } else {
      sc.held += dt;
      if (sc.held >= sc.next) { sc.offset += dir * lineHeight; sc.next += 0.09; sfx("move"); }
    }
  } else { sc.direction = 0; sc.held = 0; }
  if (p.pressed) {
    scrollGestureMoved = false;
    sc.down = p.y >= area.y && p.y <= area.y + area.h;
    sc.moved = false; sc.startY = p.y; sc.lastY = p.y; sc.velocity = 0;
    if (sc.down) sc.velocity = 0;
  } else if (p.down && sc.down) {
    var dy = p.y - sc.lastY;
    sc.offset -= dy;
    sc.velocity = dt > 0 ? -dy / dt : 0;
    sc.lastY = p.y;
    if (Math.abs(p.y - sc.startY) > 6) { sc.moved = true; scrollGestureMoved = true; }
  } else if (p.released && sc.down) {
    if (Math.abs(p.y - sc.startY) > 6) { sc.moved = true; scrollGestureMoved = true; }
    sc.down = false;
    releasedNow = true;
  }
  if (!sc.down && !p.pressed && !releasedNow && Math.abs(sc.velocity) > 8) {
    sc.offset += sc.velocity * dt;
    sc.velocity *= Math.pow(0.001, dt / 0.4);
    if (sc.offset <= 0 || sc.offset >= max) sc.velocity = 0;
  }
  sc.offset = Math.max(0, Math.min(max, sc.offset));
  return sc.offset;
}
function scrollTapAllowed() { return !scrollGestureMoved; }
function fillPoly(g, pts, tone) {
  var minY = 10000, maxY = -10000, i, j, intersections, y, x;
  for (i = 0; i < pts.length; i++) { minY = Math.min(minY, pts[i].y); maxY = Math.max(maxY, pts[i].y); }
  for (y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    intersections = [];
    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[j], b = pts[i];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y))
        intersections.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    intersections.sort(function (a, b) { return a - b; });
    for (i = 0; i + 1 < intersections.length; i += 2)
      for (x = Math.ceil(intersections[i]); x <= Math.floor(intersections[i + 1]); x++) g.pixel(x, y, tone);
  }
}

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
  slipScroller.offset = 0;
  appendStatus = "";
  syncMotion();
}
var guaState = { day: todayKey(), lines: [], loaded: false, failed: false, animating: false, written: false };
var guaScroll = 0, guaExplain = false, guaExplainScroll = 0;
var guaAppendBusy = false, guaAppendStatus = "";
function guaArea() { return { x: 9, y: 22, w: 198, h: 183 }; }
function syncGuaDate() {
  var key = todayKey();
  if (key === guaState.day) return;
  guaState.day = key;
  guaState.lines = [];
  guaState.written = false;
  guaState.animating = false;
  guaAppendStatus = "";
  guaScroll = 0;
  guaScroller.offset = 0;
  syncMotion();
}
function saveGua() {
  if (guaState.failed || typeof PAD === "undefined" || typeof PAD.save !== "function") return;
  var value = { v: 1, day: guaState.day, lines: guaState.lines.slice() };
  if (guaState.written) value.written = true;
  try { PAD.save("gua", value); } catch (e) {}
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
    if (valid) { guaState.day = d.day; guaState.lines = d.lines.slice(); guaState.written = d.written === true; }
    guaState.loaded = true;
    syncMotion();
  }, function () {
    guaState.failed = true;
    guaState.loaded = true;
  });
}
/* Three coins, the 火珠林 way: a coin's plain back (背) counts as yang. One back is 单 (少阳, 7), two backs 拆
   (少阴, 8), three backs 重 (老阳, 9), none 交 (老阴, 6). YI.castLine decides; recording the random draws it makes
   tells which coins came up back, so the coins on screen are the very ones that made the line. */
var TOSS_TIME = 1.05, TOSS_TIME_REDUCED = 0.25, TOSS_SHOW = 0.5;
var guaToss = null;      /* {at, backs: [bool x3], line} while the coins are in the air or lying on the table */
function tossGuaLine() {
  syncGuaDate();
  if (!guaState.loaded || guaState.lines.length >= 6 || guaState.animating) return;
  var backs = [];
  var line = YI.castLine(function () { var r = Math.random(); backs.push(r < 0.5); return r; });
  guaState.animating = true;
  guaToss = { at: game.time, backs: backs, line: line };
  syncMotion();
  sfx("tick");
  var fly = REDUCED_MOTION ? TOSS_TIME_REDUCED : TOSS_TIME;
  if (!REDUCED_MOTION) for (var i = 0; i < 3; i++) game.after(coinLanding(i), coinClink);
  game.after(fly + (REDUCED_MOTION ? 0.15 : TOSS_SHOW), function () {
    guaState.lines.push(line);
    guaState.written = false;
    guaState.animating = false;
    guaToss = null;
    guaScroll = 0;
    guaScroller.offset = 0;
    saveGua();
    sfx(line === 6 || line === 9 ? "coin" : "ok");
    syncMotion();
  });
}
/* each coin leaves a little after the one before and lands a little later */
function coinLanding(i) { return 0.62 + i * 0.12; }
function coinClink() {
  if (typeof PAD !== "undefined" && PAD.sfx) {
    try { PAD.sfx({ wave: "triangle", from: 2300, to: 1900, ms: 70, attack: 1, decay: 65, vol: 0.25 }); }
    catch (e) { sfx("tick"); }
  }
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
  var span = REDUCED_MOTION ? 0.08 : 0.82;
  var lift = REDUCED_MOTION ? 0.08 : 0.62;
  var settle = REDUCED_MOTION ? 0.02 : 0.16;
  slipAnimAt = game.time;
  slipAnimSpan = span;
  slipLiftSpan = lift;
  var ticks = REDUCED_MOTION ? [0, 0.025] : [0, 0.21, 0.42];
  for (var i = 0; i < ticks.length; i++) {
    game.after(ticks[i], function () { sfx("tick"); });
  }
  game.after(span + settle, function () { sfx("tick"); });
  game.after(span + settle + lift, function () {
    slipState.slip = SLIPS.slotFor(slipState.dateKey);
    slipState.written = false;
    slipState.animating = false;
    slipScroll = 0;
    slipScroller.offset = 0;
    slipRevealAt = game.time;
    appendStatus = "";
    saveSlip();
    sfx("ok");
    syncMotion();
  });
}
function appendSlip() {
  syncSlipDate();
  if (slipState.slip === null || slipState.animating || slipState.written || appendBusy) return;
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
      id !== "hexagram") return;
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
    if (game.g.measure(full) <= 128) return full;
    var shortLine = (zh ? "宜 " : "Do ") + (yi[0] || "无") +
      (zh ? " · 忌 " : " · Avoid ") + (ji[0] || "无");
    return game.g.measure(shortLine) <= 128 ? shortLine : fitSummary(shortLine, 128);
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
/* the counter: the shopfront banner with the name on its signboard, then one 32 px row per section */
var COUNTER_TOP = 50, COUNTER_ROW = 32;
var BANNER_ART = LoGame.sprite(ART.BANNER);
var SECTION_ICONS = {};
for (var si = 0; si < SECTIONS.length; si++) SECTION_ICONS[SECTIONS[si].id] = LoGame.sprite(ART.ICONS[SECTIONS[si].id]);
var INVERT = [3, 2, 1, 0];   /* the highlighted row is ink, so its icon is drawn in reverse */

function updateCounter() {
  var p = game.pointer, i;
  if (game.pressed("up")) { counterCursor = (counterCursor + SECTIONS.length - 1) % SECTIONS.length; sfx("move"); }
  if (game.pressed("down")) { counterCursor = (counterCursor + 1) % SECTIONS.length; sfx("move"); }
  if (p.pressed && p.y >= COUNTER_TOP) {
    i = Math.floor((p.y - COUNTER_TOP) / COUNTER_ROW);
    if (i >= 0 && i < SECTIONS.length) { counterCursor = i; openSection(SECTIONS[i].id); sfx("tap"); return; }
  }
  if (game.pressed("a")) { sfx("tap"); openSection(SECTIONS[counterCursor].id); }
}
/* The name is drawn twice the font's size on the signboard (about x 47-178, y 14-36 of the banner).
   lo-game text has one size, so the name is drawn once, read back pixel by pixel, and kept as a mask. */
var TITLE_MASK = null;
function titleMask(g) {
  var text = T({ zh: "玄机阁", en: "Oracle" }), w = g.measure(text), h = 14, mask = { w: w, h: h, on: [] };
  g.clear(g.PAPER);
  g.text(text, 0, 0, { color: g.INK });
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (g.get(x, y) === g.INK) mask.on.push(x, y);
  return mask;
}
function drawTitle(g) {
  var m = TITLE_MASK, x0 = Math.round(CX + 4 - m.w), y0 = 13;
  g.rect(48, 13, 130, 25, g.PAPER);
  g.frame(47, 12, 132, 27, g.DARK);
  for (var i = 0; i < m.on.length; i += 2) g.rect(x0 + m.on[i] * 2, y0 + m.on[i + 1] * 2, 2, 2, g.INK);
}
function drawCounter(g) {
  g.clear(g.PAPER);
  if (!TITLE_MASK) TITLE_MASK = titleMask(g);
  g.clear(g.PAPER);
  g.sprite(BANNER_ART, 0, 0);
  drawTitle(g);
  for (var i = 0; i < SECTIONS.length; i++) {
    var y = COUNTER_TOP + i * COUNTER_ROW, on = i === counterCursor, ink = on ? g.PAPER : g.INK;
    var summary = fitSummary(sectionSummary(SECTIONS[i].id), 128);
    if (on) g.rect(4, y + 1, 208, COUNTER_ROW - 2, g.INK);
    g.sprite(SECTION_ICONS[SECTIONS[i].id], 8, y + 8, on ? { map: INVERT } : undefined);
    g.text(SECTIONS[i].name, 28, y + 9, { color: ink });
    g.text(summary, 84, y + 9, { color: ink });
    if (!on && i < SECTIONS.length - 1) g.line(8, y + COUNTER_ROW - 1, 208, y + COUNTER_ROW - 1, g.MID);
  }
  g.text(T({ zh: "↑↓ 选 · A 进入", en: "↑↓ pick · A open" }), CX, 216, { align: "center", color: g.DARK });
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
function pageLayout(g, dt, info) {
  var p = info.pillars, lunar = info.lunar, monthName = ALMANAC.name(p.month), dayName = ALMANAC.name(p.day);
  var layout = { boxes: [], rows: [], height: 0 }, y = 0, left = 14, right = 210, i;
  var dateLine = game.lang === "en" ?
    MONTH_EN[dt.m - 1] + " " + dt.y + " · " + WEEK_EN[dt.week] :
    dt.y + "年" + dt.m + "月 · " + WEEK_ZH[dt.week];
  layout.dateLine = fitPageText(g, dateLine, 196);
  layout.lunar = game.lang === "en" ?
    "Lunar " + (lunar ? lunar.month + "/" + lunar.day : "unavailable") :
    almanacLunarText(lunar);
  layout.pillars = game.lang === "en" ?
    "Pillars " + ALMANAC.name(p.year) + " " + monthName + " " + dayName + " · " + ZODIAC_EN[p.year % 12] :
    ALMANAC.name(p.year) + "年 " + monthName + "月 " + dayName + "日 属" + info.zodiac;
  layout.dateMask = makeDayMask(g, String(dt.d));
  y = 78;
  g.line(left, y, right - 2, y, g.DARK);
  y += 5;
  function termLines(terms, width) {
    var out = [], current = "";
    if (!terms || !terms.length) terms = ["无"];
    for (var n = 0; n < terms.length; n++) {
      var next = current ? current + " " + terms[n] : terms[n];
      if (current && g.measure(next) > width) { out.push(current); current = terms[n]; }
      else current = next;
    }
    if (current) out.push(current);
    return out;
  }
  var yi = termLines(info.yi, 84), ji = termLines(info.ji, 84);
  /* the seal takes the top 16 px, each line of terms 13 px (the font is 12 px high), then 4 px of margin */
  var BOX_LINE = 13, boxH = 16 + Math.max(yi.length, ji.length) * BOX_LINE + 4;
  layout.boxLine = BOX_LINE;
  layout.boxes.push({ x: left, y: y, w: 94, h: boxH, title: "宜", lines: yi });
  layout.boxes.push({ x: 114, y: y, w: 94, h: boxH, title: "忌", lines: ji });
  y += boxH + 5;
  function row(label, value) {
    var labelWidth = g.measure(label + " "), wrapped = g.wrap(value, 190 - labelWidth);
    for (var k = 0; k < wrapped.length; k++) {
      layout.rows.push({ label: k === 0 ? label : "", text: fitPageText(g, wrapped[k], 190 - (k === 0 ? labelWidth : 0)), y: y });
      y += 13;
    }
    y += 1;
  }
  var term = info.term >= 0 ? ALMANAC.TERM_NAMES[info.term] :
    (game.lang === "en" ? "in " + info.nextTerm.days + " days: " : "距 ") +
      (info.nextTerm.j >= 0 ? ALMANAC.TERM_NAMES[info.nextTerm.j] : "冬至") +
      (game.lang === "en" ? "" : " " + info.nextTerm.days + " 天");
  row(game.lang === "en" ? "Term" : "节气", term);
  row(game.lang === "en" ? "Jianchu" : "值日",
    info.jianchu + "日 · " + info.god + (info.huangdao ? "黄道" : "黑道"));
  row(game.lang === "en" ? "Clash" : "冲煞",
    "冲" + info.chong.zodiac + " 煞" + info.sha);
  row(game.lang === "en" ? "Pengzu" : "彭祖", info.pengzu[0]);
  row(game.lang === "en" ? "Pengzu" : "彭祖", info.pengzu[1]);
  var gods = LUCK.gods(p.day % 10);
  row(game.lang === "en" ? "Gods" : "神位",
    "喜神 " + dirName(gods.xi) + " · 财神 " + dirName(gods.cai) + " · 福神 " + dirName(gods.fu));
  layout.height = y + 2;
  almanacTotalHeight = layout.height;
  return layout;
}
function makeDayMask(g, text) {
  var w = g.measure(text), h = 14, mask = { w: w, h: h, on: [] };
  var saved = [];
  for (var sy = 0; sy < h; sy++) for (var sx = 0; sx < w; sx++) saved.push(g.get(sx, sy));
  g.rect(0, 0, w, h, g.PAPER);     /* the corner may be the ink title bar: read the glyphs off paper */
  g.text(text, 0, 0, { color: g.INK });
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++)
    if (g.get(x, y) === g.INK) mask.on.push(x, y);
  var at = 0;
  for (sy = 0; sy < h; sy++) for (sx = 0; sx < w; sx++) g.pixel(sx, sy, saved[at++]);
  return mask;
}
function moveAlmanac(days) {
  var dt = almanacDate(), candidate = new Date(dt.y, dt.m - 1, dt.d + days, 12);
  if (candidate.getFullYear() < 1900 || candidate.getFullYear() > 2100) { sfx("err"); return; }
  almanacTearFrom = almanacOffset;
  almanacTearScroll = almanacScroll;
  almanacOffset += days;
  almanacScroll = 0;
  almanacScroller.offset = 0;
  almanacTear = REDUCED_MOTION ? TEAR_TIME_REDUCED : TEAR_TIME;
  almanacTearDir = days > 0 ? 1 : -1;
  if (typeof PAD !== "undefined" && PAD.sfx) {
    /* a short dry rip: noise falling in pitch (named "move" on runtimes without custom sounds) */
    try { PAD.sfx({ wave: "noise", from: 1800, to: 500, ms: 140, attack: 2, decay: 120, vol: 0.35 }); }
    catch (e) { sfx("move"); }
  }
}
function updateAlmanac(elapsed) {
  if (almanacTear > 0) almanacTear = Math.max(0, almanacTear - elapsed);
  if (almanacGlossary) {
    if (game.pressed("b") || game.pressed("select")) {
      almanacGlossary = false; almanacGlossaryScroll = 0; sfx("tap"); return;
    }
    var grows = almanacGlossaryRows(game.g);
    almanacGlossaryScroll = scrollUpdate(glossaryScroller, { x: 10, y: 27, w: 196, h: 174 },
      grows.length * 14, elapsed, 14);
    return;
  }
  if (game.pressed("b")) { backToCounter(); return; }
  if (game.pressed("select")) {
    almanacGlossary = true; almanacGlossaryScroll = 0; glossaryScroller.offset = 0; sfx("tap"); return;
  }
  if (game.pressed("left")) moveAlmanac(-1);
  if (game.pressed("right")) moveAlmanac(1);
  if (game.pressed("start")) {
    if (almanacOffset !== 0) { almanacOffset = 0; almanacScroll = 0; almanacScroller.offset = 0; sfx("ok"); }
  } else {
    var date = almanacDate(), info = ALMANAC.day(date.y, date.m, date.d), layout = pageLayout(game.g, date, info);
    almanacScroll = scrollUpdate(almanacScroller, { x: 8, y: 36, w: 200, h: 171 },
      layout.height, elapsed, 13);
  }
}
function drawBinding(g) {
  g.rect(8, 20, 200, 15, g.MID);
  for (var pin = 17; pin < 204; pin += 12) g.circle(pin, 27, 1, g.INK, true);
  /* the stubs of pages already torn off, a ragged paper line under the strip */
  for (var x = 8; x < 208; x += 2) g.pixel(x + ((x >> 1) % 3 === 0 ? 1 : 0), 35, g.DARK);
}
function otherPage(g, offset, scroll, bottom) {
  drawAlmanacPage(g, offset, scroll, bottom);
}
/* A page is a compact printed tear-off calendar; its single content column scrolls. */
function drawAlmanacPage(g, offset, scroll, bottom) {
  if (bottom <= 36) return;
  var now = new Date(), d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
  var dt = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), week: d.getDay() };
  if (dt.y < 1900 || dt.y > 2100) return;
  var info = ALMANAC.day(dt.y, dt.m, dt.d), layout = pageLayout(g, dt, info);
  g.clip(8, 36, 200, bottom - 36);
  g.rect(8, 36, 200, 171, g.PAPER);
  var shift = Math.round(scroll || 0), mask = layout.dateMask, mx = Math.round(CX - mask.w * 1.5);
  g.text(layout.dateLine, CX, 38 - shift, { align: "center", color: g.INK });
  for (var mi = 0; mi < mask.on.length; mi += 2)
    g.rect(mx + mask.on[mi] * 3, 45 + mask.on[mi + 1] * 3 - shift, 3, 3, g.INK);
  g.text(fitPageText(g, layout.lunar, 194), CX, 88 - shift, { align: "center", color: g.INK });
  g.text(fitPageText(g, layout.pillars, 194), CX, 101 - shift, { align: "center", color: g.INK });
  g.line(14, 114 - shift, 206, 114 - shift, g.DARK);
  for (var bi = 0; bi < layout.boxes.length; bi++) {
    var box = layout.boxes[bi], by = 119 + box.y - 83 - shift;
    g.frame(box.x, by, box.w, box.h, g.INK);
    g.rect(box.x + 3, by + 2, 18, 13, g.INK);
    g.text(box.title, box.x + 12, by + 2, { align: "center", color: g.PAPER });
    for (var bl = 0; bl < box.lines.length; bl++)
      g.text(fitPageText(g, box.lines[bl], box.w - 6), box.x + box.w / 2, by + 17 + bl * layout.boxLine,
        { align: "center", color: g.INK });
  }
  var boxBottom = 119 + layout.boxes[0].y - 83 + layout.boxes[0].h - shift;
  for (var ri = 0; ri < layout.rows.length; ri++) {
    var row = layout.rows[ri], ry = boxBottom + 5 + row.y - (layout.boxes[0].y + layout.boxes[0].h + 5);
    var labelWidth = row.label ? g.measure(row.label + " ") : 0;
    if (row.label) g.text(row.label, 14, ry, { color: g.DARK });
    g.text(row.text, 14 + labelWidth, ry, { color: g.INK });
  }
  if (offset === almanacOffset) {
    almanacTotalHeight = layout.height;
    almanacScroll = Math.max(0, Math.min(almanacScroll, Math.max(0, layout.height - 171)));
    almanacScroller.max = Math.max(0, layout.height - 171);
  }
  g.clip();
  /* the page's lower edge while it hangs loose */
  if (bottom < 207) g.line(8, bottom - 1, 207, bottom - 1, g.INK);
}
/* The page peel. A fold line, square to the page's diagonal, sweeps from the bottom-right corner to the
   top-left as `amount` goes 0 to 1. Between the corner and the fold the top page is lifted, so the page beneath
   shows there; the lifted part lies folded back over the page as a flap (its mirror image across the fold),
   showing the paper's back. Both pages are drawn into the real buffer: the page beneath first, its pixels kept,
   then the top page, then the kept pixels written back where the top page is lifted. */
var PAGE = { x0: 8, y0: 36, x1: 207, y1: 206 };
function drawPeel(g, underOffset, overOffset, overScroll, amount) {
  var cx = PAGE.x1, cy = PAGE.y1, ux = PAGE.x0 - cx, uy = PAGE.y0 - cy;
  var len = Math.sqrt(ux * ux + uy * uy);
  ux /= len; uy /= len;                                   /* unit vector from the corner to the top-left */
  var d = amount * (len + 8), x, y, at = 0, kept = [];
  drawAlmanacPage(g, underOffset, 0, 207);
  for (y = PAGE.y0; y <= PAGE.y1; y++) for (x = PAGE.x0; x <= PAGE.x1; x++) kept.push(g.get(x, y));
  otherPage(g, overOffset, overScroll, 207);
  for (y = PAGE.y0; y <= PAGE.y1; y++) for (x = PAGE.x0; x <= PAGE.x1; x++) {
    var along = (x - cx) * ux + (y - cy) * uy, tone = kept[at++];
    if (along < d) g.pixel(x, y, tone);
    else if (along < d + 3 && ((x + y) & 1)) g.pixel(x, y, g.DARK);   /* the flap's shadow on the top page */
  }
  if (d <= 0) return;
  /* the lifted region: the page rectangle cut by the fold, on the corner's side */
  var corners = [{ x: PAGE.x0, y: PAGE.y0 }, { x: PAGE.x1 + 1, y: PAGE.y0 }, { x: PAGE.x1 + 1, y: PAGE.y1 + 1 },
    { x: PAGE.x0, y: PAGE.y1 + 1 }];
  var lifted = [], i, a, b, fa, fb;
  function side(q) { return (q.x - cx) * ux + (q.y - cy) * uy - d; }
  for (i = 0; i < 4; i++) {
    a = corners[i]; b = corners[(i + 1) % 4]; fa = side(a); fb = side(b);
    if (fa < 0) lifted.push(a);
    if ((fa < 0) !== (fb < 0)) {
      var t = fa / (fa - fb);
      lifted.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (lifted.length < 3) return;
  var flap = [];
  for (i = 0; i < lifted.length; i++) {
    var k = -2 * side(lifted[i]);
    flap.push({ x: lifted[i].x + k * ux, y: lifted[i].y + k * uy });
  }
  g.clip(PAGE.x0, PAGE.y0, PAGE.x1 - PAGE.x0 + 1, PAGE.y1 - PAGE.y0 + 1);
  fillPoly(g, flap, g.MID);
  for (i = 0; i < flap.length; i++) {
    a = flap[i]; b = flap[(i + 1) % flap.length];
    var onFold = Math.abs(side(lifted[i])) < 0.5 && Math.abs(side(lifted[(i + 1) % lifted.length])) < 0.5;
    g.line(a.x, a.y, b.x, b.y, onFold ? g.DARK : g.INK);
  }
  g.clip();
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
  if (almanacGlossary) {
    drawAlmanacGlossary(g);
    return;
  }
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "老黄历", en: "Almanac" }), CX, 2, { align: "center", color: g.PAPER });
  /* the block: a frame, then the binding strip that holds every page */
  g.rect(7, 19, 202, 188, g.PAPER);
  g.frame(7, 19, 202, 188, g.INK);
  var full = REDUCED_MOTION ? TEAR_TIME_REDUCED : TEAR_TIME;
  if (almanacTear > 0 && Math.abs(almanacTearFrom - almanacOffset) === 1) {
    var p = 1 - almanacTear / full, ease = p * p * (3 - 2 * p);
    /* forward the old page lifts off over the new one; back, yesterday's page lays itself down over today's */
    if (almanacTearDir > 0) drawPeel(g, almanacOffset, almanacTearFrom, almanacTearScroll, ease);
    else drawPeel(g, almanacTearFrom, almanacOffset, 0, 1 - ease);
  } else {
    drawAlmanacPage(g, almanacOffset, almanacScroll, 207);
  }
  drawBinding(g);
  g.text(game.lang === "en" ? "←→ page · START today" : "←→ 翻页 · START 今天",
    CX, 211, { align: "center", color: g.INK });
  g.text(game.lang === "en" ? "SELECT terms" : "SELECT 词条",
    CX, 226, { align: "center", color: g.INK });
}
function almanacGlossaryRows(g) {
  var rows = [], width = 190;
  for (var i = 0; i < EXPLAIN.ALMANAC.length; i++) {
    var entry = EXPLAIN.ALMANAC[i], term = entry.term[game.lang], text = entry.text[game.lang];
    var title = g.wrap(term, width), body = g.wrap(text, width);
    for (var j = 0; j < title.length; j++) rows.push({ text: title[j], color: g.INK });
    for (j = 0; j < body.length; j++) rows.push({ text: body[j], color: g.DARK });
  }
  return rows;
}
function drawAlmanacGlossary(g) {
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "老黄历 · 词条", en: "Almanac · Glossary" }), CX, 2, { align: "center", color: g.PAPER });
  var rows = almanacGlossaryRows(g), lineH = g.lineHeight || 14, area = { x: 10, y: 27, w: 196, h: 174 };
  glossaryScroller.max = Math.max(0, rows.length * lineH - area.h);
  almanacGlossaryScroll = glossaryScroller.offset;
  g.clip(10, 27, 196, 174);
  for (var i = 0; i < rows.length; i++) {
    var y = 28 + i * lineH - almanacGlossaryScroll;
    if (y >= 15 && y < 202) g.text(rows[i].text, 13, y, { color: rows[i].color });
  }
  g.clip();
  g.text(T({ zh: "↑↓读 · B/SELECT返回", en: "↑↓ read · B/SELECT back" }), CX, 211,
    { align: "center", color: g.INK });
  g.text(fitPageText(g, HINT, W), CX, 226, { align: "center", color: g.DARK });
}

function fortuneLines(g) {
  var item = slipItem(), out = [];
  for (var i = 0; i < item.verse[game.lang].length; i++)
    out = out.concat(g.wrap(item.verse[game.lang][i], 178));
  out.push("");
  return out.concat(g.wrap(item.meaning[game.lang], 178));
}
function slipVerseCount(g) {
  var item = slipItem(), count = 0;
  for (var i = 0; i < item.verse[game.lang].length; i++)
    count += g.wrap(item.verse[game.lang][i], 178).length;
  return count;
}
function updateFortune(dt) {
  syncSlipDate();
  if (game.pressed("b")) { backToCounter(); return; }
  if (slipState.slip !== null && !slipState.animating) {
    var rows = fortuneLines(game.g), lineH = game.g.lineHeight || 14;
    slipScroll = scrollUpdate(slipScroller, { x: 13, y: 68, w: 190, h: 102 },
      rows.length * lineH, dt, lineH);
    /* writing to notes is the player's own choice: START, never a question (owner, 2026-11-27) */
    if (game.pressed("start")) { appendSlip(); return; }
  } else if (game.pressed("a") || (game.pointer.pressed && game.pointer.y >= 45 && game.pointer.y <= 208)) {
    drawSlip();
  }
  if (!game.pointer.down) scrollGestureMoved = false;
}
function roundedPoly(x, y, w, h, rx, ry) {
  return [{ x: x + rx, y: y }, { x: x + w - rx, y: y },
    { x: x + w, y: y + ry }, { x: x + w, y: y + h - ry },
    { x: x + w - rx, y: y + h }, { x: x + rx, y: y + h },
    { x: x, y: y + h - ry }, { x: x, y: y + ry }];
}
function transformCupPoint(p, shift, angle, shiftY) {
  var a = angle * Math.PI / 180, x = p.x - CX, y = p.y - 92;
  return { x: CX + shift + x * Math.cos(a) - y * Math.sin(a),
    y: 92 + x * Math.sin(a) + y * Math.cos(a) + (shiftY || 0) };
}
function transformedPoly(g, pts, shift, angle, tone, outline, shiftY) {
  var out = [], i;
  for (i = 0; i < pts.length; i++) out.push(transformCupPoint(pts[i], shift, angle, shiftY));
  fillPoly(g, out, tone);
  if (outline != null) for (i = 0; i < out.length; i++)   /* INK is tone 0, so test for null, not falsy */
    g.line(out[i].x, out[i].y, out[(i + 1) % out.length].x, out[(i + 1) % out.length].y, outline);
}
function cupShake(t) {
  var frames = [[0,0,0],[.08,-5,-1.3],[.18,6,1.3],[.28,-6,-1.1],[.38,5,1.1],
    [.48,-5,-.9],[.58,4,.9],[.68,-4,-.7],[.78,3,.7],[.88,-2,-.4],[.94,2,.4],[1,0,0]];
  var p = Math.max(0, Math.min(1, t / Math.max(.001, slipAnimSpan))), i;
  for (i = 1; i < frames.length; i++) if (p <= frames[i][0]) {
    var a = frames[i - 1], b = frames[i], k = (p - a[0]) / (b[0] - a[0]);
    return { x: a[1] + (b[1] - a[1]) * k, angle: a[2] + (b[2] - a[2]) * k };
  }
  return { x: 0, angle: 0 };
}
function drawStick(g, x, bottom, height, lean, sway, tone, shift, cupAngle, shiftY) {
  var a = (lean + sway) * Math.PI / 180, half = 2.8;
  var dx = Math.sin(a) * height, dy = Math.cos(a) * height;
  var pts = [{ x: x - half, y: bottom }, { x: x + half, y: bottom },
    { x: x + dx + half, y: bottom - dy }, { x: x + dx - half, y: bottom - dy }];
  transformedPoly(g, pts, shift, cupAngle, tone, g.INK, shiftY);
  var bandY = bottom - dy + 7 * (216 / 331);
  var bandX = x + dx * .9;
  var band = [{ x: bandX - half, y: bandY }, { x: bandX + half, y: bandY },
    { x: bandX + half, y: bandY + 2 * (216 / 331) },
    { x: bandX - half, y: bandY + 2 * (216 / 331) }];
  transformedPoly(g, band, shift, cupAngle, g.DARK, null, shiftY);
}
function drawCup(g) {
  var S = 216 / 331, top = 42, idle = Math.sin(game.time * Math.PI * 2 / 5) * S;
  var t = slipState.animating ? game.time - slipAnimAt : -1, rattle = t >= 0 && t < slipAnimSpan;
  var shake = rattle ? cupShake(t) : { x: 0, angle: 0 };
  var liftStart = slipAnimSpan + (REDUCED_MOTION ? .02 : .16);
  var liftP = slipState.animating && t >= liftStart ? Math.min(1, (t - liftStart) / slipLiftSpan) : 0;
  var shift = shake.x * S, sink = liftP * 9 * S;
  var angle = shake.angle, baseline = top + 128 * S + idle;
  var lens = [110, 96, 124, 106, 118, 102, 108], leans = [-6, 4, -2, 1, 5, -4, 3.5];
  var stickLeft = [10, 24, 38, 49, 61, 75, 87];
  var sway = [0.8, 1.2, 3.5, 3.5, 3.5, 1.2, 0.8], delay = [-.4, -1.9, -3.1, -.9, -2.5, -4.2, -1.2];
  var swing = [1.4, 2.6, 3.5, 3.5, 3.5, 2.6, 1.4];
  for (var i = 0; i < 7; i++) {
    var phase = (game.time + delay[i]) / 5 * Math.PI * 2;
    var stickSway = Math.sin(phase) * sway[i];
    if (rattle) {
      var rp = (t / .13 + (i === 1 || i === 4 ? -.06 / .13 : i === 2 || i === 5 ? -.09 / .13 : 0)) * Math.PI * 2;
      stickSway = Math.sin(rp) * swing[i];
    }
    drawStick(g, CX + (-50 + stickLeft[i] + 4.5) * S, baseline,
      lens[i] * S, leans[i], stickSway, g.PAPER, shift, angle, sink);
  }
  if (liftP > 0) drawStick(g, CX, top + 128 * S + idle - liftP * 86 * S,
    128 * S, liftP * 9, 0, g.PAPER, shift, 0);
  /* CSS cup coordinates scaled by 216/331, with the same broad rim and rounded foot. */
  var cupX = CX - 52 * S, bodyTop = top + 58 * S + idle + sink, bodyBottom = top + 140 * S + idle + sink;
  transformedPoly(g, roundedPoly(cupX + 2, bodyTop, 104 * S - 4, 82 * S, 4 * S, 25 * S),
    shift, angle, g.MID, g.INK);
  var bandTop = bodyBottom - 14 * S;
  transformedPoly(g, roundedPoly(cupX + 3, bandTop, 98 * S, 14 * S, 3 * S, 8 * S), shift, angle, g.DARK);
  var shadowY = top + 164 * S + idle + sink;
  for (var sy = -3; sy <= 3; sy++) {
    var half = Math.round(30 * S * Math.sqrt(Math.max(0, 1 - sy * sy / 16)));
    var shadow = [];
    for (var sx = -half; sx <= half; sx++) shadow.push({ x: CX + sx, y: shadowY + sy });
    for (sx = 0; sx < shadow.length; sx++) g.pixel(shadow[sx].x + shift, shadow[sx].y, g.DARK);
  }
  var rimY = top + 41 * S + idle + sink;
  transformedPoly(g, roundedPoly(CX - 62 * S, rimY, 124 * S, 17 * S, 9 * S, 8 * S), shift, angle, g.PAPER, g.INK);
  g.line(CX - 52 * S + shift, rimY + 5 * S, CX + 52 * S + shift, rimY + 5 * S, g.DARK);
  if (liftP > 0) {
    var fade = Math.min(4, Math.floor(liftP * 5));
    if (fade > 0) g.dither(CX - 42, top + 39, 84, 110, g.PAPER, fade);
  }
}
function fortuneFooter(g) {
  var line;
  if (!loadComplete) line = T({ zh: "存档读取中…", en: "Reading save…" });
  else if (loadFailed) line = T({ zh: "存档读不出，今天不会保存", en: "Could not read the save; today won't be saved" });
  else if (slipState.slip === null) line = T({ zh: "A 抽签 · 点签筒 · 摇一摇", en: "A draw · tap the cup · shake" });
  else if (appendBusy) line = T({ zh: "正在写入…", en: "Saving…" });
  else if (appendStatus === "denied") line = T({ zh: "没有写入 · 今天已抽", en: "Not saved · drawn today" });
  else if (slipState.written) line = T({ zh: "已写入记事本 · 明天再来", en: "In your notes · back tomorrow" });
  else line = T({ zh: "↑↓ 读 · START 写入记事本", en: "↑↓ read · START to notes" });
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
    g.clip(0, 36, W, 172); drawCup(g); g.clip();   /* the rising stick stays under the date line */
    if (slipState.animating) {
      g.text(T({ zh: "摇签中…", en: "Shaking…" }), CX, 185, { align: "center", color: g.INK });
    }
  } else {
    var item = slipItem(), grade = item.grade[game.lang], lines = fortuneLines(g), j;
    var verseCount = slipVerseCount(g);
    var lineH = g.lineHeight || 14, area = { x: 13, y: 68, w: 190, h: 102 };
    slipScroller.max = Math.max(0, lines.length * lineH - area.h);
    slipScroll = Math.max(0, Math.min(slipScroller.max, slipScroller.offset));
    var reveal = slipRevealAt < 0 ? 1 : Math.min(1, (game.time - slipRevealAt) / (REDUCED_MOTION ? .08 : .64));
    var revealBottom = Math.round(171 * reveal);
    g.clip(8, 43, 200, Math.max(0, revealBottom));
    g.frame(8, 43, 200, 128, g.INK);
    g.frame(11, 46, 194, 122, g.DARK);
    g.text(T({ zh: "第 " + item.num + " 签", en: "No. " + item.num }), 17, 49, { color: g.INK });
    g.rect(146, 47, 56, 18, g.INK);
    g.text(grade, 174, 49, { align: "center", color: g.PAPER });
    g.clip(13, 68, 190, Math.max(0, Math.min(102, revealBottom - 25)));
    for (j = 0; j < lines.length; j++) {
      var lineShown = j < 3 ? reveal >= .28 + j * .16 : reveal >= .72;
      var y = 69 + j * lineH - slipScroll;
      if (j === verseCount) {
        if (reveal >= .65 && y >= 55 && y <= 168)
          for (var dot = 20; dot < 196; dot += 4) g.pixel(dot, y + 2, g.DARK);
      } else if (lineShown && y >= 55 && y <= 168) g.text(lines[j], 18, y, { color: g.INK });
    }
    g.clip();
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
function guaReading(lines) {
  var primary = YI.primary(lines), changed = YI.changed(lines), moving = YI.changingLines(lines);
  var count = moving.length, rows = [{ kind: "rule", text: EXPLAIN.RULES[count] }];
  var i, positions, data, line;
  function addJudgment(hex, which) {
    /* with three changing lines both judgments are read, so each says whose it is */
    rows.push({ kind: "text", text: (which || "") + "卦辞：" + hex.judgment });
  }
  function addYao(hex, n) {
    data = ZHOUYI[hex.number - 1];
    line = data.yao[n - 1];
    rows.push({ kind: "text", text: line[0] + "：" + line[1] });
    if (data.small[n - 1]) rows.push({ kind: "text", text: "象曰：" + data.small[n - 1] });
  }
  if (count === 0) addJudgment(primary);
  else if (count === 1) addYao(primary, moving[0]);
  else if (count === 2) {
    addYao(primary, moving[1]);
    addYao(primary, moving[0]);
  } else if (count === 3) {
    addJudgment(primary, "本卦");
    addJudgment(changed, "变卦");
  } else if (count === 4 || count === 5) {
    positions = [];
    for (i = 1; i <= 6; i++) if (moving.indexOf(i) < 0) positions.push(i);
    for (i = 0; i < positions.length; i++) addYao(changed, positions[i]);
  } else if (primary.short === "乾") addYao(primary, 7);
  else if (primary.short === "坤") addYao(primary, 7);
  else addJudgment(changed);
  rows.push({ kind: "source", text: EXPLAIN.RULE_SOURCE });
  return rows;
}
function guaResultRows(g) {
  var primary = YI.primary(guaState.lines), changed = YI.changed(guaState.lines), rows = [];
  var lineHeight = g.lineHeight || 14;
  function textRows(text, color, bold) {
    var wrapped = g.wrap(text, 192);
    for (var i = 0; i < wrapped.length; i++)
      rows.push({ type: "text", text: wrapped[i], color: color, bold: !!bold, height: lineHeight });
  }
  rows.push({ type: "figure", lines: guaState.lines.slice(), changed: changed, height: 54 });
  rows.push({ type: "gap", height: 6 });
  textRows(game.lang === "en" ? primary.number + " " + primary.short + " · " + primary.name :
    "第" + primary.number + "卦 " + primary.name, g.INK, true);
  if (changed) {
    var names = YI.changingLines(guaState.lines).map(function (n) { return EXPLAIN.LINE_NAMES[n - 1]; });
    textRows(T({ zh: "变卦 第" + changed.number + "卦 " + changed.name + " · 动爻：" + names.join("、"),
      en: "Changed: " + changed.number + " " + changed.short + " · " + changed.name + " · lines " + YI.changingLines(guaState.lines).join(", ") }), g.DARK);
  }
  rows.push({ type: "gap", height: 6 });
  rows.push({ type: "label", text: T({ zh: "卦辞", en: "Judgment" }), color: g.INK, height: lineHeight });
  rows.push({ type: "gap", height: 2 });
  textRows(primary.judgment, g.INK);
  rows.push({ type: "gap", height: 6 });
  rows.push({ type: "label", text: T({ zh: "解读", en: "Reading" }), color: g.INK, height: lineHeight });
  rows.push({ type: "gap", height: 2 });
  if (game.lang === "en") textRows(primary.english, g.INK);
  textRows(GUAREAD[primary.number - 1], game.lang === "en" ? g.DARK : g.INK);
  return rows;
}
function guaNoteText() {
  var primary = YI.primary(guaState.lines), changed = YI.changed(guaState.lines);
  var line = guaState.day + "  第" + primary.number + "卦 " + primary.name;
  if (changed) {
    var names = YI.changingLines(guaState.lines).map(function (n) { return EXPLAIN.LINE_NAMES[n - 1]; });
    line += " → 第" + changed.number + "卦 " + changed.name + "  动爻：" + names.join("、");
  }
  return line + "\n" + primary.judgment;
}
function appendGua() {
  syncGuaDate();
  if (guaState.lines.length !== 6 || guaState.animating || guaState.written || guaAppendBusy) return;
  if (typeof PAD === "undefined" || !PAD.notes || typeof PAD.notes.append !== "function") return;
  guaAppendBusy = true;
  var result;
  try { result = PAD.notes.append(game.lang === "en" ? "I Ching" : "八卦", guaNoteText()); }
  catch (e) { result = Promise.reject(e); }
  Promise.resolve(result).then(function (answer) {
    guaAppendBusy = false;
    guaState.written = answer === "saved";
    guaAppendStatus = answer === "saved" ? "saved" : "denied";
    if (answer === "saved") saveGua();
    sfx(answer === "saved" ? "ok" : "err");
  }, function () {
    guaAppendBusy = false;
    guaAppendStatus = "denied";
    sfx("err");
  });
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
var COIN_R = 11, TABLE_Y = 172;
/* one coin seen at `turn` (1 face on, 0 edge on), its face known only once it has landed */
function drawCoin(g, x, y, turn, back) {
  var rx = Math.max(1, Math.round(Math.abs(turn) * COIN_R)), pts = [], k;
  for (k = 0; k < 16; k++) {
    var a = k * Math.PI / 8;
    pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * COIN_R });
  }
  fillPoly(g, pts, g.MID);
  for (k = 0; k < 16; k++) g.line(pts[k].x, pts[k].y, pts[(k + 1) % 16].x, pts[(k + 1) % 16].y, g.INK);
  if (rx < 4) return;                                  /* nearly edge on: no face to see */
  g.rect(x - 1, y - 1, 3, 3, g.PAPER);                 /* the square hole */
  g.frame(x - 2, y - 2, 5, 5, g.INK);
  if (back === false || turn > 0) {                    /* the face with characters: four marks round the hole */
    var d = Math.round(rx * 0.55);
    g.rect(x - 1, y - 6, 2, 2, g.INK); g.rect(x - 1, y + 5, 2, 2, g.INK);
    if (d >= 3) { g.rect(x - d - 1, y - 1, 2, 2, g.INK); g.rect(x + d, y - 1, 2, 2, g.INK); }
  } else {                                             /* the plain back: an inner ring only */
    for (k = 0; k < 16; k += 2) g.pixel(Math.round(x + Math.cos(k * Math.PI / 8) * (rx - 3)),
      Math.round(y + Math.sin(k * Math.PI / 8) * (COIN_R - 3)), g.DARK);
  }
}
function drawTossCoins(g) {
  var toss = guaToss;
  if (!toss) return;
  var t = game.time - toss.at, reduced = REDUCED_MOTION, landedAll = true, backs = 0;
  g.line(24, TABLE_Y + COIN_R + 1, 192, TABLE_Y + COIN_R + 1, g.DARK);       /* the table's edge */
  for (var i = 0; i < 3; i++) {
    var x = CX - 38 + i * 38, start = i * 0.06, land = reduced ? TOSS_TIME_REDUCED : coinLanding(i);
    var y = TABLE_Y, turn = 1, landed = t >= land;
    if (!landed && !reduced) {
      var p = Math.max(0, (t - start) / (land - start));
      y = TABLE_Y - Math.round(Math.sin(Math.PI * p) * (40 + i * 5));       /* up and down */
      turn = Math.cos(t * (19 + i * 3));                                      /* spinning */
    } else if (landed && !reduced && t < land + 0.12) {
      y = TABLE_Y - Math.round(Math.sin(Math.PI * (t - land) / 0.12) * 3);  /* a small bounce */
    }
    if (!landed) landedAll = false;
    drawCoin(g, x, y, landed ? (toss.backs[i] ? -1 : 1) : turn, landed ? toss.backs[i] : null);
    if (toss.backs[i]) backs++;
  }
  if (!landedAll) return;
  /* name the throw the way the old books do: how many backs, its name, the line it gives */
  var names = [
    { zh: "无背 · 交 · 老阴 六 ×", en: "No backs · old yin 6 ×" },
    { zh: "一背 · 单 · 少阳 七", en: "One back · young yang 7" },
    { zh: "二背 · 拆 · 少阴 八", en: "Two backs · young yin 8" },
    { zh: "三背 · 重 · 老阳 九 ○", en: "Three backs · old yang 9 ○" }
  ];
  g.text(T(names[backs]), CX, TABLE_Y + COIN_R + 5, { align: "center", color: g.INK });
}
function updateHexagram(dt) {
  syncGuaDate();
  if (guaExplain) { updateGuaExplain(dt); return; }
  if (game.pressed("b")) { backToCounter(); return; }
  if (game.pressed("select")) {
    if (guaState.lines.length === 6) {
      guaExplain = true; guaExplainScroll = 0; guaExplainScroller.offset = 0;
      sfx("tap");
    }
    return;
  }
  if (guaState.lines.length === 6 && !guaState.animating) {
    var rows = guaResultRows(game.g), total = 0;
    for (var i = 0; i < rows.length; i++) total += rows[i].height;
    guaScroll = scrollUpdate(guaScroller, guaArea(), total, dt, game.g.lineHeight || 14);
    if (game.pressed("start")) appendGua();
    return;
  }
  var p = game.pointer;
  if (p.pressed && !guaState.animating && guaState.lines.length < 6 && p.y >= 40 && p.y <= 205) tossGuaLine();
  if (game.pressed("a")) tossGuaLine();
}
function drawHexagram(g) {
  syncGuaDate();
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "八卦", en: "I Ching" }), CX, 2, { align: "center", color: g.PAPER });
  if (!guaState.loaded) {
    g.text(T({ zh: "存档读取中…", en: "Reading save…" }), CX, 96, { align: "center", color: g.DARK });
  } else if (guaState.lines.length === 6) {
    var rows = guaResultRows(g), total = 0, y = 22 - guaScroller.offset;
    for (var i = 0; i < rows.length; i++) total += rows[i].height;
    var area = guaArea();
    guaScroller.max = Math.max(0, total - area.h);
    guaScroll = guaScroller.offset;
    g.clip(area.x, area.y, area.w, area.h);
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.type === "figure") {
        var c = row.changed;
        if (c) {
          drawGuaFigure(g, 42, y + 47, row.lines, 42);
          drawArrow(g, CX, y + 26);
          drawGuaFigure(g, 123, y + 47, c.lines, 42, true);
        } else drawGuaFigure(g, 87, y + 47, row.lines, 42);
      } else if (row.type === "text") {
        g.text(row.text, 10, y, { color: row.color });   /* a shadowed pixel font smears; the name stands out by its own line */
      } else if (row.type === "label") {
        g.text(row.text, 10, y, { color: g.INK });
      }
      y += row.height;
    }
    g.clip();
  } else {
    if (!guaState.lines.length) g.text(T({ zh: "心里想一个问题，再起卦", en: "Hold one question in mind, then cast" }), 6, 42,
      { align: "center", color: g.INK, width: 204 });   /* with a width, align centres inside it from x */
    else g.text(T({ zh: "占卦 " + guaState.lines.length + "/6", en: "Casting " + guaState.lines.length + "/6" }),
      CX, 34, { align: "center", color: g.INK });
    if (guaState.lines.length) drawGuaFigure(g, 77, 114 + (guaState.lines.length - 1) * 4, guaState.lines, 48);
    if (guaState.animating) drawTossCoins(g);
    if (guaState.failed && !guaState.animating) g.text(T({ zh: "存档读不出，今天不会保存",
      en: "Could not read the save; today won't be saved" }), CX, 190, { align: "center", color: g.DARK, width: 210 });
  }
  var key = guaState.lines.length !== 6 ? T({ zh: "A 起卦", en: "A cast" }) :
    guaAppendBusy ? T({ zh: "正在写入…", en: "Saving…" }) :
    guaState.written ? T({ zh: "已写入 · SELECT详解", en: "Saved · SELECT more" }) :
    guaAppendStatus === "denied" ? T({ zh: "没有写入 · SELECT详解", en: "Not saved · SELECT more" }) :
    T({ zh: "START记事本 · SELECT详解", en: "START notes · SELECT more" });
  var keyLines = g.wrap(key, W);
  for (var ki = 0; ki < keyLines.length; ki++)
    g.text(keyLines[ki], CX, 211 + ki * (g.lineHeight || 14), { align: "center", color: g.INK });
}
function guaExplainRows(g) {
  var lineHeight = g.lineHeight || 14, rows = [], width = 192;
  var primary = YI.primary(guaState.lines), data = ZHOUYI[primary.number - 1];
  function add(label, text, color) {
    if (label) {
      rows.push({ type: "label", text: label, color: g.INK, height: lineHeight });
      rows.push({ type: "gap", height: 2 });
    }
    var wrapped = g.wrap(text, width);
    for (var i = 0; i < wrapped.length; i++) rows.push({ type: "text", text: wrapped[i], color: color == null ? g.INK : color, height: lineHeight });
    rows.push({ type: "gap", height: 6 });
  }
  var reading = guaReading(guaState.lines), count = YI.changingLines(guaState.lines).length;
  add(T({ zh: "读法", en: "Reading rule" }), EXPLAIN.RULES[count][game.lang]);
  for (var r = 0; r < reading.length; r++) if (reading[r].kind === "text") {
    var quote = game.t(reading[r].text);
    /* The rule source is repeated at the end of this page, after the casting instructions. */
    add("", quote);
  }
  add(T({ zh: "彖", en: "Tuan" }), data.tuan);
  add(T({ zh: "怎么起卦", en: "How to cast" }), EXPLAIN.HOW[game.lang]);
  var source = g.wrap(EXPLAIN.RULE_SOURCE[game.lang], width);
  for (var j = 0; j < source.length; j++) rows.push({ type: "text", text: source[j], color: g.DARK, height: lineHeight });
  return rows;
}
function updateGuaExplain(dt) {
  if (game.pressed("b") || game.pressed("select")) { guaExplain = false; guaExplainScroll = 0; guaScroller.offset = 0; sfx("tap"); return; }
  var rows = guaExplainRows(game.g), total = 0;
  for (var i = 0; i < rows.length; i++) total += rows[i].height;
  guaExplainScroll = scrollUpdate(guaExplainScroller, { x: 10, y: 27, w: 196, h: 174 }, total, dt, game.g.lineHeight || 14);
}
function drawGuaExplain(g) {
  g.clear(g.PAPER);
  g.rect(0, 0, W, 19, g.INK);
  g.text(T({ zh: "八卦 · 详解", en: "I Ching · More" }), CX, 2, { align: "center", color: g.PAPER });
  var rows = guaExplainRows(g), total = 0, area = { x: 10, y: 27, w: 196, h: 174 };
  for (var i = 0; i < rows.length; i++) total += rows[i].height;
  guaExplainScroller.max = Math.max(0, total - area.h);
  guaExplainScroll = guaExplainScroller.offset;
  g.clip(area.x, area.y, area.w, area.h);
  var y = area.y - guaExplainScroll;
  for (i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.type !== "gap") g.text(row.text, 10, y, { color: row.color });
    y += row.height;
  }
  g.clip();
  g.text(T({ zh: "↑↓ 读 · B/SELECT 返回", en: "↑↓ read · B/SELECT back" }), CX, 211, { align: "center", color: g.INK });
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
  enter: function () { section = "almanac"; almanacScroll = 0; almanacScroller.offset = 0; syncMotion(); },
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
  draw: function (g) { if (guaExplain) drawGuaExplain(g); else drawHexagram(g); }
});

readSlip();
readGua();
game.start("counter");
