/*
 * Lo-PDA runtime: the pet's play packs. Pure functions, no DOM, no timers, no storage: the program
 * (apps/pet.js) owns the 20 fps interval, the keys, the sound and the save; this file owns only a round.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * A play pack is one game:
 *   {id, labelKey, view:"front"|"side", init(seed),
 *    step(state, input, dtMs) -> state,
 *    draw(state, buf, w, h, pack, poseFor)}
 * input is {left, right, a} held states plus {press:{left, right, a}} edges. poseFor(view, name) returns the
 * 32 x 32 grid of a standard pose for the current pack and marks. The playfield is the room's
 * 162 x 120 tone-index buffer, the same one drawRoom paints. dtMs is accumulated in fixed 50 ms ticks, and every
 * number is an integer room pixel, so the same seed and input script give the same round on every device.
 * LopdaPet.rng seeds every random choice.
 *
 * Games may only ask a species pack for the standard poses (petart.js): front idle / happy / sad / angry / sulk /
 * blink / jump / fall / catch and side walk1 / walk2 / jump / flap1 / flap2. A pack that has the poses can play every
 * game, so a new species needs no game code. One side game ships, the runner (run): it uses the side walk, jump and
 * flap poses, and the front set for its one reaction and its end.
 * A game's reactions are a pure table (reaction(id, event, state)): the tick names a moment, the table names a pose,
 * and the pose lasts a few ticks before the movement pose takes over again.
 *
 * A finished state is {done:true, score, joy}; joy is +1, or +2 at the game's threshold, and never negative.
 * A run that hits something simply ends. There is no losing message: the program shows a result card and any key
 * goes back to the room.
 */
(function(){
"use strict";

var W=162, H=120, TICK=50;
var TONE={k:0,d:1,m:2,p:3};
/* the score at which a round is worth +2 instead of +1. Low on purpose: play is not a test. */
var JOY2={catch:15,run:60,climb:6};
/* below this a round made no progress (it ran straight into the first thing, never left the start platform): no joy
   then, and the program says it wants another go instead of calling it fun (owner, 2026-11-22) */
var JOY1={catch:3,run:10,climb:1};

function num(v){ var n=+v; return isFinite(n) ? n : 0; }
function clamp(v,lo,hi){ v=Math.floor(num(v)); return v<lo ? lo : v>hi ? hi : v; }
function rngFor(seed){
  var Pet=window.LopdaPet;
  if(Pet && typeof Pet.rng==="function") return Pet.rng(seed>>>0);
  /* the same mulberry32 as petsim, so this file still runs on its own */
  var a=seed>>>0;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    var t=a;
    t=Math.imul(t^(t>>>15), t|1);
    t^=t+Math.imul(t^(t>>>7), t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/* one value from the round's seeded stream: the counter keeps every choice reproducible */
function rand(s){
  s.rn=(s.rn+1)|0;
  return rngFor((s.seed ^ Math.imul(s.rn, 0x9e3779b1))>>>0)();
}
function put(buf,w,h,x,y,t){
  x=Math.floor(x); y=Math.floor(y);
  if(x<0||y<0||x>=w||y>=h) return;
  buf[y*w+x]=t;
}
function rect(buf,w,h,x,y,rw,rh,t){
  for(var r=0;r<rh;r++) for(var c=0;c<rw;c++) put(buf,w,h,x+c,y+r,t);
}
function clear(buf){ for(var i=0;i<buf.length;i++) buf[i]=3; }
function blit(buf,w,h,grid,x,y){
  if(!grid) return;
  for(var r=0;r<grid.length;r++){
    var line=String(grid[r]);
    for(var c=0;c<line.length;c++){
      var t=TONE[line.charAt(c)];
      if(t!==undefined) put(buf,w,h,x+c,y+r,t);
    }
  }
}
/* the field's thin ink frame, the score's own digits at the top right and small sky marks: the 1986 handheld look
   without a new font or a new canvas. The score uses petart's five by seven digits, so it matches the calendar. */
function frame(buf,w,h){
  rect(buf,w,h,0,0,w,2,0);
  rect(buf,w,h,0,h-2,w,2,0);
  rect(buf,w,h,0,0,2,h,0);
  rect(buf,w,h,w-2,0,2,h,0);
}
function scoreDigits(buf,w,h,score){
  var A=window.LopdaPetArt;
  if(!A || typeof A.numberGrid!=="function") return;
  var grid=A.numberGrid(score);
  if(!grid || !grid.length) return;
  var gw=String(grid[0]).length;
  blit(buf,w,h,grid,w-4-gw,4);
}
function dots(buf,w,h,list){
  for(var i=0;i<list.length;i++) rect(buf,w,h,list[i][0],list[i][1],2,2,2);
}
/* catch's floor and a few specks in the air; a wide, calm sky so the falling parts are the only movement */
var CATCH_DOTS=[[20,20],[44,14],[70,22],[96,15],[122,23],[142,14],[58,34],[110,31],[31,44],[84,40],[135,42]];
/* climb's wall: a faint brick grid that moves with the camera, so height reads even before a platform passes */
function climbWall(buf,w,h,height){
  var off=((height||0)%12+12)%12, y, x, row;
  for(y=-12+off;y<h;y+=12){
    /* the brick columns belong to the world row, not to the screen row: using the screen would make them
       jump 12 px sideways every time the camera crosses a 12 px line */
    row=Math.floor((y-height)/12);
    rect(buf,w,h,0,y,w,1,2);
    for(x=(((row%2)+2)%2?8:20);x<w;x+=24) rect(buf,w,h,x,y,1,11,2);
  }
}
/* the old 16 px game props at the room's new scale: every cell becomes a 2 x 2 block */
function scaleGrid(g,n){
  var out=[], r, c, i, line, row;
  for(r=0;r<g.length;r++){
    line=String(g[r]);
    row="";
    for(c=0;c<line.length;c++) for(i=0;i<n;i++) row+=line.charAt(c);
    for(i=0;i<n;i++) out.push(row);
  }
  return out;
}
function poseOf(poseFor,view,name){
  try{ return poseFor(view,name); }catch(e){ return null; }
}
function base(id,seed){
  return {id:id, seed:seed>>>0, rn:0, acc:0, tick:0, done:false, score:0, joy:0, events:[],
    react:null, reactUntil:0};
}
/* ---------- reactions: one small table per game, a pure function of the moment and the round ----------
 * The tick calls this with the event it just added; the answer is a standard pose or null. Durations are in ticks
 * (50 ms), short on purpose: the pet answers the moment, then goes back to moving. */
var REACT_TICKS={happy:6,fall:6,sad:8,jump:8,blink:4};
var REACT={
  catch:function(event,state){
    if(event==="catch") return state.combo>0 && state.combo%5===0 ? "jump" : "happy";
    if(event==="splash") return "surprised";
    if(event==="miss") return state.lives<=1 ? "sad" : "fall";
    return null;
  },
  run:function(event,state){
    if(event==="hit") return "surprised";              /* it ran into something: the only end of a run */
    return null;                                       /* a jump and a nut are the play, not a face */
  },
  climb:function(event,state){
    if(event==="record") return "happy";
    if(event==="blink") return "blink";
    return null;
  }
};
function reaction(id,event,state){
  var f=REACT[id];
  return f ? (f(String(event||""),state||{}) || null) : null;
}
function note(s,event){
  s.events.push(event);
  var pose=reaction(s.id,event,s);
  if(pose){
    s.react=pose;
    s.reactUntil=s.tick+(REACT_TICKS[pose]||6);
  }
}
function reacting(s){ return !!(s.react && s.tick<s.reactUntil); }
function joyFor(id,score){
  score=num(score);
  if(JOY1[id]!==undefined && score<JOY1[id]) return 0;
  return score>=JOY2[id] ? 2 : 1;
}
function finish(state,score){
  if(!state || state.done) return state;
  if(score!=null) state.score=Math.max(0,Math.floor(num(score)));
  state.score=Math.max(0,Math.floor(num(state.score)));
  state.joy=joyFor(state.id,state.score);
  state.done=true;
  state.events.push("end");
  return state;
}
/* fixed 50 ms ticks, whatever dtMs the program passes: a slow frame is caught up, a long pause is capped */
function run(game,state,input,dtMs){
  if(!state || state.done) return state;
  state.events=[];
  state.acc+=Math.max(0,Math.floor(num(dtMs)));
  var n=0;
  while(state.acc>=TICK && !state.done && n<240){
    state.acc-=TICK;
    state.tick++;
    game.tick(state,input||{});
    n++;
  }
  if(n>=240) state.acc=0;
  return state;
}

/* ---------- catch: the pet walks the floor, parts fall off the shelf, water drops are bad news ----------
 * Three lives, no clock: a part that falls past the floor costs one, and so does catching a drop (an electronic
 * pet and water). Every 200 ticks the fall gets one pixel a tick faster and the spawns come closer together; at
 * level 5 a part drops every 4-5 ticks. The pet's feet keep their 6 px a tick, so the round gets harder without
 * ever taking the controls away. */
var THINGS=[
  {grid:[".kkkk.","kppppk","kkkkkk",".kmmk.",".kmmk.","..kk.."]},   /* a bolt */
  {grid:[".kkk.","kmpmk","kmmmk","kmpmk",".kkk."]},                 /* a nut */
  {grid:[".k.k","kmmk","kmk.","kk.."]}                             /* a crumb */
].map(function(t){
  var g=scaleGrid(t.grid,2);
  return {w:String(g[0]).length, h:g.length, grid:g};
});
/* The hazard: a 5 x 6 teardrop at the same 2 x scale, ink outline, a paper highlight and mid inside. */
var CATCH_DROP={grid:["..k..",".kpk.",".kpk.","kppmk","kmmmk",".kkk."]};
CATCH_DROP.grid=scaleGrid(CATCH_DROP.grid,2);
CATCH_DROP.w=String(CATCH_DROP.grid[0]).length;
CATCH_DROP.h=CATCH_DROP.grid.length;
var LEVEL_TICKS=200, LEVEL_MAX=5, DROP_FROM=1, DROP_CHANCE=0.18;
function catchLevel(tick){ return Math.min(LEVEL_MAX,Math.floor(num(tick)/LEVEL_TICKS)); }
function catchFallSpeed(level){ return 4+clamp(level,0,LEVEL_MAX); }        /* 4 -> 9 px a tick */
function catchSpawnBase(level){ return 14-2*clamp(level,0,LEVEL_MAX); }     /* 14 -> 4 ticks */
/* A drop that would share a part's landing spot while that part is still high would force the player to pick
   one and lose the other: where that happens the spawn is a part instead. */
function dropNearPart(s,x,w){
  var cx=x+w/2;
  for(var i=0;i<s.things.length;i++){
    var o=s.things[i];
    if(o.k==="drop" || o.y>=40) continue;
    if(Math.abs(o.x+o.w/2-cx)<=12) return true;
  }
  return false;
}
function catchSpawn(s){
  var level=clamp(s.level||0,0,LEVEL_MAX);
  var k=Math.floor(rand(s)*THINGS.length), t=THINGS[k];
  var drop=level>=DROP_FROM && rand(s)<DROP_CHANCE;
  var obj=drop ? CATCH_DROP : t;
  var x=4+Math.floor(rand(s)*(W-8-obj.w));
  if(drop && dropNearPart(s,x,obj.w)){
    drop=false; obj=t;
    x=4+Math.floor(rand(s)*(W-8-obj.w));
  }
  s.things.push({x:x,y:-obj.h,k:drop?"drop":k,w:obj.w,h:obj.h});
  s.next=catchSpawnBase(level)+Math.floor(rand(s)*(7-level));
}
function catchInit(seed){
  var s=base("catch",seed);
  s.petX=64; s.petY=84; s.things=[]; s.misses=0; s.splashes=0; s.catches=0; s.combo=0;
  s.level=0; s.lives=3; s.next=14;
  return s;
}
function catchTick(s,inp){
  var dir=(inp.right?1:0)-(inp.left?1:0);
  if(dir) s.petX=clamp(s.petX+dir*6,1,W-33);          /* 120 px a second: the whole floor in 1.3 seconds */
  s.level=catchLevel(s.tick);
  s.next--;
  if(s.next<=0) catchSpawn(s);
  var speed=catchFallSpeed(s.level);
  for(var i=s.things.length-1;i>=0;i--){
    var o=s.things[i];
    o.y+=speed;
    var bottom=o.y+o.h, ox=o.x+o.w/2;
    if(bottom>=s.petY+8 && bottom<=s.petY+30 && ox>=s.petX+2 && ox<=s.petX+30){
      s.things.splice(i,1);
      if(o.k==="drop"){
        s.splashes++; s.combo=0; s.lives=3-s.misses-s.splashes; note(s,"splash");
      } else {
        s.catches++; s.combo++;
        if(s.combo%5===0){ s.score+=2; note(s,"catch"); note(s,"combo"); }
        else { s.score++; note(s,"catch"); }
      }
      continue;
    }
    if(o.y>H){
      s.things.splice(i,1);
      if(o.k==="drop") continue;                       /* a drop that falls past is good news, not a miss */
      s.misses++; s.combo=0; s.lives=3-s.misses-s.splashes; note(s,"miss");
    }
  }
  s.lives=3-s.misses-s.splashes;
  if(s.lives<=0) finish(s);
}
function catchDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  dots(buf,w,h,CATCH_DOTS);
  /* the shelf the parts fall off: a mid plank across the top, two dark brackets under it */
  rect(buf,w,h,2,10,w-4,2,2);
  rect(buf,w,h,18,12,3,2,1);
  rect(buf,w,h,w-21,12,3,2,1);
  rect(buf,w,h,0,h-6,w,1,1);
  rect(buf,w,h,0,h-5,w,5,2);
  var near=false;
  for(var i=0;i<s.things.length;i++){
    var o=s.things[i];
    if(o.y>s.petY-48 && o.y<s.petY && Math.abs(o.x+o.w/2-(s.petX+16))<20) near=true;
  }
  var pose=reacting(s) ? s.react : (near?"catch":"idle");
  blit(buf,w,h,poseOf(poseFor,"front",pose),s.petX,s.petY);
  for(i=0;i<s.things.length;i++){
    var t=s.things[i].k==="drop" ? CATCH_DROP : (THINGS[s.things[i].k]||THINGS[0]);
    blit(buf,w,h,t.grid,s.things[i].x,s.things[i].y);
  }
  /* the lives: three 4 x 4 pips at the top left, ink while left and a mid outline once lost */
  for(i=0;i<3;i++){
    var px=5+i*6;
    if(i<s.lives) rect(buf,w,h,px,4,4,4,0);
    else {
      rect(buf,w,h,px,4,4,1,2); rect(buf,w,h,px,7,4,1,2);
      rect(buf,w,h,px,4,1,4,2); rect(buf,w,h,px+3,4,1,4,2);
    }
  }
  frame(buf,w,h);
  scoreDigits(buf,w,h,s.score);
}

/* ---------- run: one button, the pet runs right through its own room, hold A to jump higher ----------
 * The floor is an ink line at row 100 with a mid band under it; the pet is pinned at x=16 and the world scrolls
 * past it. Speed and distance are in quarter pixels, kept as integers, so every position stays an integer room
 * pixel on every device. The pet's body box (x+8 .. x+23, 18 px up from the feet) is smaller than the drawn
 * sprite: a hit has to look like one. A jump rises 45 px (vy -9, +1 a tick) and stays above 19 px for 14 ticks,
 * so every obstacle (22 px at most) can be cleared by a jump pressed in time; a tap cuts the rise at vy -3. */
var FLOOR=100, PET_X=16, PET_BODY_L=8, PET_BODY_R=23, PET_BODY_TOP=18;
var R_SPEED_START=16, R_SPEED_MAX=32, R_JUMP_VY=-9, R_CUT_VY=-3, R_DIE=12;
var R_STEP_TICKS=100, R_TILE=240;
/* one seeded gap from a previous obstacle's right edge to the next one's left edge: a jump's 18 ticks of travel,
   30 px, and up to 70 px of room. runMinGap is the floor of that, and the tests check it. */
function runMinGap(speedQ){
  return Math.ceil(18*Math.max(0,num(speedQ))/4)+30;
}
/* the room's own furniture as things in the way: a book, a bowl, a slipper, and after 20 s a stack of two books.
   Ink outline, dark or mid inside, 2 x 2 blocks like the catch props. */
var RUN_THINGS=[
  {grid:["kkkkkkk","kdmmmmk","kdmmmmk","kdmmmmk","kdmmmmk","kkkkkkk"]},       /* a book, 14 x 12 */
  {grid:["kkkkkkkkk","kdddddddk",".kmmmmmk.","..kkkkk.."]},                   /* a bowl, 18 x 8 */
  {grid:[".kkkkkkkk.","kmmmmmmmmk","kkkkkkkkkk"]},                            /* a slipper, 20 x 6 */
  {grid:[".kkkkkk",".kdmmmk",".kdmmmk",".kkkkkk","kkkkkk.","kdmmmk.","kdmmmk.","kdmmmk.","kdmmmk.","kkkkkk."]}
].map(function(t){
  var g=scaleGrid(t.grid,2);
  return {w:String(g[0]).length, h:g.length, grid:g};
});
var RUN_NUT=THINGS[1];                                  /* the catch game's nut, 10 x 10 */
function runSpawn(s,x){
  var late=s.tick>=400, k=Math.floor(rand(s)*(late?RUN_THINGS.length:RUN_THINGS.length-1));
  var t=RUN_THINGS[k];
  var o={x:x,y:FLOOR-t.h,w:t.w,h:t.h,k:k,nut:null};
  /* about a third of the obstacles carry a nut above them: a reward for jumping, never a reason to */
  if(rand(s)<0.35){
    o.nut={x:x+Math.floor(t.w/2)-Math.floor(RUN_NUT.w/2), y:FLOOR-30-Math.floor(rand(s)*9)-RUN_NUT.h};
  }
  s.obs.push(o);
}
function runInit(seed){
  var s=base("run",seed);
  s.speedQ=R_SPEED_START; s.moveQ=0; s.dist=0; s.obs=[]; s.nutScore=0;
  s.h=0; s.vy=0; s.onGround=true; s.buf=0; s.dying=0;
  runSpawn(s,W+60);                                     /* the first thing arrives after about three seconds */
  return s;
}
function runTick(s,inp){
  if(s.dying>0){ s.dying--; if(s.dying<=0) finish(s); return; }
  s.speedQ=Math.min(R_SPEED_MAX,R_SPEED_START+Math.floor(s.tick/R_STEP_TICKS));
  s.moveQ+=s.speedQ;
  var d=Math.floor(s.moveQ/4);
  s.moveQ-=d*4;
  s.dist+=d;
  var i, o;
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    o.x-=d;
    if(o.nut) o.nut.x-=d;
  }
  var pressed=!!(inp.press && inp.press.a);
  if(pressed) s.buf=3;
  var jumped=false;
  if(s.onGround && (pressed || s.buf>0)){
    s.vy=R_JUMP_VY; s.h=0; s.onGround=false; s.buf=0; jumped=true; note(s,"jump");
  }
  if(!s.onGround){
    s.h-=s.vy;
    s.vy+=1;
    if(s.h<=0){
      s.h=0; s.vy=0; s.onGround=true;
      /* a press made up to three ticks before the landing takes off right on it */
      if(s.buf>0 && !jumped){
        s.vy=R_JUMP_VY; s.onGround=false; s.buf=0; jumped=true; note(s,"jump");
      }
    }
  }
  /* variable height: letting go while rising turns a 45 px jump into a short hop */
  if(!s.onGround && !inp.a && s.vy<R_CUT_VY) s.vy=R_CUT_VY;
  /* the body box: 16 px wide and 18 rows tall, its bottom row on the feet */
  var bottom=FLOOR-1-s.h, top=bottom-PET_BODY_TOP+1;
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    if(o.nut && o.nut.x+RUN_NUT.w>PET_X+PET_BODY_L && o.nut.x<PET_X+PET_BODY_R+1 &&
       o.nut.y+RUN_NUT.h>top && o.nut.y<bottom+1){
      o.nut=null; s.nutScore+=5; note(s,"nut");
    }
  }
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    if(PET_X+PET_BODY_R>=o.x+1 && PET_X+PET_BODY_L<=o.x+o.w-2 &&
       bottom>=FLOOR-o.h+1 && top<=FLOOR-2){
      note(s,"hit"); s.dying=R_DIE;
      break;
    }
  }
  for(i=s.obs.length-1;i>=0;i--) if(s.obs[i].x+s.obs[i].w<0) s.obs.splice(i,1);
  var last=s.obs[s.obs.length-1];
  if(!last) runSpawn(s,W+10);
  else if(last.x+last.w<=W) runSpawn(s,last.x+last.w+runMinGap(s.speedQ)+Math.floor(rand(s)*71));
  if(!jumped && !pressed && s.buf>0) s.buf--;
  s.score=Math.floor(s.dist/8)+s.nutScore;
}
function inkRows(g){
  var top=-1, bottom=-1;
  if(!g) return null;
  for(var r=0;r<g.length;r++){
    if(/[kdmp]/.test(String(g[r]))){
      if(top<0) top=r;
      bottom=r;
    }
  }
  return {top:top,bottom:bottom};
}
/* the wall behind: a window, a picture and a shelf line at half the world's speed, repeating every 240 px */
function runBackdrop(buf,w,h,off){
  for(var k=-1;k<=1;k++){
    var ox=k*R_TILE-off, wx=ox+18, sx=ox+120, fx=ox+92, y;
    rect(buf,w,h,wx,18,52,1,2); rect(buf,w,h,wx,52,52,1,2);
    rect(buf,w,h,wx,18,1,35,2); rect(buf,w,h,wx+51,18,1,35,2);
    rect(buf,w,h,wx+25,19,1,33,2); rect(buf,w,h,wx+1,34,50,1,2);
    rect(buf,w,h,sx,62,58,1,2);
    rect(buf,w,h,sx+8,63,1,4,2); rect(buf,w,h,sx+48,63,1,4,2);
    rect(buf,w,h,fx,30,26,1,2); rect(buf,w,h,fx,48,26,1,2);
    rect(buf,w,h,fx,30,1,19,2); rect(buf,w,h,fx+25,30,1,19,2);
    /* a couple of far specks, so an empty wall still reads as a wall */
    for(y=0;y<2;y++) rect(buf,w,h,ox+(y?206:76),y?70:12,2,1,2);
  }
}
function runPetGrid(s,poseFor){
  if(s.dying>0) return poseOf(poseFor,"front","surprised");
  if(reacting(s)) return poseOf(poseFor,"front",s.react);
  var pose;
  if(s.onGround) pose=(Math.floor(s.tick/3)%2)?"walk2":"walk1";
  else if(s.vy<0) pose="jump";
  else pose=(Math.floor(s.tick/2)%2)?"flap2":"flap1";
  return poseOf(poseFor,"side",pose);
}
function runDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  runBackdrop(buf,w,h,(((Math.floor(s.dist/2))%R_TILE)+R_TILE)%R_TILE);
  /* the floor: an ink line, a mid band under it and a dashed pattern that scrolls with the world */
  rect(buf,w,h,0,FLOOR,w,1,0);
  rect(buf,w,h,0,FLOOR+1,w,h-FLOOR-1,2);
  var offw=((s.dist%24)+24)%24, x;
  for(x=-offw;x<w;x+=24){
    rect(buf,w,h,x,FLOOR+3,10,2,1);
    rect(buf,w,h,x+12,FLOOR+8,6,1,3);
    rect(buf,w,h,x+6,FLOOR+13,8,2,1);
  }
  var i, o;
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    blit(buf,w,h,RUN_THINGS[o.k].grid,o.x,FLOOR-RUN_THINGS[o.k].h);
  }
  var grid=runPetGrid(s,poseFor), y;
  var rows=inkRows(grid), bottom=rows && rows.bottom>=0 ? rows.bottom : 31;
  if(!s.onGround && s.h>0){
    /* the air pose keeps the walk1 offset, so the bob is gone and only the jump lifts it */
    var w1=inkRows(poseOf(poseFor,"side","walk1"));
    y=FLOOR-1-(w1 && w1.bottom>=0 ? w1.bottom : 29)-s.h;
  } else {
    /* on the ground the measured ink bottom sits on FLOOR-1, whatever the frame's own padding */
    y=FLOOR-1-bottom;
  }
  blit(buf,w,h,grid,PET_X,y);
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    if(o.nut) blit(buf,w,h,RUN_NUT.grid,o.nut.x,o.nut.y);
  }
  frame(buf,w,h);
  scoreDigits(buf,w,h,s.score);
}

/* ---------- climb: the pet jumps on its own, the screen scrolls, the score is one per new higher platform ----------
 * The body is 32 x 32, but only its bottom row of legs is the feet: columns 9-22 at row 30. Collision and the sprite's
 * x bounds use those feet, never the full 32 px box: a sprite whose empty corners hang over a platform is not on it.
 * A jump rises 30 px (vy -12, +2 a tick) and the air time to a platform up to 24 px higher is 8 ticks, so the
 * player can cross at most 32 px; every next platform is generated inside that reach. Steps are 18-24 px apart
 * so they read as separate bars rather than a ladder of overlapping lines. */
var C_RISE=30, C_RUN=32, C_GAP_MIN=18, C_GAP_MAX=24, C_JITTER=12;
var C_JUMP=-12, C_CAM=30, C_AHEAD=-40;                             /* camera only climbs above row 30 */
var FEET_L=9, FEET_R=23, FEET_BOTTOM=30;               /* x+9 .. x+22 inclusive, y+30 */
var START_PLAT={x:48,y:92,w:56};
/* The first six platforms are the old, forgiving chain. After that the curve ramps over the next 30: narrower
   bars, gaps nearer the jump's limit, a sideways offset that asks for an early steer, then slow movers. */
var C_EASY_PLATS=6, C_RAMP_PLATS=30, C_WIDTH_HARD=12;
var C_MOVE_AT=0.45, C_MOVE_CHANCE=0.38;
function feetOverlapX(s,p){ return s.pet.x+FEET_R>p.x && s.pet.x+FEET_L<p.x+p.w; }
function platformUnderFeet(s){
  var bottom=s.pet.y+FEET_BOTTOM, i, p;
  for(i=0;i<s.plats.length;i++){
    p=s.plats[i];
    if(p.y===bottom && feetOverlapX(s,p)) return p;
  }
  return null;
}
function climbInit(seed){
  var s=base("climb",seed);
  s.pet={x:64,y:60,vy:C_JUMP,onPlat:false,rest:0};
  s.plats=[{x:START_PLAT.x,y:START_PLAT.y,w:START_PLAT.w}];
  s.height=0;
  s.moved=false;
  s.side=0;                                            /* while untouched, the chain stays on one side */
  s.gen=0;                                             /* platforms generated: the height of the curve */
  s.bestAlt=H-START_PLAT.y;                            /* world altitude of the start platform */
  s.records=0;
  s.landings=0;
  return s;
}
function platformAlt(s,p){ return s.height+(H-p.y); }
/* 0 for the first six platforms, then a smooth ramp to 1 over the next thirty. */
function climbHard(s){
  var n=(s.gen||0)-C_EASY_PLATS;
  if(n<=0) return 0;
  n/=C_RAMP_PLATS;
  return n>=1 ? 1 : n;
}
/* The next platform is reachable from the previous one: the same centred column, a small sideways step, and
   clamped to the screen. Before the first steer the whole chain stays clear of the start platform's x range,
   so a round with no input bounces on the start platform and never climbs. */
function climbPlatformX(s,pw,from,first,hard,runCap){
  var maxX=W-1-pw, x;
  if(from && !s.moved){
    if(!s.side) s.side=rand(s)<0.5 ? -1 : 1;
    if(s.side<0){
      /* right edge < 24; the first one sits at the start platform's edge, inside the first jump's reach */
      x=first ? START_PLAT.x-pw-1 : 1+Math.floor(rand(s)*Math.max(1,(START_PLAT.x-pw)));
      return Math.max(1,x);
    }
    var lo=START_PLAT.x+START_PLAT.w+1;                                            /* left edge > 52 */
    if(first) return Math.min(maxX,lo);
    return lo+Math.floor(rand(s)*Math.max(1,maxX-lo+1));
  }
  if(!from) return 1+Math.floor(rand(s)*Math.max(1,maxX));
  var center=from.x+Math.round((from.w-pw)/2);
  if(!hard){
    var elo=Math.max(1,center-C_JITTER), ehi=Math.min(maxX,center+C_JITTER);
    if(ehi<elo) return Math.max(1,Math.min(maxX,center));
    return elo+Math.floor(rand(s)*(ehi-elo+1));
  }
  /* Past the easy chain: aim the landing edge further from the takeoff centre, up to what an early steer reaches.
     Measuring from the centre keeps the next jump workable after a centred landing (the platforms are only 12 px
     wide at the top, so an edge-to-edge promise can leave no room to walk before the automatic jump). */
  var cap=Math.min(C_RUN,runCap||C_RUN);
  var gMin=Math.round(hard*8), gMax=Math.min(cap,8+Math.round(hard*24));
  if(gMax<gMin) gMin=gMax;
  var g=gMin+Math.floor(rand(s)*(gMax-gMin+1));
  var a=from.x+Math.floor(from.w/2);
  var maxRight=maxX-a-(FEET_R-1), maxLeft=a-(pw-FEET_L-1)-1;
  var dir=rand(s)<0.5 ? 1 : -1;
  if((dir>0 ? maxRight : maxLeft)<g){
    var other=dir>0 ? maxLeft : maxRight;
    if(other>=g) dir=-dir;
    else g=Math.max(0,Math.min(g,Math.max(maxRight,maxLeft)));
  }
  if(dir>0) x=a+g+(FEET_R-1);
  else x=a-g-(pw-FEET_L-1);
  x=clamp(x,1,maxX);
  return x;
}
/* The x span a platform can occupy: its own bar, or every place a mover passes through. Used by the generator
   and the tests so a moving platform still promises a landing only when timed. */
function platformSpan(p){
  var m=p && p.mv;
  if(m && m.base!=null) return {lo:m.base-m.amp, hi:m.base+m.amp+p.w};
  return {lo:p.x, hi:p.x+p.w};
}
/* The reachability the generator promises, also used by the tests: vertical gap at most jump height - 2,
   horizontal gap coverable inside the air time. It answers whether some takeoff spot on `a` can land on `b`. */
function climbReachable(a,b){
  if(!a || !b) return false;
  var rise=a.y-b.y;
  if(rise<C_GAP_MIN || rise>C_RISE-4) return false;
  var as=platformSpan(a), bs=platformSpan(b);
  var a0=Math.max(1,as.lo), a1=Math.min(W-33,as.hi-1);           /* takeoff x */
  var b0=bs.lo-FEET_R+1, b1=bs.hi-FEET_L-1;                      /* x that puts the feet over b */
  var gap=a1<b0 ? b0-a1 : b1<a0 ? a0-b1 : 0;
  return gap<=C_RUN;
}
/* One new platform above `above`, with the curve's width, vertical gap, sideways offset and, from mid-height,
   a slow left/right mover. */
function climbNext(s,above,first){
  var hard=climbHard(s), pw, gapMin, gapMax, gap, move, amp=0, x, np;
  if(!hard){
    pw=20+Math.floor(rand(s)*17);                       /* the old easy chain: 20-36 px */
  } else {
    var wMax=24-Math.round(hard*12), wMin=Math.max(C_WIDTH_HARD,wMax-6);
    pw=wMin+Math.floor(rand(s)*(wMax-wMin+1));
  }
  gapMin=C_GAP_MIN+Math.round(hard*4);
  gapMax=C_GAP_MAX+Math.round(hard*2);
  if(gapMin>gapMax) gapMin=gapMax;
  gap=gapMin+Math.floor(rand(s)*(gapMax-gapMin+1));
  move=hard>=C_MOVE_AT && !(above&&above.mv) && rand(s)<C_MOVE_CHANCE;
  if(move) amp=4+2*Math.floor(rand(s)*3);
  x=climbPlatformX(s,pw,above,first,hard,C_RUN-amp-Math.floor((pw-2)/2));
  np={x:x,y:above.y-gap,w:pw};
  if(move && amp>0){
    var maxX=W-1-pw;
    amp=Math.min(amp,x-1,maxX-x);
    if(amp>=2) np.mv={base:x,x:x,amp:amp,dir:1,t:0};
  }
  while(np.mv && !climbReachable(above,np)){
    /* a mover's far end must still be inside the jump; if not, keep it still rather than promise too much */
    np.mv.amp--;
    if(np.mv.amp<2) np.mv=null;
  }
  s.gen=(s.gen||0)+1;
  return np;
}
/* Slow, deterministic left/right movement: one pixel every three ticks, turning at the two ends. */
function climbMovePlatforms(s){
  for(var i=0;i<s.plats.length;i++){
    var p=s.plats[i], m=p.mv;
    if(!m) continue;
    m.t++;
    if(m.t%3) continue;
    m.x+=m.dir;
    if(m.x>=m.base+m.amp){ m.x=m.base+m.amp; m.dir=-1; }
    else if(m.x<=m.base-m.amp){ m.x=m.base-m.amp; m.dir=1; }
    p.x=m.x;
  }
}
function climbTick(s,inp){
  var dir=(inp.right?1:0)-(inp.left?1:0), i;
  climbMovePlatforms(s);
  /* The camera only climbs while the pet is high on the screen (above row 30). On the start platform the
     automatic jump peaks at y=30, so doing nothing never scrolls and never scores. */
  var dy=s.pet.y<C_CAM ? Math.min(2,C_CAM-s.pet.y) : 0;
  if(dy>0){
    s.pet.y+=dy;
    s.height+=dy;
    for(i=0;i<s.plats.length;i++) s.plats[i].y+=dy;
  }
  /* A standing pet checks its own platform every tick: if it is gone (scrolled away, or moved in a test),
     the pet falls instead of hanging in the air. */
  if(s.pet.onPlat){
    var under=platformUnderFeet(s);
    if(!under){
      s.pet.onPlat=false; s.pet.vy=Math.max(2,s.pet.vy||0);
    } else if(s.pet.rest>0){
      s.pet.rest--;
    } else {
      if(!reacting(s) && rand(s)<0.2) note(s,"blink");             /* a small blink while standing */
      s.pet.onPlat=false; s.pet.vy=C_JUMP;                        /* the next automatic jump */
    }
  }
  s.pet.x=clamp(s.pet.x+dir*4,1,W-33);
  if(dir && !s.moved){ s.moved=true; s.side=0; }
  var prevBottom=s.pet.y+FEET_BOTTOM;
  if(!s.pet.onPlat){
    s.pet.vy=Math.min(10,s.pet.vy+2);
    s.pet.y+=s.pet.vy;
  }
  var bottom=s.pet.y+FEET_BOTTOM, landing=null;
  if(!s.pet.onPlat && s.pet.vy>0){
    /* Swept: a fast fall may pass the platform's whole 6 px thickness in one tick. Land on the highest
       platform the feet crossed on the way down, not only on one inside a 10 px window. */
    for(i=0;i<s.plats.length;i++){
      var p=s.plats[i];
      if(prevBottom<=p.y && bottom>=p.y && feetOverlapX(s,p) && (!landing || p.y<landing.y)) landing=p;
    }
  }
  if(landing){
    s.pet.y=landing.y-FEET_BOTTOM; s.pet.vy=0; s.pet.onPlat=true; s.pet.rest=1;
    s.landings++;
    note(s,"land");
    var alt=platformAlt(s,landing);
    if(alt>s.bestAlt){ s.bestAlt=alt; s.records++; note(s,"record"); }
  }
  for(i=s.plats.length-1;i>=0;i--) if(s.plats[i].y>H+4) s.plats.splice(i,1);
  var top=H, above=null, first=true;
  for(i=0;i<s.plats.length;i++) if(s.plats[i].y<top){ top=s.plats[i].y; above=s.plats[i]; }
  /* generate above the screen, so a new step scrolls in from the top edge instead of appearing in view */
  while(top>C_AHEAD){
    var np=climbNext(s,above,first);
    s.plats.push(np);
    above=np;
    first=false;
    top=np.y;
  }
  s.score=s.records;                                    /* one point for each new, higher platform it lands on */
  if(s.pet.y>H+12) finish(s);                           /* fell off the bottom of the screen: the only end */
}
function climbDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  climbWall(buf,w,h,s.height);
  for(var i=0;i<s.plats.length;i++){
    var p=s.plats[i];
    rect(buf,w,h,p.x,p.y,p.w,6,0);
    rect(buf,w,h,p.x+2,p.y+2,p.w-4,2,2);
  }
  if(s.pet){
    var pose;
    if(reacting(s)) pose=s.react;
    else if(s.pet.onPlat) pose="idle";
    else pose=s.pet.vy<0?"jump":"fall";
    blit(buf,w,h,poseOf(poseFor,"front",pose),s.pet.x,s.pet.y);
  }
  frame(buf,w,h);
  scoreDigits(buf,w,h,s.score);
}

/* ---------- the three packs ---------- */
var CATCH={id:"catch", labelKey:"pet.game.catch", view:"front", init:catchInit,
  step:function(s,i,dt){ return run(CATCH,s,i,dt); }, draw:catchDraw, tick:catchTick};
var RUN={id:"run", labelKey:"pet.game.run", view:"side", init:runInit,
  step:function(s,i,dt){ return run(RUN,s,i,dt); }, draw:runDraw, tick:runTick};
var CLIMB={id:"climb", labelKey:"pet.game.climb", view:"front", init:climbInit,
  step:function(s,i,dt){ return run(CLIMB,s,i,dt); }, draw:climbDraw, tick:climbTick};

window.LopdaPetPlay={
  GAMES:[CATCH,RUN,CLIMB],
  W:W, H:H, TICK:TICK,
  joyFor:joyFor,
  finish:finish,
  reaction:reaction,
  climbReachable:climbReachable,
  CATCH:{LEVEL_TICKS:LEVEL_TICKS, LEVEL_MAX:LEVEL_MAX, fallSpeed:catchFallSpeed, spawnBase:catchSpawnBase,
    DROP_FROM:DROP_FROM, DROP_CHANCE:DROP_CHANCE},
  RUN:{FLOOR:FLOOR, PET_X:PET_X, SPEED_START:R_SPEED_START, SPEED_MAX:R_SPEED_MAX, JUMP_VY:R_JUMP_VY,
    minGap:runMinGap},
  CLIMB:{RISE:C_RISE, RUN:C_RUN, GAP_MIN:C_GAP_MIN, GAP_MAX:C_GAP_MAX, GAP_HARD:C_RISE-4,
    WIDTH_EASY_MIN:20, WIDTH_EASY_MAX:36, WIDTH_HARD:C_WIDTH_HARD, EASY_PLATS:C_EASY_PLATS,
    RAMP_PLATS:C_RAMP_PLATS, FEET_L:FEET_L, FEET_R:FEET_R, FEET_BOTTOM:FEET_BOTTOM}
};
})();
