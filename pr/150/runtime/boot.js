/*
 * Lo-PDA runtime: power on. Loaded last, after core.js and every built-in in apps/.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var own=LP.own, toast=LP.toast, setStatus=LP.setStatus, refresh=LP.refresh, SND=LP.SND;

/* ---------- boot ---------- */
I18N.apply(document); setStatus("status.boot");
LP.tickClock(); setInterval(LP.tickClock,15000);
LP.renderHome();

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
    S.refs.film=db.doc(base+"/film");
    S.refs.frames=db.doc(base+"/frames").collection("items");
    S.refs.rolls=db.doc(base+"/rolls").collection("items");
    S.refs.camera=db.doc(base+"/camera");
    S.refs.settings=db.doc(base+"/settings");
    S.refs.carts=db.doc(base+"/carts").collection("items");
    S.refs.roms=db.doc(base+"/roms").collection("items");
    S.refs.cartsave=db.doc(base+"/cartsave").collection("items");
    S.refs.settings.get().then(function(sn){
      var d=sn.exists?own(sn.data()):null;
      S.homeTipDismissed=!!(d && d.homeTipDismissed);
      if(d){ SND.vol=d.sound===false ? 0 : Math.max(0,Math.min(LP.VOL_MAX,d.volume==null?2:d.volume|0)); SND.uiOn=d.ui!==false; LP.applyLevel(); if(I18N.STR[d.lang]) LP.setLang(d.lang); }
      if(!$("v-home").hidden) LP.renderHome();
    }).catch(function(e){ console.error("Lo-PDA settings read failed",e); });
    setStatus("status.saved");
    P.persist();
    refresh("apps"); refresh("notes");
    LP.each("ready");
    document.addEventListener("visibilitychange",function(){
      if(document.hidden){ LP.each("pause"); return; }
      LP.each("resume");
      refresh("apps"); refresh("notes");
    });
  }).catch(function(e){
    setStatus("status.unsaved");
    if(window.console) console.error("Lo-PDA storage failed", e);
    toast(tr("boot.nostore"));
    LP.each("nostore");
  });
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    var hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(function(){});
    /* the browser checks for a new version each time the app opens; once it has taken over,
       the next restart runs it. First install also fires this, so skip that case. */
    navigator.serviceWorker.addEventListener("controllerchange",function(){
      if(!hadController){ hadController=true; return; }
      LP.UPD.ready=true; LP.renderUpdate();
      toast(tr("upd.arrived"));
    });
  }
})();
})();
