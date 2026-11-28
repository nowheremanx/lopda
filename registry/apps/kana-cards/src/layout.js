/* 五十音图 / Kana: how the app spends the stage it is given. MIT License.
   One set of numbers for every screen: the stage is 331 x 359 at the smallest and 386 x 738 at the
   largest (sdk/UI.md 1). No DOM, no PAD and no clock, so the app and the tests run this same copy.
   ES5 on purpose: the app is inlined into an iframe with no module loader. */
var KanaLayout = (function () {
  var ART = 160;      /* the cover picture's own pixels */
  var MINW = 280;     /* a phone narrower than this still gets a readable column */
  var MAXW = 520;     /* no text row or table row wants to be wider than this */
  var CARDW = 420;    /* the card is a card, not a billboard */

  function num(n, fallback) { return typeof n === "number" && isFinite(n) && n > 0 ? n : fallback; }
  function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

  /* roomy: the 346 x 650 and 386 x 738 stages, where the art can double; tall: enough height for a
     vertically centred screen. short: the 331 x 359 the app promises. */
  function metrics(stageW, stageH) {
    var w = num(stageW, 331), h = num(stageH, 359);
    var roomy = h >= 560, tall = h >= 460, short = h <= 390;
    var content = clamp(w - 24, MINW, MAXW);
    var gap = short ? 5 : roomy ? 8 : 6;
    var row = roomy ? 48 : tall ? 46 : 44;
    /* 16 printed rows: a cell about as wide as it is tall, never under the 56 it always had */
    var cell = clamp(Math.round((content - 16) / 5), 56, 76);
    var kana = cell >= 66 ? 30 : cell >= 60 ? 27 : 25;
    var roma = cell >= 66 ? 14 : 12;
    var card = short ? 124 : roomy ? clamp(Math.round(h * 0.26), 146, 240) : 146;
    var kanaCard = short ? 66 : roomy ? clamp(Math.round(card / 2), 76, 112) : 76;
    /* the cover grows by whole picture pixels only, and only if the rows under it still fit:
       the header, main's padding, the guide row, four gaps (main, cover to rows, rows to streak,
       inside the rows), three rows and the streak, and 8 px spare */
    var others = 56 + 12 + 18 + gap * 4 + row * 3 + 18;
    var scale = clamp(Math.min(Math.floor(content / ART), Math.floor((h - others - 8) / ART)), 1, 3);
    return {
      w: w, h: h, roomy: roomy, tall: tall,
      content: content, cardW: Math.min(content, CARDW), gap: gap, row: row,
      cover: ART * scale, scale: scale,
      cell: cell, kana: kana, roma: roma,
      card: card, kanaCard: kanaCard,
      quizCard: roomy ? 104 : 72, quizKana: roomy ? 64 : 48, quizRow: roomy ? 64 : row
    };
  }

  /* the stylesheet carries the 331 x 359 numbers as its defaults; a fitted stage replaces them */
  function apply(doc, m) {
    var s = doc && doc.documentElement && doc.documentElement.style;
    if (!s || !s.setProperty) return;
    s.setProperty("--content", m.content + "px");
    s.setProperty("--cardw", m.cardW + "px");
    s.setProperty("--gap", m.gap + "px");
    s.setProperty("--row", m.row + "px");
    s.setProperty("--cover", m.cover + "px");
    s.setProperty("--cell", m.cell + "px");
    s.setProperty("--kana-cell", m.kana + "px");
    s.setProperty("--roma-cell", m.roma + "px");
    s.setProperty("--card", m.card + "px");
    s.setProperty("--kana-card", m.kanaCard + "px");
    s.setProperty("--qcard", m.quizCard + "px");
    s.setProperty("--qkana", m.quizKana + "px");
    s.setProperty("--qrow", m.quizRow + "px");
  }

  return { ART: ART, metrics: metrics, apply: apply };
})();
