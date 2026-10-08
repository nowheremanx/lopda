// runtime/platform.js: the document store over a small in-memory IndexedDB, and file export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

/* Just enough IndexedDB for platform.js: one store with a keyPath and one non-unique index.
   Requests settle asynchronously; a transaction completes once no request is left, so a put
   queued from a get's onsuccess (doc.update) lands in the same transaction, as in a browser. */
function fakeIndexedDB(opts = {}) {
  let stores = null;
  const later = (fn) => setTimeout(fn, 0);
  const idb = {
    opened: 0,
    open(name, version) {
      idb.opened++;
      const req = {};
      later(() => {
        if (opts.broken) { req.error = new Error("blocked"); return req.onerror && req.onerror(); }
        const db = {
          createObjectStore(sname, { keyPath }) {
            const s = { keyPath, rows: new Map(), indexes: {} };
            (stores ||= {})[sname] = s;
            return { createIndex(iname, field) { s.indexes[iname] = field; } };
          },
          transaction(sname, mode) { return transaction(stores[sname], mode); },
        };
        req.result = db;
        if (!stores && req.onupgradeneeded) req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
  };
  function transaction(s, mode) {
    let pending = 0, failed = null;
    const t = {};
    const settle = () => later(() => {
      if (pending) return;
      if (failed) { t.error = failed; t.onabort && t.onabort(); }
      else t.oncomplete && t.oncomplete();
    });
    const request = (fn) => {
      const r = {}; pending++;
      later(() => {
        try { r.result = fn(); r.onsuccess && r.onsuccess(); } catch (e) { failed = e; }
        pending--; settle();
      });
      return r;
    };
    const write = () => { if (mode !== "readwrite") throw Object.assign(new Error("read only"), { name: "ReadOnlyError" }); };
    t.objectStore = () => ({
      get: (k) => request(() => structuredClone(s.rows.get(k))),
      put: (v) => request(() => {
        write();
        if (opts.quota && JSON.stringify(v).length > opts.quota) throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
        s.rows.set(v[s.keyPath], structuredClone(v));
      }),
      delete: (k) => request(() => { write(); s.rows.delete(k); }),
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
  return { save: P.downloads.save, clicked, revoked };
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
  assert.equal(x.clicked.length, 0);
});

test("a dismissed share sheet is 'declined', other failures 'unavailable'", async () => {
  const fail = (name) => () => Promise.reject(Object.assign(new Error(name), { name }));
  await assert.rejects(exporter({ coarse: true, share: fail("AbortError") }).save({ filename: "a.txt", data: "x" }), (e) => e.code === "declined");
  await assert.rejects(exporter({ coarse: true, share: fail("DataError") }).save({ filename: "a.txt", data: "x" }), (e) => e.code === "unavailable");
});
