/*
 * Lo-PDA runtime: tilt, shake, heading and the microphone for apps (docs/design/pad-sensors.md, decisions.md section 23).
 * The sandboxed apps cannot ask for sensors themselves: the runtime asks, reads, and hands each app a few coarse numbers
 * through PAD. Nothing raw leaves this file: no angles finer than 1/32, no acceleration, and never a sound sample.
 * x and y are counted from start()/zero(); flat is always the tilt from lying face up, so an app can guide the phone level.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * window.LopdaSensors:
 *   pure (tests/sensors.test.mjs): quantize(v), tilt(beta, gamma, beta0) -> {x, y, flat}, heading(compass) -> 0..348.75 or null,
 *     shaker(now) -> fn(acc) -> true when it is a shake, limiter(hz, now, later) -> fn(send, value),
 *     level(samples) -> 0..1, pitch(samples, sampleRate) -> Hz (integer) or null
 *   host(env) -> the runtime's one set of sensors. env:
 *     window, document, navigator     the page's (fakes in the tests)
 *     context(make)   the runtime's AudioContext (core.js audio())      session(type)   set navigator.audioSession.type
 *     owner()         the app window in front now, or null               send(win, msg)  post a reading to that app
 *     mic(on)         the mic is on / off (the status bar mark)          resume(win, kinds)  the page is shown again: kinds were on
 *     now(), setTimeout, clearTimeout, setInterval, clearInterval        (default to the page's own)
 */
(function(){
"use strict";
var STEP=32, TILT_HZ=30, SOUND_HZ=20, SHAKE=15, SHAKE_GAP=500, TILT_DEG=45, FIRST_MS=1000, WATCH_MS=250;
var PITCH_LO=50, PITCH_HI=1500, WINDOW=1024;

/* every reading is coarse: 1/32 steps, like an old sensor, and too coarse to tell one phone from another */
function quantize(v){ v=Math.max(-1,Math.min(1,+v||0)); var q=Math.round(v*STEP)/STEP; return q===0 ? 0 : q; }
/* the handheld held upright in portrait: x is left / right (gamma), y is the top edge raised (-1) or lowered (+1) from where
   the player held it at start() or zero(); about 45 degrees reaches the end. flat has the same scale and signs but is always
   measured from lying flat, face up (flat.y -1 is upright, {x: 0, y: 0} is level), so start() and zero() never change it */
function tilt(beta,gamma,beta0){
  var b=+beta||0, g=+gamma||0;
  return { x: quantize(g/TILT_DEG), y: quantize(-(b-(+beta0||0))/TILT_DEG),
    flat: { x: quantize(g/TILT_DEG), y: quantize(-b/TILT_DEG) } };
}
/* a 32-point compass: north 0, then 11.25-degree steps; null where the phone gives no heading */
function heading(h){
  if(typeof h!=="number" || !isFinite(h) || h<0) return null;
  return (Math.round(h/360*STEP)%STEP)*360/STEP;
}
/* one shake, one event: 15 m/s2 on acceleration without gravity, then nothing for 0.5 s */
function shaker(now){
  var last=-Infinity;
  return function(a){
    if(!a) return false;
    var m=Math.sqrt((+a.x||0)*(+a.x||0)+(+a.y||0)*(+a.y||0)+(+a.z||0)*(+a.z||0)), t=now();
    if(m<SHAKE || t-last<SHAKE_GAP) return false;
    last=t; return true;
  };
}
/* at most hz values a second, and only new ones; a value that arrives too soon waits and goes out late, so the last one always arrives */
function limiter(hz,now,later){
  var gap=1000/hz, at=-Infinity, sent=null, held=null, timer=null;
  var key=function(v){ return JSON.stringify(v); };
  function out(send,v){ at=now(); sent=key(v); send(v); }
  var f=function(send,v){
    if(key(v)===sent){ held=null; return; }
    var wait=at+gap-now();
    if(wait<=0){ held=null; out(send,v); return; }
    held={send:send, v:v};
    if(!timer) timer=later(function(){ timer=null; var h=held; held=null; if(h && key(h.v)!==sent) out(h.send,h.v); },wait);
  };
  f.reset=function(){ at=-Infinity; sent=null; held=null; };
  return f;
}
function rms(s,n){ var sum=0; for(var i=0;i<n;i++) sum+=s[i]*s[i]; return Math.sqrt(sum/Math.max(1,n)); }
/* loudness 0-1: -60 dB of full scale and below is 0, full scale is 1, in 1/32 steps */
function level(s){
  var r=rms(s,s.length); if(!(r>0)) return 0;
  var v=(20*Math.log(r)/Math.LN10+60)/60;
  return Math.round(Math.max(0,Math.min(1,v))*STEP)/STEP;
}
/* the main pitch by normalised autocorrelation over 50-1500 Hz: the first strong peak after the curve has dipped,
   refined between samples; null for silence or for sound without a clear pitch (breath, noise) */
function pitch(s,rate){
  var n=Math.min(WINDOW,s.length);
  var lo=Math.max(2,Math.floor(rate/PITCH_HI)), hi=Math.min(Math.floor(rate/PITCH_LO),s.length-n);
  if(hi<=lo || rms(s,n)<0.01) return null;
  var r=new Float32Array(hi+2), e0=0, i, k;
  for(i=0;i<n;i++) e0+=s[i]*s[i];
  /* from lag 1, so a pitch near the top of the range still sees the curve dip before its peak */
  for(k=1;k<=hi+1;k++){
    var c=0, ek=0;
    for(i=0;i<n;i++){ c+=s[i]*s[i+k]; ek+=s[i+k]*s[i+k]; }
    r[k]=c/(Math.sqrt(e0*ek)||1);
  }
  var best=-1, max=0, dipped=false;
  for(k=lo;k<=hi;k++) if(r[k]>max) max=r[k];
  if(max<0.6) return null;
  for(k=1;k<=hi;k++){
    if(r[k]<0.3*max) dipped=true;
    if(k>=lo && dipped && r[k]>=0.9*max && r[k]>=r[k-1] && r[k]>=r[k+1]){ best=k; break; }
  }
  if(best<0) return null;
  var a=r[best-1], b=r[best], c2=r[best+1], d=a-2*b+c2, shift=d ? 0.5*(a-c2)/d : 0;
  var hz=rate/(best+shift);
  return hz>=PITCH_LO && hz<=PITCH_HI ? Math.round(hz) : null;
}

/* ---------- the runtime's sensors: one app at a time, only while it is in front ---------- */
function host(env){
  var W=env.window, D=env.document, N=env.navigator;
  var now=env.now||function(){ return Date.now(); };
  var later=env.setTimeout||function(f,ms){ return setTimeout(f,ms); };
  var unlater=env.clearTimeout||function(t){ clearTimeout(t); };
  var every=env.setInterval||function(f,ms){ return setInterval(f,ms); };
  var unevery=env.clearInterval||function(t){ clearInterval(t); };
  /* what is on: the window each sensor feeds; and which system prompts this page has already passed */
  var live={motion:null, mic:null}, systemOk={motion:false, mic:false};
  var M={beta0:null, beta:null, gamma:null, heading:null, shake:null, send:null, first:null};
  var A={stream:null, src:null, an:null, sink:null, buf:null, loop:null, send:null, ctx:null};
  var watch=null, paused=null;

  function motionSupported(){ return !!(W.DeviceOrientationEvent || W.DeviceMotionEvent); }
  function micSupported(){ return !!(N.mediaDevices && typeof N.mediaDevices.getUserMedia==="function"); }
  /* iOS asks before it sends motion; elsewhere it just sends (or never does, on a desktop) */
  function motionNeedsAsk(){
    var O=W.DeviceOrientationEvent, Mo=W.DeviceMotionEvent;
    return !!((O && typeof O.requestPermission==="function") || (Mo && typeof Mo.requestPermission==="function"));
  }
  /* call inside the runtime's own tap: both prompts in the same gesture show one system box (section 10) */
  function askMotion(){
    if(!motionSupported()) return Promise.resolve("none");
    if(!motionNeedsAsk() || systemOk.motion) return Promise.resolve("granted");
    var asks=[W.DeviceOrientationEvent, W.DeviceMotionEvent].filter(function(E){ return E && typeof E.requestPermission==="function"; })
      .map(function(E){ try{ return Promise.resolve(E.requestPermission()).catch(function(){ return "denied"; }); }catch(e){ return Promise.resolve("denied"); } });
    return Promise.all(asks).then(function(r){
      var ok=r.every(function(x){ return x==="granted"; });
      if(ok) systemOk.motion=true;
      return ok ? "granted" : "denied";
    });
  }

  function guard(){
    if(watch || (!live.motion && !live.mic)) return;
    /* the safety net: whatever way the app left the front (HOME, another program, closed, removed, its frame gone),
       the next look finds a different owner and lets go of everything */
    watch=every(function(){
      if(live.motion && env.owner()!==live.motion) stopMotion();
      if(live.mic && env.owner()!==live.mic) stopMic();
      if(!live.motion && !live.mic && watch){ unevery(watch); watch=null; }
    },WATCH_MS);
  }

  /* ---------- motion ---------- */
  function onOrient(e){
    var win=live.motion; if(!win) return;
    if(env.owner()!==win){ stopMotion(); return; }
    if(e.beta==null && e.gamma==null) return;
    M.beta=+e.beta||0; M.gamma=+e.gamma||0;
    if(M.beta0==null) M.beta0=M.beta;
    var h=typeof e.webkitCompassHeading==="number" ? e.webkitCompassHeading : null;
    M.heading=heading(h);
    if(M.first){ var f=M.first; M.first=null; f("on"); }
    feedTilt(win);
  }
  function feedTilt(win){
    var t=tilt(M.beta,M.gamma,M.beta0);
    M.send(function(v){ if(live.motion===win) env.send(win,{op:"tilt", x:v.x, y:v.y, heading:v.heading, flat:v.flat}); },{x:t.x, y:t.y, heading:M.heading, flat:t.flat});
  }
  function onMotion(e){
    var win=live.motion; if(!win) return;
    if(env.owner()!==win){ stopMotion(); return; }
    if(M.shake(e.acceleration)) env.send(win,{op:"shake"});
  }
  /* -> Promise<"on" | "none">: on once the first reading arrives; none when nothing comes within a second (a desktop) */
  function startMotion(win){
    if(!motionSupported()) return Promise.resolve("none");
    if(live.motion===win) return Promise.resolve("on");
    if(live.motion) stopMotion();
    live.motion=win; M.beta0=null; M.beta=M.gamma=M.heading=null;
    M.shake=shaker(now); M.send=limiter(TILT_HZ,now,later);
    W.addEventListener("deviceorientation",onOrient);
    W.addEventListener("devicemotion",onMotion);
    guard();
    return new Promise(function(resolve){
      var t=later(function(){ if(M.first===done){ M.first=null; if(live.motion===win) stopMotion(); resolve("none"); } },FIRST_MS);
      var done=function(v){ unlater(t); resolve(v); };
      M.first=done;
    });
  }
  function stopMotion(){
    if(!live.motion) return;
    live.motion=null;
    W.removeEventListener("deviceorientation",onOrient);
    W.removeEventListener("devicemotion",onMotion);
    if(M.first){ var f=M.first; M.first=null; f("none"); }
  }
  /* y = 0 is the way the phone is held now */
  function zero(win){
    if(live.motion!==win || M.beta==null) return;
    M.beta0=M.beta; feedTilt(win);
  }

  /* ---------- microphone ---------- */
  /* -> Promise<"on" | "denied" | "none">. Call inside the runtime's own tap. iOS refuses capture under the "ambient" audio
     session (section 10), so the session goes to "play-and-record" first and back to "ambient" on every way out */
  function startMic(win){
    if(!micSupported()) return Promise.resolve("none");
    if(live.mic===win) return Promise.resolve("on");
    if(live.mic) stopMic();
    live.mic=win; guard();
    env.session("play-and-record");
    var p;
    try{ p=N.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}, video:false}); }
    catch(e){ p=Promise.reject(e); }
    return Promise.resolve(p).then(function(stream){
      if(live.mic!==win || env.owner()!==win){ stopTracks(stream); if(live.mic===win) stopMic(); else if(!live.mic) env.session("ambient"); return "denied"; }
      systemOk.mic=true;
      A.stream=stream;
      if(!wire()){ stopMic(); return "none"; }
      env.mic(true);
      A.send=limiter(SOUND_HZ,now,later);
      A.loop=every(listen,1000/SOUND_HZ);
      return "on";
    },function(err){
      if(live.mic===win) stopMic(); else if(!live.mic) env.session("ambient");
      var n=err && err.name;
      return n==="NotAllowedError" || n==="SecurityError" ? "denied" : "none";
    });
  }
  /* the stream into an analyser on the runtime's AudioContext; the analyser goes to a silent gain so it keeps running
     (Safari stops nodes that lead nowhere), and nothing of the microphone is ever heard */
  function wire(){
    unwire();
    var ctx=env.context(true); if(!ctx || !A.stream) return false;
    try{
      A.ctx=ctx;
      A.src=ctx.createMediaStreamSource(A.stream);
      A.an=ctx.createAnalyser(); A.an.fftSize=2048;
      A.sink=ctx.createGain(); A.sink.gain.value=0;
      A.src.connect(A.an); A.an.connect(A.sink); A.sink.connect(ctx.destination);
      A.buf=new Float32Array(A.an.fftSize);
      if(ctx.state!=="running" && ctx.resume) try{ ctx.resume(); }catch(e){}
      return true;
    }catch(e){ unwire(); return false; }
  }
  function unwire(){
    [A.src,A.an,A.sink].forEach(function(n){ if(n) try{ n.disconnect(); }catch(e){} });
    A.src=A.an=A.sink=A.ctx=null;
  }
  function listen(){
    var win=live.mic; if(!win) return;
    if(env.owner()!==win){ stopMic(); return; }
    if(!A.an) return;
    A.an.getFloatTimeDomainData(A.buf);
    var v={level:level(A.buf), pitch:pitch(A.buf,A.ctx.sampleRate)};
    A.send(function(x){ if(live.mic===win) env.send(win,{op:"sound", level:x.level, pitch:x.pitch}); },v);
  }
  function stopTracks(stream){
    if(!stream) return;
    try{ stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
  }
  function stopMic(){
    var was=!!live.mic;
    live.mic=null;
    if(A.loop){ unevery(A.loop); A.loop=null; }
    unwire();
    stopTracks(A.stream); A.stream=null;
    /* always, even when nothing was on: the silent switch must work again whatever happened before */
    env.session("ambient");
    if(was) env.mic(false);
  }
  /* the AudioContext was replaced (core.js rebuild): the same stream into the new one */
  function rewire(){ if(live.mic && A.stream && !wire()) stopMic(); }

  function stopAll(){ paused=null; stopMotion(); stopMic(); if(watch){ unevery(watch); watch=null; } }
  /* hidden (locked, another app): everything stops; shown again with the same app in front, the runtime turns back on
     what was on. pagehide: the page is going away, so nothing comes back */
  D.addEventListener("visibilitychange",function(){
    if(D.hidden){
      var p=(live.motion||live.mic) ? {win:live.motion||live.mic, motion:!!live.motion, mic:!!live.mic} : null;
      stopAll(); paused=p; return;
    }
    var q=paused; paused=null;
    if(q && env.owner()===q.win && env.resume) env.resume(q.win,{motion:q.motion, mic:q.mic});
  });
  W.addEventListener("pagehide",function(){ stopAll(); });

  return {
    motionSupported:motionSupported, micSupported:micSupported, motionNeedsAsk:motionNeedsAsk, askMotion:askMotion,
    startMotion:startMotion, stopMotion:stopMotion, zero:zero, startMic:startMic, stopMic:stopMic, rewire:rewire, stopAll:stopAll,
    systemOk:systemOk, live:live
  };
}

window.LopdaSensors={quantize:quantize, tilt:tilt, heading:heading, shaker:shaker, limiter:limiter, level:level, pitch:pitch, host:host,
  TILT_HZ:TILT_HZ, SOUND_HZ:SOUND_HZ, SHAKE:SHAKE, SHAKE_GAP:SHAKE_GAP};
})();
