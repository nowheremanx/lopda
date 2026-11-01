/*
 * Lo-PDA runtime: LP.link, the host for the acoustic link (docs/design/radio.md 7 and 8.4).
 * One microphone stream and one speaker for the whole link: the session layer never sees
 * the hardware, it only asks for bursts and hands us frames. The runtime draws the pairing
 * screen itself (over whatever is in front, like PAD.camera.snap) and the status bar keeps
 * a small antenna while the link is open.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * LP.link:
 *   open({port, proto, label}) -> Promise "open"|"cancelled"|"none"|"busy"
 *   send(data)                 -> Promise "sent"|"lost"|"closed"|"busy"|"big"
 *   close(reason)              BYE, then close; the owner's close event says `reason`
 *   state                      "closed"|"pairing"|"open"
 *   initiator                  true on the side that sent the HELLO that was answered
 *   rate                       10, 20, 40 or null (Radio's meter only; never given to apps)
 *   on(fn) -> off()            fn({type:"message", data}) | fn({type:"close", reason})
 *   busy()                     true while pairing or open
 *   levels()                   the last tone dB values and noise floor, for Radio's meter
 *   setTxMode(m), txMode()     "playback" (default where navigator.audioSession exists: close the mic while sending,
 *                              or iOS plays through the earpiece) or "record" (keep it open); Radio's meter page
 *
 * ?linkfake swaps the sound for a BroadcastChannel between tabs of one browser, with the
 * session's own air time; &linkloss=0.2 drops that share of the frames. The session layer
 * and everything above it are identical, so the fake is the e2e's channel.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr, toast=LP.toast;
var AC=window.LopdaAcoustic, RX=window.LopdaAcousticRx, LINK=window.LopdaAcousticLink, SESS=window.LopdaAcousticSession;

var STATE="closed", INITIATOR=false, RATE=null, SESSION=null, TIMER=0, GEN=0;
var LISTENERS=[], PENDING_SENDS={}, PENDING_OPEN=null, LOCAL_REASON="home";
var PAIR_START=0, LABEL="", OVERLAY=false, PAD_ON=false, PUMPING=false, PUMP_AGAIN=false;
var FAKE=/[?&]linkfake\b/.test(location.search);
/* The burst's fixed level (not the handheld's volume, like a real modem). 0.9 was too harsh on the first iPhone test;
   about half is still heard at 10-30 cm with the phone's volume up. */
var TX_AMP=0.45;

function dlog(s){
  var d=window.LOPDA_DEBUG;
  if(!d) return;
  if(!d.link) d.link=[];
  d.link.push(s);
}
function frameName(bytes){
  try{ var p=LINK.parse(bytes); return p.ok?p.frame.typeName:"?"; }catch(e){ return "?"; }
}
function emit(ev){
  var list=LISTENERS.slice(), i;
  for(i=0;i<list.length;i++){
    try{ list[i](ev); }catch(e){}
  }
}
function resolveOpen(v){
  var f=PENDING_OPEN;
  if(!f) return;
  PENDING_OPEN=null;
  f(v);
}

/* ---------- the pairing screen and the status mark ---------- */

function setOverlayText(){
  if(!OVERLAY) return;
  $("link-title").textContent=tr("link.title",{name:LABEL||tr("link.plain")});
}
function showOverlay(){
  OVERLAY=true;
  $("link").hidden=false;
  setOverlayText();
  $("link-phase").textContent=tr("link.listen");
  $("link-attempt").textContent="";
  $("link-bar").style.width="0%";
  $("link-wave").className="link-wave";
  /* The pad is a touch way to B, but at 331 x 359 it takes half the LCD and pushes the
     hint and the Cancel button off the screen. There the button is the touch way out;
     B still works through the pad when the program in front already keeps it. */
  PAD_ON=false;
  if($("gamepad").hidden && $("screen").clientHeight>=360){ PAD_ON=true; LP.showPad(true); }
}
function hideOverlay(){
  if(!OVERLAY) return;
  OVERLAY=false;
  $("link").hidden=true;
  $("link-wave").className="link-wave";
  if(PAD_ON){ PAD_ON=false; LP.releaseButtons(); LP.showPad(false); }
}
function showMark(){ var m=$("link-mark"); if(m) m.hidden=false; }
function hideMark(){ var m=$("link-mark"); if(m){ m.hidden=true; m.classList.remove("tx"); } }
function txOn(){ var m=$("link-mark"); if(m) m.classList.add("tx"); var w=$("link-wave"); if(w) w.classList.add("tx"); }
function txOff(){ var m=$("link-mark"); if(m) m.classList.remove("tx"); var w=$("link-wave"); if(w) w.classList.remove("tx"); }

function diagText(){
  var d=TRANSPORT.diag();
  if(!d || d.fake) return "";
  return tr("link.diag",{bps:d.bps, db:d.rms==null?"-":Math.round(d.rms), ctx:d.ctx, err:d.err?" · "+d.err:""});
}
function updateBar(){
  if(!OVERLAY) return;
  var dg=$("link-diag"); if(dg) dg.textContent=diagText();
  var pct=Math.min(100,((Date.now()-PAIR_START)/60000)*100);
  $("link-bar").style.width=pct.toFixed(1)+"%";
}

/* ---------- the fake transport: two tabs of one browser ---------- */

function fakeTransport(){
  var T={ch:null, myId:"", tx:[], peerFrom:0, peerTo:0, txUntil:0, loss:0, onHeard:null, onBusy:null, initGen:0};
  var m=location.search.match(/[?&]linkloss=([0-9.]+)/);
  T.loss=m?Math.max(0,Math.min(1,parseFloat(m[1])||0)):0;
  function now(){ return Date.now(); }
  function post(o){ if(!T.ch) return; try{ T.ch.postMessage(o); }catch(e){} }
  function bytesOf(b){
    if(!b) return new Uint8Array(0);
    if(b instanceof Uint8Array) return b;
    return new Uint8Array(b);
  }
  function onMessage(e){
    var msg=e.data;
    if(!msg || msg.from===T.myId) return;
    if(msg.kind==="start"){
      T.peerFrom=now();
      T.peerTo=T.peerFrom+(msg.ms||0);
      if(T.onBusy) T.onBusy(T.peerFrom);
      return;
    }
    if(msg.kind!=="frame") return;
    /* half duplex: if our own burst was on air at the same time, neither side heard the other */
    var i, overlap=false;
    for(i=0;i<T.tx.length;i++){
      if(T.tx[i].from<T.peerTo && T.peerFrom<T.tx[i].to){ overlap=true; break; }
    }
    if(!overlap && T.onHeard) T.onHeard(bytesOf(msg.bytes), msg.rate);
  }
  function prune(){
    var cut=now()-60000, i;
    for(i=T.tx.length-1;i>=0;i--) if(T.tx[i].to<cut) T.tx.splice(i,1);
  }
  return {
    ok:function(){ return typeof window.BroadcastChannel==="function"; },
    active:function(){ return !!T.ch; },
    onHeard:function(fn){ T.onHeard=fn; },
    onBusy:function(fn){ T.onBusy=fn; },
    init:function(){
      if(!this.ok()) return Promise.resolve(false);
      var my=++T.initGen;
      try{ T.ch=new BroadcastChannel("lopda-linkfake"); }catch(e){ return Promise.resolve(false); }
      if(my!==T.initGen){ try{ T.ch.close(); }catch(e){} T.ch=null; return Promise.resolve(false); }
      T.ch.onmessage=onMessage;
      T.myId=Math.random().toString(36).slice(2)+now().toString(36);
      T.tx=[]; T.peerFrom=0; T.peerTo=0; T.txUntil=0;
      return Promise.resolve(true);
    },
    tick:function(){
      /* the peer's whole burst keeps the channel busy, not just its first instant:
         the session's carrier sense then waits it out, as it does on real sound */
      if(T.peerTo && now()<T.peerTo && T.onBusy) T.onBusy(now());
    },
    send:function(bytes, rate, done){
      var ms=SESS.airMs(bytes.length, rate), from=now(), to=from+ms;
      prune();
      T.tx.push({from:from, to:to});
      T.txUntil=to+30;
      post({from:T.myId, kind:"start", rate:rate, ms:ms});
      setTimeout(function(){
        if(!T.ch) return;
        /* the frame may be dropped: the session's retry is the loss handling */
        if(Math.random()>=T.loss) post({from:T.myId, kind:"frame", bytes:new Uint8Array(bytes), rate:rate});
        if(done) done();
      }, ms);
    },
    stop:function(){
      T.initGen++;
      if(T.ch){ try{ T.ch.close(); }catch(e){} T.ch=null; }
      T.tx=[]; T.peerFrom=0; T.peerTo=0; T.txUntil=0;
    },
    levels:function(){ return null; },
    deadMs:function(){ return 0; },
    diag:function(){ return {fake:true}; },
    txUntil:function(){ return T.txUntil; }
  };
}

/* ---------- the acoustic transport: one mic stream, muted around our own bursts ---------- */

function acousticTransport(){
  var T={stream:null, src:null, proc:null, silent:null, ctx:null, sr:48000, rx:null,
    n:0, floor:null, pdb:null, txUntil:0, onHeard:null, onBusy:null, initGen:0, sentRecent:[], live:false, txMode:navigator.audioSession ? "playback" : "record", reopen:0,
    cb:0, cbAt:0, cbRate:0, cbCount:0, cbWin:0, wiredAt:0, rms:null, err:"", rewires:0, busySince:0, quietTx:0};

  /* How late our own sound reaches the receiver, in seconds: the speaker's output latency, the
     microphone's input latency and the ScriptProcessor's block (T.n counts samples already handed
     to us, not the ones still in the block being filled). Browsers report the first two poorly or
     not at all (iOS gives 0), so a fixed 60 ms is added; the mute span is stretched by all of it. */
  function lagS(ctx){
    return 4096/ctx.sampleRate+(ctx.baseLatency||0)+(ctx.outputLatency||0)+0.06;
  }
  /* A loud room can still bring our own frame back after the mute ends (an echo off a wall, a
     phone case resonating). A frame byte-identical to one we sent in the last 20 s is ours: the
     peer's frames differ in seq/ack and nonce, so a real frame never matches. */
  function keyOf(bytes){ return Array.prototype.join.call(bytes,","); }
  function isOwn(bytes){
    var now=Date.now(), k=keyOf(bytes), i, own=false;
    for(i=T.sentRecent.length-1;i>=0;i--){
      if(now-T.sentRecent[i].at>20000) T.sentRecent.splice(i,1);
      else if(T.sentRecent[i].k===k) own=true;
    }
    return own;
  }

  function dropNodes(){
    if(T.proc){
      try{ T.proc.onaudioprocess=null; }catch(e){}
      try{ T.proc.disconnect(); }catch(e){}
    }
    if(T.src){ try{ T.src.disconnect(); }catch(e){} }
    if(T.silent){ try{ T.silent.disconnect(); }catch(e){} }
    T.proc=null; T.src=null; T.silent=null;
  }

  function wire(ctx){
    var src, proc, silent;
    if(!T.stream || !ctx) return;
    dropNodes();
    src=ctx.createMediaStreamSource(T.stream);
    proc=ctx.createScriptProcessor(4096,1,1);
    silent=ctx.createGain();
    silent.gain.value=0;
    src.connect(proc); proc.connect(silent); silent.connect(ctx.destination);
    T.src=src; T.proc=proc; T.silent=silent; T.ctx=ctx; T.sr=ctx.sampleRate;
    /* the receiver starts a fresh search on the new timeline; the sample counter goes on */
    T.rx=RX.create({sampleRate:ctx.sampleRate, rates:[10,20,40]});
    T.wiredAt=Date.now(); T.cbAt=0;

    proc.onaudioprocess=function(e){
      if(T.proc!==proc) return;
      var d=e.inputBuffer.getChannelData(0), n=T.n, i, j, tw, max, frames, t=Date.now();
      /* blocks a second, for the diagnostic line: an iPhone whose microphone has stalled shows 0 here */
      T.cb++; T.cbAt=t; T.cbCount++;
      if(t-T.cbWin>=1000){ T.cbRate=T.cbCount*1000/Math.max(1,t-T.cbWin); T.cbCount=0; T.cbWin=t; }
      T.rx.push(d,n);
      T.n=n+d.length;
      frames=T.rx.frames();
      for(i=0;i<frames.length;i++){
        if(isOwn(frames[i].bytes)){ dlog("own echo dropped"); continue; }
        if(T.onHeard) T.onHeard(frames[i].bytes, frames[i].rate);
      }
      /* carrier sense: a slow floor under the strongest tone; a real burst jumps 10 dB above it */
      tw=AC.toneWindow(d,0,d.length,T.sr);
      max=tw.pdb[0];
      for(j=1;j<4;j++) if(tw.pdb[j]>max) max=tw.pdb[j];
      if(T.floor===null) T.floor=max;
      else T.floor=max<T.floor ? max : T.floor+0.5;
      T.pdb=tw.pdb; T.rms=tw.rmsDb;
      /* our own burst (and its tail) is not someone else talking */
      if(t<T.txUntil) return;
      /* Carrier sense, capped: a burst is at most a few seconds, so energy that lasts longer is the room (a fan,
         music), and waiting for it to stop would starve every send. After 4 s of it we talk anyway. */
      if(max>T.floor+10 && tw.rmsDb>AC.MIN_RMS){
        if(!T.busySince) T.busySince=t;
        if(t-T.busySince<4000 && T.onBusy) T.onBusy(t);
      }else T.busySince=0;
    };
  }

  return {
    ok:function(){
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
        (window.AudioContext||window.webkitAudioContext));
    },
    active:function(){ return !!T.stream; },
    onHeard:function(fn){ T.onHeard=fn; },
    onBusy:function(fn){ T.onBusy=fn; },
    init:function(){
      if(!this.ok()) return Promise.resolve(false);
      /* a stop() while the system prompt is open makes this late stream a stray */
      var my=++T.initGen;
      /* the session type goes on before the prompt: iOS switches the route while the mic opens */
      LP.setSession("play-and-record");
      var ctx=LP.audio();
      if(!ctx){ T.err="audio"; LP.setSession("ambient"); return Promise.resolve(false); }
      T.err="";
      LP.wake();
      var p;
      try{
        p=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
      }catch(e){ p=Promise.reject(e); }
      return Promise.resolve(p).then(function(stream){
        if(my!==T.initGen){
          try{ stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
          return false;
        }
        T.stream=stream;
        T.n=0; T.floor=null; T.pdb=null;
        /* the context may have been replaced while the prompt was open */
        ctx=LP.SND.ctx||ctx;
        try{ wire(ctx); }
        catch(e){
          T.err="wire "+(e && e.name || "");
          T.stream=null;
          try{ stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(x){} }); }catch(x){}
          LP.setSession("ambient");
          return false;
        }
        T.live=true;
        $("mic-mark").hidden=false;
        LP.micRoute(true);
        return true;
      },function(e){
        /* NotAllowedError: the permission; NotReadableError: iOS still holds the last capture */
        T.err=(e && e.name) || "mic";
        LP.setSession("ambient");
        return false;
      });
    },
    tick:function(){
      if(!T.stream) return;
      /* core.js rebuild() may replace the context behind our back (iOS kills them) */
      var ctx=LP.SND.ctx, now=Date.now(), last;
      if(ctx && ctx!==T.ctx){
        try{ wire(ctx); }catch(e){}
        return;
      }
      /* A stalled microphone: no block for 1.5 s. Ask the context to run; after 3 s wire the stream again
         (iOS sometimes stops a ScriptProcessor after a route change). The diagnostic line shows it. */
      last=T.cbAt||T.wiredAt;
      if(T.ctx && now-last>1500){
        if(T.ctx.state!=="running") LP.wake();
        if(now-last>3000 && T.rewires<5){
          T.rewires++;
          try{ wire(LP.SND.ctx||T.ctx); }catch(e){}
        }
      }
    },
    /* silent for this long: the microphone is not reaching us at all */
    deadMs:function(){
      if(T.live && !T.stream && T.lostAt) return Date.now()-T.lostAt;   /* a playback send whose reopen failed */
      return T.stream && T.ctx ? Date.now()-(T.cbAt||T.wiredAt) : 0;
    },
    diag:function(){
      var c=T.ctx;
      return {mic:!!T.stream, ctx:c?c.state:"none", sr:c?c.sampleRate:0, bps:T.cbAt && Date.now()-T.cbAt<1500 ? Math.round(T.cbRate) : 0,
        rms:T.rms, err:T.err, rewires:T.rewires, quietTx:T.quietTx, txMode:T.txMode};
    },
    send:function(bytes, rate, done){
      var ctx=T.ctx;
      if(!ctx || !T.stream){ setTimeout(function(){ if(done) done(); },0); return; }
      /* a context that is not running plays nothing: ask it, and count the burst for the diagnostic line */
      if(ctx.state!=="running"){ LP.wake(); T.quietTx++; }
      if(T.txMode==="playback"){ sendPlayback(bytes, rate, done); return; }
      var samples=AC.synth(bytes,{sampleRate:ctx.sampleRate, symbolMs:rate, amp:TX_AMP});
      var buf=ctx.createBuffer(1,samples.length,ctx.sampleRate);
      if(buf.copyToChannel) buf.copyToChannel(samples,0); else buf.getChannelData(0).set(samples);
      var src=ctx.createBufferSource();
      src.buffer=buf;
      /* straight to the speaker, not through LP's volume: a fixed level, like a real modem */
      src.connect(ctx.destination);
      var sr=ctx.sampleRate, T0=ctx.currentTime+0.05, dur=samples.length/sr, lag=lagS(ctx);
      var from=T.n+(T0-0.05-ctx.currentTime)*sr;
      var to=T.n+(T0+dur+0.25+lag-ctx.currentTime)*sr;
      if(T.rx) T.rx.mute(from,to);
      T.txUntil=Date.now()+(T0-ctx.currentTime+dur+0.25+lag)*1000;
      T.sentRecent.push({k:keyOf(bytes), at:Date.now()});
      var called=false, safety=0;
      function fin(){
        if(called) return;
        called=true;
        clearTimeout(safety);
        src.onended=null;
        try{ src.disconnect(); }catch(e){}
        if(done) done();
      }
      src.onended=fin;
      safety=setTimeout(fin,(dur+1)*1000);
      try{ src.start(T0); }catch(e){ fin(); }
    },
    stop:function(){
      var s=T.stream, live=T.live;
      T.initGen++; T.reopen++;
      T.stream=null; T.live=false; T.lostAt=0;
      dropNodes();
      T.rx=null; T.floor=null; T.pdb=null; T.txUntil=0; T.sentRecent=[];
      if(!live) return; /* nothing was live: leave the page's audio session alone */
      if(s) try{ s.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
      $("mic-mark").hidden=true;
      LP.setSession("ambient");
      LP.micRoute(false);
    },
    levels:function(){
      return T.pdb ? {pdb:T.pdb.slice(0), floor:T.floor} : null;
    },
    txUntil:function(){ return T.txUntil; },
    setTxMode:function(m){ T.txMode=m==="playback" ? "playback" : "record"; },
    txMode:function(){ return T.txMode; }
  };

  /* The "playback" send: close the microphone, play in "playback", then open it again (the old Radio did this for every
     frame). The default wherever navigator.audioSession exists (iOS): under "play-and-record" iOS plays through the
     earpiece, which the other phone cannot hear (first two-iPhone test, iOS 27). Radio's meter page can switch it off.
     Slower: the reopen takes a few hundred ms, and a reply that comes sooner is lost and sent again. */
  function sendPlayback(bytes, rate, done){
    var s=T.stream, my=++T.reopen, ctx;
    dropNodes();
    T.stream=null; T.rx=null; T.lostAt=0;   /* the burst itself is not a dead microphone */
    try{ s.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
    /* as the old Radio did: the session first, then whatever context core.js has now, woken */
    LP.setSession("playback");
    ctx=LP.audio()||T.ctx;
    LP.wake();
    if(ctx.state!=="running") T.quietTx++;
    var samples=AC.synth(bytes,{sampleRate:ctx.sampleRate, symbolMs:rate, amp:TX_AMP});
    var buf=ctx.createBuffer(1,samples.length,ctx.sampleRate);
    if(buf.copyToChannel) buf.copyToChannel(samples,0); else buf.getChannelData(0).set(samples);
    var src=ctx.createBufferSource(), dur=samples.length/ctx.sampleRate;
    src.buffer=buf;
    src.connect(ctx.destination);
    T.txUntil=Date.now()+(dur+0.3)*1000;
    T.sentRecent.push({k:keyOf(bytes), at:Date.now()});
    var called=false, safety=0;
    function fin(){
      if(called) return;
      called=true;
      clearTimeout(safety);
      src.onended=null;
      try{ src.disconnect(); }catch(e){}
      if(done) done();
      if(my!==T.reopen) return;
      T.lostAt=Date.now();
      LP.setSession("play-and-record");
      var p;
      try{
        p=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
      }catch(e){ p=Promise.reject(e); }
      Promise.resolve(p).then(function(stream){
        if(my!==T.reopen){ try{ stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){} return; }
        T.stream=stream; T.lostAt=0;
        try{ wire(LP.SND.ctx||ctx); }catch(e){ T.err="wire "+(e && e.name || ""); }
      },function(e){ T.err=(e && e.name) || "mic"; });
    }
    src.onended=fin;
    safety=setTimeout(fin,(dur+1)*1000);
    try{ src.start(); }catch(e){ fin(); }
  }
}

var TRANSPORT=FAKE ? fakeTransport() : acousticTransport();

/* ---------- the driver: tick, then do whatever the session asks ---------- */

function finishClose(reason){
  if(STATE==="closed") return;
  var wasPairing=STATE==="pairing";
  var mapped=reason==="local" ? LOCAL_REASON : reason;
  var seq=++GEN;
  STATE="closed";
  if(TIMER){ clearInterval(TIMER); TIMER=0; }
  SESSION=null;
  txOff();
  hideOverlay();
  hideMark();
  var ids=Object.keys(PENDING_SENDS), i;
  for(i=0;i<ids.length;i++){ try{ PENDING_SENDS[ids[i]]("closed"); }catch(e){} }
  PENDING_SENDS={};
  if(wasPairing){
    resolveOpen("cancelled");
    if(reason==="timeout") toast(tr("link.timeout"));
    else if(reason==="nomic") toast(tr("link.nomic"));
    else if(reason==="other-app") toast(tr("link.otherapp"));
  }
  if(!wasPairing && reason==="nomic") toast(tr("link.nomic"));
  INITIATOR=false;
  RATE=null;
  dlog("close "+mapped);
  var list=LISTENERS;
  LISTENERS=[];
  for(i=0;i<list.length;i++){
    try{ list[i]({type:"close", reason:mapped}); }catch(e){}
  }
  /* the BYE must leave the speaker/channel before the stream or tab channel goes away */
  var wait=Math.max(0, (TRANSPORT.txUntil?TRANSPORT.txUntil():0)-Date.now())+80;
  setTimeout(function(){ if(GEN===seq) TRANSPORT.stop(); },wait);
}

function handleAction(a){
  if(a.do==="tx"){
    dlog("tx "+frameName(a.bytes)+" @"+a.rate);
    txOn();
    TRANSPORT.send(a.bytes,a.rate,function(){
      txOff();
      if(SESSION) SESSION.sent(Date.now());
    });
    return;
  }
  if(a.do==="status"){
    if(!OVERLAY) return;
    if(a.phase==="hello") $("link-phase").textContent=tr("link.hello",{ms:a.rate});
    else if(a.phase==="reply") $("link-phase").textContent=tr("link.reply",{ms:a.rate});
    else $("link-phase").textContent=tr("link.listen");
    $("link-attempt").textContent=a.attempt ? tr("link.attempt",{n:a.attempt}) : "";
    return;
  }
  if(a.do==="rate"){
    RATE=a.rate;
    dlog("rate "+a.rate);
    return;
  }
  if(a.do==="open"){
    STATE="open";
    INITIATOR=!!a.initiator;
    RATE=a.rate;
    hideOverlay();
    showMark();
    dlog("open "+(INITIATOR?"initiator":"responder")+" @"+a.rate);
    resolveOpen("open");
    return;
  }
  if(a.do==="message"){
    emit({type:"message", data:a.data});
    return;
  }
  if(a.do==="result"){
    var f=PENDING_SENDS[a.id];
    if(f){ delete PENDING_SENDS[a.id]; try{ f(a.v); }catch(e){} }
    return;
  }
  if(a.do==="close") finishClose(a.reason);
}

/* One pump at a time: a listener may call close() from inside a message event. */
function pump(){
  if(PUMPING){ PUMP_AGAIN=true; return; }
  PUMPING=true;
  do{
    PUMP_AGAIN=false;
    if(!SESSION) break;
    var acts=SESSION.poll(), i;
    for(i=0;i<acts.length && SESSION;i++) handleAction(acts[i]);
  }while(PUMP_AGAIN && SESSION);
  PUMPING=false;
}

function drive(){
  if(!SESSION) return;
  TRANSPORT.tick();
  /* 8 s without one block from the microphone: it is not coming back. Say so instead of beeping for a minute. */
  if(TRANSPORT.deadMs()>8000){ finishClose("nomic"); return; }
  SESSION.tick(Date.now());
  pump();
  updateBar();
}

function startDriver(){
  if(TIMER) return;
  TIMER=setInterval(drive,50);
  drive();
}

/* ---------- LP.link ---------- */

/* Nothing opened, so nothing closes: no close event reaches a listener that never got a link. */
function failOpen(v){
  var d=TRANSPORT.diag();
  if(d && d.err) toast(tr("link.micfail",{err:d.err}));
  if(STATE==="closed"){ resolveOpen(v); return; }
  var seq=++GEN;
  STATE="closed";
  if(TIMER){ clearInterval(TIMER); TIMER=0; }
  SESSION=null;
  txOff();
  hideOverlay();
  hideMark();
  resolveOpen(v);
  PENDING_SENDS={};
  INITIATOR=false;
  RATE=null;
  dlog("open "+v);
  setTimeout(function(){ if(GEN===seq) TRANSPORT.stop(); },0);
}

function open(o){
  o=o||{};
  if(STATE!=="closed") return Promise.resolve("busy");
  if(!TRANSPORT.ok()) return Promise.resolve("none");
  var session;
  try{
    session=SESS.create({port:(o.port||0)>>>0, proto:o.proto==null?"":String(o.proto), random:Math.random});
  }catch(e){
    return Promise.reject(e);
  }
  /* an old link may still be playing its BYE; the new one wins */
  if(TRANSPORT.active()) TRANSPORT.stop();
  var gen=++GEN;
  STATE="pairing";
  INITIATOR=false;
  RATE=null;
  LOCAL_REASON="home";
  LABEL=o.label==null?"":String(o.label);
  PAIR_START=Date.now();
  PENDING_SENDS={};
  SESSION=session;
  TRANSPORT.onHeard(function(bytes, rate){
    if(!SESSION) return;
    dlog("heard "+frameName(bytes));
    SESSION.heard(bytes, Date.now(), rate);
  });
  TRANSPORT.onBusy(function(now){ if(SESSION) SESSION.busy(now); });

  var p=new Promise(function(resolve){ PENDING_OPEN=resolve; });
  showOverlay();
  updateBar();
  TRANSPORT.init().then(function(ok){
    if(gen!==GEN || STATE==="closed") return;
    if(!ok){ failOpen("none"); return; }
    startDriver();
  },function(){
    if(gen!==GEN || STATE==="closed") return;
    failOpen("none");
  });
  return p;
}

function send(data){
  if(STATE!=="open" || !SESSION) return Promise.resolve("closed");
  var id;
  try{ id=SESSION.send(data); }
  catch(e){ return Promise.reject(e); }
  if(id==="closed" || id==="busy" || id==="big") return Promise.resolve(id);
  return new Promise(function(resolve){ PENDING_SENDS[id]=resolve; });
}

function close(reason){
  LOCAL_REASON=reason==null?"home":String(reason);
  if(!SESSION){ if(STATE!=="closed") finishClose("local"); return; }
  SESSION.close();
  pump();
}

function on(fn){
  if(typeof fn!=="function") return function(){};
  LISTENERS.push(fn);
  return function(){
    var i=LISTENERS.indexOf(fn);
    if(i>=0) LISTENERS.splice(i,1);
  };
}

function busy(){ return STATE==="pairing" || STATE==="open"; }

function levels(){ return TRANSPORT.levels(); }
/* one short line on the microphone and the audio context, for testing on phones (the pairing screen and Radio) */
function diag(){ return diagText(); }
/* "playback" (closed while sending; the default on iOS) or "record" (the microphone stays open); Radio's meter page */
function setTxMode(m){ if(TRANSPORT.setTxMode) TRANSPORT.setTxMode(m); }
function txMode(){ return TRANSPORT.txMode ? TRANSPORT.txMode() : "record"; }

/* the overlay's keys: B cancels, A does nothing; every key stops at the overlay */
LP.padRoute("link",function(b,down){
  if(!OVERLAY) return false;
  if(!down) return true;
  if(b==="b") close("home");
  return true;
});
document.addEventListener("keydown",function(e){
  if(!OVERLAY) return;
  /* Z is the keyboard's B, but core.js only routes it while the chin pad is shown; the
     pairing screen is the smallest, so it takes Z itself. Escape is not a pad key at all. */
  if(e.key==="Escape" || e.key==="z" || e.key==="Z"){ e.preventDefault(); close("home"); }
},true);
$("link-no").onclick=function(){ if(OVERLAY) close("home"); };
document.addEventListener("visibilitychange",function(){
  if(document.hidden && STATE!=="closed") close("home");
});

var api={open:open, send:send, close:close, on:on, busy:busy, levels:levels, setTxMode:setTxMode, txMode:txMode, diag:diag};
Object.defineProperty(api,"state",{get:function(){ return STATE; }});
Object.defineProperty(api,"initiator",{get:function(){ return INITIATOR; }});
Object.defineProperty(api,"rate",{get:function(){ return RATE; }});
LP.link=api;

LP.builtin({id:"link", lang:function(){ setOverlayText(); }});
})();
