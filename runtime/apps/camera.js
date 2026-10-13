/*
 * Lo-PDA built-in: the pixel camera. Viewfinder, rolls of film, the developed strip and the
 * contact-sheet card. The film helpers are shared with the cutter as LP.film.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var TONES=LP.TONES, BAYER=LP.BAYER, own=LP.own, toast=LP.toast, put=LP.put, pad2=LP.pad2, sfx=LP.sfx, show=LP.show, showPad=LP.showPad,
  saveCanvas=LP.saveCanvas, saveErr=LP.saveErr;

/* ---------- pixel camera: a roll of film. Frames are fixed once taken; a full roll is developed out. ---------- */
var CW=128, CH=112;
var F={roll:null, size:12, res:1, tint:"lcd", loaded:0, exposure:0, contrast:0, date:true, frames:[], ready:false};
var ccv=$("cam-cv"), cctx=ccv.getContext("2d"), cimg=cctx.createImageData(CW,CH);
/* film stock: 1 = 128x112 standard, 2 = 256x224 fine grain. Fixed for the life of a roll. */
/* film tints: the four tones a roll develops in. The handheld's own screen always stays green. */
/* name: the Chinese tint name, kept as data; it is printed on film output in zh mode only */
var TINTS={
  lcd:   {name:"绿屏", en:"LCD",    tones:[[31,42,20],[74,90,50],[125,138,88],[163,173,126]]},
  sepia: {name:"暖褐", en:"SEPIA",  tones:[[43,29,20],[107,74,50],[168,128,90],[230,210,176]]},
  sakura:{name:"樱粉", en:"SAKURA", tones:[[58,31,43],[138,74,99],[212,138,163],[246,219,227]]},
  cyano: {name:"晒蓝", en:"CYANO",  tones:[[16,36,58],[47,92,134],[111,159,196],[214,230,240]]},
  mono:  {name:"黑白", en:"MONO",   tones:[[27,27,27],[90,90,90],[158,158,158],[232,230,225]]}
};
var TINT_ORDER=["lcd","sepia","sakura","cyano","mono"];
function tintOf(id){ return TINTS[id]||TINTS.lcd; }
/* the tint as the screen calls it: Chinese name in zh, the English one in en */
function tintLabel(id){ var T=tintOf(id); return I18N.lang==="zh"?T.name:T.en; }
/* the tint as film output prints it: "SAKURA 樱粉" in zh, "SAKURA" in en */
function tintPrint(id){ var T=tintOf(id); return I18N.lang==="zh"?T.en+" "+T.name:T.en; }
var nextTint="lcd";
function setRes(r){ r=r===2?2:1; F.res=r; CW=128*r; CH=112*r; ccv.width=CW; ccv.height=CH; cimg=cctx.createImageData(CW,CH); }
function stockName(r){ return tr(r===2?"cam.stock2":"cam.stock1"); }
function filmDoc(){ return {roll:F.roll,size:F.size,res:F.res,tint:F.tint,loaded:F.loaded,exposure:F.exposure,contrast:F.contrast,date:F.date,lens:LIVE.lens}; }
var nextStock=1, nextSize=12;
function drawPx(ctx,img,px){
  var d=img.data;
  for(var i=0;i<px.length;i++){ var t=TONES[px[i]]; d[i*4]=t[0]; d[i*4+1]=t[1]; d[i*4+2]=t[2]; d[i*4+3]=255; }
  ctx.putImageData(img,0,0);
}
function lumaOf(img,w,h){
  var ar=w/h, iw=img.naturalWidth, ih=img.naturalHeight, sw=iw, sh=iw/ar;
  if(sh>ih){ sh=ih; sw=ih*ar; }
  var c=document.createElement("canvas"); c.width=w; c.height=h;
  var x=c.getContext("2d"); x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high";
  x.drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,0,0,w,h);
  var d=x.getImageData(0,0,w,h).data, lum=new Float32Array(w*h);
  for(var i=0;i<lum.length;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255;
  return lum;
}
function ditherLuma(lum,w,h,exposure,contrast){
  var hist=new Uint32Array(256), N=lum.length;
  for(var q=0;q<N;q++) hist[Math.min(255,Math.max(0,(lum[q]*255)|0))]++;
  var pct=function(f){ var want=N*f, acc=0; for(var b=0;b<256;b++){ acc+=hist[b]; if(acc>want) return b/255; } return 1; };
  var lo=pct(0.02), hi=pct(0.98), span=Math.max(0.05,hi-lo);
  var out=new Uint8Array(w*h), gain=Math.pow(1.35,exposure);
  for(var y=0;y<h;y++) for(var x=0;x<w;x++){
    var k=y*w+x, v=(lum[k]-lo)/span;
    var nb=0,n=0; if(x>0){nb+=lum[k-1];n++} if(x<w-1){nb+=lum[k+1];n++} if(y>0){nb+=lum[k-w];n++} if(y<h-1){nb+=lum[k+w];n++}
    v+= ((lum[k]-nb/n)/span)*0.6;
    if(contrast) v=0.5+(v-0.5)*Math.pow(1.3,contrast);
    v=Math.pow(Math.max(0,Math.min(1,v)),1/gain);
    var t=(BAYER[(y%4)*4+(x%4)]+0.5)/16-0.5;
    out[k]=Math.max(0,Math.min(3,Math.round(v*3+t)));
  }
  return out;
}
function pxFromString(str){ var px=new Uint8Array(str.length); for(var i=0;i<str.length;i++) px[i]=str.charCodeAt(i)-48; return px; }
function stampOf(ts){ var d=new Date(ts); return String(d.getFullYear()).slice(2)+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0")+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function fileStamp(ts){ var d=new Date(ts); return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate()); }
function rollFull(){ return F.roll && F.frames.length>=F.size; }
function frameStamp(fr){ return fr.blank==="dark" ? tr("cam.unexposed") : fr.blank==="light" ? tr("cam.fogged") : stampOf(fr.taken); }

function camIdle(){
  var px=new Uint8Array(CW*CH);
  for(var y=0;y<CH;y++) for(var x=0;x<CW;x++){ var band=Math.floor(x/(CW/4)); px[y*CW+x]= (y>CH*0.78) ? ((x>>3)+(y>>3))%2*3 : band; }
  drawPx(cctx,cimg,px);
}

function renderCam(){
  var has=!!F.roll, full=rollFull();
  $("cam-count").textContent= has ? pad2(Math.min(F.frames.length+(full?0:1),F.size))+"/"+pad2(F.size) : "--/--";
  $("cam-film").textContent= has ? tr("cam.lcd",{en:tintOf(F.tint).en, name:tintOf(F.tint).name, stock:tr(F.res===2?"cam.stock.s2":"cam.stock.s1")}) : tr(F.ready?"cam.nofilm":"cam.reading");
  var sg=function(v){ return (v>0?"+":v<0?"−":"±")+Math.abs(v); };
  $("cam-exp").textContent=tr("cam.exp",{b:sg(F.exposure), c:sg(F.contrast)});
  $("cam-date").className=F.date?"":"off";
  var shooting=has && !full;
  ["cam-shutter","ck-dark","ck-bright"].forEach(function(id){ $(id).disabled=!shooting; });
  if(F.ready && !has && CAM.mode!=="load") camSheet("load");
  else if(has && full && CAM.mode!=="menu") camMenu("develop");
  else if(has && !full && CAM.mode==="load") camSheet(null);
  camModeLabel(); camLayout();
}

/* date back: a 3x5 digit font burned into the lower right corner, like a quartz-date camera */
var DIGITS={"0":"111101101101111","1":"010110010010111","2":"111001111100111","3":"111001111001111","4":"101101111001001","5":"111100111001111","6":"111100111101111","7":"111001010010010","8":"111101111101111","9":"111101111001111","'":"1100","-":"000000111000000"};
function burnDate(px,w,h,ts,s){
  var d=new Date(ts), text="'"+String(d.getFullYear()).slice(2)+" "+pad2(d.getMonth()+1)+" "+pad2(d.getDate());
  var glyphs=[], width=0;
  text.split("").forEach(function(ch){ var gw = ch==="'" ? 1 : ch===" " ? 2 : 3; glyphs.push([ch,gw]); width+=gw+1; });
  width-=1;
  var x0=w-(4+width)*s, y0=h-(4+5)*s, lit=[];
  var cx=0;
  glyphs.forEach(function(g){
    var bits=DIGITS[g[0]];
    if(bits) for(var r=0;r<5;r++) for(var c=0;c<g[1];c++){ if(bits[r*g[1]+c]==="1") lit.push([cx+c,r]); }
    cx+=g[1]+1;
  });
  var plot=function(ux,uy,tone){ for(var a=0;a<s;a++) for(var b=0;b<s;b++){ var X=x0+ux*s+a, Y=y0+uy*s+b; if(X>=0&&Y>=0&&X<w&&Y<h) px[Y*w+X]=tone; } };
  /* light digits with a shadow on dark ground, dark digits on light ground */
  var sum=0,cnt=0;
  for(var yy=y0;yy<y0+5*s;yy++) for(var xx=x0;xx<x0+width*s;xx++){ if(xx>=0&&yy>=0&&xx<w&&yy<h){ sum+=px[yy*w+xx]; cnt++; } }
  if(cnt && sum/cnt>=1.6){ lit.forEach(function(p){ plot(p[0],p[1],0); }); }
  else { lit.forEach(function(p){ plot(p[0]+1,p[1]+1,0); }); lit.forEach(function(p){ plot(p[0],p[1],3); }); }
}
function toggleDate(){
  F.date=!F.date; renderCam(); saveFilmSoon();
}
function saveFilmSoon(){ if(S.db && F.roll){ clearTimeout(expTimer); expTimer=setTimeout(function(){ put(S.refs.film,filmDoc()); },800); } }

/* exposure is a setting for the next frame, never an edit of a taken one */
var expTimer=null;
function setExposure(v){ v=LoClamp(v,-3,3); if(v===F.exposure) return; F.exposure=v; sfx("tick"); renderCam(); saveFilmSoon(); }
function setContrast(v){ v=LoClamp(v,-3,3); if(v===F.contrast) return; F.contrast=v; sfx("tick"); renderCam(); saveFilmSoon(); }
function LoClamp(v,a,b){ return v<a?a:v>b?b:v; }
$("ck-dark").onclick=function(){ setExposure(F.exposure-1); };
$("ck-bright").onclick=function(){ setExposure(F.exposure+1); };
$("ck-menu").onclick=function(){ if(F.roll && !rollFull()) camMenu("body"); };

function loadRoll(){
  setRes(nextStock); F.tint=nextTint; F.contrast=0; F.exposure=0;
  F.roll="r"+Date.now().toString(36); F.size=nextSize; F.loaded=Date.now(); F.frames=[];
  if(S.db) put(S.refs.film,filmDoc());
  /* the door closes, the film is wound on to frame 1 */
  sfx("tap"); setTimeout(function(){ sfx("tick"); },120); setTimeout(function(){ sfx("tick"); },240); setTimeout(function(){ sfx("ok"); },420);
  camSheet(null); camIdle(); renderCam(); startLive();
  toast(tr("cam.loaded",{en:tintOf(F.tint).en, name:tintOf(F.tint).name, fine:F.res===2?tr("cam.loadedfine"):"", n:F.size}));
}

/* ---- live viewfinder: the camera feed dithered to the LCD in real time (needs HTTPS) ----
   Lenses: the phone's physical cameras (LopdaLenses, runtime/lenses.js), found once after the first permission.
   lens is the id the user last chose ("uw" "w" "t" "f"), kept in the film doc; lenses stays null until found. */
var LENS=window.LopdaLenses;
var LIVE={stream:null, on:false, opening:false, gen:0, raf:0, last:0, lens:"w", lenses:null, hold:0, failed:false, swapping:0,
  cv:document.createElement("canvas"), ctx:null};
LIVE.ctx=LIVE.cv.getContext("2d",{willReadFrequently:true});
function lumaFrom(src,sw,sh,w,h,mirror){
  var ar=w/h, cw=sw, ch=sw/ar; if(ch>sh){ ch=sh; cw=sh*ar; }
  if(LIVE.cv.width!==w||LIVE.cv.height!==h){ LIVE.cv.width=w; LIVE.cv.height=h; }
  var x=LIVE.ctx; x.save(); x.imageSmoothingEnabled=true;
  if(mirror){ x.translate(w,0); x.scale(-1,1); }
  x.drawImage(src,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,w,h); x.restore();
  var d=x.getImageData(0,0,w,h).data, lum=new Float32Array(w*h);
  for(var i=0;i<lum.length;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255;
  return lum;
}
function liveSupported(){ return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
function camModeLabel(){
  var has=!!F.roll && !rollFull();
  $("cam-mode").textContent = !has ? "" : LIVE.on ? "" :
    (liveSupported() ? (LIVE.failed ? tr("cam.nolive") : "") : tr("cam.needhttps"));
  $("cam-live-tag").hidden=!LIVE.on;
  $("cam-live-tag").textContent="LIVE "+lensName(lensNow());
}
function lensNow(){ return LENS.pick(LIVE.lenses,LIVE.lens); }
function mirrored(){ return lensNow().id==="f"; }
/* what the screen calls a lens: its focal length; the plain back/front pair has none to tell */
function lensName(L){ return L.id==="f" ? tr("cam.lens.front") : L.fallback ? tr("cam.lens.back") : tr("cam.lens.mm",{mm:LENS.MM[L.id]}); }
function videoFor(L){
  var v={width:{ideal:640}, height:{ideal:480}};
  if(L.deviceId) v.deviceId={exact:L.deviceId}; else v.facingMode=L.facing;
  return {video:v, audio:false};
}
function stopStream(s){ if(s) s.getTracks().forEach(function(t){ t.stop(); }); }
function capsOf(o){ try{ return o && typeof o.getCapabilities==="function" ? o.getCapabilities() : null; }catch(e){ return null; } }
/* Find the physical lenses. Names only come once the camera is allowed, so if they are blank, open the
   plain back camera first. Names in another language with no capabilities on the device list: open each
   camera for a moment and read its track's capabilities. Never use the virtual cameras (Dual Wide,
   Triple): they switch lenses by themselves when something comes close. */
function findLenses(alive){
  var md=navigator.mediaDevices;
  var list=function(){ return md.enumerateDevices ? md.enumerateDevices().then(function(ds){ return ds.filter(function(d){ return d.kind==="videoinput"; }); }) : Promise.resolve([]); };
  var named=function(ds){ return ds.length>0 && ds.every(function(d){ return !!d.label; }); };
  var info=function(d,caps){ return {deviceId:d.deviceId, label:d.label, caps:caps}; };
  return list().then(function(ds){
    if(named(ds) || !alive()) return alive() ? ds : null;
    return md.getUserMedia(videoFor(LENS.pick(null,LIVE.lens))).then(function(s){ stopStream(s); return list(); });
  }).then(function(ds){
    if(!ds) return undefined;   /* left before the names came: look again next time */
    var found=LENS.identify(ds.map(function(d){ return info(d,capsOf(d)); }));
    if(found || ds.length<2 || !named(ds) || !alive()) return found;
    return ds.reduce(function(pr,d){ return pr.then(function(seen){
      return md.getUserMedia(videoFor({deviceId:d.deviceId})).then(function(s){
        var caps=capsOf(s.getVideoTracks()[0]); stopStream(s); return seen.concat([info(d,caps)]);
      },function(){ return seen.concat([info(d,null)]); });
    }); },Promise.resolve([])).then(LENS.identify);
  }).then(function(found){ if(found!==undefined) LIVE.lenses=found||LENS.FALLBACK; });
}
function startLive(){
  if(LIVE.on || LIVE.opening || !liveSupported() || !F.roll || rollFull()) { camModeLabel(); return; }
  /* every stopLive starts a new generation: an answer for an older one is thrown away */
  var gen=++LIVE.gen; LIVE.opening=true;
  var alive=function(){ return gen===LIVE.gen && !$("v-cam").hidden && !!F.roll && !rollFull(); };
  (LIVE.lenses ? Promise.resolve() : findLenses(alive)).then(function(){
    return alive() ? navigator.mediaDevices.getUserMedia(videoFor(lensNow())) : null;
  }).then(function(stream){
    if(!stream) return;
    if(!alive()){ stopStream(stream); return; }
    LIVE.opening=false; LIVE.stream=stream; LIVE.on=true; LIVE.failed=false;
    var v=$("cam-video"); v.srcObject=stream; var pl=v.play(); if(pl&&pl.catch) pl.catch(function(){});
    camModeLabel(); LIVE.raf=requestAnimationFrame(liveTick);
  }).catch(function(e){
    if(gen!==LIVE.gen) return;
    /* the remembered camera list is stale (a camera went away): find the lenses again next time */
    if(e && (e.name==="OverconstrainedError" || e.name==="NotFoundError")) LIVE.lenses=null;
    LIVE.failed=true; camModeLabel();
    if(e && e.name==="NotAllowedError") toast(tr("cam.denied"));
  }).then(function(){ if(gen===LIVE.gen) LIVE.opening=false; });
}
function stopLive(){
  cancelAnimationFrame(LIVE.raf); LIVE.on=false; LIVE.opening=false; LIVE.gen++;
  if(LIVE.stream){ stopStream(LIVE.stream); LIVE.stream=null; }
  var v=$("cam-video"); if(v) v.srcObject=null;
  if(!$("v-cam").hidden) camModeLabel();
}
function liveTick(t){
  if(!LIVE.on) return;
  LIVE.raf=requestAnimationFrame(liveTick);
  if(t-LIVE.last<80) return;          /* about 12 frames a second is plenty for an LCD */
  LIVE.last=t;
  var v=$("cam-video");
  if(Date.now()<LIVE.hold || v.readyState<2 || !v.videoWidth) return;
  var lum=lumaFrom(v,v.videoWidth,v.videoHeight,CW,CH,mirrored());
  drawPx(cctx,cimg,ditherLuma(lum,CW,CH,F.exposure,F.contrast));
  if(LIVE.swapping) endSwap();
}
/* SELECT: the next lens. The finder goes dark, as for the shutter, until the new lens gives a picture. */
function nextLens(){
  if(!LIVE.on || LIVE.swapping) return;
  LIVE.lens=LENS.next(LIVE.lenses,LIVE.lens).id; sfx("tap");
  $("cam-shut").hidden=false; LIVE.swapping=Date.now()+160;
  clearTimeout(LIVE.swapTimer); LIVE.swapTimer=setTimeout(function(){ LIVE.swapping=Date.now(); endSwap(); },2500);
  stopLive(); startLive(); renderCam(); saveFilmSoon();
}
function endSwap(){
  if(Date.now()<LIVE.swapping) return;
  LIVE.swapping=0; clearTimeout(LIVE.swapTimer); $("cam-shut").hidden=true;
  if(!LIVE.on && !LIVE.opening) camIdle();
}
function takeFrame(px){
  var n=F.frames.length+1, now=Date.now();
  if(F.date) burnDate(px,CW,CH,now,F.res);
  var fr={roll:F.roll, n:n, px:Array.prototype.join.call(px,""), taken:now, dated:F.date};
  if(LIVE.on) fr.lens=lensNow().id;   /* for the lab to print later; the system camera's lens is unknown */
  F.frames.push(fr);
  /* film: you never see the frame. The shutter blinks, the film winds on. */
  sfx("shutter"); $("cam-shut").hidden=false; LIVE.hold=Date.now()+320;
  setTimeout(function(){ $("cam-shut").hidden=true; if(!LIVE.on) camIdle(); },160);
  setTimeout(function(){ sfx("tick"); },260); setTimeout(function(){ sfx("tick"); },360);
  renderCam();
  if(S.db) put(S.refs.frames.doc(F.roll+"-"+pad2(n)),fr).then(function(ok){ if(!ok) toast(tr("cam.lost")); });
  if(rollFull()){ toast(tr("cam.last")); stopLive(); }
}
$("cam-shutter").onclick=function(){ shoot(); };
function shoot(){
  if(!F.roll || rollFull() || !$("cam-shut").hidden) return;
  var v=$("cam-video");
  if(LIVE.on && v.videoWidth){
    var lum=lumaFrom(v,v.videoWidth,v.videoHeight,CW,CH,mirrored());
    takeFrame(ditherLuma(lum,CW,CH,F.exposure,F.contrast));
    return;
  }
  $("cam-file").click();
}
$("cam-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f || !F.roll || rollFull()) return;
  $("cam-dev").hidden=false;
  var url=URL.createObjectURL(f), img=new Image();
  img.onload=function(){
    var px=ditherLuma(lumaOf(img,CW,CH),CW,CH,F.exposure,F.contrast); URL.revokeObjectURL(url);
    $("cam-dev").hidden=true; takeFrame(px);
  };
  img.onerror=function(){ URL.revokeObjectURL(url); $("cam-dev").hidden=true; toast(tr("cam.badphoto")); };
  img.src=url;
});

/* ---- the strip: one wide PNG laid out like a 35mm negative strip, frames left to right.
   Frame pixels are written straight into ImageData: Safari can swap red/blue when a
   canvas is drawn onto another canvas right after putImageData. ---- */
var STRIP={S:2, H:320, LEAD:200, TRAIL:64, PITCH:272, FW:256, FH:224, FY:48};
function stripWidth(n){ return STRIP.LEAD + n*STRIP.PITCH - (STRIP.PITCH-STRIP.FW) + STRIP.TRAIL; }
function rgb(t){ return "rgb("+TONES[t].join(",")+")"; }
function buildStrip(frames,size,loaded,tintId){
  var T=tintOf(tintId), PAL=T.tones, rgb=function(t){ return "rgb("+PAL[t].join(",")+")"; };
  var n=frames.length, c=document.createElement("canvas"); c.width=stripWidth(n); c.height=STRIP.H;
  var x=c.getContext("2d",{willReadFrequently:true});
  x.fillStyle=rgb(0); x.fillRect(0,0,c.width,c.height);
  for(var hx=0;hx<c.width;hx+=30){ x.fillStyle=rgb(1); x.fillRect(hx+9,8,12,14); x.fillRect(hx+9,STRIP.H-22,12,14); }
  x.textBaseline="top";
  var fit=function(text,px,y,tone){ var sz=px; do{ x.font=sz+'px "VT323", monospace'; sz--; } while(x.measureText(text).width>STRIP.LEAD-40 && sz>8); x.fillStyle=rgb(tone); x.fillText(text,24,y); };
  fit("LO-PDA",30,70,2); fit((F.res===2?"FINE GRAIN":"PIXEL FILM")+" "+T.en,22,104,2); fit(size+" EXP",22,130,2);
  fit("LOADED "+stampOf(loaded).slice(0,8),16,172,1); fit("DEV    "+stampOf(Date.now()).slice(0,8),16,192,1);
  frames.forEach(function(fr,k){
    var fx=STRIP.LEAD+k*STRIP.PITCH;
    x.fillStyle=rgb(2); x.font='16px "VT323", monospace'; x.fillText(pad2(k+1),fx,26);
  });
  x.fillStyle=rgb(1); x.font='18px "VT323", monospace'; x.fillText("END",c.width-STRIP.TRAIL+12,STRIP.H/2-9);
  /* edge print in the bottom rebate, as on real film: maker, stock, and a frame number every frame */
  x.font='15px "VT323", monospace';
  frames.forEach(function(fr,k){
    var fx=STRIP.LEAD+k*STRIP.PITCH;
    x.fillStyle=rgb(1); x.fillText(k%2 ? "LO-PDA  "+T.en : (F.res===2?"FINE ":"")+"PIXEL FILM",fx+4,STRIP.FY+STRIP.FH+5);
    x.fillStyle=rgb(2); x.fillText(String(k+1)+"▸",fx+STRIP.FW-26,STRIP.FY+STRIP.FH+5);
  });
  /* frames last, as raw pixels at 2x */
  var sc=STRIP.FW/CW;   /* 2 for standard film, 1 for fine grain: the strip geometry stays the same */
  frames.forEach(function(fr,k){
    var img=x.createImageData(STRIP.FW,STRIP.FH), d=img.data, px=pxFromString(fr.px);
    for(var y=0;y<STRIP.FH;y++) for(var xx=0;xx<STRIP.FW;xx++){
      var t=PAL[px[Math.floor(y/sc)*CW+Math.floor(xx/sc)]], o=(y*STRIP.FW+xx)*4;
      d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255;
    }
    x.putImageData(img,STRIP.LEAD+k*STRIP.PITCH,STRIP.FY);
  });
  return c;
}
async function developStrip(){
  if(!rollFull()) return;
  try{ if(document.fonts && document.fonts.load) await document.fonts.load('22px "VT323"'); }catch(err){}
  var cv=buildStrip(F.frames,F.size,F.loaded,F.tint);
  saveCanvas(cv,"lopda-film-"+fileStamp(F.loaded)+"-"+F.size+"exp.png").then(function(r){ if(r&&r.status==="saved") sfx("ok"), toast(tr("cam.developed")); },function(e){ toast(saveErr(e)); });
}

/* ---- the 3:4 contact-sheet card: a whole roll laid out on photo paper, sized for sharing ---- */
var CARD={W:1080, H:1440, PAPER:[241,236,225], INK:"#2b2a26", SOFT:"#8a857a"};
function fontsReady(){
  try{ if(document.fonts && document.fonts.load) return Promise.all([document.fonts.load('40px "VT323"'),document.fonts.load('28px "DotGothic16"')]).catch(function(){}); }catch(e){}
  return Promise.resolve();
}
/* draw a frame's pixels into a w x h block of the card (nearest neighbour, no canvas-to-canvas copy) */
function putFrame(x,px,pw,ph,pal,dx,dy,w,h){
  var img=x.createImageData(w,h), d=img.data;
  for(var y=0;y<h;y++){ var sy=Math.min(ph-1,Math.floor(y*ph/h)); for(var xx=0;xx<w;xx++){
    var t=pal[px[sy*pw+Math.min(pw-1,Math.floor(xx*pw/w))]], o=(y*w+xx)*4; d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255; } }
  x.putImageData(img,dx,dy);
}
/* The contact sheet, made the way a lab makes one: the developed strip is cut into pieces of a
   few frames, the pieces are laid side by side on paper, and the paper is printed. Frame numbers
   and edge print come from the film itself; a short last piece simply leaves paper showing. */
function buildCard(frames,size,loaded,tintId){
  var T=tintOf(tintId), n=frames.length;
  var strip=buildStrip(frames,size,loaded,tintId), sw=strip.width, sd=strip.getContext("2d").getImageData(0,0,sw,STRIP.H).data;
  var c=document.createElement("canvas"); c.width=CARD.W; c.height=CARD.H;
  var x=c.getContext("2d");
  x.fillStyle="rgb("+CARD.PAPER.join(",")+")"; x.fillRect(0,0,c.width,c.height);
  var MX=72, TOP=236, BOTTOM=110, GAP=26, avail=CARD.H-TOP-BOTTOM, innerW=CARD.W-2*MX;
  /* frames per piece: whichever lets the pieces be printed largest */
  var per=3, s=0;
  [3,4,5,6].forEach(function(k){
    var rows=Math.ceil(n/k), sc=Math.min(innerW/(k*STRIP.PITCH), (avail-(rows-1)*GAP)/(rows*STRIP.H));
    if(sc>s+1e-6){ s=sc; per=k; }
  });
  var rows=Math.ceil(n/per), pieceH=Math.round(STRIP.H*s), blockW=Math.round(per*STRIP.PITCH*s);
  var ox=Math.round((CARD.W-blockW)/2), oy=TOP+Math.round((avail-(rows*pieceH+(rows-1)*GAP))/2);
  x.textBaseline="alphabetic";
  x.fillStyle=CARD.INK; x.font='76px "VT323", monospace'; x.fillText("LO-PDA",MX,128);
  x.font='30px "VT323", "DotGothic16", monospace'; x.textAlign="right";
  x.fillText(String(new Date(loaded).getFullYear())+"."+pad2(new Date(loaded).getMonth()+1)+"."+pad2(new Date(loaded).getDate()),CARD.W-MX,126);
  x.textAlign="left"; x.fillStyle=CARD.SOFT; x.font='26px "DotGothic16", "VT323", monospace';
  x.fillText((F.res===2?"FINE GRAIN":"PIXEL FILM")+" · "+tintPrint(tintId)+" · "+size+" EXP",MX,176);
  x.fillStyle=CARD.INK; x.fillRect(MX,200,CARD.W-2*MX,3);
  x.textAlign="center"; x.fillStyle=CARD.SOFT; x.font='24px "VT323", monospace';
  x.fillText("· shot on lo-pda ·",CARD.W/2,CARD.H-56);
  x.textAlign="left";
  /* pieces last, copied pixel by pixel (never drawImage: Safari swaps red and blue on that path) */
  var seed=(loaded|0)>>>0;
  for(var r=0;r<rows;r++){
    var first=r*per, count=Math.min(per,n-first);
    var sx0=STRIP.LEAD+first*STRIP.PITCH-(STRIP.PITCH-STRIP.FW)/2, srcW=count*STRIP.PITCH;
    var dw=Math.round(srcW*s), dh=pieceH;
    seed=(seed*1103515245+12345)>>>0;
    var jx=(seed>>>16)%7-3;                    /* hand-laid: each piece sits a little off */
    var img=x.createImageData(dw,dh), d=img.data;
    for(var yy=0;yy<dh;yy++){
      var sy=Math.min(STRIP.H-1,Math.floor(yy/s));
      for(var xx=0;xx<dw;xx++){
        var sxp=Math.min(sw-1,Math.floor(sx0+xx/s)), so=(sy*sw+sxp)*4, o=(yy*dw+xx)*4;
        d[o]=sd[so]; d[o+1]=sd[so+1]; d[o+2]=sd[so+2]; d[o+3]=255;
      }
    }
    x.putImageData(img,ox+jx,oy+r*(pieceH+GAP));
  }
  return c;
}
function developCard(){
  if(!rollFull() || CAM.busy) return;
  CAM.busy=true;
  fontsReady().then(function(){
    var cv=buildCard(F.frames,F.size,F.loaded,F.tint);
    return saveCanvas(cv,"lopda-card-"+fileStamp(F.loaded)+"-"+F.tint+".png");
  }).then(function(r){ if(r&&r.status==="saved"){ sfx("ok"); toast(tr("cam.carded")); } },function(e){ toast(saveErr(e)); })
    .then(function(){ CAM.busy=false; });
}

/* taking the roll out clears it from the handheld */
function removeRoll(){
  var old=F.frames.slice(), oldRoll=F.roll;
  F.roll=null; F.frames=[];
  if(S.db){
    S.refs.film.delete().catch(function(){});
    old.reduce(function(pr,fr){ return pr.then(function(){ return S.refs.frames.doc(oldRoll+"-"+pad2(fr.n)).delete().catch(function(){}); }); },Promise.resolve());
  }
  stopLive(); camIdle(); camSheet(null); renderCam();
}

/* rewind early: the unshot frames get fogged and develop white */
function rewindEarly(){
  if(!F.roll || rollFull()) return;
  var fill=new Array(CW*CH+1).join("3"), now=Date.now(), writes=[];
  for(var n=F.frames.length+1;n<=F.size;n++){
    var fr={roll:F.roll, n:n, px:fill, taken:now, blank:"light"};
    F.frames.push(fr);
    if(S.db) writes.push([S.refs.frames.doc(F.roll+"-"+pad2(n)),fr]);
  }
  stopLive(); camIdle(); camSheet(null);
  for(var k=0;k<6;k++) setTimeout(function(){ sfx("tick"); },k*70);
  toast(tr("cam.rewound")); renderCam();
  writes.reduce(function(pr,w){ return pr.then(function(){ return put(w[0],w[1]); }); },Promise.resolve());
}

function loadFilm(){
  if(!S.db){ F.ready=true; renderCam(); return Promise.resolve(); }
  return S.refs.film.get().then(function(sn){
    var d=sn.exists?own(sn.data()):null;
    if(!d || !d.roll){ F.roll=null; F.frames=[]; F.ready=true; return; }
    F.roll=d.roll; F.size=Math.min(d.size||12,16); F.loaded=d.loaded||Date.now(); F.exposure=d.exposure|0; F.contrast=d.contrast|0; F.date=d.date!==false; F.tint=TINTS[d.tint]?d.tint:"lcd"; setRes(d.res||1);
    LIVE.lens=LENS.ORDER.indexOf(d.lens)>=0?d.lens:"w";
    return S.refs.frames.where("roll","==",F.roll).get().then(function(q){
      var list=q.docs.map(function(x){ return own(x.data()); }).filter(function(fr){ return fr && fr.px && fr.px.length===CW*CH; });
      list.sort(function(a,b){ return a.n-b.n; });
      F.frames=list; F.ready=true;
    });
  }).catch(function(e){ F.ready=true; toast(tr("cam.readfail",{code:(e&&e.code)||tr("common.unknown")})); });
}

var camLinked=false, bootTimer=null;
function camBoot(){
  var box=$("cam-boot"), reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(camLinked || reduce){ camLinked=true; return; }
  var film = F.roll ? tr("cam.boot.filmof",{name:tintLabel(F.tint), stock:stockName(F.res), n:F.frames.length, size:F.size}) : tr("cam.boot.nofilm");
  var shake=tr("cam.boot.shake"), sep=I18N.lang==="zh"?" ： ":": ";
  var lines=[[tr("cam.boot.slot"),"…",380],[tr("cam.boot.found"),tr("cam.boot.lens"),420],[shake,"",0],[tr("cam.boot.fw"),"CAM-OS 1.03",300],[tr("cam.boot.film"),film,360],["",tr("cam.boot.done"),500]];
  box.textContent=""; box.hidden=false;
  var skip=document.createElement("div"); skip.className="skip"; skip.textContent=tr("cam.boot.skip");
  var done=function(){ clearTimeout(bootTimer); clearInterval(bootTimer); camLinked=true; box.hidden=true; box.onclick=null; };
  box.onclick=done;
  var i=0;
  (function next(){
    if(box.hidden) return;
    if(i>=lines.length){ bootTimer=setTimeout(done,700); return; }
    var L=lines[i++], d=document.createElement("div"); d.className="ln";
    box.insertBefore(d,skip.parentNode?skip:null);
    if(!skip.parentNode) box.appendChild(skip);
    if(L[0]===shake){
      var n=0; d.className="ln bar8";
      bootTimer=setInterval(function(){
        n++; if(n===1) sfx("modem"); d.textContent=shake+" ["+"█".repeat(n)+"░".repeat(10-n)+"]";
        if(n>=10){ clearInterval(bootTimer); d.textContent=shake+" [██████████] OK"; bootTimer=setTimeout(next,240); sfx("ok"); }
      },70);
      return;
    }
    d.textContent=L[0] ? L[0]+" … " : "";
    bootTimer=setTimeout(function(){ d.textContent=(L[0]?L[0]+(L[1]!=="…"?sep:" "):"")+L[1]; bootTimer=setTimeout(next,L[2]); },260);
  })();
}
function openCam(){
  CAM.mode=null; camSheet(null);
  show("cam"); showPad(true); renderCam(); camIdle();
  var go=function(){ camBoot(); renderCam(); startLive(); };
  if(F.ready) go(); else loadFilm().then(go);
}

/* ---- camera controls: the screen is one fixed panel; the back opens for rolls and menus.
   Chin buttons, after the Game Boy Camera: A shutter, up/down brightness, left/right contrast,
   START body menu, SELECT the next lens. The key strip on screen does the same by touch. ---- */
var CAM={mode:null, menu:null, sel:0, busy:false, roll:0};
function camSheet(name){
  CAM.mode=name;
  $("cam-load").hidden=name!=="load";
  $("cam-menu").hidden=name!=="menu";
  if(name) stopLive();
  if(name==="load") buildRolls();
}
function camMenu(kind){
  var left=F.size-F.frames.length, M;
  /* titles, labels and notes are keys, so an open menu redraws in the new language */
  if(kind==="body") M={title:"cam.menu.body", note:"", back:function(){ camSheet(null); renderCam(); startLive(); }, items:[
    {label:"cam.menu.date", value:function(){ return tr(F.date?"set.on":"set.off"); }, pick:function(){ toggleDate(); }},
    {label:"cam.menu.lens", value:function(){ return lensName(lensNow()); }, pick:function(){ LIVE.lens=LENS.next(LIVE.lenses,LIVE.lens).id; saveFilmSoon(); }},
    {label:"cam.menu.rewind", value:function(){ return tr("cam.menu.left",{n:left}); }, pick:function(){ camMenu("rewind"); }},
    {label:"cam.menu.finder", pick:function(){ M.back(); }}
  ]};
  else if(kind==="rewind") M={title:"cam.menu.rewind", note:"cam.menu.rewindnote", back:function(){ camMenu("body"); }, items:[
    {label:"cam.menu.rewindgo", pick:function(){ rewindEarly(); }},
    {label:"common.cancel", pick:function(){ camMenu("body"); }}
  ]};
  else if(kind==="develop") M={title:"cam.menu.done", note:"cam.menu.donenote", back:null, items:[
    {label:"cam.menu.strip", pick:function(){ developStrip(); }},
    {label:"cam.menu.card", pick:function(){ developCard(); }},
    {label:"cam.menu.swap", pick:function(){ camMenu("remove"); }}
  ]};
  else if(kind==="remove") M={title:"cam.menu.remove", note:"cam.menu.removenote", back:function(){ camMenu("develop"); }, items:[
    {label:"cam.menu.removego", pick:function(){ removeRoll(); }},
    {label:"cam.menu.wait", pick:function(){ camMenu("develop"); }}
  ]};
  M.left=left; CAM.menu=M; CAM.sel=0; camSheet("menu"); drawMenu();
}
function drawMenu(){
  var M=CAM.menu; $("menu-title").textContent=tr(M.title); $("menu-note").textContent=M.note?tr(M.note,{n:M.left}):"";
  var ul=$("menu-list"); ul.textContent="";
  M.items.forEach(function(it,i){
    var li=document.createElement("li"); li.className=i===CAM.sel?"on":"";
    li.appendChild(document.createTextNode(tr(it.label)));
    if(it.value){ var v=document.createElement("small"); v.textContent=it.value(); li.appendChild(v); }
    li.onclick=function(){ CAM.sel=i; drawMenu(); menuPick(); };
    ul.appendChild(li);
  });
  document.querySelector("#cam-menu .menu-keys").textContent=tr("cam.menu.keys")+(M.back?tr("cam.menu.keysback"):"");
}
function menuPick(){ var it=CAM.menu.items[CAM.sel]; sfx("tap"); it.pick(); if(CAM.mode==="menu" && CAM.menu && CAM.menu.items.indexOf(it)>=0) drawMenu(); }

/* the roll picker: canisters on a shelf, slide them sideways */
var ROLL_PATTERN={
  lcd:   function(x,y){ return y%6===0 ? 3 : 1; },
  sepia: function(x,y){ return (x+y)%6<3 ? 1 : 2; },
  sakura:function(x,y){ var a=x%8, b=y%8; return (a===3&&b===3)||(a===2&&b===3)||(a===4&&b===3)||(a===3&&b===2)||(a===3&&b===4) ? 0 : (a===3&&b===3)?3:2; },
  cyano: function(x,y){ return (y+Math.round(Math.sin(x/2)*1.5))%5===0 ? 3 : 1; },
  mono:  function(x,y){ return ((x>>1)+(y>>1))%2 ? 0 : 2; }
};
function drawCanister(cv,id){
  var W=48,H=64, x=cv.getContext("2d"), img=x.createImageData(W,H), d=img.data, px=new Uint8Array(W*H).fill(255);
  var put=function(X,Y,t){ if(X>=0&&Y>=0&&X<W&&Y<H) px[Y*W+X]=t; };
  var rect=function(x0,y0,w,h,t){ for(var Y=y0;Y<y0+h;Y++) for(var X=x0;X<x0+w;X++) put(X,Y,t); };
  rect(19,0,10,6,0); rect(21,1,6,4,2);                 /* spool knob */
  rect(7,6,34,5,0); rect(8,7,32,3,1);                  /* top cap */
  rect(8,11,32,44,0); rect(9,11,30,44,2);              /* body */
  rect(9,15,30,36,3);                                  /* label */
  for(var Y=17;Y<33;Y++) for(var X=10;X<38;X++) put(X,Y,ROLL_PATTERN[id](X,Y));
  rect(10,35,28,2,0); rect(10,39,18,2,1); rect(10,43,22,2,1); rect(10,47,12,2,1);   /* printed lines */
  rect(40,30,8,16,0); for(var k=0;k<3;k++) rect(42,32+k*5,3,3,2);                   /* film tongue */
  rect(7,55,34,5,0); rect(8,56,32,3,1);                /* bottom cap */
  rect(21,60,6,4,0);
  for(var i=0;i<W*H;i++){ var o=i*4; if(px[i]===255){ d[o+3]=0; continue; } var t=TONES[px[i]]; d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255; }
  x.putImageData(img,0,0);
}
function buildRolls(){
  var box=$("rolls");
  if(!box.children.length){
    TINT_ORDER.forEach(function(id,i){
      var b=document.createElement("button"); b.type="button"; b.className="roll"; b.setAttribute("data-tint",id);
      var cv=document.createElement("canvas"); cv.width=48; cv.height=64; drawCanister(cv,id);
      var lab=document.createElement("span"); lab.className="lab";
      b.appendChild(cv); b.appendChild(lab);
      b.onclick=function(){ if(CAM.roll===i) return; pickRoll(i,true); };
      box.appendChild(b);
    });
    var t=null;
    box.addEventListener("scroll",function(){
      clearTimeout(t); t=setTimeout(function(){
        var mid=box.scrollLeft+box.clientWidth/2, best=0, bd=1e9;
        Array.prototype.forEach.call(box.children,function(c,i){ var cx=c.offsetLeft+c.offsetWidth/2, dd=Math.abs(cx-mid); if(dd<bd){ bd=dd; best=i; } });
        if(best!==CAM.roll){ CAM.roll=best; sfx("move"); paintRolls(); }
      },90);
    });
  }
  CAM.roll=Math.max(0,TINT_ORDER.indexOf(nextTint));
  paintRolls();
  requestAnimationFrame(function(){ pickRoll(CAM.roll,false); });
}
function pickRoll(i,smooth){
  var box=$("rolls"), c=box.children[i]; if(!c) return;
  CAM.roll=i; paintRolls();
  box.scrollTo({left:c.offsetLeft+c.offsetWidth/2-box.clientWidth/2, behavior:smooth?"smooth":"auto"});
}
function paintRolls(){
  if(!$("rolls").children.length) return;
  nextTint=TINT_ORDER[CAM.roll];
  Array.prototype.forEach.call($("rolls").children,function(c,i){
    var id=c.getAttribute("data-tint"), t=TINTS[id];
    c.className="roll"+(i===CAM.roll?" on":"");
    c.querySelector(".lab").innerHTML="";
    c.querySelector(".lab").appendChild(document.createTextNode(t.en));
    var sm=document.createElement("small"); sm.textContent=tr("cam.load.label",{name:t.name, n:nextSize, fine:nextStock===2?tr("cam.load.fine"):""}); c.querySelector(".lab").appendChild(sm);
  });
  $("roll-count").lastChild.textContent=tr("cam.load.exp",{n:nextSize});
  $("roll-stock").lastChild.textContent=stockName(nextStock);
  $("roll-note").textContent=tr(nextStock===2?"cam.load.note2":"cam.load.note1")+tr("cam.load.tint",{name:tintLabel(nextTint)});
}
function rollSize(step){ var S3=[8,12,16], i=S3.indexOf(nextSize); nextSize=S3[(i+step+3)%3]; sfx("tick"); paintRolls(); }
function rollStock(){ nextStock=nextStock===2?1:2; sfx("tick"); paintRolls(); }
$("roll-count").onclick=function(){ rollSize(1); };
$("roll-stock").onclick=function(){ rollStock(); };
$("roll-prev").onclick=function(){ pickRoll(Math.max(0,CAM.roll-1),true); };
$("roll-next").onclick=function(){ pickRoll(Math.min(TINT_ORDER.length-1,CAM.roll+1),true); };
$("roll-go").onclick=function(){ if(CAM.mode==="load") loadRoll(); };

function camButton(b,down){
  var boot=$("cam-boot");
  if(!boot.hidden){ if(down && (b==="a"||b==="b"||b==="start") && boot.onclick) boot.onclick(); return; }
  /* actions that open the share sheet or the system camera wait for the release: phones only
     count a finger lifting as permission to open those */
  if(CAM.mode==="menu"){
    if(!down){ if(b==="a") menuPick(); return; }
    var n=CAM.menu.items.length;
    if(b==="up"||b==="down"){ CAM.sel=(CAM.sel+(b==="down"?1:n-1))%n; sfx("move"); drawMenu(); }
    else if(b==="b" && CAM.menu.back){ sfx("miss"); CAM.menu.back(); }
    return;
  }
  if(CAM.mode==="load"){
    if(!down) return;
    if(b==="left") pickRoll(Math.max(0,CAM.roll-1),true);
    else if(b==="right") pickRoll(Math.min(TINT_ORDER.length-1,CAM.roll+1),true);
    else if(b==="up") rollSize(1); else if(b==="down") rollSize(-1);
    else if(b==="select") rollStock();
    else if(b==="a"||b==="start") loadRoll();
    return;
  }
  if(!F.roll || rollFull()) return;
  if(b==="a"){ if(down===LIVE.on) shoot(); return; }   /* live: on press; system camera: on release */
  if(!down) return;
  if(b==="up") setExposure(F.exposure+1); else if(b==="down") setExposure(F.exposure-1);
  else if(b==="right") setContrast(F.contrast+1); else if(b==="left") setContrast(F.contrast-1);
  else if(b==="start"){ sfx("tap"); camMenu("body"); }
  else if(b==="select") nextLens();
}
function camLayout(){
  var box=$("finder-box"), f=$("finder"); if($("v-cam").hidden || !box.clientWidth) return;
  var w=box.clientWidth-16, h=box.clientHeight-16, k=Math.min(w/128,h/112);
  f.style.width=Math.floor(128*k)+"px"; f.style.height=Math.floor(112*k)+"px";
}
if(window.ResizeObserver) new ResizeObserver(function(){ camLayout(); }).observe($("finder-box"));
window.addEventListener("resize",camLayout);

LP.film={TINTS:TINTS, TINT_ORDER:TINT_ORDER, tintLabel:tintLabel, tintPrint:tintPrint, STRIP:STRIP, stripWidth:stripWidth,
  CARD:CARD, putFrame:putFrame, fontsReady:fontsReady, ditherLuma:ditherLuma};   /* the reader dithers book pictures with the same look */
LP.padRoute("cam",function(b,down){ if($("v-cam").hidden) return false; camButton(b,down); return true; });
LP.builtin({id:"camera", label:"app.camera", icon:"camera", view:"cam",
  open:function(){ openCam(); },
  tag:function(){ return F.roll?(F.frames.length+"/"+F.size):""; },
  leave:function(){ stopLive(); },
  lang:function(){ paintRolls(); if(!$("v-cam").hidden) renderCam(); },
  padLayout:function(){ if(!$("v-cam").hidden) camLayout(); },
  ready:function(){ loadFilm().then(function(){ if(!$("v-home").hidden) LP.renderHome(); if(!$("v-cam").hidden) renderCam(); }); },
  nostore:function(){ F.ready=true; },
  pause:function(){ stopLive(); },
  resume:function(){ if(!$("v-cam").hidden) startLive(); }});
})();
