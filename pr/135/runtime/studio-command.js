/*
 * Lo-PDA runtime: the tape machine's local quick commands (docs/design/studio.md section 12.16). The phrases that do
 * not need a model - faster, slower, more swing, a track louder or muted, a pattern copied, a track cleared - become the
 * same operations the AI returns. This is what makes the assistant useful with no key, and keeps the common cases fast.
 *
 *   LopdaStudioCommand.parse(text, focus) -> {ops:[...], note:"swing-global"} | null
 *
 * `focus` is {pattern, screen}: a command with no pattern letter ("clear the bass") applies to the pattern being edited.
 * Pure, no DOM; the edit module turns the operations into a song.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var LETTERS="ABCDEFGHIJKLMNOP";
var KEYS={c:0,"c#":1,db:1,d:2,"d#":3,eb:3,e:4,f:5,"f#":6,gb:6,g:7,"g#":8,ab:8,a:9,"a#":10,bb:10,b:11};

function trackOf(s){
  if(/鼓|drum|kick|beat/.test(s)) return "drums";
  if(/贝斯|bass/.test(s)) return "bass";
  if(/和弦|chord|keys|电钢|钢琴/.test(s)) return "chords";
  if(/旋律|melody|lead|flute|口哨|长笛/.test(s)) return "melody";
  return null;
}
function letterIndex(c){ return "abcdefghijklmnop".indexOf(String(c||"").toLowerCase()); }
function validLetter(c){ return letterIndex(c)>=0; }
function patternOf(s,focus){
  var m=/(?:^|[^a-z])([a-p])\s*(?:段|pattern)/i.exec(s);
  if(m) return letterIndex(m[1]);
  m=/(?:pattern|第)\s*([a-p])\b/i.exec(s);
  if(m) return letterIndex(m[1]);
  return focus && typeof focus.pattern==="number" ? focus.pattern : 0;
}

function parse(text,focus){
  var s=String(text==null?"":text).toLowerCase().replace(/\s+/g," ").trim();
  if(!s) return null;
  var ops=[], note="", m, tr;

  /* per-section asks are for the model: the local parser only knows whole-song moves. A named pattern is still fine for
     clear/copy and for tempo/swing; it is not fine for a track volume/mute, which the local language would apply to every
     bar. */
  if(/副歌|主歌|桥段|前奏|尾奏|verse|chorus|bridge|intro|outro/.test(s)) return null;
  if(/(?:[a-p]\s*段|pattern\s*[a-p])/.test(s) && !/清空|清掉|去掉|clear|复制|拷贝|copy|摇摆|swing/.test(s)) return null;

  /* a pattern copy is unambiguous and should win over the letter handling below */
  m=/([a-p])\s*(?:段)?\s*(?:复制|拷贝|copy)\s*(?:到|to)\s*([a-p])/i.exec(s) ||
    /(?:把|将)\s*([a-p])\s*(?:段)?\s*(?:复制|拷贝|copy)\s*(?:到|to)\s*([a-p])/i.exec(s);
  if(m && validLetter(m[1]) && validLetter(m[2])){
    ops.push({op:"copyPattern",from:letterIndex(m[1]),to:letterIndex(m[2])});
  }

  /* clear a track, optionally in a named pattern */
  if(/清空|清掉|去掉|clear|empty/.test(s)){
    tr=trackOf(s);
    if(tr) ops.push({op:"clearTrack",pattern:patternOf(s,focus),track:tr});
  }

  /* mute before volume: "静音贝斯" must not become a volume move */
  tr=trackOf(s);
  if(tr){
    if(/取消静音|取消静默|unmute|打开/.test(s)) ops.push({op:"setTrackMute",track:tr,mute:false});
    else if(/静音|静默|mute|关掉/.test(s)) ops.push({op:"setTrackMute",track:tr,mute:true});
    else if(/大声|响一点|大一点|louder|louder|up/.test(s)) ops.push({op:"trackVol",track:tr,delta:0.1});
    else if(/小声|轻一点|小一点|quiet|softer|down/.test(s)) ops.push({op:"trackVol",track:tr,delta:-0.1});
  }

  /* tempo */
  m=/(\d{2,3})\s*(?:bpm|拍)/.exec(s) || /bpm\s*(\d{2,3})/.exec(s);
  if(m) ops.push({op:"setBpm",value:Number(m[1])});
  else if(/更快|快一点|加快|再快|faster|speed up/.test(s)) ops.push({op:"bpm",delta:4});
  else if(/更慢|慢一点|减慢|再慢|slower|slow down/.test(s)) ops.push({op:"bpm",delta:-4});

  /* swing */
  if(/更摇摆|摇摆一点|多点摇摆|多些摇摆|more swing/.test(s)) ops.push({op:"swing",delta:0.02});
  else if(/少点摇摆|少些摇摆|直一点|不要太摇摆|less swing|straight/.test(s)) ops.push({op:"swing",delta:-0.02});
  if(/摇摆|swing/.test(s) && (/[a-p]\s*段/i.test(s) || /pattern\s*[a-p]/i.test(s))) note="swing-global";

  /* tape colour */
  if(/磁带味重|更旧|更脏|more tape|muffled/.test(s)) ops.push({op:"tape",delta:1});
  else if(/干净|清晰|less tape|clean/.test(s)) ops.push({op:"tape",delta:-1});

  /* key and scale: "C 大调", "A minor" */
  m=/\b([a-g])(#|b)?\s*(大调|小调|major|minor)/.exec(s);
  if(m){
    var key=KEYS[m[1]+(m[2]||"")];
    if(typeof key==="number") ops.push({op:"setKey",value:key});
    if(/小调|minor/.test(m[3])) ops.push({op:"setScale",value:/五声/.test(s)?"minor-penta":"minor"});
    else ops.push({op:"setScale",value:/五声/.test(s)?"major-penta":"major"});
  } else if(/多利亚|dorian/.test(s)){
    ops.push({op:"setScale",value:"dorian"});
  } else if(/五声/.test(s)){
    ops.push({op:"setScale",value:/小调|minor/.test(s)?"minor-penta":"major-penta"});
  } else if(/小调|minor/.test(s)){
    ops.push({op:"setScale",value:"minor"});
  } else if(/大调|major/.test(s)){
    ops.push({op:"setScale",value:"major"});
  }

  if(!ops.length) return null;
  return {ops:ops, note:note};
}

window.LopdaStudioCommand={parse:parse, trackOf:trackOf, patternOf:patternOf};
})();
