/*
 * Lo-PDA built-in: the app store (community registry), the preinstalled apps, and the sandboxed runner
 * with its PAD bridge (storage, sounds, music and ambience, buttons, files behind the runtime's own confirm dialog, tilt and
 * the microphone through runtime/sensors.js, asked for on the same dialog, writing into notes on that dialog too, speech, and one
 * photo at a time through the runtime's own viewfinder, apps/snap.js).
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
var PERMISSIONS=["files","motion","mic","notes","camera"];
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
  revokeSense(id);
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
  LP.snap.cancel();   /* the old app's viewfinder closes with its frame */
  LP.speech.stop();   /* and its speech */
  sensors.stopAll();   /* the old app's tilt and microphone end with its frame */
  LP.chip.stop();   /* the old app's song and ambience end with its frame */
  S.running=a;
  $("run-title").textContent=appName(a)+" · v"+(a.version||"?");
  LP.resetConfirm("run-del-wrap","run-del",tr("run.remove"),function(){ if(S.running){ var n=appName(S.running); deleteApp(S.running.id); show("home"); toast(tr("run.removed",{name:n})); } });
  $("run-err").hidden=true;
  show("run");
  showPad(!!a.buttons);
  LP.keepAwake(true);   /* a running app keeps the screen on */
  freshRunFrame();
  var start=function(h){ $("run-frame").srcdoc=lopdaWrapApp(h,{lang:I18N.lang, music:true, ambience:true, sensors:true, notes:true, say:true, camera:true}); };
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
  } else if(d.op==="sense"){
    senseRequest(S.running,f.contentWindow,d);
  } else if(d.op==="notes"){
    notesRequest(S.running,f.contentWindow,d);
  } else if(d.op==="say"){
    sayRequest(S.running,f.contentWindow,d);
  } else if(d.op==="snap"){
    snapRequest(S.running,f.contentWindow,d);
  } else if(d.op==="sfx"){
    var named=APP_SFX.indexOf(d.name)>=0, custom=!named && d.params && typeof d.params==="object";
    if(!named && !custom) return;
    var now=Date.now(); if(now-sfxWindow.t>1000){ sfxWindow.t=now; sfxWindow.n=0; }
    if(++sfxWindow.n>20) return;   /* at most 20 sounds a second per app, named and custom together */
    if(named) LP.appSfx(d.name); else LP.sfxCustom(d.params);
  } else if(d.op==="music"){
    /* at most 4 calls a second (chip.js drops the rest); a score that does not parse is shown like any app error */
    var r=LP.chip.music(d);
    if(r && r.error){ $("run-err-msg").textContent=tr("run.music",{msg:String(r.error).slice(0,240)}); $("run-err").hidden=false; }
  } else if(d.op==="ambience"){
    /* 4 calls a second (over that, the newest waits its turn); an unknown preset is shown like any app error */
    var ra=LP.chip.ambience(d);
    if(ra && ra.error){ $("run-err-msg").textContent=tr("run.ambience",{msg:String(ra.error).slice(0,240)}); $("run-err").hidden=false; }
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
  req.ok=function(){ fileOk(req); };
  req.cancel=function(){ fileReply(req,req.kind==="export"?"cancelled":null); };
  if(!allowed(app,"files")){ fileReply(req,null,'this app has no "files" permission'); return; }
  if(d.kind==="export"){
    if(typeof d.data!=="string" || typeof d.name!=="string"){ fileReply(req,null,"bad request"); return; }
    try{ req.blob=dataBlob(d.data,typeof d.type==="string"?d.type:""); }catch(e){ fileReply(req,null,"bad data"); return; }
    if(req.blob.size>FILE_MAX){ fileReply(req,null,"file too large (2 MB at most)"); return; }
    req.name=cleanName(d.name);
    req.text=tr("file.export",{name:req.name}); req.okLabel=tr("file.ok");
  } else if(d.kind==="import"){
    req.accept=Array.isArray(d.accept) ? d.accept.filter(function(a){ return typeof a==="string" && /^[\w.+\/*-]{1,64}$/.test(a); }).slice(0,16) : [];
    req.text=tr("file.import"); req.okLabel=tr("file.pick");
  } else { fileReply(req,null,"bad request"); return; }
  if(ask) closeAsk(true);
  openAsk(req);
}
/* The runtime's dialog over a running app: req.text, req.note (optional), req.okLabel, req.noLabel; req.ok() runs inside the
   tap (or the A release) that confirms, req.cancel() answers no. req.bar: a one-line bar to tap instead of a dialog */
function openAsk(req){
  ask=req;
  /* the app lets go of every button: the dialog has the pad now */
  req.win.postMessage({pad:1,op:"release-all"},"*");
  var scrim=document.createElement("div"); scrim.className="file-ask"+(req.bar?" bar":""); scrim.id="file-ask";
  req.el=scrim;
  if(req.bar){
    var tap=document.createElement("button"); tap.className="btn sense-bar"; tap.type="button"; tap.id="sense-tap"; tap.textContent=req.text;
    scrim.appendChild(tap); $("screen").appendChild(scrim);
    onRelease(tap,function(){ askOk(); });
    return;
  }
  var box=document.createElement("div"); box.className="box"; box.setAttribute("role","dialog");
  var p=document.createElement("p"); p.textContent=req.text;
  /* the notes dialog's line names an app and a note: keep each name whole on its line */
  if(req.quote) p.className="names";
  box.appendChild(p);
  /* the words an app wants to write, as they will read (PAD.notes.append) */
  if(req.quote){ var q=document.createElement("p"); q.className="quote"; q.id="file-quote"; q.textContent=req.quote; box.appendChild(q); }
  if(req.note){ var n=document.createElement("p"); n.className="note"; n.textContent=req.note; box.appendChild(n); }
  var row=document.createElement("div"); row.className="row";
  var ok=document.createElement("button"); ok.className="btn"; ok.type="button"; ok.id="file-ok"; ok.textContent=req.okLabel;
  var no=document.createElement("button"); no.className="btn ghost"; no.type="button"; no.id="file-no"; no.textContent=req.noLabel||tr("common.cancel");
  row.appendChild(ok); row.appendChild(no); box.appendChild(row);
  if(S.running && S.running.buttons){ var k=document.createElement("small"); k.textContent=tr("file.keys"); box.appendChild(k); }
  scrim.appendChild(box); $("screen").appendChild(scrim);
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
  if(answer && req.cancel) req.cancel();
}
function askOk(){ var req=ask; if(req) req.ok(); }
function fileOk(req){
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
/* ---------- tilt and the microphone: PAD.motion / PAD.mic (runtime/sensors.js, decisions.md section 23) ----------
   Only apps whose manifest has "motion" or "mic". The first start() of an app opens the runtime's dialog; A (on release) or
   the OK tap allows it and opens the system prompt inside that same tap. An allowed app is remembered (Settings lists
   them and revokes). iOS may ask again after a relaunch, and its prompt needs a tap on the runtime itself: a start()
   without one shows a one-line bar to tap. Readings go only to the app in front; every way out stops them, and the
   microphone's way out always sets the audio session back to "ambient". */
function frontWin(){ var f=$("run-frame"); return S.running && !$("v-run").hidden && f ? f.contentWindow : null; }
var micMark=$("mic-mark");
var sensors=window.LopdaSensors.host({
  window:window, document:document, navigator:navigator,
  context:function(make){ return make ? LP.audio() : LP.SND.ctx; },
  session:function(type){ LP.setSession(type); },
  owner:frontWin,
  send:function(win,msg){ msg.pad=1; try{ win.postMessage(msg,"*"); }catch(e){} },
  mic:function(on){ micMark.hidden=!on; LP.micRoute(on); },
  resume:function(win,kinds){
    if(!S.running || frontWin()!==win) return;
    ["motion","mic"].forEach(function(k){ if(kinds[k]) begin({app:S.running, win:win, sense:k, reply:function(){}}); });
  }
});
/* the status bar's "listening" mark: a small microphone in paper on an ink square, drawn once */
(function(){
  var rows=["..000..",".00000.",".00000.",".00000.",".00000.","0.000.0","0.....0",".00000.","...0...",".00000."];
  var c=document.createElement("canvas"); c.width=7; c.height=10;
  var x=c.getContext("2d"), im=x.createImageData(7,10), t=LP.TONES[3];
  rows.forEach(function(r,y){ for(var i=0;i<7;i++){ var o=(y*7+i)*4; if(r.charAt(i)==="0"){ im.data[o]=t[0]; im.data[o+1]=t[1]; im.data[o+2]=t[2]; im.data[o+3]=255; } } });
  x.putImageData(im,0,0); micMark.appendChild(c);
})();
/* allowed apps: {apps: {id: {motion: true, mic: true, camera: true}}} (the camera's grant: PAD.camera.snap below) */
var grants={}, grantsRef=null;
function granted(id,kind){ return !!(grants[id] && grants[id][kind]); }
function saveGrants(){ if(grantsRef) put(grantsRef,{apps:grants}); }
function grant(id,kind){ var g=grants[id]||(grants[id]={}); if(!g[kind]){ g[kind]=true; saveGrants(); } }
function revokeSense(id){ if(grants[id]){ delete grants[id]; saveGrants(); } }
LP.sensorGrants={
  list:function(){
    return Object.keys(grants).map(function(id){
      var a=installedOf(id);
      return {id:id, name:a ? appName(a) : id, kinds:["motion","mic","camera"].filter(function(k){ return granted(id,k); })};
    }).filter(function(g){ return g.kinds.length; });
  },
  revoke:revokeSense
};
function senseRequest(app,win,d){
  var kind=d.kind==="motion" || d.kind==="mic" ? d.kind : null;
  if(!kind) return;
  var reply=function(v){ if(S.running===app && $("run-frame").contentWindow===win) win.postMessage({pad:1,op:"sensed",i:d.i,v:v},"*"); };
  if(d.action==="zero"){ sensors.zero(win); return; }
  if(d.action==="stop"){
    if(ask && ask.sense===kind && ask.win===win) closeAsk(true);
    if(sensors.live[kind]===win){ if(kind==="motion") sensors.stopMotion(); else sensors.stopMic(); }
    return;
  }
  if(d.action!=="start") return;
  if(!allowed(app,kind)){ reply("denied"); return; }
  if(!(kind==="motion" ? sensors.motionSupported() : sensors.micSupported())){ reply("none"); return; }
  if(sensors.live[kind]===win){ reply("on"); return; }
  var req={app:app, win:win, i:d.i, sense:kind, reply:reply};
  if(granted(app.id,kind)){ begin(req); return; }
  req.text=tr("sense."+kind,{name:appName(app)}); req.note=kind==="mic" ? tr("sense.micnote") : "";
  req.okLabel=tr("sense.allow"); req.noLabel=tr("sense.deny");
  req.ok=function(){ closeAsk(false); grant(app.id,kind); turnOn(req); };
  req.cancel=function(){ reply("denied"); };
  if(ask) closeAsk(true);
  openAsk(req);
}
/* an allowed app: on at once when no system prompt can come (passed already since the page opened, or none on this phone);
   otherwise the bar, and the prompt in its tap. A tap inside the app does not count: it may not reach the outer page as a
   gesture (Chromium passes it up, Safari is not known to), so the runtime always uses a tap of its own */
function begin(req){
  var mayAsk=req.sense==="motion" ? sensors.motionNeedsAsk() && !sensors.systemOk.motion : !sensors.systemOk.mic;
  if(!mayAsk){ turnOn(req); return; }
  req.bar=true; req.text=tr("sense.tap."+req.sense);
  req.ok=function(){ closeAsk(false); turnOn(req); };
  req.cancel=function(){ req.reply("denied"); };
  if(ask) closeAsk(true);
  openAsk(req);
}
/* runs inside the tap: the system prompt, if any, opens here */
function turnOn(req){
  var p=req.sense==="motion"
    ? sensors.askMotion().then(function(r){ return r==="granted" ? sensors.startMotion(req.win) : r==="none" ? "none" : "denied"; })
    : sensors.startMic(req.win);
  p.then(req.reply,function(){ req.reply("none"); });
}
/* ---------- notes: PAD.notes.append (decisions.md section 25) ----------
   Only apps whose manifest has "notes". Every call opens the runtime's dialog with the app's name, the note's title and the
   text (its first lines); A (on release) or the OK tap writes, B or the other button refuses. Writing is never silent.
   The app writes only into a note it made itself (LP.notes.appendApp). One dialog at a time per app: a call while its
   dialog is open is refused. Refusals and anything that cannot be written answer "denied" */
function notesRequest(app,win,d){
  var reply=function(v){ if(S.running===app && $("run-frame").contentWindow===win) win.postMessage({pad:1,op:"noted",i:d.i,v:v},"*"); };
  var NT=window.LopdaNoteText;
  if(!allowed(app,"notes") || NT.appCheck(d.title,d.text) || !S.db || !LP.notes){ reply("denied"); return; }
  if(ask && ask.notes && ask.app===app){ reply("denied"); return; }
  var title=LP.noEmoji(d.title), text=LP.noEmoji(d.text);
  if(!title || !text){ reply("denied"); return; }
  var req={app:app, win:win, notes:true};
  req.text=tr("notes.ask",{name:appName(app), title:title}); req.quote=NT.preview(text);
  req.okLabel=tr("notes.askok"); req.noLabel=tr("notes.askno");
  req.ok=function(){
    closeAsk(false);
    LP.notes.appendApp(app.id,title,text).then(function(){
      toast(tr("notes.asked",{title:title})); reply("saved");
    },function(e){ toast((e && e.message) || tr("notes.savefail")); sfx("err"); reply("denied"); });
  };
  req.cancel=function(){ reply("denied"); };
  if(ask) closeAsk(true);
  openAsk(req);
}

/* ---------- the camera: PAD.camera.snap (apps/snap.js, decisions.md section 28) ----------
   Only apps whose manifest has "camera". The first snap() of an app opens the runtime's dialog; A (on release) or the OK tap
   allows it, and the viewfinder opens inside that same tap so the phone's own prompt can come. An allowed app is remembered
   with the sensors (Settings lists and revokes it). iOS may ask again after a relaunch: without a camera opened since the page
   opened, the one-line bar comes first. Every snap() opens the viewfinder; the player shoots (A) or cancels (B). The app gets
   {w, h, px} (px: w*h tone indices 0-3, its buffer transferred) or null: refused, cancelled, no camera, or a snap already open */
function snapRequest(app,win,d){
  var reply=function(v){
    if(S.running!==app || $("run-frame").contentWindow!==win) return;
    if(v) win.postMessage({pad:1,op:"snapped",i:d.i,v:v},"*",[v.px.buffer]);
    else win.postMessage({pad:1,op:"snapped",i:d.i,v:null},"*");
  };
  if(!allowed(app,"camera") || LP.snap.isOpen() || (ask && ask.snap)){ reply(null); return; }
  if(!LP.snap.supported()){ toast(tr("snap.none")); reply(null); return; }
  var req={app:app, win:win, snap:true, size:d.size==="large" ? "large" : "small", reply:reply};
  req.cancel=function(){ reply(null); };
  if(granted(app.id,"camera")){ snapBegin(req); return; }
  req.text=tr("snap.ask",{name:appName(app)}); req.note=tr("snap.asknote");
  req.okLabel=tr("sense.allow"); req.noLabel=tr("sense.deny");
  req.ok=function(){ closeAsk(false); grant(app.id,"camera"); snapOpen(req); };
  if(ask) closeAsk(true);
  openAsk(req);
}
/* an allowed app: the finder at once when the phone has let the runtime use a camera since the page opened; otherwise the bar,
   and the finder (with the phone's prompt) in its tap */
function snapBegin(req){
  if(LP.snap.systemOk()){ snapOpen(req); return; }
  req.bar=true; req.text=tr("snap.tap");
  req.ok=function(){ closeAsk(false); snapOpen(req); };
  if(ask) closeAsk(true);
  openAsk(req);
}
function snapOpen(req){
  /* askOk already answers once (closeAsk clears ask first); this keeps a second OK from opening a second finder all the same */
  if(req.opened) return; req.opened=true;
  /* the app lets go of every button: the viewfinder has the pad now */
  req.win.postMessage({pad:1,op:"release-all"},"*");
  LP.snap.open({name:appName(req.app), size:req.size, owner:function(){ return frontWin()===req.win; }, done:req.reply});
}

/* ---------- speech: PAD.say (runtime/speech.js, decisions.md section 25). No permission: the voice follows the volume
   (step 0 says nothing), an app speaks once a second at most, 200 characters, a new call stops the one speaking, and HOME,
   another app or the page going away stops it ---------- */
function sayRequest(app,win,d){
  var lang=d.lang==="zh" || d.lang==="en" ? d.lang : I18N.lang;
  LP.speech.say(app.id,typeof d.text==="string" ? LP.noEmoji(d.text) : "",lang).then(function(v){
    if(S.running===app && $("run-frame").contentWindow===win) win.postMessage({pad:1,op:"said",i:d.i,v:v},"*");
  });
}

/* the AudioContext was made again: the microphone goes into the new one */
LP.builtin({id:"sensors", audio:function(){ sensors.rewire(); },
  ready:function(){
    grantsRef=S.db.doc("data/users/local/sensors");
    grantsRef.get().then(function(sn){ var d=sn.exists && own(sn.data()); if(d && d.apps && typeof d.apps==="object") grants=d.apps; }).catch(function(){});
  }});

$("store-refresh").onclick=function(){ loadRegistry(true); };

LP.runApp=runApp;
LP.onData("apps",function(){ if(!$("v-store").hidden) renderStore(); });
/* the chin pad reaches a running app only when its manifest asks for buttons */
/* while the file dialog is open it has the pad: a fresh A press confirms on release, B cancels */
var askA=false;
LP.padRoute("file",function(b,down){
  if(!ask){ askA=false; return false; }
  if(ask.bar && b!=="a" && b!=="b") return false;   /* the bar takes A and B only */
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
  leave:function(){ closeAsk(false); LP.snap.cancel(); LP.speech.stop(); sensors.stopAll(); LP.chip.stop(); LP.keepAwake(false); $("run-frame").srcdoc=""; S.running=null; },
  lang:function(){
    /* apps read PAD.lang once at start: a running app is started again in the new language */
    if(S.running && !$("v-run").hidden) runApp(S.running);
  }});
})();
