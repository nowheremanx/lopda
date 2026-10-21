// registry/apps/wang-dachui: the story graph and the art entry points.
// The story is data, so it can be walked without a browser; every background, chapter card,
// ending poster, portrait and stamp the script asks for must exist in art.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const storyCtx = runScript("registry/apps/wang-dachui/src/story.js", {});
const STORY = storyCtx.STORY;

const T = (x) => (typeof x === "string" ? x : (x && (x.zh || x.en)) || "");
const ART = runScript("registry/apps/wang-dachui/src/art.js", { STORY, T }).ART;

/* a draw surface that records nothing: every method is a no-op, text measures at a fixed width */
function fakeG() {
  return new Proxy({ INK: 0, DARK: 1, MID: 2, PAPER: 3, lineHeight: 14, measure: () => 12, wrap: (s) => [String(s)], get: () => 0 }, {
    get(target, key) { return key in target ? target[key] : () => 0; }
  });
}

const script = STORY.script;
const labels = new Map();
const chapters = [];
const bgs = new Set(), cards = new Set(), ends = new Set(), stamps = new Set(), cast = new Set();

test("the story has a version, six chapters and five endings", () => {
  assert.equal(typeof STORY.version, "number");
  assert.equal(STORY.title.zh, "我儿子王大锤");
  assert.equal(Object.keys(STORY.endings).length, 5);
  assert.deepEqual(Array.from(STORY.endingOrder).sort(), Object.keys(STORY.endings).sort());
});

test("every label is unique and every jump resolves", () => {
  script.forEach((s, i) => {
    if (typeof s.label === "string") {
      assert.equal(labels.has(s.label), false, `duplicate label ${s.label} at ${i}`);
      labels.set(s.label, i);
    }
  });
  script.forEach((s, i) => {
    if (s.goto) assert.ok(labels.has(s.goto), `goto ${s.goto} at ${i} has no label`);
    if (s.if !== undefined) assert.ok(labels.has(s.goto), `if ${s.if} at ${i} has no label`);
    if (s.unless !== undefined) assert.ok(labels.has(s.goto), `unless ${s.unless} at ${i} has no label`);
    if (s.choice) for (const c of s.choice) if (c.goto) assert.ok(labels.has(c.goto), `choice ${c.text && c.text.zh} at ${i} has no label`);
  });
});

test("every chapter card, portrait, background, stamp and ending has art", () => {
  for (const s of script) {
    if (s.chapter) {
      chapters.push(s);
      cards.add(s.art);
      assert.ok(ART.names.card.includes(s.art), `no chapter card art: ${s.art}`);
    }
    if (s.bg) { bgs.add(s.bg); assert.ok(ART.names.bg.includes(s.bg), `no backdrop: ${s.bg}`); }
    if (s.stamp) { stamps.add(s.stamp); assert.ok(ART.names.stamp.includes(s.stamp), `no stamp: ${s.stamp}`); }
    if (s.end) { ends.add(s.end); assert.ok(STORY.endings[s.end], `no ending: ${s.end}`); }
    if (s.say) cast.add(s.say);
    if (s.show) {
      cast.add(s.who);
      assert.ok(s.show === "left" || s.show === "right", `show must be left or right: ${s.show}`);
    }
    if (s.hide) assert.ok(s.hide === "left" || s.hide === "right", `hide must be left or right: ${s.hide}`);
  }
  assert.equal(chapters.length, 6);
  assert.equal(chapters.length, new Set(chapters.map((c) => c.chapter)).size, "chapter ids are unique");
  for (const who of cast) {
    assert.ok(STORY.cast[who], `no cast entry: ${who}`);
    assert.ok(ART.names.cast.includes(STORY.cast[who].art), `no portrait art: ${STORY.cast[who].art}`);
  }
  for (const e of Object.values(STORY.endings)) assert.ok(ART.names.end.includes(e.art), `no ending art: ${e.art}`);
});

test("the art entry points run for every name in the story", () => {
  const g = fakeG();
  for (const bg of bgs) ART.bg(g, bg, 1.5, {});
  for (const card of cards) ART.card(g, card, 1.5);
  for (const key of Object.keys(STORY.endings)) ART.ending(g, STORY.endings[key].art, 1.5);
  for (const who of cast) {
    for (const mood of ["tired", "angry", "sad", "wry", "drunk", "shock", "deadpan", "defiant", "solemn", "smug", "hurt", "shout", "smile", "cry", "pompous", "sharp", "annoyed"]) {
      ART.portrait(g, who, mood, 6, 30, { basin: true, halo: true, dim: true, talk: true, blink: true, t: 1.5 });
    }
  }
  for (const stamp of stamps) ART.stamp(g, stamp, 126, 4, { zh: "盆", en: "Basin" });
});

test("walking the script reaches all five endings", () => {
  const seen = new Set(), endings = new Set(), queue = [{ pc: 0, flags: new Set() }];
  while (queue.length) {
    const state = queue.pop();
    let i = state.pc, flags = state.flags, guard = 0;
    while (guard++ < 2000) {
      const key = i + "|" + [...flags].sort().join(",");
      if (seen.has(key)) break;
      seen.add(key);
      const s = script[i];
      if (!s) { endings.add("done"); break; }
      if (s.set) { flags = new Set(flags); flags.add(s.set); i++; continue; }
      if (s.unset) { flags = new Set(flags); flags.delete(s.unset); i++; continue; }
      if (s.if !== undefined) { i = flags.has(s.if) ? labels.get(s.goto) : i + 1; continue; }
      if (s.unless !== undefined) { i = !flags.has(s.unless) ? labels.get(s.goto) : i + 1; continue; }
      if (s.goto) { i = labels.get(s.goto); continue; }
      if (s.choice) {
        for (const c of s.choice) {
          const f = new Set(flags);
          if (c.set) f.add(c.set);
          if (c.unset) f.delete(c.unset);
          queue.push({ pc: c.goto ? labels.get(c.goto) : i + 1, flags: f });
        }
        break;
      }
      if (s.end) { endings.add(s.end); break; }
      /* say, chapter, wait, bg, show, hide, pose, stamp, sfx, music, ambience, fx, label: the player or the engine moves on */
      i++;
    }
  }
  assert.deepEqual([...endings].sort(), ["basin", "done", "grow", "leave", "side"]);
});
