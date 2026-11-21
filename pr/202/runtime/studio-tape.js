/*
 * Lo-PDA runtime: the tape machine's tape colour (docs/design/studio.md sections 1 and 12.14).
 * One knob, five positions (0-4): a lowpass, a bit-depth crush, a slow wow and a little flutter, tape hiss and a few
 * crackles. Everything is built from WebAudio nodes, so the live player and the offline WAV render hear the same chain.
 * Position 0 is the identity (filter wide open, no crush, no wow, no noise), so a clean tape is possible.
 *
 *   LopdaStudioTape.create(ctx, out) -> {input, set(level), start(at, dur), dispose()}
 *
 * `input` is where the instrument synth connects. `start` starts the noise and the two LFOs at `at` (now when it is
 * left out; an offline render passes 0) and stops them at `at + dur` when a duration is given. `set` may be called
 * before or after start. No Math.random: the hiss and crackles come from the same seeded generator as the synth, so an
 * offline render is repeatable.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var MAX=4, BASE_DELAY=0.012, NOISE_SECONDS=2;

/* the five positions: filter cutoff, bit depth, wow depth (s), wet delay mix, hiss/crackle level.
   3 and 4 were made gentler (owner, 2026-10-30: "4 is very, very heavy; I already don't like 3"): 4 now sits between
   the old 2 and 3, so the strongest tape still sounds worn but every note survives it. 0-2 are unchanged. */
var COLOR=[
  {cut:20000, bits:16, wow:0,     wet:0,    noise:0},
  {cut:7000,  bits:11, wow:0.0015,wet:0.10, noise:0.0012},
  {cut:4000,  bits:9,  wow:0.0025,wet:0.18, noise:0.0025},
  {cut:3400,  bits:9,  wow:0.0028,wet:0.20, noise:0.0030},
  {cut:2800,  bits:8,  wow:0.0031,wet:0.22, noise:0.0036}
];

function clampLevel(n){
  if(typeof n!=="number" || !isFinite(n)) return 0;
  n=Math.round(n);
  return n<0?0:n>MAX?MAX:n;
}

function rng(seed){
  var x=(seed|0)||1;
  return function(){ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; };
}

/* one shared noise buffer per AudioContext, like the synth's: two seconds of quiet hiss with a few crackles */
var noiseMap=typeof WeakMap==="function" ? new WeakMap() : null, lastNoise=null;
function noiseFor(ctx){
  var buf;
  if(noiseMap){
    buf=noiseMap.get(ctx);
    if(buf) return buf;
  } else if(lastNoise && lastNoise.ctx===ctx) return lastNoise.buf;
  var n=Math.max(1,Math.round(ctx.sampleRate*NOISE_SECONDS)), b=ctx.createBuffer(1,n,ctx.sampleRate);
  var d=b.getChannelData(0), r=rng(0x6a09e667), i=0, j, amp, len;
  for(j=0;j<n;j++) d[j]=(r()*2-1)*0.14;
  while(i<n){
    i+=Math.floor(ctx.sampleRate*(0.04+r()*0.30));
    if(i>=n) break;
    amp=0.25+r()*0.55;
    len=Math.max(1,Math.floor(ctx.sampleRate*(0.002+r()*0.005)));
    for(j=0;j<len && i+j<n;j++) d[i+j]+=(r()*2-1)*amp*Math.exp(-j/(len/4));
  }
  if(noiseMap) noiseMap.set(ctx,b); else lastNoise={ctx:ctx, buf:b};
  return b;
}

/* a crush curve for one bit depth: values snap to the nearest 1/2^(bits-1). Position 0 returns a plain wire; above it
   a gentle cubic bends the peaks down first, which is the tape's light compression (no look-ahead, so a render is still
   repeatable). */
var curves={};
function crushCurve(level,bits){
  if(curves[level]) return curves[level];
  var n=4097, c=new Float32Array(n), i, x, levels=Math.pow(2,bits-1), drive=0.02*level;
  for(i=0;i<n;i++){
    x=-1+2*i/(n-1);
    if(level<=0) c[i]=x;
    else {
      x-=drive*x*x*x;
      c[i]=Math.round(x*levels)/levels;
      if(c[i]>1) c[i]=1;
      else if(c[i]<-1) c[i]=-1;
    }
  }
  curves[level]=c;
  return c;
}

function create(ctx,out){
  var input=ctx.createGain();
  var filter=ctx.createBiquadFilter(), dry=ctx.createGain(), wet=ctx.createGain();
  var delay=ctx.createDelay(0.1), mix=ctx.createGain(), shaper=ctx.createWaveShaper(), post=ctx.createGain();
  var wow1=ctx.createOscillator(), wow2=ctx.createOscillator(), wowGain=ctx.createGain();
  var noise=ctx.createBufferSource(), noiseFilter=ctx.createBiquadFilter(), noiseGain=ctx.createGain();
  var level=0, started=false, disposed=false;

  filter.type="lowpass";
  filter.Q.value=0.7;
  delay.delayTime.value=BASE_DELAY;
  wow1.type="sine"; wow1.frequency.value=0.45;
  wow2.type="sine"; wow2.frequency.value=5.3;
  shaper.oversample="none";
  noise.buffer=noiseFor(ctx);
  noise.loop=true;
  noiseFilter.type="lowpass"; noiseFilter.frequency.value=7000; noiseFilter.Q.value=0.5;

  input.connect(filter);
  filter.connect(dry); dry.connect(mix);
  filter.connect(delay); delay.connect(wet); wet.connect(mix);
  wow1.connect(wowGain); wow2.connect(wowGain); wowGain.connect(delay.delayTime);
  mix.connect(shaper); shaper.connect(post);
  noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(post);
  post.connect(out || ctx.destination);

  function set(n){
    var c;
    level=clampLevel(n);
    c=COLOR[level];
    filter.frequency.value=c.cut;
    dry.gain.value=1-c.wet;
    wet.gain.value=c.wet;
    wowGain.gain.value=c.wow;
    noiseGain.gain.value=c.noise;
    shaper.curve=crushCurve(level,c.bits);
  }

  function start(at,dur){
    if(started || disposed) return;
    started=true;
    var t=(typeof at==="number" && isFinite(at)) ? at : ctx.currentTime;
    var end=(typeof dur==="number" && isFinite(dur) && dur>0) ? t+dur : 0;
    wow1.start(t); wow2.start(t); noise.start(t);
    if(end){ wow1.stop(end); wow2.stop(end); noise.stop(end); }
  }

  function dispose(){
    if(disposed) return;
    disposed=true;
    try{ if(started){ wow1.stop(); wow2.stop(); noise.stop(); } }catch(e){}
    var nodes=[input,filter,dry,wet,delay,mix,shaper,post,wow1,wow2,wowGain,noise,noiseFilter,noiseGain], i;
    for(i=0;i<nodes.length;i++){ try{ nodes[i].disconnect(); }catch(e){} }
  }

  set(0);
  return {input:input, set:set, start:start, dispose:dispose};
}

window.LopdaStudioTape={MAX:MAX, create:create};
})();
