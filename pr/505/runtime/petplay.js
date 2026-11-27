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
 * game, so a new species needs no game code. Two games ship: the runner (run), which uses the side walk, jump and flap
 * poses and the front set for its one reaction and its end, and the climber (climb), on the front idle, blink, jump
 * and fall poses.
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
var JOY2={run:60,climb:6};
/* below this a round made no progress (it ran straight into the first thing, never left the start platform): no joy
   then, and the program says it wants another go instead of calling it fun (owner, 2026-11-22) */
var JOY1={run:10,climb:1};

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
function scoreDigits(buf,w,h,score,tone){
  var A=window.LopdaPetArt;
  if(!A || typeof A.numberGrid!=="function") return;
  var grid=A.numberGrid(score);
  if(!grid || !grid.length) return;
  var gw=String(grid[0]).length;
  if(tone===undefined) blit(buf,w,h,grid,w-4-gw,4);
  else blitAs(buf,w,h,grid,w-4-gw,4,1,tone);
}
/* a grid's ink in one tone, each cell scale x scale: the countdown's big digits and the score in the dark */
function blitAs(buf,w,h,grid,x,y,scale,tone){
  for(var r=0;r<grid.length;r++){
    var line=String(grid[r]);
    for(var c=0;c<line.length;c++) if(line.charAt(c)==="k") rect(buf,w,h,x+c*scale,y+r*scale,scale,scale,tone);
  }
}
/* climb's scenery: the world goes up from the room's brick wall to the roof, the sky and the stars, so height is
   something you see, not only a number. Every mark belongs to a world altitude (the row's height above the start),
   never to a screen row, so it scrolls with the steps. Background tones only (paper and mid): the steps stay ink. */
var C_ROOF=400, C_SKY=560, C_SPACE=1300;
function hash2(a,b){
  var h=(Math.imul(a|0,374761393)+Math.imul(b|0,668265263))|0;
  h=Math.imul(h^(h>>>13),1274126177);
  return (h^(h>>>16))>>>0;
}
/* one cloud every 45 px of sky, its place fixed by its number: three puffs on a flat bottom, drawn as an outline */
function cloudIn(k,x,alt){
  var cy=C_SKY+k*45+20, cx=16+hash2(k,7)%130, a=alt-cy;
  if(a<0 || a>12) return false;
  function puff(px,pa,r){ var dx=x-px, da=a-pa; return dx*dx+da*da<=r*r; }
  return puff(cx-8,0,5) || puff(cx,3,7) || puff(cx+8,0,5) || (a<=1 && x>=cx-12 && x<=cx+12);
}
function climbCloud(buf,w,x,y,alt){
  var k=Math.floor((alt-C_SKY-20)/45);
  if(!cloudIn(k,x,alt)) return;
  if(!cloudIn(k,x-1,alt) || !cloudIn(k,x+1,alt) || !cloudIn(k,x,alt-1) || !cloudIn(k,x,alt+1)) buf[y*w+x]=2;
}
function climbWall(buf,w,h,height){
  var y, x, alt, row, k;
  for(y=0;y<h;y++){
    alt=(height||0)+(h-y);
    if(alt<C_ROOF){
      /* the room's wall: brick lines every 12 px, the joints staggered by the world row */
      if(((alt%12)+12)%12===0){ rect(buf,w,h,0,y,w,1,2); continue; }
      row=Math.floor(alt/12);
      for(x=(((row%2)+2)%2?8:20);x<w;x+=24) put(buf,w,h,x,y,2);
    } else if(alt<C_SKY){
      /* the roof: a gutter at the eave, then slanted tiles with a line every 8 px */
      if(alt<C_ROOF+3){ rect(buf,w,h,0,y,w,1,2); continue; }
      /* round-bottomed shingles, 16 px wide and 8 rows tall, each row offset by half a tile */
      row=Math.floor((alt-C_ROOF)/8);
      k=(alt-C_ROOF)%8;
      for(x=0;x<w;x++){
        var tx=(x+(row%2?8:0))%16;
        if((k===1 && tx>=4 && tx<=11) || (k===2 && (tx===2 || tx===3 || tx===12 || tx===13)) ||
           (k>=3 && (tx===1 || tx===14))) put(buf,w,h,x,y,2);
      }
    } else if(alt<C_SPACE){
      /* the sky: clouds drifting past, nothing else */
      for(x=0;x<w;x++) climbCloud(buf,w,x,y,alt);
    } else {
      /* the stars, and a crescent moon where they begin */
      for(x=0;x<w;x++){
        k=hash2(x,alt);
        if(k%1499===0){ put(buf,w,h,x,y,2); put(buf,w,h,x-1,y,2); put(buf,w,h,x+1,y,2); put(buf,w,h,x,y-1,2); put(buf,w,h,x,y+1,2); }
        else if(k%283===0) put(buf,w,h,x,y,2);
      }
      var my=alt-(C_SPACE+70);
      if(my>=-9 && my<=9) for(x=110;x<=130;x++){
        var dx=x-120, d1=dx*dx+my*my, d2=(dx+5)*(dx+5)+my*my;
        if(d1<=81 && d2>64) put(buf,w,h,x,y,2);
      }
    }
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
var REACT_TICKS={happy:6,blink:4};
var REACT={
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

/* ---------- run: one button, the pet runs right through its own room, hold A to jump higher ----------
 * The floor is an ink line at row 100 with a mid band under it; the pet is pinned at x=16 and the world scrolls
 * past it. Speed and distance are in quarter pixels, kept as integers, so every position stays an integer room
 * pixel on every device. The pet's body box (x+8 .. x+23, 18 px up from the feet) is smaller than the drawn
 * sprite: a hit has to look like one. A jump rises 45 px (vy -9, +1 a tick) and stays above 19 px for 14 ticks,
 * so every obstacle (22 px at most) can be cleared by a jump pressed in time; a tap cuts the rise at vy -3.
 *
 * Owner, 2026-11-22: "a timed press every so often runs forever, and the nut is free". So the same press is not always
 * right. From 10 s a paper plane glides past at head height: standing passes under it, a full jump flies into it,
 * and a quick hop (A held at most 150 ms) stays under it. From 20 s a plane may come over a low thing on the floor:
 * only the quick hop gets through. Nuts are worth 10 and sit where they cost something: high in the air alone (only a
 * long press reaches) or under a plane (only a hop reaches, a long press hits the plane). */
var FLOOR=100, PET_X=16, PET_BODY_L=8, PET_BODY_R=23, PET_BODY_TOP=18;
var R_SPEED_START=16, R_SPEED_MAX=32, R_JUMP_VY=-9, R_CUT_VY=-3, R_DIE=12;
var R_STEP_TICKS=100, R_TILE=240;
/* the plane: its bottom 56 px above the floor, so the body clears it standing and in a hop of up to 38 px (A held
   at most three ticks, peak 36), and meets it in any longer jump (four ticks peak at 41). Low nuts sit 20 px up (any
   hop reaches them), high nuts 50 px up (A held three ticks or more). */
/* Stages (owner, 2026-11-22: "late in a run nothing changes but the speed"): every R_STAGE_EVERY px of running the room
   ends and a stretch of R_STAGE_GATES gates begins, out of the window into the sky, down into a pond, or the lights go out, in a seeded random order with no
   stage twice in a row. There
   A no longer jumps: each press is one wing beat (sky) or one stroke (water), and the pet falls or sinks between them.
   A gate is a column from above and a column from below with an opening between; the opening narrows from 56 to 38 px
   and its middle moves at most 26 px (14 in the slower water, where it also stays at least 46 px wide) from one gate to the next, so a beat or two always reaches it. In the sky the roof
   below is safe to stand on and the ceiling only stops you; in the water the surface stops you and the bottom is safe.
   The world moves at most 5 px a tick in a stage. Then the pet comes back down to the floor and the room goes on. */
var R_STAGE_FIRST=2400, R_STAGE_EVERY=4000, R_STAGE_GATES=14, R_STAGE_SPEED=20, R_GATE_W=18, R_GATE_SPACE=88;
var R_GAP_START=56, R_GAP_MIN=38, R_GAP_STEP=2;
var STAGE={
  fly:{flap:12, grav:3, fall:16, top:10, ceil:4, move:26, gapMin:38},     /* quarter pixels: a beat lifts about 7 px, so it takes a beat every third of a second to hold height */
  swim:{flap:10, grav:2, fall:12, top:32, ceil:30, move:14, gapMin:46}  /* a stroke lifts about 7 px, it sinks gently, the openings
                                                              move less; the surface is row 26 */
};
/* The third stage is the lights going out (owner, 2026-11-22): a three-second fade into the night, then for
   R_DARK_LEN px the room is dark but for the small lamp the pet carries, lighting an oval ahead of it. The run goes on
   underneath with its usual things, at most 5 px a tick, so the lamp shows a thing at least half a second ahead. */
var R_DIVE_FROM=76, R_SURFACE=27, R_LIGHT_UP=40;
var BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
var R_DARK_COUNT=60, R_DARK_LEN=2000, R_LAMP_X=56, R_LAMP_RX=54, R_LAMP_RY=44;
var R_PLANE_UP=56, R_NUT_LOW=20, R_NUT_HIGH=50, R_NUT_PTS=10, R_LEVEL_TICKS=200;
/* one seeded gap from a previous obstacle's right edge to the next one's left edge: a jump's 18 ticks of travel,
   30 px, and up to 70 px of room. runMinGap is the floor of that, and the tests check it. */
function runMinGap(speedQ){
  return Math.ceil(18*Math.max(0,num(speedQ))/4)+30;
}
/* the room's own furniture as things in the way: a book, a bowl, a slipper, and after 20 s a stack of two books.
   Ink outline, dark or mid inside, 2 x 2 blocks. */
var RUN_THINGS=[
  {grid:["kkkkkkk","kdmmmmk","kdmmmmk","kdmmmmk","kdmmmmk","kkkkkkk"]},       /* a book, 14 x 12 */
  {grid:["kkkkkkkkk","kdddddddk",".kmmmmmk.","..kkkkk.."]},                   /* a bowl, 18 x 8 */
  {grid:[".kkkkkkkk.","kmmmmmmmmk","kkkkkkkkkk"]},                            /* a slipper, 20 x 6 */
  {grid:[".kkkkkk",".kdmmmk",".kdmmmk",".kkkkkk","kkkkkk.","kdmmmk.","kdmmmk.","kdmmmk.","kdmmmk.","kkkkkk."]}
].map(function(t){
  var g=scaleGrid(t.grid,2);
  return {w:String(g[0]).length, h:g.length, grid:g};
});
var NUT=(function(){                                   /* the old 5 x 5 nut at the room's 2 x scale, 10 x 10 */
  var g=scaleGrid([".kkk.","kmpmk","kmmmk","kmpmk",".kkk."],2);
  return {w:String(g[0]).length, h:g.length, grid:g};
})();
var PLANE=(function(){                                 /* a paper plane gliding left, nose first, 20 x 10 */
  var g=scaleGrid(["........kk",
                   "....kkkkpk",
                   "kkkkpppppk",
                   ".kkmmmmkk.",
                   "...kkkk..."],2);
  return {w:String(g[0]).length, h:g.length, grid:g};
})();
function runLevel(tick){ return Math.min(3,Math.floor(num(tick)/R_LEVEL_TICKS)); }
function runGround(s,x,low){
  /* low: only the slipper and the bowl (a hop clears them); else any, and the book stack from 20 s */
  var n=low ? 2 : (s.tick>=400 ? RUN_THINGS.length : RUN_THINGS.length-1);
  var k=low ? 1+Math.floor(rand(s)*2) : Math.floor(rand(s)*n), t=RUN_THINGS[k];
  return {x:x, y:FLOOR-t.h, w:t.w, h:t.h, k:k, kind:"ground", nut:null};
}
/* Planes are alive (owner, 2026-11-22: a plane pinned in place looked dead): each one flies 1 or 2 px a tick faster
   than the room scrolls and bobs up and down by up to 3 px on its own phase. Its lowest point is still 53 px over the
   floor, so a quick hop (A up to three ticks, 36 px) passes under every plane, and a long jump (A five ticks or more,
   45 px) meets it wherever it is in its bob. Four ticks (41 px) is the edge: it depends on the bob. */
var BOB=[0,1,2,3,3,2,1,0,0,-1,-2,-3,-3,-2,-1,0];
function runPlane(s,x){
  return {x:x, y:FLOOR-R_PLANE_UP-PLANE.h, base:FLOOR-R_PLANE_UP-PLANE.h, w:PLANE.w, h:PLANE.h, kind:"plane", nut:null,
    vx:1+Math.floor(rand(s)*2), phase:Math.floor(rand(s)*16)};
}
/* how far a plane flies ahead of the room before a thing at x reaches the pet: used to start it further right so
   the two meet over the pet, and to keep a plane clear of the pattern before it */
function planeLead(s,x,vx){
  var sp=Math.max(1,Math.floor(s.speedQ/4));
  return vx*Math.max(0,Math.ceil((x-(PET_X+16))/sp));
}
function nutAt(cx,up){ return {x:cx-Math.floor(NUT.w/2), y:FLOOR-up-NUT.h}; }
/* One pattern at x: a thing on the floor, a plane (maybe with a low nut under it), a plane over a low thing, or a
   high nut on its own. The weights shift with the level; the first ten seconds are floor things only. */
function runSpawn(s,x){
  var lv=runLevel(s.tick), r=rand(s), o, p;
  var wPlane=lv>=1 ? 0.25 : 0, wUnder=lv>=2 ? 0.2 : 0, wNut=0.15;
  if(r<wNut){
    o={x:x, y:0, w:NUT.w, h:0, kind:"none", nut:nutAt(x+Math.floor(NUT.w/2),R_NUT_HIGH)};
    s.obs.push(o);
  } else if(r<wNut+wPlane){
    /* a faster plane starts further back, so it never catches the thing before it over the pet */
    o=runPlane(s,x);
    o.x=x+o.vx*40;
    s.obs.push(o);
    /* sometimes a nut sits low in the air on its own, where the plane will be passing over it just as the pet
       arrives: the two move on their own (the nut with the room, the plane faster), they only meet there */
    if(rand(s)<0.5){
      var cx=x+20, lead=planeLead(s,cx,o.vx);
      o.x=cx+lead-Math.floor(PLANE.w/2);
      s.obs.push({x:cx-Math.floor(NUT.w/2), y:0, w:NUT.w, h:0, kind:"none", nut:nutAt(cx,R_NUT_LOW)});
    }
  } else if(r<wNut+wPlane+wUnder){
    o=runGround(s,x+2,true);
    p=runPlane(s,0);
    var gc=o.x+Math.floor(o.w/2);
    p.x=gc+planeLead(s,gc,p.vx)-Math.floor(PLANE.w/2);   /* it reaches the low thing just as the pet does */
    s.obs.push(o); s.obs.push(p);
  } else s.obs.push(runGround(s,x,false));
}
function runInit(seed){
  var s=base("run",seed);
  s.speedQ=R_SPEED_START; s.moveQ=0; s.dist=0; s.obs=[]; s.nutScore=0;
  s.h=0; s.vy=0; s.onGround=true; s.buf=0; s.dying=0;
  s.mode="run"; s.scene="room"; s.stageAt=R_STAGE_FIRST; s.stageN=0; s.gatesMade=0; s.fq=0; s.fv=0; s.lastGap=null;
  s.dark=0; s.darkCount=0; s.darkUntil=0; s.intro=null; s.anim=null; s.splashT=-99; s.lightUp=0; s.pondEdge=null; s.lastStage=null;
  runSpawn(s,W+60);                                     /* the first thing arrives after about three seconds */
  return s;
}
/* the stage's own physics, in quarter pixels of altitude above the floor (fq) and per tick (fv, up is positive) */
function stagePhysics(s,inp){
  var st=STAGE[s.mode], pressed=!!(inp.press && inp.press.a), hmax=(FLOOR-PET_BODY_TOP-st.ceil)*4;
  if(pressed){ s.fv=st.flap; note(s,"flap"); }
  else s.fv=Math.max(-st.fall,s.fv-st.grav);
  s.fq+=s.fv;
  if(s.fq<0){ s.fq=0; s.fv=0; }
  if(s.fq>hmax){ s.fq=hmax; if(s.fv>0) s.fv=0; }
  s.h=Math.floor(s.fq/4);
  s.onGround=s.fq===0;
}
function gateOpening(s){
  var st=STAGE[s.mode], gh=Math.max(st.gapMin,R_GAP_START-R_GAP_STEP*s.gatesMade);
  var lo=st.top+Math.floor(gh/2), hi=FLOOR-6-Math.ceil(gh/2), mid;
  if(s.lastGap==null) mid=Math.max(lo,Math.min(hi,FLOOR-40));
  else mid=s.lastGap+Math.floor(rand(s)*(2*st.move+1))-st.move;
  mid=Math.max(lo,Math.min(hi,mid));
  s.lastGap=mid;
  return {top:mid-Math.floor(gh/2), bot:mid+Math.ceil(gh/2)};
}
function spawnGate(s,x){
  var g=gateOpening(s);
  var o={x:x, y:0, w:R_GATE_W, h:0, kind:"gate", top:g.top, bot:g.bot, scene:s.mode, nut:null};
  if(rand(s)<0.4) o.nut={x:x+Math.floor((R_GATE_W-NUT.w)/2), y:Math.floor((g.top+g.bot)/2)-Math.floor(NUT.h/2)};
  s.obs.push(o);
  s.gatesMade++;
}
/* Before the sky or the pond, a short way in (owner, 2026-11-22: a sudden switch left him still pressing to jump):
   the room runs on empty while an open window (the sky) or the pond's edge (the water) comes in from the right; the
   program shows the stage's one-line hint when it starts ("intro" event); when the pet reaches it, it goes through
   by itself (A does nothing meanwhile) and the stage begins. The lights out has its own slow fade instead. */
/* which stage comes next: seeded and random (owner: not a fixed order), never the same one twice in a row */
var STAGE_KINDS=["fly","dark","swim"];
function nextStageKind(s){
  var pool=[], i;
  for(i=0;i<STAGE_KINDS.length;i++) if(STAGE_KINDS[i]!==s.lastStage) pool.push(STAGE_KINDS[i]);
  return pool[Math.floor(rand(s)*pool.length)];
}
function startIntro(s){
  var kind=nextStageKind(s);
  s.lastStage=kind;
  if(kind==="dark"){ startStage(s,"dark"); return; }
  s.intro={kind:kind, x:W+70};                           /* about two seconds of empty room to read the hint */
  note(s,"intro");
  note(s,"intro_"+kind);
}
function startStage(s,kindArg){
  var kind=kindArg || (s.intro ? s.intro.kind : nextStageKind(s));
  s.intro=null;
  if(kind==="dark"){
    s.stageN++;
    s.dark=1; s.darkCount=R_DARK_COUNT; s.darkUntil=s.dist+R_DARK_LEN;
    note(s,"dark");
    runSpawn(s,W+60);
    return;
  }
  s.mode=kind;
  s.scene=s.mode;
  s.stageN++;
  s.gatesMade=0; s.lastGap=null;
  s.onGround=false; s.vy=0; s.buf=0;
  if(s.mode==="fly"){ s.fq=0; s.fv=STAGE.fly.flap; spawnGate(s,W+30); }   /* out of the window with a first beat */
  else {
    /* the dive (owner: the water switched in at once): from a hop over the edge it drops through the surface with a
       splash and sinks to the bottom; the first gate comes when it has settled */
    s.anim={kind:"dive"}; s.fq=R_DIVE_FROM*4; s.fv=0;
  }
  s.h=Math.floor(s.fq/4);
  note(s,s.mode);
}
/* the pond's own moves, with A ignored: the dive in, and at the end the climb up and out onto the floor */
function pondAnim(s){
  var a=s.anim, surf=FLOOR-PET_BODY_TOP-R_SURFACE;
  if(a.kind==="dive"){
    var was=s.h;
    s.fv-=2;
    if(s.h<surf) s.fv=Math.max(s.fv,-6);                 /* the water slows the fall */
    s.fq+=s.fv;
    if(s.fq<=0){ s.fq=0; s.fv=0; s.anim=null; spawnGate(s,W+30); }
    s.h=Math.floor(s.fq/4);
    if(was>=surf && s.h<surf){ s.splashT=s.tick; note(s,"splash"); }
  } else {
    /* up to the surface, then out in a little arc onto the room's floor */
    s.fv=Math.min(10,s.fv+2);
    s.fq+=s.fv;
    s.h=Math.floor(s.fq/4);
    if(s.h>=surf){ s.splashT=s.tick; note(s,"splash"); s.anim=null; endStage(s); }
  }
}
function endStage(s){
  var was=s.mode;
  s.mode="run";
  s.stageAt=s.dist+R_STAGE_EVERY;
  s.fv=0;
  note(s,"back");                                               /* the program says A jumps again */
  if(was==="fly" && s.h>0){ s.onGround=false; s.vy=0; }         /* it glides down onto the floor with the jump's fall */
  else if(was==="swim"){
    /* out of the water in a small arc onto the floor, the pond's edge sliding away behind it */
    s.h=Math.min(s.h,40); s.onGround=false; s.vy=-3; s.pondEdge=PET_X+26;
  }
  else { s.h=0; s.fq=0; s.onGround=true; s.vy=0; note(s,"land"); }
  s.scene="room";
  runSpawn(s,W+60);
}
function hitsGate(o,top,bottom){
  if(!(PET_X+PET_BODY_R>=o.x+1 && PET_X+PET_BODY_L<=o.x+o.w-2)) return false;
  return top<o.top-1 || bottom>o.bot+1;
}
function runTick(s,inp){
  if(s.dying>0){ s.dying--; if(s.dying<=0) finish(s); return; }
  var ramp=R_SPEED_START+Math.floor(s.tick/R_STEP_TICKS);
  s.speedQ=Math.min(s.mode==="run" && !s.dark ? R_SPEED_MAX : R_STAGE_SPEED,ramp);
  if(s.dark){
    if(s.darkCount>0){ s.darkCount--; if(!s.darkCount) note(s,"lightsout"); }
    else if(s.lightUp>0){ s.lightUp--; if(!s.lightUp){ s.dark=0; s.stageAt=s.dist+R_STAGE_EVERY; } }
    else if(s.dist>=s.darkUntil){ s.lightUp=R_LIGHT_UP; note(s,"lightson"); }
  }
  s.moveQ+=s.speedQ;
  var d=Math.floor(s.moveQ/4);
  s.moveQ-=d*4;
  s.dist+=d;
  var i, o;
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    var dx=d+(o.vx||0);
    o.x-=dx;
    if(o.nut) o.nut.x-=dx;
    if(o.kind==="plane"){
      var ny=o.base+BOB[((s.tick>>1)+o.phase)&15];
      o.y=ny;
    }
  }
  var pressed=!!(inp.press && inp.press.a);
  var jumped=false;
  if(s.pondEdge!=null){ s.pondEdge-=d; if(s.pondEdge<-20) s.pondEdge=null; }
  if(s.intro){
    s.intro.x-=d;
    if(s.intro.kind==="swim"){
      /* at the edge it hops up by itself, and at the top of the hop the pond takes over: it falls in from there */
      if(s.intro.x<=PET_X+24 && s.onGround && !s.intro.hop){ s.intro.hop=true; s.vy=R_JUMP_VY; s.onGround=false; note(s,"jump"); }
      else if(s.intro.hop && !s.onGround && s.vy>=0){ startStage(s); }
    } else if(s.intro.x<=PET_X+20 && s.onGround){ startStage(s); }
    else if(!s.onGround){ /* finish a jump in the air, but no new one: it goes through on its own */ }
    pressed=false; s.buf=0; inp={left:false,right:false,a:false,press:{}};
  }
  if(s.mode==="swim" && s.anim) pondAnim(s);
  else if(s.mode!=="run") stagePhysics(s,inp);
  else {
    if(pressed) s.buf=3;
    if(s.onGround && (pressed || s.buf>0)){
      s.vy=R_JUMP_VY; s.h=0; s.onGround=false; s.buf=0; jumped=true; note(s,"jump");
    }
    if(!s.onGround){
      s.h-=s.vy;
      s.vy+=1;
      if(s.h<=0){
        s.h=0; s.vy=0; s.onGround=true;
        if(s.scene!=="room"){ s.scene="room"; note(s,"land"); }
        /* a press made up to three ticks before the landing takes off right on it */
        if(s.buf>0 && !jumped){
          s.vy=R_JUMP_VY; s.onGround=false; s.buf=0; jumped=true; note(s,"jump");
        }
      }
    }
    /* variable height: letting go while rising turns a 45 px jump into a short hop */
    if(!s.onGround && !inp.a && s.vy<R_CUT_VY) s.vy=R_CUT_VY;
  }
  /* the body box: 16 px wide and 18 rows tall, its bottom row on the feet */
  var bottom=FLOOR-1-s.h, top=bottom-PET_BODY_TOP+1;
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    if(o.nut && o.nut.x+NUT.w>PET_X+PET_BODY_L && o.nut.x<PET_X+PET_BODY_R+1 &&
       o.nut.y+NUT.h>top && o.nut.y<bottom+1){
      o.nut=null; s.nutScore+=R_NUT_PTS; note(s,"nut");
    }
  }
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    if(o.kind==="none") continue;
    if(o.kind==="gate" ? hitsGate(o,top,bottom) :
       (PET_X+PET_BODY_R>=o.x+1 && PET_X+PET_BODY_L<=o.x+o.w-2 && bottom>=o.y+1 && top<=o.y+o.h-2)){
      note(s,"hit"); s.dying=R_DIE;
      break;
    }
  }
  for(i=s.obs.length-1;i>=0;i--) if(s.obs[i].x+s.obs[i].w<0) s.obs.splice(i,1);
  var last=null;
  for(i=0;i<s.obs.length;i++) if(!last || s.obs[i].x+s.obs[i].w>last.x+last.w) last=s.obs[i];
  if(s.mode==="run"){
    if(!s.dark && s.dist+W>=s.stageAt){
      /* the room ends: no new things; once the last one has gone by and the pet is on the floor, the stage begins */
      if(!s.obs.length && s.scene==="room" && !s.intro) startIntro(s);       /* a jump in the air finishes on the way in */
    }
    else if(!last) runSpawn(s,W+10);
    /* (while the lights are out the run spawns as usual; stageAt is set again when they come back on) */
    else if(last.x+last.w<=W) runSpawn(s,last.x+last.w+runMinGap(s.speedQ)+Math.floor(rand(s)*71));
  } else {
    if(s.gatesMade<R_STAGE_GATES){
      if(last && last.kind==="gate" && last.x<=W-R_GATE_SPACE+R_GATE_W) spawnGate(s,last.x+R_GATE_SPACE);
    } else if(!s.obs.length){
      if(s.mode==="swim"){ if(!s.anim){ s.anim={kind:"rise"}; s.fv=Math.max(0,s.fv); } }
      else endStage(s);
    }
  }
  if(s.mode==="run" && !jumped && !pressed && s.buf>0) s.buf--;
  s.score=Math.floor(s.dist/16)+s.nutScore;
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
  /* in a stage the paper wings (or fins) beat: fast in the sky, slow in the water; standing on the roof it walks */
  if(s.mode==="fly" && !s.onGround) pose=(Math.floor(s.tick/2)%2)?"flap2":"flap1";
  else if(s.mode==="swim") pose=(Math.floor(s.tick/4)%2)?"flap2":"flap1";
  else if(s.onGround) pose=(Math.floor(s.tick/3)%2)?"walk2":"walk1";
  else if(s.vy<0) pose="jump";
  else pose=(Math.floor(s.tick/2)%2)?"flap2":"flap1";
  return poseOf(poseFor,"side",pose);
}
/* the sky stage: drifting clouds over a tiled roof */
function skyBackdrop(buf,w,h,dist){
  var off=Math.floor(dist/3), k, cx, cy, x, y, dx, dy;
  for(k=0;k<4;k++){
    cx=((k*67+20-off)%(w+60)+(w+60))%(w+60)-30; cy=14+(k*23)%50;
    for(y=cy-6;y<=cy+1;y++) for(x=cx-14;x<=cx+14;x++){
      var inC=function(px,py){ dx=px-cx; dy=py-cy;
        return py<=cy && (dx*dx/196+dy*dy/36<=1 || (px-cx+6)*(px-cx+6)+(py-cy+3)*(py-cy+3)<=20); };
      if(inC(x,y) && (!inC(x-1,y) || !inC(x+1,y) || !inC(x,y-1) || !inC(x,y+1))) put(buf,w,h,x,y,2);
    }
  }
  /* below: the town's roofs, not the room's floor - a ridge line and rows of round-bottomed tiles */
  rect(buf,w,h,0,FLOOR,w,1,0);
  rect(buf,w,h,0,FLOOR+1,w,h-FLOOR-1,2);
  var o2=((dist%12)+12)%12, row;
  for(row=0;row*6+FLOOR+2<h;row++){
    var ty=FLOOR+2+row*6;
    for(x=-o2+(row%2?6:0)-12;x<w;x+=12){
      rect(buf,w,h,x+2,ty+4,8,1,1); put(buf,w,h,x+1,ty+3,1); put(buf,w,h,x+10,ty+3,1);
    }
  }
}
/* the pond: a wavy surface at row 26, light ripples, and a sandy bottom */
function pondBackdrop(buf,w,h,dist){
  var off=((Math.floor(dist/2)%8)+8)%8, x, y;
  for(x=0;x<w;x++){ put(buf,w,h,x,25+((x+off)%8<4?0:1),0); }
  for(y=40;y<FLOOR-4;y+=14) for(x=((y*5-dist)%32+32)%32;x<w;x+=32) rect(buf,w,h,x,y,6,1,2);
  rect(buf,w,h,0,FLOOR,w,1,1);
  rect(buf,w,h,0,FLOOR+1,w,h-FLOOR-1,2);
  for(x=((-dist)%12+12)%12;x<w;x+=12) put(buf,w,h,x,FLOOR+5,1);
}
/* a gate: what hangs from above and what stands below, with the opening between; each scene its own things */
function drawGate(buf,w,h,o){
  var x=o.x, y;
  if(o.scene==="fly"){
    /* paper lanterns on a string, the lowest one at the opening's top */
    for(y=o.top-12;y>-12;y-=12){
      rect(buf,w,h,x+1,y,16,12,0); rect(buf,w,h,x+3,y+1,12,10,3);
      rect(buf,w,h,x+3,y+4,12,1,2); rect(buf,w,h,x+3,y+7,12,1,2); rect(buf,w,h,x+8,y,2,12,1);
    }
    /* a brick chimney from the roof up to the opening's bottom, with a wider cap */
    rect(buf,w,h,x-1,o.bot,R_GATE_W+2,4,0);
    rect(buf,w,h,x+1,o.bot+4,16,FLOOR-o.bot-4,0); rect(buf,w,h,x+3,o.bot+4,12,FLOOR-o.bot-4,2);
    for(y=o.bot+8;y<FLOOR;y+=6) rect(buf,w,h,x+3,y,12,1,1);
  } else {
    /* water weed hanging from the surface down to the opening */
    for(y=27;y<o.top;y++){
      var sway=((y>>2)%2) ? 1 : 0;
      rect(buf,w,h,x+2+sway,y,14,1,1); put(buf,w,h,x+2+sway,y,0); put(buf,w,h,x+15+sway,y,0);
    }
    rect(buf,w,h,x+2,o.top-1,15,1,0);
    /* round stones piled from the bottom up to the opening */
    for(y=FLOOR-10;y>o.bot-10;y-=10){
      var yy=Math.max(o.bot,y);
      rect(buf,w,h,x+1,yy,16,FLOOR-yy>10?10:FLOOR-yy,0);
      rect(buf,w,h,x+3,yy+1,12,(FLOOR-yy>10?10:FLOOR-yy)-2,2);
      put(buf,w,h,x+1,yy,3); put(buf,w,h,x+16,yy,3);
    }
  }
}
/* the way into a stage: a tall open window with sky and a cloud in it, or the floor giving way to a pond */
function drawIntro(buf,w,h,it){
  var x=it.x, y, xx;
  if(it.kind==="fly"){
    rect(buf,w,h,x,18,46,FLOOR-18,0);
    rect(buf,w,h,x+3,21,40,FLOOR-21,3);
    for(xx=x+10;xx<x+30;xx++) put(buf,w,h,xx,40,2);
    for(xx=x+14;xx<x+26;xx++) put(buf,w,h,xx,37,2);
    put(buf,w,h,x+13,38,2); put(buf,w,h,x+12,39,2); put(buf,w,h,x+26,38,2); put(buf,w,h,x+27,39,2);
    /* the open casement swung in against the wall */
    rect(buf,w,h,x-12,20,10,FLOOR-24,0); rect(buf,w,h,x-10,22,6,FLOOR-28,2);
    rect(buf,w,h,x,FLOOR-2,46,2,0);
  } else {
    /* from x on, the floor is water: a wavy surface line at the floor and the water below */
    for(xx=Math.max(0,x);xx<w;xx++){
      for(y=FLOOR;y<h;y++) put(buf,w,h,xx,y,y===FLOOR+((xx>>2)&1) ? 0 : (y>FLOOR+1 ? 2 : 3));
      if(((xx-x)%16)===8) for(y=FLOOR+4;y<h-3;y+=5) put(buf,w,h,xx,y,3);
    }
    /* reeds at the edge */
    for(y=FLOOR-12;y<FLOOR;y++){ put(buf,w,h,x+2,y,0); if(y>FLOOR-8) put(buf,w,h,x+5,y,0); }
    put(buf,w,h,x+1,FLOOR-13,1); put(buf,w,h,x+2,FLOOR-14,1);
  }
}
/* after the pond: the water is behind the pet, left of x, until it scrolls away */
function drawPondBehind(buf,w,h,x){
  var xx, y;
  for(xx=0;xx<Math.min(w,x);xx++) for(y=FLOOR;y<h;y++) put(buf,w,h,xx,y,y===FLOOR+((xx>>2)&1) ? 0 : (y>FLOOR+1 ? 2 : 3));
  for(y=FLOOR-12;y<FLOOR;y++){ put(buf,w,h,x-3,y,0); if(y>FLOOR-8) put(buf,w,h,x-6,y,0); }
}
function runDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  if(s.scene==="fly") skyBackdrop(buf,w,h,s.dist);
  else if(s.scene==="swim") pondBackdrop(buf,w,h,s.dist);
  else {
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
  }
  if(s.intro) drawIntro(buf,w,h,s.intro);
  if(s.pondEdge!=null && s.scene==="room") drawPondBehind(buf,w,h,s.pondEdge);
  var i, o;
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    if(o.kind==="plane") blit(buf,w,h,PLANE.grid,o.x,o.y);
    else if(o.kind==="gate") drawGate(buf,w,h,o);
    else if(o.kind!=="none") blit(buf,w,h,RUN_THINGS[o.k].grid,o.x,FLOOR-RUN_THINGS[o.k].h);
  }
  var grid=runPetGrid(s,poseFor), y;
  var rows=inkRows(grid), bottom=rows && rows.bottom>=0 ? rows.bottom : 31;
  if(!s.onGround && s.h>0 || s.mode==="swim"){
    /* the air pose keeps the walk1 offset, so the bob is gone and only the jump lifts it */
    var w1=inkRows(poseOf(poseFor,"side","walk1"));
    y=FLOOR-1-(w1 && w1.bottom>=0 ? w1.bottom : 29)-s.h;
  } else {
    /* on the ground the measured ink bottom sits on FLOOR-1, whatever the frame's own padding */
    y=FLOOR-1-bottom;
  }
  blit(buf,w,h,grid,PET_X,y);
  if(s.scene==="swim" && s.tick-s.splashT<10){
    /* a splash where it broke the surface: drops thrown up, smaller each tick */
    var st2=s.tick-s.splashT, sx;
    for(sx=0;sx<6;sx++){
      var dx2=(sx-2.5)*(4+st2), dy2=-((sx%3)+2)*Math.max(0,6-st2);
      rect(buf,w,h,PET_X+16+Math.round(dx2),25+dy2,2,2,0);
    }
  }
  for(i=0;i<s.obs.length;i++){
    o=s.obs[i];
    if(o.nut) blit(buf,w,h,NUT.grid,o.nut.x,o.nut.y);
  }
  if(s.dark){
    /* the dark comes and goes gradually (owner; it replaced a 3-2-1 count): over three seconds the night thickens and the lit oval shrinks to
       the lamp's; when the lights come back the same in reverse. L is how dark: 0 none, 1 full; a 4 x 4 ordered dither
       spreads it, so the room fades with the four tones only */
    var L=s.darkCount>0 ? 1-s.darkCount/R_DARK_COUNT : s.lightUp>0 ? s.lightUp/R_LIGHT_UP : 1;
    var k=1+2*(1-L), cy=FLOOR-1-s.h-14, yy, xx, ddx, ddy, dd, th=Math.round(L*16);
    for(yy=0;yy<h;yy++) for(xx=0;xx<w;xx++){
      ddx=(xx-R_LAMP_X)/(R_LAMP_RX*k); ddy=(yy-cy)/(R_LAMP_RY*k); dd=ddx*ddx+ddy*ddy;
      if(dd>1){ if(BAYER[yy&3][xx&3]<th) buf[yy*w+xx]=0; }
      else if(L>=1 && dd>0.8 && ((xx+yy)&1)) buf[yy*w+xx]=1;    /* a dithered rim, like a lamp's falloff */
    }
  }
  if(s.dark){ frame(buf,w,h); scoreDigits(buf,w,h,s.score,3); return; }
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

/* ---------- the two packs ---------- */
var RUN={id:"run", labelKey:"pet.game.run", view:"side", init:runInit,
  step:function(s,i,dt){ return run(RUN,s,i,dt); }, draw:runDraw, tick:runTick};
var CLIMB={id:"climb", labelKey:"pet.game.climb", view:"front", init:climbInit,
  step:function(s,i,dt){ return run(CLIMB,s,i,dt); }, draw:climbDraw, tick:climbTick};

window.LopdaPetPlay={
  GAMES:[RUN,CLIMB],
  W:W, H:H, TICK:TICK,
  joyFor:joyFor,
  finish:finish,
  reaction:reaction,
  climbReachable:climbReachable,
  RUN:{LIGHT_UP:R_LIGHT_UP, DIVE_FROM:R_DIVE_FROM, SURFACE:R_SURFACE, DARK_COUNT:R_DARK_COUNT, DARK_LEN:R_DARK_LEN, LAMP_X:R_LAMP_X, LAMP_RX:R_LAMP_RX,
    STAGE_FIRST:R_STAGE_FIRST, STAGE_EVERY:R_STAGE_EVERY, STAGE_GATES:R_STAGE_GATES, STAGE_SPEED:R_STAGE_SPEED,
    GAP_START:R_GAP_START, GAP_MIN:R_GAP_MIN, GATE_SPACE:R_GATE_SPACE, STAGE:STAGE,
    PLANE_UP:R_PLANE_UP, NUT_LOW:R_NUT_LOW, NUT_HIGH:R_NUT_HIGH, NUT_PTS:R_NUT_PTS, LEVEL_TICKS:R_LEVEL_TICKS,
    FLOOR:FLOOR, PET_X:PET_X, SPEED_START:R_SPEED_START, SPEED_MAX:R_SPEED_MAX, JUMP_VY:R_JUMP_VY,
    minGap:runMinGap},
  CLIMB:{ROOF:C_ROOF, SKY:C_SKY, SPACE:C_SPACE, RISE:C_RISE, RUN:C_RUN, GAP_MIN:C_GAP_MIN, GAP_MAX:C_GAP_MAX, GAP_HARD:C_RISE-4,
    WIDTH_EASY_MIN:20, WIDTH_EASY_MAX:36, WIDTH_HARD:C_WIDTH_HARD, EASY_PLATS:C_EASY_PLATS,
    RAMP_PLATS:C_RAMP_PLATS, FEET_L:FEET_L, FEET_R:FEET_R, FEET_BOTTOM:FEET_BOTTOM}
};
})();
