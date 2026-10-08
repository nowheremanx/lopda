/*
 * Lo-PDA platform layer for the standalone PWA.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * The runtime talks to storage and file export only through this object, so the
 * same UI code can later run on a synced backend by swapping this file.
 *
 *   LopdaPlatform.db         a tiny document store on IndexedDB
 *                            doc(path) / collection(path), get / set / update / delete / where
 *   LopdaPlatform.downloads  save({filename, data}) -> share sheet on phones, download elsewhere
 */
(function () {
  "use strict";

  /* ---------------- document store ---------------- */
  var DB_NAME = "lopda", STORE = "docs";
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
        out = fn(os);
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

  /* ---------------- file export ---------------- */
  var MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain", json: "application/json", html: "text/html" };
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
  function share(file) {
    return navigator.share({ files: [file], title: file.name }).then(function () { return { status: "saved" }; });
  }
  /* Safari only allows share() during a tap. When the file took a moment to build, the tap is
     gone, so we show a one-tap "save" button and share from that tap instead. */
  function askForTap(file) {
    return new Promise(function (resolve, reject) {
      var box = document.createElement("div");
      box.className = "save-sheet";
      box.innerHTML = '<p></p><div class="row"><button class="btn" type="button">保存</button><button class="btn ghost" type="button">取消</button></div>';
      box.querySelector("p").textContent = file.name + " 已准备好。";
      var btns = box.querySelectorAll("button");
      btns[0].onclick = function () { box.remove(); share(file).then(resolve, function (e) { reject(err(e && e.name === "AbortError" ? "declined" : "unavailable", e)); }); };
      btns[1].onclick = function () { box.remove(); reject(err("declined")); };
      (document.getElementById("screen") || document.body).appendChild(box);
    });
  }
  var downloads = {
    save: function (req) {
      if (!req || typeof req.filename !== "string" || req.data == null) return Promise.reject(err("bad_request"));
      var file = toFile(req);
      var canShare = coarse && navigator.canShare && navigator.share && navigator.canShare({ files: [file] });
      if (!canShare) return download(file);
      return share(file).catch(function (e) {
        if (e && e.name === "AbortError") throw err("declined", e);
        if (e && e.name === "NotAllowedError") return askForTap(file);
        throw err("unavailable", e);
      });
    }
  };

  /* ---------------- persistence hint ---------------- */
  function persist() {
    try { if (navigator.storage && navigator.storage.persist) return navigator.storage.persist(); } catch (e) {}
    return Promise.resolve(false);
  }

  window.LopdaPlatform = { db: db, downloads: downloads, persist: persist, user: { id: function () { return Promise.resolve("local"); } } };
})();
