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

test("the pack is one chip species with 4 x 4 x 3 markings, 6 adult forms, 15 actions and a room", () => {
  assert.equal(P.id, "chip");
  assert.deepEqual(A.PACKS.chip, P);
  assert.deepEqual([...P.marks.ant], ["ball", "stick", "fork", "bent"]);
  assert.deepEqual([...P.marks.pat], ["plain", "dot", "stripe", "trace"]);
  assert.deepEqual([...P.marks.eye], ["dot", "bar", "big"]);
  assert.deepEqual([...P.forms], ["book", "walk", "scholar", "diary", "monster", "plain"]);
  assert.deepEqual([...P.faces], ["idle1", "idle2", "blink", "eat1", "eat2", "happy", "walk1", "walk2", "sleep", "wait", "surprised", "sad", "angry", "sulk", "hold"]);
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
  P.eggCrack.forEach((g, i) => assertGrid("eggCrack " + i, g));
  for (const id of P.forms) assertGrid("adult " + id, P.adult(id));
  for (const id of Object.keys(P.props)) assertGrid("prop " + id, P.props[id]);
  for (const id of ["bowl", "bowlEmpty", "poop", "sign", "zz"]) assertGrid("room " + id, P.room[id]);
  for (const id of Object.keys(P.icons)) assertGrid("icon " + id, P.icons[id]);
  for (const id of Object.keys(P.homeIcons)) assertGrid("home icon " + id, P.homeIcons[id], 16, 16);
  for (const s of P.souvenirs) assertGrid("souvenir " + s.id, s.grid);
});

test("egg: two cracked stages, same 16 x 16 box as the whole egg, and each one is a different picture", () => {
  assert.equal(P.eggCrack.length, 2);
  const whole = P.egg;
  const [small, big] = P.eggCrack;
  for (const [name, g] of [["small", small], ["big", big]]) {
    assertGrid("eggCrack " + name, g, 16, 16);
    assert.notDeepEqual(g, whole, `${name} crack is not the whole egg`);
    assert.deepEqual(g.slice(0, 2), whole.slice(0, 2), `${name} keeps the egg's top`);
    assert.deepEqual(g.slice(14), whole.slice(14), `${name} keeps the egg's bottom`);
  }
  assert.notDeepEqual(small, big, "the two stages differ");
  const changes = (g) => g.reduce((n, row, r) => n + [...row].filter((c, i) => c !== whole[r][i]).length, 0);
  assert.ok(changes(small) > 0 && changes(big) > changes(small), "the big crack changes more pixels than the small one");
});

test("floor props: the full and empty bowls are the same bowl, and a pile uses more than one tone", () => {
  const full = P.props.bowl, empty = P.props.bowlEmpty;
  assertGrid("bowl", full); assertGrid("bowlEmpty", empty);
  assert.match(full.slice(0, 3).join(""), /[dm]/, "food sits over the full bowl's rim");
  assert.match(empty.slice(0, 3).join(""), /^[.]+$/, "nothing sits over the empty bowl");
  assert.deepEqual(full.slice(3), empty.slice(3), "below the rim the two states are the same bowl");
  const tones = new Set(P.props.poop.join("").replace(/\./g, "").split(""));
  assert.ok(tones.has("k") && tones.has("m") && tones.has("d"), "a pile has an ink edge, a mid body and dark turns");
});

test("frames: every action with all 48 markings is 16 x 16", () => {
  for (const [name, g] of frameGrids()) assertGrid(name, g, 16, 16);
  assert.equal(frameGrids().length, 15 * 4 * 4 * 3);
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

test("homeIcons: five 16 x 16 states, all different, the egg is the pack's egg", () => {
  const keys = Object.keys(P.homeIcons).sort();
  assert.deepEqual(keys, ["away", "egg", "face", "need", "sleep"]);
  for (const key of keys) assertGrid("homeIcons " + key, P.homeIcons[key], 16, 16);
  assert.deepEqual(P.homeIcons.egg, P.egg, "the egg home icon is the same egg");
  const seen = new Set(keys.map((k) => P.homeIcons[k].join("\n")));
  assert.equal(seen.size, keys.length, "each state is a different picture");
  assert.match(P.homeIcons.need.join(""), /k/, "the need icon has a visible mark");
  assert.notDeepEqual(P.homeIcons.sleep, P.homeIcons.face, "sleeping closes the eyes");
});

test("drawRoom: every weather draws only inside the window, day and night", () => {
  const base = { pet: P.frames({ face: "idle1" }), petX: 32, petY: 31, dayOfMonth: 24, bowlFull: true, mess: 1, season: "" };
  for (const night of [false, true]) {
    const before = room({ ...base, night, weather: null });
    for (const weather of ["sun", "cloud", "rain", "snow", "wind"]) {
      const after = room({ ...base, night, weather });
      let inside = 0, outside = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (before[i] === after[i]) continue;
        if (x >= 5 && x < 25 && y >= 6 && y < 22) inside++; else outside++;
      }
      if(!(night && weather === "sun")) assert.ok(inside > 0, `${weather}${night ? " at night" : ""} draws in the window`);
      assert.equal(outside, 0, `${weather}${night ? " at night" : ""} changes nothing else`);
    }
  }
  /* a clear night is the same moon, whichever way the day started */
  assert.deepEqual([...room({ ...base, night: true, weather: "sun" })], [...room({ ...base, night: true, weather: null })]);
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

test("drawRoom: the rug is a bordered rectangle under the pet, and a full bowl differs from an empty one", () => {
  const base = { dayOfMonth: 24, mess: 0 };
  const full = room({ ...base, bowlFull: true });
  assert.equal(full[48 * W + 38], 0, "the rug's top-left corner is its ink border");
  assert.equal(full[52 * W + 53], 0, "the rug's bottom-right corner is its ink border");
  assert.equal(full[49 * W + 39], 3, "the rug has a paper field inside the border");
  assert.equal(full[50 * W + 46], 1, "the rug has a pattern in the middle");
  const empty = room({ ...base, bowlFull: false });
  let changed = 0;
  for (let y = 47; y < 54; y++) for (let x = 9; x < 19; x++) if (full[y * W + x] !== empty[y * W + x]) changed++;
  assert.ok(changed > 0, "food in the bowl changes the bowl, not something else");
  let outside = 0;
  for (let i = 0; i < W * H; i++) if (full[i] !== empty[i]) {
    const x = i % W, y = Math.floor(i / W);
    if (x < 9 || x >= 19 || y < 47 || y >= 54) outside++;
  }
  assert.equal(outside, 0, "only the bowl changes with the food");
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

test("poses: every standard pose exists for every mark combination, 16 x 16, only .kdmp", () => {
  assert.deepEqual(Object.keys(A.POSE_NAMES).sort(), ["front", "side"]);
  assert.deepEqual([...A.POSE_NAMES.front], ["idle", "happy", "sad", "angry", "sulk", "blink", "jump", "fall", "catch"]);
  assert.deepEqual([...A.POSE_NAMES.side], ["walk1", "walk2", "jump", "flap1", "flap2"]);
  for (const view of Object.keys(A.POSE_NAMES)) {
    assert.deepEqual(Object.keys(P.poses[view]).sort(), [...A.POSE_NAMES[view]].sort(), `the pack provides every ${view} pose`);
    for (const name of A.POSE_NAMES[view]) for (const ant of P.marks.ant) for (const pat of P.marks.pat) for (const eye of P.marks.eye) {
      assertGrid(`${view}/${name} ${ant}/${pat}/${eye}`, A.pose(P, { ant, pat, eye }, view, name), 16, 16);
    }
  }
  /* the marks show in the side view too, and every front pose is its own picture */
  assert.notDeepEqual(A.pose(P, { ant: "ball", pat: "dot", eye: "dot" }, "side", "walk1"),
    A.pose(P, { ant: "fork", pat: "stripe", eye: "big" }, "side", "walk1"));
  const pictures = new Set(A.POSE_NAMES.front.map((n) => A.pose(P, {}, "front", n).join("\n")));
  assert.equal(pictures.size, A.POSE_NAMES.front.length, "the six front poses differ");
});

test("moods: sad, angry and sulk are real faces, different from idle and from each other, marks included", () => {
  const idle = A.pose(P, {}, "front", "idle");
  const sad = A.pose(P, {}, "front", "sad");
  const angry = A.pose(P, {}, "front", "angry");
  const sulk = A.pose(P, {}, "front", "sulk");
  for (const [name, g] of [["sad", sad], ["angry", angry], ["sulk", sulk]]) {
    assertGrid(name, g, 16, 16);
    assert.notDeepEqual(g, idle, `${name} is not the neutral wait face`);
  }
  assert.notDeepEqual(sad, angry); assert.notDeepEqual(sad, sulk); assert.notDeepEqual(angry, sulk);
  /* the mouth turns down (corners lower than the middle) and the sad eyes are not the old flat wait eyes */
  assert.notDeepEqual(sad, A.pose(P, {}, "front", "idle"));
  const mouth = (g) => g[9].split("").map((c, i) => c !== "." ? i : -1).filter((i) => i >= 0);
  assert.ok(mouth(sad).includes(6) && mouth(sad).includes(9), "the sad mouth has low corners");
  assert.equal(angry[4][4], "k", "anger draws a slanted brow");
  assert.equal(angry[6][4], "k", "and a narrowed eye below it");
  /* every mark combination still shows its antenna and pattern */
  for (const ant of P.marks.ant) for (const pat of P.marks.pat) for (const eye of P.marks.eye) {
    const g = A.pose(P, { ant, pat, eye }, "front", "angry");
    assertGrid(`angry ${ant}/${pat}/${eye}`, g, 16, 16);
  }
  assert.notDeepEqual(A.pose(P, { ant: "fork", pat: "trace" }, "front", "sad"),
    A.pose(P, { ant: "ball", pat: "plain" }, "front", "sad"), "the marks still show in a mood");
});
test("baby and child: moods, idle and every game pose use their own small body", () => {
  const marks = { ant: "fork", pat: "trace", eye: "big" };
  for (const stage of ["baby", "child"]) {
    const pose = (name) => A.stagePose(P, stage, marks, "front", name);
    const idle = pose("idle");
    assertGrid(stage + " idle", idle, 16, 16);
    for (const name of ["sad", "angry", "sulk", "blink", "happy", "jump", "fall", "catch", "walk1", "walk2"]) {
      const g = pose(name);
      assertGrid(stage + " " + name, g, 16, 16);
      assert.notDeepEqual(g, idle, stage + " " + name + " differs from idle");
    }
    assert.notDeepEqual(pose("sad"), pose("angry"));
    assert.notDeepEqual(pose("sad"), pose("sulk"));
    assert.notDeepEqual(pose("angry"), pose("sulk"));
    /* the game asks for the side walk: the stage still answers with its own body, not the full chip */
    assert.deepEqual(A.stagePose(P, stage, marks, "side", "walk1"), pose("walk1"));
    assert.notDeepEqual(pose("walk1"), A.pose(P, marks, "side", "walk1"));
    /* the face really changes inside the same body: the outline row is untouched */
    assert.equal(pose("sad")[6], idle[6], stage + " keeps its body outline");
  }
});

test("mirror: reverses every row, twice is the original", () => {
  const g = A.pose(P, { ant: "bent", pat: "trace", eye: "big" }, "side", "walk2");
  const m = A.mirror(g);
  assert.equal(m.length, 16);
  for (let r = 0; r < 16; r++) assert.equal(m[r], [...g[r]].reverse().join(""), `row ${r}`);
  assert.deepEqual(A.mirror(m), g);
  assert.equal(A.mirror(null), null);
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
