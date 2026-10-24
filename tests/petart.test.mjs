// runtime/petart.js: the chip species pack, its grids, the room painter and the souvenir strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, EMOJI } from "./helpers.mjs";

const A = runScript("runtime/petart.js").LopdaPetArt;
const P = A.PACKS.chip;
const loadStrings = (lang) => runScript("runtime/strings.js", { navigator: { languages: [lang], language: lang } }).LopdaStrings;
const ZH = loadStrings("zh-CN"), EN = loadStrings("en-US");
const zh = ZH.t, en = EN.t;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const W = 81, H = 60;
function room(scene) {
  const buf = new Uint8Array(W * H);
  A.drawRoom(buf, W, H, scene);
  return buf;
}
function assertGrid(name, g, w, h) {
  assert.ok(Array.isArray(g) && g.length > 0, `${name} is a non-empty array`);
  const width = String(g[0]).length;
  assert.ok(width > 0, `${name} has a width`);
  for (let r = 0; r < g.length; r++) {
    assert.equal(typeof g[r], "string", `${name} row ${r} is a string`);
    assert.equal(g[r].length, width, `${name} row ${r} is rectangular`);
    assert.match(g[r], /^[.kdmp]+$/, `${name} row ${r} uses only .kdmp`);
  }
  if (w !== undefined) assert.equal(width, w, `${name} is ${w} wide`);
  if (h !== undefined) assert.equal(g.length, h, `${name} is ${h} high`);
  return g;
}
function frameGrids() {
  const out = [];
  for (const face of P.faces) for (const ant of P.marks.ant) for (const pat of P.marks.pat) for (const eye of P.marks.eye) {
    out.push([`frames ${face} ${ant}/${pat}/${eye}`, P.frames({ ant, pat, eye, face })]);
  }
  return out;
}

test("the pack is one chip species with 4 x 4 x 3 markings, 6 adult forms, 12 actions and a room", () => {
  assert.equal(P.id, "chip");
  assert.deepEqual(A.PACKS.chip, P);
  assert.deepEqual([...P.marks.ant], ["ball", "stick", "fork", "bent"]);
  assert.deepEqual([...P.marks.pat], ["plain", "dot", "stripe", "trace"]);
  assert.deepEqual([...P.marks.eye], ["dot", "bar", "big"]);
  assert.deepEqual([...P.forms], ["book", "walk", "scholar", "diary", "monster", "plain"]);
  assert.deepEqual([...P.faces], ["idle1", "idle2", "blink", "eat1", "eat2", "happy", "walk1", "walk2", "sleep", "wait", "surprised", "hold"]);
  assert.deepEqual([...A.TONES], ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"]);
  assert.equal(P.room.w, 81);
  assert.equal(P.room.h, 60);
  assert.equal(P.room.petX, 40);
  assert.equal(P.room.petY, 36);
  assert.equal(typeof P.room.draw, "function");
  for (const id of ["bowl", "bowlEmpty", "poop", "sign", "zz"]) assert.equal(P.room[id], P.props[id], `room ${id} is the pack's own grid`);
});

test("every grid in the pack is rectangular and uses only .kdmp", () => {
  for (const [name, g] of frameGrids()) assertGrid(name, g);
  for (const id of ["egg", "baby", "child"]) assertGrid(id, P[id]);
  for (const id of P.forms) assertGrid("adult " + id, P.adult(id));
  for (const id of Object.keys(P.props)) assertGrid("prop " + id, P.props[id]);
  for (const id of ["bowl", "bowlEmpty", "poop", "sign", "zz"]) assertGrid("room " + id, P.room[id]);
  for (const id of Object.keys(P.icons)) assertGrid("icon " + id, P.icons[id]);
  for (const s of P.souvenirs) assertGrid("souvenir " + s.id, s.grid);
});

test("frames: every action with all 48 markings is 16 x 16", () => {
  for (const [name, g] of frameGrids()) assertGrid(name, g, 16, 16);
  assert.equal(frameGrids().length, 12 * 4 * 4 * 3);
  /* the two resting postures use a drooped antenna, so the rolled mark does not show there */
  assert.deepEqual(P.frames({ face: "sleep", ant: "fork" }), P.frames({ face: "sleep", ant: "ball" }));
  assert.notDeepEqual(P.frames({ face: "idle1", ant: "fork" }), P.frames({ face: "idle1", ant: "ball" }));
});

test("frames: an unknown face falls back to idle1, eyes included", () => {
  const idle = P.frames({ face: "idle1", ant: "fork", pat: "stripe", eye: "big" });
  assert.deepEqual(P.frames({ face: "idle", ant: "fork", pat: "stripe", eye: "big" }), idle);
  assert.deepEqual(P.frames({ face: "not-a-face", ant: "fork", pat: "stripe", eye: "big" }), idle);
  assert.notDeepEqual(P.frames({ face: "blink", ant: "fork", pat: "stripe", eye: "big" }), idle);
});

test("adult: all six forms are 20 x 20", () => {
  for (const id of P.forms) assertGrid("adult " + id, P.adult(id), 20, 20);
  for (const id of P.forms.filter((f) => f !== "plain")) {
    assert.notDeepEqual(P.adult(id), P.adult("plain"), `${id} has its own accessory`);
  }
});

test("souvenirs: exactly 20 original finds, 16 x 16, unique ids, postcard kept", () => {
  assert.equal(P.souvenirs.length, 20);
  assert.ok(P.souvenirs.length >= 18);
  const seen = new Set();
  for (const s of P.souvenirs) {
    assert.ok(/^[a-z]+$/.test(s.id), `${s.id} is a plain id`);
    assert.ok(!seen.has(s.id), `${s.id} is unique`);
    seen.add(s.id);
    assertGrid("souvenir " + s.id, s.grid, 16, 16);
  }
  assert.ok(seen.has("post"));
  assert.deepEqual(Object.keys(P.icons).sort(), ["box", "call", "food", "light", "look", "mail", "play", "wash"]);
});

test("drawRoom: 81 x 60 and only tone indices 0-3", () => {
  for (const scene of [
    { pet: P.frames({ face: "idle1" }), petX: 32, petY: 31, dayOfMonth: 24, bowlFull: true, mess: 1 },
    { night: true, dayOfMonth: 3, bowlFull: false, mess: 3, zz: true, lightOff: true },
    { pet: null, sign: true, prop: P.props.card, dayOfMonth: 31, season: "winter" }
  ]) {
    const buf = room(scene);
    assert.equal(buf.length, W * H);
    assert.deepEqual([...new Set(buf)].sort(), [0, 1, 2, 3]);
  }
});

test("drawRoom: the pet's pixels appear where it is placed", () => {
  const pet = P.frames({ face: "idle1", ant: "fork", pat: "trace", eye: "big" });
  const base = { petX: 30, petY: 30, dayOfMonth: 24, bowlFull: true, mess: 0 };
  const withPet = room({ ...base, pet });
  const without = room({ ...base, pet: null });
  let inside = 0, outside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (withPet[i] === without[i]) continue;
    if (x >= 30 && x < 46 && y >= 30 && y < 46) inside++; else outside++;
  }
  assert.ok(inside > 0, "the pet changed pixels inside its box");
  assert.equal(outside, 0, "nothing else moved");
});

test("drawRoom: a pet without coordinates uses the room spot for the pet, prop and Zz", () => {
  const pet = P.frames({ face: "idle1", ant: "fork", pat: "trace", eye: "big" });
  const base = { pet, prop: P.props.card, zz: true, dayOfMonth: 24, bowlFull: true, mess: 0 };
  const implicit = room(base);
  const explicit = room({ ...base, petX: P.room.petX, petY: P.room.petY });
  assert.deepEqual([...implicit], [...explicit], "the default is the room's pet spot");

  function changed(a, b, x0, x1, y0, y1) {
    let inside = 0, outside = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a[i] === b[i]) continue;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) inside++; else outside++;
    }
    return { inside, outside };
  }
  const petDiff = changed(implicit, room({ ...base, pet: null }), 40, 56, 36, 52);
  assert.ok(petDiff.inside > 0, "the pet is at (40,36)");
  assert.equal(petDiff.outside, 0);
  const propDiff = changed(implicit, room({ ...base, prop: null }), 57, 66, 45, 52);
  assert.ok(propDiff.inside > 0, "the prop follows the pet");
  assert.equal(propDiff.outside, 0);
  const zzDiff = changed(implicit, room({ ...base, zz: false }), 53, 65, 26, 38);
  assert.ok(zzDiff.inside > 0, "Zz follows the pet");
  assert.equal(zzDiff.outside, 0);
});

test("drawRoom: a second pack brings its own room props", () => {
  const fakePoop = ["pp", "pp"];
  const fake = {
    id: "fake",
    room: {
      w: 81, h: 60, petX: 40, petY: 36,
      bowl: P.room.bowl, bowlEmpty: P.room.bowlEmpty, poop: fakePoop,
      sign: P.room.sign, zz: P.room.zz, poops: [[12, 55]], draw: P.room.draw
    }
  };
  const withFake = room({ pack: fake, mess: 1, dayOfMonth: 24, bowlFull: true });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    assert.equal(withFake[(55 + r) * W + 12 + c], 3, "the fake pack's poop is drawn");
  }
  const withChip = room({ mess: 1, dayOfMonth: 24, bowlFull: true });
  assert.notEqual(withChip[55 * W + 12], 3, "the chip room did not draw the fake grid");
});

test("drawRoom: lightOff maps paper-mid-dark-ink one step darker", () => {
  const scene = { pet: P.frames({ face: "happy" }), petX: 28, petY: 29, dayOfMonth: 9, bowlFull: false, mess: 2 };
  const on = room(scene), off = room({ ...scene, lightOff: true });
  const map = [0, 0, 1, 2];
  for (let i = 0; i < on.length; i++) assert.equal(off[i], map[on[i]], `pixel ${i}`);
});

test("drawRoom: Zz stays paper after the light goes off", () => {
  const scene = { pet: P.frames({ face: "sleep", ant: "ball" }), petX: 30, petY: 30, dayOfMonth: 24, zz: true };
  const lit = room({ ...scene, lightOff: true });
  const noZz = room({ ...scene, zz: false, lightOff: true });
  let changed = 0;
  for (let i = 0; i < lit.length; i++) if (lit[i] !== noZz[i]) {
    changed++;
    assert.equal(lit[i], 3, `Zz pixel ${i} is paper`);
  }
  assert.ok(changed > 0, "Zz is drawn");
});

test("drawRoom: every day 1-31 has distinct pixels in the calendar's paper area", () => {
  const base = { bowlFull: true, mess: 0 };
  const seen = new Set();
  for (let day = 1; day <= 31; day++) {
    const buf = room({ ...base, dayOfMonth: day });
    let sig = "";
    for (let y = 9; y < 19; y++) for (let x = 32; x < 41; x++) sig += buf[y * W + x];
    seen.add(sig);
  }
  assert.equal(seen.size, 31);
});

test("drawRoom: night and season change only the window", () => {
  const base = { pet: P.frames({ face: "idle1" }), petX: 32, petY: 31, dayOfMonth: 24, bowlFull: true, mess: 0 };
  const day = room({ ...base, night: false, season: "" });
  const night = room({ ...base, night: true, season: "" });
  const spring = room({ ...base, night: false, season: "spring" });
  const winter = room({ ...base, night: false, season: "winter" });
  function windowDiff(a, b) {
    let d = 0;
    for (let y = 6; y < 22; y++) for (let x = 5; x < 25; x++) if (a[y * W + x] !== b[y * W + x]) d++;
    return d;
  }
  assert.ok(windowDiff(day, night) > 0);
  assert.ok(windowDiff(spring, winter) > 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= 5 && x < 25 && y >= 6 && y < 22) continue;
    assert.equal(day[y * W + x], spring[y * W + x], `season changed the room at ${x},${y}`);
    assert.equal(day[y * W + x], night[y * W + x], `night changed the room at ${x},${y}`);
  }
});

test("blit and darken are bounded and map the four tones", () => {
  const buf = new Uint8Array(5 * 4).fill(3);
  A.blit(buf, 5, 4, ["kd", "mp"], 1, 1);
  assert.equal(buf[1 * 5 + 1], 0);
  assert.equal(buf[1 * 5 + 2], 1);
  assert.equal(buf[2 * 5 + 1], 2);
  assert.equal(buf[2 * 5 + 2], 3);
  A.blit(buf, 5, 4, ["kk"], 10, 10);
  assert.equal(buf.filter((v) => v === 0).length, 1, "outside the buffer is ignored");
  A.darken(buf);
  assert.deepEqual([...new Set(buf)].sort(), [0, 1, 2]);
});

test("every souvenir has a name and one line in zh and en, with no emoji", () => {
  for (const { id } of P.souvenirs) {
    const key = "pet.souv." + id, lineKey = key + ".line";
    for (const [lang, table] of [["zh", ZH.STR.zh], ["en", EN.STR.en]]) {
      assert.ok(own(table, key), `${lang} ${key} exists`);
      assert.ok(own(table, lineKey), `${lang} ${lineKey} exists`);
      assert.ok(!EMOJI.test(table[key]) && !EMOJI.test(table[lineKey]), `${lang} ${id} has no emoji`);
      assert.ok(!/[!！]/.test(table[key] + table[lineKey]), `${lang} ${id} has no exclamation mark`);
    }
    assert.ok([...ZH.STR.zh[key]].length <= 8, `${id} zh name is short`);
    assert.ok([...ZH.STR.zh[lineKey]].length <= 40, `${id} zh line is short`);
    assert.ok(EN.STR.en[key].length <= 16, `${id} en name is short`);
  }
  assert.equal(zh("pet.souv.post"), "明信片");
});
