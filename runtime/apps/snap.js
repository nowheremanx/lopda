/*
 * Lo-PDA runtime: the viewfinder an app opens with PAD.camera.snap (docs/decisions.md section 28). It is the runtime's own,
 * over the running app: the camera program's look (runtime/finder.js) and lenses (runtime/lenses.js, LP.film), the player
 * presses the shutter, and the app gets one small four-tone picture. Nothing is kept: no latent image, no file, no roll.
 * The dialog that asks first, the grants and the bar live with the other app requests in apps/store.js.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * LP.snap:
 *   supported()          this page can open a camera at all (HTTPS and getUserMedia)
 *   systemOk()           the phone has already allowed a camera since the page opened: no tap of the runtime's own is needed
 *   open({name, size, owner, done})   call inside a tap of the runtime's own, or once systemOk(): getUserMedia starts here.
 *                        name: the app's name for the title line; size "small" | "large"; owner() -> false once the app
 *                        is not in front any more; done({w, h, px} | null) is called exactly once
 *   cancel()             close with null (B, HOME, another program, the app gone, the page hidden)
 *   isOpen()
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr, sfx=LP.sfx, toast=LP.toast, TONES=LP.TONES;
var FINDER=window.LopdaFinder, LENS=window.LopdaLenses;
/* the safety net looks every quarter second, like the sensors' (decisions.md section 23) */
var WATCH_MS=250;
var SN={req:null, stream:null, gen:0, raf:0, last:0, watch:null, lens:"w", lenses:null, exposure:0, contrast:0,
  swapping:0, swapTimer:null, systemOk:false, padWas:false, blink:null};
var cv=$("snap-cv"), ctx=cv.getContext("2d"), img=ctx.createImageData(cv.width,cv.height);
var grab=FINDER.grabber();

function supported(){ return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
/* the lenses the snap found itself, else the ones the camera program found, else the plain back / front pair */
function lenses(){ return SN.lenses || (LP.film && LP.film.lenses()) || null; }
function lensNow(){ return LENS.pick(lenses(),SN.lens); }
function stopTracks(s){ if(s) try{ s.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){} }
function capsOf(d){ try{ return d && typeof d.getCapabilities==="function" ? d.getCapabilities() : null; }catch(e){ return null; } }

/* write tone indices into the finder: putImageData only (Safari swaps red and blue when a canvas is drawn onto a canvas) */
function draw(px){
  var d=img.data;
  for(var i=0;i<px.length;i++){ var t=TONES[px[i]]; d[i*4]=t[0]; d[i*4+1]=t[1]; d[i*4+2]=t[2]; d[i*4+3]=255; }
  ctx.putImageData(img,0,0);
}
/* the lens cap: dark until the first picture comes */
function idle(){ draw(new Uint8Array(cv.width*cv.height).fill(1)); }
function render(){
  if(!SN.req) return;
  var sg=function(v){ return (v>0?"+":v<0?"−":"±")+Math.abs(v); };
  $("snap-who").textContent=tr("snap.who",{name:SN.req.o.name});
  $("snap-exp").textContent=tr("cam.exp",{b:sg(SN.exposure), c:sg(SN.contrast)});
  $("snap-lens").hidden=!SN.stream;
  $("snap-lens").textContent=LP.film.lensName(lensNow());
}
/* the finder as large as the box allows, 8:7, whole CSS pixels */
function layout(){
  if($("snap").hidden) return;
  var box=$("snap-box"), f=$("snap-finder"); if(!box.clientWidth) return;
  var w=box.clientWidth-16, h=box.clientHeight-16, k=Math.min(w/128,h/112);
  f.style.width=Math.floor(128*k)+"px"; f.style.height=Math.floor(112*k)+"px";
}
if(window.ResizeObserver) new ResizeObserver(function(){ layout(); }).observe($("snap-box"));
window.addEventListener("resize",layout);

function open(o){
  if(SN.req){ o.done(null); return; }
  var size=FINDER.SIZES[o.size] || FINDER.SIZES.small;
  clearTimeout(SN.blink); $("snap-shut").hidden=true;
  SN.req={o:o, w:size.w, h:size.h};
  SN.exposure=0; SN.contrast=0;
  if(cv.width!==size.w || cv.height!==size.h){ cv.width=size.w; cv.height=size.h; img=ctx.createImageData(size.w,size.h); }
  idle();
  $("snap").hidden=false;
  /* the camera's keys: the chin pad shows while the finder is open, whatever the app asked for */
  SN.padWas=!$("gamepad").hidden; LP.showPad(true);
  render(); layout();
  /* whatever way the app left the front (HOME, another program, closed, removed, its frame gone), the next look lets go */
  SN.watch=setInterval(function(){ if(SN.req && !SN.req.o.owner()) cancel(); },WATCH_MS);
  startStream();
}
/* getUserMedia runs at once, inside the tap that opened the finder (or the SELECT that changed the lens) */
function startStream(){
  var gen=++SN.gen, L=lensNow(), p;
  try{ p=navigator.mediaDevices.getUserMedia(LP.film.videoFor(L)); }catch(e){ p=Promise.reject(e); }
  Promise.resolve(p).then(function(stream){
    if(gen!==SN.gen || !SN.req){ stopTracks(stream); return; }
    SN.systemOk=true; SN.stream=stream;
    var v=$("snap-video"); v.srcObject=stream; var pl=v.play(); if(pl && pl.catch) pl.catch(function(){});
    SN.last=0; SN.raf=requestAnimationFrame(tick);
    if(!lenses()) findLenses(gen);
    render();
  },function(e){
    if(gen!==SN.gen || !SN.req) return;
    /* a lens the list remembered is gone: the plain back / front pair, once */
    if(L.deviceId && e && (e.name==="OverconstrainedError" || e.name==="NotFoundError")){ SN.lenses=LENS.FALLBACK; SN.lens="w"; startStream(); return; }
    toast(tr("snap.none")); sfx("err"); finish(null);
  });
}
/* names come once the camera is allowed: read the list, never open the other cameras while this one runs */
function findLenses(gen){
  var md=navigator.mediaDevices; if(!md.enumerateDevices) return;
  md.enumerateDevices().then(function(ds){
    if(gen!==SN.gen) return;
    var found=LENS.identify(ds.filter(function(d){ return d.kind==="videoinput"; }).map(function(d){ return {deviceId:d.deviceId, label:d.label, caps:capsOf(d)}; }));
    if(found){ SN.lenses=found; render(); }
  }).catch(function(){});
}
/* about 12 pictures a second, the camera program's rate */
function tick(t){
  if(!SN.stream) return;
  SN.raf=requestAnimationFrame(tick);
  if(t-SN.last<80) return;
  SN.last=t;
  var v=$("snap-video");
  if(v.readyState<2 || !v.videoWidth) return;
  draw(frame(v));
  if(SN.swapping && Date.now()>=SN.swapping) endSwap();
}
function frame(v){
  var r=SN.req;
  return FINDER.ditherLuma(grab(v,v.videoWidth,v.videoHeight,r.w,r.h,lensNow().id==="f"),r.w,r.h,SN.exposure,SN.contrast);
}
function shoot(){
  var v=$("snap-video");
  if(!SN.req || !SN.stream || SN.swapping || v.readyState<2 || !v.videoWidth) return;
  var r=SN.req, px=frame(v);
  /* the shutter: the sound, the finder blinks dark, and it closes */
  sfx("shutter"); draw(px); $("snap-shut").hidden=false;
  finish({w:r.w, h:r.h, px:px},160);
}
function cancel(){ finish(null); }
/* every way out ends here: the stream stops at once, the app hears once */
function finish(v,linger){
  var r=SN.req; if(!r) return;
  SN.req=null; SN.gen++;
  cancelAnimationFrame(SN.raf); clearInterval(SN.watch); SN.watch=null;
  clearTimeout(SN.swapTimer); SN.swapping=0;
  stopTracks(SN.stream); SN.stream=null;
  $("snap-video").srcObject=null;
  var close=function(){ $("snap").hidden=true; $("snap-shut").hidden=true; };
  clearTimeout(SN.blink);
  if(linger) SN.blink=setTimeout(close,linger); else close();
  LP.releaseButtons(); LP.showPad(SN.padWas);
  r.o.done(v);
}
/* SELECT: the next lens. The finder goes dark until the new lens gives a picture, as in the camera program */
function nextLens(){
  if(!SN.stream || SN.swapping) return;
  SN.lens=LENS.next(lenses(),SN.lens).id; sfx("tap");
  $("snap-shut").hidden=false; SN.swapping=Date.now()+160;
  clearTimeout(SN.swapTimer); SN.swapTimer=setTimeout(endSwap,2500);
  cancelAnimationFrame(SN.raf); stopTracks(SN.stream); SN.stream=null;
  render(); startStream();
}
function endSwap(){ SN.swapping=0; clearTimeout(SN.swapTimer); $("snap-shut").hidden=true; }
function setExposure(v){ v=Math.max(-3,Math.min(3,v)); if(v===SN.exposure) return; SN.exposure=v; sfx("tick"); render(); }
function setContrast(v){ v=Math.max(-3,Math.min(3,v)); if(v===SN.contrast) return; SN.contrast=v; sfx("tick"); render(); }

$("snap-ok").onclick=function(){ shoot(); };
$("snap-no").onclick=function(){ if(SN.req){ sfx("miss"); cancel(); } };
/* keys as in the camera program: A shutter, SELECT the next lens, up / down exposure, left / right contrast, B cancels.
   While the finder is open it has every key; nothing reaches the app */
LP.padRoute("snap",function(b,down){
  if(!SN.req) return false;
  if(!down) return true;
  if(b==="a") shoot();
  else if(b==="b"){ sfx("miss"); cancel(); }
  else if(b==="select") nextLens();
  else if(b==="up") setExposure(SN.exposure+1); else if(b==="down") setExposure(SN.exposure-1);
  else if(b==="right") setContrast(SN.contrast+1); else if(b==="left") setContrast(SN.contrast-1);
  return true;
});
/* locked, another app, the page going away: the camera lets go and the app gets null; nothing comes back */
document.addEventListener("visibilitychange",function(){ if(document.hidden) cancel(); });
window.addEventListener("pagehide",cancel);

LP.snap={supported:supported, systemOk:function(){ return SN.systemOk; }, open:open, cancel:cancel, isOpen:function(){ return !!SN.req; }};
LP.builtin({id:"snap", lang:function(){ render(); }, padLayout:function(){ layout(); }});
})();
