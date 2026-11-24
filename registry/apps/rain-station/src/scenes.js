/* The pictures: each scene draws the top 160 x 88 pixels from `st`, what the story put in it
   (story.js `at` and `stage`), and `live`, the moving values that ease toward it (the train, the
   father running, the platform sliding away). Everything is drawn with rectangles, lines and a
   few small sprites, so it stays four tones and costs nothing to change. */

var PIC_H = 88;

/* figures, one pixel each: 0 ink, 1 dark, 2 mid, 3 paper, . clear */
var FIG = LoGame.sprites({
  /* the father, standing: dark jacket, grey trousers */
  dad: [
    "...000...", "..00000..", "..03330..", "..03330..", "...000...", "..01110..", ".0111110.", ".0111110.",
    ".0111110.", ".0311130.", ".0111110.", "..01110..", "..02220..", "..02220..", "..02020..", "..02020..",
    "..02020..", "..02020..", "..00.00.."],
  /* sitting on the bench, seen from the front, hands on the knees; the same body as standing, folded */
  sit: [
    "...000...", "..00000..", "..03330..", "..03330..", "...000...", "..01110..", ".0111110.", ".0111110.",
    ".0311130.", ".0222220.", "..02.20..", "..02.20..", "..02.20..", "..00.00.."],
  /* crouching by the backpack, one hand in the side pocket */
  dadCrouch: [
    "...000.....", "..00000....", "..03330....", "..03330....", "...000.....", "..011110...", ".01111110..",
    ".011111103.", ".02222220..", ".02200220..", ".00000000.."],
  /* Old Zhou: a railway cap and a grey jacket */
  zhou: [
    "..00000..", ".0000000.", "..03330..", "..03330..", "...000...", "..02220..", ".0222220.", ".0222220.",
    ".0222220.", ".0322230.", ".0222220.", "..02220..", "..01110..", "..01110..", "..01010..", "..01010..",
    "..01010..", "..01010..", "..00.00.."],
  zhouHead: ["..00000..", ".0000000.", "..03330..", "..03330..", "...000...", "..02220..", ".0222220.", ".0222220."],
  /* the attendant on the step of carriage seven */
  guard: [
    "..00000..", ".0000000.", "..03330..", "..03330..", "...000...", "..00000..", ".0000000.", ".0300030.",
    ".0000000.", ".0300030.", ".0000000.", "..00000..", "..01110..", "..01010..", "..01010..", "..01010..",
    "..01010..", "..01010..", "..00.00.."],
  bike: [
    "...........00..........", "..........0110.........", "....000000111100.......", "...01111111111110......",
    "..0011100000011100.....", ".00.....0...0...00.....", "0..0...........0..0....", "0.000..........0.000...",
    "0..0...........0..0....", ".00.............00....."],
  pack: [".0000.", "011110", "011110", "012210", "011110", "011110", "000000"],
  coat: ["..0000000..", ".022222220.", "02222222220", "00000000000"]
});

/* a tiny 3 x 5 digit font, for the pillar plates, the carriage numbers and the chalk board */
var DIGITS = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001111", "K": "101101110101101", ":": "000010000010000"
};
function tiny(g, s, x, y, tone) {
  for (var i = 0; i < s.length; i++) {
    var d = DIGITS[s.charAt(i)];
    if (d) for (var p = 0; p < 15; p++) if (d.charAt(p) === "1") g.pixel(x + i * 4 + (p % 3), y + Math.floor(p / 3), tone);
  }
}
function plate(g, s, x, y) {
  g.rect(x, y, 4 * s.length + 3, 9, g.PAPER); g.frame(x, y, 4 * s.length + 3, 9, g.INK); tiny(g, s, x + 2, y + 2, g.INK);
}

/* rain: `n` streaks moving down-left inside a box; they repeat every second or so, so a frame is
   the same for the same clock */
function rain(g, x, y, w, h, n, tone, speed) {
  if (!n) return;
  var t = game.time * (speed || 1);
  for (var i = 0; i < n; i++) {
    var rx = x + ((i * 37 + Math.floor(t * 40)) % (w + 8)) - 4;
    var ry = y + ((i * 23 + Math.floor(t * 150)) % h);
    var len = Math.min(5, y + h - ry);
    if (len > 1) g.line(rx, ry, rx - 1, ry + len - 1, tone);
  }
}
function heavy(st) { return st.rain === 2 ? 36 : st.rain === 1 ? 14 : 0; }

/* the platform pillars stand 42 pixels apart, about twenty metres; pillar k is at x = PILLAR(k) */
function PILLAR(k) { return 14 + (k - 1) * 42; }
/* the train heads right; carriage 1 is in front. live.train is the x of carriage 1's left edge.
   Carriage k's left edge is live.train - (k - 1) * CAR. */
var CAR = 62;
var TRAIN_AT = {
  none: -80, light: -80,
  pass: PILLAR(2) - 30 + 5 * CAR,   /* carriage six in front of the father */
  stop: PILLAR(3) - 30 + 6 * CAR    /* carriage seven stops under pillar three */
};

function drawTrain(g, pos) {
  for (var k = 1; k <= 14; k++) {
    var x = pos - (k - 1) * CAR;
    if (x > 160 || x + CAR < 0) continue;
    g.rect(x, 24, CAR - 2, 40, g.MID); g.frame(x, 24, CAR - 2, 40, g.INK);
    g.rect(x, 24, CAR - 2, 4, g.DARK);
    for (var w = 0; w < 4; w++) { g.rect(x + 6 + w * 12, 32, 8, 8, g.PAPER); g.frame(x + 6 + w * 12, 32, 8, 8, g.INK); }
    g.rect(x + CAR - 12, 30, 8, 32, g.DARK); g.frame(x + CAR - 12, 30, 8, 32, g.INK);
    plate(g, String(k), x + 24, 46);
    g.rect(x, 62, CAR - 2, 3, g.INK);
    if (k === 1) { g.rect(x + CAR - 4, 30, 4, 20, g.INK); g.circle(x + CAR - 3, 54, 2, g.PAPER, true); }
  }
}

function drawPlatform(g, st, live, dawn) {
  g.rect(0, 0, 160, PIC_H, dawn ? g.MID : g.INK);
  if (dawn) g.dither(0, 0, 160, 30, g.PAPER, 2);
  else g.dither(0, 14, 160, 18, g.DARK, 1);
  /* far hills */
  for (var hx = 0; hx < 160; hx++) g.line(hx, 40 - Math.round(5 * Math.sin(hx / 17) + 3 * Math.sin(hx / 7)), hx, 64, dawn ? g.DARK : g.INK);
  rain(g, 0, 13, 160, 52, heavy(st), dawn ? g.PAPER : g.DARK);
  if (st.train === "light") { g.dither(0, 30, 26, 30, g.PAPER, 1); g.circle(1, 50, 3, g.PAPER, true); }
  if (live.train > -70) drawTrain(g, live.train);
  /* the platform and its yellow line */
  g.rect(0, 66, 160, 22, g.DARK); g.line(0, 66, 160, 66, g.INK);
  for (var s = 0; s < 160; s += 6) g.rect(s, 68, 4, 1, g.PAPER);
  /* the shelter */
  g.rect(0, 6, 160, 6, g.DARK); g.line(0, 12, 160, 12, g.INK); g.line(0, 6, 160, 6, g.INK);
  for (var k = 1; k <= 4; k++) {
    var px = PILLAR(k);
    g.rect(px - 1, 12, 3, 56, g.INK);
    plate(g, String(k), px - 3, 15);
  }
  /* the attendant on the step of carriage seven */
  if (st.guard) g.sprite(FIG.guard, live.train - 6 * CAR + CAR - 13, 65);
  if (typeof st.dad === "number" && typeof live.dad === "number") {
    var dx = Math.round(PILLAR(live.dad)) - 4, bob = live.moving ? Math.floor(game.time * 8) % 2 : 0;
    g.sprite(FIG.dad, dx, 65 - bob);
    { g.rect(dx + 8, 73 - bob, 7, 8, g.MID); g.frame(dx + 8, 73 - bob, 7, 8, g.INK); g.line(dx + 9, 76 - bob, dx + 13, 76 - bob, g.PAPER); }
  }
}

var SCENES = {
  /* outside the station: the motorbike, the lit windows, the sign */
  outside: function (g, st) {
    g.rect(0, 0, 160, PIC_H, g.INK); g.dither(0, 0, 160, 20, g.DARK, 1);
    g.rect(30, 34, 100, 36, g.DARK); g.rect(26, 30, 108, 4, g.INK);
    for (var w = 0; w < 2; w++) {
      var wx = w ? 98 : 44;
      g.rect(wx, 44, 16, 12, g.PAPER); g.frame(wx, 44, 16, 12, g.INK); g.line(wx + 8, 44, wx + 8, 55, g.INK);
      g.dither(wx - 2, 72, 20, 10, g.MID, 2);
    }
    g.rect(72, 46, 16, 24, g.MID); g.frame(72, 46, 16, 24, g.INK);
    var sw = game.lang === "zh" ? 44 : 60;
    g.rect(80 - sw / 2, 14, sw, 16, g.PAPER); g.frame(80 - sw / 2, 14, sw, 16, g.INK); g.rect(64, 30, 2, 2, g.INK); g.rect(94, 30, 2, 2, g.INK);
    g.text(T({ zh: "青石", en: "QINGSHI" }), 80, 15, { align: "center", color: g.INK });
    g.rect(0, 70, 160, 18, g.DARK); g.line(0, 70, 160, 70, g.INK);
    g.rect(144, 26, 2, 44, g.INK); g.dither(136, 18, 18, 14, g.MID, 2); g.circle(145, 24, 3, g.PAPER, true);
    g.sprite(FIG.bike, 6, 61);
    rain(g, 0, 0, 160, 86, heavy(st) + 8, g.MID);
  },

  /* the waiting room: ticket window, chalk board, door, clock, bench, a window on the rain */
  waiting: function (g, st) {
    /* one scale for everyone: a standing person is 19 pixels, feet on y 64; the counter is at chest height */
    g.rect(0, 0, 160, 62, g.MID); g.dither(0, 0, 160, 8, g.DARK, 2);
    g.rect(0, 62, 160, 26, g.DARK); g.line(0, 62, 160, 62, g.INK);
    /* ticket window: lit, with Old Zhou behind it unless he has come out */
    g.rect(4, 28, 32, 24, g.INK); g.rect(6, 30, 28, 22, g.PAPER);
    if (st.zhou !== "near") g.sprite(FIG.zhouHead, 15, 45);
    g.rect(2, 52, 36, 3, g.DARK); g.frame(2, 52, 36, 3, g.INK); g.rect(4, 55, 32, 8, g.DARK);
    g.rect(26, 47, 7, 5, g.DARK); g.pixel(28, 49, g.PAPER);   /* the radio */
    /* the board: K728, 50 */
    if (st.board) { g.rect(40, 24, 18, 17, g.INK); g.frame(40, 24, 18, 17, g.DARK); tiny(g, "K728", 41, 27, g.PAPER); tiny(g, "50", 45, 34, g.MID); }
    /* the door, a head taller than a man */
    g.rect(62, 38, 14, 26, g.DARK); g.frame(62, 38, 14, 26, g.INK); g.pixel(73, 51, g.PAPER);
    /* the clock */
    g.circle(102, 18, 7, g.PAPER, true); g.circle(102, 18, 7, g.INK, false);
    g.line(102, 18, 102, 13, g.INK); g.line(102, 18, 106, 20, g.INK);
    /* the window on the rain */
    g.rect(124, 14, 30, 28, g.INK); g.frame(124, 14, 30, 28, g.DARK);
    rain(g, 126, 16, 26, 24, 10, g.MID);
    g.line(139, 14, 139, 41, g.DARK); g.line(124, 28, 153, 28, g.DARK);
    /* the bench: back, seat, legs */
    g.rect(80, 54, 42, 2, g.INK); g.rect(80, 57, 42, 2, g.INK);
    g.rect(82, 59, 2, 5, g.INK); g.rect(118, 59, 2, 5, g.INK);
    /* you, on the right of the bench: a lighter jacket; headphones while the rain is muffled */
    g.sprite(FIG.sit, 104, 50, { map: [0, 2, 1, 3] });
    if (st.muffle) { g.line(105, 50, 111, 50, g.INK); g.rect(105, 52, 1, 2, g.INK); g.rect(111, 52, 1, 2, g.INK); }
    g.sprite(FIG.pack, 115, 57);
    /* Dad, on the left of the bench, or wherever the story put him */
    var dad = st.dad;
    if (dad === "out" || dad === "wet") g.sprite(FIG.coat, 81, 55);
    if (dad === "bench" || dad === "wet") {
      g.sprite(FIG.sit, 86, 50, dad === "wet" ? { map: [0, 0, 2, 3] } : undefined);
      g.rect(88, 57, 5, 7, g.MID); g.frame(88, 57, 5, 7, g.INK);   /* the suitcase between his knees */
    } else {
      g.rect(88, 57, 5, 7, g.MID); g.frame(88, 57, 5, 7, g.INK);
      if (dad === "window") g.sprite(FIG.dad, 30, 45);
      else if (dad === "stand") g.sprite(FIG.dad, 122, 45);
      else if (dad === "crouch") g.sprite(FIG.dadCrouch, 120, 53, { flip: true });
    }
    if (st.zhou === "near") { g.sprite(FIG.zhou, 128, 45); g.rect(125, 53, 4, 4, g.PAPER); g.frame(125, 53, 4, 4, g.INK); }
  },

  platform: function (g, st, live) { drawPlatform(g, st, live, false); },

  /* from inside carriage seven: the father under pillar three; then the platform slides away */
  window: function (g, st, live) {
    g.rect(0, 0, 160, PIC_H, g.DARK);
    g.clip(20, 8, 120, 62);
    g.rect(20, 8, 120, 62, g.INK);
    rain(g, 20, 8, 120, 46, heavy(st), g.DARK);
    var off = live.slide;
    g.rect(20, 54, 120, 16, g.DARK); g.line(20, 54, 140, 54, g.MID);
    for (var k = 1; k <= 6; k++) {
      var px = 84 + (3 - k) * 84 + off;
      if (k === 6) { g.rect(px - 200, 54, 200, 16, g.INK); continue; }   /* the end of the platform */
      if (px < 10 || px > 150) continue;
      g.rect(px - 1, 8, 3, 46, g.MID);
      plate(g, String(k), px - 3, 20);
    }
    g.rect(20, 8, 120, 4, g.DARK);
    if (st.dad) g.sprite(FIG.dad, 76 + off, 36);
    /* the glass: water running down it; only the lower half when the window is pushed open */
    var top = st.open ? 40 : 8;
    for (var i = 0; i < 16; i++) {
      var gx = 24 + ((i * 29) % 112), gy = top + ((i * 13 + Math.floor(game.time * (6 + (i % 5) * 3))) % (70 - top));
      g.line(gx, gy, gx, Math.min(69, gy + 3 + (i % 3)), g.MID);
    }
    g.clip();
    g.frame(20, 8, 120, 62, g.INK); g.frame(19, 7, 122, 64, g.INK);
    if (st.open) { g.rect(20, 39, 120, 3, g.INK); g.line(20, 39, 140, 39, g.MID); }
    else g.line(20, 39, 140, 39, g.INK);
    g.rect(14, 70, 132, 6, g.MID); g.frame(14, 70, 132, 6, g.INK);
    g.rect(0, 76, 160, 12, g.INK);
  },

  /* a sleeper berth at night; lights pass the window; the phone, when it lights up */
  berth: function (g, st) {
    g.rect(0, 0, 160, PIC_H, g.INK);
    g.rect(108, 18, 42, 32, g.DARK); g.frame(108, 18, 42, 32, g.MID);
    g.clip(109, 19, 40, 30);
    var t = game.time;
    for (var i = 0; i < 2; i++) { var lx = 150 - ((t * 50 + i * 90) % 180); g.rect(Math.floor(lx), 30 + i * 6, 3, 2, g.PAPER); }
    rain(g, 109, 19, 40, 30, heavy(st), g.MID, 0.6);
    g.clip();
    g.rect(0, 14, 100, 3, g.DARK); g.rect(0, 62, 100, 3, g.DARK); g.rect(98, 14, 2, 74, g.DARK);
    g.rect(6, 54, 84, 8, g.DARK); g.dither(6, 50, 50, 6, g.DARK, 2);
    if (st.phone) {
      g.dither(52, 36, 44, 30, g.DARK, 2);
      g.rect(66, 42, 16, 22, g.PAPER); g.frame(66, 42, 16, 22, g.INK);
      g.rect(69, 46, 10, 2, g.MID); g.rect(69, 50, 8, 2, g.MID); g.rect(69, 54, 10, 2, g.MID);
    }
  }
};

/* the picture under the end card: the empty platform in the first light, no rain */
function drawEndPicture(g) { drawPlatform(g, { rain: 0 }, { train: -200, dad: null }, true); }
/* the title: the platform at night in the rain, nobody on it yet */
function drawTitlePicture(g) { drawPlatform(g, { rain: 2 }, { train: -200, dad: null }, false); }

/* what you hear: rain, by scene, softer with the headphones on; none once the rain stops */
var RAIN_LEVEL = { title: 0.4, outside: 0.7, waiting: 0.45, platform: 0.8, window: 0.6, berth: 0.25 };
function hearing(scene, st) {
  if (!st || st.rain === 0) return null;
  var l = RAIN_LEVEL[scene] || 0;
  return st.muffle ? 0.1 : l;
}

var SOUNDS = {
  horn: { wave: "triangle", from: 196, to: 185, ms: 1100, attack: 80, decay: 700, vol: 0.6 },
  brake: { wave: "noise", from: 4000, to: 2500, ms: 900, attack: 60, decay: 700, vol: 0.25 },
  buzz: { wave: "square", duty: 2, from: 90, to: 90, ms: 320, attack: 5, decay: 60, vol: 0.35 }
};
