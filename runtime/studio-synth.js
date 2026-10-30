/*
 * Lo-PDA runtime: the drum voices and the melodic voices of the four-track tape machine
 * (docs/design/studio.md sections 1, 3, 11, 12.6 and 12.20).
 * Four kits, every sound synthesised: the 8-bit `chip` kit and the lofi `soft` kit (muffled kick, brush snare), the
 * acoustic `rock` kit (bright kick, loud snare, crash) and the `electro` kit (808 kick, clap, cowbell).
 * Ten melodic voices: bass `bass` (triangle and sub sine), `pick` (filtered saw) and `sub` (slided sine, a little
 * tanh); chords `keys` (FM electric piano), `guitar` (Karplus-Strong, brighter, strummed by the player), `piano`
 * (two-operator FM with a hammer), `organ` (three sines and a tremolo) and `strings` (two detuned saws); melody
 * `flute` (sine, a little triangle, breath and a late vibrato), `square` (25% pulse), `pluck` (Karplus-Strong),
 * `reed` (band-passed square and breath) and `bowed` (a saw with a slide and a late vibrato).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 *   LopdaStudioSynth.KITS             the registry: kit id -> function(ctx, out) -> {hit(drum, at, vel)}
 *   LopdaStudioSynth.VOICES           the registry: voice id -> function(ctx, out) -> {note(midi, at, dur, vel)}
 *   LopdaStudioSynth.create(ctx,out)  -> {hit(kit, drum, at, vel), note(voice, midi, at, dur, vel), dispose()}
 *   LopdaStudioSynth.STRUM            voice id -> seconds between the notes of a strummed chord (guitar: 0.012)
 *
 * Sounds are a registry and not a switch: adding an instrument is adding one entry to KITS or VOICES (design rule,
 * section 3.4). A kit or voice is built on its first use, so a song that never uses the soft kit or the pluck pays
 * nothing for it. All the random noise comes from one seeded xorshift generator per context, never Math.random, so
 * an offline render is the same every run.
 *
 * The whole mix goes through a soft ceiling (section 12.6): no compressor, so there is no look-ahead latency, the
 * render is sample-exact every time, and loud hits bend like tape instead of clipping. Below 0.7 it is a plain wire,
 * so a single drum keeps the level it had before the ceiling.
 *
 * Levels (measured by tests/studio-e2e.test.mjs at 22.05 kHz): all four drums on one step peak 0.79 for both old
 * kits, well under 0.85; each old drum alone stays between 0.13 and 0.49 at velocity 1. The new kits stay under
 * 0.5 a drum and 0.9 for all four on one step. The demo beat's rms is 0.53x the paper tower's title tune with the
 * chip kit and 0.62x with the soft kit, so it sits near PAD.music's songs. The melodic voices at velocity 1 peak
 * 0.30 for bass, 0.072 per keys note, 0.22 for flute and 0.26 for pluck; the new voices stay in the same windows
 * (bass 0.2-0.36, a chord note 0.04-0.11, melody 0.15-0.28); bass 45, a four-note keys chord and pluck 69 together
 * peak 0.58, so the notes alone stay under 0.6. The four-bar demo pattern (drums, bass and chords) with the soft
 * kit peaks 0.77, and the 24-bar example tape with all four tracks peaks under the section 12.6 target of 0.9; the
 * dense drum hit stops at the 0.908 ceiling.
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
   hit of a kind sounds the same and a render is repeatable. A WeakMap lets a dead context's buffer go with it; the
   runtime rebuilds the AudioContext after the phone stops it, and keeping every old one would leak. Without WeakMap
   (very old browsers) only the last context is kept. */
var noiseMap=typeof WeakMap==="function" ? new WeakMap() : null, lastNoise=null;
function noiseFor(ctx){
  var i, buf;
  if(noiseMap){
    buf=noiseMap.get(ctx);
    if(buf) return buf;
  } else if(lastNoise && lastNoise.ctx===ctx) return lastNoise.buf;
  var n=Math.max(1,Math.round(ctx.sampleRate)), b=ctx.createBuffer(1,n,ctx.sampleRate), d=b.getChannelData(0);
  var r=rng(0x1a2b3c4d);
  for(i=0;i<n;i++) d[i]=r()*2-1;
  if(noiseMap) noiseMap.set(ctx,b); else lastNoise={ctx:ctx, buf:b};
  return b;
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

/* equal temperament, A4 (69) = 440 Hz; the project stores plain MIDI numbers */
function midiFreq(midi){ return 440*Math.pow(2,(midi-69)/12); }

/* a note may be handed a time the 25 ms scheduler has already passed (the main thread stalled): start now, as hit does */
function when(ctx,at){ return (typeof at==="number" && isFinite(at) && at>ctx.currentTime) ? at : ctx.currentTime; }

/* 12.20.5: the two ornaments a note may carry. A slide starts two semitones below and reaches the pitch in 80 ms; a
   vibrato is 6 Hz at 25 cents from the very start. `param` is an oscillator's frequency or a buffer source's
   playbackRate; `base` is the value 25 cents is measured against. No ornament adds no node, so an old tape's render is
   unchanged. */
function slideParam(param,base,t){
  param.setValueAtTime(base*Math.pow(2,-2/12),t);
  param.exponentialRampToValueAtTime(base,t+0.08);
}

/* one 6 Hz LFO with a gain per parameter, so an octave-down partial gets its own 25 cents. Returns the nodes to clean
   up; the caller adds them to its cleanup list. */
function vibParams(ctx,t,end,list){
  var o=ctx.createOscillator(), out=[o], i, g;
  o.type="sine"; o.frequency.value=6;
  for(i=0;i<list.length;i++){
    g=ctx.createGain();
    g.gain.value=list[i].base*(Math.pow(2,25/1200)-1);
    o.connect(g); g.connect(list[i].param);
    out.push(g);
  }
  o.start(t); o.stop(end);
  return out;
}

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

/* kit trims, picked from measured offline renders: the chip squares add up to about 1.3 peak with all four drums on
   one step, so 0.57 brings that to 0.79 (0.84 even at 48 kHz); the softer waves add up to 0.91, so 0.90 leaves them
   at 0.79. CHIP_TAIL lengthens the chip decays by the same factor for every drum, which keeps their balance and the
   demo beat near the loudness of PAD.music (a shorter 8-bit hit at this lower level was too quiet against it). */
var CHIP_LEVEL=0.57, CHIP_TAIL=2.3, SOFT_LEVEL=0.90;
/* The 12.20 kits' trims, picked the same way: the raw peaks are near 0.6-0.7 a drum, and these bring one drum under
   0.5 while all four on one step stay under the soft clip's 0.9 target. */
var ROCK_LEVEL=0.62, ELECTRO_LEVEL=0.60;

var KITS={};

/* 8-bit: square waves and raw noise, short and bright */
KITS.chip=function(ctx,out){
  var noise=noiseFor(ctx);
  return {
    hit:function(drum,at,vel){
      var v=velOf(vel), o, g;
      if(v<=0) return;
      if(drum==="kick"){
        /* square, 150 -> 45 Hz in 120 ms; peak 0.55 * CHIP_LEVEL */
        o=ctx.createOscillator(); g=ctx.createGain();
        o.type="square";
        o.frequency.setValueAtTime(150,at);
        o.frequency.exponentialRampToValueAtTime(45,at+0.12);
        decay(g.gain,at,0.55*v*CHIP_LEVEL,0.002,0.16*CHIP_TAIL);
        o.connect(g); g.connect(out);
        o.start(at); o.stop(at+0.39);
        cleanup(o,[o,g]);
      } else if(drum==="snare"){
        /* a short hiss and a square blip; peaks (0.38 + 0.16) * CHIP_LEVEL */
        noiseVoice(ctx,out,noise,"highpass",1200,0.7,0.38*v*CHIP_LEVEL,0.001,0.13*CHIP_TAIL,0.31,at);
        toneVoice(ctx,out,"square",180,0.16*v*CHIP_LEVEL,0.001,0.05*CHIP_TAIL,0.14,at);
      } else if(drum==="hat"){
        /* high noise, 0.04 s * CHIP_TAIL (about 88 ms); peak 0.28 * CHIP_LEVEL */
        noiseVoice(ctx,out,noise,"highpass",6500,0.7,0.28*v*CHIP_LEVEL,0.001,0.04*CHIP_TAIL,0.11,at);
      } else if(drum==="perc"){
        /* cowbell: two detuned high squares into one envelope; (0.16 + 0.16) * CHIP_LEVEL together */
        o=ctx.createOscillator(); var o2=ctx.createOscillator(); g=ctx.createGain();
        o.type="square"; o2.type="square";
        o.frequency.value=1300; o2.frequency.value=1750;
        decay(g.gain,at,0.16*v*CHIP_LEVEL,0.001,0.05*CHIP_TAIL);
        o.connect(g); o2.connect(g); g.connect(out);
        o.start(at); o.stop(at+0.14); o2.start(at); o2.stop(at+0.14);
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
      if(v<=0) return;
      if(drum==="kick"){
        /* sine 110 -> 45 Hz over 350 ms plus a soft click; peaks (0.55 + 0.06) * SOFT_LEVEL */
        toneVoice(ctx,out,"sine",45,0.55*v*SOFT_LEVEL,0.004,0.30,0.37,at,110,0.35);
        noiseVoice(ctx,out,noise,"highpass",1800,0.7,0.06*v*SOFT_LEVEL,0.001,0.012,0.02,at);
      } else if(drum==="snare"){
        /* brush: band-passed noise, a 5 ms attack and a 180 ms fall, plus a quiet low body; peaks (0.38 + 0.10) * SOFT_LEVEL */
        noiseVoice(ctx,out,noise,"bandpass",1800,0.8,0.38*v*SOFT_LEVEL,0.005,0.18,0.21,at);
        toneVoice(ctx,out,"sine",170,0.10*v*SOFT_LEVEL,0.01,0.15,0.18,at);
      } else if(drum==="hat"){
        /* 60 ms, quiet; peak 0.22 * SOFT_LEVEL */
        noiseVoice(ctx,out,noise,"highpass",7000,0.7,0.22*v*SOFT_LEVEL,0.002,0.055,0.07,at);
      } else if(drum==="perc"){
        /* wood block, triangle around 800 Hz; peak 0.42 * SOFT_LEVEL */
        toneVoice(ctx,out,"triangle",800,0.42*v*SOFT_LEVEL,0.002,0.075,0.09,at);
      }
    }
  };
};

/* acoustic: a bright sine kick with a click, a loud band-passed snare with a low body, a high hat and a crash */
KITS.rock=function(ctx,out){
  var noise=noiseFor(ctx);
  return {
    hit:function(drum,at,vel){
      var v=velOf(vel);
      if(v<=0) return;
      if(drum==="kick"){
        /* sine 120 -> 50 Hz in 180 ms plus a 30 ms click; peaks (0.52 + 0.10) * ROCK_LEVEL */
        toneVoice(ctx,out,"sine",50,0.52*v*ROCK_LEVEL,0.002,0.18,0.22,at,120,0.18);
        noiseVoice(ctx,out,noise,"highpass",3000,0.7,0.10*v*ROCK_LEVEL,0.001,0.012,0.03,at);
      } else if(drum==="snare"){
        /* bright: band-passed noise at 2.2 kHz and a 190 Hz triangle body; peaks (0.46 + 0.16) * ROCK_LEVEL */
        noiseVoice(ctx,out,noise,"bandpass",2200,0.8,0.46*v*ROCK_LEVEL,0.001,0.22,0.26,at);
        toneVoice(ctx,out,"triangle",190,0.16*v*ROCK_LEVEL,0.001,0.09,0.11,at);
      } else if(drum==="hat"){
        /* 50 ms, high and short; peak 0.26 * ROCK_LEVEL */
        noiseVoice(ctx,out,noise,"highpass",8000,0.7,0.26*v*ROCK_LEVEL,0.001,0.05,0.07,at);
      } else if(drum==="perc"){
        /* crash: 1.2 s of high noise with a slow fall; peak 0.23 * ROCK_LEVEL (0.14 at velocity 1) */
        noiseVoice(ctx,out,noise,"highpass",5000,0.6,0.23*v*ROCK_LEVEL,0.004,1.2,1.3,at);
      }
    }
  };
};

/* electronic: an 808 kick with a long tail, a hand clap, a tight high hat and a two-square cowbell */
KITS.electro=function(ctx,out){
  var noise=noiseFor(ctx);
  return {
    hit:function(drum,at,vel){
      var v=velOf(vel);
      if(v<=0) return;
      if(drum==="kick"){
        /* sine 150 -> 48 Hz over 60 ms, then a 0.6 s tail plus a short click; peaks (0.50 + 0.05) * ELECTRO_LEVEL */
        toneVoice(ctx,out,"sine",48,0.50*v*ELECTRO_LEVEL,0.002,0.60,0.66,at,150,0.06);
        noiseVoice(ctx,out,noise,"highpass",2500,0.7,0.05*v*ELECTRO_LEVEL,0.001,0.008,0.02,at);
      } else if(drum==="snare"){
        /* clap: three 10 ms bursts of band-passed noise and one 150 ms tail; measured peak 0.22, level with the rock snare */
        var i;
        for(i=0;i<3;i++) noiseVoice(ctx,out,noise,"bandpass",1200,0.9,0.95*v*ELECTRO_LEVEL,0.001,0.009,0.012,at+i*0.01);
        noiseVoice(ctx,out,noise,"bandpass",1200,0.9,0.55*v*ELECTRO_LEVEL,0.003,0.15,0.17,at+0.02);
      } else if(drum==="hat"){
        /* 30 ms of very high noise; measured peak 0.18 */
        noiseVoice(ctx,out,noise,"highpass",9000,0.7,0.55*v*ELECTRO_LEVEL,0.001,0.03,0.045,at);
      } else if(drum==="perc"){
        /* cowbell: two squares at 540 and 800 Hz into one short envelope; peaks (0.18 + 0.18) * ELECTRO_LEVEL */
        var o1=ctx.createOscillator(), o2=ctx.createOscillator(), g=ctx.createGain();
        o1.type="square"; o2.type="square";
        o1.frequency.value=540; o2.frequency.value=800;
        decay(g.gain,at,0.18*v*ELECTRO_LEVEL,0.001,0.09);
        o1.connect(g); o2.connect(g); g.connect(out);
        o1.start(at); o1.stop(at+0.11); o2.start(at); o2.stop(at+0.11);
        cleanup(o1,[o1,o2,g]);
      }
    }
  };
};

/* ---------- the melodic voices ----------
   id -> constructor(ctx, out); each returns {note(midi, at, dur, vel)}. Add an entry to add an instrument. */

var VOICES={};

/* bass: a triangle for the body and a quiet sine an octave down, both through a 700 Hz lowpass. The lowpass takes
   the edge off the triangle's upper harmonics; the sine fills the bottom without adding a second pitch. Attack 8 ms,
   hold, 80 ms release at at+dur. The envelope peaks at 0.255 and the sub adds up to a quarter of that, giving a
   measured peak near 0.30 at velocity 1. */
VOICES.bass=function(ctx,out){
  return {
    note:function(midi,at,dur,vel,opts){
      var f=midiFreq(midi), v=velOf(vel), peak=0.255*v, slide=opts&&opts.slide, vib=opts&&opts.vib;
      var t=when(ctx,at), a=Math.min(0.008,dur), attackEnd=t+a, holdEnd=Math.max(t+dur,attackEnd);
      var tri=ctx.createOscillator(), triGain=ctx.createGain(), sine=ctx.createOscillator(), sineGain=ctx.createGain();
      var filter=ctx.createBiquadFilter(), g=ctx.createGain(), nodes;
      tri.type="triangle"; tri.frequency.value=f;
      triGain.gain.value=1;
      sine.type="sine"; sine.frequency.value=f/2;
      sineGain.gain.value=0.25;
      if(slide){ slideParam(tri.frequency,f,t); slideParam(sine.frequency,f/2,t); }
      filter.type="lowpass"; filter.frequency.value=700; filter.Q.value=0.7;
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,holdEnd);
      g.gain.exponentialRampToValueAtTime(SILENCE,holdEnd+0.08);
      tri.connect(triGain); sine.connect(sineGain);
      triGain.connect(filter); sineGain.connect(filter); filter.connect(g); g.connect(out);
      tri.start(t); tri.stop(holdEnd+0.09);
      sine.start(t); sine.stop(holdEnd+0.09);
      nodes=[tri,triGain,sine,sineGain,filter,g];
      if(vib) nodes=nodes.concat(vibParams(ctx,t,holdEnd+0.09,[{param:tri.frequency,base:f},{param:sine.frequency,base:f/2}]));
      cleanup(tri,nodes);
    }
  };
};

/* pick (12.20.2): a filtered saw for a picked electric bass. A sawtooth through a lowpass that opens at 900 Hz and
   closes to 300 Hz in 80 ms (the pick's bite, then the body), a 2 ms attack and a 0.6 s fall to 0.4 of the peak, then
   a hold. Attack 2 ms, 80 ms release at at+dur. The envelope peaks at 0.30 and the filtered saw measures near 0.27-0.34
   at velocity 1, beside the triangle bass. */
VOICES.pick=function(ctx,out){
  return {
    note:function(midi,at,dur,vel,opts){
      var f=midiFreq(midi), v=velOf(vel), peak=0.30*v, slide=opts&&opts.slide, vib=opts&&opts.vib;
      var t=when(ctx,at), a=Math.min(0.002,dur), attackEnd=t+a, holdEnd=Math.max(t+dur,attackEnd);
      var o=ctx.createOscillator(), filter=ctx.createBiquadFilter(), g=ctx.createGain(), nodes;
      o.type="sawtooth"; o.frequency.value=f;
      if(slide) slideParam(o.frequency,f,t);
      filter.type="lowpass"; filter.Q.value=0.9;
      filter.frequency.setValueAtTime(900,t);
      filter.frequency.exponentialRampToValueAtTime(300,t+0.08);
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      /* the 0.6 s fall to 0.4, cut short (on the same curve) by a note shorter than that */
      if(holdEnd<attackEnd+0.6) g.gain.exponentialRampToValueAtTime(peak*Math.pow(0.4,(holdEnd-attackEnd)/0.6),holdEnd);
      else {
        g.gain.exponentialRampToValueAtTime(peak*0.4,attackEnd+0.6);
        g.gain.setValueAtTime(peak*0.4,holdEnd);
      }
      g.gain.exponentialRampToValueAtTime(SILENCE,holdEnd+0.08);
      o.connect(filter); filter.connect(g); g.connect(out);
      o.start(t); o.stop(holdEnd+0.09);
      nodes=[o,filter,g];
      if(vib) nodes=nodes.concat(vibParams(ctx,t,holdEnd+0.09,[{param:o.frequency,base:f}]));
      cleanup(o,nodes);
    }
  };
};

/* The sub's tanh curve, built once: y = tanh(2x) / tanh(2), so a unit input stays near a unit output and the sine's
   peaks take on a few odd harmonics instead of a hard clip. */
var subCurveCache=null;
function subCurve(){
  if(subCurveCache) return subCurveCache;
  var n=1025, c=new Float32Array(n), i;
  for(i=0;i<n;i++) c[i]=Math.tanh(2*(-1+2*i/(n-1)))/Math.tanh(2);
  subCurveCache=c;
  return c;
}

/* sub (12.20.2): the 808. A sine that starts seven semitones above the pitch and slides down in 60 ms, held and then
   released for 0.3 s after at+dur. A cached tanh WaveShaper sits after the envelope for a little odd-harmonic grit;
   its curve is near a wire at this level, so the measured peak is about 0.30 at velocity 1. */
VOICES.sub=function(ctx,out){
  return {
    note:function(midi,at,dur,vel,opts){
      var f=midiFreq(midi), v=velOf(vel), peak=0.15*v, slide=opts&&opts.slide, vib=opts&&opts.vib;
      var t=when(ctx,at), a=Math.min(0.005,dur), attackEnd=t+a, releaseStart=Math.max(t+dur,attackEnd);
      var o=ctx.createOscillator(), g=ctx.createGain(), shaper=ctx.createWaveShaper(), nodes;
      o.type="sine";
      /* the 808's own seven-semitone drop gives way to an explicit slide */
      if(slide) slideParam(o.frequency,f,t);
      else {
        o.frequency.setValueAtTime(f*Math.pow(2,7/12),t);
        o.frequency.exponentialRampToValueAtTime(f,t+0.06);
      }
      shaper.curve=subCurve(); shaper.oversample="none";
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.3);
      o.connect(g); g.connect(shaper); shaper.connect(out);
      o.start(t); o.stop(releaseStart+0.31);
      nodes=[o,g,shaper];
      if(vib) nodes=nodes.concat(vibParams(ctx,t,releaseStart+0.31,[{param:o.frequency,base:f}]));
      cleanup(o,nodes);
    }
  };
};


/* keys: two-operator FM, ratio 1. The modulator's depth starts at 2.5 f and falls to 0.15 f in 300 ms, which is the
   tine: bright at the strike and mellow while the note rings. The carrier envelope opens in 5 ms, falls to half over
   one second and holds there, then releases for 250 ms at at+dur. The carrier amplitude is the peak (0.072 a note,
   so four notes of a chord reach about 0.28 before the mix), not a modulation-dependent level. */
VOICES.keys=function(ctx,out){
  return {
    note:function(midi,at,dur,vel){
      var f=midiFreq(midi), v=velOf(vel), peak=0.072*v;
      var t=when(ctx,at), a=Math.min(0.005,dur), attackEnd=t+a, releaseStart=t+dur;
      var carrier=ctx.createOscillator(), mod=ctx.createOscillator(), modGain=ctx.createGain(), g=ctx.createGain();
      var decayEnd=Math.min(t+1,releaseStart), holdVal=peak;
      carrier.type="sine"; carrier.frequency.value=f;
      mod.type="sine"; mod.frequency.value=f;
      modGain.gain.setValueAtTime(2.5*f,t);
      modGain.gain.exponentialRampToValueAtTime(0.15*f,t+0.3);
      mod.connect(modGain); modGain.connect(carrier.frequency);
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      if(decayEnd>attackEnd){ g.gain.linearRampToValueAtTime(peak*0.5,decayEnd); holdVal=peak*0.5; }
      g.gain.setValueAtTime(holdVal,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.25);
      carrier.connect(g); g.connect(out);
      carrier.start(t); carrier.stop(releaseStart+0.26);
      mod.start(t); mod.stop(releaseStart+0.26);
      cleanup(carrier,[carrier,mod,modGain,g]);
    }
  };
};

/* one brighter Karplus-Strong buffer per context and MIDI note, for the guitar: the same recurrence as pluckFor,
   but the first N samples are 30% raw seeded noise and 70% of that noise through a one-pole 3 kHz lowpass, so the
   string starts bright without the pluck's soft hiss. Its own cache, so the pluck voice's buffer never changes. */
var guitarMap=typeof WeakMap==="function" ? new WeakMap() : null, lastGuitar=null;

function guitarFor(ctx,midi){
  var map=null, buf;
  if(guitarMap){
    map=guitarMap.get(ctx);
    if(!map){ map={}; guitarMap.set(ctx,map); }
  } else {
    if(!lastGuitar || lastGuitar.ctx!==ctx) lastGuitar={ctx:ctx, map:{}};
    map=lastGuitar.map;
  }
  buf=map[midi];
  if(buf) return buf;
  var sr=ctx.sampleRate, f=midiFreq(midi);
  var n=Math.max(2,Math.floor(sr/f)), len=Math.ceil(sr*PLUCK_SECONDS);
  var b=ctx.createBuffer(1,len,sr), d=b.getChannelData(0), r=rng(0x7a3f19c5^(midi*2654435761)), i, max=0, lp=0;
  var a=1-Math.exp(-2*Math.PI*3000/sr);
  for(i=0;i<len;i++){
    if(i<n){
      var raw=r()*2-1;
      lp+=a*(raw-lp);
      d[i]=0.7*lp+0.3*raw;
    } else d[i]=0.996*0.5*(d[i-n]+(i-n-1>=0?d[i-n-1]:0));
    if(Math.abs(d[i])>max) max=Math.abs(d[i]);
  }
  if(max>0) for(i=0;i<len;i++) d[i]/=max;
  map[midi]=buf=b;
  return b;
}

/* guitar (12.20.2): Karplus-Strong through the same playback and release as the pluck, at 0.09 a string so one note
   measures near 0.08 at velocity 1. One note() call is one string; the chord's 12 ms strum (low to high) is the
   player's job through LopdaStudioSynth.STRUM.guitar. */
VOICES.guitar=function(ctx,out){
  return {
    note:function(midi,at,dur,vel){
      var v=velOf(vel), t=when(ctx,at), b=guitarFor(ctx,midi);
      var sr=ctx.sampleRate, f=midiFreq(midi), n=Math.max(2,Math.floor(sr/f));
      var rate=(n+0.5)*f/sr, playDur=b.duration/rate, noteEnd=t+dur, playEnd=t+playDur;
      var end=Math.min(noteEnd+0.06,playEnd), g=ctx.createGain(), s=ctx.createBufferSource();
      s.buffer=b; s.playbackRate.value=rate;
      g.gain.setValueAtTime(0.09*v,t);
      if(playEnd>noteEnd){
        g.gain.setValueAtTime(0.09*v,noteEnd);
        g.gain.linearRampToValueAtTime(0,end);
      }
      s.connect(g); g.connect(out);
      s.start(t); s.stop(end);
      cleanup(s,[s,g]);
    }
  };
};

/* piano (12.20.2): two FM modulators on one carrier. Ratio 1 at 2.2 f falling to 0.2 f in 600 ms is the string;
   ratio 4 at 0.8 f falling away in 80 ms is the hammer. The envelope opens in 3 ms, falls exponentially to 0.15 of
   the peak over 2 s and does not sustain, then releases for 300 ms at at+dur. The carrier's 0.072 amplitude is the
   measured peak at velocity 1. */
VOICES.piano=function(ctx,out){
  return {
    note:function(midi,at,dur,vel){
      var f=midiFreq(midi), v=velOf(vel), peak=0.072*v;
      var t=when(ctx,at), a=Math.min(0.003,dur), attackEnd=t+a, releaseStart=Math.max(t+dur,attackEnd);
      var carrier=ctx.createOscillator(), mod1=ctx.createOscillator(), mod1Gain=ctx.createGain();
      var mod2=ctx.createOscillator(), mod2Gain=ctx.createGain(), g=ctx.createGain();
      carrier.type="sine"; carrier.frequency.value=f;
      mod1.type="sine"; mod1.frequency.value=f;
      mod1Gain.gain.setValueAtTime(2.2*f,t);
      mod1Gain.gain.exponentialRampToValueAtTime(0.2*f,t+0.6);
      mod2.type="sine"; mod2.frequency.value=4*f;
      mod2Gain.gain.setValueAtTime(0.8*f,t);
      mod2Gain.gain.exponentialRampToValueAtTime(0.01*f,t+0.08);
      mod1.connect(mod1Gain); mod1Gain.connect(carrier.frequency);
      mod2.connect(mod2Gain); mod2Gain.connect(carrier.frequency);
      var decayEnd=t+2, rampEnd=Math.min(decayEnd,releaseStart);
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.exponentialRampToValueAtTime(peak*Math.pow(0.15,Math.max(0,(rampEnd-attackEnd)/2)),rampEnd);
      if(releaseStart>rampEnd) g.gain.setValueAtTime(peak*0.15,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.3);
      carrier.connect(g); g.connect(out);
      carrier.start(t); carrier.stop(releaseStart+0.31);
      mod1.start(t); mod1.stop(releaseStart+0.31);
      mod2.start(t); mod2.stop(releaseStart+0.31);
      cleanup(carrier,[carrier,mod1,mod1Gain,mod2,mod2Gain,g]);
    }
  };
};

/* organ (12.20.2): three sines at 1, 2 and 3 times the pitch (0.6, 0.3, 0.15), a 6 Hz tremolo on all three, a 10 ms
   attack, a hold at at+dur and a 60 ms release. The envelope peaks at 0.068, so the three partials measure near
   0.071 together at velocity 1. */
VOICES.organ=function(ctx,out){
  return {
    note:function(midi,at,dur,vel){
      var f=midiFreq(midi), v=velOf(vel), peak=0.068*v;
      var t=when(ctx,at), a=Math.min(0.01,dur), attackEnd=t+a, releaseStart=Math.max(t+dur,attackEnd);
      var g=ctx.createGain(), vib=ctx.createOscillator(), vibGain=ctx.createGain(), os=[], gs=[], i;
      var amps=[0.6,0.3,0.15], mul=[1,2,3];
      for(i=0;i<3;i++){
        var o=ctx.createOscillator(), og=ctx.createGain();
        o.type="sine"; o.frequency.value=f*mul[i]; og.gain.value=amps[i];
        o.connect(og); og.connect(g);
        os.push(o); gs.push(og);
      }
      /* 6 cents at f: f * (2^(6/1200) - 1) Hz either side */
      vib.type="sine"; vib.frequency.value=6;
      vibGain.gain.value=f*(Math.pow(2,6/1200)-1);
      vib.connect(vibGain);
      for(i=0;i<3;i++) vibGain.connect(os[i].frequency);
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.06);
      g.connect(out);
      for(i=0;i<3;i++){ os[i].start(t); os[i].stop(releaseStart+0.07); }
      vib.start(t); vib.stop(releaseStart+0.07);
      cleanup(os[0],[os[0],os[1],os[2],gs[0],gs[1],gs[2],vib,vibGain,g]);
    }
  };
};

/* strings (12.20.2): two sawtooths detuned by 7 cents either way, through a 1800 Hz lowpass, with a 250 ms attack
   (the bow), a hold and a 400 ms release. The envelope peaks at 0.07, so one note measures near 0.052-0.065 at velocity 1. */
VOICES.strings=function(ctx,out){
  return {
    note:function(midi,at,dur,vel){
      var f=midiFreq(midi), v=velOf(vel), peak=0.07*v;
      var t=when(ctx,at), a=Math.min(0.25,dur), attackEnd=t+a, releaseStart=Math.max(t+dur,attackEnd);
      var filter=ctx.createBiquadFilter(), g=ctx.createGain();
      var o1=ctx.createOscillator(), o2=ctx.createOscillator(), g1=ctx.createGain(), g2=ctx.createGain();
      filter.type="lowpass"; filter.frequency.value=1800; filter.Q.value=0.5;
      o1.type="sawtooth"; o1.frequency.value=f*Math.pow(2,7/1200);
      o2.type="sawtooth"; o2.frequency.value=f*Math.pow(2,-7/1200);
      g1.gain.value=0.5; g2.gain.value=0.5;
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.4);
      o1.connect(g1); o2.connect(g2); g1.connect(filter); g2.connect(filter); filter.connect(g); g.connect(out);
      o1.start(t); o1.stop(releaseStart+0.41);
      o2.start(t); o2.stop(releaseStart+0.41);
      cleanup(o1,[o1,o2,g1,g2,filter,g]);
    }
  };
};


/* flute (12.12): the chill lead. Mostly sine with a little triangle (0.15 of the sine) for a hint of a hollow body,
   through a gentle 2 kHz lowpass that takes the triangle's upper harmonics off so it stays soft, not bright. Attack
   40 ms, hold, 120 ms release at at+dur. The vibrato is 5 Hz and 8 cents deep and only starts fading in from 150 ms,
   the way a player adds it: a short note is straight. A very quiet band-passed breath at 2 kHz (the drums' seeded
   noise) sits under the attack. The envelope peaks at 0.18; sine and triangle reach 0.207 together and the breath
   adds at most 0.018, so a note measures near 0.22 at velocity 1, well under the bass. */
VOICES.flute=function(ctx,out){
  var noise=noiseFor(ctx);
  return {
    note:function(midi,at,dur,vel,opts){
      var f=midiFreq(midi), v=velOf(vel), peak=0.18*v, slide=opts&&opts.slide;
      var t=when(ctx,at), a=Math.min(0.04,dur), attackEnd=t+a, releaseStart=t+dur, releaseEnd=releaseStart+0.12;
      var sine=ctx.createOscillator(), sineGain=ctx.createGain(), tri=ctx.createOscillator(), triGain=ctx.createGain();
      var vib=ctx.createOscillator(), vibGain=ctx.createGain(), nodes;
      var filter=ctx.createBiquadFilter(), g=ctx.createGain();
      sine.type="sine"; sine.frequency.value=f; sineGain.gain.value=1;
      tri.type="triangle"; tri.frequency.value=f; triGain.gain.value=0.15;
      if(slide){ slideParam(sine.frequency,f,t); slideParam(tri.frequency,f,t); }
      /* 8 cents is f * (2^(8/1200) - 1) Hz either side; flat under 150 ms, then in over half a second */
      vib.type="sine"; vib.frequency.value=5;
      vibGain.gain.setValueAtTime(0,t);
      if(releaseStart>t+0.15){
        vibGain.gain.setValueAtTime(0,t+0.15);
        vibGain.gain.linearRampToValueAtTime(f*(Math.pow(2,8/1200)-1),t+0.65);
      }
      vib.connect(vibGain); vibGain.connect(sine.frequency); vibGain.connect(tri.frequency);
      filter.type="lowpass"; filter.frequency.value=2000; filter.Q.value=0.5;
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseEnd);
      sine.connect(sineGain); tri.connect(triGain);
      sineGain.connect(filter); triGain.connect(filter); filter.connect(g); g.connect(out);
      sine.start(t); sine.stop(releaseEnd+0.01);
      tri.start(t); tri.stop(releaseEnd+0.01);
      vib.start(t); vib.stop(releaseEnd+0.01);
      /* the breath: gone by 150 ms, or with a note shorter than that, and silent before its source stops */
      var breathEnd=Math.min(t+0.15,releaseStart+0.02);
      noiseVoice(ctx,out,noise,"bandpass",2000,0.7,0.018*v,0.004,breathEnd-t-0.004,breathEnd-t+0.01,t);
      nodes=[sine,sineGain,tri,triGain,vib,vibGain,filter,g];
      if(opts&&opts.vib) nodes=nodes.concat(vibParams(ctx,t,releaseEnd+0.01,[{param:sine.frequency,base:f},{param:tri.frequency,base:f}]));
      cleanup(sine,nodes);
    }
  };
};

/* one 25% pulse PeriodicWave per context; a PeriodicWave is expensive to build and never changes, so the WeakMap
   keeps it with its context like noiseFor's buffer. Without WeakMap only the last context is kept. */
var pulseMap=typeof WeakMap==="function" ? new WeakMap() : null, lastPulse=null;
function pulseWaveFor(ctx){
  var w;
  if(pulseMap){
    w=pulseMap.get(ctx);
    if(w) return w;
  } else if(lastPulse && lastPulse.ctx===ctx) return lastPulse.wave;
  /* a rectangle of duty 0.25 in Fourier terms: a_n = 2 sin(2 pi n d)/(pi n), b_n = 2 (1 - cos(2 pi n d))/(pi n) */
  var n=64, real=new Float32Array(n), imag=new Float32Array(n), i, d=0.25;
  for(i=1;i<n;i++){
    real[i]=2*Math.sin(2*Math.PI*i*d)/(Math.PI*i);
    imag[i]=2*(1-Math.cos(2*Math.PI*i*d))/(Math.PI*i);
  }
  w=ctx.createPeriodicWave(real,imag,{disableNormalization:false});
  if(pulseMap) pulseMap.set(ctx,w); else lastPulse={ctx:ctx, wave:w};
  return w;
}

/* square (12.20.2): the 8-bit lead. A 25% pulse (a cached PeriodicWave) through a 4 kHz lowpass, a 2 ms attack and a
   60 ms release, with a 5.5 Hz, 15-cent vibrato fading in after 140 ms. The envelope peaks at 0.22, so a note
   measures near 0.19 at velocity 1. */
VOICES.square=function(ctx,out){
  return {
    note:function(midi,at,dur,vel,opts){
      var f=midiFreq(midi), v=velOf(vel), peak=0.22*v, slide=opts&&opts.slide, moreVib=opts&&opts.vib;
      var t=when(ctx,at), a=Math.min(0.002,dur), attackEnd=t+a, releaseStart=Math.max(t+dur,attackEnd);
      var o=ctx.createOscillator(), filter=ctx.createBiquadFilter(), g=ctx.createGain(), nodes;
      var vib=ctx.createOscillator(), vibGain=ctx.createGain();
      o.setPeriodicWave(pulseWaveFor(ctx)); o.frequency.value=f;
      if(slide) slideParam(o.frequency,f,t);
      filter.type="lowpass"; filter.frequency.value=4000; filter.Q.value=0.5;
      vib.type="sine"; vib.frequency.value=5.5;
      vibGain.gain.setValueAtTime(0,t);
      if(releaseStart>t+0.14){
        vibGain.gain.setValueAtTime(0,t+0.14);
        vibGain.gain.linearRampToValueAtTime(f*(Math.pow(2,15/1200)-1),t+0.44);
      }
      vib.connect(vibGain); vibGain.connect(o.frequency);
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.06);
      o.connect(filter); filter.connect(g); g.connect(out);
      o.start(t); o.stop(releaseStart+0.07);
      vib.start(t); vib.stop(releaseStart+0.07);
      nodes=[o,filter,vib,vibGain,g];
      if(moreVib) nodes=nodes.concat(vibParams(ctx,t,releaseStart+0.07,[{param:o.frequency,base:f}]));
      cleanup(o,nodes);
    }
  };
};

/* one Karplus-Strong buffer per context and MIDI note. The delay line's first N samples are seeded noise; after
   that y[n] = 0.996 * 0.5 * (y[n-N] + y[n-N-1]), the averaging lowpass that makes a plucked string lose its highs
   as it rings. 2.5 s gives even a slow melody note a long tail before the buffer's own decay takes over; that is
   441 KB per pitch at 44.1 kHz and 480 KB at 48 kHz (one mono float buffer per pitch, only for pitches a song
   actually plays), so a 16-note melody costs about 7.7 MB at 48 kHz. The same WeakMap fallback as noiseFor keeps
   only the live context on browsers without WeakMap. */
var PLUCK_SECONDS=2.5;
var pluckMap=typeof WeakMap==="function" ? new WeakMap() : null, lastPluck=null;

function pluckFor(ctx,midi){
  var map=null, buf;
  if(pluckMap){
    map=pluckMap.get(ctx);
    if(!map){ map={}; pluckMap.set(ctx,map); }
  } else {
    if(!lastPluck || lastPluck.ctx!==ctx) lastPluck={ctx:ctx, map:{}};
    map=lastPluck.map;
  }
  buf=map[midi];
  if(buf) return buf;
  var sr=ctx.sampleRate, f=midiFreq(midi);
  var n=Math.max(2,Math.floor(sr/f)), len=Math.ceil(sr*PLUCK_SECONDS);
  var b=ctx.createBuffer(1,len,sr), d=b.getChannelData(0), r=rng(0x51ed270b^(midi*2654435761)), i, max=0;
  for(i=0;i<len;i++){
    if(i<n) d[i]=r()*2-1;
    else d[i]=0.996*0.5*(d[i-n]+(i-n-1>=0?d[i-n-1]:0));
    if(Math.abs(d[i])>max) max=Math.abs(d[i]);
  }
  /* the noise seed of each pitch has its own peak; normalising every buffer to 1 makes the 0.265 trim mean the same
     thing across the keyboard */
  if(max>0) for(i=0;i<len;i++) d[i]/=max;
  map[midi]=b;
  return b;
}

/* pluck: the cached buffer at a gain that starts at the peak (a pluck has no attack) and releases for 60 ms at
   at+dur. The two-tap averaging filter has a delay of N + 0.5 samples (it is linear phase: the extra half sample is
   the 0.5 * (x + x delayed by one) at its heart), so the buffer's fundamental is sr / (N + 0.5), not sr / N.
   Playing it at (N + 0.5) * f / sr puts the note exactly on pitch. The fade stays at at+dur; if the 2.5 s buffer
   runs out first the string simply ends with its own decay, which is quieter than the old 1.2 s fade. */
VOICES.pluck=function(ctx,out){
  return {
    note:function(midi,at,dur,vel,opts){
      var v=velOf(vel), t=when(ctx,at), b=pluckFor(ctx,midi), nodes;
      var slide=opts&&opts.slide, vib=opts&&opts.vib;
      var sr=ctx.sampleRate, f=midiFreq(midi), n=Math.max(2,Math.floor(sr/f));
      var rate=(n+0.5)*f/sr, playDur=b.duration/rate, noteEnd=t+dur, playEnd=t+playDur;
      var end=Math.min(noteEnd+0.06,playEnd), g=ctx.createGain(), s=ctx.createBufferSource();
      s.buffer=b; s.playbackRate.value=rate;
      if(slide) slideParam(s.playbackRate,rate,t);
      g.gain.setValueAtTime(0.265*v,t);
      /* only at+dur gets a fade; a buffer that ends first is the string's own decay, not a cut */
      if(playEnd>noteEnd){
        g.gain.setValueAtTime(0.265*v,noteEnd);
        g.gain.linearRampToValueAtTime(0,end);
      }
      s.connect(g); g.connect(out);
      s.start(t); s.stop(end);
      nodes=[s,g];
      if(vib) nodes=nodes.concat(vibParams(ctx,t,end,[{param:s.playbackRate,base:rate}]));
      cleanup(s,nodes);
    }
  };
};

/* reed (12.20.2): a square through a 1.4 kHz band-pass (Q 2) for the formant of a harmonica or accordion, plus a
   small band-passed breath under the attack. A 30 ms attack, a hold and an 80 ms release. The envelope peaks at
   0.42; the filter keeps enough of the square's harmonics that a note measures near 0.20 at velocity 1. */
VOICES.reed=function(ctx,out){
  var noise=noiseFor(ctx);
  return {
    note:function(midi,at,dur,vel,opts){
      var f=midiFreq(midi), v=velOf(vel), peak=0.42*v, slide=opts&&opts.slide, vib=opts&&opts.vib;
      var t=when(ctx,at), a=Math.min(0.03,dur), attackEnd=t+a, releaseStart=Math.max(t+dur,attackEnd);
      var o=ctx.createOscillator(), filter=ctx.createBiquadFilter(), g=ctx.createGain(), nodes;
      o.type="square"; o.frequency.value=f;
      if(slide) slideParam(o.frequency,f,t);
      filter.type="bandpass"; filter.frequency.value=1400; filter.Q.value=2;
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.08);
      o.connect(filter); filter.connect(g); g.connect(out);
      o.start(t); o.stop(releaseStart+0.09);
      /* the breath is gone by 180 ms, or with a shorter note, and silent before its source stops */
      var breathEnd=Math.min(t+0.18,releaseStart+0.02);
      noiseVoice(ctx,out,noise,"bandpass",1400,0.8,0.05*v,0.01,breathEnd-t-0.01,breathEnd-t+0.01,t);
      nodes=[o,filter,g];
      if(vib) nodes=nodes.concat(vibParams(ctx,t,releaseStart+0.09,[{param:o.frequency,base:f}]));
      cleanup(o,nodes);
    }
  };
};

/* bowed (12.20.2): a sawtooth through a 2.2 kHz lowpass, each note sliding up from 60 cents below in 90 ms and a
   6 Hz, 20-cent vibrato fading in after 200 ms; a 60 ms attack (the bow) and a 120 ms release. The envelope peaks at
   0.22, so a note measures near 0.19-0.24 at velocity 1. */
VOICES.bowed=function(ctx,out){
  return {
    note:function(midi,at,dur,vel,opts){
      var f=midiFreq(midi), v=velOf(vel), peak=0.22*v, slide=opts&&opts.slide, moreVib=opts&&opts.vib;
      var t=when(ctx,at), a=Math.min(0.06,dur), attackEnd=t+a, releaseStart=Math.max(t+dur,attackEnd);
      var o=ctx.createOscillator(), filter=ctx.createBiquadFilter(), g=ctx.createGain(), nodes;
      var vib=ctx.createOscillator(), vibGain=ctx.createGain();
      o.type="sawtooth";
      if(slide) slideParam(o.frequency,f,t);
      else {
        o.frequency.setValueAtTime(f*Math.pow(2,-60/1200),t);
        o.frequency.exponentialRampToValueAtTime(f,t+0.09);
      }
      filter.type="lowpass"; filter.frequency.value=2200; filter.Q.value=0.5;
      vib.type="sine"; vib.frequency.value=6;
      vibGain.gain.setValueAtTime(0,t);
      if(releaseStart>t+0.2){
        vibGain.gain.setValueAtTime(0,t+0.2);
        vibGain.gain.linearRampToValueAtTime(f*(Math.pow(2,20/1200)-1),t+0.5);
      }
      vib.connect(vibGain); vibGain.connect(o.frequency);
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,releaseStart);
      g.gain.exponentialRampToValueAtTime(SILENCE,releaseStart+0.12);
      o.connect(filter); filter.connect(g); g.connect(out);
      o.start(t); o.stop(releaseStart+0.13);
      vib.start(t); vib.stop(releaseStart+0.13);
      nodes=[o,filter,vib,vibGain,g];
      if(moreVib) nodes=nodes.concat(vibParams(ctx,t,releaseStart+0.13,[{param:o.frequency,base:f}]));
      cleanup(o,nodes);
    }
  };
};


/* ---------- the soft clip ----------
   A WaveShaper, not a compressor: no look-ahead means no latency and an offline render is bit-for-bit repeatable.
   Below the 0.7 knee the curve is y = x, so one drum (0.55 at most) is untouched; above it tanh bends the peaks
   toward 0.908, a tape-ish ceiling that keeps four busy tracks from ever reaching 1. The curve is built once. */
var CLIP_KNEE=0.7, CLIP_SOFT=0.25, clipCurve=null;

function softClipCurve(){
  if(clipCurve) return clipCurve;
  var n=4097, c=new Float32Array(n), i, x, a, s;
  for(i=0;i<n;i++){
    x=-1+2*i/(n-1);
    a=Math.abs(x);
    if(a<=CLIP_KNEE) c[i]=x;
    else { s=x<0?-1:1; c[i]=s*(CLIP_KNEE+CLIP_SOFT*Math.tanh((a-CLIP_KNEE)/CLIP_SOFT)); }
  }
  clipCurve=c;
  return c;
}

/* ---------- the mix ---------- */

function create(ctx,out){
  var master=ctx.createGain(), clip=ctx.createWaveShaper();
  master.gain.value=1;
  clip.curve=softClipCurve();
  clip.oversample="none";
  master.connect(clip);
  if(out) clip.connect(out); else clip.connect(ctx.destination);
  var built={}, voices={}, disposed=false;

  function hit(kit,drum,at,vel){
    if(disposed) return;
    /* unknown kit: nothing, not an error; velocity 0 is silent and must not schedule a ramp from zero */
    if(!Object.prototype.hasOwnProperty.call(KITS,kit)) return;
    var v=velOf(vel);
    if(v<=0) return;
    var t=(typeof at==="number" && isFinite(at)) ? at : ctx.currentTime;
    if(t<ctx.currentTime) t=ctx.currentTime;
    var k=built[kit];
    if(!k) k=built[kit]=KITS[kit](ctx,master);
    k.hit(drum,t,v);
  }

  /* unknown voice, a pitch outside MIDI, a length that is not finite and positive or a velocity that cannot sound:
     nothing, not an error. A finite but absurd length would schedule ramps for years (and break the editor's math),
     so a note is capped at a minute; midi 1e6 must not reach an oscillator frequency or an FM depth ramp. */
  function note(voice,midi,at,dur,vel,opts){
    if(disposed) return;
    if(!Object.prototype.hasOwnProperty.call(VOICES,voice)) return;
    if(typeof midi!=="number" || !isFinite(midi) || midi<0 || midi>127) return;
    if(typeof dur!=="number" || !isFinite(dur) || dur<=0) return;
    var v=velOf(vel);
    if(v<=0) return;
    if(dur>60) dur=60;
    var t=(typeof at==="number" && isFinite(at)) ? at : ctx.currentTime;
    if(t<ctx.currentTime) t=ctx.currentTime;
    var n=voices[voice];
    if(!n) n=voices[voice]=VOICES[voice](ctx,master);
    n.note(midi,t,dur,v,opts);
  }

  function dispose(){
    if(disposed) return;
    disposed=true;
    /* the shaper too: the player makes a new synth on every play, and a left-over node stays wired to the output */
    try{ master.disconnect(); }catch(e){}
    try{ clip.disconnect(); }catch(e){}
  }

  return {hit:hit, note:note, dispose:dispose};
}

window.LopdaStudioSynth={KITS:KITS, VOICES:VOICES, STRUM:{guitar:0.012}, create:create};
})();
