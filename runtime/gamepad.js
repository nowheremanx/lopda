/*
 * Lo-PDA runtime: Bluetooth game controllers (Gamepad API) and remotes as the chin pad's eight keys.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * PROOF OF CONCEPT (test PR, not for merging as it is; a reference for the real build).
 *
 * 1. The layer: while a controller is connected and the page is visible, poll navigator.getGamepads() once a frame and
 *    turn its changes into LP.setButton(b, down), the entry the on-screen keys and the keyboard already use. So every
 *    built-in with the chin pad and every store app with "buttons": true takes a controller with no change of its own.
 *    Only while the chin pad shows, like the keyboard (core.js padOn()).
 * 2. Bindings: each Lo-PDA key has a list of sources on a controller: "b3" (button 3), "a0-" / "a0+" (axis 0 past -0.5
 *    or +0.5), "hat-x-" ... (a hat on the last two axes of a non-standard pad). A default list per kind of controller
 *    (the W3C "standard" layout; a single Joy-Con, which iPhone reports with an empty mapping), replaced per controller id
 *    by the player's own on Settings -> 手柄 (tap a key, press a button). Keyboard-type remotes (page turners) bind a key.
 *    Stored in data/users/local/gamepad {v:1, maps:{<id>:{up:[...], ...}}, keys:{<key>:<lo-pda key>}}, so the backup
 *    carries it.
 * 3. A readout for the phone test: a strip at the top with each controller's id, mapping, held indices and axes.
 *    It opens on a controller, on a remote-only key, or with ?padtest. Tap it to fold.
 */
(function(){
  "use strict";
  var LP=window.LP; if(!LP) return;
  var $=LP.$, HAS=!!navigator.getGamepads;
  function tr(k,v){ return LP.tr ? LP.tr(k,v) : k; }
  var KEYS=["up","down","left","right","a","b","start","select"];
  var DOC="data/users/local/gamepad";
  var store={maps:{}, keys:{}}, ref=null;
  var held={}, running=false, seen={}, keylog=[];

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
    }
    if(/Joy-?Con \((L|R)\)/i.test(gp.id) && gp.mapping!=="standard"){
      /* a single Joy-Con held sideways: the iPhone reports its four face keys as 0-3 with an empty mapping (test,
         2026-11-27: with 1,3 -> A the A/B came out swapped); the stick is axes 0/1 */
      m.a=["b0","b2"]; m.b=["b1","b3"];
    }
    return m;
  }
  function mapFor(gp){ var own=store.maps[gp.id]; return own ? own : defaults(gp); }

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
    if((m=/^hat-([xy])([+-])$/.exec(s))) return "hat "+m[1]+m[2];
    if((m=/^key:(.+)$/.exec(s))) return m[1];
    return s;
  }

  /* ---------- the loop ---------- */
  function padShown(){ var g=$("gamepad"); return !!g && !g.hidden; }
  function pads(){ return HAS ? (navigator.getGamepads()||[]) : []; }
  function tick(){
    if(!running) return;
    var list=pads(), now={}, any=false;
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp || !gp.connected) continue; any=true; if(!cap) wants(gp,now); }
    var route=padShown();
    KEYS.forEach(function(k){
      var on=route && !!now[k];
      if(on!==!!held[k]){ held[k]=on; LP.setButton(k,on); }
    });
    if(cap) capture(list);
    if(pageOpen()) livePage(list);
    draw(list);
    if(any || Object.keys(seen).length) requestAnimationFrame(tick); else running=false;
  }
  function start(){ if(running || document.hidden || !HAS) return; running=true; requestAnimationFrame(tick); }
  function letGo(){ KEYS.forEach(function(k){ if(held[k]){ held[k]=false; LP.setButton(k,false); } }); }

  window.addEventListener("gamepadconnected",function(e){
    seen[e.gamepad.index]=true;
    LP.toast(tr("pad.connected"));
    ensureBar(); start(); if(pageOpen()) renderPage();
  });
  window.addEventListener("gamepaddisconnected",function(e){
    delete seen[e.gamepad.index]; letGo();
    LP.toast(tr("pad.gone"));
    draw(pads()); if(pageOpen()) renderPage();
  });
  document.addEventListener("visibilitychange",function(){ if(document.hidden){ running=false; letGo(); } else if(Object.keys(seen).length) start(); });
  window.addEventListener("blur",letGo);

  /* ---------- keyboard-type remotes: keys bound on the page (core.js keeps its own arrows / X / Z / Enter / Shift) ---------- */
  var REMOTE=/^(PageUp|PageDown|AudioVolume|Media|Camera|BrowserBack|BrowserForward)/;
  var keyHeld={};
  function typing(t){ return t && (/INPUT|TEXTAREA/.test(t.nodeName) || t.isContentEditable); }
  document.addEventListener("keydown",function(e){
    keylog.unshift((e.key||"?")+"/"+(e.code||"?")); keylog.length=Math.min(keylog.length,6);
    if(REMOTE.test(e.key||"")) ensureBar();
    draw(pads());
    if(cap && !typing(e.target)){ e.preventDefault(); e.stopPropagation(); bindKey(e.key); return; }
    var b=store.keys[e.key];
    if(b && padShown() && !typing(e.target)){ e.preventDefault(); e.stopPropagation(); if(!keyHeld[e.key]){ keyHeld[e.key]=true; LP.setButton(b,true); } }
  },true);
  document.addEventListener("keyup",function(e){
    var b=store.keys[e.key];
    if(b && keyHeld[e.key]){ keyHeld[e.key]=false; LP.setButton(b,false); }
  },true);

  /* ---------- stored bindings ---------- */
  function docRef(){ if(!ref && LP.S && LP.S.db) ref=LP.S.db.doc(DOC); return ref; }
  function load(){
    var r=docRef(); if(!r) return;
    r.get().then(function(sn){
      var d=sn.exists ? sn.data() : null;
      if(d && d.maps && typeof d.maps==="object") store.maps=d.maps;
      if(d && d.keys && typeof d.keys==="object") store.keys=d.keys;
      if(pageOpen()) renderPage();
    }).catch(function(){});
  }
  function save(){ var r=docRef(); if(r) LP.put(r,{v:1, maps:store.maps, keys:store.keys}); }
  /* the store opens during boot; try until it is there */
  (function wait(n){ if(docRef()) load(); else if(n>0) setTimeout(function(){ wait(n-1); },300); })(40);

  /* ---------- Settings -> 手柄: tap a key, then press what should be that key ---------- */
  var cap=null;   /* {key, base:{<index>:{buttons, axes}}, until} while waiting for a press */
  function pageOpen(){ var v=$("v-set-pad"); return !!v && !v.hidden; }
  function firstPad(){ var l=pads(); for(var i=0;i<l.length;i++) if(l[i] && l[i].connected) return l[i]; return null; }
  function snapshot(list){
    var base={};
    for(var i=0;i<list.length;i++){ var gp=list[i]; if(!gp) continue;
      base[gp.index]={buttons:gp.buttons.map(pressed), axes:(gp.axes||[]).slice()}; }
    return base;
  }
  function arm(key){
    cap={key:key, base:snapshot(pads()), until:Date.now()+6000};
    start(); renderPage();
  }
  function capture(list){
    if(Date.now()>cap.until){ cap=null; renderPage(tr("pad.timeout")); return; }
    for(var i=0;i<list.length;i++){
      var gp=list[i]; if(!gp || !gp.connected) continue;
      var base=cap.base[gp.index];
      if(!base){ cap.base[gp.index]=snapshot([gp])[gp.index]; continue; }
      for(var b=0;b<gp.buttons.length;b++) if(pressed(gp.buttons[b]) && !base.buttons[b]) return bindPad(gp,"b"+b);
      var ax=gp.axes||[];
      for(var a=0;a<ax.length;a++){
        var d=ax[a]-(base.axes[a]||0);
        if(Math.abs(d)>0.6) return bindPad(gp,"a"+a+(ax[a]>0?"+":"-"));
      }
    }
  }
  function bindPad(gp,src){
    var key=cap.key; cap=null;
    var m=store.maps[gp.id] || defaults(gp), copy={};
    KEYS.forEach(function(k){ copy[k]=(m[k]||[]).filter(function(s){ return s!==src; }); });
    copy[key]=[src];   /* the press replaces what the key had, so a key is never two things by accident */
    /* a stick bound to a direction brings its opposite along, so up/down or left/right stay one stick */
    var am=/^a(\d+)([+-])$/.exec(src), opp={up:"down",down:"up",left:"right",right:"left"}[key];
    if(am && opp){ var o="a"+am[1]+(am[2]==="+"?"-":"+"); KEYS.forEach(function(k){ copy[k]=copy[k].filter(function(s){ return s!==o; }); }); copy[opp]=[o]; }
    store.maps[gp.id]=copy; save();
    LP.sfx("ok"); renderPage(tr("pad.bound",{key:keyName(key), src:srcText(src)}));
  }
  function bindKey(k){
    var key=cap.key; cap=null;
    if(!k || k==="Escape"){ renderPage(); return; }
    Object.keys(store.keys).forEach(function(x){ if(store.keys[x]===key) delete store.keys[x]; });
    store.keys[k]=key; save();
    LP.sfx("ok"); renderPage(tr("pad.bound",{key:keyName(key), src:k}));
  }
  function keyName(k){ return tr("pad.k."+k); }

  function renderPage(msg){
    var list=$("set-pad-list"); if(!list) return;
    var gp=firstPad();
    $("set-pad-who").textContent=gp ? gp.id+" · mapping="+(gp.mapping||"-") : tr("pad.none");
    list.textContent="";
    KEYS.forEach(function(k){
      var li=document.createElement("li");
      var btn=document.createElement("button"); btn.type="button"; btn.className="set-open set-pad-row";
      var name=document.createElement("span"); name.className="set-label"; name.textContent=keyName(k);
      var state=document.createElement("span"); state.className="set-state";
      if(cap && cap.key===k) state.textContent=tr("pad.press");
      else {
        var srcs=gp ? (mapFor(gp)[k]||[]).filter(function(s){ return !/^hat/.test(s); }).map(srcText) : [];
        Object.keys(store.keys).forEach(function(x){ if(store.keys[x]===k) srcs.push(x); });
        state.textContent=srcs.length ? srcs.join(" / ") : "-";
      }
      btn.appendChild(name); btn.appendChild(state);
      btn.onclick=function(){ LP.sfx("tap"); if(cap && cap.key===k){ cap=null; renderPage(); } else arm(k); };
      li.appendChild(btn); list.appendChild(li);
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
  /* settings.js owns the page's way in and out (openSettings is its own); this file fills it */
  LP.padPage={
    open:function(){ cap=null; renderPage(); start(); },
    close:function(){ cap=null; }
  };
  if($("set-pad-reset")) $("set-pad-reset").onclick=function(){
    LP.sfx("tap"); cap=null;
    var gp=firstPad(); if(gp) delete store.maps[gp.id];
    store.keys={}; save(); renderPage(tr("pad.reset.done"));
  };

  /* ---------- the test readout ---------- */
  var bar=null, folded=false;
  function mode(){
    var sa=(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone===true;
    return sa ? "standalone" : "browser";
  }
  function ensureBar(){
    if(bar || !document.body) return;
    bar=document.createElement("pre");
    bar.id="pad-readout";
    bar.style.cssText="position:fixed;left:0;right:0;top:0;z-index:999;margin:0;padding:4px 8px;max-height:45vh;overflow:auto;"+
      "background:#a3ad7e;color:#1f2a14;border-bottom:2px solid #1f2a14;font:12px/1.3 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all";
    bar.addEventListener("click",function(){ folded=!folded; draw(pads()); });
    document.body.appendChild(bar);
  }
  function draw(list){
    if(!bar) return;
    var lines=["[pad test] runtime "+LP.RUNTIME_VERSION+" | "+mode()+" | chin pad "+(padShown()?"on":"off")+" | tap to "+(folded?"open":"fold")];
    if(!folded){
      var n=0;
      for(var i=0;i<list.length;i++){
        var gp=list[i]; if(!gp) continue; n++;
        var down=[]; for(var b=0;b<gp.buttons.length;b++) if(pressed(gp.buttons[b])) down.push(b);
        var ax=[]; for(var a=0;a<(gp.axes||[]).length;a++) ax.push(gp.axes[a].toFixed(2));
        var keys=[], w={}; wants(gp,w); for(var k in w) keys.push(k);
        lines.push("#"+gp.index+" "+gp.id+(store.maps[gp.id]?" (own map)":""));
        lines.push("  mapping="+(gp.mapping||"(empty)")+" buttons="+gp.buttons.length+" axes="+(gp.axes||[]).length+" connected="+gp.connected);
        lines.push("  held: ["+down.join(",")+"]  axes: ["+ax.join(", ")+"]");
        lines.push("  -> Lo-PDA: "+(keys.length?keys.join(" "):"-"));
      }
      if(!n) lines.push("no controller listed yet: press a button on it");
      if(keylog.length) lines.push("keys (key/code): "+keylog.join("  "));
    }
    bar.textContent=lines.join("\n");
  }
  if(/[?&]padtest\b/.test(location.search)){
    var open=function(){ ensureBar(); draw(pads()); };
    if(document.body) open(); else document.addEventListener("DOMContentLoaded",open);
  }
})();
