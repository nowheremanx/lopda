/*
 * Lo-PDA runtime: the shape of an app's save document (data/users/local/appdata/items/<id>).
 * Pure functions only: the store reads and writes the documents, Settings lists them, and the tests
 * feed this file old and damaged records without a browser.
 *
 * A save document is {v:1, kv, schema?, updated?, bytes?, app?}. Older runtimes wrote {kv} only, and
 * that is still read. v is the document format (the platform's); schema is the app's own data version.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var FORMAT=1;
var MAX_SCHEMA=1000000000;

function isPlain(v){ return !!v && typeof v==="object" && !Array.isArray(v); }
function size(kv){
  try { var s=JSON.stringify(kv); return s ? s.length : 0; } catch(e){ return 0; }
}
function validSchema(n){
  return typeof n==="number" && isFinite(n) && n>=0 && n<=MAX_SCHEMA ? Math.floor(n) : null;
}
/* what survives of an installed app in the save: enough to name it after the app is gone */
function appInfo(a){
  if(!isPlain(a)) return null;
  var o={};
  if(typeof a.id==="string" && a.id) o.id=a.id;
  if(typeof a.name==="string" && a.name) o.name=a.name;
  if(isPlain(a.i18n)){
    var i18n={}, n=0;
    Object.keys(a.i18n).forEach(function(l){
      var e=a.i18n[l];
      if(isPlain(e) && typeof e.name==="string" && e.name){ i18n[l]={name:e.name}; n++; }
    });
    if(n) o.i18n=i18n;
  }
  if(typeof a.version==="string" && a.version) o.version=a.version;
  if(typeof a.author==="string" && a.author) o.author=a.author;
  return Object.keys(o).length ? o : null;
}
/* read a document: code is null, "corrupt" (the bytes cannot be a save) or "newer" (a format this
   runtime does not know). A missing kv on an old document is an empty save, not damage. */
function read(data, appId){
  var out={v:FORMAT, kv:{}, schema:null, updated:0, bytes:0, app:null, code:null, loaded:true};
  if(!isPlain(data)){ out.code="corrupt"; return out; }
  if(typeof data.v==="number" && data.v>FORMAT){ out.code="newer"; return out; }
  if(data.kv!=null && !isPlain(data.kv)){ out.code="corrupt"; return out; }
  out.kv=data.kv||{};
  out.bytes=typeof data.bytes==="number" && data.bytes>=0 ? data.bytes : size(out.kv);
  out.updated=typeof data.updated==="number" && data.updated>=0 ? data.updated : 0;
  out.schema=validSchema(data.schema);
  out.app=isPlain(data.app) ? data.app : null;
  if(!out.app && appId) out.app={id:appId};
  return out;
}
/* a document to write: the save data, its app schema, its size and a snapshot of the app's name */
function record(appId, kv, meta, app, now){
  var m=meta||{};
  var rec={v:FORMAT, kv:kv, updated:now||Date.now(), bytes:size(kv)};
  var schema=validSchema(m.schema);
  if(schema!=null) rec.schema=schema;
  var info=appInfo(app) || appInfo(m.app);
  if(info) rec.app=info;
  else if(appId) rec.app={id:appId};
  return rec;
}
/* the metadata PAD.saveInfo answers with */
function info(rec){
  return {
    schema: rec && rec.schema!=null ? rec.schema : null,
    version: rec && rec.app && typeof rec.app.version==="string" ? rec.app.version : null,
    updated: rec && rec.updated ? rec.updated : 0,
    bytes: rec && rec.bytes!=null ? rec.bytes : 0
  };
}
function error(code){
  var e=new Error(String(code||"readfail"));
  e.code=String(code||"readfail");
  return e;
}

window.LopdaAppSaves={FORMAT:FORMAT, MAX_SCHEMA:MAX_SCHEMA, size:size, validSchema:validSchema, read:read, record:record, info:info, appInfo:appInfo, error:error};
})();
