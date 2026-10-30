/*
 * Lo-PDA: the 4-FSK acoustic modem, M2. Pure functions only: no DOM, no Web Audio, no timers.
 * Text is not involved yet: bytes -> 2-bit symbols -> tone samples, and back.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * The frame carries a 16-symbol preamble/sync word, then the payload. A receiver that knows the payload
 * length correlates the preamble on a grid (1/8 symbol), refines the best phase, and samples each payload
 * symbol at its centre. That is enough timing for a burst; a tracking loop belongs to M3/M4.
 *
 * Bit order, fixed and tested: a byte is four symbols, MSB pair first.
 *   0xB4 = 10 11 01 00 -> symbols [2,3,1,0].
 * Both phones must use the same bit order and the same tone set.
 */
(function(root, factory){
  var api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  root.LopdaAcoustic=api;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this), function(){
"use strict";

var TONES=[1500,2500,3500,4500];
var GUARDS=[600,900,2000,3000,4000,5000,5800];
/* 8 alternating tones for timing, then a sync word that is unlikely to appear in payload data. */
var PREAMBLE=[0,3,0,3,0,3,0,3, 1,2,0,3,3,0,2,1];
var RATES=[40,20,10,5];
var MIN_SEP=6;       /* top tone must beat the runner-up by this much for a payload symbol */
var MIN_SYNC=12;     /* of the 16 preamble symbols; 12/16 is the gate */
var MIN_RMS=-60;     /* dBFS */
var SEARCH_SECONDS=8;

function db(p){ return 10*Math.log(p+1e-18)/Math.LN10; }
function clamp(x,a,b){ return x<a?a:(x>b?b:x); }

/* Goertzel over a Hann-windowed slice. The window sum normalises different lengths and different sample rates. */
function goertzel(samples, start, n, freq, sr){
  if(start<0 || n<4 || start+n>samples.length) return 0;
  var w=2*Math.PI*freq/sr, c=2*Math.cos(w);
  var s1=0, s2=0, sum=0, i, win, x, s0;
  for(i=0;i<n;i++){
    win=0.5-0.5*Math.cos(2*Math.PI*i/(n-1));
    x=samples[start+i]*win;
    s0=x+c*s1-s2;
    s2=s1; s1=s0; sum+=win;
  }
  var p=s1*s1+s2*s2-c*s1*s2;
  return p/(sum*sum+1e-18);
}

/* The four candidate energies in one window, plus RMS. `idx` is always the strongest candidate; `sep` says
   whether it is trustworthy. This is the only place the detector's thresholds live. */
function toneWindow(samples, start, n, sr){
  if(start<0 || n<4 || start+n>samples.length) return {idx:-1,sep:-999,rmsDb:-999,pdb:[-999,-999,-999,-999],valid:false};
  var p=[], i, sum=0, rms, top=0, second=-1, sep;
  for(i=0;i<4;i++) p[i]=db(goertzel(samples,start,n,TONES[i],sr));
  for(i=0;i<n;i++){ var v=samples[start+i]; sum+=v*v; }
  rms=Math.sqrt(sum/n);
  for(i=1;i<4;i++) if(p[i]>p[top]) top=i;
  for(i=0;i<4;i++) if(i!==top && (second<0 || p[i]>p[second])) second=i;
  sep=p[top]-p[second];
  var rmsDb=20*Math.log(rms+1e-9)/Math.LN10;
  return {idx:top, sep:sep, rmsDb:rmsDb, pdb:p, valid:sep>=MIN_SEP && rmsDb>MIN_RMS};
}

function bytesToSymbols(bytes){
  var out=[], i, b;
  for(i=0;i<bytes.length;i++){
    b=bytes[i]&255;
    out.push((b>>6)&3, (b>>4)&3, (b>>2)&3, b&3);
  }
  return out;
}

function symbolsToBytes(symbols){
  var out=[], i;
  for(i=0;i+3<symbols.length;i+=4){
    if(symbols[i]<0 || symbols[i+1]<0 || symbols[i+2]<0 || symbols[i+3]<0) out.push(null);
    else out.push((symbols[i]<<6)|(symbols[i+1]<<4)|(symbols[i+2]<<2)|symbols[i+3]);
  }
  return out;
}

/* A phase-continuous waveform: no clicks at symbol changes, because the sine's phase carries across them.
   Lead and tail silence keep the burst away from the recording's edges. */
function synth(bytes, opts){
  opts=opts||{};
  var sr=opts.sampleRate||48000, ms=opts.symbolMs||40, amp=opts.amp!=null?opts.amp:0.55;
  var period=sr*ms/1000;
  var symbols=PREAMBLE.concat(bytesToSymbols(bytes));
  var leadN=Math.round((opts.leadMs!=null?opts.leadMs:150)*sr/1000);
  var tailN=Math.round((opts.tailMs!=null?opts.tailMs:150)*sr/1000);
  var bodyN=Math.round(period*symbols.length);
  var out=new Float32Array(leadN+bodyN+tailN);
  var fadeN=Math.max(1,Math.round(0.005*sr));
  var phase=0, at=leadN, i, k, from, to, n, f, g;
  for(i=0;i<symbols.length;i++){
    from=Math.round(i*period); to=Math.round((i+1)*period); n=to-from;
    f=TONES[symbols[i]];
    for(k=0;k<n;k++){
      g=1;
      if(at-leadN<fadeN) g=(at-leadN)/fadeN;
      if(at>=leadN+bodyN-fadeN) g=Math.min(g, (leadN+bodyN-at)/fadeN);
      out[at++]=Math.sin(phase)*amp*clamp(g,0,1);
      phase+=2*Math.PI*f/sr;
      if(phase>2*Math.PI) phase-=2*Math.PI;
    }
  }
  return out;
}

function expectedSymbolsOf(bytes){ return bytesToSymbols(bytes); }

/* Score the known preamble at an exact start. Used to refine the grid's best phase. */
function scoreAt(samples, start, period, win, sr){
  var score=0, sepSum=0, i, r;
  for(i=0;i<PREAMBLE.length;i++){
    r=toneWindow(samples, Math.round(start+i*period), win, sr);
    if(r.idx===PREAMBLE[i] && r.sep>=4 && r.rmsDb>MIN_RMS){ score++; sepSum+=r.sep; }
  }
  return {score:score, sep:sepSum};
}

/* Decode one burst. expectedBytes is optional; without it the byte count comes from opts.symbolCount.
   Returns sync information even when the payload has errors, so the UI can say where it failed. */
function decode(samples, opts){
  opts=opts||{};
  var sr=opts.sampleRate||48000, ms=opts.symbolMs||40;
  var expected=opts.expectedBytes ? Array.prototype.slice.call(opts.expectedBytes) : null;
  var period=sr*ms/1000;
  var win=Math.max(64, Math.round(period));
  var payloadSymbols=opts.symbolCount || (expected ? expected.length*4 : 0);
  var need=(PREAMBLE.length+payloadSymbols)*period+win;
  var out={ok:false, reason:"short", sync:{ok:false, score:0, sep:0, startSample:0, offsetMs:0},
    symbols:[], confidences:[], bytes:[], expected:expected, symbolErrors:null, byteErrors:null,
    erasures:0, totalSymbols:payloadSymbols, totalBytes:expected?expected.length:0,
    goodput:0, totalMs:0, rate:ms, sampleRate:sr};
  if(!payloadSymbols) { out.reason="no length"; return out; }
  if(samples.length<need) return out;

  var searchSamples=Math.round((opts.searchSeconds||SEARCH_SECONDS)*sr);
  var from=Math.max(0, samples.length-searchSamples);
  if(samples.length-from<need) from=Math.max(0, samples.length-need);
  var step=Math.max(1, Math.round(period/8));
  var stride=period/step;
  var maxStart=samples.length-win;
  var grid=[], g, p, r;
  for(p=from; p<=maxStart; p+=step) grid.push(toneWindow(samples,p,win,sr));
  if(!grid.length) return out;

  var best={score:0, sep:0, g:0}, score, sepSum, okRms, gi, i;
  var maxG=grid.length-1-Math.round((PREAMBLE.length-1)*stride);
  for(g=0;g<=maxG;g++){
    score=0; sepSum=0; okRms=0;
    for(i=0;i<PREAMBLE.length;i++){
      gi=g+Math.round(i*stride);
      if(gi<0 || gi>=grid.length) continue;
      if(grid[gi].rmsDb>MIN_RMS) okRms++;
      if(grid[gi].idx===PREAMBLE[i] && grid[gi].sep>=4 && grid[gi].rmsDb>MIN_RMS){ score++; sepSum+=grid[gi].sep; }
    }
    if(okRms>=MIN_SYNC && (score>best.score || (score===best.score && sepSum>best.sep))){
      best={score:score, sep:sepSum, g:g};
    }
  }
  if(best.score<MIN_SYNC){ out.reason="no sync"; out.sync.score=best.score; return out; }

  var start=from+best.g*step;
  var refined=scoreAt(samples,start,period,win,sr), delta, cand;
  var deltas=[-step/2, -step/4, 0, step/4, step/2];
  for(i=0;i<deltas.length;i++){
    delta=deltas[i];
    if(start+delta<0) continue;
    cand=scoreAt(samples,start+delta,period,win,sr);
    if(cand.score>refined.score || (cand.score===refined.score && cand.sep>refined.sep)){ refined=cand; start=start+delta; }
  }
  out.sync={ok:true, score:refined.score, sep:refined.sep/PREAMBLE.length, startSample:Math.round(start),
    offsetMs:start/sr*1000};

  var payloadStart=start+PREAMBLE.length*period;
  var symbols=[], confidences=[], erasures=0;
  for(i=0;i<payloadSymbols;i++){
    r=toneWindow(samples, Math.round(payloadStart+i*period), win, sr);
    if(r.valid){ symbols.push(r.idx); } else { symbols.push(-1); erasures++; }
    confidences.push(r.sep);
  }
  var bytes=symbolsToBytes(symbols);
  out.symbols=symbols; out.confidences=confidences; out.bytes=bytes; out.erasures=erasures;
  out.totalSymbols=payloadSymbols; out.totalBytes=bytes.length;
  out.totalMs=(PREAMBLE.length+payloadSymbols)*ms;
  out.goodput=(out.totalBytes*8)/(out.totalMs/1000);

  if(expected){
    var expSym=expectedSymbolsOf(expected);
    var symErr=0, byteErr=0;
    for(i=0;i<expected.length*4;i++) if(symbols[i]!==expSym[i]) symErr++;
    for(i=0;i<expected.length;i++){
      if(bytes[i]===null || bytes[i]===undefined || bytes[i]!==expected[i]) byteErr++;
    }
    out.symbolErrors=symErr; out.byteErrors=byteErr;
    out.ok=byteErr===0 && symErr===0;
    out.reason=out.ok?"ok":"errors";
  }else{
    out.ok=erasures===0;
    out.reason=out.ok?"ok":"erasures";
  }
  return out;
}

/* Deterministic test payloads; both phones select the same one. */
function testBytes(kind){
  var out=[], i, state=1;
  if(kind==="count"){
    for(i=0;i<16;i++) out.push(i);
  }else if(kind==="random"){
    for(i=0;i<16;i++){ state=(state*1664525+1013904223)>>>0; out.push((state>>>24)&255); }
  }else{
    out=[0xA5,0x5A,0x3C,0xC3,0x0F,0xF0,0x96,0x69,0x12,0x34,0x56,0x78,0x9A,0xBC,0xDE,0xF0];
  }
  return out;
}

function hex(bytes){
  var s=[], i, v;
  for(i=0;i<bytes.length;i++){
    v=bytes[i];
    s.push(v==null?"??":("0"+v.toString(16)).slice(-2).toUpperCase());
  }
  return s.join(" ");
}

return {
  version:"m2",
  TONES:TONES,
  GUARDS:GUARDS,
  PREAMBLE:PREAMBLE,
  RATES:RATES,
  MIN_SEP:MIN_SEP,
  MIN_SYNC:MIN_SYNC,
  MIN_RMS:MIN_RMS,
  bytesToSymbols:bytesToSymbols,
  symbolsToBytes:symbolsToBytes,
  synth:synth,
  decode:decode,
  toneWindow:toneWindow,
  goertzel:goertzel,
  testBytes:testBytes,
  hex:hex
};
});
