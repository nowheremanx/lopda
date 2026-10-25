/*
 * Lo-PDA runtime: the built-in pet's art. A species pack is art and numbers only: the 32 x 32 pet frames,
 * the growth stages and the adult forms, props, icons, souvenirs, and the 162 x 120 room painter.
 * Pure functions, no DOM, no canvas, no storage: drawRoom writes tone indices into a plain buffer and the
 * program turns that into ImageData. The grids stay as arrays of text rows so they are editable by hand.
 *
 * The 32 px style (owner-approved sample, tmp-playtest/art32): four tones only, a 2 px ink wall, a mid body
 * with a dark edge down the right and along the bottom, no body pattern and no paper noise. A pet's own
 * look is its antenna (six silhouettes, PACKS.chip.marks.ant) and its eye shape (round, wide, sleepy);
 * every expression is built from those parts. The room is the old room at double resolution: wall, window,
 * calendar, bookshelf, bed, rug, bowl, piles, the pet, a prop, the sign, Zz and a small souvenir shelf.
 *
 * Old saves carry marks {ant: 0-3, pat: 0-3, eye: 0-2}. The antenna index still means the same slot in the
 * six-entry list, the eye index the same slot in the three-entry list, and `pat` is ignored: the body has
 * no pattern any more (see markAnt/markEye below, which also keep accepting the new names).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

/* Tone order is the frame/index order used everywhere else: ink, dark, mid, paper. */
var TONES=["#1f2a14","#4a5a32","#7d8a58","#a3ad7e"];
var TONE_OF={k:0,d:1,m:2,p:3};
var DARK=[0,0,1,2];
var N=32;

function rows(g){ return g.map(function(r){ return String(r).split(""); }); }
function join(a){ return a.map(function(r){ return r.join(""); }); }
function setc(a,r,c,v){ if(a[r] && a[r][c]!==undefined) a[r][c]=v; }
function gridWidth(g){ return g && g.length ? String(g[0]).length : 0; }
function gridHeight(g){ return g ? g.length : 0; }
function isGrid(g){
  if(!g || !g.length || !g[0] || !String(g[0]).length) return false;
  var w=String(g[0]).length;
  for(var r=0;r<g.length;r++){
    var row=String(g[r]);
    if(row.length!==w || !/^[.kdmp]+$/.test(row)) return false;
  }
  return true;
}
function blankGrid(w,h,ch){
  var row="", out=[];
  for(var c=0;c<w;c++) row+=ch||".";
  for(var r=0;r<h;r++) out.push(row);
  return out;
}
/* The calendar and flag font at double size: five by seven block digits, one column of air between two.
   The old font was three by five; the room draws this one at 2x, the flag at 1:1. */
var DIGITS={
  "0":["kkkkk","k...k","k...k","k...k","k...k","k...k","kkkkk"],
  "1":["..k..",".kk..","..k..","..k..","..k..","..k..","kkkkk"],
  "2":["kkkkk","....k","....k","kkkkk","k....","k....","kkkkk"],
  "3":["kkkkk","....k","....k","kkkkk","....k","....k","kkkkk"],
  "4":["k...k","k...k","k...k","kkkkk","....k","....k","....k"],
  "5":["kkkkk","k....","k....","kkkkk","....k","....k","kkkkk"],
  "6":["kkkkk","k....","k....","kkkkk","k...k","k...k","kkkkk"],
  "7":["kkkkk","....k","....k","...k.","..k..","..k..","..k.."],
  "8":["kkkkk","k...k","k...k","kkkkk","k...k","k...k","kkkkk"],
  "9":["kkkkk","k...k","k...k","kkkkk","....k","....k","kkkkk"]
};
function digitGrid(n){
  var d=String(n).charAt(0);
  return (DIGITS[d]||DIGITS["0"]).slice();
}
/* numberGrid(24) -> five wide, seven high; numberGrid(124) -> eleven wide with our one-column gap. */
function numberGrid(n){
  var s=String(Math.max(0,Math.min(99,Number(n)||0)));
  if(s.length<2) return digitGrid(s);
  var a=rows(digitGrid(s.charAt(0))), b=rows(digitGrid(s.charAt(1))), out=[];
  for(var r=0;r<7;r++) out.push(a[r].join("")+"."+b[r].join(""));
  return out;
}

/* ---------- the 32 x 32 grid toolkit ------------------------------------------------------------ */
function blank32(){
  var g=[], r, c, row;
  for(r=0;r<N;r++){
    row=[];
    for(c=0;c<N;c++) row.push(".");
    g.push(row);
  }
  return g;
}
function px(g,x,y,ch){
  if(y>=0 && y<g.length && x>=0 && x<g[y].length) g[y][x]=ch;
}
function fill(g,x,y,w,h,ch){
  for(var r=0;r<h;r++) for(var c=0;c<w;c++) px(g,x+c,y+r,ch);
}
function hline(g,x,y,w,ch){ fill(g,x,y,w,1,ch); }
/* a rounded-rectangle mask; the corner radius is measured from the cell centres. */
function roundMask(w,h,r){
  var m=[], y, x;
  for(y=0;y<h;y++){
    m.push([]);
    for(x=0;x<w;x++){
      var ax=x+0.5, ay=y+0.5, dx=0, dy=0;
      if(ax<r) dx=r-ax; else if(ax>w-r) dx=ax-(w-r);
      if(ay<r) dy=r-ay; else if(ay>h-r) dy=ay-(h-r);
      m[y].push(dx*dx+dy*dy<=r*r+0.001);
    }
  }
  return m;
}
/* the chip body: 2 px ink wall, mid fill, dark on the right and the bottom. */
function drawBody(g,box){
  var bx=box[0], by=box[1], bw=box[2], bh=box[3], r=box[4];
  var m=roundMask(bw,bh,r), inside=[], x, y, dx, dy;
  function inMask(xx,yy){ return xx>=0 && yy>=0 && xx<bw && yy<bh && m[yy][xx]; }
  for(y=0;y<bh;y++){
    for(x=0;x<bw;x++){
      if(!m[y][x]) continue;
      var edge=false;
      for(dy=-2;dy<=2 && !edge;dy++){
        for(dx=-2;dx<=2;dx++) if(!inMask(x+dx,y+dy)){ edge=true; break; }
      }
      if(edge) px(g,bx+x,by+y,"k"); else inside.push([x,y]);
    }
  }
  var maxX=-1, maxY=-1;
  for(var i=0;i<inside.length;i++){
    if(inside[i][0]>maxX) maxX=inside[i][0];
    if(inside[i][1]>maxY) maxY=inside[i][1];
  }
  for(i=0;i<inside.length;i++){
    var q=inside[i], ch="m";
    if(q[0]>=maxX-1 || q[1]>=maxY-1) ch="d";
    px(g,bx+q[0],by+q[1],ch);
  }
}

/* Three stage bodies. Every shape starts at row 10 and leaves rows 29-30 for the legs and row 31
   empty, so a one-pixel step or squash never cuts a foot or the antenna. */
var STAGES={
  baby:{
    body:[6,10,20,19,7], eyeY:15, eyeH:4, browY:13, mouthY:22,
    arms:{rows:[19],len:2,thick:2},
    legs:{cols:[[10,11],[20,21]],top:29,len:2,feet:true}
  },
  child:{
    body:[5,10,22,19,5], eyeY:15, eyeH:3, browY:13, mouthY:22,
    arms:{rows:[17,21],len:3,thick:2},
    legs:{cols:[[9,10],[15,16],[21,22]],top:29,len:2}
  },
  adult:{
    body:[4,10,24,19,3], eyeY:15, eyeH:3, browY:13, mouthY:22,
    arms:{rows:[15,19,23],len:3,thick:2},
    legs:{cols:[[9,10],[15,16],[21,22]],top:29,len:2}
  }
};
/* little pins: arms out of the sides, legs under the body, all ink; walk and dangle move the feet. */
function drawPins(g,stage,mode,box){
  var c=STAGES[stage], body=box||c.body, bx=body[0], bw=body[2], i, k, x;
  for(i=0;i<c.arms.rows.length;i++){
    var ar=c.arms.rows[i];
    for(k=0;k<c.arms.thick;k++){
      for(var a=1;a<=c.arms.len;a++){
        px(g,bx-a,ar+k,"k");
        px(g,bx+bw-1+a,ar+k,"k");
      }
    }
  }
  var legs=c.legs, last=legs.cols.length-1;
  for(i=0;i<legs.cols.length;i++){
    var c0=legs.cols[i][0], c1=legs.cols[i][1];
    for(var r=0;r<legs.len;r++){
      var x0=c0, x1=c1;
      if(r===legs.len-1){
        if(mode==="walk1" && (i===0 || i===last)){
          if(i===0){ x0-=1; x1-=1; } else { x0+=1; x1+=1; }
        } else if(mode==="walk2" && (i===0 || i===last)){
          if(i===0){ x0+=1; x1+=1; } else { x0-=1; x1-=1; }
        } else if(mode==="dangle"){
          x0-=1; x1+=1;
        }
      }
      if(legs.feet && r===legs.len-1){ x0-=1; x1+=1; }
      for(x=x0;x<=x1;x++) px(g,x,legs.top+r,"k");
    }
  }
}

/* ---------- antennas: six silhouettes on a 12-wide grid ----------------------------------------
   The stalk is columns 5-6, so the renderer puts the grid at x = 10 (front) or 11 (side) and at
   y = headTop - height + 1: the last row is the root that meets the head's ink rim. */
var ANTENNAS=[
  {id:"orb", grid:[
    ".....kk.....",
    "...kkmmkk...",
    "..kmmmmmmk..",
    "..kmmmmmmk..",
    "..kmmmmmdk..",
    "...kmmmdk...",
    "....kkkk....",
    ".....kk.....",
    ".....kk....."
  ]},
  {id:"triangle", grid:[
    ".....kk.....",
    "....kmmk....",
    "...kmmmmk...",
    "..kmmmmmdk..",
    ".kmmmmmmmdk.",
    ".kkkkkkkkkk.",
    ".....kk.....",
    ".....kk....."
  ]},
  {id:"crook", grid:[
    "........kk..",
    ".......kk...",
    "......kk....",
    ".....kk.....",
    ".....kk.....",
    ".....kk.....",
    ".....kk.....",
    ".....kk.....",
    ".....kk.....",
    ".....kk....."
  ]},
  {id:"curl", grid:[
    "....kkkk....",
    "...k....k...",
    "..k......k..",
    "..k..kk..k..",
    "..k.k..k.k..",
    "...k.kk.k...",
    "....k..k....",
    ".....kk.....",
    ".....kk.....",
    ".....kk....."
  ]},
  {id:"prongs", grid:[
    "...kk..kk...",
    "...kk..kk...",
    "...kk..kk...",
    "....kkkk....",
    ".....kk.....",
    ".....kk.....",
    ".....kk.....",
    ".....kk....."
  ]},
  {id:"star", grid:[
    ".....kk.....",
    "....kkkk....",
    "..kkkmmkkk..",
    "....kkkk....",
    ".....kk.....",
    ".....kk.....",
    ".....kk.....",
    ".....kk....."
  ]}
];
function drawAntenna(g,id,headTop,left){
  var ant=null, i;
  for(i=0;i<ANTENNAS.length;i++) if(ANTENNAS[i].id===id) ant=ANTENNAS[i];
  if(!ant) ant=ANTENNAS[0];
  var grid=ant.grid, y=headTop-grid.length+1, r, c, ch;
  for(r=0;r<grid.length;r++){
    var row=String(grid[r]);
    for(c=0;c<row.length;c++){
      ch=row.charAt(c);
      if(ch!==".") px(g,left+c,y+r,ch);
    }
  }
}

/* ---------- the face: the rolled eye shape x the expression ------------------------------------- */
var EYE_W={round:3,wide:4,sleepy:3};
var EYE_IDS=["round","wide","sleepy"];
function eyeOpen(g,shape,x,y,h){
  var w=EYE_W[shape]||3;
  if(shape==="sleepy"){
    fill(g,x,y,w,1,"d");
    fill(g,x,y+1,w,h-1,"k");
    px(g,x,y+1,"p");
  } else {
    fill(g,x,y,w,h,"k");
    px(g,x,y,"p");
  }
}
function eyeClosed(g,x,y,w){
  hline(g,x-1,y+2,w+2,"k");
  px(g,x-1,y+3,"k");
}
function mouthSmile(g,mx,my,w){
  px(g,mx,my,"k"); px(g,mx+w-1,my,"k");
  for(var x=mx+1;x<mx+w-1;x++) px(g,x,my+1,"k");
}
function mouthFrown(g,mx,my,w){
  for(var x=mx+1;x<mx+w-1;x++) px(g,x,my,"k");
  px(g,mx,my+1,"k"); px(g,mx+w-1,my+1,"k");
}
function mouthFlat(g,mx,my,w){
  for(var x=mx+1;x<mx+w-1;x++) px(g,x,my,"k");
}
function mouthOpenSmile(g,mx,my,w){
  px(g,mx,my,"k"); px(g,mx+w-1,my,"k");
  for(var x=mx+1;x<mx+w-1;x++) px(g,x,my+1,"k");
  px(g,mx+1,my+2,"k"); px(g,mx+w-2,my+2,"k");
  for(var x2=mx+2;x2<mx+w-2;x2++) px(g,x2,my+2,"d");
  for(var x3=mx+2;x3<mx+w-2;x3++) px(g,x3,my+3,"k");
}
function mouthOval(g,mx,my,w){
  px(g,mx,my,"k"); px(g,mx+w-1,my,"k");
  for(var x=mx+1;x<mx+w-1;x++){ px(g,x,my,"k"); px(g,x,my+3,"k"); }
  for(var y=my+1;y<my+3;y++){
    px(g,mx,y,"k"); px(g,mx+w-1,y,"k");
    for(var x2=mx+1;x2<mx+w-1;x2++) px(g,x2,y,"d");
  }
}
/* name -> the eye expression and the mouth; the pack's own words are only aliases of these. */
var FACE_EXPR={
  idle1:{eye:"open",mouth:"smile"},
  idle2:{eye:"open",mouth:"smile"},
  idle:{eye:"open",mouth:"smile"},
  look:{eye:"open",mouth:"smile"},
  hold:{eye:"open",mouth:"smile"},
  walk1:{eye:"open",mouth:"smile"},
  walk2:{eye:"open",mouth:"smile"},
  sit:{eye:"open",mouth:"smile"},
  blink:{eye:"closed",mouth:"smile"},
  eat1:{eye:"open",mouth:"oval"},
  eat2:{eye:"open",mouth:"chew"},
  happy:{eye:"happy",mouth:"open",brow:"happy"},
  sleep:{eye:"sleep",mouth:"none"},
  wait:{eye:"wait",mouth:"flat"},
  surprised:{eye:"wow",mouth:"o",brow:"happy"},
  sad:{eye:"open",mouth:"frown",brow:"sad"},
  angry:{eye:"angry",mouth:"tight",brow:"angry"},
  sulk:{eye:"sulk",mouth:"frown"},
  jump:{eye:"happy",mouth:"open",brow:"happy"},
  fall:{eye:"wow",mouth:"o"},
  catch:{eye:"happy",mouth:"open",brow:"happy"},
  lookL:{eye:"open",mouth:"smile",dx:-1},
  lookR:{eye:"open",mouth:"smile",dx:1},
  "look-left":{eye:"open",mouth:"smile",dx:-1},
  "look-right":{eye:"open",mouth:"smile",dx:1},
  /* raw face words a renderer may pass; the program's own names win */
  open:{eye:"open",mouth:"smile"},
  closed:{eye:"closed",mouth:"smile"},
  none:{eye:"open",mouth:"smile"},
  down:{eye:"wait",mouth:"flat"},
  wow:{eye:"wow",mouth:"o"}
};
function exprFor(name){ return FACE_EXPR[name]||FACE_EXPR.idle1; }
function drawEyeSet(g,stage,shape,e){
  var c=STAGES[stage], h=c.eyeH, y=c.eyeY, w=EYE_W[shape]||3;
  var L=14-w, R=18, dx=e.dx||0, i, x;
  if(e.eye==="closed" || e.eye==="sleep"){
    eyeClosed(g,L+dx,y,w);
    eyeClosed(g,R+dx,y,w);
    return;
  }
  var hh=h, ey=y;
  if(e.eye==="happy") hh=Math.min(h,3);
  if(e.eye==="wow") hh=h+1;
  if(e.eye==="wait") ey=y+1;
  if(e.eye==="sulk"){ eyeOpen(g,shape,L+1,y,h); eyeOpen(g,shape,R+1,y,h); }
  else { eyeOpen(g,shape,L+dx,ey,hh); eyeOpen(g,shape,R+dx,ey,hh); }
  if(e.eye==="angry" || e.eye==="sulk"){
    for(i=0;i<w;i++){ if(e.eye==="sulk"){ px(g,L+1+i,y,"d"); px(g,R+1+i,y,"d"); } else { px(g,L+i,y,"d"); px(g,R+i,y,"d"); } }
  }
}
function drawBrow(g,stage,e){
  var c=STAGES[stage], w=EYE_W[e.eyeShape]||3, L=14-w, R=18, by=c.browY, x;
  if(e.brow==="happy"){
    for(x=L;x<L+w;x++) px(g,x,by,"k");
    px(g,L-1,by+1,"k"); px(g,L+w,by+1,"k");
    for(x=R;x<R+w;x++) px(g,x,by,"k");
    px(g,R-1,by+1,"k"); px(g,R+w,by+1,"k");
  } else if(e.brow==="sad"){
    for(x=L;x<L+w;x++) px(g,x,by,"k");
    px(g,L,by+1,"k");
    for(x=R;x<R+w;x++) px(g,x,by,"k");
    px(g,R+w-1,by+1,"k");
  } else if(e.brow==="angry"){
    for(x=L;x<L+w;x++) px(g,x,by,"k");
    px(g,L+w-1,by+1,"k");
    for(x=R;x<R+w;x++) px(g,x,by,"k");
    px(g,R,by+1,"k");
  }
}
function drawMouth(g,stage,kind){
  var c=STAGES[stage], my=c.mouthY;
  if(kind==="none") return;
  if(kind==="smile"){ mouthSmile(g,13,my,6); return; }
  if(kind==="frown"){ mouthFrown(g,13,my,6); return; }
  if(kind==="flat"){ mouthFlat(g,13,my,6); return; }
  if(kind==="tight"){ mouthFlat(g,14,my,4); px(g,13,my+1,"k"); px(g,18,my+1,"k"); return; }
  if(kind==="open"){ mouthOpenSmile(g,12,my-1,8); return; }
  if(kind==="oval"){ mouthOval(g,13,my-1,6); return; }
  if(kind==="o"){ mouthOval(g,14,my-1,4); return; }
  if(kind==="chew"){ fill(g,14,my,4,1,"k"); px(g,15,my+1,"d"); px(g,16,my+1,"d"); return; }
}
function drawFace(g,stage,shape,name){
  var src=exprFor(name);
  var e={eye:src.eye,mouth:src.mouth,brow:src.brow,dx:src.dx,eyeShape:shape};
  drawEyeSet(g,stage,shape,e);
  drawBrow(g,stage,e);
  drawMouth(g,stage,e.mouth);
}

/* ---------- front frames ------------------------------------------------------------------------ */
function legsMode(name){
  if(name==="walk1") return "walk1";
  if(name==="walk2") return "walk2";
  if(name==="happy" || name==="jump" || name==="fall" || name==="catch") return "dangle";
  return "stand";
}
function moveY(g,dy){
  if(!dy) return g;
  var w=String(g[0]).length, blank="", out=[], r;
  for(r=0;r<w;r++) blank+=".";
  if(dy>0){
    for(r=0;r<dy;r++) out.push(blank);
    for(r=0;r<g.length-dy;r++) out.push(g[r]);
  } else {
    for(r=-dy;r<g.length;r++) out.push(g[r]);
    for(r=0;r<-dy;r++) out.push(blank);
  }
  return out;
}
function armsUp(g,stage){
  var b=STAGES[stage].body, bx=b[0], bw=b[2];
  px(g,bx-2,12,"k"); px(g,bx-1,12,"k"); px(g,bx-2,13,"k");
  px(g,bx+bw,12,"k"); px(g,bx+bw+1,12,"k"); px(g,bx+bw,13,"k");
}
function frontFrame(stage,name,marks){
  var c=STAGES[stage]||STAGES.adult, g=blank32();
  var ant=markAnt(marks), eye=markEye(marks);
  var nm=name||"idle1";
  var mode=legsMode(nm);
  drawPins(g,stage,mode,c.body);
  drawBody(g,c.body);
  drawFace(g,stage,eye,nm);
  if(nm==="jump" || nm==="catch") armsUp(g,stage);
  drawAntenna(g,ant,c.body[1],10);
  var out=join(g);
  if(nm==="idle2" || nm==="sit" || nm==="walk2" || nm==="fall") out=moveY(out,1);
  else if(nm==="walk1" || nm==="jump") out=moveY(out,-1);
  return out;
}

/* ---------- the side view: one body per stage, one eye, the same antenna ------------------------ */
var SIDE_BOX={
  baby:[7,11,19,18,7],
  child:[6,11,21,18,5],
  adult:[5,11,22,18,3]
};
function sideSnout(g,box){
  var x=box[0]+box[2], y=box[1]+Math.floor(box[3]*0.58);
  px(g,x,y,"k"); px(g,x,y+1,"k"); px(g,x,y+2,"k");
  px(g,x+1,y,"k"); px(g,x+1,y+1,"m"); px(g,x+1,y+2,"k");
}
function sideFace(g,stage,shape,name){
  var c=STAGES[stage], e=exprFor(name), y=c.eyeY, h=c.eyeH, w=EYE_W[shape]||3, x=18;
  var hh=h;
  if(e.eye==="closed" || e.eye==="sleep"){ eyeClosed(g,x,y,w); }
  else {
    if(e.eye==="happy") hh=Math.min(h,3);
    if(e.eye==="wow") hh=h+1;
    if(e.eye==="wait") eyeOpen(g,shape,x,y+1,hh);
    else if(e.eye==="sulk") eyeOpen(g,shape,x+1,y,h);
    else eyeOpen(g,shape,x+(e.dx||0),y,hh);
    if(e.eye==="angry" || e.eye==="sulk"){
      for(var i=0;i<w;i++) px(g,(e.eye==="sulk"?x+1:x)+i,y,"d");
    }
  }
  if(e.brow){
    var by=c.browY;
    for(var b=x;b<x+w;b++) px(g,b,by,"k");
    if(e.brow==="happy"){ px(g,x-1,by+1,"k"); px(g,x+w,by+1,"k"); }
    if(e.brow==="sad") px(g,x+w-1,by+1,"k");
    if(e.brow==="angry") px(g,x,by+1,"k");
  }
  /* the mouth sits on the snout side, low under the eye */
  var my=c.mouthY;
  if(e.mouth==="none") return;
  if(e.mouth==="smile") mouthSmile(g,21,my,4);
  else if(e.mouth==="frown") mouthFrown(g,21,my,4);
  else if(e.mouth==="flat") mouthFlat(g,21,my,4);
  else if(e.mouth==="tight"){ mouthFlat(g,22,my,2); px(g,21,my+1,"k"); px(g,24,my+1,"k"); }
  else if(e.mouth==="open") mouthOpenSmile(g,21,my-1,4);
  else if(e.mouth==="oval") mouthOval(g,21,my-1,4);
  else if(e.mouth==="o") mouthOval(g,22,my-1,2);
  else if(e.mouth==="chew"){ fill(g,21,my,3,1,"k"); px(g,22,my+1,"d"); }
}
function sideFrame(stage,name,marks){
  var c=STAGES[stage]||STAGES.adult, box=SIDE_BOX[stage]||SIDE_BOX.adult;
  var g=blank32(), ant=markAnt(marks), eye=markEye(marks);
  drawPins(g,stage,legsMode(name),box);
  drawBody(g,box);
  sideSnout(g,box);
  sideFace(g,stage,eye,name);
  drawAntenna(g,ant,box[1],11);
  if(name==="flap1" || name==="flap2"){
    /* a paper wing opens out of the back; flap2 is the downstroke, so the two frames never match */
    var wy=name==="flap1" ? 16 : 20;
    fill(g,1,wy,4,2,"p");
    hline(g,0,wy-1,5,"k");
    hline(g,0,wy+2,5,"k");
    px(g,0,wy,"k"); px(g,0,wy+1,"k");
  }
  var out=join(g);
  if(name==="walk1" || name==="jump" || name==="flap1" || name==="flap2") out=moveY(out,-1);
  else if(name==="walk2" || name==="fall") out=moveY(out,1);
  return out;
}

/* ---------- marks: new names, or an old save's index; the pattern is always ignored -------------- */
var ANT_IDS=["orb","triangle","crook","curl","prongs","star"];
function markAnt(marks){
  var v=marks && marks.ant;
  if(typeof v==="number") return ANT_IDS[v|0]||ANT_IDS[0];
  if(typeof v==="string"){
    for(var i=0;i<ANT_IDS.length;i++) if(ANT_IDS[i]===v) return v;
  }
  return ANT_IDS[0];
}
function markEye(marks){
  var v=marks && marks.eye;
  if(typeof v==="number") return EYE_IDS[v|0]||EYE_IDS[0];
  if(typeof v==="string"){
    for(var i=0;i<EYE_IDS.length;i++) if(EYE_IDS[i]===v) return v;
  }
  return EYE_IDS[0];
}
/* frames({ant, eye, face}): the program's call. Unknown faces keep the neutral face, never a blank grid. */
function frames(o){
  o=o||{};
  var name=o.face && FACE_EXPR[o.face] ? o.face : "idle1";
  return frontFrame("adult",name,{ant:o.ant,eye:o.eye});
}

/* ---------- the egg: one clean round shell, two crack stages ------------------------------------ */
function eggMask(){
  var m=[], y, x;
  for(y=0;y<N;y++){
    m.push([]);
    for(x=0;x<N;x++){
      var t=(y+0.5-16)/12.8;
      if(Math.abs(t)>1){ m[y].push(false); continue; }
      var rx=11.4*Math.sqrt(1-t*t);
      rx*=1-0.05*Math.max(0,-t);
      m[y].push(Math.abs(x+0.5-16)<=rx);
    }
  }
  return m;
}
function drawEgg(crack){
  var g=blank32(), m=eggMask(), inner=[], x, y, dy, dx;
  for(y=0;y<N;y++) for(x=0;x<N;x++){
    if(!m[y][x]) continue;
    var edge=false;
    for(dy=-2;dy<=2 && !edge;dy++) for(dx=-2;dx<=2;dx++){
      var xx=x+dx, yy=y+dy;
      if(xx<0 || yy<0 || xx>=N || yy>=N || !m[yy][xx]){ edge=true; break; }
    }
    if(edge) px(g,x,y,"k"); else inner.push([x,y]);
  }
  var maxX=-1, maxY=-1;
  for(var i=0;i<inner.length;i++){
    if(inner[i][0]>maxX) maxX=inner[i][0];
    if(inner[i][1]>maxY) maxY=inner[i][1];
  }
  for(i=0;i<inner.length;i++){
    var q=inner[i], ch="m";
    if(q[0]>=maxX-1 || (q[1]===maxY && q[0]>=14)) ch="d";
    px(g,q[0],q[1],ch);
  }
  [[9,10,2,1],[19,13,2,1],[11,21,2,1],[18,22,1,1]].forEach(function(s){
    for(var rr=0;rr<s[3];rr++) for(var cc=0;cc<s[2];cc++){
      if(g[s[1]+rr] && g[s[1]+rr][s[0]+cc]==="m") px(g,s[0]+cc,s[1]+rr,"d");
    }
  });
  if(crack>0){
    var line=crack===1
      ? [[16,4],[17,5],[16,6],[17,7],[16,8],[15,9],[16,10],[15,11]]
      : [[16,4],[17,5],[16,6],[17,7],[16,8],[15,9],[16,10],[15,11],
         [14,12],[15,13],[14,14],[14,15],[13,16],[14,17]];
    for(i=0;i<line.length;i++){ px(g,line[i][0],line[i][1],"k"); px(g,line[i][0]+1,line[i][1],"k"); }
  }
  return join(g);
}
var CHIP_EGG=drawEgg(0);
var CHIP_EGG_CRACK=[drawEgg(1),drawEgg(2)];

/* ---------- adult forms: the adult body plus one accessory that tells the form ------------------ */
function accessoryBook(g,o){
  var shape=markEye(o), w=EYE_W[shape], L=14-w, R=18, ey=STAGES.adult.eyeY;
  /* reading glasses: a thin frame around each eye and a bridge */
  var i, x;
  for(i=0;i<2;i++){
    x=i?R:L;
    hline(g,x-1,ey-1,w+2,"k");
    hline(g,x-1,ey+STAGES.adult.eyeH,w+2,"k");
    px(g,x-1,ey,"k"); px(g,x+w,ey,"k");
    px(g,x-1,ey+1,"k"); px(g,x+w,ey+1,"k");
  }
  hline(g,L+w,ey-1,R-(L+w)+1,"k");
  /* a tiny book held at the right hip: ink cover, paper pages, a dark spine */
  fill(g,23,17,6,8,"k");
  fill(g,24,18,4,6,"p");
  hline(g,24,21,4,"d");
  px(g,23,17,"p"); px(g,23,24,"p");
}
function accessoryWalk(g){
  var bx=5, bw=22, x;
  /* a scarf across the chest, with one end hanging down */
  fill(g,bx+2,18,bw-4,1,"k");
  fill(g,bx+2,19,bw-4,2,"m");
  fill(g,bx+2,21,bw-4,1,"k");
  fill(g,bx+8,22,5,2,"d");
  px(g,bx+8,24,"m"); px(g,bx+12,24,"m");
  hline(g,bx+10,20,bw-14,"p");
  /* the walking stick: a hooked ink line at the right side */
  for(x=7;x<27;x++) px(g,29,x,"k");
  px(g,28,7,"k"); px(g,27,8,"k"); px(g,27,9,"k");
  px(g,30,26,"k"); px(g,29,27,"k");
}
function accessoryScholar(g){
  /* a mortarboard: a wide ink board, a dark cap below it, a tassel on the right */
  hline(g,8,8,16,"k");
  hline(g,10,9,12,"d");
  hline(g,12,10,8,"k");
  for(var y=9;y<14;y++) px(g,23,y,"k");
  px(g,24,14,"k"); px(g,23,15,"p");
}
function accessoryDiary(g){
  /* a pen tucked behind the antenna on the left: ink barrel, paper nib, dark clip */
  for(var y=1;y<10;y++){ px(g,8,y,"k"); px(g,9,y,"d"); }
  px(g,8,0,"p"); px(g,9,0,"p");
  hline(g,7,3,1,"k"); hline(g,10,3,1,"k");
}
function accessoryMonster(g){
  /* two little horns on the head's top corners; the teeth are paper in the smile */
  px(g,8,8,"k"); hline(g,7,9,3,"k"); hline(g,6,10,5,"k");
  px(g,22,8,"k"); hline(g,21,9,3,"k"); hline(g,20,10,5,"k");
  px(g,14,23,"p"); px(g,17,23,"p");
  px(g,14,24,"p"); px(g,17,24,"p");
}
var FORM_IDS=["book","walk","scholar","diary","monster","plain"];
function adult(id,o){
  o=o||{};
  var name=o.face && FACE_EXPR[o.face] ? o.face : "idle1";
  var g=rows(frontFrame("adult",name,{ant:o.ant,eye:o.eye}));
  if(id==="book") accessoryBook(g,o);
  else if(id==="walk") accessoryWalk(g);
  else if(id==="scholar") accessoryScholar(g);
  else if(id==="diary") accessoryDiary(g);
  else if(id==="monster") accessoryMonster(g);
  return join(g);
}

/* ---------- poses: the standard vocabulary every play pack may ask for -------------------------- */
var POSE_NAMES={front:["idle","happy","sad","angry","sulk","surprised","blink","jump","fall","catch"],side:["walk1","walk2","jump","flap1","flap2"]};
var CHIP_POSES={front:{},side:{}};
POSE_NAMES.front.forEach(function(n){
  CHIP_POSES.front[n]=function(m){ return frontFrame("adult",n,m); };
});
POSE_NAMES.side.forEach(function(n){
  CHIP_POSES.side[n]=function(m){ return sideFrame("adult",n,m); };
});
function pose(pack,marks,view,name){
  var set=(pack && pack.poses && pack.poses[view]) || CHIP_POSES[view];
  var fn=set && set[name];
  if(!fn){ set=CHIP_POSES[view]; fn=set[name] || set[view==="side"?"walk1":"idle"]; }
  return typeof fn==="function" ? fn(marks||{}) : fn;
}
/* every stage, every front and side name: a missing name falls back to the stage's idle, never to blank */
function stagePose(pack,stage,marks,view,name){
  if(pack===PACKS.chip || (pack && pack.id==="chip")){
    return view==="side" ? sideFrame(stage||"adult",name||"walk1",marks)
      : frontFrame(stage||"adult",name||"idle1",marks);
  }
  return pose(pack,marks,view,name);
}
/* the left-facing view is the right-facing grid with every row reversed */
function mirror(grid){
  if(!grid) return grid;
  var out=[];
  for(var r=0;r<grid.length;r++) out.push(String(grid[r]).split("").reverse().join(""));
  return out;
}

/* ---------- home screen icons: a 16 x 16 chip with an antenna, from the new style ------------- */
function blank16(){
  var g=[],r,c,row;
  for(r=0;r<16;r++){ row=[]; for(c=0;c<16;c++) row.push("."); g.push(row); }
  return g;
}
function homeBody(g,hollow){
  var box=[2,5,12,10,4], m=roundMask(12,10,4), x, y, dx, dy;
  function inside(xx,yy){ return xx>=0 && yy>=0 && xx<12 && yy<10 && m[yy][xx]; }
  for(y=0;y<10;y++) for(x=0;x<12;x++){
    if(!m[y][x]) continue;
    var edge=false;
    for(dy=-1;dy<=1 && !edge;dy++) for(dx=-1;dx<=1;dx++) if(!inside(x+dx,y+dy)){ edge=true; break; }
    if(edge) px(g,box[0]+x,box[1]+y,"k");
    else px(g,box[0]+x,box[1]+y,hollow?"p":(x>=9 || y>=8 ? "d" : "m"));
  }
}
function homeAntenna(g){
  px(g,7,3,"k"); px(g,8,3,"k");
  px(g,7,4,"k"); px(g,8,4,"k");
  px(g,6,1,"k"); px(g,7,1,"k"); px(g,8,1,"k"); px(g,9,1,"k");
  px(g,6,0,"k"); px(g,7,0,"k"); px(g,8,0,"k"); px(g,9,0,"k");
  px(g,6,2,"k"); px(g,7,2,"k"); px(g,8,2,"k"); px(g,9,2,"k");
}
function homeEyes(g,closed){
  if(closed){ hline(g,3,9,4,"k"); hline(g,9,9,4,"k"); return; }
  fill(g,4,8,2,2,"k"); px(g,4,8,"p");
  fill(g,9,8,2,2,"k"); px(g,9,8,"p");
}
function homeChip(state){
  var g=blank16();
  homeBody(g,state==="away");
  homeAntenna(g);
  if(state==="away") return join(g);
  homeEyes(g,state==="sleep");
  if(state==="sleep") return join(g);
  if(state==="need"){
    fill(g,3,8,3,2,"k"); px(g,3,8,"p");
    fill(g,9,8,3,2,"k"); px(g,9,8,"p");
    mouthOval(g,7,11,2);
    hline(g,13,1,1,"k"); hline(g,13,2,1,"k"); px(g,13,3,"k"); px(g,13,5,"k");
    return join(g);
  }
  hline(g,7,12,2,"k");
  return join(g);
}
function homeEgg(){
  /* a clean 16 px egg: one ink ring, mid shell, dark on the right and the bottom */
  var g=blank16(), x, y;
  for(y=1;y<15;y++){
    var t=(y+0.5-8)/7.2;
    if(Math.abs(t)>1) continue;
    var rx=6.2*Math.sqrt(1-t*t);
    for(x=0;x<16;x++){
      if(Math.abs(x+0.5-8)>rx) continue;
      var edge=Math.abs(x+0.5-8)>rx-1.1 || Math.abs(y+0.5-8)>7.2-1.1;
      px(g,x,y,edge?"k":(x>=9 || y>=13 ? "d" : "m"));
    }
  }
  return join(g);
}
var HOME_ICONS={
  egg:homeEgg(),
  sleep:homeChip("sleep"),
  face:homeChip("face"),
  need:homeChip("need"),
  away:homeChip("away")
};

/* ---------- row icons: 8 x 8 DOM glyphs, unchanged (the five the pet's row shows plus old names) -- */
var ICONS={
  food:["........","..k.k.k.",".k.k.k..","kkkkkkkk","k......k",".k....k.","..kkkk..","........"],
  play:["..kkkk..",".k..k.k.","k..k...k","kkk...kk","k...kk.k","k..k...k",".k.k..k.","..kkkk.."],
  wash:["...k....","...k....","..k.k...","..k.k...",".k...k..",".k...k..",".k...k..","..kkk..."],
  light:["..kkkk..",".k....k.",".k....k.",".k....k.","..k..k..","..kkkk..","..kkkk..","...kk..."],
  look:["........","..kkkk..",".k....k.","k..kk..k","k..kk..k",".k....k.","..kkkk..","........"],
  box:["kkkkkkkk","k......k","kkkkkkkk","k..kk..k","k......k","k......k","k......k","kkkkkkkk"],
  mail:["........","kkkkkkkk","kk....kk","k.k..k.k","k..kk..k","k......k","kkkkkkkk","........"],
  call:["..kkkk..",".k.kk.k.","k..kk..k","k..kk..k","k......k",".k.kk.k.","..kkkk..","..k....."]
};

/* ---------- souvenirs: 16 x 16, everyday things it finds on its walks ---------- */
var SOUV=[
  {id:"shell",grid:[
  "................",
  ".......kk.......",
  "......kmmk......",
  ".....kmpmmk.....",
  "....kmpkmkmk....",
  "...kmpmkmkmmk...",
  "..kmpmmkmkmmmk..",
  "..kmmmkmmmkmmk..",
  ".kmmmmkmmmkmmmk.",
  ".kmmmkmmmmmkmmk.",
  ".kmmmkmmmmmkmmk.",
  "..kdmmmmmmmmmdk.",
  "...kkdddddddkk..",
  ".....kkkkkkk....",
  "................",
  "................"]},
  {id:"leaf",grid:[
  "................",
  ".......k........",
  "......kdk.......",
  "..k..kdddk..k...",
  "..kk.kdpdk.kk...",
  "..kdkkdpdkkdk...",
  "...kddkpkddk....",
  "kkkkdddpdddkkkk.",
  ".kddddkpkddddk..",
  "..kkdddpdddkk...",
  "....kdkpkdk.....",
  "...kdk.p.kdk....",
  "...kk..k..kk....",
  ".......k........",
  ".......k........",
  "................"]},
  {id:"post",grid:[
  "................",
  "................",
  "kkkkkkkkkkkkkkkk",
  "kppppppppkpkkkpk",
  "kpmmmmmmpkpkmkpk",
  "kpmmpmmmpkpkkkpk",
  "kpmpppmmpkppppk.",
  "kpmmmmmmpkpkkkpk",
  "kpdddmddpkppppk.",
  "kpdddddkpkpkkkpk",
  "kppppppppkppppk.",
  "kpkkkkkppkpkkkpk",
  "kppppppppkppppk.",
  "kkkkkkkkkkkkkkkk",
  "................",
  "................"]},
  {id:"button",grid:[
  "................",
  "................",
  ".....kkkkkk.....",
  "....kmmmmmmk....",
  "...kmpmmmmmmk...",
  "...kmmkmmkmmk...",
  "...kmmkmmkmmk...",
  "...kmmmmmmmmk...",
  "...kmmkmmkmmk...",
  "...kmmkmmkmmk...",
  "...kmmmmmmmmk...",
  "....kmmmmmmk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................"]},
  {id:"key",grid:[
  "................",
  "................",
  "....kkkkkk......",
  "...kmpmmmmk.....",
  "..kmmkkkkmmk....",
  "..kmk....kmk....",
  "..kmk....kmk....",
  "..kmmkkkkmmk....",
  "...kmmmmmmk.....",
  "....kkkkkk......",
  "......kk........",
  "......kk........",
  "......kkkk......",
  "......kk..k.....",
  "......kkkk......",
  "................"]},
  {id:"pebble",grid:[
  "................",
  "................",
  "................",
  "......kkkk......",
  ".....kmpmmk.....",
  "....kmpmmmmk....",
  "...kmpmmmmmmk...",
  "...kmmmmmmmmk...",
  "...kmmmmmmmdk...",
  "...kmmmmmmddk...",
  "....kmmmmddk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
  "................"]},
  {id:"feather",grid:[
  "................",
  "...........kk...",
  "..........kppk..",
  ".........kppmk..",
  "........kppmmk..",
  ".......kppmmk...",
  "......kppmmk....",
  ".....kppmmk.....",
  "....kppmmk......",
  "...kppmmk.......",
  "..kppmmk........",
  "..kppmk.........",
  "..kdmk..........",
  "..kk............",
  "................",
  "................"]},
  {id:"ticket",grid:[
  "................",
  "................",
  "...kkkkkkkkkk...",
  "..kppppppppppk..",
  "..kpkkkkkkkkpk..",
  "..kppppppppppk..",
  "..kpkkkkkkkkpk..",
  "..kppppkkppppk..",
  "..kppppppppppk..",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"]},
  {id:"cap",grid:[
  "................",
  "................",
  "....k.k.k.k.....",
  "...kkkkkkkkkk...",
  "..kmmmmmmmmmmk..",
  "..kmpmmmmmmmdk..",
  "..kmmmmmmmmmmk..",
  "...kkkkkkkkkk...",
  "....k.k.k.k.....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................"]},
  {id:"cone",grid:[
  "................",
  "................",
  ".......kk.......",
  "......kmmk......",
  ".....kmmmmk.....",
  "....kmmkmmmk....",
  "....kmkmmkmk....",
  "...kmmkmmkmmk...",
  "...kmkmmkmmkmk..",
  "...kmmkmmkmmk...",
  "....kmkmmkmk....",
  ".....kmmmmk.....",
  "......kmmk......",
  ".......kk.......",
  "................",
  "................"]},
  {id:"marble",grid:[
  "................",
  "................",
  "......kkkk......",
  ".....kmmmmk.....",
  "....kmppmmmk....",
  "...kmpmmmmmmk...",
  "...kmmmmkkmmk...",
  "...kmmmkkmmmk...",
  "...kmmkkmmmmk...",
  "...kmmmmmmmmk...",
  "....kmmmmmmk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
  "................"]},
  {id:"stamp",grid:[
  "................",
  "................",
  "..k.k.k.k.k.k...",
  "..kkkkkkkkkkkk..",
  "..kppppppppppk..",
  "..kpkkkkkkkkpk..",
  "..kpkppppppkpk..",
  "..kpkpkkkppkpk..",
  "..kpkpkppkpkpk..",
  "..kpkppkkkpkpk..",
  "..kpkkkkkkkkpk..",
  "..kppppppppppk..",
  "..kkkkkkkkkkkk..",
  "..k.k.k.k.k.k...",
  "................",
  "................"]},
  {id:"screw",grid:[
  "................",
  "................",
  ".....kkkkkk.....",
  ".....kmmmmk.....",
  ".....kkkkkk.....",
  "......kmmk......",
  "......kmmk......",
  "......kmkk......",
  "......kmmk......",
  "......kmkk......",
  "......kmmk......",
  "......kmkk......",
  "......kkkk......",
  ".......kk.......",
  "................",
  "................"]},
  {id:"acorn",grid:[
  "................",
  "................",
  "......kkkk......",
  "....kkmmmmkk....",
  "...kmmmmmmmmk...",
  "...kmkmmmmkmk...",
  "....kkkkkkkk....",
  ".....kmmmmk.....",
  "....kmppmmmk....",
  "....kmmmmmmk....",
  "....kmmmmmdk....",
  ".....kmmmmk.....",
  "......kkkk......",
  "................",
  "................",
  "................"]},
  {id:"coin",grid:[
  "................",
  "................",
  "......kkkk......",
  ".....kmmmmk.....",
  "....kmmmmmmk....",
  "...kmmmkkmmmk...",
  "...kmmk..kmmk...",
  "...kmmk..kmmk...",
  "...kmmk..kmmk...",
  "...kmmmkkmmmk...",
  "....kmmmmmmk....",
  ".....kmmmmk.....",
  "......kkkk......",
  "................",
  "................",
  "................"]},
  {id:"boat",grid:[
  "................",
  "................",
  ".......kk.......",
  "......kppk......",
  ".....kppppk.....",
  "....kppppppk....",
  "...kppppppppk...",
  "..kppppppppppk..",
  "..kkkkkkkkkkkk..",
  "...kppppppppk...",
  "....kkkkkkkk....",
  "................",
  "................",
  "................",
  "................",
  "................"]},
  {id:"ribbon",grid:[
  "................",
  "................",
  "................",
  "...kk....kk.....",
  "..kppk..kppk....",
  ".kppppkkppppk...",
  ".kppppppppppk...",
  "..kpppkkpppk....",
  "...kkkppkkk.....",
  "......kpk.......",
  ".....kpk........",
  "....kpk.........",
  "....kk..........",
  "................",
  "................",
  "................"]},
  {id:"gear",grid:[
  "................",
  "................",
  "....k..k..k.....",
  "...kkkkkkkkkk...",
  "...kmmmmmmmmk...",
  "..kmmkkkkkkmmk..",
  "..kmk......kmk..",
  "..kmk......kmk..",
  "..kmmkkkkkkmmk..",
  "...kmmmmmmmmk...",
  "...kkkkkkkkkk...",
  "....k..k..k.....",
  "................",
  "................",
  "................",
  "................"]},
  {id:"seed",grid:[
  "................",
  "................",
  "...........kk...",
  "..........kpk...",
  ".........kpk....",
  "........kpk.....",
  ".....kkkpk......",
  "....kmmmmk......",
  "...kmppmmk......",
  "...kmmmmmk......",
  "....kmmmmk......",
  ".....kkkk.......",
  "................",
  "................",
  "................",
  "................"]},
  {id:"clip",grid:[
  "................",
  "................",
  ".....kkkk.......",
  "....k....k......",
  "...k..kk..k.....",
  "...k.k..k.k.....",
  "...k.k..k.k.....",
  "...k.k..k.k.....",
  "...k.k..k.k.....",
  "...k.k..kkk.....",
  "...k.k..........",
  "...k.kkkkkk.....",
  "....k......k....",
  ".....kkkkkk.....",
  "................",
  "................"]}
];

/* ---------- props at double size ----------------------------------------------------------------- */
function propCanvas(w,h){ return rows(blankGrid(w,h,".")); }
function propOutline(g,x,y,w,h,t){
  fill(g,x,y,w,t,"k");
  fill(g,x,y+h-t,w,t,"k");
  fill(g,x,y,t,h,"k");
  fill(g,x+w-t,y,t,h,"k");
}
function propCard(){
  var g=propCanvas(18,14);
  propOutline(g,0,0,18,14,1);
  fill(g,1,1,16,12,"p");
  fill(g,2,2,7,7,"d");
  fill(g,3,3,5,5,"m");
  px(g,5,3,"p"); px(g,4,5,"p"); px(g,3,6,"p");
  hline(g,11,4,4,"k"); hline(g,11,6,4,"k"); hline(g,11,8,4,"d"); hline(g,11,10,3,"d");
  return join(g);
}
function propFlag(blank){
  var g=propCanvas(16,28);
  fill(g,2,0,2,28,"k");
  fill(g,0,1,12,12,"k");
  fill(g,1,2,10,10,blank?"p":"m");
  if(!blank){
    hline(g,2,4,8,"d");
    px(g,5,7,"p"); px(g,6,6,"p"); px(g,7,7,"p"); px(g,6,8,"p");
    hline(g,3,10,7,"d");
  }
  return join(g);
}
function propBooks(){
  var g=propCanvas(24,18);
  fill(g,1,13,22,5,"k"); fill(g,2,14,20,3,"m"); hline(g,3,15,18,"p");
  fill(g,0,8,22,5,"k"); fill(g,1,9,20,3,"d"); hline(g,2,10,18,"p");
  fill(g,2,3,21,5,"k"); fill(g,3,4,19,3,"m"); hline(g,4,5,17,"p");
  return join(g);
}
function propFilm(){
  var g=propCanvas(16,14);
  fill(g,0,0,16,14,"k");
  fill(g,2,2,12,10,"d");
  for(var y=2;y<12;y+=3){ px(g,1,y,"p"); px(g,14,y,"p"); }
  fill(g,4,4,4,6,"m"); fill(g,8,4,4,6,"m");
  px(g,5,5,"p"); px(g,9,5,"p");
  return join(g);
}
function propDesk(){
  var g=propCanvas(50,16);
  fill(g,0,0,50,3,"k");
  fill(g,1,3,48,8,"p");
  hline(g,1,11,48,"d");
  fill(g,0,12,50,2,"k");
  fill(g,4,14,3,2,"k"); fill(g,43,14,3,2,"k");
  hline(g,6,5,12,"d"); hline(g,6,7,9,"d");
  return join(g);
}
function propPen(){
  var g=propCanvas(18,6);
  fill(g,4,2,10,2,"k");
  fill(g,5,2,6,1,"d");
  px(g,14,2,"p"); px(g,15,2,"p"); px(g,15,3,"p");
  fill(g,6,1,2,1,"m");
  return join(g);
}
function propScarf(){
  var g=propCanvas(24,12), r, x;
  /* a looped scarf: a folded band, a knot and two striped tails that swing out at the bottom */
  fill(g,2,1,20,1,"k"); fill(g,3,2,18,2,"m"); fill(g,3,3,18,1,"p"); fill(g,2,4,20,1,"k");
  fill(g,10,4,4,3,"k"); fill(g,11,5,2,1,"p");
  for(r=0;r<6;r++){
    x=6-(r>2?1:0);
    hline(g,x,5+r,6,"k");
    if(r>0 && r<5) fill(g,x+1,5+r,4,1,r===2?"p":(r%2?"m":"d"));
    x=15+(r>2?1:0);
    hline(g,x,5+r,6,"k");
    if(r>0 && r<5) fill(g,x+1,5+r,4,1,r===3?"p":(r%2?"m":"d"));
  }
  px(g,5,11,"k"); px(g,7,11,"k"); px(g,9,11,"k");
  px(g,15,11,"k"); px(g,17,11,"k"); px(g,19,11,"k");
  return join(g);
}
function propMooncake(){
  var g=propCanvas(20,20);
  fill(g,4,1,12,1,"k"); fill(g,2,2,16,1,"k"); fill(g,1,3,18,1,"k");
  fill(g,1,4,18,12,"m"); fill(g,0,5,1,10,"k"); fill(g,19,5,1,10,"k");
  fill(g,1,16,18,1,"k"); fill(g,2,17,16,1,"k"); fill(g,4,18,12,1,"k");
  fill(g,4,6,12,1,"d"); fill(g,4,13,12,1,"d");
  fill(g,8,8,4,4,"d"); px(g,7,9,"d"); px(g,12,9,"d"); px(g,7,11,"d"); px(g,12,11,"d");
  px(g,9,8,"p"); px(g,10,8,"p");
  return join(g);
}
function propHeart(full){
  var g=propCanvas(14,12);
  fill(g,1,2,4,1,"k"); fill(g,9,2,4,1,"k");
  fill(g,0,3,6,2,"k"); fill(g,8,3,6,2,"k");
  fill(g,1,5,12,1,"k"); fill(g,2,6,10,1,"k");
  fill(g,3,7,8,1,"k"); fill(g,4,8,6,1,"k"); fill(g,5,9,4,1,"k");
  if(full){
    fill(g,2,3,4,2,"d"); fill(g,8,3,4,2,"d");
    fill(g,3,5,8,1,"d"); fill(g,4,6,6,1,"d"); fill(g,5,7,4,1,"d");
  }
  return join(g);
}
function propSign(){
  var g=propCanvas(32,22);
  propOutline(g,0,0,32,16,2);
  fill(g,2,2,28,12,"p");
  hline(g,6,6,20,"k"); hline(g,6,9,14,"d"); hline(g,6,11,17,"d");
  fill(g,7,16,3,6,"k"); fill(g,22,16,3,6,"k");
  return join(g);
}
function propZz(){
  var g=propCanvas(24,24);
  hline(g,3,3,9,"k"); for(var i=0;i<6;i++) px(g,11-i,4+i,"k"); hline(g,3,10,9,"k");
  hline(g,12,13,7,"k"); for(i=0;i<4;i++) px(g,18-i,14+i,"k"); hline(g,12,18,7,"k");
  return join(g);
}
function propBowl(full){
  var g=propCanvas(20,14);
  if(full){
    hline(g,6,0,8,"d"); hline(g,4,1,12,"d"); hline(g,2,2,16,"d");
    fill(g,4,3,12,1,"m");
  }
  fill(g,0,3,20,2,"k");
  for(var i=0;i<6;i++){
    var w=18-i*2, x=1+i;
    hline(g,x,5+i,w,"p");
    px(g,x-1,5+i,"k"); px(g,x+w,5+i,"k");
    px(g,x,5+i,"d"); px(g,x+w-1,5+i,"d");
  }
  hline(g,5,11,10,"k"); hline(g,7,12,6,"k");
  px(g,6,11,"p"); px(g,13,11,"p");
  hline(g,3,13,14,"d");
  return join(g);
}
function propPoop(){
  var g=propCanvas(14,12);
  hline(g,5,1,4,"k");
  hline(g,4,2,6,"m"); hline(g,3,3,8,"m"); px(g,3,3,"k"); px(g,10,3,"k");
  hline(g,2,4,10,"m"); px(g,2,4,"k"); px(g,11,4,"k");
  hline(g,2,5,10,"d"); px(g,2,5,"k"); px(g,11,5,"k");
  hline(g,1,6,12,"m"); px(g,1,6,"k"); px(g,12,6,"k");
  hline(g,1,7,12,"d"); px(g,1,7,"k"); px(g,12,7,"k");
  hline(g,2,8,10,"k"); hline(g,3,9,8,"k");
  hline(g,4,10,6,"d");
  return join(g);
}
var PROPS={
  card:propCard(),
  flag:propFlag(false),
  flagBlank:propFlag(true),
  books:propBooks(),
  film:propFilm(),
  desk:propDesk(),
  pen:propPen(),
  scarf:propScarf(),
  mooncake:propMooncake(),
  heart:propHeart(true),
  heartE:propHeart(false),
  sign:propSign(),
  zz:propZz(),
  bowl:propBowl(true),
  bowlEmpty:propBowl(false),
  poop:propPoop()
};

/* ---------- the room: 162 x 120 room pixels ---------------------------------------------------- */
var ROOM_W=162, ROOM_H=120;
function bput(buf,w,h,x,y,t){
  x=Math.floor(x); y=Math.floor(y);
  if(x<0||y<0||x>=w||y>=h) return;
  buf[y*w+x]=t;
}
function brect(buf,w,h,x,y,rw,rh,t){
  for(var r=0;r<rh;r++) for(var c=0;c<rw;c++) bput(buf,w,h,x+c,y+r,t);
}
function bhline(buf,w,h,x,y,rw,t){ brect(buf,w,h,x,y,rw,1,t); }
function blit(buf,w,h,grid,x,y){
  if(!grid) return buf;
  for(var r=0;r<grid.length;r++){
    var line=String(grid[r]);
    for(var c=0;c<line.length;c++){
      var t=TONE_OF[line.charAt(c)];
      if(t!==undefined) bput(buf,w,h,x+c,y+r,t);
    }
  }
  return buf;
}
function blitScaled(buf,w,h,grid,x,y,scale,tone){
  if(!grid) return;
  for(var r=0;r<grid.length;r++){
    var line=String(grid[r]);
    for(var c=0;c<line.length;c++){
      var ch=line.charAt(c);
      if(ch===".") continue;
      var t=tone!==undefined?tone:TONE_OF[ch];
      if(t===undefined) continue;
      brect(buf,w,h,x+c*scale,y+r*scale,scale,scale,t);
    }
  }
}
/* any non-transparent cell in one tone: the night Zz is drawn after darkening so it stays paper */
function blitTone(buf,w,h,grid,x,y,t){
  if(!grid) return;
  for(var r=0;r<grid.length;r++){
    var line=String(grid[r]);
    for(var c=0;c<line.length;c++) if(line.charAt(c)!==".") bput(buf,w,h,x+c,y+r,t);
  }
  return buf;
}
function darken(buf){
  for(var i=0;i<buf.length;i++) buf[i]=DARK[buf[i]]||0;
  return buf;
}
var WIN={x:10,y:10,w:40,h:36};
var MOON=["..pp.","...pp","...pp","..pp."];
var STARS=[[18,15],[44,15],[18,40],[44,40],[33,12]];
var CLOUD=[
  "....pppppp......",
  "..pppppppppp....",
  ".pppppppppppppp.",
  "pppppppppppppppp",
  ".pppppppppppppp.",
  "....pppppppp...."
];
var SUN=[
  "..p..",
  ".ppp.",
  "ppppp",
  ".ppp.",
  "..p.."
];
var POOPS=[[50,107],[57,108],[64,107]];
var BOOKS=[
  [118,21,5,28,"d"],[124,25,4,24,"m"],[129,20,6,29,"k",true],
  [136,27,5,22,"m"],[142,23,4,26,"d"],[147,19,3,30,"m"],[151,26,4,23,"d",true],
  [118,56,4,17,"m"],[123,58,6,15,"d"],[130,54,4,19,"k"],
  [135,57,5,16,"m",true],[141,55,3,18,"d"],[145,59,6,14,"m"],[152,54,3,19,"d"],
  [118,78,5,17,"m"],[124,80,4,15,"d"],[129,77,6,18,"m",true],
  [136,81,3,14,"k"],[140,79,5,16,"d"],[146,77,4,18,"m"],[151,80,4,15,"d"]
];

/* Weather marks at double size, painted only inside the window's inner pane. The day's rain, wind and
   cloud are ink on mid; at night the same marks are paper on the dark sky. */
function weatherMark(buf,w,h,weather,night){
  var s=String(weather||""), r, c, x, y, t=night?3:0, ink=night?3:0;
  if(!s) return;
  if(s==="sun" && !night){
    blit(buf,w,h,SUN,33,16);
    for(r=0;r<5;r++){
      bput(buf,w,h,32,15+r,3); bput(buf,w,h,38,15+r,3);
      bput(buf,w,h,32+r,14,3); bput(buf,w,h,32+r,21,3);
    }
  } else if(s==="cloud"){
    blit(buf,w,h,CLOUD,17,14);
    if(night) blitTone(buf,w,h,CLOUD,17,14,3);
  } else if(s==="rain"){
    blit(buf,w,h,CLOUD,17,14);
    if(night) blitTone(buf,w,h,CLOUD,17,14,3);
    for(y=22;y<42;y+=5){
      x=14+((y*5)%30);
      for(r=0;r<2;r++) bput(buf,w,h,x+r,y,ink);
      bput(buf,w,h,x,y+1,ink);
    }
  } else if(s==="snow"){
    var flakes=[[15,24],[22,31],[31,24],[39,32],[17,38],[28,39],[43,23],[42,38],[35,40]];
    for(var i=0;i<flakes.length;i++){
      for(r=0;r<3;r++) for(c=0;c<3;c++){
        if((r===1 || c===1)) bput(buf,w,h,flakes[i][0]-1+c,flakes[i][1]-1+r,3);
      }
    }
  } else if(s==="wind"){
    for(y=17;y<42;y+=6){
      x=14+((y*3)%5);
      for(c=0;c<26;c++) bput(buf,w,h,x+c,y+(c%4===0?-1:0),ink);
      bput(buf,w,h,x+26,y+1,ink); bput(buf,w,h,x+27,y,ink);
    }
  }
}
/* A small seasonal mark in the window, so the room notices the year without a new layout. */
function seasonMark(buf,w,h,season){
  var s=String(season||"").toLowerCase();
  if(/spring|春/.test(s)){
    bput(buf,w,h,15,38,3); bput(buf,w,h,16,38,3); bput(buf,w,h,15,39,3); bput(buf,w,h,17,39,3);
    bput(buf,w,h,16,40,3);
  } else if(/summer|夏/.test(s)){
    bput(buf,w,h,43,37,3); bput(buf,w,h,44,37,3); bput(buf,w,h,43,38,3); bput(buf,w,h,44,38,3);
  } else if(/autumn|fall|秋/.test(s)){
    bput(buf,w,h,14,16,1); bput(buf,w,h,15,17,1); bput(buf,w,h,14,17,1); bput(buf,w,h,13,17,1);
  } else if(/winter|冬/.test(s)){
    bput(buf,w,h,15,15,3); bput(buf,w,h,44,15,3); bput(buf,w,h,15,41,3); bput(buf,w,h,44,41,3);
  }
}
function drawWindow(buf,w,h,scene){
  var night=!!scene.night, weather=String(scene.weather||"");
  brect(buf,w,h,WIN.x,WIN.y,WIN.w,WIN.h,0);
  brect(buf,w,h,WIN.x+2,WIN.y+2,WIN.w-4,WIN.h-4,night?0:2);
  if(night){
    blit(buf,w,h,MOON,33,14);
    for(var i=0;i<STARS.length;i++) bput(buf,w,h,STARS[i][0],STARS[i][1],3);
  }
  weatherMark(buf,w,h,weather,night);
  seasonMark(buf,w,h,scene.season);
  /* the four panes, on top so no weather spills over a bar */
  brect(buf,w,h,29,12,2,32,0);
  brect(buf,w,h,12,27,36,2,0);
  /* sill */
  brect(buf,w,h,8,46,44,2,1);
  bhline(buf,w,h,9,48,42,0);
}
function drawCalendar(buf,w,h,scene){
  brect(buf,w,h,60,14,28,34,0);
  brect(buf,w,h,62,16,24,28,3);
  brect(buf,w,h,62,16,24,6,1);
  brect(buf,w,h,65,13,2,3,0);
  brect(buf,w,h,81,13,2,3,0);
  var day=Math.max(1,Math.min(31,Number(scene.dayOfMonth)||1));
  var num=numberGrid(day), nw=String(num[0]).length*2;
  blitScaled(buf,w,h,num,62+Math.floor((24-nw)/2),25,2,0);
}
function drawShelf(buf,w,h,scene,room){
  /* the little wall shelf leaves a 16 x 16 slot for one souvenir: board at y 46, the find sits on it */
  var at=room.shelfAt||[93,30];
  brect(buf,w,h,90,46,23,2,1);
  bhline(buf,w,h,90,48,23,0);
  brect(buf,w,h,91,49,2,3,0);
  brect(buf,w,h,110,49,2,3,0);
  bhline(buf,w,h,91,45,21,3);
  if(scene.shelf){
    var sx=(scene.shelfX!==undefined)?scene.shelfX:at[0];
    var sy=(scene.shelfY!==undefined)?scene.shelfY:at[1];
    blit(buf,w,h,scene.shelf,sx,sy);
  }
}
function drawFurniture(buf,w,h,scene,room){
  var x, y, i;
  /* wall: paper with a grid of soft 12 px spaced 2 x 2 dots */
  brect(buf,w,h,0,0,w,83,3);
  for(y=6;y<84;y+=12){
    var off=(Math.floor(y/12)%2)?6:0;
    for(x=6+off;x<w;x+=12) brect(buf,w,h,x,y,2,2,2);
  }
  bhline(buf,w,h,0,83,w,1);
  bhline(buf,w,h,0,84,w,0);
  bhline(buf,w,h,0,85,w,0);
  /* the plank floor */
  brect(buf,w,h,0,86,w,h-86,2);
  for(y=94;y<h;y+=8) bhline(buf,w,h,0,y,w,1);
  for(i=0;i<4;i++){
    var top=86+i*8;
    for(x=(i%2?21:0);x<w;x+=42) brect(buf,w,h,x,top+1,1,6,1);
  }
  [[30,90],[74,98],[128,110],[52,114]].forEach(function(q){
    bput(buf,w,h,q[0],q[1],1); bput(buf,w,h,q[0]+1,q[1],1); bput(buf,w,h,q[0],q[1]+1,1);
  });
  drawWindow(buf,w,h,scene);
  drawCalendar(buf,w,h,scene);
  drawShelf(buf,w,h,scene,room);

  /* bookshelf: dark case, paper back, two shelves of books */
  brect(buf,w,h,114,16,44,80,0);
  brect(buf,w,h,116,18,40,76,3);
  bhline(buf,w,h,116,50,40,0);
  bhline(buf,w,h,116,51,40,0);
  bhline(buf,w,h,116,74,40,0);
  bhline(buf,w,h,116,75,40,0);
  for(i=0;i<BOOKS.length;i++){
    var b=BOOKS[i], bh=(b[1]<50?50:b[1]<74?74:95)-b[1];
    brect(buf,w,h,b[0],b[1],b[2],bh,TONE_OF[b[4]]);
    if(b[5]){ bhline(buf,w,h,b[0],b[1]+6,b[2],3); bhline(buf,w,h,b[0],b[1]+7,b[2],3); }
  }

  /* bed in the left corner */
  brect(buf,w,h,4,58,7,30,0); fill(buf,w,h,5,59,5,28,1);
  brect(buf,w,h,6,56,3,2,0);
  brect(buf,w,h,9,68,43,16,0); brect(buf,w,h,10,69,41,14,3);
  brect(buf,w,h,10,83,41,2,1); brect(buf,w,h,10,85,41,2,0);
  brect(buf,w,h,11,69,16,10,0); brect(buf,w,h,12,70,14,8,3);
  bhline(buf,w,h,12,76,14,1);
  brect(buf,w,h,27,69,24,17,0); brect(buf,w,h,28,70,22,15,2);
  brect(buf,w,h,28,70,22,2,3);
  bhline(buf,w,h,28,79,22,1); bhline(buf,w,h,28,82,22,1);
  brect(buf,w,h,12,87,3,5,0); brect(buf,w,h,48,87,3,5,0);
  bhline(buf,w,h,9,92,43,1);

  /* the rug the pet stands on */
  brect(buf,w,h,70,98,56,19,0);
  brect(buf,w,h,72,100,52,15,3);
  for(x=74;x<122;x+=8){ brect(buf,w,h,x,102,2,2,2); brect(buf,w,h,x+4,111,2,2,2); }
  bhline(buf,w,h,97,102,3,1);
  bput(buf,w,h,96,103,1); bhline(buf,w,h,97,103,3,2); bput(buf,w,h,100,103,1);
  bput(buf,w,h,95,104,1); bhline(buf,w,h,96,104,5,2); bput(buf,w,h,101,104,1);
  bput(buf,w,h,96,105,1); bhline(buf,w,h,97,105,3,2); bput(buf,w,h,100,105,1);
  bhline(buf,w,h,97,106,3,1);

  /* bowl and the little piles, from this room's own props */
  var bowlAt=room.bowlAt||[25,97];
  blit(buf,w,h,scene.bowlFull?room.bowl:room.bowlEmpty,bowlAt[0],bowlAt[1]);
  var mess=Math.max(0,Math.min(3,Number(scene.mess)||0)), poops=room.poops||POOPS;
  for(i=0;i<mess;i++) if(poops[i]) blit(buf,w,h,room.poop,poops[i][0],poops[i][1]);
}
/* The furniture and the room's own props. A pack may keep this painter and only swap its grids;
   a second room can replace draw entirely and still get the pet, prop, sign and Zz from drawRoom. */
function paintRoom(buf,w,h,scene,pack){
  var room=(pack&&pack.room)||CHIP_ROOM;
  drawFurniture(buf,w,h,scene,room);
}
function drawRoom(buf,w,h,scene){
  scene=scene||{};
  var pack=scene.pack;
  if(typeof pack==="string") pack=PACKS[pack];
  pack=pack||PACKS.chip;
  var room=pack.room||CHIP_ROOM;
  w=w||room.w||ROOM_W; h=h||room.h||ROOM_H;
  var drawFn=(typeof room.draw==="function")?room.draw:paintRoom;
  drawFn(buf,w,h,scene,pack);

  /* one pet spot for the pet, the prop and Zz; a caller may move any of them */
  var petX=(scene.petX!==undefined)?scene.petX:(room.petX!==undefined?room.petX:83);
  var petY=(scene.petY!==undefined)?scene.petY:(room.petY!==undefined?room.petY:69);
  if(scene.pet) blit(buf,w,h,scene.pet,petX,petY);

  if(scene.prop){
    var pw=gridWidth(scene.prop), ph=gridHeight(scene.prop);
    var px0=(scene.propX!==undefined)?scene.propX:petX+(room.propDx!==undefined?room.propDx:36);
    var py0=(scene.propY!==undefined)?scene.propY:petY+32-ph;
    if(px0>w-pw) px0=w-pw;
    if(py0>h-ph) py0=h-ph;
    if(px0<0) px0=0; if(py0<0) py0=0;
    blit(buf,w,h,scene.prop,px0,py0);
  }

  /* the away sign: the board can be passed in, otherwise the room's own sign */
  if(scene.sign){
    var sg=(scene.sign.length && typeof scene.sign!=="string" && typeof scene.sign!=="boolean")?scene.sign:room.sign;
    var at=room.signAt||[62,60];
    var sx=(scene.signX!==undefined)?scene.signX:at[0], sy=(scene.signY!==undefined)?scene.signY:at[1];
    blit(buf,w,h,sg,sx,sy);
  }

  var zx=0, zy=0;
  if(scene.zz){
    zx=petX+(room.zzDx!==undefined?room.zzDx:28);
    zy=petY+(room.zzDy!==undefined?room.zzDy:-22);
    if(zx>w-24) zx=w-24; if(zx<0) zx=0;
    if(zy<0) zy=0;
    blit(buf,w,h,room.zz,zx,zy);
  }

  if(scene.lightOff){
    darken(buf);
    if(scene.zz) blitTone(buf,w,h,room.zz,zx,zy,3);
  }
  return buf;
}

var CHIP_ROOM={
  id:"chip",
  w:ROOM_W, h:ROOM_H,
  petX:83, petY:69,
  window:WIN,
  bowl:PROPS.bowl, bowlEmpty:PROPS.bowlEmpty, poop:PROPS.poop, sign:PROPS.sign, zz:PROPS.zz,
  bowlAt:[25,97],
  poops:POOPS,
  signAt:[62,60],
  shelfAt:[93,30],
  propDx:36,
  zzDx:28, zzDy:-22,
  draw:paintRoom
};

/* ---------- the pack --------------------------------------------------------------------------- */
var CHIP_PACK={
  id:"chip",
  name:{zh:"芯仔",en:"Chip"},
  faces:["idle1","idle2","blink","eat1","eat2","happy","walk1","walk2","sleep","wait","surprised","sad","angry","sulk","hold"],
  frames:frames,
  poses:CHIP_POSES,
  adult:adult,
  egg:CHIP_EGG,
  eggCrack:CHIP_EGG_CRACK,
  baby:frontFrame("baby","idle1",{}),
  child:frontFrame("child","idle1",{}),
  /* six antennas and three eye shapes: 18 looks. Old saves use the same index slots; `pat` is gone. */
  marks:{ant:ANT_IDS, eye:EYE_IDS},
  forms:FORM_IDS,
  props:PROPS,
  room:CHIP_ROOM,
  icons:ICONS,
  homeIcons:HOME_ICONS,
  souvenirs:SOUV
};
var PACKS={chip:CHIP_PACK};

/* Every frame name the program and the play packs ask for, in one list the tests can enumerate. The room
   uses the faces, the games use the standard front and side poses, and the idle varieties name a mood
   that is then shifted. look-left / look-right are the long spellings of the program's lookL / lookR. */
var FRAME_NAMES=["idle","idle1","idle2","blink","eat1","eat2","happy","walk1","walk2","sleep","wait","surprised",
  "sad","angry","sulk","hold","jump","fall","catch","flap1","flap2","look","lookL","lookR","look-left","look-right","sit"];
/* Ink plus dark pixels: the minimum that makes a 32 x 32 frame a visible pet rather than an empty box. */
function frameInk(g){
  var n=0, r, c, line;
  if(!g) return 0;
  for(r=0;r<g.length;r++){
    line=String(g[r]||"");
    for(c=0;c<line.length;c++) if(line.charAt(c)==="k" || line.charAt(c)==="d") n++;
  }
  return n;
}

window.LopdaPetArt={
  PACKS:PACKS,
  TONES:TONES,
  ROOM_W:ROOM_W,
  ROOM_H:ROOM_H,
  drawRoom:drawRoom,
  blit:blit,
  darken:darken,
  isGrid:isGrid,
  gridWidth:gridWidth,
  gridHeight:gridHeight,
  blankGrid:blankGrid,
  digitGrid:digitGrid,
  numberGrid:numberGrid,
  rows:rows,
  join:join,
  POSE_NAMES:POSE_NAMES,
  FRAME_NAMES:FRAME_NAMES,
  frameInk:frameInk,
  pose:pose,
  stagePose:stagePose,
  mirror:mirror
};
})();
