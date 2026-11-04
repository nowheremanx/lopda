/*
 * Lo-PDA: the viewfinder's look, shared by the camera (apps/camera.js), the viewfinder an app opens with PAD.camera.snap
 * (apps/snap.js), the reader's book pictures and the dev harness (sdk/dev.html). A picture becomes luma, then four tones
 * through the 4x4 Bayer matrix. Pure functions apart from grabber(), which owns a canvas; tests/finder.test.mjs runs the
 * rest in node:vm. docs/decisions.md sections 4 and 28.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

/* the 4x4 Bayer matrix every import and photo is dithered with (core.js shares it as LP.BAYER) */
var BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];

/* the largest centred w:h crop of an sw x sh picture: [x, y, width, height] in the picture */
function crop(sw,sh,w,h){
  var ar=w/h, cw=sw, ch=sw/ar; if(ch>sh){ ch=sh; cw=sh*ar; }
  return [(sw-cw)/2,(sh-ch)/2,cw,ch];
}
/* RGBA bytes -> luma 0-1 (Rec. 709 weights), one value per pixel */
function luma(d,n){
  var lum=new Float32Array(n);
  for(var i=0;i<n;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255;
  return lum;
}
/* luma -> tone indices 0-3 (0 = ink ... 3 = paper). The levels stretch between the 2nd and 98th percentile, edges are
   sharpened a little, then exposure (a gamma, 1.35 per step) and contrast (1.3 per step) apply, both -3..3 */
function ditherLuma(lum,w,h,exposure,contrast){
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
/* -> lumaFrom(src, sw, sh, w, h, mirror): the centred crop of a video (or image) scaled to w x h, mirrored for a front lens,
   as luma. Each grabber draws on a canvas of its own */
function grabber(){
  var cv=document.createElement("canvas"), ctx=cv.getContext("2d",{willReadFrequently:true});
  return function(src,sw,sh,w,h,mirror){
    var c=crop(sw,sh,w,h);
    if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; }
    var x=ctx; x.save(); x.imageSmoothingEnabled=true;
    if(mirror){ x.translate(w,0); x.scale(-1,1); }
    x.drawImage(src,c[0],c[1],c[2],c[3],0,0,w,h); x.restore();
    return luma(x.getImageData(0,0,w,h).data,w*h);
  };
}

/* the sizes PAD.camera.snap gives an app (SPEC.md 6.6): the camera's two film formats */
var SIZES={small:{w:128, h:112}, large:{w:256, h:224}};

window.LopdaFinder={BAYER:BAYER, crop:crop, luma:luma, ditherLuma:ditherLuma, grabber:grabber, SIZES:SIZES};
})();
