/*
 * Lo-PDA built-in: settings. Sound, volume, language, updates, about.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var SND=LP.SND, RUNTIME_VERSION=LP.RUNTIME_VERSION, put=LP.put, sfx=LP.sfx, show=LP.show, setLang=LP.setLang, renderUpdate=LP.renderUpdate;

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
Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
  b.onclick=function(){ setLang(b.getAttribute("data-lang")); saveSettings(); sfx("ok"); };
});
$("set-sound").onclick=function(){ SND.on=!SND.on; saveSettings(); sfx("ok"); };
$("set-vol-down").onclick=function(){ if(SND.vol>0){ SND.vol--; saveSettings(); sfx("tap"); } };
$("set-vol-up").onclick=function(){ if(SND.vol<3){ SND.vol++; saveSettings(); sfx("tap"); } };
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

LP.builtin({id:"settings", label:"app.settings", icon:"settings", view:"settings",
  open:function(){ openSettings(); },
  lang:function(){ renderSettings(); if(!$("v-settings").hidden) openSettings(); }});
})();
