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
 * 16 x 16 grid of a standard pose for the current pack and marks. The playfield is the room's
 * 81 x 60 tone-index buffer, the same one drawRoom paints. dtMs is accumulated in fixed 50 ms ticks, and every
 * number is an integer room pixel, so the same seed and input script give the same round on every device.
 * LopdaPet.rng seeds every random choice.
 *
 * Games may only ask a species pack for the standard poses (petart.js): front idle / happy / sad / jump /
 * fall / catch and side walk1 / walk2 / jump / flap1 / flap2. A pack that has the poses can play every game,
 * so a new species needs no game code. No side game ships yet: the side poses are drawn and ready for later.
 *
 * A finished state is {done:true, score, joy}; joy is +1, or +2 at the game's threshold, and never negative.
 * There is no losing state and no losing message: the program shows the score and 再来 / Again.
 */
(function(){
"use strict";

var W=81, H=60, TICK=50;
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
function poseOf(poseFor,view,name){
  try{ return poseFor(view,name); }catch(e){ return null; }
}
function base(id,seed){
  return {id:id, seed:seed>>>0, rn:0, acc:0, tick:0, done:false, score:0, joy:0, events:[]};
}
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
  {w:6,h:6,grid:[".kkkk.","kppppk","kkkkkk",".kmmk.",".kmmk.","..kk.."]},   /* a bolt */
  {w:5,h:5,grid:[".kkk.","kmpmk","kmmmk","kmpmk",".kkk."]},                 /* a nut */
  {w:4,h:4,grid:[".k.k","kmmk","kmk.","kk.."]}                             /* a crumb */
];
function catchInit(seed){
  var s=base("catch",seed);
  s.petX=32; s.petY=42; s.things=[]; s.misses=0; s.next=14;
  return s;
}
function catchTick(s,inp){
  var dir=(inp.right?1:0)-(inp.left?1:0);
  if(dir) s.petX=clamp(s.petX+dir*3,1,W-17);          /* 60 px a second: the whole floor in 1.3 seconds */
  s.next--;
  if(s.next<=0){
    var k=Math.floor(rand(s)*THINGS.length), t=THINGS[k];
    s.things.push({x:2+Math.floor(rand(s)*(W-4-t.w)), y:-t.h, k:k, w:t.w, h:t.h});
    s.next=14+Math.floor(rand(s)*7);                  /* a thing every 0.7 to 1.0 seconds */
  }
  for(var i=s.things.length-1;i>=0;i--){
    var o=s.things[i];
    o.y+=2;                                            /* 40 px a second: a short fall, time to walk over */
    var bottom=o.y+o.h, ox=o.x+o.w/2;
    if(bottom>=s.petY+4 && bottom<=s.petY+15 && ox>=s.petX+1 && ox<=s.petX+15){
      s.things.splice(i,1); s.score++; s.events.push("catch");
      continue;
    }
    if(o.y>H){ s.things.splice(i,1); s.misses++; s.events.push("miss"); }
  }
  if(s.misses>=3) finish(s);
  if(s.tick>=600) finish(s);                            /* 30 s at most, then the score stands */
}
function catchDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  rect(buf,w,h,0,h-2,w,2,2);
  rect(buf,w,h,0,h-3,w,1,1);
  var near=false;
  for(var i=0;i<s.things.length;i++){
    var o=s.things[i];
    if(o.y>s.petY-24 && o.y<s.petY && Math.abs(o.x+o.w/2-(s.petX+8))<10) near=true;
  }
  blit(buf,w,h,poseOf(poseFor,"front",near?"catch":"idle"),s.petX,s.petY);
  for(i=0;i<s.things.length;i++){
    var t=THINGS[s.things[i].k]||THINGS[0];
    blit(buf,w,h,t.grid,s.things[i].x,s.things[i].y);
  }
  for(i=0;i<s.misses;i++) rect(buf,w,h,w-4-i*3,1,2,1,0);
  for(i=0;i<Math.min(3,s.misses);i++) rect(buf,w,h,w-4-i*3,2,2,1,0);
}

/* ---------- bounce: the pet sits at the top, the player's paddle at the bottom, one ball ---------- */
function bounceInit(seed){
  var s=base("bounce",seed);
  s.petX=32; s.petY=2;
  s.paddleX=33; s.paddleY=55; s.paddleW=15;
  s.ball=null; s.reload=0; s.misses=0;
  return s;
}
function bounceLaunch(s){
  s.ball={x:clamp(s.petX+6,1,W-4), y:s.petY+18, vx:rand(s)<0.5?-1:1, vy:1};
  s.events.push("serve");
}
function bounceTick(s,inp){
  var dir=(inp.right?1:0)-(inp.left?1:0);
  if(dir) s.paddleX=clamp(s.paddleX+dir*3,1,W-2-s.paddleW);   /* 60 px a second */
  if(s.tick%2===0 && s.ball){
    var target=clamp(s.ball.x-6,2,W-18);
    if(target>s.petX) s.petX++;
    else if(target<s.petX) s.petX--;
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
    if(b.x<1){ b.x=1; b.vx=1; }
    if(b.x>W-4){ b.x=W-4; b.vx=-1; }
    /* the pet is the top wall: a return is a point, a miss is only one of three */
    if(b.vy<0 && b.y<=s.petY+16 && b.y+3>=s.petY && b.x+3>=s.petX && b.x<=s.petX+15){
      b.y=s.petY+16; b.vy=1; s.score++; s.events.push("return");
    } else if(b.y<-4){
      s.ball=null; s.reload=20; s.misses++; s.events.push("miss");
    }
    if(b && b.vy>0 && b.y+3>=s.paddleY && b.y<=s.paddleY+3 && b.x+3>=s.paddleX && b.x<=s.paddleX+s.paddleW){
      b.y=s.paddleY-3; b.vy=-1; b.vx=b.x+1<s.paddleX+s.paddleW/2?-1:1;
      s.score++; s.events.push("return");
    } else if(b && b.y>H){
      s.ball=null; s.reload=20; s.misses++; s.events.push("miss");
    }
  }
  if(s.misses>=3) finish(s);
  if(s.tick>=900) finish(s);                            /* 45 s at most */
}
function bounceDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  rect(buf,w,h,0,0,1,h,2); rect(buf,w,h,w-1,0,1,h,2);
  blit(buf,w,h,poseOf(poseFor,"front",s.ball&&s.ball.vy<0?"jump":"idle"),s.petX,s.petY);
  rect(buf,w,h,s.paddleX,s.paddleY,s.paddleW,2,0);
  rect(buf,w,h,s.paddleX+1,s.paddleY+2,s.paddleW-2,1,1);
  if(s.ball){
    rect(buf,w,h,s.ball.x,s.ball.y,3,3,0);
    put(buf,w,h,s.ball.x+1,s.ball.y+1,3);
  }
  for(var i=0;i<s.misses;i++) rect(buf,w,h,1+i*3,1,2,1,0);
}

/* ---------- climb: the pet jumps on its own, the screen scrolls, the score is the height ---------- */
function climbInit(seed){
  var s=base("climb",seed);
  s.pet={x:32,y:30,vy:-5};
  s.plats=[{x:24,y:46,w:28}];
  s.height=0;
  s.moved=false;
  return s;
}
function climbPlatformX(s,pw){
  if(s.moved) return 1+Math.floor(rand(s)*(W-2-pw));
  /* Until the player actually steers, no higher platform may sit over the start platform's x range,
     so a round with no input bounces on the start platform and never climbs. */
  var leftMax=24-pw, rightMin=53, rightMax=W-1-pw;
  if(leftMax>=1 && (rightMin>rightMax || rand(s)<0.5)) return 1+Math.floor(rand(s)*leftMax);
  if(rightMin<=rightMax) return rightMin+Math.floor(rand(s)*(rightMax-rightMin+1));
  return 1+Math.floor(rand(s)*(W-2-pw));
}
function climbTick(s,inp){
  var dir=(inp.right?1:0)-(inp.left?1:0), i;
  /* The camera only climbs while the pet is high on the screen (above row 20). On the start platform
     the automatic jump peaks at y=20, so doing nothing never scrolls and never scores. */
  var dy=s.pet.y<20 ? Math.min(1,20-s.pet.y) : 0;
  if(dy>0){
    s.pet.y+=dy;
    s.height+=dy;
    for(i=0;i<s.plats.length;i++) s.plats[i].y+=dy;
  }
  s.pet.x=clamp(s.pet.x+dir*2,1,W-17);
  if(dir) s.moved=true;
  /* gravity, and a landing springs the next jump */
  s.pet.vy=Math.min(5,s.pet.vy+1);
  s.pet.y+=s.pet.vy;
  for(i=0;i<s.plats.length;i++){
    var p=s.plats[i], bottom=s.pet.y+16;
    if(s.pet.vy>0 && bottom>=p.y && bottom<=p.y+5 && s.pet.x+15>=p.x && s.pet.x<=p.x+p.w){
      s.pet.y=p.y-16; s.pet.vy=-5; s.events.push("land");
      break;
    }
  }
  for(i=s.plats.length-1;i>=0;i--) if(s.plats[i].y>H+2) s.plats.splice(i,1);
  var top=H;
  for(i=0;i<s.plats.length;i++) if(s.plats[i].y<top) top=s.plats[i].y;
  while(top>18){
    var pw=10+Math.floor(rand(s)*9), py=top-6-Math.floor(rand(s)*4);
    s.plats.push({x:climbPlatformX(s,pw), y:py, w:pw});
    top=py;
  }
  s.score=Math.max(s.score,s.height);
  if(s.pet.y>H+6) finish(s);                            /* fell off the bottom of the screen */
  if(s.tick>=900) finish(s);                            /* 45 s at most */
}
function climbDraw(s,buf,w,h,pack,poseFor){
  clear(buf);
  for(var i=0;i<s.plats.length;i++){
    var p=s.plats[i];
    rect(buf,w,h,p.x,p.y,p.w,3,0);
    rect(buf,w,h,p.x+1,p.y+1,p.w-2,1,2);
  }
  if(s.pet) blit(buf,w,h,poseOf(poseFor,"front",s.pet.vy<0?"jump":"fall"),s.pet.x,s.pet.y);
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
  finish:finish
};
})();
