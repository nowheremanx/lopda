/*
 * Lo-PDA runtime: the built-in pet's art. A species pack is art and numbers only: one base grid and a frame builder,
 * the markings rolled at hatch, the growth stages, the adult forms, props, icons, souvenirs, and the room painter.
 * Pure functions, no DOM, no canvas, no storage: drawRoom writes tone indices into a plain buffer and the program
 * turns that into ImageData. The grids stay as arrays of text rows so they are editable by hand.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

/* Tone order is the frame/index order used everywhere else: ink, dark, mid, paper. */
var TONES=["#1f2a14","#4a5a32","#7d8a58","#a3ad7e"];
var TONE_OF={k:0,d:1,m:2,p:3};
var DARK=[0,0,1,2];
var BLANK16="................";

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
/* three-by-five digits for the wall calendar and the little flag; paper is left transparent */
var DIGITS={
  "0":["kkk","k.k","k.k","k.k","kkk"],
  "1":[".k.","kk.",".k.",".k.","kkk"],
  "2":["kkk","..k","kkk","k..","kkk"],
  "3":["kkk","..k","kkk","..k","kkk"],
  "4":["k.k","k.k","kkk","..k","..k"],
  "5":["kkk","k..","kkk","..k","kkk"],
  "6":["kkk","k..","kkk","k.k","kkk"],
  "7":["kkk","..k","..k","..k","..k"],
  "8":["kkk","k.k","kkk","k.k","kkk"],
  "9":["kkk","k.k","kkk","..k","kkk"]
};
function digitGrid(n){
  var d=String(n).charAt(0);
  return (DIGITS[d]||DIGITS["0"]).slice();
}
/* a number as a grid: one digit 3 wide, two digits 7 wide with a one-column gap */
function numberGrid(n){
  var s=String(Math.max(0,Math.min(99,Number(n)||0)));
  if(s.length<2) return digitGrid(s);
  var a=rows(digitGrid(s.charAt(0))), b=rows(digitGrid(s.charAt(1))), out=[];
  for(var r=0;r<5;r++) out.push(a[r].join("")+"."+b[r].join(""));
  return out;
}

/* ---------- 芯仔: the base is 16 x 16; eyes at rows 5-6, mouth row 8 ---------- */
var CHIP=[
"......kkk.......",
".......k........",
"..kkkkkkkkkkkk..",
"..kddddddddddk..",
"kkkdmmmmmmmmdkkk",
"..kdmmmmmmmmdk..",
"kkkdmmmmmmmmdkkk",
"..kdmmmmmmmmdk..",
"kkkdmmmmmmmmdkkk",
"..kdmmmmmmmmdk..",
"kkkddddddddddkkk",
"..kddddddddddk..",
"..kkkkkkkkkkkk..",
"...k.k....k.k...",
"...k.k....k.k...",
"................"];
var ANT={
  ball:["......kkk.......",".......k........"],
  stick:[".......k........",".......k........"],
  fork:["......k.k.......",".......k........"],
  bent:["........kk......",".......k........"],
  droop:["................","......kk........"]
};
var PAT={
  plain:function(a){},
  dot:function(a){ setc(a,11,4,"p"); },
  stripe:function(a){ for(var c=4;c<12;c++) setc(a,3,c,"p"); },
  trace:function(a){ [4,7,9,12].forEach(function(c){ setc(a,10,c,"p"); }); setc(a,11,4,"p"); setc(a,11,12,"p"); }
};
var EYE={
  dot:function(a){ [5,10].forEach(function(c){ setc(a,5,c,"k"); setc(a,6,c,"k"); }); },
  bar:function(a){ [[4,5],[10,11]].forEach(function(p){ setc(a,6,p[0],"k"); setc(a,6,p[1],"k"); }); },
  big:function(a){ [[5,6],[9,10]].forEach(function(p){ setc(a,5,p[0],"p"); setc(a,5,p[1],"k"); setc(a,6,p[0],"k"); setc(a,6,p[1],"k"); }); }
};
/* The action names are the program's vocabulary (design.md 3); each one sets only the cells that differ from idle. */
var FACE={
  idle1:{},
  idle2:{squat:true},
  blink:{face:"closed"},
  eat1:{mouth:"open"},
  eat2:{mouth:"chew"},
  happy:{face:"happy",mouth:"open",legs:"dangle"},
  walk1:{legs:"walk1"},
  walk2:{legs:"walk2",squat:true},
  sleep:{face:"sleep",mouth:"none",ant:"droop"},
  wait:{face:"down",mouth:"flat",ant:"droop"},
  surprised:{face:"wow",mouth:"o"},
  hold:{}
};
/* the raw frame builder, kept close to art/chipart.js so the grids above stay the single source */
function build(o){
  o=o||{};
  var a=rows(CHIP), ant=ANT[o.ant||"ball"]||ANT.ball;
  a[0]=ant[0].split(""); a[1]=ant[1].split("");
  (PAT[o.pat||"dot"]||PAT.dot)(a);
  var face=o.face||"open";
  if(face==="open") (EYE[o.eye||"dot"]||EYE.dot)(a);
  if(face==="closed"||face==="sleep"){ [[4,5],[10,11]].forEach(function(p){ setc(a,6,p[0],"k"); setc(a,6,p[1],"k"); }); }
  if(face==="happy"){ [5,10].forEach(function(c){ setc(a,5,c,"k"); setc(a,6,c-1,"k"); setc(a,6,c+1,"k"); }); }
  if(face==="down"){ [5,10].forEach(function(c){ setc(a,6,c,"k"); setc(a,7,c,"k"); }); }
  if(face==="wow"){ [[5,6],[9,10]].forEach(function(p){ setc(a,5,p[0],"k"); setc(a,5,p[1],"k"); setc(a,6,p[0],"k"); setc(a,6,p[1],"k"); }); }
  var m=o.mouth||"smile";
  if(m==="smile"){ setc(a,8,7,"k"); setc(a,8,8,"k"); }
  if(m==="open"){ setc(a,8,7,"k"); setc(a,8,8,"k"); setc(a,9,7,"k"); setc(a,9,8,"k"); setc(a,8,6,"k"); setc(a,8,9,"k"); }
  if(m==="chew"){ for(var c=6;c<10;c++) setc(a,8,c,"k"); }
  if(m==="flat"){ setc(a,9,7,"k"); setc(a,9,8,"k"); }
  if(m==="o"){ setc(a,8,7,"k"); setc(a,8,8,"k"); setc(a,9,7,"k"); setc(a,9,8,"k"); }
  if(m==="fang"){ setc(a,8,6,"k"); setc(a,8,7,"k"); setc(a,8,8,"k"); setc(a,8,9,"k"); setc(a,9,6,"p"); setc(a,9,9,"p"); }
  if(o.legs==="walk1"){ a[13]="...k.k....k.k...".split(""); a[14]="..k...k..k...k..".split(""); }
  if(o.legs==="walk2"){ a[13]="...k.k....k.k...".split(""); a[14]="....kk....kk....".split(""); }
  if(o.legs==="dangle"){ a[13]="...k.k....k.k...".split(""); a[14]="..k...k..k...k..".split(""); }
  var g=join(a);
  if(o.squat){ g=[BLANK16].concat(g.slice(0,13)).concat([g[13],BLANK16]); }
  if(o.jump){ var up=[], pad=[]; for(var j=0;j<o.jump;j++) pad.push(BLANK16); up=g.slice(o.jump).concat(pad); g=up; }
  return g;
}
/* frames({ant, pat, eye, face}): the markings are stored, the face is the two-frame action of the moment */
var RAW_FACE={open:1,closed:1,sleep:1,happy:1,down:1,wow:1,none:1};
function frames(o){
  o=o||{};
  var name=o.face||"idle1", f=FACE[name];
  if(!f){
    /* a few raw faces are useful to a renderer; anything else is a typo and keeps the pet's eyes */
    if(RAW_FACE[name]) f={face:name,mouth:o.mouth,legs:o.legs,squat:o.squat,ant:o.ant};
    else f=FACE.idle1;
  }
  return build({
    ant:f.ant||o.ant||"ball",
    pat:o.pat||"dot",
    eye:o.eye||"dot",
    face:f.face,
    mouth:f.mouth,
    legs:f.legs,
    squat:f.squat
  });
}

var CHIP_EGG=[
"................",
"......kkkk......",
".....kppppk.....",
"....kppmmppk....",
"...kpppmmpppk...",
"...kppppppppk...",
"..kppkkkkkkppk..",
"..kpkkddddkkpk..",
"..kppkdmmdkppk..",
"..kpkkdmmdkkpk..",
"..kppkddddkppk..",
"..kppkkkkkkppk..",
"...kppppppppk...",
"....kpppppmk....",
".....kkkkkk.....",
"................"];
/* the egg's two cracked stages, same shell and the same 16 x 16 box: a short crack at 20 s, a long one at 40 s */
var CHIP_EGG_CRACK=[
[
"................",
"......kkkk......",
".....kppppk.....",
"....kppmmdpk....",
"...kpppmdpppk...",
"...kpppdppppk...",
"..kppkkkkkkppk..",
"..kpkkddddkkpk..",
"..kppkdmmdkppk..",
"..kpkkdmmdkkpk..",
"..kppkddddkppk..",
"..kppkkkkkkppk..",
"...kppppppppk...",
"....kpppppmk....",
".....kkkkkk.....",
"................"],
[
"................",
"......kkkk......",
".....kppdpk.....",
"....kppmmdpk....",
"...kpppddpppk...",
"...kppddppppk...",
"..kppkkpkkkppk..",
"..kpkkdpddkkpk..",
"..kppkdmpdkppk..",
"..kpkkdpmdkkpk..",
"..kppkddpdkppk..",
"..kppkkkpkkppk..",
"...kppppdpppk...",
"....kppppdmk....",
".....kkkkkk.....",
"................"]
];
var CHIP_BABY=[
"................",
"................",
"................",
"................",
"................",
".......kk.......",
"....kkkkkkkk....",
"....kmmmmmmk....",
"...kkmkmmkmkk...",
"....kmkmmkmk....",
"...kkmmmmmmkk...",
"....kmmkkmmk....",
"....kkkkkkkk....",
".....k....k.....",
"................",
"................"];
var CHIP_CHILD=[
"................",
"................",
".......kk.......",
"........k.......",
"...kkkkkkkkkk...",
"...kddddddddk...",
"..kkdmmmmmmdkk..",
"...kdmkmmkmdk...",
"..kkdmkmmkmdkk..",
"...kdmmkkmmdk...",
"..kkdmmmmmmdkk..",
"...kddpdddddk...",
"...kkkkkkkkkk...",
"....k.k..k.k....",
"....k.k..k.k....",
"................"];

/* ---------- adult forms: accessories in base coordinates, then the base lifted onto a 20 x 20 canvas at (2,4) ---------- */
var ADULT={
  plain:{name:"普通",acc:[]},
  book:{name:"书虫",eye:"dot",face:"none",acc:[{r:5,c:4,g:["kkk..kkk"]},{r:6,c:4,g:["k.k..k.k"]},{r:5,c:7,g:["kk"]}]},
  walk:{name:"走路家",clearAnt:true,acc:[{r:-2,c:2,g:["...kkkkkk...","..kmmmmmmk..","..kmmmmmmk..","kkkkkkkkkkkk"]},{r:8,c:9,g:["kkkkk","kpkdk","kkkkk"]}]},
  scholar:{name:"学者",clearAnt:true,acc:[{r:-2,c:1,g:["......kk......","kkkkkkkkkkkkkk","..kkkkkkkkkk..","...kddddddk..."]},{r:0,c:15,g:["k","k","d"]}]},
  diary:{name:"日记家",acc:[{r:3,c:13,g:[".....k","....kd","...kdk","..kdk.",".kdk..","kpk...","kk...."]}]},
  monster:{name:"小怪兽",clearAnt:true,mouth:"fang",acc:[{r:0,c:2,g:["k..","kk.","kkk"]},{r:0,c:11,g:["..k",".kk","kkk"]}]}
};
function adult(id,o){
  var A=ADULT[id]||ADULT.plain, x={};
  if(o) for(var k in o) if(Object.prototype.hasOwnProperty.call(o,k)) x[k]=o[k];
  if(A.mouth) x.mouth=A.mouth;
  if(A.face==="none") x.face="none";
  var g=rows(build(x));
  if(A.face==="none"){ setc(g,6,5,"k"); setc(g,6,10,"k"); }
  if(A.clearAnt){ g[0]=BLANK16.split(""); g[1]=BLANK16.split(""); }
  var out=[], r, c;
  for(r=0;r<20;r++) out.push(blankGrid(20,1,".")[0].split(""));
  for(r=0;r<16;r++) for(c=0;c<16;c++) if(g[r][c]!==".") out[r+4][c+2]=g[r][c];
  A.acc.forEach(function(a){
    a.g.forEach(function(line,i){
      line.split("").forEach(function(v,j){
        if(v===".") return;
        var rr=a.r+i+4, cc=a.c+j+2;
        if(out[rr] && out[rr][cc]!==undefined) out[rr][cc]=v;
      });
    });
  });
  return join(out);
}

/* ---------- props: the things it puts in the room to show something ---------- */
var PROPS={
  card:["kkkkkkkkk","kpppppppk","kpkkkkppk","kpppppppk","kpkkkkkpk","kpppppppk","kkkkkkkkk"],
  flag:["kkkkkkkk","kppppppk","kpkkkppk","kpppkppk","kppkkppk","kpppkppk","kpkkkppk","kppppppk","kkkkkkkk","k.......","k.......","k.......","k.......","k......."],
  /* the flag with its number slot empty, for a day count drawn with numberGrid */
  flagBlank:["kkkkkkkk","kppppppk","kppppppk","kppppppk","kppppppk","kppppppk","kppppppk","kppppppk","kkkkkkkk","k.......","k.......","k.......","k.......","k......."],
  books:["...kkkkkkkk.","...kmmmmmmk.","..kkkkkkkkkk","..kpppppppdk",".kkkkkkkkkk.",".kdddddddmk.","kkkkkkkkkkkk","kmmmmmmmmmpk","kkkkkkkkkkkk"],
  film:[".kkkkk..","kdpddk..","kdddkkkk","kdddkmmk","kdddkkkk","kdddk...",".kkkk..."],
  /* the same bowl in both states, so the owner can tell which is which: a heap of dark food over the rim, or an empty
     dark inside; the body is paper, outlined in ink */
  bowl:["..........","...d.d....","..ddddd...","kkkkkkkkkk","kddddddddk",".kppppppk.","..kkkkkk.."],
  bowlEmpty:["..........","..........","..........","kkkkkkkkkk","kddddddddk",".kppppppk.","..kkkkkk.."],
  /* a small coiled pile in three tones, not a smear: ink edge, mid body, dark turns */
  poop:["..kkk..",".kmmmk.","kmdmmmk","kmmdmmk",".kmmmk.","..kkk.."],
  heart:[".kk.kk.","kddkddk","kdddddk",".kdddk.","..kdk..","...k..."],
  heartE:[".kk.kk.","k..k..k","k.....k",".k...k.","..k.k..","...k..."],
  sign:["kkkkkkkkkkkkkkkk","kppppppppppppppk","kppppppppppppppk","kppppppppppppppk","kppppppppppppppk","kppppppppppppppk","kkkkkkkkkkkkkkkk",".......kk.......",".......kk.......",".......kk.......",".....kkkkkk....."],
  zz:["....kkkkkk..",".........k..","........k...",".......k....","......k.....",".....k......","....kkkkkk..","............","..kkk.......","....k.......","...k........","..kkk......."],
  pen:["......kkk","..kkkkkpk","..k...kkk"],
  desk:["kkkkkkkkkkkkkkkkkkkkkkkkk","kpppppppppppppppppppppppk","kpkkkkkkkkkkkkkkkkkkkkkpk","kpppppppppppppppppppppppk","kkkkkkkkkkkkkkkkkkkkkkkkk","..k...................k..",".k.....................k.","kk....................kk."],
  scarf:["...kkkkkk...","..kmmmmmmk..","..kmppppmk..","..kmmmmmmk..",".kkkkkkkkkk.","k...k..k...k","....k..k....","....k..k...."],
  mooncake:["....kkkk....","...kmmmmk...","..kmppppmk..",".kmmkkkkmmk.",".kmkmmmmkmk.",".kmkmmmmkmk.",".kmmkkkkmmk.","..kmppppmk..","...kmmmmk...","....kkkk...."]
};

/* ---------- the eight icon-row icons, 8 x 8 ---------- */
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

/* ---------- the room: 81 x 60 room pixels, style B ---------- */
var ROOM_W=81, ROOM_H=60;
function put(buf,w,h,x,y,t){
  x=Math.floor(x); y=Math.floor(y);
  if(x<0||y<0||x>=w||y>=h) return;
  buf[y*w+x]=t;
}
function rect(buf,w,h,x,y,rw,rh,t){
  for(var r=0;r<rh;r++) for(var c=0;c<rw;c++) put(buf,w,h,x+c,y+r,t);
}
function blit(buf,w,h,grid,x,y){
  if(!grid) return buf;
  for(var r=0;r<grid.length;r++){
    var row=grid[r], line=String(row);
    for(var c=0;c<line.length;c++){
      var t=TONE_OF[line.charAt(c)];
      if(t!==undefined) put(buf,w,h,x+c,y+r,t);
    }
  }
  return buf;
}
/* any non-transparent cell in one tone: the night Zz is drawn after darkening so it stays paper */
function blitTone(buf,w,h,grid,x,y,t){
  if(!grid) return buf;
  for(var r=0;r<grid.length;r++){
    var line=String(grid[r]);
    for(var c=0;c<line.length;c++) if(line.charAt(c)!==".") put(buf,w,h,x+c,y+r,t);
  }
  return buf;
}
function darken(buf){
  for(var i=0;i<buf.length;i++) buf[i]=DARK[buf[i]]||0;
  return buf;
}
var CLOUD=["..pppp....",".pppppp.pp","pppppppppp"];
var Moon=["..pp.","...pp","...pp","..pp."];
var STARS=[[8,9],[11,15],[20,17],[9,18]];
var BOOKS=[[58,15,"d",3],[61,13,"m",2],[63,16,"k",3],[66,14,"d",2],[68,12,"m",3],[71,15,"d",2],[73,16,"m",3],
           [58,30,"m",2],[60,28,"k",3],[63,31,"d",2],[65,29,"m",3],[68,30,"d",2],[70,28,"m",3],[73,31,"k",3]];
var POOPS=[[22,51],[27,52],[32,51]];

/* A small seasonal mark in the window, so the room notices the year without a new layout. */
function seasonMark(buf,w,h,season){
  var s=String(season||"").toLowerCase();
  if(/spring|春/.test(s)){
    put(buf,w,h,8,9,3); put(buf,w,h,9,9,3); put(buf,w,h,8,10,3); put(buf,w,h,10,10,3);
  } else if(/summer|夏/.test(s)){
    put(buf,w,h,20,8,3); put(buf,w,h,21,8,3); put(buf,w,h,20,9,3); put(buf,w,h,21,9,3);
  } else if(/autumn|fall|秋/.test(s)){
    put(buf,w,h,19,17,1); put(buf,w,h,20,18,1); put(buf,w,h,19,18,1); put(buf,w,h,18,18,1);
  } else if(/winter|冬/.test(s)){
    put(buf,w,h,8,9,3); put(buf,w,h,11,18,3); put(buf,w,h,20,18,3); put(buf,w,h,17,8,3);
  }
}

/* The furniture and the room's own props. A pack may keep this painter and only swap its grids;
   a second room can replace draw entirely and still get the pet, prop, sign and Zz from drawRoom. */
function paintRoom(buf,w,h,scene,pack){
  var room=(pack&&pack.room)||CHIP_ROOM, x, y, row;
  /* the wall, its dot pattern, and the plank floor */
  rect(buf,w,h,0,0,w,h,3);
  for(y=2;y<42;y+=6) for(x=(y%12===2?1:4);x<w;x+=6) put(buf,w,h,x,y,2);
  rect(buf,w,h,0,43,w,1,0);
  rect(buf,w,h,0,44,w,h-44,2);
  for(y=47;y<h;y+=4) rect(buf,w,h,0,y,w,1,1);
  for(row=0;row<4;row++) for(x=(row%2?4:12);x<w;x+=18) rect(buf,w,h,x,44+row*4+1,1,3,1);

  /* window: day sky with a cloud, or night with the moon and a few stars */
  rect(buf,w,h,5,6,20,16,0);
  if(scene.night){
    rect(buf,w,h,6,7,18,14,0);
    blit(buf,w,h,Moon,17,9);
    STARS.forEach(function(p){ put(buf,w,h,p[0],p[1],3); });
  } else {
    rect(buf,w,h,6,7,18,14,2);
    blit(buf,w,h,CLOUD,9,10);
  }
  seasonMark(buf,w,h,scene.season);
  rect(buf,w,h,14,7,1,14,1);
  rect(buf,w,h,6,13,18,1,1);

  /* the wall calendar: a dark header and today's number in three-by-five digits */
  rect(buf,w,h,31,7,11,13,0);
  rect(buf,w,h,32,8,9,1,1);
  rect(buf,w,h,32,9,9,10,3);
  var day=Math.max(1,Math.min(31,Number(scene.dayOfMonth)||1)), ds=String(day);
  if(ds.length<2) blit(buf,w,h,digitGrid(day),35,11);
  else blit(buf,w,h,numberGrid(day),33,11);

  /* bookshelf, with books at two heights */
  rect(buf,w,h,56,10,22,33,0);
  rect(buf,w,h,57,11,20,31,3);
  rect(buf,w,h,57,25,20,1,0);
  BOOKS.forEach(function(b){
    var top=b[1], bh=(b[1]<25?25:42)-top;
    rect(buf,w,h,b[0],top,b[3],bh,TONE_OF[b[2]]);
  });

  /* bed in the left corner */
  rect(buf,w,h,3,38,18,6,0);
  rect(buf,w,h,4,39,16,4,3);
  rect(buf,w,h,4,39,5,2,2);

  /* the rug: a small rectangle with an ink border and a simple mid pattern, under the pet's feet */
  rect(buf,w,h,38,48,16,5,0);
  rect(buf,w,h,39,49,14,3,3);
  for(x=40;x<52;x+=4){ put(buf,w,h,x,49,2); put(buf,w,h,x+1,51,2); }
  put(buf,w,h,46,50,1); put(buf,w,h,47,50,1);

  /* bowl and the little piles, from this room's own props */
  var bowlAt=room.bowlAt||[9,47];
  blit(buf,w,h,scene.bowlFull?room.bowl:room.bowlEmpty,bowlAt[0],bowlAt[1]);
  var mess=Math.max(0,Math.min(3,Number(scene.mess)||0)), poops=room.poops||POOPS;
  for(var m=0;m<mess;m++) if(poops[m]) blit(buf,w,h,room.poop,poops[m][0],poops[m][1]);
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
  var petX=(scene.petX!==undefined)?scene.petX:(room.petX!==undefined?room.petX:40);
  var petY=(scene.petY!==undefined)?scene.petY:(room.petY!==undefined?room.petY:36);
  if(scene.pet) blit(buf,w,h,scene.pet,petX,petY);

  if(scene.prop){
    var pw=gridWidth(scene.prop), ph=gridHeight(scene.prop);
    var px=(scene.propX!==undefined)?scene.propX:petX+(room.propDx!==undefined?room.propDx:17);
    var py=(scene.propY!==undefined)?scene.propY:petY+16-ph;
    if(px>w-pw) px=w-pw;
    if(py>h-ph) py=h-ph;
    if(px<0) px=0; if(py<0) py=0;
    blit(buf,w,h,scene.prop,px,py);
  }

  /* the away sign: the board can be passed in, otherwise the room's own sign */
  if(scene.sign){
    var sg=(scene.sign.length && typeof scene.sign!=="string")?scene.sign:room.sign;
    var at=room.signAt||[32,37];
    var sx=(scene.signX!==undefined)?scene.signX:at[0], sy=(scene.signY!==undefined)?scene.signY:at[1];
    blit(buf,w,h,sg,sx,sy);
  }

  var zx=0, zy=0;
  if(scene.zz){
    zx=petX+(room.zzDx!==undefined?room.zzDx:13);
    zy=petY+(room.zzDy!==undefined?room.zzDy:-10);
    if(zx>w-12) zx=w-12; if(zx<0) zx=0;
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
  w:ROOM_W, h:ROOM_H,
  petX:40, petY:36,
  bowl:PROPS.bowl, bowlEmpty:PROPS.bowlEmpty, poop:PROPS.poop, sign:PROPS.sign, zz:PROPS.zz,
  bowlAt:[9,47],
  poops:POOPS,
  signAt:[32,37],
  propDx:17,
  zzDx:13, zzDy:-10,
  draw:paintRoom
};

var CHIP_PACK={
  id:"chip",
  name:{zh:"芯仔",en:"Chip"},
  faces:["idle1","idle2","blink","eat1","eat2","happy","walk1","walk2","sleep","wait","surprised","hold"],
  frames:frames,
  adult:adult,
  egg:CHIP_EGG,
  eggCrack:CHIP_EGG_CRACK,
  baby:CHIP_BABY,
  child:CHIP_CHILD,
  marks:{ant:["ball","stick","fork","bent"],pat:["plain","dot","stripe","trace"],eye:["dot","bar","big"]},
  forms:["book","walk","scholar","diary","monster","plain"],
  props:PROPS,
  room:CHIP_ROOM,
  icons:ICONS,
  souvenirs:SOUV
};
var PACKS={chip:CHIP_PACK};

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
  join:join
};
})();
