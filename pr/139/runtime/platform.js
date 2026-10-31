/*
 * Lo-PDA platform layer for the standalone PWA.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * The runtime talks to storage and file export only through this object, so the
 * same UI code can later run on a synced backend by swapping this file.
 *
 *   LopdaPlatform.db         a tiny document store on IndexedDB
 *                            doc(path) / collection(path), get / set / update / delete / where
 *   LopdaPlatform.files      a key-value store for large binary data (dictionaries): get / put / del
 *   LopdaPlatform.downloads  save({filename, data}) -> share sheet on phones, download elsewhere;
 *                            saveAll([{filename, data}], label) -> one share sheet with every file
 *   LopdaPlatform.dumpAll()  -> {docs: [{path, data}], files: [{key, value}]}, everything both databases hold
 *   LopdaPlatform.replaceAll({docs, files})  clears both databases and writes these back
 */
(function () {
  "use strict";

  /* ---------------- document store ---------------- */
  /* A GitHub Pages PR preview (/lopda/pr/12/runtime/) shares the origin nowheremanx.github.io with the real
     site, so it gets its own database and never reads or writes the real handheld's data. */
  var PR = typeof location !== "undefined" && /\/pr\/(\d+)\//.exec(location.pathname || "");
  var DB_NAME = PR ? "lopda-pr-" + PR[1] : "lopda", STORE = "docs";
  var opening = null;
  function open() {
    if (opening) return opening;
    opening = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var os = req.result.createObjectStore(STORE, { keyPath: "path" });
        os.createIndex("parent", "parent", { unique: false });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(err("unavailable", req.error)); };
    });
    return opening;
  }
  function err(code, e) { return { code: code, message: String((e && e.message) || e || code) }; }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), os = t.objectStore(STORE), out;
        /* a request that throws at once (a value that cannot be stored) must not let the rest commit */
        try { out = fn(os); } catch (e) { try { t.abort(); } catch (x) {} reject(err("unavailable", e)); return; }
        t.oncomplete = function () { resolve(out && "result" in out ? out.result : undefined); };
        t.onerror = function () { reject(err("unavailable", t.error)); };
        t.onabort = function () { reject(err(t.error && t.error.name === "QuotaExceededError" ? "quota_exceeded" : "unavailable", t.error)); };
      });
    });
  }
  var clone = function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
  function snapDoc(path, rec) {
    var id = path.split("/").pop();
    return { id: id, exists: !!rec, data: function () { return rec ? clone(rec.data) : undefined; } };
  }
  function checkPath(path, wantEven) {
    var n = String(path).split("/").filter(Boolean).length;
    if (!n || (n % 2 === 0) !== wantEven) throw err("invalid_argument", "bad path: " + path);
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function docRef(path) {
    checkPath(path, true);
    var parent = path.slice(0, path.lastIndexOf("/"));
    return {
      id: path.split("/").pop(),
      path: path,
      get: function () { return tx("readonly", function (os) { return os.get(path); }).then(function (rec) { return snapDoc(path, rec); }); },
      set: function (data) {
        var rec = { path: path, parent: parent, data: clone(data) };
        return tx("readwrite", function (os) { return os.put(rec); }).then(function () {});
      },
      update: function (data) {
        return tx("readwrite", function (os) {
          var r = os.get(path);
          r.onsuccess = function () {
            var cur = r.result ? r.result.data : null;
            if (!cur) return;
            Object.keys(data).forEach(function (k) { cur[k] = clone(data[k]); });
            os.put({ path: path, parent: parent, data: cur });
          };
          return r;
        }).then(function () {});
      },
      delete: function () { return tx("readwrite", function (os) { return os.delete(path); }).then(function () {}); },
      collection: function (name) { return collRef(path + "/" + name); }
    };
  }
  function query(path, filters) {
    return {
      where: function (field, op, value) {
        if (op !== "==") throw err("invalid_argument", "only == is supported");
        return query(path, filters.concat([[field, value]]));
      },
      get: function () {
        return tx("readonly", function (os) { return os.index("parent").getAll(path); }).then(function (recs) {
          recs = (recs || []).filter(function (r) { return filters.every(function (f) { return r.data && r.data[f[0]] === f[1]; }); });
          recs.sort(function (a, b) { return a.path < b.path ? -1 : 1; });
          return { docs: recs.map(function (r) { return snapDoc(r.path, r); }), size: recs.length };
        });
      }
    };
  }
  function collRef(path) {
    checkPath(path, false);
    var q = query(path, []);
    q.path = path;
    q.doc = function (id) { return docRef(path + "/" + (id || newId())); };
    return q;
  }
  var db = { doc: docRef, collection: collRef, ready: function () { return open().then(function () { return true; }); } };

  /* ---------------- binary store ----------------
     Dictionaries are megabytes of Blobs and typed arrays, which the document store's JSON copies would break.
     They get their own database, so adding it needs no version upgrade of the documents database. */
  var filesOpening = null;
  function openFiles() {
    if (filesOpening) return filesOpening;
    filesOpening = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME + "-files", 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("files"); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { filesOpening = null; reject(err("unavailable", req.error)); };
    });
    return filesOpening;
  }
  function filesTx(mode, fn) {
    return openFiles().then(function (fdb) {
      return new Promise(function (resolve, reject) {
        var t = fdb.transaction("files", mode), r;
        try { r = fn(t.objectStore("files")); } catch (e) { try { t.abort(); } catch (x) {} reject(err("unavailable", e)); return; }
        t.oncomplete = function () { resolve(r && "result" in r ? r.result : undefined); };
        t.onerror = function () { reject(err("unavailable", t.error)); };
        t.onabort = function () { reject(err(t.error && t.error.name === "QuotaExceededError" ? "quota_exceeded" : "unavailable", t.error)); };
      });
    });
  }
  var files = {
    get: function (key) { return filesTx("readonly", function (os) { return os.get(key); }); },
    put: function (key, value) { return filesTx("readwrite", function (os) { return os.put(value, key); }).then(function () {}); },
    del: function (key) { return filesTx("readwrite", function (os) { return os.delete(key); }).then(function () {}); }
  };

  /* ---------------- whole-device dump and load (the backup in Settings) ----------------
     One transaction per database: a dump reads every document, or every file, at one moment; a load clears a store and
     writes it back in the same transaction, so each database is either all old or all new. The two databases cannot share
     a transaction; when the second one fails, the caller writes its own copy of the old data back (apps/settings.js). */
  function dumpAll() {
    var docs = tx("readonly", function (os) { return os.getAll(); }).then(function (recs) {
      return (recs || []).map(function (r) { return { path: r.path, data: r.data }; });
    });
    var fl = filesTx("readonly", function (os) {
      var keys = os.getAllKeys(), vals = os.getAll();
      return { get result() { return (keys.result || []).map(function (k, i) { return { key: k, value: vals.result[i] }; }); } };
    });
    return Promise.all([docs, fl]).then(function (r) { return { docs: r[0], files: r[1] }; });
  }
  function replaceAll(all) {
    var docs = (all && all.docs) || [], fl = (all && all.files) || [];
    try { docs.forEach(function (d) { checkPath(d.path, true); }); } catch (e) { return Promise.reject(e); }
    return tx("readwrite", function (os) {
      os.clear();
      docs.forEach(function (d) { os.put({ path: d.path, parent: d.path.slice(0, d.path.lastIndexOf("/")), data: d.data }); });
    }).then(function () {
      return filesTx("readwrite", function (os) {
        os.clear();
        fl.forEach(function (f) { os.put(f.value, f.key); });
      });
    }).then(function () {});
  }

  /* ---------------- file export ---------------- */
  var MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain", md: "text/markdown", zip: "application/zip", json: "application/json", html: "text/html" };
  function toFile(req) {
    var ext = (req.filename.split(".").pop() || "").toLowerCase(), type = MIME[ext] || "application/octet-stream";
    var blob = req.data instanceof Blob ? req.data : new Blob([req.data], { type: type });
    try { return new File([blob], req.filename, { type: type }); } catch (e) { blob.name = req.filename; return blob; }
  }
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  function download(file) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    return Promise.resolve({ status: "saved" });
  }
  function share(files) {
    /* files only: with a title as well, iOS "Save to Files" saves the title as a text file next to the file */
    return navigator.share({ files: files }).then(function () { return { status: "saved" }; });
  }
  /* Safari only allows share() during a tap. When the file took a moment to build, the tap is
     gone, so we show a one-tap "save" button and share from that tap instead. */
  function askForTap(files, label) {
    return new Promise(function (resolve, reject) {
      var box = document.createElement("div");
      box.className = "save-sheet";
      box.innerHTML = '<p></p><div class="row"><button class="btn" type="button"></button><button class="btn ghost" type="button"></button></div>';
      var t = window.LopdaStrings ? window.LopdaStrings.t : function (k) { return k; };
      box.querySelector("p").textContent = label || t("common.ready", { name: files[0].name });
      var btns = box.querySelectorAll("button");
      btns[0].textContent = t("common.save"); btns[1].textContent = t("common.cancel");
      btns[0].onclick = function () { box.remove(); share(files).then(resolve, function (e) { reject(err(e && e.name === "AbortError" ? "declined" : "unavailable", e)); }); };
      btns[1].onclick = function () { box.remove(); reject(err("declined")); };
      (document.getElementById("screen") || document.body).appendChild(box);
    });
  }
  /* one click per file; a breath apart, so a browser does not read the whole run as a pop-up */
  function downloadAll(files) {
    return files.reduce(function (pr, file, i) {
      return pr.then(function () {
        return new Promise(function (resolve) { if (i) setTimeout(resolve, 150); else resolve(); }).then(function () { return download(file); });
      });
    }, Promise.resolve()).then(function () { return { status: "saved" }; });
  }
  var downloads = {
    save: function (req) {
      if (!req || typeof req.filename !== "string" || req.data == null) return Promise.reject(err("bad_request"));
      var file = toFile(req);
      var canShare = coarse && navigator.canShare && navigator.share && navigator.canShare({ files: [file] });
      if (!canShare) return download(file);
      return share([file]).catch(function (e) {
        if (e && e.name === "AbortError") throw err("declined", e);
        if (e && e.name === "NotAllowedError") return askForTap([file]);
        throw err("unavailable", e);
      });
    },
    /* a batch (the darkroom's all singles) goes to the share sheet in one go, so iOS can save every
       picture at once; where that is not there, each file downloads on its own */
    saveAll: function (reqs, label) {
      if (!Array.isArray(reqs) || !reqs.length) return Promise.reject(err("bad_request"));
      var files = [];
      for (var i = 0; i < reqs.length; i++) {
        var req = reqs[i];
        if (!req || typeof req.filename !== "string" || req.data == null) return Promise.reject(err("bad_request"));
        files.push(toFile(req));
      }
      var canShare = coarse && navigator.canShare && navigator.share && navigator.canShare({ files: files });
      if (!canShare) return downloadAll(files);
      return share(files).catch(function (e) {
        if (e && e.name === "AbortError") throw err("declined", e);
        if (e && e.name === "NotAllowedError") return askForTap(files, label);
        throw err("unavailable", e);
      });
    }
  };

  /* ---------------- persistence hint ---------------- */
  function persist() {
    try { if (navigator.storage && navigator.storage.persist) return navigator.storage.persist(); } catch (e) {}
    return Promise.resolve(false);
  }

  window.LopdaPlatform = { db: db, files: files, downloads: downloads, persist: persist, dumpAll: dumpAll, replaceAll: replaceAll, user: { id: function () { return Promise.resolve("local"); } } };
})();
