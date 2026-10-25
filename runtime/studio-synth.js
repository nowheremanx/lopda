/*
 * Lo-PDA runtime: the drum voices and the three melodic voices of the four-track tape machine
 * (docs/design/studio.md sections 1, 3, 11 and 12.6).
 * Two kits, every sound synthesised: the 8-bit `chip` kit and the lofi `soft` kit (muffled kick, brush snare).
 * Three melodic voices: `bass` (triangle and sub sine), `keys` (FM electric piano) and `pluck` (Karplus-Strong).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 *   LopdaStudioSynth.KITS             the registry: kit id -> function(ctx, out) -> {hit(drum, at, vel)}
 *   LopdaStudioSynth.VOICES           the registry: voice id -> function(ctx, out) -> {note(midi, at, dur, vel)}
 *   LopdaStudioSynth.create(ctx,out)  -> {hit(kit, drum, at, vel), note(voice, midi, at, dur, vel), dispose()}
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
 * Levels (measured by tests/studio-e2e.test.mjs at 22.05 kHz): all four drums on one step peak 0.79 for both kits,
 * well under 0.85; each drum alone stays between 0.13 and 0.49 at velocity 1. The demo beat's rms is 0.53x the
 * paper tower's title tune with the chip kit and 0.62x with the soft kit, so it sits near PAD.music's songs. The
 * melodic voices at velocity 1 peak 0.30 for bass, 0.072 per keys note and 0.26 for pluck; bass 45, a four-note
 * keys chord and pluck 69 together peak 0.58, so the notes alone stay under 0.6. The four-bar demo pattern (drums,
 * bass and chords) with the soft kit peaks 0.77, under the section 12.6 target of 0.9; the dense drum hit stops at
 * the 0.908 ceiling.
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

/* ---------- the melodic voices ----------
   id -> constructor(ctx, out); each returns {note(midi, at, dur, vel)}. Add an entry to add an instrument. */

var VOICES={};

/* bass: a triangle for the body and a quiet sine an octave down, both through a 700 Hz lowpass. The lowpass takes
   the edge off the triangle's upper harmonics; the sine fills the bottom without adding a second pitch. Attack 8 ms,
   hold, 80 ms release at at+dur. The envelope peaks at 0.255 and the sub adds up to a quarter of that, giving a
   measured peak near 0.30 at velocity 1. */
VOICES.bass=function(ctx,out){
  return {
    note:function(midi,at,dur,vel){
      var f=midiFreq(midi), v=velOf(vel), peak=0.255*v;
      var t=when(ctx,at), a=Math.min(0.008,dur), attackEnd=t+a, holdEnd=Math.max(t+dur,attackEnd);
      var tri=ctx.createOscillator(), triGain=ctx.createGain(), sine=ctx.createOscillator(), sineGain=ctx.createGain();
      var filter=ctx.createBiquadFilter(), g=ctx.createGain();
      tri.type="triangle"; tri.frequency.value=f;
      triGain.gain.value=1;
      sine.type="sine"; sine.frequency.value=f/2;
      sineGain.gain.value=0.25;
      filter.type="lowpass"; filter.frequency.value=700; filter.Q.value=0.7;
      g.gain.setValueAtTime(SILENCE,t);
      g.gain.linearRampToValueAtTime(peak,attackEnd);
      g.gain.setValueAtTime(peak,holdEnd);
      g.gain.exponentialRampToValueAtTime(SILENCE,holdEnd+0.08);
      tri.connect(triGain); sine.connect(sineGain);
      triGain.connect(filter); sineGain.connect(filter); filter.connect(g); g.connect(out);
      tri.start(t); tri.stop(holdEnd+0.09);
      sine.start(t); sine.stop(holdEnd+0.09);
      cleanup(tri,[tri,triGain,sine,sineGain,filter,g]);
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
    note:function(midi,at,dur,vel){
      var v=velOf(vel), t=when(ctx,at), b=pluckFor(ctx,midi);
      var sr=ctx.sampleRate, f=midiFreq(midi), n=Math.max(2,Math.floor(sr/f));
      var rate=(n+0.5)*f/sr, playDur=b.duration/rate, noteEnd=t+dur, playEnd=t+playDur;
      var end=Math.min(noteEnd+0.06,playEnd), g=ctx.createGain(), s=ctx.createBufferSource();
      s.buffer=b; s.playbackRate.value=rate;
      g.gain.setValueAtTime(0.265*v,t);
      /* only at+dur gets a fade; a buffer that ends first is the string's own decay, not a cut */
      if(playEnd>noteEnd){
        g.gain.setValueAtTime(0.265*v,noteEnd);
        g.gain.linearRampToValueAtTime(0,end);
      }
      s.connect(g); g.connect(out);
      s.start(t); s.stop(end);
      cleanup(s,[s,g]);
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
  function note(voice,midi,at,dur,vel){
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
    n.note(midi,t,dur,v);
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

window.LopdaStudioSynth={KITS:KITS, VOICES:VOICES, create:create};
})();
