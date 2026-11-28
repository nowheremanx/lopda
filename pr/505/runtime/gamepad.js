/*
 * Lo-PDA runtime: Bluetooth controllers, remotes and keyboards as the chin pad's eight keys (decisions.md section 78).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * 1. The layer: while a controller is connected and the page is visible, poll navigator.getGamepads() once a frame and
 *    turn its changes into LP.setButton(b, down), the entry the on-screen keys and the keyboard already use. So every
 *    built-in with the chin pad and every store app with "buttons": true takes a controller with no change of its own.
 *    Only while the chin pad shows, like the keyboard (core.js padOn()).
 * 2. Bindings: each Lo-PDA key has a list of sources on a controller: "b3" (button 3), "a0-" / "a0+" (axis 0 past -0.5
 *    or +0.5), "hat-x-" ... (a hat on the last two axes of a non-standard pad). The defaults depend on the kind of
 *    controller (the W3C "standard" layout; a single Joy-Con, which the iPhone reports with an empty mapping); the player's
 *    own, from Settings -> 手柄 (tap a key, press a button), replace them for that controller's id. A keyboard key (a
 *    Bluetooth keyboard's WASD, a page turner's PageDown) can be bound too, next to core.js's arrows, X, Z, Enter, Shift.
 *    Stored in data/users/local/gamepad {v:1, maps:{<id>:{up:[...], ...}}, keys:{<key>:<lo-pda key>}}, so the backup
 *    carries it.
 */
(function(){
  "use strict";
  var LP=window.LP; if(!LP) return;
  var $=LP.$, HAS=!!navigator.getGamepads;
  function tr(k,v){ return LP.tr ? LP.tr(k,v) : k; }
  var KEYS=["up","down","left","right","a","b","start","select"];
  var DOC="data/users/local/gamepad";
  var store={maps:{}, keys:{}}, ref=null;
  var held={}, running=false, seen={};

  /* ---------- default bindings ----------
     standard: by the spec's numbering. 0 and 1 are A and B in that order: the iPhone gives a Nintendo pad's A as 0, and an
     Xbox or PlayStation pad's bottom key (A, cross) is 0 too. Shoulders double as SELECT (left) and START (right), so a
     single Joy-Con held sideways has them on SL / SR. Home (16) stays the system's. */
  function std(){
    return { up:["b12","a1-"], down:["b13","a1+"], left:["b14","a0-"], right:["b15","a0+"],
      a:["b0","b3"], b:["b1","b2"], start:["b9","b5","b7"], select:["b8","b4","b6"] };
  }
  function defaults(gp){
    var m=std();
    if(gp.mapping!=="standard"){
      /* raw pads: the D-pad is often a hat on the last two axes (Android HAT_X / HAT_Y) */
      m.up.push("hat-y-"); m.down.push("hat-y+"); m.left.push("hat-x-"); m.right.push("hat-x+");
      if(/Joy-?Con \((L|R)\)/i.test(gp.id)){
        /* a single Joy-Con held sideways: the iPhone reports its four face keys as 0-3 with an empty mapping
           (owner's test, 2026-11-27: with 1 and 3 as A, A and B came out swapped) */
        m.a=["b0","b2"]; m.b=["b1","b3"];
      }
    }
    return m;
  }
  function mapFor(gp){ return store.maps[gp.id] || defaults(gp); }

  /* ---------- reading a source ---------- */
  function pressed(b){ return !!b && (b.pressed || b.value>0.5); }
  function active(gp,src){
    var ax=gp.axes||[], m;
    if((m=/^b(\d+)$/.exec(src))) return pressed(gp.buttons[+m[1]]);
    if((m=/^a(\d+)([+-])$/.exec(src))){ var v=ax[+m[1]]||0; return m[2]==="+" ? v>0.5 : v<-0.5; }
    if((m=/^hat-([xy])([+-])$/.exec(src))){
      if(ax.length<4) return false;
      var hv=ax[ax.length-(m[1]==="x"?2:1)]||0;
      if(Math.abs(hv-Math.round(hv))>0.05) return false;   /* not a hat: a hat sits on -1, 0 or 1 */
      return m[2]==="+" ? hv>0.5 : hv<-0.5;
    }
    return false;
  }
  function wants(gp,out){
    var map=mapFor(gp);
    KEYS.forEach(function(k){ (map[k]||[]).forEach(function(s){ if(active(gp,s)) out[k]=true; }); });
  }
  function srcText(s){
    var m;
    if((m=/^b(\d+)$/.exec(s))) return tr("pad.src.b",{n:m[1]});
    if((m=/^a(\d+)([+-])$/.exec(s))) return tr("pad.src.a",{n:m[1], d:m[2]});
    return s;
  }

  /* ---------- the loop ---------- */
  function padShown(){ var g=$("gamepad"); return !!g && !g.hidden; }
  function pads(){ try{ return HAS ? (navigator.getGamepads()||[]) : []; }catch(e){ return []; } }
  function tick(){
    if(!running) return;
    var list=pads(), now={}, any=false, route=padShown() && !cap;
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp || !gp.connected) continue; any=true; if(route) wants(gp,now); }
    KEYS.forEach(function(k){
      var on=!!now[k];
      if(on!==!!held[k]){ held[k]=on; LP.setButton(k,on); }
    });
    if(cap) capture(list);
    if(pageOpen()) livePage(list);
    if(any || pageOpen()) requestAnimationFrame(tick); else running=false;
  }
  function start(){ if(running || document.hidden || !HAS) return; running=true; requestAnimationFrame(tick); }
  function letGo(){
    KEYS.forEach(function(k){ if(held[k]){ held[k]=false; LP.setButton(k,false); } });
    Object.keys(keyHeld).forEach(function(x){ if(keyHeld[x]){ keyHeld[x]=false; LP.setButton(store.keys[x]||"a",false); } });
  }

  window.addEventListener("gamepadconnected",function(e){
    seen[e.gamepad.index]=true;
    LP.toast(tr("pad.connected"));
    start(); if(pageOpen()) renderPage();
  });
  window.addEventListener("gamepaddisconnected",function(e){
    delete seen[e.gamepad.index]; letGo();
    LP.toast(tr("pad.gone"));
    if(pageOpen()) renderPage();
  });
  document.addEventListener("visibilitychange",function(){ if(document.hidden){ running=false; letGo(); } else if(Object.keys(seen).length || pageOpen()) start(); });
  window.addEventListener("blur",letGo);

  /* ---------- keyboard keys bound on the page (core.js keeps its own arrows / X / Z / Enter / Shift) ---------- */
  var keyHeld={};
  function keyId(e){ var k=e.key||""; return k.length===1 ? k.toLowerCase() : k; }
  function typing(t){ return !!t && (/INPUT|TEXTAREA|SELECT/.test(t.nodeName) || t.isContentEditable); }
  var NOT_A_KEY=/^(Unidentified|Dead|Process|Meta|Control|Alt|AltGraph|CapsLock|Fn|FnLock|OS)$/;
  document.addEventListener("keydown",function(e){
    if(typing(e.target)) return;
    var k=keyId(e);
    if(cap){
      if(NOT_A_KEY.test(k) || !k) return;
      e.preventDefault(); e.stopPropagation();
      if(k==="Escape") cancel(); else bindKey(k);
      return;
    }
    var b=store.keys[k];
    if(!b || e.metaKey || e.ctrlKey || e.altKey || !padShown()) return;
    e.preventDefault(); e.stopPropagation();
    if(!keyHeld[k]){ keyHeld[k]=true; LP.setButton(b,true); }
  },true);
  document.addEventListener("keyup",function(e){
    var k=keyId(e);
    if(!keyHeld[k]) return;
    keyHeld[k]=false; e.stopPropagation();
    LP.setButton(store.keys[k],false);
  },true);

  /* ---------- stored bindings ---------- */
  function docRef(){ if(!ref && LP.S && LP.S.db) ref=LP.S.db.doc(DOC); return ref; }
  function clean(d){
    var out={maps:{}, keys:{}};
    if(d && d.maps && typeof d.maps==="object") Object.keys(d.maps).forEach(function(id){
      var m=d.maps[id], c={}; if(!m || typeof m!=="object") return;
      KEYS.forEach(function(k){ c[k]=Array.isArray(m[k]) ? m[k].filter(function(s){ return typeof s==="string"; }) : []; });
      out.maps[id]=c;
    });
    if(d && d.keys && typeof d.keys==="object") Object.keys(d.keys).forEach(function(x){ if(KEYS.indexOf(d.keys[x])>=0) out.keys[x]=d.keys[x]; });
    return out;
  }
  function load(){
    var r=docRef(); if(!r) return;
    r.get().then(function(sn){
      store=clean(sn.exists ? LP.own(sn.data()) : null);
      if(pageOpen()) renderPage();
    }).catch(function(){});
  }
  function save(){ var r=docRef(); if(r) LP.put(r,{v:1, maps:store.maps, keys:store.keys}); }

  /* ---------- Settings -> 手柄: tap a key, then press what should be that key ---------- */
  var cap=null, capTimer=0;   /* {key, base:{<index>:{buttons, axes}}} while waiting for a press */
  function pageOpen(){ var v=$("v-set-pad"); return !!v && !v.hidden; }
  function firstPad(){ var l=pads(); for(var i=0;i<l.length;i++) if(l[i] && l[i].connected) return l[i]; return null; }
  function snapshot(list){
    var base={};
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp) continue;
      base[gp.index]={buttons:gp.buttons.map(pressed), axes:(gp.axes||[]).slice()}; }
    return base;
  }
  function stopCap(){ cap=null; clearTimeout(capTimer); capTimer=0; }
  function cancel(){ stopCap(); renderPage(); }
  function arm(key){
    stopCap();
    cap={key:key, base:snapshot(pads())};
    capTimer=setTimeout(function(){ if(cap){ stopCap(); renderPage(tr("pad.timeout")); } },6000);
    start(); renderPage();
  }
  function capture(list){
    for(var i=0;i<list.length;i++){
      var gp=list[i]; if(!gp || !gp.connected) continue;
      var base=cap.base[gp.index];
      if(!base){ cap.base[gp.index]=snapshot([gp])[gp.index]; continue; }
      for(var b=0;b<gp.buttons.length;b++) if(pressed(gp.buttons[b]) && !base.buttons[b]) return bindPad(gp,"b"+b);
      var ax=gp.axes||[];
      for(var a=0;a<ax.length;a++){
        if(Math.abs(ax[a]-(base.axes[a]||0))>0.6 && Math.abs(ax[a])>0.5) return bindPad(gp,"a"+a+(ax[a]>0?"+":"-"));
      }
    }
  }
  function bindPad(gp,src){
    var key=cap.key; stopCap();
    var m=mapFor(gp), copy={};
    KEYS.forEach(function(k){ copy[k]=(m[k]||[]).filter(function(s){ return s!==src; }); });
    copy[key]=[src];   /* the press replaces what the key had, so a key is never two things by accident */
    /* a stick bound to a direction brings its opposite along, so up/down or left/right stay one stick */
    var am=/^a(\d+)([+-])$/.exec(src), opp={up:"down",down:"up",left:"right",right:"left"}[key];
    if(am && opp){ var o="a"+am[1]+(am[2]==="+"?"-":"+"); KEYS.forEach(function(k){ copy[k]=copy[k].filter(function(s){ return s!==o; }); }); copy[opp]=[o]; }
    store.maps[gp.id]=copy; save();
    LP.sfx("ok"); renderPage(tr("pad.bound",{key:keyName(key), src:srcText(src)}));
  }
  function bindKey(k){
    var key=cap.key; stopCap();
    Object.keys(store.keys).forEach(function(x){ if(store.keys[x]===key) delete store.keys[x]; });
    store.keys[k]=key; save();
    LP.sfx("ok"); renderPage(tr("pad.bound",{key:keyName(key), src:keyText(k)}));
  }
  function keyName(k){ return tr("pad.k."+k); }
  function keyText(k){ return k===" " ? "Space" : (k.length===1 ? k.toUpperCase() : k); }

  function renderPage(msg){
    var list=$("set-pad-list"); if(!list) return;
    var gp=firstPad();
    $("set-pad-who").textContent=gp ? gp.id : tr("pad.none");
    list.textContent="";
    KEYS.forEach(function(k){
      var btn=document.createElement("button"); btn.type="button"; btn.className="set-open set-pad-row"; btn.setAttribute("data-k",k);
      var name=document.createElement("span"); name.className="set-label"; name.textContent=keyName(k);
      var state=document.createElement("span"); state.className="set-state";
      if(cap && cap.key===k) state.textContent=tr("pad.press");
      else {
        var srcs=gp ? (mapFor(gp)[k]||[]).filter(function(s){ return !/^hat/.test(s); }).map(srcText) : [];
        Object.keys(store.keys).forEach(function(x){ if(store.keys[x]===k) srcs.push(keyText(x)); });
        state.textContent=srcs.length ? srcs.join(" / ") : "-";
      }
      btn.appendChild(name); btn.appendChild(state);
      btn.onclick=function(){ LP.sfx("tap"); if(cap && cap.key===k) cancel(); else arm(k); };
      list.appendChild(btn);
    });
    $("set-pad-msg").textContent=msg||"";
  }
  function livePage(list){
    var out=[];
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp || !gp.connected) continue;
      for(var b=0;b<gp.buttons.length;b++) if(pressed(gp.buttons[b])) out.push(srcText("b"+b));
      (gp.axes||[]).forEach(function(v,a){ if(Math.abs(v)>0.5) out.push(srcText("a"+a+(v>0?"+":"-"))); }); }
    var t=out.length ? tr("pad.now",{what:out.join(" ")}) : "";
    var el=$("set-pad-live"); if(el && el.textContent!==t) el.textContent=t;
  }
  if($("set-pad-reset")) $("set-pad-reset").onclick=function(){
    LP.sfx("tap"); stopCap();
    var gp=firstPad(); if(gp) delete store.maps[gp.id];
    store.keys={}; save(); renderPage(tr("pad.reset.done"));
  };

  LP.builtin({id:"set-pad", view:"set-pad",
    enter:function(){ stopCap(); renderPage(); start(); },
    leave:function(){ if(cap) stopCap(); },
    lang:function(){ if(pageOpen()) renderPage(); },
    ready:function(){ load(); },
    restore:function(){ stopCap(); }
  });
})();
