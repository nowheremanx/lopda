/*
 * Lo-PDA runtime: the drum voices of the four-track tape machine (docs/design/studio.md sections 1, 3 and 11).
 * Two kits, every sound synthesised: the 8-bit `chip` kit and the lofi `soft` kit (muffled kick, brush snare).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 *   LopdaStudioSynth.KITS             the registry: kit id -> function(ctx, out) -> {hit(drum, at, vel)}
 *   LopdaStudioSynth.create(ctx,out)  -> {hit(kit, drum, at, vel), dispose()}
 *
 * Sounds are a registry and not a switch: adding an instrument is adding one entry to KITS (design rule, section 3.4).
 * A kit is built on its first hit, so a song that never uses the soft kit pays nothing for it. All the random noise
 * comes from one seeded xorshift generator per context, never Math.random, so an offline render is the same every run.
 *
 * Levels: every drum peaks at or below 0.9 on its own at velocity 1 (the numbers below have room for two drums on one
 * step: a kick and a hat together are about 0.83). The demo beat then sits near PAD.music's songs in loudness.
 */
(function(){
"use strict";

var SILENCE=0.0001;         /* an exponential ramp may not reach 0; this is inaudible at 16-bit */

/* ---------- helpers ---------- */

/* the same small seeded generator as chip.js: four bytes of state, no Math.random anywhere */
function rng(seed){
  var x=(seed|0)||1;
  return function(){ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; };
}

/* one shared white-noise buffer per AudioContext: an hour of looping hits reads it from the start each time, so every
   hit of a kind sounds the same and a render is repeatable. */
var noises=[];
function noiseFor(ctx){
  var i;
  for(i=0;i<noises.length;i++) if(noises[i].ctx===ctx) return noises[i].buf;
  var n=Math.max(1,Math.round(ctx.sampleRate)), buf=ctx.createBuffer(1,n,ctx.sampleRate), d=buf.getChannelData(0);
  var r=rng(0x1a2b3c4d);
  for(i=0;i<n;i++) d[i]=r()*2-1;
  noises.push({ctx:ctx, buf:buf});
  return buf;
}

/* an envelope that starts at silence, opens fast and dies away exponentially (never to exactly zero) */
function decay(param,at,peak,attack,release){
  param.setValueAtTime(SILENCE,at);
  param.linearRampToValueAtTime(peak,at+attack);
  param.exponentialRampToValueAtTime(SILENCE,at+attack+release);
}

/* every node of a hit disconnects when its source ends: a long loop leaves no graph behind */
function cleanup(src,nodes){
  src.onended=function(){
    for(var i=0;i<nodes.length;i++){ try{ nodes[i].disconnect(); }catch(e){} }
  };
}

function velOf(v){ return typeof v==="number" && isFinite(v) ? (v<0?0:v>1?1:v) : 1; }

/* a filtered noise voice; `end` is when it stops, release the envelope after the attack */
function noiseVoice(ctx,out,buf,type,freq,q,peak,attack,release,end,at){
  var s=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
  s.buffer=buf;
  f.type=type; f.frequency.value=freq; f.Q.value=q;
  decay(g.gain,at,peak,attack,release);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(at); s.stop(at+end);
  cleanup(s,[s,f,g]);
  return s;
}

function toneVoice(ctx,out,type,freq,peak,attack,release,end,at,from,glide){
  var o=ctx.createOscillator(), g=ctx.createGain();
  o.type=type;
  o.frequency.setValueAtTime(from||freq,at);
  if(from && from!==freq) o.frequency.exponentialRampToValueAtTime(freq,at+Math.max(0.01,glide||release*0.5));
  decay(g.gain,at,peak,attack,release);
  o.connect(g); g.connect(out);
  o.start(at); o.stop(at+end);
  cleanup(o,[o,g]);
  return o;
}

/* ---------- the kits ----------
   id -> constructor(ctx, out); each returns {hit(drum, at, vel)}. Add an entry to add an instrument. */

var KITS={};

/* 8-bit: square waves and raw noise, short and bright */
KITS.chip=function(ctx,out){
  var noise=noiseFor(ctx);
  return {
    hit:function(drum,at,vel){
      var v=velOf(vel), o, g;
      if(drum==="kick"){
        /* square, 150 -> 45 Hz in 120 ms; peak 0.55 */
        o=ctx.createOscillator(); g=ctx.createGain();
        o.type="square";
        o.frequency.setValueAtTime(150,at);
        o.frequency.exponentialRampToValueAtTime(45,at+0.12);
        decay(g.gain,at,0.55*v,0.002,0.16);
        o.connect(g); g.connect(out);
        o.start(at); o.stop(at+0.18);
        cleanup(o,[o,g]);
      } else if(drum==="snare"){
        /* a short hiss and a square blip; peaks 0.38 + 0.16 */
        noiseVoice(ctx,out,noise,"highpass",1200,0.7,0.38*v,0.001,0.13,0.15,at);
        toneVoice(ctx,out,"square",180,0.16*v,0.001,0.05,0.07,at);
      } else if(drum==="hat"){
        /* 40 ms of high noise; peak 0.28 */
        noiseVoice(ctx,out,noise,"highpass",6500,0.7,0.28*v,0.001,0.04,0.05,at);
      } else if(drum==="perc"){
        /* cowbell: two detuned high squares into one envelope; 0.16 each, 0.32 together */
        o=ctx.createOscillator(); var o2=ctx.createOscillator(); g=ctx.createGain();
        o.type="square"; o2.type="square";
        o.frequency.value=1300; o2.frequency.value=1750;
        decay(g.gain,at,0.16*v,0.001,0.05);
        o.connect(g); o2.connect(g); g.connect(out);
        o.start(at); o.stop(at+0.07); o2.start(at); o2.stop(at+0.07);
        cleanup(o,[o,o2,g]);
      }
    }
  };
};

/* lofi: a warm sine kick, a brush snare, a quiet hat and a wood block */
KITS.soft=function(ctx,out){
  var noise=noiseFor(ctx);
  return {
    hit:function(drum,at,vel){
      var v=velOf(vel);
      if(drum==="kick"){
        /* sine 110 -> 45 Hz over 350 ms plus a soft click; peaks 0.55 + 0.06 */
        toneVoice(ctx,out,"sine",45,0.55*v,0.004,0.30,0.37,at,110,0.35);
        noiseVoice(ctx,out,noise,"highpass",1800,0.7,0.06*v,0.001,0.012,0.02,at);
      } else if(drum==="snare"){
        /* brush: band-passed noise, a 5 ms attack and a 180 ms fall, plus a quiet low body; peaks 0.38 + 0.10 */
        noiseVoice(ctx,out,noise,"bandpass",1800,0.8,0.38*v,0.005,0.18,0.21,at);
        toneVoice(ctx,out,"sine",170,0.10*v,0.01,0.15,0.18,at);
      } else if(drum==="hat"){
        /* 60 ms, quiet; peak 0.22 */
        noiseVoice(ctx,out,noise,"highpass",7000,0.7,0.22*v,0.002,0.055,0.07,at);
      } else if(drum==="perc"){
        /* wood block, triangle around 800 Hz; peak 0.42 */
        toneVoice(ctx,out,"triangle",800,0.42*v,0.002,0.075,0.09,at);
      }
    }
  };
};

/* ---------- the mix ---------- */

function create(ctx,out){
  var master=ctx.createGain();
  master.gain.value=1;
  if(out) master.connect(out); else master.connect(ctx.destination);
  var built={}, disposed=false;

  function hit(kit,drum,at,vel){
    if(disposed) return;
    /* unknown kit: nothing, not an error */
    if(!Object.prototype.hasOwnProperty.call(KITS,kit)) return;
    var t=(typeof at==="number" && isFinite(at)) ? at : ctx.currentTime;
    if(t<ctx.currentTime) t=ctx.currentTime;
    var k=built[kit];
    if(!k) k=built[kit]=KITS[kit](ctx,master);
    k.hit(drum,t,vel);
  }

  function dispose(){
    if(disposed) return;
    disposed=true;
    try{ master.disconnect(); }catch(e){}
  }

  return {hit:hit, dispose:dispose};
}

window.LopdaStudioSynth={KITS:KITS, create:create};
})();
