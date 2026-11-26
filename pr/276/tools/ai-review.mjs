#!/usr/bin/env node
// AI pre-review of a pull request, run by .github/workflows/ai-review.yml when the owner comments `/review`.
//
//   node tools/ai-review.mjs <diff file> <pr json file> <out.md>
//
// Everything in the PR (diff, title, body, file names) is untrusted data written by a stranger. So this script:
//   - never runs, imports or installs anything from the PR; it only reads the diff as text;
//   - makes exactly one network request, to the one API URL set by the workflow (AI_REVIEW_URL), and nothing else;
//   - gives the model no tools: a chat completion in, text out, so a prompt injection in the PR can at worst make the
//     answer wrong, never run a command or read the key;
//   - runs a fixed local scan (risky paths, network/eval/storage calls in added lines, encoded blobs, injection phrases),
//     plain string matching that nothing written in the PR can talk out of a finding; the badge is the stricter of the
//     scan and the model (docs/ai-review.md, which is also the model's instructions);
//   - neutralises @mentions and caps the comment, so the answer cannot ping people or flood the thread.
// The result is advice for the owner, who still reads the PR and decides.
//
// Environment: AI_REVIEW_KEY (secret), AI_REVIEW_URL (an OpenAI-compatible chat completions URL),
// AI_REVIEW_MODEL. Without a key it writes the local scan only, which is also how the tests run it.
// Node 20+, no dependencies.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_URL = "https://api.deepseek.com/chat/completions";
export const DEFAULT_MODEL = "deepseek-chat";

// Per-file and total limits on the diff text sent to the model. A bundled app's index.html carries lo-game and font
// blocks that are known released copies (check-app.mjs verifies them), so cutting a long file loses little; but the cut
// part is unread by the model, and the comment says so file by file.
export const FILE_LIMIT = 40000;
export const TOTAL_LIMIT = 240000;
export const COMMENT_LIMIT = 60000;

// The local scan. Each rule has a level per area of the repo: "red" (BLOCK), "yellow" (CHECK) or null (ignored there).
// Areas: app = registry/apps/**, web = runtime/** and sdk/** (browser code), node = tools/** and tests/**,
// ci = .github/**, docs = *.md and docs/**, other = the rest. The rules mirror docs/ai-review.md section 3.
export function areaOf(path) {
  if (/^\.github\//.test(path)) return "ci";
  if (/\.md$/i.test(path) || /^docs\//.test(path)) return "docs";
  if (/^registry\/apps\//.test(path)) return "app";
  if (/^(runtime|sdk)\//.test(path)) return "web";
  if (/^(tools|tests)\//.test(path)) return "node";
  return "other";
}

// Paths whose change alone needs a look, whatever the lines say.
const PATH_RULES = [
  [/^\.github\//, "red", "CI 配置 (.github/)：workflow 带着仓库的 token 运行"],
  [/^(docs\/ai-review\.md|tools\/ai-review\.mjs)$/, "red", "AI 预审自己的规则或脚本"],
  [/(^|\/)(package(-lock)?\.json|\.npmrc|yarn\.lock|pnpm-lock\.yaml)$/, "red", "npm 文件：本仓库没有任何 npm 依赖"],
  [/^tools\/check-app\.mjs$/, "red", "app 检查器：改动可能放过不安全的 app"],
  [/^sdk\/pad-shim\.js$/, "red", "PAD 桥：app 与 runtime 之间的权限关口"],
  [/^runtime\/apps\/store\.js$/, "red", "商店与沙盒运行器（sandbox、CSP）"],
  [/^runtime\/(sw|platform|backup|ai|ailines)\.js$/, "yellow", "用户数据、离线缓存、备份或 AI key 相关的 runtime 文件"],
  [/^tools\//, "yellow", "维护者和 CI 会运行的工具脚本"],
  [/^tests\//, "yellow", "CI 会运行的测试"],
  [/(^|\/)(LICENSE|NOTICE|LICENSING\.md)$/, "yellow", "许可证文件"],
  [/^registry\/apps\/[^/]+\/manifest\.json$/, null, ""],
];

// Patterns in added lines: [regex, {area: level}, what].
const CODE_RULES = [
  [/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon/,
    { app: "red", web: "yellow", node: "yellow", ci: "red", other: "yellow" }, "网络请求"],
  [/<(img|script|link|iframe|audio|video|source)\b[^>]*\b(src|href)\s*=\s*["']?https?:/i,
    { app: "red", web: "red", other: "yellow" }, "从外部网址加载资源"],
  [/\bimportScripts\s*\(|\bimport\s*\(\s*["'`]https?:/,
    { app: "red", web: "red", node: "red", other: "red" }, "加载远程代码"],
  [/\beval\s*\(|new\s+Function\s*\(|set(Timeout|Interval)\s*\(\s*["'`]/,
    { app: "red", web: "red", node: "yellow", other: "yellow" }, "用字符串执行代码 (eval)"],
  [/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b|\bcaches\./,
    { app: "red", web: "yellow", other: "yellow" }, "浏览器存储"],
  [/\b(parent|top|opener)\s*\.\s*(postMessage|location|document|frames|window)\b|\bwindow\.(parent|top|opener)\b/,
    { app: "red", web: "yellow" }, "访问 iframe 之外"],
  [/\bsandbox\s*=|Content-Security-Policy|allow-same-origin|allow-top-navigation|allow-popups/i,
    { app: "yellow", web: "red", node: "yellow", other: "yellow" }, "沙盒或 CSP 设置"],
  [/\batob\s*\(|String\.fromCharCode\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+|(\\x[0-9a-f]{2}){3}|(\\u[0-9a-f]{4}){4}/i,
    { app: "yellow", web: "yellow", node: "yellow", ci: "red", other: "yellow" }, "解码或混淆的文本"],
  [/\b(child_process|execSync|spawnSync|execFileSync)\b/,
    { app: "red", web: "red", node: "yellow", other: "red" }, "运行外部命令 (Node)"],
  [/\bprocess\.env\b/, { app: "red", web: "red", node: "yellow", other: "yellow" }, "读取环境变量"],
  [/\bsecrets\.|\bGITHUB_TOKEN\b|pull_request_target|\bcurl\s|\bwget\s|\|\s*(ba)?sh\b/,
    { app: "red", web: "red", node: "red", ci: "red", other: "red" }, "密钥、token、下载或管道执行"],
  [/ignore (all |the )?(previous|above|prior) (instructions|rules)|you are (now )?an? (ai|assistant|reviewer)|VERDICT\s*:|忽略(之前|以上|前面)的|(作为|你是).{0,6}(AI|审查|助手)/i,
    { app: "red", web: "red", node: "red", ci: "red", docs: "red", other: "red" }, "疑似写给 AI 的指令（提示词注入）"],
];

// A run of base64-like characters this long is probably an encoded payload; data: images, fonts and audio are allowed.
const BLOB = /[A-Za-z0-9+/=_-]{400,}/;
const DATA_URL = /data:(image|font|audio)\/[a-z0-9.+-]+;base64,/i;
// Library blocks that check-app.mjs verifies by hash: lines inside them are not scanned.
const LIB_OPEN = /<script[^>]*\bdata-lo-(game|3d|font)\b/i;
const LIB_CLOSE = /<\/script>/i;

// Generated files: not scanned for code, not sent to the model.
export const GENERATED = [/^registry\/index\.json$/];

// Split a unified diff (git / gh pr diff) into files: {path, text, added: [{line, text}]}.
export function splitDiff(diff) {
  const files = [];
  let cur = null;
  let newLine = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const m = / b\/(.*)$/.exec(raw);
      cur = { path: m ? m[1] : raw.slice(11), text: "", added: [] };
      files.push(cur);
    }
    if (!cur) continue;
    cur.text += raw + "\n";
    if (raw.startsWith("+++ ")) {
      // "+++ b/path" names the new file; "+++ /dev/null" a deleted one (keep the path from the diff line).
      if (raw !== "+++ /dev/null" && raw.startsWith("+++ b/")) cur.path = raw.slice(6);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) { newLine = Number(hunk[1]); continue; }
    if (raw.startsWith("+")) { cur.added.push({ line: newLine, text: raw.slice(1) }); newLine++; }
    else if (raw.startsWith(" ")) newLine++;
  }
  return files;
}

// The local scan: [{level: "red" | "yellow" | "info", path, line?, what}], red first.
export function scan(files) {
  const out = [];
  for (const f of files) {
    if (GENERATED.some((re) => re.test(f.path))) continue;
    const area = areaOf(f.path);
    for (const [re, level, what] of PATH_RULES) {
      if (re.test(f.path)) { if (level) out.push({ level, path: f.path, what }); break; }
    }
    if (area === "docs") {
      // Docs are text for people (and sdk/PROMPT.md talks to AI on purpose), but an injection phrase is worth a look.
      for (const a of f.added) {
        const r = CODE_RULES[CODE_RULES.length - 1];
        if (r[0].test(a.text)) out.push({ level: "yellow", path: f.path, line: a.line, what: r[2] });
      }
      continue;
    }
    let inLib = false, dataUrls = 0;
    for (const a of f.added) {
      if (!inLib && LIB_OPEN.test(a.text)) { inLib = !LIB_CLOSE.test(a.text); continue; }
      if (inLib) { if (LIB_CLOSE.test(a.text)) inLib = false; continue; }
      for (const [re, levels, what] of CODE_RULES) {
        const level = levels[area];
        if (level && re.test(a.text)) out.push({ level, path: f.path, line: a.line, what });
      }
      if (DATA_URL.test(a.text)) dataUrls++;
      else if (BLOB.test(a.text)) out.push({ level: "yellow", path: f.path, line: a.line, what: "很长的编码字符串（不是 data: 图片、字体或音频）" });
    }
    if (dataUrls) out.push({ level: "info", path: f.path, what: dataUrls + " 行 data: 图片、字体或音频（app 里正常）" });
  }
  const rank = { red: 0, yellow: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// Cut the diff to the limits; generated files are left out and named. Returns {text, cut, skipped}.
export function trimDiff(files, fileLimit = FILE_LIMIT, totalLimit = TOTAL_LIMIT) {
  let text = "";
  const cut = [], skipped = [];
  for (const f of files) {
    if (GENERATED.some((re) => re.test(f.path))) { skipped.push(f.path); continue; }
    let t = f.text;
    if (t.length > fileLimit) { t = t.slice(0, fileLimit) + "\n[... rest of this file's diff not shown ...]\n"; cut.push(f.path); }
    if (text.length + t.length > totalLimit) { cut.push(f.path); continue; }
    text += t;
  }
  return { text, cut: [...new Set(cut)], skipped };
}

// Make text safe to post: no @mentions (they would notify people), a length cap.
export function sanitize(s, limit = COMMENT_LIMIT) {
  let t = String(s).replace(/@(?=[A-Za-z0-9_-])/g, "@​");
  if (t.length > limit) t = t.slice(0, limit) + "\n\n[... cut ...]";
  return t;
}

export function buildPrompt(pr, trimmed) {
  const rules = readFileSync(join(ROOT, "docs", "ai-review.md"), "utf8");
  const checklist = readFileSync(join(ROOT, "docs", "REVIEW.md"), "utf8");
  const system = rules + "\n\n---\n\n# docs/REVIEW.md (app review checklist, for the 规则 section)\n\n" + checklist;
  const meta = [
    "Title: " + (pr.title || ""),
    "Author: " + ((pr.author && pr.author.login) || ""),
    "From a fork: " + (pr.isCrossRepository ? "yes" : "no"),
    "Body:\n" + (pr.body || ""),
  ].join("\n");
  const notes = [];
  if (trimmed.cut.length) notes.push("These files' diffs were cut or left out (not shown to you): " + trimmed.cut.join(", "));
  if (trimmed.skipped.length) notes.push("Generated files left out on purpose (do not report): " + trimmed.skipped.join(", "));
  const user = "<untrusted_pr>\n" + meta + "\n\nDiff:\n" + trimmed.text + "\n</untrusted_pr>" +
    (notes.length ? "\n\n" + notes.join("\n") : "") +
    "\n\nAnswer now in the format of section 4. The first line must be VERDICT: PASS, VERDICT: CHECK or VERDICT: BLOCK.";
  return { system, user };
}

// The model's verdict from its first VERDICT line; null when missing (counted as CHECK).
export function parseVerdict(answer) {
  const m = /^\s*\**\s*VERDICT\s*[:：]\s*\**\s*(PASS|CHECK|BLOCK)\b/im.exec(String(answer || ""));
  return m ? m[1].toUpperCase() : null;
}

const ORDER = ["PASS", "CHECK", "BLOCK"];
// The final verdict: the stricter of the local scan and the model. No AI answer counts as CHECK.
export function finalVerdict(findings, aiVerdict) {
  const local = findings.some((f) => f.level === "red") ? "BLOCK" : findings.some((f) => f.level === "yellow") ? "CHECK" : "PASS";
  const ai = aiVerdict || "CHECK";
  return { local, ai, final: ORDER[Math.max(ORDER.indexOf(local), ORDER.indexOf(ai))] };
}

const BADGE = { PASS: "✅ PASS 没发现问题", CHECK: "⚠️ CHECK 需要你看", BLOCK: "❌ BLOCK 不建议合并" };
const SHORT = { PASS: "✅ PASS", CHECK: "⚠️ CHECK", BLOCK: "❌ BLOCK" };
const DOT = { red: "🔴", yellow: "🟡", info: "⚪" };

export function formatComment({ findings, cut, answer, model, error }) {
  const aiVerdict = error ? null : parseVerdict(answer);
  const v = finalVerdict(findings, aiVerdict);
  const one = (/^\s*一句话\s*[:：]\s*(.+)$/m.exec(answer || "") || [])[1];
  const reds = findings.filter((f) => f.level === "red").length;
  const yellows = findings.filter((f) => f.level === "yellow").length;
  const lines = ["## " + BADGE[v.final], ""];
  if (one) lines.push("> " + one.trim(), "");
  lines.push("| 来源 | 结果 |", "|---|---|",
    "| 本地扫描（固定规则） | " + SHORT[v.local] + " · 🔴 " + reds + " · 🟡 " + yellows + " |",
    "| AI" + (model ? "（" + model + "）" : "") + " | " + (error ? "⚠️ 没完成" : aiVerdict ? SHORT[aiVerdict] : "⚠️ 没给出结论") + " |",
    "", "<sub>总评取两者中更严的那个；AI 说 PASS 盖不掉本地扫描的红灯。规则见 docs/ai-review.md。仅供参考，合并由你决定。</sub>", "");
  if (cut.length) {
    lines.push("🟡 **AI 没读全的文件**（请自己看剩余部分）：" + cut.map((p) => "`" + p.replace(/`/g, "'") + "`").join(", "), "");
  }
  lines.push("<details" + (reds || yellows ? " open" : "") + "><summary>本地扫描 / Local scan</summary>", "");
  if (!findings.length) lines.push("- ✅ 无");
  for (const f of findings.slice(0, 80)) {
    lines.push("- " + DOT[f.level] + " `" + f.path.replace(/`/g, "'") + (f.line ? ":" + f.line : "") + "` " + f.what);
  }
  if (findings.length > 80) lines.push("- ... 另有 " + (findings.length - 80) + " 条");
  lines.push("", "</details>", "", "### AI 意见", "");
  if (error) lines.push("_" + error + "_");
  else {
    // Drop the VERDICT and 一句话 lines (shown above) and keep the rest as the model wrote it.
    const body = String(answer || "").split("\n")
      .filter((l) => !/^\s*\**\s*VERDICT\s*[:：]/i.test(l) && !/^\s*一句话\s*[:：]/.test(l)).join("\n").trim();
    lines.push(body || "_(empty answer)_");
  }
  return sanitize(lines.join("\n"));
}

// The useful part of an error body: {error: {message}} / {message} / plain text, one line, at most 300 characters.
export function errorText(body) {
  let t = String(body || "");
  try {
    const j = JSON.parse(t);
    t = (j.error && (j.error.message || j.error.type || JSON.stringify(j.error))) || j.message || j.detail || t;
  } catch (e) { /* not JSON: keep the text */ }
  t = String(t).replace(/\s+/g, " ").trim();
  return t.length > 300 ? t.slice(0, 300) + "..." : t || "(no body)";
}

// GET <base>/models next to <base>/chat/completions; [] when it fails. Same host and key as the review call.
async function listModels(url, key) {
  if (!/\/chat\/completions$/.test(url)) return [];
  try {
    const res = await fetch(url.replace(/\/chat\/completions$/, "/models"), {
      headers: { authorization: "Bearer " + key }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.data || []).map((m) => String(m.id)).filter((id) => /^[\w.:\/-]{1,80}$/.test(id)).slice(0, 60);
  } catch (e) { return []; }
}

// OpenCode Go routes requests by client and session: it asks for a stable x-opencode-session per conversation and a
// user agent naming the client (opencode.ai/docs/console/go). One review is one conversation. Other APIs get neither.
const SESSION = "lopda-ai-review-" + randomUUID();
export function requestHeaders(url, key) {
  const h = { "content-type": "application/json", authorization: "Bearer " + key };
  if (/^https:\/\/opencode\.ai\//.test(url)) {
    h["x-opencode-session"] = SESSION;
    h["user-agent"] = "lopda-ai-review/1 (+https://github.com/nowheremanx/lopda)";
  }
  return h;
}

async function callModel({ url, key, model, system, user }) {
  const res = await fetch(url, {
    method: "POST",
    headers: requestHeaders(url, key),
    body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(300000),
  });
  const text = await res.text();
  // On an error, show the API's own reason (cut short; it never holds the key) and, when the URL looks like
  // .../chat/completions, the model ids the same API offers, so a wrong model name or plan is plain to see.
  if (!res.ok) {
    let msg = "model API answered HTTP " + res.status + ": " + errorText(text);
    const ids = await listModels(url, key);
    if (ids.length) msg += "\nModels this API offers: " + ids.join(", ");
    throw new Error(msg);
  }
  const json = JSON.parse(text);
  return json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : "";
}

async function main() {
  const [diffPath, prPath, outPath] = process.argv.slice(2);
  if (!diffPath || !prPath || !outPath) {
    console.error("usage: node tools/ai-review.mjs <diff file> <pr json file> <out.md>");
    process.exit(2);
  }
  const files = splitDiff(readFileSync(diffPath, "utf8"));
  const pr = JSON.parse(readFileSync(prPath, "utf8"));
  const findings = scan(files);
  const trimmed = trimDiff(files);
  const key = process.env.AI_REVIEW_KEY || "";
  const model = process.env.AI_REVIEW_MODEL || DEFAULT_MODEL;
  const url = process.env.AI_REVIEW_URL || DEFAULT_URL;
  let answer = "", error = "";
  if (!key) error = "AI_REVIEW_KEY is not set: local scan only.";
  else {
    try {
      const { system, user } = buildPrompt(pr, trimmed);
      answer = await callModel({ url, key, model, system, user });
    } catch (e) {
      error = "AI call failed: " + (e && e.message ? e.message : "unknown error");
    }
  }
  writeFileSync(outPath, formatComment({ findings, cut: trimmed.cut, answer, model: key ? model : "", error }));
  console.log(findings.length + " local finding(s); " + (error || "AI answer " + answer.length + " characters"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
