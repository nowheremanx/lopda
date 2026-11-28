/* The pictures: each scene draws the top 160 x 88 pixels from `st`, what the story put in it
   (story.js `at` and `stage`), and `live`, the moving values that ease toward it (the train, the
   father running, the platform sliding away). Everything is drawn with rectangles, lines and a
   few small sprites, so it stays four tones and costs nothing to change. */

var PIC_H = 88;

/* figures, one pixel each: 0 ink, 1 dark, 2 mid, 3 paper, . clear */
var FIG_ROWS = {
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
};
var FIG = LoGame.sprites(FIG_ROWS);

/* Close views (the waiting room, the train window) use finer figures, drawn at twice the detail of
   the platform's: a standing man is 38 pixels. Objects there are the small ones, doubled. */
var FINE_ROWS = {
  dad: [
    ".....00000000.....", "....0011111100....", "....0233333320....", "....0233333320....",
    "...033003300330...", "...033303303330...", "....0332322330....", "....0323003230....",
    "....0332332330....", ".....00000000.....", "......033330......", "....0010330100....",
    "..00111033011100..", ".0111111001111110.", ".0111011011101110.", ".0110111011110110.",
    ".0110111011110110.", ".0110111011110110.", ".0110111011110110.", ".0110000000000110.",
    ".0330TTTTTTTT0330.", "..00.0TTTTTTT0.00.", "....0222002220....", "....0222002220....",
    "....0222002220....", "....0222002220....", "....0222002220....", "....0222002220....",
    "....0222002220....", "....0222002220....", "....0222002220....", "....0222002220....",
    "....0222002220....", "....0222002220....", "....0222002220....", "....0222002220....",
    "....0222002220....", "....0222002220....", "...000000000000...", "..0000000.000000.."
  ],
  dadSit: [
    ".....00000000.....", "....0011111100....", "....0233333320....", "....0233333320....",
    "...033003300330...", "...033303303330...", "....0332322330....", "....0323003230....",
    "....0332332330....", ".....00000000.....", "......033330......", "....0010330100....",
    "..00111033011100..", ".0111111001111110.", ".0111011011101110.", ".0110111011110110.",
    ".0110111011110110.", ".0110111011110110.", ".0110111011110110.", ".0110000000000110.",
    ".0330222222220330.", "..00022220222000..", "....02220.02220...", "....02220.02220...",
    "....02220.02220...", "....02220.02220...", "....02220.02220...", "....02220.02220...",
    "...00000..00000..."
  ],
  youSit: [
    ".....00000000.....", "...000000000000...", "...000000000000...", "...000000300000...",
    "...000333333300...", "...033303303330...", "....0330330330....", "....0323333230....",
    ".....03313330.....", "......000000......", "......033330......", "...002222222200...",
    "..0222232232220...", ".0222223003222220.", ".0222023023202220.", ".0220222022220220.",
    ".0220222022220220.", ".0220222022220220.", ".0220222022220220.", ".0220000000000220.",
    ".0330111111110330.", "..00011110111000..", "....01110.01110...", "....01110.01110...",
    "....01110.01110...", "....01110.01110...", "....01110.01110...", "....01110.01110...",
    "...00000..00000..."
  ],
  /* seen from the side, crouched by the backpack, one hand going into its side pocket */
  dadCrouch: [
    "...........0000000........", "..........001111100.......", ".........00211333300......", ".........02233333330......",
    ".........02233003030......", ".........0223233330.......", ".........02333333330......", "..........033333030.......",
    "..........02223330........", "...........033300.........", "..........003330..........", ".........01111110.........",
    "........0111111100........", ".......01111101110........", "......0111111101100.......", "......0111111101110.......",
    ".....011111111101100......", "....0111111111001110......", "...011111111110001110.....", "..01111111111222201110....",
    "..011111111122222201110...", "..0111111112222222201330..", "..0122222222222222220330..", "..022222222222222222200...",
    "..0222222222220022220.....", "..022222222000.022220.....", "...00000000....022220.....", "...000000......00000000..."
  ],
  zhou: [
    "...000000000000...", "...022223322220...", "....0000000000....", "....0233333320....",
    "...032233332230...", "...033303303330...", "....0333332330....", "....0331111330....",
    "....0333003330....", ".....00000000.....", "......033330......", "....0020110200....",
    "..00222011022200..", ".0222222002222220.", ".0222022032202220.", ".0220222022220220.",
    ".0220222032220220.", ".0220222022220220.", ".0220222032220220.", ".0220000000000220.",
    ".0330TTTTTTTT0330.", "..00.0TTTTTTT0.00.", "....0111001110....", "....0111001110....",
    "....0111001110....", "....0111001110....", "....0111001110....", "....0111001110....",
    "....0111001110....", "....0111001110....", "....0111001110....", "....0111001110....",
    "....0111001110....", "....0111001110....", "....0111001110....", "....0111001110....",
    "....0111001110....", "....0111001110....", "...000000000000...", "..0000000.000000.."
  ],
  zhouBust: [
    "...000000000000...", "...022223322220...", "....0000000000....", "....0233333320....",
    "...032233332230...", "...033303303330...", "....0333332330....", "....0331111330....",
    "....0333003330....", ".....00000000.....", "......033330......", "....0020110200....",
    "..00222011022200..", ".0222222002222220.", ".0222022032202220.", ".0220222022220220.",
    ".0220222032220220.", ".0220222022220220.", ".0220222032220220."
  ],
};
var FINE = LoGame.sprites(FINE_ROWS);
function doubled(rows) {
  var out = [];
  rows.forEach(function (r) { var w = r.replace(/./g, "$&$&"); out.push(w, w); });
  return out;
}
/* an eighth note, for the tune in your headphones */
var NOTE = LoGame.sprite(["..0..", "..00.", "..0.0", "000..", "000.."]);
var BIG = { pack: LoGame.sprite(doubled(FIG_ROWS.pack)), coat: LoGame.sprite(doubled(FIG_ROWS.coat)) };

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
    /* People here are drawn at twice the size of the platform's: a standing man is 38 pixels, feet on
       y 64. Everything else is measured from him: the door 48 (about 2.1 m), the counter at his chest,
       the seat at his knee. */
    g.rect(0, 0, 160, 64, g.MID); g.dither(0, 0, 160, 4, g.DARK, 2);
    g.rect(0, 64, 160, 24, g.DARK); g.line(0, 64, 160, 64, g.INK);
    /* ticket window: lit, with Old Zhou behind it unless he has come out */
    g.rect(2, 10, 34, 34, g.INK); g.rect(4, 12, 30, 32, g.PAPER);
    if (st.zhou !== "near") g.sprite(FINE.zhouBust, 10, 25);
    g.rect(0, 44, 38, 4, g.DARK); g.frame(0, 44, 38, 4, g.INK); g.rect(2, 48, 34, 16, g.DARK);
    g.rect(26, 37, 8, 7, g.DARK); g.frame(26, 37, 8, 7, g.INK); g.pixel(29, 40, g.PAPER);   /* the radio */
    /* the board by the window: K728, 50 */
    if (st.board) { g.rect(38, 14, 18, 17, g.INK); g.frame(38, 14, 18, 17, g.DARK); tiny(g, "K728", 39, 17, g.PAPER); tiny(g, "50", 43, 24, g.MID); }
    /* the door, with the clock above it */
    g.rect(58, 16, 22, 48, g.DARK); g.frame(58, 16, 22, 48, g.INK); g.rect(75, 40, 2, 3, g.PAPER);
    g.circle(69, 7, 5, g.PAPER, true); g.circle(69, 7, 5, g.INK, false); g.line(69, 7, 69, 4, g.INK); g.line(69, 7, 72, 8, g.INK);
    /* the window on the rain, above the bench */
    g.rect(102, 4, 48, 26, g.INK); g.frame(102, 4, 48, 26, g.DARK);
    rain(g, 104, 6, 44, 22, st.muffle ? 5 : 12, st.muffle ? g.DARK : g.MID);
    g.line(126, 4, 126, 29, g.DARK);
    /* the bench: the back below the shoulders, the seat at the knee */
    g.rect(90, 49, 64, 3, g.INK); g.rect(90, 54, 64, 3, g.INK);
    g.rect(92, 57, 3, 7, g.INK); g.rect(149, 57, 3, 7, g.INK);
    /* you, on the left of the bench, a lighter jacket; headphones while the rain is muffled */
    g.sprite(FINE.youSit, 96, 35);
    if (st.muffle) {
      /* headphones you can see from the door: a band over the hair, a cup on each ear, and a tune rising */
      g.rect(100, 33, 10, 2, g.INK); g.rect(99, 34, 2, 4, g.INK); g.rect(109, 34, 2, 4, g.INK);
      g.rect(97, 37, 4, 5, g.INK); g.rect(109, 37, 4, 5, g.INK); g.rect(98, 38, 2, 3, g.DARK); g.rect(110, 38, 2, 3, g.DARK);
      for (var k = 0; k < 2; k++) {
        var p = (game.time * 0.5 + k * 0.5) % 1, ny = Math.round(32 - p * 14), nx = 86 + k * 4 + Math.round(Math.sin(p * 6) * 1.5);
        g.sprite(NOTE, nx, ny);
      }
    }
    g.sprite(BIG.pack, 80, 50);
    /* Dad, on the right of the bench, or wherever the story put him */
    var dad = st.dad;
    if (dad === "out" || dad === "wet") g.sprite(BIG.coat, 124, 45);
    if (dad === "bench" || dad === "wet") {
      g.sprite(FINE.dadSit, 128, 35);
      if (dad === "wet") {
        /* back from the rain without the coat: water runs off his shoulders and gathers under the bench */
        g.rect(126, 65, 22, 1, g.MID); g.rect(130, 66, 14, 1, g.MID);
        for (var d = 0; d < 4; d++) {
          var q = (game.time * 0.9 + d * 0.27) % 1, dx = [129, 145, 131, 143][d];
          g.rect(dx, Math.round(47 + q * 17), 1, 2, g.PAPER);
        }
        g.pixel(131, 47, g.PAPER); g.pixel(143, 48, g.PAPER); g.pixel(134, 36, g.PAPER); g.pixel(140, 37, g.PAPER);
      }
      g.rect(133, 55, 9, 9, g.MID); g.frame(133, 55, 9, 9, g.INK); g.line(134, 58, 140, 58, g.PAPER);   /* the suitcase between his knees */
    } else {
      g.rect(133, 55, 9, 9, g.MID); g.frame(133, 55, 9, 9, g.INK); g.line(134, 58, 140, 58, g.PAPER);
      if (dad === "window") g.sprite(FINE.dad, 30, 24);
      else if (dad === "stand") g.sprite(FINE.dad, 62, 24);
      else if (dad === "crouch") g.sprite(FINE.dadCrouch, 58, 64 - FINE_ROWS.dadCrouch.length);
    }
    if (st.zhou === "near") { g.sprite(FINE.zhou, 62, 24); g.rect(78, 44, 6, 6, g.PAPER); g.frame(78, 44, 6, 6, g.INK); }
  },

  platform: function (g, st, live) { drawPlatform(g, st, live, false); },

  /* from inside carriage seven: the father under pillar three; then the platform slides away */
  window: function (g, st, live) {
    g.rect(0, 0, 160, PIC_H, g.DARK);
    g.clip(20, 8, 120, 62);
    g.rect(20, 8, 120, 62, g.INK);
    rain(g, 20, 8, 120, 52, heavy(st), g.DARK);
    var off = live.slide;
    g.rect(20, 60, 120, 10, g.DARK); g.line(20, 60, 140, 60, g.MID);
    for (var k = 1; k <= 6; k++) {
      var px = 84 + (3 - k) * 84 + off;
      if (k === 6) { g.rect(px - 200, 60, 200, 10, g.INK); continue; }   /* the end of the platform */
      if (px < 10 || px > 150) continue;
      g.rect(px - 1, 8, 3, 52, g.MID);
      plate(g, String(k), px - 3, 20);
    }
    g.rect(20, 8, 120, 4, g.DARK);
    /* an arm's length away: the close figure, cut off by the window sill */
    if (st.dad) g.sprite(FINE.dad, 75 + off, 33);
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

/* ---------------- the station around the frame ----------------
   The story keeps its 160 x 144 world: the picture in rows 0-88, the text box below it. On a phone
   lo-game 1.5.0 grows the canvas around that world, and these rows are the station the story waits
   in, not a second picture: the wet night above the shelter's roof, the platform's edge and its
   puddles under the box. The title keeps the rain falling into the bands; the log, a chapter card
   and a choice get a still frame so the words keep the eye; the end card gets first light, because
   its picture is dawn. */
function bandRain(s, x, y, w, h, n) {
  var t = game.time;
  for (var i = 0; i < n; i++) {
    var rx = x + ((i * 53 + Math.floor(t * 40)) % (w + 10)) - 5;
    var ry = y + ((i * 29 + Math.floor(t * 150)) % h);
    var len = Math.min(6, y + h - ry);
    if (len > 1) s.line(rx, ry, rx - 1, ry + len - 1, i % 8 ? s.DARK : s.MID);
  }
}
function bandPuddles(s, w, y, h, tone, glint) {
  var n = h >= 40 ? 3 : h >= 16 ? 2 : 1;
  for (var i = 0; i < n; i++) {
    var pw = Math.min(w - 16, 26 + (i * 17) % 34), px = (i * 47 + 11) % (w - pw);
    var py = Math.min(y + h - 4, y + 3 + Math.round(h * (0.2 + 0.26 * (i % 2))));
    if (pw < 8 || py < y) continue;
    /* a shallow reflection: a narrow top, a wide middle, a narrow bottom, and the light lying in it */
    s.dither(px + 4, py, pw - 8, 1, tone, 2);
    s.dither(px, py + 1, pw, 2, tone, 2);
    s.dither(px + 3, py + 3, pw - 6, 1, tone, 2);
    s.rect(px + 3, py + 1, pw - 6, 1, glint);
    s.pixel(px + Math.round(pw * 0.68), py + 2, glint);
  }
}
function paintBands(s, stage) {
  var w = s.width, h = s.height, top = stage.y, floorY = stage.y + stage.worldH, floorH = h - floorY;
  var dawn = !titleOn && cur && cur.kind === "end";
  var calm = !dawn && !titleOn && (view === "log" || (cur && (cur.kind === "chapter" || cur.kind === "choice")));
  var x, y;
  s.clear(dawn ? s.MID : s.INK);
  if (top > 0) {
    if (calm) {
      /* nothing moves but the words: a flat seam against the frame */
      if (top > 2) s.rect(0, top - 2, w, 2, s.DARK);
    } else if (dawn) {
      /* first light: a pale sky, the colour of the end picture, no rain */
      if (top > 8) s.dither(0, top - 8, w, 8, s.PAPER, 2);
      if (top > 40) { s.dither(4, 6, w - 8, 5, s.PAPER, 1); s.dither(20, 18, w - 40, 3, s.PAPER, 1); }
    } else {
      /* wet night over the shelter; the streaks carry on into the picture's own rain */
      bandRain(s, 0, 0, w, top + 2, Math.min(120, Math.max(4, Math.round(w * top / 230))));
      if (top > 6) s.dither(0, top - 4, w, 4, s.DARK, 1);
      s.rect(0, top - 1, w, 1, s.DARK);
      /* a platform lamp over the roof, when the night has room for it */
      if (top >= 22) {
        var lx = Math.round(w * 0.84), ly = Math.max(2, Math.round(top * 0.34));
        s.rect(lx, ly, 1, top - ly, s.DARK);
        s.rect(lx - 3, ly, 7, 1, s.DARK);
        s.rect(lx - 1, ly + 1, 3, 3, s.MID);
        s.pixel(lx, ly + 2, s.PAPER);
        if (top - ly > 8) s.dither(lx - 4, ly + 4, 9, 3, s.DARK, 1);
      }
    }
  }
  if (floorH > 0) {
    if (calm) {
      s.rect(0, floorY, w, Math.min(2, floorH), s.DARK);
      if (floorH > 6) s.dither(0, floorY + 2, w, floorH - 2, s.DARK, 1);
    } else if (dawn) {
      /* the platform in the first light: its pale edge, a wet shine, quiet puddles */
      s.rect(0, floorY, w, floorH, s.DARK);
      s.rect(0, floorY, w, 1, s.INK);
      if (floorH > 1) {
        s.rect(0, floorY + 1, w, 1, s.MID);
        for (x = 3; x + 6 < w; x += 10) s.rect(x, floorY + 1, 6, 1, s.PAPER);
      }
      if (floorH > 2) s.dither(0, floorY + 2, w, floorH - 2, s.MID, 1);
      if (floorH > 5) bandPuddles(s, w, floorY + 2, floorH - 2, s.MID, s.PAPER);
    } else {
      /* the wet platform under the box: its edge catches the light, puddles hold it */
      s.rect(0, floorY, w, floorH, s.INK);
      s.rect(0, floorY, w, 1, s.DARK);
      if (floorH > 1) {
        s.rect(0, floorY + 1, w, 1, s.MID);
        for (x = 3; x + 6 < w; x += 10) s.rect(x, floorY + 1, 6, 1, s.PAPER);
      }
      if (floorH > 3) {
        s.dither(0, floorY + 2, w, floorH - 2, s.DARK, 1);
        bandPuddles(s, w, floorY + 2, floorH - 2, s.MID, s.PAPER);
      }
      /* a drop lands somewhere on the stone, on its own beat */
      if (floorH > 8) for (y = 0; y < 2; y++) {
        var q = (game.time * 0.6 + y * 0.43) % 1;
        if (q < 0.16) s.pixel(Math.round(w * (0.18 + y * 0.55)), floorY + 3 + Math.round((floorH - 5) * ((y + 1) / 3)), s.MID);
      }
    }
  }
  /* a stage too short for the world's width grows wider than it: the columns beside the story are the
     same station, never paper (348 x 323 still fits by width; this is the desktop/landscape case) */
  if (stage.x > 0 || stage.x + stage.worldW < w) paintSides(s, stage, calm, dawn);
}

/* the columns beside the world on a wide stage: rain down to the picture's bottom, the platform
   beside the text box, and a one-pixel seam where the station meets the story (lost-deck does the
   same with its hull). Sides are rare on phones, so this stays inside the world's rows. */
function paintSides(s, stage, calm, dawn) {
  var top = stage.y, pic = stage.y + PIC_H, base = stage.y + stage.worldH;
  var left = stage.x, right = stage.x + stage.worldW;
  if (base <= top) return;
  function column(x, cw, seamX) {
    if (cw <= 0) return;
    if (calm) {
      s.rect(x, top, cw, base - top, s.INK);
      s.rect(x, pic, cw, Math.min(2, base - pic), s.DARK);
      if (base - pic > 6) s.dither(x, pic + 2, cw, base - pic - 2, s.DARK, 1);
    } else if (dawn) {
      s.rect(x, top, cw, pic - top, s.MID);
      if (pic - top > 8) s.dither(x, pic - 8, cw, 8, s.PAPER, 2);
      s.rect(x, pic, cw, base - pic, s.DARK);
      s.rect(x, pic, cw, 1, s.INK);
      if (base - pic > 1) {
        s.rect(x, pic + 1, cw, 1, s.MID);
        for (var dx2 = x + 3; dx2 + 6 < x + cw; dx2 += 10) s.rect(dx2, pic + 1, 6, 1, s.PAPER);
      }
      if (base - pic > 2) s.dither(x, pic + 2, cw, base - pic - 2, s.MID, 1);
    } else {
      s.rect(x, top, cw, pic - top, s.INK);
      bandRain(s, x, top, cw, pic - top + 2, Math.max(2, Math.round(cw * (pic - top) / 230)));
      if (pic - top > 6) s.dither(x, pic - 4, cw, 4, s.DARK, 1);
      s.rect(x, pic, cw, base - pic, s.INK);
      s.rect(x, pic, cw, 1, s.DARK);
      if (base - pic > 1) {
        s.rect(x, pic + 1, cw, 1, s.MID);
        for (var dx = x + 3; dx + 6 < x + cw; dx += 10) s.rect(dx, pic + 1, 6, 1, s.PAPER);
      }
      if (base - pic > 3) s.dither(x, pic + 2, cw, base - pic - 2, s.DARK, 1);
    }
    s.rect(seamX, top, 1, base - top, dawn ? s.INK : s.DARK);
  }
  column(0, left, left - 1);
  column(right, s.width - right, right);
  if (left > 3) s.dither(0, top, 2, base - top, s.DARK, 1);
  if (s.width - right > 3) s.dither(s.width - 2, top, 2, base - top, s.DARK, 1);
}

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
