/*
 * Lo-PDA runtime: the text side of notes (docs/design/notes.md). Pure functions, no DOM, so Node tests run them:
 * tags in a body, search with a snippet, the diary title of a day, front matter for export and import, export file names.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

function title(body){ return String(body||"").split("\n")[0].trim(); }

/* ---------- tags: # or ＃ followed by letters, digits or _, at most 20 of them. Read from the body every time, never stored.
   A # right after an ASCII letter, digit, & or / is not a tag: C#, page#anchor, &#39;, a/b#c */
var TAG=/[#＃]([\p{L}\p{N}\p{M}_]+)/gu, NOT_BEFORE=/[A-Za-z0-9&\/]/, TAG_MAX=20;
function tags(body){
  var s=String(body||""), out=[], seen={}, m;
  TAG.lastIndex=0;
  while((m=TAG.exec(s))){
    if(m.index>0 && NOT_BEFORE.test(s.charAt(m.index-1))) continue;
    var t=Array.from(m[1]).slice(0,TAG_MAX).join(""), k=key(t);
    if(!seen[k]){ seen[k]=true; out.push(t); }
  }
  return out;
}
/* tags compare without case or width: #Idea and #ｉｄｅａ are one tag */
function key(s){ return String(s).normalize("NFKC").toLowerCase(); }

/* ---------- search: NFKC and lower case on both sides, a plain substring (Chinese by character, no word splitting).
   fold() keeps, for every unit of the folded text, the index in the original where it came from, so a hit in the
   folded text maps back onto the body for the snippet */
function fold(s){
  var out="", map=[], i=0;
  s=String(s||"");
  while(i<s.length){
    var cp=s.codePointAt(i), ch=String.fromCodePoint(cp), f=ch.normalize("NFKC").toLowerCase();
    for(var k=0;k<f.length;k++){ out+=f.charAt(k); map.push(i); }
    i+=ch.length;
  }
  map.push(s.length);
  return {s:out, map:map};
}
var AROUND=12;
/* the first hit of q in body, or null: {at, end} in the body, and a one-line snippet of about AROUND characters on each
   side, split as {before, hit, after} so the hit can be drawn inverted; lead/tail say text was cut there */
function search(body,q){
  var needle=fold(q).s.trim();
  if(!needle) return null;
  body=String(body||"");
  var f=fold(body), i=f.s.indexOf(needle);
  if(i<0) return null;
  var at=f.map[i], end=f.map[i+needle.length];
  /* a hit that ends inside a character the fold widened (ﬁ -> fi) takes the whole character */
  if(end<=at) end=at+1;
  var pre=Array.from(body.slice(0,at)), post=Array.from(body.slice(end));
  var one=function(t){ return t.replace(/\s+/g," "); };
  return {
    at:at, end:end,
    lead:pre.length>AROUND, tail:post.length>AROUND,
    before:one(pre.slice(Math.max(0,pre.length-AROUND)).join("")),
    hit:one(body.slice(at,end)),
    after:one(post.slice(0,AROUND).join(""))
  };
}

/* ---------- days ---------- */
function pad2(n){ return (n<10?"0":"")+n; }
/* "2026-10-15" for a time, in the device's time zone */
function dayKey(ts){ var d=new Date(ts); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
function parseDay(s){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||""));
  if(!m) return null;
  var y=+m[1], mo=+m[2], d=+m[3];
  var dim=[31,(y%4===0 && y%100!==0) || y%400===0 ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  if(mo<1 || mo>12 || d<1 || d>dim[mo-1]) return null;
  return {y:y, m:mo, d:d};
}
/* the diary's first line: "10月15日 周四 · 九月初五", " · 寒露" on a solar term; "Thu 15 Oct" in English.
   t is the strings' t(); the lunar names are the calendar's (cal.lmonth, cal.lday, cal.terms), from runtime/lunar.js.
   plain: the date and weekday only (the list's 今天 row) */
function diaryTitle(day,lang,t,lunar,plain){
  var p=typeof day==="string" ? parseDay(day) : day;
  if(!p) return "";
  var list=function(k){ return t(k).split("|"); };
  var w=lunar ? lunar.weekday(p.y,p.m,p.d) : new Date(p.y,p.m-1,p.d).getDay();
  var s=t("notes.day",{m:p.m, d:p.d, w:list("notes.week")[w], mon:list("notes.months")[p.m-1]});
  if(plain || lang!=="zh" || !lunar) return s;
  var lu=lunar.fromSolar(p.y,p.m,p.d);
  if(lu) s+=" · "+t(lu.leap?"notes.lunarleap":"notes.lunar",{month:list("cal.lmonth")[lu.month-1], day:list("cal.lday")[lu.day-1]});
  var j=lunar.term(p.y,p.m,p.d);
  if(j>=0) s+=" · "+list("cal.terms")[j];
  return s;
}

/* ---------- front matter: a YAML block at the top of each exported file, the body after it untouched ---------- */
function iso(ts){
  var d=new Date(ts), off=-d.getTimezoneOffset(), a=Math.abs(off);
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())+"T"+pad2(d.getHours())+":"+pad2(d.getMinutes())+":"+pad2(d.getSeconds())+
    (off<0?"-":"+")+pad2(Math.floor(a/60))+":"+pad2(a%60);
}
function yamlString(s){ return /^[\p{L}\p{N}_]+$/u.test(s) && !/^(true|false|null|yes|no|on|off|~|\d+(\.\d+)?)$/i.test(s) ? s : JSON.stringify(s); }
/* meta: {created, updated (times), tags [..], pinned, date "2026-10-15"}; pinned and date only when there */
function frontMatter(meta){
  var lines=["---"];
  if(meta.created!=null) lines.push("created: "+iso(meta.created));
  if(meta.updated!=null) lines.push("updated: "+iso(meta.updated));
  lines.push("tags: ["+(meta.tags||[]).map(yamlString).join(", ")+"]");
  if(meta.pinned) lines.push("pinned: true");
  if(meta.date) lines.push("date: "+meta.date);
  lines.push("---","");
  return lines.join("\n");
}
/* the other way: {meta, body}. Only a block that opens the text with ---, closes with ---, and holds nothing but
   "key: value" lines (or list items under a key) counts; anything else is body, as it was. Reads created, updated,
   pinned, date; tags stay in the body, where they already are */
function parseFront(text){
  var s=String(text||"").replace(/^﻿/,"");
  var m=/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(s);
  if(!m) return {meta:{}, body:s};
  var raw=m[1].split(/\r?\n/), meta={};
  for(var i=0;i<raw.length;i++){
    var line=raw[i];
    if(!line.trim() || /^\s*#/.test(line) || /^\s+-\s/.test(line)) continue;
    var kv=/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if(!kv) return {meta:{}, body:s};
    var k=kv[1].toLowerCase(), v=kv[2].trim().replace(/^(["'])(.*)\1$/,"$2");
    if(k==="created" || k==="updated"){ var t=Date.parse(v); if(isFinite(t)) meta[k]=t; }
    else if(k==="pinned") meta.pinned=/^(true|yes)$/i.test(v);
    else if(k==="date"){ var d=/^(\d{4}-\d{2}-\d{2})/.exec(v); if(d && parseDay(d[1])) meta.date=d[1]; }
  }
  return {meta:meta, body:s.slice(m[0].length)};
}

/* ---------- export file names: the title without / \ : * ? " < > | and control characters, no leading dots (an import
   skips hidden files) or trailing dots and spaces (Windows), at most 60 characters; empty becomes `blank`.
   used: an object of names already taken in the zip (compared without case: a Mac disk folds it); " (2)", " (3)" after */
var MAX_NAME=60;
function cleanName(t,blank){
  var s=String(t||"").replace(/\s+/g," ").replace(/[\/\\:*?"<>|\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,"").replace(/\s+/g," ");
  s=Array.from(s.trim()).slice(0,MAX_NAME).join("").replace(/^[.\s]+/,"").replace(/[.\s]+$/,"");
  return s || blank;
}
function fileName(t,blank,used,dir,ext){
  var base=cleanName(t,blank), name, n=1;
  dir=dir||""; ext=ext||".md";
  do { name=dir+base+(n>1?" ("+n+")":"")+ext; n++; } while(used[key(name)]);
  used[key(name)]=true;
  return name;
}
/* "notes/读书.md" -> "读书" */
function stem(path){ var b=String(path||"").split("/").pop(); var i=b.lastIndexOf("."); return i>0 ? b.slice(0,i) : b; }

window.LopdaNoteText={title:title, tags:tags, key:key, fold:fold, search:search, AROUND:AROUND,
  dayKey:dayKey, parseDay:parseDay, diaryTitle:diaryTitle, iso:iso, frontMatter:frontMatter, parseFront:parseFront,
  cleanName:cleanName, fileName:fileName, stem:stem, TAG_MAX:TAG_MAX, MAX_NAME:MAX_NAME};
})();
