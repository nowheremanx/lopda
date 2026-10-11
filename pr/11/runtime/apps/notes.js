/*
 * Lo-PDA built-in: notes. A list and an editor; every note saves itself.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr;
var put=LP.put, uid=LP.uid, toast=LP.toast, fmt=LP.fmt, show=LP.show, upsert=LP.upsert, dropLocal=LP.dropLocal, pending=LP.pending;

function renderNotes(){
  var ul=$("notes-list"); ul.textContent="";
  var list=S.notes.slice().sort(function(a,b){ return (b.updated||0)-(a.updated||0); });
  if(!list.length){ var li=document.createElement("li"); li.className="empty"; li.textContent=tr(S.db?"notes.empty":"notes.emptynodb"); ul.appendChild(li); return; }
  list.forEach(function(n){
    var li=document.createElement("li"), b=document.createElement("button"); b.type="button";
    var t=document.createElement("span"); t.className="t"; t.textContent=(n.body||"").split("\n")[0].trim()||tr("notes.blank");
    var d=document.createElement("span"); d.className="d"; d.textContent=fmt(n.updated);
    b.appendChild(t); b.appendChild(d); b.onclick=function(){ openNote(n); };
    li.appendChild(b); ul.appendChild(li);
  });
}
$("note-new").onclick=function(){
  var id=S.db?S.refs.notes.doc().id:uid();
  openNote({id:id, body:"", updated:Date.now(), fresh:true});
};
function openNote(n){
  S.editing={id:n.id, body:n.body||"", fresh:!!n.fresh};
  $("note-body").value=S.editing.body;
  $("note-state").textContent=tr(n.fresh?"notes.fresh":"notes.saved");
  LP.resetConfirm("note-del-wrap","note-del",tr("common.delete"),function(){ if(S.editing){ deleteNote(S.editing.id); show("notes"); } });
  show("note"); $("note-body").focus();
}
var noteTimer;
$("note-body").addEventListener("input",function(){
  if(!S.editing) return;
  S.editing.body=$("note-body").value; S.editing.dirty=true;
  $("note-state").textContent=tr("notes.editing");
  clearTimeout(noteTimer); noteTimer=setTimeout(flushNote,700);
});
function flushNote(){
  clearTimeout(noteTimer);
  var e=S.editing; if(!e || !e.dirty) return;
  e.dirty=false;
  var doc={body:e.body, updated:Date.now()};
  upsert("notes",{id:e.id, body:doc.body, updated:doc.updated});
  if(!S.db){ $("note-state").textContent=tr("notes.savedtemp"); return; }
  pending.notes[e.id]=true;
  $("note-state").textContent=tr("common.saving");
  put(S.refs.notes.doc(e.id),doc).then(function(ok){
    if(ok) delete pending.notes[e.id];
    if(S.editing===e) $("note-state").textContent=tr(ok?"notes.saved":"notes.savefail");
    if(!ok) e.dirty=true;
  });
}
function deleteNote(id){
  S.editing=null;
  dropLocal("notes",id);
  if(S.db) S.refs.notes.doc(id).delete().catch(function(){ toast(tr("notes.delfail")); });
}
$("note-back").onclick=function(){ flushNote(); S.editing=null; show("notes"); };

LP.flushNote=flushNote;
LP.onData("notes",function(){ if(!$("v-notes").hidden) renderNotes(); });
LP.builtin({id:"notes", label:"app.notes", icon:"notes", view:"notes",
  open:function(){ show("notes"); },
  enter:function(){ renderNotes(); LP.refresh("notes"); }});
})();
