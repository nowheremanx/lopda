/*
 * Lo-PDA runtime: a mono 16-bit PCM WAV writer, the small pure part of the tape machine's export
 * (docs/design/studio.md sections 5 and 12.14). No DOM and no AudioContext, so Node tests run it.
 *
 *   LopdaWav.encode(samples, sampleRate) -> Uint8Array
 *
 * `samples` is a Float32Array (or any array-like of numbers) in -1..1. Values outside that range are clamped, which is
 * the only thing this writer decides; the mix itself is the studio's. The header is the canonical 44-byte RIFF/WAVE
 * fmt + data pair, little endian, one channel, 2 bytes per sample.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var HEADER=44;

function writeText(view,at,text){
  var i;
  for(i=0;i<text.length;i++) view.setUint8(at+i,text.charCodeAt(i));
}

function encode(samples,sampleRate){
  var rate=Math.floor(sampleRate), n=samples && samples.length ? samples.length : 0, i, s, v;
  var bytes=HEADER+n*2, buf=new ArrayBuffer(bytes), view=new DataView(buf);
  writeText(view,0,"RIFF");
  view.setUint32(4,36+n*2,true);          /* size of everything after this field */
  writeText(view,8,"WAVE");
  writeText(view,12,"fmt ");
  view.setUint32(16,16,true);             /* PCM fmt chunk size */
  view.setUint16(20,1,true);              /* format 1: PCM */
  view.setUint16(22,1,true);              /* one channel */
  view.setUint32(24,rate,true);
  view.setUint32(28,rate*2,true);         /* byte rate: mono 16-bit */
  view.setUint16(32,2,true);              /* block align */
  view.setUint16(34,16,true);             /* bits per sample */
  writeText(view,36,"data");
  view.setUint32(40,n*2,true);
  for(i=0;i<n;i++){
    s=samples[i];
    if(typeof s!=="number" || !isFinite(s)) s=0;
    if(s<-1) s=-1;
    else if(s>1) s=1;
    /* the asymmetric 16-bit range: -1 maps to -32768 and 1 to 32767 */
    v=s<0 ? Math.round(s*32768) : Math.round(s*32767);
    if(v<-32768) v=-32768;
    if(v>32767) v=32767;
    view.setInt16(HEADER+i*2,v,true);
  }
  return new Uint8Array(buf);
}

window.LopdaWav={HEADER:HEADER, encode:encode};
})();
