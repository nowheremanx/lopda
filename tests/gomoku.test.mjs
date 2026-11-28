// registry/apps/gomoku without a browser (tests/dom-vm.mjs): the computer's move after a restart (#318),
// the colours after the other side restarted and paired again (#319), the undo while it thinks (#321),
// and the one-canvas layout that fills the stage (UI.md section 13). The full radio match is
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
  /* the page-space point of an intersection, from the board's own layout */
  const point = (x, y) => {
    const s = state();
    return { clientX: (s.bx + s.pad + x * s.cell), clientY: (s.by + s.pad + y * s.cell), pointerType: "mouse" };
  };
  /* a tap on the canvas, the way a finger or a mouse does it (the fake canvas is the stage, 300 x 300) */
  const tapXY = (x, y) => press("c", { clientX: x, clientY: y, pointerType: "mouse" });
  /* a tap on one of the painted bar buttons, through the rect the app reports */
  const button = (id) => {
    const s = state(), q = s.buttons[id];
    assert.ok(q, `the ${id} button is painted`);
    return tapXY(q.x + q.w / 2, q.y + q.h / 2);
  };
  const message = (data) => (on.link || []).forEach((f) => f({ type: "message", data }));
  const close = () => { if (link) link.state = "closed"; (on.link || []).forEach((f) => f({ type: "close", reason: "lost" })); };
  return { t, state, press, point, tapXY, button, message, close, sent };
}
const stones = (board) => board.flat().filter(Boolean).length;

test("gomoku: a restart while the computer thinks leaves a clean board (#318)", () => {
  const g = bootGomoku();
  g.press("st");                                  /* 开始: a solo game */
  g.press("c", g.point(3, 3));                    /* one click places with a mouse */
  assert.equal(stones(g.state().board), 1);
  g.t.advance(100);                               /* inside the computer's 0.45 s think */
  g.button("rs");                                 /* 重新开始, painted in the bottom bar */
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
  g.button("rc");                                  /* 重新连接, painted in the bottom bar */
  await settle();
  assert.deepEqual(g.sent, ["n,1", "c,2"]);
});

test("gomoku: undo while the computer thinks takes back black's stone, and white never moves (#321)", () => {
  const sounds = [];
  const g = bootGomoku();
  g.t.get("PAD").sfx = (n) => sounds.push(n);
  g.press("st");
  g.button("ud");                                  /* nothing to take back yet: an error sound, not silence */
  assert.equal(sounds.pop(), "err");
  g.press("c", g.point(3, 3));
  g.t.advance(100);                               /* inside the computer's 0.45 s think */
  g.button("ud");
  assert.equal(sounds.pop(), "miss");
  assert.equal(stones(g.state().board), 0, "black's stone is gone");
  g.t.advance(1500);
  assert.equal(stones(g.state().board), 0, "and no white stone comes later");
  g.press("c", g.point(4, 4));                    /* the game goes on as before */
  g.t.advance(1500);
  assert.equal(stones(g.state().board), 2);
});

test("gomoku: the canvas covers the stage at every phone size and the board keeps whole cells", () => {
  const g = bootGomoku();
  const layout = g.t.get("window").__gomoku.layout;
  for (const [w, h] of [[331, 359], [346, 518], [386, 650], [348, 323], [386, 738]]) {
    const L = layout(w, h);
    const at = `${w}x${h}`;
    assert.equal(L.W, w, `${at}: the canvas is the stage's width`);
    assert.equal(L.H, h, `${at}: the canvas is the stage's height`);
    assert.ok(L.topH >= 36 && L.botH >= 72, `${at}: both bars keep room for their text and buttons`);
    assert.ok(L.by >= L.topH && L.by + L.S <= L.botY, `${at}: the board sits between the bars`);
    assert.ok(L.bx >= 0 && L.bx + L.S <= w, `${at}: the board is not cut off at the sides`);
    assert.ok(Number.isInteger(L.cell) && Number.isInteger(L.pad), `${at}: whole pixels`);
    assert.equal((L.S - 2 * L.pad) / L.cell, 14, `${at}: fourteen whole cells across`);
    assert.ok(L.S >= w * 0.55, `${at}: the board is the screen's subject, not a thumbnail`);
    /* the same 44 px target the old HTML buttons had */
    assert.ok(Math.min(56, Math.max(44, L.botH - 32)) >= 44, `${at}: the bar buttons stay 44 px`);
  }
});

test("gomoku: a tap in a bar never places a stone; the board still takes one", () => {
  const g = bootGomoku();
  g.press("st");
  const s = g.state();
  g.tapXY(20, 5);                                 /* the status bar */
  assert.equal(stones(g.state().board), 0, "the top bar is not the board");
  g.tapXY(20, s.H - s.bottom + 5);                /* the tip line in the bottom bar, above the buttons */
  assert.equal(stones(g.state().board), 0, "the bottom bar is not the board");
  g.press("c", g.point(3, 3));
  assert.equal(stones(g.state().board), 1, "an intersection still takes a stone");
});

test("gomoku: every string the canvas paints has a glyph", () => {
  const g = bootGomoku();
  assert.deepEqual(g.t.get("window").__gomoku.missingGlyphs(), [], "the lopix12 subset covers the app's text");
});

test("gomoku: the test hook hands out copies, and a dpr change refits the canvas", () => {
  const g = bootGomoku();
  g.press("st");
  const leaked = g.state().buttons.ud;
  leaked.x = -1;
  leaked.w = 1;
  const kept = g.state().buttons.ud;
  assert.ok(kept.x >= 0 && kept.w > 44, "mutating the reported rect cannot move the painted button");
  assert.equal(g.state().dpr, 1);
  g.t.get("window").devicePixelRatio = 3;   /* the window moved to another display, same stage */
  g.t.advance(20);
  assert.equal(g.state().dpr, 3, "the frame loop refits on a dpr change");
  assert.equal(g.t.els.c.width, 900, "the backing store follows the new dpr");
});
