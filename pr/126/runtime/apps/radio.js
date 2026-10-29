/*
 * Lo-PDA built-in: 电波台 / Radio. M2 test bench for the acoustic link.
 * The modem itself is runtime/acoustic.js (pure functions, tested in tests/acoustic.test.mjs).
 * This file owns the microphone, the speaker and the screen. Frames, CRC, ACK and text are M3/M4.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr, AC=window.LopdaAcoustic;
var TONES=LP.TONES, micMark=$("mic-mark");

var R={tab:"send", rate:40, pattern:"a5", tx:null, rx:null, pending:false, token:0,
  sendText:"", recvText:"", recvStats:"", recvHex:"", last:null, log:[], sendTimer:0, recvTimer:0};

function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function now(){ return Date.now(); }
function bytes(){ return AC.testBytes(R.pattern); }
function totalSymbols(){ return AC.PREAMBLE.length + bytes().length*4; }
function active(){ return !!(R.tx || R.rx || R.pending); }
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
  $("radio-rate").disabled=active();
  $("radio-pattern").disabled=active();
  $("radio-pattern-hex").textContent=tr("radio.hex.tx")+" "+AC.hex(bytes());
  $("radio-send-go").disabled=active();
  $("radio-recv-go").disabled=active();
  $("radio-recv-stop").disabled=!R.rx;
  $("radio-send-state").textContent=R.sendText || tr("radio.send.ready");
  $("radio-recv-state").textContent=R.recvText || tr("radio.recv.wait");
  $("radio-recv-stats").textContent=R.recvStats || "";
  $("radio-recv-hex").textContent=R.recvHex || "";
  $("radio-state").textContent=R.tx ? tr("radio.tx.on") : (R.rx ? tr("radio.rx.on") : (R.last ? tr("radio.last") : ""));
  $("radio-note").textContent=tr("radio.note");
  $("radio-lab-note").textContent=R.last ? R.recvStats : tr("radio.lab.note");
  drawLab();
}

function setTab(t){
  R.tab=t; render();
}

/* ---------- transmit ---------- */
function startSend(){
  if(active()) return;
  var ctx=LP.audio();
  if(!ctx){ LP.toast(tr("radio.noaudio")); return; }
  LP.wake();
  var data=bytes();
  var samples;
  try{ samples=AC.synth(data,{sampleRate:ctx.sampleRate,symbolMs:R.rate,amp:0.55,leadMs:150,tailMs:150}); }
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

function stopAll(){
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
$("radio-send-go").onclick=startSend;
$("radio-recv-go").onclick=startRecv;
$("radio-recv-stop").onclick=function(){ stopRecv(true); };
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

LP.builtin({id:"radio", label:"app.radio", icon:icon, view:"radio",
  open:function(){ R.tab="send"; render(); renderLog(); LP.show("radio"); },
  leave:function(){ stopAll(); },
  pause:function(){ stopAll(); R.recvText=tr("radio.recv.stopped"); render(); },
  lang:function(){ render(); renderLog(); },
  audio:function(){ stopAll(); R.sendText=""; R.recvText=tr("radio.audio"); render(); }});
})();
