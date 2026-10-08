/*
 * Lo-PDA runtime.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var REGISTRY = new URL("../registry/", location.href).href;
/* runtime/strings.js: every word on screen, in zh and en */
var I18N = window.LopdaStrings, tr = I18N.t;

var S = {
  db:null, refs:{}, downloads:null,
  apps:[], notes:[],
  kv:{},                  // appId -> {key:value}
  running:null, editing:null,
  registry:null           // last fetched registry/index.json
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
var pending={notes:{},apps:{}}, removed={notes:{},apps:{}};
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
  if(kind==="notes" && !$("v-notes").hidden) renderNotes();
  if(kind==="apps"){ if(!$("v-home").hidden) renderHome(); if(!$("v-store").hidden) renderStore(); }
}
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
var VIEWS=["home","store","notes","note","run","paint","cam","cut","settings","cart"];
function show(name){
  VIEWS.forEach(function(v){ $("v-"+v).hidden = v!==name; });
  if(name!=="run"){ $("run-frame").srcdoc=""; S.running=null; }
  if(name!=="cart" && typeof gbStop==="function") gbStop();
  if(name!=="run" && name!=="cart" && typeof showPad==="function") showPad(false);
  if(name!=="cam" && typeof stopLive==="function") stopLive();
  if(name==="home"){ renderHome(); refresh("apps"); }
  if(name==="notes"){ renderNotes(); refresh("notes"); }
  if(name==="store"){ renderStore(); loadRegistry(); }
}
$("home-key").onclick=function(){ flushNote(); show("home"); sfx("home"); };

/* ---------- sound: tiny square-wave chips through Web Audio ---------- */
var RUNTIME_VERSION="0.4.0";   /* keep in step with VERSION in sw.js */
var SND={ctx:null, on:true, vol:2, gain:null};
var VOL_GAIN=[0,0.05,0.11,0.2];
function audio(){
  if(SND.ctx) return SND.ctx;
  var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null;
  /* "ambient" follows the ring/silent switch and mixes with music instead of stopping it */
  try{ if(navigator.audioSession) navigator.audioSession.type="ambient"; }catch(e){}
  SND.ctx=new AC(); SND.gain=SND.ctx.createGain(); SND.gain.connect(SND.ctx.destination);
  return SND.ctx;
}
function tone(freq,start,dur,type,level){
  var ac=SND.ctx, o=ac.createOscillator(), g=ac.createGain(), t=ac.currentTime+start;
  o.type=type||"square"; o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(level||1,t+0.004); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(SND.gain); o.start(t); o.stop(t+dur+0.02);
}
function noise(start,dur,level){
  var ac=SND.ctx, n=Math.floor(ac.sampleRate*dur), buf=ac.createBuffer(1,n,ac.sampleRate), ch=buf.getChannelData(0);
  for(var i=0;i<n;i++) ch[i]=(Math.random()*2-1)*(1-i/n);
  var src=ac.createBufferSource(), g=ac.createGain(), t=ac.currentTime+start; src.buffer=buf;
  g.gain.setValueAtTime(level||1,t); src.connect(g); g.connect(SND.gain); src.start(t);
}
var SFX={
  tap:function(){ tone(1400,0,0.03,"square",0.5); },
  home:function(){ tone(660,0,0.06); tone(990,0.06,0.08); },
  shutter:function(){ noise(0,0.05,0.9); tone(180,0.0,0.05,"square",0.6); noise(0.09,0.04,0.6); },
  ok:function(){ tone(523,0,0.07); tone(659,0.07,0.07); tone(784,0.14,0.12); },
  err:function(){ tone(196,0,0.12); tone(147,0.12,0.18); },
  modem:function(){ for(var i=0;i<6;i++) tone(i%2?2100:1200,i*0.05,0.045,"square",0.35); },
  tick:function(){ tone(2400,0,0.012,"square",0.25); },
  /* the rest are also offered to apps through PAD.sfx (see SPEC.md) */
  move:function(){ tone(880,0,0.025,"square",0.3); },
  hit:function(){ noise(0,0.07,1); tone(98,0,0.09,"square",0.9); },
  miss:function(){ tone(330,0,0.05,"triangle",0.8); tone(220,0.05,0.08,"triangle",0.7); },
  coin:function(){ tone(988,0,0.06,"square",0.5); tone(1319,0.06,0.16,"square",0.5); },
  win:function(){ [523,659,784,1047].forEach(function(f,i){ tone(f,i*0.09,i===3?0.25:0.09,"square",0.6); }); },
  lose:function(){ [392,330,262,196].forEach(function(f,i){ tone(f,i*0.14,i===3?0.3:0.13,"triangle",0.9); }); }
};
var APP_SFX=["tap","tick","move","ok","err","hit","miss","coin","win","lose"];
function sfx(name){
  if(window.LOPDA_DEBUG) window.LOPDA_DEBUG.sfxLog.push(name);
  if(!SND.on || !SND.vol) return;
  var ac=audio(); if(!ac || !SFX[name]) return;
  if(ac.state==="suspended") ac.resume();
  SND.gain.gain.value=VOL_GAIN[SND.vol];
  try{ SFX[name](); }catch(e){}
}
/* every button gets a key click, except the ones that make their own sound */
document.addEventListener("pointerdown",function(e){
  var b=e.target.closest && e.target.closest("button,label.btn,.app");
  if(!b || b.disabled || b.id==="home-key" || b.id==="cut-go" || b.closest(".gamepad") || b.closest(".cam-view")) return;
  sfx("tap");
},true);

/* ---------- settings ---------- */
function renderSettings(){
  $("set-sound").textContent=tr(SND.on?"set.on":"set.off"); $("set-sound").setAttribute("aria-pressed",SND.on?"true":"false");
  $("set-vol").textContent="▮".repeat(SND.vol)+"▯".repeat(3-SND.vol);
  $("set-vol-down").disabled=!SND.on||SND.vol<=0; $("set-vol-up").disabled=!SND.on||SND.vol>=3;
  $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION});
  Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
    var on=b.getAttribute("data-lang")===I18N.lang; b.className=on?"btn":"btn ghost"; b.setAttribute("aria-checked",on?"true":"false");
  });
}
function saveSettings(){ renderSettings(); if(S.db) put(S.refs.settings,{sound:SND.on, volume:SND.vol, lang:I18N.lang}); }
/* switching language redraws what is on screen in place; every other view builds its text when it opens */
function setLang(lang){
  if(lang===I18N.lang || !I18N.STR[lang]) return;
  I18N.set(lang); setStatus(statusKey);
  renderHome(); renderSettings(); renderUpdate(); paintRolls(); cutEdgeLabel(); cutState(); paintSizeLabel();
  if(!$("v-settings").hidden) openSettings();
  if(!$("v-cam").hidden) renderCam();
  /* apps read PAD.lang once at start: a running app is started again in the new language */
  if(S.running && !$("v-run").hidden) runApp(S.running);
}
Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
  b.onclick=function(){ setLang(b.getAttribute("data-lang")); saveSettings(); sfx("ok"); };
});
$("set-sound").onclick=function(){ SND.on=!SND.on; saveSettings(); sfx("ok"); };
$("set-vol-down").onclick=function(){ if(SND.vol>0){ SND.vol--; saveSettings(); sfx("tap"); } };
$("set-vol-up").onclick=function(){ if(SND.vol<3){ SND.vol++; saveSettings(); sfx("tap"); } };
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
  if(UPD.ready){ sfx("ok"); flushNote(); setTimeout(function(){ location.reload(); },150); return; }
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
function openSettings(){
  show("settings"); renderSettings(); renderUpdate();
  var el=$("set-storage"); el.textContent=tr("set.counting");
  if(navigator.storage && navigator.storage.estimate){
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)]).then(function(r){
      var kb=Math.max(1,Math.round((r[0].usage||0)/1024));
      el.textContent=tr("set.storage",{size:kb>1024?(kb/1024).toFixed(1)+" MB":kb+" KB"})+tr(r[1]?"set.locked":"set.unlocked");
    }).catch(function(){ el.textContent=tr("set.nousage"); });
  } else el.textContent=tr("set.nousage");
}

/* ---------- pixel icons: 16 rows of 16 chars, 0-3 = the four tones, "." = transparent ---------- */
var ICONS={"notes":["................","..0000000000....","..0333333330....","..0311111130....","..0333333330....","..0311111130....","..0333333330....","..0311111130....","..0333333330....","..0311113330000.","..0333333300330.","..0311110003300.","..0333330033000.","..033333003000..","..00000000000...","................"],
  "paint":["................","............000.","...........0330.","..........03330.",".........033300.","........033300..",".......03330....","......03330.....",".....033300.....","....011000......","...011110.......","..0111110.......","..011110........",".0000000........",".0000...........","................"],
  "cart":["................","...000000000....","...03333333300..","...03333333330..","...030000000330.","...030111110330.","...030122210330.","...030122210330.","...030111110330.","...030000000330.","...033333333330.","...033333333330.","...031313131330.","...033333333330.","...000000000000.","................"],
  "camera":["................","................","....0000........","..000000000000..",".03333333333330.",".03300000333330.",".03011111033000.",".00112222103330.",".00122332103330.",".00122332103330.",".00112222103330.",".03011111033330.",".03300000333330.",".00000000000000.","................","................"],
  "cutter":["................",".00..........00.",".030........030.","..030......030..","...030....030...","....030..030....",".....030030.....","......0330......","......0330......",".....000000.....","....00....00....","...0330..0330...","...0..0..0..0...","...0330..0330...","....00....00....","................"],
  "store":["................","...0000000000...","...0333333330...","...0300000030...","...0302222030...","...0302112030...","...0302222030...","...0300000030...","...0333333330...","...0303333330...","...0000333300...","...0330333330...","...0303303330...","...0333333330...","...0000000000...","................"],
  "settings":["................","......0000......","...00.0330.00...","..0330333303330.","..0333333333300.","...03330000330..",".000330....0300.",".03330......0330",".03330......0330",".000330....0300.","...03330000330..","..0333333333300.","..0330333303330.","...00.0330.00...","......0000......","................"]};
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
  var rows = builtinIcon ? ICONS[builtinIcon] : (validIcon(app.icon) ? app.icon : null);
  if(rows){ tile.classList.add("has-icon"); tile.appendChild(iconCanvas(rows)); }
  else tile.textContent=glyphOf(app);
}

/* ---------- home ---------- */
function renderHome(){
  var h=$("home"); h.textContent="";
  function add(cls,app,label,tag,onclick,builtinIcon){
    var b=document.createElement("button"); b.type="button"; b.className="app "+cls;
    var tile=document.createElement("span"); tile.className="tile"; fillTile(tile,app,builtinIcon);
    var l=document.createElement("span"); l.className="label"; l.textContent=label;
    b.appendChild(tile); b.appendChild(l);
    if(tag){ var t=document.createElement("span"); t.className="tag"; t.textContent=tag; b.appendChild(t); }
    b.onclick=onclick; h.appendChild(b);
  }
  add("builtin",{},tr("app.notes"),"",function(){ show("notes"); },"notes");
  add("builtin",{},tr("app.paint"),"",function(){ openPaint(); },"paint");
  add("builtin",{},tr("app.camera"),F.roll?(F.frames.length+"/"+F.size):"",function(){ openCam(); },"camera");
  add("builtin",{},tr("app.cutter"),"",function(){ show("cut"); cutLayout(); },"cutter");
  add("builtin",{},tr("app.cart"),"",function(){ openCart(); },"cart");
  add("builtin",{},tr("app.store"),updatesAvailable()?tr("home.updates"):"",function(){ show("store"); },"store");
  add("builtin",{},tr("app.settings"),"",function(){ openSettings(); },"settings");
  S.apps.slice().sort(function(a,b){ return (a.installed||0)-(b.installed||0); }).forEach(function(a){
    add("",a,appName(a),"v"+(a.version||"?"),function(){ runApp(a); });
  });
}

/* ---------- store: the community registry ---------- */
/* manifest name and description in the current language, when the app has them (manifest "i18n") */
function appName(a){ return noEmoji(I18N.field(a,"name"))||tr("app.unnamed"); }
function appDesc(a){ return noEmoji(I18N.field(a,"description")); }
function validI18n(x){
  if(!x || typeof x!=="object") return undefined;
  var out={}, n=0;
  I18N.LANGS.forEach(function(l){ var e=x[l]; if(e && typeof e==="object"){ var o={}; if(typeof e.name==="string") o.name=e.name.slice(0,16); if(typeof e.description==="string") o.description=e.description.slice(0,160); out[l]=o; n++; } });
  return n?out:undefined;
}
var regLoading=null;
function loadRegistry(force){
  if(regLoading && !force) return regLoading;
  $("store-state").textContent=tr("store.fetching");
  regLoading=fetch(REGISTRY+"index.json",{cache:"no-cache"}).then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(idx){
    if(!idx || (idx.spec!=="lopda/0" && idx.spec!=="lopda/1") || !Array.isArray(idx.apps)) throw new Error(tr("store.badindex"));
    S.registry=idx; $("store-state").textContent=tr("store.count",{n:idx.apps.length});
    /* icons and localized names are metadata: refresh them on installed apps whose code is unchanged */
    idx.apps.forEach(function(r){
      var a=installedOf(r.id); if(!a || a.sha256!==r.sha256) return;
      var icon=validIcon(r.icon)?r.icon:a.icon, i18n=validI18n(r.i18n);
      if(JSON.stringify(a.icon)!==JSON.stringify(icon) || JSON.stringify(a.i18n)!==JSON.stringify(i18n)){ a.icon=icon; a.i18n=i18n; saveApp(a); }
    });
    renderStore(); if(!$("v-home").hidden) renderHome();
  }).catch(function(e){
    $("store-state").textContent=tr("store.offline");
    if(!$("v-store").hidden) toast(tr("store.cantreach",{msg:e.message}));
  }).then(function(){ regLoading=null; });
  return regLoading;
}
function installedOf(id){ for(var i=0;i<S.apps.length;i++) if(S.apps[i].id===id) return S.apps[i]; return null; }
function updatesAvailable(){
  if(!S.registry) return false;
  return S.registry.apps.some(function(r){ var a=installedOf(r.id); return a && a.sha256!==r.sha256; });
}
function renderStore(){
  var ul=$("store-list"); ul.textContent="";
  if(!S.registry){ var e=document.createElement("li"); e.className="empty"; e.textContent=tr("store.waiting"); ul.appendChild(e); return; }
  S.registry.apps.forEach(function(r){
    var li=document.createElement("li"); li.className="store-item";
    var tile=document.createElement("span"); tile.className="tile"; fillTile(tile,r);
    var body=document.createElement("div"); body.className="store-body";
    var t=document.createElement("b"); t.textContent=appName(r)+"  v"+r.version;
    var d=document.createElement("span"); d.textContent=appDesc(r);
    var m=document.createElement("small"); m.textContent=(r.author||tr("store.anon"))+" · "+(r.license||"")+" · "+Math.max(1,Math.round((r.bytes||0)/1024))+" KB";
    body.appendChild(t); body.appendChild(d); body.appendChild(m);
    var a=installedOf(r.id), btn=document.createElement("button"); btn.type="button";
    if(!a){ btn.className="btn"; btn.textContent=tr("store.install"); }
    else if(a.sha256!==r.sha256){ btn.className="btn"; btn.textContent=tr("store.update"); }
    else { btn.className="btn ghost"; btn.textContent=tr("store.open"); }
    btn.onclick=function(){ if(a && a.sha256===r.sha256) runApp(a); else install(r,btn); };
    li.appendChild(tile); li.appendChild(body); li.appendChild(btn); ul.appendChild(li);
  });
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
/* install exactly the file the registry describes: the hash must match */
function install(r,btn){
  btn.disabled=true; btn.textContent=tr("store.downloading");
  fetch(new URL(r.path,REGISTRY).href,{cache:"no-cache"}).then(function(res){
    if(!res.ok) throw new Error("HTTP "+res.status);
    return res.arrayBuffer();
  }).then(function(buf){
    return sha256hex(buf).then(function(h){
      if(h!==r.sha256) throw new Error(tr("store.badhash"));
      return new TextDecoder().decode(buf);
    });
  }).then(function(html){
    var prev=installedOf(r.id);
    var app={id:r.id, name:r.name, glyph:r.glyph, icon: validIcon(r.icon) ? r.icon : undefined, i18n: validI18n(r.i18n), version:r.version, author:r.author, license:r.license,
      spec:r.spec||"lopda/0", buttons: r.spec==="lopda/1" && r.buttons===true,
      sha256:r.sha256, installed: prev ? prev.installed : Date.now(), updated: Date.now(), html:html};
    return saveApp(app).then(function(ok){
      if(!ok) throw new Error(tr("store.nostore"));
      toast(tr(prev?"store.updated":"store.installed",{name:appName(r)})); sfx("ok");
      renderStore();
    });
  }).catch(function(e){
    toast(tr("store.failed",{msg:e.message})); sfx("err"); btn.disabled=false; btn.textContent=tr("store.retry");
  });
}

function saveApp(app){
  upsert("apps",app);
  if(!S.db) return Promise.resolve(true);
  pending.apps[app.id]=true;
  var meta={}; for(var k in app) if(k!=="html") meta[k]=app[k];
  return put(S.refs.code.doc(app.id),{html:app.html, sha256:app.sha256}).then(function(okCode){
    return put(S.refs.apps.doc(app.id),meta).then(function(ok){ if(ok && okCode) delete pending.apps[app.id]; return ok && okCode; });
  });
}
function loadHtml(a){
  if(a.html || !S.db) return Promise.resolve(a.html||"");
  return S.refs.code.doc(a.id).get().then(function(s){
    var h = s.exists ? (own(s.data()).html||"") : "";
    if(h) a.html=h;
    return h;
  });
}
function deleteApp(id){
  dropLocal("apps",id);
  if(S.db){ S.refs.apps.doc(id).delete().catch(function(){ toast(tr("store.removefail")); }); S.refs.kv.doc(id).delete().catch(function(){}); S.refs.code.doc(id).delete().catch(function(){}); }
  delete S.kv[id];
}

/* ---------- runner: sandboxed iframe + PAD bridge (sdk/pad-shim.js) ---------- */
var KV_BUDGET=256*1024;
/* A new iframe for every run. Desktop Chrome can leave a reused sandboxed frame unpainted
   (scripts run, nothing shows); a fresh one also means no state carries over between apps. */
function freshRunFrame(){
  var old=$("run-frame"), f=document.createElement("iframe");
  f.id="run-frame"; f.setAttribute("sandbox","allow-scripts"); f.title=old.title;
  old.parentNode.replaceChild(f,old);
}
function runApp(a){
  S.running=a;
  $("run-title").textContent=appName(a)+" · v"+(a.version||"?");
  resetConfirm("run-del-wrap","run-del",tr("run.remove"));
  $("run-err").hidden=true;
  show("run");
  showPad(!!a.buttons);
  freshRunFrame();
  var start=function(h){ $("run-frame").srcdoc=lopdaWrapApp(h,{lang:I18N.lang}); };
  if(a.html){ start(a.html); return; }
  $("run-frame").srcdoc='<body style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#a3ad7e;color:#1f2a14;font:16px monospace">'+tr("run.loading")+'</body>';
  loadHtml(a).then(function(h){
    if(S.running!==a) return;
    if(h) start(h); else toast(tr("run.missing"));
  }).catch(function(e){ if(S.running===a) toast(tr("run.loadfail",{code:(e&&e.code)||tr("common.unknown")})); });
}
$("run-back").onclick=function(){ show("home"); };
$("run-err-close").onclick=function(){ $("run-err").hidden=true; };

function getKv(appId){
  if(S.kv[appId]) return Promise.resolve(S.kv[appId]);
  if(!S.db){ S.kv[appId]=S.kv[appId]||{}; return Promise.resolve(S.kv[appId]); }
  return S.refs.kv.doc(appId).get().then(function(s){ S.kv[appId]=(s.exists && own(s.data()).kv)||{}; return S.kv[appId]; }).catch(function(){ S.kv[appId]={}; return S.kv[appId]; });
}
var kvTimers={};
function saveKvSoon(appId){
  if(!S.db) return;
  clearTimeout(kvTimers[appId]);
  kvTimers[appId]=setTimeout(function(){ put(S.refs.kv.doc(appId),{kv:S.kv[appId]}); },500);
}
window.addEventListener("message",function(e){
  var f=$("run-frame");
  if(!S.running || e.source!==f.contentWindow) return;
  var d=e.data; if(!d || !d.pad) return;
  var appId=S.running.id;
  if(d.op==="load"){
    getKv(appId).then(function(kv){ var v=Object.prototype.hasOwnProperty.call(kv,d.k)?kv[d.k]:null; f.contentWindow.postMessage({pad:1,op:"loaded",i:d.i,v:v},"*"); });
  } else if(d.op==="save" || d.op==="remove"){
    getKv(appId).then(function(kv){
      var next=Object.assign({},kv);
      if(d.op==="remove") delete next[d.k];
      else { try{ next[d.k]=JSON.parse(JSON.stringify(d.v)); }catch(err){ return; } }
      if(JSON.stringify(next).length>KV_BUDGET){ $("run-err-msg").textContent=tr("run.toobig"); $("run-err").hidden=false; return; }
      S.kv[appId]=next; saveKvSoon(appId);
    });
  } else if(d.op==="error"){
    $("run-err-msg").textContent=String(d.msg).slice(0,300);
    $("run-err").hidden=false;
  } else if(d.op==="exit"){
    show("home");
  } else if(d.op==="sfx"){
    if(APP_SFX.indexOf(d.name)<0) return;
    var now=Date.now(); if(now-sfxWindow.t>1000){ sfxWindow.t=now; sfxWindow.n=0; }
    if(++sfxWindow.n<=20) sfx(d.name);   /* at most 20 sounds a second per app */
  }
});
var sfxWindow={t:0,n:0};

/* two-tap confirm: the page builds its own confirmation instead of confirm() */
function resetConfirm(wrapId,btnId,label){
  var w=$(wrapId); w.textContent="";
  var b=document.createElement("button"); b.className="btn ghost"; b.type="button"; b.id=btnId; b.textContent=label||tr("common.delete");
  w.appendChild(b); b.onclick=function(){ armConfirm(wrapId,btnId,label); };
}
function armConfirm(wrapId,btnId,label){
  var w=$(wrapId); w.textContent="";
  var yes=document.createElement("button"); yes.className="btn"; yes.type="button"; yes.textContent=tr("common.confirm",{what:label||tr("common.delete")});
  var no=document.createElement("button"); no.className="btn ghost"; no.type="button"; no.textContent=tr("common.cancel");
  w.appendChild(yes); w.appendChild(no);
  no.onclick=function(){ resetConfirm(wrapId,btnId,label); };
  yes.onclick=function(){
    if(wrapId==="run-del-wrap" && S.running){ var n=appName(S.running); deleteApp(S.running.id); show("home"); toast(tr("run.removed",{name:n})); }
    if(wrapId==="note-del-wrap" && S.editing){ deleteNote(S.editing.id); show("notes"); }
    if(wrapId==="paint-clear-wrap"){ paintClear(); resetConfirm(wrapId,btnId,label); }
  };
}

/* ---------- notes ---------- */
function fmt(ts){ var d=new Date(ts||0); return (d.getMonth()+1)+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function renderNotes(){
  var ul=$("notes-list"); ul.textContent="";
  var list=S.notes.slice().sort(function(a,b){ return (b.updated||0)-(a.updated||0); });
  if(!list.length){ var li=document.createElement("li"); li.className="empty"; li.textContent=tr(S.db?"notes.empty":"notes.emptynodb"); ul.appendChild(li); return; }
  list.forEach(function(n){
    var li=document.createElement("li"), b=document.createElement("button"); b.type="button";
    var t=document.createElement("span"); t.className="t"; t.textContent=(n.body||"").split("\n")[0].trim()||tr("notes.blank");
    var d=document.createElement("span"); d.className="d"; d.textContent=fmt(n.updated);
    b.appendChild(t); b.appendChild(d); b.onclick=function(){ openNote(n); };
    li.appendChild(b); ul.appendChild(li);
  });
}
$("note-new").onclick=function(){
  var id=S.db?S.refs.notes.doc().id:uid();
  openNote({id:id, body:"", updated:Date.now(), fresh:true});
};
function openNote(n){
  S.editing={id:n.id, body:n.body||"", fresh:!!n.fresh};
  $("note-body").value=S.editing.body;
  $("note-state").textContent=tr(n.fresh?"notes.fresh":"notes.saved");
  resetConfirm("note-del-wrap","note-del",tr("common.delete"));
  show("note"); $("note-body").focus();
}
var noteTimer;
$("note-body").addEventListener("input",function(){
  if(!S.editing) return;
  S.editing.body=$("note-body").value; S.editing.dirty=true;
  $("note-state").textContent=tr("notes.editing");
  clearTimeout(noteTimer); noteTimer=setTimeout(flushNote,700);
});
function flushNote(){
  clearTimeout(noteTimer);
  var e=S.editing; if(!e || !e.dirty) return;
  e.dirty=false;
  var doc={body:e.body, updated:Date.now()};
  upsert("notes",{id:e.id, body:doc.body, updated:doc.updated});
  if(!S.db){ $("note-state").textContent=tr("notes.savedtemp"); return; }
  pending.notes[e.id]=true;
  $("note-state").textContent=tr("common.saving");
  put(S.refs.notes.doc(e.id),doc).then(function(ok){
    if(ok) delete pending.notes[e.id];
    if(S.editing===e) $("note-state").textContent=tr(ok?"notes.saved":"notes.savefail");
    if(!ok) e.dirty=true;
  });
}
function deleteNote(id){
  S.editing=null;
  dropLocal("notes",id);
  if(S.db) S.refs.notes.doc(id).delete().catch(function(){ toast(tr("notes.delfail")); });
}
$("note-back").onclick=function(){ flushNote(); S.editing=null; show("notes"); };

/* ---------- pixel paint: 96x96, four LCD tones ---------- */
var PW=96, TONES=[[31,42,20],[74,90,50],[125,138,88],[163,173,126]];
var P={px:new Uint8Array(PW*PW).fill(3), color:0, size:1, undo:[], loaded:false, drawing:false, last:null, saveTimer:null};
var pcv=$("paint-cv"), pctx=pcv.getContext("2d"), pimg=pctx.createImageData(PW,PW);
function paintRender(){
  var d=pimg.data;
  for(var i=0;i<P.px.length;i++){ var t=TONES[P.px[i]]; d[i*4]=t[0]; d[i*4+1]=t[1]; d[i*4+2]=t[2]; d[i*4+3]=255; }
  pctx.putImageData(pimg,0,0);
}
function paintPushUndo(){ P.undo.push(P.px.slice()); if(P.undo.length>20) P.undo.shift(); }
function paintDot(x,y){
  var r=P.size===1?0:1;
  for(var j=-r;j<=r;j++) for(var i=-r;i<=r;i++){ var xx=x+i, yy=y+j; if(xx>=0&&yy>=0&&xx<PW&&yy<PW) P.px[yy*PW+xx]=P.color; }
}
function paintLine(x0,y0,x1,y1){
  var dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1, err=dx+dy;
  for(;;){ paintDot(x0,y0); if(x0===x1&&y0===y1) break; var e2=2*err; if(e2>=dy){ err+=dy; x0+=sx; } if(e2<=dx){ err+=dx; y0+=sy; } }
}
function paintPos(ev){
  var r=pcv.getBoundingClientRect();
  return [Math.floor((ev.clientX-r.left)/r.width*PW), Math.floor((ev.clientY-r.top)/r.height*PW)];
}
pcv.addEventListener("pointerdown",function(ev){
  ev.preventDefault(); pcv.setPointerCapture(ev.pointerId);
  paintPushUndo(); P.drawing=true; P.last=paintPos(ev);
  paintDot(P.last[0],P.last[1]); paintRender();
});
pcv.addEventListener("pointermove",function(ev){
  if(!P.drawing) return;
  var p=paintPos(ev); paintLine(P.last[0],P.last[1],p[0],p[1]); P.last=p; paintRender();
});
function paintEnd(){ if(!P.drawing) return; P.drawing=false; paintSaveSoon(); }
pcv.addEventListener("pointerup",paintEnd); pcv.addEventListener("pointercancel",paintEnd);

Array.prototype.forEach.call(document.querySelectorAll(".sw"),function(b){
  b.onclick=function(){
    P.color=+b.getAttribute("data-c");
    Array.prototype.forEach.call(document.querySelectorAll(".sw"),function(o){ o.setAttribute("aria-checked", o===b ? "true" : "false"); });
  };
});
/* two brushes: a single pixel, or a 3x3 block */
function paintSizeLabel(){ $("paint-size").textContent=tr(P.size===1?"paint.fine":"paint.bold"); }
$("paint-size").onclick=function(){ P.size=P.size===1?3:1; paintSizeLabel(); };
$("paint-undo").onclick=function(){ var prev=P.undo.pop(); if(!prev){ toast(tr("paint.noundo")); return; } P.px=prev; paintRender(); paintSaveSoon(); };
function paintClear(){ paintPushUndo(); P.px=new Uint8Array(PW*PW).fill(3); paintRender(); paintSaveSoon(); }
resetConfirm("paint-clear-wrap","paint-clear",tr("paint.clear"));

/* import: crop to a square, stretch contrast, Bayer-dither to four tones */
var BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
$("paint-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f) return;
  var url=URL.createObjectURL(f), img=new Image();
  img.onload=function(){
    var side=Math.min(img.naturalWidth,img.naturalHeight);
    var sx=(img.naturalWidth-side)/2, sy=(img.naturalHeight-side)/2;
    var c=document.createElement("canvas"); c.width=c.height=PW;
    var x=c.getContext("2d"); x.imageSmoothingEnabled=true; x.drawImage(img,sx,sy,side,side,0,0,PW,PW);
    var d=x.getImageData(0,0,PW,PW).data, lum=new Float32Array(PW*PW), lo=1, hi=0;
    for(var i=0;i<lum.length;i++){ var v=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255; lum[i]=v; if(v<lo) lo=v; if(v>hi) hi=v; }
    var span=Math.max(0.05,hi-lo);
    paintPushUndo();
    for(var y=0;y<PW;y++) for(var xx=0;xx<PW;xx++){
      var k=y*PW+xx, v=(lum[k]-lo)/span, t=(BAYER[(y%4)*4+(xx%4)]+0.5)/16-0.5;
      P.px[k]=Math.max(0,Math.min(3,Math.round(v*3+t)));
    }
    URL.revokeObjectURL(url); paintRender(); paintSaveSoon(); toast(tr("paint.imported"));
  };
  img.onerror=function(){ URL.revokeObjectURL(url); toast(tr("paint.badimg")); };
  img.src=url;
});

/* export: scale up 8x with hard pixels, hand to the viewer's save dialog */
$("paint-export").onclick=function(){
  if(!S.downloads){ toast(tr("paint.noexport")); return; }
  var big=document.createElement("canvas"); big.width=big.height=PW*8;
  var bx=big.getContext("2d"); bx.imageSmoothingEnabled=false; bx.drawImage(pcv,0,0,big.width,big.height);
  big.toBlob(function(blob){
    if(!blob){ toast(tr("paint.genfail")); return; }
    var d=new Date(), stamp=d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")+"-"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0");
    S.downloads.save({filename:"lopda-"+stamp+".png", data:blob}).then(function(r){
      if(r && r.status==="saved") toast(tr("paint.exported"));
    }).catch(function(e){
      var c=e&&e.code;
      if(c==="declined") return;
      toast(c==="rate_limited" ? tr("save.busy") : tr("save.failed",{code:c||tr("common.unknown")}));
    });
  },"image/png");
};

/* persistence: the 9216 pixels as a digit string, one document */
function paintSaveSoon(){
  if(!S.db) { $("paint-state").textContent=tr("paint.unsaved"); return; }
  clearTimeout(P.saveTimer);
  $("paint-state").textContent=tr("common.saving");
  P.saveTimer=setTimeout(function(){
    put(S.refs.paint,{px:Array.prototype.join.call(P.px,""), updated:Date.now()}).then(function(ok){ $("paint-state").textContent=tr(ok?"paint.saved":"paint.savefail"); });
  },1200);
}
/* ---------- pixel camera: a roll of film. Frames are fixed once taken; a full roll is developed out. ---------- */
var CW=128, CH=112;
var F={roll:null, size:12, res:1, tint:"lcd", loaded:0, exposure:0, contrast:0, date:true, frames:[], ready:false};
var ccv=$("cam-cv"), cctx=ccv.getContext("2d"), cimg=cctx.createImageData(CW,CH);
/* film stock: 1 = 128x112 standard, 2 = 256x224 fine grain. Fixed for the life of a roll. */
/* film tints: the four tones a roll develops in. The handheld's own screen always stays green. */
/* name: the Chinese tint name, kept as data; it is printed on film output in zh mode only */
var TINTS={
  lcd:   {name:"绿屏", en:"LCD",    tones:[[31,42,20],[74,90,50],[125,138,88],[163,173,126]]},
  sepia: {name:"暖褐", en:"SEPIA",  tones:[[43,29,20],[107,74,50],[168,128,90],[230,210,176]]},
  sakura:{name:"樱粉", en:"SAKURA", tones:[[58,31,43],[138,74,99],[212,138,163],[246,219,227]]},
  cyano: {name:"晒蓝", en:"CYANO",  tones:[[16,36,58],[47,92,134],[111,159,196],[214,230,240]]},
  mono:  {name:"黑白", en:"MONO",   tones:[[27,27,27],[90,90,90],[158,158,158],[232,230,225]]}
};
var TINT_ORDER=["lcd","sepia","sakura","cyano","mono"];
function tintOf(id){ return TINTS[id]||TINTS.lcd; }
/* the tint as the screen calls it: Chinese name in zh, the English one in en */
function tintLabel(id){ var T=tintOf(id); return I18N.lang==="zh"?T.name:T.en; }
/* the tint as film output prints it: "SAKURA 樱粉" in zh, "SAKURA" in en */
function tintPrint(id){ var T=tintOf(id); return I18N.lang==="zh"?T.en+" "+T.name:T.en; }
var nextTint="lcd";
function setRes(r){ r=r===2?2:1; F.res=r; CW=128*r; CH=112*r; ccv.width=CW; ccv.height=CH; cimg=cctx.createImageData(CW,CH); }
function stockName(r){ return tr(r===2?"cam.stock2":"cam.stock1"); }
function filmDoc(){ return {roll:F.roll,size:F.size,res:F.res,tint:F.tint,loaded:F.loaded,exposure:F.exposure,contrast:F.contrast,date:F.date}; }
var nextStock=1, nextSize=12;
function drawPx(ctx,img,px){
  var d=img.data;
  for(var i=0;i<px.length;i++){ var t=TONES[px[i]]; d[i*4]=t[0]; d[i*4+1]=t[1]; d[i*4+2]=t[2]; d[i*4+3]=255; }
  ctx.putImageData(img,0,0);
}
function lumaOf(img,w,h){
  var ar=w/h, iw=img.naturalWidth, ih=img.naturalHeight, sw=iw, sh=iw/ar;
  if(sh>ih){ sh=ih; sw=ih*ar; }
  var c=document.createElement("canvas"); c.width=w; c.height=h;
  var x=c.getContext("2d"); x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high";
  x.drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,0,0,w,h);
  var d=x.getImageData(0,0,w,h).data, lum=new Float32Array(w*h);
  for(var i=0;i<lum.length;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255;
  return lum;
}
function ditherLuma(lum,w,h,exposure,contrast){
  var hist=new Uint32Array(256), N=lum.length;
  for(var q=0;q<N;q++) hist[Math.min(255,Math.max(0,(lum[q]*255)|0))]++;
  var pct=function(f){ var want=N*f, acc=0; for(var b=0;b<256;b++){ acc+=hist[b]; if(acc>want) return b/255; } return 1; };
  var lo=pct(0.02), hi=pct(0.98), span=Math.max(0.05,hi-lo);
  var out=new Uint8Array(w*h), gain=Math.pow(1.35,exposure);
  for(var y=0;y<h;y++) for(var x=0;x<w;x++){
    var k=y*w+x, v=(lum[k]-lo)/span;
    var nb=0,n=0; if(x>0){nb+=lum[k-1];n++} if(x<w-1){nb+=lum[k+1];n++} if(y>0){nb+=lum[k-w];n++} if(y<h-1){nb+=lum[k+w];n++}
    v+= ((lum[k]-nb/n)/span)*0.6;
    if(contrast) v=0.5+(v-0.5)*Math.pow(1.3,contrast);
    v=Math.pow(Math.max(0,Math.min(1,v)),1/gain);
    var t=(BAYER[(y%4)*4+(x%4)]+0.5)/16-0.5;
    out[k]=Math.max(0,Math.min(3,Math.round(v*3+t)));
  }
  return out;
}
function pxFromString(str){ var px=new Uint8Array(str.length); for(var i=0;i<str.length;i++) px[i]=str.charCodeAt(i)-48; return px; }
function stampOf(ts){ var d=new Date(ts); return String(d.getFullYear()).slice(2)+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0")+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function pad2(n){ return String(n).padStart(2,"0"); }
function fileStamp(ts){ var d=new Date(ts); return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate()); }
function rollFull(){ return F.roll && F.frames.length>=F.size; }
function frameStamp(fr){ return fr.blank==="dark" ? tr("cam.unexposed") : fr.blank==="light" ? tr("cam.fogged") : stampOf(fr.taken); }

function camIdle(){
  var px=new Uint8Array(CW*CH);
  for(var y=0;y<CH;y++) for(var x=0;x<CW;x++){ var band=Math.floor(x/(CW/4)); px[y*CW+x]= (y>CH*0.78) ? ((x>>3)+(y>>3))%2*3 : band; }
  drawPx(cctx,cimg,px);
}

function renderCam(){
  var has=!!F.roll, full=rollFull();
  $("cam-count").textContent= has ? pad2(Math.min(F.frames.length+(full?0:1),F.size))+"/"+pad2(F.size) : "--/--";
  $("cam-film").textContent= has ? tr("cam.lcd",{en:tintOf(F.tint).en, name:tintOf(F.tint).name, stock:tr(F.res===2?"cam.stock.s2":"cam.stock.s1")}) : tr(F.ready?"cam.nofilm":"cam.reading");
  var sg=function(v){ return (v>0?"+":v<0?"−":"±")+Math.abs(v); };
  $("cam-exp").textContent=tr("cam.exp",{b:sg(F.exposure), c:sg(F.contrast)});
  $("cam-date").className=F.date?"":"off";
  var shooting=has && !full;
  ["cam-shutter","ck-dark","ck-bright"].forEach(function(id){ $(id).disabled=!shooting; });
  if(F.ready && !has && CAM.mode!=="load") camSheet("load");
  else if(has && full && CAM.mode!=="menu") camMenu("develop");
  else if(has && !full && CAM.mode==="load") camSheet(null);
  camModeLabel(); camLayout();
}

/* date back: a 3x5 digit font burned into the lower right corner, like a quartz-date camera */
var DIGITS={"0":"111101101101111","1":"010110010010111","2":"111001111100111","3":"111001111001111","4":"101101111001001","5":"111100111001111","6":"111100111101111","7":"111001010010010","8":"111101111101111","9":"111101111001111","'":"1100","-":"000000111000000"};
function burnDate(px,w,h,ts,s){
  var d=new Date(ts), text="'"+String(d.getFullYear()).slice(2)+" "+pad2(d.getMonth()+1)+" "+pad2(d.getDate());
  var glyphs=[], width=0;
  text.split("").forEach(function(ch){ var gw = ch==="'" ? 1 : ch===" " ? 2 : 3; glyphs.push([ch,gw]); width+=gw+1; });
  width-=1;
  var x0=w-(4+width)*s, y0=h-(4+5)*s, lit=[];
  var cx=0;
  glyphs.forEach(function(g){
    var bits=DIGITS[g[0]];
    if(bits) for(var r=0;r<5;r++) for(var c=0;c<g[1];c++){ if(bits[r*g[1]+c]==="1") lit.push([cx+c,r]); }
    cx+=g[1]+1;
  });
  var plot=function(ux,uy,tone){ for(var a=0;a<s;a++) for(var b=0;b<s;b++){ var X=x0+ux*s+a, Y=y0+uy*s+b; if(X>=0&&Y>=0&&X<w&&Y<h) px[Y*w+X]=tone; } };
  /* light digits with a shadow on dark ground, dark digits on light ground */
  var sum=0,cnt=0;
  for(var yy=y0;yy<y0+5*s;yy++) for(var xx=x0;xx<x0+width*s;xx++){ if(xx>=0&&yy>=0&&xx<w&&yy<h){ sum+=px[yy*w+xx]; cnt++; } }
  if(cnt && sum/cnt>=1.6){ lit.forEach(function(p){ plot(p[0],p[1],0); }); }
  else { lit.forEach(function(p){ plot(p[0]+1,p[1]+1,0); }); lit.forEach(function(p){ plot(p[0],p[1],3); }); }
}
function toggleDate(){
  F.date=!F.date; renderCam(); saveFilmSoon();
}
function saveFilmSoon(){ if(S.db && F.roll){ clearTimeout(expTimer); expTimer=setTimeout(function(){ put(S.refs.film,filmDoc()); },800); } }

/* exposure is a setting for the next frame, never an edit of a taken one */
var expTimer=null;
function setExposure(v){ v=LoClamp(v,-3,3); if(v===F.exposure) return; F.exposure=v; sfx("tick"); renderCam(); saveFilmSoon(); }
function setContrast(v){ v=LoClamp(v,-3,3); if(v===F.contrast) return; F.contrast=v; sfx("tick"); renderCam(); saveFilmSoon(); }
function LoClamp(v,a,b){ return v<a?a:v>b?b:v; }
$("ck-dark").onclick=function(){ setExposure(F.exposure-1); };
$("ck-bright").onclick=function(){ setExposure(F.exposure+1); };
$("ck-menu").onclick=function(){ if(F.roll && !rollFull()) camMenu("body"); };

function loadRoll(){
  setRes(nextStock); F.tint=nextTint; F.contrast=0; F.exposure=0;
  F.roll="r"+Date.now().toString(36); F.size=nextSize; F.loaded=Date.now(); F.frames=[];
  if(S.db) put(S.refs.film,filmDoc());
  /* the door closes, the film is wound on to frame 1 */
  sfx("tap"); setTimeout(function(){ sfx("tick"); },120); setTimeout(function(){ sfx("tick"); },240); setTimeout(function(){ sfx("ok"); },420);
  camSheet(null); camIdle(); renderCam(); startLive();
  toast(tr("cam.loaded",{en:tintOf(F.tint).en, name:tintOf(F.tint).name, fine:F.res===2?tr("cam.loadedfine"):"", n:F.size}));
}

/* ---- live viewfinder: the camera feed dithered to the LCD in real time (needs HTTPS) ---- */
var LIVE={stream:null, on:false, raf:0, last:0, facing:"environment", hold:0, failed:false,
  cv:document.createElement("canvas"), ctx:null};
LIVE.ctx=LIVE.cv.getContext("2d",{willReadFrequently:true});
function lumaFrom(src,sw,sh,w,h,mirror){
  var ar=w/h, cw=sw, ch=sw/ar; if(ch>sh){ ch=sh; cw=sh*ar; }
  if(LIVE.cv.width!==w||LIVE.cv.height!==h){ LIVE.cv.width=w; LIVE.cv.height=h; }
  var x=LIVE.ctx; x.save(); x.imageSmoothingEnabled=true;
  if(mirror){ x.translate(w,0); x.scale(-1,1); }
  x.drawImage(src,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,w,h); x.restore();
  var d=x.getImageData(0,0,w,h).data, lum=new Float32Array(w*h);
  for(var i=0;i<lum.length;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255;
  return lum;
}
function liveSupported(){ return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
function camModeLabel(){
  var has=!!F.roll && !rollFull();
  $("cam-mode").textContent = !has ? "" : LIVE.on ? "" :
    (liveSupported() ? (LIVE.failed ? tr("cam.nolive") : "") : tr("cam.needhttps"));
  $("cam-live-tag").hidden=!LIVE.on;
}
function startLive(){
  if(LIVE.on || !liveSupported() || !F.roll || rollFull()) { camModeLabel(); return; }
  navigator.mediaDevices.getUserMedia({video:{facingMode:LIVE.facing, width:{ideal:640}, height:{ideal:480}}, audio:false}).then(function(stream){
    if($("v-cam").hidden || !F.roll || rollFull()){ stream.getTracks().forEach(function(t){ t.stop(); }); return; }
    LIVE.stream=stream; LIVE.on=true; LIVE.failed=false;
    var v=$("cam-video"); v.srcObject=stream; var pl=v.play(); if(pl&&pl.catch) pl.catch(function(){});
    camModeLabel(); LIVE.raf=requestAnimationFrame(liveTick);
  }).catch(function(e){
    LIVE.failed=true; camModeLabel();
    if(e && e.name==="NotAllowedError") toast(tr("cam.denied"));
  });
}
function stopLive(){
  cancelAnimationFrame(LIVE.raf); LIVE.on=false;
  if(LIVE.stream){ LIVE.stream.getTracks().forEach(function(t){ t.stop(); }); LIVE.stream=null; }
  var v=$("cam-video"); if(v) v.srcObject=null;
  if(!$("v-cam").hidden) camModeLabel();
}
function liveTick(t){
  if(!LIVE.on) return;
  LIVE.raf=requestAnimationFrame(liveTick);
  if(t-LIVE.last<80) return;          /* about 12 frames a second is plenty for an LCD */
  LIVE.last=t;
  var v=$("cam-video");
  if(Date.now()<LIVE.hold || v.readyState<2 || !v.videoWidth) return;
  var lum=lumaFrom(v,v.videoWidth,v.videoHeight,CW,CH,LIVE.facing==="user");
  drawPx(cctx,cimg,ditherLuma(lum,CW,CH,F.exposure,F.contrast));
}
function flipLens(){ if(!LIVE.on) return; LIVE.facing = LIVE.facing==="environment" ? "user" : "environment"; sfx("tap"); stopLive(); startLive(); }
function takeFrame(px){
  var n=F.frames.length+1, now=Date.now();
  if(F.date) burnDate(px,CW,CH,now,F.res);
  var fr={roll:F.roll, n:n, px:Array.prototype.join.call(px,""), taken:now, dated:F.date};
  F.frames.push(fr);
  /* film: you never see the frame. The shutter blinks, the film winds on. */
  sfx("shutter"); $("cam-shut").hidden=false; LIVE.hold=Date.now()+320;
  setTimeout(function(){ $("cam-shut").hidden=true; if(!LIVE.on) camIdle(); },160);
  setTimeout(function(){ sfx("tick"); },260); setTimeout(function(){ sfx("tick"); },360);
  renderCam();
  if(S.db) put(S.refs.frames.doc(F.roll+"-"+pad2(n)),fr).then(function(ok){ if(!ok) toast(tr("cam.lost")); });
  if(rollFull()){ toast(tr("cam.last")); stopLive(); }
}
$("cam-shutter").onclick=function(){ shoot(); };
function shoot(){
  if(!F.roll || rollFull() || !$("cam-shut").hidden) return;
  var v=$("cam-video");
  if(LIVE.on && v.videoWidth){
    var lum=lumaFrom(v,v.videoWidth,v.videoHeight,CW,CH,LIVE.facing==="user");
    takeFrame(ditherLuma(lum,CW,CH,F.exposure,F.contrast));
    return;
  }
  $("cam-file").click();
}
$("cam-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f || !F.roll || rollFull()) return;
  $("cam-dev").hidden=false;
  var url=URL.createObjectURL(f), img=new Image();
  img.onload=function(){
    var px=ditherLuma(lumaOf(img,CW,CH),CW,CH,F.exposure,F.contrast); URL.revokeObjectURL(url);
    $("cam-dev").hidden=true; takeFrame(px);
  };
  img.onerror=function(){ URL.revokeObjectURL(url); $("cam-dev").hidden=true; toast(tr("cam.badphoto")); };
  img.src=url;
});

/* ---- the strip: one wide PNG laid out like a 35mm negative strip, frames left to right.
   Frame pixels are written straight into ImageData: Safari can swap red/blue when a
   canvas is drawn onto another canvas right after putImageData. ---- */
var STRIP={S:2, H:320, LEAD:200, TRAIL:64, PITCH:272, FW:256, FH:224, FY:48};
function stripWidth(n){ return STRIP.LEAD + n*STRIP.PITCH - (STRIP.PITCH-STRIP.FW) + STRIP.TRAIL; }
function rgb(t){ return "rgb("+TONES[t].join(",")+")"; }
function buildStrip(frames,size,loaded,tintId){
  var T=tintOf(tintId), PAL=T.tones, rgb=function(t){ return "rgb("+PAL[t].join(",")+")"; };
  var n=frames.length, c=document.createElement("canvas"); c.width=stripWidth(n); c.height=STRIP.H;
  var x=c.getContext("2d",{willReadFrequently:true});
  x.fillStyle=rgb(0); x.fillRect(0,0,c.width,c.height);
  for(var hx=0;hx<c.width;hx+=30){ x.fillStyle=rgb(1); x.fillRect(hx+9,8,12,14); x.fillRect(hx+9,STRIP.H-22,12,14); }
  x.textBaseline="top";
  var fit=function(text,px,y,tone){ var sz=px; do{ x.font=sz+'px "VT323", monospace'; sz--; } while(x.measureText(text).width>STRIP.LEAD-40 && sz>8); x.fillStyle=rgb(tone); x.fillText(text,24,y); };
  fit("LO-PDA",30,70,2); fit((F.res===2?"FINE GRAIN":"PIXEL FILM")+" "+T.en,22,104,2); fit(size+" EXP",22,130,2);
  fit("LOADED "+stampOf(loaded).slice(0,8),16,172,1); fit("DEV    "+stampOf(Date.now()).slice(0,8),16,192,1);
  frames.forEach(function(fr,k){
    var fx=STRIP.LEAD+k*STRIP.PITCH;
    x.fillStyle=rgb(2); x.font='16px "VT323", monospace'; x.fillText(pad2(k+1),fx,26);
  });
  x.fillStyle=rgb(1); x.font='18px "VT323", monospace'; x.fillText("END",c.width-STRIP.TRAIL+12,STRIP.H/2-9);
  /* edge print in the bottom rebate, as on real film: maker, stock, and a frame number every frame */
  x.font='15px "VT323", monospace';
  frames.forEach(function(fr,k){
    var fx=STRIP.LEAD+k*STRIP.PITCH;
    x.fillStyle=rgb(1); x.fillText(k%2 ? "LO-PDA  "+T.en : (F.res===2?"FINE ":"")+"PIXEL FILM",fx+4,STRIP.FY+STRIP.FH+5);
    x.fillStyle=rgb(2); x.fillText(String(k+1)+"▸",fx+STRIP.FW-26,STRIP.FY+STRIP.FH+5);
  });
  /* frames last, as raw pixels at 2x */
  var sc=STRIP.FW/CW;   /* 2 for standard film, 1 for fine grain: the strip geometry stays the same */
  frames.forEach(function(fr,k){
    var img=x.createImageData(STRIP.FW,STRIP.FH), d=img.data, px=pxFromString(fr.px);
    for(var y=0;y<STRIP.FH;y++) for(var xx=0;xx<STRIP.FW;xx++){
      var t=PAL[px[Math.floor(y/sc)*CW+Math.floor(xx/sc)]], o=(y*STRIP.FW+xx)*4;
      d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255;
    }
    x.putImageData(img,STRIP.LEAD+k*STRIP.PITCH,STRIP.FY);
  });
  return c;
}
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
async function developStrip(){
  if(!rollFull()) return;
  try{ if(document.fonts && document.fonts.load) await document.fonts.load('22px "VT323"'); }catch(err){}
  var cv=buildStrip(F.frames,F.size,F.loaded,F.tint);
  saveCanvas(cv,"lopda-film-"+fileStamp(F.loaded)+"-"+F.size+"exp.png").then(function(r){ if(r&&r.status==="saved") sfx("ok"), toast(tr("cam.developed")); },function(e){ toast(saveErr(e)); });
}

/* ---- the 3:4 contact-sheet card: a whole roll laid out on photo paper, sized for sharing ---- */
var CARD={W:1080, H:1440, PAPER:[241,236,225], INK:"#2b2a26", SOFT:"#8a857a"};
function fontsReady(){
  try{ if(document.fonts && document.fonts.load) return Promise.all([document.fonts.load('40px "VT323"'),document.fonts.load('28px "DotGothic16"')]).catch(function(){}); }catch(e){}
  return Promise.resolve();
}
/* draw a frame's pixels into a w x h block of the card (nearest neighbour, no canvas-to-canvas copy) */
function putFrame(x,px,pw,ph,pal,dx,dy,w,h){
  var img=x.createImageData(w,h), d=img.data;
  for(var y=0;y<h;y++){ var sy=Math.min(ph-1,Math.floor(y*ph/h)); for(var xx=0;xx<w;xx++){
    var t=pal[px[sy*pw+Math.min(pw-1,Math.floor(xx*pw/w))]], o=(y*w+xx)*4; d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255; } }
  x.putImageData(img,dx,dy);
}
/* The contact sheet, made the way a lab makes one: the developed strip is cut into pieces of a
   few frames, the pieces are laid side by side on paper, and the paper is printed. Frame numbers
   and edge print come from the film itself; a short last piece simply leaves paper showing. */
function buildCard(frames,size,loaded,tintId){
  var T=tintOf(tintId), n=frames.length;
  var strip=buildStrip(frames,size,loaded,tintId), sw=strip.width, sd=strip.getContext("2d").getImageData(0,0,sw,STRIP.H).data;
  var c=document.createElement("canvas"); c.width=CARD.W; c.height=CARD.H;
  var x=c.getContext("2d");
  x.fillStyle="rgb("+CARD.PAPER.join(",")+")"; x.fillRect(0,0,c.width,c.height);
  var MX=72, TOP=236, BOTTOM=110, GAP=26, avail=CARD.H-TOP-BOTTOM, innerW=CARD.W-2*MX;
  /* frames per piece: whichever lets the pieces be printed largest */
  var per=3, s=0;
  [3,4,5,6].forEach(function(k){
    var rows=Math.ceil(n/k), sc=Math.min(innerW/(k*STRIP.PITCH), (avail-(rows-1)*GAP)/(rows*STRIP.H));
    if(sc>s+1e-6){ s=sc; per=k; }
  });
  var rows=Math.ceil(n/per), pieceH=Math.round(STRIP.H*s), blockW=Math.round(per*STRIP.PITCH*s);
  var ox=Math.round((CARD.W-blockW)/2), oy=TOP+Math.round((avail-(rows*pieceH+(rows-1)*GAP))/2);
  x.textBaseline="alphabetic";
  x.fillStyle=CARD.INK; x.font='76px "VT323", monospace'; x.fillText("LO-PDA",MX,128);
  x.font='30px "VT323", "DotGothic16", monospace'; x.textAlign="right";
  x.fillText(String(new Date(loaded).getFullYear())+"."+pad2(new Date(loaded).getMonth()+1)+"."+pad2(new Date(loaded).getDate()),CARD.W-MX,126);
  x.textAlign="left"; x.fillStyle=CARD.SOFT; x.font='26px "DotGothic16", "VT323", monospace';
  x.fillText((F.res===2?"FINE GRAIN":"PIXEL FILM")+" · "+tintPrint(tintId)+" · "+size+" EXP",MX,176);
  x.fillStyle=CARD.INK; x.fillRect(MX,200,CARD.W-2*MX,3);
  x.textAlign="center"; x.fillStyle=CARD.SOFT; x.font='24px "VT323", monospace';
  x.fillText("· shot on lo-pda ·",CARD.W/2,CARD.H-56);
  x.textAlign="left";
  /* pieces last, copied pixel by pixel (never drawImage: Safari swaps red and blue on that path) */
  var seed=(loaded|0)>>>0;
  for(var r=0;r<rows;r++){
    var first=r*per, count=Math.min(per,n-first);
    var sx0=STRIP.LEAD+first*STRIP.PITCH-(STRIP.PITCH-STRIP.FW)/2, srcW=count*STRIP.PITCH;
    var dw=Math.round(srcW*s), dh=pieceH;
    seed=(seed*1103515245+12345)>>>0;
    var jx=(seed>>>16)%7-3;                    /* hand-laid: each piece sits a little off */
    var img=x.createImageData(dw,dh), d=img.data;
    for(var yy=0;yy<dh;yy++){
      var sy=Math.min(STRIP.H-1,Math.floor(yy/s));
      for(var xx=0;xx<dw;xx++){
        var sxp=Math.min(sw-1,Math.floor(sx0+xx/s)), so=(sy*sw+sxp)*4, o=(yy*dw+xx)*4;
        d[o]=sd[so]; d[o+1]=sd[so+1]; d[o+2]=sd[so+2]; d[o+3]=255;
      }
    }
    x.putImageData(img,ox+jx,oy+r*(pieceH+GAP));
  }
  return c;
}
function developCard(){
  if(!rollFull() || CAM.busy) return;
  CAM.busy=true;
  fontsReady().then(function(){
    var cv=buildCard(F.frames,F.size,F.loaded,F.tint);
    return saveCanvas(cv,"lopda-card-"+fileStamp(F.loaded)+"-"+F.tint+".png");
  }).then(function(r){ if(r&&r.status==="saved"){ sfx("ok"); toast(tr("cam.carded")); } },function(e){ toast(saveErr(e)); })
    .then(function(){ CAM.busy=false; });
}

/* taking the roll out clears it from the handheld */
function removeRoll(){
  var old=F.frames.slice(), oldRoll=F.roll;
  F.roll=null; F.frames=[];
  if(S.db){
    S.refs.film.delete().catch(function(){});
    old.reduce(function(pr,fr){ return pr.then(function(){ return S.refs.frames.doc(oldRoll+"-"+pad2(fr.n)).delete().catch(function(){}); }); },Promise.resolve());
  }
  stopLive(); camIdle(); camSheet(null); renderCam();
}

/* rewind early: the unshot frames get fogged and develop white */
function rewindEarly(){
  if(!F.roll || rollFull()) return;
  var fill=new Array(CW*CH+1).join("3"), now=Date.now(), writes=[];
  for(var n=F.frames.length+1;n<=F.size;n++){
    var fr={roll:F.roll, n:n, px:fill, taken:now, blank:"light"};
    F.frames.push(fr);
    if(S.db) writes.push([S.refs.frames.doc(F.roll+"-"+pad2(n)),fr]);
  }
  stopLive(); camIdle(); camSheet(null);
  for(var k=0;k<6;k++) setTimeout(function(){ sfx("tick"); },k*70);
  toast(tr("cam.rewound")); renderCam();
  writes.reduce(function(pr,w){ return pr.then(function(){ return put(w[0],w[1]); }); },Promise.resolve());
}

function loadFilm(){
  if(!S.db){ F.ready=true; renderCam(); return Promise.resolve(); }
  return S.refs.film.get().then(function(sn){
    var d=sn.exists?own(sn.data()):null;
    if(!d || !d.roll){ F.roll=null; F.frames=[]; F.ready=true; return; }
    F.roll=d.roll; F.size=Math.min(d.size||12,16); F.loaded=d.loaded||Date.now(); F.exposure=d.exposure|0; F.contrast=d.contrast|0; F.date=d.date!==false; F.tint=TINTS[d.tint]?d.tint:"lcd"; setRes(d.res||1);
    return S.refs.frames.where("roll","==",F.roll).get().then(function(q){
      var list=q.docs.map(function(x){ return own(x.data()); }).filter(function(fr){ return fr && fr.px && fr.px.length===CW*CH; });
      list.sort(function(a,b){ return a.n-b.n; });
      F.frames=list; F.ready=true;
    });
  }).catch(function(e){ F.ready=true; toast(tr("cam.readfail",{code:(e&&e.code)||tr("common.unknown")})); });
}

var camLinked=false, bootTimer=null;
function camBoot(){
  var box=$("cam-boot"), reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(camLinked || reduce){ camLinked=true; return; }
  var film = F.roll ? tr("cam.boot.filmof",{name:tintLabel(F.tint), stock:stockName(F.res), n:F.frames.length, size:F.size}) : tr("cam.boot.nofilm");
  var shake=tr("cam.boot.shake"), sep=I18N.lang==="zh"?" ： ":": ";
  var lines=[[tr("cam.boot.slot"),"…",380],[tr("cam.boot.found"),tr("cam.boot.lens"),420],[shake,"",0],[tr("cam.boot.fw"),"CAM-OS 1.03",300],[tr("cam.boot.film"),film,360],["",tr("cam.boot.done"),500]];
  box.textContent=""; box.hidden=false;
  var skip=document.createElement("div"); skip.className="skip"; skip.textContent=tr("cam.boot.skip");
  var done=function(){ clearTimeout(bootTimer); clearInterval(bootTimer); camLinked=true; box.hidden=true; box.onclick=null; };
  box.onclick=done;
  var i=0;
  (function next(){
    if(box.hidden) return;
    if(i>=lines.length){ bootTimer=setTimeout(done,700); return; }
    var L=lines[i++], d=document.createElement("div"); d.className="ln";
    box.insertBefore(d,skip.parentNode?skip:null);
    if(!skip.parentNode) box.appendChild(skip);
    if(L[0]===shake){
      var n=0; d.className="ln bar8";
      bootTimer=setInterval(function(){
        n++; if(n===1) sfx("modem"); d.textContent=shake+" ["+"█".repeat(n)+"░".repeat(10-n)+"]";
        if(n>=10){ clearInterval(bootTimer); d.textContent=shake+" [██████████] OK"; bootTimer=setTimeout(next,240); sfx("ok"); }
      },70);
      return;
    }
    d.textContent=L[0] ? L[0]+" … " : "";
    bootTimer=setTimeout(function(){ d.textContent=(L[0]?L[0]+(L[1]!=="…"?sep:" "):"")+L[1]; bootTimer=setTimeout(next,L[2]); },260);
  })();
}
function openCam(){
  CAM.mode=null; camSheet(null);
  show("cam"); showPad(true); renderCam(); camIdle();
  var go=function(){ camBoot(); renderCam(); startLive(); };
  if(F.ready) go(); else loadFilm().then(go);
}

/* ---- camera controls: the screen is one fixed panel; the back opens for rolls and menus.
   Chin buttons, after the Game Boy Camera: A shutter, up/down brightness, left/right contrast,
   START body menu, SELECT turn the lens around. The key strip on screen does the same by touch. ---- */
var CAM={mode:null, menu:null, sel:0, busy:false, roll:0};
function camSheet(name){
  CAM.mode=name;
  $("cam-load").hidden=name!=="load";
  $("cam-menu").hidden=name!=="menu";
  if(name) stopLive();
  if(name==="load") buildRolls();
}
function camMenu(kind){
  var left=F.size-F.frames.length, M;
  /* titles, labels and notes are keys, so an open menu redraws in the new language */
  if(kind==="body") M={title:"cam.menu.body", note:"", back:function(){ camSheet(null); renderCam(); startLive(); }, items:[
    {label:"cam.menu.date", value:function(){ return tr(F.date?"set.on":"set.off"); }, pick:function(){ toggleDate(); }},
    {label:"cam.menu.lens", value:function(){ return tr(LIVE.facing==="user"?"cam.menu.front":"cam.menu.back"); }, pick:function(){ LIVE.facing = LIVE.facing==="environment" ? "user" : "environment"; }},
    {label:"cam.menu.rewind", value:function(){ return tr("cam.menu.left",{n:left}); }, pick:function(){ camMenu("rewind"); }},
    {label:"cam.menu.finder", pick:function(){ M.back(); }}
  ]};
  else if(kind==="rewind") M={title:"cam.menu.rewind", note:"cam.menu.rewindnote", back:function(){ camMenu("body"); }, items:[
    {label:"cam.menu.rewindgo", pick:function(){ rewindEarly(); }},
    {label:"common.cancel", pick:function(){ camMenu("body"); }}
  ]};
  else if(kind==="develop") M={title:"cam.menu.done", note:"cam.menu.donenote", back:null, items:[
    {label:"cam.menu.strip", pick:function(){ developStrip(); }},
    {label:"cam.menu.card", pick:function(){ developCard(); }},
    {label:"cam.menu.swap", pick:function(){ camMenu("remove"); }}
  ]};
  else if(kind==="remove") M={title:"cam.menu.remove", note:"cam.menu.removenote", back:function(){ camMenu("develop"); }, items:[
    {label:"cam.menu.removego", pick:function(){ removeRoll(); }},
    {label:"cam.menu.wait", pick:function(){ camMenu("develop"); }}
  ]};
  M.left=left; CAM.menu=M; CAM.sel=0; camSheet("menu"); drawMenu();
}
function drawMenu(){
  var M=CAM.menu; $("menu-title").textContent=tr(M.title); $("menu-note").textContent=M.note?tr(M.note,{n:M.left}):"";
  var ul=$("menu-list"); ul.textContent="";
  M.items.forEach(function(it,i){
    var li=document.createElement("li"); li.className=i===CAM.sel?"on":"";
    li.appendChild(document.createTextNode(tr(it.label)));
    if(it.value){ var v=document.createElement("small"); v.textContent=it.value(); li.appendChild(v); }
    li.onclick=function(){ CAM.sel=i; drawMenu(); menuPick(); };
    ul.appendChild(li);
  });
  document.querySelector("#cam-menu .menu-keys").textContent=tr("cam.menu.keys")+(M.back?tr("cam.menu.keysback"):"");
}
function menuPick(){ var it=CAM.menu.items[CAM.sel]; sfx("tap"); it.pick(); if(CAM.mode==="menu" && CAM.menu && CAM.menu.items.indexOf(it)>=0) drawMenu(); }

/* the roll picker: canisters on a shelf, slide them sideways */
var ROLL_PATTERN={
  lcd:   function(x,y){ return y%6===0 ? 3 : 1; },
  sepia: function(x,y){ return (x+y)%6<3 ? 1 : 2; },
  sakura:function(x,y){ var a=x%8, b=y%8; return (a===3&&b===3)||(a===2&&b===3)||(a===4&&b===3)||(a===3&&b===2)||(a===3&&b===4) ? 0 : (a===3&&b===3)?3:2; },
  cyano: function(x,y){ return (y+Math.round(Math.sin(x/2)*1.5))%5===0 ? 3 : 1; },
  mono:  function(x,y){ return ((x>>1)+(y>>1))%2 ? 0 : 2; }
};
function drawCanister(cv,id){
  var W=48,H=64, x=cv.getContext("2d"), img=x.createImageData(W,H), d=img.data, px=new Uint8Array(W*H).fill(255);
  var put=function(X,Y,t){ if(X>=0&&Y>=0&&X<W&&Y<H) px[Y*W+X]=t; };
  var rect=function(x0,y0,w,h,t){ for(var Y=y0;Y<y0+h;Y++) for(var X=x0;X<x0+w;X++) put(X,Y,t); };
  rect(19,0,10,6,0); rect(21,1,6,4,2);                 /* spool knob */
  rect(7,6,34,5,0); rect(8,7,32,3,1);                  /* top cap */
  rect(8,11,32,44,0); rect(9,11,30,44,2);              /* body */
  rect(9,15,30,36,3);                                  /* label */
  for(var Y=17;Y<33;Y++) for(var X=10;X<38;X++) put(X,Y,ROLL_PATTERN[id](X,Y));
  rect(10,35,28,2,0); rect(10,39,18,2,1); rect(10,43,22,2,1); rect(10,47,12,2,1);   /* printed lines */
  rect(40,30,8,16,0); for(var k=0;k<3;k++) rect(42,32+k*5,3,3,2);                   /* film tongue */
  rect(7,55,34,5,0); rect(8,56,32,3,1);                /* bottom cap */
  rect(21,60,6,4,0);
  for(var i=0;i<W*H;i++){ var o=i*4; if(px[i]===255){ d[o+3]=0; continue; } var t=TONES[px[i]]; d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255; }
  x.putImageData(img,0,0);
}
function buildRolls(){
  var box=$("rolls");
  if(!box.children.length){
    TINT_ORDER.forEach(function(id,i){
      var b=document.createElement("button"); b.type="button"; b.className="roll"; b.setAttribute("data-tint",id);
      var cv=document.createElement("canvas"); cv.width=48; cv.height=64; drawCanister(cv,id);
      var lab=document.createElement("span"); lab.className="lab";
      b.appendChild(cv); b.appendChild(lab);
      b.onclick=function(){ if(CAM.roll===i) return; pickRoll(i,true); };
      box.appendChild(b);
    });
    var t=null;
    box.addEventListener("scroll",function(){
      clearTimeout(t); t=setTimeout(function(){
        var mid=box.scrollLeft+box.clientWidth/2, best=0, bd=1e9;
        Array.prototype.forEach.call(box.children,function(c,i){ var cx=c.offsetLeft+c.offsetWidth/2, dd=Math.abs(cx-mid); if(dd<bd){ bd=dd; best=i; } });
        if(best!==CAM.roll){ CAM.roll=best; sfx("move"); paintRolls(); }
      },90);
    });
  }
  CAM.roll=Math.max(0,TINT_ORDER.indexOf(nextTint));
  paintRolls();
  requestAnimationFrame(function(){ pickRoll(CAM.roll,false); });
}
function pickRoll(i,smooth){
  var box=$("rolls"), c=box.children[i]; if(!c) return;
  CAM.roll=i; paintRolls();
  box.scrollTo({left:c.offsetLeft+c.offsetWidth/2-box.clientWidth/2, behavior:smooth?"smooth":"auto"});
}
function paintRolls(){
  if(!$("rolls").children.length) return;
  nextTint=TINT_ORDER[CAM.roll];
  Array.prototype.forEach.call($("rolls").children,function(c,i){
    var id=c.getAttribute("data-tint"), t=TINTS[id];
    c.className="roll"+(i===CAM.roll?" on":"");
    c.querySelector(".lab").innerHTML="";
    c.querySelector(".lab").appendChild(document.createTextNode(t.en));
    var sm=document.createElement("small"); sm.textContent=tr("cam.load.label",{name:t.name, n:nextSize, fine:nextStock===2?tr("cam.load.fine"):""}); c.querySelector(".lab").appendChild(sm);
  });
  $("roll-count").lastChild.textContent=tr("cam.load.exp",{n:nextSize});
  $("roll-stock").lastChild.textContent=stockName(nextStock);
  $("roll-note").textContent=tr(nextStock===2?"cam.load.note2":"cam.load.note1")+tr("cam.load.tint",{name:tintLabel(nextTint)});
}
function rollSize(step){ var S3=[8,12,16], i=S3.indexOf(nextSize); nextSize=S3[(i+step+3)%3]; sfx("tick"); paintRolls(); }
function rollStock(){ nextStock=nextStock===2?1:2; sfx("tick"); paintRolls(); }
$("roll-count").onclick=function(){ rollSize(1); };
$("roll-stock").onclick=function(){ rollStock(); };
$("roll-prev").onclick=function(){ pickRoll(Math.max(0,CAM.roll-1),true); };
$("roll-next").onclick=function(){ pickRoll(Math.min(TINT_ORDER.length-1,CAM.roll+1),true); };
$("roll-go").onclick=function(){ if(CAM.mode==="load") loadRoll(); };

function camButton(b,down){
  var boot=$("cam-boot");
  if(!boot.hidden){ if(down && (b==="a"||b==="b"||b==="start") && boot.onclick) boot.onclick(); return; }
  /* actions that open the share sheet or the system camera wait for the release: phones only
     count a finger lifting as permission to open those */
  if(CAM.mode==="menu"){
    if(!down){ if(b==="a") menuPick(); return; }
    var n=CAM.menu.items.length;
    if(b==="up"||b==="down"){ CAM.sel=(CAM.sel+(b==="down"?1:n-1))%n; sfx("move"); drawMenu(); }
    else if(b==="b" && CAM.menu.back){ sfx("miss"); CAM.menu.back(); }
    return;
  }
  if(CAM.mode==="load"){
    if(!down) return;
    if(b==="left") pickRoll(Math.max(0,CAM.roll-1),true);
    else if(b==="right") pickRoll(Math.min(TINT_ORDER.length-1,CAM.roll+1),true);
    else if(b==="up") rollSize(1); else if(b==="down") rollSize(-1);
    else if(b==="select") rollStock();
    else if(b==="a"||b==="start") loadRoll();
    return;
  }
  if(!F.roll || rollFull()) return;
  if(b==="a"){ if(down===LIVE.on) shoot(); return; }   /* live: on press; system camera: on release */
  if(!down) return;
  if(b==="up") setExposure(F.exposure+1); else if(b==="down") setExposure(F.exposure-1);
  else if(b==="right") setContrast(F.contrast+1); else if(b==="left") setContrast(F.contrast-1);
  else if(b==="start"){ sfx("tap"); camMenu("body"); }
  else if(b==="select") flipLens();
}
function camLayout(){
  var box=$("finder-box"), f=$("finder"); if($("v-cam").hidden || !box.clientWidth) return;
  var w=box.clientWidth-16, h=box.clientHeight-16, k=Math.min(w/128,h/112);
  f.style.width=Math.floor(128*k)+"px"; f.style.height=Math.floor(112*k)+"px";
}
if(window.ResizeObserver) new ResizeObserver(function(){ camLayout(); }).observe($("finder-box"));
window.addEventListener("resize",camLayout);

/* ---------- cutter: slide the strip under a fixed window and cut what's inside ---------- */
var CUT={W:0, n:0, data:null, s:1, k:1, mode:"narrow", count:0, name:"lopda", tint:"lcd", pal:TINTS.lcd.tones};
function nearestTone(r,g,b,pal){
  pal=pal||TONES;
  var best=0,bd=1e9; for(var t=0;t<4;t++){ var T=pal[t], dd=(r-T[0])*(r-T[0])+(g-T[1])*(g-T[1])+(b-T[2])*(b-T[2]); if(dd<bd){bd=dd;best=t;} } return best;
}
/* which tint was this strip developed in? the one whose four tones fit its pixels best */
function detectTint(src,n){
  var best="lcd", bestErr=Infinity;
  TINT_ORDER.forEach(function(id){
    var pal=TINTS[id].tones, err=0;
    for(var i=0;i<n;i+=4*53){
      var r=src[i],g=src[i+1],b=src[i+2], m=Infinity;
      for(var t=0;t<4;t++){ var T=pal[t], dd=(r-T[0])*(r-T[0])+(g-T[1])*(g-T[1])+(b-T[2])*(b-T[2]); if(dd<m) m=dd; }
      /* also try red/blue swapped, so strips hit by the old Safari bug still match */
      for(t=0;t<4;t++){ T=pal[t]; dd=(b-T[0])*(b-T[0])+(g-T[1])*(g-T[1])+(r-T[2])*(r-T[2]); if(dd<m) m=dd; }
      err+=m;
    }
    if(err<bestErr){ bestErr=err; best=id; }
  });
  return best;
}
/* window size in strip units */
function cutWin(){ return CUT.mode==="narrow" ? {w:STRIP.FW, h:STRIP.FH, y:STRIP.FY} : {w:Math.round(STRIP.H*CW/CH), h:STRIP.H, y:0}; }
function cutLayout(){
  if(!CUT.data) return;
  var box=$("cut-box"), sc=$("cut-scroll"), cv=$("cut-cv");
  var dispH=Math.min(240, Math.round(box.clientWidth*0.62));
  CUT.k=dispH/STRIP.H;
  cv.style.height=dispH+"px"; cv.style.width=Math.round(CUT.W*CUT.k)+"px";
  var half=Math.round(box.clientWidth/2);
  $("cut-sp1").style.width=half+"px"; $("cut-sp2").style.width=half+"px";
  sc.style.height=dispH+"px";
  var w=cutWin(), win=$("cut-window");
  win.style.width=Math.round(w.w*CUT.k)+"px"; win.style.height=Math.round(w.h*CUT.k)+"px"; win.style.top=Math.round(w.y*CUT.k)+"px";
}
/* the strip x at the window's left edge: the scroll offset maps to the window centre */
function cutX(){
  var w=cutWin(), centre=$("cut-scroll").scrollLeft/CUT.k;
  return Math.max(0,Math.min(CUT.W-w.w,Math.round(centre-w.w/2)));
}
function cutLoad(img,fname){
  var iw=img.naturalWidth, ih=img.naturalHeight, s=ih/STRIP.H;
  var W=iw/s, n=Math.round((W-stripWidth(0))/STRIP.PITCH);
  if(!(n>=1 && n<=36) || Math.abs(stripWidth(n)-W)>8) return false;
  var c=document.createElement("canvas"); c.width=iw; c.height=ih;
  var x=c.getContext("2d",{willReadFrequently:true}); x.drawImage(img,0,0);
  var src=x.getImageData(0,0,iw,ih).data;
  CUT.tint=detectTint(src,src.length); CUT.pal=TINTS[CUT.tint].tones;
  /* resample to standard units and snap every pixel to the four tones; this also repairs
     strips that came out with swapped colours */
  var W0=stripWidth(n), out=new Uint8Array(W0*STRIP.H);
  for(var y=0;y<STRIP.H;y++) for(var xx=0;xx<W0;xx++){
    var sx=Math.min(iw-1,Math.floor((xx+0.5)*s)), sy=Math.min(ih-1,Math.floor((y+0.5)*s)), o=(sy*iw+sx)*4;
    out[y*W0+xx]=nearestTone(src[o],src[o+1],src[o+2],CUT.pal);
  }
  CUT.W=W0; CUT.n=n; CUT.data=out; CUT.count=0;
  CUT.name=(fname||"lopda").replace(/\.[^.]+$/,"").replace(/-\d+exp$/,"").slice(0,60)||"lopda";
  var cv=$("cut-cv"); cv.width=W0; cv.height=STRIP.H;
  var cx=cv.getContext("2d"), im=cx.createImageData(W0,STRIP.H), d=im.data;
  for(var i=0;i<out.length;i++){ var t=CUT.pal[out[i]]; d[i*4]=t[0]; d[i*4+1]=t[1]; d[i*4+2]=t[2]; d[i*4+3]=255; }
  cx.putImageData(im,0,0);
  $("cut-empty").hidden=true; $("cut-scroll").hidden=false; $("cut-window").hidden=false; $("cut-go").disabled=false;
  cutLayout();
  /* start with frame 1 centred under the window */
  $("cut-scroll").scrollLeft=Math.round((STRIP.LEAD+STRIP.FW/2)*CUT.k);
  cutState();
  return true;
}
$("cut-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f) return;
  var url=URL.createObjectURL(f), img=new Image();
  $("cut-state").textContent=tr("cut.reading");
  img.onload=function(){
    var ok=cutLoad(img,f.name); URL.revokeObjectURL(url);
    if(!ok){ $("cut-state").textContent=""; toast(tr("cut.notstrip")); }
  };
  img.onerror=function(){ URL.revokeObjectURL(url); $("cut-state").textContent=""; toast(tr("cut.badimg")); };
  img.src=url;
});
function cutNudge(dx){ var sc=$("cut-scroll"); sc.scrollLeft=sc.scrollLeft+dx*CUT.k; }
$("cut-left").onclick=function(){ cutNudge(-8); };
$("cut-right").onclick=function(){ cutNudge(8); };
Array.prototype.forEach.call(document.querySelectorAll("[data-win]"),function(b){
  b.onclick=function(){
    CUT.mode=b.getAttribute("data-win");
    Array.prototype.forEach.call(document.querySelectorAll("[data-win]"),function(o){ var on=o===b; o.setAttribute("aria-checked",on?"true":"false"); o.className=on?"btn":"btn ghost"; });
    cutLayout();
  };
});
/* print edges: none, a straight paper border, or a scalloped paper border */
var EDGES=["none","plain","scallop","card"];
var edgeIdx=0;
function cutEdgeLabel(){
  var e=EDGES[edgeIdx];
  $("cut-edge").textContent=tr("cut.edge",{name:tr("cut.edge."+e)}); $("cut-edge-note").textContent=tr("cut.edgenote."+e);
}
function cutState(){ $("cut-state").textContent=CUT.data ? tr("cut.state",{tint:tintLabel(CUT.tint), n:CUT.n, k:CUT.count}) : ""; }
$("cut-edge").onclick=function(){ edgeIdx=(edgeIdx+1)%EDGES.length; cutEdgeLabel(); };
/* is a point (in strip units, within the bordered print) on the paper? */
function onPaper(x,y,W,H,style){
  if(style!=="scallop") return true;
  var R=4, P=8, edge=function(along,depth){ var m=((along%P)+P)%P-P/2; return depth >= R - Math.sqrt(Math.max(0,R*R-m*m)); };
  return edge(x,y) && edge(x,H-1-y) && edge(y,x) && edge(y,W-1-x);
}
/* one cut on a 3:4 card: the print sits on photo paper with a short caption */
function buildCutCard(w,x0){
  var c=document.createElement("canvas"); c.width=CARD.W; c.height=CARD.H;
  var x=c.getContext("2d");
  x.fillStyle="rgb("+CARD.PAPER.join(",")+")"; x.fillRect(0,0,c.width,c.height);
  var MX=96, pw=CARD.W-2*MX, ph=Math.round(pw*w.h/w.w), py=Math.round((CARD.H-ph)/2)-60;
  var d=new Date();
  x.fillStyle=CARD.INK; x.font='44px "VT323", monospace'; x.textBaseline="alphabetic";
  x.fillText("LO-PDA",MX,py+ph+76);
  x.textAlign="right"; x.fillStyle=CARD.SOFT; x.font='26px "DotGothic16", "VT323", monospace';
  x.fillText(tintPrint(CUT.tint)+" · "+d.getFullYear()+"."+pad2(d.getMonth()+1)+"."+pad2(d.getDate()),CARD.W-MX,py+ph+74);
  x.textAlign="left";
  var region=new Uint8Array(w.w*w.h);
  for(var y=0;y<w.h;y++) for(var xx=0;xx<w.w;xx++) region[y*w.w+xx]=CUT.data[(w.y+y)*CUT.W+x0+xx];
  putFrame(x,region,w.w,w.h,CUT.pal,MX,py,pw,ph);
  return c;
}
$("cut-go").onclick=function(){
  sfx("shutter");
  if(!CUT.data) return;
  var w=cutWin(), x0=cutX(), SC=2, style=EDGES[edgeIdx], B= style==="none" ? 0 : 14;
  if(style==="card"){
    var btnc=this; btnc.disabled=true;
    fontsReady().then(function(){ return saveCanvas(buildCutCard(w,x0),CUT.name+"-card-"+pad2(CUT.count+1)+".png"); })
      .then(function(r){ if(r&&r.status==="saved"){ CUT.count++; cutState(); toast(tr("cut.carded")); } },function(e){ toast(saveErr(e)); })
      .then(function(){ btnc.disabled=false; });
    return;
  }
  var UW=w.w+2*B, UH=w.h+2*B, out=document.createElement("canvas");
  out.width=UW*SC; out.height=UH*SC;
  var ox=out.getContext("2d"), im=ox.createImageData(out.width,out.height), d=im.data, paper=CUT.pal[3];
  for(var y=0;y<out.height;y++) for(var xx=0;xx<out.width;xx++){
    var ux=Math.floor(xx/SC), uy=Math.floor(y/SC), o=(y*out.width+xx)*4, t;
    if(ux>=B && ux<B+w.w && uy>=B && uy<B+w.h) t=CUT.pal[CUT.data[(w.y+uy-B)*CUT.W + x0+ux-B]];
    else if(onPaper(ux,uy,UW,UH,style)) t=paper;
    else { d[o+3]=0; continue; }
    d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255;
  }
  ox.putImageData(im,0,0);
  var btn=this; btn.disabled=true;
  saveCanvas(out,CUT.name+"-cut-"+pad2(CUT.count+1)+".png").then(function(r){
    if(r&&r.status==="saved"){ CUT.count++; cutState(); toast(tr("cut.done")); }
    btn.disabled=false;
  },function(e){ toast(saveErr(e)); btn.disabled=false; });
};
window.addEventListener("resize",function(){ if(!$("v-cut").hidden) cutLayout(); });

/* ---------- chin game pad: D-pad, A, B, START, SELECT ----------
   Routed to the cartridge player when it runs, otherwise to the running app (PAD.on). */
var PADB={up:false,down:false,left:false,right:false,a:false,b:false,start:false,select:false};
var PADKEYS={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",x:"a",X:"a",z:"b",Z:"b",Enter:"start",Shift:"select"};
function padOn(){ return !$("gamepad").hidden; }
function setButton(b,down){
  if(!(b in PADB) || PADB[b]===down) return;
  PADB[b]=down;
  var el=document.querySelector('.gamepad [data-b="'+b+'"]'); if(el) el.classList.toggle("on",down);
  var arm=document.querySelector(".dpad ."+({up:"u",down:"d",left:"l",right:"r"}[b]||"x")); if(arm) arm.classList.toggle("on",down);
  if(down && navigator.vibrate) try{ navigator.vibrate(6); }catch(e){}
  if(GB.e){ gbJoy(b,down); return; }
  if(!$("v-cam").hidden){ camButton(b,down); return; }
  var f=$("run-frame");
  if(S.running && S.running.buttons && f.contentWindow) f.contentWindow.postMessage({pad:1,op:"button",b:b,down:down},"*");
}
function releaseButtons(){ Object.keys(PADB).forEach(function(b){ setButton(b,false); }); }
function showPad(on){
  if(!on) releaseButtons();
  $("gamepad").hidden=!on;
  if(!$("v-cart").hidden) cartLayout();
  if(!$("v-cam").hidden) camLayout();
}
Array.prototype.forEach.call(document.querySelectorAll(".gamepad .pk"),function(el){
  var b=el.getAttribute("data-b");
  el.addEventListener("pointerdown",function(e){ e.preventDefault(); try{ el.setPointerCapture(e.pointerId); }catch(x){} setButton(b,true); });
  ["pointerup","pointercancel","lostpointercapture"].forEach(function(t){ el.addEventListener(t,function(){ setButton(b,false); }); });
  el.addEventListener("contextmenu",function(e){ e.preventDefault(); });
});
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
  var b=PADKEYS[e.key]; if(!b || !padOn() || /INPUT|TEXTAREA/.test(e.target.nodeName)) return;
  e.preventDefault(); if(!e.repeat) setButton(b,true);
});
document.addEventListener("keyup",function(e){ var b=PADKEYS[e.key]; if(b && padOn()) setButton(b,false); });
window.addEventListener("blur",releaseButtons);

/* ---------- cartridge player: black-and-white Game Boy (binjgb, MIT, runtime/vendor/binjgb) ----------
   ROMs are the user's own files. Nothing is bundled. Colour carts are refused; dual-mode carts
   are run as black-and-white carts, and Super Game Boy colouring is switched off, so the screen
   only ever shows the four tones. */
var GB={mod:null, loading:null, e:0, rom:0, joy:0, raf:0, last:0, left:0, paused:false,
  cart:null, save:null, ctx:null, img:null, gain:null, aStart:0, dirty:false, timer:0};
var GB_TICKS=4194304, GB_AUDIO_FRAMES=4096, GB_VOL=[0,0.3,0.6,1];
var CARTS=[];
function b64(u8){ var s="", CH=0x8000; for(var i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH)); return btoa(s); }
function unb64(s){ var bin=atob(s), u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return u8; }
function gbModule(){
  if(GB.mod) return Promise.resolve(GB.mod);
  if(GB.loading) return GB.loading;
  GB.loading=new Promise(function(res,rej){
    var sc=document.createElement("script"); sc.src="vendor/binjgb/binjgb.js";
    sc.onload=res; sc.onerror=function(){ rej(new Error(tr("cart.noemu"))); };
    document.head.appendChild(sc);
  }).then(function(){
    return window.Binjgb({locateFile:function(p){ return new URL("vendor/binjgb/"+p,location.href).href; }});
  }).then(function(m){ GB.mod=m; return m; });
  GB.loading.catch(function(){ GB.loading=null; });
  return GB.loading;
}
function heap(ptr,size){ return new Uint8Array(GB.mod.HEAP8.buffer,ptr,size); }
/* Read the cartridge header. Returns {title, ok, why}. */
function cartHeader(u8){
  if(u8.length<0x8000 || u8.length>8*1024*1024) return {ok:false, why:tr("cart.badsize")};
  var cgb=u8[0x143];
  if(cgb===0xC0) return {ok:false, why:tr("cart.gbc")};
  var t="", end=(cgb&0x80)?0x143:0x144;
  for(var i=0x134;i<end;i++){ var c=u8[i]; if(!c) break; if(c>=32&&c<127) t+=String.fromCharCode(c); }
  var x=0; for(i=0x134;i<=0x14C;i++) x=(x-u8[i]-1)&0xFF;
  if(x!==u8[0x14D]) return {ok:false, why:tr("cart.badsum")};
  return {ok:true, title:t.trim(), dual:!!(cgb&0x80)};
}
/* black-and-white only: clear the colour and Super Game Boy flags on our private copy */
function asMono(u8){
  var r=new Uint8Array(u8); if(r[0x143]&0x80) r[0x143]=0; r[0x146]=0;
  var x=0; for(var i=0x134;i<=0x14C;i++) x=(x-r[i]-1)&0xFF; r[0x14D]=x;
  return r;
}
function renderCarts(){
  var ul=$("cart-list"); ul.textContent="";
  if(!CARTS.length){ var e=document.createElement("li"); e.className="empty"; e.textContent=tr(S.db?"cart.empty":"cart.emptynodb"); ul.appendChild(e); return; }
  CARTS.slice().sort(function(a,b){ return (b.played||b.added||0)-(a.played||a.added||0); }).forEach(function(c){
    var li=document.createElement("li"); li.className="store-item";
    var tile=document.createElement("span"); tile.className="tile"; tile.textContent=Array.from(c.name||"?")[0].toUpperCase();
    var body=document.createElement("div"); body.className="store-body";
    var t=document.createElement("b"); t.textContent=c.name;
    var m=document.createElement("small"); m.textContent=(c.title||tr("cart.untitled"))+" · "+Math.round(c.bytes/1024)+" KB"+(c.played?" · "+fmt(c.played):"");
    body.appendChild(t); body.appendChild(m);
    var acts=document.createElement("div"); acts.className="acts";
    var play=document.createElement("button"); play.type="button"; play.className="btn"; play.textContent=tr("cart.play");
    play.onclick=function(){ gbPlay(c); };
    var del=document.createElement("button"); del.type="button"; del.className="btn ghost"; del.textContent=tr("cart.toss");
    del.onclick=function(){
      if(del.dataset.armed){ deleteCart(c); return; }
      del.dataset.armed="1"; del.textContent=tr("cart.tossgo"); setTimeout(function(){ if(del.isConnected){ delete del.dataset.armed; del.textContent=tr("cart.toss"); } },3000);
    };
    acts.appendChild(play); acts.appendChild(del);
    li.appendChild(tile); li.appendChild(body); li.appendChild(acts); ul.appendChild(li);
  });
}
function loadCarts(){
  if(!S.db) return Promise.resolve();
  return S.refs.carts.get().then(function(q){ CARTS=q.docs.map(function(d){ var o=own(d.data()); o.id=d.id; return o; }); renderCarts(); }).catch(function(){ toast(tr("cart.shelffail")); });
}
function deleteCart(c){
  CARTS=CARTS.filter(function(x){ return x.id!==c.id; }); renderCarts();
  if(S.db){ S.refs.carts.doc(c.id).delete(); S.refs.roms.doc(c.id).delete(); S.refs.cartsave.doc(c.id).delete(); }
  toast(tr("cart.tossed",{name:c.name}));
}
$("cart-file").onchange=function(){
  var f=this.files&&this.files[0]; this.value=""; if(!f) return;
  f.arrayBuffer().then(function(buf){
    var u8=new Uint8Array(buf), h=cartHeader(u8);
    if(!h.ok){ toast(h.why); sfx("err"); return; }
    return sha256hex(buf).then(function(hex){
      var id=hex.slice(0,24), name=noEmoji(f.name.replace(/\.(gbc?|bin)$/i,"")).slice(0,40)||h.title||tr("cart.default");
      var have=CARTS.filter(function(x){ return x.id===id; })[0];
      if(have){ toast(tr("cart.dupe")); return; }
      var meta={name:name, title:h.title, bytes:u8.length, added:Date.now(), dual:h.dual};
      var write = S.db ? put(S.refs.roms.doc(id),{rom:b64(u8)}).then(function(ok){ return ok && put(S.refs.carts.doc(id),meta); }) : Promise.resolve(true);
      return write.then(function(ok){
        if(!ok) return;
        meta.id=id; if(!S.db) meta.mem=u8; CARTS.push(meta); renderCarts(); sfx("ok");
        toast(tr(h.dual?"cart.dual":"cart.placed"));
      });
    });
  }).catch(function(e){ toast(tr("cart.badfile",{msg:(e&&e.message)||e})); });
};
function openCart(){
  show("cart"); gbShowLib(); renderCarts(); loadCarts();
}
function gbShowLib(){
  $("cart-lib").hidden=false; $("cart-play").hidden=true; $("cart-tools").hidden=true; $("v-cart").classList.remove("locked");
  $("cart-title").textContent=tr("cart.title"); $("cart-state").textContent=""; showPad(false);
}
function cartLayout(){
  var cv=$("cart-cv"), box=$("cart-play"); if(box.hidden) return;
  var msg=$("cart-msg"), w=box.clientWidth-16, h=box.clientHeight-16-(msg.offsetHeight ? msg.offsetHeight+8 : 0)-6;
  /* every game pixel gets the same whole number of screen pixels, so the picture stays crisp */
  var dpr=window.devicePixelRatio||1, fit=Math.min(w/160,h/144), k=Math.floor(fit*dpr)/dpr;
  if(k<fit*0.9) k=fit;   /* on small screens size wins over perfectly even pixels */
  k=Math.max(1,k); cv.style.width=Math.round(160*k)+"px"; cv.style.height=Math.round(144*k)+"px";
}
window.addEventListener("resize",function(){ if(!$("v-cart").hidden) cartLayout(); });
function gbPlay(c){
  $("cart-state").textContent=tr("cart.reading");
  var romP = c.mem ? Promise.resolve(c.mem) : S.refs.roms.doc(c.id).get().then(function(sn){ if(!sn.exists) throw new Error(tr("cart.norom")); return unb64(own(sn.data()).rom); });
  var saveP = S.db ? S.refs.cartsave.doc(c.id).get().then(function(sn){ return sn.exists ? own(sn.data()) : {}; }).catch(function(){ return {}; }) : Promise.resolve({});
  audio();   /* this tap unlocks sound on phones */
  if(SND.ctx && SND.ctx.state==="suspended") SND.ctx.resume();
  Promise.all([gbModule(),romP,saveP]).then(function(r){
    if($("v-cart").hidden) return;
    gbStart(c,r[1],r[2]);
  }).catch(function(e){ $("cart-state").textContent=""; toast(tr("cart.nopower",{msg:(e&&e.message)||e})); sfx("err"); });
}
function gbStart(c,rom,save){
  gbStop();
  var m=GB.mod, data=asMono(rom), size=(data.length+0x7fff)&~0x7fff, ac=SND.ctx;
  GB.rom=m._malloc(size); var h=heap(GB.rom,size); h.fill(0); h.set(data);
  GB.e=m._emulator_new_simple(GB.rom,size,ac?ac.sampleRate:44100,GB_AUDIO_FRAMES,0);
  if(!GB.e){ m._free(GB.rom); GB.rom=0; throw new Error(tr("cart.badrom")); }
  GB.joy=m._joypad_new(); m._emulator_set_default_joypad_callback(GB.e,GB.joy);
  var col=function(t){ var c=TINTS.lcd.tones[t]; return ((255<<24)|(c[2]<<16)|(c[1]<<8)|c[0])>>>0; };
  for(var p=0;p<3;p++) m._emulator_set_bw_palette_simple(GB.e,p,col(3),col(2),col(1),col(0));
  GB.cart=c; GB.save=save||{};
  if(GB.save.sram) gbWithFile(m._ext_ram_file_data_new(GB.e),function(fd,buf){ var s=unb64(GB.save.sram); if(s.length===buf.length){ buf.set(s); m._emulator_read_ext_ram(GB.e,fd); } });
  var cv=$("cart-cv"); GB.ctx=cv.getContext("2d"); GB.img=GB.ctx.createImageData(160,144);
  GB.ctx.fillStyle="rgb("+TINTS.lcd.tones[3].join(",")+")"; GB.ctx.fillRect(0,0,160,144);
  if(ac){ GB.gain=ac.createGain(); GB.gain.gain.value=SND.on?GB_VOL[SND.vol]:0; GB.gain.connect(ac.destination); }
  GB.aStart=0; GB.last=0; GB.left=0; GB.paused=false; GB.dirty=false;
  GB.timer=setInterval(function(){ if(GB.dirty) gbSaveSram(); },1500);
  $("cart-lib").hidden=true; $("cart-play").hidden=false; $("cart-tools").hidden=false; $("v-cart").classList.add("locked"); $("v-cart").scrollTop=0;
  $("cart-title").textContent=c.name; $("cart-state").textContent="";
  resetCartLoad(); showPad(true); cartLayout();
  c.played=Date.now(); if(S.db) put(S.refs.carts.doc(c.id),(function(){ var o={}; for(var k in c) if(k!=="id"&&k!=="mem") o[k]=c[k]; return o; })());
  GB.raf=requestAnimationFrame(gbFrame);
}
function gbWithFile(fd,fn){ var m=GB.mod, buf=heap(m._get_file_data_ptr(fd),m._get_file_data_size(fd)); try{ return fn(fd,buf); } finally { m._file_data_delete(fd); } }
function gbFrame(ms){
  if(!GB.e) return;
  GB.raf=requestAnimationFrame(gbFrame);
  if(GB.paused) return;
  var m=GB.mod, sec=ms/1000, d=Math.max(sec-(GB.last||sec),0); GB.last=sec;
  var until=m._emulator_get_ticks_f64(GB.e)+Math.min(d,5/60)*GB_TICKS-GB.left, frame=false;
  for(;;){
    var ev=m._emulator_run_until_f64(GB.e,until);
    if(ev&1) frame=true;
    if(ev&2) gbAudio();
    if(ev&4) break;
  }
  GB.left=(m._emulator_get_ticks_f64(GB.e)-until)|0;
  if(m._emulator_was_ext_ram_updated(GB.e)) GB.dirty=true;
  if(frame){ GB.img.data.set(heap(m._get_frame_buffer_ptr(GB.e),m._get_frame_buffer_size(GB.e))); GB.ctx.putImageData(GB.img,0,0); }
}
function gbAudio(){
  var ac=SND.ctx; if(!ac || !GB.gain || ac.state!=="running") return;
  var m=GB.mod, src=heap(m._get_audio_buffer_ptr(GB.e),m._get_audio_buffer_capacity(GB.e));
  var now=ac.currentTime;
  if(GB.aStart<now){ GB.aStart=now+0.1; }
  var buf=ac.createBuffer(2,GB_AUDIO_FRAMES,ac.sampleRate), l=buf.getChannelData(0), r=buf.getChannelData(1);
  for(var i=0;i<GB_AUDIO_FRAMES;i++){ l[i]=src[2*i]/255; r[i]=src[2*i+1]/255; }
  var n=ac.createBufferSource(); n.buffer=buf; n.connect(GB.gain); n.start(GB.aStart);
  GB.aStart+=GB_AUDIO_FRAMES/ac.sampleRate;
}
var GB_JOY={up:"_set_joyp_up",down:"_set_joyp_down",left:"_set_joyp_left",right:"_set_joyp_right",a:"_set_joyp_A",b:"_set_joyp_B",start:"_set_joyp_start",select:"_set_joyp_select"};
function gbJoy(b,down){ if(GB.e && GB_JOY[b]) GB.mod[GB_JOY[b]](GB.e,down?1:0); }
function gbSaveSram(){
  if(!GB.e) return; GB.dirty=false;
  var m=GB.mod, s=gbWithFile(m._ext_ram_file_data_new(GB.e),function(fd,buf){ m._emulator_write_ext_ram(GB.e,fd); return b64(buf); });
  if(!s) return;
  GB.save.sram=s; if(S.db) put(S.refs.cartsave.doc(GB.cart.id),GB.save);
}
function gbPause(on){
  if(!GB.e) return;
  GB.paused=on; GB.last=0; GB.aStart=0;
  if(on){ releaseButtons(); if(GB.dirty) gbSaveSram(); }
}
function gbStop(){
  if(!GB.e) return;
  if(GB.dirty) gbSaveSram();
  var m=GB.mod; cancelAnimationFrame(GB.raf); clearInterval(GB.timer);
  if(GB.gain){ try{ GB.gain.disconnect(); }catch(e){} GB.gain=null; }
  m._emulator_delete(GB.e); m._joypad_delete(GB.joy); m._free(GB.rom);
  GB.e=0; GB.joy=0; GB.rom=0; GB.cart=null;
  releaseButtons();
}
$("cart-eject").onclick=function(){ gbStop(); gbShowLib(); renderCarts(); };
$("cart-save").onclick=function(){
  if(!GB.e) return;
  var m=GB.mod, s=gbWithFile(m._state_file_data_new(GB.e),function(fd,buf){ m._emulator_write_state(GB.e,fd); return b64(buf); });
  GB.save.state=s; GB.save.stateAt=Date.now();
  if(GB.dirty){ gbSaveSram(); } else if(S.db) put(S.refs.cartsave.doc(GB.cart.id),GB.save);
  toast(tr("cart.saved")); sfx("ok"); resetCartLoad();
};
function resetCartLoad(){ var b=$("cart-load"); delete b.dataset.armed; b.textContent=tr("cart.load"); b.disabled=!(GB.save&&GB.save.state); }
$("cart-load").onclick=function(){
  var b=this; if(!GB.e || !GB.save.state) return;
  if(!b.dataset.armed){ b.dataset.armed="1"; b.textContent=tr("cart.loadgo"); setTimeout(function(){ if(b.dataset.armed) resetCartLoad(); },3000); return; }
  var m=GB.mod, st=unb64(GB.save.state), ok=false;
  gbWithFile(m._state_file_data_new(GB.e),function(fd,buf){ if(st.length===buf.length){ buf.set(st); ok=m._emulator_read_state(GB.e,fd)===0; } });
  resetCartLoad();
  if(ok){ toast(tr("cart.restored",{when:fmt(GB.save.stateAt)})); sfx("ok"); } else { toast(tr("cart.loadfail")); sfx("err"); }
};

if(/[?&]debug\b/.test(location.search)) window.LOPDA_DEBUG={GB:GB, setButton:setButton, sfxLog:[]};
function openPaint(){
  show("paint"); paintRender();
  if(P.loaded || !S.db) return;
  S.refs.paint.get().then(function(sn){
    P.loaded=true;
    var d=sn.exists ? own(sn.data()) : null;
    if(d && typeof d.px==="string" && d.px.length===PW*PW && !P.undo.length){
      for(var i=0;i<d.px.length;i++) P.px[i]=d.px.charCodeAt(i)-48;
      paintRender();
    }
  }).catch(function(){});
}
paintRender();

/* ---------- boot ---------- */
I18N.apply(document); setStatus(statusKey); paintSizeLabel(); cutEdgeLabel();
tickClock(); setInterval(tickClock,15000);
renderHome();
$("store-refresh").onclick=function(){ loadRegistry(true); };

(function boot(){
  var P=window.LopdaPlatform;
  S.downloads=P.downloads;
  P.db.ready().then(function(){
    var db=P.db, base="data/users/local";
    S.db=db;
    S.refs.apps=db.doc(base+"/apps").collection("items");
    S.refs.notes=db.doc(base+"/notes").collection("items");
    S.refs.kv=db.doc(base+"/appdata").collection("items");
    S.refs.code=db.doc(base+"/code").collection("items");
    S.refs.paint=db.doc(base+"/paint");
    S.refs.film=db.doc(base+"/film");
    S.refs.frames=db.doc(base+"/frames").collection("items");
    S.refs.settings=db.doc(base+"/settings");
    S.refs.carts=db.doc(base+"/carts").collection("items");
    S.refs.roms=db.doc(base+"/roms").collection("items");
    S.refs.cartsave=db.doc(base+"/cartsave").collection("items");
    S.refs.settings.get().then(function(sn){ var d=sn.exists?own(sn.data()):null; if(d){ SND.on=d.sound!==false; SND.vol=Math.max(0,Math.min(3,d.volume==null?2:d.volume|0)); if(I18N.STR[d.lang]) setLang(d.lang); } }).catch(function(){});
    setStatus("status.saved");
    P.persist();
    refresh("apps"); refresh("notes");
    loadFilm().then(function(){ if(!$("v-home").hidden) renderHome(); if(!$("v-cam").hidden) renderCam(); });
    loadRegistry();
    document.addEventListener("visibilitychange",function(){
      if(document.hidden){ stopLive(); gbPause(true); return; }
      gbPause(false);
      refresh("apps"); refresh("notes");
      if(!$("v-cam").hidden) startLive();
    });
  }).catch(function(e){
    setStatus("status.unsaved");
    if(window.console) console.error("Lo-PDA storage failed", e);
    toast(tr("boot.nostore"));
    F.ready=true;
  });
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    var hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(function(){});
    /* the browser checks for a new version each time the app opens; once it has taken over,
       the next restart runs it. First install also fires this, so skip that case. */
    navigator.serviceWorker.addEventListener("controllerchange",function(){
      if(!hadController){ hadController=true; return; }
      UPD.ready=true; renderUpdate();
      toast(tr("upd.arrived"));
    });
  }
})();
})();
