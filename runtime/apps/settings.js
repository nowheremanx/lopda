/*
 * Lo-PDA built-in: settings. Volume, language, the apps allowed tilt or the microphone, the whole-device backup and restore,
 * updates, about.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var SND=LP.SND, RUNTIME_VERSION=LP.RUNTIME_VERSION, put=LP.put, sfx=LP.sfx, toast=LP.toast, show=LP.show, setLang=LP.setLang, renderUpdate=LP.renderUpdate;

function renderSettings(){
  /* one control: five steps, the lowest is off */
  var max=LP.VOL_MAX;
  $("set-vol").textContent=SND.vol ? "▮".repeat(SND.vol)+"▯".repeat(max-SND.vol) : tr("set.off");
  $("set-vol-down").disabled=SND.vol<=0; $("set-vol-up").disabled=SND.vol>=max;
  $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION});
  Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
    var on=b.getAttribute("data-lang")===I18N.lang; b.className=on?"btn":"btn ghost"; b.setAttribute("aria-checked",on?"true":"false");
  });
}
/* the apps allowed tilt or the microphone (apps/store.js): one row each, revoked with a tap; the next start() asks again */
function renderSense(){
  var ul=$("set-sense-list"); ul.textContent="";
  var list=LP.sensorGrants ? LP.sensorGrants.list() : [];
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
/* `sound` is still written for runtimes before 0.12.0, which had a separate switch */
function saveSettings(){
  renderSettings();
  if(S.db){
    var data={sound:SND.vol>0, volume:SND.vol, lang:I18N.lang};
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
    var docs=d.docs.filter(function(x){ return x.path!==BMETA; }).concat([{path:BMETA, data:{last:now}}]);
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
  P.dumpAll().then(detach).then(function(old){
    return P.replaceAll(bk).then(function(){
      box(tr("rs.done")); sfx("ok");
      setTimeout(function(){ location.reload(); },800);
    },function(e){
      if(window.console) console.error("Lo-PDA restore failed, writing the old data back", e);
      return P.replaceAll(old).then(function(){ sfx("err"); okBox(tr("rs.failed")); },function(e2){
        if(window.console) console.error("Lo-PDA rollback failed", e2);
        sfx("err"); BS.busy=false; renderLostRetry(old);
      });
    });
  },function(){ sfx("err"); okBox(tr("rs.failed")); });
}
/* after the old data was saved (or not), keep offering to save it again until the user leaves */
function renderLostRetry(old){
  box(tr("rs.lost"),[{label:tr("bk.save"), main:true, go:function(){ sfx("tap"); startBackup(function(){ renderLostRetry(old); },old); }},
    {label:tr("bk.ok"), go:function(){ sfx("tap"); closeBox(); }}]);
}
/* the notes reminder counts a full backup as an export (apps/notes.js) */
LP.backup={last:function(){ return BS.last; }};

function openSettings(){
  show("settings"); renderSettings(); renderSense(); renderUpdate(); renderLast();
  if(!BS.busy) $("set-backup-box").hidden=true;
  var el=$("set-storage"); el.textContent=tr("set.counting");
  /* the darkroom's film box, in rolls and the space they take (apps/darkroom.js) */
  var box=LP.darkroom ? LP.darkroom.summary().then(function(b){ return tr("set.box",{n:b.n, size:LP.darkroom.size(b.bytes)}); },function(){ return ""; }) : Promise.resolve("");
  if(navigator.storage && navigator.storage.estimate){
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false), box]).then(function(r){
      var kb=Math.max(1,Math.round((r[0].usage||0)/1024));
      el.textContent=tr("set.storage",{size:kb>1024?(kb/1024).toFixed(1)+" MB":kb+" KB"})+r[2]+tr(r[1]?"set.locked":"set.unlocked");
    }).catch(function(){ el.textContent=tr("set.nousage"); });
  } else box.then(function(t){ el.textContent=tr("set.nousage")+t; });
}

LP.builtin({id:"settings", label:"app.settings", icon:"settings", view:"settings",
  open:function(){ openSettings(); },
  lang:function(){ renderSettings(); renderLast(); if(!$("v-settings").hidden) openSettings(); },
  ready:function(){
    S.db.doc(BMETA).get().then(function(sn){ var d=sn.exists ? LP.own(sn.data()) : null; BS.last=d && +d.last || 0; renderLast(); }).catch(function(){});
  }});
})();
