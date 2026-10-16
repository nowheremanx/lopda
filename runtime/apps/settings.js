/*
 * Lo-PDA built-in: settings. Volume, language, the apps allowed tilt or the microphone, updates, about.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var SND=LP.SND, RUNTIME_VERSION=LP.RUNTIME_VERSION, put=LP.put, sfx=LP.sfx, show=LP.show, setLang=LP.setLang, renderUpdate=LP.renderUpdate;

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
function saveSettings(){ renderSettings(); if(S.db) put(S.refs.settings,{sound:SND.vol>0, volume:SND.vol, lang:I18N.lang}); }
Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
  b.onclick=function(){ setLang(b.getAttribute("data-lang")); saveSettings(); sfx("ok"); };
});
function setVol(v){ SND.vol=v; LP.applyLevel(); saveSettings(); sfx("tap"); }
$("set-vol-down").onclick=function(){ if(SND.vol>0) setVol(SND.vol-1); };
$("set-vol-up").onclick=function(){ if(SND.vol<LP.VOL_MAX) setVol(SND.vol+1); };
function openSettings(){
  show("settings"); renderSettings(); renderSense(); renderUpdate();
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
  lang:function(){ renderSettings(); if(!$("v-settings").hidden) openSettings(); }});
})();
