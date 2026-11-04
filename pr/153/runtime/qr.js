/*
 * The runtime's QR helper. `window.LopdaQR` turns text into a module matrix and draws it on a canvas, so a later PAD API
 * can share the same code. It sits on the vendored qrcode-generator (MIT, runtime/vendor/qrcode-generator/), error
 * correction M, the smallest version that fits, UTF-8 bytes. No network.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var qr = window.qrcode;
/* addData("Byte") asks qrcode.stringToBytes; its default cuts each character to one byte. Point it at the UTF-8 table so
   Chinese and other non-Latin text survive. */
qr.stringToBytes = qr.stringToBytesFuncs["UTF-8"];
var MAX = 500;
/* matrix(text) -> {n, dark}; dark is row-major, 1 = dark, no quiet zone. Throws when text is over 500 UTF-8 bytes
   (more than anyone needs to type into the share page, and a guard against huge inputs). */
function matrix(text){
  text = String(text == null ? "" : text);
  valid(text);
  var q = qr(0, "M");
  q.addData(text, "Byte");
  q.make();
  var n = q.getModuleCount(), dark = new Uint8Array(n * n);
  for(var r = 0; r < n; r++){
    for(var c = 0; c < n; c++) dark[r * n + c] = q.isDark(r, c) ? 1 : 0;
  }
  return {n: n, dark: dark};
}
function valid(text){
  if(qr.stringToBytes(text).length > MAX) throw new Error("LopdaQR: text is longer than " + MAX + " bytes");
}
/* draw(canvas, text, scale): (n + 8) modules square, the quiet zone 4 modules on each side, `scale` whole pixels per
   module. The canvas gets its own width and height; every pixel goes through putImageData. */
function draw(canvas, text, scale){
  var s = Math.max(1, Math.floor(scale || 1)), m = matrix(text), side = (m.n + 8) * s;
  canvas.width = side; canvas.height = side;
  var ctx = canvas.getContext("2d"), im = ctx.createImageData(side, side), d = im.data;
  /* TONES[0] #1f2a14 ink, TONES[3] #a3ad7e paper (core.js), as RGB */
  var ink = [31, 42, 20], paper = [163, 173, 126];
  for(var y = 0; y < side; y++){
    for(var x = 0; x < side; x++){
      var r = Math.floor(y / s) - 4, c = Math.floor(x / s) - 4;
      var on = r >= 0 && c >= 0 && r < m.n && c < m.n && m.dark[r * m.n + c];
      var t = on ? ink : paper, o = (y * side + x) * 4;
      d[o] = t[0]; d[o + 1] = t[1]; d[o + 2] = t[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(im, 0, 0);
  return side;
}
window.LopdaQR = {matrix: matrix, draw: draw};
})();
