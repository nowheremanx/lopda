/* Pixel art and scene backdrops. Everything is drawn with the four tones. */
var ART = {};

function spr(rows) { return LoGame.sprite(rows); }

/* ---------------- people ---------------- */
ART.heroDown = spr([
  "...000000...",
  "..01111110..",
  "..01333310..",
  "..01303010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0111333110.",
  ".0111333110.",
  ".0111333110.",
  ".0111111110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);
ART.heroUp = spr([
  "...000000...",
  "..01111110..",
  "..01111110..",
  "..01111110..",
  "..01111110..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0111111110.",
  ".0111111110.",
  ".0111111110.",
  ".0111111110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);
ART.heroSide = spr([
  "...000000...",
  "..01111110..",
  "..01333310..",
  "..01303010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  "..01111110..",
  "..01113310..",
  "..01113310..",
  "..01113310..",
  "..01111110..",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);

ART.ahe = spr([
  "....0000....",
  "...011110...",
  "..01111110..",
  "..01333310..",
  "..01303010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0113333110.",
  ".0113333110.",
  ".0113333110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);
ART.zhou = spr([
  ".0000000000.",
  "011111111110",
  ".0011111100.",
  "..01333310..",
  "..01303010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0111111110.",
  ".0111333110.",
  ".0111111110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);
ART.yan = spr([
  "...000000...",
  "..01111110..",
  "..03333330..",
  "..01333310..",
  "..01003010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0122222210.",
  ".0112222110.",
  ".0111111110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);
ART.po = spr([
  "...000000...",
  "..03333330..",
  "..03333330..",
  "..01333310..",
  "..01003010..",
  "..01333310..",
  "...000000...",
  "..02222220..",
  ".0222222220.",
  ".0222222220.",
  ".0222222220.",
  ".0222222220.",
  "..02222220..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);

ART.guestA = spr([
  "...000000...",
  "..01111110..",
  "..01333310..",
  "..01303010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0111111110.",
  ".0111221110.",
  ".0111111110.",
  ".0111111110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);
ART.guestB = spr([
  "...000000...",
  "..01111110..",
  "..01333310..",
  "..01303010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0111111110.",
  ".0111333110.",
  ".0111111110.",
  ".0111111110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);
ART.guestC = spr([
  ".0000000000.",
  "011111111110",
  ".0011111100.",
  "..01333310..",
  "..01303010..",
  "..01333310..",
  "...000000...",
  "..01111110..",
  ".0111111110.",
  ".0111111110.",
  ".0111221110.",
  ".0111111110.",
  "..01111110..",
  "..0......0..",
  "..0......0..",
  "..0......0..",
  ".00......00.",
  "............"
]);

ART.cat = spr([
  "..0.....0...",
  ".000...000..",
  ".000000000..",
  ".003030000..",
  "..0000000...",
  "..0000000...",
  ".0.0...0.0..",
  "............"
]);

/* ---------------- creatures ---------------- */
ART.boar = spr([
  "............................",
  "..........00000000..........",
  "........001111111100........",
  ".......01111111111110.......",
  "......0111111111111100......",
  ".....011111111111111110.....",
  "....00111111111111111110....",
  "...0011111111111111111110...",
  "...0331111111111111111110...",
  "...0331111111111111111110...",
  "....001111111111111111110...",
  ".....0011111111111111110....",
  "......0000000000000000......",
  ".......0..0......0..0.......",
  "......00..00....00..00......",
  "............................",
  "............................",
  "............................"
]);
ART.monkey = spr([
  "....................",
  "......000000........",
  ".....01111100.......",
  "....0111111110......",
  "....0130301110......",
  "....0133331110......",
  ".....01111110.......",
  "....0011111100......",
  "...011111111110.....",
  "..01111111111110....",
  "..01113333111110....",
  "..01111111111110....",
  "...011111111110.....",
  "....0..0..0..0......",
  "...00..00.00..00....",
  "....................",
  "....................",
  "...................."
]);
ART.bamboo = spr([
  "..........00........",
  ".........0110.......",
  "........011110......",
  "........011110......",
  ".........0110.......",
  "..........00........",
  "..........00........",
  ".........0110.......",
  "........011110......",
  "........011110......",
  ".........0110.......",
  "..........00........",
  "..........00........",
  ".........0110.......",
  "........011110......",
  "........013310......",
  ".........0110.......",
  "..........00........",
  "..........00........",
  ".........0110.......",
  "........011110......",
  "........013310......",
  ".........0110.......",
  "..........00........",
  "..........00........",
  "...................."
]);

/* ---------------- the little diner ---------------- */
ART.TABLES = [[72, 94], [136, 94], [72, 168], [136, 168]];
/* morning and night panels cover the lower row; keep the two visible tables
 * lower than the service row so they sit on the floor, not against the wall */
ART.TABLES_LOUNGE = [[72, 116], [136, 116]];

ART.table = function (g, x, y, selected) {
  if (selected) {
    g.rect(x - 2, y - 2, 48, 16, g.INK);
    g.rect(x, y, 44, 12, g.PAPER);
  } else {
    g.rect(x - 1, y, 44, 12, g.INK);
    g.rect(x + 1, y + 2, 40, 8, g.PAPER);
  }
  g.rect(x + 4, y + 12, 3, 8, g.DARK);
  g.rect(x + 35, y + 12, 3, 8, g.DARK);
  g.rect(x + 6, y + 22, 9, 4, g.DARK);
  g.rect(x + 29, y + 22, 9, 4, g.DARK);
  // a bowl, a cup and chopsticks
  g.rect(x + 10, y + 3, 9, 4, g.INK);
  g.rect(x + 11, y + 2, 7, 1, g.MID);
  g.rect(x + 26, y + 3, 9, 1, g.DARK);
  g.rect(x + 24, y + 5, 5, 3, g.INK);
};

ART.room = function (g, s, mode, t, sel) {
  ART.plate(g, mode === "night" ? PLATES.roomNight : PLATES.roomDay, 0, 0);

  // The plate leaves the middle of the wall empty: the scroll and the today
  // board are live text, and during service that band belongs to the orders.
  if (mode !== "service") {
    g.rect(84, 34, 18, 34, g.INK);
    g.rect(85, 35, 16, 32, g.PAPER);
    g.text("酒", 93, 37, { align: "center" });
    g.rect(110, 38, 54, 30, g.INK);
    g.rect(112, 40, 50, 26, g.PAPER);
    g.text("今日", 115, 41, { color: g.DARK });
    var first = s && s.menu && s.menu.length ? DATA.DISHES[s.menu[0]].name : "休息";
    g.text(first, 115, 55);
    // a shelf of jars on the right wall, below the high window
    g.rect(168, 54, 42, 30, g.INK);
    g.rect(170, 56, 38, 26, g.PAPER);
    for (var sh = 0; sh < 2; sh++) {
      g.rect(171, 62 + sh * 10, 36, 1, g.DARK);
      for (var j = 0; j < 6; j++) g.rect(172 + j * 6, 57 + sh * 10, 4, 4, sh % 2 ? g.MID : g.DARK);
    }
    // a string of dried chillies by the pass
    g.line(74, 30, 74, 46, g.INK);
    for (var h = 0; h < 4; h++) {
      g.rect(72 + (h % 2), 32 + h * 3, 3, 2, h % 2 ? g.DARK : g.MID);
      g.pixel(75, 33 + h * 3, g.PAPER);
    }
  }

  // steam from the pass, even before the first customer
  for (var st = 0; st < 3; st++) {
    var sy = 60 - ((t * 5 + st * 7) % 16);
    g.pixel(38 + st * 5, sy, g.PAPER);
    g.pixel(39 + st * 5, sy - 2, g.MID);
  }

  // the cat on the counter
  g.sprite(ART.cat, 48, 90 + (Math.sin(t * 2) > 0 ? 1 : 0));

  // tables (the lower row is hidden by the morning/night panels anyway)
  var tables = mode === "service" ? ART.TABLES : ART.TABLES_LOUNGE;
  for (var ti = 0; ti < tables.length; ti++) {
    ART.table(g, tables[ti][0], tables[ti][1], sel === ti);
  }
  // the long bench (upgrade)
  if (s && s.upgrades && s.upgrades.table) {
    g.rect(18, 156, 44, 3, g.INK);
    g.rect(20, 159, 3, 8, g.DARK); g.rect(57, 159, 3, 8, g.DARK);
    g.rect(22, 154, 36, 2, g.MID);
    g.rect(24, 150, 4, 4, g.PAPER); g.rect(44, 150, 4, 4, g.PAPER);
  }

  // noren: the plate has the cloth and its crest, the character is live
  g.text("馆", 202, 104, { align: "center" });

  // weather at the door
  if (s && s.weather === "rain") {
    for (var r = 0; r < 7; r++) {
      var rx = 197 + ((r * 7 + Math.floor(t * 18)) % 12);
      var ry = 114 + ((r * 11) % 48);
      g.line(rx, ry, rx - 2, ry + 5, g.DARK);
    }
  }

  // lantern light: the bodies are on the plate, the halo moves
  if (mode === "night") {
    ART.glow(g, 78, 38, 24, 22, t);
    ART.glow(g, 202, 104, 18, 16, t);
  } else if (mode === "service") {
    ART.glow(g, 78, 38, 20, 18, t);
    ART.glow(g, 202, 104, 16, 14, t);
  }
};

ART.lantern = function (g, x, y, t) {
  var sway = Math.sin(t * 1.7 + x) > 0 ? 0 : 1;
  g.rect(x + 4, y, 1, 6, g.INK);
  g.rect(x, y + 6, 9, 10, g.INK);
  g.rect(x + 1, y + 7, 7, 8, g.MID);
  g.dither(x + 1, y + 7, 7, 8, g.PAPER, 1 + sway);
};

ART.glow = function (g, x, y, w, h, t) {
  var pulse = 0.5 + 0.5 * Math.sin(t * 3 + x);
  g.dither(x - w / 2, y - h / 2, w, h, g.PAPER, pulse > 0.5 ? 1 : 2);
};

/* ---------------- the shop facade ---------------- */
ART.facade = function (g, x, y, s, t) {
  // wall
  g.rect(x + 6, y + 24, 108, 58, g.PAPER);
  g.frame(x + 6, y + 24, 108, 58, g.INK);
  g.dither(x + 8, y + 26, 104, 8, g.MID, 1);
  // timber frame
  g.rect(x + 16, y + 24, 2, 58, g.DARK);
  g.rect(x + 88, y + 24, 2, 58, g.DARK);
  g.rect(x + 6, y + 44, 108, 2, g.DARK);
  // roof
  g.rect(x, y + 22, 120, 3, g.INK);
  for (var i = 0; i < 8; i++) {
    var half = 28 + i * 4;
    g.rect(x + 60 - half, y + 20 - i * 2, half * 2, 2, i % 2 ? g.INK : g.DARK);
    if (i % 2 === 0) for (var k = -half + 6; k < half; k += 12) g.rect(x + 60 + k, y + 20 - i * 2, 1, 2, g.DARK);
  }
  g.rect(x + 28, y + 3, 64, 3, g.INK);
  g.line(x + 24, y + 6, x + 18, y + 2, g.INK);
  g.line(x + 96, y + 6, x + 102, y + 2, g.INK);
  g.line(x, y + 22, x - 4, y + 17, g.INK);
  g.line(x + 120, y + 22, x + 124, y + 17, g.INK);
  // chimney
  g.rect(x + 72, y - 8, 6, 12, g.DARK);
  g.rect(x + 69, y - 10, 12, 2, g.INK);
  for (var p = 0; p < 3; p++) {
    g.rect(x + 80 + p * 2, y - 16 - p * 5, 3, 4, g.PAPER);
    g.rect(x + 81 + p * 2, y - 21 - p * 5, 3, 3, g.PAPER);
  }
  // sign
  g.rect(x + 14, y + 26, 56, 15, g.INK);
  g.rect(x + 15, y + 27, 54, 13, g.PAPER);
  if (s) g.text("山脚小馆", x + 42, y + 27, { align: "center" });
  else { g.rect(x + 39, y + 31, 6, 1, g.DARK); g.rect(x + 37, y + 34, 10, 1, g.DARK); }
  if (s && s.upgrades && s.upgrades.sign) {
    g.rect(x + 100, y + 28, 10, 18, g.INK);
    g.rect(x + 101, y + 29, 8, 16, g.PAPER);
    g.text("新", x + 105, y + 31, { align: "center", color: g.DARK });
  }
  // door
  g.rect(x + 34, y + 46, 34, 32, g.INK);
  g.rect(x + 37, y + 49, 28, 29, g.DARK);
  g.rect(x + 38, y + 50, 12, 28, g.MID);
  g.rect(x + 52, y + 50, 12, 28, g.MID);
  g.rect(x + 38, y + 50, 12, 1, g.PAPER);
  g.rect(x + 52, y + 50, 12, 1, g.PAPER);
  g.rect(x + 50, y + 62, 2, 4, g.PAPER);
  // noren
  g.rect(x + 32, y + 42, 38, 7, g.INK);
  g.rect(x + 34, y + 43, 34, 5, g.PAPER);
  g.circle(x + 51, y + 45, 3, g.DARK, true);
  g.circle(x + 51, y + 45, 1, g.PAPER, true);
  // window
  g.rect(x + 72, y + 48, 16, 14, g.INK);
  g.rect(x + 74, y + 50, 12, 10, g.PAPER);
  g.rect(x + 80, y + 50, 1, 10, g.INK);
  g.rect(x + 74, y + 54, 12, 1, g.INK);
  g.dither(x + 74, y + 50, 6, 4, g.MID, 1);
  // lanterns with a warm halo
  ART.glow(g, x + 10, y + 33, 20, 18, t);
  ART.glow(g, x + 106, y + 33, 20, 18, t);
  ART.lantern(g, x + 6, y + 26, t);
  ART.lantern(g, x + 102, y + 26, t);
  // steps
  g.rect(x + 24, y + 80, 72, 2, g.DARK);
  g.rect(x + 30, y + 83, 60, 2, g.MID);
  // little plant by the door
  g.rect(x + 24, y + 70, 3, 10, g.DARK);
  g.rect(x + 21, y + 66, 9, 5, g.MID);
  g.rect(x + 23, y + 64, 5, 3, g.MID);
};

ART.title = function (g, t) {
  ART.plate(g, PLATES.mountain, 0, 0);
  // shop
  ART.facade(g, 48, 88, null, t);
  // chimney smoke and a few fireflies make the postcard breathe
  for (var st = 0; st < 4; st++) {
    var sy = 76 - ((t * 4 + st * 7) % 16);
    g.pixel(120 + st * 2, sy, g.PAPER);
    g.pixel(121 + st * 2, sy - 2, g.MID);
  }
  for (var ff = 0; ff < 5; ff++) {
    var fx = 24 + ff * 36 + Math.sin(t * 0.9 + ff) * 6;
    var fy = 132 + (ff * 23) % 48 + Math.sin(t * 1.3 + ff) * 3;
    if (Math.floor(t * 2 + ff) % 3) g.pixel(fx, fy, g.PAPER);
  }
  // cat and a little bush
  g.sprite(ART.scale(ART.cat, 1.5), 24, 176);
  ART.bush(g, 40, 178, t);
  // the wooden title board
  g.rect(18, 18, 136, 52, g.INK);
  g.rect(20, 20, 132, 48, g.PAPER);
  g.rect(22, 22, 128, 1, g.MID);
  g.rect(18, 18, 136, 2, g.DARK);
  g.rect(18, 68, 136, 2, g.DARK);
  g.line(24, 18, 28, 8, g.DARK);
  g.line(148, 18, 144, 8, g.DARK);
  g.rect(22, 56, 10, 10, g.INK);
  g.text("馆", 27, 55, { align: "center", color: g.PAPER });
  // leaves
  for (var i = 0; i < 14; i++) {
    var lx = (i * 47 + t * 8) % 216;
    var ly = 90 + ((i * 31 + t * 5) % 120);
    g.pixel(lx, ly, i % 3 ? g.DARK : g.MID);
  }
};
ART.pine = function (g, x, y, k) {
  var h = Math.round(38 * k);
  for (var j = 0; j < h; j++) {
    var half = Math.round(j * 0.34 * k);
    g.rect(x + Math.round(8 * k) - half, y + j, half * 2 + 1, 1, g.INK);
  }
  g.rect(x + Math.round(7 * k), y + h, Math.max(2, Math.round(3 * k)), Math.round(8 * k), g.DARK);
};

ART.scale = function (s, k) {
  var w = Math.max(1, Math.round(s.w * k)), h = Math.max(1, Math.round(s.h * k));
  var px = new Uint8Array(w * h);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    px[y * w + x] = s.px[Math.floor(y / k) * s.w + Math.floor(x / k)];
  }
  return { w: w, h: h, px: px };
};
ART.big = {
  heroSide: ART.scale(ART.heroSide, 2),
  heroDown: ART.scale(ART.heroDown, 1.34),
  heroUp: ART.scale(ART.heroUp, 1.34),
  ahe: ART.scale(ART.ahe, 1.34),
  zhou: ART.scale(ART.zhou, 1.34),
  yan: ART.scale(ART.yan, 1.34),
  po: ART.scale(ART.po, 1.34),
  guestA: ART.scale(ART.guestA, 1.34),
  guestB: ART.scale(ART.guestB, 1.34),
  guestC: ART.scale(ART.guestC, 1.34),
  boar: ART.scale(ART.boar, 2),
  monkey: ART.scale(ART.monkey, 2),
  bamboo: ART.scale(ART.bamboo, 1.8)
};

/* ---------------- the mountain ---------------- */
ART.forest = function (g, map, t, s) {
  g.clear(g.MID);
  for (var r = 0; r < map.length; r++) {
    for (var c = 0; c < map[r].length; c++) {
      var ch = map[r][c], x = c * 12, y = 24 + r * 12;
      if (ch === "~") {
        g.rect(x, y, 12, 12, g.MID);
        g.rect(x, y + 2, 12, 1, g.DARK);
        g.rect(x + 2 + ((Math.floor(t * 2) + r) % 6), y + 6, 5, 1, g.PAPER);
        g.rect(x + 7, y + 9, 3, 1, g.DARK);
        if ((r + c) % 3 === 0) g.rect(x + 2, y + 10, 1, 2, g.DARK);
      } else if (ch === "#") {
        g.rect(x, y, 12, 12, g.PAPER);
        g.rect(x + 1, y + 5, 10, 7, g.DARK);
        g.rect(x + 3, y + 3, 6, 4, g.DARK);
        g.dither(x + 2, y + 6, 8, 4, g.INK, 1);
        g.rect(x + 3, y + 6, 2, 1, g.MID);
      } else if (ch === ",") {
        g.rect(x, y, 12, 12, g.MID);
        g.rect(x + 2, y + 3, 2, 1, g.DARK);
        g.rect(x + 7, y + 8, 3, 1, g.DARK);
        if ((r + c) % 3 === 0) g.rect(x + 4, y + 6, 4, 1, g.PAPER);
        if ((r * 5 + c) % 7 === 0) g.rect(x + 9, y + 2, 2, 2, g.DARK);
      } else {
        g.rect(x, y, 12, 12, g.PAPER);
        if ((r * 7 + c * 3) % 5 === 0) g.rect(x + 2, y + 4, 2, 1, g.MID);
        if ((r * 3 + c * 5) % 7 === 0) g.rect(x + 7, y + 8, 2, 2, g.MID);
        if ((r * 11 + c * 7) % 13 === 0) {
          g.rect(x + 4, y + 2, 1, 3, g.DARK);
          g.rect(x + 6, y + 3, 1, 2, g.DARK);
          g.rect(x + 5, y + 1, 2, 1, g.MID);
        }
        if (ch === "*") {
          g.rect(x + 5, y + 4, 2, 4, g.DARK);
          g.rect(x + 3, y + 3, 6, 2, g.INK);
          g.pixel(x + 5, y + 2, g.PAPER);
          g.pixel(x + 4, y + 3, g.PAPER);
        }
        if ((r + c) % 9 === 0) {
          g.rect(x + 8, y + 5, 1, 3, g.DARK);
          g.rect(x + 9, y + 7, 1, 2, g.DARK);
        }
      }
    }
  }
  if (s && s.weather === "rain") {
    for (var i = 0; i < 11; i++) {
      var rx = (i * 47 + Math.floor(t * 22)) % 216;
      var ry = 24 + ((i * 59 + Math.floor(t * 27)) % 192);
      g.line(rx, ry, rx - 1, ry + 3, g.DARK);
    }
    g.dither(0, 24, 216, 30, g.INK, 1);
  } else if (s && s.weather === "fog") {
    g.dither(0, 24, 216, 40, g.PAPER, 1);
    g.dither(0, 64, 216, 24, g.PAPER, 1);
  } else {
    g.dither(0, 24, 216, 46, g.PAPER, 1);
  }
};

ART.tree = function (g, x, y, t) {
  var sway = Math.sin(t * 1.2 + x) > 0 ? 1 : 0;
  // trunk and roots
  g.rect(x + 5, y + 14, 4, 18, g.DARK);
  g.rect(x + 4, y + 14, 2, 18, g.INK);
  g.rect(x + 3, y + 28, 7, 3, g.INK);
  g.rect(x + 2, y + 30, 4, 1, g.DARK);
  g.rect(x + 8, y + 30, 4, 1, g.DARK);
  // layered canopy
  g.rect(x - 4, y + 6 + sway, 20, 8, g.INK);
  g.rect(x - 2, y + 2 + sway, 16, 8, g.INK);
  g.rect(x + 1, y - 2 + sway, 10, 6, g.INK);
  g.rect(x - 6, y + 11 + sway, 24, 5, g.DARK);
  g.dither(x - 2, y + 4 + sway, 16, 8, g.DARK, 1);
  g.dither(x + 2, y + 1 + sway, 8, 5, g.MID, 1);
  // leaf clusters
  g.rect(x - 3, y + 7 + sway, 3, 2, g.MID);
  g.rect(x + 11, y + 9 + sway, 4, 2, g.MID);
  g.rect(x + 4, y + 13 + sway, 3, 1, g.MID);
  g.rect(x + 14, y + 4 + sway, 2, 2, g.DARK);
  g.rect(x - 5, y + 9 + sway, 2, 2, g.DARK);
};

ART.bush = function (g, x, y, t) {
  var sway = Math.sin(t * 2 + x) > 0 ? 1 : 0;
  g.rect(x + 1, y + 8 + sway, 10, 5, g.INK);
  g.rect(x + 3, y + 5 + sway, 6, 5, g.INK);
  g.dither(x + 3, y + 6 + sway, 7, 4, g.DARK, 1);
  g.rect(x + 5, y + 7 + sway, 3, 2, g.MID);
  g.rect(x + 9, y + 10, 2, 3, g.DARK);
};

ART.bambooPlant = function (g, x, y, t) {
  var sway = Math.sin(t * 1.5 + x) > 0 ? 1 : 0;
  g.rect(x + 5, y - 6, 3, 30, g.DARK);
  g.rect(x + 4, y - 6, 1, 30, g.INK);
  for (var i = 0; i < 4; i++) {
    var ly = y - 2 + i * 6;
    g.rect(x + 8 + sway, ly, 6, 1, g.INK);
    g.rect(x - 1 + sway, ly + 2, 5, 1, g.INK);
    g.rect(x + 10 + sway, ly - 2, 4, 1, g.DARK);
  }
};

ART.shrine = function (g, x, y, t) {
  g.rect(x + 2, y + 4, 3, 24, g.DARK);
  g.rect(x + 19, y + 4, 3, 24, g.DARK);
  g.rect(x, y, 24, 3, g.INK);
  g.rect(x + 3, y + 4, 18, 2, g.INK);
  g.rect(x - 2, y + 6, 28, 2, g.DARK);
  g.rect(x + 4, y + 10, 16, 1, g.DARK);
  g.rect(x + 9, y + 12, 6, 14, g.PAPER);
  g.text("山", x + 12, y + 13, { align: "center", color: g.DARK });
  if (Math.floor(t * 2) % 2 === 0) g.pixel(x + 12, y + 28, g.PAPER);
};

ART.node = function (g, kind, x, y, t) {
  var blink = Math.floor(t * 3 + x) % 4 === 0;
  if (kind === "mushroom") {
    g.rect(x + 2, y + 6, 8, 5, g.INK);
    g.rect(x + 3, y + 7, 6, 3, g.PAPER);
    g.rect(x + 1, y + 4, 5, 4, g.DARK);
    g.rect(x + 6, y + 2, 5, 4, g.DARK);
    g.pixel(x + 3, y + 5, g.PAPER); g.pixel(x + 8, y + 3, g.PAPER);
  } else if (kind === "greens") {
    g.rect(x + 3, y + 8, 6, 2, g.INK);
    g.rect(x + 2, y + 3, 4, 6, g.DARK);
    g.rect(x + 6, y + 1, 4, 8, g.DARK);
    g.rect(x + 8, y + 5, 3, 5, g.MID);
  } else if (kind === "rice") {
    g.rect(x + 3, y + 2, 1, 9, g.DARK);
    g.rect(x + 7, y + 1, 1, 10, g.DARK);
    for (var i = 0; i < 3; i++) {
      g.rect(x + 1, y + 3 + i * 3, 3, 2, g.PAPER);
      g.rect(x + 8, y + 2 + i * 3, 3, 2, g.PAPER);
    }
  } else if (kind === "fish") {
    g.rect(x + 2, y + 5, 8, 4, g.INK);
    g.rect(x + 3, y + 6, 6, 2, g.MID);
    g.rect(x + 9, y + 4, 2, 2, g.INK);
    g.pixel(x + 4, y + 6, g.PAPER);
    g.rect(x + 1, y + 9, 3, 1, g.PAPER);
  } else if (kind === "bamboo") {
    g.rect(x + 4, y + 2, 4, 10, g.DARK);
    g.rect(x + 5, y + 2, 2, 10, g.PAPER);
    g.rect(x + 3, y + 6, 6, 1, g.INK);
    g.rect(x + 8, y + 1, 3, 3, g.INK);
  } else if (kind === "rare") {
    g.rect(x + 4, y + 6, 1, 6, g.PAPER);
    g.rect(x + 7, y + 4, 1, 8, g.PAPER);
    g.rect(x + 3, y + 3, 5, 4, g.INK);
    g.rect(x + 6, y + 1, 5, 4, g.INK);
    if (blink) g.dither(x + 1, y + 1, 10, 10, g.PAPER, 2);
  }
  if (blink) {
    g.pixel(x + 1, y + 1, g.PAPER);
    g.pixel(x + 10, y + 2, g.PAPER);
  }
};

ART.monster = function (g, id, x, y, t) {
  if (id === "boar") {
    g.dither(x - 4, y + 9, 20, 3, g.DARK, 1);
    g.sprite(ART.boar, x - 8, y - 4 + (Math.sin(t * 3) > 0 ? 1 : 0));
    g.pixel(x + 2, y, g.PAPER);
  } else if (id === "monkey") {
    g.dither(x - 2, y + 10, 16, 2, g.DARK, 1);
    g.sprite(ART.monkey, x - 4, y - 3 + (Math.sin(t * 4) > 0 ? 1 : 0));
  } else if (id === "bamboo") {
    g.dither(x - 3, y + 10, 18, 2, g.DARK, 1);
    g.sprite(ART.bamboo, x - 4, y - 12 + (Math.sin(t * 2) > 0 ? 1 : 0));
  } else if (id === "boss") {
    g.dither(x - 12, y + 10, 36, 3, g.INK, 2);
    ART.boss(g, x - 20, y - 34, t, false);
  }
};

ART.enemyBig = function (g, id, x, y, t, hurt) {
  var bob = Math.sin(t * 3) > 0 ? 1 : 0;
  if (id === "boss") { ART.boss(g, x, y, t, hurt); return; }
  var s = id === "boar" ? ART.big.boar : id === "monkey" ? ART.big.monkey : ART.big.bamboo;
  g.dither(x + 2, y + s.h - 2, s.w - 4, 3, g.DARK, 1);
  if (hurt) g.sprite(s, x, y + bob, { map: [g.PAPER, g.PAPER, g.PAPER, g.PAPER] });
  else g.sprite(s, x, y + bob);
  if (id === "boar") {
    g.pixel(x + 20, y + 14 + bob, g.PAPER);
    g.rect(x + 5, y + 20 + bob, 7, 1, g.PAPER);
  } else if (id === "monkey") {
    g.pixel(x + 18, y + 14 + bob, g.PAPER);
  } else {
    g.pixel(x + 18, y + 14 + bob, g.PAPER);
  }
};

/* ---------------- battle ---------------- */
ART.battleBg = function (g, kind, t) {
  g.clear(g.PAPER);
  var deep = kind === "deep";
  // sky
  g.dither(0, 0, 216, deep ? 44 : 50, g.MID, deep ? 2 : 1);
  if (deep) {
    g.rect(0, 0, 216, 30, g.DARK);
    g.dither(0, 0, 216, 30, g.INK, 1);
  } else {
    g.rect(0, 0, 216, 24, g.PAPER);
  }
  // far hills
  g.line(0, 62, 28, 40, deep ? g.DARK : g.DARK);
  g.line(28, 40, 56, 62, g.DARK);
  g.line(44, 62, 80, 34, g.DARK);
  g.line(80, 34, 116, 62, g.DARK);
  g.line(104, 62, 144, 42, g.DARK);
  g.line(144, 42, 184, 62, g.DARK);
  g.line(170, 62, 206, 48, g.DARK);
  g.line(206, 48, 216, 56, g.DARK);
  g.dither(46, 44, 30, 16, g.DARK, 1);
  g.dither(128, 46, 34, 14, g.DARK, 1);
  // distant pines
  ART.pine(g, 6, 24, 0.7);
  ART.pine(g, 38, 30, 0.55);
  ART.pine(g, 168, 28, 0.65);
  ART.pine(g, 198, 22, 0.8);
  // mist
  g.dither(0, 62, 216, 10, g.PAPER, 2);
  g.dither(0, 78, 216, 6, g.PAPER, 1);
  // trees at the sides
  ART.pine(g, -10, 28, 1.3);
  ART.pine(g, 190, 30, 1.4);
  if (!deep) {
    ART.tree(g, -8, 62, t);
    ART.tree(g, 202, 58, t);
  }
  // ground
  g.rect(0, 104, 216, 46, g.PAPER);
  g.dither(0, 104, 216, 7, g.MID, 1);
  g.rect(0, 104, 216, 1, g.DARK);
  for (var i = 0; i < 18; i++) {
    var gx = (i * 37) % 216, gy = 112 + (i * 17) % 30;
    g.rect(gx, gy, 5, 1, g.MID);
    if (i % 3 === 0) g.rect(gx + 2, gy - 2, 1, 2, g.DARK);
  }
  // a little path
  g.rect(72, 104, 72, 2, g.MID);
  g.dither(72, 106, 72, 3, g.DARK, 1);
  // light shafts
  if (!deep) {
    for (var b = 0; b < 4; b++) {
      var bx = 18 + b * 18;
      for (var j = 0; j < 6; j++) g.rect(bx + j * 2, 8 + j * 9, 4, 8, g.PAPER);
    }
  }
  if (deep) {
    ART.shrine(g, 92, 56, t);
    g.dither(0, 72, 216, 30, g.PAPER, 2);
    g.rect(0, 104, 216, 46, g.DARK);
    g.dither(0, 104, 216, 8, g.INK, 1);
    for (var r = 0; r < 10; r++) g.rect((r * 29) % 216, 112 + (r * 7) % 30, 6, 1, g.MID);
  } else {
    // flowers
    for (var f = 0; f < 6; f++) {
      g.rect(10 + f * 34, 128 + (f % 3) * 5, 2, 2, g.MID);
      g.pixel(11 + f * 34, 127 + (f % 3) * 5, g.PAPER);
    }
  }
  // fireflies
  for (var j2 = 0; j2 < 8; j2++) {
    var fx = (j2 * 43 + Math.sin(t * 0.8 + j2) * 9) % 216;
    var fy = 52 + (j2 * 19) % 48;
    if (Math.floor(t * 2 + j2) % 3) g.pixel(fx, fy, g.PAPER);
  }
};

ART.enemyBig = function (g, id, x, y, t, hurt) {
  var bob = Math.sin(t * 3) > 0 ? 1 : 0;
  if (id === "boss") { ART.boss(g, x, y, t, hurt); return; }
  var s = id === "boar" ? ART.big.boar : id === "monkey" ? ART.big.monkey : ART.big.bamboo;
  g.dither(x + 2, y + s.h - 2, s.w - 4, 3, g.DARK, 1);
  if (hurt) g.sprite(s, x, y + bob, { map: [g.PAPER, g.PAPER, g.PAPER, g.PAPER] });
  else g.sprite(s, x, y + bob);
  if (id === "boar") {
    g.pixel(x + 20, y + 14 + bob, g.PAPER);
    g.rect(x + 5, y + 20 + bob, 7, 1, g.PAPER);
  } else if (id === "monkey") {
    g.pixel(x + 18, y + 14 + bob, g.PAPER);
  } else {
    g.pixel(x + 18, y + 14 + bob, g.PAPER);
  }
};

/* ---------------- battle ---------------- */
ART.battleBg = function (g, kind, t) {
  ART.plate(g, PLATES.mountain, 0, 0);
  var deep = kind === "deep";
  // the fight stands on a stage cut into the mountain plate
  g.rect(0, 108, 216, 132, deep ? g.DARK : g.PAPER);
  g.dither(0, 108, 216, 6, g.MID, 1);
  g.rect(0, 108, 216, 1, g.DARK);
  for (var i = 0; i < 18; i++) {
    var gx = (i * 37) % 216, gy = 114 + (i * 17) % 30;
    g.rect(gx, gy, 5, 1, g.MID);
    if (i % 3 === 0) g.rect(gx + 2, gy - 2, 1, 2, deep ? g.DARK : g.INK);
  }
  // a little path
  g.rect(72, 108, 72, 2, g.MID);
  g.dither(72, 110, 72, 3, g.DARK, 1);
  if (deep) {
    g.dither(0, 0, 216, 108, g.INK, 2);
    g.dither(0, 0, 216, 44, g.INK, 1);
    ART.shrine(g, 92, 56, t);
    g.dither(0, 72, 216, 36, g.PAPER, 1);
    for (var r = 0; r < 10; r++) g.rect((r * 29) % 216, 114 + (r * 7) % 30, 6, 1, g.MID);
  } else {
    // light shafts
    for (var b = 0; b < 4; b++) {
      var bx = 18 + b * 18;
      for (var j = 0; j < 6; j++) g.rect(bx + j * 2, 8 + j * 9, 4, 8, g.PAPER);
    }
  }
  // fireflies
  for (var j2 = 0; j2 < 8; j2++) {
    var fx = (j2 * 43 + Math.sin(t * 0.8 + j2) * 9) % 216;
    var fy = 52 + (j2 * 19) % 48;
    if (Math.floor(t * 2 + j2) % 3) g.pixel(fx, fy, g.PAPER);
  }
};

ART.enemy = function (g, id, x, y, t, hurt) {
  var bob = Math.sin(t * 3) > 0 ? 1 : 0;
  if (id === "boss") {
    ART.boss(g, x, y, t, hurt);
    return;
  }
  var s = id === "boar" ? ART.boar : id === "monkey" ? ART.monkey : ART.bamboo;
  g.dither(x + 2, y + s.h - 2, s.w - 4, 3, g.DARK, 1);
  if (hurt) g.sprite(s, x, y + bob, { map: [g.PAPER, g.PAPER, g.PAPER, g.PAPER] });
  else g.sprite(s, x, y + bob);
  if (id === "boar") {
    g.pixel(x + 12, y + 8 + bob, g.PAPER);
    g.rect(x + 3, y + 11 + bob, 4, 1, g.PAPER);
  } else if (id === "monkey") {
    g.pixel(x + 10, y + 8 + bob, g.PAPER);
  } else {
    g.pixel(x + 10, y + 8 + bob, g.PAPER);
  }
};

ART.boss = function (g, x, y, t, hurt) {
  var bob = Math.sin(t * 1.6) > 0 ? 1 : 0;
  var c = hurt ? g.PAPER : g.DARK;
  g.dither(x + 4, y + 40, 34, 4, g.INK, 2);
  // body
  g.circle(x + 20, y + 26, 18, c, true);
  g.circle(x + 20, y + 18, 13, c, true);
  g.rect(x + 3, y + 28, 34, 14, c);
  // arms
  g.rect(x - 2, y + 24 + bob, 7, 16, c);
  g.rect(x + 35, y + 24 + bob, 7, 16, c);
  // legs
  g.rect(x + 8, y + 38, 8, 8, c);
  g.rect(x + 24, y + 38, 8, 8, c);
  // fur dither
  g.dither(x + 4, y + 10, 32, 28, hurt ? g.DARK : g.INK, 1);
  // horns
  g.rect(x + 8, y + 2, 4, 10, g.INK);
  g.rect(x + 28, y + 2, 4, 10, g.INK);
  g.rect(x + 6, y - 2, 4, 5, g.PAPER);
  g.rect(x + 30, y - 2, 4, 5, g.PAPER);
  // face
  g.rect(x + 11, y + 12, 6, 4, g.INK);
  g.rect(x + 23, y + 12, 6, 4, g.INK);
  if (!hurt) {
    g.pixel(x + 13, y + 13, g.PAPER); g.pixel(x + 25, y + 13, g.PAPER);
  }
  g.rect(x + 14, y + 20, 12, 3, g.INK);
  g.rect(x + 12, y + 24, 4, 2, g.PAPER);
  g.rect(x + 24, y + 24, 4, 2, g.PAPER);
  // moss
  g.dither(x + 8, y + 32, 24, 6, g.MID, 2);
};

/* ---------------- portraits ---------------- */
function portraitBase(g, x, y, opts) {
  opts = opts || {};
  var hair = opts.hair == null ? g.INK : opts.hair;
  // hair behind the head
  g.rect(x + 2, y + 12, 76, 64, hair);
  // neck and robe
  g.rect(x + 32, y + 64, 16, 12, g.PAPER);
  g.rect(x + 8, y + 76, 64, 24, g.DARK);
  g.rect(x + 14, y + 76, 52, 4, g.MID);
  // face
  g.rect(x + 18, y + 22, 44, 32, g.PAPER);
  g.rect(x + 16, y + 30, 48, 22, g.PAPER);
  g.rect(x + 22, y + 52, 36, 8, g.PAPER);
  g.rect(x + 26, y + 58, 28, 4, g.PAPER);
  // fringe and side locks
  g.rect(x + 12, y + 10, 56, 16, hair);
  g.rect(x + 10, y + 24, 8, 40, hair);
  g.rect(x + 62, y + 24, 8, 40, hair);
  // eyes
  g.rect(x + 26, y + 38, 5, 3, g.INK);
  g.rect(x + 47, y + 38, 5, 3, g.INK);
  g.rect(x + 27, y + 38, 2, 1, g.PAPER);
  g.rect(x + 48, y + 38, 2, 1, g.PAPER);
  g.rect(x + 25, y + 34, 8, 2, opts.stern ? g.INK : g.DARK);
  g.rect(x + 45, y + 34, 8, 2, opts.stern ? g.INK : g.DARK);
  // nose, mouth, blush
  g.rect(x + 39, y + 44, 3, 6, g.DARK);
  g.rect(x + 35, y + 54, 10, 2, g.INK);
  if (opts.smile) {
    g.pixel(x + 33, y + 53, g.INK);
    g.pixel(x + 46, y + 53, g.INK);
  }
  g.dither(x + 21, y + 47, 7, 5, g.MID, 2);
  g.dither(x + 52, y + 47, 7, 5, g.MID, 2);
  return { hair: hair };
}

ART.portrait = function (g, who, x, y) {
  if (who === "ahe") {
    portraitBase(g, x, y, { smile: true });
    // bun and pin
    g.rect(x + 30, y + 2, 20, 10, g.INK);
    g.rect(x + 33, y + 0, 14, 4, g.DARK);
    g.rect(x + 45, y - 4, 2, 8, g.PAPER);
    // fringe parting
    g.rect(x + 36, y + 10, 2, 12, g.INK);
    g.rect(x + 44, y + 10, 2, 12, g.INK);
    // flower
    g.rect(x + 62, y + 18, 2, 2, g.PAPER);
    g.rect(x + 60, y + 20, 2, 2, g.PAPER);
    g.rect(x + 64, y + 20, 2, 2, g.PAPER);
    g.rect(x + 62, y + 22, 2, 2, g.PAPER);
    g.pixel(x + 63, y + 21, g.INK);
    // apron collar
    g.line(x + 36, y + 76, x + 40, y + 88, g.PAPER);
    g.line(x + 50, y + 76, x + 46, y + 88, g.PAPER);
    g.rect(x + 40, y + 88, 8, 12, g.PAPER);
  } else if (who === "zhou") {
    portraitBase(g, x, y, { stern: true });
    // straw hat
    g.rect(x + 2, y + 10, 76, 6, g.INK);
    g.rect(x + 20, y - 2, 40, 14, g.DARK);
    g.rect(x + 8, y + 8, 64, 2, g.MID);
    g.rect(x + 22, y + 2, 36, 2, g.PAPER);
    // beard and moustache
    g.rect(x + 28, y + 52, 24, 14, g.PAPER);
    g.rect(x + 30, y + 50, 8, 3, g.PAPER);
    g.rect(x + 42, y + 50, 8, 3, g.PAPER);
    g.dither(x + 30, y + 56, 20, 8, g.DARK, 1);
    // pipe
    g.line(x + 62, y + 68, x + 76, y + 58, g.INK);
    g.rect(x + 74, y + 54, 4, 4, g.INK);
    g.rect(x + 77, y + 52, 2, 2, g.MID);
  } else if (who === "yan") {
    portraitBase(g, x, y, { stern: true, smile: false });
    // headband
    g.rect(x + 10, y + 14, 60, 5, g.PAPER);
    g.rect(x + 10, y + 18, 60, 1, g.DARK);
    // spiky hair
    g.rect(x + 16, y + 6, 8, 8, g.INK);
    g.rect(x + 30, y + 4, 8, 10, g.INK);
    g.rect(x + 46, y + 5, 8, 9, g.INK);
    g.rect(x + 58, y + 8, 6, 7, g.INK);
    // scar
    g.line(x + 52, y + 34, x + 57, y + 48, g.DARK);
    // fur collar
    g.dither(x + 16, y + 74, 48, 10, g.MID, 2);
    g.rect(x + 18, y + 76, 44, 3, g.PAPER);
  } else if (who === "po") {
    portraitBase(g, x, y, { hair: g.PAPER, stern: true });
    // grey hair texture
    g.dither(x + 4, y + 12, 72, 62, g.DARK, 1);
    // bun
    g.rect(x + 30, y + 4, 20, 10, g.PAPER);
    g.dither(x + 30, y + 4, 20, 10, g.DARK, 2);
    // glasses
    g.frame(x + 22, y + 36, 14, 10, g.INK);
    g.frame(x + 44, y + 36, 14, 10, g.INK);
    g.rect(x + 36, y + 40, 8, 1, g.INK);
    g.rect(x + 25, y + 39, 8, 1, g.MID);
    g.rect(x + 47, y + 39, 8, 1, g.MID);
    // shawl
    g.dither(x + 10, y + 76, 60, 22, g.MID, 2);
    g.rect(x + 10, y + 76, 60, 2, g.PAPER);
    // cane
    g.line(x + 6, y + 72, x + 2, y + 100, g.DARK);
  } else if (who === "critic") {
    portraitBase(g, x, y, { stern: true });
    // a travelling scholar's hat and fan
    g.rect(x + 12, y + 4, 56, 8, g.INK);
    g.rect(x + 20, y - 4, 40, 10, g.DARK);
    g.rect(x + 8, y + 10, 64, 2, g.PAPER);
    g.rect(x + 28, y + 50, 24, 2, g.PAPER);
    g.rect(x + 30, y + 54, 20, 1, g.DARK);
    g.rect(x + 62, y + 66, 12, 2, g.INK);
    g.line(x + 64, y + 66, x + 52, y + 54, g.INK);
    g.dither(x + 52, y + 52, 14, 8, g.PAPER, 2);
    g.rect(x + 72, y + 76, 4, 20, g.DARK);
  } else {
    portraitBase(g, x, y, { smile: true });
  }
};

/* ---------------- food and things ---------------- */
ART.steam = function (g, x, y, t) {
  var a = Math.floor(t * 3) % 3;
  g.rect(x, y - a, 2, 3, g.PAPER);
  g.rect(x + 3, y - 2 - a, 2, 3, g.PAPER);
  g.rect(x + 6, y - 1 - a, 2, 2, g.PAPER);
};

ART.dish = function (g, id, x, y, t) {
  var d = DATA.DISHES[id];
  var kind = d ? d.kind : "soup";
  g.rect(x + 1, y + 10, 18, 2, g.INK);
  g.rect(x + 3, y + 12, 14, 1, g.MID);
  if (kind === "soup" || kind === "pot") {
    g.rect(x + 3, y + 6, 14, 5, g.INK);
    g.rect(x + 4, y + 7, 12, 3, g.PAPER);
    g.rect(x + 6, y + 7, 8, 1, g.MID);
    if (kind === "pot") {
      g.rect(x + 2, y + 4, 16, 3, g.INK);
      g.rect(x + 4, y + 5, 12, 2, g.DARK);
      g.rect(x - 1, y + 6, 4, 2, g.INK);
      g.rect(x + 17, y + 6, 4, 2, g.INK);
    }
    ART.steam(g, x + 7, y + 4, t);
  } else if (kind === "cake") {
    g.circle(x + 10, y + 7, 6, g.INK, true);
    g.circle(x + 10, y + 7, 5, g.PAPER, true);
    g.dither(x + 6, y + 4, 8, 6, g.MID, 1);
    ART.steam(g, x + 8, y + 0, t);
  } else if (kind === "rice") {
    g.rect(x + 4, y + 2, 12, 8, g.DARK);
    g.rect(x + 5, y + 3, 10, 6, g.PAPER);
    g.rect(x + 5, y + 2, 10, 1, g.INK);
    g.rect(x + 7, y + 4, 2, 1, g.MID);
    g.rect(x + 11, y + 6, 2, 1, g.MID);
  } else if (kind === "grill") {
    g.rect(x + 3, y + 4, 14, 7, g.MID);
    g.rect(x + 4, y + 5, 12, 2, g.PAPER);
    for (var i = 0; i < 3; i++) g.rect(x + 5 + i * 4, y + 4, 1, 7, g.INK);
    g.rect(x + 5, y + 9, 10, 1, g.INK);
    ART.steam(g, x + 7, y + 2, t);
  } else if (kind === "stir") {
    g.rect(x + 2, y + 8, 16, 3, g.INK);
    g.rect(x + 4, y + 6, 12, 4, g.DARK);
    g.rect(x + 6, y + 5, 3, 3, g.PAPER);
    g.rect(x + 11, y + 6, 3, 2, g.MID);
    ART.steam(g, x + 8, y + 2, t);
  } else {
    g.rect(x + 3, y + 6, 14, 5, g.INK);
    g.rect(x + 5, y + 7, 10, 3, g.PAPER);
    g.circle(x + 10, y + 6, 4, g.PAPER, true);
    g.dither(x + 6, y + 3, 8, 4, g.PAPER, 2);
    ART.steam(g, x + 7, y + 0, t);
  }
};

ART.ing = function (g, id, x, y) {
  if (id === "mushroom") {
    g.rect(x + 4, y + 4, 4, 6, g.INK);
    g.rect(x + 5, y + 5, 2, 5, g.PAPER);
    g.rect(x + 2, y + 1, 8, 3, g.DARK);
    g.rect(x + 3, y + 2, 6, 1, g.PAPER);
    g.pixel(x + 3, y + 2, g.PAPER); g.pixel(x + 7, y + 2, g.PAPER);
  } else if (id === "fish") {
    g.rect(x + 2, y + 4, 7, 4, g.INK);
    g.rect(x + 3, y + 5, 5, 2, g.MID);
    g.rect(x + 9, y + 3, 2, 2, g.INK);
    g.rect(x + 9, y + 7, 2, 2, g.INK);
    g.pixel(x + 4, y + 5, g.PAPER);
  } else if (id === "rice") {
    for (var i = 0; i < 5; i++) g.rect(x + 2 + (i * 3) % 7, y + 3 + (i * 5) % 7, 2, 3, g.PAPER);
    g.rect(x + 2, y + 9, 8, 1, g.DARK);
  } else if (id === "bamboo") {
    g.rect(x + 4, y + 2, 4, 9, g.DARK);
    g.rect(x + 5, y + 2, 2, 9, g.PAPER);
    g.rect(x + 3, y + 6, 6, 1, g.INK);
    g.rect(x + 8, y + 1, 3, 3, g.INK);
  } else if (id === "greens") {
    g.rect(x + 3, y + 7, 6, 2, g.INK);
    g.rect(x + 2, y + 2, 4, 6, g.DARK);
    g.rect(x + 6, y + 1, 4, 7, g.DARK);
    g.rect(x + 7, y + 4, 3, 4, g.MID);
  } else if (id === "meat") {
    g.rect(x + 2, y + 3, 8, 6, g.MID);
    g.rect(x + 3, y + 4, 6, 2, g.PAPER);
    g.rect(x + 3, y + 7, 6, 1, g.DARK);
    g.rect(x + 1, y + 4, 2, 1, g.PAPER);
  } else {
    g.rect(x + 5, y + 3, 2, 7, g.PAPER);
    g.rect(x + 3, y + 2, 4, 3, g.INK);
    g.rect(x + 7, y + 5, 3, 3, g.MID);
    g.dither(x + 2, y + 2, 8, 8, g.PAPER, 1);
  }
};

ART.weatherIcon = function (g, id, x, y, t) {
  if (id === "sunny") {
    g.circle(x + 6, y + 6, 4, g.PAPER, true);
    g.circle(x + 6, y + 6, 3, g.INK, true);
    for (var i = 0; i < 4; i++) {
      g.pixel(x + 6 + (i < 2 ? -6 + i * 12 : 0), y + 6 + (i < 2 ? 0 : -5 + (i - 2) * 10), g.PAPER);
    }
  } else if (id === "rain") {
    g.rect(x + 1, y + 3, 10, 4, g.DARK);
    g.rect(x + 3, y + 1, 4, 3, g.DARK);
    for (var j = 0; j < 3; j++) {
      var dy = (Math.floor(t * 6) + j * 3) % 6;
      g.line(x + 2 + j * 4, y + 8 + dy, x + 1 + j * 4, y + 10 + dy, g.PAPER);
    }
  } else {
    for (var k = 0; k < 3; k++) g.rect(x + 1 + (k % 2) * 2, y + 2 + k * 3, 9, 1, g.PAPER);
    g.rect(x + 4, y + 4, 4, 1, g.MID);
  }
};

ART.coin = function (g, x, y) {
  g.circle(x + 3, y + 3, 3, g.INK, true);
  g.rect(x + 2, y + 3, 3, 2, g.PAPER);
  g.pixel(x + 3, y + 2, g.PAPER);
};

ART.heart = function (g, x, y, filled) {
  var c = filled ? g.INK : g.MID;
  g.rect(x + 1, y + 1, 2, 2, c); g.rect(x + 4, y + 1, 2, 2, c);
  g.rect(x + 1, y + 2, 5, 2, c);
  g.rect(x + 2, y + 4, 3, 1, c);
  g.pixel(x + 3, y + 5, c);
  if (!filled) { g.pixel(x + 3, y + 1, g.PAPER); g.pixel(x + 4, y + 2, g.PAPER); }
};

ART.star = function (g, x, y, c) {
  c = c == null ? g.PAPER : c;
  g.pixel(x + 3, y, c); g.rect(x + 2, y + 1, 3, 1, c); g.rect(x + 1, y + 2, 5, 1, c);
  g.rect(x + 2, y + 3, 3, 1, c); g.pixel(x + 1, y + 4, c); g.pixel(x + 5, y + 4, c);
};

/* ---------------- ending ---------------- */
ART.ending = function (g, t, kind) {
  g.clear(g.PAPER);
  g.dither(0, 0, 216, 54, g.MID, 1);
  g.dither(154, 10, 40, 38, g.MID, 1);
  g.circle(174, 28, 16, g.INK, true);
  g.circle(174, 28, 14, g.PAPER, true);
  for (var er = 0; er < 8; er++) {
    var ea = er * Math.PI / 4;
    g.line(174 + Math.cos(ea) * 20, 28 + Math.sin(ea) * 20, 174 + Math.cos(ea) * 24, 28 + Math.sin(ea) * 24, g.DARK);
  }
  g.line(0, 78, 38, 48, g.DARK); g.line(38, 48, 76, 78, g.DARK);
  g.line(52, 78, 96, 42, g.DARK); g.line(96, 42, 140, 78, g.DARK);
  g.line(124, 78, 164, 52, g.DARK); g.line(164, 52, 204, 78, g.DARK);
  g.rect(0, 78, 216, 162, g.PAPER);
  g.dither(0, 78, 216, 10, g.MID, 1);
  ART.pine(g, -2, 42, 1.1);
  ART.pine(g, 190, 46, 1.2);
  ART.facade(g, 48, 62, null, t);
  // birds
  for (var b = 0; b < 3; b++) {
    var bx = 40 + b * 34 + Math.sin(t + b) * 3, by = 34 + b * 6;
    g.line(bx, by, bx + 3, by - 2, g.DARK);
    g.line(bx + 3, by - 2, bx + 6, by, g.DARK);
  }
  // the people who stayed
  g.sprite(ART.big.heroDown, 72, 140);
  if (kind !== "bad") {
    g.sprite(ART.big.ahe, 90, 142);
    g.sprite(ART.big.zhou, 108, 142);
    g.sprite(ART.big.yan, 126, 142);
    g.sprite(ART.big.po, 144, 142);
  }
  g.sprite(ART.cat, 160, 146);
  for (var i = 0; i < 20; i++) {
    var px = (i * 41 + t * 6) % 216;
    var py = 80 + ((i * 27 + t * 4) % 84);
    if (Math.floor(t * 2 + i) % 3) {
      g.rect(px, py, 2, 1, i % 2 ? g.PAPER : g.MID);
      if (i % 4 === 0) g.pixel(px + 1, py + 1, g.DARK);
    }
  }
};
