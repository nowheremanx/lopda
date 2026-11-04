/* Shared data for the story. The chapter files push into SCRIPT; game.js plays it. */

var STORY_VERSION = 3;

var TITLE = { zh: "雨站", en: "Rain Station" };

/* Portraits: 12x16, doubled to 24x32 on screen. 0 ink, 1 dark, 2 mid, 3 paper, . clear */
var CAST = {
  mei: { name: { zh: "小梅", en: "Mei" }, art: [
    "...0000.....", "..011110....", ".01111110...", ".01333310...", ".03033030...", ".03333330...",
    "..033330....", ".1.0330.1...", ".1022220....", ".02222220...", ".02222220...", ".02222220...",
    ".02222220...", "..022220....", "..02..20....", "..00..00...."] },
  old: { name: { zh: "站长", en: "Stationmaster" }, art: [
    "............", "..0000000...", ".000000000..", "..0333330...", "..3033303...", "..0333330...",
    "..0300030...", "...03330....", "..011110....", ".01111110...", ".01131110...", ".01111110...",
    ".01111110...", "..011110....", "..01..10....", "..00..00...."] },
  yuan: { name: { zh: "袁", en: "Yuan" }, art: [
    "............", "...00000....", "..0111110...", "..0333330...", "..3033303...", "..0333330...",
    "...03330....", "....030.....", "..011110....", ".01111110...", ".01121110...", ".01111110...",
    ".01111110...", "..011110....", "..01..10....", "..00..00...."] },
  conductor: { name: { zh: "列车员", en: "Conductor" }, art: [
    "............", "...00000....", "..0000000...", ".033333330..", "..0000000...", "..0333330...",
    "..3033303...", "..0333330...", "...03330....", "..011110....", ".01111110...", ".01111110...",
    ".01111110...", "..011110....", "..01..10....", "..00..00...."] }
};

/* Backgrounds: drawn into the top 88 pixels. */
var BACKDROPS = {
  station: function (g) {
    g.rect(0, 0, 160, 88, g.MID); g.dither(0, 0, 160, 52, g.DARK, 1);
    for (var i = 0; i < 34; i++) {
      var x = (i * 37 + Math.floor(game.time * 95)) % 168 - 4;
      var y = (i * 23 + Math.floor(game.time * 150)) % 74;
      g.line(x, y, x - 2, y + 5, g.PAPER);
    }
    g.rect(0, 72, 160, 16, g.DARK); g.line(0, 72, 160, 72, g.INK);
    g.rect(54, 34, 52, 38, g.DARK); g.frame(54, 34, 52, 38, g.INK);
    g.rect(50, 8, 60, 16, g.PAPER); g.frame(50, 8, 60, 16, g.INK);
    g.text(T({ zh: "雨站", en: "RAIN STN" }), 80, 10, { align: "center", color: g.INK });
    g.rect(66, 44, 10, 12, g.PAPER); g.frame(66, 44, 10, 12, g.INK);
    g.rect(84, 44, 10, 12, g.PAPER); g.frame(84, 44, 10, 12, g.INK);
    g.rect(70, 62, 20, 10, g.INK);
    g.rect(100, 40, 2, 26, g.INK); g.circle(101, 38, 4, g.PAPER, true);
    g.dither(96, 32, 11, 11, g.PAPER, 2);
    g.rect(8, 60, 30, 3, g.INK); g.rect(10, 63, 2, 9, g.INK); g.rect(34, 63, 2, 9, g.INK);
  },
  waiting: function (g) {
    g.rect(0, 0, 160, 88, g.PAPER); g.dither(0, 0, 160, 20, g.MID, 1);
    g.rect(0, 70, 160, 18, g.MID); g.line(0, 70, 160, 70, g.INK);
    g.rect(100, 12, 52, 34, g.DARK); g.frame(100, 12, 52, 34, g.INK);
    for (var i = 0; i < 18; i++) {
      var x = 102 + ((i * 13 + Math.floor(game.time * 55)) % 48);
      var y = 14 + ((i * 7 + Math.floor(game.time * 80)) % 30);
      g.line(x, y, x - 1, y + 4, g.PAPER);
    }
    g.line(126, 12, 126, 46, g.INK);
    g.circle(22, 22, 9, g.PAPER, true); g.circle(22, 22, 9, g.INK, false);
    g.line(22, 22, 22, 16, g.INK); g.line(22, 22, 27, 24, g.INK); g.pixel(22, 22, g.INK);
    g.rect(4, 8, 30, 28, g.MID); g.frame(4, 8, 30, 28, g.INK);
    g.line(4, 22, 34, 22, g.INK); g.rect(6, 13, 26, 7, g.PAPER);
    g.rect(12, 56, 96, 8, g.DARK); g.rect(14, 64, 3, 10, g.INK); g.rect(103, 64, 3, 10, g.INK);
    g.rect(12, 50, 96, 6, g.DARK); g.line(12, 50, 108, 50, g.INK);
    g.rect(112, 52, 22, 22, g.DARK); g.frame(112, 52, 22, 22, g.INK);
    g.circle(123, 60, 3, g.PAPER, true); g.line(123, 63, 123, 68, g.PAPER);
  },
  office: function (g) {
    g.rect(0, 0, 160, 88, g.DARK); g.dither(0, 0, 160, 88, g.INK, 1);
    g.rect(0, 62, 160, 26, g.MID); g.line(0, 62, 160, 62, g.INK);
    g.rect(10, 10, 48, 34, g.MID); g.frame(10, 10, 48, 34, g.INK);
    g.rect(14, 14, 40, 26, g.PAPER); g.rect(14, 26, 40, 2, g.INK);
    g.rect(14, 32, 28, 2, g.INK); g.rect(14, 37, 34, 2, g.INK);
    g.rect(66, 20, 74, 34, g.MID); g.frame(66, 20, 74, 34, g.INK);
    g.rect(72, 28, 30, 18, g.PAPER); g.frame(72, 28, 30, 18, g.INK);
    g.rect(108, 26, 24, 22, g.PAPER); g.frame(108, 26, 24, 22, g.INK);
    g.rect(70, 56, 66, 5, g.INK);
    g.circle(26, 68, 5, g.PAPER, true); g.line(26, 73, 26, 82, g.PAPER);
    g.rect(80, 68, 34, 4, g.PAPER); g.rect(80, 75, 26, 3, g.PAPER);
  },
  platform: function (g) {
    g.rect(0, 0, 160, 64, g.INK); g.dither(0, 0, 160, 40, g.DARK, 2);
    for (var i = 0; i < 40; i++) {
      var x = (i * 29 + Math.floor(game.time * 120)) % 172 - 6;
      var y = (i * 19 + Math.floor(game.time * 170)) % 62;
      g.line(x, y, x - 2, y + 6, g.PAPER);
    }
    g.rect(0, 64, 160, 24, g.DARK); g.line(0, 64, 160, 64, g.PAPER);
    g.rect(0, 74, 160, 2, g.INK); g.rect(0, 82, 160, 2, g.INK);
    for (var s = 4; s < 160; s += 16) { g.rect(s, 76, 6, 4, g.MID); }
    g.rect(128, 20, 3, 44, g.INK); g.rect(122, 16, 15, 9, g.INK); g.circle(129, 20, 3, g.PAPER, true);
    g.dither(120, 12, 19, 17, g.PAPER, 1);
    g.rect(2, 20, 58, 16, g.PAPER); g.frame(2, 20, 58, 16, g.INK);
    g.text(T({ zh: "雨站", en: "RAIN STN" }), 31, 22, { align: "center", color: g.INK });
    g.rect(10, 48, 26, 3, g.INK); g.rect(12, 51, 2, 13, g.INK); g.rect(32, 51, 2, 13, g.INK);
  },
  memory: function (g) {
    g.rect(0, 0, 160, 64, g.PAPER); g.dither(0, 0, 160, 30, g.MID, 2);
    g.rect(0, 64, 160, 24, g.MID); g.line(0, 64, 160, 64, g.INK);
    g.rect(0, 74, 160, 2, g.INK); g.rect(0, 82, 160, 2, g.INK);
    for (var s = 4; s < 160; s += 16) g.rect(s, 76, 6, 4, g.PAPER);
    g.rect(128, 20, 3, 44, g.INK); g.rect(122, 16, 15, 9, g.INK); g.circle(129, 20, 3, g.PAPER, true);
    g.dither(120, 12, 19, 17, g.PAPER, 3);
    g.rect(2, 20, 58, 16, g.PAPER); g.frame(2, 20, 58, 16, g.INK);
    g.text(T({ zh: "雨站", en: "RAIN STN" }), 31, 22, { align: "center", color: g.INK });
    g.rect(10, 48, 26, 3, g.INK); g.rect(12, 51, 2, 13, g.INK); g.rect(32, 51, 2, 13, g.INK);
    g.rect(78, 50, 16, 18, g.DARK); g.frame(78, 50, 16, 18, g.INK);
    g.rect(96, 52, 2, 16, g.INK);
  },
  train: function (g) {
    g.rect(0, 0, 160, 88, g.DARK); g.dither(0, 0, 160, 88, g.INK, 1);
    g.rect(0, 0, 160, 8, g.MID); g.rect(0, 80, 160, 8, g.MID);
    for (var i = 0; i < 3; i++) {
      var wx = 12 + i * 46;
      g.rect(wx, 18, 34, 30, g.INK); g.frame(wx, 18, 34, 30, g.PAPER);
      g.rect(wx + 2, 20, 30, 26, g.MID);
      for (var j = 0; j < 7; j++) {
        var rx = wx + 4 + ((j * 11 + Math.floor(game.time * 70)) % 26);
        var ry = 21 + ((j * 9 + Math.floor(game.time * 100)) % 22);
        g.line(rx, ry, rx - 1, ry + 4, g.PAPER);
      }
      g.line(wx + 17, 20, wx + 17, 46, g.INK);
    }
    g.rect(0, 54, 160, 8, g.DARK); g.line(0, 54, 160, 54, g.PAPER);
    for (var s = 8; s < 160; s += 26) { g.rect(s, 58, 19, 18, g.INK); g.rect(s + 2, 60, 15, 14, g.DARK); }
    g.rect(148, 14, 10, 66, g.INK); g.frame(148, 14, 10, 66, g.PAPER);
    g.circle(153, 48, 2, g.PAPER, true);
    g.rect(4, 10, 6, 3, g.PAPER); g.rect(58, 10, 6, 3, g.PAPER); g.rect(112, 10, 6, 3, g.PAPER);
  },
  dawn: function (g) {
    g.rect(0, 0, 160, 70, g.PAPER); g.dither(0, 0, 160, 34, g.MID, 2);
    g.circle(124, 18, 10, g.PAPER, true); g.circle(124, 18, 10, g.INK, false);
    g.rect(0, 70, 160, 18, g.DARK); g.line(0, 70, 160, 70, g.INK);
    g.rect(0, 78, 160, 2, g.INK); g.rect(0, 84, 160, 2, g.INK);
    for (var s = 4; s < 160; s += 16) g.rect(s, 80, 6, 3, g.MID);
    g.rect(54, 42, 52, 30, g.DARK); g.frame(54, 42, 52, 30, g.INK);
    g.rect(50, 18, 60, 16, g.PAPER); g.frame(50, 18, 60, 16, g.INK);
    g.text(T({ zh: "雨站", en: "RAIN STN" }), 80, 20, { align: "center", color: g.INK });
    g.rect(66, 50, 10, 10, g.PAPER); g.frame(66, 50, 10, 10, g.INK);
    g.rect(84, 50, 10, 10, g.PAPER); g.frame(84, 50, 10, 10, g.INK);
    g.rect(0, 66, 40, 3, g.PAPER); g.rect(50, 68, 18, 2, g.PAPER); g.rect(110, 66, 30, 3, g.PAPER);
  },
  empty: function (g) {
    g.rect(0, 0, 160, 72, g.PAPER); g.dither(0, 0, 160, 26, g.MID, 1);
    g.rect(0, 72, 160, 16, g.MID); g.line(0, 72, 160, 72, g.INK);
    g.rect(0, 78, 160, 2, g.INK); g.rect(0, 84, 160, 2, g.INK);
    for (var s = 4; s < 160; s += 16) g.rect(s, 80, 6, 3, g.DARK);
    g.rect(40, 46, 36, 24, g.DARK); g.frame(40, 46, 36, 24, g.INK);
    g.rect(44, 68, 4, 6, g.INK); g.rect(68, 68, 4, 6, g.INK);
    g.rect(92, 58, 22, 3, g.DARK); g.rect(100, 61, 2, 12, g.INK); g.rect(110, 61, 2, 12, g.INK);
    g.rect(124, 54, 3, 18, g.INK); g.rect(118, 52, 14, 3, g.INK);
    g.rect(10, 60, 8, 6, g.DARK); g.rect(20, 63, 5, 3, g.DARK); g.rect(132, 66, 9, 4, g.DARK);
  }
};

/* what you hear behind each backdrop: [ambience, level 0-1]; "title" is the title screen, anything not listed is quiet */
var AMBIENCE = {
  title: ["rain", 0.4],
  station: ["rain", 0.7],
  waiting: ["rain", 0.5],
  office: ["rain", 0.45],
  platform: ["rain", 0.8],
  memory: ["rain", 0.15],
  train: ["rain", 0.3],
  dawn: null,
  empty: null
};

/* every chapter appends to this; game.js plays it from the top */
var SCRIPT = [];
