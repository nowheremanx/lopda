// The 4d4y PoC parser: pure helpers in Node, the DOM half in Chromium (skipped without Playwright).
// The fixtures are synthetic Discuz markup modelled on the selectors the HiPDA-NG client uses;
// the live site cannot be captured because Cloudflare challenges this machine (see docs/handoff/4d4y-poc.md).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, read, runScript } from "./helpers.mjs";

const P = runScript("runtime/fourmparse.js", { URL, URLSearchParams }).LopdaFourm;
const INDEX = readFileSync(join(ROOT, "tests/fixtures/fourm-index.html"), "utf8");
const THREAD = readFileSync(join(ROOT, "tests/fixtures/fourm-thread.html"), "utf8");

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";
let browser;
before(async () => { if (!skip) browser = await pw.chromium.launch(); });
after(async () => { await browser?.close(); });

async function parse(html, fn, pageURL) {
  const p = await browser.newPage();
  try {
    await p.goto("about:blank");
    await p.addScriptTag({ path: join(ROOT, "runtime/fourmparse.js") });
    return await p.evaluate(({ html, fn, pageURL }) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return window.LopdaFourm[fn](doc, pageURL);
    }, { html, fn, pageURL });
  } finally { await p.close(); }
}

test("links stay on 4d4y and become https", () => {
  assert.equal(P.absURL("forum.php?mod=viewthread&tid=101"), "https://www.4d4y.com/forum.php?mod=viewthread&tid=101");
  assert.equal(P.absURL("/forum/viewthread.php?tid=1"), "https://www.4d4y.com/forum/viewthread.php?tid=1");
  assert.equal(P.absURL("//www.4d4y.com/x"), "https://www.4d4y.com/x");
  assert.equal(P.absURL("http://www.4d4y.com/x"), "https://www.4d4y.com/x");
  assert.equal(P.absURL("https://evil.example/x"), "");
  assert.equal(P.absURL("https://www.4d4y.com.evil.example/x"), "");
  assert.equal(P.absURL("javascript:alert(1)"), "");
  assert.equal(P.absURL("data:text/html,x"), "");
  assert.equal(P.fidOf("forum.php?mod=forumdisplay&fid=6"), "6");
  assert.equal(P.tidOf("forum.php?mod=viewthread&tid=101&page=1"), "101");
});

test("text is normalised without losing line breaks", () => {
  assert.equal(P.cleanText("  a \n\n\n b  "), "a\n\nb");
  assert.equal(P.cleanText("a\u0000b\u001fc"), "abc");
  assert.equal(P.cleanText("a\u00a0\u00a0b"), "a b");
});

test("a Cloudflare challenge is recognised, a forum page is not", () => {
  assert.equal(P.isChallenge("<title>Just a moment...</title>"), true);
  assert.equal(P.isChallenge("<script>window._cf_chl_opt={}</script>"), true);
  assert.equal(P.isChallenge("<title>4d4y</title><div id=postlist></div>"), false);
});

test("the forum index: forums, rows, a stock Discuz row, and portal links", { skip }, async () => {
  const out = await parse(INDEX, "parseIndex");
  assert.equal(out.error, "");
  assert.deepEqual(out.forums.map((f) => f.name), ["Discovery", "Buy & Sell"]);
  assert.equal(out.forums[0].url, "https://www.4d4y.com/forum.php?mod=forumdisplay&fid=2");
  assert.equal(out.topics.length, 3);
  const [pinned, alice, stock] = out.topics;
  assert.equal(pinned.title, "置顶：版规");
  assert.equal(pinned.sticky, true);
  assert.equal(pinned.author, "admin");
  assert.equal(pinned.timestamp, "2026-10-19 08:30");
  assert.equal(pinned.replies, "12");
  assert.equal(alice.title, "今天收到一台老掌机");
  assert.equal(alice.author, "alice");
  assert.equal(alice.timestamp, "2026-10-19 10:15");
  assert.equal(stock.author, "erin");
  assert.equal(stock.timestamp, "2026-10-19 11:00");
  assert.equal(stock.replies, "7");

  const portal = await parse('<div><a class="xst" href="forum.php?mod=viewthread&amp;tid=7">Portal topic</a></div>', "parseIndex");
  assert.equal(portal.topics.length, 1);
  assert.equal(portal.topics[0].title, "Portal topic");
  assert.equal(portal.topics[0].url, "https://www.4d4y.com/forum.php?mod=viewthread&tid=7");

  /* a forum under /forum/ keeps its own base: relative links must not be lifted to the root */
  const under = await parse(INDEX, "parseIndex", "https://www.4d4y.com/forum/forum.php");
  assert.equal(under.forums[0].url, "https://www.4d4y.com/forum/forum.php?mod=forumdisplay&fid=2");
  assert.equal(under.topics[0].url, "https://www.4d4y.com/forum/forum.php?mod=viewthread&tid=90");
});

test("a thread: title, authors, times, and text-only content", { skip }, async () => {
  const out = await parse(THREAD, "parseThread");
  assert.equal(out.error, "");
  assert.equal(out.title, "今天收到一台老掌机");
  assert.equal(out.posts.length, 2);
  assert.equal(out.posts[0].author, "alice");
  assert.equal(out.posts[0].timestamp, "2026-10-19 09:00");
  assert.match(out.posts[0].content, /四格电/);
  assert.match(out.posts[0].content, /图/);
  assert.doesNotMatch(out.posts[0].content, /bad\(\)/);
  assert.equal(out.posts[1].author, "dave");
  assert.equal(out.posts[1].timestamp, "2026-10-19 10:15");
  assert.match(out.posts[1].content, /酒精/);
});

test("malformed HTML does not throw, it returns an empty or partial result", { skip }, async () => {
  const broken = "<html><body><table><tbody id='normalthread_1'><tr><th class='subject'><span><a href='forum.php?mod=viewthread&tid=1'>X";
  const index = await parse(broken, "parseIndex");
  assert.ok(Array.isArray(index.forums) && Array.isArray(index.topics));
  const thread = await parse("<div id=postlist><div id=post_1><td class=postcontent><div class=postmessage>X", "parseThread");
  assert.ok(Array.isArray(thread.posts));
});

test("the app source stays far below the 512 KB package limit", () => {
  const app = statSync(join(ROOT, "runtime/apps/fourm.js")).size;
  const parser = statSync(join(ROOT, "runtime/fourmparse.js")).size;
  assert.ok(app + parser < 64 * 1024, `fourm sources are ${app + parser} bytes`);
  assert.ok(app + parser < 512 * 1024);
  console.log(`fourm source: app ${app} B + parser ${parser} B = ${app + parser} B`);
});
