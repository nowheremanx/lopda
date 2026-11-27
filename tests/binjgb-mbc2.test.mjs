// runtime/vendor/binjgb with an MBC2 + battery cartridge (issue #294). binjgb raises its "cartridge RAM was written" flag
// only for cartridge RAM chips; MBC2's RAM is inside the mapper and its writes never raise it, so runtime/apps/cart.js
// reads and compares the RAM of an MBC2 + battery cartridge (header 0x147 = 0x06) at every save point instead of trusting
// the flag. This test pins both halves of that: if a newer binjgb starts raising the flag, the polling can go.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, read } from "./helpers.mjs";

const DIR = join(ROOT, "runtime/vendor/binjgb");

async function core() {
  const wasm = readFileSync(join(DIR, "binjgb.wasm"));
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, URL, WebAssembly, TextDecoder, setTimeout, performance });
  ctx.globalThis = ctx;
  vm.runInContext(read("runtime/vendor/binjgb/binjgb.js") + ";globalThis.Binjgb=Binjgb;", ctx);
  return ctx.Binjgb({ wasmBinary: wasm, locateFile: (p) => join(DIR, p), print() {}, printErr() {} });
}

/* a 32 KB cartridge: enable the RAM, write 0x5A to 0xA000, then loop */
function rom(type, ramCode) {
  const r = new Uint8Array(0x8000);
  r.set([0x00, 0xc3, 0x50, 0x01], 0x100);
  r[0x147] = type; r[0x149] = ramCode;
  let x = 0; for (let a = 0x134; a <= 0x14c; a++) x = (x - r[a] - 1) & 0xff; r[0x14d] = x;
  r.set([0x3e, 0x0a, 0xea, 0x00, 0x00, 0x3e, 0x5a, 0xea, 0x00, 0xa0, 0x18, 0xfe], 0x150);
  return r;
}

function run(m, data) {
  const p = m._malloc(data.length); m.HEAPU8.set(data, p);
  const e = m._emulator_new_simple(p, data.length, 44100, 4096, 0);
  assert.ok(e, "the core starts the cartridge");
  let flagged = false;
  for (let i = 0; i < 30; i++) {
    m._emulator_run_until_f64(e, m._emulator_get_ticks_f64(e) + 70224);
    if (m._emulator_was_ext_ram_updated(e)) flagged = true;
  }
  const fd = m._ext_ram_file_data_new(e), size = m._get_file_data_size(fd);
  m._emulator_write_ext_ram(e, fd);
  const first = m.HEAPU8[m._get_file_data_ptr(fd)];
  m._file_data_delete(fd); m._emulator_delete(e);
  return { flagged, size, first };
}

test("binjgb: an MBC1 + RAM + battery write raises the flag; an MBC2 + battery write does not, but is in the RAM read back", async () => {
  const m = await core();
  const mbc1 = run(m, rom(0x03, 0x02));
  assert.equal(mbc1.flagged, true);
  assert.equal(mbc1.size, 8192);
  assert.equal(mbc1.first, 0x5a);
  const mbc2 = run(m, rom(0x06, 0x00));
  assert.equal(mbc2.flagged, false, "binjgb still does not flag MBC2 writes: keep cart.js polling 0x06 cartridges");
  assert.equal(mbc2.size, 512);
  assert.equal(mbc2.first & 0x0f, 0x0a, "the write is there: MBC2 keeps the low four bits");
});

test("cart.js polls MBC2 + battery cartridges at every save point", () => {
  const src = read("runtime/apps/cart.js");
  assert.match(src, /GB\.poll=data\[0x147\]===0x06/);
  assert.match(src, /setInterval\(function\(\)\{ if\(gbRamDue\(\)\) gbSaveSram\(\); \}/);
});
