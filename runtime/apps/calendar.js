/*
 * Lo-PDA built-in: calendar (万年历). Month view, day detail, yearly dates (Gregorian or lunar),
 * statutory days off and make-up workdays. Design: docs/design/calendar.md.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Lunar dates and solar terms come from runtime/lunar.js (a table, 1900-2100).
 * Days off: holiday-cn (MIT, runtime/vendor/holiday-cn/). The years shipped with the runtime are in BUNDLED.
 * When this year's or next year's file is missing, opening the calendar asks jsDelivr for it, at most once
 * every 7 days. That is the only request a built-in makes to another site (docs/decisions.md section 14):
 * nothing about the user is sent, and a failure changes nothing on screen.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, L=window.LopdaLunar;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, uid=LP.uid;

var BUNDLED={2026:"vendor/holiday-cn/2026.json"};
var REMOTE="https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/";
var RETRY=7*86400000, SOON=7;
var MIN=L.MIN_YEAR, MAX=L.MAX_YEAR;

var C={
  y:0, m:0, d:0,            // the selected day; the month view shows its month
  dates:[],                 // yearly dates {id, name, month, day, lunar, leap}
  set:{},                   // calendar settings: holidayTry (ms), hinted (day number of the last boot hint)
  files:{},                 // holiday-cn year -> {days:[...]}
  hol:{},                   // "YYYY-MM-DD" -> {off, name}
  holLoaded:false, tried:false,
  sheet:"", pick:0,         // open sheet ("day", "list", "add") and the highlighted row in the list
  form:null, refs:null, cells:[], todayN:0
};

/* ---------- days ---------- */
function list(key){ return tr(key).split("|"); }
function now(){ var t=new Date(); return {y:t.getFullYear(), m:t.getMonth()+1, d:t.getDate()}; }
function todayN(){ var t=now(); return L.dayNumber(t.y,t.m,t.d); }
function iso(y,m,d){ return y+"-"+LP.pad2(m)+"-"+LP.pad2(d); }
function selN(){ return L.dayNumber(C.y,C.m,C.d); }
var FIRST=L.dayNumber(MIN,1,1), LAST=L.dayNumber(MAX,12,31);
function select(n){
  n=Math.max(FIRST,Math.min(LAST,n));
  var t=L.fromDayNumber(n); C.y=t.y; C.m=t.m; C.d=t.d;
}
function shiftMonth(k){
  var m=C.y*12+(C.m-1)+k, y=Math.floor(m/12); if(y<MIN||y>MAX) return false;
  C.y=y; C.m=m%12+1; C.d=Math.min(C.d,L.daysInMonth(C.y,C.m)); return true;
}

/* ---------- names ---------- */
function lunarMonth(lu){ return list("cal.lmonth")[lu.month-1]; }
function lunarText(lu){ return tr(lu.leap?"cal.lunarleap":"cal.lunar",{month:lunarMonth(lu), day:list("cal.lday")[lu.day-1]}); }
function yearText(ly,key){ return tr(key||"cal.year",{gz:tr("cal.gz",{s:list("cal.stems")[L.stem(ly)], b:list("cal.branches")[L.branch(ly)]}), animal:list("cal.animals")[L.branch(ly)]}); }
function weekdayName(y,m,d){ return list("cal.weekday")[L.weekday(y,m,d)]; }
function dateText(y,m,d){ return tr("cal.date",{y:y, m:m, d:d, mon:list("cal.months")[m-1], w:weekdayName(y,m,d)}); }

/* traditional festivals by the lunar date (not in a leap month), statutory ones by the Gregorian date */
var SOLAR_FEST={101:"newyear", 501:"labour", 1001:"national"};
var LUNAR_FEST={101:"spring", 115:"lantern", 505:"dragon", 707:"qixi", 715:"ghost", 815:"midautumn", 909:"double9", 1208:"laba"};
function festivals(y,m,d,lu){
  var out=[], f=SOLAR_FEST[m*100+d];
  if(f) out.push(f);
  if(lu && !lu.leap && LUNAR_FEST[lu.month*100+lu.day]) out.push(LUNAR_FEST[lu.month*100+lu.day]);
  /* New Year's Eve is the last day of the lunar year, whatever its length */
  var next=L.fromDayNumber(L.dayNumber(y,m,d)+1), nl=L.fromSolar(next.y,next.m,next.d);
  if(nl && nl.month===1 && nl.day===1 && !nl.leap) out.push("eve");
  return out;
}
/* holiday-cn names its days in Chinese ("国庆节、中秋节"); English shows the festival names we know */
var HOL_NAME={"元旦":"newyear", "春节":"spring", "清明节":"qingming", "劳动节":"labour", "端午节":"dragon", "中秋节":"midautumn", "国庆节":"national"};
function holidayName(name){
  return String(name||"").split("、").map(function(n){ return HOL_NAME[n] ? tr("cal.f."+HOL_NAME[n]) : n; }).join(" · ");
}

/* ---------- yearly dates ---------- */
/* Feb 29 falls on Feb 28 in other years; a lunar day 30 falls on day 29 in a short month;
   a date in a leap month falls in that leap month when the year has it, otherwise in the regular month */
function solarIn(a,y){
  if(y<MIN||y>MAX) return null;
  return {y:y, m:a.month, d:Math.min(a.day,L.daysInMonth(y,a.month))};
}
function lunarIn(a,ly){
  var leap=!!a.leap && L.leapMonth(ly)===a.month, size=L.monthSize(ly,a.month,leap);
  return size ? L.toSolar(ly,a.month,Math.min(a.day,size),leap) : null;
}
function occursIn(a,y){ return a.lunar ? lunarIn(a,y) : solarIn(a,y); }
/* the first day on or after n that the date falls on */
function nextOf(a,n){
  var y=L.fromDayNumber(n).y, best=null;
  for(var k=-1;k<=1;k++){
    var o=occursIn(a,y+k); if(!o) continue;
    var on=L.dayNumber(o.y,o.m,o.d); if(on>=n && (best===null || on<best)) best=on;
  }
  return best;
}
function soonest(){
  var n=todayN(), best=null;
  C.dates.forEach(function(a){ var on=nextOf(a,n); if(on!==null && on-n<=SOON && (!best || on<best.on)) best={a:a, on:on, days:on-n}; });
  return best;
}
/* which dates fall on the days from n0 to n1: day number -> [date] */
function datesBetween(n0,n1){
  var out={}, y0=L.fromDayNumber(n0).y, y1=L.fromDayNumber(n1).y;
  C.dates.forEach(function(a){
    for(var y=y0-1;y<=y1;y++){
      var o=occursIn(a,y); if(!o) continue;
      var on=L.dayNumber(o.y,o.m,o.d); if(on>=n0 && on<=n1) (out[on]=out[on]||[]).push(a);
    }
  });
  return out;
}
function repeatText(a){
  if(!a.lunar) return tr("cal.rep.solar",{m:a.month, d:a.day, mon:list("cal.months")[a.month-1]});
  return tr(a.leap?"cal.rep.lunarleap":"cal.rep.lunar",{month:list("cal.lmonth")[a.month-1], day:list("cal.lday")[a.day-1]});
}

/* ---------- days off ---------- */
function validFile(j,y){
  return j && j.year===y && Array.isArray(j.days) && j.days.length>0 && j.days.every(function(x){
    return x && /^\d{4}-\d\d-\d\d$/.test(x.date) && typeof x.isOffDay==="boolean" && typeof x.name==="string";
  });
}
/* December's make-up days can be in next year's file (holiday-cn's README), so all files go into one
   index; later years go in last and win when two files name the same day */
function indexHolidays(){
  var h={};
  Object.keys(C.files).sort().forEach(function(y){ C.files[y].days.forEach(function(x){ h[x.date]={off:x.isOffDay, name:x.name}; }); });
  C.hol=h;
}
function hasYear(y){ return !!C.files[y]; }
function loadHolidays(){
  if(C.holLoaded) return Promise.resolve();
  C.holLoaded=true;
  var jobs=Object.keys(BUNDLED).map(function(y){
    return fetch(BUNDLED[y]).then(function(r){ return r.json(); }).then(function(j){ if(validFile(j,+y) && !C.files[y]) C.files[y]={days:j.days}; }).catch(function(){});
  });
  if(C.refs) jobs.push(C.refs.hol.get().then(function(q){
    q.docs.forEach(function(doc){ var j=own(doc.data()); if(j && validFile({year:j.year, days:j.days},+doc.id)) C.files[doc.id]={days:j.days}; });
  }).catch(function(){}));
  return Promise.all(jobs).then(indexHolidays);
}
/* at most one try per 7 days, counted from the try, whether it worked or not; quiet on failure */
function updateHolidays(){
  if(C.tried) return;
  C.tried=true;
  var y=now().y, want=[y,y+1].filter(function(x){ return !hasYear(x) && x<=MAX; });
  if(!want.length || Date.now()-(C.set.holidayTry||0)<RETRY) return;
  C.set.holidayTry=Date.now(); saveSettings();
  want.forEach(function(x){
    /* no cookies, no referrer: the request says nothing about the handheld or its owner */
    fetch(REMOTE+x+".json",{credentials:"omit", referrerPolicy:"no-referrer", cache:"no-store"})
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(j){
        if(!validFile(j,x)) return;
        var days=j.days.map(function(d){ return {name:d.name, date:d.date, isOffDay:d.isOffDay}; });
        C.files[x]={days:days}; indexHolidays();
        if(C.refs) put(C.refs.hol.doc(String(x)),{year:x, days:days, fetched:Date.now()});
        if(!$("v-cal").hidden) render();
      }).catch(function(){});
  });
}
function saveSettings(){ if(C.refs) put(C.refs.set,C.set); }

/* ---------- month view ---------- */
function buildGrid(){
  var g=$("cal-grid"); g.textContent=""; C.cells=[];
  for(var i=0;i<42;i++){
    var b=document.createElement("button"); b.type="button"; b.className="cal-cell";
    b.appendChild(document.createElement("b")); b.appendChild(document.createElement("span"));
    (function(i){ b.onclick=function(){ cellTap(i); }; })(i);
    g.appendChild(b); C.cells.push(b);
  }
}
function cellText(y,m,d,lu){
  var f=festivals(y,m,d,lu); if(f.length) return {t:tr("cal.fs."+f[0]), hi:true};
  var j=L.term(y,m,d); if(j>=0) return {t:list("cal.termshort")[j], hi:true};
  if(!lu) return {t:""};
  if(lu.day===1) return {t:tr(lu.leap?"cal.cellleap":"cal.cellmonth",{month:lunarMonth(lu)})};
  return {t:tr("cal.cellday",{day:list("cal.lday")[lu.day-1]})};
}
function render(){
  if(!C.cells.length) buildGrid();
  C.todayN=todayN();
  var lu=L.fromSolar(C.y,C.m,C.d);
  $("cal-ym").textContent=tr("cal.ym",{y:C.y, m:C.m, mon:list("cal.months")[C.m-1]});
  $("cal-ly").textContent=lu ? yearText(lu.year,"cal.yearhead") : "";
  var wk=$("cal-week"); wk.textContent="";
  list("cal.week").forEach(function(w){ var s=document.createElement("span"); s.textContent=w; wk.appendChild(s); });
  var first=L.dayNumber(C.y,C.m,1)-L.weekday(C.y,C.m,1), sel=selN(), marks=datesBetween(first,first+41);
  C.cells.forEach(function(b,i){
    var n=first+i, t=L.fromDayNumber(n), inRange=n>=FIRST && n<=LAST, l=inRange ? L.fromSolar(t.y,t.m,t.d) : null;
    var c=inRange ? cellText(t.y,t.m,t.d,l) : {t:""}, h=C.hol[iso(t.y,t.m,t.d)];
    b.className="cal-cell"+(t.m!==C.m?" out":"")+(n===C.todayN?" today":"")+(n===sel?" sel":"");
    b.disabled=!inRange;
    b.firstChild.textContent=inRange ? t.d : "";
    b.childNodes[1].textContent=c.t; b.childNodes[1].className=c.hi?"hi":"";
    while(b.childNodes.length>2) b.removeChild(b.lastChild);
    if(h){ var i2=document.createElement("i"); i2.className=h.off?"off":"work"; i2.textContent=tr(h.off?"cal.badge.off":"cal.badge.work"); b.appendChild(i2); }
    if(marks[n]){ b.appendChild(document.createElement("u")); }
    b.setAttribute("aria-label",inRange ? dateText(t.y,t.m,t.d)+(l?" "+lunarText(l):"") : "");
  });
  $("cal-info").textContent=infoLine();
  renderSheet();
}
function infoLine(){
  var lu=L.fromSolar(C.y,C.m,C.d), parts=[tr("cal.short",{m:C.m, d:C.d, mon:list("cal.months")[C.m-1], w:weekdayName(C.y,C.m,C.d)})];
  if(lu) parts.push(lunarText(lu));
  var j=L.term(C.y,C.m,C.d); if(j>=0) parts.push(list("cal.terms")[j]);
  var diff=selN()-todayN();
  if(diff) parts.push(tr(diff>0?"cal.after":"cal.before",{n:Math.abs(diff)}));
  return parts.join(" · ");
}
var swiped=false;
function cellTap(i){
  if(swiped){ swiped=false; return; }
  var first=L.dayNumber(C.y,C.m,1)-L.weekday(C.y,C.m,1), n=first+i;
  if(n===selN()){ openSheet("day"); return; }
  select(n); render();
}
/* a sideways swipe over the days turns the page */
(function(){
  var g=$("cal-grid"), x0=null, y0=0;
  g.addEventListener("pointerdown",function(e){ x0=e.clientX; y0=e.clientY; swiped=false; });
  g.addEventListener("pointerup",function(e){
    if(x0===null) return;
    var dx=e.clientX-x0, dy=e.clientY-y0; x0=null;
    if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.5){ swiped=true; if(shiftMonth(dx<0?1:-1)){ sfx("move"); render(); } setTimeout(function(){ swiped=false; },400); }
  });
  g.addEventListener("pointercancel",function(){ x0=null; });
})();
$("cal-prev").onclick=function(){ if(shiftMonth(-1)) render(); };
$("cal-next").onclick=function(){ if(shiftMonth(1)) render(); };
$("cal-today").onclick=function(){ goToday(); };
$("cal-list-btn").onclick=function(){ openSheet("list"); };
$("cal-info").onclick=function(){ openSheet("day"); };
$("cal-ym").onclick=function(){ openJump(); };
function goToday(){ select(todayN()); render(); }

/* ---------- sheets: the day, the list of dates, the add form ---------- */
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function btn(cls,text,fn){ var b=el("button",cls,text); b.type="button"; b.onclick=fn; return b; }
/* an on-screen key with its chin-pad letter, like the camera's */
function keyBtn(cls,key,label,fn){ var b=btn(cls,null,fn); b.appendChild(el("i","",key)); b.appendChild(document.createTextNode(label)); return b; }
function openSheet(name){ C.sheet=name; if(name==="list") C.pick=0; renderSheet(); }
function closeSheet(){ C.sheet=""; C.form=null; render(); }
function renderSheet(){
  var sh=$("cal-sheet"); sh.hidden=!C.sheet; sh.textContent="";
  if(C.sheet==="day") daySheet(sh);
  else if(C.sheet==="list") listSheet(sh);
  else if(C.sheet==="add") addSheet(sh);
  else if(C.sheet==="jump") jumpSheet(sh);
}
function daySheet(sh){
  var lu=L.fromSolar(C.y,C.m,C.d), j=L.term(C.y,C.m,C.d), h=C.hol[iso(C.y,C.m,C.d)], n=selN();
  sh.appendChild(el("p","sheet-title",dateText(C.y,C.m,C.d)));
  var body=el("div","cal-lines");
  if(lu){ body.appendChild(el("p","cal-big",lunarText(lu))); body.appendChild(el("p","",yearText(lu.year))); }
  if(j>=0) body.appendChild(el("p","",tr("cal.termis",{name:list("cal.terms")[j]})));
  var f=festivals(C.y,C.m,C.d,lu);
  if(f.length) body.appendChild(el("p","",tr("cal.festis",{name:f.map(function(x){ return tr("cal.f."+x); }).join(" · ")})));
  if(h) body.appendChild(el("p","",tr(h.off?"cal.offday":"cal.workday",{name:holidayName(h.name)})));
  var mine=datesBetween(n,n)[n]||[];
  mine.forEach(function(a){
    var row=el("div","cal-date");
    row.appendChild(el("b","",LP.noEmoji(a.name)));
    row.appendChild(el("small","",repeatText(a)));
    var del=btn("btn ghost",tr("common.delete"),function(){
      if(del.dataset.armed){ removeDate(a.id); return; }
      del.dataset.armed="1"; del.className="btn"; del.textContent=tr("common.confirm",{what:tr("common.delete")});
    });
    row.appendChild(del); body.appendChild(row);
  });
  sh.appendChild(body);
  var keys=el("div","cal-keys");
  keys.appendChild(keyBtn("ck","B",tr("cal.back"),function(){ closeSheet(); }));
  keys.appendChild(keyBtn("ck ck-a","A",tr("cal.add"),function(){ openAdd(); }));
  sh.appendChild(keys);
}
function upcoming(){
  var n=todayN();
  return C.dates.map(function(a){ return {a:a, on:nextOf(a,n)}; }).filter(function(x){ return x.on!==null; })
    .sort(function(p,q){ return p.on-q.on; });
}
function listSheet(sh){
  sh.appendChild(el("p","sheet-title",tr("cal.anniv")));
  var items=upcoming(), n=todayN(), ul=el("ul","lcd-menu cal-list");
  if(!items.length) sh.appendChild(el("p","hint cal-empty",tr(S.db?"cal.empty":"cal.emptynodb")));
  C.pick=Math.max(0,Math.min(C.pick,items.length-1));
  items.forEach(function(x,i){
    var li=el("li",i===C.pick?"on":""), t=L.fromDayNumber(x.on);
    li.appendChild(el("span","",LP.noEmoji(x.a.name)));
    li.appendChild(el("small","",(x.on===n?tr("cal.today"):tr("cal.after",{n:x.on-n}))+" · "+t.m+"/"+t.d));
    li.onclick=function(){ select(x.on); C.sheet="day"; render(); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  var keys=el("div","cal-keys");
  keys.appendChild(keyBtn("ck","B",tr("cal.back"),function(){ closeSheet(); }));
  sh.appendChild(keys);
}
function openAdd(){
  var lu=L.fromSolar(C.y,C.m,C.d);
  C.form={name:"", lunar:false, sm:C.m, sd:C.d, lm:lu?lu.month:1, ld:lu?lu.day:1, leap:!!(lu&&lu.leap)};
  C.sheet="add"; renderSheet();
  var inp=$("cal-name"); if(inp) inp.focus();
}
function addSheet(sh){
  var F=C.form;
  sh.appendChild(el("p","sheet-title",tr("cal.add")));
  var inp=el("input","cal-name"); inp.id="cal-name"; inp.type="text"; inp.maxLength=24; inp.value=F.name; inp.placeholder=tr("cal.name");
  inp.oninput=function(){ F.name=inp.value; };
  inp.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); saveDate(); } };
  sh.appendChild(inp);
  var kind=el("div","row cal-kind"); kind.setAttribute("role","radiogroup");
  [[false,"cal.solar"],[true,"cal.lunarrep"]].forEach(function(o){
    var b=btn(F.lunar===o[0]?"btn":"btn ghost",tr(o[1]),function(){ F.lunar=o[0]; renderSheet(); });
    b.setAttribute("role","radio"); b.setAttribute("aria-checked",F.lunar===o[0]?"true":"false"); kind.appendChild(b);
  });
  sh.appendChild(kind);
  function stepper(label,get,set,lo,hi,show){
    var r=el("div","cal-step");
    r.appendChild(el("span","",label));
    r.appendChild(btn("btn ghost","−",function(){ var v=get()-1; set(v<lo?hi:v); renderSheet(); }));
    r.appendChild(el("b","",show(get())));
    r.appendChild(btn("btn ghost","+",function(){ var v=get()+1; set(v>hi?lo:v); renderSheet(); }));
    return r;
  }
  if(!F.lunar){
    sh.appendChild(stepper(tr("cal.month"),function(){ return F.sm; },function(v){ F.sm=v; F.sd=Math.min(F.sd,L.daysInMonth(2024,v)); },1,12,function(v){ return tr("cal.mname",{m:v, mon:list("cal.months")[v-1]}); }));
    sh.appendChild(stepper(tr("cal.day"),function(){ return F.sd; },function(v){ F.sd=v; },1,L.daysInMonth(2024,F.sm),String));
  } else {
    sh.appendChild(stepper(tr("cal.month"),function(){ return F.lm; },function(v){ F.lm=v; },1,12,function(v){ return tr(F.leap?"cal.lmnameleap":"cal.lmname",{month:list("cal.lmonth")[v-1]}); }));
    sh.appendChild(stepper(tr("cal.day"),function(){ return F.ld; },function(v){ F.ld=v; },1,30,function(v){ return list("cal.lday")[v-1]; }));
    var lp=btn(F.leap?"btn":"btn ghost",tr("cal.leap"),function(){ F.leap=!F.leap; renderSheet(); });
    lp.setAttribute("aria-pressed",F.leap?"true":"false");
    var lr=el("div","cal-step"); lr.appendChild(lp); lr.appendChild(el("small","hint",tr("cal.leapnote"))); sh.appendChild(lr);
  }
  var keys=el("div","cal-keys");
  keys.appendChild(keyBtn("ck","B",tr("common.cancel"),function(){ C.sheet="day"; C.form=null; renderSheet(); }));
  keys.appendChild(keyBtn("ck ck-a","A",tr("common.save"),function(){ saveDate(); }));
  sh.appendChild(keys);
}
function saveDate(){
  var F=C.form; if(!F) return;
  var name=LP.noEmoji(F.name).slice(0,24);
  if(!name){ toast(tr("cal.noname")); sfx("err"); var i=$("cal-name"); if(i) i.focus(); return; }
  var a=F.lunar ? {name:name, month:F.lm, day:F.ld, lunar:true, leap:!!F.leap} : {name:name, month:F.sm, day:F.sd, lunar:false, leap:false};
  a.id=C.refs ? C.refs.days.doc().id : uid();
  C.dates.push(a);
  if(C.refs){ var doc={name:a.name, month:a.month, day:a.day, lunar:a.lunar, leap:a.leap}; put(C.refs.days.doc(a.id),doc); }
  else toast(tr("cal.nodb"));
  sfx("ok");
  /* show the day it falls on next */
  var on=nextOf(a,todayN()); if(on!==null) select(on);
  C.sheet="day"; C.form=null; render();
}
function removeDate(id){
  C.dates=C.dates.filter(function(a){ return a.id!==id; });
  if(C.refs) C.refs.days.doc(id).delete().catch(function(){ toast(tr("cal.delfail")); });
  render();
}

/* ---------- go to a date: eight digits (YYYYMMDD), Gregorian or lunar, typed like on an old handheld ----------
   The cursor sits on one digit: ▲▼ change it, ◀▶ move, digits (on-screen pad or keyboard) type and advance.
   A day past the end of its month falls on the last day, the rule yearly dates follow; a leap month the year
   does not have falls on the regular month. */
function digitsOf(y,m,d){ return (String(y)+LP.pad2(m)+LP.pad2(d)).split("").map(Number); }
function openJump(){
  var lu=L.fromSolar(C.y,C.m,C.d);
  C.jump={lunar:false, cur:0, leap:!!(lu&&lu.leap), d:digitsOf(C.y,C.m,C.d)};
  C.sheet="jump"; renderSheet();
}
/* the day number the digits point at, or {err: string key} */
function jumpTarget(){
  var J=C.jump, v=function(a,b){ return +J.d.slice(a,b).join(""); }, y=v(0,4), m=v(4,6), d=v(6,8);
  if(y<MIN || y>MAX) return {err:"cal.jump.range"};
  if(m<1 || m>12) return {err:"cal.jump.month"};
  if(d<1) return {err:"cal.jump.day"};
  if(!J.lunar) return {n:L.dayNumber(y,m,Math.min(d,L.daysInMonth(y,m)))};
  var leap=J.leap && L.leapMonth(y)===m, t=L.toSolar(y,m,Math.min(d,L.monthSize(y,m,leap)),leap);
  return t ? {n:L.dayNumber(t.y,t.m,t.d)} : {err:"cal.jump.range"};
}
/* switching calendars keeps the day: the digits become the same day in the other one */
function jumpMode(){
  var J=C.jump, t=jumpTarget(), day=L.fromDayNumber(t.err ? selN() : t.n), lu;
  J.lunar=!J.lunar;
  if(J.lunar){ lu=L.fromSolar(day.y,day.m,day.d); if(lu){ J.d=digitsOf(lu.year,lu.month,lu.day); J.leap=lu.leap; } else J.lunar=false; }
  else J.d=digitsOf(day.y,day.m,day.d);
  renderSheet();
}
function jumpType(n){ var J=C.jump; J.d[J.cur]=n; J.cur=Math.min(7,J.cur+1); renderSheet(); }
function jumpGo(){
  var t=jumpTarget();
  if(t.err){ sfx("err"); return; }
  select(t.n); sfx("ok"); closeSheet();
}
function jumpSheet(sh){
  var J=C.jump, sep=list("cal.jump.sep");
  sh.appendChild(el("p","sheet-title",tr("cal.jump.title")));
  var kind=el("div","row cal-kind"); kind.setAttribute("role","radiogroup");
  [[false,"cal.solar"],[true,"cal.lunarrep"]].forEach(function(o){
    var b=btn(J.lunar===o[0]?"btn":"btn ghost",tr(o[1]),function(){ if(J.lunar!==o[0]) jumpMode(); });
    b.setAttribute("role","radio"); b.setAttribute("aria-checked",J.lunar===o[0]?"true":"false"); kind.appendChild(b);
  });
  /* the leap toggle sits in the same row so the panel fits a small phone; the preview shows which month it lands in */
  if(J.lunar){
    var lp=btn(J.leap?"btn cal-leap":"btn ghost cal-leap",tr("cal.leap"),function(){ J.leap=!J.leap; renderSheet(); });
    lp.setAttribute("aria-pressed",J.leap?"true":"false"); kind.appendChild(lp);
  }
  sh.appendChild(kind);
  var row=el("div","cal-digits");
  J.d.forEach(function(n,i){
    var c=btn(i===J.cur?"on":"",String(n),function(){ J.cur=i; renderSheet(); });
    c.setAttribute("aria-label",tr("cal.jump.digit",{n:i+1}));
    row.appendChild(c);
    if(i===3||i===5||i===7) row.appendChild(el("span","",sep[i===3?0:i===5?1:2]));
  });
  sh.appendChild(row);
  /* what A will jump to, or why it can't */
  var t=jumpTarget(), out;
  if(t.err) out=tr(t.err);
  else { var g=L.fromDayNumber(t.n), lu=L.fromSolar(g.y,g.m,g.d); out=dateText(g.y,g.m,g.d)+(lu?" · "+lunarText(lu):""); }
  var pv=el("p","cal-preview"+(t.err?" err":""),out); pv.setAttribute("aria-live","polite"); sh.appendChild(pv);
  var pad=el("div","cal-numpad");
  [1,2,3,4,5,6,7,8,9].forEach(function(n){ pad.appendChild(btn("btn ghost",String(n),function(){ jumpType(n); })); });
  pad.appendChild(btn("btn ghost","◀",function(){ J.cur=Math.max(0,J.cur-1); renderSheet(); }));
  pad.appendChild(btn("btn ghost","0",function(){ jumpType(0); }));
  pad.appendChild(btn("btn ghost","▶",function(){ J.cur=Math.min(7,J.cur+1); renderSheet(); }));
  sh.appendChild(pad);
  sh.appendChild(el("p","hint cal-jumpkeys",tr("cal.jump.keys")));
  var keys=el("div","cal-keys");
  keys.appendChild(keyBtn("ck","B",tr("common.cancel"),function(){ closeSheet(); }));
  keys.appendChild(keyBtn("ck ck-a","A",tr("cal.jump.go"),function(){ jumpGo(); }));
  sh.appendChild(keys);
}
/* digits from a keyboard while the panel is open */
document.addEventListener("keydown",function(e){
  if($("v-cal").hidden || C.sheet!=="jump" || /INPUT|TEXTAREA/.test(e.target.nodeName)) return;
  if(/^[0-9]$/.test(e.key)){ e.preventDefault(); jumpType(+e.key); }
  else if(e.key==="Backspace"){ e.preventDefault(); C.jump.cur=Math.max(0,C.jump.cur-1); renderSheet(); }
});

/* ---------- chin pad: arrows move the day, A opens it, START goes to a date, SELECT the list, B goes back (to today in the month view) ---------- */
function calButton(b){
  if(C.sheet==="jump"){
    var J=C.jump;
    if(b==="left"||b==="right"){ J.cur=Math.max(0,Math.min(7,J.cur+(b==="left"?-1:1))); sfx("move"); renderSheet(); }
    else if(b==="up"||b==="down"){ J.d[J.cur]=(J.d[J.cur]+(b==="up"?1:9))%10; sfx("move"); renderSheet(); }
    else if(b==="a"||b==="start") jumpGo();
    else if(b==="b") closeSheet();
    else if(b==="select"){ jumpMode(); sfx("tap"); }
    return;
  }
  if(C.sheet==="add"){ if(b==="a") saveDate(); else if(b==="b"){ C.sheet="day"; C.form=null; renderSheet(); } return; }
  if(C.sheet==="list"){
    var items=upcoming();
    if(b==="up"||b==="down"){ C.pick=Math.max(0,Math.min(items.length-1,C.pick+(b==="up"?-1:1))); sfx("move"); renderSheet(); }
    else if(b==="a" && items[C.pick]){ select(items[C.pick].on); C.sheet="day"; render(); }
    else if(b==="b"||b==="select") closeSheet();
    return;
  }
  if(C.sheet==="day"){
    if(b==="b") closeSheet();
    else if(b==="a") openAdd();
    else if(b==="left"||b==="right"){ select(selN()+(b==="left"?-1:1)); sfx("move"); render(); }
    return;
  }
  var step={left:-1, right:1, up:-7, down:7}[b];
  if(step){ select(selN()+step); sfx("move"); render(); }
  else if(b==="a") openSheet("day");
  else if(b==="start") openJump();
  else if(b==="select") openSheet("list");
  /* the month view is the outermost screen: "back" is back to today; on today it does nothing (HOME leaves) */
  else if(b==="b" && selN()!==todayN()){ goToday(); sfx("tap"); }
}
LP.padRoute("cal",function(b,down){ if($("v-cal").hidden) return false; if(down) calButton(b); return true; });

/* ---------- home icon: a desk calendar page with today's date ---------- */
var DIGITS=["0110100110011001100110010110","0010011000100010001000100111","0110100100010010010010001111","0110100100010110000110010110",
  "0010011010101010111100100010","1111100011100001000110010110","0110100010001110100110010110","1111000100100010010001000100",
  "0110100110010110100110010110","0110100110010111000100010110"];
function dateIcon(){
  var d=now().d, rows=[], i, x, y;
  var g=["................", "....0......0....", ".00000000000000.", ".01111111111110.", ".00000000000000."];
  for(i=5;i<14;i++) g.push(".033333333333302");
  g.push(".000000000000002"); g.push("..22222222222222");
  for(y=0;y<16;y++) rows.push(g[y].split(""));
  var ds=String(d).split(""), x0=ds.length===2?4:6;
  ds.forEach(function(ch,k){
    var bits=DIGITS[+ch];
    for(y=0;y<7;y++) for(x=0;x<4;x++) if(bits.charAt(y*4+x)==="1") rows[6+y][x0+k*5+x]="0";
  });
  return rows.map(function(r){ return r.join(""); });
}
function tag(){
  var s=soonest(); if(!s) return "";
  var name=LP.noEmoji(s.a.name);
  return s.days ? tr("cal.tag",{n:s.days, name:name}) : tr("cal.tagtoday",{name:name});
}
/* redraw the home icon when the date changes while the handheld is on */
var lastDay=todayN();
setInterval(function(){
  var n=todayN(); if(n===lastDay) return; lastDay=n;
  if(!$("v-home").hidden) LP.renderHome();
  if(!$("v-cal").hidden) render();
},60000);

function openCal(){
  select(todayN()); C.sheet=""; C.form=null;
  show("cal"); showPad(true); render();
  loadHolidays().then(function(){ if(!$("v-cal").hidden) render(); updateHolidays(); });
}

LP.builtin({id:"calendar", label:"app.calendar", icon:dateIcon, view:"cal", keepPad:true,
  open:function(){ openCal(); },
  tag:tag,
  leave:function(){ C.sheet=""; C.form=null; },
  lang:function(){ if(!$("v-cal").hidden) render(); },
  ready:function(){
    var base=S.db.doc("data/users/local/calendar");
    C.refs={set:base, days:base.collection("days"), hol:base.collection("holidays")};
    Promise.all([
      base.get().then(function(sn){ C.set=(sn.exists && own(sn.data()))||{}; }),
      C.refs.days.get().then(function(q){
        C.dates=q.docs.map(function(doc){ var a=own(doc.data())||{}; a.id=doc.id; return a; })
          .filter(function(a){ return a.name && a.month>=1 && a.month<=12 && a.day>=1 && a.day<=31; });
      })
    ]).then(function(){
      if(!$("v-home").hidden) LP.renderHome();
      if(!$("v-cal").hidden) render();
      /* once a day at power-on, say when a date is near */
      var s=soonest(), n=todayN();
      if(s && C.set.hinted!==n){
        C.set.hinted=n; saveSettings();
        toast(s.days ? tr("cal.hint",{n:s.days, name:LP.noEmoji(s.a.name)}) : tr("cal.hinttoday",{name:LP.noEmoji(s.a.name)}));
      }
    }).catch(function(){});
  }});
})();
