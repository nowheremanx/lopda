/*
 * Lo-PDA built-in: 电波台 / Radio. M2 tone test bench and M3 reliable acoustic link.
 * The modem itself is runtime/acoustic.js (pure functions, tested in tests/acoustic.test.mjs).
 * This file owns the microphone, the speaker and the screen. Frames, CRC, ACK and text are M3/M4.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr, AC=window.LopdaAcoustic, LINK=window.LopdaAcousticLink;
var TONES=LP.TONES, micMark=$("mic-mark");

var R={tab:"send", rate:10, pattern:"a5", live:false, auto:true, tx:null, rx:null, pending:false, link:null, linkToken:0, token:0,
  sendText:"", recvText:"", recvStats:"", recvHex:"", last:null, log:[], sendTimer:0, recvTimer:0, suppressAudio:false};

function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function now(){ return Date.now(); }
function bytes(){ return AC.testBytes(R.pattern); }
function totalSymbols(){ return AC.PREAMBLE.length + bytes().length*4; }
function active(){ return !!(R.tx || R.rx || R.pending || R.link); }
function secs(ms){ return (ms/1000).toFixed(1); }
function bar(id, part){ var el=$(id); if(el) el.style.width=Math.round(Math.max(0,Math.min(1,part))*100)+"%"; }

function log(msg){
  var d=new Date();
  R.log.push((d.getHours()<10?"0":"")+d.getHours()+":"+(d.getMinutes()<10?"0":"")+d.getMinutes()+":"+(d.getSeconds()<10?"0":"")+d.getSeconds()+"  "+msg);
  if(R.log.length>40) R.log.shift();
  renderLog();
}
function renderLog(){
  var el=$("radio-log"); if(!el) return;
  el.innerHTML=R.log.length ? R.log.map(function(s){ return '<div>'+esc(s)+'</div>'; }).join("") : '<div class="hint">'+esc(tr("radio.log.empty"))+'</div>';
  el.scrollTop=el.scrollHeight;
}

function render(){
  var i, tabs=["send","recv","lab"];
  for(i=0;i<tabs.length;i++){
    var b=$("radio-tab-"+tabs[i]);
    if(b){ if(tabs[i]===R.tab) b.classList.add("on"); else b.classList.remove("on"); }
    var pane=$("radio-pane-"+tabs[i]);
    if(pane) pane.hidden=tabs[i]!==R.tab;
  }
  $("radio-auto").checked=R.auto;
  $("radio-auto").disabled=active();
  $("radio-rate").disabled=active() || R.auto;
  $("radio-pattern").disabled=active();
  $("radio-rate").value=String(R.rate);
  $("radio-pattern").value=R.pattern;
  $("radio-pattern-hex").textContent=tr("radio.hex.tx")+" "+AC.hex(bytes());
  $("radio-send-go").disabled=active();
  $("radio-recv-go").disabled=active();
  $("radio-send-stop").disabled=!R.link;
  $("radio-send-go").textContent=R.auto?tr("radio.send.link"):tr("radio.send.go");
  $("radio-recv-go").textContent=R.auto?tr("radio.recv.link"):tr("radio.recv.go");
  $("radio-recv-stop").disabled=!(R.rx || R.link);
  $("radio-recv-stop").textContent=R.link?tr("radio.recv.cancel"):tr("radio.recv.stop");
  $("radio-send-state").textContent=R.sendText || (R.auto?tr("radio.send.linkready"):tr("radio.send.ready"));
  $("radio-recv-state").textContent=R.recvText || (R.auto?tr("radio.recv.linkwait"):tr("radio.recv.wait"));
  $("radio-recv-stats").textContent=R.recvStats || "";
  $("radio-recv-hex").textContent=R.recvHex || "";
  $("radio-state").textContent=R.link ? tr("radio.link.on") : (R.tx ? tr("radio.tx.on") : (R.rx ? tr("radio.rx.on") : (R.last ? tr("radio.last") : tr("radio.ready"))));
  $("radio-note").textContent=R.auto?tr("radio.note.link"):tr("radio.note");
  $("radio-lab-note").textContent=R.last ? R.recvStats : tr("radio.lab.note");
  drawLab();
}

function setTab(t){
  R.tab=t; render();
}

/* ---------- transmit ---------- */
function startSend(){
  if(active()) return;
  /* no microphone while sending: "playback" puts the sound on the speaker and does not ask for the
     receiver route that "play-and-record" can choose on some iPhones. */
  LP.setSession("playback");
  var ctx=LP.audio();
  if(!ctx){ LP.toast(tr("radio.noaudio")); return; }
  LP.wake();
  var data=bytes();
  var samples;
  try{ samples=AC.synth(data,{sampleRate:ctx.sampleRate,symbolMs:R.rate,amp:0.9,leadMs:150,tailMs:150}); }
  catch(e){ LP.toast(tr("radio.send.fail")); return; }
  var buf;
  try{
    buf=ctx.createBuffer(1,samples.length,ctx.sampleRate);
    if(buf.copyToChannel) buf.copyToChannel(samples,0);
    else{ var ch=buf.getChannelData(0); for(var i=0;i<samples.length;i++) ch[i]=samples[i]; }
  }catch(e){ LP.toast(tr("radio.send.fail")); return; }
  var src=ctx.createBufferSource(); src.buffer=buf;
  var gain=ctx.createGain(); gain.gain.value=1;
  src.connect(gain); gain.connect(LP.SND.app || ctx.destination);
  var totalMs=samples.length/ctx.sampleRate*1000;
  R.tx={src:src,gain:gain,totalMs:totalMs,start:now()};
  R.sendText=tr("radio.send.sending",{s:secs(0)});
  bar("radio-send-bar",0);
  LP.keepAwake(true);
  LP.sfx("tap");
  log(tr("radio.log.tx",{n:data.length,ms:R.rate,s:secs(totalMs)}));
  src.onended=function(){ finishSend("end"); };
  try{ src.start(); }catch(e){ finishSend("error"); return; }
  R.sendTimer=setInterval(function(){
    if(!R.tx) return;
    var p=(now()-R.tx.start)/R.tx.totalMs;
    bar("radio-send-bar",p);
    R.sendText=tr("radio.send.sending",{s:secs(now()-R.tx.start)});
    $("radio-send-state").textContent=R.sendText;
    $("radio-state").textContent=tr("radio.tx.on");
  },100);
  render();
}

function finishSend(why){
  if(!R.tx) return;
  clearInterval(R.sendTimer); R.sendTimer=0;
  var tx=R.tx; R.tx=null;
  try{ if(tx.src){ tx.src.onended=null; tx.src.stop(); } }catch(e){}
  try{ if(tx.gain) tx.gain.disconnect(); }catch(e){}
  bar("radio-send-bar",1);
  if(why==="error"){ R.sendText=tr("radio.send.fail"); log(tr("radio.send.fail")); LP.sfx("err"); }
  else if(why==="stop"){ R.sendText=tr("radio.send.stopped"); log(tr("radio.send.stopped")); }
  else{ R.sendText=tr("radio.send.done",{n:bytes().length}); log(tr("radio.send.done",{n:bytes().length})); LP.sfx("ok"); }
  LP.setSession("ambient");
  LP.keepAwake(!!R.rx);
  render();
}

function stopSend(){ finishSend("stop"); }

/* ---------- receive ---------- */
function concat(blocks){
  var n=0, i, out, at=0;
  for(i=0;i<blocks.length;i++) n+=blocks[i].length;
  out=new Float32Array(n);
  for(i=0;i<blocks.length;i++){ out.set(blocks[i],at); at+=blocks[i].length; }
  return out;
}

function startRecv(){
  if(active()) return;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    R.recvText=tr("radio.recv.nomic"); LP.sfx("err"); render(); return;
  }
  var ctx=LP.audio();
  if(!ctx){ LP.toast(tr("radio.noaudio")); return; }
  LP.wake();
  LP.setSession("play-and-record");
  R.pending=true; R.token++;
  var token=R.token;
  R.recvText=tr("radio.recv.request");
  render();
  var p;
  try{
    p=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
  }catch(e){ p=Promise.reject(e); }
  Promise.resolve(p).then(function(stream){
    if(!R.pending || token!==R.token){
      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
      return;
    }
    R.pending=false;
    var src, proc, silent;
    try{
      src=ctx.createMediaStreamSource(stream);
      proc=ctx.createScriptProcessor(4096,1,1);
      silent=ctx.createGain(); silent.gain.value=0;
      src.connect(proc); proc.connect(silent); silent.connect(ctx.destination);
    }catch(e){
      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(x){}
      LP.setSession("ambient");
      R.recvText=tr("radio.recv.nomic")+" · "+((e&&e.name)||"Error");
      log(R.recvText); LP.sfx("err"); render(); return;
    }
    var capMs=Math.max(3000, totalSymbols()*R.rate + 3000);
    var rx={stream:stream,src:src,proc:proc,silent:silent,ctx:ctx,sr:ctx.sampleRate,
      samples:[],len:0,start:now(),capMs:capMs,capTimer:0,token:token};
    R.rx=rx;
    proc.onaudioprocess=function(e){
      if(R.rx!==rx) return;
      var d=e.inputBuffer.getChannelData(0), copy=new Float32Array(d.length);
      copy.set(d); rx.samples.push(copy); rx.len+=copy.length;
      while(rx.len>rx.sr*10){ var b=rx.samples.shift(); rx.len-=b.length; }
    };
    micMark.hidden=false;
    LP.micRoute(true);
    LP.keepAwake(true);
    LP.sfx("tap");
    log(tr("radio.log.rx",{s:secs(capMs)}));
    R.recvText=tr("radio.recv.listening",{s:secs(0)});
    rx.capTimer=setTimeout(function(){ stopRecv(true); }, capMs);
    R.recvTimer=setInterval(function(){
      if(!R.rx) return;
      var s=now()-R.rx.start;
      bar("radio-recv-bar",s/R.rx.capMs);
      R.recvText=tr("radio.recv.listening",{s:secs(s)});
      $("radio-recv-state").textContent=R.recvText;
      $("radio-state").textContent=tr("radio.rx.on");
    },100);
    render();
  }, function(err){
    if(token!==R.token) return;
    R.pending=false; R.rx=null;
    LP.setSession("ambient");
    LP.micRoute(false);
    micMark.hidden=true;
    var name=(err&&err.name)||"Error";
    R.recvText=tr("radio.recv.nomic")+" · "+name;
    log(tr("radio.recv.nomic")+" · "+name);
    LP.toast(tr("radio.recv.nomic"));
    LP.sfx("err");
    render();
  });
}

function stopRecv(decode){
  var rx=R.rx;
  R.token++;
  R.pending=false;
  if(!rx){ if(decode){ R.recvText=tr("radio.recv.nodata"); render(); } return; }
  R.rx=null;
  clearInterval(R.recvTimer); R.recvTimer=0;
  clearTimeout(rx.capTimer);
  if(rx.proc){ rx.proc.onaudioprocess=null; try{ rx.proc.disconnect(); }catch(e){} }
  if(rx.src){ try{ rx.src.disconnect(); }catch(e){} }
  if(rx.silent){ try{ rx.silent.disconnect(); }catch(e){} }
  try{ rx.stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
  micMark.hidden=true;
  LP.setSession("ambient");
  LP.micRoute(false);
  LP.keepAwake(false);
  bar("radio-recv-bar",1);
  R.recvText=tr("radio.recv.stopped");
  log(tr("radio.recv.stopped"));
  if(decode) decodeSamples(concat(rx.samples), rx.sr);
  render();
}

function decodeSamples(samples, sr){
  if(!samples || !samples.length){ R.recvText=tr("radio.recv.nodata"); return; }
  var data=bytes();
  var res=AC.decode(samples,{sampleRate:sr,symbolMs:R.rate,expectedBytes:data,searchSeconds:8});
  R.last=res;
  if(res.sync && res.sync.ok){
    R.recvText=tr("radio.recv.sync",{score:res.sync.score,ms:Math.round(res.sync.offsetMs)});
    R.recvStats=tr("radio.recv.stats",{sym:res.symbolErrors,totalSym:res.totalSymbols,byte:res.byteErrors,totalByte:res.totalBytes,bps:Math.round(res.goodput)});
    R.recvHex=tr("radio.hex.rx")+" "+AC.hex(res.bytes)+"\n"+tr("radio.hex.exp")+" "+AC.hex(data);
    log((res.ok?tr("radio.recv.ok"):tr("radio.recv.fail"))+" · "+R.recvStats);
    LP.sfx(res.ok?"ok":"err");
  }else{
    R.recvText=tr("radio.recv.nosync")+" · "+tr("radio.recv.best",{score:res.sync?res.sync.score:0});
    R.recvStats=tr("radio.recv.stats",{sym:res.symbolErrors==null?"?":res.symbolErrors,totalSym:res.totalSymbols,byte:res.byteErrors==null?"?":res.byteErrors,totalByte:res.totalBytes,bps:Math.round(res.goodput)});
    R.recvHex="";
    log(tr("radio.recv.nosync")+" · "+R.recvStats);
    LP.sfx("err");
  }
  render();
}


/* ---------- M3: handshake, frames, CRC, ACK/retry ----------
   The handshake is one HELLO burst at 10 ms. The receiver scans 10/20/40 and answers at the rate it
   heard. HELLO and HELLO_ACK both have to arrive, so the chosen rate is known to work both ways.
   A fails to a slower rate on a missing HELLO_ACK. 5 ms stays a manual M2 choice. */
var LINK_RATES=[10,20,40], SCAN_MS=3200, HELLO_WAIT=7000, TURN_MS=1500;
function delay(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
function errText(e){ return e==="cancelled"?"cancelled":((e&&e.message)||String(e)); }
function stopTracks(s){ if(s) try{ s.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){} }
function newSession(){ var s=(((Date.now()&0xFFFF)^Math.floor(Math.random()*65536))&0xFFFF); return s||1; }
function linkAlive(t){ return !!(R.link && R.link.token===t && !R.link.cancel); }
function frameMs(bytes,rate){ return Math.round((16+bytes*4)*rate+240); }
/* The receiver opens its microphone after the previous burst and waits TURN_MS before the sender transmits;
   the capture window must cover that wait as well as the frame. */
function ackMs(rate){ return Math.round(frameMs(10,rate)+TURN_MS+600); }
function dataMs(rate){ return Math.round(frameMs(26,rate)+TURN_MS+600); }
/* The sender's wait covers the receiver's whole capture + turnaround + its ACK. */
function dataAckMs(rate){ return Math.round(dataMs(rate)+TURN_MS+frameMs(10,rate)+800); }
function finAckMs(rate){ return Math.round(ackMs(rate)+TURN_MS+frameMs(10,rate)+800); }

function linkDone(token, ok, why, receiver){
  if(!R.link || R.link.token!==token) return;
  var rate=R.link.rate, n=R.link.payload?R.link.payload.length:bytes().length;
  R.link=null;
  LP.setSession("ambient");
  micMark.hidden=true;
  LP.keepAwake(false);
  R.suppressAudio=true;
  try{ LP.micRoute(false); }catch(e){}
  R.suppressAudio=false;
  if(receiver){
    R.recvText=ok?tr("radio.link.received",{n:n,ms:rate}):tr("radio.link.fail",{why:why});
    if(ok) R.recvStats=tr("radio.link.crc",{n:n,ms:rate});
  }else{
    R.sendText=ok?tr("radio.link.sent",{n:n,ms:rate}):tr("radio.link.fail",{why:why});
  }
  log((ok?tr("radio.link.ok"):tr("radio.link.fail",{why:why}))+" · "+rate+" ms");
  LP.sfx(ok?"ok":"err");
  render();
}

function cancelLink(){
  if(!R.link) return;
  var wasRecv=R.link.role==="recv";
  var l=R.link;
  l.cancel=true;
  R.link=null;
  if(l.capTimer) clearTimeout(l.capTimer);
  if(l.pollTimer) clearInterval(l.pollTimer);
  try{ if(l.src){ l.src.onended=null; l.src.stop(); } }catch(e){}
  stopTracks(l.stream);
  micMark.hidden=true;
  LP.setSession("ambient");
  LP.keepAwake(false);
  R.suppressAudio=true;
  try{ LP.micRoute(false); }catch(e){}
  R.suppressAudio=false;
  if(wasRecv) R.recvText=tr("radio.link.cancelled"); else R.sendText=tr("radio.link.cancelled");
  log(tr("radio.link.cancelled"));
  render();
}

function playBurst(frame, rate, token){
  return new Promise(function(resolve,reject){
    if(!linkAlive(token)) return reject("cancelled");
    LP.setSession("playback");
    var ctx=LP.audio(); if(!ctx) return reject("noaudio");
    LP.wake();
    var samples=AC.synth(frame,{sampleRate:ctx.sampleRate,symbolMs:rate,amp:0.9,leadMs:120,tailMs:120});
    var buf;
    try{
      buf=ctx.createBuffer(1,samples.length,ctx.sampleRate);
      if(buf.copyToChannel) buf.copyToChannel(samples,0);
      else{ var ch=buf.getChannelData(0); for(var i=0;i<samples.length;i++) ch[i]=samples[i]; }
    }catch(e){ return reject(e); }
    var src=ctx.createBufferSource(); src.buffer=buf;
    var gain=ctx.createGain(); gain.gain.value=1;
    src.connect(gain); gain.connect(LP.SND.app || ctx.destination);
    R.link.src=src;
    src.onended=function(){
      if(R.link && R.link.token===token) R.link.src=null;
      try{ src.disconnect(); gain.disconnect(); }catch(e){}
      resolve();
    };
    try{ src.start(); }catch(e){ reject(e); }
  });
}

/* Capture for at most ms. `poll(samples, sampleRate)` may return a decoded frame; when it does,
   stop at once. That is what keeps the two ends from waiting out each other's windows. */
function captureWindow(ms, token, poll){
  return new Promise(function(resolve,reject){
    if(!linkAlive(token)) return reject("cancelled");
    var ctx=LP.audio(); if(!ctx) return reject("noaudio");
    LP.wake(); LP.setSession("play-and-record");
    var p;
    try{ p=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false}); }
    catch(e){ p=Promise.reject(e); }
    Promise.resolve(p).then(function(stream){
      if(!linkAlive(token)){ stopTracks(stream); return reject("cancelled"); }
      var src,proc,silent,done=false;
      try{
        src=ctx.createMediaStreamSource(stream);
        proc=ctx.createScriptProcessor(4096,1,1);
        silent=ctx.createGain(); silent.gain.value=0;
        src.connect(proc); proc.connect(silent); silent.connect(ctx.destination);
      }catch(e){ stopTracks(stream); return reject(e); }
      var blocks=[];
      function finish(early){
        if(done) return;
        done=true;
        if(R.link){ R.link.capTimer=0; R.link.pollTimer=0; R.link.stream=null; }
        clearTimeout(capTimer);
        clearInterval(pollTimer);
        proc.onaudioprocess=null;
        try{ proc.disconnect(); }catch(e){}
        try{ src.disconnect(); }catch(e){}
        try{ silent.disconnect(); }catch(e){}
        stopTracks(stream);
        micMark.hidden=true;
        LP.setSession("playback");
        var all=concat(blocks), peak=0, i;
        for(i=0;i<all.length;i++) if(Math.abs(all[i])>peak) peak=Math.abs(all[i]);
        if(R.link){ R.link.lastCapture={ms:ms, samples:all.length, peak:peak}; if(window.LOPDA_DEBUG) R.link.lastSamples=all; }
        resolve({samples:all, sampleRate:ctx.sampleRate, early:early||null});
      }
      proc.onaudioprocess=function(e){
        if(!done && R.link && R.link.token===token){ var d=e.inputBuffer.getChannelData(0); var c=new Float32Array(d.length); c.set(d); blocks.push(c); }
      };
      R.link.stream=stream;
      micMark.hidden=false;
      LP.micRoute(true);
      var capTimer=setTimeout(function(){
        if(!R.link || R.link.token!==token) return;
        finish(null);
      }, ms);
      var pollTimer=0;
      if(poll){
        pollTimer=setInterval(function(){
          if(done || !R.link || R.link.token!==token) return;
          var s=concat(blocks);
          var hit=null;
          try{ hit=poll(s,ctx.sampleRate); }catch(e){}
          if(hit) finish(hit);
        }, 120);
      }
      R.link.capTimer=capTimer;
      R.link.pollTimer=pollTimer;
    }, function(e){
      if(R.link && R.link.token===token) LP.setSession("ambient");
      reject(e);
    });
  });
}

function decodeFrameAt(samples, sr, rate){
  var head=AC.decode(samples,{sampleRate:sr,symbolMs:rate,symbolCount:LINK.HEADER*4});
  if(!head.sync || !head.sync.ok) return null;
  var h=LINK.header(head.bytes);
  if(!h) return null;
  var body=AC.decodePayload(samples,{sampleRate:sr,symbolMs:rate,startSample:head.sync.startSample,symbolCount:LINK.frameLength(h.length)*4});
  var p=LINK.parse(body.bytes);
  if(!p.ok) return {bad:p, header:h, rate:rate};
  return {frame:p.frame, header:h, rate:rate};
}

function scanHello(cap){
  for(var i=0;i<LINK_RATES.length;i++){
    var hit=decodeFrameAt(cap.samples,cap.sampleRate,LINK_RATES[i]);
    if(hit && hit.frame && hit.frame.type===LINK.TYPES.HELLO) return hit;
  }
  return null;
}

function sendReliable(frame, seq, rate, token, tries){
  function attempt(n){
    if(!linkAlive(token)) return Promise.reject("cancelled");
    if(n>tries) return Promise.reject("no ack");
    if(n>1) log(tr("radio.link.retry",{n:n-1}));
    var wait=seq===1?dataAckMs(rate):finAckMs(rate);
    return playBurst(frame,rate,token).then(function(){
      return captureWindow(wait,token,function(samples,sr){
        var h=decodeFrameAt(samples,sr,rate);
        return h && h.frame && h.frame.session===R.link.session && h.frame.seq===seq && h.frame.type===LINK.TYPES.ACK ? h : null;
      });
    }).then(function(cap){
      var hit=cap.early || decodeFrameAt(cap.samples,cap.sampleRate,rate);
      if(hit && hit.frame && hit.frame.session===R.link.session && hit.frame.seq===seq && hit.frame.type===LINK.TYPES.ACK) return true;
      throw new Error("no ack");
    }).then(null,function(e){ if(!linkAlive(token)) throw e; return attempt(n+1); });
  }
  return attempt(1);
}

function linkSend(){
  if(active()) return;
  var token=++R.linkToken;
  R.link={token:token, role:"send", session:newSession(), rate:10, src:null, stream:null, capTimer:0, pollTimer:0, cancel:false, payload:null};
  LP.keepAwake(true); render();
  function tryRate(i){
    if(!linkAlive(token)) return Promise.reject("cancelled");
    if(i>=LINK_RATES.length) return Promise.reject("no hello ack");
    var rate=LINK_RATES[i];
    R.link.rate=rate;
    R.sendText=tr("radio.link.hello",{ms:rate}); render();
    var hello=LINK.encode(LINK.TYPES.HELLO,R.link.session,0,[]);
    return playBurst(hello,rate,token).then(function(){
      return captureWindow(HELLO_WAIT,token,function(samples,sr){
        var h=decodeFrameAt(samples,sr,rate);
        return h && h.frame && h.frame.type===LINK.TYPES.HELLO_ACK && h.frame.session===R.link.session ? h : null;
      });
    }).then(function(cap){
      var hit=cap.early || decodeFrameAt(cap.samples,cap.sampleRate,rate);
      if(hit && hit.frame && hit.frame.type===LINK.TYPES.HELLO_ACK && hit.frame.session===R.link.session){
        return delay(TURN_MS).then(function(){ return rate; });
      }
      throw new Error("no hello ack");
    }).then(null,function(e){ if(!linkAlive(token)) throw e; log(tr("radio.link.hello.fail",{ms:rate})); return tryRate(i+1); });
  }
  tryRate(0).then(function(rate){
    R.link.rate=rate;
    R.sendText=tr("radio.link.ready",{ms:rate}); log(tr("radio.link.ready",{ms:rate})); render();
    var data=LINK.encode(LINK.TYPES.DATA,R.link.session,1,bytes());
    return sendReliable(data,1,rate,token,3).then(function(){
      return delay(TURN_MS).then(function(){
        var fin=LINK.encode(LINK.TYPES.FIN,R.link.session,2,[]);
        return sendReliable(fin,2,rate,token,2);
      });
    });
  }).then(function(){ linkDone(token,true,null,false); }, function(e){
    if(linkAlive(token)) linkDone(token,false,errText(e),false);
  });
}

function receiveFin(token, attempt){
  if(!linkAlive(token)) return Promise.reject("cancelled");
  var rate=R.link.rate, session=R.link.session;
  return captureWindow(ackMs(rate),token,function(samples,sr){
    var hello=scanHello({samples:samples,sampleRate:sr});
    if(hello) return {hello:hello};
    var h=decodeFrameAt(samples,sr,rate);
    if(h && h.frame && h.frame.session===session && (h.frame.type===LINK.TYPES.FIN || h.frame.type===LINK.TYPES.DATA)) return {frame:h};
    return null;
  }).then(function(cap){
    var early=cap.early;
    var hello=early&&early.hello?early.hello:scanHello(cap);
    if(hello){
      R.link.rate=hello.rate; R.link.session=hello.frame.session;
      R.recvText=tr("radio.link.found",{ms:hello.rate}); log(tr("radio.link.found",{ms:hello.rate})); render();
      return playBurst(LINK.encode(LINK.TYPES.HELLO_ACK,hello.frame.session,0,[]),hello.rate,token).then(function(){
        return receiveData(token,1);
      });
    }
    var hit=early&&early.frame?early.frame:decodeFrameAt(cap.samples,cap.sampleRate,rate);
    /* A lost our DATA ACK and retried DATA while we waited for FIN: ACK it again, do not append it twice. */
    if(hit && hit.frame && hit.frame.type===LINK.TYPES.DATA && hit.frame.session===session){
      return delay(TURN_MS).then(function(){
        return playBurst(LINK.encode(LINK.TYPES.ACK,session,hit.frame.seq,[]),rate,token);
      }).then(function(){
        return receiveFin(token,attempt);
      });
    }
    if(hit && hit.frame && hit.frame.type===LINK.TYPES.FIN && hit.frame.session===session){
      return delay(TURN_MS).then(function(){
        return playBurst(LINK.encode(LINK.TYPES.ACK,session,hit.frame.seq,[]),rate,token);
      }).then(function(){
        linkDone(token,true,null,true);
      });
    }
    if(attempt>=2) throw new Error("no fin");
    return playBurst(LINK.encode(LINK.TYPES.NACK,session,2,[]),rate,token).then(function(){ return receiveFin(token,attempt+1); });
  });
}

function receiveData(token, attempt){
  if(!linkAlive(token)) return Promise.reject("cancelled");
  var rate=R.link.rate, session=R.link.session;
  R.recvText=tr("radio.link.data",{ms:rate}); render();
  return captureWindow(dataMs(rate),token,function(samples,sr){
    var hello=scanHello({samples:samples,sampleRate:sr});
    if(hello) return {hello:hello};
    var h=decodeFrameAt(samples,sr,rate);
    if(h && h.frame && h.frame.type===LINK.TYPES.DATA && h.frame.session===R.link.session) return {data:h};
    return null;
  }).then(function(cap){
    /* The sender lost our HELLO_ACK and is retrying the handshake at another rate: catch it here too. */
    var early=cap.early;
    var hello=early&&early.hello?early.hello:scanHello(cap);
    if(hello){
      R.link.rate=hello.rate; R.link.session=hello.frame.session;
      R.recvText=tr("radio.link.found",{ms:hello.rate}); log(tr("radio.link.found",{ms:hello.rate})); render();
      return playBurst(LINK.encode(LINK.TYPES.HELLO_ACK,hello.frame.session,0,[]),hello.rate,token).then(function(){
        return receiveData(token,1);
      });
    }
    var hit=early&&early.data?early.data:decodeFrameAt(cap.samples,cap.sampleRate,rate);
    if(hit && hit.frame && hit.frame.type===LINK.TYPES.DATA && hit.frame.session===session){
      R.link.payload=hit.frame.payload;
      R.recvHex=AC.hex(hit.frame.payload);
      R.recvStats=tr("radio.link.crc",{n:hit.frame.payload.length,ms:rate});
      log(tr("radio.link.crc",{n:hit.frame.payload.length,ms:rate})); render();
      return delay(TURN_MS).then(function(){
        return playBurst(LINK.encode(LINK.TYPES.ACK,session,hit.frame.seq,[]),rate,token);
      }).then(function(){
        return receiveFin(token,1);
      });
    }
    if(attempt>=3) throw new Error("no data");
    var seq=hit&&hit.frame?hit.frame.seq:1;
    log(tr("radio.link.nack",{n:attempt}));
    return playBurst(LINK.encode(LINK.TYPES.NACK,session,seq,[]),rate,token).then(function(){ return receiveData(token,attempt+1); });
  });
}

function linkRecv(){
  if(active()) return;
  var token=++R.linkToken;
  R.link={token:token, role:"recv", session:0, rate:10, src:null, stream:null, capTimer:0, pollTimer:0, cancel:false, payload:null};
  LP.keepAwake(true); R.recvText=tr("radio.link.wait"); render();
  function scan(){
    if(!linkAlive(token)) return;
    R.recvText=tr("radio.link.wait"); render();
    captureWindow(SCAN_MS,token,function(samples,sr){
      return scanHello({samples:samples,sampleRate:sr});
    }).then(function(cap){
      if(!linkAlive(token)) return;
      var hit=cap.early || scanHello(cap);
      if(!hit){ return delay(50).then(scan); }
      R.link.session=hit.frame.session;
      R.link.rate=hit.rate;
      R.recvText=tr("radio.link.found",{ms:hit.rate}); log(tr("radio.link.found",{ms:hit.rate})); render();
      return delay(TURN_MS).then(function(){
        return playBurst(LINK.encode(LINK.TYPES.HELLO_ACK,hit.frame.session,0,[]),hit.rate,token);
      }).then(function(){
        return receiveData(token,1);
      });
    }).then(null,function(e){ if(linkAlive(token)) linkDone(token,false,errText(e),true); });
  }
  scan();
}

function stopAll(){
  if(R.link) cancelLink();
  stopSend();
  if(R.rx || R.pending) stopRecv(false);
  if(!R.rx){ LP.setSession("ambient"); micMark.hidden=true; LP.keepAwake(false); }
}

/* ---------- lab ---------- */
function drawLab(){
  var cv=$("radio-lab-cv"); if(!cv) return;
  var c=cv.getContext("2d"), W=cv.width, H=cv.height;
  c.fillStyle="#a3ad7e"; c.fillRect(0,0,W,H);
  c.font="24px monospace"; c.fillStyle="#4a5a32";
  if(!R.last){ c.fillText(tr("radio.lab.empty"),12,30); return; }
  var syms=R.last.symbols||[], exp=R.last.expected?AC.bytesToSymbols(R.last.expected):null;
  var bw=Math.max(6,Math.min(18,Math.floor((W-24)/Math.max(1,syms.length))));
  c.fillText(tr("radio.lab.symbols"),12,22);
  for(var i=0;i<syms.length;i++){
    var x=12+i*bw, y=34, w=bw-2, h=40;
    if(syms[i]<0){ c.strokeStyle="#4a5a32"; c.strokeRect(x,y,w,h); }
    else{ c.fillStyle="rgb("+TONES[syms[i]][0]+","+TONES[syms[i]][1]+","+TONES[syms[i]][2]+")"; c.fillRect(x,y,w,h); c.strokeStyle="#4a5a32"; c.strokeRect(x,y,w,h); }
    if(exp && i<exp.length && syms[i]!==exp[i]){ c.strokeStyle="#1f2a14"; c.lineWidth=3; c.strokeRect(x,y,w,h); c.lineWidth=1; }
  }
  c.fillStyle="#4a5a32";
  for(i=0;i<syms.length;i++){
    var v=Math.max(0,Math.min(1,((R.last.confidences[i]||0)+5)/40));
    c.fillRect(12+i*bw,H-18,Math.max(2,bw-2),Math.round(12*v));
  }
}

/* ---------- events ---------- */
$("radio-tab-send").onclick=function(){ setTab("send"); };
$("radio-tab-recv").onclick=function(){ setTab("recv"); };
$("radio-tab-lab").onclick=function(){ setTab("lab"); };
$("radio-send-go").onclick=function(){ if(R.auto) linkSend(); else startSend(); };
$("radio-recv-go").onclick=function(){ if(R.auto) linkRecv(); else startRecv(); };
$("radio-send-stop").onclick=cancelLink;
$("radio-recv-stop").onclick=function(){ if(R.link) cancelLink(); else stopRecv(true); };
$("radio-auto").onchange=function(){
  R.auto=this.checked;
  R.sendText=""; R.recvText=""; R.recvStats=""; R.recvHex="";
  render();
};
$("radio-rate").onchange=function(){ R.rate=parseInt(this.value,10)||40; R.sendText=""; R.recvText=""; R.recvStats=""; R.recvHex=""; render(); };
$("radio-pattern").onchange=function(){ R.pattern=this.value; R.sendText=""; R.recvText=""; R.recvStats=""; R.recvHex=""; render(); };

/* ---------- register ---------- */
function icon(){
  return [
    "................",
    "....00000000....",
    "...0111111110...",
    "...0100000010...",
    "...0103333010...",
    "...0103333010...",
    "...0100000010...",
    "...0111111110...",
    "....00000000....",
    ".....0....0.....",
    ".....0....0.....",
    "....000..000....",
    "...0110..000....",
    "...0000.........",
    "................",
    "................"
  ];
}

if(window.LOPDA_DEBUG) window.LOPDA_DEBUG.radio=R;
LP.builtin({id:"radio", label:"app.radio", icon:icon, view:"radio",
  open:function(){ R.live=true; R.tab="send"; render(); renderLog(); LP.show("radio"); },
  /* The runtime calls leave/pause/audio on every built-in, not only the one in front. Only the live Radio may
     let go of the wake lock or the microphone, or it would clobber the reader's lock when the page hides. */
  leave:function(){ if(R.live){ R.live=false; stopAll(); } },
  pause:function(){ if(R.live){ stopAll(); R.recvText=tr("radio.recv.stopped"); render(); } },
  lang:function(){ if(R.live){ render(); renderLog(); } },
  audio:function(){ if(R.live && !R.suppressAudio){ stopAll(); R.sendText=""; R.recvText=tr("radio.audio"); render(); } }});
})();
