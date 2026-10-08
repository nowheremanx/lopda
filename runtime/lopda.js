/*
 * Lo-PDA runtime.
 * Copyright (c) 2026 Haowei Wu. PolyForm Noncommercial 1.0.0, see LICENSE and NOTICE.
 */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var REGISTRY = new URL("../registry/", location.href).href;

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
  chains[k]=(chains[k]||Promise.resolve()).then(function(){ return ref.set(data); }).then(function(){ return true; },function(e){ toast("存档失败："+((e&&e.code)||"未知错误")); return false; });
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
    $("savestate").textContent="读档失败";
    toast("读档失败："+String((e&&e.code)||(e&&e.message)||e).slice(0,120));
  });
}

/* ---------- clock & status ---------- */
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
var RUNTIME_VERSION="0.2.4";   /* keep in step with VERSION in sw.js */
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
  if(!b || b.disabled || b.id==="home-key" || b.id==="cam-shutter" || b.id==="cut-go" || b.closest(".gamepad")) return;
  sfx("tap");
},true);

/* ---------- settings ---------- */
function renderSettings(){
  $("set-sound").textContent=SND.on?"开":"关"; $("set-sound").setAttribute("aria-pressed",SND.on?"true":"false");
  $("set-vol").textContent="▮".repeat(SND.vol)+"▯".repeat(3-SND.vol);
  $("set-vol-down").disabled=!SND.on||SND.vol<=0; $("set-vol-up").disabled=!SND.on||SND.vol>=3;
  $("set-version").textContent="Lo-PDA "+RUNTIME_VERSION+" · 规范 lopda/1";
}
function saveSettings(){ renderSettings(); if(S.db) put(S.refs.settings,{sound:SND.on, volume:SND.vol}); }
$("set-sound").onclick=function(){ SND.on=!SND.on; saveSettings(); sfx("ok"); };
$("set-vol-down").onclick=function(){ if(SND.vol>0){ SND.vol--; saveSettings(); sfx("tap"); } };
$("set-vol-up").onclick=function(){ if(SND.vol<3){ SND.vol++; saveSettings(); sfx("tap"); } };
/* ---------- updates: the service worker keeps an offline copy; this swaps it for the newest one ---------- */
var UPD={ready:false, busy:false, latest:null};
function renderUpdate(){
  var b=$("set-update"); if(!b) return;
  $("upd-label").textContent="系统版本 "+RUNTIME_VERSION+(UPD.latest && UPD.latest!==RUNTIME_VERSION ? " → "+UPD.latest : "");
  b.disabled=UPD.busy;
  b.className=UPD.ready?"btn":"btn ghost";
  b.textContent=UPD.busy?"接收中…":UPD.ready?"重启升级":"检查更新";
}
function latestVersion(){
  return fetch("sw.js?fresh="+Date.now(),{cache:"no-store"}).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); })
    .then(function(t){ var m=/VERSION\s*=\s*"lopda-v([^"]+)"/.exec(t); if(!m) throw new Error("读不到版本号"); return m[1]; });
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
  if(!("serviceWorker" in navigator) || !navigator.serviceWorker.controller){ toast("这个浏览器不支持离线版本，刷新页面就是最新的。"); return; }
  UPD.busy=true; renderUpdate(); sfx("modem");
  latestVersion().then(function(v){
    UPD.latest=v;
    if(v===RUNTIME_VERSION){ toast("已经是最新版 "+v+"。"); return; }
    return navigator.serviceWorker.getRegistration().then(function(reg){
      if(!reg) throw new Error("没有离线副本");
      return reg.update().then(function(){ return waitForNewWorker(reg); });
    }).then(function(){ UPD.ready=true; toast("新版本 "+v+" 下载好了，按「重启升级」。"); sfx("ok"); });
  }).catch(function(e){ toast("检查失败："+((e&&e.message)||"连不上")); sfx("err"); })
    .then(function(){ UPD.busy=false; renderUpdate(); });
};
function openSettings(){
  show("settings"); renderSettings(); renderUpdate();
  var el=$("set-storage");
  if(navigator.storage && navigator.storage.estimate){
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)]).then(function(r){
      var kb=Math.max(1,Math.round((r[0].usage||0)/1024));
      el.textContent="本机存档：约 "+(kb>1024?(kb/1024).toFixed(1)+" MB":kb+" KB")+(r[1]?" · 已锁定，不会被系统清理":" · 未锁定，长期不用可能被系统清理");
    }).catch(function(){ el.textContent="本机存档：无法读取用量"; });
  } else el.textContent="本机存档：无法读取用量";
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
  add("builtin",{glyph:"记"},"记事本","",function(){ show("notes"); },"notes");
  add("builtin",{glyph:"画"},"点阵画板","",function(){ openPaint(); },"paint");
  add("builtin",{glyph:"摄"},"点阵相机",F.roll?(F.frames.length+"/"+F.size):"",function(){ openCam(); },"camera");
  add("builtin",{glyph:"裁"},"裁片机","",function(){ show("cut"); cutLayout(); },"cutter");
  add("builtin",{glyph:"卡"},"卡带机","",function(){ openCart(); },"cart");
  add("builtin",{glyph:"商"},"应用商店",updatesAvailable()?"有更新":"",function(){ show("store"); },"store");
  add("builtin",{glyph:"设"},"设置","",function(){ openSettings(); },"settings");
  S.apps.slice().sort(function(a,b){ return (a.installed||0)-(b.installed||0); }).forEach(function(a){
    add("",a,noEmoji(a.name)||"无名","v"+(a.version||"?"),function(){ runApp(a); });
  });
}

/* ---------- store: the community registry ---------- */
var regLoading=null;
function loadRegistry(force){
  if(regLoading && !force) return regLoading;
  $("store-state").textContent="接收目录…";
  regLoading=fetch(REGISTRY+"index.json",{cache:"no-cache"}).then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(idx){
    if(!idx || (idx.spec!=="lopda/0" && idx.spec!=="lopda/1") || !Array.isArray(idx.apps)) throw new Error("目录格式不对");
    S.registry=idx; $("store-state").textContent=idx.apps.length+" 个程序";
    /* icons are metadata: refresh them on installed apps whose code is unchanged */
    idx.apps.forEach(function(r){ var a=installedOf(r.id); if(a && a.sha256===r.sha256 && validIcon(r.icon) && JSON.stringify(a.icon)!==JSON.stringify(r.icon)){ a.icon=r.icon; saveApp(a); } });
    renderStore(); if(!$("v-home").hidden) renderHome();
  }).catch(function(e){
    $("store-state").textContent="收不到目录";
    if(!$("v-store").hidden) toast("连不上应用目录："+e.message);
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
  if(!S.registry){ var e=document.createElement("li"); e.className="empty"; e.textContent="正在接收应用目录。连不上的话，检查网络后再进来一次。"; ul.appendChild(e); return; }
  S.registry.apps.forEach(function(r){
    var li=document.createElement("li"); li.className="store-item";
    var tile=document.createElement("span"); tile.className="tile"; fillTile(tile,r);
    var body=document.createElement("div"); body.className="store-body";
    var t=document.createElement("b"); t.textContent=noEmoji(r.name)+"  v"+r.version;
    var d=document.createElement("span"); d.textContent=noEmoji(r.description||"");
    var m=document.createElement("small"); m.textContent=(r.author||"佚名")+" · "+(r.license||"")+" · "+Math.max(1,Math.round((r.bytes||0)/1024))+" KB";
    body.appendChild(t); body.appendChild(d); body.appendChild(m);
    var a=installedOf(r.id), btn=document.createElement("button"); btn.type="button";
    if(!a){ btn.className="btn"; btn.textContent="安装"; }
    else if(a.sha256!==r.sha256){ btn.className="btn"; btn.textContent="更新"; }
    else { btn.className="btn ghost"; btn.textContent="打开"; }
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
  btn.disabled=true; btn.textContent="下载中…";
  fetch(new URL(r.path,REGISTRY).href,{cache:"no-cache"}).then(function(res){
    if(!res.ok) throw new Error("HTTP "+res.status);
    return res.arrayBuffer();
  }).then(function(buf){
    return sha256hex(buf).then(function(h){
      if(h!==r.sha256) throw new Error("校验不通过，文件和目录对不上");
      return new TextDecoder().decode(buf);
    });
  }).then(function(html){
    var prev=installedOf(r.id);
    var app={id:r.id, name:r.name, glyph:r.glyph, icon: validIcon(r.icon) ? r.icon : undefined, version:r.version, author:r.author, license:r.license,
      spec:r.spec||"lopda/0", buttons: r.spec==="lopda/1" && r.buttons===true,
      sha256:r.sha256, installed: prev ? prev.installed : Date.now(), updated: Date.now(), html:html};
    return saveApp(app).then(function(ok){
      if(!ok) throw new Error("存不进本机");
      toast((prev?"已更新 ":"已安装 ")+noEmoji(r.name)+"。"); sfx("ok");
      renderStore();
    });
  }).catch(function(e){
    toast("安装失败："+e.message); sfx("err"); btn.disabled=false; btn.textContent="重试";
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
  if(S.db){ S.refs.apps.doc(id).delete().catch(function(){ toast("卸载失败"); }); S.refs.kv.doc(id).delete().catch(function(){}); S.refs.code.doc(id).delete().catch(function(){}); }
  delete S.kv[id];
}

/* ---------- runner: sandboxed iframe + PAD bridge (sdk/pad-shim.js) ---------- */
var KV_BUDGET=256*1024;
function runApp(a){
  S.running=a;
  $("run-title").textContent=noEmoji(a.name)+" · v"+(a.version||"?");
  resetConfirm("run-del-wrap","run-del","卸载");
  $("run-err").hidden=true;
  show("run");
  showPad(!!a.buttons);
  var start=function(h){ $("run-frame").srcdoc=lopdaWrapApp(h); };
  if(a.html){ start(a.html); return; }
  $("run-frame").srcdoc='<body style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#a3ad7e;color:#1f2a14;font:16px monospace">载入中…</body>';
  loadHtml(a).then(function(h){
    if(S.running!==a) return;
    if(h) start(h); else toast("这个程序的代码找不到了，去应用商店重新安装。");
  }).catch(function(e){ if(S.running===a) toast("读档失败（"+((e&&e.code)||"未知")+"）"); });
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
      if(JSON.stringify(next).length>KV_BUDGET){ $("run-err-msg").textContent="存档超过 256 KB 上限，这次没存。"; $("run-err").hidden=false; return; }
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
  var b=document.createElement("button"); b.className="btn ghost"; b.type="button"; b.id=btnId; b.textContent=label||"删除";
  w.appendChild(b); b.onclick=function(){ armConfirm(wrapId,btnId,label); };
}
function armConfirm(wrapId,btnId,label){
  var w=$(wrapId); w.textContent="";
  var yes=document.createElement("button"); yes.className="btn"; yes.type="button"; yes.textContent="确认"+(label||"删除");
  var no=document.createElement("button"); no.className="btn ghost"; no.type="button"; no.textContent="取消";
  w.appendChild(yes); w.appendChild(no);
  no.onclick=function(){ resetConfirm(wrapId,btnId,label); };
  yes.onclick=function(){
    if(wrapId==="run-del-wrap" && S.running){ var n=S.running.name; deleteApp(S.running.id); show("home"); toast("已卸载 "+noEmoji(n)+"，存档也一并清掉了。"); }
    if(wrapId==="note-del-wrap" && S.editing){ deleteNote(S.editing.id); show("notes"); }
    if(wrapId==="paint-clear-wrap"){ paintClear(); resetConfirm(wrapId,btnId,label); }
  };
}

/* ---------- notes ---------- */
function fmt(ts){ var d=new Date(ts||0); return (d.getMonth()+1)+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function renderNotes(){
  var ul=$("notes-list"); ul.textContent="";
  var list=S.notes.slice().sort(function(a,b){ return (b.updated||0)-(a.updated||0); });
  if(!list.length){ var li=document.createElement("li"); li.className="empty"; li.textContent=S.db?"还没有笔记。点「新建」写第一条，存在这台机器里。":"还没有笔记。现在存不了档，写的内容关掉就没了。"; ul.appendChild(li); return; }
  list.forEach(function(n){
    var li=document.createElement("li"), b=document.createElement("button"); b.type="button";
    var t=document.createElement("span"); t.className="t"; t.textContent=(n.body||"").split("\n")[0].trim()||"（空白）";
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
  $("note-state").textContent=n.fresh?"新笔记":"已保存";
  resetConfirm("note-del-wrap","note-del","删除");
  show("note"); $("note-body").focus();
}
var noteTimer;
$("note-body").addEventListener("input",function(){
  if(!S.editing) return;
  S.editing.body=$("note-body").value; S.editing.dirty=true;
  $("note-state").textContent="编辑中…";
  clearTimeout(noteTimer); noteTimer=setTimeout(flushNote,700);
});
function flushNote(){
  clearTimeout(noteTimer);
  var e=S.editing; if(!e || !e.dirty) return;
  e.dirty=false;
  var doc={body:e.body, updated:Date.now()};
  upsert("notes",{id:e.id, body:doc.body, updated:doc.updated});
  if(!S.db){ $("note-state").textContent="已保存（仅本次）"; return; }
  pending.notes[e.id]=true;
  $("note-state").textContent="保存中…";
  put(S.refs.notes.doc(e.id),doc).then(function(ok){
    if(ok) delete pending.notes[e.id];
    if(S.editing===e) $("note-state").textContent= ok ? "已保存" : "保存失败，再编辑一下会重试";
    if(!ok) e.dirty=true;
  });
}
function deleteNote(id){
  S.editing=null;
  dropLocal("notes",id);
  if(S.db) S.refs.notes.doc(id).delete().catch(function(){ toast("删除失败"); });
}
$("note-back").onclick=function(){ flushNote(); S.editing=null; show("notes"); };

/* ---------- 点阵画板: 96x96, four LCD tones ---------- */
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
$("paint-size").onclick=function(){ P.size=P.size===1?3:1; this.textContent= P.size===1 ? "笔 · 细" : "笔 · 粗"; };
$("paint-undo").onclick=function(){ var prev=P.undo.pop(); if(!prev){ toast("没有可以撤销的了。"); return; } P.px=prev; paintRender(); paintSaveSoon(); };
function paintClear(){ paintPushUndo(); P.px=new Uint8Array(PW*PW).fill(3); paintRender(); paintSaveSoon(); }
resetConfirm("paint-clear-wrap","paint-clear","清空");

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
    URL.revokeObjectURL(url); paintRender(); paintSaveSoon(); toast("已转成 96×96 四色点阵。");
  };
  img.onerror=function(){ URL.revokeObjectURL(url); toast("这张图读不出来，换一张试试。"); };
  img.src=url;
});

/* export: scale up 8x with hard pixels, hand to the viewer's save dialog */
$("paint-export").onclick=function(){
  if(!S.downloads){ toast("这里不能导出，要在 Claude 里打开。"); return; }
  var big=document.createElement("canvas"); big.width=big.height=PW*8;
  var bx=big.getContext("2d"); bx.imageSmoothingEnabled=false; bx.drawImage(pcv,0,0,big.width,big.height);
  big.toBlob(function(blob){
    if(!blob){ toast("生成图片失败。"); return; }
    var d=new Date(), stamp=d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")+"-"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0");
    S.downloads.save({filename:"lopda-"+stamp+".png", data:blob}).then(function(r){
      if(r && r.status==="saved") toast("导出好了。");
    }).catch(function(e){
      var c=e&&e.code;
      if(c==="declined") return;
      toast(c==="rate_limited" ? "上一个保存窗口还没关。" : "导出失败（"+(c||"未知")+"）。");
    });
  },"image/png");
};

/* persistence: the 9216 pixels as a digit string, one document */
function paintSaveSoon(){
  if(!S.db) { $("paint-state").textContent="96×96 · 未存档"; return; }
  clearTimeout(P.saveTimer);
  $("paint-state").textContent="保存中…";
  P.saveTimer=setTimeout(function(){
    put(S.refs.paint,{px:Array.prototype.join.call(P.px,""), updated:Date.now()}).then(function(ok){ $("paint-state").textContent= ok ? "96×96 · 已保存" : "保存失败"; });
  },1200);
}
/* ---------- 点阵相机: a roll of film. Frames are fixed once taken; a full roll is developed out. ---------- */
var CW=128, CH=112;
var F={roll:null, size:12, res:1, tint:"lcd", loaded:0, exposure:0, date:true, frames:[], ready:false, viewing:null};
var ccv=$("cam-cv"), cctx=ccv.getContext("2d"), cimg=cctx.createImageData(CW,CH);
/* film stock: 1 = 128x112 standard, 2 = 256x224 fine grain. Fixed for the life of a roll. */
/* film tints: the four tones a roll develops in. The handheld's own screen always stays green. */
var TINTS={
  lcd:   {name:"绿屏", en:"LCD",    tones:[[31,42,20],[74,90,50],[125,138,88],[163,173,126]]},
  sepia: {name:"暖褐", en:"SEPIA",  tones:[[43,29,20],[107,74,50],[168,128,90],[230,210,176]]},
  sakura:{name:"樱粉", en:"SAKURA", tones:[[58,31,43],[138,74,99],[212,138,163],[246,219,227]]},
  cyano: {name:"晒蓝", en:"CYANO",  tones:[[16,36,58],[47,92,134],[111,159,196],[214,230,240]]},
  mono:  {name:"黑白", en:"MONO",   tones:[[27,27,27],[90,90,90],[158,158,158],[232,230,225]]}
};
var TINT_ORDER=["lcd","sepia","sakura","cyano","mono"];
function tintOf(id){ return TINTS[id]||TINTS.lcd; }
var nextTint="lcd";
(function buildTintRow(){
  var row=$("tint-row");
  TINT_ORDER.forEach(function(id){
    var t=TINTS[id], b=document.createElement("button"); b.type="button"; b.className="tint"; b.setAttribute("role","radio");
    b.setAttribute("aria-checked", id===nextTint?"true":"false"); b.setAttribute("data-tint",id);
    var sw=document.createElement("span"); sw.className="sw4";
    t.tones.forEach(function(c){ var i=document.createElement("i"); i.style.background="rgb("+c.join(",")+")"; sw.appendChild(i); });
    var l=document.createElement("span"); l.textContent=t.name;
    b.appendChild(sw); b.appendChild(l);
    b.onclick=function(){ nextTint=id; Array.prototype.forEach.call(row.children,function(o){ o.setAttribute("aria-checked",o===b?"true":"false"); }); };
    row.appendChild(b);
  });
})();
function setRes(r){ r=r===2?2:1; F.res=r; CW=128*r; CH=112*r; ccv.width=CW; ccv.height=CH; cimg=cctx.createImageData(CW,CH); }
function stockName(r){ return r===2 ? "细颗粒" : "标准片"; }
function filmDoc(){ return {roll:F.roll,size:F.size,res:F.res,tint:F.tint,loaded:F.loaded,exposure:F.exposure,date:F.date}; }
var nextStock=1;
Array.prototype.forEach.call(document.querySelectorAll("[data-stock]"),function(b){
  b.onclick=function(){
    nextStock=+b.getAttribute("data-stock");
    Array.prototype.forEach.call(document.querySelectorAll("[data-stock]"),function(o){ var on=o===b; o.setAttribute("aria-checked",on?"true":"false"); o.className=on?"btn":"btn ghost"; });
  };
});
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
function ditherLuma(lum,w,h,exposure){
  var hist=new Uint32Array(256), N=lum.length;
  for(var q=0;q<N;q++) hist[Math.min(255,Math.max(0,(lum[q]*255)|0))]++;
  var pct=function(f){ var want=N*f, acc=0; for(var b=0;b<256;b++){ acc+=hist[b]; if(acc>want) return b/255; } return 1; };
  var lo=pct(0.02), hi=pct(0.98), span=Math.max(0.05,hi-lo);
  var out=new Uint8Array(w*h), gain=Math.pow(1.35,exposure);
  for(var y=0;y<h;y++) for(var x=0;x<w;x++){
    var k=y*w+x, v=(lum[k]-lo)/span;
    var nb=0,n=0; if(x>0){nb+=lum[k-1];n++} if(x<w-1){nb+=lum[k+1];n++} if(y>0){nb+=lum[k-w];n++} if(y<h-1){nb+=lum[k+w];n++}
    v+= ((lum[k]-nb/n)/span)*0.6;
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
function frameStamp(fr){ return fr.blank==="dark" ? "未曝光" : fr.blank==="light" ? "全曝光" : stampOf(fr.taken); }

var revealTimer=null;
function camShowPx(px,stamp,develop){
  clearInterval(revealTimer); revealTimer=null;
  $("cam-dev").hidden=true;
  var reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finish=function(){ drawPx(cctx,cimg,px); $("cam-stamp").hidden=true; };
  if(!develop || reduce){ finish(); return; }
  $("cam-stamp").hidden=true;
  var shown=new Uint8Array(CW*CH).fill(3), row=0;
  revealTimer=setInterval(function(){
    var end=Math.min(CH,row+4);
    for(var y=row;y<end;y++) for(var x=0;x<CW;x++) shown[y*CW+x]=px[y*CW+x];
    if(end<CH) for(var x2=0;x2<CW;x2++) shown[end*CW+x2]=0;
    row=end; drawPx(cctx,cimg,shown);
    if(row>=CH){ clearInterval(revealTimer); revealTimer=null; finish(); }
  },28);
}
function camIdle(){
  var px=new Uint8Array(CW*CH);
  for(var y=0;y<CH;y++) for(var x=0;x<CW;x++){ var band=Math.floor(x/(CW/4)); px[y*CW+x]= (y>CH*0.78) ? ((x>>3)+(y>>3))%2*3 : band; }
  drawPx(cctx,cimg,px); $("cam-stamp").hidden=true;
}

function renderCam(){
  var has=!!F.roll, full=rollFull();
  $("cam-load").hidden=has || !F.ready;
  $("cam-shoot").hidden=!has || full;
  $("cam-shoot").style.display=(!has||full)?"none":"flex";
  $("cam-develop").hidden=!full;
  if(!has || full) $("cam-rewind").hidden=true;
  $("cam-rewind-btn").hidden= !has || full || $("cam-rewind").hidden===false;
  $("cam-count").textContent= has ? tintOf(F.tint).name+" · "+stockName(F.res)+" · 第 "+Math.min(F.frames.length+(full?0:1),F.size)+" / "+F.size+" 张" : (F.ready?"未装胶卷":"读取中…");
  $("cam-exp").textContent="曝光 "+(F.exposure>0?"+":"")+F.exposure+" · 对下一张生效";
  $("cam-date").textContent="日期 · "+(F.date?"开":"关");
  var a=$("album"); a.textContent="";
  if(!has) return;
  for(var n=1;n<=F.size;n++){
    var fr=F.frames[n-1];
    if(!fr){ var bl=document.createElement("div"); bl.className="blank"; bl.textContent=pad2(n); a.appendChild(bl); continue; }
    var b=document.createElement("button"); b.type="button"; b.className="fr"; b.setAttribute("aria-label","第 "+n+" 张 "+frameStamp(fr));
    if(F.viewing===n) b.setAttribute("aria-current","true");
    var cv=document.createElement("canvas"); cv.width=CW; cv.height=CH;
    var x=cv.getContext("2d"); drawPx(x,x.createImageData(CW,CH),pxFromString(fr.px));
    var lab=document.createElement("b"); lab.textContent=pad2(n);
    b.appendChild(cv); b.appendChild(lab);
    (function(n){ b.onclick=function(){ if(F.viewing===n) exitPreview(); else enterPreview(n); }; })(n);
    a.appendChild(b);
  }
  $("cam-title").textContent="点阵相机 · "+CW+"×"+CH;
  if(typeof camModeLabel==="function") camModeLabel();
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
$("cam-date").onclick=function(){
  F.date=!F.date; renderCam();
  if(S.db && F.roll){ clearTimeout(expTimer); expTimer=setTimeout(function(){ put(S.refs.film,filmDoc()); },800); }
};

/* exposure is a setting for the next frame, never an edit of a taken one */
var expTimer=null;
function setExposure(v){
  F.exposure=v; renderCam();
  if(!S.db || !F.roll) return;
  clearTimeout(expTimer); expTimer=setTimeout(function(){ put(S.refs.film,filmDoc()); },800);
}
$("cam-dark").onclick=function(){ if(F.exposure>-3) setExposure(F.exposure-1); };
$("cam-bright").onclick=function(){ if(F.exposure<3) setExposure(F.exposure+1); };

Array.prototype.forEach.call(document.querySelectorAll("[data-roll]"),function(b){
  b.onclick=function(){
    var size=+b.getAttribute("data-roll");
    setRes(nextStock); F.tint=nextTint;
    F.roll="r"+Date.now().toString(36); F.size=size; F.loaded=Date.now(); F.frames=[]; F.viewing=null;
    if(S.db) put(S.refs.film,filmDoc());
    camIdle(); renderCam(); toast("装好了一卷 "+tintOf(F.tint).name+stockName(F.res)+"，"+size+" 张。"); startLive();
  };
});

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
  $("cam-shutter").textContent = F.viewing ? "回" : "拍";
  $("cam-shutter").setAttribute("aria-label", F.viewing ? "回到拍摄" : "拍照");
  if(F.viewing){ $("cam-mode").textContent="回看第 "+F.viewing+" 张 · 再点这张、取景器或「回」回到拍摄"; $("cam-live-tag").hidden=true; $("cam-flip").hidden=true; return; }
  $("cam-mode").textContent = LIVE.on ? "实时取景" :
    (liveSupported() ? (LIVE.failed ? "没拿到摄像头权限，按「拍」会打开系统相机" : "") : "实时取景需要 HTTPS；现在按「拍」会打开系统相机");
  $("cam-live-tag").hidden=!LIVE.on || !!F.viewing;
  $("cam-flip").hidden=!LIVE.on;
}
/* two states only: shooting (sensor on) and reviewing a taken frame (sensor off) */
function enterPreview(n){
  var fr=F.frames[n-1]; if(!fr) return;
  F.viewing=n; stopLive();
  camShowPx(pxFromString(fr.px),frameStamp(fr)); renderCam();
}
function exitPreview(){
  F.viewing=null; camIdle(); renderCam(); startLive();
}
function startLive(){
  if(LIVE.on || F.viewing || !liveSupported() || !F.roll || rollFull()) { camModeLabel(); return; }
  navigator.mediaDevices.getUserMedia({video:{facingMode:LIVE.facing, width:{ideal:640}, height:{ideal:480}}, audio:false}).then(function(stream){
    if($("v-cam").hidden || !F.roll || rollFull()){ stream.getTracks().forEach(function(t){ t.stop(); }); return; }
    LIVE.stream=stream; LIVE.on=true; LIVE.failed=false;
    var v=$("cam-video"); v.srcObject=stream; var pl=v.play(); if(pl&&pl.catch) pl.catch(function(){});
    camModeLabel(); LIVE.raf=requestAnimationFrame(liveTick);
  }).catch(function(e){
    LIVE.failed=true; camModeLabel();
    if(e && e.name==="NotAllowedError") toast("没拿到摄像头权限，改用系统相机拍。");
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
  if(F.viewing || revealTimer || Date.now()<LIVE.hold || v.readyState<2 || !v.videoWidth) return;
  var lum=lumaFrom(v,v.videoWidth,v.videoHeight,CW,CH,LIVE.facing==="user");
  drawPx(cctx,cimg,ditherLuma(lum,CW,CH,F.exposure));
}
$("cam-flip").onclick=function(){ LIVE.facing = LIVE.facing==="environment" ? "user" : "environment"; stopLive(); startLive(); };
$("cam-cv").parentNode.addEventListener("click",function(){ if(F.viewing) exitPreview(); });
function takeFrame(px){
  var n=F.frames.length+1, now=Date.now();
  if(F.date) burnDate(px,CW,CH,now,F.res);
  var fr={roll:F.roll, n:n, px:Array.prototype.join.call(px,""), taken:now, dated:F.date};
  F.frames.push(fr);
  sfx("shutter"); camShowPx(px,null,true); LIVE.hold=Date.now()+1800; renderCam();
  if(S.db) put(S.refs.frames.doc(F.roll+"-"+pad2(n)),fr).then(function(ok){ if(!ok) toast("这一张没存上，重新打开相机看看。"); });
  if(rollFull()){ toast("最后一张。这卷拍完了，可以冲洗了。"); stopLive(); }
}
$("cam-shutter").onclick=function(){
  if(F.viewing){ exitPreview(); return; }
  if(!F.roll || rollFull()) return;
  var v=$("cam-video");
  if(LIVE.on && v.videoWidth){
    var lum=lumaFrom(v,v.videoWidth,v.videoHeight,CW,CH,LIVE.facing==="user");
    takeFrame(ditherLuma(lum,CW,CH,F.exposure));
    return;
  }
  $("cam-file").click();
};
$("cam-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f || !F.roll || rollFull()) return;
  $("cam-dev").hidden=false; $("cam-stamp").hidden=true;
  var url=URL.createObjectURL(f), img=new Image();
  img.onload=function(){
    var px=ditherLuma(lumaOf(img,CW,CH),CW,CH,F.exposure); URL.revokeObjectURL(url);
    F.viewing=null; takeFrame(px);
  };
  img.onerror=function(){ URL.revokeObjectURL(url); $("cam-dev").hidden=true; toast("这张照片读不出来，这一格没有用掉。"); };
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
  if(c==="declined") return "这次没保存。";
  if(c==="rate_limited") return "上一个保存窗口还没关。";
  if(c==="unavailable"||c==="not_granted") return "这里不能保存文件，要在 Claude 里打开。";
  return "保存失败（"+(c||"未知")+"）。";
}
$("dev-strip").onclick=async function(){
  if(!rollFull()) return;
  try{ if(document.fonts && document.fonts.load) await document.fonts.load('22px "VT323"'); }catch(err){}
  var cv=buildStrip(F.frames,F.size,F.loaded,F.tint);
  saveCanvas(cv,"lopda-film-"+fileStamp(F.loaded)+"-"+F.size+"exp.png").then(function(r){ if(r&&r.status==="saved") sfx("ok"), toast("冲洗好了。想要单张就放进「裁片机」。"); },function(e){ toast(saveErr(e)); });
};

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
  x.fillText((F.res===2?"FINE GRAIN":"PIXEL FILM")+" · "+T.en+" "+T.name+" · "+size+" EXP",MX,176);
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
$("dev-card").onclick=function(){
  if(!rollFull()) return;
  var btn=this; btn.disabled=true;
  fontsReady().then(function(){
    var cv=buildCard(F.frames,F.size,F.loaded,F.tint);
    return saveCanvas(cv,"lopda-card-"+fileStamp(F.loaded)+"-"+F.tint+".png");
  }).then(function(r){ if(r&&r.status==="saved"){ sfx("ok"); toast("印样卡冲印好了。"); } },function(e){ toast(saveErr(e)); })
    .then(function(){ btn.disabled=false; });
};

/* taking the roll out clears it from the handheld; ask on the panel itself */
function armNewRoll(){
  var w=$("cam-new-wrap"); w.textContent="";
  var p=document.createElement("span"); p.className="hint"; p.textContent="旧胶卷会从掌机里清掉。没冲洗的话就没了。";
  var yes=document.createElement("button"); yes.className="btn"; yes.type="button"; yes.textContent="确认取出";
  var no=document.createElement("button"); no.className="btn ghost"; no.type="button"; no.textContent="再想想";
  w.appendChild(p); w.appendChild(yes); w.appendChild(no);
  no.onclick=resetNewRoll;
  yes.onclick=function(){
    var old=F.frames.slice(), oldRoll=F.roll;
    F.roll=null; F.frames=[]; F.viewing=null;
    if(S.db){
      S.refs.film.delete().catch(function(){});
      old.reduce(function(pr,fr){ return pr.then(function(){ return S.refs.frames.doc(oldRoll+"-"+pad2(fr.n)).delete().catch(function(){}); }); },Promise.resolve());
    }
    stopLive(); resetNewRoll(); camIdle(); renderCam();
  };
}
function resetNewRoll(){
  var w=$("cam-new-wrap"); w.textContent="";
  var b=document.createElement("button"); b.className="btn ghost"; b.type="button"; b.id="cam-new"; b.textContent="取出胶卷，装新的";
  b.onclick=armNewRoll; w.appendChild(b);
}
resetNewRoll();

/* rewind early: the unshot frames get fogged and develop white */
$("cam-rewind-btn").onclick=function(){
  var left=F.size-F.frames.length; if(!F.roll || left<=0) return;
  $("rewind-title").textContent="还有 "+left+" 张没拍。";
  $("cam-rewind").hidden=false; renderCam();
};
$("rewind-cancel").onclick=function(){ $("cam-rewind").hidden=true; renderCam(); };
$("rewind-go").onclick=function(){
  if(!F.roll || rollFull()) return;
  var fill=new Array(CW*CH+1).join("3"), now=Date.now(), writes=[];
  for(var n=F.frames.length+1;n<=F.size;n++){
    var fr={roll:F.roll, n:n, px:fill, taken:now, blank:"light"};
    F.frames.push(fr);
    if(S.db) writes.push([S.refs.frames.doc(F.roll+"-"+pad2(n)),fr]);
  }
  $("cam-rewind").hidden=true; F.viewing=null; camIdle(); renderCam();
  toast("倒片完成，剩下的格子见光了。"); stopLive();
  writes.reduce(function(pr,w){ return pr.then(function(){ return put(w[0],w[1]); }); },Promise.resolve());
};

function loadFilm(){
  if(!S.db){ F.ready=true; renderCam(); return Promise.resolve(); }
  return S.refs.film.get().then(function(sn){
    var d=sn.exists?own(sn.data()):null;
    if(!d || !d.roll){ F.roll=null; F.frames=[]; F.ready=true; return; }
    F.roll=d.roll; F.size=Math.min(d.size||12,16); F.loaded=d.loaded||Date.now(); F.exposure=d.exposure|0; F.date=d.date!==false; F.tint=TINTS[d.tint]?d.tint:"lcd"; setRes(d.res||1);
    return S.refs.frames.where("roll","==",F.roll).get().then(function(q){
      var list=q.docs.map(function(x){ return own(x.data()); }).filter(function(fr){ return fr && fr.px && fr.px.length===CW*CH; });
      list.sort(function(a,b){ return a.n-b.n; });
      F.frames=list; F.ready=true;
    });
  }).catch(function(e){ F.ready=true; toast("相机读档失败（"+((e&&e.code)||"未知")+"）"); });
}

var camLinked=false, bootTimer=null;
function camBoot(){
  var box=$("cam-boot"), reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(camLinked || reduce){ camLinked=true; return; }
  var filmLine = F.roll ? ("胶卷 ： "+tintOf(F.tint).name+stockName(F.res)+" "+F.frames.length+"/"+F.size) : "胶卷 ： 未装";
  var lines=[["扩展槽 B 检测中","…",380],["发现外设","LP-CAM 点阵镜头 rev.2",420],["握手 9600 bps","",0],["固件","CAM-OS 1.03",300],[filmLine.split(" ： ")[0],filmLine.split(" ： ")[1],360],["","连接完成。",500]];
  box.textContent=""; box.hidden=false;
  var skip=document.createElement("div"); skip.className="skip"; skip.textContent="轻点跳过";
  var done=function(){ clearTimeout(bootTimer); clearInterval(bootTimer); camLinked=true; box.hidden=true; box.onclick=null; };
  box.onclick=done;
  var i=0;
  (function next(){
    if(box.hidden) return;
    if(i>=lines.length){ bootTimer=setTimeout(done,700); return; }
    var L=lines[i++], d=document.createElement("div"); d.className="ln";
    box.insertBefore(d,skip.parentNode?skip:null);
    if(!skip.parentNode) box.appendChild(skip);
    if(L[0]==="握手 9600 bps"){
      var n=0; d.className="ln bar8";
      bootTimer=setInterval(function(){
        n++; if(n===1) sfx("modem"); d.textContent="握手 9600 bps ["+"█".repeat(n)+"░".repeat(10-n)+"]";
        if(n>=10){ clearInterval(bootTimer); d.textContent="握手 9600 bps [██████████] OK"; bootTimer=setTimeout(next,240); sfx("ok"); }
      },70);
      return;
    }
    d.textContent=L[0] ? L[0]+" … " : "";
    bootTimer=setTimeout(function(){ d.textContent=(L[0]?L[0]+(L[1]!=="…"?" ： ":" "):"")+L[1]; bootTimer=setTimeout(next,L[2]); },260);
  })();
}
function openCam(){
  /* the camera always opens ready to shoot, never in the middle of a review */
  F.viewing=null;
  show("cam"); renderCam(); camIdle();
  var go=function(){ camBoot(); renderCam(); startLive(); };
  if(F.ready) go(); else loadFilm().then(go);
}

/* ---------- 裁片机: slide the strip under a fixed window and cut what's inside ---------- */
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
  $("cut-state").textContent=TINTS[CUT.tint].name+" · "+n+" 格 · 已裁 0 张";
  return true;
}
$("cut-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f) return;
  var url=URL.createObjectURL(f), img=new Image();
  $("cut-state").textContent="读取中…";
  img.onload=function(){
    var ok=cutLoad(img,f.name); URL.revokeObjectURL(url);
    if(!ok){ $("cut-state").textContent=""; toast("这不像 Lo-PDA 冲洗出来的横向长条。"); }
  };
  img.onerror=function(){ URL.revokeObjectURL(url); $("cut-state").textContent=""; toast("这张图读不出来。"); };
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
var EDGES=[["none","无","裁下来直接是胶片画面。"],["plain","白边","加一圈相纸白边。"],["scallop","花边","加一圈波浪形的花边相纸，像老照片。"],["card","3:4 卡","放在一张 3:4 相纸卡上，适合直接发出去。"]];
var edgeIdx=0;
$("cut-edge").onclick=function(){
  edgeIdx=(edgeIdx+1)%EDGES.length;
  this.textContent="相纸边 · "+EDGES[edgeIdx][1]; $("cut-edge-note").textContent=EDGES[edgeIdx][2];
};
/* is a point (in strip units, within the bordered print) on the paper? */
function onPaper(x,y,W,H,style){
  if(style!=="scallop") return true;
  var R=4, P=8, edge=function(along,depth){ var m=((along%P)+P)%P-P/2; return depth >= R - Math.sqrt(Math.max(0,R*R-m*m)); };
  return edge(x,y) && edge(x,H-1-y) && edge(y,x) && edge(y,W-1-x);
}
/* one cut on a 3:4 card: the print sits on photo paper with a short caption */
function buildCutCard(w,x0){
  var c=document.createElement("canvas"); c.width=CARD.W; c.height=CARD.H;
  var x=c.getContext("2d"), T=TINTS[CUT.tint];
  x.fillStyle="rgb("+CARD.PAPER.join(",")+")"; x.fillRect(0,0,c.width,c.height);
  var MX=96, pw=CARD.W-2*MX, ph=Math.round(pw*w.h/w.w), py=Math.round((CARD.H-ph)/2)-60;
  var d=new Date();
  x.fillStyle=CARD.INK; x.font='44px "VT323", monospace'; x.textBaseline="alphabetic";
  x.fillText("LO-PDA",MX,py+ph+76);
  x.textAlign="right"; x.fillStyle=CARD.SOFT; x.font='26px "DotGothic16", "VT323", monospace';
  x.fillText(T.en+" "+T.name+" · "+d.getFullYear()+"."+pad2(d.getMonth()+1)+"."+pad2(d.getDate()),CARD.W-MX,py+ph+74);
  x.textAlign="left";
  var region=new Uint8Array(w.w*w.h);
  for(var y=0;y<w.h;y++) for(var xx=0;xx<w.w;xx++) region[y*w.w+xx]=CUT.data[(w.y+y)*CUT.W+x0+xx];
  putFrame(x,region,w.w,w.h,CUT.pal,MX,py,pw,ph);
  return c;
}
$("cut-go").onclick=function(){
  sfx("shutter");
  if(!CUT.data) return;
  var w=cutWin(), x0=cutX(), SC=2, style=EDGES[edgeIdx][0], B= style==="none" ? 0 : 14;
  if(style==="card"){
    var btnc=this; btnc.disabled=true;
    fontsReady().then(function(){ return saveCanvas(buildCutCard(w,x0),CUT.name+"-card-"+pad2(CUT.count+1)+".png"); })
      .then(function(r){ if(r&&r.status==="saved"){ CUT.count++; $("cut-state").textContent=TINTS[CUT.tint].name+" · "+CUT.n+" 格 · 已裁 "+CUT.count+" 张"; toast("卡片冲印好了。"); } },function(e){ toast(saveErr(e)); })
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
    if(r&&r.status==="saved"){ CUT.count++; $("cut-state").textContent=TINTS[CUT.tint].name+" · "+CUT.n+" 格 · 已裁 "+CUT.count+" 张"; toast("裁好了。"); }
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
  var f=$("run-frame");
  if(S.running && S.running.buttons && f.contentWindow) f.contentWindow.postMessage({pad:1,op:"button",b:b,down:down},"*");
}
function releaseButtons(){ Object.keys(PADB).forEach(function(b){ setButton(b,false); }); }
function showPad(on){
  if(!on) releaseButtons();
  $("gamepad").hidden=!on;
  if(!$("v-cart").hidden) cartLayout();
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
    sc.onload=res; sc.onerror=function(){ rej(new Error("模拟器文件没载入")); };
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
  if(u8.length<0x8000 || u8.length>8*1024*1024) return {ok:false, why:"文件大小不像 GB 卡带"};
  var cgb=u8[0x143];
  if(cgb===0xC0) return {ok:false, why:"这是彩色专用卡带（GBC），这台机器只认黑白卡带"};
  var t="", end=(cgb&0x80)?0x143:0x144;
  for(var i=0x134;i<end;i++){ var c=u8[i]; if(!c) break; if(c>=32&&c<127) t+=String.fromCharCode(c); }
  var x=0; for(i=0x134;i<=0x14C;i++) x=(x-u8[i]-1)&0xFF;
  if(x!==u8[0x14D]) return {ok:false, why:"卡带头校验不对，文件可能坏了"};
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
  if(!CARTS.length){ var e=document.createElement("li"); e.className="empty"; e.textContent=S.db?"卡带架是空的。":"现在存不了档，插进来的卡带关掉就没了。"; ul.appendChild(e); return; }
  CARTS.slice().sort(function(a,b){ return (b.played||b.added||0)-(a.played||a.added||0); }).forEach(function(c){
    var li=document.createElement("li"); li.className="store-item";
    var tile=document.createElement("span"); tile.className="tile"; tile.textContent=Array.from(c.name||"?")[0].toUpperCase();
    var body=document.createElement("div"); body.className="store-body";
    var t=document.createElement("b"); t.textContent=c.name;
    var m=document.createElement("small"); m.textContent=(c.title||"无标题")+" · "+Math.round(c.bytes/1024)+" KB"+(c.played?" · "+fmt(c.played):"");
    body.appendChild(t); body.appendChild(m);
    var acts=document.createElement("div"); acts.className="acts";
    var play=document.createElement("button"); play.type="button"; play.className="btn"; play.textContent="插卡";
    play.onclick=function(){ gbPlay(c); };
    var del=document.createElement("button"); del.type="button"; del.className="btn ghost"; del.textContent="扔掉";
    del.onclick=function(){
      if(del.dataset.armed){ deleteCart(c); return; }
      del.dataset.armed="1"; del.textContent="确认扔掉"; setTimeout(function(){ if(del.isConnected){ delete del.dataset.armed; del.textContent="扔掉"; } },3000);
    };
    acts.appendChild(play); acts.appendChild(del);
    li.appendChild(tile); li.appendChild(body); li.appendChild(acts); ul.appendChild(li);
  });
}
function loadCarts(){
  if(!S.db) return Promise.resolve();
  return S.refs.carts.get().then(function(q){ CARTS=q.docs.map(function(d){ var o=own(d.data()); o.id=d.id; return o; }); renderCarts(); }).catch(function(){ toast("卡带架读不出来"); });
}
function deleteCart(c){
  CARTS=CARTS.filter(function(x){ return x.id!==c.id; }); renderCarts();
  if(S.db){ S.refs.carts.doc(c.id).delete(); S.refs.roms.doc(c.id).delete(); S.refs.cartsave.doc(c.id).delete(); }
  toast("扔掉了 "+c.name+"，存档也一起清掉了。");
}
$("cart-file").onchange=function(){
  var f=this.files&&this.files[0]; this.value=""; if(!f) return;
  f.arrayBuffer().then(function(buf){
    var u8=new Uint8Array(buf), h=cartHeader(u8);
    if(!h.ok){ toast(h.why); sfx("err"); return; }
    return sha256hex(buf).then(function(hex){
      var id=hex.slice(0,24), name=noEmoji(f.name.replace(/\.(gbc?|bin)$/i,"")).slice(0,40)||h.title||"卡带";
      var have=CARTS.filter(function(x){ return x.id===id; })[0];
      if(have){ toast("这盘卡带已经在架子上了。"); return; }
      var meta={name:name, title:h.title, bytes:u8.length, added:Date.now(), dual:h.dual};
      var write = S.db ? put(S.refs.roms.doc(id),{rom:b64(u8)}).then(function(ok){ return ok && put(S.refs.carts.doc(id),meta); }) : Promise.resolve(true);
      return write.then(function(ok){
        if(!ok) return;
        meta.id=id; if(!S.db) meta.mem=u8; CARTS.push(meta); renderCarts(); sfx("ok");
        toast(h.dual?"放好了。这是双模卡带，会按黑白模式运行。":"放好了。");
      });
    });
  }).catch(function(e){ toast("读不了这个文件："+((e&&e.message)||e)); });
};
function openCart(){
  show("cart"); gbShowLib(); renderCarts(); loadCarts();
}
function gbShowLib(){
  $("cart-lib").hidden=false; $("cart-play").hidden=true; $("cart-tools").hidden=true; $("v-cart").classList.remove("locked");
  $("cart-title").textContent="卡带机"; $("cart-state").textContent=""; showPad(false);
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
  $("cart-state").textContent="读卡…";
  var romP = c.mem ? Promise.resolve(c.mem) : S.refs.roms.doc(c.id).get().then(function(sn){ if(!sn.exists) throw new Error("卡带数据找不到了"); return unb64(own(sn.data()).rom); });
  var saveP = S.db ? S.refs.cartsave.doc(c.id).get().then(function(sn){ return sn.exists ? own(sn.data()) : {}; }).catch(function(){ return {}; }) : Promise.resolve({});
  audio();   /* this tap unlocks sound on phones */
  if(SND.ctx && SND.ctx.state==="suspended") SND.ctx.resume();
  Promise.all([gbModule(),romP,saveP]).then(function(r){
    if($("v-cart").hidden) return;
    gbStart(c,r[1],r[2]);
  }).catch(function(e){ $("cart-state").textContent=""; toast("开不了机："+((e&&e.message)||e)); sfx("err"); });
}
function gbStart(c,rom,save){
  gbStop();
  var m=GB.mod, data=asMono(rom), size=(data.length+0x7fff)&~0x7fff, ac=SND.ctx;
  GB.rom=m._malloc(size); var h=heap(GB.rom,size); h.fill(0); h.set(data);
  GB.e=m._emulator_new_simple(GB.rom,size,ac?ac.sampleRate:44100,GB_AUDIO_FRAMES,0);
  if(!GB.e){ m._free(GB.rom); GB.rom=0; throw new Error("这盘卡带读不出来"); }
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
  toast("存好了（覆盖上一份）。"); sfx("ok"); resetCartLoad();
};
function resetCartLoad(){ var b=$("cart-load"); delete b.dataset.armed; b.textContent="读档"; b.disabled=!(GB.save&&GB.save.state); }
$("cart-load").onclick=function(){
  var b=this; if(!GB.e || !GB.save.state) return;
  if(!b.dataset.armed){ b.dataset.armed="1"; b.textContent="确认读档"; setTimeout(function(){ if(b.dataset.armed) resetCartLoad(); },3000); return; }
  var m=GB.mod, st=unb64(GB.save.state), ok=false;
  gbWithFile(m._state_file_data_new(GB.e),function(fd,buf){ if(st.length===buf.length){ buf.set(st); ok=m._emulator_read_state(GB.e,fd)===0; } });
  resetCartLoad();
  if(ok){ toast("回到 "+fmt(GB.save.stateAt)+" 的存档。"); sfx("ok"); } else { toast("存档读不进去。"); sfx("err"); }
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
    S.refs.settings.get().then(function(sn){ var d=sn.exists?own(sn.data()):null; if(d){ SND.on=d.sound!==false; SND.vol=Math.max(0,Math.min(3,d.volume==null?2:d.volume|0)); } }).catch(function(){});
    $("savestate").textContent="本机存档";
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
    $("savestate").textContent="未存档";
    if(window.console) console.error("Lo-PDA storage failed", e);
    toast("这台浏览器不让存档，关掉页面后内容会丢。");
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
      toast("新版本下载好了。到「设置」按「重启升级」。");
    });
  }
})();
})();
