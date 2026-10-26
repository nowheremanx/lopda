// runtime/petart.js: the chip species pack at 32 x 32, the 162 x 120 room and the souvenir strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, EMOJI } from "./helpers.mjs";

const A = runScript("runtime/petart.js").LopdaPetArt;
const P = A.PACKS.chip;
const loadStrings = (lang) => runScript("runtime/strings.js", { navigator: { languages: [lang], language: lang } }).LopdaStrings;
const ZH = loadStrings("zh-CN"), EN = loadStrings("en-US");
const zh = ZH.t, en = EN.t;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const W = 162, H = 120;
const STAGES = ["baby", "child", "adult"];
const FRONT = [...A.FRAME_NAMES];
const SIDE = [...A.POSE_NAMES.side];
function room(scene, w = W, h = H) {
  const buf = new Uint8Array(w * h);
  A.drawRoom(buf, w, h, scene);
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
function changed(a, b, x0, x1, y0, y1) {
  let inside = 0, outside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (a[i] === b[i]) continue;
    if (x >= x0 && x < x1 && y >= y0 && y < y1) inside++; else outside++;
  }
  return { inside, outside };
}

test("pack: one chip species with 6 antennas, 3 eye shapes, 6 forms and a 162 x 120 room", () => {
  assert.equal(P.id, "chip");
  assert.deepEqual(A.PACKS.chip, P);
  assert.deepEqual([...P.marks.ant], ["orb", "triangle", "crook", "curl", "prongs", "star"]);
  assert.deepEqual([...P.marks.eye], ["round", "wide", "sleepy"]);
  assert.equal(P.marks.pat, undefined, "the body pattern is gone from the pack");
  assert.deepEqual([...P.forms], ["book", "walk", "scholar", "diary", "monster", "plain"]);
  assert.deepEqual([...P.faces], ["idle1", "idle2", "blink", "eat1", "eat2", "happy", "walk1", "walk2", "sleep", "wait", "surprised", "sad", "angry", "sulk", "hold"]);
  assert.deepEqual([...A.TONES], ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"]);
  assert.equal(A.ROOM_W, 162);
  assert.equal(A.ROOM_H, 120);
  assert.equal(P.room.w, 162);
  assert.equal(P.room.h, 120);
  assert.equal(P.room.petX, 83);
  assert.equal(P.room.petY, 69);
  assert.equal(typeof P.room.draw, "function");
  for (const id of ["bowl", "bowlEmpty", "poop", "sign", "zz"]) assert.equal(P.room[id], P.props[id], `room ${id} is the pack's own grid`);
});

test("every grid in the pack is rectangular and uses only .kdmp", () => {
  for (const stage of STAGES) for (const name of FRONT) for (const ant of P.marks.ant) for (const eye of P.marks.eye) {
    assertGrid(`${stage} ${name} ${ant}/${eye}`, A.stagePose(P, stage, { ant, eye }, "front", name), 32, 32);
  }
  for (const stage of STAGES) for (const name of SIDE) for (const ant of P.marks.ant) for (const eye of P.marks.eye) {
    assertGrid(`${stage} side ${name} ${ant}/${eye}`, A.stagePose(P, stage, { ant, eye }, "side", name), 32, 32);
  }
  for (const id of ["egg", "baby", "child"]) assertGrid(id, P[id], 32, 32);
  P.eggCrack.forEach((g, i) => assertGrid("eggCrack " + i, g, 32, 32));
  for (const id of P.forms) assertGrid("adult " + id, P.adult(id), 32, 32);
  for (const id of Object.keys(P.props)) assertGrid("prop " + id, P.props[id]);
  for (const id of Object.keys(P.icons)) assertGrid("icon " + id, P.icons[id], 8, 8);
  for (const id of Object.keys(P.homeIcons)) assertGrid("home icon " + id, P.homeIcons[id], 16, 16);
  for (const s of P.souvenirs) assertGrid("souvenir " + s.id, s.grid, 16, 16);
});

test("frames: every stage x every frame x 6 antennas x 3 eyes is a visible 32 x 32", () => {
  let count = 0;
  for (const stage of STAGES) {
    for (const name of FRONT) {
      for (const ant of P.marks.ant) for (const eye of P.marks.eye) {
        const g = A.stagePose(P, stage, { ant, eye }, "front", name);
        assertGrid(`${stage} ${name} ${ant}/${eye}`, g, 32, 32);
        assert.ok(A.frameInk(g) >= 60, `${stage} ${name} ${ant}/${eye} has ${A.frameInk(g)} ink/dark pixels`);
        count++;
      }
    }
  }
  assert.equal(count, 3 * FRONT.length * 6 * 3);
  /* the side view is the same promise for the five standard side poses */
  let sideCount = 0;
  for (const stage of STAGES) for (const name of SIDE) for (const ant of P.marks.ant) for (const eye of P.marks.eye) {
    const g = A.stagePose(P, stage, { ant, eye }, "side", name);
    assertGrid(`${stage} side ${name} ${ant}/${eye}`, g, 32, 32);
    assert.ok(A.frameInk(g) >= 60, `${stage} side ${name} has ${A.frameInk(g)} ink/dark pixels`);
    sideCount++;
  }
  assert.equal(sideCount, 3 * SIDE.length * 6 * 3);
  /* a few faces must actually differ: the expressions are not one idle frame copied around */
  const marks = { ant: "orb", eye: "round" };
  const idle = A.stagePose(P, "adult", marks, "front", "idle1");
  for (const name of ["blink", "eat1", "eat2", "happy", "sleep", "wait", "surprised", "sad", "angry", "sulk", "jump", "fall", "catch"]) {
    assert.notDeepEqual(A.stagePose(P, "adult", marks, "front", name), idle, `adult ${name} is not idle`);
  }
  assert.notDeepEqual(A.stagePose(P, "adult", marks, "side", "walk1"), A.stagePose(P, "adult", marks, "side", "walk2"));
  assert.notDeepEqual(A.stagePose(P, "adult", marks, "front", "lookL"), A.stagePose(P, "adult", marks, "front", "lookR"));
});

test("frames: an unknown face falls back to idle1, eyes and antenna included", () => {
  const idle = P.frames({ face: "idle1", ant: "crook", eye: "wide" });
  assert.deepEqual(P.frames({ face: "idle", ant: "crook", eye: "wide" }), idle);
  assert.deepEqual(P.frames({ face: "not-a-face", ant: "crook", eye: "wide" }), idle);
  assert.notDeepEqual(P.frames({ face: "blink", ant: "crook", eye: "wide" }), idle);
  assert.notDeepEqual(P.frames({ face: "idle1", ant: "orb", eye: "wide" }), P.frames({ face: "idle1", ant: "star", eye: "wide" }));
  assert.notDeepEqual(P.frames({ face: "idle1", ant: "orb", eye: "round" }), P.frames({ face: "idle1", ant: "orb", eye: "sleepy" }));
});

test("marks: new names, old save indices, and pat ignored", () => {
  assert.equal(P.marks.ant.length, 6);
  assert.equal(P.marks.eye.length, 3);
  const old = { ant: 2, pat: 3, eye: 1 };
  const mapped = { ant: "crook", eye: "wide" };
  for (const stage of STAGES) for (const name of ["idle1", "happy", "sad"]) {
    assert.deepEqual(
      A.stagePose(P, stage, old, "front", name),
      A.stagePose(P, stage, mapped, "front", name),
      `${stage} ${name}: old ant/eye indices map to the same look`
    );
  }
  assert.deepEqual(A.stagePose(P, "adult", { ant: 0, eye: 0 }, "front", "idle1"),
    A.stagePose(P, "adult", { ant: "orb", eye: "round" }, "front", "idle1"));
  assert.deepEqual(A.stagePose(P, "adult", { ant: 3, eye: 2 }, "front", "idle1"),
    A.stagePose(P, "adult", { ant: "curl", eye: "sleepy" }, "front", "idle1"));
  const withPat = A.stagePose(P, "adult", { ant: "orb", pat: "stripe", eye: "round" }, "front", "idle1");
  const withoutPat = A.stagePose(P, "adult", { ant: "orb", eye: "round" }, "front", "idle1");
  assert.deepEqual(withPat, withoutPat, "pat no longer changes the body");
});

test("adult forms: six 32 x 32 forms, each accessory tells it apart, every face shows", () => {
  for (const form of P.forms) {
    const g = P.adult(form, { ant: "orb", eye: "round" });
    assertGrid(`adult ${form}`, g, 32, 32);
    assert.ok(A.frameInk(g) >= 60, `adult ${form} has ink`);
  }
  const plain = P.adult("plain", { ant: "orb", eye: "round" });
  const seen = new Set();
  for (const form of P.forms) {
    const g = P.adult(form, { ant: "orb", eye: "round" });
    if (form !== "plain") assert.notDeepEqual(g, plain, `${form} has its own accessory`);
    seen.add(g.join("\n"));
  }
  assert.equal(seen.size, P.forms.length, "all six forms are different pictures");
  for (const form of P.forms) {
    const neutral = P.adult(form, { face: "idle1", ant: "orb", eye: "round" });
    for (const face of ["happy", "sleep", "wait", "surprised", "blink", "sad", "angry", "sulk"]) {
      const g = P.adult(form, { face, ant: "orb", eye: "round" });
      assertGrid(`adult ${form} ${face}`, g, 32, 32);
      assert.notDeepEqual(g, neutral, `${form} ${face} is not the neutral face`);
    }
    assert.notDeepEqual(P.adult(form, { face: "sad" }), P.adult(form, { face: "angry" }));
    assert.notDeepEqual(P.adult(form, { face: "angry" }), P.adult(form, { face: "sulk" }));
  }
});

test("adult forms: every form x every frame x 6 antennas x 3 eyes is a visible 32 x 32", () => {
  let count = 0;
  for (const form of P.forms) {
    for (const name of FRONT) for (const ant of P.marks.ant) for (const eye of P.marks.eye) {
      const g = P.adult(form, { face: name, ant: ant, eye: eye });
      assertGrid(`adult ${form} ${name} ${ant}/${eye}`, g, 32, 32);
      assert.ok(A.frameInk(g) >= 60, `adult ${form} ${name} ${ant}/${eye} has ${A.frameInk(g)} ink/dark pixels`);
      count++;
    }
  }
  assert.equal(count, P.forms.length * FRONT.length * 6 * 3);
});

test("egg: 32 x 32, one clean shell and two growing cracks", () => {
  assert.equal(P.eggCrack.length, 2);
  const whole = P.egg;
  const [small, big] = P.eggCrack;
  assertGrid("egg", whole, 32, 32);
  for (const [name, g] of [["small", small], ["big", big]]) {
    assertGrid("eggCrack " + name, g, 32, 32);
    assert.notDeepEqual(g, whole, `${name} crack is not the whole egg`);
    assert.deepEqual(g.slice(0, 4), whole.slice(0, 4), `${name} keeps the egg's top`);
    assert.deepEqual(g.slice(18), whole.slice(18), `${name} keeps the egg's bottom`);
  }
  assert.notDeepEqual(small, big, "the two stages differ");
  const changes = (g) => g.reduce((n, row, r) => n + [...row].filter((c, i) => c !== whole[r][i]).length, 0);
  assert.ok(changes(small) > 0 && changes(big) > changes(small), "the big crack changes more pixels than the small one");
});

test("poses: the standard vocabulary, the side view and the mirror", () => {
  assert.deepEqual(Object.keys(A.POSE_NAMES).sort(), ["front", "side"]);
  assert.deepEqual([...A.POSE_NAMES.front], ["idle", "happy", "sad", "angry", "sulk", "surprised", "blink", "jump", "fall", "catch"]);
  assert.deepEqual([...A.POSE_NAMES.side], ["walk1", "walk2", "jump", "flap1", "flap2"]);
  for (const view of Object.keys(A.POSE_NAMES)) {
    assert.deepEqual(Object.keys(P.poses[view]).sort(), [...A.POSE_NAMES[view]].sort(), `the pack provides every ${view} pose`);
    for (const name of A.POSE_NAMES[view]) for (const ant of P.marks.ant) for (const eye of P.marks.eye) {
      const g = A.pose(P, { ant, eye }, view, name);
      assertGrid(`${view}/${name} ${ant}/${eye}`, g, 32, 32);
      assert.ok(A.frameInk(g) >= 60, `${view}/${name} ${ant}/${eye} has ink`);
    }
  }
  assert.notDeepEqual(A.pose(P, { ant: "orb", eye: "round" }, "side", "walk1"),
    A.pose(P, { ant: "star", eye: "sleepy" }, "side", "walk1"));
  const pictures = new Set(A.POSE_NAMES.front.map((n) => A.pose(P, {}, "front", n).join("\n")));
  assert.equal(pictures.size, A.POSE_NAMES.front.length, "the front poses differ");
  const g = A.pose(P, { ant: "star", eye: "sleepy" }, "side", "walk2");
  const m = A.mirror(g);
  assert.equal(m.length, 32);
  for (let r = 0; r < 32; r++) assert.equal(m[r], [...g[r]].reverse().join(""), `row ${r}`);
  assert.deepEqual(A.mirror(m), g);
  assert.equal(A.mirror(null), null);
});

test("homeIcons: five 16 x 16 states, all different, a round chip with an antenna", () => {
  const keys = Object.keys(P.homeIcons).sort();
  assert.deepEqual(keys, ["away", "egg", "face", "need", "sleep"]);
  for (const key of keys) {
    assertGrid("homeIcons " + key, P.homeIcons[key], 16, 16);
    assert.ok(A.frameInk(P.homeIcons[key]) >= 20, `homeIcons ${key} has ink`);
  }
  const seen = new Set(keys.map((k) => P.homeIcons[k].join("\n")));
  assert.equal(seen.size, keys.length, "each state is a different picture");
  assert.notDeepEqual(P.homeIcons.sleep, P.homeIcons.face, "sleeping closes the eyes");
  assert.notDeepEqual(P.homeIcons.away, P.homeIcons.face, "away is not the everyday face");
  /* the face and sleep icons carry the antenna above the body: ink in the top rows */
  for (const key of ["face", "sleep", "need", "away"]) {
    const top = P.homeIcons[key].slice(0, 5).join("");
    assert.match(top, /k/, `${key} has its antenna above the body`);
  }
});

test("props: the bowls, the piles, the flag and the double-size digit font", () => {
  const full = P.props.bowl, empty = P.props.bowlEmpty;
  assertGrid("bowl", full); assertGrid("bowlEmpty", empty);
  assert.match(full.slice(0, 3).join(""), /[dm]/, "food sits over the full bowl's rim");
  assert.match(empty.slice(0, 3).join(""), /^[.]+$/, "nothing sits over the empty bowl");
  assert.deepEqual(full.slice(3), empty.slice(3), "below the rim the two states are the same bowl");
  const tones = new Set(P.props.poop.join("").replace(/\./g, "").split(""));
  assert.ok(tones.has("k") && tones.has("m") && tones.has("d"), "a pile has an ink edge, a mid body and dark turns");
  assert.notDeepEqual(P.props.flag, P.props.flagBlank);
  assert.ok(P.props.flag[0].length >= 16 && P.props.flag.length >= 28, "the flag is drawn at double size");
  assert.ok(P.props.sign[0].length >= 32, "the sign is double size");
  assert.equal(A.numberGrid(9).length, 7);
  assert.equal(A.numberGrid(9)[0].length, 5);
  assert.equal(A.numberGrid(24)[0].length, 11);
  const seen = new Set();
  for (let n = 1; n <= 31; n++) seen.add(A.numberGrid(n).join("\n"));
  assert.equal(seen.size, 31, "every day 1-31 has its own digits");
});

test("drawRoom: 162 x 120 and only tone indices 0-3", () => {
  for (const scene of [
    { pet: P.frames({ face: "idle1" }), petX: 83, petY: 69, dayOfMonth: 24, bowlFull: true, mess: 1 },
    { night: true, dayOfMonth: 3, bowlFull: false, mess: 3, zz: true, lightOff: true },
    { pet: null, sign: true, prop: P.props.card, dayOfMonth: 31, season: "winter", shelf: P.souvenirs[0].grid }
  ]) {
    const buf = room(scene);
    assert.equal(buf.length, W * H);
    assert.deepEqual([...new Set(buf)].sort(), [0, 1, 2, 3]);
  }
  /* the old call with no width or height uses the pack's own room size */
  const buf = new Uint8Array(W * H);
  A.drawRoom(buf, undefined, undefined, { dayOfMonth: 9 });
  assert.equal(buf.length, W * H);
});

test("drawRoom: every weather draws only inside the window, day and night", () => {
  const base = { pet: P.frames({ face: "idle1" }), petX: 83, petY: 69, dayOfMonth: 24, bowlFull: true, mess: 1, season: "" };
  const win = P.room.window;
  for (const night of [false, true]) {
    const before = room({ ...base, night, weather: null });
    for (const weather of ["sun", "cloud", "rain", "snow", "wind"]) {
      const after = room({ ...base, night, weather });
      let inside = 0, outside = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (before[i] === after[i]) continue;
        if (x >= win.x && x < win.x + win.w && y >= win.y && y < win.y + win.h) inside++; else outside++;
      }
      if (!(night && weather === "sun")) assert.ok(inside > 0, `${weather}${night ? " at night" : ""} draws in the window`);
      assert.equal(outside, 0, `${weather}${night ? " at night" : ""} changes nothing else`);
    }
  }
  /* a clear night is the same moon, whichever way the day started */
  assert.deepEqual([...room({ ...base, night: true, weather: "sun" })], [...room({ ...base, night: true, weather: null })]);
});

test("drawRoom: each weather animates only inside the window, on the room's own 2 fps phase", () => {
  const base = { pet: P.frames({ face: "idle1" }), petX: 83, petY: 69, dayOfMonth: 24, bowlFull: true, mess: 0, season: "" };
  const win = P.room.window;
  const innerInk = (buf) => {
    let n = 0;
    for (let y = win.y + 2; y < win.y + win.h - 2; y++) for (let x = win.x + 2; x < win.x + win.w - 2; x++) if (buf[y * W + x] === 0) n++;
    return n;
  };
  for (const night of [false, true]) {
    for (const weather of ["sun", "cloud", "rain", "snow", "wind"]) {
      const a = room({ ...base, night, weather, phase: 0 });
      const b = room({ ...base, night, weather, phase: 11 });
      const d = changed(a, b, win.x, win.x + win.w, win.y, win.y + win.h);
      if (!(night && weather === "sun")) assert.ok(d.inside > 0, `${weather}${night ? " at night" : ""} moves between two phases`);
      assert.equal(d.outside, 0, `${weather}${night ? " at night" : ""} moves nothing outside the window`);
      assert.deepEqual([...new Set(a)].sort(), [0, 1, 2, 3], `${weather}${night ? " night" : " day"} keeps the four tones`);
    }
  }
  /* day rain is unmistakable: ink streaks over the window, where a sunny sky has only the panes' ink */
  const sun = room({ ...base, weather: "sun", phase: 0 });
  const rain = room({ ...base, weather: "rain", phase: 0 });
  assert.ok(innerInk(rain) > innerInk(sun) + 60, `rain's streaks are visible: ${innerInk(rain)} ink vs ${innerInk(sun)}`);
  /* the phase is optional: no phase is the animation's first frame, never a random one */
  assert.deepEqual([...room({ ...base, weather: "rain" })], [...rain]);
});

test("room: spots and slots name the placement, and a slotted prop stays put", () => {
  const R = P.room;
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(R.spots.stand), { x: 83, y: 69 });
  assert.deepEqual(plain(R.spots.sleep), { x: 10, y: 52 });
  assert.deepEqual(plain(R.spots.eat), { x: 32, y: 69 });
  assert.equal(R.spots.desk, undefined, "there is no desk spot: the pet does not write your diary");
  assert.deepEqual(plain(A.spotPoint(R, "sleep")), { x: 10, y: 52 });
  const dot = ["kk", "kk"];
  assert.deepEqual(plain(A.slotPoint(R, "pick", dot)), { x: 119, y: 99 });
  assert.deepEqual(plain(A.slotPoint(R, "shelf", dot)), { x: 93, y: 30 });
  const at = (petX) => plain(A.resolve({ prop: dot, propSlot: "pick", petX, petY: 69 }, R).prop);
  assert.deepEqual(at(10), { x: 119, y: 99, w: 2, h: 2 }, "the pick does not follow a walking pet");
  assert.deepEqual(at(83), at(10), "the slot is the same from every pet spot");
  assert.equal(A.resolve({ prop: dot, petX: 83, petY: 69 }, R).prop, null, "an unplaced prop is not drawn");
  assert.deepEqual(plain(A.resolve({ prop: dot, propFollow: true, petX: 10, petY: 52 }, R).prop),
    { x: 46, y: 82, w: 2, h: 2 }, "propFollow is the explicit follow relation");
});

test("room: z order, data checks and a second room need no engine change", () => {
  const R = P.room, plain = (v) => JSON.parse(JSON.stringify(v));
  const dot = ["kk", "kk"];
  let L = A.resolve({ pet: dot, prop: dot, propSlot: "pick", sign: true, zz: true }, R);
  assert.deepEqual([...L.order].map((e) => e.k), ["pet", "prop", "sign", "zz"], "the default layers keep the old order");
  L = A.resolve({ pet: dot, prop: dot, propSlot: "pick", propZ: 1 }, R);
  assert.deepEqual([...L.order].map((e) => e.k), ["prop", "pet"], "an explicit z puts a prop behind the pet");
  L = A.resolve({ pet: dot, prop: dot, propX: 10, propY: 10, propZ: 10, petX: 83, petY: 69 }, R);
  assert.deepEqual([...L.order].map((e) => e.k), ["prop", "pet"], "a layer tie goes to the lower feet");
  assert.deepEqual(plain(A.useSpot(R, "feed", "eat")), { x: 32, y: 69 }, "a verb can name its spot");
  assert.deepEqual([...A.roomOk(R)], [], "the chip room is sound data");
  assert.deepEqual([...A.packOk(P)], [], "the chip pack is sound data");

  /* a second room: different spots, slots and furniture, the same painter and the same resolver */
  const room2 = {
    id: "loft", w: 162, h: 120, petX: 60, petY: 80,
    spots: { stand: { x: 60, y: 80 }, sleep: { x: 120, y: 60 }, eat: { x: 40, y: 80 }, wash: { x: 30, y: 80 } },
    slots: { pick: { x: 100, bottom: 110, z: 12 }, shelf: { x: 20, y: 30, z: 6 }, sign: { x: 60, y: 40, z: 20 }, zz: { x: 130, y: 50, z: 30 } },
    solids: [{ id: "bed", box: [110, 50, 40, 30] }],
    uses: { feed: { spot: "eat" }, sleep: { spot: "sleep" }, wash: { spot: "wash" }, rest: { spot: "stand" } },
    bowl: P.room.bowl, bowlEmpty: P.room.bowlEmpty, poop: P.room.poop, sign: P.room.sign, zz: P.room.zz,
    poops: P.room.poops, draw: P.room.draw
  };
  assert.deepEqual([...A.roomOk(room2)], [], "a second room is sound data");
  assert.deepEqual(plain(A.useSpot(room2, "feed", "eat")), { x: 40, y: 80 });
  const l2 = plain(A.resolve({ prop: ["kk"], propSlot: "pick", petX: 10, petY: 10 }, room2).prop);
  assert.deepEqual([l2.x, l2.y], [100, 109], "the prop follows the second room's slot");
  const base = { dayOfMonth: 24, bowlFull: true, mess: 1, pet: P.frames({ face: "idle1" }) };
  const first = room(base), second = room({ ...base, pack: { id: "loft", room: room2 } });
  assert.notDeepEqual([...first], [...second], "the second room draws where its own data says");

  /* broken data is reported, not silently clamped */
  const bad = { ...room2, spots: { ...room2.spots, sleep: { x: -4, y: 0 } }, slots: { ...room2.slots, pick: null } };
  assert.ok(A.roomOk(bad).length >= 2);
  assert.ok(A.packOk({}).length > 0);
});

test("drawRoom: the pet, the prop, the sign and Zz follow the scene", () => {
  const pet = P.frames({ face: "idle1", ant: "star", eye: "wide" });
  const base = { pet, petX: 83, petY: 69, dayOfMonth: 24, bowlFull: true, mess: 0 };
  const withPet = room(base);
  const without = room({ ...base, pet: null });
  const petDiff = changed(withPet, without, 83, 115, 69, 101);
  assert.ok(petDiff.inside > 0, "the pet is at (83,69)");
  assert.equal(petDiff.outside, 0, "nothing else moved");

  const withProp = room({ ...base, prop: P.props.card, propFollow: true });
  const propDiff = changed(withProp, withPet, 119, 137, 87, 101);
  assert.ok(propDiff.inside > 0, "a prop that asks to follow the pet does");
  assert.equal(propDiff.outside, 0, "the prop changes nothing else");

  const parked = room({ ...base, prop: P.props.card, propSlot: "pick" });
  const parkedDiff = changed(parked, withPet, 119, 137, 87, 101);
  assert.ok(parkedDiff.inside > 0, "a slotted prop sits in its slot");
  assert.equal(parkedDiff.outside, 0, "the slot changes nothing else");

  const withZz = room({ ...base, zz: true });
  const zzDiff = changed(withZz, withPet, 111, 135, 47, 71);
  assert.ok(zzDiff.inside > 0, "Zz follows the pet");
  assert.equal(zzDiff.outside, 0, "Zz changes nothing else");

  const signScene = { dayOfMonth: 24, bowlFull: true, mess: 0, sign: true };
  const withSign = room(signScene), noSign = room({ ...signScene, sign: false });
  const signDiff = changed(withSign, noSign, 62, 94, 60, 82);
  assert.ok(signDiff.inside > 0, "the travel sign is drawn");
  assert.equal(signDiff.outside, 0, "the sign changes nothing else");
});

test("drawRoom: lightOff maps paper-mid-dark-ink one step darker, Zz stays paper", () => {
  const scene = { pet: P.frames({ face: "happy" }), petX: 83, petY: 69, dayOfMonth: 9, bowlFull: false, mess: 2 };
  const on = room(scene), off = room({ ...scene, lightOff: true });
  const map = [0, 0, 1, 2];
  for (let i = 0; i < on.length; i++) assert.equal(off[i], map[on[i]], `pixel ${i}`);

  const zscene = { pet: P.frames({ face: "sleep", ant: "orb" }), petX: 83, petY: 69, dayOfMonth: 24, zz: true };
  const lit = room({ ...zscene, lightOff: true });
  const noZz = room({ ...zscene, zz: false, lightOff: true });
  let changedPixels = 0;
  for (let i = 0; i < lit.length; i++) if (lit[i] !== noZz[i]) {
    changedPixels++;
    assert.equal(lit[i], 3, `Zz pixel ${i} is paper`);
  }
  assert.ok(changedPixels > 0, "Zz is drawn after the light goes off");
});

test("drawRoom: every day 1-31 has distinct pixels in the calendar's paper area", () => {
  const base = { bowlFull: true, mess: 0 };
  const seen = new Set();
  for (let day = 1; day <= 31; day++) {
    const buf = room({ ...base, dayOfMonth: day });
    let sig = "";
    for (let y = 22; y < 44; y++) for (let x = 62; x < 86; x++) sig += buf[y * W + x];
    seen.add(sig);
  }
  assert.equal(seen.size, 31);
  assert.deepEqual([...room({ ...base, dayOfMonth: 0 })], [...room({ ...base, dayOfMonth: 1 })]);
  assert.deepEqual([...room({ ...base, dayOfMonth: 40 })], [...room({ ...base, dayOfMonth: 31 })]);
});

test("drawRoom: one 16 x 16 souvenir sits on the shelf at 1:1", () => {
  const base = { dayOfMonth: 24, bowlFull: true, mess: 0 };
  const empty = room(base);
  const shelf = P.souvenirs[0].grid;
  const withShelf = room({ ...base, shelf });
  const diff = changed(withShelf, empty, 93, 109, 30, 46);
  assert.ok(diff.inside > 0, "the souvenir appears in the shelf slot");
  assert.equal(diff.outside, 0, "nothing else moves");
  const moved = room({ ...base, shelf, shelfX: 70, shelfY: 20 });
  const movedDiff = changed(moved, empty, 70, 86, 20, 36);
  assert.ok(movedDiff.inside > 0, "the shelf slot can be moved");
  assert.equal(movedDiff.outside, 0);
});

test("drawRoom: a second pack brings its own room props", () => {
  const fakePoop = ["pp", "pp"];
  const fake = {
    id: "fake",
    room: {
      w: 162, h: 120, petX: 83, petY: 69,
      bowl: P.room.bowl, bowlEmpty: P.room.bowlEmpty, poop: fakePoop,
      sign: P.room.sign, zz: P.room.zz, poops: [[12, 90]], draw: P.room.draw
    }
  };
  const withFake = room({ pack: fake, mess: 1, dayOfMonth: 24, bowlFull: true });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    assert.equal(withFake[(90 + r) * W + 12 + c], 3, "the fake pack's poop is drawn");
  }
  const withChip = room({ mess: 1, dayOfMonth: 24, bowlFull: true });
  assert.notEqual(withChip[90 * W + 12], 3, "the chip room did not draw the fake grid");
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
