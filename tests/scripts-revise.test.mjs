// runtime/apps/scripts.js: the 改一改 prompt, the answer checks, and the versions / ask store (docs/design/scripts-revise.md part 1).
// No browser needed: the store runs on an in-memory document fake, the pure helpers on the runtime's own strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));
const BASE = "data/users/local/scripts";
const P_ITEMS = (id) => BASE + "/items/" + id;
const P_DATA = (id) => BASE + "/data/" + id;
const P_VERSIONS = (id) => BASE + "/versions/" + id;
const P_ASKS = (id) => BASE + "/asks/" + id;

/* A page element for a headless run: $("…") only ever gets wired up, never drawn. */
function el() {
  return {
    value: "", textContent: "", hidden: false, readOnly: false, disabled: false, files: null,
    style: {}, scrollTop: 0, scrollHeight: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    appendChild() {}, removeChild() {}, focus() {}, select() {}, click() {},
    setSelectionRange() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
  };
}

/* platform.js's document store, in memory; `fail` refuses writes to one path, `ops` records deletes. */
function makeDB() {
  const docs = new Map(), fail = new Set(), ops = [];
  function ref(path) {
    return {
      path, id: path.split("/").pop(),
      get() {
        const rec = docs.get(path);
        return Promise.resolve({
          id: path.split("/").pop(), exists: docs.has(path),
          data() { return rec === undefined ? undefined : JSON.parse(JSON.stringify(rec)); },
        });
      },
      set(v) {
        if (fail.has(path)) return Promise.reject({ code: "unavailable" });
        docs.set(path, JSON.parse(JSON.stringify(v)));
        return Promise.resolve();
      },
      delete() {
        ops.push(path);
        if (fail.has(path)) return Promise.reject({ code: "unavailable" });
        docs.delete(path);
        return Promise.resolve();
      },
      collection(name) { return coll(path + "/" + name); },
    };
  }
  function coll(path) {
    return { path, doc(id) { return ref(path + "/" + id); } };
  }
  return { docs, fail, ops, doc(p) { return ref(p); }, collection(p) { return coll(p); } };
}

function makeLP(ctx, db, $) {
  const S = ctx.LopdaStrings;
  return {
    $,
    S: { db, kv: {} },
    tr: S.t,
    own: (d) => (d == null ? null : JSON.parse(JSON.stringify(d))),
    toast() {}, sfx() {}, show() {}, keepAwake() {}, builtin() {},
    fmt() { return ""; }, pad2(n) { return String(n); },
    noEmoji: (s) => String(s || ""),
    uid: () => "test",
    /* core.js put(): one write, resolved true when it landed, false when refused */
    put: (ref, data) => ref.set(data).then(() => true, () => false),
  };
}

function boot(lang, db) {
  const ctx = runScript("runtime/strings.js", {
    navigator: { languages: [lang], language: lang },
    document: { addEventListener() {}, createElement() { return el(); }, body: { appendChild() {}, removeChild() {} }, hidden: false },
    setTimeout, clearTimeout,
  });
  /* one element per id, like the real page: a test can set a textarea and read it back */
  const page = new Map(), $ = (id) => { if (!page.has(id)) page.set(id, el()); return page.get(id); };
  ctx.LP = makeLP(ctx, db || makeDB(), $);
  vm.runInContext(read("runtime/apps/scripts.js"), ctx, { filename: "runtime/apps/scripts.js" });
  return ctx;
}

const CODE = '<!doctype html>\n<html><head><title>钟</title></head>\n<body>\n<script>\nvar o={x:1,y:{ask:"{ask}",z:"$&"}};\nfunction f(){ return o.x + o.y.ask.length; }\n</script>\n</body></html>';

/* ---------- revisePrompt ---------- */

test("revisePrompt: the 生成 prompt's own rules, cut at its 我想做的是 line, then code and ask", () => {
  for (const lang of ["zh-CN", "en-US"]) {
    const ctx = boot(lang), t = ctx.LopdaStrings.t, T = ctx.LP.scripts._test;
    const MARK = "\u0001IDEA\u0001";
    const lines = t("scripts.prompt", { idea: MARK }).split("\n");
    const at = lines.findIndex((l) => l.includes(MARK));
    assert.ok(at > 50, "found the idea line");
    const rules = lines.slice(0, at).join("\n").replace(/\s+$/, "");
    const p = T.revisePrompt(CODE, "加一个暂停键 PAUSE-ASK");
    assert.ok(p.startsWith(rules + "\n\n"), lang + ": begins with the 生成 rules");
    assert.ok(!p.includes(MARK), lang + ": the marker is gone");
    assert.ok(!p.includes("\u0001"), lang + ": no private marker is left");
    assert.ok(p.includes(CODE), lang + ": the code appears verbatim");
    assert.ok(p.includes("加一个暂停键 PAUSE-ASK"), lang + ": the ask is there");
    /* the code comes before the ask, in both languages */
    assert.ok(p.indexOf(CODE) < p.indexOf("PAUSE-ASK"), lang + ": code first");
    /* the rules stop before the idea: not the prompt's last-line advice */
    assert.equal(p.split("\n\n")[0], rules.split("\n\n")[0], lang + ": first block is the rules");
  }
});

test("revisePrompt: an ask with braces and a code with braces survive tr() untouched", () => {
  const ctx = boot("zh-CN"), T = ctx.LP.scripts._test;
  const p = T.revisePrompt(CODE, "把 {x} 改名叫 {ask}");
  assert.ok(p.includes(CODE), "every brace of the code is still there");
  assert.ok(p.includes("把 {x} 改名叫 {ask}"), "the ask keeps its braces");
  assert.equal(p.split(CODE).length, 2, "the code appears exactly once");
});

/* ---------- checkRevision ---------- */

const OLD = '<!doctype html>\n<html><head><title>钟</title></head>\n<body>\n<script>\nvar n=0;\nfunction tick(){ n++; }\n</script>\n</body></html>';

test("checkRevision: empty, cut, partial, same each say why; a changed whole file is ok", () => {
  const T = boot("zh-CN").LP.scripts._test;
  assert.deepEqual(plain(T.checkRevision(OLD, "")), { ok: false, why: "empty" });
  assert.deepEqual(plain(T.checkRevision(OLD, "   \n\t ")), { ok: false, why: "empty" });
  assert.deepEqual(plain(T.checkRevision(OLD, "```\n```")), { ok: false, why: "empty" });

  /* the old file was complete, the new one is not */
  assert.deepEqual(plain(T.checkRevision(OLD, OLD.replace(/<\/html>\n?$/, ""))), { ok: false, why: "cut" });

  /* far too short to be the whole file */
  assert.deepEqual(plain(T.checkRevision(OLD, "<!doctype html><html></html>")), { ok: false, why: "partial" });

  /* the lazy "the rest is unchanged" answers */
  const lazy = {
    "其余不变": OLD.replace("</body>", "<!-- 其余不变 -->\n</body>"),
    "其余部分代码同上": OLD.replace("</body>", "<!-- 其余部分代码同上 -->\n</body>"),
    "此处省略": OLD.replace("</body>", "<!-- 此处省略 -->\n</body>"),
    "the rest is unchanged": OLD.replace("</body>", "<!-- the rest is unchanged -->\n</body>"),
    "... existing code": OLD.replace("</body>", "<!-- ... existing code -->\n</body>"),
    "// ...": OLD.replace("</script>", "// ...\n</script>"),
  };
  for (const [why, raw] of Object.entries(lazy)) {
    assert.deepEqual(plain(T.checkRevision(OLD, raw)), { ok: false, why: "partial" }, why);
  }

  assert.deepEqual(plain(T.checkRevision(OLD, OLD + "\n")), { ok: false, why: "same" });

  const revised = OLD.replace("n++", "n+=1");
  const ok = plain(T.checkRevision(OLD, revised));
  assert.equal(ok.ok, true);
  assert.equal(ok.code, revised);
  /* prose and a fence around the answer are cleaned off, not refused */
  const fenced = plain(T.checkRevision(OLD, "Here it is:\n```html\n" + revised + "\n```\nDone."));
  assert.equal(fenced.ok, true);
  assert.equal(fenced.code, revised);
});

/* ---------- the version list limits ---------- */

test("trimVersions: 10 at most, 1,000,000 body characters, dropping from the oldest and keeping the newest", () => {
  const T = boot("zh-CN").LP.scripts._test;
  const v = (n, len) => ({ at: n, name: "n" + n, body: "x".repeat(len), why: "w" + n });

  assert.deepEqual(plain(T.trimVersions([])), []);
  assert.deepEqual(plain(T.trimVersions(null)), []);

  const many = Array.from({ length: 12 }, (_, i) => v(i, 10));
  const ten = plain(T.trimVersions(many));
  assert.equal(ten.length, 10);
  assert.deepEqual(ten.map((x) => x.at), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "newest first, the two oldest gone");

  /* 3 x 400 KB: the third would pass 1 MB and is dropped */
  const big = [v(3, 400000), v(2, 400000), v(1, 400000)];
  assert.deepEqual(plain(T.trimVersions(big)).map((x) => x.at), [3, 2]);

  /* the newest alone is over the limit: it stays */
  assert.deepEqual(plain(T.trimVersions([v(9, 1500000), v(8, 10)])).map((x) => x.at), [9]);

  /* exactly at the limit fits */
  assert.deepEqual(plain(T.trimVersions([v(2, 500000), v(1, 500000)])).map((x) => x.at), [2, 1]);

  /* the bodies being swapped are never dropped: neither the count nor the characters can push them out */
  const kept = [
    { at: 3, name: "n3", body: "a".repeat(400000), why: "" },
    { at: 2, name: "n2", body: "b".repeat(400000), why: "" },
    { at: 1, name: "n1", body: "c".repeat(400000), why: "" },
  ];
  assert.deepEqual(plain(T.trimVersions(kept, [kept[2].body])).map((x) => x.at), [3, 1], "the kept oldest body stays, the middle one goes");
  const all = Array.from({ length: 12 }, (_, i) => ({ at: i, name: "n" + i, body: "b" + i, why: "" }));
  assert.equal(T.trimVersions(all, all.map((x) => x.body)).length, 12, "keep overrides the count cap");
  const huge = [{ at: 2, body: "d".repeat(900000), name: "", why: "" }, { at: 1, body: "e".repeat(700000), name: "", why: "" }];
  assert.deepEqual(plain(T.trimVersions(huge, [huge[1].body])).map((x) => x.at), [2, 1], "keep overrides the character cap");
});

/* ---------- the store ---------- */

test("keepVersions: each version is labelled by what made it: 原版 orig, 手改 edit, the ask", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  /* empty bodies are never added, and nothing is written for them */
  assert.equal(await T.keepVersions("k1", "", "P", "  \n ", "P", "x"), true);
  assert.equal(db.docs.has(P_VERSIONS("k1")), false);
  assert.deepEqual(plain(await T.loadVersions("k1")), []);

  /* the first change: the code going away is the 原版, the new state carries the ask */
  assert.equal(await T.keepVersions("k1", "OLD", "P", "NEW", "P", "加一个暂停键"), true);
  const list = plain(await T.loadVersions("k1"));
  assert.deepEqual(list.map((x) => x.body), ["NEW", "OLD"], "newest first");
  assert.deepEqual(list.map((x) => x.why), ["加一个暂停键", "orig"]);
  assert.deepEqual(list.map((x) => x.name), ["P", "P"]);
  assert.ok(list[0].at > list[1].at, "the new state is newer than the code it replaced");
  assert.ok(list[0].at > 0);

  /* hand-typed code that is not in the list yet is 手改, never 原版 */
  assert.equal(await T.keepVersions("k1", "MANUAL", "P", "MANUAL2", "P", ""), true);
  const more = plain(await T.loadVersions("k1"));
  assert.deepEqual(more.map((x) => x.body), ["MANUAL2", "MANUAL", "NEW", "OLD"]);
  assert.equal(more[1].why, "edit");

  /* switching to a body already in the list adds nothing */
  const before = plain(db.docs.get(P_VERSIONS("k1")));
  assert.equal(await T.keepVersions("k1", "MANUAL2", "P", "OLD", "P", ""), true);
  assert.deepEqual(plain(db.docs.get(P_VERSIONS("k1"))), before, "no row and no write");

  /* an empty script: only the new body, labelled with the ask */
  assert.equal(await T.keepVersions("k2", "", "P", "NEW", "P", "ask"), true);
  assert.deepEqual(plain(await T.loadVersions("k2")).map((x) => [x.body, x.why]), [["NEW", "ask"]]);
});

test("keepVersions: 10 versions and 1,000,000 characters, but the newest and the bodies being swapped are never dropped", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  let body = "code 0";
  for (let i = 1; i <= 12; i++) {
    const next = "code " + i;
    assert.equal(await T.keepVersions("cap", body, "P", next, "P", "r" + i), true);
    body = next;
  }
  const list = plain(await T.loadVersions("cap"));
  assert.equal(list.length, 10, "10 at most");
  assert.equal(list[0].body, "code 12");
  assert.equal(list[9].body, "code 3");
  assert.equal(list[0].why, "r12");

  /* two huge bodies: both stay in the doc even though together they pass 1,000,000, and the older one no longer fits */
  const bigOld = "a".repeat(700000), bigNew = "b".repeat(700000), gone = "z".repeat(900000);
  db.docs.set(P_VERSIONS("big"), { v: 1, list: [{ at: 1, name: "P", body: gone, why: "old" }] });
  assert.equal(await T.keepVersions("big", bigOld, "P", bigNew, "P", "ask"), true);
  const big = db.docs.get(P_VERSIONS("big")).list;
  assert.equal(big.length, 2, "the two bodies being swapped are never dropped");
  assert.equal(big[0].body, bigNew);
  assert.equal(big[0].why, "ask");
  assert.equal(big[1].body, bigOld);
  assert.equal(big[1].why, "edit");
  assert.ok(!big.some((x) => x.body === gone), "the older version no longer fits");
});

test("keepVersions: a damaged list starts over; a newer doc is refused untouched", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  db.docs.set(P_VERSIONS("dmg"), { v: 1, list: "not a list" });
  assert.equal(await T.keepVersions("dmg", "a", "P", "b", "P", "ask"), true);
  assert.deepEqual(plain(await T.loadVersions("dmg")).map((x) => [x.body, x.why]), [["b", "ask"], ["a", "orig"]]);

  db.docs.set(P_VERSIONS("new"), { v: 2, list: [] });
  await assert.rejects(() => T.keepVersions("new", "a", "P", "b", "P", "ask"), (e) => e && e.code === "newer");
  assert.deepEqual(plain(db.docs.get(P_VERSIONS("new"))), { v: 2, list: [] }, "the newer doc was not touched");
});

test("loadVersions: none, unreadable and a newer doc", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  assert.deepEqual(plain(await T.loadVersions("none")), []);
  db.docs.set(P_VERSIONS("bad"), { v: 1 }); /* no list */
  assert.deepEqual(plain(await T.loadVersions("bad")), []);
  db.docs.set(P_VERSIONS("damaged"), { v: 1, list: "not a list" });
  assert.deepEqual(plain(await T.loadVersions("damaged")), [], "a damaged list is nothing to show");
  db.docs.set(P_VERSIONS("new"), { v: 2, list: [{ at: 1, name: "P", body: "x", why: "" }] });
  await assert.rejects(() => T.loadVersions("new"), (e) => e && e.code === "newer");
});

test("replaceBody: both bodies are versions before the script is written", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  const s = { v: 1, id: "s1", name: "P", body: "OLD", created: 1, updated: 1 };
  assert.equal(await T.replaceBody(s, "NEW", "add a pause"), true);
  assert.equal(db.docs.get(P_ITEMS("s1")).body, "NEW", "the script holds the new code");
  assert.equal(db.docs.get(P_ITEMS("s1")).name, "P", "its name is unchanged");
  const list = plain(db.docs.get(P_VERSIONS("s1")).list);
  assert.deepEqual(list.map((x) => x.body), ["NEW", "OLD"], "the new state, then the code it replaced");
  assert.deepEqual(list.map((x) => x.why), ["add a pause", "orig"]);
  assert.deepEqual(list.map((x) => x.name), ["P", "P"]);

  /* a revised file may carry a new <title>: the new name lands in the same write; the code being left
     is already a version (with its ask), so it is not added a second time */
  assert.equal(await T.replaceBody(s, "NEWER", "add a clock", "钟"), true);
  assert.equal(db.docs.get(P_ITEMS("s1")).name, "钟");
  assert.equal(s.name, "钟");
  const list2 = plain(db.docs.get(P_VERSIONS("s1")).list);
  assert.deepEqual(list2.map((x) => x.body), ["NEWER", "NEW", "OLD"]);
  assert.equal(list2[0].name, "钟");
  assert.equal(list2[0].why, "add a clock");
  assert.equal(list2[1].why, "add a pause", "the code being left was already a version");
});

test("replaceBody: if the version cannot be written, the script is not touched", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  db.docs.set(P_ITEMS("s2"), { v: 1, id: "s2", name: "P2", body: "OLD2", created: 1, updated: 1 });
  db.fail.add(P_VERSIONS("s2"));
  const s = { v: 1, id: "s2", name: "P2", body: "OLD2", created: 1, updated: 1 };
  assert.equal(await T.replaceBody(s, "NEW2", "x"), false);
  assert.equal(db.docs.get(P_ITEMS("s2")).body, "OLD2", "the stored script still has the old code");
  assert.equal(s.body, "OLD2", "the in-memory script was put back");
  assert.equal(db.docs.has(P_VERSIONS("s2")), false);

  /* a versions doc from a newer runtime is refused the same way */
  db.fail.delete(P_VERSIONS("s2"));
  db.docs.set(P_VERSIONS("s2"), { v: 2, list: [] });
  assert.equal(await T.replaceBody(s, "NEW3", "x"), false);
  assert.equal(db.docs.get(P_ITEMS("s2")).body, "OLD2");
  assert.deepEqual(plain(db.docs.get(P_VERSIONS("s2"))), { v: 2, list: [] }, "the newer doc is left as it was");
});

test("deleteScript: data, versions, ask draft, then the script last", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  db.docs.set(P_DATA("s3"), { v: 1, kv: { n: 1 } });
  db.docs.set(P_VERSIONS("s3"), { v: 1, list: [{ at: 1, name: "P", body: "x", why: "" }] });
  db.docs.set(P_ASKS("s3"), { v: 1, text: "ask", updated: 1 });
  db.docs.set(P_ITEMS("s3"), { v: 1, id: "s3", name: "P", body: "x", created: 1, updated: 1 });
  await T.deleteScript("s3");
  assert.deepEqual(db.ops, [P_DATA("s3"), P_VERSIONS("s3"), P_ASKS("s3"), P_ITEMS("s3")]);
  for (const p of db.ops) assert.equal(db.docs.has(p), false, p + " is gone");
});

test("deleteScript: a failed version delete leaves the script itself in place", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  db.docs.set(P_DATA("s4"), { v: 1, kv: {} });
  db.docs.set(P_ITEMS("s4"), { v: 1, id: "s4", name: "P", body: "x", created: 1, updated: 1 });
  db.fail.add(P_VERSIONS("s4"));
  await assert.rejects(() => T.deleteScript("s4"));
  assert.equal(db.docs.has(P_ITEMS("s4")), true, "the script is still there");
  assert.equal(db.docs.has(P_DATA("s4")), false, "its data went first, as the order says");
});

test("ask drafts: kept per script, cleared when empty or deleted", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test;
  assert.equal(await T.loadAsk("s5"), "", "nothing saved yet");
  assert.equal(await T.saveAskNow("s5", "加一个暂停键"), true);
  assert.equal(db.docs.get(P_ASKS("s5")).text, "加一个暂停键");
  assert.equal(db.docs.get(P_ASKS("s5")).v, 1);
  assert.equal(await T.loadAsk("s5"), "加一个暂停键");
  assert.equal(await T.saveAskNow("s5", ""), true);
  assert.equal(db.docs.has(P_ASKS("s5")), false, "an empty ask clears the draft");
  await T.saveAskNow("s5", "again");
  assert.equal(await T.clearAsk("s5"), true);
  assert.equal(db.docs.has(P_ASKS("s5")), false);
});

/* ---------- the save guard: a revise in flight must not touch the script document ---------- */

test("saveCurrent: while a revise of this script streams, nothing is read from the textarea or written", async () => {
  const db = makeDB(), ctx = boot("en-US", db), T = ctx.LP.scripts._test, $ = ctx.LP.$;
  const s = { v: 1, id: "s9", name: "P", body: "OLD", created: 1, updated: 1 };
  T.state.current = s;
  $("script-name").value = "P";
  $("script-code").value = "TYPED";
  assert.equal(await T.saveCurrent(true), true, "without a revise the editor's text is saved");
  assert.equal(db.docs.get(P_ITEMS("s9")).body, "TYPED");

  /* the revise starts: the answer streams into the textarea, the script document must not move */
  T.stream.job = { stop() {} }; T.stream.mode = "revise"; T.stream.s = s; T.stream.text = "STREAMING";
  $("script-code").value = "STREAMING";
  $("script-name").value = "renamed";
  assert.equal(T.revising(s), true);
  assert.equal(T.revising({ id: "other" }), false);
  assert.equal(T.revising(null), false);
  assert.equal(await T.saveCurrent(true), true, "the guard reports success without writing");
  assert.equal(db.docs.get(P_ITEMS("s9")).body, "TYPED", "the stored body did not move");
  assert.equal(db.docs.get(P_ITEMS("s9")).name, "P", "nor the stored name");
  assert.equal(s.body, "TYPED", "nor the in-memory body");
  assert.equal(s.name, "P", "nor the in-memory name");

  /* a different script (and the same script once the job is over) saves as always */
  T.stream.job = null; T.stream.mode = "gen"; T.stream.s = null;
  assert.equal(T.revising(s), false);
  $("script-name").value = "P2";
  assert.equal(await T.saveCurrent(true), true);
  assert.equal(db.docs.get(P_ITEMS("s9")).body, "STREAMING");
  assert.equal(db.docs.get(P_ITEMS("s9")).name, "P2");
});
