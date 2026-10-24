/* 芯仔 sheets and room scenes. Uses the helpers in render.js. */
function lab(s,x,y){ text(s,x,y,13,"d","center"); }
function sheetActions(){
  var SW=660, SH=800; mk(SW,SH,1);
  text("芯仔 · 动作（放大 5 倍，每个动作 2 帧，每秒 2 格）",16,12,18,"k");
  var s=5, cw=106, y=50;
  var F=[
    ["待机 1",chip()],["待机 2",chip({squat:true})],["眨眼",chip({face:"closed"})],
    ["吃饭 1",chip({mouth:"open"})],["吃饭 2",chip({mouth:"chew"})],["开心",chip({face:"happy",mouth:"open",legs:"dangle"}),-10],
    ["走路 1",chip({legs:"walk1"})],["走路 2",chip({legs:"walk2",squat:true})],["睡觉",chip({face:"sleep",mouth:"none",ant:"droop"})],
    ["等饭",chip({face:"down",mouth:"flat",ant:"droop"})],["吓一跳",chip({face:"wow",mouth:"o"}),-5],["抱单词卡",chip()]
  ];
  F.forEach(function(f,i){
    var x=16+(i%6)*cw, yy=y+Math.floor(i/6)*118;
    spr(f[1],x,yy+(f[2]||0),s);
    if(f[0]==="吃饭 1") spr(P.bowl,x+30,yy+64,2);
    if(f[0]==="开心") spr(P.heart,x+66,yy-14,2);
    if(f[0]==="睡觉"){ text("z",x+70,yy-2,18,"d","left",PIX); text("Z",x+80,yy-14,22,"d","left",PIX); }
    if(f[0]==="等饭") spr(["..........","kkkkkkkkkk",".kppppppk.","..kkkkkk.."],x+60,yy+70,2);
    if(f[0]==="吓一跳") text("!",x+76,yy-8,22,"k","left",PIX);
    if(f[0]==="抱单词卡") spr(P.card,x+44,yy+40,3);
    lab(f[0],x+40,yy+86);
  });
  y+=250; rect(16,y,SW-32,2,"k"); y+=12;
  text("长大：蛋（一个封着小芯片的胶囊）→ 幼年 → 少年 → 成年",16,y,16,"k"); y+=30;
  [["蛋",CHIP_EGG],["幼年",CHIP_BABY],["少年",CHIP_CHILD],["成年",chip()]].forEach(function(f,i){
    var x=16+i*cw; spr(f[1],x,y,s); lab(f[0],x+40,y+86);
    if(i<3) text("→",x+92,y+30,18,"d","left");
  });
  y+=118; rect(16,y,SW-32,2,"k"); y+=12;
  text("6 种成年形态：看你最常用哪个程序（放大 4 倍）",16,y,16,"k"); y+=30;
  ["plain","book","walk","scholar","diary","monster"].forEach(function(id,i){
    var x=16+i*cw; spr(adult(id),x,y,4);
    var n=ADULT[id].name, k=n.indexOf("（");
    lab(k>0?n.slice(0,k):n,x+40,y+84); if(k>0) text(n.slice(k),x+40,y+100,11,"d","center");
  });
  y+=124; rect(16,y,SW-32,2,"k"); y+=12;
  text("道具：它「摆」出系统里的事",16,y,16,"k"); y+=30;
  var px=16;
  [["日子还有 3 天",P.flag,4,6,0],["没读完的书",P.books,4,0,22],["没冲的胶卷",P.film,4,0,30],["远行带回",POSTCARD,4,0,0]].forEach(function(f){
    spr(chip(),px,y,4); spr(f[1],px+66+f[3],y+f[4]-4,f[2]); lab(f[0],px+62,y+84); px+=158;
  });
  return quant();
}
function sheetMarks(){
  var SW=660, SH=560; mk(SW,SH,1);
  text("芯仔 · 孵化时随机的小记号（叠在身体上，不用每帧重画）",16,12,18,"k");
  var s=4, cw=100, y=50;
  function row(title,list){ text(title,16,y,15,"k"); y+=26; list.forEach(function(f,i){ var x=16+i*cw; spr(f[1],x,y,s); lab(f[0],x+32,y+68); }); y+=96; }
  row("天线 4 种",[["小球",chip({ant:"ball"})],["细杆",chip({ant:"stick"})],["叉子",chip({ant:"fork"})],["弯钩",chip({ant:"bent"})]]);
  row("花纹 4 种",[["素面",chip({pat:"plain"})],["一号脚圆点",chip({pat:"dot"})],["标签条",chip({pat:"stripe"})],["电路",chip({pat:"trace"})]]);
  row("眼睛 3 种",[["小点",chip({eye:"dot"})],["眯眯",chip({eye:"bar"})],["大眼",chip({eye:"big"})]]);
  rect(16,y,SW-32,2,"k"); y+=12;
  text("组合举例（4 × 4 × 3 = 48 种，再乘 6 种成年形态）",16,y,15,"k"); y+=26;
  [["fork","stripe","big"],["bent","trace","bar"],["stick","plain","dot"],["ball","trace","big"],["fork","dot","bar"],["bent","stripe","dot"]].forEach(function(c,i){
    spr(chip({ant:c[0],pat:c[1],eye:c[2]}),16+i*cw,y,s);
  });
  return quant();
}
/* the room, parameterized */
function room(o){
  mk(W,H,2); status("小拾");
  var gs=4, ox=3, oy=32, GW=81, GH=60;
  function g(x,y,w,h,t){ rect(ox+x*gs,oy+y*gs,w*gs,h*gs,t); }
  function gspr(grid,x,y,map){ spr(grid,ox+x*gs,oy+y*gs,gs,map); }
  for(var y=2;y<42;y+=6) for(var x=(y%12===2?1:4);x<GW;x+=6) g(x,y,1,1,"m");
  g(0,43,GW,1,"k"); g(0,44,GW,GH-44,"m");
  for(var py=47;py<GH;py+=4) g(0,py,GW,1,"d");
  for(var row=0;row<4;row++) for(var px=(row%2?4:12);px<GW;px+=18) g(px,44+row*4+1,1,3,"d");
  /* window follows the real time */
  g(5,6,20,16,"k");
  if(o.night){ g(6,7,18,14,"k"); gspr(["..pp.","...pp","...pp","..pp."],17,9); [[8,9],[11,15],[20,17],[9,18]].forEach(function(s){ g(s[0],s[1],1,1,"p"); }); }
  else { g(6,7,18,14,"m"); gspr(["..pppp....",".pppppp.pp","pppppppppp"],9,10); }
  g(14,7,1,14,"d"); g(6,13,18,1,"d");
  g(31,7,11,13,"k"); g(32,9,9,10,"p"); g(32,8,9,1,"d");
  gspr(["kkk","..k","kkk","k..","kkk"],33,11); gspr(["k.k","k.k","kkk","..k","..k"],37,11);
  g(56,10,22,33,"k"); g(57,11,20,31,"p"); g(57,25,20,1,"k");
  [[58,15,"d",3],[61,13,"m",2],[63,16,"k",3],[66,14,"d",2],[68,12,"m",3],[71,15,"d",2],[73,16,"m",3],
   [58,30,"m",2],[60,28,"k",3],[63,31,"d",2],[65,29,"m",3],[68,30,"d",2],[70,28,"m",3],[73,31,"k",3]].forEach(function(b){ var h=(b[1]<25?25:42)-b[1]; g(b[0],b[1],b[3],h,b[2]); });
  /* the bed in the corner */
  g(3,38,18,6,"k"); g(4,39,16,4,"p"); g(4,39,5,2,"m");
  for(var ry=0;ry<5;ry++){ var half=14-Math.abs(2-ry)*3; for(var rx=-half;rx<half;rx++) if((rx+ry)%2===0) g(40+rx,46+ry,1,1,"p"); }
  gspr(o.bowlEmpty?["..........","kkkkkkkkkk",".kppppppk.","..kkkkkk.."]:P.bowl,24,48);
  if(o.pet) gspr(o.pet,o.px,o.py);
  if(o.prop) gspr(o.prop.g,o.prop.x,o.prop.y);
  if(o.night){ /* lights off: every tone one step darker inside the room */
    var d=X.getImageData(ox*S,oy*S,GW*gs*S,GH*gs*S), a=d.data, map={"163,173,126":[125,138,88],"125,138,88":[74,90,50],"74,90,50":[31,42,20]};
    for(var i=0;i<a.length;i+=4){ var t=map[a[i]+","+a[i+1]+","+a[i+2]]; if(t){ a[i]=t[0];a[i+1]=t[1];a[i+2]=t[2]; } }
    X.putImageData(d,ox*S,oy*S);
  }
  if(o.zz){ text("z",ox+23*gs,oy+20*gs,20,"p","left",PIX); text("Z",ox+27*gs,oy+14*gs,28,"p","left",PIX); }
  var names=["food","play","wash","light","look","box","mail","call"], y0=oy+GH*gs+6, sel=o.sel||0;
  names.forEach(function(n,i){ var x=6+i*40; if(i===sel) box(x,y0-4,36,26,"k"); spr(ICON[n],x+10,y0+1,2,function(){ return (i===sel||(n==="call"&&o.call))?"k":"m"; }); });
  softkeys(KEYS); return quant();
}
function sceneDay(){ return room({pet:chip(), px:32, py:31, prop:{g:P.card,x:46,y:40}, call:false}); }
function sceneNight(){ return room({night:true, pet:chip({face:"sleep",mouth:"none",ant:"droop"}), px:6, py:24, zz:true, sel:3}); }
function sceneBack(){ return room({pet:chip({face:"happy",mouth:"open"}), px:23, py:31, prop:{g:POSTCARD,x:40,y:30}, sel:6, call:true}); }
function sceneHungry(){ return room({pet:chip({face:"down",mouth:"flat",ant:"droop"}), px:26, py:31, bowlEmpty:true, call:true}); }
