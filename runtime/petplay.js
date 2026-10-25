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
 * game, so a new species needs no game code. No side game ships yet: the side poses are drawn and ready for later.
 * A game's reactions are a pure table (reaction(id, event, state)): the tick names a moment, the table names a pose,
 * and the pose lasts a few ticks before the movement pose takes over again.
 *
 * A finished state is {done:true, score, joy}; joy is +1, or +2 at the game's threshold, and never negative.
 * There is no losing state and no losing message: the program shows the score and 再来 / Again.
 */
(function(){
"use strict";

var W=162, H=120, TICK=50;
var TONE={k:0,d:1,m:2,p:3};
/* the score at which a round is worth +2 instead of +1. Low on purpose: play is not a test. */
var JOY2={catch:6,bounce:6,climb:30};

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
function mirrorGrid(grid){
  if(!grid) return grid;
  var out=[];
  for(var r=0;r<grid.length;r++) out.push(String(grid[r]).split("").reverse().join(""));
  return out;
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
    if(event==="catch") return state.catches>0 && state.catches%5===0 ? "jump" : "happy";
    if(event==="miss") return state.misses>=2 ? "sad" : "fall";
    return null;
  },
  bounce:function(event,state){
    if(event==="return") return (state.rally||0)>=5 ? "happy" : null;
    if(event==="miss") return "surprised";
    return null;
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
function joyFor(id,score){ return num(score)>=JOY2[id] ? 2 : 1; }
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

/* ---------- catch: the pet walks the floor, small things fall, catching scores ---------- */
var THINGS=[
  {grid:[".kkkk.","kppppk","kkkkkk",".kmmk.",".kmmk.","..kk.."]},   /* a bolt */
  {grid:[".kkk.","kmpmk","kmmmk","kmpmk",".kkk."]},                 /* a nut */
  {grid:[".k.k","kmmk","kmk.","kk.."]}                             /* a crumb */
].map(function(t){
  var g=scaleGrid(t.grid,2);
  return {w:String(g[0]).length, h:g.length, grid:g};
});
function catchInit(seed){
  var s=base("catch",seed);
  s.petX=64; s.petY=84; s.things=[]; s.misses=0; s.catches=0; s.next=14;
  return s;
}
function catchTick(s,inp){
  var dir=(inp.right?1:0)-(inp.left?1:0);
  if(dir) s.petX=clamp(s.petX+dir*6,1,W-33);          /* 120 px a second: the whole floor in 1.3 seconds */
  s.next--;
  if(s.next<=0){
    var k=Math.floor(rand(s)*THINGS.length), t=THINGS[k];
    s.things.push({x:4+Math.floor(rand(s)*(W-8-t.w)), y:-t.h, k:k, w:t.w, h:t.h});
    s.next=14+Math.floor(rand(s)*7);                  /* a thing every 0.7 to 1.0 seconds */
  }
  for(var i=s.things.length-1;i>=0;i--){
    var o=s.things[i];
    o.y+=4;                                            /* 80 px a second: a short fall, time to walk over */
    var bottom=o.y+o.h, ox=o.x+o.w/2;
    if(bottom>=s.petY+8 && bottom<=s.petY+30 && ox>=s.petX+2 && ox<=s.petX+30){
      s.things.splice(i,1); s.score++; s.catches++; note(s,"catch");
      continue;
    }
    if(o.y>H){ s.things.splice(i,1); s.misses++; note(s,"miss"); }
  }
  if(s.misses>=3) finish(s);
  if(s.tick>=600) finish(s);                            /* 30 s at most, then the score stands */
}
function catchDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  rect(buf,w,h,0,h-4,w,4,2);
  rect(buf,w,h,0,h-6,w,2,1);
  var near=false;
  for(var i=0;i<s.things.length;i++){
    var o=s.things[i];
    if(o.y>s.petY-48 && o.y<s.petY && Math.abs(o.x+o.w/2-(s.petX+16))<20) near=true;
  }
  var pose=reacting(s) ? s.react : (near?"catch":"idle");
  blit(buf,w,h,poseOf(poseFor,"front",pose),s.petX,s.petY);
  for(i=0;i<s.things.length;i++){
    var t=THINGS[s.things[i].k]||THINGS[0];
    blit(buf,w,h,t.grid,s.things[i].x,s.things[i].y);
  }
  for(i=0;i<s.misses;i++) rect(buf,w,h,w-8-i*6,2,4,2,0);
  for(i=0;i<Math.min(3,s.misses);i++) rect(buf,w,h,w-8-i*6,4,4,2,0);
}

/* ---------- bounce: the pet sits at the top, the player's paddle at the bottom, one ball ---------- */
function bounceInit(seed){
  var s=base("bounce",seed);
  s.petX=64; s.petBaseY=4; s.petY=4;
  s.paddleX=66; s.paddleY=110; s.paddleW=30;
  s.ball=null; s.reload=0; s.misses=0; s.rally=0; s.petFace=1; s.hop=0;
  return s;
}
function bounceHop(s){
  if(s.hop>0) return;
  s.hop=4;                                             /* up for two or three ticks, then back down */
}
function bounceHopStep(s){
  if(!s.hop) return;
  s.hop--;
  var off=s.hop===3?2:s.hop===2?4:s.hop===1?2:0;
  s.petY=s.petBaseY-off;
}
function bounceLaunch(s){
  s.ball={x:clamp(s.petX+12,2,W-8), y:s.petY+36, vx:rand(s)<0.5?-2:2, vy:2};
  s.events.push("serve");
}
function bounceTick(s,inp){
  var dir=(inp.right?1:0)-(inp.left?1:0);
  bounceHopStep(s);
  if(dir) s.paddleX=clamp(s.paddleX+dir*6,2,W-4-s.paddleW);   /* 120 px a second */
  if(s.ball){
    var target=clamp(s.ball.x-12,4,W-36);
    if(target>s.petX){ s.petX+=2; s.petDir=1; }
    else if(target<s.petX){ s.petX-=2; s.petDir=-1; }
  }
  if(!s.ball){
    if(s.reload>0){
      s.reload--;
      if(s.reload===0) bounceLaunch(s);
    } else if(inp.press && inp.press.a) bounceLaunch(s);
  }
  if(s.ball){
    var b=s.ball;
    b.x+=b.vx; b.y+=b.vy;
    if(b.x<2){ b.x=2; b.vx=2; }
    if(b.x>W-8){ b.x=W-8; b.vx=-2; }
    /* the pet is the top wall: a return is a point, a miss is only one of three */
    if(b.vy<0 && b.y<=s.petY+32 && b.y+6>=s.petY && b.x+6>=s.petX && b.x<=s.petX+30){
      b.y=s.petY+32; b.vy=2; s.score++; s.rally++; note(s,"return");
    } else if(b.y<-8){
      s.ball=null; s.reload=20; s.misses++; s.rally=0; note(s,"miss");
    }
    if(b && b.vy>0 && b.y+6>=s.paddleY && b.y<=s.paddleY+4 && b.x+6>=s.paddleX && b.x<=s.paddleX+s.paddleW){
      b.y=s.paddleY-6; b.vy=-2; b.vx=b.x+2<s.paddleX+s.paddleW/2?-2:2;
      s.score++; s.rally++; note(s,"return");
      bounceHop(s);                                     /* the ball is on its way back to it */
    } else if(b && b.y>H){
      s.ball=null; s.reload=20; s.misses++; s.rally=0; note(s,"miss");
    }
  }
  if(s.misses>=3) finish(s);
  if(s.tick>=900) finish(s);                            /* 45 s at most */
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
/* A side walk cycle may be used only when its two frames share the same vertical extent: a one-pixel step up or
   down is exactly the bob the owner saw, so the front idle frame is used instead. */
function stillSideWalk(a,b){
  var ra=inkRows(a), rb=inkRows(b);
  return !!ra && !!rb && ra.top>=0 && ra.top===rb.top && ra.bottom===rb.bottom;
}
function bounceDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  rect(buf,w,h,0,0,2,h,2); rect(buf,w,h,w-2,0,2,h,2);
  var grid;
  if(reacting(s)){
    grid=poseOf(poseFor,"front",s.react);
  } else {
    var a=poseOf(poseFor,"side","walk1"), b=poseOf(poseFor,"side","walk2");
    if(stillSideWalk(a,b)){
      grid=s.tick%2?b:a;
      if(s.petDir<0) grid=mirrorGrid(grid);
    } else {
      grid=poseOf(poseFor,"front","idle");
    }
  }
  blit(buf,w,h,grid,s.petX,s.petY);
  rect(buf,w,h,s.paddleX,s.paddleY,s.paddleW,4,0);
  rect(buf,w,h,s.paddleX+2,s.paddleY+4,s.paddleW-4,2,1);
  if(s.ball){
    rect(buf,w,h,s.ball.x,s.ball.y,6,6,0);
    rect(buf,w,h,s.ball.x+2,s.ball.y+2,2,2,3);
  }
  for(var i=0;i<s.misses;i++) rect(buf,w,h,2+i*6,2,4,2,0);
}

/* ---------- climb: the pet jumps on its own, the screen scrolls, the score is the height ----------
 * The body is 32 x 32, but only its bottom row of legs is the feet: columns 9-22 at row 30. Collision and the sprite's
 * x bounds use those feet, never the full 32 px box: a sprite whose empty corners hang over a platform is not on it.
 * A jump rises 30 px (vy -12, +2 a tick) and the air time to a platform up to 24 px higher is 8 ticks, so the
 * player can cross at most 32 px; every next platform is generated inside that reach. Steps are 18-24 px apart
 * so they read as separate bars rather than a ladder of overlapping lines. */
var C_RISE=30, C_RUN=32, C_GAP_MIN=18, C_GAP_MAX=24, C_JITTER=12;
var C_JUMP=-12, C_CAM=30;                             /* camera only climbs above row 30 */
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
  while(top>36){
    var np=climbNext(s,above,first);
    s.plats.push(np);
    above=np;
    first=false;
    top=np.y;
  }
  s.score=Math.max(s.score,s.height);
  if(s.pet.y>H+12) finish(s);                           /* fell off the bottom of the screen */
  if(s.tick>=900) finish(s);                            /* 45 s at most */
}
function climbDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  for(var i=0;i<s.plats.length;i++){
    var p=s.plats[i];
    rect(buf,w,h,p.x,p.y,p.w,6,0);
    rect(buf,w,h,p.x+2,p.y+2,p.w-4,2,2);
  }
  if(!s.pet) return;
  var pose;
  if(reacting(s)) pose=s.react;
  else if(s.pet.onPlat) pose="idle";
  else pose=s.pet.vy<0?"jump":"fall";
  blit(buf,w,h,poseOf(poseFor,"front",pose),s.pet.x,s.pet.y);
}

/* ---------- the three packs ---------- */
var CATCH={id:"catch", labelKey:"pet.game.catch", view:"front", init:catchInit,
  step:function(s,i,dt){ return run(CATCH,s,i,dt); }, draw:catchDraw, tick:catchTick};
var BOUNCE={id:"bounce", labelKey:"pet.game.bounce", view:"front", init:bounceInit,
  step:function(s,i,dt){ return run(BOUNCE,s,i,dt); }, draw:bounceDraw, tick:bounceTick};
var CLIMB={id:"climb", labelKey:"pet.game.climb", view:"front", init:climbInit,
  step:function(s,i,dt){ return run(CLIMB,s,i,dt); }, draw:climbDraw, tick:climbTick};

window.LopdaPetPlay={
  GAMES:[CATCH,BOUNCE,CLIMB],
  W:W, H:H, TICK:TICK,
  joyFor:joyFor,
  finish:finish,
  reaction:reaction,
  climbReachable:climbReachable,
  CLIMB:{RISE:C_RISE, RUN:C_RUN, GAP_MIN:C_GAP_MIN, GAP_MAX:C_GAP_MAX, GAP_HARD:C_RISE-4,
    WIDTH_EASY_MIN:20, WIDTH_EASY_MAX:36, WIDTH_HARD:C_WIDTH_HARD, EASY_PLATS:C_EASY_PLATS,
    RAMP_PLATS:C_RAMP_PLATS, FEET_L:FEET_L, FEET_R:FEET_R, FEET_BOTTOM:FEET_BOTTOM}
};
})();
