/* 芯仔 (Chip): the full set. Base 16x16; eyes at rows 5-6, cols 5 and 10; mouth row 8, cols 7-8. */
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
var BLANK16="................";
function G(g){ return g.map(function(r){ return r.split(""); }); }
function J(a){ return a.map(function(r){ return r.join(""); }); }
function setc(a,r,c,v){ if(a[r] && a[r][c]!==undefined) a[r][c]=v; }
var ANT={ /* rows 0-1 */
  ball:["......kkk.......",".......k........"],
  stick:[".......k........",".......k........"],
  fork:["......k.k.......",".......k........"],
  bent:["........kk......",".......k........"],
  droop:["................","......kk........"]
};
var PAT={ /* applied on the dark band */
  plain:function(a){},
  dot:function(a){ setc(a,11,4,"p"); },
  stripe:function(a){ for(var c=4;c<12;c++) setc(a,3,c,"p"); },
  trace:function(a){ [4,7,9,12].forEach(function(c){ setc(a,10,c,"p"); }); setc(a,11,4,"p"); setc(a,11,12,"p"); }
};
var EYE={ /* open eyes */
  dot:function(a){ [5,10].forEach(function(c){ setc(a,5,c,"k"); setc(a,6,c,"k"); }); },
  bar:function(a){ [[4,5],[10,11]].forEach(function(p){ setc(a,6,p[0],"k"); setc(a,6,p[1],"k"); }); },
  big:function(a){ [[5,6],[9,10]].forEach(function(p){ setc(a,5,p[0],"p"); setc(a,5,p[1],"k"); setc(a,6,p[0],"k"); setc(a,6,p[1],"k"); }); }
};
function chip(o){
  o=o||{}; var a=G(CHIP);
  var ant=ANT[o.ant||"ball"]; a[0]=ant[0].split(""); a[1]=ant[1].split("");
  PAT[o.pat||"dot"](a);
  var face=o.face||"open";
  if(face==="open") EYE[o.eye||"dot"](a);
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
  var g=J(a);
  if(o.squat){ g=[BLANK16].concat(g.slice(0,13)).concat([g[13],BLANK16]); }
  if(o.jump){ g=g.slice(o.jump).concat(Array(o.jump).fill(BLANK16)); }
  return g;
}
/* growth */
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
var CHIP_EGG=[ /* a sealed capsule with a tiny chip inside */
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
/* adult forms: accessory cells and grids over the base, in base coordinates (rows may be negative) */
var ADULT={
  plain:{name:"普通", acc:[]},
  book:{name:"书虫（常读书）", eye:"dot", acc:[{r:5,c:4,g:["kkk..kkk"]},{r:6,c:4,g:["k.k..k.k"]},{r:5,c:7,g:["kk"]}], face:"none"},
  walk:{name:"走路家（常拍照）", clearAnt:true, acc:[{r:-2,c:2,g:["...kkkkkk...","..kmmmmmmk..","..kmmmmmmk..","kkkkkkkkkkkk"]},{r:8,c:9,g:["kkkkk","kpkdk","kkkkk"]}]},
  scholar:{name:"学者（常查词）", clearAnt:true, acc:[{r:-2,c:1,g:["......kk......","kkkkkkkkkkkkkk","..kkkkkkkkkk..","...kddddddk..."]},{r:0,c:15,g:["k","k","d"]}]},
  diary:{name:"日记家（常写日记）", acc:[{r:3,c:13,g:[".....k","....kd","...kdk","..kdk.",".kdk..","kpk...","kk...."]}]},
  monster:{name:"小怪兽（常玩游戏）", clearAnt:true, mouth:"fang", acc:[{r:0,c:2,g:["k..","kk.","kkk"]},{r:0,c:11,g:["..k",".kk","kkk"]}]}
};
function adult(id,o){
  var A=ADULT[id]; o=Object.assign({},o||{});
  if(A.mouth) o.mouth=A.mouth;
  if(A.face==="none"){ o.face="none"; }
  var g=G(chip(o));
  if(A.face==="none"){ setc(g,6,5,"k"); setc(g,6,10,"k"); }
  if(A.clearAnt){ g[0]=BLANK16.split(""); g[1]=BLANK16.split(""); }
  /* 20x20 canvas: base at (2,4) */
  var out=[]; for(var r=0;r<20;r++) out.push("....................".split(""));
  for(var r2=0;r2<16;r2++) for(var c2=0;c2<16;c2++) if(g[r2][c2]!==".") out[r2+4][c2+2]=g[r2][c2];
  A.acc.forEach(function(x){ x.g.forEach(function(line,i){ line.split("").forEach(function(v,j){ if(v!=="."){ var rr=x.r+i+4, cc=x.c+j+2; if(out[rr] && out[rr][cc]!==undefined) out[rr][cc]=v; } }); }); });
  return J(out);
}
var POSTCARD=SOUV.post.grid;
