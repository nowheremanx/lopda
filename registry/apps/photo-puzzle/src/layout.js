/* 拍照拼图: the play screen fills the stage (sdk/UI.md 13). The puzzle stays 128 x 112 art pixels and the canvas is
   the whole screen, drawn at an integer number of CSS pixels an art pixel -- so every art pixel stays a square of
   k x k CSS pixels (and k * dpr device pixels) and the picture is never resampled. Rows are rounded up and the CSS
   size is never rounded down: a stage measured with a fraction must not leave a line of paper at its edge.

   Two arrangements share the fit:
   - play: the status band, the photo and the caption band are one card, centred on the page; the page's margins
     above and below are painted scenery.
   - a menu: the header and the footer stay at the page's top and bottom, the photo is centred between them, and the
     menu sheet sits over the photo's foot -- the menu covers the whole stage.
   Pure functions; tests/photo-puzzle-layout.test.mjs checks the five screen sizes. */
var PZ = (function () {
  "use strict";
  var PIC_W = 128, PIC_H = 112, GAP = 4;   /* GAP: CSS pixels between the photo and the text above and below it */

  /* fit(w, h, top, bottom, overlay) -> {k, W, H, cssW, cssH, x0, y0, padTop, padBottom, topRows, botRows, ...}
     w and h are the stage's CSS size (fractional, from getBoundingClientRect); top and bottom are the CSS heights of
     the text above and below the photo. k is the largest whole number of CSS pixels an art pixel that still fits.
     W and H are the canvas in art pixels: W * k >= w and H * k >= h, so no paper shows at an edge.
     overlay false: padTop / padBottom centre the card; overlay true: the page's own header and footer keep the edges. */
  function fit(w, h, top, bottom, overlay) {
    w = +w || 0; h = +h || 0; top = Math.max(0, +top || 0); bottom = Math.max(0, +bottom || 0);
    var k = 1;
    if (w > 0 && h > 0) {
      var byW = Math.floor(w / PIC_W + 1e-9);
      var byH = Math.floor((h - top - bottom - 2 * GAP) / PIC_H + 1e-9);
      k = Math.max(1, Math.min(byW, byH >= 1 ? byH : 1));
    }
    var W = Math.max(PIC_W, Math.ceil(w / k - 1e-9));
    var padTop = 0, padBottom = 0, photoTop, topRows;
    if (overlay) {
      var H0 = Math.max(PIC_H, Math.ceil(h / k - 1e-9));
      var tRows = Math.ceil(top / k - 1e-9), bRows = Math.ceil(bottom / k - 1e-9);
      var extra = Math.max(0, H0 - tRows - bRows - PIC_H);
      topRows = tRows + Math.floor(extra * 0.5);
      photoTop = topRows * k;
    } else {
      /* the card: the status band, GAP, the photo, GAP, the caption band; centred on the page */
      var cardH = top + bottom + PIC_H * k + 2 * GAP;
      padTop = Math.max(0, Math.floor((h - cardH) / 2));
      padBottom = Math.max(0, h - cardH - padTop);
      photoTop = padTop + top + GAP;
      topRows = Math.ceil(photoTop / k - 1e-9);
    }
    var H = Math.max(PIC_H, Math.ceil(h / k - 1e-9), topRows + PIC_H);
    var botRows = Math.max(0, Math.ceil((h - (photoTop + PIC_H * k)) / k - 1e-9));
    return { w: w, h: h, top: top, bottom: bottom, k: k, W: W, H: H, cssW: W * k, cssH: H * k,
      x0: Math.floor((W - PIC_W) / 2), y0: topRows, topRows: topRows, botRows: botRows,
      padTop: padTop, padBottom: padBottom, photoTop: photoTop, photoBottom: photoTop + PIC_H * k,
      picW: PIC_W, picH: PIC_H };
  }

  return { fit: fit, PIC_W: PIC_W, PIC_H: PIC_H, GAP: GAP };
})();
