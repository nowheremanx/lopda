/*
 * Lo-PDA runtime: the core. Utilities, storage helpers, clock, views, sound (music: chip.js), language, updates,
 * icons, the home screen and the chin pad. Built-in programs live in apps/*.js and talk to the
 * rest only through window.LP; boot.js starts the handheld once everything is loaded.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
/* runtime/strings.js: every word on screen, in zh and en */
var I18N = window.LopdaStrings, tr = I18N.t;

var S = {
  db:null, refs:{}, downloads:null,
  apps:[], notes:[],
  homeTipDismissed:null,
  kv:{},                  // appId -> {key:value}
  running:null, editing:null,
  registry:null           // last fetched registry/index.json
};

/* The shared object. Built-ins register with LP.builtin({...}); hooks are optional:
     id, label (string key), icon (key in ICONS, or a function returning 16 such rows), open(), tag() -> text under the icon,
     view, enter(), leave(), keepPad   the view it owns: called by show()
     lang()                            redraw after the language changes
     padLayout()                       the chin pad appeared or went away
     ready(), nostore(), pause(), resume()   storage opened / failed, page hidden / shown (boot.js)
     audio()                           the AudioContext was replaced (the phone had stopped it): reconnect into LP.SND.app */
var LP = window.LP = {$:$, S:S, I18N:I18N, tr:tr, builtins:[]};
LP.builtin = function(b){ LP.builtins.push(b); return b; };
LP.each = function(hook){ var args=Array.prototype.slice.call(arguments,1); LP.builtins.forEach(function(b){ if(b[hook]) b[hook].apply(b,args); }); };
LP.softkeys = function(container,keys){
  var names=["select","start","b","a"], labels=["SELECT","START","B","A"];
  container.textContent="";
  container.classList.add("softkeys");
  container.onpointerdown=function(e){
    var target=document.elementFromPoint(e.clientX,e.clientY);
    var disabled=target && target.closest && target.closest(".sk:disabled");
    if(disabled && container.contains(disabled)) sfx("err");
  };
  names.forEach(function(name,i){
    var value=keys[name], empty=!value, disabled=empty || !!value.disabled || typeof value.fn!=="function";
    var button=document.createElement("button"), key=document.createElement("i"), label=document.createElement("span");
    button.className="sk sk-"+name; button.type="button"; button.disabled=disabled;
    key.textContent=labels[i]; label.textContent=empty ? "" : value.label;
    button.appendChild(key); button.appendChild(label);
    if(!disabled) button.onclick=value.fn;
    container.appendChild(button);
  });
};

/* ---------- small utils ---------- */
var EMOJI=/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
function noEmoji(v){ return String(v==null?"":v).replace(EMOJI,"").trim(); }
function glyphOf(a){ return noEmoji(a.glyph) || Array.from(noEmoji(a.name))[0] || "?"; }
/* store snapshots may hand back shared objects: always work on a private copy */
function own(snapData){ return snapData ? JSON.parse(JSON.stringify(snapData)) : null; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
var toastTimer;
function toast(msg){ var t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.hidden=true; },2600); }
var chains={};
/* one write at a time per document; resolves true when it landed */
function put(ref,data){
  var k=ref.path;
  chains[k]=(chains[k]||Promise.resolve()).then(function(){ return ref.set(data); }).then(function(){ return true; },function(e){ toast(tr("common.savefail",{code:(e&&e.code)||tr("common.unknown")})); return false; });
  return chains[k];
}
function fmt(ts){ var d=new Date(ts||0); return (d.getMonth()+1)+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function pad2(n){ return String(n).padStart(2,"0"); }
/* the four LCD tones, and the 4x4 Bayer matrix every import and photo is dithered with (runtime/finder.js) */
var TONES=[[31,42,20],[74,90,50],[125,138,88],[163,173,126]];
var BAYER=window.LopdaFinder.BAYER;
function saveCanvas(cv,name){
  return new Promise(function(resolve,reject){
    if(!S.downloads){ reject({code:"unavailable"}); return; }
    cv.toBlob(function(blob){
      if(!blob){ reject({code:"bad_request"}); return; }
      S.downloads.save({filename:name,data:blob}).then(resolve,reject);
    },"image/png");
  });
}
function saveErr(e){
  var c=e&&e.code;
  if(c==="declined") return tr("save.declined");
  if(c==="rate_limited") return tr("save.busy");
  if(c==="unavailable"||c==="not_granted") return tr("save.unavailable");
  return tr("save.failed",{code:c||tr("common.unknown")});
}
function sha256hex(buf){
  /* crypto.subtle only exists on HTTPS or localhost; over plain HTTP on a LAN address we
     fall back to a small pure-JS implementation so installs still verify the hash */
  if(window.crypto && crypto.subtle && crypto.subtle.digest){
    return crypto.subtle.digest("SHA-256",buf).then(hexOf);
  }
  return Promise.resolve(hexOf(sha256js(new Uint8Array(buf))));
}
function hexOf(h){ return Array.prototype.map.call(new Uint8Array(h),function(b){ return b.toString(16).padStart(2,"0"); }).join(""); }
function sha256js(bytes){
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var len=bytes.length, padded=new Uint8Array(((len+9+63)>>6)<<6);
  padded.set(bytes); padded[len]=0x80;
  var bits=len*8, dv=new DataView(padded.buffer);
  dv.setUint32(padded.length-4,bits>>>0); dv.setUint32(padded.length-8,Math.floor(bits/4294967296));
  var W=new Uint32Array(64), r=function(x,n){ return (x>>>n)|(x<<(32-n)); };
  for(var off=0;off<padded.length;off+=64){
    for(var i=0;i<16;i++) W[i]=dv.getUint32(off+i*4);
    for(i=16;i<64;i++){ var s0=r(W[i-15],7)^r(W[i-15],18)^(W[i-15]>>>3), s1=r(W[i-2],17)^r(W[i-2],19)^(W[i-2]>>>10); W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0; }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(i=0;i<64;i++){
      var t1=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[i]+W[i])>>>0, t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0; H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  var out=new Uint8Array(32), odv=new DataView(out.buffer); for(i=0;i<8;i++) odv.setUint32(i*4,H[i]); return out.buffer;
}

/* ---------- apps and notes: local lists kept in step with the store ---------- */
var pending={notes:{},apps:{}}, removed={notes:{},apps:{}};
var dataHooks={notes:[],apps:[]};
function upsert(kind,obj){
  var arr=S[kind], i=arr.findIndex(function(x){ return x.id===obj.id; });
  if(i<0) arr.push(obj); else arr[i]=obj;
}
function dropLocal(kind,id){ S[kind]=S[kind].filter(function(x){ return x.id!==id; }); removed[kind][id]=true; }
function applyRemote(kind,docs){
  var fresh=docs.filter(function(d){ return !removed[kind][d.id]; }).map(function(d){ var o=own(d.data())||{}; o.id=d.id; return o; });
  var have={}; S[kind].forEach(function(o){ have[o.id]=o; });
  fresh.forEach(function(o){ if(kind==="apps" && !o.html && have[o.id] && have[o.id].html && have[o.id].sha256===o.sha256) o.html=have[o.id].html; });
  var seen={}; fresh.forEach(function(o){ seen[o.id]=true; });
  S[kind].forEach(function(o){ if(pending[kind][o.id] && !seen[o.id]) fresh.push(o); else if(pending[kind][o.id]) { for(var i=0;i<fresh.length;i++) if(fresh[i].id===o.id) fresh[i]=o; } });
  S[kind]=fresh;
  dataHooks[kind].forEach(function(fn){ fn(); });
}
/* a built-in redraws its list when fresh data for it arrives */
function onData(kind,fn){ dataHooks[kind].push(fn); }
onData("apps",function(){ if(!$("v-home").hidden) renderHome(); });
var readSeq={apps:0,notes:0};
function refresh(kind){
  if(!S.db) return;
  var mine=++readSeq[kind];
  S.refs[kind].get().then(function(q){
    if(mine!==readSeq[kind]) return;
    applyRemote(kind,q.docs);
  }).catch(function(e){
    setStatus("status.readfail");
    toast(tr("common.readfail",{msg:String((e&&e.code)||(e&&e.message)||e).slice(0,120)}));
  });
}

/* ---------- clock & status ---------- */
var statusKey="status.boot";
function setStatus(key){ statusKey=key; $("savestate").textContent=tr(key); }
function tickClock(){ var d=new Date(); $("clock").textContent=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }

/* ---------- views ---------- */
/* every view leaves first (the runner blanks its frame, the cartridge stops, the camera lets go
   of the lens), then the chin pad goes away unless the new view keeps it, then the view opens */
function show(name){
  Array.prototype.forEach.call(document.querySelectorAll("#screen > .view"),function(v){ v.hidden = v.id!=="v-"+name; });
  var target=null;
  LP.builtins.forEach(function(b){ if(!b.view) return; if(b.view===name) target=b; else if(b.leave) b.leave(); });
  if(!(target && target.keepPad)) showPad(false);
  if(name==="home"){ renderHome(); refresh("apps"); }
  if(target && target.enter) target.enter();
}
$("home-key").onclick=function(){ LP.flushNote(); show("home"); sfx("home"); };

/* ---------- keeping the screen on (Screen Wake Lock) ----------
   A view where the hands may rest while the eyes stay on the screen (a book page, a game, the viewfinder, a running app)
   asks for keepAwake(true) when it opens and keepAwake(false) when it closes; its leave hook covers HOME. The browser
   drops the lock when the page is hidden: it is asked for again when the page comes back, if still wanted. No setting
   and no message: where the request is refused (older iOS, some home-screen apps) the screen dims as it always did
   (decisions.md section 3) */
var AWAKE={want:false, lock:null, asking:false};
function letGo(lock){ try{ var r=lock.release(); if(r && r.catch) r.catch(function(){}); }catch(e){} }
function askAwake(){
  var wl=navigator.wakeLock;
  if(!AWAKE.want || AWAKE.lock || AWAKE.asking || document.hidden || !wl || typeof wl.request!=="function") return;
  AWAKE.asking=true;
  var p; try{ p=wl.request("screen"); }catch(e){ AWAKE.asking=false; return; }
  Promise.resolve(p).then(function(lock){
    AWAKE.asking=false;
    if(!lock) return;
    /* the view closed while the browser was answering */
    if(!AWAKE.want || document.hidden){ letGo(lock); return; }
    AWAKE.lock=lock;
    if(lock.addEventListener) lock.addEventListener("release",function(){ if(AWAKE.lock===lock) AWAKE.lock=null; });
  },function(){ AWAKE.asking=false; });
}
function keepAwake(on){
  AWAKE.want=!!on;
  if(AWAKE.want){ askAwake(); return; }
  var lock=AWAKE.lock; AWAKE.lock=null;
  if(lock) letGo(lock);
}
document.addEventListener("visibilitychange",function(){
  if(!document.hidden){ askAwake(); return; }
  var lock=AWAKE.lock; AWAKE.lock=null;
  if(lock) letGo(lock);
});

/* ---------- sound: tiny square-wave chips through Web Audio (the named sounds themselves are in chip.js) ---------- */
var RUNTIME_VERSION="0.33.0";   /* keep in step with VERSION in sw.js */
/* One volume, five steps, 0 is off (decisions.md section 10). It sets the master gain and nothing else does.
   Under the master: `ui` for the runtime's own clicks, held at a fraction so they stay as quiet as they always were
   (step 2 gives them 0.11, their level before 0.12.0), and `app` for apps, music and the cartridge at the full step. */
var SND={ctx:null, vol:2, gain:null, ui:null, app:null, stale:false, session:"ambient"};
var VOL_GAIN=[0,0.12,0.25,0.42,0.6], VOL_MAX=4, UI_LEVEL=0.44;
function applyLevel(){ if(SND.gain) SND.gain.gain.value=VOL_GAIN[SND.vol]||0; }
function audio(){
  if(SND.ctx) return SND.ctx;
  var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null;
  /* "ambient": the speaker follows the ring/silent switch (headphones do not, that is iOS), and it mixes with a podcast
     or music instead of stopping it */
  setSession(SND.session);
  var ac=SND.ctx=new AC();
  SND.gain=ac.createGain(); SND.gain.connect(ac.destination);
  SND.ui=ac.createGain(); SND.ui.gain.value=UI_LEVEL; SND.ui.connect(SND.gain);
  SND.app=ac.createGain(); SND.app.connect(SND.gain);
  SND.stale=false; applyLevel();
  return ac;
}
/* navigator.audioSession.type (iOS 17+): "ambient" always, except while an app has the microphone on, when iOS needs
   "play-and-record" (runtime/sensors.js sets that, and sets "ambient" back on every way out; decisions.md section 23).
   Remembered, so a context made again meanwhile keeps the session the microphone needs */
function setSession(type){
  SND.session=type;
  try{ if(navigator.audioSession) navigator.audioSession.type=type; }catch(e){}
}
/* ask a context that is not running to run, whatever stopped it ("suspended", or Safari's "interrupted") */
function wake(){ var ac=SND.ctx; if(ac && ac.state!=="running" && ac.state!=="closed") try{ ac.resume(); }catch(e){} }
var APP_SFX=["tap","tick","move","ok","err","hit","miss","coin","win","lose"];
function playNamed(name,bus){
  if(window.LOPDA_DEBUG) window.LOPDA_DEBUG.sfxLog.push(name);
  if(!SND.vol) return;
  if(!window.LopdaChip.hasNamed(name)) return;
  var ac=audio(); if(!ac) return;
  wake();
  try{ window.LopdaChip.named(ac,SND[bus],name); }catch(e){}
}
/* the runtime's own sounds */
function sfx(name){ playNamed(name,"ui"); }
/* a named sound an app asked for (PAD.sfx("coin")) */
function appSfx(name){ playNamed(name,"app"); }
/* ---------- music, made-to-order sounds and ambience for apps: runtime/chip.js (PAD.music, PAD.sfx({...}), PAD.ambience) ----------
   Into the `app` bus, under the same master. At volume 0 the song and the ambience keep going, silent, and are heard again
   from wherever they have got to, like turning a real handheld's volume down. */
var chip=window.LopdaChip.host({
  context:function(make){ return SND.ctx || (make ? audio() : null); },
  output:function(){ return SND.app; },
  level:applyLevel
});
function sfxCustom(params){
  if(!SND.vol || !audio()) return;
  wake();
  try{ chip.sfx(params); }catch(e){}
}
/* Keeping sound alive. iOS stops the context behind the page's back: a call, Siri, another app taking or handing back
   the audio (a podcast paused from the headphones), a long stay in the background, headphones coming or going.
   Sometimes it says so ("suspended", "interrupted"); sometimes it still says "running" and its clock stands still.
   So on every touch or key: a context Safari calls interrupted, or one an earlier check found dead, is replaced at
   once, inside the touch, where iOS lets a new one start; one that is merely suspended is asked to run; and a check
   400 ms later marks it dead if its clock has not moved. The song goes on in the new context from where it was, the ambience
   with the same preset and level;
   built-ins that play into the context get the "audio" hook. */
function rebuild(){
  var old=SND.ctx; SND.ctx=null; SND.gain=SND.ui=SND.app=null;
  try{ old.close(); }catch(e){}
  if(!audio()) return;
  chip.rebuild();
  LP.each("audio");
}
/* The microphone going on: iOS changes the audio route, and the system prompt interrupts the audio session, so the
   context may be left stopped with nobody touching the screen (blowing at a candle). So a moment later a stopped one is asked
   to run, and only one whose clock still stands is made again. (While the microphone is on iOS plays everything quieter,
   whichever context: the system's doing, accepted; decisions.md section 23.)
   Going off: "ambient" is set back first, but iOS keeps the phone-call session (the volume keys show a receiver and the
   silent switch does nothing) for as long as the context that played beside the microphone lives. So that context is
   replaced at once; if iOS will not start the new one without a touch, the next touch does (checkLater, onGesture). */
function micRoute(on){
  var ac=SND.ctx; if(!ac) return;
  if(on===false){ rebuild(); wake(); checkLater(); return; }
  setTimeout(function(){
    if(ac!==SND.ctx || document.hidden) return;
    wake();
    var t=ac.currentTime;
    setTimeout(function(){
      if(ac!==SND.ctx || document.hidden) return;
      if(ac.state!=="running" || ac.currentTime<=t) rebuild();
    },400);
  },200);
}
function checkLater(){
  var ac=SND.ctx; if(!ac || document.hidden) return;
  var t=ac.currentTime;
  setTimeout(function(){
    if(ac!==SND.ctx || document.hidden) return;
    if(ac.state!=="running" || ac.currentTime<=t) SND.stale=true;
  },400);
}
function onGesture(){
  var ac=SND.ctx;
  if(ac){
    if(SND.stale || ac.state==="interrupted") rebuild();
    else wake();
  }
  /* a song or ambience asked for before the first touch starts on the first touch or key (iPhone keeps audio locked until then) */
  chip.unlock();
  checkLater();
}
["pointerdown","touchend","keydown"].forEach(function(t){ document.addEventListener(t,onGesture,true); });
document.addEventListener("visibilitychange",function(){
  if(document.hidden){ chip.pause(); return; }
  chip.resume(); setTimeout(checkLater,300);
});
/* ---------- speech: the phone's own voices (runtime/speech.js) for the dictionary's 发音 and PAD.say. As loud as the handheld's
   volume step, relative to the loudest (0.2, 0.42, 0.7, 1); step 0 is silence. An app's speech stops when the page is hidden
   (the dictionary stops its own) ---------- */
var speech=window.LopdaSpeech.host({window:window, volume:function(){ return Math.min(1,(VOL_GAIN[SND.vol]||0)/VOL_GAIN[VOL_MAX]); }});
document.addEventListener("visibilitychange",function(){ if(document.hidden) speech.stop(); });
/* every button gets a key click, except the ones that make their own sound */
document.addEventListener("pointerdown",function(e){
  var b=e.target.closest && e.target.closest("button,label.btn,.app");
  if(!b || b.disabled || b.id==="home-key" || b.closest(".gamepad") || b.closest(".cam-view")) return;
  sfx("tap");
},true);

/* ---------- language ---------- */
/* switching language redraws what is on screen in place; every other view builds its text when it opens */
function setLang(lang){
  if(lang===I18N.lang || !I18N.STR[lang]) return;
  I18N.set(lang); setStatus(statusKey);
  renderHome(); renderUpdate();
  LP.each("lang");
}

/* ---------- updates: the service worker keeps an offline copy; this swaps it for the newest one ---------- */
var UPD={ready:false, busy:false, latest:null};
function renderUpdate(){
  var b=$("set-update"); if(!b) return;
  $("upd-label").textContent=tr("upd.label")+" "+RUNTIME_VERSION+(UPD.latest && UPD.latest!==RUNTIME_VERSION ? " → "+UPD.latest : "");
  b.disabled=UPD.busy;
  b.className=UPD.ready?"btn":"btn ghost";
  b.textContent=tr(UPD.busy?"upd.busy":UPD.ready?"upd.restart":"upd.check");
}
function latestVersion(){
  return fetch("sw.js?fresh="+Date.now(),{cache:"no-store"}).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); })
    .then(function(t){ var m=/VERSION\s*=\s*"lopda-v([^"]+)"/.exec(t); if(!m) throw new Error(tr("upd.noversion")); return m[1]; });
}
function waitForNewWorker(reg){
  return new Promise(function(resolve){
    var done=function(){ resolve(); };
    var watch=function(w){ if(!w) return false; if(w.state==="activated") { done(); return true; } w.addEventListener("statechange",function(){ if(w.state==="activated"||w.state==="redundant") done(); }); return true; };
    if(watch(reg.installing)||watch(reg.waiting)) return;
    reg.addEventListener("updatefound",function(){ watch(reg.installing); });
    setTimeout(done,15000);
  });
}
$("set-update").onclick=function(){
  if(UPD.ready){ sfx("ok"); LP.flushNote(); setTimeout(function(){ location.reload(); },150); return; }
  if(!("serviceWorker" in navigator) || !navigator.serviceWorker.controller){ toast(tr("upd.nosw")); return; }
  UPD.busy=true; renderUpdate(); sfx("modem");
  latestVersion().then(function(v){
    UPD.latest=v;
    if(v===RUNTIME_VERSION){ toast(tr("upd.latest",{v:v})); return; }
    return navigator.serviceWorker.getRegistration().then(function(reg){
      if(!reg) throw new Error(tr("upd.nocopy"));
      return reg.update().then(function(){ return waitForNewWorker(reg); });
    }).then(function(){ UPD.ready=true; toast(tr("upd.ready",{v:v})); sfx("ok"); });
  }).catch(function(e){ toast(tr("upd.failed",{msg:(e&&e.message)||tr("upd.offline")})); sfx("err"); })
    .then(function(){ UPD.busy=false; renderUpdate(); });
};

/* ---------- pixel icons: 16 rows of 16 chars, 0-3 = the four tones, "." = transparent ---------- */
var ICONS={"notes":["................","..0000000000....","..0333333330....","..0311111130....","..0333333330....","..0311111130....","..0333333330....","..0311111130....","..0333333330....","..0311113330000.","..0333333300330.","..0311110003300.","..0333330033000.","..033333003000..","..00000000000...","................"],
  "cart":["................","...000000000....","...03333333300..","...03333333330..","...030000000330.","...030111110330.","...030122210330.","...030122210330.","...030111110330.","...030000000330.","...033333333330.","...033333333330.","...031313131330.","...033333333330.","...000000000000.","................"],
  "camera":["................","................","....0000........","..000000000000..",".03333333333330.",".03300000333330.",".03011111033000.",".00112222103330.",".00122332103330.",".00122332103330.",".00112222103330.",".03011111033330.",".03300000333330.",".00000000000000.","................","................"],
  "store":["................","................","...0000000000...","...0322222230...","...0000000000...",".00000000000000.",".02332233223320.",".00000000000000.","...0000000000...","...0333333330...","...0333000330...","...0333000330...","...0333000330...","...0000000000...","................","................"],
  "settings":["................","......0000......","...00.0330.00...","..033033330330..","..033333333330..","...0333003330...",".000330..033000.",".03330....03330.",".03330....03330.",".000330..033000.","...0333003330...","..033333333330..","..033033330330..","...00.0330.00...","......0000......","................"],
  "scripts":["................","..000000000000..","..033333333330..","..030000000030..","..030333330030..","..030300030030..","..030300330030..","..030333000030..","..030000000030..","..030333300030..","..030000000030..","..033333333330..","..000000000000..","................","................","................"]};
function validIcon(rows){
  return Array.isArray(rows) && rows.length===16 && rows.every(function(r){ return typeof r==="string" && /^[.0-3]{16}$/.test(r); });
}
function iconCanvas(rows){
  var c=document.createElement("canvas"); c.width=16; c.height=16; c.className="icon";
  var x=c.getContext("2d"), im=x.createImageData(16,16), d=im.data;
  rows.forEach(function(r,y){ for(var i=0;i<16;i++){ var ch=r.charAt(i), o=(y*16+i)*4; if(ch==="."){ d[o+3]=0; continue; } var t=TONES[+ch]; d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255; } });
  x.putImageData(im,0,0);
  return c;
}
/* fill a tile with the app's pixel icon, or its glyph when it has none */
function fillTile(tile,app,builtinIcon){
  var rows = builtinIcon ? (typeof builtinIcon==="function" ? builtinIcon() : ICONS[builtinIcon]) : (validIcon(app.icon) ? app.icon : null);
  if(rows){ tile.classList.add("has-icon"); tile.appendChild(iconCanvas(rows)); }
  else tile.textContent=glyphOf(app);
}

/* ---------- home ---------- */
/* manifest name and description in the current language, when the app has them (manifest "i18n") */
function appName(a){ return noEmoji(I18N.field(a,"name"))||tr("app.unnamed"); }
function appDesc(a){ return noEmoji(I18N.field(a,"description")); }
function showAddHomeTip(){
  var ua=navigator.userAgent||"";
  var ios=/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints>1);
  var safari=/Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA)/.test(ua);
  var standalone=navigator.standalone===true || !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  return ios && safari && !standalone && S.homeTipDismissed===false;
}
var homeTipSaving=false;
function dismissAddHomeTip(){
  if(homeTipSaving || S.homeTipDismissed || !S.refs.settings) return;
  homeTipSaving=true;
  var button=$("home-tip-dismiss");
  if(button) button.disabled=true;
  S.refs.settings.get().then(function(sn){
    var data=sn.exists ? own(sn.data())||{} : {};
    data.homeTipDismissed=true;
    return put(S.refs.settings,data);
  }).then(function(ok){
    homeTipSaving=false;
    if(ok){ S.homeTipDismissed=true; if(!$("v-home").hidden) renderHome(); }
    else if(button) button.disabled=false;
  },function(e){
    homeTipSaving=false;
    toast(tr("common.readfail",{msg:String((e&&e.code)||(e&&e.message)||e)}));
    if(button) button.disabled=false;
  });
}
/* built-ins first, in the order they registered, then the preinstalled apps in their list order, then installed apps by install time */
function renderHome(){
  var h=$("home"); h.textContent="";
  if(showAddHomeTip()){
    var card=document.createElement("aside"); card.className="home-tip"; card.id="home-add-tip";
    var title=document.createElement("strong"); title.textContent=tr("home.add.title");
    var how=document.createElement("span"); how.textContent=tr("home.add.how");
    var dismiss=document.createElement("button"); dismiss.type="button"; dismiss.className="btn home-tip-dismiss";
    dismiss.id="home-tip-dismiss"; dismiss.textContent=tr("home.add.dismiss"); dismiss.onclick=dismissAddHomeTip;
    card.appendChild(title); card.appendChild(how); card.appendChild(dismiss); h.appendChild(card);
  }
  function add(cls,app,label,tag,onclick,builtinIcon){
    var b=document.createElement("button"); b.type="button"; b.className="app "+cls;
    var tile=document.createElement("span"); tile.className="tile"; fillTile(tile,app,builtinIcon);
    var l=document.createElement("span"); l.className="label"; l.textContent=label;
    b.appendChild(tile); b.appendChild(l);
    if(tag){ var t=document.createElement("span"); t.className="tag"; t.textContent=tag; b.appendChild(t); }
    b.onclick=onclick; h.appendChild(b);
  }
  LP.builtins.forEach(function(bi){
    if(bi.icon) add("builtin",{},tr(bi.label),bi.tag?bi.tag():"",function(){ bi.open(); },bi.icon);
  });
  var pre=function(a){ return a.preinstalled>0 ? a.preinstalled : Infinity; };
  S.apps.slice().sort(function(a,b){ return (pre(a)-pre(b)) || ((a.installed||0)-(b.installed||0)); }).forEach(function(a){
    add("",a,appName(a),"v"+(a.version||"?"),function(){ LP.runApp(a); });
  });
}

/* two-tap confirm: the page builds its own confirmation instead of confirm() */
function resetConfirm(wrapId,btnId,label,onYes){
  var w=$(wrapId); w.textContent="";
  var b=document.createElement("button"); b.className="btn ghost"; b.type="button"; b.id=btnId; b.textContent=label||tr("common.delete");
  w.appendChild(b); b.onclick=function(){ armConfirm(wrapId,btnId,label,onYes); };
}
function armConfirm(wrapId,btnId,label,onYes){
  var w=$(wrapId); w.textContent="";
  var yes=document.createElement("button"); yes.className="btn"; yes.type="button"; yes.textContent=tr("common.confirm",{what:label||tr("common.delete")});
  var no=document.createElement("button"); no.className="btn ghost"; no.type="button"; no.textContent=tr("common.cancel");
  w.appendChild(yes); w.appendChild(no);
  no.onclick=function(){ resetConfirm(wrapId,btnId,label,onYes); };
  yes.onclick=onYes;
}

/* ---------- chin game pad: D-pad, A, B, START, SELECT ----------
   Routed to the viewfinder an app opened (PAD.camera.snap) or the file dialog while they are open, then the cartridge player when it runs, then the camera, the darkroom, the calendar, the dictionary, the reader, notes, otherwise to the running app (PAD.on).
   A route returns true when it took the button. */
var PADB={up:false,down:false,left:false,right:false,a:false,b:false,start:false,select:false};
var PADKEYS={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",x:"a",X:"a",z:"b",Z:"b",Enter:"start",Shift:"select"};
var PAD_ORDER=["home","snap","file","cart","cam","dark","cal","dict","reader","notes","run"], padRoutes={};   /* "snap": an app's viewfinder (apps/snap.js), "file": the runtime's file dialog, while they are open */
function padRoute(name,fn){ padRoutes[name]=fn; }
padRoute("home",function(b,down){
  if(b!=="a" || !down || $("v-home").hidden || !$("home-add-tip")) return false;
  dismissAddHomeTip(); return true;
});
function padOn(){ return !$("gamepad").hidden; }
function setButton(b,down){
  if(!(b in PADB) || PADB[b]===down) return;
  PADB[b]=down;
  var el=document.querySelector('.gamepad [data-b="'+b+'"]'); if(el) el.classList.toggle("on",down);
  var arm=document.querySelector(".dpad ."+({up:"u",down:"d",left:"l",right:"r"}[b]||"x")); if(arm) arm.classList.toggle("on",down);
  if(down && navigator.vibrate) try{ navigator.vibrate(6); }catch(e){}
  for(var i=0;i<PAD_ORDER.length;i++){ var fn=padRoutes[PAD_ORDER[i]]; if(fn && fn(b,down)) return; }
}
function releaseButtons(){ Object.keys(PADB).forEach(function(b){ setButton(b,false); }); }
function showPad(on){
  if(!on) releaseButtons();
  $("gamepad").hidden=!on;
  LP.each("padLayout");
}
Array.prototype.forEach.call(document.querySelectorAll(".gamepad .pk"),function(el){
  var b=el.getAttribute("data-b");
  el.addEventListener("pointerdown",function(e){ e.preventDefault(); try{ el.setPointerCapture(e.pointerId); }catch(x){} setButton(b,true); });
  ["pointerup","pointercancel","lostpointercapture"].forEach(function(t){ el.addEventListener(t,function(){ setButton(b,false); }); });
  el.addEventListener("contextmenu",function(e){ e.preventDefault(); });
});
/* iOS Safari ignores user-scalable=no and zooms on a quick double tap on anything that is not a button, which the cross
   (a div with <i> arms) and the gaps between keys are. The pad runs on pointer events and needs no clicks, so cancelling
   touchend over the whole pad stops the zoom and changes nothing else. */
$("gamepad").addEventListener("touchend",function(e){ if(e.cancelable) e.preventDefault(); },{passive:false});
(function(){
  var dp=$("dpad"), id=null;
  function aim(e){
    var r=dp.getBoundingClientRect(), dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2);
    var want={up:false,down:false,left:false,right:false};
    if(dx*dx+dy*dy > (r.width*0.12)*(r.width*0.12)){
      /* eight sectors, so a thumb on a corner presses two arms like the real cross */
      var sec=(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8;
      if(sec===7||sec===0||sec===1) want.right=true;
      if(sec>=1&&sec<=3) want.down=true;
      if(sec>=3&&sec<=5) want.left=true;
      if(sec>=5&&sec<=7) want.up=true;
    }
    Object.keys(want).forEach(function(k){ setButton(k,want[k]); });
  }
  function end(e){ if(e.pointerId!==id) return; id=null; ["up","down","left","right"].forEach(function(k){ setButton(k,false); }); }
  dp.addEventListener("pointerdown",function(e){ e.preventDefault(); id=e.pointerId; try{ dp.setPointerCapture(id); }catch(x){} aim(e); });
  dp.addEventListener("pointermove",function(e){ if(e.pointerId===id) aim(e); });
  ["pointerup","pointercancel","lostpointercapture"].forEach(function(t){ dp.addEventListener(t,end); });
})();
document.addEventListener("keydown",function(e){
  var b=PADKEYS[e.key], homeTip=b==="a" && !$("v-home").hidden && $("home-add-tip");
  if(!b || (!padOn() && !homeTip) || /INPUT|TEXTAREA/.test(e.target.nodeName)) return;
  e.preventDefault(); if(!e.repeat) setButton(b,true);
});
document.addEventListener("keyup",function(e){ var b=PADKEYS[e.key]; if(b && (padOn() || PADB[b])) setButton(b,false); });
window.addEventListener("blur",releaseButtons);

if(/[?&]debug\b/.test(location.search)) window.LOPDA_DEBUG={setButton:setButton, sfxLog:[]};

/* what the built-ins and boot.js use */
var share={
  noEmoji:noEmoji, glyphOf:glyphOf, own:own, uid:uid, toast:toast, put:put, fmt:fmt, pad2:pad2,
  TONES:TONES, BAYER:BAYER, saveCanvas:saveCanvas, saveErr:saveErr, sha256hex:sha256hex,
  upsert:upsert, dropLocal:dropLocal, pending:pending, refresh:refresh, onData:onData,
  setStatus:setStatus, tickClock:tickClock, show:show, keepAwake:keepAwake,
  RUNTIME_VERSION:RUNTIME_VERSION, SND:SND, VOL_MAX:VOL_MAX, VOL_GAIN:VOL_GAIN, audio:audio, wake:wake, setSession:setSession, micRoute:micRoute, sfx:sfx, appSfx:appSfx, APP_SFX:APP_SFX, chip:chip, sfxCustom:sfxCustom, applyLevel:applyLevel, speech:speech,
  setLang:setLang, UPD:UPD, renderUpdate:renderUpdate,
  validIcon:validIcon, fillTile:fillTile, appName:appName, appDesc:appDesc, renderHome:renderHome,
  resetConfirm:resetConfirm, padRoute:padRoute, setButton:setButton, releaseButtons:releaseButtons, showPad:showPad
};
for(var k in share) LP[k]=share[k];

/* ---------- the phone's keyboard. iOS does not shrink the page for it: the keyboard and its bar cover the bottom of the
   screen, and the whole handheld can be dragged up under the finger. While a text field has the keyboard, the device is
   cut to the visible height (--vvh): the LCD fills it, the brand line, the chin pad and HOME step aside (they are under
   the keyboard anyway), the page is kept at the top, and only things that scroll can be dragged ---------- */
(function(){
  var vv=window.visualViewport, root=document.documentElement;
  if(!vv) return;
  function field(){
    var a=document.activeElement;
    return !!a && (a.tagName==="TEXTAREA" || (a.tagName==="INPUT" && !/^(button|checkbox|radio|range|file|submit)$/i.test(a.type)));
  }
  function fit(){
    /* the layout viewport (clientHeight) keeps its height when the keyboard opens; the visual one loses the keyboard's */
    var kb=field() && vv.height<root.clientHeight-100;
    root.classList.toggle("kb",kb);
    if(kb){
      root.style.setProperty("--vvh",Math.round(vv.height)+"px");
      if(window.scrollY || vv.offsetTop) window.scrollTo(0,0);
    } else root.style.removeProperty("--vvh");
  }
  vv.addEventListener("resize",fit);
  vv.addEventListener("scroll",fit);
  document.addEventListener("focusin",function(){ setTimeout(fit,60); });
  document.addEventListener("focusout",function(){ setTimeout(fit,60); });
  function scrolls(e){
    for(;e && e!==document.body;e=e.parentElement){
      var o=getComputedStyle(e).overflowY;
      if((o==="auto" || o==="scroll") && e.scrollHeight>e.clientHeight+1) return true;
      if(e.tagName==="TEXTAREA" && e.scrollHeight>e.clientHeight+1) return true;
    }
    return false;
  }
  document.addEventListener("touchmove",function(ev){
    if(root.classList.contains("kb") && !scrolls(ev.target)) ev.preventDefault();
  },{passive:false});
})();
})();
