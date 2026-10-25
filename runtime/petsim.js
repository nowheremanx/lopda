/*
 * Lo-PDA runtime: the built-in pet's rules (briefs/pet/design.md, sections 3-8). Pure functions, no DOM, no storage,
 * no clock and no Math.random: the program passes the time, the time zone and a seeded rng in, so a Node test and a
 * phone show the same pet. The program (apps/pet.js) owns pixels, sounds, keys and storage; this file owns only the save.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * The save is design.md section 8 plus these documented additions:
 *   lastMeal    the time of the last meal, for the poop 2-3 hours after it; null when nothing is waiting.
 *   awakeHunger, awakeJoy  awake minutes already counted toward the next hunger / joy loss. They are carried in the
 *               save so opening every two hours loses the same as one long catch-up; travel zeroes both.
 *   today       {day, shown, shownYesterday, picked, pick, used, ai, out, back, snacks, pats, played, burp}: the day's
 *               pick (kind, in, day, id, word), whether it was decided/used and whether the day's one AI call was made,
 *               its outing and counters, and a one-shot burp flag the program clears after its animation. Everything
 *               under today resets on a new day; shownYesterday carries the kind across the reset so it is not repeated.
 *   seenUse     {reader, dict, notes, darkroom}: the usage counts at the last first-open of a day, for the day's joy.
 *   aiUse       the usage counts at the last AI call, so categories are only what happened since (null before one).
 *   name        the name chosen at the hatch (null in an egg, or in a pet hatched before naming); never changed later.
 *   shelf       the id of the one souvenir on the room's shelf, or null.
 *   today.shelf whether changing the shelf already gave the day's +1 joy (reset with the other today counters).
 *
 * API (the save-taking functions return new saves; the input save is never changed):
 *   rng(seed)                    deterministic floats in [0,1), mulberry32
 *   daySeed(born, dayKey)        an integer seed for one pet and one local day
 *   dayKey(now, tzOffsetMin)     "YYYY-MM-DD" in local time; tzOffsetMin is minutes east of UTC
 *   hourOf(now, tzOffsetMin)     local hour 0-23
 *   weatherOf(born, dayKey, season)  "sun", "cloud", "rain", "snow" or "wind", by season and the day's seed
 *   fresh(now, rnd, species)     a new egg; marks and trait rolled from rnd
 *   hatch(save)                  egg -> baby (the program calls it after the ~8 s hatch)
 *   asleep(save, hour, minute)   the sleep window by trait, or the light off after 20:00
 *   pathPoint(from, to, t)      a point on the bed <-> floor L-walk, t 0..1
 *   catchUp(save, now, ctx)      {save, events}, 1-hour steps from save.last; ctx = {tz}
 *   openDay(save, dayKey, counts) counts a day opened and grows baby -> child -> adult; counts feeds adultForm
 *   adultForm(counts, species)   book / walk / scholar / diary / monster / plain
 *   feed(save, kind, now, dayKey)      "meal" or "snack"; the 4th snack in a day burps (today.burp)
 *   play(save, joy, dayKey)      joy +1 or +2 as the play pack ended (clamped to 1-2)
 *   wash(save) / pat(save, dayKey) / setLight(save, on)
 *   wants(save)                  "food", "wash" or null, for the call icon
 *   outingToday(save, dayKey)    {hour} or null; the caller stores the hour in today.out
 *   pickOfDay(candidates, yesterdayKind, seed) one candidate or null, about half the days nothing
 *   validateSouvenir(input)      a clean {name:{zh,en}, line:{zh,en}, px: 256 chars} or null
 *   builtinSouvenir(rnd, recentNames, table) one entry of table, avoiding recent names when possible
 *   aiPrompt(ctx)                {messages, max} for one LP.ai.ask call, with only design.md 7's allowed facts
 *   moodWord(hunger, joy, zh)    the one mood word the prompt may carry
 *   aiCategories(before, after)  the fixed category words whose usage counts grew
 *
 * SPECIES holds every number a species owns. Adding a pack means adding an entry there; no id below is special-cased.
 */
(function(){
"use strict";

var HOUR=3600000, MINUTE=60000, DAY=86400000;

/* One pack per species: markings, traits, sleep, growth and the adult forms' program groups. A trait without its own
   sleep window uses "normal", so a pack only spells out the traits that differ. */
var SPECIES={
  chip:{
    id:"chip", room:"chip",
    marks:{ant:6, eye:3},
    traits:{lively:{outing:0.70, idle:2}, sleepy:{outing:0.30, idle:3}, curious:{outing:0.55, idle:2}},
    sleep:{normal:[1320, 420], sleepy:[1290, 450]},
    lightOff:1200,
    hungerHours:4, joyHours:6,
    hungerMax:5, joyMax:5, messMax:3,
    growth:{child:3, adult:10},
    forms:[["book",["reader"]], ["walk",["camera","darkroom"]], ["scholar",["dict"]], ["diary",["notes"]], ["monster",["cart","apps"]]],
    formMinPct:30,
    outingHours:[10, 17]
  }
};

/* ---------- numbers, seeds, local time ---------- */
function num(v){ var n=+v; return isFinite(n) ? n : 0; }
function int(v,lo,hi){ v=Math.floor(num(v)); return v<lo ? lo : v>hi ? hi : v; }
function clampInt(v,lo,hi){ v=Math.round(num(v)); return v<lo ? lo : v>hi ? hi : v; }

/* mulberry32: four lines, no state outside the closure, and the same seed gives the same pet on every device */
function rng(seed){
  var a=seed>>>0;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    var t=a;
    t=Math.imul(t^(t>>>15), t|1);
    t^=t+Math.imul(t^(t>>>7), t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/* FNV-1a over the birth time and the day: stable, and a different pet or day moves the story */
function hash(s){
  var h=2166136261, i;
  for(i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function daySeed(born,key){ return hash(String(born)+"|"+String(key)); }

/* Everything below reads local time through UTC getters on a shifted date, so the machine's own zone is irrelevant */
function local(now,tz){
  var d=new Date(num(now)+num(tz)*MINUTE);
  return {y:d.getUTCFullYear(), m:d.getUTCMonth()+1, d:d.getUTCDate(), h:d.getUTCHours(), mi:d.getUTCMinutes()};
}
function pad2(n){ return (n<10?"0":"")+n; }
function dayKey(now,tz){
  var p=local(now,tz);
  return p.y+"-"+pad2(p.m)+"-"+pad2(p.d);
}
function hourOf(now,tz){ return local(now,tz).h; }

/* ---------- the day's weather ---------- */
/* One weather a day, seeded by the pet and the day, with the season's own odds. Snow never falls outside winter;
   every table adds up to 100, and the last entry catches the rounding edge. */
var WEATHER_ODDS={
  spring:[["sun",35],["cloud",25],["rain",25],["wind",15]],
  summer:[["sun",50],["cloud",15],["rain",25],["wind",10]],
  autumn:[["sun",30],["cloud",25],["rain",15],["wind",30]],
  winter:[["sun",20],["cloud",25],["rain",10],["snow",25],["wind",20]]
};
function seasonOf(season){
  var s=String(season||"").toLowerCase();
  if(/春|spring/.test(s)) return "spring";
  if(/夏|summer/.test(s)) return "summer";
  if(/秋|autumn|fall/.test(s)) return "autumn";
  return "winter";
}
function weatherOf(born,key,season){
  var table=WEATHER_ODDS[seasonOf(season)], r=rng((daySeed(born,key)^0x27d4eb2d)>>>0);
  var v=r()*100, acc=0, i;
  for(i=0;i<table.length;i++){
    acc+=table[i][1];
    if(v<acc) return table[i][0];
  }
  return table[table.length-1][0];
}

/* ---------- the species pack and the empty day ---------- */
function pack(sp){
  if(sp && typeof sp==="object") return sp.id && SPECIES[sp.id] ? SPECIES[sp.id] : sp;
  return SPECIES[sp] || SPECIES.chip;
}
function speciesOf(save){ return pack(save && save.species); }
function traitsOf(sp){ return Object.keys(sp.traits || {normal:{outing:0.5, idle:2}}); }
function traitOf(sp,trait){ return (sp.traits && sp.traits[trait]) || sp.traits[traitsOf(sp)[0]]; }
function blankToday(day,shownYesterday){
  return {day:day, shown:null, shownYesterday:shownYesterday||null, picked:false, pick:null, used:false,
    rewarded:false, ai:false, out:null, back:false, snacks:0, pats:0, played:0, burp:false, shelf:false};
}
function clone(s){ return s==null ? s : JSON.parse(JSON.stringify(s)); }
function ensureToday(s,key){
  if(!s.today || (key && s.today.day!==key)) s.today=blankToday(key || null, s.today && s.today.shown);
  return s.today;
}
function rollToday(s,tz){
  var k=dayKey(s.last,tz);
  if(!s.today || s.today.day!==k) s.today=blankToday(k, s.today && s.today.shown);
}
function roll(r,n){ var i=Math.floor(num(r())*n); return i<0 ? 0 : i>=n ? n-1 : i; }

/* ---------- a new pet ---------- */
function fresh(now,rnd,species){
  var sp=pack(species);
  var r=typeof rnd==="function" ? rnd : rng(isFinite(+rnd) ? +rnd : daySeed(now,"fresh"));
  var traits=traitsOf(sp), trait=traits[roll(r,traits.length)] || "curious";
  return {
    v:1, species:sp.id, room:sp.room, born:num(now), last:num(now),
    hunger:sp.hungerMax, joy:sp.joyMax, mess:0, close:0, opened:0, lastDay:null,
    awakeHunger:0, awakeJoy:0,
    stage:"egg", form:null, name:null,
    marks:{ant:roll(r,sp.marks.ant), eye:roll(r,sp.marks.eye)},
    trait:trait, light:true, today:blankToday(null), lastMeal:null, travel:false, shelf:null,
    seenUse:null, aiUse:null
  };
}
function hatch(save){
  var s=clone(save);
  if(s && s.stage==="egg"){
    s.stage="baby";
    /* the egg's days were not growth days: the hatch day can be opened again as day one */
    s.opened=0;
    s.lastDay=null;
    /* a fresh pet is a little hungry and a little bored, so the first meal visibly does something */
    s.hunger=2;
    s.joy=3;
    s.awakeHunger=0;
    s.awakeJoy=0;
  }
  return s;
}

/* ---------- sleep ---------- */
/* The light-off rule is the clock's, not the switch's: a light left off all evening wakes the pet with the sun, so a
   dark room at 10:00 is a dark room, not a nap. */
function asleep(save,hour,minute){
  if(!save) return false;
  var sp=speciesOf(save), mins=((int(hour,0,23)*60)+int(minute,0,59))%1440;
  if(save.light===false && mins>=sp.lightOff) return true;
  var w=(sp.sleep && (sp.sleep[save.trait] || sp.sleep.normal)) || [1320,420];
  return mins>=w[0] || mins<w[1];
}

/* ---------- the bed <-> floor walk ---------- */
/* One L-shaped route between the bed and a floor spot: leave the bed downwards first and climb back up at the
   bed's own column, so the pet never slides through the bed's head or the wall. t is 0..1 along the whole route;
   the caller animates it at the room's own frame rate, and the program uses the same helper for every such walk. */
function pathPoint(from,to,t){
  var a=from||{}, b=to||{}, ax=num(a.x), ay=num(a.y), bx=num(b.x), by=num(b.y);
  var dx=bx-ax, dy=by-ay, vx=Math.abs(dx), vy=Math.abs(dy), total=vx+vy, d;
  if(!total) return {x:bx,y:by};
  d=Math.max(0,Math.min(1,num(t)))*total;
  if(dy>=0){
    if(d<=vy) return {x:ax, y:Math.round(ay+(vy?dy/vy:0)*d)};
    return {x:Math.round(ax+(vx?dx/vx:0)*(d-vy)), y:by};
  }
  if(d<=vx) return {x:Math.round(ax+(vx?dx/vx:0)*d), y:ay};
  return {x:bx, y:Math.round(ay+(vy?dy/vy:0)*(d-vx))};
}

/* ---------- catching up ---------- */
/* 2 or 3 hours, decided by the meal's own time: a replayed open after the same meal always poops at the same hour */
function poopDelay(s,meal){
  var r=rng(daySeed(s.born,"meal:"+meal));
  return (2+Math.floor(r()*2))*HOUR;
}
function clampValues(s){
  var sp=speciesOf(s);
  s.hunger=clampInt(s.hunger,0,sp.hungerMax);
  s.joy=clampInt(s.joy,0,sp.joyMax);
  s.mess=clampInt(s.mess,0,sp.messMax);
}
/* An absence of three days or more is the travel branch; the room is empty until the program clears travel. The
   return values are applied here in one go because the program has no separate "press A" call to make. */
function catchUp(save,now,ctx){
  var s=clone(save), events=[], tz=num(ctx && ctx.tz);
  if(!s) return {save:s, events:events};
  now=num(now);
  if(now<s.last) return {save:s, events:events};            /* a clock set back is no time at all */
  if(now===s.last){ rollToday(s,tz); return {save:s, events:events}; }
  var sp=speciesOf(s), gap=now-s.last;
  if(gap>=3*DAY){
    s.travel=true;
    s.hunger=3; s.joy=3; s.mess=0;
    s.awakeHunger=0; s.awakeJoy=0;
    s.lastMeal=null; s.last=now;
    s.today=blankToday(dayKey(now,tz), s.today && s.today.shown); s.today.back=true;
    events.push("travel");
    return {save:s, events:events};
  }

  /* The hour is the step, but awake minutes inside it are counted exactly: a 21:30 start must not lose a whole
     night's sleep, and the sleep window rarely lines up with save.last. The residue rides in the save, so two-hour
     opens and one long open reach the same numbers. */
  var hungerMin=num(s.awakeHunger), joyMin=num(s.awakeJoy), woke=false, wasAsleep=null, hungry=false;
  var hungerEvery=Math.max(1,sp.hungerHours)*60, joyEvery=Math.max(1,sp.joyHours)*60;
  /* a valid save keeps both below one interval; the modulo also protects an old or damaged save from a long loop */
  hungerMin=Math.max(0,hungerMin)%hungerEvery;
  joyMin=Math.max(0,joyMin)%joyEvery;
  for(var t=s.last; t<now; t+=HOUR){
    var end=Math.min(t+HOUR,now), awake=0, m, part, p, slp;
    for(m=t; m<end; m+=MINUTE){
      part=Math.min(MINUTE,end-m);
      p=local(m+part/2,tz);
      slp=asleep(s,p.h,p.mi);
      if(wasAsleep===null) wasAsleep=slp;
      else if(wasAsleep && !slp && !woke){ woke=true; events.push("woke"); }
      wasAsleep=slp;
      if(!slp) awake+=part;
    }
    hungerMin+=awake/MINUTE; joyMin+=awake/MINUTE;
    while(hungerMin>=hungerEvery){
      hungerMin-=hungerEvery;
      if(s.hunger>0){
        s.hunger--;
        /* the call lights once, when hunger first reaches 1; another 4 awake hours at 0/1 is not a new need */
        if(s.hunger===1 && !hungry){ hungry=true; events.push("hungry"); }
      }
    }
    while(joyMin>=joyEvery){
      joyMin-=joyEvery;
      if(s.joy>0) s.joy--;
    }
    if(s.lastMeal!=null && end>=num(s.lastMeal)+poopDelay(s,s.lastMeal)){
      if(s.mess<sp.messMax){ s.mess++; events.push("poop"); }
      s.lastMeal=null;                                      /* one meal, one pile: never the same meal again */
    }
  }
  clampValues(s);
  s.awakeHunger=Math.max(0,hungerMin);
  s.awakeJoy=Math.max(0,joyMin);
  s.last=now;
  rollToday(s,tz);
  return {save:s, events:events};
}

/* ---------- growth ---------- */
/* A day counts when the program opens on a new dayKey. Days opened as an egg are not growth days: hatch() resets the
   counter and lastDay, so the hatch day (or the next open) is day one. */
function openDay(save,key,counts){
  var s=clone(save);
  if(!s || !key) return s;
  var sp=speciesOf(s);
  if(!s.today || s.today.day!==key) s.today=blankToday(key, s.today && s.today.shown);
  if(s.lastDay===key) return s;
  s.lastDay=key;
  s.close=(s.close||0)+1;
  if(s.stage!=="egg"){
    s.opened=(s.opened||0)+1;
    if(s.stage!=="adult" && s.opened>=sp.growth.adult){
      s.stage="adult";
      if(counts) s.form=adultForm(counts,sp);
    } else if(s.stage==="baby" && s.opened>=sp.growth.child){
      s.stage="child";
    }
    if(s.stage==="adult" && !s.form && counts) s.form=adultForm(counts,sp);
  }
  return s;
}
/* The largest group of program uses, only when it is at least formMinPct of the counted uses. Only the forms' own
   programs count (settings or the pet itself must not water down a reader). A tie goes to the earlier form:
   book, walk, scholar, diary, monster. */
function useCount(v){ var n=+v; return isFinite(n) && n>0 ? n : 0; }
function adultForm(counts,species){
  var sp=pack(species), best=null, bestN=0, total=0;
  if(!counts || typeof counts!=="object") return "plain";
  sp.forms.forEach(function(f){
    var n=0;
    f[1].forEach(function(k){ n+=useCount(counts[k]); total+=useCount(counts[k]); });
    if(n>bestN){ best=f[0]; bestN=n; }
  });
  if(!bestN || !total) return "plain";
  return bestN*100>=total*sp.formMinPct ? best : "plain";
}

/* ---------- care ---------- */
function feed(save,kind,now,key){
  var s=clone(save);
  if(!s) return s;
  if(kind!=="meal" && kind!=="snack") return s;
  var sp=speciesOf(s), t=ensureToday(s,key);
  if(kind==="meal"){
    s.hunger=Math.min(sp.hungerMax,num(s.hunger)+2);
    if(isFinite(+now)) s.lastMeal=+now;
  } else {
    if(t.snacks<3) s.joy=Math.min(sp.joyMax,num(s.joy)+1);
    else t.burp=true;                                       /* the 4th snack and after: a burp, no joy */
    t.snacks++;
  }
  s.close=num(s.close)+1;
  return s;
}
function play(save,joy,key){
  var s=clone(save);
  if(!s) return s;
  var sp=speciesOf(s), t=ensureToday(s,key);
  var gain=clampInt(joy,1,2);
  s.joy=Math.min(sp.joyMax,num(s.joy)+gain);
  t.played++;
  s.close=num(s.close)+1;
  return s;
}
function wash(save){
  var s=clone(save);
  if(!s) return s;
  s.mess=0;
  s.close=num(s.close)+1;
  return s;
}
function pat(save,key){
  var s=clone(save);
  if(!s) return s;
  var sp=speciesOf(s), t=ensureToday(s,key);
  if(t.pats>=3) return s;
  t.pats++;
  s.joy=Math.min(sp.joyMax,num(s.joy)+1);
  s.close=num(s.close)+1;
  return s;
}
function setLight(save,on){
  var s=clone(save);
  if(!s) return s;
  s.light=!!on;
  s.close=num(s.close)+1;
  return s;
}
function wants(save){
  if(!save) return null;
  if(num(save.hunger)<=1) return "food";                    /* food first: an empty bowl is the louder call */
  if(num(save.mess)>=2) return "wash";
  return null;
}

/* ---------- the day's outing ---------- */
function outingToday(save,key){
  if(!save || !key || save.travel) return null;
  var sp=speciesOf(save), today=save.today || {};
  if(today.day===key && today.back) return null;            /* the postcard is the day's one souvenir */
  if(today.day===key && today.out!=null){
    return typeof today.out==="number" ? {hour:today.out} : null;
  }
  var trait=traitOf(sp,save.trait), r=rng(daySeed(save.born,key));
  if(r()>=trait.outing) return null;
  var a=sp.outingHours[0], b=sp.outingHours[1];
  return {hour:a+Math.floor(r()*(b-a+1))};
}

/* ---------- the pick of the day ---------- */
var KIND_ORDER={date:0, diary:1, word:2, book:3, film:4};
function kindRank(c){
  var k=typeof c==="string" ? c : c && c.kind;
  return KIND_ORDER.hasOwnProperty(k) ? KIND_ORDER[k] : 99;
}
function asCandidate(c){ return typeof c==="string" ? {kind:c} : c; }
/* Yesterday's kind is out; the day's seed first decides whether there is a pick at all (about half the days), then
   picks between the first two by design.md 6's order. Same kind: the lower numeric urgency wins. */
function pickOfDay(candidates,yesterdayKind,seed){
  var list=[];
  (candidates||[]).forEach(function(c){
    var o=asCandidate(c);
    if(!o || !o.kind) return;
    if(yesterdayKind && o.kind===yesterdayKind) return;
    list.push(o);
  });
  if(!list.length) return null;
  list.sort(function(a,b){
    var ka=kindRank(a), kb=kindRank(b);
    if(ka!==kb) return ka-kb;
    var ua=typeof a.urgency==="number" ? a.urgency : 0;
    var ub=typeof b.urgency==="number" ? b.urgency : 0;
    return ua-ub;
  });
  var r=rng(seed);
  if(r()<0.5) return null;
  var n=list.length>1 ? 2 : 1;
  return list[Math.min(n-1,Math.floor(r()*n))];
}

/* ---------- souvenirs ---------- */
function plainText(v,max){
  if(typeof v!=="string") return null;
  /* the forbidden marks are checked before trimming: trim() would quietly eat a BOM or a line separator at an edge */
  for(var j=0;j<v.length;){
    var c0=v.codePointAt(j);
    if(emojiCp(c0)) return null;
    j+=c0>0xFFFF ? 2 : 1;
  }
  var s=v.trim(), cp=Array.from(s);
  if(!cp.length || cp.length>max) return null;
  for(var i=0;i<cp.length;i++){
    var c=cp[i].codePointAt(0);
    if(c===60 || c===62) return null;                       /* no markup, ever */
    if(c<32 || (c>=0x7f && c<=0x9f) || c===0x2028 || c===0x2029) return null;
    if(emojiCp(c)) return null;
  }
  return s;
}
/* The pictograph, symbol and emoji blocks, invisible markers and lone surrogates: a pixel drawing has no use for
   them, and a title-like string must not smuggle a bidi override or a zero-width character into the box. */
function emojiCp(c){
  return (c>=0x1F000 && c<=0x1FAFF) || (c>=0x2300 && c<=0x23FF) || (c>=0x2194 && c<=0x2199) ||
    (c>=0x21A9 && c<=0x21AA) || (c>=0x25AA && c<=0x25FE) || (c>=0x2600 && c<=0x27BF) || (c>=0x2B00 && c<=0x2BFF) ||
    c===0x3030 || c===0x303D || c===0x3297 || c===0x3299 || c===0x203C || c===0x2049 || c===0x2122 || c===0x2139 ||
    c===0x00A9 || c===0x00AE ||
    (c>=0x200B && c<=0x200F) || (c>=0x202A && c<=0x202E) || (c>=0x2060 && c<=0x2064) || (c>=0x2066 && c<=0x2069) ||
    c===0xFE0F || c===0xFE0E || c===0xFEFF || c===0x20E3 || (c>=0xD800 && c<=0xDFFF);
}
/* A souvenir's name and line exist in both languages: zh in Chinese characters, en in Latin letters (spaces and
   basic punctuation only). A one-language answer is rejected, so a German or English-only name cannot slip in. */
var EN_TEXT=/^[A-Za-z][A-Za-z .,!?'"()\-:;]*$/;
var CJK_TEXT=/[\u3400-\u9fff]/;
function bilingualText(v,maxZh,maxEn){
  if(!v || typeof v!=="object" || Array.isArray(v)) return null;
  var zh=plainText(v.zh,maxZh), en=plainText(v.en,maxEn);
  if(zh===null || en===null) return null;
  if(!CJK_TEXT.test(zh) || /[A-Za-z]/.test(zh)) return null;
  if(!EN_TEXT.test(en)) return null;
  return {zh:zh, en:en};
}
/* name {zh,en}, line {zh,en}, 16 rows of exactly 16 of "0"-"3". The rows are joined into the 256-character string
   design.md 8 stores, so the caller never has to decide what a "row" is again. */
function validateSouvenir(input){
  var o=input;
  if(typeof input==="string"){
    try{ o=JSON.parse(input); }catch(e){ return null; }
  }
  if(!o || typeof o!=="object" || Array.isArray(o)) return null;
  var name=bilingualText(o.name,8,16), line=bilingualText(o.line,40,80);
  if(name===null || line===null) return null;
  if(!Array.isArray(o.px) || o.px.length!==16) return null;
  var rows=[];
  for(var i=0;i<16;i++){
    var row=o.px[i];
    if(typeof row!=="string" || row.length!==16 || !/^[0-3]{16}$/.test(row)) return null;
    rows.push(row);
  }
  return {name:name, line:line, px:rows.join("")};
}
/* Aim for a name the box does not already show; when every entry repeats, a repeat is better than nothing. The
   table comes from the species pack (Part B), so this file never carries the art. rnd may be a function or a seed. */
function builtinSouvenir(rnd,recentNames,table){
  if(!table || !table.length) return null;
  var r=typeof rnd==="function" ? rnd : rng(isFinite(+rnd) ? +rnd : 0);
  var seen={};
  (recentNames||[]).forEach(function(n){ seen[String(n)]=true; });
  var pool=[];
  for(var i=0;i<table.length;i++){
    var e=table[i], nm=e && typeof e==="object" ? e.name : null;
    var names=[];
    if(nm && typeof nm==="object"){ if(nm.zh) names.push(nm.zh); if(nm.en) names.push(nm.en); }
    else if(nm) names.push(nm);
    var repeated=false;
    names.forEach(function(n){ if(seen[String(n)]) repeated=true; });
    if(!names.length || !repeated) pool.push(e);
  }
  if(!pool.length) pool=table.slice();
  return pool[Math.min(pool.length-1,Math.floor(num(r())*pool.length))];
}

/* ---------- the AI's one call ---------- */
/* Only these six category words may leave the device. They are a fixed vocabulary, not whatever the caller passes. */
var AI_CATS=["read", "took photos", "studied words", "wrote a diary", "developed film", "played"];
function shortText(v,max){
  if(typeof v!=="string") return "";
  var cp=Array.from(v.replace(/\s+/g," ").trim());
  return cp.slice(0,max).join("");
}
function timeWord(h,zh){
  if(h<6) return zh ? "深夜" : "late night";
  if(h<11) return zh ? "早上" : "morning";
  if(h<14) return zh ? "中午" : "midday";
  if(h<18) return zh ? "下午" : "afternoon";
  if(h<22) return zh ? "晚上" : "evening";
  return zh ? "夜里" : "night";
}
/* The prompt is assembled field by field from the allowed list; it never walks ctx, so a notes array, a book title
   or a calendar name that sits in the context cannot slip into the message by accident. The word book contributes
   at most ctx.word, and the book's own word list (ctx.words) is deliberately never read. */
function aiPrompt(ctx){
  ctx=ctx||{};
  var zh=ctx.lang==="zh", form=shortText(ctx.form,24), mood=shortText(ctx.mood,24), season=shortText(ctx.season,24);
  var term=shortText(ctx.term || ctx.holiday,32), word=shortText(ctx.word,40);
  /* the word book lends one word, never a phrase: a title-like value would carry the book into the prompt */
  if(/\s/.test(word)) word="";
  var time=shortText(ctx.time,24);
  if(!time && isFinite(+ctx.hour)) time=timeWord(int(ctx.hour,0,23),zh);
  var age=isFinite(+ctx.age) && +ctx.age>=0 ? Math.floor(+ctx.age) : null;
  var cats=[];
  if(Array.isArray(ctx.categories)){
    ctx.categories.forEach(function(c){ if(AI_CATS.indexOf(c)>=0 && cats.indexOf(c)<0) cats.push(c); });
  }
  var recent=[];
  var names=Array.isArray(ctx.recent) ? ctx.recent : (Array.isArray(ctx.recentNames) ? ctx.recentNames : []);
  names.slice(Math.max(0,names.length-5)).forEach(function(n){
    var s=shortText(n,8);
    if(s && recent.indexOf(s)<0) recent.push(s);
  });
  var lines=[];
  if(zh){
    if(form) lines.push("样子："+form);
    if(age!==null) lines.push("年龄："+age+" 天");
    if(mood) lines.push("心情："+mood);
    if(time) lines.push("时间："+time);
    if(season) lines.push("季节："+season);
    if(term) lines.push("今天："+term);
    if(cats.length) lines.push("这周做过："+cats.join("、"));
    if(recent.length) lines.push("最近带回的纪念品："+recent.join("、"));
    if(word) lines.push("一个词："+word);
    lines.push("请只输出 JSON：{\"name\":{\"zh\":\"不超过 8 个汉字\",\"en\":\"16 characters at most\"},\"line\":{\"zh\":\"不超过 40 个汉字\",\"en\":\"80 characters at most\"},\"px\":[\"16 行，每行 16 个 0-3 的字符\"]}");
    return {messages:[
      {role:"system", content:"你是一台掌上电脑里的小生物。你只会画一张 16×16 的四色像素小画，并给它起个名字、写一句话。名字和这句话都要中文、英文两版：中文只用汉字，英文只用英文字母（可以空格和基本标点）；不要其他语言，不要表情符号。只输出 JSON，不要解释。"},
      {role:"user", content:lines.join("\n")}
    ], max:768};
  }
  if(form) lines.push("Form: "+form);
  if(age!==null) lines.push("Age: "+age+" days");
  if(mood) lines.push("Mood: "+mood);
  if(time) lines.push("Time of day: "+time);
  if(season) lines.push("Season: "+season);
  if(term) lines.push("Today: "+term);
  if(cats.length) lines.push("Done this week: "+cats.join(", "));
  if(recent.length) lines.push("Recent souvenirs: "+recent.join(", "));
  if(word) lines.push("One word: "+word);
  lines.push("Reply with JSON only: {\"name\":{\"zh\":\"8 Chinese characters at most\",\"en\":\"16 characters at most\"},\"line\":{\"zh\":\"40 Chinese characters at most\",\"en\":\"80 characters at most\"},\"px\":[\"16 rows of 16 characters from 0-3\"]}");
  return {messages:[
    {role:"system", content:"You are a small creature living inside a handheld computer. You draw one 16x16 four-tone pixel picture and give it a name and one line. Both the name and the line must be given in Chinese and in English: Chinese in Chinese characters only, English in Latin letters only (spaces and basic punctuation are fine). Never another language, no emoji. Reply with JSON only, no explanation."},
    {role:"user", content:lines.join("\n")}
  ], max:768};
}

/* ---------- the AI's small vocabulary ---------- */
/* One mood word, drawn from the two numbers the pet already has. */
function moodWord(hunger,joy,zh){
  var h=clampInt(hunger,0,5), j=clampInt(joy,0,5);
  if(h<=1) return zh ? "有点饿" : "hungry";
  if(j<=1) return zh ? "有点低落" : "low";
  if(j>=4) return zh ? "开心" : "happy";
  if(h>=4) return zh ? "安静" : "calm";
  return zh ? "平常" : "content";
}
/* Which of the fixed AI category words grew between two usage snapshots. Programs map to the same six words the
   prompt accepts; no count, program id or name ever leaves this function. */
var AI_USE=[["read",["reader"]], ["took photos",["camera","cam"]], ["studied words",["dict"]],
  ["wrote a diary",["notes"]], ["developed film",["darkroom"]], ["played",["apps","cart"]]];
function usageN(counts,key){ var n=counts && +counts[key]; return isFinite(n) && n>0 ? n : 0; }
function aiCategories(before,after){
  var out=[];
  AI_USE.forEach(function(row){
    var grew=false;
    row[1].forEach(function(k){ if(usageN(after,k)>usageN(before,k)) grew=true; });
    if(grew && AI_CATS.indexOf(row[0])>=0) out.push(row[0]);
  });
  return out;
}

window.LopdaPet={
  SPECIES:SPECIES,
  rng:rng, daySeed:daySeed, dayKey:dayKey, hourOf:hourOf, weatherOf:weatherOf,
  fresh:fresh, hatch:hatch, asleep:asleep, catchUp:catchUp,
  pathPoint:pathPoint,
  openDay:openDay, adultForm:adultForm,
  feed:feed, play:play, wash:wash, pat:pat, setLight:setLight, wants:wants,
  outingToday:outingToday, pickOfDay:pickOfDay,
  validateSouvenir:validateSouvenir, builtinSouvenir:builtinSouvenir, aiPrompt:aiPrompt,
  moodWord:moodWord, aiCategories:aiCategories
};
})();
