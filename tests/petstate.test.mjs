// runtime/petstate.js: souvenir item state (grow + match), pure and deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const S = runScript("runtime/petstate.js").LopdaPetState;
const grid = (ch) => String(ch).repeat(256);
const G0 = grid("0"), G1 = grid("1"), G2 = grid("2"), G3 = grid("3");
const DAY = 86400000;
const plain = (v) => JSON.parse(JSON.stringify(v));

const item = (over = {}) => ({ px: G0, at: 0, grownMs: 0, ...over });
const ctx = (over = {}) => ({
  now: 0, hour: 12, minute: 0, night: false, weather: "sun", season: "spring",
  lunar: { month: 1, day: 1, leap: false }, onShelf: true, ...over
});
const grow = (stages = [
  { id: "seed", px: G0, hold: DAY / 1000 },
  { id: "sprout", px: G1, hold: DAY / 1000 },
  { id: "bloom", px: G2, hold: 0 }
]) => ({ v: 1, layers: [{ kind: "grow", stages }] });
const match = (rules) => ({ v: 1, layers: [{ kind: "match", rules }] });

test("stateOf: no state is the static px", () => {
  assert.deepEqual(plain(S.stateOf(item(), ctx())), { px: G0, id: "still", layer: null, stage: null });
  assert.deepEqual(plain(S.stateOf(item({ state: { v: 1, layers: [] } }), ctx())), { px: G0, id: "still", layer: null, stage: null });
});

test("grow: shelf time only, stages, last stage forever, clock rollback", () => {
  const state = grow();
  assert.equal(S.stateOf(item({ state }), ctx({ now: 10 * DAY })).stage, "seed", "not planted yet");
  assert.equal(S.stateOf(item({ state, plantedAt: 0, grownMs: 0 }), ctx({ now: 0, onShelf: true })).stage, "seed");
  assert.equal(S.stateOf(item({ state, plantedAt: 0 }), ctx({ now: DAY - 1, onShelf: true })).stage, "seed");
  assert.equal(S.stateOf(item({ state, plantedAt: 0 }), ctx({ now: DAY, onShelf: true })).stage, "sprout");
  assert.equal(S.stateOf(item({ state, plantedAt: 0 }), ctx({ now: 2 * DAY, onShelf: true })).stage, "bloom");
  assert.equal(S.stateOf(item({ state, plantedAt: 0 }), ctx({ now: 30 * DAY, onShelf: true })).stage, "bloom");
  assert.equal(S.stateOf(item({ state, plantedAt: 5 * DAY }), ctx({ now: 2 * DAY, onShelf: true })).stage, "seed", "a clock rollback does not go backwards");
});

test("grow: off the shelf it pauses at grownMs, and resumes from there", () => {
  const state = grow();
  assert.equal(S.stateOf(item({ state, grownMs: 1.5 * DAY }), ctx({ onShelf: false })).stage, "sprout");
  assert.equal(S.stateOf(item({ state, grownMs: 1.5 * DAY, plantedAt: 0 }), ctx({ now: 2 * DAY, onShelf: false })).stage, "sprout");
  assert.equal(S.stateOf(item({ state, grownMs: 1.5 * DAY, plantedAt: 2 * DAY }), ctx({ now: 2.5 * DAY, onShelf: true })).stage, "bloom");
});

test("match: first rule wins, fallback, and every when field", () => {
  const rules = [
    { id: "wet", when: { weather: ["rain", "snow"] }, px: G1 },
    { id: "night", when: { night: true }, px: G2 },
    { id: "hour", when: { hour: [20, 6] }, px: G3 },
    { id: "winter", when: { season: ["winter"] }, px: G1 },
    { id: "moon", when: { lunarDay: [15, 21] }, px: G2 },
    { id: "fallback", px: G0 }
  ];
  const state = match(rules);
  assert.equal(S.stateOf(item({ state }), ctx({ weather: "rain" })).id, "wet");
  assert.equal(S.stateOf(item({ state }), ctx({ night: true })).id, "night");
  assert.equal(S.stateOf(item({ state }), ctx({ hour: 23 })).id, "hour");
  assert.equal(S.stateOf(item({ state }), ctx({ hour: 5 })).id, "hour");
  assert.equal(S.stateOf(item({ state }), ctx({ hour: 6 })).id, "fallback");
  assert.equal(S.stateOf(item({ state }), ctx({ season: "winter" })).id, "winter");
  assert.equal(S.stateOf(item({ state }), ctx({ lunar: { month: 8, day: 15, leap: false } })).id, "moon");
  assert.equal(S.stateOf(item({ state }), ctx({ lunar: null })).id, "fallback");
});

test("match: stage gates a later layer, and the last layer wins", () => {
  const state = {
    v: 1,
    layers: [
      { kind: "grow", stages: [
        { id: "seed", px: G0, hold: DAY / 1000 },
        { id: "bloom", px: G1, hold: 0 }
      ] },
      { kind: "match", when: { stage: ["bloom"] }, rules: [
        { id: "night", when: { night: true }, px: G2 },
        { id: "day", px: G3 }
      ] }
    ]
  };
  const early = S.stateOf(item({ state, plantedAt: 0 }), ctx({ now: DAY / 2, onShelf: true }));
  assert.equal(early.stage, "seed");
  assert.equal(early.layer, "grow");
  const bloom = S.stateOf(item({ state, plantedAt: 0 }), ctx({ now: 2 * DAY, night: true, onShelf: true }));
  assert.equal(bloom.stage, "bloom");
  assert.equal(bloom.id, "night");
  assert.equal(bloom.layer, "match");
});

test("matches: hour wraps midnight, lunar leap is exact, unknown context is false", () => {
  assert.equal(S.matches({ hour: [20, 6] }, ctx({ hour: 21 }), {}), true);
  assert.equal(S.matches({ hour: [20, 6] }, ctx({ hour: 3 }), {}), true);
  assert.equal(S.matches({ hour: [20, 6] }, ctx({ hour: 12 }), {}), false);
  assert.equal(S.matches({ lunarLeap: true }, ctx({ lunar: { month: 2, day: 1, leap: true } }), {}), true);
  assert.equal(S.matches({ lunarLeap: true }, ctx({ lunar: { month: 2, day: 1, leap: false } }), {}), false);
  assert.equal(S.matches({ lunarMonth: [8, 8], lunarDay: [15, 15] }, ctx({ lunar: { month: 8, day: 15, leap: false } }), {}), true);
  assert.equal(S.matches({ lunarMonth: [8, 8] }, ctx({ lunar: { month: 9, day: 15, leap: false } }), {}), false);
  assert.equal(S.matches({ stage: ["bloom"] }, ctx(), { stage: null }), false);
  assert.equal(S.matches({ stage: ["bloom"] }, ctx(), { stage: "bloom" }), true);
});

test("validate: clean grow + match, first frame must match px, frame cap", () => {
  const good = {
    v: 1,
    layers: [
      { kind: "grow", stages: [
        { id: "seed", px: G0, hold: 0 },
        { id: "grown", px: G1, hold: 0 }
      ] },
      { kind: "match", rules: [
        { id: "night", when: { night: true }, px: G2 },
        { px: G3 }
      ] }
    ]
  };
  assert.deepEqual(plain(S.validate(good, G0)), good);
  assert.equal(S.validate(good, G1), null, "the first grow frame is the px fallback");
  assert.equal(S.validate({ v: 2, layers: good.layers }, G0), null);
  assert.equal(S.validate({ v: 1, layers: [] }, G0), null);
});

test("validate: bad rules are dropped, bad layers disappear, unknown when is not guessed", () => {
  const spec = {
    v: 1,
    layers: [
      { kind: "grow", stages: [
        { id: "seed", px: G0, hold: 0 },
        { id: "grown", px: G1, hold: 0 }
      ] },
      { kind: "match", rules: [
        { when: { weather: ["rain"] }, px: G2 },
        { when: { weather: ["lava"] }, px: G1 },
        { when: { something: true }, px: G1 },
        { px: "bad" }
      ] }
    ]
  };
  const clean = S.validate(spec, G0);
  assert.equal(clean.layers.length, 2);
  assert.equal(clean.layers[1].rules.length, 1);
  assert.deepEqual(plain(clean.layers[1].rules[0].when), { weather: ["rain"] });
});

test("validate: unknown kind, too many frames and bad holds are refused", () => {
  const base = { v: 1, layers: [
    { kind: "grow", stages: [
      { id: "seed", px: G0, hold: 0 },
      { id: "grown", px: G1, hold: 0 }
    ] }
  ] };
  assert.equal(S.validate({ v: 1, layers: [{ kind: "cycle", frames: [] }] }, G0), null);
  const many = { v: 1, layers: [] };
  for (let i = 0; i < 5; i++) many.layers.push({ kind: "match", rules: [{ px: G1 }, { px: G2 }] });
  assert.equal(S.validate(many, G0), null, "more than 4 layers");
  const long = { v: 1, layers: [{ kind: "grow", stages: [
    { id: "a", px: G0, hold: 0 },
    { id: "b", px: G1, hold: 31 * 86400 }
  ] }] };
  assert.equal(S.validate(long, G0), null, "a hold over 30 days");
  const duplicate = { v: 1, layers: [{ kind: "grow", stages: [
    { id: "a", px: G0, hold: 0 },
    { id: "a", px: G1, hold: 0 }
  ] }] };
  assert.equal(S.validate(duplicate, G0), null, "duplicate stage ids");
  assert.equal(S.validate(base, G0).layers.length, 1);
});
