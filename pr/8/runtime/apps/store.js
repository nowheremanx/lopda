/*
 * Lo-PDA built-in: the app store (community registry) and the sandboxed runner.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var REGISTRY = new URL("../registry/", location.href).href;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, sha256hex=LP.sha256hex,
  validIcon=LP.validIcon, fillTile=LP.fillTile, appName=LP.appName, appDesc=LP.appDesc, renderHome=LP.renderHome,
  upsert=LP.upsert, dropLocal=LP.dropLocal, pending=LP.pending, APP_SFX=LP.APP_SFX;

/* ---------- store: the community registry ---------- */
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
  LP.resetConfirm("run-del-wrap","run-del",tr("run.remove"),function(){ if(S.running){ var n=appName(S.running); deleteApp(S.running.id); show("home"); toast(tr("run.removed",{name:n})); } });
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
$("store-refresh").onclick=function(){ loadRegistry(true); };

LP.runApp=runApp;
LP.onData("apps",function(){ if(!$("v-store").hidden) renderStore(); });
/* the chin pad reaches a running app only when its manifest asks for buttons */
LP.padRoute("run",function(b,down){
  var f=$("run-frame");
  if(S.running && S.running.buttons && f.contentWindow) f.contentWindow.postMessage({pad:1,op:"button",b:b,down:down},"*");
  return true;
});
LP.builtin({id:"store", label:"app.store", icon:"store", view:"store",
  open:function(){ show("store"); },
  tag:function(){ return updatesAvailable()?tr("home.updates"):""; },
  enter:function(){ renderStore(); loadRegistry(); },
  ready:function(){ loadRegistry(); }});
/* the runner owns the run view but has no icon of its own: apps appear on the home screen */
LP.builtin({id:"run", view:"run", keepPad:true,
  leave:function(){ $("run-frame").srcdoc=""; S.running=null; },
  lang:function(){
    /* apps read PAD.lang once at start: a running app is started again in the new language */
    if(S.running && !$("v-run").hidden) runApp(S.running);
  }});
})();
