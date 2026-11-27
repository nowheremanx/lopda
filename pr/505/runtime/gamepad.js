/*
 * Lo-PDA runtime: Bluetooth game controllers (Gamepad API) as the chin pad's eight keys.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * TEST BUILD (controller feasibility check, not for merging as it is). Two parts:
 * 1. The layer: while a controller is connected and the page is visible, poll navigator.getGamepads() once a frame and
 *    turn its changes into LP.setButton(b, down), the same entry the on-screen keys and the keyboard use. So every
 *    built-in with the chin pad and every store app with "buttons": true gets the controller with no change of its own.
 *    Only while the chin pad shows, like the keyboard (core.js padOn()).
 * 2. A readout for the phone test: a strip at the top of the page with each controller's id, mapping, the button
 *    indices held, the axes and the last keys a keyboard-type remote sent. Tap it to fold or open it.
 *
 * Mapping (the "standard" layout, by position: on the old handheld A sits right, B left of it):
 *   12-15 D-pad, left stick past 0.5 too | 1 right and 3 top -> A | 0 bottom and 2 left -> B | 9 -> START | 8 -> SELECT
 * A controller that is not "standard" (Android Chrome knows no Nintendo pad) uses the same indices and its first two
 * axes and the hat axes for the cross; the readout shows what it really sends.
 */
(function(){
  "use strict";
  var LP=window.LP; if(!LP || !navigator.getGamepads) return;
  function tr(k){ return LP.tr ? LP.tr(k) : k; }
  var BTN={12:"up",13:"down",14:"left",15:"right",1:"a",3:"a",0:"b",2:"b",9:"start",8:"select"};
  var held={};            /* Lo-PDA key -> true while some controller holds it */
  var running=false, seen={}, keylog=[];
  var bar=null, folded=false;

  function padShown(){ var g=document.getElementById("gamepad"); return !!g && !g.hidden; }
  function pressed(b){ return !!b && (b.pressed || b.value>0.5); }

  /* what one controller holds now, as Lo-PDA keys */
  function wants(gp, out){
    for(var i=0;i<gp.buttons.length;i++) if(BTN[i] && pressed(gp.buttons[i])) out[BTN[i]]=true;
    var ax=gp.axes||[], x=ax[0]||0, y=ax[1]||0;
    if(x<-0.5) out.left=true; if(x>0.5) out.right=true;
    if(y<-0.5) out.up=true; if(y>0.5) out.down=true;
    if(gp.mapping!=="standard" && ax.length>=4){
      /* raw pads often put the D-pad on a hat: the last two axes, each -1, 0 or 1 (Android HAT_X / HAT_Y) */
      var hx=ax[ax.length-2], hy=ax[ax.length-1];
      if(Math.abs(hx-Math.round(hx))<0.05 && Math.abs(hy-Math.round(hy))<0.05){
        if(hx<-0.5) out.left=true; if(hx>0.5) out.right=true;
        if(hy<-0.5) out.up=true; if(hy>0.5) out.down=true;
      }
    }
  }

  function tick(){
    if(!running) return;
    var pads=navigator.getGamepads()||[], now={}, any=false;
    for(var i=0;i<pads.length;i++){ var gp=pads[i]; if(!gp || !gp.connected) continue; any=true; wants(gp,now); }
    var route=padShown();
    ["up","down","left","right","a","b","start","select"].forEach(function(k){
      var on=route && !!now[k];
      if(on!==!!held[k]){ held[k]=on; LP.setButton(k,on); }
    });
    draw(pads);
    if(any || Object.keys(seen).length) requestAnimationFrame(tick); else running=false;
  }
  function start(){ if(running || document.hidden) return; running=true; requestAnimationFrame(tick); }
  function letGo(){ Object.keys(held).forEach(function(k){ if(held[k]){ held[k]=false; LP.setButton(k,false); } }); }

  window.addEventListener("gamepadconnected",function(e){
    var gp=e.gamepad; seen[gp.index]=true;
    LP.toast(tr("pad.connected"));
    ensureBar(); start();
  });
  window.addEventListener("gamepaddisconnected",function(e){
    delete seen[e.gamepad.index]; letGo();
    LP.toast(tr("pad.gone"));
    draw(navigator.getGamepads()||[]);
  });
  document.addEventListener("visibilitychange",function(){ if(document.hidden){ running=false; letGo(); } else if(Object.keys(seen).length) start(); });
  window.addEventListener("blur",letGo);

  /* keyboard-type remotes (page turners, selfie shutters): log what reaches the page */
  document.addEventListener("keydown",function(e){
    keylog.unshift((e.key||"?")+"/"+(e.code||"?")); keylog.length=Math.min(keylog.length,6);
    ensureBar(); draw(navigator.getGamepads()||[]);
  },true);

  /* ---------- the test readout ---------- */
  function mode(){
    var sa=(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone===true;
    return sa ? "standalone" : "browser";
  }
  function ensureBar(){
    if(bar) return;
    bar=document.createElement("pre");
    bar.id="pad-readout";
    bar.style.cssText="position:fixed;left:0;right:0;top:0;z-index:999;margin:0;padding:4px 8px;max-height:45vh;overflow:auto;"+
      "background:#a3ad7e;color:#1f2a14;border-bottom:2px solid #1f2a14;font:12px/1.3 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all";
    bar.addEventListener("click",function(){ folded=!folded; draw(navigator.getGamepads()||[]); });
    document.body.appendChild(bar);
  }
  function draw(pads){
    if(!bar) return;
    var lines=["[pad test] runtime "+LP.RUNTIME_VERSION+" | "+mode()+" | chin pad "+(padShown()?"on":"off")+" | tap to "+(folded?"open":"fold")];
    if(!folded){
      var n=0;
      for(var i=0;i<pads.length;i++){
        var gp=pads[i]; if(!gp) continue; n++;
        var down=[]; for(var b=0;b<gp.buttons.length;b++) if(pressed(gp.buttons[b])) down.push(b);
        var ax=[]; for(var a=0;a<(gp.axes||[]).length;a++) ax.push(gp.axes[a].toFixed(2));
        var keys=[]; var w={}; wants(gp,w); for(var k in w) keys.push(k);
        lines.push("#"+gp.index+" "+gp.id);
        lines.push("  mapping="+(gp.mapping||"(empty)")+" buttons="+gp.buttons.length+" axes="+(gp.axes||[]).length+" connected="+gp.connected);
        lines.push("  held: ["+down.join(",")+"]  axes: ["+ax.join(", ")+"]");
        lines.push("  -> Lo-PDA: "+(keys.length?keys.join(" "):"-"));
      }
      if(!n) lines.push("no controller listed yet: press a button on it");
      if(keylog.length) lines.push("keys (key/code): "+keylog.join("  "));
    }
    bar.textContent=lines.join("\n");
  }
})();
