/*
 * Lo-PDA PoC: 4d4y (Discuz) HTML reader. Parser only: it takes a Document built by DOMParser
 * and returns the few fields the PoC shows. No network, no storage, no DOM writes.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Why a separate file: like runtime/lunar.js for the calendar, it can be tested on its own.
 * Selectors were checked against the HTML the HiPDA-NG client parses; no Android code was ported.
 */
(function(){
"use strict";

var BASE="https://www.4d4y.com";
var MAX_FORUMS=30, MAX_TOPICS=30, MAX_POSTS=8, MAX_POST_CHARS=2400;

/* one line shape for every piece of text: no control characters, no runs of blank space */
function clean(s){
  s=String(s==null?"":s).replace(/\r\n?/g,"\n");
  s=s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"");
  s=s.replace(/\u00a0/g," ").replace(/[ \t\f\v]+/g," ");
  s=s.replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n");
  return s.trim();
}

function hostOK(h){ return /(^|\.)4d4y\.com$/i.test(h||""); }

/* relative Discuz links -> https on 4d4y; anything else is dropped, so the app never follows a link off-site */
function absURL(href,base){
  if(!href) return "";
  try{
    var u=new URL(href,base||BASE+"/");
    if(u.protocol!=="https:" && u.protocol!=="http:") return "";
    if(!hostOK(u.hostname)) return "";
    u.protocol="https:";
    if(u.port==="80") u.port="";
    u.hash="";
    return u.href;
  }catch(e){ return ""; }
}
function param(href,name){
  if(!href) return "";
  try{ return new URL(href,BASE+"/").searchParams.get(name)||""; }catch(e){ return ""; }
}
function fidOf(href){ return param(href,"fid"); }
function tidOf(href){ return param(href,"tid"); }

/* A Cloudflare managed challenge is a page of its own; never let it look like an empty forum. */
function isChallenge(html){
  return /Just a moment|_cf_chl_opt|cf_chl_|challenge-platform/i.test(String(html==null?"":html));
}

function pick(root,list){
  for(var i=0;i<list.length;i++){
    var el=root.querySelector(list[i]);
    if(el) return el;
  }
  return null;
}
function pickText(root,list){
  for(var i=0;i<list.length;i++){
    var el=root.querySelector(list[i]);
    if(el){ var t=clean(el.textContent); if(t) return t; }
  }
  return "";
}

/* text only: <br> and block elements become newlines; scripts, styles, players and icons are dropped */
function blockText(root){
  var out=[];
  function walk(n){
    if(n.nodeType===3){ out.push(n.nodeValue||""); return; }
    if(n.nodeType!==1) return;
    var tag=(n.nodeName||"").toLowerCase();
    if(tag==="script"||tag==="style"||tag==="iframe"||tag==="object"||tag==="embed"||tag==="video"||tag==="audio") return;
    if(n.hidden) return;
    if(tag==="i" && /(^|\s)pstatus(\s|$)/.test(n.className||"")) return;
    if(tag==="br"){ out.push("\n"); return; }
    if(tag==="img"){ var alt=n.getAttribute("alt"); if(alt) out.push(" "+alt+" "); return; }
    var block=/^(p|div|li|tr|h[1-6]|blockquote|pre|table|tbody|td|th|dd|dt|section|article)$/.test(tag);
    if(block) out.push("\n");
    for(var c=n.firstChild;c;c=c.nextSibling) walk(c);
    if(block) out.push("\n");
  }
  if(root) walk(root);
  return clean(out.join(""));
}

/* ---------- forum index ---------- */
function topicFromRow(row,base){
  var a=pick(row,["th.subject span a","th.common a.xst","th a.xst","a.xst","th a[href*='viewthread']","a[href*='viewthread']"]);
  if(!a) return null;
  var href=a.getAttribute("href")||"";
  var title=clean(a.textContent), url=absURL(href,base);
  if(!title || !url) return null;
  var time=pickText(row,["td.lastpost em a","td.lastpost em"]);
  if(!time){
    /* stock Discuz has two td.by cells: the first is the author, the last is the last reply */
    var bys=row.querySelectorAll("td.by");
    if(bys.length>1) time=pickText(bys[bys.length-1],["em a","em"]);
  }
  return {
    title:title, url:url, tid:tidOf(href)||url,
    author:pickText(row,["td.author cite a","td.author .postinfo a","td.by cite a","cite a"]),
    timestamp:time,
    replies:pickText(row,["td.nums strong","td.num a","td.num"]),
    sticky:/^stickthread_/.test(row.id||"") || !!row.querySelector("img[src*='pin_']")
  };
}
function topicFromAnchor(a,base){
  var href=a.getAttribute("href")||"";
  var title=clean(a.textContent), url=absURL(href,base);
  if(!title || !url) return null;
  var box=a.closest ? a.closest("tr, li") : null;
  return {
    title:title, url:url, tid:tidOf(href)||url,
    author:box?pickText(box,["td.author cite a","td.by cite a","cite a"]):"",
    timestamp:box?pickText(box,["td.lastpost em a","td.lastpost em","em"]):"",
    replies:box?pickText(box,["td.nums strong","td.num a","td.num"]):"",
    sticky:false
  };
}

function parseIndex(doc,pageURL){
  var forums=[], topics=[], seenF={}, seenT={}, i;
  var base=pageURL||BASE+"/";
  if(doc && doc.querySelectorAll){
    var anchors=doc.querySelectorAll("a[href]");
    for(i=0;i<anchors.length;i++){
      var a=anchors[i], href=a.getAttribute("href")||"";
      if(href.indexOf("forumdisplay")<0 && href.indexOf("mod=forumdisplay")<0) continue;
      var fid=fidOf(href), name=clean(a.textContent), url=absURL(href,base);
      if(!fid || !name || name.length>48 || !url || seenF[fid] || /^\d+$/.test(name)) continue;
      seenF[fid]=1; forums.push({fid:fid,name:name,url:url});
      if(forums.length>=MAX_FORUMS) break;
    }
    var rows=doc.querySelectorAll("#threadlisttableid tbody[id], tbody[id^='normalthread_'], tbody[id^='stickthread_'], table#threadlisttableid tbody[id]");
    for(i=0;i<rows.length && topics.length<MAX_TOPICS;i++){
      var t=topicFromRow(rows[i],base);
      if(t && !seenT[t.tid]){ seenT[t.tid]=1; topics.push(t); }
    }
    if(!rows.length){
      var links=doc.querySelectorAll("a.xst, a[href*='viewthread.php?tid='], a[href*='mod=viewthread']");
      for(i=0;i<links.length && topics.length<MAX_TOPICS;i++){
        t=topicFromAnchor(links[i],base);
        if(t && !seenT[t.tid]){ seenT[t.tid]=1; topics.push(t); }
      }
    }
  }
  return {
    forums:forums, topics:topics,
    stats:{forums:forums.length, topics:topics.length, rows:doc&&doc.querySelectorAll?doc.querySelectorAll("tbody[id]").length:0},
    error:(forums.length||topics.length)?"":"no forums or topics"
  };
}

/* ---------- one thread ---------- */
function threadTitle(doc){
  var title="";
  var tt=doc.querySelector("#threadtitle");
  if(tt){
    var h=tt.querySelector("h1")||tt;
    title=clean(h.textContent.replace(/复制链接/g,"").replace(/\[\s*\]/g,""));
  }
  if(!title){
    var nav=doc.querySelector("#nav");
    if(nav){ var parts=clean(nav.textContent).split("»"); title=clean(parts[parts.length-1]||""); }
  }
  if(!title && doc.title) title=clean(doc.title.split(/\s+[-|]\s+/)[0]);
  return title;
}

function postsOf(doc){
  var out=[], list=doc.querySelector("#postlist"), i, j;
  if(list){
    var kids=list.children||[];
    for(i=0;i<kids.length;i++) if(/^post_/.test(kids[i].id||"")) out.push(kids[i]);
  }
  if(!out.length){
    var all=doc.querySelectorAll("div[id^='post_']");
    for(i=0;i<all.length;i++){
      var node=all[i], nested=false;
      for(j=0;j<out.length;j++){ if(out[j].contains && out[j].contains(node)){ nested=true; break; } }
      if(!nested) out.push(node);
    }
  }
  return out;
}

function parseThread(doc,pageURL){
  var title="", posts=[], nodes=[], i;
  if(doc && doc.querySelectorAll){
    title=threadTitle(doc);
    nodes=postsOf(doc);
    for(i=0;i<nodes.length && posts.length<MAX_POSTS;i++){
      var n=nodes[i];
      var contentEl=pick(n,["td.postcontent .postmessage .t_msgfont","td.postcontent .t_msgfont",".t_msgfont",".t_fontsize",".postmessage",".message","td.postcontent"]);
      var content=contentEl?blockText(contentEl):"";
      if(content.length>MAX_POST_CHARS) content=content.slice(0,MAX_POST_CHARS)+"…";
      if(!content) continue;
      posts.push({
        author:pickText(n,["td.postauthor .postinfo a","td.postauthor a",".authi a",".pi-author a","a[href*='space.php?uid=']"]),
        timestamp:pickText(n,["td.postauthor .authorinfo em","td.postauthor .postinfo em","em[id^='authorposton']",".authi em",".dateline"]),
        content:content
      });
    }
  }
  return {
    title:title, url:pageURL||"", posts:posts,
    stats:{found:nodes.length, kept:posts.length},
    truncated:nodes.length>posts.length,
    error:(title||posts.length)?"":"no title or posts"
  };
}

window.LopdaFourm={
  BASE:BASE,
  INDEX_URL:BASE+"/",
  FALLBACK_URL:BASE+"/forum.php",
  absURL:absURL, fidOf:fidOf, tidOf:tidOf,
  cleanText:clean, blockText:blockText, isChallenge:isChallenge,
  parseIndex:parseIndex, parseThread:parseThread
};
})();
