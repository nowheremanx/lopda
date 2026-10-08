// runtime/strings.js: both languages complete, placeholders agree, every key the UI asks for exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, runScript, EMOJI } from "./helpers.mjs";

function load(language) {
  const ctx = runScript("runtime/strings.js", { navigator: { languages: [language], language } });
  return ctx.LopdaStrings;
}
const S = load("zh-CN");
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("only zh and en", () => {
  assert.deepEqual([...S.LANGS], ["zh", "en"]);
  assert.deepEqual(Object.keys(S.STR).sort(), ["en", "zh"]);
});

test("zh and en have the same keys", () => {
  const zh = Object.keys(S.STR.zh), en = Object.keys(S.STR.en);
  assert.deepEqual(zh.filter((k) => !(k in S.STR.en)), [], "missing in en");
  assert.deepEqual(en.filter((k) => !(k in S.STR.zh)), [], "missing in zh");
});

/* English may leave a value out (cam.lcd skips the Chinese film name) but never asks for one zh lacks */
test("en uses only {placeholders} that zh has", () => {
  for (const k of Object.keys(S.STR.zh)) {
    const zh = vars(S.STR.zh[k]);
    assert.deepEqual(vars(S.STR.en[k]).filter((v) => !zh.includes(v)), [], k);
  }
});

test("no empty strings and no emoji", () => {
  for (const lang of S.LANGS) for (const [k, v] of Object.entries(S.STR[lang])) {
    assert.ok(typeof v === "string" && v.length, `${lang} ${k} is empty`);
    assert.ok(!EMOJI.test(v), `${lang} ${k} has emoji`);
  }
});

test("every literal tr() key in lopda.js exists", () => {
  const keys = new Set([...read("runtime/lopda.js").matchAll(/\btr\(\s*"([^"]+)"\s*[,)]/g)].map((m) => m[1]));
  assert.ok(keys.size > 50, "found the tr() calls");
  assert.deepEqual([...keys].filter((k) => !(k in S.STR.zh)), []);
});

test("every data-i18n key in index.html exists", () => {
  const keys = [...read("runtime/index.html").matchAll(/data-i18n(?:-ph|-label|-title)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 20, "found the data-i18n attributes");
  assert.deepEqual(keys.filter((k) => !(k in S.STR.zh)), []);
});

test("language follows the browser", () => {
  assert.equal(load("zh-TW").lang, "zh");
  assert.equal(load("en-US").lang, "en");
  assert.equal(load("fr-FR").lang, "en");
});

test("t() fills vars, falls back to zh, then to the key", () => {
  const en = load("en-US");
  en.STR.en["test.vars"] = "{a} and {b}{a}";
  assert.equal(en.t("test.vars", { a: 1, b: "x" }), "1 and x1");
  assert.equal(en.t("test.vars", { a: 0 }), "0 and 0");
  assert.equal(en.t("test.vars"), "{a} and {b}{a}");
  en.STR.zh["test.only-zh"] = "只有中文";
  assert.equal(en.t("test.only-zh"), "只有中文");
  assert.equal(en.t("no.such.key"), "no.such.key");
});

test("field() prefers the localized manifest text", () => {
  const en = load("en-US");
  const app = { name: "五子棋", description: "下棋", i18n: { en: { name: "Gomoku" } } };
  assert.equal(en.field(app, "name"), "Gomoku");
  assert.equal(en.field(app, "description"), "下棋");
  assert.equal(load("zh-CN").field(app, "name"), "五子棋");
  assert.equal(en.field(null, "name"), "");
});
