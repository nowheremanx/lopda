/*
 * Lo-PDA built-in: 电波台 / Radio. The acoustic link (LP.link) with its guide, a 16x16 picture editor,
 * and the M2 meter: live four-tone bars and the old known-sequence test bench.
 * The modem itself is runtime/acoustic.js; the link session, frames and pairing are runtime/link.js
 * (session layer acoustic-session.js, frames acoustic-link.js). This file owns only the screen and the
 * meter's own microphone.
 *
 * The link log is a document: data/users/local/radio {log:[{dir,at,kind,text?,pic?,lost?}], txMode}
 * (the last 30 entries, the four-tone picture as 64 bytes). The backup includes it like any document.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr, AC=window.LopdaAcoustic, LK=window.LopdaAcousticLink;
var TONES=LP.TONES, own=LP.own, put=LP.put, toast=LP.toast, sfx=LP.sfx, micMark=$("mic-mark");
var RADIO_PATH="data/users/local/radio", MAX_LOG=30, PROTO="radio1";

var R={
  live:false, page:"menu", menu:0, guide:0, sel:0,
  ref:null, loaded:false, loading:false,
  log:[], txMode:"record", closeMsg:"", pending:false, pairClose:false,
  quiet:false, suppressAudio:false, armA:false,
  meter:{stream:null,src:null,proc:null,silent:null,sr:48000,token:0,pending:false,live:false,state:"",pdb:null,floor:null},
  test:{tx:null,rx:null,pending:false,timer:0,token:0,rate:10,pattern:"a5",state:"",stats:"",hex:"",last:null},
  draw:{px:null,cx:0,cy:0,tone:0}
};
var GUIDE=6;

function byId(id){ return document.getElementById(id); }
function pad2(n){ return LP.pad2(n); }
function nowHM(ts){ var d=new Date(ts); return pad2(d.getHours())+":"+pad2(d.getMinutes()); }
function secs(ms){ return (ms/1000).toFixed(1); }
function bar(id,part){ var el=byId(id); if(el) el.style.width=Math.round(Math.max(0,Math.min(1,part))*100)+"%"; }
function toneCss(t){ var c=TONES[t|0]||TONES[0]; return "rgb("+c[0]+","+c[1]+","+c[2]+")"; }
function countChars(s){ return Array.from(String(s||"")).length; }
function blankDraw(){ var a=new Uint8Array(256), i; for(i=0;i<256;i++) a[i]=3; return a; }
R.draw.px=blankDraw();

/* ---------- the radio document: last 30 messages and the meter's tx mode ---------- */
function readEntry(x){
  if(!x || (x.dir!=="in" && x.dir!=="out")) return null;
  var at=+x.at; if(!isFinite(at)) at=Date.now();
  var e={dir:x.dir, at:at, kind:x.kind};
  if(x.kind==="text"){
    if(typeof x.text!=="string" || x.text.length>200) return null;
    e.text=x.text;
  }else if(x.kind==="pic"){
    if(!x.pic || typeof x.pic.length!=="number" || x.pic.length!==64) return null;
    e.pic=[];
    for(var i=0;i<64;i++){ var v=+x.pic[i]; if(!isFinite(v)) return null; e.pic.push(v&255); }
  }else return null;
  if(x.lost) e.lost=true;
  return e;
}
function entryDoc(e){
  var o={dir:e.dir, at:e.at, kind:e.kind};
  if(e.kind==="text") o.text=e.text;
  else o.pic=e.pic.slice(0,64);
  if(e.lost) o.lost=true;
  return o;
}
function persistLog(){
  if(!R.ref && LP.S.db) R.ref=LP.S.db.doc(RADIO_PATH);
  if(!R.ref) return;
  var log=[], i;
  for(i=0;i<R.log.length;i++) if(!R.log[i].pending) log.push(entryDoc(R.log[i]));
  put(R.ref,{log:log.slice(-MAX_LOG),txMode:R.txMode});
}
function loadDoc(){
  if(R.loaded || R.loading) return;
  if(!LP.S.db) return;
  R.loading=true;
  R.ref=LP.S.db.doc(RADIO_PATH);
  R.ref.get().then(function(sn){
    var d=sn.exists ? own(sn.data()) : null;
    if(d){
      var list=[], i;
      if(d.log && d.log.length) for(i=0;i<d.log.length;i++){ var e=readEntry(d.log[i]); if(e) list.push(e); }
      if(list.length && !R.log.length) R.log=list.slice(-MAX_LOG);
      if(d.txMode==="playback" || d.txMode==="record") R.txMode=d.txMode;
    }
    R.loaded=true; R.loading=false;
    applyTxMode();
    render();
  },function(){ R.loaded=true; R.loading=false; });
}
function applyTxMode(){ if(LP.link && LP.link.setTxMode) LP.link.setTxMode(R.txMode); }
function saveTxMode(){ persistLog(); applyTxMode(); }

/* ---------- screens ---------- */
var PAGES={menu:"radio-page-menu",guide:"radio-page-guide",link:"radio-page-link",write:"radio-page-write",draw:"radio-page-draw",meter:"radio-page-meter"};
/* the link page's diagnostic line (microphone blocks, level, audio state) is refreshed once a second; nothing else */
var diagTimer=0;
function diagTick(){
  if(!R.live || R.page!=="link" || LP.link.state!=="open"){ clearInterval(diagTimer); diagTimer=0; return; }
  var rate=byId("radio-link-rate");
  if(rate) rate.textContent=tr("radio.link.rate",{ms:LP.link.rate==null?"?":LP.link.rate})+" · "+LP.link.diag();
}
function setPage(p){
  R.page=p;
  if(p==="link" && !diagTimer) diagTimer=setInterval(diagTick,1000);
  Object.keys(PAGES).forEach(function(k){ var el=byId(PAGES[k]); if(el) el.hidden=k!==p; });
  var view=byId("v-radio");
  if(view) view.classList.toggle("radio-draw-on", p==="draw");
  render();
}
function render(){
  if(!R.live) return;
  if(R.page==="menu") renderMenu();
  else if(R.page==="guide") renderGuide();
  else if(R.page==="link") renderLink();
  else if(R.page==="write") renderWrite();
  else if(R.page==="draw") renderDraw();
  else if(R.page==="meter") renderMeter();
  renderBar();
}
function renderBar(){
  var title=tr("radio.title"), state=tr("radio.state.ready");
  if(R.page==="guide"){ title=tr("radio.guide.title"); state=tr("radio.guide.page",{n:R.guide+1,all:GUIDE}); }
  else if(R.page==="link"){ title=tr("radio.menu.link"); state=""; }
  else if(R.page==="write"){ title=tr("radio.write.title"); state=tr("radio.write.count",{n:countChars(byId("radio-write-input").value)}); }
  else if(R.page==="draw"){ title=tr("radio.draw.title"); }
  else if(R.page==="meter"){ title=tr("radio.meter.title"); state=R.meter.live?tr("radio.meter.on"):(R.meter.pending?tr("radio.meter.request"):tr("radio.meter.off")); }
  else state=R.pending?tr("radio.link.connecting"):tr("radio.state.ready");
  byId("radio-title").textContent=title;
  byId("radio-state").textContent=state;
}

/* ---------- menu ---------- */
function renderMenu(){
  var rows=byId("radio-menu").children, i;
  for(i=0;i<rows.length;i++) rows[i].className=(i===R.menu?"on":"");
  byId("radio-menu-note").textContent=R.pending?tr("radio.link.connecting"):(R.closeMsg||tr("radio.menu.note"));
}
function menuPick(){
  var act=["link","guide","meter"][R.menu];
  sfx("tap");
  R.closeMsg="";
  if(act==="link") startConnect();
  else if(act==="guide"){ R.guide=0; setPage("guide"); }
  else { setPage("meter"); startMeter(); }
}
function backToMenu(){ R.closeMsg=""; setPage("menu"); }

/* ---------- guide ---------- */
function guidePage(){
  var key="radio.guide."+(R.guide+1);
  return tr(key);
}
function renderGuide(){
  var body=byId("radio-guide-body");
  body.textContent="";
  var p=document.createElement("p");
  p.className="radio-guide-text";
  p.textContent=guidePage();
  body.appendChild(p);
  /* the chirps and the four tones, just as a small strip of the LCD's four inks */
  if(R.guide===2 || R.guide===3){
    var strip=document.createElement("div"), i;
    strip.className="radio-tones";
    for(i=0;i<4;i++){ var s=document.createElement("i"); s.style.background=toneCss(i); strip.appendChild(s); }
    body.appendChild(strip);
  }
  byId("radio-guide-page").textContent=tr("radio.guide.page",{n:R.guide+1,all:GUIDE});
}
function guideGo(d){
  R.guide=(R.guide+d+GUIDE)%GUIDE;
  sfx("move");
  renderGuide();
  renderBar();
}

/* ---------- the link: LP.link, its log and the three buttons ---------- */
function startConnect(){
  if(R.pending) return;
  if(LP.link.busy()){ R.closeMsg=tr("radio.open.busy"); toast(R.closeMsg); sfx("err"); renderMenu(); return; }
  R.pending=true;
  R.pairClose=false;
  R.closeMsg="";
  applyTxMode();
  renderMenu();
  var port=LK && LK.port ? LK.port("radio") : 0;
  /* a pairing that times out or meets another program emits close before open resolves:
     catch it here so the reason is ours too. The pairing closes the whole list, so off() is harmless. */
  var preOff=LP.link.on(function(ev){
    if(ev && ev.type==="close" && R.pending){ R.pairClose=true; onLinkEvent(ev); }
  });
  LP.link.open({port:port, proto:PROTO, label:tr("app.radio")}).then(function(v){
    try{ preOff(); }catch(e){}
    R.pending=false;
    if(v==="open"){
      R.closeMsg="";
      R.sel=0;
      LP.link.on(onLinkEvent);           /* link.js empties its list on every close: register again each time */
      sfx("ok");
      setPage("link");
      return;
    }
    if(!R.pairClose){
      R.closeMsg=tr(v==="busy"?"radio.open.busy":v==="cancelled"?"radio.open.cancelled":"radio.open.none");
      if(v!=="cancelled") toast(R.closeMsg);
    }
    sfx("err");
    renderMenu();
  },function(){
    try{ preOff(); }catch(e){}
    R.pending=false;
    R.closeMsg=tr("radio.open.none");
    toast(R.closeMsg);
    sfx("err");
    renderMenu();
  });
}
function onLinkEvent(ev){
  if(!ev) return;
  if(ev.type==="message"){ onMessage(ev.data); return; }
  if(ev.type!=="close") return;
  var reason=ev.reason||"lost";
  R.closeMsg=tr(reason==="home" && R.pending ? "radio.open.cancelled" : "radio.close."+reason);
  if(!R.quiet) toast(R.closeMsg);
  if(R.page==="link" || R.page==="write" || R.page==="draw"){
    setPage("menu");
    if(!R.quiet) sfx("miss");
  }else if(R.page==="menu") renderMenu();
}
function onMessage(data){
  var e=null;
  if(typeof data==="string"){
    if(data.length>200) return;
    e={dir:"in", at:Date.now(), kind:"text", text:data};
  }else{
    var bytes=null, i;
    if(Object.prototype.toString.call(data)==="[object Uint8Array]" && data.length===64) bytes=data;
    if(!bytes) return;
    var pic=[];
    for(i=0;i<64;i++) pic.push(bytes[i]&255);
    e={dir:"in", at:Date.now(), kind:"pic", pic:pic};
  }
  R.log.push(e);
  while(R.log.length>MAX_LOG) R.log.shift();
  persistLog();
  if(R.page==="link") renderLink();
}
function queueSend(entry, payload){
  entry.dir="out";
  entry.at=Date.now();
  entry.pending=true;
  R.log.push(entry);
  while(R.log.length>MAX_LOG) R.log.shift();
  renderLink();
  LP.link.send(payload).then(function(v){
    entry.pending=false;
    if(v!=="sent") entry.lost=true;
    persistLog();
    if(R.page==="link") renderLink();
    if(v==="big") toast(tr("radio.send.big"));
    else if(v!=="sent") toast(tr("radio.send.failed"));
  },function(){
    entry.pending=false;
    entry.lost=true;
    persistLog();
    if(R.page==="link") renderLink();
  });
}
function renderLink(){
  var role=byId("radio-link-role"), rate=byId("radio-link-rate");
  if(LP.link.state==="open"){
    role.textContent=tr(LP.link.initiator?"radio.link.role.initiator":"radio.link.role.responder");
    rate.textContent=tr("radio.link.rate",{ms:LP.link.rate==null?"?":LP.link.rate})+" · "+LP.link.diag();
  }else{
    role.textContent=tr("radio.link.notopen");
    rate.textContent="";
  }
  var btns=byId("radio-link-actions").children, i;
  for(i=0;i<btns.length;i++) btns[i].className="btn ghost"+(i===R.sel?" on":"");
  renderLinkLog();
}
function renderLinkLog(){
  var box=byId("radio-link-log");
  box.textContent="";
  if(!R.log.length){
    var none=document.createElement("p");
    none.className="hint";
    none.textContent=tr("radio.link.log.empty");
    box.appendChild(none);
    return;
  }
  for(var i=0;i<R.log.length;i++){
    var e=R.log[i];
    var row=document.createElement("div");
    row.className="radio-entry"+(e.pending?" pending":"");
    var dir=document.createElement("span"); dir.className="dir";
    dir.textContent=tr(e.dir==="out"?"radio.dir.out":"radio.dir.in");
    var when=document.createElement("span"); when.className="when";
    when.textContent=nowHM(e.at);
    row.appendChild(dir); row.appendChild(when);
    if(e.kind==="pic"){
      var cv=document.createElement("canvas"); cv.width=32; cv.height=32;
      drawPic(cv,e.pic||[]);
      row.appendChild(cv);
    }else{
      var txt=document.createElement("span"); txt.className="txt";
      txt.textContent=e.text==null?"":e.text;
      row.appendChild(txt);
    }
    if(e.pending || e.lost){
      var flag=document.createElement("span"); flag.className="radio-flag";
      flag.textContent=tr(e.pending?"radio.link.sending":"radio.link.lost");
      row.appendChild(flag);
    }
    box.appendChild(row);
  }
  box.scrollTop=box.scrollHeight;
}
function drawPic(cv,bytes){
  var ctx=cv.getContext("2d"), img=ctx.createImageData(32,32), d=img.data, i, x, y, t, o, dx, dy;
  for(y=0;y<16;y++) for(x=0;x<16;x++){
    i=y*16+x; t=(bytes[i>>2]||0)>>(6-((i&3)<<1))&3;
    var c=TONES[t];
    for(dy=0;dy<2;dy++) for(dx=0;dx<2;dx++){
      o=((y*2+dy)*32+(x*2+dx))*4;
      d[o]=c[0]; d[o+1]=c[1]; d[o+2]=c[2]; d[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
}
function hangUp(){
  sfx("tap");
  R.quiet=false;
  R.closeMsg=tr("radio.close.bye");
  if(LP.link.state!=="closed") LP.link.close("bye");
  else setPage("menu");
}

/* ---------- write ---------- */
function openWrite(){
  if(LP.link.state!=="open"){ toast(tr("radio.link.notopen")); sfx("err"); return; }
  byId("radio-write-input").value="";
  setPage("write");
  updateWrite();
  setTimeout(function(){ if(R.page==="write") byId("radio-write-input").focus(); },40);
}
function updateWrite(){
  var n=countChars(byId("radio-write-input").value);
  byId("radio-write-count").textContent=tr("radio.write.count",{n:n});
  byId("radio-write-note").hidden=n>0;
  renderBar();
}
function renderWrite(){ updateWrite(); }
function sendText(){
  var text=LP.noEmoji(byId("radio-write-input").value);
  text=Array.from(text).slice(0,60).join("");
  if(!text){ toast(tr("radio.write.empty")); sfx("err"); return; }
  if(LP.link.state!=="open"){ toast(tr("radio.link.notopen")); sfx("err"); return; }
  byId("radio-write-input").value="";
  setPage("link");
  queueSend({kind:"text", text:text}, text);
  sfx("ok");
}
function cancelWrite(){ setPage("link"); sfx("miss"); }

/* ---------- draw: 16x16, two bits per pixel, four tones ---------- */
function renderDraw(){
  var cv=byId("radio-draw-cv"), ctx=cv.getContext("2d"), img=ctx.createImageData(256,256), d=img.data, i, x, y, t, o;
  for(y=0;y<256;y++) for(x=0;x<256;x++){
    i=(y>>4)*16+(x>>4);
    t=TONES[R.draw.px[i]&3];
    o=(y*256+x)*4;
    d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255;
  }
  ctx.putImageData(img,0,0);
  /* the grid and the cursor are tone 1 and ink: still four tones, and never part of the sent picture */
  ctx.fillStyle=toneCss(1);
  for(i=1;i<16;i++){ ctx.fillRect(i*16,0,1,256); ctx.fillRect(0,i*16,256,1); }
  var cx=R.draw.cx*16, cy=R.draw.cy*16;
  ctx.fillStyle=toneCss(0);
  ctx.fillRect(cx,cy,16,2); ctx.fillRect(cx,cy+14,16,2);
  ctx.fillRect(cx,cy,2,16); ctx.fillRect(cx+14,cy,2,16);
  byId("radio-draw-swatch").style.background=toneCss(R.draw.tone);
  byId("radio-draw-tone").textContent=tr("radio.draw.tone",{n:R.draw.tone+1});
  renderBar();
}
function openDraw(){
  if(LP.link.state!=="open"){ toast(tr("radio.link.notopen")); sfx("err"); return; }
  setPage("draw");
}
function paintCell(x,y){
  if(x<0||y<0||x>15||y>15) return;
  R.draw.cx=x; R.draw.cy=y;
  R.draw.px[y*16+x]=R.draw.tone;
  renderDraw();
}
function paintAt(e){
  var cv=byId("radio-draw-cv"), r=cv.getBoundingClientRect();
  var w=cv.clientWidth||r.width, h=cv.clientHeight||r.height;
  var x=Math.floor((e.clientX-r.left-(cv.clientLeft||0))*16/w);
  var y=Math.floor((e.clientY-r.top-(cv.clientTop||0))*16/h);
  paintCell(Math.max(0,Math.min(15,x)),Math.max(0,Math.min(15,y)));
}
function drawSend(){
  if(LP.link.state!=="open"){ toast(tr("radio.link.notopen")); sfx("err"); return; }
  var bytes=new Uint8Array(64), pic=[], i, px, sh;
  for(i=0;i<256;i++){
    px=R.draw.px[i]&3;
    sh=6-((i&3)<<1);
    bytes[i>>2]=bytes[i>>2]|(px<<sh);
  }
  for(i=0;i<64;i++) pic.push(bytes[i]);
  setPage("link");
  queueSend({kind:"pic", pic:pic}, bytes);
  sfx("ok");
}

/* ---------- meter: its own microphone, live four-tone bars and the noise floor ---------- */
function stopTracks(stream){
  if(!stream) return;
  try{ stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
}
function meterClip(){ return navigator.mediaDevices && navigator.mediaDevices.getUserMedia; }
function startMeter(){
  var M=R.meter;
  if(!R.live || R.page!=="meter" || M.stream || M.pending) return;
  if(LP.link.busy()){ M.state=tr("radio.open.busy"); paintBars(); return; }
  if(!meterClip()){ M.state=tr("radio.meter.nomic"); paintBars(); return; }
  var ctx=LP.audio();
  if(!ctx){ M.state=tr("radio.noaudio"); paintBars(); return; }
  LP.wake();
  LP.setSession("play-and-record");
  M.pending=true;
  var token=++M.token;
  M.state=tr("radio.meter.request");
  paintBars();
  var p;
  try{
    p=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
  }catch(e){ p=Promise.reject(e); }
  Promise.resolve(p).then(function(stream){
    if(token!==M.token || !R.live || R.page!=="meter"){ stopTracks(stream); return; }
    M.pending=false;
    var src,proc,silent;
    try{
      src=ctx.createMediaStreamSource(stream);
      proc=ctx.createScriptProcessor(4096,1,1);
      silent=ctx.createGain();
      silent.gain.value=0;
      src.connect(proc); proc.connect(silent); silent.connect(ctx.destination);
    }catch(e){
      stopTracks(stream);
      LP.setSession("ambient");
      M.state=tr("radio.meter.nomic");
      paintBars();
      return;
    }
    M.stream=stream; M.src=src; M.proc=proc; M.silent=silent; M.sr=ctx.sampleRate;
    M.live=true;
    proc.onaudioprocess=function(e){
      if(M.proc!==proc) return;
      var d=e.inputBuffer.getChannelData(0);
      var tw=AC.toneWindow(d,0,d.length,M.sr), i, lo=tw.pdb[0];
      for(i=1;i<4;i++) if(tw.pdb[i]<lo) lo=tw.pdb[i];
      M.pdb=tw.pdb.slice(0);
      if(M.floor==null) M.floor=lo;
      else M.floor=lo<M.floor ? lo : M.floor*0.9+lo*0.1;
      paintBars();
    };
    micMark.hidden=false;
    LP.micRoute(true);
    LP.keepAwake(true);
    M.state=tr("radio.meter.on");
    sfx("tap");
    paintBars();
  },function(){
    if(token!==M.token) return;
    M.pending=false;
    M.state=tr("radio.meter.nomic");
    LP.setSession("ambient");
    R.suppressAudio=true;
    try{ LP.micRoute(false); }catch(e){}
    R.suppressAudio=false;
    if(!LP.link.busy()) micMark.hidden=true;
    paintBars();
  });
}
function stopMeter(){
  var M=R.meter, live=M.live || !!M.stream || M.pending;
  M.token++;
  M.pending=false;
  M.live=false;
  M.state="";
  if(M.proc){ M.proc.onaudioprocess=null; try{ M.proc.disconnect(); }catch(e){} }
  if(M.src){ try{ M.src.disconnect(); }catch(e){} }
  if(M.silent){ try{ M.silent.disconnect(); }catch(e){} }
  stopTracks(M.stream);
  M.stream=null; M.src=null; M.proc=null; M.silent=null;
  M.pdb=null; M.floor=null;
  if(live){
    if(!LP.link.busy()) micMark.hidden=true;
    LP.setSession("ambient");
    R.suppressAudio=true;
    try{ LP.micRoute(false); }catch(e){}
    R.suppressAudio=false;
    LP.keepAwake(false);
  }
  if(R.live && R.page==="meter") paintBars();
}
function paintBars(){
  var M=R.meter, i, db, el, small;
  for(i=0;i<4;i++){
    el=byId("radio-bar-"+i); small=byId("radio-db-"+i);
    db=M.pdb?M.pdb[i]:null;
    if(el) el.style.width=(db==null||!isFinite(db))?"0%":Math.round(Math.max(0,Math.min(1,(db+90)/90))*100)+"%";
    if(small) small.textContent=(db==null||!isFinite(db))?"—":Math.round(db)+" dB";
  }
  var floor=byId("radio-floor");
  if(floor) floor.textContent=(M.floor==null||!isFinite(M.floor))?tr("radio.meter.floor.off"):tr("radio.meter.floor",{db:Math.round(M.floor)});
  var state=byId("radio-meter-state");
  if(state) state.textContent=M.live?tr("radio.meter.on"):(M.pending?tr("radio.meter.request"):(M.state||tr("radio.meter.off")));
  renderBar();
}

/* ---------- the old M2 known-sequence test, now under the meter ---------- */
function testBytes(){ return AC.testBytes(R.test.pattern); }
function totalSymbols(){ return AC.PREAMBLE.length + testBytes().length*4; }
function activeTest(){ return !!(R.test.tx || R.test.rx || R.test.pending); }
function renderMeter(){
  var T=R.test;
  byId("radio-txmode").checked=R.txMode==="playback";
  byId("radio-test-rate").value=String(T.rate);
  byId("radio-test-pattern").value=T.pattern;
  byId("radio-pattern-hex").textContent=tr("radio.hex.tx")+" "+AC.hex(testBytes());
  byId("radio-test-send").disabled=activeTest();
  byId("radio-test-recv").disabled=activeTest();
  byId("radio-test-stop").disabled=!(T.tx||T.rx||T.pending);
  byId("radio-test-stop").textContent=T.rx?tr("radio.meter.stopdecode"):tr("radio.meter.stop");
  byId("radio-test-state").textContent=T.state||tr("radio.meter.wait");
  byId("radio-test-stats").textContent=T.stats;
  byId("radio-test-hex").textContent=T.hex;
  byId("radio-lab-note").textContent=T.last?T.stats:tr("radio.meter.lab.empty");
  drawLab();
  paintBars();
  renderBar();
}
function restartMeterLater(){
  setTimeout(function(){ if(R.live && R.page==="meter" && !activeTest()) startMeter(); },300);
}
function startSendTest(){
  if(activeTest()) return;
  stopMeter();
  LP.setSession("playback");
  var ctx=LP.audio();
  if(!ctx){ toast(tr("radio.noaudio")); restartMeterLater(); return; }
  LP.wake();
  var data=testBytes(), samples;
  try{ samples=AC.synth(data,{sampleRate:ctx.sampleRate,symbolMs:R.test.rate,amp:0.9,leadMs:150,tailMs:150}); }
  catch(e){ LP.setSession("ambient"); R.test.state=tr("radio.meter.fail"); sfx("err"); renderMeter(); restartMeterLater(); return; }
  var buf;
  try{
    buf=ctx.createBuffer(1,samples.length,ctx.sampleRate);
    if(buf.copyToChannel) buf.copyToChannel(samples,0);
    else{ var ch=buf.getChannelData(0); for(var i=0;i<samples.length;i++) ch[i]=samples[i]; }
  }catch(e){ LP.setSession("ambient"); R.test.state=tr("radio.meter.fail"); sfx("err"); renderMeter(); restartMeterLater(); return; }
  var src=ctx.createBufferSource(); src.buffer=buf;
  var gain=ctx.createGain(); gain.gain.value=1;
  src.connect(gain); gain.connect(LP.SND.app || ctx.destination);
  var totalMs=samples.length/ctx.sampleRate*1000;
  var tx={src:src,gain:gain,totalMs:totalMs,start:Date.now()};
  R.test.tx=tx;
  R.test.state=tr("radio.meter.sending",{s:secs(0)});
  bar("radio-test-bar",0);
  LP.keepAwake(true);
  sfx("tap");
  src.onended=function(){ finishSendTest("end"); };
  try{ src.start(); }catch(e){ finishSendTest("error"); return; }
  R.test.timer=setInterval(function(){
    if(R.test.tx!==tx) return;
    var p=(Date.now()-tx.start)/tx.totalMs;
    bar("radio-test-bar",p);
    R.test.state=tr("radio.meter.sending",{s:secs(Date.now()-tx.start)});
    byId("radio-test-state").textContent=R.test.state;
  },100);
  renderMeter();
}
function finishSendTest(why){
  var tx=R.test.tx;
  if(!tx) return;
  clearInterval(R.test.timer); R.test.timer=0;
  R.test.tx=null;
  try{ if(tx.src){ tx.src.onended=null; tx.src.stop(); } }catch(e){}
  try{ if(tx.gain) tx.gain.disconnect(); }catch(e){}
  bar("radio-test-bar",1);
  if(why==="error"){ R.test.state=tr("radio.meter.fail"); sfx("err"); }
  else if(why==="stop"){ R.test.state=tr("radio.meter.stopped"); }
  else { R.test.state=tr("radio.meter.done",{n:testBytes().length}); sfx("ok"); }
  LP.setSession("ambient");
  LP.keepAwake(false);
  renderMeter();
  restartMeterLater();
}
function stopSendTest(){ finishSendTest("stop"); }
function concat(blocks){
  var n=0, i, out, at=0;
  for(i=0;i<blocks.length;i++) n+=blocks[i].length;
  out=new Float32Array(n);
  for(i=0;i<blocks.length;i++){ out.set(blocks[i],at); at+=blocks[i].length; }
  return out;
}
function startRecvTest(){
  if(activeTest()) return;
  stopMeter();
  if(!meterClip()){ R.test.state=tr("radio.meter.nomic"); sfx("err"); renderMeter(); restartMeterLater(); return; }
  var ctx=LP.audio();
  if(!ctx){ toast(tr("radio.noaudio")); restartMeterLater(); return; }
  LP.wake();
  LP.setSession("play-and-record");
  R.test.pending=true;
  var token=++R.test.token;
  R.test.state=tr("radio.meter.request");
  renderMeter();
  var p;
  try{
    p=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
  }catch(e){ p=Promise.reject(e); }
  Promise.resolve(p).then(function(stream){
    if(!R.test.pending || token!==R.test.token){ stopTracks(stream); return; }
    R.test.pending=false;
    var src,proc,silent;
    try{
      src=ctx.createMediaStreamSource(stream);
      proc=ctx.createScriptProcessor(4096,1,1);
      silent=ctx.createGain();
      silent.gain.value=0;
      src.connect(proc); proc.connect(silent); silent.connect(ctx.destination);
    }catch(e){
      stopTracks(stream);
      LP.setSession("ambient");
      R.suppressAudio=true;
      try{ LP.micRoute(false); }catch(x){}
      R.suppressAudio=false;
      LP.keepAwake(false);
      micMark.hidden=true;
      R.test.state=tr("radio.meter.nomic")+" · "+((e&&e.name)||"Error");
      sfx("err");
      renderMeter();
      restartMeterLater();
      return;
    }
    var capMs=Math.max(3000,totalSymbols()*R.test.rate+3000);
    var rx={stream:stream,src:src,proc:proc,silent:silent,ctx:ctx,sr:ctx.sampleRate,samples:[],len:0,start:Date.now(),capMs:capMs,capTimer:0,token:token};
    R.test.rx=rx;
    proc.onaudioprocess=function(e){
      if(R.test.rx!==rx) return;
      var d=e.inputBuffer.getChannelData(0), copy=new Float32Array(d.length);
      copy.set(d); rx.samples.push(copy); rx.len+=copy.length;
      while(rx.len>rx.sr*10){ var b=rx.samples.shift(); rx.len-=b.length; }
    };
    micMark.hidden=false;
    LP.micRoute(true);
    LP.keepAwake(true);
    sfx("tap");
    R.test.state=tr("radio.meter.listening",{s:secs(0)});
    rx.capTimer=setTimeout(function(){ stopRecvTest(true); },capMs);
    R.test.timer=setInterval(function(){
      if(R.test.rx!==rx) return;
      var s=Date.now()-R.test.rx.start;
      bar("radio-test-bar",s/R.test.rx.capMs);
      R.test.state=tr("radio.meter.listening",{s:secs(s)});
      byId("radio-test-state").textContent=R.test.state;
    },100);
    renderMeter();
  },function(err){
    if(token!==R.test.token) return;
    R.test.pending=false; R.test.rx=null;
    LP.setSession("ambient");
    R.suppressAudio=true;
    try{ LP.micRoute(false); }catch(e){}
    R.suppressAudio=false;
    micMark.hidden=true;
    R.test.state=tr("radio.meter.nomic")+" · "+((err&&err.name)||"Error");
    sfx("err");
    renderMeter();
    restartMeterLater();
  });
}
function stopRecvTest(decode){
  var rx=R.test.rx, wasPending=R.test.pending;
  R.test.token++;
  R.test.pending=false;
  if(!rx){
    if(wasPending){
      LP.setSession("ambient");
      R.suppressAudio=true;
      try{ LP.micRoute(false); }catch(e){}
      R.suppressAudio=false;
      if(!LP.link.busy()) micMark.hidden=true;
    }
    if(decode){ R.test.state=tr("radio.meter.nodata"); renderMeter(); }
    restartMeterLater();
    return;
  }
  R.test.rx=null;
  clearInterval(R.test.timer); R.test.timer=0;
  clearTimeout(rx.capTimer);
  if(rx.proc){ rx.proc.onaudioprocess=null; try{ rx.proc.disconnect(); }catch(e){} }
  if(rx.src){ try{ rx.src.disconnect(); }catch(e){} }
  if(rx.silent){ try{ rx.silent.disconnect(); }catch(e){} }
  stopTracks(rx.stream);
  micMark.hidden=true;
  LP.setSession("ambient");
  R.suppressAudio=true;
  try{ LP.micRoute(false); }catch(e){}
  R.suppressAudio=false;
  LP.keepAwake(false);
  bar("radio-test-bar",1);
  R.test.state=tr("radio.meter.stopped");
  if(decode) decodeSamples(concat(rx.samples),rx.sr);
  renderMeter();
  restartMeterLater();
}
function decodeSamples(samples,sr){
  if(!samples || !samples.length){ R.test.state=tr("radio.meter.nodata"); renderMeter(); return; }
  var data=testBytes();
  var res=AC.decode(samples,{sampleRate:sr,symbolMs:R.test.rate,expectedBytes:data,searchSeconds:8});
  R.test.last=res;
  if(res.sync && res.sync.ok){
    R.test.state=tr("radio.meter.sync",{score:res.sync.score,ms:Math.round(res.sync.offsetMs)});
    R.test.stats=tr("radio.meter.stats",{sym:res.symbolErrors,totalSym:res.totalSymbols,byte:res.byteErrors,totalByte:res.totalBytes,bps:Math.round(res.goodput)});
    R.test.hex=tr("radio.hex.rx")+" "+AC.hex(res.bytes)+"\n"+tr("radio.hex.exp")+" "+AC.hex(data);
    sfx(res.ok?"ok":"err");
  }else{
    R.test.state=tr("radio.meter.nosync")+" · "+tr("radio.meter.best",{score:res.sync?res.sync.score:0});
    R.test.stats=tr("radio.meter.stats",{sym:res.symbolErrors==null?"?":res.symbolErrors,totalSym:res.totalSymbols,byte:res.byteErrors==null?"?":res.byteErrors,totalByte:res.totalBytes,bps:Math.round(res.goodput)});
    R.test.hex="";
    sfx("err");
  }
}
function stopTest(){
  if(R.test.tx) finishSendTest("stop");
  if(R.test.rx || R.test.pending) stopRecvTest(false);
}
function drawLab(){
  var cv=byId("radio-lab-cv"); if(!cv) return;
  var c=cv.getContext("2d"), W=cv.width, H=cv.height;
  c.fillStyle=toneCss(3); c.fillRect(0,0,W,H);
  c.font="24px monospace"; c.fillStyle=toneCss(1);
  if(!R.test.last){ c.fillText(tr("radio.meter.lab.empty"),12,30); return; }
  var syms=R.test.last.symbols||[], exp=R.test.last.expected?AC.bytesToSymbols(R.test.last.expected):null;
  var bw=Math.max(6,Math.min(18,Math.floor((W-24)/Math.max(1,syms.length)))), i;
  c.fillText(tr("radio.meter.lab.symbols"),12,22);
  for(i=0;i<syms.length;i++){
    var x=12+i*bw, y=34, w=bw-2, h=40;
    if(syms[i]<0){ c.strokeStyle=toneCss(1); c.strokeRect(x,y,w,h); }
    else{ c.fillStyle=toneCss(syms[i]); c.fillRect(x,y,w,h); c.strokeStyle=toneCss(1); c.strokeRect(x,y,w,h); }
    if(exp && i<exp.length && syms[i]!==exp[i]){ c.strokeStyle=toneCss(0); c.lineWidth=3; c.strokeRect(x,y,w,h); c.lineWidth=1; }
  }
  c.fillStyle=toneCss(1);
  for(i=0;i<syms.length;i++){
    var v=Math.max(0,Math.min(1,((R.test.last.confidences[i]||0)+5)/40));
    c.fillRect(12+i*bw,H-18,Math.max(2,bw-2),Math.round(12*v));
  }
}
function closeMeter(){
  setPage("menu");
  stopTest();
  stopMeter();
}

/* ---------- keys: A confirms, B backs out, menu B does nothing ---------- */
function radioButton(b,down){
  if(byId("v-radio").hidden) return false;
  if(R.page==="menu"){
    if(down){
      R.armA=false;
      if(b==="up"||b==="down"){
        R.menu=(R.menu+(b==="down"?1:2))%3;
        sfx("move"); renderMenu();
      }else if(b==="a") R.armA=true;
    }else if(b==="a" && R.armA){ R.armA=false; menuPick(); }
    return true;
  }
  if(R.page==="guide"){
    if(!down){ if(b==="a") guideGo(1); return true; }
    if(b==="left") guideGo(-1);
    else if(b==="right") guideGo(1);
    else if(b==="b") backToMenu();
    return true;
  }
  if(R.page==="link"){
    if(!down) return true;
    if(b==="left"||b==="up"){ R.sel=(R.sel+2)%3; sfx("move"); renderLink(); }
    else if(b==="right"||b==="down"){ R.sel=(R.sel+1)%3; sfx("move"); renderLink(); }
    else if(b==="a"){ var i=R.sel; if(i===0) openWrite(); else if(i===1) openDraw(); else hangUp(); }
    else if(b==="b") hangUp();
    return true;
  }
  if(R.page==="write"){
    if(!down) return true;
    if(b==="a") sendText();
    else if(b==="b") cancelWrite();
    return true;
  }
  if(R.page==="draw"){
    if(!down) return true;
    if(b==="up"){ R.draw.cy=(R.draw.cy+15)%16; sfx("move"); renderDraw(); }
    else if(b==="down"){ R.draw.cy=(R.draw.cy+1)%16; sfx("move"); renderDraw(); }
    else if(b==="left"){ R.draw.cx=(R.draw.cx+15)%16; sfx("move"); renderDraw(); }
    else if(b==="right"){ R.draw.cx=(R.draw.cx+1)%16; sfx("move"); renderDraw(); }
    else if(b==="a"){ paintCell(R.draw.cx,R.draw.cy); sfx("tick"); }
    else if(b==="select"){ R.draw.tone=(R.draw.tone+1)&3; sfx("tap"); renderDraw(); }
    else if(b==="start") drawSend();
    else if(b==="b"){ setPage("link"); sfx("miss"); }
    return true;
  }
  if(R.page==="meter"){
    if(!down) return true;
    if(b==="b") closeMeter();
    return true;
  }
  return true;
}

/* ---------- events ---------- */
function bindEvents(){
  Array.prototype.forEach.call(byId("radio-menu").children,function(li,i){
    li.onclick=function(){ R.menu=i; renderMenu(); menuPick(); };
  });
  var body=byId("radio-guide-body");
  body.onclick=function(){ guideGo(1); };
  byId("radio-write").onclick=openWrite;
  byId("radio-draw").onclick=openDraw;
  byId("radio-hangup").onclick=hangUp;
  byId("radio-write-send").onclick=sendText;
  byId("radio-write-back").onclick=cancelWrite;
  byId("radio-write-input").addEventListener("input",updateWrite);
  byId("radio-write-input").addEventListener("keydown",function(e){
    if(e.key==="Enter"){ e.preventDefault(); sendText(); }
    else if(e.key==="Escape"){ e.preventDefault(); cancelWrite(); }
  });
  byId("radio-draw-send").onclick=drawSend;
  byId("radio-draw-back").onclick=function(){ setPage("link"); sfx("miss"); };
  var cv=byId("radio-draw-cv"), drag=false;
  cv.addEventListener("pointerdown",function(e){
    e.preventDefault(); drag=true;
    try{ cv.setPointerCapture(e.pointerId); }catch(x){}
    paintAt(e); sfx("tick");
  });
  cv.addEventListener("pointermove",function(e){ if(drag) paintAt(e); });
  ["pointerup","pointercancel","lostpointercapture"].forEach(function(t){
    cv.addEventListener(t,function(){ drag=false; });
  });
  byId("radio-txmode").onchange=function(){ R.txMode=this.checked?"playback":"record"; saveTxMode(); };
  byId("radio-test-rate").onchange=function(){ R.test.rate=parseInt(this.value,10)||40; R.test.last=null; R.test.stats=""; R.test.hex=""; R.test.state=""; renderMeter(); };
  byId("radio-test-pattern").onchange=function(){ R.test.pattern=this.value; R.test.last=null; R.test.stats=""; R.test.hex=""; R.test.state=""; renderMeter(); };
  byId("radio-test-send").onclick=startSendTest;
  byId("radio-test-recv").onclick=startRecvTest;
  byId("radio-test-stop").onclick=function(){ if(R.test.tx) stopSendTest(); else stopRecvTest(true); };
}

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

bindEvents();
if(window.LOPDA_DEBUG) window.LOPDA_DEBUG.radio=R;

LP.padRoute("radio",function(b,down){ if(byId("v-radio").hidden) return false; radioButton(b,down); return true; });

LP.builtin({id:"radio", label:"app.radio", icon:icon, view:"radio", keepPad:true,
  open:function(){
    R.live=true;
    R.page="menu";
    R.menu=0;
    R.armA=false;
    R.pending=false;
    R.quiet=false;
    R.closeMsg="";
    applyTxMode();
    loadDoc();
    renderMenu();
    renderBar();
    LP.show("radio");
    LP.showPad(true);
  },
  /* The runtime calls leave/pause/audio on every built-in, not only the one in front. Only the live Radio may
     let go of the link, the microphone or the wake lock, or it would clobber the reader's lock when the page hides. */
  leave:function(){
    if(!R.live) return;
    R.quiet=true;
    R.page="menu";
    if(LP.link.state!=="closed") LP.link.close("home");
    stopTest();
    stopMeter();
    R.pending=false;
    R.live=false;
    LP.setSession("ambient");
    if(!LP.link.busy()) micMark.hidden=true;
    LP.keepAwake(false);
    R.quiet=false;
  },
  pause:function(){
    if(!R.live) return;
    R.quiet=true;
    stopTest();
    stopMeter();
    if(LP.link.state!=="closed") LP.link.close("home");
    R.quiet=false;
  },
  resume:function(){
    if(R.live && R.page==="meter" && !R.meter.stream && !R.meter.pending && !activeTest()) startMeter();
  },
  lang:function(){ if(R.live) render(); },
  audio:function(){
    if(!R.live || R.suppressAudio) return;
    R.suppressAudio=true;
    R.quiet=true;
    if(LP.link.state!=="closed") LP.link.close("home");
    R.quiet=false;
    stopTest();
    stopMeter();
    R.suppressAudio=false;
    R.closeMsg=tr("radio.audio");
    if(R.page==="link" || R.page==="write" || R.page==="draw"){ setPage("menu"); }
    else render();
  },
  ready:function(){ loadDoc(); }
});
})();
