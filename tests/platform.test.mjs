// runtime/platform.js: the document store over a small in-memory IndexedDB, and file export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

/* Just enough IndexedDB for platform.js: one store with a keyPath and one non-unique index.
   Requests settle asynchronously; a transaction completes once no request is left, so a put
   queued from a get's onsuccess (doc.update) lands in the same transaction, as in a browser. */
function fakeIndexedDB(opts = {}) {
  const dbs = {};
  const later = (fn) => setTimeout(fn, 0);
  const idb = {
    opened: 0,
    open(name, version) {
      idb.opened++;
      const req = {};
      later(() => {
        if (opts.broken) { req.error = new Error("blocked"); return req.onerror && req.onerror(); }
        const fresh = !dbs[name], stores = (dbs[name] ||= {});
        const db = {
          createObjectStore(sname, { keyPath } = {}) {
            const s = { keyPath, rows: new Map(), indexes: {} };
            stores[sname] = s;
            return { createIndex(iname, field) { s.indexes[iname] = field; } };
          },
          transaction(sname, mode) { return transaction(stores[sname], mode); },
        };
        req.result = db;
        if (fresh && req.onupgradeneeded) req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
  };
  /* a failed or aborted transaction leaves the store as it was before the transaction, as in a browser */
  function transaction(s, mode) {
    let pending = 0, failed = null, done = false;
    const before = new Map(s.rows), t = {};
    const finish = (fn) => { if (done) return; done = true; fn(); };
    const settle = () => later(() => {
      if (pending || done) return;
      if (failed) finish(() => { s.rows = before; t.error = failed; t.onabort && t.onabort(); });
      else finish(() => t.oncomplete && t.oncomplete());
    });
    t.abort = () => { if (!failed) failed = Object.assign(new Error("aborted"), { name: "AbortError" }); settle(); };
    const request = (fn) => {
      const r = {}; pending++;
      later(() => {
        if (!failed) try { r.result = fn(); r.onsuccess && r.onsuccess(); } catch (e) { failed = e; }
        pending--; settle();
      });
      return r;
    };
    const write = () => { if (mode !== "readwrite") throw Object.assign(new Error("read only"), { name: "ReadOnlyError" }); };
    const sorted = () => [...s.rows.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    t.objectStore = () => ({
      get: (k) => request(() => structuredClone(s.rows.get(k))),
      getAll: () => request(() => sorted().map((e) => structuredClone(e[1]))),
      getAllKeys: () => request(() => sorted().map((e) => e[0])),
      put: (v, k) => request(() => {
        write();
        if (opts.quota && JSON.stringify(v).length > opts.quota) throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
        if (opts.failPut && opts.failPut(v, k)) throw Object.assign(new Error("disk"), { name: "UnknownError" });
        s.rows.set(s.keyPath ? v[s.keyPath] : k, structuredClone(v));
      }),
      delete: (k) => request(() => { write(); s.rows.delete(k); }),
      clear: () => request(() => { write(); s.rows.clear(); }),
      index: (iname) => ({
        getAll: (key) => request(() => [...s.rows.values()].filter((v) => v[s.indexes[iname]] === key).map((v) => structuredClone(v))),
      }),
    });
    settle();
    return t;
  }
  return idb;
}

function platform(opts = {}, extra = {}) {
  const indexedDB = fakeIndexedDB(opts);
  const ctx = runScript("runtime/platform.js", Object.assign({ indexedDB, setTimeout }, extra));
  return { P: ctx.LopdaPlatform, indexedDB };
}
test("a PR preview path gets its own database name", async () => {
  const nameFor = async (pathname) => {
    const { P, indexedDB } = platform({}, { location: { pathname } });
    const names = [], open = indexedDB.open;
    indexedDB.open = (name, v) => (names.push(name), open(name, v));
    await P.db.doc(BASE + "/notes/items/x").get();
    return names[0];
  };
  assert.equal(await nameFor("/lopda/runtime/"), "lopda");
  assert.equal(await nameFor("/lopda/pr/12/runtime/"), "lopda-pr-12");
  assert.equal(await nameFor("/lopda/pr/x/runtime/"), "lopda");
});

const plain = (v) => JSON.parse(JSON.stringify(v));
const BASE = "data/users/local", NOTES = BASE + "/notes/items";   /* as lopda.js lays them out */

test("set, get, update, delete a document", async () => {
  const { db } = platform().P;
  const ref = db.doc(NOTES + "/n1");
  assert.equal(ref.id, "n1");
  let snap = await ref.get();
  assert.equal(snap.exists, false);
  assert.equal(snap.data(), undefined);

  await ref.set({ title: "a", tags: ["x"] });
  snap = await ref.get();
  assert.equal(snap.exists, true);
  assert.deepEqual(plain(snap.data()), { title: "a", tags: ["x"] });

  await ref.update({ title: "b", n: 2 });
  assert.deepEqual(plain((await ref.get()).data()), { title: "b", tags: ["x"], n: 2 });

  await ref.delete();
  assert.equal((await ref.get()).exists, false);
});

test("update on a missing document does nothing", async () => {
  const { db } = platform().P;
  const ref = db.doc(NOTES + "/ghost");
  await ref.update({ a: 1 });
  assert.equal((await ref.get()).exists, false);
});

test("stored data is a copy, not a live reference", async () => {
  const { db } = platform().P;
  const ref = db.doc(NOTES + "/n1"), data = { list: [1] };
  await ref.set(data);
  data.list.push(2);
  const snap = await ref.get();
  snap.data().list.push(3);
  assert.deepEqual(plain(snap.data()), { list: [1] });
});

test("collections list their direct children in path order, with == filters", async () => {
  const { db } = platform().P;
  const notes = db.collection(NOTES);
  await notes.doc("b").set({ kind: "x" });
  await notes.doc("a").set({ kind: "y" });
  await notes.doc("c").set({ kind: "x" });
  await notes.doc("a").collection("pages").doc("p1").set({ kind: "x" });   /* grandchild: not listed */
  await db.doc(BASE + "/frames/items/f1").set({ kind: "x" });   /* other collection */

  const all = await notes.get();
  assert.equal(all.size, 3);
  assert.deepEqual(all.docs.map((d) => d.id), ["a", "b", "c"]);
  const xs = await notes.where("kind", "==", "x").get();
  assert.deepEqual(xs.docs.map((d) => d.id), ["b", "c"]);
  assert.equal((await notes.where("kind", "==", "x").where("kind", "==", "y").get()).size, 0);
  assert.equal((await db.collection(NOTES + "/a/pages").get()).size, 1);
});

test("collection.doc() without an id makes a fresh one", async () => {
  const { db } = platform().P;
  const c = db.collection(NOTES);
  const a = c.doc(), b = c.doc();
  assert.notEqual(a.id, b.id);
  assert.match(a.path, /^data\/users\/local\/notes\/items\/[0-9a-z]+$/);
});

test("paths must have the right number of segments", () => {
  const { db } = platform().P;
  for (const p of ["data", BASE, NOTES, ""]) assert.throws(() => db.doc(p), (e) => e.code === "invalid_argument", p);
  assert.throws(() => db.collection(BASE + "/notes"), (e) => e.code === "invalid_argument");
  assert.throws(() => db.collection(NOTES).where("n", ">", 1), (e) => e.code === "invalid_argument");
});

test("the database opens once", async () => {
  const { P, indexedDB } = platform();
  assert.equal(await P.db.ready(), true);
  await P.db.doc(BASE + "/settings").get();
  await P.db.collection(NOTES).get();
  assert.equal(indexedDB.opened, 1);
});

test("errors carry a code: unavailable, quota_exceeded", async () => {
  await assert.rejects(platform({ broken: true }).P.db.ready(), (e) => e.code === "unavailable" && e.message === "blocked");
  const { db } = platform({ quota: 200 }).P;
  await db.doc(NOTES + "/small").set({ t: "ok" });
  await assert.rejects(db.doc(NOTES + "/big").set({ t: "x".repeat(200) }), (e) => e.code === "quota_exceeded");
  assert.equal((await db.doc(NOTES + "/small").get()).exists, true);
});

test("a failed database open is not remembered: the next call opens again", async () => {
  const opts = { broken: true };
  const { P, indexedDB } = platform(opts);
  await assert.rejects(P.db.doc(NOTES + "/n1").get(), (e) => e.code === "unavailable");
  opts.broken = false;   /* the phone freed space, the other tab let go: the same page tries again */
  await P.db.doc(NOTES + "/n1").set({ body: "back" });
  assert.equal((await P.db.doc(NOTES + "/n1").get()).data().body, "back");
  assert.equal(indexedDB.opened, 2);
});

/* iOS can drop the connection of an app left in the background (decisions.md section 67). These tests reach into the
   fake: `lost` makes the next transaction() throw as a closed connection does; `hang` makes a transaction take its
   requests and never answer. Timers run 100 times faster so a 5 s limit is 50 ms. */
function flaky() {
  const state = { lost: 0, hang: 0, hung: [], closed: 0 };
  const fast = (fn, ms) => setTimeout(fn, (ms || 0) / 100);
  const { P, indexedDB } = platform({}, { setTimeout: fast, clearTimeout });
  const open = indexedDB.open;
  indexedDB.open = (name, v) => {
    const req = open(name, v);
    const wrap = () => {
      const db = req.result, tx = db.transaction;
      db.close = () => { state.closed++; };
      db.transaction = (s, mode) => {
        if (state.lost > 0) { state.lost--; throw Object.assign(new Error("closing"), { name: "InvalidStateError" }); }
        const t = tx(s, mode);
        if (state.hang > 0) {
          state.hang--; state.hung.push(t);
          /* requests are taken but no event ever fires */
          let aborted = false;
          t.abort = () => { aborted = true; };
          Object.defineProperty(t, "oncomplete", { set() {}, get() {} });
          Object.defineProperty(t, "onabort", { set() {}, get() {} });
          Object.defineProperty(t, "onerror", { set() {}, get() {} });
          t.wasAborted = () => aborted;
        }
        return t;
      };
    };
    let onsuccess;
    Object.defineProperty(req, "onsuccess", { get: () => onsuccess && (() => { wrap(); onsuccess(); }), set: (f) => { onsuccess = f; } });
    return req;
  };
  return { P, indexedDB, state };
}

test("a connection that iOS closed is dropped: the read or write opens a new one and goes through", async () => {
  const { P, indexedDB, state } = flaky();
  const ref = P.db.doc(NOTES + "/n1");
  await ref.set({ body: "a" });
  assert.equal(indexedDB.opened, 1);
  state.lost = 1;
  assert.equal((await ref.get()).data().body, "a");
  assert.equal(indexedDB.opened, 2, "a new connection");
  state.lost = 1;
  await ref.set({ body: "b" });   /* nothing was queued on the dead connection, so the write is safe to send again */
  assert.equal((await ref.get()).data().body, "b");
  assert.equal(indexedDB.opened, 3);
  state.lost = 2;   /* closed twice in a row: one retry, then an error instead of a loop */
  await assert.rejects(ref.get(), (e) => e.code === "unavailable");
});

test("a read that never answers is given up and tried once more on a new connection, then reported", async () => {
  const { P, indexedDB, state } = flaky();
  const ref = P.db.doc(BASE + "/code/items/klotski");
  await ref.set({ html: "<p>hi</p>" });
  state.hang = 1;
  assert.equal((await ref.get()).data().html, "<p>hi</p>", "the second try answers");
  assert.equal(indexedDB.opened, 2);
  assert.ok(state.hung[0].wasAborted() && state.closed >= 1, "the stuck transaction is aborted and its connection closed");
  state.hang = 2;
  await assert.rejects(ref.get(), (e) => e.code === "timeout", "no endless 载入中…");
  assert.equal((await ref.get()).data().html, "<p>hi</p>", "and the next call works");
});

test("a write that never answers is reported, never sent twice, and the next write uses a new connection", async () => {
  const { P, indexedDB, state } = flaky();
  const ref = P.db.doc(NOTES + "/n1");
  await ref.set({ body: "old" });
  state.hang = 1;
  await assert.rejects(ref.set({ body: "new" }), (e) => e.code === "timeout");
  assert.equal(state.hung.length, 1, "one attempt only");
  assert.ok(state.hung[0].wasAborted());
  await ref.set({ body: "newer" });
  assert.equal(indexedDB.opened, 2);
  assert.equal((await ref.get()).data().body, "newer");
});

test("coming back from the background starts a fresh connection; a write already sent still lands", async () => {
  const { P, indexedDB, state } = flaky();
  const ref = P.db.doc(NOTES + "/n1");
  await ref.set({ body: "a" });
  const pending = ref.set({ body: "b" });   /* sent on the old connection */
  P.db.reconnect();
  await pending;
  assert.equal((await ref.get()).data().body, "b");
  assert.equal(indexedDB.opened, 2, "the read after resume opened a new connection");
  assert.ok(state.closed >= 1, "the old one is closed");
  P.db.reconnect(); P.db.reconnect();   /* twice in a row, nothing open: harmless */
  assert.equal((await ref.get()).data().body, "b");
});

test("the whole-device backup has no time limit: a slow dump is not cut off", async () => {
  const { P, state } = flaky();
  await P.db.doc(NOTES + "/n1").set({ body: "a" });
  state.hang = 1;
  let settled = false;
  P.dumpAll().then(() => { settled = true; }, () => { settled = true; });
  await new Promise((r) => setTimeout(r, 300));   /* several times the read limit */
  assert.equal(settled, false, "still waiting, not given up");
  assert.equal(state.hung[0].wasAborted(), false);
});

/* ---------------- file export ---------------- */

function exporter({ coarse = false, share } = {}) {
  const clicked = [], revoked = [];
  const document = {
    body: { appendChild() {} },
    createElement: () => ({ click() { clicked.push({ href: this.href, download: this.download }); }, remove() {} }),
  };
  const navigator = share ? { canShare: () => true, share } : {};
  const URL_ = { createObjectURL: (f) => "blob:" + f.name, revokeObjectURL: (u) => revoked.push(u) };
  const { P } = platform({}, {
    document, navigator, Blob, File, URL: URL_,
    matchMedia: () => ({ matches: coarse }),
    setTimeout: (fn) => fn(),
  });
  return { save: P.downloads.save, saveAll: P.downloads.saveAll, clicked, revoked };
}

test("on desktop, save() downloads the file", async () => {
  const x = exporter();
  assert.deepEqual(plain(await x.save({ filename: "note.txt", data: "hi" })), { status: "saved" });
  assert.deepEqual(x.clicked, [{ href: "blob:note.txt", download: "note.txt" }]);
  assert.deepEqual(x.revoked, ["blob:note.txt"]);
});

test("save() rejects a request without a name or data", async () => {
  const x = exporter();
  for (const req of [null, {}, { filename: "a.txt" }, { data: "x" }]) {
    await assert.rejects(x.save(req), (e) => e.code === "bad_request");
  }
});

test("on a phone, save() opens the share sheet with a typed file", async () => {
  const shared = [];
  const x = exporter({ coarse: true, share: (d) => { shared.push(d); return Promise.resolve(); } });
  assert.deepEqual(plain(await x.save({ filename: "film.PNG", data: new Uint8Array([1, 2]) })), { status: "saved" });
  assert.equal(shared[0].files[0].type, "image/png");
  assert.equal(shared[0].files[0].name, "film.PNG");
  assert.deepEqual(Object.keys(shared[0]), ["files"], "no title or text: iOS would save it as a text file beside the file");
  assert.equal(x.clicked.length, 0);
});

test("a dismissed share sheet is 'declined', other failures 'unavailable'", async () => {
  const fail = (name) => () => Promise.reject(Object.assign(new Error(name), { name }));
  await assert.rejects(exporter({ coarse: true, share: fail("AbortError") }).save({ filename: "a.txt", data: "x" }), (e) => e.code === "declined");
  await assert.rejects(exporter({ coarse: true, share: fail("DataError") }).save({ filename: "a.txt", data: "x" }), (e) => e.code === "unavailable");
});

test("on a phone, saveAll() shares every file in one sheet", async () => {
  const shared = [];
  const x = exporter({ coarse: true, share: (d) => { shared.push(d); return Promise.resolve(); } });
  assert.deepEqual(plain(await x.saveAll([{ filename: "01.jpg", data: "a" }, { filename: "02.jpg", data: "b" }])), { status: "saved" });
  assert.equal(shared.length, 1, "one share sheet, not one per file");
  assert.deepEqual(Array.from(shared[0].files, (f) => f.name), ["01.jpg", "02.jpg"]);
  assert.deepEqual(Object.keys(shared[0]), ["files"]);
  assert.equal(x.clicked.length, 0);
});

test("on desktop, saveAll() downloads each file", async () => {
  const x = exporter();
  assert.deepEqual(plain(await x.saveAll([{ filename: "01.jpg", data: "a" }, { filename: "02.jpg", data: "b" }])), { status: "saved" });
  assert.deepEqual(x.clicked.map((c) => c.download), ["01.jpg", "02.jpg"]);
});

test("saveAll() rejects an empty list or a request without a name or data", async () => {
  const x = exporter();
  for (const list of [null, [], [{ filename: "a.jpg" }], [{ data: "x" }], [{ filename: "a.jpg", data: "x" }, {}]]) {
    await assert.rejects(x.saveAll(list), (e) => e.code === "bad_request");
  }
});

test("files: binary values round-trip in their own database, apart from the documents", async () => {
  const { P, indexedDB } = platform();
  const names = [], open = indexedDB.open;
  indexedDB.open = (name, v) => (names.push(name), open(name, v));
  await P.files.put("dict/x/index", { off: new Uint32Array([1, 2, 3]), words: ["a", "b"] });
  const back = await P.files.get("dict/x/index");
  assert.ok(back.off instanceof Uint32Array);
  assert.deepEqual([...back.off], [1, 2, 3]);
  assert.equal(await P.files.get("nope"), undefined);
  await P.files.del("dict/x/index");
  assert.equal(await P.files.get("dict/x/index"), undefined);
  await P.db.doc(BASE + "/notes/items/x").get();
  assert.deepEqual(names, ["lopda-files", "lopda"]);
});

test("files.keys: only the keys under a prefix, values unread", async () => {
  const { P } = platform();
  await P.files.put("dict/a/index", { words: [] });
  await P.files.put("dict/a/data", new Blob(["x"]));
  await P.files.put("roll/r1/01.jpg", new Blob(["y"]));
  assert.deepEqual((await P.files.keys("dict/")).sort(), ["dict/a/data", "dict/a/index"]);
  assert.equal((await P.files.keys()).length, 3);
  assert.deepEqual(await P.files.keys("font/"), []);
});

/* ---------------- whole-device dump and load ---------------- */

async function fill(P) {
  await P.db.doc(NOTES + "/n1").set({ body: "hello", updated: 1 });
  await P.db.doc(BASE + "/settings").set({ volume: 3, lang: "en" });
  await P.db.doc(BASE + "/calendar/days/2026-10-17").set({ text: "x" });
  await P.files.put("roll/r1/01.jpg", new Blob([new Uint8Array([255, 216, 1, 2])], { type: "image/jpeg" }));
  await P.files.put("dict/d1/index", { info: { name: "d" }, index: { words: ["a", "b"], off: new Uint32Array([0, 7]), head: {} } });
}
/* JSON, with typed arrays named, so values from either realm compare */
const typed = (v) => JSON.parse(JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? { [Object.prototype.toString.call(x)]: [...x] } : x)));
async function plainDump(P) {
  const d = await P.dumpAll();
  const files = [];
  for (const f of d.files) {
    const v = f.value;
    files.push({ key: f.key, value: Object.prototype.toString.call(v) === "[object Blob]" ? { blob: v.type, bytes: [...new Uint8Array(await v.arrayBuffer())] } : typed(v) });
  }
  return { docs: plain(d.docs), files };
}

test("dumpAll reads every document and every file, in key order", async () => {
  const { P } = platform();
  await fill(P);
  const d = await P.dumpAll();
  assert.deepEqual(d.docs.map((x) => x.path), [BASE + "/calendar/days/2026-10-17", NOTES + "/n1", BASE + "/settings"]);
  assert.deepEqual(plain(d.docs[1].data), { body: "hello", updated: 1 });
  assert.deepEqual(d.files.map((x) => x.key), ["dict/d1/index", "roll/r1/01.jpg"]);
  assert.equal(Object.prototype.toString.call(d.files[0].value.index.off), "[object Uint32Array]");
});

test("dump, replace, dump gives the same result, and the stores keep working", async () => {
  const a = platform().P, b = platform().P;
  await fill(a);
  await b.db.doc(NOTES + "/old").set({ body: "gone after the replace" });
  await b.files.put("font/f1", new Blob(["x"]));
  const first = await a.dumpAll();
  await b.replaceAll(first);
  assert.deepEqual(await plainDump(b), await plainDump(a));
  assert.equal((await b.db.doc(NOTES + "/old").get()).exists, false);
  assert.equal(await b.files.get("font/f1"), undefined);
  /* the parent index is rebuilt: collections list the restored documents */
  assert.deepEqual((await b.db.collection(NOTES).get()).docs.map((x) => x.id), ["n1"]);
  await b.replaceAll(await b.dumpAll());
  assert.deepEqual(await plainDump(b), await plainDump(a));
});

test("replaceAll with nothing empties both databases", async () => {
  const { P } = platform();
  await fill(P);
  await P.replaceAll({ docs: [], files: [] });
  assert.deepEqual(plain(await P.dumpAll()), { docs: [], files: [] });
});

test("a failed write leaves that database as it was", async () => {
  const { P } = platform({ failPut: (v, k) => k === "dict/d1/index" && opts.armed });
  const opts = { armed: false };
  await fill(P);
  const before = await plainDump(P);
  opts.armed = true;
  const next = await P.dumpAll();
  next.docs.push({ path: NOTES + "/n2", data: { body: "new" } });
  await assert.rejects(P.replaceAll(next), (e) => e.code === "unavailable");
  opts.armed = false;
  /* the documents' transaction had already committed, with the half-way marker; the files' one rolled back */
  const after = await plainDump(P);
  assert.deepEqual(after.files, before.files);
  assert.equal(after.docs.length, before.docs.length + 2);
  assert.ok(after.docs.some((x) => x.path === P.restorePath));
  assert.equal(await P.restorePending(), true);
  /* the next whole replace (the rollback, or a second restore) clears it */
  await P.replaceAll({ docs: before.docs, files: (await P.dumpAll()).files });
  assert.equal(await P.restorePending(), false);
});

test("a finished replaceAll leaves no half-way marker, even when the dump it writes holds one", async () => {
  const { P } = platform();
  await fill(P);
  assert.equal(await P.restorePending(), false);
  const d = await P.dumpAll();
  d.docs.push({ path: P.restorePath, data: { at: 1 } });
  await P.replaceAll(d);
  assert.equal(await P.restorePending(), false);
  assert.equal((await P.dumpAll()).docs.some((x) => x.path === P.restorePath), false);
});

test("replaceAll refuses a bad document path before writing anything", async () => {
  const { P } = platform();
  await fill(P);
  const before = await plainDump(P);
  await assert.rejects(P.replaceAll({ docs: [{ path: NOTES + "/ok", data: {} }, { path: BASE + "/notes/items", data: {} }], files: [] }), (e) => e.code === "invalid_argument");
  assert.deepEqual(await plainDump(P), before);
});
