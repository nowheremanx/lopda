// Manual check, not part of `node --test`: compare runtime/lunar.js with the Hong Kong Observatory's
// Gregorian-lunar conversion tables, day by day, 1901-2100 (the HKO tables start in 1901).
// The HKO files are not committed. Usage:
//   node tests/hko-compare.mjs <dir>           read T<year>c.txt files from <dir>
//   node tests/hko-compare.mjs --fetch <dir>   first download the missing ones (sequential, small delay)
//   node tests/hko-compare.mjs --selftest      run the parser on a synthetic snippet
// Written without access to hko.gov.hk, so the parser has only been tried on synthetic text: it is
// defensive (lines that do not match are skipped) and the summary says how many days it read.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runScript } from "./helpers.mjs";

const L = runScript("runtime/lunar.js").LopdaLunar;
const URL_OF = (y) => "https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T" + y + "c.txt";
const TERMS = "小寒 大寒 立春 雨水 驚蟄 春分 清明 穀雨 立夏 小滿 芒種 夏至 小暑 大暑 立秋 處暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至".split(" ");
const TERM_ALT = { "惊蛰": 4, "谷雨": 7, "小满": 9, "处暑": 15, "霜降": 19 };
const DIGITS = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
const MONTH_NAMES = { "正": 1, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "冬": 11, "十二": 12, "臘": 12, "腊": 12 };
const WEEK = "日一二三四五六";

const termIndex = (s) => { const i = TERMS.indexOf(s); return i >= 0 ? i : (s in TERM_ALT ? TERM_ALT[s] : -1); };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => y + "-" + pad(m) + "-" + pad(d);

// "初二" "十五" "二十" "廿三" "三十" -> 2..30, or 0
function parseDay(s) {
  s = s.replace("卄", "廿");
  let m = /^初([一二三四五六七八九十])$/.exec(s);
  if (m) return DIGITS[m[1]];
  if (s === "二十") return 20;
  if (s === "三十") return 30;
  m = /^十([一二三四五六七八九])$/.exec(s);
  if (m) return 10 + DIGITS[m[1]];
  m = /^廿([一二三四五六七八九])$/.exec(s);
  return m ? 20 + DIGITS[m[1]] : 0;
}
// "正月" "閏六月" "十一月" "臘月" -> {month, leap} or null
function parseMonth(s) {
  const m = /^([閏闰]?)(正|十一|十二|[一二三四五六七八九十冬臘腊])月$/.exec(s);
  return m ? { month: MONTH_NAMES[m[2]], leap: m[1] !== "" } : null;
}

function decode(buf) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder("big5").decode(buf); }
}

const LINE = /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\S+)\s+(星期\S)\s*(\S+)?/;

// Compare one file's text; adds to `acc` {days, bad: [{n, date, ours, hko}], termBad: [...]}.
function compareText(text, acc) {
  let prevN = null, cur = null; // cur: {month, leap} as last announced by HKO
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line.trim());
    if (!m) continue;
    const y = +m[1], mo = +m[2], d = +m[3];
    const ours = L.fromSolar(y, mo, d);
    if (!ours) continue;
    const n = L.dayNumber(y, mo, d);
    const ms = parseMonth(m[4]);
    let hko;
    if (ms) { cur = ms; hko = { month: ms.month, leap: ms.leap, day: 1 }; }
    else {
      const day = parseDay(m[4]) || (m[4] === "初一" ? 1 : 0);
      // leading days of a file (or after a gap) have no announced month: take ours, check the day only
      if (cur === null || prevN === null || n !== prevN + 1) cur = { month: ours.month, leap: ours.leap };
      hko = { month: cur.month, leap: cur.leap, day: day };
    }
    prevN = n;
    acc.days++;
    const key = (o) => (o.leap ? "閏" : "") + o.month + "月" + o.day + "日";
    if (key(hko) !== key(ours)) acc.bad.push({ n: n, date: ymd(y, mo, d), ours: key(ours), hko: key(hko) });
    const wd = WEEK.indexOf(m[5].slice(2, 3));
    if (wd !== L.weekday(y, mo, d)) acc.bad.push({ n: n, date: ymd(y, mo, d), ours: "星期" + WEEK[L.weekday(y, mo, d)], hko: m[5] });
    const ot = L.term(y, mo, d), ht = m[6] ? termIndex(m[6]) : -1;
    if (ot !== ht) acc.termBad.push({ date: ymd(y, mo, d), ours: ot < 0 ? "-" : TERMS[ot], hko: m[6] || "-" });
  }
}

// consecutive mismatching days with the same kind of difference -> one run
function runs(bad) {
  const out = [];
  for (const b of bad) {
    const last = out[out.length - 1];
    if (last && b.n === last.n + 1) { last.n = b.n; last.last = b.date; last.count++; }
    else out.push({ n: b.n, first: b.date, last: b.date, count: 1, ours: b.ours, hko: b.hko });
  }
  return out;
}

function report(acc, years, missing) {
  console.log("years read: " + years.length + (years.length ? " (" + years[0] + "-" + years[years.length - 1] + ")" : ""));
  console.log("years missing: " + (missing.length ? missing.join(" ") : "none"));
  console.log("days compared: " + acc.days);
  console.log("mismatching days: " + acc.bad.length);
  for (const r of runs(acc.bad)) console.log("  " + r.first + (r.count > 1 ? " .. " + r.last : "") + "  ours " + r.ours + "  HKO " + r.hko);
  console.log("term mismatches: " + acc.termBad.length);
  for (const t of acc.termBad) console.log("  " + t.date + "  ours " + t.ours + "  HKO " + t.hko);
  return acc.bad.length + acc.termBad.length;
}

function selftest() {
  // lines built from our own table: a mid-month start, a 閏 month start (2025), a term, a Spring Festival
  const days = [[2025, 7, 24], [2025, 7, 25], [2025, 7, 26], [2026, 1, 4], [2026, 1, 5], [2026, 1, 6], [2026, 2, 16], [2026, 2, 17], [2026, 2, 18]];
  const dn = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const dayName = (d) => d <= 10 ? "初" + (d === 10 ? "十" : dn[d]) : d < 20 ? "十" + dn[d - 10] : d === 20 ? "二十" : d < 30 ? "廿" + dn[d - 20] : "三十";
  const mName = ["", "正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  const lines = ["香港天文台 公曆與農曆日期對照表", "(synthetic test data)"];
  for (const [y, m, d] of days) {
    const o = L.fromSolar(y, m, d), t = L.term(y, m, d);
    lines.push(y + "年" + m + "月" + d + "日  " + (o.day === 1 ? (o.leap ? "閏" : "") + mName[o.month] + "月" : dayName(o.day)) +
      "  星期" + WEEK[L.weekday(y, m, d)] + (t >= 0 ? "  " + TERMS[t] : ""));
  }
  const good = { days: 0, bad: [], termBad: [] };
  compareText(lines.join("\n"), good);
  const altered = lines.slice(); altered[3] = altered[3].replace("閏六月", "六月");
  const bad = { days: 0, bad: [], termBad: [] };
  compareText(altered.join("\n"), bad);
  const ok = good.days === days.length && good.bad.length === 0 && good.termBad.length === 0 && bad.bad.length >= 1; // a wrong month start also shifts the days after it
  console.log("selftest " + (ok ? "ok" : "FAILED") + ": clean " + good.bad.length + "/" + good.termBad.length + " mismatches, altered " + bad.bad.length);
  return ok ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) process.exit(selftest());
  const fetchFirst = args.includes("--fetch");
  const dir = args.filter((a) => a !== "--fetch")[0];
  if (!dir) { console.error("usage: node tests/hko-compare.mjs [--fetch] <dir> | --selftest"); process.exit(2); }
  if (fetchFirst) mkdirSync(dir, { recursive: true });
  const acc = { days: 0, bad: [], termBad: [] }, years = [], missing = [];
  for (let y = 1901; y <= 2100; y++) {
    const file = join(dir, "T" + y + "c.txt");
    if (fetchFirst && !existsSync(file)) {
      try {
        const r = await fetch(URL_OF(y));
        if (r.ok) writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        else console.error("fetch " + y + ": HTTP " + r.status);
      } catch (e) { console.error("fetch " + y + ": " + e.message); }
      await new Promise((res) => setTimeout(res, 300));
    }
    if (!existsSync(file)) { missing.push(y); continue; }
    const before = acc.days;
    compareText(decode(readFileSync(file)), acc);
    if (acc.days === before) { missing.push(y); continue; } // file present but nothing parsed
    years.push(y);
  }
  process.exit(report(acc, years, missing) || missing.length ? 1 : 0);
}
main();
