/*
 * Lo-PDA: developing a roll. Turns a frame's latent image (the colour picture taken with it) into the print the
 * darkroom shows and saves. Pure functions on RGBA pixels, no DOM: the darkroom (apps/darkroom.js) decodes the JPEG
 * and draws the result, tests/develop.test.mjs runs this in node:vm. docs/design/darkroom.md section 4,
 * decisions.md section 18.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * The pipeline, in the order of darkroom.md section 4:
 *   1. exposure and contrast (the frame's own values)      5. grain, at the output size, so a large print has sharp grain
 *   2. the stock: tone curve, colour shifts, saturation     6. vignette
 *   3. a slight softening (lens and enlarger)               7. light leaks (decided when the roll was loaded)
 *   4. halation round the highlights                         8. the date-back stamp
 * plus the lab's own small chance: density and colour drift, dust and scratches (decided when the roll is developed).
 * Steps 1-4 work on the 800x700 latent; a 1600x1400 print is upscaled smoothly after step 4.
 *
 * Randomness is seeded only (never Math.random), darkroom.md 4.1: roll.seed (load time) decides how an EXPIRED roll
 * fades and the light leaks; the develop seed (devSeed(roll id, develop time), kept in roll.dev) decides the drift,
 * the dust and the grain. Same pixels, seeds and VERSION give the same bytes: a reprint is developed again, not
 * stored. A new algorithm gets a new VERSION and must keep this one's code path for rolls developed with it.
 */
/* the globals come in as arguments: plain local names, which also keeps the code fast under node:vm in the tests */
(function(Math,Float32Array,Uint8ClampedArray){
"use strict";

var VERSION=1, W=800, H=700;

/* The stocks, as numbers. Read them against the table in darkroom.md section 4.
   ev    exposure offset in stops         wb    white balance multipliers (r, g, b), in linear light
   con   tone-curve contrast (1 = normal)  lift, top   the print's black and white points (0-1)
   sh, hi  colour added to the shadows / highlights (r, g, b), after the curve
   sat   saturation (1 = as shot)         soft  softening, 0-1
   hal   halation strength, halT its threshold (linear light), halR its radius in 1/8 cells, halC its colour
   grain amplitude at mid grey, gsize the grain's size in 1600-wide print pixels
   vig   vignette at the corners           edge  the edge-print colour on strips and contact sheets (rgb)
   mono  black and white                   base  the film base on strips (rgb), holes the sprocket holes */
var STOCKS={
  portrait:{ev:0.1, wb:[1.05,1.0,0.93], con:0.86, lift:0.035, top:0.975, sh:[0.012,0.004,-0.008], hi:[0.035,0.02,-0.01], sat:0.94,
    soft:0.35, hal:0.18, halT:0.75, halR:2, halC:[1,0.55,0.35], grain:0.030, gsize:1.2, vig:0.16, edge:[236,140,52]},
  sunny:   {ev:0.05, wb:[1.1,1.02,0.84], con:1.04, lift:0.025, top:0.97, sh:[0.02,0.008,-0.03], hi:[0.04,0.03,-0.05], sat:1.2,
    soft:0.3, hal:0.2, halT:0.7, halR:2, halC:[1,0.6,0.3], grain:0.055, gsize:1.7, vig:0.26, edge:[244,186,24]},
  verde:   {ev:0, wb:[0.96,1.02,1.03], con:1.0, lift:0.03, top:0.975, sh:[-0.035,0.018,0.02], hi:[0.018,-0.012,0.02], sat:1.1,
    soft:0.3, hal:0.15, halT:0.75, halR:2, halC:[1,0.55,0.4], grain:0.045, gsize:1.5, vig:0.2, edge:[52,168,84]},
  pastel:  {ev:0.4, wb:[1.0,1.01,1.02], con:0.7, lift:0.075, top:0.985, sh:[0,0.012,0.014], hi:[-0.035,0.012,0.012], sat:0.76,
    soft:0.45, hal:0.12, halT:0.8, halR:3, halC:[1,0.7,0.55], grain:0.028, gsize:1.2, vig:0.1, edge:[134,214,204]},
  tungsten:{ev:0.05, wb:[0.86,0.97,1.14], con:1.0, lift:0.03, top:0.97, sh:[-0.012,0.004,0.02], hi:[0.012,0,-0.006], sat:1.06,
    soft:0.3, hal:2, halT:0.62, halR:3, halC:[1,0.1,0.04], grain:0.026, gsize:1.0, vig:0.2, edge:[222,38,46]},
  noir:    {ev:0, wb:[1,1,1], con:1.5, lift:0.02, top:0.98, sh:[0,0,0], hi:[0,0,0], sat:0, mono:true,
    soft:0.25, hal:0, halT:1, halR:2, halC:[1,1,1], grain:0.065, gsize:2.2, vig:0.24, edge:[24,24,24], base:[214,212,206], holes:[250,250,246], text:[80,80,78]},
  expired: {ev:-0.2, wb:[1,1,1], con:0.66, lift:0.1, top:0.94, sh:[0,0,0], hi:[0,0,0], sat:0.68,
    soft:0.4, hal:0.15, halT:0.7, halR:3, halC:[1,0.55,0.4], grain:0.07, gsize:1.8, vig:0.3, edge:[156,154,144]}
};
var ORDER=["portrait","sunny","verde","pastel","tungsten","noir","expired"];
/* colour film on a strip: a dark base, light holes; NOIR's base is clear grey (see `base` above) */
var BASE=[24,20,17], HOLES=[236,232,222], TEXT=[150,140,124];

/* ---------- seeded randomness ---------- */
function mix(a,b,c){
  var h=(a^0x9e3779b9)>>>0;
  h=Math.imul(h^(b>>>0),0x85ebca6b)>>>0; h^=h>>>13;
  h=Math.imul(h^(c>>>0),0xc2b2ae35)>>>0; h^=h>>>16;
  return h>>>0;
}
/* mulberry32: one stream of floats in [0,1) per seed */
function rng(seed){
  var a=seed>>>0;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    var t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/* the develop seed: the roll's id and the moment it was developed (FNV-1a) */
function devSeed(id,at){
  var s=String(id)+":"+String(at), h=0x811c9dc5;
  for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  return h>>>0;
}
var SALT={fade:1, leak:2, drift:3, dust:4, grain:5};

/* the stock's numbers for this roll: an EXPIRED roll fades its own way, chosen by roll.seed */
function stockFor(id,rollSeed){
  var b=STOCKS[id]||STOCKS.portrait, s={}, k;
  for(k in b) s[k]=b[k];
  if(id==="expired"){
    var r=rng(mix(rollSeed,0,SALT.fade)), casts=[[1.12,0.9,1.08],[0.88,1.06,1.04],[1.1,1.04,0.82],[1.14,0.94,0.9],[0.94,1.02,1.12]];
    var c=casts[Math.floor(r()*casts.length)], amt=0.5+r()*0.5;
    s.wb=[1+(c[0]-1)*amt,1+(c[1]-1)*amt,1+(c[2]-1)*amt];
    s.lift=0.07+r()*0.08; s.top=0.9+r()*0.06; s.con=0.55+r()*0.2; s.sat=0.5+r()*0.3; s.ev=-0.35+r()*0.4;
    s.sh=[(c[0]-1)*0.15*amt,(c[1]-1)*0.15*amt,(c[2]-1)*0.15*amt]; s.hi=[(c[0]-1)*0.1,(c[1]-1)*0.1,(c[2]-1)*0.1];
  }
  return s;
}

/* Light leaks happen when the roll is loaded: frame 1 (the bit of film in the light while loading) is the likeliest,
   the roll's end now and then, the rest rarely. null or {side (0 left, 1 right), pos, spread, power, hue}. */
var LEAK_P={first:0.55, last:0.18, other:0.03};
function leakOf(rollSeed,n,size){
  var r=rng(mix(rollSeed,n,SALT.leak)), p=n===1?LEAK_P.first:n===size?LEAK_P.last:LEAK_P.other;
  if(r()>=p) return null;
  return {side:r()<(n===1?0.7:0.4)?0:1, pos:0.15+r()*0.7, spread:0.12+r()*0.3, power:0.45+r()*0.55, hue:r()};
}

/* ---------- tone ---------- */
var DEC=new Float32Array(256);
for(var i=0;i<256;i++){ var c=i/255; DEC[i]=c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); }
/* the print's density for an amount of light: an S-curve in stops round mid grey, between the paper's black and white.
   Indexed by sqrt(light/LMAX) so the shadows get their share of the 4096 steps. */
var LUTN=4096, LMAX=16;
function curveLut(s,contrast){
  var lut=new Float32Array(LUTN), k=0.5*s.con*Math.pow(1.15,contrast||0);
  for(var j=0;j<LUTN;j++){
    var q=j/(LUTN-1), lin=q*q*LMAX, x=Math.log(Math.max(lin,1e-5)/0.18)/Math.LN2, t=Math.exp(2*k*x);
    var y=t/(1+t);               /* 0.5 + 0.5 tanh(kx) */
    lut[j]=s.lift+(s.top-s.lift)*y;
  }
  return lut;
}
function look(lut,lin){ var q=Math.sqrt(lin<0?0:lin>LMAX?1:lin/LMAX); return lut[(q*(LUTN-1)+0.5)|0]; }

/* ---------- the frame ---------- */
/* src: {data (RGBA), w, h} of the latent image, or null (blank frame, or the latent was lost).
   o: {stock, rollSeed, size, res, n, exposure, contrast, dated, taken, blank, devSeed, v, scale (1: 800x700, 2: 1600x1400)}
   Returns {data: Uint8ClampedArray RGBA, w, h}. */
function develop(src,o){
  if(o.v!=null && o.v!==VERSION) throw new Error("develop v"+o.v+" is not known to this runtime");
  var s=stockFor(o.stock,o.rollSeed>>>0), scale=o.scale===2?2:1, N=W*H;
  var R=new Float32Array(N), G=new Float32Array(N), B=new Float32Array(N), HL=null;
  /* the lab's drift: a little for the whole roll, less per frame; black and white film has no colour to drift */
  var dr=rng(mix(o.devSeed>>>0,0,SALT.drift)), fr=rng(mix(o.devSeed>>>0,o.n,SALT.drift));
  var ev=s.ev+(dr()-0.5)*0.2+(fr()-0.5)*0.1+0.4*(o.exposure||0), gain=Math.pow(2,ev);
  var cd=[1+(dr()-0.5)*0.04+(fr()-0.5)*0.02, 1+(dr()-0.5)*0.03+(fr()-0.5)*0.015, 1+(dr()-0.5)*0.04+(fr()-0.5)*0.02];
  if(s.mono) cd=[1,1,1];
  var gr=gain*s.wb[0]*cd[0], gg=gain*s.wb[1]*cd[1], gb=gain*s.wb[2]*cd[2];
  var lut=curveLut(s,o.contrast||0), picture=!!(src && src.data && !o.blank);

  if(picture){
    var d=src.w===W && src.h===H ? src.data : resample(src.data,src.w,src.h,W,H);
    HL=new Float32Array(N);
    for(var p=0;p<N;p++){
      var q=p*4, r=DEC[d[q]]*gr, g=DEC[d[q+1]]*gg, b=DEC[d[q+2]]*gb, L=0.2126*r+0.7152*g+0.0722*b;
      HL[p]=L;
      if(s.mono){ r=0.3*DEC[d[q]]+0.59*DEC[d[q+1]]+0.11*DEC[d[q+2]]; r*=gain; g=r; b=r; }
      R[p]=look(lut,r); G[p]=look(lut,g); B[p]=look(lut,b);
    }
  }else{
    /* no picture: just the film. Fogged film ("light") prints bright in the stock's colour; unexposed film, or a
       frame whose latent was lost, prints the film's own dark base. */
    var lin=o.blank==="light" ? 6 : 0;
    var fR=look(lut,lin*s.wb[0]), fG=look(lut,lin*s.wb[1]), fB=look(lut,lin*s.wb[2]);
    if(s.mono){ fG=fR; fB=fR; }
    R.fill(fR); G.fill(fG); B.fill(fB);
  }
  /* 2. colour: split tone, then saturation */
  if(!s.mono){
    for(p=0;p<N;p++){
      var rr=R[p], gg2=G[p], bb=B[p], Y=0.299*rr+0.587*gg2+0.114*bb, s2=(1-Y)*(1-Y), h2=Y*Y;
      rr+=s.sh[0]*s2+s.hi[0]*h2; gg2+=s.sh[1]*s2+s.hi[1]*h2; bb+=s.sh[2]*s2+s.hi[2]*h2;
      Y=0.299*rr+0.587*gg2+0.114*bb;
      R[p]=Y+(rr-Y)*s.sat; G[p]=Y+(gg2-Y)*s.sat; B[p]=Y+(bb-Y)*s.sat;
    }
  }
  if(picture){
    /* 3. softening */
    soften(R,s.soft); if(s.mono){ G.set(R); B.set(R); } else { soften(G,s.soft); soften(B,s.soft); }
    /* 4. halation: light scattered back through the film from the bright parts, in the stock's colour */
    if(s.hal>0) halate(R,G,B,HL,s);
  }

  var OW=W*scale, OH=H*scale;
  if(scale===2){ R=up2(R); G=s.mono?R:up2(G); B=s.mono?R:up2(B); }
  var out=new Uint8ClampedArray(OW*OH*4);
  /* 5-7. grain, vignette, light leak: one pass at the output size */
  var resF=o.res===2?0.68:1, amp=s.grain*resF, cell=s.gsize*resF*scale/2;
  var noise=grainField(OW,OH,cell,rng(mix(o.devSeed>>>0,o.n,SALT.grain)));
  var leak=leakOf(o.rollSeed>>>0,o.n,o.size), lc=leak ? leakColour(leak,s) : null;
  var cx=OW/2, cy=OH/2;
  for(var y=0;y<OH;y++){
    var dy=(y+0.5-cy)/cy, dy2=dy*dy, ly=leak ? Math.exp(-Math.pow((y+0.5)/OH-leak.pos,2)/(2*0.22*0.22)) : 0;
    for(var x=0;x<OW;x++){
      var k=y*OW+x, dx=(x+0.5-cx)/cx, rq=(dx*dx+dy2)/2, v=1-s.vig*rq*rq;
      var rv=R[k], gv=G[k], bv=B[k], Yv=0.299*rv+0.587*gv+0.114*bv;
      var n=noise[k]*amp*(0.3+2.8*Yv*(1-Yv));
      rv=(rv+n)*v; gv=(gv+n)*v; bv=(bv+n)*v;
      if(leak){
        var ex=leak.side===0 ? (x+0.5)/OW : 1-(x+0.5)/OW, I=leak.power*Math.exp(-ex/leak.spread)*(0.35+0.65*ly);
        rv+=(1-rv)*I*lc[0]; gv+=(1-gv)*I*lc[1]; bv+=(1-bv)*I*lc[2];
      }
      var q2=k*4;
      out[q2]=rv*255+0.5; out[q2+1]=gv*255+0.5; out[q2+2]=bv*255+0.5; out[q2+3]=255;
    }
  }
  dust(out,OW,OH,scale,rng(mix(o.devSeed>>>0,o.n,SALT.dust)));
  /* 8. the date back */
  if(picture && o.dated && o.taken) stamp(out,OW,OH,scale,o.taken,s.mono);
  return {data:out, w:OW, h:OH};
}

/* the leak's colour: orange-red to yellow on colour film, plain fog on black and white */
function leakColour(leak,s){
  if(s.mono) return [0.9,0.9,0.9];
  var h=leak.hue;
  return [1, 0.3+0.45*h, 0.08+0.22*h];
}

/* bilinear resampling of RGBA bytes (a latent of another size) */
function resample(d,sw,sh,dw,dh){
  var out=new Uint8ClampedArray(dw*dh*4);
  for(var y=0;y<dh;y++){
    var fy=Math.max(0,Math.min(sh-1,(y+0.5)*sh/dh-0.5)), y0=fy|0, y1=Math.min(sh-1,y0+1), wy=fy-y0;
    for(var x=0;x<dw;x++){
      var fx=Math.max(0,Math.min(sw-1,(x+0.5)*sw/dw-0.5)), x0=fx|0, x1=Math.min(sw-1,x0+1), wx=fx-x0;
      for(var c=0;c<4;c++){
        var a=d[(y0*sw+x0)*4+c]*(1-wx)+d[(y0*sw+x1)*4+c]*wx, b=d[(y1*sw+x0)*4+c]*(1-wx)+d[(y1*sw+x1)*4+c]*wx;
        out[(y*dw+x)*4+c]=a*(1-wy)+b*wy+0.5;
      }
    }
  }
  return out;
}
/* a 1-2-1 blur in both directions, mixed in by `amt` */
function soften(A,amt){
  if(!(amt>0)) return;
  var T=new Float32Array(A.length), x, y, k;
  for(y=0;y<H;y++){ k=y*W; T[k]=(3*A[k]+A[k+1])/4; for(x=1;x<W-1;x++) T[k+x]=(A[k+x-1]+2*A[k+x]+A[k+x+1])/4; T[k+W-1]=(A[k+W-2]+3*A[k+W-1])/4; }
  for(y=0;y<H;y++){
    var up=y>0?-W:0, dn=y<H-1?W:0;
    for(x=0;x<W;x++){ k=y*W+x; var b=(T[k+up]+2*T[k]+T[k+dn])/4; A[k]+= (b-A[k])*amt; }
  }
}
/* halation, worked out at 1/8 size: the light above the threshold, spread by three box blurs, laid back on by screen */
function halate(R,G,B,HL,s){
  var S=8, hw=Math.ceil(W/S), hh=Math.ceil(H/S), M=new Float32Array(hw*hh), C=new Float32Array(hw*hh), x, y;
  for(y=0;y<H;y++) for(x=0;x<W;x++){ var e=HL[y*W+x]-s.halT; if(e>0) M[(y>>3)*hw+(x>>3)]+=Math.min(e,3); }
  for(var i=0;i<M.length;i++) M[i]/=S*S;
  for(var pass=0;pass<3;pass++){ boxH(M,C,hw,hh,s.halR); boxV(C,M,hw,hh,s.halR); }
  var amt=s.hal*4, cr=s.halC[0]*amt, cg=s.halC[1]*amt, cb=s.halC[2]*amt;
  for(y=0;y<H;y++){
    var fy=Math.max(0,Math.min(hh-1,(y+0.5)/S-0.5)), y0=fy|0, y1=Math.min(hh-1,y0+1), wy=fy-y0;
    for(x=0;x<W;x++){
      var fx=Math.max(0,Math.min(hw-1,(x+0.5)/S-0.5)), x0=fx|0, x1=Math.min(hw-1,x0+1), wx=fx-x0;
      var h=(M[y0*hw+x0]*(1-wx)+M[y0*hw+x1]*wx)*(1-wy)+(M[y1*hw+x0]*(1-wx)+M[y1*hw+x1]*wx)*wy;
      if(h<=0) continue;
      /* a broad bright area is not tinted, only what lies round it: the glow fades out as the pixel itself nears the threshold */
      var k=y*W+x, own=HL[k]/s.halT; if(own>=1) continue;
      h=h/(1+h)*(1-own*own);
      R[k]+=(1-R[k])*Math.min(1,h*cr); G[k]+=(1-G[k])*Math.min(1,h*cg); B[k]+=(1-B[k])*Math.min(1,h*cb);
    }
  }
}
function boxH(A,O,w,h,r){
  for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ var sum=0, n=0; for(var j=-r;j<=r;j++){ var xx=x+j; if(xx>=0&&xx<w){ sum+=A[y*w+xx]; n++; } } O[y*w+x]=sum/n; } }
}
function boxV(A,O,w,h,r){
  for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ var sum=0, n=0; for(var j=-r;j<=r;j++){ var yy=y+j; if(yy>=0&&yy<h){ sum+=A[yy*w+x]; n++; } } O[y*w+x]=sum/n; } }
}
/* 800x700 floats to 1600x1400, bilinear: the enlarger's smooth picture, before the grain */
function up2(A){
  var OW=W*2, OH=H*2, O=new Float32Array(OW*OH);
  for(var y=0;y<OH;y++){
    var fy=Math.max(0,Math.min(H-1,(y+0.5)/2-0.5)), y0=fy|0, y1=Math.min(H-1,y0+1), wy=fy-y0;
    for(var x=0;x<OW;x++){
      var fx=Math.max(0,Math.min(W-1,(x+0.5)/2-0.5)), x0=fx|0, x1=Math.min(W-1,x0+1), wx=fx-x0;
      O[y*OW+x]=(A[y0*W+x0]*(1-wx)+A[y0*W+x1]*wx)*(1-wy)+(A[y1*W+x0]*(1-wx)+A[y1*W+x1]*wx)*wy;
    }
  }
  return O;
}
/* grain: noise of about unit spread. A cell of one output pixel or less is plain per-pixel noise; a larger cell is
   value noise on a grid of that size, so the clumps are bigger without being blocky. */
function grainField(w,h,cell,r){
  var F=new Float32Array(w*h), x, y;
  if(cell<=1.05){ for(var i=0;i<F.length;i++) F[i]=(r()+r()+r()-1.5)*2; return F; }
  var gw=Math.ceil(w/cell)+2, gh=Math.ceil(h/cell)+2, L=new Float32Array(gw*gh);
  for(i=0;i<L.length;i++) L[i]=(r()+r()+r()-1.5)*3.2;
  for(y=0;y<h;y++){
    var fy=y/cell, y0=fy|0, wy=fy-y0;
    for(x=0;x<w;x++){
      var fx=x/cell, x0=fx|0, wx=fx-x0, k=y0*gw+x0;
      F[y*w+x]=(L[k]*(1-wx)+L[k+1]*wx)*(1-wy)+(L[k+gw]*(1-wx)+L[k+gw+1]*wx)*wy;
    }
  }
  return F;
}
/* dust on the negative prints as white specks, now and then a hair-thin scratch along the film */
function dust(out,w,h,scale,r){
  var specks=Math.floor(Math.pow(r(),2.2)*6);
  for(var i=0;i<specks;i++){
    var cx=r()*w, cy=r()*h, rad=(0.7+r()*1.8)*scale, a=0.55+r()*0.4;
    blot(out,w,h,cx,cy,rad,a);
  }
  if(r()<0.12){
    var y=Math.floor((0.1+r()*0.8)*h), x0=Math.floor(r()*w*0.5), len=Math.floor((0.2+r()*0.6)*w), a2=0.35+r()*0.3;
    for(var t=0;t<scale;t++) for(var x=x0;x<Math.min(w,x0+len);x++){
      var wav=Math.round(Math.sin(x/(97*scale))*1.5*scale), yy=y+t+wav;
      if(yy>=0&&yy<h) light(out,(yy*w+x)*4,a2,[1,1,1]);
    }
  }
}
function blot(out,w,h,cx,cy,rad,a){
  for(var y=Math.max(0,Math.floor(cy-rad-1));y<Math.min(h,Math.ceil(cy+rad+1));y++)
    for(var x=Math.max(0,Math.floor(cx-rad-1));x<Math.min(w,Math.ceil(cx+rad+1));x++){
      var d=Math.sqrt((x+0.5-cx)*(x+0.5-cx)+(y+0.5-cy)*(y+0.5-cy)), m=Math.max(0,Math.min(1,rad-d+0.5));
      if(m>0) light(out,(y*w+x)*4,a*m,[1,1,1]);
    }
}
/* screen-blend a colour into one pixel */
function light(out,q,a,c){
  out[q]+=(255-out[q])*a*c[0]+0.5; out[q+1]+=(255-out[q+1])*a*c[1]+0.5; out[q+2]+=(255-out[q+2])*a*c[2]+0.5;
}

/* ---------- the date back: '26 10 15 in seven-segment digits, burnt orange into the lower right ---------- */
var SEG={"0":"abcdef","1":"bc","2":"abdeg","3":"abcdg","4":"bcfg","5":"acdfg","6":"acdefg","7":"abc","8":"abcdefg","9":"abcdfg"};
function dateText(ts){
  var d=new Date(ts), p=function(v){ return (v<10?"0":"")+v; };
  return "'"+p(d.getFullYear()%100)+" "+p(d.getMonth()+1)+" "+p(d.getDate());
}
function stamp(out,w,h,scale,ts,mono){
  var text=dateText(ts), dh=Math.round(h*0.046), dw=Math.round(dh*0.56), t=Math.max(2,Math.round(dh*0.15)), gap=Math.round(dw*0.42);
  var widths=text.split("").map(function(ch){ return ch==="'" ? t : ch===" " ? Math.round(dw*0.5) : dw; });
  var tw=widths.reduce(function(a,b){ return a+b+gap; },0)-gap;
  var pad=t*3, bx=Math.round(w*0.94)-tw-pad, by=Math.round(h*0.935)-dh-pad, bw=tw+2*pad, bh=dh+2*pad;
  var M=new Float32Array(bw*bh), x0=pad;
  var rect=function(x,y,rw,rh){ for(var yy=y;yy<y+rh;yy++) for(var xx=x;xx<x+rw;xx++) if(xx>=0&&yy>=0&&xx<bw&&yy<bh) M[yy*bw+xx]=1; };
  text.split("").forEach(function(ch,i){
    var segs=SEG[ch], X=x0, Y=pad, mid=Y+Math.round((dh-t)/2);
    if(ch==="'") rect(X,Y,t,Math.round(dh*0.3));
    if(segs) segs.split("").forEach(function(sg){
      if(sg==="a") rect(X+1,Y,dw-2,t);
      else if(sg==="g") rect(X+1,mid,dw-2,t);
      else if(sg==="d") rect(X+1,Y+dh-t,dw-2,t);
      else if(sg==="f") rect(X,Y+1,t,Math.round(dh/2)-1);
      else if(sg==="b") rect(X+dw-t,Y+1,t,Math.round(dh/2)-1);
      else if(sg==="e") rect(X,mid+1,t,dh-(mid-Y)-2);
      else if(sg==="c") rect(X+dw-t,mid+1,t,dh-(mid-Y)-2);
    });
    x0+=widths[i]+gap;
  });
  /* the LED's glow on the film: the segments blurred, laid under the sharp core */
  var Gl=new Float32Array(bw*bh), T=new Float32Array(bw*bh), r=Math.max(1,Math.round(t*0.9));
  boxH(M,T,bw,bh,r); boxV(T,Gl,bw,bh,r);
  var core=mono?[0.95,0.95,0.95]:[1,0.62,0.25], glow=mono?[0.7,0.7,0.7]:[1,0.28,0.08];
  for(var y=0;y<bh;y++) for(var x=0;x<bw;x++){
    var X2=bx+x, Y2=by+y; if(X2<0||Y2<0||X2>=w||Y2>=h) continue;
    var m=M[y*bw+x], g=Gl[y*bw+x], q=(Y2*w+X2)*4;
    if(g>0) light(out,q,Math.min(1,g*0.85),glow);
    if(m>0) light(out,q,0.88,core);
  }
}

/* ---------- smaller copies, for strips and contact sheets ---------- */
/* area average of RGBA bytes to dw x dh */
function shrink(img,dw,dh){
  var sw=img.w, sh=img.h, d=img.data, out=new Uint8ClampedArray(dw*dh*4);
  for(var y=0;y<dh;y++){
    var y0=Math.floor(y*sh/dh), y1=Math.max(y0+1,Math.floor((y+1)*sh/dh));
    for(var x=0;x<dw;x++){
      var x0=Math.floor(x*sw/dw), x1=Math.max(x0+1,Math.floor((x+1)*sw/dw)), r=0, g=0, b=0, n=0;
      for(var yy=y0;yy<y1;yy++) for(var xx=x0;xx<x1;xx++){ var q=(yy*sw+xx)*4; r+=d[q]; g+=d[q+1]; b+=d[q+2]; n++; }
      var o=(y*dw+x)*4; out[o]=r/n+0.5; out[o+1]=g/n+0.5; out[o+2]=b/n+0.5; out[o+3]=255;
    }
  }
  return {data:out, w:dw, h:dh};
}

/* what strips and contact sheets print in the stock's colours */
function edgeOf(id){ var s=STOCKS[id]||STOCKS.portrait; return {edge:s.edge, base:s.base||BASE, holes:s.holes||HOLES, text:s.text||TEXT}; }

window.LopdaDevelop={VERSION:VERSION, W:W, H:H, STOCKS:STOCKS, ORDER:ORDER, LEAK_P:LEAK_P,
  develop:develop, devSeed:devSeed, leakOf:leakOf, stockFor:stockFor, shrink:shrink, edgeOf:edgeOf, dateText:dateText, rng:rng, mix:mix};
})(Math,Float32Array,Uint8ClampedArray);
