// runtime/lenses.js: which physical lenses a phone has (docs/decisions.md section 4, docs/design/darkroom.md 3.1).
// Device lists are what Safari reported on the phones named (PR #35's lens test page) or follow its pattern.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const L = runScript("runtime/lenses.js").LopdaLenses;
const plain = (v) => JSON.parse(JSON.stringify(v));
const ids = (lenses) => lenses.map((x) => x.id + ":" + x.deviceId).join(" ");

/* capabilities as the tracks report them; zoom 0.5-10 on the virtual cameras, focus in metres */
const caps = {
  front: { facingMode: ["user"], zoom: { min: 1, max: 5 } },
  dualWide: { facingMode: ["environment"], zoom: { min: 0.5, max: 10 }, focusDistance: { min: 0.02 } },
  triple: { facingMode: ["environment"], zoom: { min: 0.5, max: 15 }, focusDistance: { min: 0.02 } },
  dual: { facingMode: ["environment"], zoom: { min: 1, max: 15 }, focusDistance: { min: 0.15 } },
  ultraWide: { facingMode: ["environment"], zoom: { min: 1, max: 5 }, focusDistance: { min: 0.02 } },
  wide: { facingMode: ["environment"], zoom: { min: 1, max: 5 }, focusDistance: { min: 0.15 } },
  tele: { facingMode: ["environment"], zoom: { min: 1, max: 5 }, focusDistance: { min: 0.45 } }
};
/* iPhone 15/16 (not Pro), in the order Safari lists them */
const IPHONE = [["front", "Front Camera"], ["dualWide", "Back Dual Wide Camera"], ["ultraWide", "Back Ultra Wide Camera"], ["wide", "Back Camera"]];
const IPHONE_PRO = [["front", "Front Camera"], ["triple", "Back Triple Camera"], ["dual", "Back Dual Camera"], ["dualWide", "Back Dual Wide Camera"],
  ["ultraWide", "Back Ultra Wide Camera"], ["wide", "Back Camera"], ["tele", "Back Telephoto Camera"]];
const devs = (list, { label = (x) => x, withCaps = true } = {}) =>
  list.map(([k, name]) => ({ deviceId: k, label: label(name, k), caps: withCaps ? caps[k] : null }));

test("iPhone (not Pro): ultra-wide, wide, front; the virtual Dual Wide is left out", () => {
  assert.equal(ids(L.identify(devs(IPHONE))), "uw:ultraWide w:wide f:front");
  assert.equal(ids(L.identify(devs(IPHONE, { withCaps: false }))), "uw:ultraWide w:wide f:front", "names alone are enough");
});

test("iPhone Pro: ultra-wide, wide, telephoto, front; Triple, Dual and Dual Wide are left out", () => {
  assert.equal(ids(L.identify(devs(IPHONE_PRO))), "uw:ultraWide w:wide t:tele f:front");
  assert.equal(ids(L.identify(devs(IPHONE_PRO, { withCaps: false }))), "uw:ultraWide w:wide t:tele f:front");
});

test("Chinese names are matched by name", () => {
  const zh = { "Front Camera": "前置相机", "Back Triple Camera": "后置三镜头相机", "Back Dual Camera": "后置双镜头相机",
    "Back Dual Wide Camera": "后置双广角相机", "Back Ultra Wide Camera": "后置超广角相机", "Back Camera": "后置相机", "Back Telephoto Camera": "后置长焦相机" };
  assert.equal(ids(L.identify(devs(IPHONE_PRO, { label: (n) => zh[n], withCaps: false }))), "uw:ultraWide w:wide t:tele f:front");
  assert.equal(ids(L.identify(devs(IPHONE, { label: (n) => zh[n], withCaps: false }))), "uw:ultraWide w:wide f:front");
});

test("names in another language: zoom finds the virtual cameras, facingMode the front, the closest focus the ultra-wide", () => {
  const ja = { "Front Camera": "前面カメラ", "Back Triple Camera": "背面トリプルカメラ", "Back Dual Camera": "背面デュアルカメラ",
    "Back Dual Wide Camera": "背面デュアル広角カメラ", "Back Ultra Wide Camera": "背面超広角カメラ", "Back Camera": "背面カメラ", "Back Telephoto Camera": "背面望遠カメラ" };
  assert.equal(ids(L.identify(devs(IPHONE, { label: (n) => ja[n] }))), "uw:ultraWide w:wide f:front");
  /* Pro: Back Dual Camera (wide + telephoto) zooms from 1 and focuses like the wide, so nothing tells the two apart */
  assert.equal(L.identify(devs(IPHONE_PRO, { label: (n) => ja[n] })), null);
  assert.equal(ids(L.identify(devs(IPHONE_PRO, { label: (n) => ja[n] }).filter((d) => d.deviceId !== "dual"))), "uw:ultraWide w:wide t:tele f:front");
  /* without capabilities those names say nothing: keep the plain back/front pair */
  assert.equal(L.identify(devs(IPHONE, { label: (n) => ja[n], withCaps: false })), null);
  /* two unexplained back cameras and no focus distance: cannot tell them apart */
  const noFocus = devs(IPHONE, { label: (n) => ja[n] }).map((d) => d.deviceId === "dualWide" ? d : { ...d, caps: { facingMode: d.caps.facingMode } });
  assert.equal(L.identify(noFocus), null);
});

test("a desktop with one webcam, Chromium's fake camera, no cameras, no names: null, the plain pair", () => {
  assert.equal(L.identify([{ deviceId: "a", label: "FaceTime HD Camera", caps: { facingMode: [] } }]), null);
  assert.equal(L.identify([{ deviceId: "b", label: "fake_device_0", caps: null }]), null);
  assert.equal(L.identify([]), null);
  assert.equal(L.identify(undefined), null);
  assert.equal(L.identify([{ deviceId: "c", label: "", caps: null }, { deviceId: "d", label: "", caps: null }]), null);
  /* a front camera alone has no main camera to start on */
  assert.equal(L.identify([{ deviceId: "f", label: "Front Camera", caps: null }]), null);
});

test("one unexplained back camera is the main camera; Android's names work too", () => {
  assert.equal(ids(L.identify([{ deviceId: "x", label: "Kamera", caps: { facingMode: ["environment"] } }, { deviceId: "y", label: "Selfie", caps: { facingMode: ["user"] } }])), "w:x f:y");
  assert.equal(ids(L.identify([{ deviceId: "0", label: "camera2 0, facing back", caps: null }, { deviceId: "1", label: "camera2 1, facing front", caps: null },
    { deviceId: "2", label: "camera2 2, facing back", caps: null }])), "w:0 f:1", "the first of two back cameras is the main one");
});

test("pick and next: SELECT order, the remembered lens, the main camera when it is gone, the plain pair", () => {
  const phone = L.identify(devs(IPHONE));
  assert.equal(L.pick(phone, "f").deviceId, "front");
  assert.equal(L.pick(phone, "t").id, "w", "no telephoto on this phone: back to the main camera");
  assert.equal(L.pick(phone, undefined).id, "w");
  const order = []; let id = "w";
  for (let i = 0; i < 4; i++) { id = L.next(phone, id).id; order.push(id); }
  assert.deepEqual(order, ["f", "uw", "w", "f"]);
  assert.deepEqual(plain(L.pick(null, "f")), { id: "f", facing: "user", fallback: true });
  assert.equal(L.pick(null, "uw").facing, "environment");
  assert.equal(L.next(null, "w").id, "f");
  assert.equal(L.next(null, "f").id, "w");
  assert.deepEqual(plain(L.MM), { uw: 13, w: 26, t: 77 });
});
