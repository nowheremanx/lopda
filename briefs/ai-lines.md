# Brief: several AI lines, like eSIMs (runtime: next minor, e.g. 1.2.0)

Read first: `CLAUDE.md`, `docs/design/ai-lines.md` (the approved design, Chinese; owner approved all four questions in
section 10 on 2026-11-21; it wins where this brief is vague), `docs/decisions.md` sections 24, 34, 56, 58,
`runtime/ai.js`, `tests/ai.test.mjs`, the AI line part of `runtime/apps/settings.js` (from "the AI line" to the darkroom key,
plus `ready` and the backup/restore code that mentions `AIP`), the `v-set-ai` section of `runtime/index.html`, the `ai.*` keys
in `runtime/strings.js`, every `LP.ai` call in `runtime/apps/scripts.js`, `studio.js`, `pet.js`, and the "AI line:" and pet AI
tests in `tests/e2e.test.mjs`.

**Start only after Scripts 改一改 (branch claude/project-thread-n4g55u) is merged into main**: it also changes `scripts.js` and
uses `LP.ai`. Merge main into this branch first; take the next free RUNTIME_VERSION and decisions.md section at that time.

Branch: `claude/project-thread-v59h3b` (has the design doc and this brief). Commit after each part. Never push to main.
Do not delete `briefs/` (the foreman removes it). Run only the tests named in each part; never the full `node --test`.

## DATA SAFETY (most important; read twice)

- The user's existing OpenRouter key must survive the upgrade. v1 doc `{v:1, key, model, scoreModel}` becomes line `l1`
  (provider "openrouter", key, model, on:true), `def:"l1"`, and `scoreModel` -> `use.score = {line:"l1", model:scoreModel}`.
  v1 with only `scoreModel` and no key: no line; keep it as `use.score = {line:"", model:scoreModel}`.
- **Write only after a successful read.** If `S.db.doc(AIP).get()` fails (today the error is swallowed), set a flag
  `AI.readFailed`, show `ai.readfail` on the AI page and the settings row, and refuse EVERY write to `AIP` (add, toggle,
  delete, choose, save) until a later read succeeds. Otherwise adding one line after a failed read would erase the others.
  Test it (platform.test-style fake DB or an e2e that makes the get reject).
- A doc with `v > 2`: read nothing, write nothing, show `ai.newer` (a newer Lo-PDA wrote it). Test it.
- Every v2 write also writes the top-level mirror fields `key / model / scoreModel` from the first line that is on and whose
  provider is "openrouter" (empty strings if none), so an older cached runtime still finds its key.
- The whole `AIP` document stays out of the backup and a restore keeps this phone's document (the code at the `AIP` filters
  in settings.js). `LP.ai.saved()` must return the WHOLE v2 document (all lines), or null when there are no lines and no
  `use`. Extend the backup e2e: two lines, backup has no key of either, restore keeps both.
- Deleting a line removes its key from the document and every `use` entry pointing to it. Turning a line off keeps the key.
- A key is only ever sent to its own provider's URL from the table in ai.js. Test: with a DeepSeek line as default and an
  OpenRouter line for `score`, a scripts request goes to DeepSeek with the DeepSeek key, a score request to OpenRouter with
  the OpenRouter key, and neither key appears in the other request.
- Line ids: "l" + a counter `next` kept in the doc; never reused after a delete.

## MUST NOT CHANGE

- SPEC.md, sdk/, pad-shim.js, PAD: frozen. No `PAD.ai`. Registry apps.
- The text of the prompts the programs send (`scripts.prompt`, the revise prompt, Tape4's studio-prompts.js, petsim.js aiPrompt).
- What each program does with an answer; the wait-feedback hint in scripts; Tape4 AI and score-read flows beyond the line choice.
- ai.js behaviour for OpenRouter: SSE parsing, `onSignal` phases, the 60 s idle timeout, `[DONE]`, mid-stream `error` events.
  The existing `tests/ai.test.mjs` cases must pass unchanged (adjust only the call shape if `ask` now takes `url`).
- The score-model list page (OpenRouter /models, its cache doc `ai-models`) and its keyboard handling.
- backup.js, platform.js. Other built-ins' data.
- Existing string meanings (add keys; change an existing one only where this brief says).

## Part 1: ai.js providers (commit)

- `PROVIDERS` table, pure data, in this order: openrouter, deepseek, kimi, qwen, siliconflow. Each
  `{id, name: {zh, en}, url, model, vision, visionModel, site, keyHint}`; `name` is what the line is called
  (OpenRouter, DeepSeek, Kimi, 通义千问 / Qwen, 硅基流动 / SiliconFlow). URLs: each provider's OpenAI-compatible
  `/chat/completions`; Qwen = Aliyun DashScope compatible-mode. **Check each URL and each default / vision model name against
  the provider's official docs and write the doc link in a comment**; DeepSeek has vision:false. Do not guess model names:
  if a docs page is unreachable, leave a `TODO(owner): confirm` comment and say so in the report.
- `host().ask(o)` takes `o.url` (must be one of the table's URLs, else reject with code "http") and keeps everything else.
  Default model when `o.model` is empty: `o.fallbackModel` passed by the caller (the provider's), else MODEL.
- Thinking: count `delta.reasoning` AND `delta.reasoning_content`.
- Errors: keep `httpCode`; add a per-provider body check for "balance / insufficient" style errors that come as 400/403
  (map to "credit") only where the provider's docs name such a code; unknown stays "http".
- Optional per-provider `idle` (ms), default IDLE. Leave all at default unless docs say a provider is silent while thinking.
- Export `PROVIDERS` on `window.LopdaAI`.
- `tests/ai.test.mjs`: per provider, a fake stream with `reasoning_content` then content; url check rejects a foreign URL.
- `tests/repo.test.mjs` "the only other sites": allow the four new URLs, only in `runtime/ai.js`.
- Run: `node --test tests/ai.test.mjs tests/repo.test.mjs`.

## Part 2: data, migration and LP.ai (commit)

In settings.js (ES5). State `AI = {lines:[], def:"", use:{}, next:1, readFailed:false, newer:false, seen:[]}`.
- `loadAi(doc)` (pure, exposed for tests as `LP.ai._test.load`): v1 -> v2 per DATA SAFETY; v2 -> cleaned copy (drop lines with
  an unknown provider? NO: keep them, mark them unusable, never delete user data); returns the state.
- `saveAiDoc()`: refuses when readFailed/newer; writes `{v:2, next, lines, def, use, key, model, scoreModel}` (mirror fields).
- Rules: first line added becomes `def`; if `def` is turned off or deleted, `def` = first line that is on, else "".
  Uses: `scripts`, `studio`, `score`, `pet`. `pick(use)`: the `use` entry's line if it exists and is on (for `score` also vision),
  else the default line (for `score`: if the default cannot see, the first line that is on and can see), else null.
- `LP.ai`: `on(use)`, `ask(o)` (o.use; adds url, key, model; `o.model` still wins), `line(use)` -> `{id, name, provider, vision}`
  or null (never the key), `err(e, use)` -> text with the line's name and the provider's site for "credit", `watch(f)`,
  `saved()`, `PATH`. Keep `scoreModel()` working (returns the model `ask({use:"score"})` would use) until Part 4 moves its caller.
- After each real request, record `last = {ok, code?, at}` on that line (one write, debounced; skipped when readFailed).
- Tests: a node test of `loadAi` (v1 with key; v1 only scoreModel; v2; v>2; garbage) and of `pick`. If loading settings.js in
  node:vm is too heavy, move `loadAi` and `pick` into a small pure file `runtime/ailines.js` (then add it to index.html before
  settings.js and to sw.js SHELL) with `tests/ailines.test.mjs`.

## Part 3: the settings page (commit; screenshots at 331x359, zh and en)

Follow design section 3 exactly. Main settings row: 未接上 / line name (one line) / `{n} 条` (several). The AI page:
line rows (▣ card mark filled when on, hollow when off; name, `…` + last four of the key, a switch; second line = status from
`last` or 已关), `＋ 添加线路`, then — only when two or more lines are on — 默认线路 › and 谁用哪条 with four rows (脚本,
四轨机, 读谱, 宠物). Add line: provider list (five rows, one short line each) -> line page with key (dots, as today),
model (placeholder = provider default), 保存 (saves, then tests automatically; failure still saves and shows why), 试一下,
删除线路. Choosing a use: 默认 + every line that is on; for 读谱, lines that cannot see are shown greyed with `ai.novision`;
读谱 on an OpenRouter line keeps today's score-model row/list below. 44 px targets; A confirms, B goes back on every page and
list; the page scrolls in its one main area. Four tones only. Keep `ai.note` and `ai.pet` texts.
Strings: add zh + en for everything new (`ai.readfail`, `ai.newer`, `ai.novision`, `ai.add`, `ai.lines`, provider hints...).
Change `ai.key` from "OpenRouter 的 key" to a provider-neutral "key", and `ai.err.*` texts that name OpenRouter to take `{line}`.
Run: the "AI line:" e2e tests (`node --test --test-name-pattern="AI line" tests/e2e.test.mjs`).

## Part 4: callers (commit)

`scripts.js`: `use:"scripts"` in 生成 and 改一改 (`aiOn()` -> `LP.ai.on("scripts")`). `studio.js`: `"studio"` for the AI page,
`"score"` for 读谱 (replace `scoreModel()`; 读谱 is unavailable with `ai.novision` when no line can see); status line
`studio.ai.on` shows the line name. `pet.js`: `"pet"`. Errors through `LP.ai.err(e, use)`.
e2e: the two-lines routing test from DATA SAFETY, the backup test, a v1 -> v2 upgrade test (put a v1 doc in IndexedDB, boot,
the line is there and works). Run those plus the pet AI e2e tests and "Tape4" AI e2e tests by name.

## Part 5: docs (commit)

decisions.md new section (Chinese, like the others): why several lines, the five providers and the CORS test, what §34 rule
changed and what stays (no PAD.ai, no user URL, keys out of backup), the mirror fields and the downgrade caveat. Mark §34's
"只接 OpenRouter" bullet as replaced by the new section. CLAUDE.md layout line for ai.js. Bump RUNTIME_VERSION and sw.js VERSION
together. Then run the full `node --test` once and report.

## Report

Per part: what changed, tests run and results, wall time and tokens. List any model name or URL you could not confirm.
iPhone checklist for the owner (Chinese) at the end: upgrade with an existing key, add a DeepSeek line, choose 读谱, backup/restore.
