/*
 * Lo-PDA runtime: the order of the home screen's tiles (data/users/local/home-order, decisions.md section 71).
 * Pure functions only: core.js reads and writes the document and draws the tiles, the tests feed this file
 * old, damaged and partial orders without a browser.
 *
 * The document is {v:1, order:[key, ...]}. It is not data/users/local/home: that path is the home tile API's draft
 * (docs/design/home-api.md), kept free for it. A key is "b:<id>" for a built-in and "a:<id>" for an installed app,
 * so an app whose id matches a built-in's never takes its place. Once stored, the order only grows at the end:
 * a new built-in (a runtime update) and a new install go last, an uninstalled app takes only its own tile away,
 * and nothing moves on its own. A phone with no document yet (first start, or an update from before 1.5.0) gets
 * DEFAULT once: the programs used every day first, the experimental and the tools last.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var FORMAT=1;
/* three to a row on the smallest screen: notes, calendar, pet / camera, darkroom, reader / dictionary, tuner, Tape4 /
   cartridge, radio, scripts / store, settings, calculator; then paint and the apps the player installed */
var DEFAULT=["b:notes","b:calendar","b:pet","b:camera","b:darkroom","b:reader","b:dict","b:tuner","b:studio",
             "b:cart","b:radio","b:scripts","b:store","b:settings","a:calculator","a:paint"];
var MAX_KEYS=2000;   /* far above any real phone; a damaged document cannot make the home screen loop for long */

function bkey(id){ return "b:"+id; }
function akey(id){ return "a:"+id; }
/* the apps the stored order has never seen go last: preinstalled ones in their list order, then by install time */
function appSort(a,b){
  var pa=a.preinstalled>0 ? a.preinstalled : Infinity, pb=b.preinstalled>0 ? b.preinstalled : Infinity;
  return (pa-pb) || ((a.installed||0)-(b.installed||0));
}
/* the stored order, or null when the document is missing or not one this runtime can read */
function read(doc){
  if(!doc || typeof doc!=="object" || !Array.isArray(doc.order)) return null;
  var seen={}, out=[];
  doc.order.slice(0,MAX_KEYS).forEach(function(k){
    if(typeof k==="string" && /^[ab]:./.test(k) && !seen[k]){ seen[k]=true; out.push(k); }
  });
  return out;
}
/* The tiles in order. builtins: ids of the built-ins that have a tile, in registration order; apps: the installed
   apps ({id, preinstalled?, installed?}); stored: read(doc), or null. appsKnown: the installed apps have been read
   from storage, so a stored app key with no app behind it was uninstalled and may be dropped; before that read it
   is kept, only not drawn.
   Returns {keys, order, changed}: keys = what to draw, order = what to store, changed = order differs from stored. */
function arrange(stored, builtins, apps, appsKnown){
  var have={};
  builtins.forEach(function(id){ have[bkey(id)]=true; });
  apps.forEach(function(a){ have[akey(a.id)]=true; });
  var base=stored || DEFAULT, order=[], seen={};
  base.forEach(function(k){
    if(seen[k]) return;
    /* Kept without a tile behind it: every key of DEFAULT (paint and the calculator install a moment after the
       first start, maybe after an app a link installed, and take their own places then; removed and installed
       again, they come back there); a built-in key (an older runtime opened from a stale cache must not throw away
       the place of a program a newer one has); an app key while the apps are not read yet. */
    var keep = have[k] || k.charAt(0)==="b" || !appsKnown || DEFAULT.indexOf(k)>=0;
    if(keep){ seen[k]=true; order.push(k); }
  });
  builtins.forEach(function(id){ var k=bkey(id); if(!seen[k]){ seen[k]=true; order.push(k); } });
  apps.slice().sort(appSort).forEach(function(a){ var k=akey(a.id); if(!seen[k]){ seen[k]=true; order.push(k); } });
  var keys=order.filter(function(k){ return have[k]; });
  var changed=!stored || stored.length!==order.length || stored.some(function(k,i){ return k!==order[i]; });
  return {keys:keys, order:order, changed:changed};
}
/* a document written by a newer runtime (a stale cache opened the phone, or a newer backup was restored into this
   one): its order is still drawn, but this runtime never writes over it */
function newer(doc){ return !!doc && typeof doc==="object" && typeof doc.v==="number" && doc.v>FORMAT; }
function doc(order){ return {v:FORMAT, order:order.slice()}; }

window.LopdaHomeOrder={FORMAT:FORMAT, DEFAULT:DEFAULT, bkey:bkey, akey:akey, read:read, newer:newer, arrange:arrange, doc:doc};
})();
