/*
 * Lo-PDA built-in: settings. A short menu of volume, system sounds, language, system, permissions, the AI line, backup and restore,
 * sharing and about; the long parts have pages of their own.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var SND=LP.SND, RUNTIME_VERSION=LP.RUNTIME_VERSION, put=LP.put, sfx=LP.sfx, toast=LP.toast, show=LP.show, setLang=LP.setLang, renderUpdate=LP.renderUpdate;
/* the public site, not location.host: a PR preview or localhost must still share the real address */
var SHARE_URL="https://nowheremanx.github.io/lopda/";
var SHARE_TEXT=SHARE_URL.replace(/^https:\/\//,"").replace(/\/$/,"");

/* 12x12 pixel icons for the menu rows, the same string format as ICONS in core.js: 0-3 are the four tones, "." is clear */
var ROW_ICONS={
  volume:["............",".....0......","....00..0...","...000...0..","000000..0.0.","000000..0.0.","000000..0.0.","...000...0..","....00..0...",".....0......","............","............"],
  language:["............","...00000....","..0.....0...",".0.00000.0..",".0.0...0.0..",".0.00000.0..",".0.......0..","..0.....0...","...00000....",".....0......","....0.......","............"],
  system:["..0..0..0...",".000000000..",".0.......0..","00000000000.","0.0000000.0.","0.0.....0.0.","0.0.....0.0.","0.0000000.0.","00000000000.",".0.......0..",".000000000..","..0..0..0..."],
  permissions:["............","....0000....","...0....0...","...0....0...","..00000000..","..0......0..","..0..00..0..","..0..00..0..","..0......0..","..00000000..","............","............"],
  ai:["............","000000000000","0..........0","0..00..000.0","0.0..0..0..0","0.0000..0..0","0.0..0..0..0","0.0..0.000.0","0..........0","000000000000",".00.........",".0.........."],
  backup:["............","......0.....",".....000....","....00000...","......0.....","......0.....",".0000000000.",".0........0.",".0........0.",".0........0.",".0000000000.","............"],
  saves:["............","..00000000..","..0......0..","..0.0..0.0..","..0......0..","..0.0000.0..","..0......0..","..0......0..","..00000000..","...0....0...","..00000000..","............"],
  key:["............","..000.......",".0...0......",".0...0......","..000.......","....0000000.",".........0..",".........0..",".........00.","............","............","............"],
  sounds:["............","....0000....","...0....0...","...0....0...","..0......0..","..0......0..","..0......0..",".0........0.",".0........0.","000000000000","....0000....",".....00....."],
  share:["............","........000.","........000.",".......0....","......0.....",".000.0......",".0000.......",".000.0......","......0.....",".......0....","........000.","........000."],
  about:["....0000....","..00....00..",".0...00...0.",".0...00...0.","0..........0","0...000....0","0....00....0","0....00....0",".0...00...0.",".0..0000..0.","..00....00..","....0000...."]
};
function drawRowIcons(){
  [["set-vol-ico","volume"],["set-ui-ico","sounds"],["set-lang-ico","language"],["set-sys-ico","system"],["set-sense-ico","permissions"],
   ["set-ai-ico","ai"],["set-backup-ico","backup"],["set-saves-ico","saves"],["set-key-ico","key"],["set-share-ico","share"],["set-about-ico","about"]].forEach(function(p){
    var host=$(p[0]), rows=ROW_ICONS[p[1]];
    if(host && rows){ host.textContent=""; host.appendChild(LP.iconCanvas(rows)); }
  });
}
drawRowIcons();
$("set-share-url").textContent=SHARE_TEXT;

function renderSettings(){
  /* one control: five steps, the lowest is off */
  var max=LP.VOL_MAX;
  $("set-vol").textContent=SND.vol ? "▮".repeat(SND.vol)+"▯".repeat(max-SND.vol) : tr("set.off");
  $("set-vol-down").disabled=SND.vol<=0; $("set-vol-up").disabled=SND.vol>=max;
  /* the runtime's and the built-ins' clicks and prompts: off on its own, apps and games unchanged */
  $("set-ui").textContent=tr(SND.uiOn?"set.on":"set.off");
  $("set-ui").setAttribute("aria-pressed",SND.uiOn?"true":"false");
  $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION});
  Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
    var on=b.getAttribute("data-lang")===I18N.lang; b.className=on?"btn":"btn ghost"; b.setAttribute("aria-checked",on?"true":"false");
  });
}
/* the apps allowed tilt, the microphone, the camera or the word book (apps/store.js): one row each, revoked with a tap; the next start() asks again */
function renderSense(){
  var ul=$("set-sense-list"); ul.textContent="";
  var list=LP.sensorGrants ? LP.sensorGrants.list() : [];
  $("set-sense-state").textContent=list.length ? tr("set.sense.some",{n:list.length}) : tr("set.sense.zero");
  $("set-sense-note").hidden=!list.length;
  if(!list.length){ var e=document.createElement("li"); e.className="none"; e.textContent=tr("set.sense.none"); ul.appendChild(e); return; }
  list.forEach(function(g){
    var li=document.createElement("li"), t=document.createElement("span"), b=document.createElement("button");
    t.textContent=g.name+" · "+g.kinds.map(function(k){ return tr("set.sense."+k); }).join(tr("set.sense.and"));
    b.className="btn ghost"; b.type="button"; b.textContent=tr("set.sense.revoke"); b.setAttribute("data-app",g.id);
    b.onclick=function(){ LP.sensorGrants.revoke(g.id); renderSense(); sfx("ok"); };
    li.appendChild(t); li.appendChild(b); ul.appendChild(li);
  });
}
/* ---------- app saves (runtime/appsaves.js, apps/store.js; decisions.md section 43) ----------
   Removing an app keeps its save. This page is the one place that clears saves, installed or not;
   the script saves have their own page in the Scripts app. */
function sizeBytes(n){
  n=+n||0;
  if(n<1024) return n+" B";
  return (Math.round(n/102.4)/10)+" KB";
}
var savesSeq=0;
function renderSavesRow(){
  var el=$("set-saves-state"); if(!el) return;
  if(!LP.appSaves){ el.textContent=""; return; }
  el.textContent="…";
  LP.appSaves.list().then(function(list){
    var total=0;
    list.forEach(function(x){ total+=x.size||0; });
    el.textContent=list.length?tr("set.saves.state",{n:list.length,size:sizeBytes(total)}):tr("set.saves.none");
  },function(){ el.textContent=""; });
}
function renderSaves(){
  var seq=++savesSeq, ul=$("set-saves-list"), sum=$("set-saves-summary"), wrap=$("set-saves-all-wrap");
  if(!ul) return;
  ul.textContent=""; wrap.textContent=""; sum.textContent=tr("run.loading");
  if(!LP.appSaves){ sum.textContent=tr("saves.readfail"); return; }
  LP.appSaves.list().then(function(list){
    if(seq!==savesSeq) return;
    var total=0, orphans=0;
    list.forEach(function(x){ total+=x.size||0; if(!x.installed) orphans++; });
    sum.textContent=list.length?tr(orphans?"saves.summary":"saves.summaryall",{n:list.length,size:sizeBytes(total),m:orphans}):tr("saves.summarynone");
    if(!list.length){ var none=document.createElement("li"); none.className="none"; none.textContent=tr("saves.summarynone"); ul.appendChild(none); return; }
    list.forEach(function(x,i){
      var li=document.createElement("li"), t=document.createElement("span"), name=document.createElement("b"), tag=document.createElement("span"), meta=document.createElement("small");
      t.className="t"; name.textContent=x.name;
      tag.className="tag";
      tag.textContent=tr(x.bad==="corrupt"||x.bad==="readfail"?"saves.bad":x.bad==="newer"?"saves.newer":x.installed?"saves.installed":"saves.orphan");
      meta.textContent=tr("saves.size",{size:sizeBytes(x.size),when:x.updated?LP.fmt(x.updated):tr("saves.unknown")});
      t.appendChild(name); t.appendChild(tag); t.appendChild(meta); li.appendChild(t);
      var w=document.createElement("span"); w.id="set-saves-del-"+i; li.appendChild(w);
      ul.appendChild(li);
      LP.resetConfirm(w.id,"set-saves-del-btn-"+i,tr("saves.clear"),function(){
        LP.appSaves.clear(x.id).then(function(ok){
          if(ok){ toast(tr("saves.cleared")); sfx("ok"); renderSaves(); renderSavesRow(); }
          else { toast(tr("saves.clearfail")); sfx("err"); }
        },function(e){ toast(tr(e && e.code==="running"?"saves.running":"saves.clearfail")); sfx("err"); });
      });
    });
    LP.resetConfirm("set-saves-all-wrap","set-saves-all",tr("saves.clearall"),function(){
      LP.appSaves.clearAll().then(function(ok){
        toast(tr(ok?"saves.clearedall":"saves.clearallfail")); sfx(ok?"ok":"err"); renderSaves(); renderSavesRow();
      },function(e){ toast(tr(e && e.code==="running"?"saves.running":"saves.clearallfail")); sfx("err"); });
    });
  },function(){
    if(seq!==savesSeq) return;
    sum.textContent=tr("saves.readfail"); ul.textContent=""; wrap.textContent="";
  });
}

/* ---------- the AI line (runtime/ai.js, decisions.md section 34) ----------
   The user's OpenRouter key and model in one document of their own. The key never leaves this phone except in the
   request itself: it is kept out of the backup, and a restore leaves the one already here. Settings shows its last
   four characters only. LP.ai is what other programs use (apps/scripts.js): on(), ask(o), watch(fn). */
var AIP="data/users/local/ai", AI={key:"", model:"", seen:[]};
/* A saved key shows as dots in its field (a password field shows any value as dots): this stand-in, never the key itself.
   Tapping the field empties it for a new key; leaving it empty puts the dots back. */
var KEPT="lopda-key-kept!!";
var AIH=window.LopdaAI.host({fetch:function(u,o){ return fetch(u,o); }});
function aiChanged(){ renderAi(); AI.seen.forEach(function(f){ try{ f(); }catch(e){} }); }
function aiErr(e){ return tr("ai.err."+(e && e.code || "http")); }
/* the row in Settings says whether the line is up; the page behind it (v-set-ai) holds the two labelled fields */
function renderAi(msg){
  var on=!!AI.key;
  $("set-ai-open").textContent=tr(on ? "ai.row.on" : "ai.row.off");
  $("set-ai-state").textContent=msg || (on ? tr("ai.on",{key:AI.key.slice(-4), model:AI.model || window.LopdaAI.MODEL}) : tr("ai.off"));
  $("set-ai-key").placeholder=on ? tr("ai.key.saved",{key:AI.key.slice(-4)}) : tr("ai.key.ph");
  if(document.activeElement!==$("set-ai-key")) $("set-ai-key").value=on ? KEPT : "";
  $("set-ai-test").hidden=!on; $("set-ai-del").hidden=!on;
  if(document.activeElement!==$("set-ai-model")) $("set-ai-model").value=AI.model;
}
$("set-ai-row").onclick=function(){ sfx("tap"); show("set-ai"); };
$("set-ai-back").onclick=function(){ sfx("tap"); openSettings(); };
function saveAi(){
  var v=$("set-ai-key").value.trim(), key=v===KEPT ? "" : v, model=$("set-ai-model").value.trim();
  if(!AI.key && !key){ renderAi(tr("ai.nokey")); sfx("err"); return; }
  if(key) AI.key=key;
  AI.model=model;
  if(S.db) put(S.db.doc(AIP),{v:1, key:AI.key, model:AI.model});
  $("set-ai-key").blur();
  aiChanged(); sfx("ok");
}
$("set-ai-save").onclick=saveAi;
$("set-ai-key").addEventListener("focus",function(){ if(this.value===KEPT) this.value=""; });
$("set-ai-key").addEventListener("blur",function(){ if(!this.value && AI.key) this.value=KEPT; });
$("set-ai-del").onclick=function(){
  AI.key=""; AI.model=""; $("set-ai-model").value="";
  if(S.db) S.db.doc(AIP).delete().catch(function(){});
  aiChanged(); sfx("ok");
};
$("set-ai-test").onclick=function(){
  var b=this; if(b.disabled) return;
  b.disabled=true; renderAi(tr("ai.testing")); sfx("tap");
  var used="";
  LP.ai.ask({messages:[{role:"user", content:"Reply with the single word OK."}], max:16, onModel:function(m){ used=m; }}).then(function(t){
    renderAi(tr("ai.tested",{text:t.trim().slice(0,40), model:used || AI.model || window.LopdaAI.MODEL})); sfx("ok");
  },function(e){ renderAi(aiErr(e)); sfx("err"); }).then(function(){ b.disabled=false; });
};
LP.ai={
  PATH:AIP,
  on:function(){ return !!AI.key; },
  /* o: {messages, max, onText, onModel}; the key and the model are added here */
  ask:function(o){ var q={}; for(var k in o) q[k]=o[k]; q.key=AI.key; q.model=AI.model; return AIH.ask(q); },
  err:aiErr,
  watch:function(f){ AI.seen.push(f); },
  saved:function(){ return AI.key ? {v:1, key:AI.key, model:AI.model} : null; }
};

/* ---------- the darkroom key (runtime/geotag.js, decisions.md section 40) ----------
   The random 128-bit key that seals each negative's place. Only this handheld's darkroom prints can open what it
   sealed, and whoever holds the key reads every negative's place: so the key stays inside the runtime, never through
   PAD, pad-shim, the sandboxed app iframe or any postMessage. The ring is one document of the user's own; the camera's
   place switch makes the first key (ensure), and a restore only ever adds keys to it. */
var DKP="data/users/local/darkroom-key", DK={text:"", count:0, shown:false};
var DKPENDING=null, G=window.LopdaGeotag;
/* read the document fresh every time: a restore may have replaced it since the page opened */
function keyDoc(){
  if(!S.db) return Promise.reject({code:"unavailable"});
  return S.db.doc(DKP).get().then(function(sn){
    return sn.exists ? G.cleanRing(LP.own(sn.data())) : null;
  });
}
function docKey(doc){
  if(!doc) return null;
  for(var i=0;i<doc.keys.length;i++) if(doc.keys[i].id===doc.current) return G.fromHex(doc.keys[i].key);
  return null;
}
/* current first, then the rest in the order stored (the one old negatives still need may be any of them) */
function ringList(doc){
  var out=[], i, k, e;
  if(!doc) return out;
  for(i=0;i<doc.keys.length;i++){
    k=doc.keys[i];
    e={id:k.id, bytes:G.fromHex(k.key)};
    if(k.id===doc.current) out.unshift(e); else out.push(e);
  }
  return out;
}
function ensureKey(){
  if(DKPENDING) return DKPENDING;
  DKPENDING=keyDoc().then(function(doc){
    var have=docKey(doc);
    if(have) return have;
    var bytes=new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return G.keyId(crypto.subtle,bytes).then(function(id){
      var d={keys:[{id:id, key:G.toHex(bytes), added:Date.now()}], current:id};
      return S.db.doc(DKP).set(d).then(function(){ return bytes; });
    });
  });
  DKPENDING.then(function(){ DKPENDING=null; },function(){ DKPENDING=null; });
  return DKPENDING;
}
LP.darkroomKey={
  current:function(){ return keyDoc().then(docKey); },
  ensure:ensureKey,
  ring:function(){ return keyDoc().then(ringList); },
  add:function(text){
    var bytes=G.parseKey(text);
    if(!bytes) return Promise.resolve("bad");
    return G.keyId(crypto.subtle,bytes).then(function(id){
      var hex=G.toHex(bytes);
      return keyDoc().then(function(doc){
        var keys=doc ? doc.keys.slice() : [], i, found=false;
        for(i=0;i<keys.length;i++){
          if(keys[i].id!==id) continue;
          found=true; keys[i]={id:id, key:hex, added:keys[i].added || Date.now()};
        }
        if(!found) keys.push({id:id, key:hex, added:Date.now()});
        return S.db.doc(DKP).set({keys:keys, current:id}).then(function(){ return found ? "same" : "added"; });
      });
    });
  },
  info:function(){
    return keyDoc().then(function(doc){
      var bytes=docKey(doc);
      return bytes ? {text:G.keyText(bytes), count:doc.keys.length} : null;
    });
  }
};
function keyMask(text){ return "••••-••••-…-"+text.slice(-4); }
function paintKey(){
  var on=!!DK.text;
  $("set-key-state").textContent=on ? (DK.shown ? DK.text : keyMask(DK.text)) : tr("key.none");
  $("set-key-show").textContent=tr(DK.shown ? "key.hide" : "key.show");
  $("set-key-show-row").hidden=!on;
  $("set-key-old").hidden=!(on && DK.count>1);
  if(on && DK.count>1) $("set-key-old").textContent=tr("key.old",{n:DK.count-1});
}
function loadKey(){
  return LP.darkroomKey.info().then(function(i){
    DK.text=i ? i.text : ""; DK.count=i ? i.count : 0; DK.shown=false; paintKey();
  },function(){ DK.text=""; DK.count=0; DK.shown=false; paintKey(); });
}
function selectKeyText(){
  var el=$("set-key-state"), sel=window.getSelection && window.getSelection();
  if(!el || !sel) return;
  var r=document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
}
$("set-key-open").onclick=function(){ sfx("tap"); show("set-key"); };
$("set-key-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-key-show").onclick=function(){ DK.shown=!DK.shown; paintKey(); sfx("tap"); };
/* the clipboard needs a real click, never pointerdown (CLAUDE.md); the fallback shows the key so it can be selected */
$("set-key-copy").onclick=function(){
  if(!DK.text) return;
  var p=null;
  try{ if(navigator.clipboard && navigator.clipboard.writeText) p=navigator.clipboard.writeText(DK.text); }catch(e){ p=null; }
  if(!p){ DK.shown=true; paintKey(); selectKeyText(); toast(tr("key.copy.manual")); sfx("err"); return; }
  p.then(function(){ toast(tr("set.share.copied")); sfx("ok"); },function(){
    DK.shown=true; paintKey(); selectKeyText(); toast(tr("key.copy.manual")); sfx("err");
  });
};
function useKey(){
  var b=$("set-key-use"), input=$("set-key-input");
  if(b.disabled) return;
  b.disabled=true;
  LP.darkroomKey.add(input.value).then(function(r){
    if(r!=="added" && r!=="same"){ $("set-key-result").textContent=tr("key.bad"); sfx("err"); return; }
    input.value="";
    $("set-key-result").textContent=tr(r==="added" ? "key.added" : "key.same");
    sfx("ok");
    return loadKey();
  },function(){ $("set-key-result").textContent=tr("key.bad"); sfx("err"); }).then(function(){ b.disabled=false; });
}
$("set-key-use").onclick=useKey;
$("set-key-input").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); useKey(); } });
LP.builtin({id:"set-key", view:"set-key",
  enter:function(){ loadKey(); },
  lang:function(){ loadKey(); },
  /* the key text is shown only while the page is open */
  leave:function(){ DK.shown=false; if(DK.text) paintKey(); $("set-key-input").value=""; $("set-key-result").textContent=""; }
});

/* `sound` is still written for runtimes before 0.12.0, which had a separate switch */
function saveSettings(){
  renderSettings();
  if(S.db){
    var data={sound:SND.vol>0, volume:SND.vol, ui:SND.uiOn, lang:I18N.lang};
    if(S.homeTipDismissed) data.homeTipDismissed=true;
    put(S.refs.settings,data);
  }
}
Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
  b.onclick=function(){ setLang(b.getAttribute("data-lang")); saveSettings(); sfx("ok"); };
});
function setVol(v){ SND.vol=v; LP.applyLevel(); saveSettings(); sfx("tap"); }
$("set-vol-down").onclick=function(){ if(SND.vol>0) setVol(SND.vol-1); };
$("set-vol-up").onclick=function(){ if(SND.vol<LP.VOL_MAX) setVol(SND.vol+1); };
/* turning the clicks off is itself silent, like a real volume control; turning them back on gives the click */
$("set-ui").onclick=function(){ SND.uiOn=!SND.uiOn; LP.applyLevel(); saveSettings(); sfx("tap"); };

/* ---------- the whole-device backup and restore (decisions.md section 24) ----------
   Backup: dump both databases, pack them (backup.js), show the size, save the zip from the tap on 保存.
   Restore: read and check the whole file first; only a backup that passes every check is offered, twice; then the current
   data is kept in memory, the backup written over it, and written back if any write fails. Success restarts the runtime. */
var P=window.LopdaPlatform, BK=window.LopdaBackup, ZIP=window.LopdaZip, DAY=86400000, BIG=200*1024*1024;
var BMETA="data/users/local/backup-meta";
var BS={last:0, busy:false, backup:null, file:null};
function sizeText(bytes){
  var kb=Math.max(1,Math.round((bytes||0)/1024));
  return kb<1024 ? kb+" KB" : kb<10240 ? (kb/1024).toFixed(1)+" MB" : Math.round(kb/1024)+" MB";
}
function renderLast(){
  var t=BS.last, n=Math.floor((Date.now()-t)/DAY);
  $("set-backup-last").textContent=!t ? tr("bk.never") : n<1 ? tr("bk.today") : tr("bk.days",{n:n});
  $("set-backup-state").textContent=!t ? tr("bk.row.never") : n<1 ? tr("bk.row.today") : tr("bk.row.days",{n:n});
}
/* the dialog under the 全部数据 row: a message, a warning line, buttons [{label, go, main}] (a click: the release of a tap) */
function box(msg,buttons,warn){
  $("set-backup-box").hidden=false;
  $("set-backup-msg").textContent=msg;
  $("set-backup-warn").hidden=!warn; $("set-backup-warn").textContent=warn||"";
  var row=$("set-backup-btns"); row.textContent="";
  (buttons||[]).forEach(function(bt){
    var b=document.createElement("button"); b.type="button"; b.className=bt.main?"btn":"btn ghost"; b.textContent=bt.label;
    b.onclick=bt.go; row.appendChild(b);
  });
  $("set-backup-go").disabled=$("set-restore-go").disabled=BS.busy;
  var el=$("set-backup-box"); if(el.scrollIntoView) el.scrollIntoView({block:"nearest"});
}
function closeBox(){ BS.busy=false; BS.backup=null; BS.file=null; $("set-backup-box").hidden=true; $("set-backup-go").disabled=$("set-restore-go").disabled=false; }
function okBox(msg,then){ BS.busy=false; box(msg,[{label:tr("bk.ok"), main:true, go:function(){ sfx("tap"); (then||closeBox)(); }}]); }

/* a backup of `dump` (the current data unless given); `after` runs once it is saved or cancelled */
function startBackup(after,dump){
  var done=after||closeBox, now=Date.now();
  BS.busy=true; box(tr("bk.reading"));
  (dump ? Promise.resolve(dump) : P.dumpAll()).then(function(d){
    /* the backup carries its own time, so a restored handheld says when its data was saved */
    var docs=d.docs.filter(function(x){ return x.path!==BMETA && x.path!==AIP; }).concat([{path:BMETA, data:{last:now}}]);
    return BK.pack({docs:docs, files:d.files},{runtime:RUNTIME_VERSION, now:now});
  }).then(function(pk){
    box(tr("bk.ready",{size:sizeText(pk.size)}),[
      {label:tr("bk.save"), main:true, go:function(){
        var blob=new Blob(ZIP.writeParts(pk.entries),{type:"application/zip"});
        S.downloads.save({filename:BK.fileName(now), data:blob}).then(function(){
          BS.last=now; if(S.db && !dump) put(S.db.doc(BMETA),{last:now});
          renderLast(); toast(tr("bk.saved")); sfx("ok"); done();
        },function(e){ toast(LP.saveErr(e)); sfx("err"); done(); });
      }},
      {label:tr("common.cancel"), go:function(){ sfx("tap"); done(); }}
    ],pk.size>BIG ? tr("bk.big") : "");
  }).catch(function(e){
    if(window.console) console.error("Lo-PDA backup failed", e);
    sfx("err"); okBox(tr(e && e.code==="toolarge" ? "bk.toolarge" : "bk.failed"),after);
  });
}
$("set-backup-go").onclick=function(){ if(!BS.busy && S.db){ sfx("tap"); startBackup(); } };

$("set-restore-go").onclick=function(){ if(!BS.busy && S.db){ sfx("tap"); $("set-restore-file").click(); } };
$("set-restore-file").onchange=function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f || BS.busy) return;
  BS.busy=true; box(tr("rs.checking"));
  f.arrayBuffer().then(function(ab){
    return BK.unpack(new Uint8Array(ab)).then(function(bk){ BS.backup=bk; BS.file=f; askRestore(); },function(e){
      sfx("err"); okBox(tr(e && e.code==="newer" ? "rs.newer" : "rs.bad"));
    });
  },function(){ sfx("err"); okBox(tr("rs.unreadable")); });
};
function askRestore(){
  var bk=BS.backup, when=new Date(bk.manifest.created);
  BS.busy=true;
  box(tr("rs.ask",{when:isNaN(when) ? "?" : when.getFullYear()+"/"+LP.fmt(when.getTime()), docs:bk.docs.length, files:bk.files.length, size:sizeText(BS.file.size)}),[
    {label:tr("rs.go"), main:true, go:function(){ sfx("tap"); sureRestore(); }},
    {label:tr("rs.first"), go:function(){ sfx("tap"); startBackup(askRestore); }},
    {label:tr("common.cancel"), go:function(){ sfx("tap"); closeBox(); }}
  ]);
}
function sureRestore(){
  box(tr("rs.sure"),[
    {label:tr("rs.yes"), main:true, go:function(){ sfx("tap"); doRestore(BS.backup); }},
    {label:tr("common.cancel"), go:function(){ sfx("tap"); askRestore(); }}
  ]);
}
/* Blobs read from IndexedDB may be backed by the database's own files; copied into memory they outlive the clear */
function detach(dump){
  return Promise.all(dump.files.map(function(f){
    var v=f.value, t=Object.prototype.toString.call(v);
    if(t!=="[object Blob]" && t!=="[object File]") return f;
    return v.arrayBuffer().then(function(ab){ return {key:f.key, value:t==="[object File]" ? new File([ab],v.name,{type:v.type}) : new Blob([ab],{type:v.type})}; });
  })).then(function(files){ return {docs:dump.docs, files:files}; });
}
function doRestore(bk){
  box(tr("rs.working"));
  /* the AI key is never in a backup: the one on this phone stays, whatever the file holds. The darkroom key does go
     in (without it a restored phone could not read its own photos' places), and a restore only ever adds keys. */
  S.db.doc(DKP).get().then(function(sn){
    var mineDark=sn.exists ? LP.own(sn.data()) : null, theirsDark=null, i;
    for(i=0;i<bk.docs.length;i++) if(bk.docs[i].path===DKP) theirsDark=bk.docs[i].data;
    var dark=G.mergeRing(mineDark,theirsDark);
    var mine=LP.ai.saved(), docs=bk.docs.filter(function(x){ return x.path!==AIP && x.path!==DKP; });
    if(mine) docs.push({path:AIP, data:mine});
    if(dark) docs.push({path:DKP, data:dark});
    /* programs stop their own writes before anything is replaced; the page reloads straight after a successful restore */
    LP.each("restore");
    P.dumpAll().then(detach).then(function(old){
      return P.replaceAll({docs:docs, files:bk.files}).then(function(){
        box(tr("rs.done")); sfx("ok");
        location.reload();
      },function(e){
        if(window.console) console.error("Lo-PDA restore failed, writing the old data back", e);
        return P.replaceAll(old).then(function(){ sfx("err"); okBox(tr("rs.failed")); },function(e2){
          if(window.console) console.error("Lo-PDA rollback failed", e2);
          sfx("err"); BS.busy=false; renderLostRetry(old);
        });
      });
    },function(){ sfx("err"); okBox(tr("rs.failed")); });
  },function(){ sfx("err"); okBox(tr("rs.failed")); });
}
/* after the old data was saved (or not), keep offering to save it again until the user leaves */
function renderLostRetry(old){
  box(tr("rs.lost"),[{label:tr("bk.save"), main:true, go:function(){ sfx("tap"); startBackup(function(){ renderLostRetry(old); },old); }},
    {label:tr("bk.ok"), go:function(){ sfx("tap"); closeBox(); }}]);
}
/* the notes reminder counts a full backup as an export (apps/notes.js) */
LP.backup={last:function(){ return BS.last; }};

/* the storage line, on the backup page: the phone's usage plus the darkroom's film box (apps/darkroom.js) */
function renderStorage(){
  var el=$("set-storage"); el.textContent=tr("set.counting");
  var film=LP.darkroom ? LP.darkroom.summary().then(function(b){ return tr("set.box",{n:b.n, size:LP.darkroom.size(b.bytes)}); },function(){ return ""; }) : Promise.resolve("");
  if(navigator.storage && navigator.storage.estimate){
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false), film]).then(function(r){
      var kb=Math.max(1,Math.round((r[0].usage||0)/1024));
      el.textContent=tr("set.storage",{size:kb>1024?(kb/1024).toFixed(1)+" MB":kb+" KB"})+r[2]+tr(r[1]?"set.locked":"set.unlocked");
    }).catch(function(){ el.textContent=tr("set.nousage"); });
  } else film.then(function(t){ el.textContent=tr("set.nousage")+t; });
}
function openSettings(){
  show("settings"); renderSettings(); renderSense(); renderAi(); renderUpdate(); renderLast(); renderSavesRow();
}
function selectShareText(){
  var el=$("set-share-url"), sel=window.getSelection && window.getSelection();
  if(!el || !sel) return;
  var r=document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
}
var SHARE={drawn:false};
function openShare(){
  $("set-share-send").hidden=!navigator.share;
  /* the address never changes: draw once, the first time the page opens */
  if(SHARE.drawn) return;
  try{ window.LopdaQR.draw($("set-share-qr"),SHARE_URL,4); SHARE.drawn=true; }
  catch(e){ if(window.console) console.error("Lo-PDA QR failed",e); }
}
$("set-sense-open").onclick=function(){ sfx("tap"); show("set-sense"); };
$("set-sense-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-backup-open").onclick=function(){ sfx("tap"); show("set-backup"); };
$("set-backup-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-saves-open").onclick=function(){ sfx("tap"); show("set-saves"); };
$("set-saves-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-share-open").onclick=function(){ sfx("tap"); show("set-share"); };
$("set-share-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-about-open").onclick=function(){ sfx("tap"); show("set-about"); };
$("set-about-back").onclick=function(){ sfx("tap"); openSettings(); };
/* the share sheet and the clipboard need a real click, never pointerdown (CLAUDE.md) */
$("set-share-send").onclick=function(){
  sfx("tap");
  if(!navigator.share) return;
  try{
    var p=navigator.share({title:"Lo-PDA",url:SHARE_URL});
    if(p && p.catch) p.catch(function(e){ if(!(e && e.name==="AbortError") && window.console) console.error("Lo-PDA share failed",e); });
  }catch(e){}
};
$("set-share-copy").onclick=function(){
  var p=null;
  try{ if(navigator.clipboard && navigator.clipboard.writeText) p=navigator.clipboard.writeText(SHARE_URL); }catch(e){ p=null; }
  if(!p){ selectShareText(); toast(tr("set.share.manual")); sfx("err"); return; }
  p.then(function(){ toast(tr("set.share.copied")); sfx("ok"); },function(){ selectShareText(); toast(tr("set.share.manual")); sfx("err"); });
};

LP.builtin({id:"set-ai", view:"set-ai",
  enter:function(){ renderAi(); },
  lang:function(){ renderAi(); }
});
LP.builtin({id:"set-sense", view:"set-sense",
  enter:function(){ renderSense(); },
  lang:function(){ renderSense(); }
});
LP.builtin({id:"set-backup", view:"set-backup",
  enter:function(){ renderLast(); renderStorage(); if(!BS.busy) $("set-backup-box").hidden=true; },
  lang:function(){ renderLast(); renderStorage(); }
});
LP.builtin({id:"set-saves", view:"set-saves",
  enter:function(){ renderSaves(); },
  lang:function(){ renderSaves(); }
});
LP.builtin({id:"set-share", view:"set-share",
  enter:function(){ openShare(); }
});
LP.builtin({id:"set-about", view:"set-about",
  enter:function(){ $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION}); },
  lang:function(){ $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION}); }
});
LP.builtin({id:"settings", label:"app.settings", icon:"settings", view:"settings",
  open:function(){ openSettings(); },
  lang:function(){ renderSettings(); renderSense(); renderAi(); renderLast(); renderSavesRow(); },
  ready:function(){
    S.db.doc(AIP).get().then(function(sn){
      var d=sn.exists ? LP.own(sn.data()) : null;
      if(d && typeof d.key==="string" && d.key){ AI.key=d.key; AI.model=typeof d.model==="string" ? d.model : ""; aiChanged(); }
    }).catch(function(){});
    S.db.doc(BMETA).get().then(function(sn){ var d=sn.exists ? LP.own(sn.data()) : null; BS.last=d && +d.last || 0; renderLast(); }).catch(function(){});
  }});
})();
