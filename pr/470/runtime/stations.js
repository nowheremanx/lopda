/*
 * Lo-PDA runtime: the station list logic of the internet radio program 收音机 / Tuner. Pure functions: no DOM, no fetch,
 * no clock, so Node tests run it and the program only has to fetch text and draw.
 *
 *   LopdaStations.MAX, NAME_MAX              most stations kept (200), longest name in characters (60)
 *   cleanUrl(s) -> string | null             an absolute http(s) URL, trimmed, otherwise untouched
 *   cleanName(s, url) -> string              a tidy one-line name; empty falls back to the URL's host
 *   make(o, id) -> station | null            {id, name, url, home?, cc?, codec?, kbps?} from loose input
 *   sameUrl(a, b) -> boolean                 the same station: http/https and a trailing slash do not matter
 *   merge(list, incoming, newId) -> {list, added, skipped, full}   append without duplicates, up to MAX; inputs untouched
 *   parse(text, hint) -> {kind, stations, hls}   m3u / pls / xspf / json / an HLS stream / none; at most 1000 entries
 *   toM3U(list) -> string                    the export format, which parse() reads back
 *   fromDirectory(arr) -> stations           radio-browser.info search results (adds uuid, hls)
 *   kind(url) -> "playlist" | "hls" | "stream"   what to do with a URL the player typed or picked
 *   move(list, from, to) -> array            a copy with one item moved
 *
 * Why only http(s): the program hands these URLs to an audio element, and javascript:, data: or ftp: would be either
 * a hole or a dead entry. Why parse() never fetches: the caller decides how (and whether) to reach the network.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var MAX=200, NAME_MAX=60, URL_MAX=2048, PARSE_MAX=1000;

function str(s){ return typeof s==="string" ? s : (typeof s==="number" ? String(s) : ""); }

function cleanUrl(s){
  s=str(s).replace(/^\s+|\s+$/g,"");
  if(!s || s.length>URL_MAX) return null;
  /* the host part must not be empty; no whitespace or control characters anywhere */
  if(!/^https?:\/\/[^\s\/?#\x00-\x1f\x7f][^\s\x00-\x1f\x7f]*$/i.test(s)) return null;
  return s;
}

function hostOf(url){
  var m=/^https?:\/\/(?:[^\/?#@]*@)?([^\/?#:]*)/i.exec(url||"");
  return m ? m[1].toLowerCase().replace(/^www\./,"") : "";
}

function cleanName(s,url){
  var t=str(s).replace(/[\x00-\x1f\x7f-\x9f]+/g," ").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");
  var chars=Array.from(t);
  if(chars.length>NAME_MAX) t=chars.slice(0,NAME_MAX).join("").replace(/\s+$/,"");
  if(t) return t;
  return hostOf(url) || "?";
}

function make(o,id){
  var u, r, url, st, v, n;
  if(!o || typeof o!=="object") return null;
  u=cleanUrl(o.url); r=cleanUrl(o.url_resolved);
  /* the directory's resolved URL is often the https one; the page may be https, so it beats a plain http url */
  url=(r && /^https:/i.test(r) && !(u && /^https:/i.test(u))) ? r : (u || r);
  if(!url) return null;
  st={id:id==null ? "" : id, name:cleanName(o.name,url), url:url};
  v=cleanUrl(o.home || o.homepage);
  if(v) st.home=v;
  v=str(o.cc || o.countrycode);
  if(/^[A-Za-z]{2}$/.test(v)) st.cc=v.toUpperCase();
  v=str(o.codec).replace(/^\s+|\s+$/g,"");
  if(v && v.length<=12 && /^[A-Za-z0-9+\-]+$/.test(v) && v.toUpperCase()!=="UNKNOWN") st.codec=v.toUpperCase();
  n=Math.floor(Number(o.kbps || o.bitrate));
  if(n>0 && n<=2000) st.kbps=n;
  return st;
}

function splitUrl(u){
  var m=/^https?:\/\/([^\/?#]*)([\s\S]*)$/i.exec(u||"");
  var rest;
  if(!m) return null;
  rest=m[2];
  if(rest.charAt(rest.length-1)==="/") rest=rest.slice(0,-1);
  return {host:m[1].toLowerCase(), rest:rest};
}

function sameUrl(a,b){
  var x=splitUrl(a), y=splitUrl(b);
  if(!x || !y) return false;
  return x.host===y.host && x.rest===y.rest;
}

function merge(list,incoming,newId){
  var out=(list||[]).slice(), add=incoming||[], added=0, skipped=0, full=0, i, j, dup, s, c, k;
  for(i=0;i<add.length;i++){
    s=add[i];
    if(!s || !s.url) continue;
    dup=false;
    for(j=0;j<out.length;j++){ if(sameUrl(out[j].url,s.url)){ dup=true; break; } }
    if(dup){ skipped++; continue; }
    if(out.length>=MAX){ full++; continue; }
    c={};
    for(k in s) if(Object.prototype.hasOwnProperty.call(s,k)) c[k]=s[k];
    c.id=newId();
    out.push(c);
    added++;
  }
  return {list:out, added:added, skipped:skipped, full:full};
}

/* ---- playlist formats ---- */

function lines(text){ return String(text).replace(/^﻿/,"").split(/\r\n|\r|\n/); }

/* the title of "#EXTINF:-1 tvg-name="a,b" group-title="c",Title": after the last comma outside quotes. A bare
   "#EXTINF:-1,Name, with comma" has no attributes, so everything after its first comma is the name (our own export). */
function extinfTitle(line){
  var plain=/^#EXTINF:\s*-?\d+(?:\.\d+)?\s*,([\s\S]*)$/i.exec(line), q=false, last=-1, i, ch;
  if(plain) return plain[1];
  for(i=0;i<line.length;i++){
    ch=line.charAt(i);
    if(ch==='"') q=!q;
    else if(ch===",") if(!q) last=i;
  }
  return last<0 ? "" : line.slice(last+1);
}

function parseM3U(text){
  var ls=lines(text), out=[], title="", i, l, u, s;
  for(i=0;i<ls.length && out.length<PARSE_MAX;i++){
    l=ls[i].replace(/^\s+|\s+$/g,"");
    if(!l) continue;
    if(l.charAt(0)==="#"){
      if(/^#EXTINF:/i.test(l)) title=extinfTitle(l);
      continue;
    }
    u=cleanUrl(l);
    if(u){ s=make({url:u,name:title},""); if(s) out.push(s); }
    title="";
  }
  return out;
}

function parsePLS(text){
  var ls=lines(text), files={}, titles={}, nums=[], out=[], i, m, n, s;
  for(i=0;i<ls.length;i++){
    m=/^\s*(File|Title)(\d+)\s*=(.*)$/i.exec(ls[i]);
    if(!m) continue;
    n=parseInt(m[2],10);
    if(m[1].toLowerCase()==="file"){ if(!(n in files)) nums.push(n); files[n]=m[3]; }
    else titles[n]=m[3];
  }
  nums.sort(function(a,b){ return a-b; });
  for(i=0;i<nums.length && out.length<PARSE_MAX;i++){
    s=make({url:files[nums[i]],name:titles[nums[i]]},"");
    if(s) out.push(s);
  }
  return out;
}

function fromCode(n){
  if(!(n>0) || n>0x10ffff || (n>=0xd800 && n<=0xdfff)) return "";
  if(n<0x10000) return String.fromCharCode(n);
  n-=0x10000;
  return String.fromCharCode(0xd800+(n>>10),0xdc00+(n&0x3ff));
}

function xmlText(s){
  s=s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/,function(_,x){ return x.replace(/&/g,"&amp;"); });
  /* one pass, so "&amp;lt;" stays "&lt;" and is not decoded twice */
  return s.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g,function(all,hex,dec,name){
    if(hex) return fromCode(parseInt(hex,16));
    if(dec) return fromCode(parseInt(dec,10));
    return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'"}[name];
  });
}

function parseXSPF(text){
  var re=/<track\b[^>]*>([\s\S]*?)<\/track>/gi, out=[], m, loc, ti, s;
  while((m=re.exec(text)) && out.length<PARSE_MAX){
    loc=/<location\b[^>]*>([\s\S]*?)<\/location>/i.exec(m[1]);
    ti=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(m[1]);
    if(!loc) continue;
    s=make({url:xmlText(loc[1]),name:ti ? xmlText(ti[1]) : ""},"");
    if(s) out.push(s);
  }
  return out;
}

function fromObjects(arr){
  var out=[], i, s;
  for(i=0;i<arr.length && out.length<PARSE_MAX;i++){
    s=make(arr[i],"");
    if(s) out.push(s);
  }
  return out;
}

function hintIs(hint,ext){
  var p=str(hint).split(/[?#]/)[0].toLowerCase();
  return p.slice(-ext.length)===ext;
}

function parse(text,hint){
  var t=str(text).replace(/^﻿/,""), tr=t.replace(/^\s+|\s+$/g,""), j, arr, list;
  if(!tr) return {kind:"none", stations:[]};
  if(/#EXT-X-/.test(t)) return {kind:"hls", stations:[], hls:true};
  if(/^\s*\[playlist\]/im.test(t) || /^\s*File1\s*=/im.test(t))
    return {kind:"pls", stations:parsePLS(t)};
  /* the hint only matters when the text alone is thin: a track list without a playlist element */
  if(/<track[\s>]/i.test(t) && (/<playlist[\s>]/i.test(t) || hintIs(hint,".xspf")))
    return {kind:"xspf", stations:parseXSPF(t)};
  if(tr.charAt(0)==="[" || tr.charAt(0)==="{"){
    try{ j=JSON.parse(tr); }catch(e){ j=undefined; }
    if(j!==undefined){
      arr=Array.isArray(j) ? j : (j && Array.isArray(j.stations) ? j.stations : null);
      if(!arr) return {kind:"none", stations:[]};
      return {kind:"json", stations:fromObjects(arr)};
    }
  }
  list=parseM3U(t);
  return list.length ? {kind:"m3u", stations:list} : {kind:"none", stations:[]};
}

function toM3U(list){
  var out="#EXTM3U\n", i, s;
  list=list||[];
  for(i=0;i<list.length;i++){
    s=list[i];
    if(!s || !s.url) continue;
    out+="#EXTINF:-1,"+str(s.name).replace(/\r\n|\r|\n/g," ")+"\n"+s.url+"\n";
  }
  return out;
}

function fromDirectory(arr){
  var out=[], i, o, s;
  if(!Array.isArray(arr)) return out;
  for(i=0;i<arr.length;i++){
    o=arr[i];
    s=make(o,"");
    if(!s) continue;
    if(typeof o.stationuuid==="string" && o.stationuuid.length<=40 && /^[0-9a-fA-F-]+$/.test(o.stationuuid)) s.uuid=o.stationuuid;
    if(o.hls===1 || o.hls==="1") s.hls=true;
    out.push(s);
  }
  return out;
}

function kind(url){
  var p=str(url).split(/[?#]/)[0].toLowerCase();
  if(/\.(m3u|pls|xspf)$/.test(p)) return "playlist";
  if(/\.m3u8$/.test(p)) return "hls";
  return "stream";
}

function move(list,from,to){
  var out=(list||[]).slice(), item;
  if(typeof from!=="number" || from!==Math.floor(from) || from<0 || from>=out.length) return out;
  to=Math.max(0,Math.min(out.length-1,Math.floor(Number(to))||0));
  item=out.splice(from,1)[0];
  out.splice(to,0,item);
  return out;
}

window.LopdaStations={MAX:MAX, NAME_MAX:NAME_MAX, cleanUrl:cleanUrl, cleanName:cleanName, make:make, sameUrl:sameUrl,
  merge:merge, parse:parse, toM3U:toM3U, fromDirectory:fromDirectory, kind:kind, move:move};
})();
