/*
 * Lo-PDA built-in: the app store (community registry), the preinstalled apps, and the sandboxed runner
 * with its PAD bridge (storage, sounds, music and ambience, buttons, files behind the runtime's own confirm dialog, tilt and
 * the microphone through runtime/sensors.js, asked for on the same dialog, writing into notes on that dialog too, speech, one
 * photo at a time through the runtime's own viewfinder, apps/snap.js, read-only dictionary queries through
 * runtime/wordlist.js and the dictionary program's copy of the built-in ECDICT, and the player's own word book behind one
 * consent per app). The store searches names and descriptions in both languages, shows what an app may use as icons,
 * and confirms an app that asks for capabilities before downloading it (decisions.md section 42).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var AS=window.LopdaAppSaves;
var REGISTRY = new URL("../registry/", location.href).href;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, sha256hex=LP.sha256hex,
  validIcon=LP.validIcon, fillTile=LP.fillTile, appName=LP.appName, appDesc=LP.appDesc, renderHome=LP.renderHome,
  upsert=LP.upsert, dropLocal=LP.dropLocal, pending=LP.pending, APP_SFX=LP.APP_SFX;
/* community apps that come installed, in this order on the home screen after the built-ins (docs/design/pad-files.md) */
var PREINSTALL=["calculator","paint"];
/* capabilities a manifest may ask for (SPEC.md section 2) */
var PERMISSIONS=["files","motion","mic","notes","camera","wordbook"];
/* a permission as one glance: 16 x 16 pixel icons, the same format as ICONS in core.js. The store's entry shows
   them instead of a line of text; the install dialog shows them with a one-word label (decisions.md section 42). */
var PERM_ICONS={
  files:["................","................","................","..000...........",".03330..........",".033330000000...",".0333333333330..",".00000000000000.","..0333333333330.","..0333333333330.","..0333333333330.","..0333333333330.","..0333333333330.","..0000000000000.","................","................"],
  motion:["................","................","................","................","..0000..........",".....000........",".......00.......","..000....0......",".....00...0.....","......00..00....","..000..00..0....","....00..0..00...","..11.00..0..0...","..11..0..0..0...","......0..0..0...","................"],
  mic:["................",".....0000.......","....033330......","...03333330.....","...03030330.....","...03333330.....","...03030330.....","...03333330.....","...00000000.....","....033330......","....033330......","....033330......","....033330......","...00000000.....","..0000000000....","................"],
  notes:["................","................","...........00...","..........0330..",".........0330...","........0330....",".......0330.....","......0330......",".....0330.......","....0330........","....000.........","...00...........","..00............","................","................","................"],
  camera:["................","................","....0000........","..000000000000..",".03333333333330.",".03300000333330.",".03011111033000.",".00112222103330.",".00122332103330.",".00122332103330.",".00112222103330.",".03011111033330.",".03300000333330.",".00000000000000.","................","................"],
  wordbook:["................","................","..000000000000..","..033330033330..","..031130031130..","..033330033330..","..031130031130..","..033330033330..","..031130031130..","..033330033330..","..033330033330..","..000000000000..",".......0220.....",".......0220.....","........00......","................"]
};
function permIcon(p,cls){
  var s=document.createElement("span"); s.className=cls||"perm"; s.title=tr("store.perm."+p); s.setAttribute("aria-label",tr("store.perm."+p));
  s.appendChild(LP.iconCanvas(PERM_ICONS[p]));
  return s;
}
/* one line of icons, at most; the row's accessible name carries the long text */
function permRow(perms){
  var row=document.createElement("span"); row.className="store-perms";
  row.setAttribute("role","img");
  row.setAttribute("aria-label",perms.map(function(p){ return tr("store.perm."+p); }).join(tr("set.sense.and")));
  perms.forEach(function(p){ row.appendChild(permIcon(p)); });
  return row;
}
/* store sections, in the order the catalogue shows them; an app without a known category goes last */
var CATEGORIES=["game","productivity","education","create","story","life"];
function validPerms(x){ return Array.isArray(x) ? PERMISSIONS.filter(function(p){ return x.indexOf(p)>=0; }) : []; }
function allowed(a,perm){ return !!(a && a.permissions && a.permissions.indexOf(perm)>=0); }
function categoryOf(r){ return r && CATEGORIES.indexOf(r.category)>=0 ? r.category : "other"; }
function catLabel(c){ return tr("store.cat."+c); }

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
    renderStore(true); if(!$("v-home").hidden) renderHome();
    preinstall();
  }).catch(function(e){
    $("store-state").textContent=tr("store.offline");
    if(!$("v-store").hidden) toast(tr("store.cantreach",{msg:e.message}));
  }).then(function(){ regLoading=null; });
  return regLoading;
}
function installedOf(id){ for(var i=0;i<S.apps.length;i++) if(S.apps[i].id===id) return S.apps[i]; return null; }
function registryApps(){ return (S.registry && S.registry.apps) || []; }
/* installed apps whose registry copy is a different build, in catalogue order */
function outdatedApps(){
  return registryApps().filter(function(r){ var a=installedOf(r.id); return a && a.sha256!==r.sha256; });
}
function updatesAvailable(){ return outdatedApps().length>0; }
/* the two dates in registry/index.json, both stamped by tools/build-index.mjs from git: released is the
   first commit of the app's index.html, updated the last. A first week wears NEW; a later version's first
   week wears UPDATED, but a new app shows only NEW (decisions.md section 42). */
function withinWeek(date){
  if(typeof date!=="string") return false;
  var t=Date.parse(date+"T00:00:00");
  if(isNaN(t)) return false;
  var age=Date.now()-t;
  return age>=0 && age<7*24*60*60*1000;
}
function isNew(r){ return withinWeek(r && r.released); }
function isUpdated(r){ return withinWeek(r && r.updated); }
/* the selected category stays while the store is open; "all" groups the list into sections */
var storeCat="all", updating=null, storeQuery="";
/* search: NFKC and lower case on both sides, a plain substring, every word must match; names beat descriptions.
   Written out in the manifest's languages, so "paper" and "纸塔" both find the same app. */
function normText(s){ return String(s==null?"":s).normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim(); }
function i18nField(r,field){
  var out=[r[field]];
  I18N.LANGS.forEach(function(l){ var e=r.i18n && r.i18n[l]; if(e && e[field]) out.push(e[field]); });
  return normText(out.join(" "));
}
function searchScore(r,tokens){
  var name=i18nField(r,"name"), desc=i18nField(r,"description");
  var rest=normText([r.id,r.author,catLabel(categoryOf(r))].join(" "));
  var hay=name+" "+desc+" "+rest;
  for(var i=0;i<tokens.length;i++) if(hay.indexOf(tokens[i])<0) return -1;
  var q=tokens.join(" ");
  if(name===q) return 0;
  if(name.indexOf(q)===0) return 1;
  if(name.indexOf(q)>=0) return 2;
  if(desc.indexOf(q)>=0) return 3;
  return 4;
}
function searchApps(){
  var q=normText(storeQuery), tokens=q.split(" ").filter(function(x){ return x; });
  if(!tokens.length) return null;
  return registryApps().map(function(r){ return {r:r, s:searchScore(r,tokens)}; })
    .filter(function(x){ return x.s>=0; })
    .sort(function(a,b){ return (a.s-b.s) || appName(a.r).localeCompare(appName(b.r)); })
    .map(function(x){ return x.r; });
}
function renderFilters(){
  var box=$("store-filters"), counts={all:registryApps().length};
  registryApps().forEach(function(r){ var c=categoryOf(r); counts[c]=(counts[c]||0)+1; });
  if(storeCat!=="all" && !counts[storeCat]) storeCat="all";
  var scroll=box.scrollLeft;
  box.textContent="";
  var add=function(id,label,n){
    var b=document.createElement("button"); b.type="button"; b.className="store-filter";
    b.setAttribute("aria-pressed", storeCat===id ? "true" : "false");
    b.appendChild(document.createTextNode(label));
    var s=document.createElement("span"); s.textContent=n; b.appendChild(s);
    b.onclick=function(){ if(storeCat===id) return; storeCat=id; sfx("tick"); renderStore(); };
    box.appendChild(b);
  };
  add("all",tr("store.all"),counts.all);
  CATEGORIES.forEach(function(c){ if(counts[c]) add(c,catLabel(c),counts[c]); });
  if(counts.other) add("other",catLabel("other"),counts.other);
  box.scrollLeft=scroll;
}
/* "3 to update" and one button that does all of them, above the list */
function renderUpdates(){
  var box=$("store-updates"), todo=outdatedApps();
  box.textContent="";
  if(!todo.length && !updating){ box.hidden=true; return; }
  box.hidden=false;
  var text=document.createElement("span");
  text.textContent = updating
    ? tr("store.updating",{i:Math.min(updating.done+1,updating.total), n:updating.total})
    : tr("store.updates",{n:todo.length});
  var btn=document.createElement("button"); btn.type="button"; btn.className="btn";
  btn.textContent=tr("store.updateall"); btn.disabled=!!updating;
  if(!updating) btn.onclick=updateAll;
  box.appendChild(text); box.appendChild(btn);
}
function storeItem(r){
  var li=document.createElement("li"); li.className="store-item";
  var tile=document.createElement("span"); tile.className="tile"; fillTile(tile,r);
  var body=document.createElement("div"); body.className="store-body";
  var t=document.createElement("b"); t.textContent=appName(r)+" v"+r.version;
  var badge=isUpdated(r) ? "store.updatebadge" : (isNew(r) ? "store.new" : "");
  if(badge){ var nb=document.createElement("span"); nb.className="store-badge"; nb.textContent=tr(badge); nb.title=tr(badge+".title"); t.appendChild(document.createTextNode(" ")); t.appendChild(nb); }
  var d=document.createElement("span"); d.textContent=appDesc(r);
  var m=document.createElement("small"); m.textContent=(r.author||tr("store.anon"))+" · "+(r.license||"")+" · "+Math.max(1,Math.round((r.bytes||0)/1024))+" KB";
  body.appendChild(t); body.appendChild(d); body.appendChild(m);
  var perms=validPerms(r.permissions);
  if(perms.length) body.appendChild(permRow(perms));
  var a=installedOf(r.id), btn=document.createElement("button"); btn.type="button";
  if(!a){ btn.className="btn"; btn.textContent=tr("store.install"); }
  else if(a.sha256!==r.sha256){ btn.className="btn"; btn.textContent=tr("store.update"); }
  else { btn.className="btn ghost"; btn.textContent=tr("store.open"); }
  if(updating) btn.disabled=true;   /* one update at a time */
  else btn.onclick=function(){ if(a && a.sha256===r.sha256) runApp(a); else install(r,btn); };
  li.appendChild(tile); li.appendChild(body); li.appendChild(btn);
  return li;
}
function categoryHead(c,n){
  var li=document.createElement("li"); li.className="store-cat";
  var b=document.createElement("b"); b.textContent=catLabel(c);
  var s=document.createElement("small"); s.textContent=n;
  li.appendChild(b); li.appendChild(s); return li;
}
/* keepScroll: preserve the view's position when the list is rebuilt after an install or an update;
   leaving the store or picking another category starts at the top */
function renderStore(keepScroll){
  var ul=$("store-list"), filters=$("store-filters"), view=$("v-store"), scroll=keepScroll ? view.scrollTop : 0;
  ul.textContent="";
  if(!S.registry){
    filters.textContent=""; filters.hidden=true;
    $("store-updates").textContent=""; $("store-updates").hidden=true;
    var e=document.createElement("li"); e.className="empty"; e.textContent=tr("store.waiting"); ul.appendChild(e);
  } else {
    var hits=searchApps();
    if(hits){
      filters.textContent=""; filters.hidden=true;
      renderUpdates();
      $("store-state").textContent=tr("store.results",{n:hits.length});
      if(!hits.length){
        var n=document.createElement("li"); n.className="empty"; n.textContent=tr("store.noresults",{q:storeQuery.trim()}); ul.appendChild(n);
      } else hits.forEach(function(r){ ul.appendChild(storeItem(r)); });
    } else {
      filters.hidden=false;
      $("store-state").textContent=tr("store.count",{n:registryApps().length});
      renderFilters(); renderUpdates();
      if(storeCat==="all"){
        CATEGORIES.concat(["other"]).forEach(function(c){
          var group=registryApps().filter(function(r){ return categoryOf(r)===c; });
          if(!group.length) return;
          ul.appendChild(categoryHead(c,group.length));
          group.forEach(function(r){ ul.appendChild(storeItem(r)); });
        });
      } else {
        registryApps().filter(function(r){ return categoryOf(r)===storeCat; }).forEach(function(r){ ul.appendChild(storeItem(r)); });
      }
    }
  }
  /* emptying the list clamps the view to the top: put it back after the rebuild */
  view.scrollTop=scroll;
}
/* the search field: typing starts at the top of the results, clearing restores the categories */
function setQuery(q,keepScroll){
  storeQuery=q;
  if($("store-q").value!==q) $("store-q").value=q;
  $("store-q-clear").hidden=!q;
  renderStore(!!keepScroll);
  if(!keepScroll) $("v-store").scrollTop=0;
}
/* one button for every update: one at a time, the catalogue order, a failed one does not stop the rest */
function updateAll(){
  if(updating || !S.registry) return;
  var todo=outdatedApps();
  if(!todo.length) return;
  updating={done:0, total:todo.length};
  renderStore(true);
  var i=0, failed=0;
  var next=function(){
    if(i>=todo.length){
      var n=todo.length-failed;
      updating=null;
      toast(failed ? tr("store.updatedsome",{n:n,m:failed}) : tr("store.updatedall",{n:n}));
      sfx(failed ? "err" : "ok");
      renderStore(true); if(!$("v-home").hidden) renderHome();
      return;
    }
    var r=todo[i++];
    updating.done=i-1; renderStore(true);
    fetchApp(r).then(function(){},function(){ failed++; }).then(function(){
      updating.done=i; renderStore(true);
      next();
    });
  };
  next();
}
/* install exactly the file the registry describes: the hash must match. Like Android, an app that asks for
   capabilities is confirmed before it is downloaded, and the capabilities it can be granted are remembered then;
   files and notes still ask on every use (decisions.md section 42). An older install, an update that adds a
   permission, or "update all" has no such grant, so the first use asks as before. */
var GRANTABLE=["motion","mic","camera","wordbook"];
function install(r,btn){
  if(updating) return;
  var a=installedOf(r.id), perms=validPerms(r.permissions);
  var added=a ? perms.filter(function(p){ return (a.permissions||[]).indexOf(p)<0; }) : perms;
  if(!added.length){ doInstall(r,btn,[]); return; }
  var req={text:tr(a?"store.updateask":"store.installask",{name:appName(r)}), perms:added, install:true,
    okLabel:tr(a?"store.update":"store.install"), noLabel:tr("common.cancel")};
  req.ok=function(){ closeAsk(false); doInstall(r,btn,added); };
  if(ask) closeAsk(true);
  openAsk(req);
  sfx("tap");
}
function doInstall(r,btn,added){
  btn.disabled=true; btn.textContent=tr("store.downloading");
  fetchApp(r).then(function(prev){
    added.filter(function(p){ return GRANTABLE.indexOf(p)>=0; }).forEach(function(p){ grant(r.id,p); });
    toast(tr(prev?"store.updated":"store.installed",{name:appName(r)})); sfx("ok");
    S.revealApp=r.id;   /* the home screen scrolls this tile into view when it comes back */
    renderStore(true);
    if(!$("v-home").hidden) renderHome();
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
      },Promise.resolve()).then(function(){ return put(ref,{ids:done}); }).then(function(){ renderStore(true); if(!$("v-home").hidden) renderHome(); });
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
/* removing a program is not removing its save (decisions.md section 43). The code, the manifest and
   the sensor grants go; data/users/local/appdata/items/<id> stays, so installing the same id again
   carries on. The save is cleared separately, in Settings -> App saves. */
function deleteApp(id){
  /* snapshot the name/version before the app leaves S.apps: leave() flushes the last saves after this */
  if(S.kv[id]!==undefined) kvMeta[id]=AS.record(id, S.kv[id], kvMeta[id], installedOf(id), Date.now());
  dropLocal("apps",id);
  revokeSense(id);
  delete kvWarned[id];   /* a reinstall should warn about a damaged save again */
  if(S.db){
    S.refs.apps.doc(id).delete().catch(function(){ toast(tr("store.removefail")); });
    S.refs.code.doc(id).delete().catch(function(){});
  }
  /* keep S.kv[id] as well: a reinstall in this session starts from the same data, and leave() may
     still flush the last 500 ms of saves after this call */
}

/* ---------- runner: sandboxed iframe + PAD bridge (sdk/pad-shim.js) ---------- */
var KV_BUDGET=256*1024;
var dictLimit=null;   /* PAD.dict's 10 calls a second: a new limiter for every app start */
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
  dictLimit=window.LopdaWordList ? window.LopdaWordList.limiter() : null;
  $("run-title").textContent=a.local ? appName(a) : appName(a)+" · v"+(a.version||"?");
  $("run-del-wrap").hidden=!!a.local;   /* local scripts are removed in the scripts app, not here */
  if(!a.local) LP.resetConfirm("run-del-wrap","run-del",tr("run.remove"),function(){ if(S.running){ var n=appName(S.running); deleteApp(S.running.id); show("home"); toast(tr("run.removed",{name:n})); } },tr("run.remove.confirm",{name:appName(a)}));
  $("run-err").hidden=true;
  show("run");
  showPad(!!a.buttons);
  LP.keepAwake(true);   /* a running app keeps the screen on */
  freshRunFrame();
  var start=function(h){ $("run-frame").srcdoc=lopdaWrapApp(h,{lang:I18N.lang, music:true, ambience:true, sensors:true, notes:true, say:true, camera:true, dict:true}); };
  if(a.html){ start(a.html); return; }
  $("run-frame").srcdoc='<body style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#a3ad7e;color:#1f2a14;font:16px monospace">'+tr("run.loading")+'</body>';
  loadHtml(a).then(function(h){
    if(S.running!==a) return;
    if(h) start(h); else toast(tr("run.missing"));
  }).catch(function(e){ if(S.running===a) toast(tr("run.loadfail",{code:(e&&e.code)||tr("common.unknown")})); });
}
$("run-back").onclick=function(){ show(S.running && S.running.back || "home"); };
$("run-err-close").onclick=function(){ $("run-err").hidden=true; };

/* Local scripts live in the scripts app but have their own storage document, one per script.
   The iframe never names the script: the runner decides from S.running.scriptId. */
function localScriptId(appId){
  return S.running && S.running.local && S.running.id===appId ? S.running.scriptId : null;
}
var kvTimers={}, kvMeta={}, kvWarned={}, kvLoaded={}, kvSaved={};
/* read the save once per run. A document that cannot be read is not turned into {} any more: the
   app gets a rejected PAD.load and the player gets a notice; the bytes stay until Settings clears
   them (decisions.md section 43). */
function getKv(appId){
  if(S.kv[appId]!==undefined) return Promise.resolve(S.kv[appId]);
  var sid=localScriptId(appId);
  if(sid && LP.scripts){
    return LP.scripts.loadData(sid).then(function(kv){ S.kv[appId]=kv||{}; kvLoaded[appId]=true; delete kvWarned[appId]; return S.kv[appId]; });
  }
  if(!S.db){ S.kv[appId]={}; kvLoaded[appId]=true; kvSaved[appId]=false; return Promise.resolve(S.kv[appId]); }
  return S.refs.kv.doc(appId).get().then(function(s){
    if(!s.exists){ S.kv[appId]={}; kvMeta[appId]={loaded:true, existed:false, schema:null, updated:0, bytes:0, app:null}; kvLoaded[appId]=true; kvSaved[appId]=false; delete kvWarned[appId]; return S.kv[appId]; }
    var rec=AS.read(own(s.data()), appId);
    if(rec.code) throw AS.error(rec.code);
    rec.existed=true; S.kv[appId]=rec.kv; kvMeta[appId]=rec; kvLoaded[appId]=true; kvSaved[appId]=true; delete kvWarned[appId]; return S.kv[appId];
  },function(){ throw AS.error("readfail"); });
}
function saveKvSoon(appId){
  if(!S.db) return;
  kvLoaded[appId]=true; kvSaved[appId]=true;
  clearTimeout(kvTimers[appId]);
  var sid=localScriptId(appId);
  if(sid && LP.scripts){ kvTimers[appId]=setTimeout(function(){ LP.scripts.saveData(sid, S.kv[appId]); },500); return; }
  kvMeta[appId]=AS.record(appId, S.kv[appId], kvMeta[appId], installedOf(appId), Date.now());
  kvTimers[appId]=setTimeout(function(){ put(S.refs.kv.doc(appId), kvMeta[appId]); },500);
}
/* leaving a run must not lose the last 500 ms of saves */
function flushKv(appId){
  clearTimeout(kvTimers[appId]);
  if(!S.db || !Object.prototype.hasOwnProperty.call(S.kv,appId)) return Promise.resolve(true);
  var sid=localScriptId(appId);
  if(sid && LP.scripts) return LP.scripts.saveData(sid, S.kv[appId]);
  kvMeta[appId]=AS.record(appId, S.kv[appId], kvMeta[appId], installedOf(appId), Date.now());
  kvSaved[appId]=true;
  return put(S.refs.kv.doc(appId), kvMeta[appId]);
}
/* one notice per run, not one per PAD.load call */
function warnSave(appId,e){
  var code=(e && e.code) || "readfail";
  if(kvWarned[appId]===code) return;
  kvWarned[appId]=code;
  var a=S.running && S.running.id===appId ? S.running : installedOf(appId);
  var name=a ? appName(a) : appId;
  if(code==="corrupt") toast(tr("run.savecorrupt",{name:name}));
  else if(code==="newer") toast(tr("run.savenewer",{name:name}));
  else toast(tr("run.savereadfail",{name:name,code:code}));
}
/* the document's metadata without loading its keys into a running app */
function saveInfo(appId){
  var sid=localScriptId(appId);
  if(sid && LP.scripts && LP.scripts.info) return LP.scripts.info(sid);
  if(kvLoaded[appId] && kvMeta[appId]){
    if(!kvSaved[appId] && !Object.keys(S.kv[appId]||{}).length) return Promise.resolve(null);
    var m=kvMeta[appId];
    return Promise.resolve(AS.info({schema:m.schema, app:m.app, updated:m.updated, bytes:AS.size(S.kv[appId])}));
  }
  if(!S.db) return Promise.resolve(null);
  return S.refs.kv.doc(appId).get().then(function(s){
    if(!s.exists) return null;
    var rec=AS.read(own(s.data()), appId);
    if(rec.code) throw AS.error(rec.code);
    kvMeta[appId]=rec;
    return AS.info(rec);
  },function(){ throw AS.error("readfail"); });
}

/* Settings -> App saves: every save on the device, installed or not. A removed app's save is the
   point of this list; an installed app's save is here so it can be cleared without removing the app. */
function appSaveRows(){
  if(!S.db) return Promise.resolve([]);
  return S.refs.kv.get().then(function(q){
    var out=q.docs.map(function(d){
      var raw=own(d.data())||{};
      var rec=AS.read(raw,d.id);
      var a=installedOf(d.id);
      var app=a || rec.app || {id:d.id};
      var name=(a || (rec.app && rec.app.name)) ? appName(app) : d.id;
      var bytes=rec.bytes;
      if(rec.code){ try{ bytes=JSON.stringify(raw).length; }catch(e){ bytes=0; } }
      return {id:d.id, name:name, installed:!!a, size:bytes, updated:rec.updated, schema:rec.schema, bad:rec.code, version:(app && app.version)||null};
    });
    out.sort(function(a,b){ return (b.updated||0)-(a.updated||0) || (a.name<b.name?-1:a.name>b.name?1:0); });
    return out;
  });
}
function clearAppSave(id){
  if(S.running && S.running.id===id) return Promise.reject({code:"running"});
  clearTimeout(kvTimers[id]);
  delete S.kv[id]; delete kvMeta[id]; delete kvWarned[id]; delete kvLoaded[id]; delete kvSaved[id];
  if(!S.db) return Promise.resolve(true);
  return S.refs.kv.doc(id).delete().then(function(){ return true; },function(){ return false; });
}
function clearAllAppSaves(){
  if(S.running) return Promise.reject({code:"running"});
  if(!S.db) return Promise.resolve(true);
  return S.refs.kv.get().then(function(q){
    return Promise.all(q.docs.map(function(d){
      return clearAppSave(d.id);
    })).then(function(ok){ return ok.every(function(x){ return x!==false; }); });
  });
}
LP.appSaves={
  list:appSaveRows,
  clear:clearAppSave,
  clearAll:clearAllAppSaves,
  info:saveInfo
};
window.addEventListener("message",function(e){
  var f=$("run-frame");
  if(!S.running || e.source!==f.contentWindow) return;
  var d=e.data; if(!d || !d.pad) return;
  var appId=S.running.id;
  if(d.op==="load"){
    getKv(appId).then(function(kv){
      var v=Object.prototype.hasOwnProperty.call(kv,d.k)?kv[d.k]:null;
      f.contentWindow.postMessage({pad:1,op:"loaded",i:d.i,v:v},"*");
    },function(e){
      warnSave(appId,e);
      f.contentWindow.postMessage({pad:1,op:"loaded",i:d.i,error:(e && e.code) || "readfail"},"*");
    });
  } else if(d.op==="save" || d.op==="remove"){
    getKv(appId).then(function(kv){
      var next=Object.assign({},kv);
      if(d.op==="remove") delete next[d.k];
      else { try{ next[d.k]=JSON.parse(JSON.stringify(d.v)); }catch(err){ return; } }
      if(JSON.stringify(next).length>KV_BUDGET){ $("run-err-msg").textContent=tr("run.toobig"); $("run-err").hidden=false; return; }
      S.kv[appId]=next; delete kvWarned[appId]; saveKvSoon(appId);
    },function(e){ warnSave(appId,e); });
  } else if(d.op==="schema"){
    /* the app says which data schema it writes; PAD.saveInfo tells the next run what is on disk */
    if(typeof d.n!=="number" || !isFinite(d.n) || d.n<0 || d.n>AS.MAX_SCHEMA) return;
    var schema=Math.floor(d.n), sid=localScriptId(appId);
    if(sid && LP.scripts && LP.scripts.setSchema){ LP.scripts.setSchema(sid,schema).catch(function(){}); return; }
    getKv(appId).then(function(kv){
      kvMeta[appId]=kvMeta[appId]||{loaded:true, existed:false};
      kvMeta[appId].schema=schema;
      /* no data yet: keep the schema in memory, it rides with the first save. Do not create an empty save. */
      if(kvMeta[appId].existed || Object.keys(kv).length) saveKvSoon(appId);
    },function(e){ warnSave(appId,e); });
  } else if(d.op==="info"){
    saveInfo(appId).then(function(v){ f.contentWindow.postMessage({pad:1,op:"infoed",i:d.i,v:v},"*"); },function(e){
      warnSave(appId,e);
      f.contentWindow.postMessage({pad:1,op:"infoed",i:d.i,error:(e && e.code) || "readfail"},"*");
    });
  } else if(d.op==="error"){
    var msg=String(d.msg||tr("common.unknown")).slice(0,300);
    if(d.line) msg+="\n" + tr("run.line",{line:d.line,col:d.col||0});
    if(d.stack){
      var frames=String(d.stack).split("\n").slice(0,4).join("\n");
      msg+="\n"+frames.slice(0,500);
    }
    $("run-err-msg").textContent=msg;
    $("run-err").hidden=false;
  } else if(d.op==="exit"){
    show(S.running && S.running.back || "home");
  } else if(d.op==="file"){
    fileRequest(S.running,f.contentWindow,d);
  } else if(d.op==="sense"){
    senseRequest(S.running,f.contentWindow,d);
  } else if(d.op==="notes"){
    notesRequest(S.running,f.contentWindow,d);
  } else if(d.op==="say"){
    sayRequest(S.running,f.contentWindow,d);
  } else if(d.op==="dict"){
    dictRequest(S.running,f.contentWindow,d);
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
  askA=false;   /* an A held from an earlier dialog must not confirm this one */
  /* the app lets go of every button: the dialog has the pad now (a store dialog has no app behind it) */
  if(req.win) req.win.postMessage({pad:1,op:"release-all"},"*");
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
  /* what an app asks for, as icons with one-word labels (the store's install dialog) */
  if(req.perms && req.perms.length){
    var pr=document.createElement("div"); pr.className="ask-perms"; pr.id="ask-perms";
    req.perms.forEach(function(p){
      var it=document.createElement("span"); it.className="ask-perm";
      it.appendChild(permIcon(p,"ask-perm-ico"));
      var l=document.createElement("small"); l.textContent=tr("store.perm.short."+p); it.appendChild(l);
      pr.appendChild(it);
    });
    box.appendChild(pr);
  }
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
/* allowed apps: {apps: {id: {motion: true, mic: true, camera: true, wordbook: true}}} (the camera's grant: PAD.camera.snap
   below; the word book's: dictRequest) */
var grants={}, grantsRef=null;
function granted(id,kind){ return !!(grants[id] && grants[id][kind]); }
function saveGrants(){ if(grantsRef) put(grantsRef,{apps:grants}); }
function grant(id,kind){ var g=grants[id]||(grants[id]={}); if(!g[kind]){ g[kind]=true; saveGrants(); } }
function revokeSense(id){ if(grants[id]){ delete grants[id]; saveGrants(); } }
LP.sensorGrants={
  list:function(){
    return Object.keys(grants).map(function(id){
      var a=installedOf(id);
      return {id:id, name:a ? appName(a) : id, kinds:["motion","mic","camera","wordbook"].filter(function(k){ return granted(id,k); })};
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

/* ---------- speech: PAD.say (runtime/speech.js, decisions.md sections 25 and 29). No permission: the voice follows the volume
   (step 0 says nothing), an app speaks once a second at most, 200 characters, a new call stops the one speaking, and HOME,
   another app or the page going away stops it ---------- */
function sayRequest(app,win,d){
  var lang=d.lang==="zh" || d.lang==="en" || d.lang==="ja" ? d.lang : I18N.lang;
  LP.speech.say(app.id,typeof d.text==="string" ? LP.noEmoji(d.text) : "",lang).then(function(v){
    if(S.running===app && $("run-frame").contentWindow===win) win.postMessage({pad:1,op:"said",i:d.i,v:v},"*");
  });
}

/* ---------- the dictionary: PAD.dict (runtime/wordlist.js, SPEC.md 6.7, decisions.md section 35). The word list and the
   built-in ECDICT are public and the same on every phone, so words() and lookup() need no permission and no dialog. Only the
   word list is read for words(); lookup() shares the copy the dictionary program already loads. At most 10 calls a second
   per app, words, lookup and the word book together; past that, null. A bad query comes back as {error} and the app's promise
   rejects; a file that cannot be read answers null.
   The player's word book is their own data: it needs "wordbook" in the manifest, and the first add or remove shows the
   runtime's own dialog once per app (as the camera's first snap does), because a dialog per word would stop the game.
   inBook() needs that grant too, so an app cannot read the book before the player knows. addWord stores the ECDICT headword. */
function dictBookReply(app,win,d,v,error){
  /* the app may have closed meanwhile: answer only the frame that asked */
  if(S.running!==app || $("run-frame").contentWindow!==win) return;
  win.postMessage(error ? {pad:1,op:"dicted",i:d.i,error:error} : {pad:1,op:"dicted",i:d.i,v:v},"*");
}
/* the first add or remove of an app: one dialog, then the grant is remembered (Settings lists and revokes it). B or the
   cancel tap denies this call only; the next one asks again. One dialog at a time: the caller checks that no other runtime
   dialog or viewfinder is open, so this never closes another program's dialog */
function wordbookAsk(app,win,d,reply,word,on){
  /* the app may have closed while the lookup ran: never open a dialog for a frame that is gone */
  if(S.running!==app || $("run-frame").contentWindow!==win){ reply(null); return; }
  var req={app:app, win:win, i:d.i, wordbook:true, reply:reply, word:word, on:on};
  req.text=tr("dict.ask",{name:appName(app)});
  req.okLabel=tr("sense.allow"); req.noLabel=tr("sense.deny");
  req.ok=function(){
    closeAsk(false); grant(app.id,"wordbook");
    reply(LP.dict.setWord(word,on));
  };
  req.cancel=function(){ reply("denied"); };
  openAsk(req);
}
function dictRequest(app,win,d){
  var reply=function(v,error){ dictBookReply(app,win,d,v,error); };
  var api=LP.dict && LP.dict.apps, kind=d.kind;
  var book=kind==="inBook" || kind==="add" || kind==="remove";
  if(!api || (kind!=="words" && kind!=="lookup" && !book)){ reply(null); return; }
  if(!dictLimit){ if(!window.LopdaWordList){ reply(null); return; } dictLimit=window.LopdaWordList.limiter(); }
  if(!dictLimit(Date.now())){ reply(null); return; }
  if(book){
    if(!allowed(app,"wordbook")){ reply(kind==="inBook" ? null : "denied"); return; }
    var W=window.LopdaWordList;
    if(kind==="inBook"){
      if(!W || !Array.isArray(d.words) || d.words.length<1 || d.words.length>20){ reply(null); return; }
      var words=[];
      for(var i=0;i<d.words.length;i++){
        var w=W.wordOf(d.words[i]);
        if(!w){ reply(null); return; }
        words.push(w);
      }
      if(!granted(app.id,"wordbook") || !LP.dict.inBookMany){ reply(null); return; }
      reply(LP.dict.inBookMany(words));
      return;
    }
    if(!W || !LP.dict.setWord || !LP.dict.apps){ reply(null); return; }
    var word=W.wordOf(d.word);
    if(!word){ reply(null); return; }
    /* the word book dialog must never close another runtime dialog or open over the snap viewfinder: while either is up,
       no word book call */
    if(LP.snap.isOpen() || ask){ reply(null); return; }
    if(kind==="add"){
      /* store the headword; a word ECDICT does not know has nothing to store, so the player is never asked for it */
      LP.dict.apps.lookup(word).then(function(e){
        /* the app may have closed while the lookup ran: stop before touching the book or asking */
        if(S.running!==app || $("run-frame").contentWindow!==win){ reply(null); return; }
        if(!e || !e.word){ reply(null); return; }
        /* a dialog or the viewfinder may have opened while the lookup ran */
        if(LP.snap.isOpen() || ask){ reply(null); return; }
        if(granted(app.id,"wordbook")){ reply(LP.dict.setWord(e.word,true)); return; }
        wordbookAsk(app,win,d,reply,e.word,true);
      },function(){ reply(null); });
      return;
    }
    if(granted(app.id,"wordbook")){ reply(LP.dict.setWord(word,false)); return; }
    wordbookAsk(app,win,d,reply,word,false);
    return;
  }
  var p=kind==="words" ? api.words(d.q) : api.lookup(d.word);
  p.then(function(v){
    if(v && v.error) reply(null,String(v.error));
    else reply(v==null ? null : v);
  },function(){ reply(null); });
}

/* the AudioContext was made again: the microphone goes into the new one */
LP.builtin({id:"sensors", audio:function(){ sensors.rewire(); },
  ready:function(){
    grantsRef=S.db.doc("data/users/local/sensors");
    grantsRef.get().then(function(sn){ var d=sn.exists && own(sn.data()); if(d && d.apps && typeof d.apps==="object"){ Object.keys(grants).forEach(function(id){ d.apps[id]=grants[id]; }); grants=d.apps; } }).catch(function(){});
  }});

$("store-refresh").onclick=function(){ loadRegistry(true); };
$("store-q").addEventListener("input",function(){ setQuery(this.value,false); });
$("store-q-clear").onclick=function(){ setQuery("",false); $("store-q").focus(); };

LP.runApp=runApp;
LP.onData("apps",function(){ if(!$("v-store").hidden) renderStore(true); });
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
  enter:function(){ storeCat="all"; setQuery("",false); loadRegistry(); },
  leave:function(){ if(ask && ask.install) closeAsk(false); },
  ready:function(){ loadRegistry(); }});
/* the runner owns the run view but has no icon of its own: apps appear on the home screen */
LP.builtin({id:"run", view:"run", keepPad:true,
  leave:function(){
    if(S.running) flushKv(S.running.id);
    closeAsk(false); LP.snap.cancel(); LP.speech.stop(); sensors.stopAll(); LP.chip.stop(); LP.keepAwake(false); $("run-frame").srcdoc=""; S.running=null;
  },
  lang:function(){
    /* apps read PAD.lang once at start: a running app is started again in the new language */
    if(S.running && !$("v-run").hidden) runApp(S.running);
  }});
})();
