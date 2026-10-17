// runtime/finder.js: the viewfinder's look, shared by the camera program, the snap viewfinder (PAD.camera.snap), the reader
// and sdk/dev.html (decisions.md section 28). The camera program must not change: OLD below is its code before the move,
// copied from apps/camera.js at main 8895e27, and the shared helpers must give exactly the same bytes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, read } from "./helpers.mjs";

/* ---- the camera program's code before 0.28.0, verbatim ---- */
const OLD_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function oldDitherLuma(lum, w, h, exposure, contrast) {
  var BAYER = OLD_BAYER;
  var hist=new Uint32Array(256), N=lum.length;
  for(var q=0;q<N;q++) hist[Math.min(255,Math.max(0,(lum[q]*255)|0))]++;
  var pct=function(f){ var want=N*f, acc=0; for(var b=0;b<256;b++){ acc+=hist[b]; if(acc>want) return b/255; } return 1; };
  var lo=pct(0.02), hi=pct(0.98), span=Math.max(0.05,hi-lo);
  var out=new Uint8Array(w*h), gain=Math.pow(1.35,exposure);
  for(var y=0;y<h;y++) for(var x=0;x<w;x++){
    var k=y*w+x, v=(lum[k]-lo)/span;
    var nb=0,n=0; if(x>0){nb+=lum[k-1];n++} if(x<w-1){nb+=lum[k+1];n++} if(y>0){nb+=lum[k-w];n++} if(y<h-1){nb+=lum[k+w];n++}
    v+= ((lum[k]-nb/n)/span)*0.6;
    if(contrast) v=0.5+(v-0.5)*Math.pow(1.3,contrast);
    v=Math.pow(Math.max(0,Math.min(1,v)),1/gain);
    var t=(BAYER[(y%4)*4+(x%4)]+0.5)/16-0.5;
    out[k]=Math.max(0,Math.min(3,Math.round(v*3+t)));
  }
  return out;
}
function oldLumaFrom(LIVE, src, sw, sh, w, h, mirror) {
  var ar=w/h, cw=sw, ch=sw/ar; if(ch>sh){ ch=sh; cw=sh*ar; }
  if(LIVE.cv.width!==w||LIVE.cv.height!==h){ LIVE.cv.width=w; LIVE.cv.height=h; }
  var x=LIVE.ctx; x.save(); x.imageSmoothingEnabled=true;
  if(mirror){ x.translate(w,0); x.scale(-1,1); }
  x.drawImage(src,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,w,h); x.restore();
  var d=x.getImageData(0,0,w,h).data, lum=new Float32Array(w*h);
  for(var i=0;i<lum.length;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255;
  return lum;
}

/* a synthetic camera frame: RGBA bytes from a seeded generator with gradients, so every tone and the edge sharpening show */
function frameRGBA(w, h, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, g = (x / w) * 200 + (y / h) * 40;
    d[o] = Math.min(255, g + rnd() * 30); d[o + 1] = Math.min(255, g * 0.9 + rnd() * 40); d[o + 2] = (x * 7 + y * 3) % 256; d[o + 3] = 255;
  }
  return d;
}
/* a canvas that records every call and answers getImageData with the synthetic frame */
function fakeCanvas(log, w0, h0, seed) {
  const ctx = new Proxy({}, {
    get: (_, k) => k === "getImageData" ? (x, y, w, h) => { log.push(["getImageData", x, y, w, h]); return { data: frameRGBA(w, h, seed) }; }
      : (...a) => log.push([k, ...a]),
    set: (_, k, v) => { log.push(["set", k, v]); return true; },
  });
  return { width: w0, height: h0, getContext: (kind, o) => { log.push(["getContext", kind, JSON.stringify(o)]); return ctx; } };
}

const F = runScript("runtime/finder.js").LopdaFinder;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test("the Bayer matrix is the one core.js has always shared as LP.BAYER", () => {
  assert.deepEqual([...F.BAYER], OLD_BAYER);
  assert.match(read("runtime/core.js"), /var BAYER=window\.LopdaFinder\.BAYER;/);
});

test("ditherLuma gives byte-identical frames to the camera program's old code, every exposure and contrast, both formats", () => {
  for (const [w, h] of [[128, 112], [256, 224], [7, 5]]) {
    const lum = F.luma(frameRGBA(w, h, w * 31 + h), w * h);
    for (let e = -3; e <= 3; e++) for (let c = -3; c <= 3; c++) {
      const a = F.ditherLuma(lum, w, h, e, c), b = oldDitherLuma(lum, w, h, e, c);
      assert.ok(same(a, b), `${w}x${h} exposure ${e} contrast ${c}`);
    }
  }
});

test("the dithered picture has only tones 0-3 and w*h of them, for the small and the large size", () => {
  for (const size of ["small", "large"]) {
    const { w, h } = F.SIZES[size];
    for (const lum of [F.luma(frameRGBA(w, h, 7), w * h), new Float32Array(w * h), new Float32Array(w * h).fill(1)]) {
      const px = F.ditherLuma(lum, w, h, 0, 0);
      assert.equal(px.constructor.name, "Uint8Array");
      assert.equal(px.length, w * h);
      assert.ok(px.every((v) => v >= 0 && v <= 3));
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(F.SIZES)), { small: { w: 128, h: 112 }, large: { w: 256, h: 224 } });
});

test("grabber draws exactly what the camera's old lumaFrom drew, and gives the same luma, mirrored or not", () => {
  const cases = [[1280, 960, 128, 112, false], [960, 1280, 128, 112, true], [640, 480, 256, 224, false], [1920, 1080, 256, 224, true]];
  for (const [sw, sh, w, h, mirror] of cases) {
    const oldLog = [], newLog = [], src = { video: true };
    const cv = fakeCanvas(oldLog, 0, 0, 5), LIVE = { cv, ctx: cv.getContext("2d", { willReadFrequently: true }) };
    const before = oldLumaFrom(LIVE, src, sw, sh, w, h, mirror);
    const G = runScript("runtime/finder.js", { document: { createElement: () => fakeCanvas(newLog, 0, 0, 5) } }).LopdaFinder;
    const after = G.grabber()(src, sw, sh, w, h, mirror);
    assert.deepEqual(newLog.map((x) => x.map((v) => v === src ? "src" : v)), oldLog.map((x) => x.map((v) => v === src ? "src" : v)), `${sw}x${sh} -> ${w}x${h}`);
    assert.ok(same(after, before));
  }
});

test("crop is the largest centred 8:7 piece", () => {
  assert.deepEqual([...F.crop(1280, 960, 128, 112)], [(1280 - 960 * 8 / 7) / 2, 0, 960 * 8 / 7, 960]);
  assert.deepEqual([...F.crop(960, 1280, 128, 112)], [0, (1280 - 840) / 2, 960, 840]);
});
