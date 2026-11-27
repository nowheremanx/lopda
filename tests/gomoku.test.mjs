// registry/apps/gomoku without a browser (tests/dom-vm.mjs): the computer's move after a restart (#318),
// and the colours after the other side restarted and paired again (#319). The full radio match is
// tests/e2e-gomoku-link.test.mjs, which needs Playwright.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { bootDom } from "./dom-vm.mjs";

const APP = join(ROOT, "registry/apps/gomoku/index.html");
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

function bootGomoku(opt = {}) {
  const on = {}, sent = [];
  const link = opt.initiator === undefined ? null : {
    state: "idle", initiator: opt.initiator,
    open() { this.state = "open"; return Promise.resolve("open"); },
    send(d) { sent.push(d); return Promise.resolve("sent"); },
    close() { this.state = "closed"; }
  };
  const pad = {
    lang: "zh", spec: "lopda/1", on: (t, f) => { (on[t] = on[t] || []).push(f); }, off() {}, isDown: () => false,
    load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx() {}, link
  };
  const t = bootDom(APP, { pad, seed: 5 });
  const state = () => t.get("window").__gomoku();
  const press = (id, e = {}) => t.els[id].listeners.pointerdown.forEach((f) => f(Object.assign({ preventDefault() {} }, e)));
  /* the page-space point of an intersection, from the board's own size, pad and cell */
  const point = (x, y) => { const s = state(); return { clientX: (s.pad + x * s.cell) * 300 / s.size, clientY: (s.pad + y * s.cell) * 300 / s.size, pointerType: "mouse" }; };
  const message = (data) => (on.link || []).forEach((f) => f({ type: "message", data }));
  const close = () => { if (link) link.state = "closed"; (on.link || []).forEach((f) => f({ type: "close", reason: "lost" })); };
  return { t, state, press, point, message, close, sent };
}
const stones = (board) => board.flat().filter(Boolean).length;

test("gomoku: a restart while the computer thinks leaves a clean board (#318)", () => {
  const g = bootGomoku();
  g.press("st");                                  /* 开始: a solo game */
  g.press("c", g.point(3, 3));                    /* one click places with a mouse */
  assert.equal(stones(g.state().board), 1);
  g.t.advance(100);                               /* inside the computer's 0.45 s think */
  g.press("rs");                                  /* 重新开始 */
  g.t.advance(1500);
  assert.equal(stones(g.state().board), 0, "no white stone appears on the new board");
});

test("gomoku: taking over the peer's game after it restarted gives this side the other colour (#319)", async () => {
  const g = bootGomoku({ initiator: true });      /* a fresh match: the first open makes this side black */
  g.press("lk");
  await settle();
  assert.equal(g.state().colour, 1);
  /* the peer kept its 5-move game as black, and says so after the open */
  g.message("n,5");
  await settle();
  assert.ok(g.sent.includes("sync"), "the side with fewer moves asks for the game");
  g.message("c,1");
  g.message("all,7.7;7.8;8.8;8.9;9.9");
  await settle();
  const s = g.state();
  assert.equal(s.moves, 5);
  assert.equal(s.colour, 2, "white, the colour the peer does not hold");
});

test("gomoku: a side with stones says its count and its colour after a reconnect", async () => {
  const g = bootGomoku({ initiator: false });     /* white */
  g.press("lk");
  await settle();
  g.message("m,7,7,1");                            /* black's first stone */
  await settle();
  assert.equal(g.state().moves, 1);
  g.close();                                       /* the link drops; the board stays */
  g.sent.length = 0;
  g.press("rc");                                   /* 重新连接 */
  await settle();
  assert.deepEqual(g.sent, ["n,1", "c,2"]);
});
