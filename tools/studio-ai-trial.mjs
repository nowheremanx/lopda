#!/usr/bin/env node
// Tape4's AI harness against a real model, by hand (docs/design/studio.md 12.19.8). Not part of `node --test`: it
// needs a model on this machine. The harness runs in node:vm exactly as on the phone; only ask() differs: every request
// is flattened into one prompt and piped to a command that prints the model's answer.
//
//   node tools/studio-ai-trial.mjs --cmd "<command reading a prompt on stdin>" [--runs 3] [--only skel|edit] [--out dir]
//
// With OpenCode's DeepSeek v4.1 flash (the model class the harness is tuned for):
//   --cmd "~/.claude/skills/deepseek-subagent/scripts/run.sh -q -m opencode-go/deepseek-v4.1-flash -"
//
// It prints, per scenario and run: success, model calls and rewrites, seconds, and the result (a skeleton's card, key,
// tempo, length; an edit's reply and number of ops). --out keeps every transcript as JSON for reading prompts back.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
};
const CMD = arg("cmd", "");
const RUNS = Number(arg("runs", "3"));
const ONLY = arg("only", "");
const OUT = arg("out", "");
if (!CMD) {
  console.error("usage: node tools/studio-ai-trial.mjs --cmd \"<command reading a prompt on stdin>\" [--runs 3] [--only skel|edit] [--out dir]");
  process.exit(2);
}

const ctx = { console, Math, Date, JSON, Promise, setTimeout, clearTimeout };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["studio-song.js", "studio-edit.js", "studio-styles.js", "studio-tools.js", "studio-prompts.js", "studio-ai.js", "studio-harness.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "runtime", f), "utf8"), ctx, { filename: "runtime/" + f });
}
const S = ctx.LopdaSong, H = ctx.LopdaStudioHarness;

/* A chat model behind a one-shot command: the roles become headed blocks, and the last line asks for the answer only. */
function flatten(messages) {
  const parts = messages.map((m) => (m.role === "system" ? "SYSTEM PROMPT" : m.role === "assistant" ? "YOUR EARLIER ANSWER" : "USER") + "\n" + m.content);
  return "Do not use any tools and do not read files. You are the model behind an app; the conversation follows. " +
    "Write only your next answer.\n\n" + parts.join("\n\n");
}
function run(prompt) {
  return new Promise((resolve, reject) => {
    const p = spawn("bash", ["-c", CMD], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => resolve(out.split(/\n---\nsession:/)[0].trim()));
    p.stdin.end(prompt);
  });
}

function makeAsk(log) {
  return (messages) => {
    const t0 = Date.now();
    const job = run(flatten(messages)).then((text) => {
      const last = messages[messages.length - 1].content;
      log.push({ step: /TAPE4 STEP: (\w+)/.exec(messages[0].content)?.[1], turns: messages.length, ms: Date.now() - t0,
        rejected: /^That JSON was rejected: /.test(last) ? last : undefined, answer: text });
      return text;
    });
    job.stop = () => {};
    return job;
  };
}

const SKELETONS = [
  ["来个骨架", RUNS],
  ["来个雨夜骨架，慢一点", 1],
  ["an upbeat song for a morning walk", 1],
];
const EDITS = [
  ["副歌的军鼓加点 ghost note，贝斯更跳一点", 1],
  ["整首更欢快一点", 1],
  ["B 段去掉旋律", 1],
  ["改成 3/4 拍", 1],
];

const rows = [];
async function scenario(kind, text, i) {
  const log = [], stages = [], t0 = Date.now();
  let res, err;
  try {
    const opts = { text, ask: makeAsk(log), onStage: (s) => stages.push(s.id), now: Date.now() };
    res = await (kind === "skel" ? H.skeleton(opts) : H.edit({ ...opts, song: S.demoSong(0), focus: { screen: "song", pattern: 0, slot: 0 } }));
  } catch (e) {
    err = (e && (e.code || e.message)) + (e && e.stage ? " at " + e.stage : "");
  }
  const row = { kind, text, run: i + 1, ok: !err, calls: log.length, sec: Math.round((Date.now() - t0) / 1000), err };
  if (res && kind === "skel") {
    const s = res.song;
    row.result = `${res.card ? res.card.en || res.card.id : "?"} | ${S.NAMES[s.key]} ${s.scale} ${s.bpm} BPM | ${s.song.length} bars, ${Math.round(s.song.length * 240 / s.bpm)} s | ${s.patterns.length} patterns`;
  } else if (res) row.result = `${res.ops.length} ops`;
  if (res) row.reply = res.reply;
  row.rewrites = log.filter((l) => l.rejected).length;
  row.why = log.filter((l) => l.rejected).map((l) => l.step + ": " + l.rejected.slice(25, 140));
  rows.push(row);
  console.log(JSON.stringify(row));
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${kind}-${rows.length}.json`), JSON.stringify({ row, stages, log }, null, 1));
  }
}

for (const [text, n] of ONLY === "edit" ? [] : SKELETONS) for (let i = 0; i < n; i++) await scenario("skel", text, i);
for (const [text, n] of ONLY === "skel" ? [] : EDITS) for (let i = 0; i < n; i++) await scenario("edit", text, i);

const ok = rows.filter((r) => r.ok).length;
console.log(`\n${ok}/${rows.length} succeeded; ${rows.reduce((a, r) => a + r.calls, 0)} model calls, ${rows.reduce((a, r) => a + r.rewrites, 0)} rewrites`);
