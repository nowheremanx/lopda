/*
 * Lo-PDA sound chip: music (PAD.music) and made-to-order sound effects (PAD.sfx with an object).
 * Shared by the runtime and sdk/dev.html, so the harness sounds like the handheld. Design: docs/design/pad-audio.md.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Four music channels: two pulse waves (duty 12.5 / 25 / 50 / 75 %), a triangle and a noise channel, plus two
 * sound-effect voices (a third one cuts off the oldest). An original design: it nods at the 1989 handhelds and copies none.
 * The ten named sounds (PAD.sfx("coin")) are not here: they stay in core.js, exactly as they were.
 *
 *   LopdaChip.parse(song)          -> {song} or {error}   pure: MML text -> sorted note events
 *   LopdaChip.sfxParams(o)         -> clamped parameters   pure: out of range is pulled into range, never an error
 *   LopdaChip.create(ctx, out, o)  -> chip                 synthesis on any (Offline)AudioContext, into the node `out`
 *   LopdaChip.host(o)              -> host                 what the runtime and the harness hold: unlock, pause, rate limit
 *
 * Reserved for later steps (pad-audio.md section 11), not implemented here: ambience presets, PAD.music.render.
 */
(function(){
"use strict";

var CHANNELS=["p1","p2","tri","noise"];
var MAX_TEXT=8192;          /* characters of MML in one song, all channels together */
var MAX_EVENTS=20000;       /* notes in one channel after [ ]n repeats are unrolled */
var MAX_NEST=8;             /* [ ] inside [ ] */
var BPM_MIN=30, BPM_MAX=300, BPM_DEFAULT=120;
var SEMI={c:0,d:2,e:4,f:5,g:7,a:9,b:11};

/* ---------- MML: text -> events ---------- */

function fail(pos,msg){ var e=new Error(msg); e.pos=pos; throw e; }

/* one channel's text -> a tree of items. Positions are 1-based columns in that text. */
function tokenize(text,noise){
  var i=0, n=text.length, depth=0;
  function num(){ var s=i; while(i<n && text.charCodeAt(i)>=48 && text.charCodeAt(i)<=57) i++; return s===i ? null : +text.slice(s,i); }
  function len(){
    /* optional length (1-64) and up to two dots */
    var at=i+1, v=num(), dots=0;
    if(v!==null && (v<1 || v>64)) fail(at,"length "+v+" is out of range (1-64)");
    while(i<n && text.charAt(i)===".") { dots++; i++; }
    if(dots>2) fail(i,"at most two dots");
    return {n:v, dots:dots};
  }
  function seq(close,openAt){
    var out=[];
    while(i<n){
      var c=text.charAt(i), at=i+1;
      if(/\s|\|/.test(c)){ i++; continue; }                           /* spaces and bar lines are for the eye */
      if(c==="]"){
        if(!close) fail(at,"']' without '['");
        i++; return {items:out, times:num()};
      }
      i++;
      var lc=c.toLowerCase();
      if(c==="["){
        if(++depth>MAX_NEST) fail(at,"repeats nest too deep (at most "+MAX_NEST+")");
        var r=seq(true,at); depth--;
        if(r.times===null) r.times=2;
        if(r.times<1 || r.times>99) fail(at,"repeat count must be 1-99");
        out.push({k:"rep", items:r.items, times:r.times, at:at});
      }
      else if(SEMI.hasOwnProperty(lc)){
        if(noise) fail(at,"the noise channel plays only x and X");
        var s=SEMI[lc];
        while(i<n && (text.charAt(i)==="+" || text.charAt(i)==="-")){ s+=text.charAt(i)==="+"?1:-1; i++; }
        var l=len(); out.push({k:"note", semi:s, n:l.n, dots:l.dots, at:at});
      }
      else if(c==="x" || c==="X"){
        if(!noise) fail(at,"x and X are for the noise channel");
        var lx=len(); out.push({k:"note", hit:c, n:lx.n, dots:lx.dots, at:at});
      }
      else if(lc==="r"){ var lr=len(); out.push({k:"rest", n:lr.n, dots:lr.dots, at:at}); }
      else if(c==="&") out.push({k:"tie", at:at});
      else if(c==="<" || c===">") out.push({k:"oct", d:c===">"?1:-1, at:at});
      else if(lc==="o"){ var o=num(); if(o===null || o>7) fail(at,"o needs an octave 0-7"); out.push({k:"o", v:o, at:at}); }
      else if(lc==="l"){
        var ll=num(); if(ll===null) fail(at,"l needs a length, like l8");
        if(ll<1 || ll>64) fail(at,"length "+ll+" is out of range (1-64)");
        var d=0; while(i<n && text.charAt(i)===".") { d++; i++; }
        if(d>2) fail(i,"at most two dots");
        out.push({k:"l", n:ll, dots:d, at:at});
      }
      else if(lc==="v"){ var v=num(); if(v===null || v>15) fail(at,"v needs a volume 0-15"); out.push({k:"v", v:v, at:at}); }
      else if(c==="@"){ var w=num(); if(w===null || w>3) fail(at,"@ needs a duty 0-3"); out.push({k:"duty", v:w, at:at}); }
      else fail(at,"unknown command '"+c+"'");
    }
    if(close) fail(openAt,"'[' is never closed");
    return {items:out};
  }
  return seq(false).items;
}

function beatsOf(n,dots,st){
  var b = n===null ? st.len : 4/n, d = n===null ? st.dots : dots, add=b/2;
  /* a dot adds half, a second dot a quarter */
  for(var k=0;k<d;k++){ b+=add; add/=2; }
  return b;
}

/* walk the tree in order, unrolling repeats; state (octave, volume, ...) carries through, as on paper */
function expand(items,st,out,ch,noise){
  for(var j=0;j<items.length;j++){
    var it=items[j];
    if(it.k==="rep"){ for(var r=0;r<it.times;r++) expand(it.items,st,out,ch,noise); continue; }
    if(it.k==="o"){ st.oct=it.v; continue; }
    if(it.k==="oct"){ st.oct+=it.d; if(st.oct<0 || st.oct>7) fail(it.at,"octave goes out of range (0-7)"); continue; }
    if(it.k==="l"){ st.len=4/it.n; st.dots=it.dots; continue; }
    if(it.k==="v"){ st.vol=it.v; continue; }
    if(it.k==="duty"){ st.duty=it.v; continue; }
    if(it.k==="tie"){ st.tie=true; continue; }
    var b=beatsOf(it.n,it.dots,st);
    if(it.k==="rest"){ st.t+=b; st.last=null; st.tie=false; continue; }
    var midi = noise ? null : 12*(st.oct+1)+it.semi;
    if(!noise && (midi<12 || midi>107)) fail(it.at,"note goes out of range");
    /* "&": the same pitch carries on as one note; another pitch follows without a gap (it would anyway) */
    if(st.tie && st.last && (noise ? st.last.hit===it.hit : st.last.m===midi)){ st.last.d+=b; st.t+=b; st.tie=false; continue; }
    st.tie=false;
    var e={t:st.t, d:b, ch:ch, v:st.vol, duty:st.duty};
    if(noise) e.hit=it.hit; else { e.m=midi; e.f=440*Math.pow(2,(midi-69)/12); }
    out.push(e); st.last=e; st.t+=b;
    if(out.length>MAX_EVENTS) fail(it.at,"too many notes (more than "+MAX_EVENTS+" after repeats)");
  }
}

/* one channel: -> {events, beats}; throws an Error with .pos */
function parseChannel(ch,text){
  var noise=ch==="noise";
  var st={t:0, oct:4, len:1, dots:0, vol:10, duty:2, tie:false, last:null};
  var out=[];
  expand(tokenize(text,noise),st,out,ch,noise);
  return {events:out, beats:st.t};
}

/* the whole song: {bpm, p1, p2, tri, noise} -> {song:{bpm, beats, seconds, events}} or {error:"p1:12: ..."} */
function parse(song){
  if(!song || typeof song!=="object" || Array.isArray(song)) return {error:'a song is an object such as {bpm: 120, p1: "c d e"}'};
  var size=0, keys=Object.keys(song), used=0;
  for(var k=0;k<keys.length;k++){
    var key=keys[k];
    if(key==="bpm") continue;
    if(CHANNELS.indexOf(key)<0) return {error:"unknown key "+JSON.stringify(key)+": a song has bpm and up to four channels, "+CHANNELS.join(", ")};
    if(typeof song[key]!=="string") return {error:key+" must be a string of MML"};
    size+=song[key].length; used++;
  }
  if(!used) return {error:"the song has no channels ("+CHANNELS.join(", ")+")"};
  if(size>MAX_TEXT) return {error:"the song is "+size+" characters; the limit is "+MAX_TEXT};
  var bpm=song.bpm==null ? BPM_DEFAULT : +song.bpm;
  if(!isFinite(bpm)) return {error:"bpm must be a number"};
  bpm=Math.max(BPM_MIN,Math.min(BPM_MAX,bpm));
  var events=[], beats=0;
  for(var c=0;c<CHANNELS.length;c++){
    var ch=CHANNELS[c]; if(typeof song[ch]!=="string") continue;
    try{
      var r=parseChannel(ch,song[ch]);
      events=events.concat(r.events); beats=Math.max(beats,r.beats);
    }catch(e){ return {error:ch+":"+(e.pos||0)+": "+e.message, channel:ch, pos:e.pos||0}; }
  }
  if(!(beats>0)) return {error:"the song is empty"};
  /* by time, then channel order, so scheduling walks one list */
  events.sort(function(a,b){ return a.t-b.t || CHANNELS.indexOf(a.ch)-CHANNELS.indexOf(b.ch); });
  return {song:{bpm:bpm, beats:beats, seconds:beats*60/bpm, events:events}};
}

/* ---------- custom sound effects: clamp, never refuse ---------- */
var WAVES=["square","triangle","noise"];
function numIn(v,lo,hi,def){ v=typeof v==="number" ? v : typeof v==="string" && v.trim()!=="" ? +v : NaN; return isFinite(v) ? Math.max(lo,Math.min(hi,v)) : def; }
function sfxParams(o){
  o = o && typeof o==="object" ? o : {};
  var wave=WAVES.indexOf(o.wave)>=0 ? o.wave : "square";
  var from=numIn(o.from,20,12000,440), ms=numIn(o.ms,10,1500,150), attack=numIn(o.attack,0,ms,2);
  /* vibrato (pad-audio.md section 3) waits on its shape: see the open question in docs/decisions.md section 10 */
  return {wave:wave, duty:Math.round(numIn(o.duty,0,3,2)), from:from, to:numIn(o.to,20,12000,from), ms:ms,
    attack:attack, decay:numIn(o.decay,0,ms-attack,ms-attack), vol:numIn(o.vol,0,1,0.7)};
}

/* ---------- synthesis ---------- */
var DUTY=[0.125,0.25,0.5,0.75];
/* peak level of one channel at v15 (the balance between channels), then the music bus: a whole four-channel song
   comes out at about half the loudness of a sound effect, so effects and the runtime's clicks stay on top */
var LEVEL={p1:0.22, p2:0.22, tri:0.34, noise:0.2};
var MUSIC_GAIN=0.5, SFX_LEVEL=0.9, SFX_VOICES=2;
var NOISE_CLOCK=4096;       /* the noise buffer steps its shift register 4096 times a second at playbackRate 1 */
var HIT={x:{rate:3, len:0.045}, X:{rate:1.25, len:0.6}};
var LOOKAHEAD=0.25, TICK_MS=50, START_DELAY=0.06, EDGE=0.004;

/* a band-limited pulse wave: Fourier series of a rectangle with this duty */
function pulseWave(ctx,duty){
  var N=48, re=new Float32Array(N), im=new Float32Array(N);
  for(var k=1;k<N;k++){ re[k]=2/(k*Math.PI)*Math.sin(k*Math.PI*duty); }
  return ctx.createPeriodicWave(re,im);
}
/* one second of 15-bit shift-register noise, held between steps: grainy, the same on every run */
function noiseBuffer(ctx){
  var n=Math.max(1,Math.round(ctx.sampleRate)), buf=ctx.createBuffer(1,n,ctx.sampleRate), d=buf.getChannelData(0);
  var lfsr=0x7fff, per=ctx.sampleRate/NOISE_CLOCK, acc=0, out=1;
  for(var i=0;i<n;i++){
    acc+=1; if(acc>=per){ acc-=per; var bit=(lfsr^(lfsr>>1))&1; lfsr=(lfsr>>1)|(bit<<14); out=(lfsr&1)?1:-1; }
    d[i]=out;
  }
  return buf;
}

function create(ctx,out,opt){
  opt=opt||{};
  var waves=DUTY.map(function(d){ return pulseWave(ctx,d); }), noise=noiseBuffer(ctx);
  var sfxBus=ctx.createGain(); sfxBus.connect(out);
  var music=null, voices=[], timer=0, noiseAt=0, log=[];
  function now(){ return ctx.currentTime; }

  /* one sounding thing: a source through its own gain, remembered so it can be cut off */
  function source(kind,duty,f){
    var s;
    if(kind==="noise"){ s=ctx.createBufferSource(); s.buffer=noise; s.loop=true; }
    else { s=ctx.createOscillator(); if(kind==="tri") s.type="triangle"; else s.setPeriodicWave(waves[duty]); if(f) s.frequency.value=f; }
    return s;
  }
  function envelope(g,at,level,attack,hold,release){
    g.gain.setValueAtTime(0,at);
    g.gain.linearRampToValueAtTime(level,at+attack);
    if(hold>0) g.gain.setValueAtTime(level,at+attack+hold);
    g.gain.linearRampToValueAtTime(0,at+attack+hold+release);
  }
  function stopAt(s,t){ try{ s.stop(t); }catch(e){} }

  function note(e,at,dur,bus){
    var g=ctx.createGain(), level=e.v/15*LEVEL[e.ch], s;
    if(e.ch==="noise"){
      var h=HIT[e.hit], len=Math.min(dur,h.len);
      s=source("noise"); s.playbackRate.value=h.rate;
      envelope(g,at,level,0.002,0,Math.max(0.01,len-0.002));
      noiseAt=(noiseAt+0.137)%1;
      s.connect(g); g.connect(bus); s.start(at,noiseAt); stopAt(s,at+len+0.02);
      return {s:s, from:at, to:at+len};
    }
    s=source(e.ch==="tri"?"tri":"pulse",e.duty,e.f);
    /* the full length, with a few milliseconds of edge so notes do not click */
    envelope(g,at,level,EDGE,Math.max(0,dur-2*EDGE),EDGE);
    s.connect(g); g.connect(bus); s.start(at); stopAt(s,at+dur+0.01);
    return {s:s, from:at, to:at+dur};
  }

  /* schedule every note that starts before `until` (a time on ctx's clock). The real-time timer calls this with
     now + LOOKAHEAD; an offline render can call it once with the whole length. */
  function pump(until){
    var m=music; if(!m) return;
    var t0=now(), spb=60/m.song.bpm, ev=m.song.events;
    m.nodes=m.nodes.filter(function(x){ return x.to>t0; });
    while(m){
      if(m.i>=ev.length){
        if(!m.loop){ if(t0>=m.start+(m.base+m.song.beats)*spb && !m.nodes.length) halt(); return; }
        m.base+=m.song.beats; m.i=0;
      }
      var e=ev[m.i], at=m.start+(m.base+e.t)*spb;
      if(at>=until) return;
      m.i++;
      /* a clock that jumped (a phone back from the background) skips what it missed instead of playing it all at once */
      if(at<t0-0.02) continue;
      m.nodes.push(note(e,at,e.d*spb,m.bus));
      if(opt.trace) log.push({ch:e.ch, from:at, to:at+e.d*spb});
    }
  }
  function tick(){ timer=0; if(!music) return; pump(now()+LOOKAHEAD); if(music && !opt.offline) timer=setTimeout(tick,TICK_MS); }
  function halt(){ music=null; if(timer){ clearTimeout(timer); timer=0; } }

  function play(song,o){
    o=o||{};
    stop(0.02);
    var bus=ctx.createGain(); bus.gain.value=MUSIC_GAIN; bus.connect(out);
    /* o.from: start this many beats in (a song carried over to a new AudioContext goes on where it was) */
    music={song:song, loop:o.loop!==false, start:(o.at!=null?o.at:now()+START_DELAY-(o.from||0)*60/song.bpm), base:0, i:0, bus:bus, nodes:[]};
    if(opt.offline) return;
    tick();
  }
  /* fade out over `sec` seconds (0.3 for PAD.music.stop, a few ms when the app goes away) */
  function stop(sec){
    var m=music; if(!m) return;
    halt();
    var t=now(), end=t+Math.max(0.005,sec);
    m.bus.gain.cancelScheduledValues(t); m.bus.gain.setValueAtTime(m.bus.gain.value,t); m.bus.gain.linearRampToValueAtTime(0,end);
    m.nodes.forEach(function(x){ stopAt(x.s,end+0.01); });
    if(!opt.offline) setTimeout(function(){ try{ m.bus.disconnect(); }catch(e){} },(end-t)*1000+200);
  }

  function sfx(p){
    var t=now(), g=ctx.createGain(), s, dur=p.ms/1000, a=p.attack/1000, d=p.decay/1000;
    voices=voices.filter(function(v){ return v.to>t; });
    if(p.wave==="noise"){
      s=source("noise");
      s.playbackRate.setValueAtTime(p.from/NOISE_CLOCK,t);
      if(p.to!==p.from) s.playbackRate.exponentialRampToValueAtTime(p.to/NOISE_CLOCK,t+dur);
    } else {
      s=source(p.wave==="triangle"?"tri":"pulse",p.duty,0);
      s.frequency.setValueAtTime(p.from,t);
      if(p.to!==p.from) s.frequency.exponentialRampToValueAtTime(p.to,t+dur);
    }
    envelope(g,t,p.vol*SFX_LEVEL,a,Math.max(0,dur-a-d),d);
    s.connect(g); g.connect(sfxBus); s.start(t); stopAt(s,t+dur+0.02);
    var v={s:s, g:g, from:t, to:t+dur};
    voices.push(v);
    if(opt.trace) log.push({ch:"sfx", from:t, to:t+dur, v:v});
    /* two voices, like the chip it pretends to be: a third cuts off the oldest, with a short ramp so it does not click */
    while(voices.length>SFX_VOICES){
      var old=voices.shift();
      old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value,t); old.g.gain.linearRampToValueAtTime(0,t+0.005);
      stopAt(old.s,t+0.01); old.to=t+0.005;
      if(opt.trace && log.length) log.forEach(function(x){ if(x.v===old) x.to=t+0.005; });
    }
  }

  return {
    play:play, stop:stop, sfx:sfx, pump:pump,
    playing:function(){ return !!music; },
    /* where the song is, in beats from its start (within the loop) */
    beat:function(){
      var m=music; if(!m) return 0;
      var b=Math.max(0,(now()-m.start)*m.song.bpm/60);
      return m.loop && m.song.beats>0 ? b%m.song.beats : b;
    },
    /* for tests (opt.trace): every sound scheduled, and how many sound at time t */
    trace:function(){ return log.map(function(x){ return {ch:x.ch, from:x.from, to:x.to}; }); },
    voices:function(t){
      var m=0, s=0; log.forEach(function(x){ if(x.from<=t && t<x.to){ if(x.ch==="sfx") s++; else m++; } });
      return {music:m, sfx:s};
    }
  };
}

/* ---------- host: what the runtime and the harness hold ----------
   o.context(create) -> the AudioContext (made only when create is true), o.output() -> the node to play into,
   o.level() sets the master volume before music starts. Handles: music before the AudioContext may start
   (kept, started on the first touch or key), pausing with the page, and at most 4 music calls a second. */
var MUSIC_RATE=4;
function host(o){
  var chip=null, chipCtx=null, want=null, cur=null, paused=false, calls=[];
  function ctxOf(make){
    var ctx=o.context(make);
    if(ctx && ctx!==chipCtx){ chipCtx=ctx; chip=create(ctx,o.output()); }
    return ctx;
  }
  function running(ctx){ return !!ctx && ctx.state==="running"; }
  /* a context may be made outside a touch only once the page has had one (the browser would keep it silent otherwise) */
  function mayCreate(){ var u=typeof navigator!=="undefined" && navigator.userActivation; return !!(u && u.hasBeenActive); }
  function start(){
    if(!want) return;
    var ctx=ctxOf(mayCreate());
    if(!ctx) return;
    if(!running(ctx)){ try{ ctx.resume().then(function(){ if(running(ctx)) start(); },function(){}); }catch(e){} return; }
    var w=want; want=null; paused=false; cur=w;
    if(o.level) o.level();
    chip.play(w.song,{loop:w.loop});
  }
  return {
    /* {action:"play", song, loop} or {action:"stop"} -> null, or {error} for a bad song, or {dropped} over the rate */
    music:function(d){
      var t=Date.now(); calls=calls.filter(function(x){ return t-x<1000; });
      if(d && d.action==="stop"){ calls.push(t); want=null; cur=null; if(chip) chip.stop(0.3); return null; }
      if(!d || d.action!=="play") return {error:"PAD.music: unknown call"};
      if(calls.length>=MUSIC_RATE) return {dropped:"PAD.music: more than "+MUSIC_RATE+" calls a second"};
      calls.push(t);
      var r=parse(d.song);
      if(r.error) return {error:r.error};
      want={song:r.song, loop:d.loop!==false};
      start();
      return null;
    },
    /* a custom effect; the caller has already checked the sound switch and the rate */
    sfx:function(params){
      var ctx=ctxOf(true); if(!ctx) return;
      if(ctx.state!=="running"){ try{ ctx.resume(); }catch(e){} }
      chip.sfx(sfxParams(params));
    },
    /* call from a real touch or key: lets a waiting song start, or a context the phone stopped run again */
    unlock:function(){
      if(!want && !(chip && chip.playing() && !running(chipCtx))) return;
      var ctx=ctxOf(true); if(!ctx) return;
      paused=false;
      if(ctx.state!=="running"){
        try{ ctx.resume(); }catch(e){}
        /* iOS wakes a context reliably only when something plays inside the touch */
        try{ var b=ctx.createBufferSource(); b.buffer=ctx.createBuffer(1,1,22050); b.connect(ctx.destination); b.start(0); }catch(e){}
      }
      start();
    },
    /* the app went away: stop at once */
    stop:function(){ want=null; cur=null; calls=[]; if(chip) chip.stop(0.02); },
    /* the host replaced its AudioContext (the phone had stopped the old one): the song goes on in the new one from
       the beat it had reached, instead of starting over */
    rebuild:function(){
      var going=chip && chip.playing() && cur, at=going ? chip.beat() : 0;
      if(chip) try{ chip.stop(0.005); }catch(e){}
      chip=null; chipCtx=null; paused=false;
      if(!going) return;
      if(!ctxOf(true)) return;
      chip.play(cur.song,{loop:cur.loop, from:at});
    },
    /* page hidden: freeze the clock (the song picks up where it was); shown: let it run */
    pause:function(){ if(chip && chip.playing() && running(chipCtx)){ paused=true; try{ chipCtx.suspend(); }catch(e){} } },
    resume:function(){ if(!paused) return; paused=false; try{ chipCtx.resume(); }catch(e){} },
    state:function(){ return {playing:!!(chip && chip.playing()), waiting:!!want, paused:paused}; },
    beat:function(){ return chip && chip.playing() ? chip.beat() : 0; }
  };
}

window.LopdaChip={CHANNELS:CHANNELS, MAX_TEXT:MAX_TEXT, parse:parse, sfxParams:sfxParams, create:create, host:host};
})();
