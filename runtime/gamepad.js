/*
 * Lo-PDA runtime: Bluetooth controllers, remotes and keyboards as the chin pad's eight keys (decisions.md section 78).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * 1. The layer: poll navigator.getGamepads() once a frame while the chin pad is on screen (and while its Settings page
 *    is open), and turn its changes into LP.setButton(b, down, "pad"), the entry the on-screen keys and the keyboard
 *    already use. So every built-in with the chin pad and every store app with "buttons": true takes a controller with
 *    no change of its own. The loop stops when the pad is hidden, the page is away or no controller is near.
 * 2. Bindings: each Lo-PDA key has a list of sources on a controller: "b3" (button 3), "a0-" / "a0+" (axis 0 past the
 *    press line), "hat-x-" ... (a hat on the last two axes of a non-standard pad with six axes). The defaults depend on
 *    the kind of controller (the W3C "standard" layout; a single Joy-Con, which the iPhone reports with an empty
 *    mapping); the player's own, from Settings -> 手柄 (tap a key, press a button), replace them for that controller's
 *    id. A keyboard key (a Bluetooth keyboard's WASD, a page turner's PageDown) can be bound too, next to core.js's
 *    arrows, X, Z, Enter, Shift, and is stored by e.code so a layout change does not move it; e.key is kept as its
 *    display label.
 *    Stored in data/users/local/gamepad {v:1, maps:{<id>:{up:[...], ...}}, keys:{<key>:<lo-pda key>}, labels:{<key>:<name>}},
 *    so the backup carries it.
 */
(function(){
  "use strict";
  var LP=window.LP; if(!LP) return;
  var $=LP.$, HAS=!!navigator.getGamepads;
  function tr(k,v){ return LP.tr ? LP.tr(k,v) : k; }
  var KEYS=["up","down","left","right","a","b","start","select"];
  var DOC="data/users/local/gamepad";
  var store={maps:{}, keys:{}, labels:{}}, ref=null;
  var held={}, running=false, frame=0, slowTimer=0, activeId=null, touched={};
  var defCache={}, axisOn={};

  /* ---------- default bindings ----------
     standard: by the spec's numbering. 0 and 1 are A and B in that order: the iPhone gives a Nintendo pad's A as 0, and an
     Xbox or PlayStation pad's bottom key (A, cross) is 0 too. Shoulders double as SELECT (left) and START (right), so a
     single Joy-Con held sideways has them on SL / SR. Home (16) stays the system's. */
  function std(){
    return { up:["b12","a1-"], down:["b13","a1+"], left:["b14","a0-"], right:["b15","a0+"],
      a:["b0","b3"], b:["b1","b2"], start:["b9","b5","b7"], select:["b8","b4","b6"] };
  }
  function defaults(gp){
    var ck=gp.mapping+"|"+((gp.axes&&gp.axes.length)||0)+"|"+gp.id;
    if(defCache[ck]) return defCache[ck];
    var m=std();
    if(gp.mapping!=="standard"){
      /* raw pads: the D-pad is often a hat on the last two axes (Android HAT_X / HAT_Y). A four-axis pad is much
         more likely two sticks, so do not turn its right stick into a D-pad; a real hat can still be bound by hand. */
      if((gp.axes||[]).length>=6){
        m.up.push("hat-y-"); m.down.push("hat-y+"); m.left.push("hat-x-"); m.right.push("hat-x+");
      }
      if(/Joy-?Con \((L|R)\)/i.test(gp.id)){
        /* a single Joy-Con held sideways: the iPhone reports its four face keys as 0-3 with an empty mapping
           (owner's test, 2026-11-27: with 1 and 3 as A, A and B came out swapped) */
        m.a=["b0","b2"]; m.b=["b1","b3"];
      }
    }
    defCache[ck]=m; return m;
  }
  function mapFor(gp){ return store.maps[gp.id] || defaults(gp); }

  /* ---------- reading a source ---------- */
  function pressed(b){ return !!b && (b.pressed || b.value>0.5); }
  function active(gp,src){
    var ax=gp.axes||[], m;
    if((m=/^b(\d+)$/.exec(src))) return pressed((gp.buttons||[])[+m[1]]);
    if((m=/^a(\d+)([+-])$/.exec(src))){
      var v=ax[+m[1]]||0, slot=gp.index+":"+src, was=!!axisOn[slot];
      /* a little hysteresis: a stick resting near the line must not flicker the key every frame */
      var hot=m[2]==="+" ? v>(was?0.35:0.6) : v<-(was?0.35:0.6);
      axisOn[slot]=hot;
      return hot;
    }
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
  function hatAxis(gp,n){ return !!gp && gp.mapping!=="standard" && (gp.axes||[]).length>=6 && n>=gp.axes.length-2; }
  function hatDir(n,sign,gp){
    if(gp && n===gp.axes.length-2) return sign==="+" ? "right" : "left";
    return sign==="+" ? "down" : "up";
  }
  function srcText(s,gp){
    var m;
    if((m=/^b(\d+)$/.exec(s))) return tr("pad.src.b",{n:m[1]});
    if((m=/^a(\d+)([+-])$/.exec(s))){
      if(hatAxis(gp,+m[1])) return tr("pad.src.hat",{d:tr("pad.k."+hatDir(+m[1],m[2],gp))});
      return tr("pad.src.a",{n:m[1], d:m[2]});
    }
    if((m=/^hat-([xy])([+-])$/.exec(s))){
      var dir=m[1]==="x" ? (m[2]==="+"?"right":"left") : (m[2]==="+"?"down":"up");
      return tr("pad.src.hat",{d:tr("pad.k."+dir)});
    }
    return s;
  }

  /* ---------- the loop ---------- */
  function padVisible(){ var g=$("gamepad"); return !!g && !g.hidden; }
  function padShown(){
    if(!padVisible()) return false;
    /* Only the soft keyboard closes the controller, not a focused field: the notes search, the calendar's add sheet
       and the dictionary's search deliberately focus a field and still take the chin keys. The keyboard bindings
       (keydown/up below) do keep their letters to a text field. */
    return !(document.documentElement && document.documentElement.classList && document.documentElement.classList.contains("kb"));
  }
  function pads(){ try{ return HAS ? (navigator.getGamepads()||[]) : []; }catch(e){ return []; } }
  function hasPad(){ var l=pads(); for(var i=0;i<l.length;i++) if(l[i] && l[i].connected) return true; return false; }
  function padTouched(gp){
    var bt=gp.buttons||[];
    for(var b=0;b<bt.length;b++) if(pressed(bt[b])) return true;
    var ax=gp.axes||[]; for(var a=0;a<ax.length;a++) if(Math.abs(ax[a])>0.6) return true;
    return false;
  }
  function tick(){
    frame=0;
    if(!running) return;
    var list=pads(), now={}, any=false, shown=padShown(), route=shown && !cap;
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp || !gp.connected) continue; any=true;
      var t=padTouched(gp);
      if(t && !touched[gp.index]){ touched[gp.index]=true; if(activeId!==gp.id){ activeId=gp.id; if(pageOpen()) renderPage(null,cap?cap.key:null); } }
      else if(!t) touched[gp.index]=false;
      if(route) wants(gp,now); }
    if(!shown) forgetAxes();
    KEYS.forEach(function(k){
      var on=!!now[k];
      if(on!==!!held[k]){ held[k]=on; LP.setButton(k,on,"pad"); }
    });
    if(cap) capture(list);
    if(pageOpen()) livePage(list);
    if(running && (pageOpen() || (padVisible() && any))){
      if(!frame) frame=requestAnimationFrame(tick);
    } else {
      running=false;
      if(padVisible() && !frame) slowScan();
    }
  }
  function start(){ if(running || document.hidden || !HAS) return; running=true; stopSlow(); if(frame) cancelFrame(); frame=requestAnimationFrame(tick); }
  function stop(){ running=false; if(frame) cancelFrame(); }
  function cancelFrame(){ if(frame){ try{ if(window.cancelAnimationFrame) window.cancelAnimationFrame(frame); }catch(e){} frame=0; } }
  /* while a pad view is open but no controller is known yet, look for one twice a second instead of every frame;
     some browsers only expose a pad after its first button, and that fires gamepadconnected anyway */
  function slowScan(){
    if(!HAS || slowTimer || running || document.hidden || !padVisible()) return;
    slowTimer=setTimeout(function(){
      slowTimer=0;
      if(running || document.hidden || !padVisible()) return;
      if(hasPad()) start(); else slowScan();
    },500);
  }
  function stopSlow(){ if(slowTimer){ clearTimeout(slowTimer); slowTimer=0; } }
  function wake(){
    if(pageOpen()){ start(); return; }
    if(padVisible()){ if(hasPad()) start(); else slowScan(); }
  }
  function forgetAxes(index){
    Object.keys(axisOn).forEach(function(k){ if(index==null ? true : k.indexOf(index+":")===0) delete axisOn[k]; });
  }
  function releaseKeys(){
    Object.keys(keyHeld).forEach(function(x){ if(keyHeld[x]){ var b=keyHeld[x]; keyHeld[x]=false; LP.setButton(b,false,"bind"); } });
  }
  function letGo(){
    KEYS.forEach(function(k){ if(held[k]){ held[k]=false; LP.setButton(k,false,"pad"); } });
    releaseKeys();
    forgetAxes(); touched={};
  }

  window.addEventListener("gamepadconnected",function(e){
    delete touched[e.gamepad.index]; forgetAxes(e.gamepad.index);
    if(!activeId) activeId=e.gamepad.id;   /* a second pad does not take the page until it is actually pressed */
    LP.toast(tr("pad.connected"));
    wake(); if(pageOpen()) renderPage(null,cap?cap.key:null);
  });
  window.addEventListener("gamepaddisconnected",function(e){
    delete touched[e.gamepad.index]; forgetAxes(e.gamepad.index);
    if(activeId===e.gamepad.id) activeId=null;
    if(!running) letGo();   /* a running loop sees the remaining pads on its next tick, so one of two pads going does not release the other's key */
    LP.toast(tr("pad.gone"));
    if(pageOpen()) renderPage(null,cap?cap.key:null);
    wake();
  });
  document.addEventListener("visibilitychange",function(){
    if(document.hidden){ stop(); stopSlow(); letGo(); }
    else wake();
  });
  /* losing the window can lose a keyboard keyup; the controller is polled, so it must stay held */
  window.addEventListener("blur",releaseKeys);

  /* ---------- keyboard keys bound on the page (core.js keeps its own arrows / X / Z / Enter / Shift) ---------- */
  var keyHeld={};
  function keyIds(e){
    var out=[], k=e.key||"";
    if(e.code) out.push(e.code);
    if(k){ k=k.length===1 ? k.toLowerCase() : k; if(out.indexOf(k)<0) out.push(k); }
    return out;
  }
  function keyText(k){
    if(/^Key[A-Z]$/.test(k)) return k.slice(3);
    if(/^Digit[0-9]$/.test(k)) return k.slice(5);
    if(/^Numpad/.test(k)) return k.replace(/^Numpad/,"Num ");
    if(k===" "||k==="Space") return "Space";
    if(k.length===1) return k.toUpperCase();
    return k;
  }
  function keyLabel(e){
    var k=e.key||"";
    if(k===" ") return "Space";
    if(k.length===1) return k.toUpperCase();
    return k || keyText(e.code||"");
  }
  function boundKey(e){
    var ids=keyIds(e);
    for(var i=0;i<ids.length;i++) if(store.keys[ids[i]]) return {id:ids[i], b:store.keys[ids[i]]};
    return null;
  }
  function heldKey(e){
    var ids=keyIds(e);
    for(var i=0;i<ids.length;i++) if(keyHeld[ids[i]]) return {id:ids[i], b:keyHeld[ids[i]]};
    return null;
  }
  function typing(t){ return !!t && (/INPUT|TEXTAREA|SELECT/.test(t.nodeName) || t.isContentEditable); }
  var NOT_A_KEY=/^(Unidentified|Dead|Process|Meta|Control|Alt|AltGraph|CapsLock|Fn|FnLock|OS|Shift|ShiftLeft|ShiftRight|ControlLeft|ControlRight|MetaLeft|MetaRight|AltLeft|AltRight)$/;
  document.addEventListener("keydown",function(e){
    if(typing(e.target) || e.isComposing) return;
    if(cap){
      var ids=keyIds(e), k=ids[0]||"";
      if(e.ctrlKey || e.altKey || e.metaKey) return;   /* a shortcut is not a binding */
      if(!k || NOT_A_KEY.test(k) || NOT_A_KEY.test(e.key||"")) return;
      e.preventDefault(); e.stopPropagation();
      if((e.key||"")==="Escape" || k==="Escape") cancel(); else bindKey(k,ids,keyLabel(e));
      return;
    }
    var hit=boundKey(e);
    if(!hit || e.metaKey || e.ctrlKey || e.altKey || !padShown()) return;
    e.preventDefault(); e.stopPropagation();
    if(!keyHeld[hit.id]){ keyHeld[hit.id]=hit.b; LP.setButton(hit.b,true,"bind"); }
  },true);
  document.addEventListener("keyup",function(e){
    var hit=heldKey(e);
    if(!hit) return;
    keyHeld[hit.id]=false; e.stopPropagation();
    LP.setButton(hit.b,false,"bind");
  },true);

  /* ---------- stored bindings ---------- */
  function docRef(){ if(!ref && LP.S && LP.S.db) ref=LP.S.db.doc(DOC); return ref; }
  function clean(d){
    var out={maps:{}, keys:{}, labels:{}};
    if(d && d.maps && typeof d.maps==="object") Object.keys(d.maps).forEach(function(id){
      var m=d.maps[id], c={}; if(!m || typeof m!=="object") return;
      KEYS.forEach(function(k){ c[k]=Array.isArray(m[k]) ? m[k].filter(function(s){ return typeof s==="string"; }) : []; });
      out.maps[id]=c;
    });
    if(d && d.keys && typeof d.keys==="object") Object.keys(d.keys).forEach(function(x){ if(KEYS.indexOf(d.keys[x])>=0 && !NOT_A_KEY.test(x)) out.keys[x]=d.keys[x]; });
    if(d && d.labels && typeof d.labels==="object") Object.keys(d.labels).forEach(function(x){
      if(out.keys[x] && typeof d.labels[x]==="string") out.labels[x]=d.labels[x].slice(0,32);
    });
    return out;
  }
  function load(){
    var r=docRef(); if(!r) return;
    r.get().then(function(sn){
      store=clean(sn.exists ? LP.own(sn.data()) : null);
      if(pageOpen()) renderPage();
    }).catch(function(){});
  }
  function save(){ var r=docRef(); if(r) LP.put(r,{v:1, maps:store.maps, keys:store.keys, labels:store.labels}); }

  /* ---------- Settings -> 手柄: tap a key, then press what should be that key ---------- */
  var cap=null, capTimer=0;   /* {key, base:{<index>:{buttons, axes}}} while waiting for a press */
  function pageOpen(){ var v=$("v-set-pad"); return !!v && !v.hidden; }
  function currentPad(){
    var l=pads(), first=null;
    for(var i=0;i<l.length;i++){ var gp=l[i]; if(!gp || !gp.connected) continue; if(!first) first=gp; if(activeId && gp.id===activeId) return gp; }
    return first;
  }
  function snapshot(list){
    var base={};
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp) continue;
      base[gp.index]={buttons:(gp.buttons||[]).map(pressed), axes:(gp.axes||[]).slice()}; }
    return base;
  }
  function stopCap(){ cap=null; clearTimeout(capTimer); capTimer=0; }
  function cancel(){ var key=cap && cap.key; stopCap(); renderPage(null,key); }
  function arm(key){
    stopCap();
    cap={key:key, base:snapshot(pads())};
    capTimer=setTimeout(function(){ if(cap){ var k=cap.key; stopCap(); renderPage(tr("pad.timeout"),k); } },6000);
    start(); renderPage(null,key);
  }
  function capture(list){
    for(var i=0;i<list.length;i++){
      var gp=list[i]; if(!gp || !gp.connected) continue;
      var base=cap.base[gp.index];
      if(!base){
        /* a pad that appears while we wait (its first button is what connected it): that press is the binding,
           not a baseline to ignore */
        base=cap.base[gp.index]={buttons:(gp.buttons||[]).map(function(){ return false; }), axes:(gp.axes||[]).map(function(){ return 0; })};
      }
      for(var b=0;b<(gp.buttons||[]).length;b++) if(pressed(gp.buttons[b]) && !base.buttons[b]) return bindPad(gp,"b"+b);
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
    store.maps[gp.id]=copy; save(); forgetAxes(gp.index);
    LP.sfx("ok"); renderPage(tr("pad.bound",{key:keyName(key), src:srcText(src,gp)}),key);
  }
  function bindKey(k,ids,label){
    var key=cap.key; stopCap();
    (ids||[k]).forEach(function(x){ if(x!==k){ delete store.keys[x]; delete store.labels[x]; } });   /* one physical key, one stored name */
    Object.keys(store.keys).forEach(function(x){ if(store.keys[x]===key){ delete store.keys[x]; delete store.labels[x]; } });
    store.keys[k]=key; store.labels[k]=label||keyText(k); save();
    LP.sfx("ok"); renderPage(tr("pad.bound",{key:keyName(key), src:store.labels[k]}),key);
  }
  function keyName(k){ return tr("pad.k."+k); }

  function renderPage(msg,focusKey){
    var list=$("set-pad-list"); if(!list) return;
    var gp=currentPad();
    $("set-pad-who").textContent=gp ? gp.id : tr(HAS ? "pad.none" : "pad.unsupported");
    list.textContent="";
    KEYS.forEach(function(k){
      var btn=document.createElement("button"); btn.type="button"; btn.className="set-open set-pad-row"; btn.setAttribute("data-k",k);
      var name=document.createElement("span"); name.className="set-label"; name.textContent=keyName(k);
      var state=document.createElement("span"); state.className="set-state";
      if(cap && cap.key===k) state.textContent=tr("pad.press");
      else {
        var raw=gp ? (mapFor(gp)[k]||[]).slice() : [];
        /* a raw pad's hat is the one that works; put it before the guessed button/axis names, which may not exist */
        raw.sort(function(a,b){ return (/^hat/.test(a)?0:1)-(/^hat/.test(b)?0:1); });
        var srcs=raw.map(function(s){ return srcText(s,gp); });
        Object.keys(store.keys).forEach(function(x){ if(store.keys[x]===k) srcs.push(store.labels[x]||keyText(x)); });
        state.textContent=srcs.length ? srcs.join(" / ") : "-";
      }
      btn.appendChild(name); btn.appendChild(state);
      btn.onclick=function(){ LP.sfx("tap"); if(cap && cap.key===k) cancel(); else arm(k); };
      list.appendChild(btn);
    });
    $("set-pad-msg").textContent=msg||"";
    /* the list is rebuilt on every tap and bind; keep the keyboard where it was (a11y) */
    if(focusKey){
      var f=list.querySelector('[data-k="'+focusKey+'"]');
      if(f && f.focus){ try{ f.focus({preventScroll:true}); }catch(e){ try{ f.focus(); }catch(x){} } }
    }
  }
  function livePage(list){
    var out=[];
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp || !gp.connected) continue;
      for(var b=0;b<(gp.buttons||[]).length;b++) if(pressed(gp.buttons[b])) out.push(srcText("b"+b,gp));
      (gp.axes||[]).forEach(function(v,a){ if(Math.abs(v)>0.5) out.push(srcText("a"+a+(v>0?"+":"-"),gp)); }); }
    var t=out.length ? tr("pad.now",{what:out.join(" ")}) : "";
    var el=$("set-pad-live"); if(el && el.textContent!==t) el.textContent=t;
  }
  if($("set-pad-reset")) $("set-pad-reset").onclick=function(){
    LP.sfx("tap"); stopCap();
    var gp=currentPad(); if(gp) delete store.maps[gp.id];
    store.keys={}; store.labels={}; save(); forgetAxes(); renderPage(tr("pad.reset.done"));
  };

  LP.builtin({id:"set-pad", view:"set-pad",
    enter:function(){ stopCap(); renderPage(); start(); },
    leave:function(){ if(cap) stopCap(); },
    lang:function(){ if(pageOpen()) renderPage(null,cap?cap.key:null); },
    ready:function(){ load(); },
    restore:function(){ stopCap(); },
    padLayout:function(){
      if(!padVisible()){
        /* core's showPad(false) already released every source; forget our copy without sending a second release */
        KEYS.forEach(function(k){ held[k]=false; });
        forgetAxes(); touched={};
        if(!pageOpen()){ stop(); stopSlow(); }
        return;
      }
      if(hasPad()) start(); else slowScan();
    }
  });
})();
