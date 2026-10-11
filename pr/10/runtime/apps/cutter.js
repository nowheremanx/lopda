/*
 * Lo-PDA built-in: the strip cutter. Takes a developed strip from the camera and cuts prints.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr;
var TONES=LP.TONES, toast=LP.toast, pad2=LP.pad2, sfx=LP.sfx, show=LP.show, saveCanvas=LP.saveCanvas, saveErr=LP.saveErr;
/* film geometry, tints and the card come from the camera */
var FILM=LP.film, TINTS=FILM.TINTS, TINT_ORDER=FILM.TINT_ORDER, tintLabel=FILM.tintLabel, tintPrint=FILM.tintPrint,
  STRIP=FILM.STRIP, stripWidth=FILM.stripWidth, CARD=FILM.CARD, putFrame=FILM.putFrame, fontsReady=FILM.fontsReady;

/* ---------- cutter: slide the strip under a fixed window and cut what's inside ---------- */
var CUT={W:0, n:0, data:null, s:1, k:1, mode:"narrow", count:0, name:"lopda", tint:"lcd", pal:TINTS.lcd.tones};
function nearestTone(r,g,b,pal){
  pal=pal||TONES;
  var best=0,bd=1e9; for(var t=0;t<4;t++){ var T=pal[t], dd=(r-T[0])*(r-T[0])+(g-T[1])*(g-T[1])+(b-T[2])*(b-T[2]); if(dd<bd){bd=dd;best=t;} } return best;
}
/* which tint was this strip developed in? the one whose four tones fit its pixels best */
function detectTint(src,n){
  var best="lcd", bestErr=Infinity;
  TINT_ORDER.forEach(function(id){
    var pal=TINTS[id].tones, err=0;
    for(var i=0;i<n;i+=4*53){
      var r=src[i],g=src[i+1],b=src[i+2], m=Infinity;
      for(var t=0;t<4;t++){ var T=pal[t], dd=(r-T[0])*(r-T[0])+(g-T[1])*(g-T[1])+(b-T[2])*(b-T[2]); if(dd<m) m=dd; }
      /* also try red/blue swapped, so strips hit by the old Safari bug still match */
      for(t=0;t<4;t++){ T=pal[t]; dd=(b-T[0])*(b-T[0])+(g-T[1])*(g-T[1])+(r-T[2])*(r-T[2]); if(dd<m) m=dd; }
      err+=m;
    }
    if(err<bestErr){ bestErr=err; best=id; }
  });
  return best;
}
/* window size in strip units; the wide window has a frame's 128:112 aspect, the same on both film stocks */
function cutWin(){ return CUT.mode==="narrow" ? {w:STRIP.FW, h:STRIP.FH, y:STRIP.FY} : {w:Math.round(STRIP.H*128/112), h:STRIP.H, y:0}; }
function cutLayout(){
  if(!CUT.data) return;
  var box=$("cut-box"), sc=$("cut-scroll"), cv=$("cut-cv");
  var dispH=Math.min(240, Math.round(box.clientWidth*0.62));
  CUT.k=dispH/STRIP.H;
  cv.style.height=dispH+"px"; cv.style.width=Math.round(CUT.W*CUT.k)+"px";
  var half=Math.round(box.clientWidth/2);
  $("cut-sp1").style.width=half+"px"; $("cut-sp2").style.width=half+"px";
  sc.style.height=dispH+"px";
  var w=cutWin(), win=$("cut-window");
  win.style.width=Math.round(w.w*CUT.k)+"px"; win.style.height=Math.round(w.h*CUT.k)+"px"; win.style.top=Math.round(w.y*CUT.k)+"px";
}
/* the strip x at the window's left edge: the scroll offset maps to the window centre */
function cutX(){
  var w=cutWin(), centre=$("cut-scroll").scrollLeft/CUT.k;
  return Math.max(0,Math.min(CUT.W-w.w,Math.round(centre-w.w/2)));
}
function cutLoad(img,fname){
  var iw=img.naturalWidth, ih=img.naturalHeight, s=ih/STRIP.H;
  var W=iw/s, n=Math.round((W-stripWidth(0))/STRIP.PITCH);
  if(!(n>=1 && n<=36) || Math.abs(stripWidth(n)-W)>8) return false;
  var c=document.createElement("canvas"); c.width=iw; c.height=ih;
  var x=c.getContext("2d",{willReadFrequently:true}); x.drawImage(img,0,0);
  var src=x.getImageData(0,0,iw,ih).data;
  CUT.tint=detectTint(src,src.length); CUT.pal=TINTS[CUT.tint].tones;
  /* resample to standard units and snap every pixel to the four tones; this also repairs
     strips that came out with swapped colours */
  var W0=stripWidth(n), out=new Uint8Array(W0*STRIP.H);
  for(var y=0;y<STRIP.H;y++) for(var xx=0;xx<W0;xx++){
    var sx=Math.min(iw-1,Math.floor((xx+0.5)*s)), sy=Math.min(ih-1,Math.floor((y+0.5)*s)), o=(sy*iw+sx)*4;
    out[y*W0+xx]=nearestTone(src[o],src[o+1],src[o+2],CUT.pal);
  }
  CUT.W=W0; CUT.n=n; CUT.data=out; CUT.count=0;
  CUT.name=(fname||"lopda").replace(/\.[^.]+$/,"").replace(/-\d+exp$/,"").slice(0,60)||"lopda";
  var cv=$("cut-cv"); cv.width=W0; cv.height=STRIP.H;
  var cx=cv.getContext("2d"), im=cx.createImageData(W0,STRIP.H), d=im.data;
  for(var i=0;i<out.length;i++){ var t=CUT.pal[out[i]]; d[i*4]=t[0]; d[i*4+1]=t[1]; d[i*4+2]=t[2]; d[i*4+3]=255; }
  cx.putImageData(im,0,0);
  $("cut-empty").hidden=true; $("cut-scroll").hidden=false; $("cut-window").hidden=false; $("cut-go").disabled=false;
  cutLayout();
  /* start with frame 1 centred under the window */
  $("cut-scroll").scrollLeft=Math.round((STRIP.LEAD+STRIP.FW/2)*CUT.k);
  cutState();
  return true;
}
$("cut-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f) return;
  var url=URL.createObjectURL(f), img=new Image();
  $("cut-state").textContent=tr("cut.reading");
  img.onload=function(){
    var ok=cutLoad(img,f.name); URL.revokeObjectURL(url);
    if(!ok){ $("cut-state").textContent=""; toast(tr("cut.notstrip")); }
  };
  img.onerror=function(){ URL.revokeObjectURL(url); $("cut-state").textContent=""; toast(tr("cut.badimg")); };
  img.src=url;
});
function cutNudge(dx){ var sc=$("cut-scroll"); sc.scrollLeft=sc.scrollLeft+dx*CUT.k; }
$("cut-left").onclick=function(){ cutNudge(-8); };
$("cut-right").onclick=function(){ cutNudge(8); };
Array.prototype.forEach.call(document.querySelectorAll("[data-win]"),function(b){
  b.onclick=function(){
    CUT.mode=b.getAttribute("data-win");
    Array.prototype.forEach.call(document.querySelectorAll("[data-win]"),function(o){ var on=o===b; o.setAttribute("aria-checked",on?"true":"false"); o.className=on?"btn":"btn ghost"; });
    cutLayout();
  };
});
/* print edges: none, a straight paper border, or a scalloped paper border */
var EDGES=["none","plain","scallop","card"];
var edgeIdx=0;
function cutEdgeLabel(){
  var e=EDGES[edgeIdx];
  $("cut-edge").textContent=tr("cut.edge",{name:tr("cut.edge."+e)}); $("cut-edge-note").textContent=tr("cut.edgenote."+e);
}
function cutState(){ $("cut-state").textContent=CUT.data ? tr("cut.state",{tint:tintLabel(CUT.tint), n:CUT.n, k:CUT.count}) : ""; }
$("cut-edge").onclick=function(){ edgeIdx=(edgeIdx+1)%EDGES.length; cutEdgeLabel(); };
/* is a point (in strip units, within the bordered print) on the paper? */
function onPaper(x,y,W,H,style){
  if(style!=="scallop") return true;
  var R=4, P=8, edge=function(along,depth){ var m=((along%P)+P)%P-P/2; return depth >= R - Math.sqrt(Math.max(0,R*R-m*m)); };
  return edge(x,y) && edge(x,H-1-y) && edge(y,x) && edge(y,W-1-x);
}
/* one cut on a 3:4 card: the print sits on photo paper with a short caption */
function buildCutCard(w,x0){
  var c=document.createElement("canvas"); c.width=CARD.W; c.height=CARD.H;
  var x=c.getContext("2d");
  x.fillStyle="rgb("+CARD.PAPER.join(",")+")"; x.fillRect(0,0,c.width,c.height);
  var MX=96, pw=CARD.W-2*MX, ph=Math.round(pw*w.h/w.w), py=Math.round((CARD.H-ph)/2)-60;
  var d=new Date();
  x.fillStyle=CARD.INK; x.font='44px "VT323", monospace'; x.textBaseline="alphabetic";
  x.fillText("LO-PDA",MX,py+ph+76);
  x.textAlign="right"; x.fillStyle=CARD.SOFT; x.font='26px "DotGothic16", "VT323", monospace';
  x.fillText(tintPrint(CUT.tint)+" · "+d.getFullYear()+"."+pad2(d.getMonth()+1)+"."+pad2(d.getDate()),CARD.W-MX,py+ph+74);
  x.textAlign="left";
  var region=new Uint8Array(w.w*w.h);
  for(var y=0;y<w.h;y++) for(var xx=0;xx<w.w;xx++) region[y*w.w+xx]=CUT.data[(w.y+y)*CUT.W+x0+xx];
  putFrame(x,region,w.w,w.h,CUT.pal,MX,py,pw,ph);
  return c;
}
$("cut-go").onclick=function(){
  sfx("shutter");
  if(!CUT.data) return;
  var w=cutWin(), x0=cutX(), SC=2, style=EDGES[edgeIdx], B= style==="none" ? 0 : 14;
  if(style==="card"){
    var btnc=this; btnc.disabled=true;
    fontsReady().then(function(){ return saveCanvas(buildCutCard(w,x0),CUT.name+"-card-"+pad2(CUT.count+1)+".png"); })
      .then(function(r){ if(r&&r.status==="saved"){ CUT.count++; cutState(); toast(tr("cut.carded")); } },function(e){ toast(saveErr(e)); })
      .then(function(){ btnc.disabled=false; });
    return;
  }
  var UW=w.w+2*B, UH=w.h+2*B, out=document.createElement("canvas");
  out.width=UW*SC; out.height=UH*SC;
  var ox=out.getContext("2d"), im=ox.createImageData(out.width,out.height), d=im.data, paper=CUT.pal[3];
  for(var y=0;y<out.height;y++) for(var xx=0;xx<out.width;xx++){
    var ux=Math.floor(xx/SC), uy=Math.floor(y/SC), o=(y*out.width+xx)*4, t;
    if(ux>=B && ux<B+w.w && uy>=B && uy<B+w.h) t=CUT.pal[CUT.data[(w.y+uy-B)*CUT.W + x0+ux-B]];
    else if(onPaper(ux,uy,UW,UH,style)) t=paper;
    else { d[o+3]=0; continue; }
    d[o]=t[0]; d[o+1]=t[1]; d[o+2]=t[2]; d[o+3]=255;
  }
  ox.putImageData(im,0,0);
  var btn=this; btn.disabled=true;
  saveCanvas(out,CUT.name+"-cut-"+pad2(CUT.count+1)+".png").then(function(r){
    if(r&&r.status==="saved"){ CUT.count++; cutState(); toast(tr("cut.done")); }
    btn.disabled=false;
  },function(e){ toast(saveErr(e)); btn.disabled=false; });
};
window.addEventListener("resize",function(){ if(!$("v-cut").hidden) cutLayout(); });
cutEdgeLabel();

LP.builtin({id:"cutter", label:"app.cutter", icon:"cutter", view:"cut",
  open:function(){ show("cut"); cutLayout(); },
  lang:function(){ cutEdgeLabel(); cutState(); }});
})();
