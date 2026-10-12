/*
 * Lo-PDA built-in: the app store (community registry), the preinstalled apps, and the sandboxed runner
 * with its PAD bridge (storage, sounds and music, buttons, and files behind the runtime's own confirm dialog).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var REGISTRY = new URL("../registry/", location.href).href;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, sha256hex=LP.sha256hex,
  validIcon=LP.validIcon, fillTile=LP.fillTile, appName=LP.appName, appDesc=LP.appDesc, renderHome=LP.renderHome,
  upsert=LP.upsert, dropLocal=LP.dropLocal, pending=LP.pending, APP_SFX=LP.APP_SFX;
/* community apps that come installed, in this order on the home screen after the built-ins (docs/design/pad-files.md) */
var PREINSTALL=["calculator","paint"];
/* capabilities a manifest may ask for (SPEC.md section 2) */
var PERMISSIONS=["files"];
function validPerms(x){ return Array.isArray(x) ? PERMISSIONS.filter(function(p){ return x.indexOf(p)>=0; }) : []; }
function allowed(a,perm){ return !!(a && a.permissions && a.permissions.indexOf(perm)>=0); }

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
    preinstall();
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
    validPerms(r.permissions).forEach(function(p){ var x=document.createElement("small"); x.textContent=tr("store.perm."+p); body.appendChild(x); });
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
  fetchApp(r).then(function(prev){
    toast(tr(prev?"store.updated":"store.installed",{name:appName(r)})); sfx("ok");
    renderStore();
  }).catch(function(e){
    toast(tr("store.failed",{msg:e.message})); sfx("err"); btn.disabled=false; btn.textContent=tr("store.retry");
  });
}
/* download, verify and store one registry entry; resolves with the version it replaced (or null) */
function fetchApp(r,extra){
  return fetch(new URL(r.path,REGISTRY).href,{cache:"no-cache"}).then(function(res){
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
      spec:r.spec||"lopda/0", buttons: r.spec==="lopda/1" && r.buttons===true, permissions: r.spec==="lopda/1" ? validPerms(r.permissions) : [],
      sha256:r.sha256, installed: prev ? prev.installed : Date.now(), updated: Date.now(), html:html};
    /* a preinstalled app keeps its place on the home screen through updates */
    var pre=(extra && extra.preinstalled) || (prev && prev.preinstalled);
    if(pre) app.preinstalled=pre;
    return saveApp(app).then(function(ok){
      if(!ok) throw new Error(tr("store.nostore"));
      return prev;
    });
  });
}

/* ---------- preinstalled apps ----------
   On first start, and whenever PREINSTALL gains an id, install those apps from the registry quietly, exactly like
   the store would (hash-checked). The ids already handled are remembered, so an app the player removes stays removed.
   sw.js keeps their files in the offline cache, so this also works when the first start has no network. */
var preBusy=false;
function preinstall(){
  if(preBusy || !S.db || !S.registry) return;
  preBusy=true;
  var ref=S.db.doc("data/users/local/preinstall"), done;
  ref.get().then(function(sn){
    done=(sn.exists && own(sn.data()).ids) || [];
    var todo=PREINSTALL.filter(function(id){ return done.indexOf(id)<0; });
    if(!todo.length) return;
    return S.refs.apps.get().then(function(q){
      var have={}; q.docs.forEach(function(d){ have[d.id]=true; });
      /* one at a time, in list order, so the home screen order is the list order */
      return todo.reduce(function(chain,id){
        return chain.then(function(){
          var r=null; S.registry.apps.forEach(function(x){ if(x.id===id) r=x; });
          if(have[id]){ done.push(id); return; }            /* the player installed it already */
          if(!r) return;                                     /* not in this registry: try again later */
          return fetchApp(r,{preinstalled:PREINSTALL.indexOf(id)+1}).then(function(){ done.push(id); }, function(){});
        });
      },Promise.resolve()).then(function(){ return put(ref,{ids:done}); }).then(function(){ renderStore(); if(!$("v-home").hidden) renderHome(); });
    });
  }).catch(function(){}).then(function(){ preBusy=false; });
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
  closeAsk(false);
  LP.chip.stop();   /* the old app's song ends with its frame */
  S.running=a;
  $("run-title").textContent=appName(a)+" · v"+(a.version||"?");
  LP.resetConfirm("run-del-wrap","run-del",tr("run.remove"),function(){ if(S.running){ var n=appName(S.running); deleteApp(S.running.id); show("home"); toast(tr("run.removed",{name:n})); } });
  $("run-err").hidden=true;
  show("run");
  showPad(!!a.buttons);
  freshRunFrame();
  var start=function(h){ $("run-frame").srcdoc=lopdaWrapApp(h,{lang:I18N.lang, music:true}); };
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
  } else if(d.op==="file"){
    fileRequest(S.running,f.contentWindow,d);
  } else if(d.op==="sfx"){
    var named=APP_SFX.indexOf(d.name)>=0, custom=!named && d.params && typeof d.params==="object";
    if(!named && !custom) return;
    var now=Date.now(); if(now-sfxWindow.t>1000){ sfxWindow.t=now; sfxWindow.n=0; }
    if(++sfxWindow.n>20) return;   /* at most 20 sounds a second per app, named and custom together */
    if(named) sfx(d.name); else LP.sfxCustom(d.params);
  } else if(d.op==="music"){
    /* at most 4 calls a second (chip.js drops the rest); a score that does not parse is shown like any app error */
    var r=LP.chip.music(d);
    if(r && r.error){ $("run-err-msg").textContent=tr("run.music",{msg:String(r.error).slice(0,240)}); $("run-err").hidden=false; }
  }
});
var sfxWindow={t:0,n:0};

/* ---------- files: PAD.exportFile / PAD.importFile ----------
   Only apps whose manifest has "permissions": ["files"]. Every request opens the runtime's own dialog on the
   screen; its OK button acts on release (pointerup) or from a real click, so the share sheet and the file picker
   are opened by a tap on the outer page (iPhone Safari would refuse a gesture that started inside the sandbox).
   The chin pad works too: a fresh A press confirms, B cancels. One file at most 2 MB. */
var FILE_MAX=2*1024*1024, ask=null;
function fileReply(req,v,error){
  /* the app may have closed meanwhile: answer only the frame that asked */
  if(S.running!==req.app || $("run-frame").contentWindow!==req.win) return;
  req.win.postMessage(error ? {pad:1,op:"filed",i:req.i,error:error} : {pad:1,op:"filed",i:req.i,v:v},"*");
}
function dataBlob(data,type){
  var m=/^data:([^,;]*)((?:;[^,;]*)*?)(;base64)?,/.exec(data);
  if(!m) return new Blob([data],{type:type||"text/plain"});
  var body=data.slice(m[0].length);
  if(!m[3]) return new Blob([decodeURIComponent(body)],{type:type||m[1]});
  var bin=atob(body), u8=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  return new Blob([u8],{type:type||m[1]});
}
/* a file name from an app: no folders, no control characters, no emoji, not too long */
function cleanName(n){ var x=LP.noEmoji(n).replace(/[\/\\:*?"<>|\u0000-\u001f]/g,"").replace(/^\.+/,"").slice(-64); return x||"lopda.txt"; }
function fileRequest(app,win,d){
  var req={app:app, win:win, i:d.i, kind:d.kind};
  if(!allowed(app,"files")){ fileReply(req,null,'this app has no "files" permission'); return; }
  if(d.kind==="export"){
    if(typeof d.data!=="string" || typeof d.name!=="string"){ fileReply(req,null,"bad request"); return; }
    try{ req.blob=dataBlob(d.data,typeof d.type==="string"?d.type:""); }catch(e){ fileReply(req,null,"bad data"); return; }
    if(req.blob.size>FILE_MAX){ fileReply(req,null,"file too large (2 MB at most)"); return; }
    req.name=cleanName(d.name);
  } else if(d.kind==="import"){
    req.accept=Array.isArray(d.accept) ? d.accept.filter(function(a){ return typeof a==="string" && /^[\w.+\/*-]{1,64}$/.test(a); }).slice(0,16) : [];
  } else { fileReply(req,null,"bad request"); return; }
  if(ask) closeAsk(true);
  openAsk(req);
}
function openAsk(req){
  ask=req;
  /* the app lets go of every button: the dialog has the pad now */
  req.win.postMessage({pad:1,op:"release-all"},"*");
  var scrim=document.createElement("div"); scrim.className="file-ask"; scrim.id="file-ask";
  var box=document.createElement("div"); box.className="box"; box.setAttribute("role","dialog");
  var p=document.createElement("p"); p.textContent=req.kind==="export" ? tr("file.export",{name:req.name}) : tr("file.import");
  var row=document.createElement("div"); row.className="row";
  var ok=document.createElement("button"); ok.className="btn"; ok.type="button"; ok.id="file-ok"; ok.textContent=tr(req.kind==="export"?"file.ok":"file.pick");
  var no=document.createElement("button"); no.className="btn ghost"; no.type="button"; no.id="file-no"; no.textContent=tr("common.cancel");
  row.appendChild(ok); row.appendChild(no); box.appendChild(p); box.appendChild(row);
  if(S.running && S.running.buttons){ var k=document.createElement("small"); k.textContent=tr("file.keys"); box.appendChild(k); }
  scrim.appendChild(box); $("screen").appendChild(scrim);
  req.el=scrim;
  onRelease(ok,function(){ askOk(); });
  onRelease(no,function(){ closeAsk(true); });
}
/* act when the finger lifts off the button it went down on, or on a keyboard click */
function onRelease(btn,fn){
  var down=false;
  btn.addEventListener("pointerdown",function(){ down=true; });
  btn.addEventListener("pointerleave",function(){ down=false; });
  btn.addEventListener("pointercancel",function(){ down=false; });
  btn.addEventListener("pointerup",function(){ if(down){ down=false; fn(); } });
  btn.addEventListener("click",function(e){ if(e.detail===0) fn(); });
}
/* answer: true sends "cancelled" / null; false closes without an answer (the app is gone) */
function closeAsk(answer){
  var req=ask; if(!req) return;
  ask=null;
  /* the tap that closed it may still turn into a click: keep the empty scrim a moment so it can't reach the app */
  var el=req.el; el.textContent=""; setTimeout(function(){ el.remove(); },400);
  if(answer) fileReply(req,req.kind==="export"?"cancelled":null);
}
function askOk(){
  var req=ask; if(!req) return;
  if(req.kind==="export"){
    closeAsk(false);
    LP.S.downloads.save({filename:req.name, data:req.blob}).then(function(r){
      fileReply(req,r && r.status==="saved" ? "saved" : "cancelled");
    }).catch(function(e){
      if(!(e && e.code==="declined")) toast(LP.saveErr(e));
      fileReply(req,"cancelled");
    });
    return;
  }
  /* the picker must open inside this tap */
  var input=document.createElement("input"); input.type="file"; input.className="file-in";
  if(req.accept.length) input.accept=req.accept.join(",");
  var settled=false, finish=function(v){ if(settled) return; settled=true; input.remove(); fileReply(req,v); };
  input.addEventListener("change",function(){
    var f=input.files && input.files[0];
    if(!f){ finish(null); return; }
    readPicked(f,req.accept).then(finish,function(e){ toast(tr(e && e.message==="toobig"?"file.toobig":e && e.message==="badtype"?"file.badtype":"file.readfail")); sfx("err"); finish(null); });
  });
  input.addEventListener("cancel",function(){ finish(null); });
  $("screen").appendChild(input);
  closeAsk(false);
  input.click();
}
function accepts(accept,f){
  if(!accept.length) return true;
  var type=(f.type||"").toLowerCase(), name=(f.name||"").toLowerCase();
  return accept.some(function(a){
    a=a.toLowerCase();
    if(a.charAt(0)===".") return name.slice(-a.length)===a;
    if(/\/\*$/.test(a)) return type.indexOf(a.slice(0,-1))===0;
    return type===a;
  });
}
/* -> {name, type, data}: text as a string, anything else as a data: URL */
function readPicked(f,accept){
  if(!accepts(accept,f)) return Promise.reject(new Error("badtype"));
  var big=f.size>FILE_MAX;
  /* a phone photo is often over 2 MB: pictures are scaled down to fit instead of refused */
  if(big && /^image\/(png|jpeg|webp|gif|heic|heif)$/.test(f.type)) return shrinkImage(f);
  if(big) return Promise.reject(new Error("toobig"));
  return new Promise(function(resolve,reject){
    var text=/^text\/|^application\/json$/.test(f.type), r=new FileReader();
    r.onload=function(){ resolve({name:f.name, type:f.type, data:r.result}); };
    r.onerror=function(){ reject(new Error("read")); };
    if(text) r.readAsText(f); else r.readAsDataURL(f);
  });
}
function shrinkImage(f){
  return new Promise(function(resolve,reject){
    var url=URL.createObjectURL(f), img=new Image();
    img.onerror=function(){ URL.revokeObjectURL(url); reject(new Error("read")); };
    img.onload=function(){
      URL.revokeObjectURL(url);
      var type=f.type==="image/png"?"image/png":"image/jpeg", side=2048;
      var attempt=function(){
        var k=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));
        var c=document.createElement("canvas"); c.width=Math.max(1,Math.round(img.naturalWidth*k)); c.height=Math.max(1,Math.round(img.naturalHeight*k));
        /* an <img> onto a canvas, never a canvas onto a canvas (Safari swaps red and blue on that path) */
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        var url2=c.toDataURL(type,0.9), bytes=Math.floor((url2.length-url2.indexOf(",")-1)*3/4);
        if(bytes<=FILE_MAX) resolve({name:f.name.replace(/\.(heic|heif)$/i,".jpg"), type:type, data:url2});
        else if(side>256){ side=side/2; attempt(); }
        else reject(new Error("toobig"));
      };
      attempt();
    };
    img.src=url;
  });
}
$("store-refresh").onclick=function(){ loadRegistry(true); };

LP.runApp=runApp;
LP.onData("apps",function(){ if(!$("v-store").hidden) renderStore(); });
/* the chin pad reaches a running app only when its manifest asks for buttons */
/* while the file dialog is open it has the pad: a fresh A press confirms on release, B cancels */
var askA=false;
LP.padRoute("file",function(b,down){
  if(!ask){ askA=false; return false; }
  if(b==="a"){ if(down) askA=true; else if(askA){ askA=false; askOk(); } }
  else if(b==="b" && !down) closeAsk(true);
  return true;
});
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
  leave:function(){ closeAsk(false); LP.chip.stop(); $("run-frame").srcdoc=""; S.running=null; },
  lang:function(){
    /* apps read PAD.lang once at start: a running app is started again in the new language */
    if(S.running && !$("v-run").hidden) runApp(S.running);
  }});
})();
