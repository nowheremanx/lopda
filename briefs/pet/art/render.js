/* Draws the mockups. Every call returns a PNG data URL quantized to the four tones. */
var W=331, H=359, FONT='"DotGothic16"', PIX='"VT323","DotGothic16"';
var C, X, S;
function mk(w,h,s){ C=document.createElement("canvas"); C.width=w*s; C.height=h*s; X=C.getContext("2d"); X.imageSmoothingEnabled=false; X.setTransform(s,0,0,s,0,0); S=s; X.fillStyle=TONE.p; X.fillRect(0,0,w,h); }
function rect(x,y,w,h,t){ X.fillStyle=TONE[t]; X.fillRect(x,y,w,h); }
function box(x,y,w,h,t,b){ b=b||2; rect(x,y,w,b,t); rect(x,y+h-b,w,b,t); rect(x,y,b,h,t); rect(x+w-b,y,b,h,t); }
function dither(x,y,w,h,t){ X.fillStyle=TONE[t]; for(var j=0;j<h;j++) for(var i=0;i<w;i++) if((x+i+y+j)%2===0) X.fillRect(x+i,y+j,1,1); }
function spr(g,x,y,s,map){
  for(var r=0;r<g.length;r++) for(var c=0;c<g[r].length;c++){
    var v=g[r][c]; if(v===".") continue; if(map) v=map(v); if(!v) continue;
    if(v==="ghost") dither(x+c*s,y+r*s,s,s,"m"); else rect(x+c*s,y+r*s,s,s,v);
  }
}
function text(s,x,y,size,t,align,font){ X.font=size+"px "+(font||FONT); X.fillStyle=TONE[t||"k"]; X.textAlign=align||"left"; X.textBaseline="top"; X.fillText(s,x,y); }
function shift(g,dy){ var e="".padEnd(g[0].length,"."), a=g.slice(); if(dy>0){ for(var i=0;i<dy;i++){ a.pop(); a.unshift(e); } } else { for(var j=0;j<-dy;j++){ a.shift(); a.push(e); } } return a; }
function status(title){
  text("09:41",10,6,20,"k","left",PIX); text(title,W/2,6,16,"k","center"); text("LP-86",W-10,8,15,"k","right",PIX);
  rect(0,28,W,2,"k");
}
function softkeys(keys){ /* [{k,label,on,a}] SELECT START B A */
  var y=H-48, w=(W-8-12)/4;
  keys.forEach(function(s,i){
    var x=4+i*(w+4);
    if(s.a&&s.on){ rect(x,y,w,44,"k"); }
    else box(x,y,w,44,s.on?"k":"m");
    text(s.k,x+w/2,y+5,11,s.a&&s.on?"m":"d","center",PIX);
    if(s.label) text(s.label,x+w/2,y+20,14,s.a&&s.on?"p":(s.on?"k":"d"),"center");
  });
}
function quant(){
  var d=X.getImageData(0,0,C.width,C.height), a=d.data, T=["k","d","m","p"].map(function(k){ var h=TONE[k]; return [parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)]; });
  for(var i=0;i<a.length;i+=4){ var best=0,bd=1e9; for(var t=0;t<4;t++){ var dr=a[i]-T[t][0],dg=a[i+1]-T[t][1],db=a[i+2]-T[t][2],dd=dr*dr+dg*dg+db*db; if(dd<bd){bd=dd;best=t;} } a[i]=T[best][0];a[i+1]=T[best][1];a[i+2]=T[best][2];a[i+3]=255; }
  X.putImageData(d,0,0); return C.toDataURL("image/png");
}
var KEYS=[{k:"SELECT",label:"",on:false},{k:"START",label:"信",on:true},{k:"B",label:"返回",on:true},{k:"A",label:"用",on:true,a:true}];
var LIT=function(v){ return (v==="k"||v==="d")?"k":null; };

/* ---------- A 蛋壳机: a coarse dot-matrix window and two rows of icons ---------- */
function styleA(){
  mk(W,H,2); status("小拾");
  var top=["food","light","play","wash"], bot=["look","box","mail","call"], sel="food", att="call";
  function icons(list,y){ list.forEach(function(n,i){ var cx=Math.round(W*(i+1)/5)-12; spr(ICON[n],cx,y,3,function(v){ return (n===sel||n===att)?"k":"ghost"; }); if(n===sel) rect(cx,y+27,24,2,"k"); }); }
  icons(top,38);
  /* the dot matrix: 32x16 dots */
  var buf=[]; for(var r=0;r<16;r++){ buf.push([]); for(var c=0;c<32;c++) buf[r].push(0); }
  function put(g,col,row){ for(var r=0;r<g.length;r++) for(var c=0;c<g[r].length;c++){ var v=g[r][c]; if((v==="k"||v==="d") && buf[row+r] && buf[row+r][col+c]!==undefined) buf[row+r][col+c]=1; } }
  put(CH.mochi.grid,8,0); put(P.poop,25,10);
  var x0=22,y0=78,pitch=9;
  box(x0-8,y0-8,288+14,144+14,"k");
  for(var rr=0;rr<16;rr++) for(var cc=0;cc<32;cc++){ var x=x0+cc*pitch, y=y0+rr*pitch; if(buf[rr][cc]) rect(x,y,8,8,"k"); else dither(x,y,8,8,"m"); }
  icons(bot,240);
  text("◀▶ 选图标　长按 A 摸摸它",W/2,282,13,"d","center");
  softkeys(KEYS); return quant();
}

/* ---------- B 小屋: a small room seen through the LCD; props appear in it ---------- */
function styleB(){
  mk(W,H,2); status("小拾");
  var gs=4, ox=3, oy=32, GW=81, GH=60;
  function g(x,y,w,h,t){ rect(ox+x*gs,oy+y*gs,w*gs,h*gs,t); }
  function gspr(grid,x,y,map){ spr(grid,ox+x*gs,oy+y*gs,gs,map); }
  /* wall with a small dot pattern, floor with planks */
  for(var y=2;y<42;y+=6) for(var x=(y%12===2?1:4);x<GW;x+=6) g(x,y,1,1,"m");
  g(0,43,GW,1,"k"); g(0,44,GW,GH-44,"m");
  for(var py=47;py<GH;py+=4) g(0,py,GW,1,"d");
  for(var px=6,row=0;row<4;row++) for(px=(row%2?4:12);px<GW;px+=18) g(px,44+row*4+1,1,3,"d");
  /* window: sky, a cloud, the cross bars */
  g(5,6,20,16,"k"); g(6,7,18,14,"m");
  gspr(["..pppp....",".pppppp.pp","pppppppppp"],9,10);
  g(14,7,1,14,"k"); g(6,13,18,1,"k");
  /* wall calendar with today's number */
  g(31,7,11,13,"k"); g(32,9,9,10,"p"); g(32,8,9,1,"d");
  var two=["kkk","..k","kkk","k..","kkk"], four=["k.k","k.k","kkk","..k","..k"];
  gspr(two,33,11); gspr(four,37,11);
  /* bookshelf */
  g(56,10,22,33,"k"); g(57,11,20,31,"p"); g(57,25,20,1,"k");
  var books=[[58,15,"d",3],[61,13,"m",2],[63,16,"k",3],[66,14,"d",2],[68,12,"m",3],[71,15,"d",2],[73,16,"m",3],
             [58,30,"m",2],[60,28,"k",3],[63,31,"d",2],[65,29,"m",3],[68,30,"d",2],[70,28,"m",3],[73,31,"k",3]];
  books.forEach(function(b){ var top=b[1], h=(b[1]<25?25:42)-top; g(b[0],top,b[3],h,b[2]); });
  /* rug, bowl, the pet holding a word card */
  for(var ry=0;ry<5;ry++){ var half=14-Math.abs(2-ry)*3; for(var rx=-half;rx<half;rx++) if((rx+ry)%2===0) g(40+rx,46+ry,1,1,"p"); }
  gspr(P.bowl,9,47);
  gspr(CH.mochi.grid,32,31);
  gspr(P.card,46,40);
  /* menu row */
  var names=["food","play","wash","light","look","box","mail","call"], y0=oy+GH*gs+6;
  names.forEach(function(n,i){ var x=6+i*40; if(i===0) box(x,y0-4,36,26,"k"); spr(ICON[n],x+10,y0+1,2,function(){ return (i===0||n==="call")?"k":"m"; }); });
  softkeys(KEYS); return quant();
}

/* ---------- C 字符屏: an HD44780-style character LCD, the pet built from custom characters ---------- */
var F5={
"0":[".kkk.","k...k","k..kk","k.k.k","kk..k","k...k",".kkk."],"1":["..k..",".kk..","..k..","..k..","..k..","..k..",".kkk."],
"2":[".kkk.","k...k","....k","...k.","..k..",".k...","kkkkk"],"3":["kkkkk","...k.","..k..","...k.","....k","k...k",".kkk."],
"4":["...k.","..kk.",".k.k.","k..k.","kkkkk","...k.","...k."],"5":["kkkkk","k....","kkkk.","....k","....k","k...k",".kkk."],
"6":["..kk.",".k...","k....","kkkk.","k...k","k...k",".kkk."],"7":["kkkkk","....k","...k.","..k..",".k...",".k...",".k..."],
"8":[".kkk.","k...k","k...k",".kkk.","k...k","k...k",".kkk."],"9":[".kkk.","k...k","k...k",".kkkk","....k","...k.",".kk.."],
"D":["kkk..","k..k.","k...k","k...k","k...k","k..k.","kkk.."],"A":[".kkk.","k...k","k...k","kkkkk","k...k","k...k","k...k"],
"Y":["k...k","k...k",".k.k.","..k..","..k..","..k..","..k.."],":":[".....",".kk..",".kk..",".....",".kk..",".kk..","....."],
"^":["..k..",".k.k.","k...k",".....",".....",".....","....."],"!":["..k..","..k..","..k..","..k..","..k..",".....","..k.."],
"H":["k...k","k...k","k...k","kkkkk","k...k","k...k","k...k"],
"food":[".....","k.k.k",".k.k.","kkkkk","k...k",".kkk.","....."],"light":[".kkk.","k...k","k...k","k...k",".k.k.",".kkk.",".kkk."],
"play":[".kkk.","k.k.k","kk..k","k..kk","k.k.k",".kkk.","....."],"wash":["..k..","..k..",".k.k.",".k.k.","k...k","k...k",".kkk."],
"look":[".....",".kkk.","k...k","k.k.k","k...k",".kkk.","....."],"box":["kkkkk","k...k","kkkkk","k.k.k","k...k","k...k","kkkkk"],
"mail":[".....","kkkkk","kk.kk","k.k.k","k...k","kkkkk","....."],"hf":[".....",".k.k.","kkkkk","kkkkk",".kkk.","..k..","....."],
"he":[".....",".k.k.","k.k.k","k...k",".k.k.","..k..","....."],"poop":["..k..",".k.k.",".kkk.","k...k","kkkkk",".....","....."]
};
function styleC(){
  mk(W,H,2); status("小拾");
  var cols=13, rowsN=6, dot=4, cw=5*dot+4, chh=8*dot+4, x0=Math.round((W-(cols*cw-4))/2), y0=56;
  box(x0-10,y0-10,cols*cw-4+20,rowsN*chh-4+20,"k");
  var cells=[]; for(var r=0;r<rowsN;r++){ cells.push([]); for(var c=0;c<cols;c++) cells[r].push(null); }
  function str(s,r,c){ s.split("").forEach(function(ch,i){ if(ch!==" ") cells[r][c+i]=F5[ch]; }); }
  str("DAY12",0,0); cells[0][9]=F5.hf; cells[0][10]=F5.hf; cells[0][11]=F5.he; cells[0][12]=F5["!"];
  /* the pet: 3x2 custom characters cut from the 16x16 sprite */
  var g=CH.mochi.grid;
  for(var cr=0;cr<2;cr++) for(var cc=0;cc<3;cc++){
    var glyph=[]; for(var y=0;y<8;y++){ var line=""; for(var x=0;x<5;x++){ var v=g[cr*8+y][1+cc*5+x]; line+=(v==="k"||v==="d")?"k":"."; } glyph.push(line); }
    cells[1+cr][4+cc]=glyph;
  }
  cells[2][9]=F5.poop;
  ["food","light","play","wash","look","box","mail"].forEach(function(n,i){ cells[4][i*2]=F5[n]; });
  cells[5][0]=F5["^"]; str("09:41",5,8);
  for(var r2=0;r2<rowsN;r2++) for(var c2=0;c2<cols;c2++){
    var gl=cells[r2][c2], bx=x0+c2*cw, by=y0+r2*chh;
    for(var yy=0;yy<8;yy++) for(var xx=0;xx<5;xx++){
      var on=gl && gl[yy] && gl[yy][xx]==="k", px=bx+xx*dot, py=by+yy*dot;
      if(on) rect(px,py,dot-1,dot-1,"k"); else dither(px,py,dot-1,dot-1,"m");
    }
  }
  text("每格 5×8 点，宠物由 6 个自造字拼成",W/2,y0+rowsN*chh+14,12,"d","center");
  softkeys(KEYS); return quant();
}

/* ---------- D 段码: Game & Watch style, fixed poses printed on the glass, ghosts visible ---------- */
var SEG={a:[1,0,4,1],b:[5,1,1,4],c:[5,6,1,4],d:[1,10,4,1],e:[0,6,1,4],f:[0,1,1,4],g:[1,5,4,1]};
var DIG={"0":"abcdef","1":"bc","2":"abged","3":"abgcd","4":"fgbc","5":"afgcd","6":"afgedc","7":"abc","8":"abcdefg","9":"abcdfg"};
function seg7(ch,x,y,s){ for(var k in SEG){ var q=SEG[k], on=DIG[ch]&&DIG[ch].indexOf(k)>=0; if(on) rect(x+q[0]*s,y+q[1]*s,q[2]*s,q[3]*s,"k"); else dither(x+q[0]*s,y+q[1]*s,q[2]*s,q[3]*s,"m"); } }
function styleD(){
  mk(W,H,2); status("小拾");
  /* printed background (mid lines): window, floor, bed, door */
  box(118,52,96,64,"m"); rect(165,52,2,64,"m"); rect(118,83,96,2,"m");
  rect(8,264,W-16,2,"m");
  box(238,246,84,18,"m"); box(242,238,20,10,"m");
  /* clock and heart meter */
  seg7("0",210,36,3); seg7("9",232,36,3); rect(254,44,3,3,"k"); rect(254,56,3,3,"k"); seg7("4",262,36,3); seg7("1",284,36,3);
  for(var i=0;i<5;i++) spr(P.heart,10+i*22,40,3,function(v){ return v==="."?null:(i<3?(v==="k"?"k":"k"):"ghost"); });
  /* segments: three pet poses, bowl food, poops, Zz, heart pop, card, the travel sign */
  var on=function(){ return function(v){ return v==="p"?"p":"k"; }; }, ghost=function(v){ return v==="p"?null:"ghost"; };
  spr(silhouette(CH.mochi,"eat"),20,196,4,ghost);
  spr(P.bowl,86,249,3,ghost);
  spr(silhouette(CH.mochi),132,196,4,on());
  spr(P.card,200,226,3,ghost);
  spr(silhouette(CH.mochi,"sleep"),248,186,4,ghost);
  text("Z",268,150,22,"m","left",PIX); text("z",286,138,18,"m","left",PIX);
  spr(P.poop,205,250,2,on()); spr(P.poop,222,250,2,ghost);
  spr(P.heart,196,176,3,ghost);
  spr(P.sign,18,120,4,ghost);
  text("ALARM",210,72,13,"d","left",PIX); text("AM",292,72,13,"d","left",PIX);
  text("灰色的格子是没亮的段：每个位置只有一个固定的姿势",W/2,276,11,"d","center");
  softkeys(KEYS); return quant();
}

/* ---------- character sheet ---------- */
function sheet(){
  var SW=660, SH=760; mk(SW,SH,1);
  text("三个角色 · 同一套动作（放大 5 倍）",16,12,20,"k");
  var labels=["待机 1","待机 2","吃饭","开心","睡觉","抱单词卡"], s=5, cw=104;
  var y=48;
  ["mochi","pip","chip"].forEach(function(id){
    var c=CH[id]; text(c.name,16,y,18,"k"); y+=28;
    var frames=[c.grid, shift(c.grid,1), variant(c,"eat"), shift(variant(c,"happy"),-2), variant(c,"sleep"), c.grid];
    frames.forEach(function(f,i){
      var x=16+i*cw; spr(f,x,y,s);
      if(i===2) spr(P.bowl,x+30,y+62,2);
      if(i===3) spr(P.heart,x+60,y-4,2);
      if(i===4){ text("z",x+70,y-2,18,"d","left",PIX); text("Z",x+80,y-14,22,"d","left",PIX); }
      if(i===5) spr(P.card,x+46,y+38,3);
      text(labels[i],x+40,y+84,13,"d","center");
    });
    y+=112;
  });
  rect(16,y,SW-32,2,"k"); y+=12;
  text("共用：蛋、幼年、远行牌",16,y,16,"k"); y+=26;
  spr(EGG,16,y,s); spr(BABY,120,y,s); spr(P.sign,224,y+8,5); text("去远行了",264,y+22,15,"k","center");
  text("蛋",56,y+84,13,"d","center"); text("幼年",160,y+84,13,"d","center"); text("远行牌（3 天没打开）",264,y+84,13,"d","center");
  y+=112; text("纪念品（16×16，AI 或内置）和道具",16,y,16,"k"); y+=26;
  var sx=16; ["shell","leaf","post"].forEach(function(k){ spr(SOUV[k].grid,sx,y,4); text(SOUV[k].name,sx+32,y+68,13,"d","center"); sx+=84; });
  spr(P.flag,sx+6,y,4); text("日子旗",sx+22,y+68,13,"d","center"); sx+=56;
  spr(P.books,sx,y+20,4); text("书堆",sx+24,y+68,13,"d","center"); sx+=64;
  spr(P.film,sx,y+24,4); text("胶卷",sx+16,y+68,13,"d","center"); sx+=50;
  spr(P.poop,sx,y+30,4); text("便便",sx+14,y+68,13,"d","center");
  return quant();
}
