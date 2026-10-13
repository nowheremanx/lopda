// registry/apps/zhenyao-tower: the music, ambience, effects and voices (src/sound.js, src/music/). The game runs in
// Node (tests/app-vm.mjs) with a fake PAD that records every PAD.sfx, PAD.music and PAD.ambience call and the frame
// it came in. Checked: every song parses and its channels are the same length; the sound changes nothing on screen;
// each place and fight gets its song and ambience; a cutscene skipped with START ends with the same sound as one
// watched; no second ever has more than 16 effects; an old runtime (no PAD.music) gets only its named sounds;
// the music room appears once the game is cleared; each speaker has a voice of their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import vm from "node:vm";
import { ROOT, read, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const APP = join(ROOT, "registry", "apps", "zhenyao-tower", "index.html");
const PLAY = join(ROOT, "tests", "zhenyao-play.js");
const MUSIC_DIR = "registry/apps/zhenyao-tower/src/music";
const C = runScript("runtime/chip.js", {}).LopdaChip;
const plain = (x) => JSON.parse(JSON.stringify(x));
const NAMED = ["tap", "tick", "move", "ok", "err", "hit", "miss", "coin", "win", "lose"];

/* the songs as the game has them: every file of src/music/ in one context */
function songs() {
  const ctx = vm.createContext({});
  for (const f of readdirSync(join(ROOT, MUSIC_DIR)).sort()) vm.runInContext(read(MUSIC_DIR + "/" + f), ctx);
  return plain(vm.runInContext("MUSIC", ctx));
}

/* the game with a PAD of runtime 0.13 (music and ambience) or older (old: no music), recording what it is asked to play.
   It has no PAD.on, so lo-game reads the keyboard and tests/zhenyao-play.js can drive it. */
function withPad(o = {}) {
  const calls = [], store = {};
  let app = null;
  const f = () => (app ? app.hashes.length : 0);
  const pad = { lang: "zh", spec: "lopda/1", exit() {},
    load: (k) => Promise.resolve(k in store ? JSON.parse(store[k]) : null), save: (k, v) => { store[k] = JSON.stringify(v); }, remove: (k) => { delete store[k]; },
    sfx: (s) => calls.push({ f: f(), kind: "sfx", s: typeof s === "object" ? plain(s) : s }) };
  if (!o.old) {
    pad.music = { play: (song, opt) => calls.push({ f: f(), kind: "play", song, loop: opt && opt.loop }), stop: () => calls.push({ f: f(), kind: "stop" }) };
    pad.ambience = (name, level) => calls.push({ f: f(), kind: "amb", name, level });
  }
  app = boot(APP, { pad, extra: o.extra === false ? [] : [PLAY] });
  const MUSIC = app.ctx.get("MUSIC");
  const idOf = (song) => Object.keys(MUSIC).find((k) => MUSIC[k].song === song);
  /* what is sounding after the calls so far: the song (by id) and the ambience */
  const now = () => {
    const st = { song: null, amb: null, level: 0 };
    for (const c of calls) {
      if (c.kind === "play") st.song = idOf(c.song);
      if (c.kind === "stop") st.song = null;
      if (c.kind === "amb") { st.amb = c.name; st.level = c.name ? c.level : 0; }
    }
    return st;
  };
  return { app, get: app.ctx.get, calls, now, idOf };
}

/* buttons through keyboard events, held for three frames */
const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", a: "x", b: "z", start: "Enter" };
function driver(z) {
  const KE = z.get("KeyboardEvent"), send = z.get("dispatchEvent");
  const run = async (n, each) => { for (let i = 0; i < n; i++) { if (each && each()) return true; z.app.frame(); await new Promise((r) => setImmediate(r)); } return false; };
  const tap = async (b) => { send(new KE("keydown", { key: KEYS[b] })); await run(3); send(new KE("keyup", { key: KEYS[b] })); await run(3); };
  return { run, tap };
}

/* the most effects in any 60 frames (one second) */
function busiestSecond(calls) {
  const t = calls.filter((c) => c.kind === "sfx").map((c) => c.f);
  let most = 0;
  for (let i = 0, j = 0; i < t.length; i++) { while (t[i] - t[j] >= 60) j++; most = Math.max(most, i - j + 1); }
  return most;
}

test("every song parses, its four channels are the same length, and it fits", () => {
  const all = songs();
  assert.deepEqual(Object.keys(all).sort(), ["battle", "boss", "coda", "dawn", "road", "title", "tower", "towerUp", "town", "victory"]);
  for (const [id, t] of Object.entries(all)) {
    const r = plain(C.parse(t.song));
    assert.ok(r.song, `${id}: ${r.error}`);
    for (const ch of C.CHANNELS) {
      assert.equal(typeof t.song[ch], "string", `${id} uses ${ch}`);
      assert.equal(plain(C.parse({ bpm: t.song.bpm, [ch]: t.song[ch] })).song.beats, r.song.beats, `${id}: ${ch} is as long as the song`);
    }
    assert.ok(JSON.stringify(t.song).length < C.MAX_TEXT, id);
    assert.equal(typeof t.name, "string");
    assert.equal(t.loop, id !== "victory" && id !== "coda", `${id} loops or plays once`);
  }
  const v = plain(C.parse(all.victory.song)).song;
  assert.ok(v.seconds >= 2 && v.seconds <= 4, "the victory is 2-4 seconds");
  /* the two tower songs are the same tune; the upper one adds to it */
  assert.equal(all.tower.song.p1, all.towerUp.song.p1);
  /* each file says what it is: the mode, the speed, the parts */
  for (const f of readdirSync(join(ROOT, MUSIC_DIR))) {
    const head = read(MUSIC_DIR + "/" + f).split("*/")[0];
    for (const w of ["Mode", "bpm", "p1", "p2", "tri", "noise", "Original"]) assert.ok(head.includes(w), `${f} says ${w}`);
  }
});

test("the whole game with sound: the same frames as without, the right song and ambience everywhere, never more than 16 effects a second", async () => {
  const silent = boot(APP, { extra: [PLAY] });
  await silent.ctx.get("PLAY").run("full");
  const z = withPad();
  const get = z.get, PLACES = { town: ["town", null], road: ["road", "rain"], floor1: ["tower", null], floor2: ["towerUp", null], top: ["towerUp", "wind"] };
  const AREAS = { road: "rain", top: "wind" };
  let seen = { map: 0, battle: 0 }, held = 0, last = "", lastS = null, fights = 0;
  await get("PLAY").run("full", () => {
    /* the state a player can see: on a map with nothing going on, in a fight (the credits: the ending's test below) */
    const st = get("ZT").state(), S = get("Battle").S(), sound = z.now();
    let key = "", want = null;
    if (st.scene === "map" && !get("busy") && !get("Cut").playing() && PLACES[st.map]) { key = "map:" + st.map; want = PLACES[st.map]; }
    else if (st.scene === "battle" && S) { if (S !== lastS) { fights++; lastS = S; } key = "battle:" + S.area + "#" + fights; want = [S.b.boss ? "boss" : "battle", AREAS[S.area] || null]; }
    held = key && key === last ? held + 1 : 0;
    last = key;
    /* half a second in, so a song held back by the four-a-second limit has gone out (and a fight is not won yet) */
    if (want && held === 30) {
      assert.deepEqual([sound.song, sound.amb], want, `${key} at frame ${z.app.hashes.length}`);
      seen[key.split(":")[0]]++;
    }
  });
  assert.deepEqual(z.app.hashes, silent.hashes, "the sound changes no frame");
  /* the twelve fights of BATTLE.ROUTE */
  assert.ok(seen.map > 10 && seen.battle === 12, JSON.stringify(seen));
  assert.ok(get("ZT").state().ended, "the game was played to the end");

  const music = z.calls.filter((c) => c.kind !== "sfx" && c.kind !== "amb").map((c) => (c.kind === "stop" ? "stop" : z.idOf(c.song)));
  assert.equal(music[0], "title");
  /* the boss: the roof's song stops, a silence, then the boss's song; after it: the victory, the dawn, a silence, the coda
     (the run ends as the credits start; the roll is tested below) */
  const plays = z.calls.filter((c) => c.kind === "play" || c.kind === "stop");
  const bossAt = plays.findIndex((c) => c.kind === "play" && z.idOf(c.song) === "boss");
  assert.equal(plays[bossAt - 1].kind, "stop");
  assert.equal(z.idOf(plays[bossAt - 2].song), "towerUp");
  assert.ok(plays[bossAt].f - plays[bossAt - 1].f > 60, "a second or more of silence before the mirage");
  assert.deepEqual(music.slice(music.lastIndexOf("boss")), ["boss", "victory", "dawn", "stop", "coda"]);
  /* never the same song twice in a row: a song playing is not started again */
  for (let i = 1; i < music.length; i++) if (music[i] !== "stop") assert.notEqual(music[i], music[i - 1], `call ${i}`);
  /* the ambience at the end: wind on the roof, the last of the rain, the stream at dawn, nothing on the credits */
  const amb = z.calls.filter((c) => c.kind === "amb").map((c) => c.name + " " + c.level);
  assert.deepEqual(amb.slice(-4), ["wind 0.35", "rain 0.25", "stream 0.3", "null 0"]);
  const most = busiestSecond(z.calls);
  assert.ok(most <= 16, `${most} effects in one second`);
  assert.ok(z.calls.some((c) => c.kind === "sfx" && typeof c.s === "object"), "sounds of its own");
});

test("a fight in the tower: its own sounds, at most 16 a second, the same frames as without sound", async () => {
  const silent = boot(APP, { extra: [PLAY] });
  await silent.ctx.get("PLAY").run("tower");
  const z = withPad();
  await z.get("PLAY").run("tower");
  assert.deepEqual(z.app.hashes, silent.hashes);
  const most = busiestSecond(z.calls);
  assert.ok(most <= 16, `${most} effects in one second`);
  /* the scene casts the spells in turn until the fight is won: the first three at least */
  for (const n of ["swordCast", "swordFly", "tideCast", "tideWave", "tideFrost", "vineCast", "vineSqueeze", "encounter", "hit", "hurt", "down"]) assert.ok(heard(z, n), n);
});

/* an effect of src/sound.js was played: its first sound went out */
const heard = (z, name) => {
  const first = JSON.stringify(plain(z.get("Snd").FX[name].s[0]));
  return z.calls.some((c) => c.kind === "sfx" && JSON.stringify(c.s) === first);
};

test("演武: every spell, 七级浮屠 too, has its own sounds, and they stay within 16 a second", async () => {
  const z = withPad({ extra: false }), d = driver(z), get = z.get;
  await d.run(5);
  get("game.go('battle', { ids: ['golem', 'wraith', 'bronze'], area: 'top', hero: galleryHero(), demo: true, back: 'title', from: new Uint8Array(R.image.px) }, { fade: false })");
  const menu = (kind) => { const S = get("Battle").S(); return S && S.menu && S.menu.kind === kind; };
  const until = async (kind) => { assert.ok(await d.run(3000, () => menu(kind)), "the menu " + kind); };
  const ids = get("Rules").spellsAt(10);
  assert.equal(ids.length, 6);
  for (let k = 0; k < ids.length; k++) {
    /* the command menu: 法术; the list: spell k; the target: the first */
    await until("cmd"); get("Battle").S().menu.i = 1; await d.tap("a");
    await until("list"); get("Battle").S().menu.i = k; await d.tap("a");
    await until("target"); await d.tap("a");
  }
  await until("cmd");
  const want = ["swordCast", "swordFly", "tideCast", "tideWave", "tideFrost", "vineCast", "vineSqueeze", "charmCast", "charmFire",
    "sealCast", "sealSlam", "orb0", "orb1", "orb2", "orb3", "orb4", "pagodaCast", "pagodaSlam"];
  for (const n of want) assert.ok(heard(z, n), n);
  assert.ok(busiestSecond(z.calls) <= 16);
  /* the five orbs of 七级浮屠 are the five notes of the scale, rising */
  const orbs = [0, 1, 2, 3, 4].map((i) => get("Snd").FX["orb" + i].s[0].from);
  assert.deepEqual(orbs, [...orbs].sort((a, b) => a - b));
});

test("an old runtime without PAD.music: only the named sounds, and the same frames", async () => {
  const silent = boot(APP, { extra: [PLAY] });
  await silent.ctx.get("PLAY").run("tower");
  const z = withPad({ old: true });
  await z.get("PLAY").run("tower");
  assert.deepEqual(z.app.hashes, silent.hashes);
  const sfx = z.calls.filter((c) => c.kind === "sfx");
  assert.ok(sfx.length > 20);
  for (const c of sfx) assert.ok(NAMED.includes(c.s), JSON.stringify(c.s));
  assert.equal(z.calls.filter((c) => c.kind !== "sfx").length, 0);
  assert.equal(z.get("Snd").hasMusic(), false);
});

/* ---------- cutscenes: skipped or watched, the same sound after ----------
   start: code run in the game; up: one step north first (onto the roof's boss row); done: the cutscene is over.
   Watched: A through every line. Skipped: START and A as soon as it plays. */
async function cutscene({ start, up, done }, skip) {
  const z = withPad({ extra: false }), d = driver(z), get = z.get;
  await d.run(5);
  get(start);
  if (up) { await d.run(30); await d.tap("up"); }
  let skipped = false;
  for (let i = 0; i < 4000 && !done(get); i++) {
    const top = get("game").top(), overlay = top && !top.enter;
    if (skip && !skipped && get("Cut").playing()) { await d.run(20); await d.tap("start"); await d.tap("a"); skipped = true; }
    else if (overlay) await d.tap("a");
    else await d.run(1);
  }
  assert.ok(done(get), "the scene came to its end");
  assert.equal(skipped, skip);
  /* half a second for anything held back by the limit */
  await d.run(30);
  return { sound: z.now(), wanted: plain(get("Snd").wanted()) };
}
const onMap = (id) => (g) => g("where") === "map" && g("cur").id === id && !g("busy");
const CUTS = {
  "the town's intro": { start: "game.go('map', { id: 'town', intro: true, fresh: true }, { fade: false })", done: onMap("town"), is: ["town", null] },
  "arriving on the road": { start: "ZT.goto('road')", done: onMap("road"), is: ["road", "rain"] },
  "the boss's entrance": { start: "ZT.goto('top', { entered: true, x: 5, y: 7 })", up: true, is: ["boss", "wind"],
    done: (g) => { const S = g("where") === "battle" && g("Battle").S(); return !!(S && S.menu); } },
  "the pendant": { start: "ZT.goto('top', { entered: true, win: true })", done: (g) => g("where") === "map" && g("cur").id === "ending", is: [null, "rain"] },
  "the ending": { start: "ZT.goto('ending')", done: (g) => g("where") === "credits", is: ["coda", null] }
};
for (const [name, cut] of Object.entries(CUTS)) {
  test(`a skipped cutscene ends with the sound of a watched one: ${name}`, async () => {
    const watched = await cutscene(cut, false), skipped = await cutscene(cut, true);
    assert.deepEqual([watched.sound.song, watched.sound.amb], cut.is);
    assert.deepEqual(skipped.sound, watched.sound);
    assert.deepEqual(skipped.wanted, watched.wanted);
  });
}

test("序章 完 holds the coda; the credits roll to the title's music, which goes on into the title", async () => {
  const z = withPad({ extra: false }), d = driver(z), get = z.get;
  await d.run(5);
  get("ZT.goto('ending')");
  await d.run(30); await d.tap("start"); await d.tap("a");
  assert.ok(await d.run(600, () => get("where") === "credits"));
  await d.run(60);
  assert.deepEqual([z.now().song, get("cr").phase], ["coda", "end"]);
  assert.ok(await d.run(400, () => get("cr").phase === "roll"));
  await d.run(30);
  assert.equal(z.now().song, "title");
  const plays = z.calls.filter((c) => c.kind === "play").length;
  await d.tap("a"); await d.run(30); await d.tap("a");
  assert.ok(await d.run(300, () => get("where") === "title"));
  await d.run(60);
  assert.equal(z.calls.filter((c) => c.kind === "play").length, plays, "the title's music is not started again");
});

test("the music room: on the title only once the game is cleared; A plays, B goes back", async () => {
  const z = withPad({ extra: false }), d = driver(z), get = z.get;
  const lists = [];
  await d.run(5);
  const choose = get("game").choose;
  get("game").choose = (items, o) => { lists.push(items.slice()); return choose(items, o); };
  await d.tap("a"); await d.run(10);
  assert.deepEqual(lists.pop(), ["进入小镇", "演武"]);
  await d.tap("b"); await d.run(10);
  get("(Cut.seen.cleared = true)");
  await d.tap("a"); await d.run(10);
  assert.deepEqual(lists.pop(), ["进入小镇", "演武", "听曲"]);
  await d.tap("down"); await d.tap("down"); await d.tap("a"); await d.run(10);
  /* the list: A plays the first piece again from its start, down twice and A plays the road */
  const before = z.calls.length;
  await d.tap("a"); await d.run(30);
  await d.tap("down"); await d.tap("down"); await d.tap("a"); await d.run(30);
  const played = z.calls.slice(before).filter((c) => c.kind === "play").map((c) => z.idOf(c.song));
  assert.deepEqual(played, ["title", "road"]);
  /* ten pieces, the last one reached by scrolling */
  for (let i = 0; i < 7; i++) await d.tap("down");
  await d.tap("a"); await d.run(30);
  assert.equal(z.now().song, "coda");
  await d.tap("b"); await d.run(30);
  assert.equal(z.now().song, "title", "back on the title, its own music");
  assert.equal(get("where"), "title");
});

test("each speaker has a voice: 阿砚, 师父, 蜃妖 and 婆婆 at different pitches, a blip every few letters", async () => {
  const z = withPad({ extra: false }), d = driver(z), get = z.get;
  await d.run(5);
  const voices = {};
  for (const who of ["阿砚", "师父", "蜃妖", "婆婆", ""]) {
    const from = z.calls.length;
    get(`game.say("一二三四五六七八九十一二三", ${JSON.stringify(who ? { name: who } : {})})`);
    await d.run(40);
    const blips = z.calls.slice(from).filter((c) => c.kind === "sfx" && typeof c.s === "object");
    assert.ok(blips.length >= 2 && blips.length <= 4, `${who}: ${blips.length} blips for 13 letters`);
    voices[who] = Math.min(...blips.map((c) => c.s.from));
    await d.tap("a"); await d.run(5);
  }
  assert.equal(new Set(Object.values(voices)).size, 5, JSON.stringify(voices));
  /* the voice option: the master's name tag with the mirage's voice (「……呵。」) */
  const from = z.calls.length;
  get(`game.say("……呵。", { name: "师父", voice: "蜃妖" })`);
  await d.run(20);
  const b = z.calls.slice(from).find((c) => c.kind === "sfx" && typeof c.s === "object");
  assert.equal(b.s.wave, "triangle");
  assert.ok(b.s.vibrato.depth > 0);
});
