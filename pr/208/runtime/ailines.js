/*
 * Lo-PDA runtime: the AI lines (decisions.md section 61), like a phone's SIM cards. Several keys, each for one provider in
 * ai.js's fixed table, each on or off; one default line, and four programs that may each be sent down a line of their own.
 * Pure functions over a plain state object, no DOM, no LP and no storage: settings.js reads and writes the document
 * `data/users/local/ai` and hands it here; tests/ailines.test.mjs runs them in Node.
 *
 * The document, v:2:
 *   {v:2, next, lines:[{id, provider, n, key, model, visionModel, on, added, last?}], def,
 *    use:{scripts|studio|score|pet: {line, model}}, key, model, scoreModel}
 * - model is what the line writes with, visionModel what it reads pictures with (Tape4's score reading); "" means the
 *   provider's default (on OpenRouter the score-model default, Sol).
 * - use entries only pick a line. use.score.model is kept only while no OpenRouter line exists to take an old score model.
 * - id is "l" + next, never reused after a delete, so a use entry cannot end up on a new line by accident.
 * - n numbers the lines of one provider ("DeepSeek", "DeepSeek 2"), fixed when the line is added.
 * - key / model / scoreModel at the top mirror the first OpenRouter line that is on: a phone still running an older cached
 *   runtime reads only those (v:1) and keeps working.
 * - A v:1 document {key, model, scoreModel} becomes line l1 on OpenRouter. Nothing here ever drops a line it does not
 *   understand (an unknown provider stays, unusable); a document from a newer Lo-PDA (v > 2) is not read at all.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var USES=["scripts","studio","score","pet"];

function str(x){ return typeof x==="string" ? x : ""; }
function copy(o){ var r={}, k; for(k in o) if(Object.prototype.hasOwnProperty.call(o,k)) r[k]=o[k]; return r; }
function empty(){ return {lines:[], def:"", use:{}, next:1, newer:false}; }
function num(id){ var m=/^l(\d+)$/.exec(id); return m ? +m[1] : 0; }
function find(st,id){ for(var i=0;i<st.lines.length;i++) if(st.lines[i].id===id) return st.lines[i]; return null; }
function prov(providers,id){ for(var i=0;i<providers.length;i++) if(providers[i].id===id) return providers[i]; return null; }

/* the document as read (null when there is none) -> the state. Never throws. */
function load(doc){
  var st=empty();
  if(!doc || typeof doc!=="object" || Array.isArray(doc)) return st;
  if(typeof doc.v==="number" && doc.v>2){ st.newer=true; return st; }
  if(doc.v===2 || Array.isArray(doc.lines)){
    var seen={}, top=0;
    (Array.isArray(doc.lines) ? doc.lines : []).forEach(function(l){
      if(!l || typeof l!=="object" || typeof l.id!=="string" || !l.id || seen[l.id] || typeof l.provider!=="string") return;
      /* every field the line has is kept, the ones we use are made sane */
      var c=copy(l);
      c.key=str(l.key); c.model=str(l.model); c.visionModel=str(l.visionModel); c.on=l.on!==false; c.n=+l.n>0 ? Math.floor(+l.n) : 1;
      seen[c.id]=true; top=Math.max(top,num(c.id));
      st.lines.push(c);
    });
    st.next=Math.max(+doc.next>0 ? Math.floor(+doc.next) : 1, top+1);
    st.def=str(doc.def);
    var u=doc.use && typeof doc.use==="object" ? doc.use : {};
    for(var k in u) if(Object.prototype.hasOwnProperty.call(u,k) && u[k] && typeof u[k]==="object")
      st.use[k]={line:str(u[k].line), model:str(u[k].model)};
    adoptScoreModel(st);
    fixDef(st);
    return st;
  }
  /* v:1 (or no v at all): one OpenRouter key, its model and Tape4's score model */
  var key=str(doc.key), model=str(doc.model), score=str(doc.scoreModel);
  if(key){
    st.lines.push({id:"l1", provider:"openrouter", n:1, key:key, model:model, visionModel:score, on:true, added:0});
    st.next=2; st.def="l1";
  } else if(score) st.use.score={line:"", model:score};
  return st;
}

/* An old score model (v:1 scoreModel, or an earlier v:2 use.score.model) belongs to an OpenRouter line's visionModel:
   the line the score use names, else the first OpenRouter line. Without one it waits in use.score.model. */
function adoptScoreModel(st){
  var u=st.use.score, l, i;
  if(!u || !u.model) return;
  l=u.line ? find(st,u.line) : null;
  if(!l) for(i=0;i<st.lines.length;i++) if(st.lines[i].provider==="openrouter"){ l=st.lines[i]; break; }
  if(!l || l.provider!=="openrouter") return;
  if(!l.visionModel) l.visionModel=u.model;
  u.model="";
  if(!u.line) delete st.use.score;
}

/* the state -> the document to write (with the v:1 mirror fields) */
function toDoc(st){
  var mirror=null;
  st.lines.forEach(function(l){ if(!mirror && l.on && l.provider==="openrouter" && l.key) mirror=l; });
  var use={}, k;
  for(k in st.use) use[k]={line:st.use[k].line, model:st.use[k].model};
  return {v:2, next:st.next, lines:st.lines.map(copy), def:st.def, use:use,
    key:mirror ? mirror.key : "", model:mirror ? mirror.model : "",
    scoreModel:mirror ? mirror.visionModel || "" : ""};
}

/* a line can carry requests: on, with a key, for a provider in the table (and one that can see, when asked) */
function usable(l,providers,vision){
  var p=l && prov(providers,l.provider);
  return !!(p && l.on && l.key && (!vision || p.vision));
}
/* the default is a line that is on; when it is turned off or deleted, the first line that is on takes over */
function fixDef(st){
  var d=find(st,st.def);
  if(d && d.on) return;
  st.def="";
  for(var i=0;i<st.lines.length;i++) if(st.lines[i].on){ st.def=st.lines[i].id; return; }
}

/* the line a program's requests go down: its own choice if usable, else the default, else the first usable line.
   "score" (Tape4 reading a photo of a score) needs a line that can see. */
function pick(st,use,providers){
  var vision=use==="score", u=st.use[use], l, i;
  if(u && u.line && usable(l=find(st,u.line),providers,vision)) return l;
  if(usable(l=find(st,st.def),providers,vision)) return l;
  for(i=0;i<st.lines.length;i++) if(usable(st.lines[i],providers,vision)) return st.lines[i];
  return null;
}
/* the model for that program on that line ("" lets ai.js use the provider's default). Reading a score uses the line's
   visionModel, else the provider's vision model (on OpenRouter scoreDefault, Tape4's default score model). */
function modelFor(st,use,line,providers,scoreDefault){
  var p=prov(providers,line.provider);
  if(use==="score"){
    if(line.visionModel) return line.visionModel;
    if(line.provider==="openrouter") return scoreDefault || "";
    return p && p.visionModel || line.model;
  }
  return line.model;
}
/* what a line is called: the provider's name, then 2, 3... for the second and third key of the same provider */
function name(line,providers,lang){
  var p=prov(providers,line.provider), base=p ? (p.name[lang] || p.name.en) : line.provider;
  return line.n>1 ? base+" "+line.n : base;
}

/* ---- changes; each returns the line touched (or true) and edits st in place ---- */
function add(st,provider,key,model,now,visionModel){
  var n=0;
  st.lines.forEach(function(l){ if(l.provider===provider) n=Math.max(n,l.n); });
  var l={id:"l"+st.next, provider:provider, n:n+1, key:str(key), model:str(model), visionModel:str(visionModel), on:true, added:now||0};
  st.next++; st.lines.push(l);
  adoptScoreModel(st);
  fixDef(st);
  return l;
}
/* an empty key keeps the old one; visionModel undefined leaves it as it is */
function edit(st,id,key,model,visionModel){
  var l=find(st,id); if(!l) return null;
  if(key) l.key=key;
  l.model=str(model);
  if(visionModel!==undefined) l.visionModel=str(visionModel);
  return l;
}
/* turning a line off keeps its key */
function setOn(st,id,on){
  var l=find(st,id); if(!l) return null;
  l.on=!!on;
  if(on && !find(st,st.def)) st.def=id;
  fixDef(st);
  return l;
}
/* deleting a line drops its key, its models and every use entry that named it */
function remove(st,id){
  var i, k;
  for(i=0;i<st.lines.length;i++) if(st.lines[i].id===id){ st.lines.splice(i,1); break; }
  for(k in st.use) if(st.use[k].line===id){
    if(st.use[k].model) st.use[k].line=""; else delete st.use[k];
  }
  fixDef(st);
  return true;
}
function setDef(st,id){ var l=find(st,id); if(!l || !l.on) return null; st.def=id; return l; }
/* line "" means "follow the default" */
function choose(st,use,id){
  var u=st.use[use], model=u ? u.model : "";
  if(id) st.use[use]={line:id, model:model};
  else if(model) st.use[use]={line:"", model:model};
  else delete st.use[use];
  return true;
}
function setLast(st,id,last){ var l=find(st,id); if(!l) return null; l.last=last; return l; }
/* lines that are on, in order */
function onLines(st){ return st.lines.filter(function(l){ return l.on; }); }

window.LopdaAiLines={USES:USES, load:load, toDoc:toDoc, pick:pick, modelFor:modelFor, name:name, usable:usable, find:find,
  add:add, edit:edit, setOn:setOn, remove:remove, setDef:setDef, choose:choose, setLast:setLast, onLines:onLines};
})();
