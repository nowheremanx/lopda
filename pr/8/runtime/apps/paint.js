/*
 * Lo-PDA built-in: pixel paint. 96x96, four LCD tones.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr;
var TONES=LP.TONES, BAYER=LP.BAYER, put=LP.put, own=LP.own, toast=LP.toast, show=LP.show;

/* ---------- pixel paint: 96x96, four LCD tones ---------- */
var PW=96;
var P={px:new Uint8Array(PW*PW).fill(3), color:0, size:1, undo:[], loaded:false, drawing:false, last:null, saveTimer:null};
var pcv=$("paint-cv"), pctx=pcv.getContext("2d"), pimg=pctx.createImageData(PW,PW);
function paintRender(){
  var d=pimg.data;
  for(var i=0;i<P.px.length;i++){ var t=TONES[P.px[i]]; d[i*4]=t[0]; d[i*4+1]=t[1]; d[i*4+2]=t[2]; d[i*4+3]=255; }
  pctx.putImageData(pimg,0,0);
}
function paintPushUndo(){ P.undo.push(P.px.slice()); if(P.undo.length>20) P.undo.shift(); }
function paintDot(x,y){
  var r=P.size===1?0:1;
  for(var j=-r;j<=r;j++) for(var i=-r;i<=r;i++){ var xx=x+i, yy=y+j; if(xx>=0&&yy>=0&&xx<PW&&yy<PW) P.px[yy*PW+xx]=P.color; }
}
function paintLine(x0,y0,x1,y1){
  var dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1, err=dx+dy;
  for(;;){ paintDot(x0,y0); if(x0===x1&&y0===y1) break; var e2=2*err; if(e2>=dy){ err+=dy; x0+=sx; } if(e2<=dx){ err+=dx; y0+=sy; } }
}
function paintPos(ev){
  var r=pcv.getBoundingClientRect();
  return [Math.floor((ev.clientX-r.left)/r.width*PW), Math.floor((ev.clientY-r.top)/r.height*PW)];
}
pcv.addEventListener("pointerdown",function(ev){
  ev.preventDefault(); pcv.setPointerCapture(ev.pointerId);
  paintPushUndo(); P.drawing=true; P.last=paintPos(ev);
  paintDot(P.last[0],P.last[1]); paintRender();
});
pcv.addEventListener("pointermove",function(ev){
  if(!P.drawing) return;
  var p=paintPos(ev); paintLine(P.last[0],P.last[1],p[0],p[1]); P.last=p; paintRender();
});
function paintEnd(){ if(!P.drawing) return; P.drawing=false; paintSaveSoon(); }
pcv.addEventListener("pointerup",paintEnd); pcv.addEventListener("pointercancel",paintEnd);

Array.prototype.forEach.call(document.querySelectorAll(".sw"),function(b){
  b.onclick=function(){
    P.color=+b.getAttribute("data-c");
    Array.prototype.forEach.call(document.querySelectorAll(".sw"),function(o){ o.setAttribute("aria-checked", o===b ? "true" : "false"); });
  };
});
/* two brushes: a single pixel, or a 3x3 block */
function paintSizeLabel(){ $("paint-size").textContent=tr(P.size===1?"paint.fine":"paint.bold"); }
$("paint-size").onclick=function(){ P.size=P.size===1?3:1; paintSizeLabel(); };
$("paint-undo").onclick=function(){ var prev=P.undo.pop(); if(!prev){ toast(tr("paint.noundo")); return; } P.px=prev; paintRender(); paintSaveSoon(); };
function paintClear(){ paintPushUndo(); P.px=new Uint8Array(PW*PW).fill(3); paintRender(); paintSaveSoon(); }
function armClear(){ LP.resetConfirm("paint-clear-wrap","paint-clear",tr("paint.clear"),function(){ paintClear(); armClear(); }); }
armClear();

/* import: crop to a square, stretch contrast, Bayer-dither to four tones */
$("paint-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f) return;
  var url=URL.createObjectURL(f), img=new Image();
  img.onload=function(){
    var side=Math.min(img.naturalWidth,img.naturalHeight);
    var sx=(img.naturalWidth-side)/2, sy=(img.naturalHeight-side)/2;
    var c=document.createElement("canvas"); c.width=c.height=PW;
    var x=c.getContext("2d"); x.imageSmoothingEnabled=true; x.drawImage(img,sx,sy,side,side,0,0,PW,PW);
    var d=x.getImageData(0,0,PW,PW).data, lum=new Float32Array(PW*PW), lo=1, hi=0;
    for(var i=0;i<lum.length;i++){ var v=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255; lum[i]=v; if(v<lo) lo=v; if(v>hi) hi=v; }
    var span=Math.max(0.05,hi-lo);
    paintPushUndo();
    for(var y=0;y<PW;y++) for(var xx=0;xx<PW;xx++){
      var k=y*PW+xx, v=(lum[k]-lo)/span, t=(BAYER[(y%4)*4+(xx%4)]+0.5)/16-0.5;
      P.px[k]=Math.max(0,Math.min(3,Math.round(v*3+t)));
    }
    URL.revokeObjectURL(url); paintRender(); paintSaveSoon(); toast(tr("paint.imported"));
  };
  img.onerror=function(){ URL.revokeObjectURL(url); toast(tr("paint.badimg")); };
  img.src=url;
});

/* export: scale up 8x with hard pixels, hand to the viewer's save dialog */
$("paint-export").onclick=function(){
  if(!S.downloads){ toast(tr("paint.noexport")); return; }
  var big=document.createElement("canvas"); big.width=big.height=PW*8;
  var bx=big.getContext("2d"); bx.imageSmoothingEnabled=false; bx.drawImage(pcv,0,0,big.width,big.height);
  big.toBlob(function(blob){
    if(!blob){ toast(tr("paint.genfail")); return; }
    var d=new Date(), stamp=d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")+"-"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0");
    S.downloads.save({filename:"lopda-"+stamp+".png", data:blob}).then(function(r){
      if(r && r.status==="saved") toast(tr("paint.exported"));
    }).catch(function(e){
      var c=e&&e.code;
      if(c==="declined") return;
      toast(c==="rate_limited" ? tr("save.busy") : tr("save.failed",{code:c||tr("common.unknown")}));
    });
  },"image/png");
};

/* persistence: the 9216 pixels as a digit string, one document */
function paintSaveSoon(){
  if(!S.db) { $("paint-state").textContent=tr("paint.unsaved"); return; }
  clearTimeout(P.saveTimer);
  $("paint-state").textContent=tr("common.saving");
  P.saveTimer=setTimeout(function(){
    put(S.refs.paint,{px:Array.prototype.join.call(P.px,""), updated:Date.now()}).then(function(ok){ $("paint-state").textContent=tr(ok?"paint.saved":"paint.savefail"); });
  },1200);
}
function openPaint(){
  show("paint"); paintRender();
  if(P.loaded || !S.db) return;
  S.refs.paint.get().then(function(sn){
    P.loaded=true;
    var d=sn.exists ? own(sn.data()) : null;
    if(d && typeof d.px==="string" && d.px.length===PW*PW && !P.undo.length){
      for(var i=0;i<d.px.length;i++) P.px[i]=d.px.charCodeAt(i)-48;
      paintRender();
    }
  }).catch(function(){});
}
paintRender();
paintSizeLabel();

LP.builtin({id:"paint", label:"app.paint", icon:"paint", view:"paint",
  open:function(){ openPaint(); },
  lang:function(){ paintSizeLabel(); }});
})();
