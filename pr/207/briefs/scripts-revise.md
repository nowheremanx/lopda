# Brief: Scripts "改一改" (revise a script with the AI), runtime 1.1.4

Read first: `CLAUDE.md`, `docs/design/scripts-revise.md` (the approved design, Chinese; it wins where this brief is vague),
`docs/decisions.md` section 34, `runtime/apps/scripts.js` (all of it), the `v-script-idea` and `v-script-edit` sections of
`runtime/index.html`, the `scripts.*` keys in `runtime/strings.js`, and the scripts / AI line tests in `tests/e2e.test.mjs`
(search "scripts:" and "AI line:").

Branch: `claude/project-thread-94wlzt` in this worktree (it has this brief and the design doc). Commit after each part. Do not push to main.
Do not delete `briefs/` (the foreman removes it).

## DATA SAFETY (most important; read twice)

- Never overwrite a script's code unless the old code has first been written successfully as a version.
  One function does every replacement: `replaceBody(s, code, why)` -> Promise<boolean>: `addVersion(s.id, oldBody, oldName, why)`
  resolves true -> then `saveScript` with the new body. If addVersion fails, return false and do not touch the script.
- While the AI is revising, the script document must not change. Today `saveCurrent()` reads `$("script-code").value`, and the
  back button, `flushSource()` on leave, and the `scheduleSave` timer all call it. During a revise the textarea shows the
  incoming code, so ALL of these must skip writing (or write the OLD body) while a revise of that script is running.
  Write a test for exactly this: start a revise, press back mid-stream, check the stored body is still the old one.
- Stop, failure, empty or rejected answer: put the old code back into the textarea; the stored script is unchanged.
- Never touch `data/users/local/scripts/data/<id>` (the script's PAD saves) in revise, paste or restore.
- Do not change the format of `scripts/items/<id>` (no new fields). Existing saved scripts must load exactly as before.
- Deleting a script deletes, in this order: data, versions, ask draft, then the script itself (script last, so a failure
  leaves a way back).

## MUST NOT CHANGE

- The 生成 flow (`generate()` behaviour, the idea page, its buttons) and the text of `scripts.prompt` (zh and en): not one character.
- `runtime/ai.js`, `apps/settings.js`, the AI settings page, backup.js, platform.js.
- SDK, SPEC.md, pad-shim.js, PAD: frozen.
- Other built-ins. Registry apps.
- Existing strings' meaning (you may add keys; only change an existing string if this brief says so).

## Part 1: pure helpers + versions store (commit)

In `scripts.js` (ES5, var/function, no modules):
- `REVISE_MAX = 64*1024` (characters of code).
- `revisePrompt(code, ask)`: rules = the part of `tr("scripts.prompt", {idea: MARK})` before the line that contains MARK
  (use a private marker string such as "\u0001IDEA\u0001"; cut at the start of that line, trim end). Then
  `tr("scripts.revise", {ask: ask, code: code})`. Return rules + "\n\n" + that.
  New string `scripts.revise` (zh + en), roughly: "下面是现在的程序：\n\n{code}\n\n我想改的是：{ask}\n\n输出改好后的完整 HTML 文件，
  从 <!doctype html> 到 </html>。没提到的地方保持原样。PAD.save 用到的 key 和数据结构不要变；非改不可就加 v 字段，先读旧存档、迁移、
  再写回。不要只写改动的部分，不要写「其余不变」，不要解释，只输出 HTML。" Put {code} BEFORE {ask} in the en text too.
  Careful: `tr` substitutes `{name}` placeholders; make sure braces inside the user's code are not treated as placeholders
  (check how `LP.tr` works; if it would touch them, insert the code by plain string concatenation instead).
- `checkRevision(oldBody, raw)` -> `{ok:true, code}` or `{ok:false, why:"empty"|"cut"|"partial"|"same"}`:
  code = cleanCode(raw); empty -> "empty"; old has `</html>` (case-insensitive) and code does not -> "cut";
  code.length < 0.4 * old.length, or code matches /其余(部分)?(代码)?(不变|同上|省略)|此处省略|rest (of the code )?(is )?unchanged|\.\.\.\s*existing code|\/\/\s*\.\.\.\s*$/im -> "partial";
  code === old.trim() -> "same".
  Expose both on `LP.scripts._test = {revisePrompt, checkRevision}` for tests (or a separate pure file if cleaner; if you add
  a runtime file, it must be added to index.html and sw.js SHELL).
- Versions: `M.versions = M.base.collection("versions")`, doc per script id: `{v:1, list:[{at, name, body, why}]}`, newest
  first, at most 10, total body characters at most 1,000,000 (drop oldest; always keep the newest one). Functions
  `loadVersions(id)` -> list ([] if none or unreadable; a doc with v>1 -> reject {code:"newer"} and the UI says scripts.newer),
  `addVersion(id, body, name, why)` -> Promise<boolean> (do not add if body is empty or equal to the newest version's body;
  that still counts as success), `deleteVersions(id)`.
- Ask drafts: `M.asks = M.base.collection("asks")`, doc per id `{v:1, text, updated}`; load / save debounced 600 ms like the
  idea draft; clear (delete) after a successful revise; deleted with the script.
- Node tests in a new `tests/scripts-revise.test.mjs`: revisePrompt keeps the rules identical to the 生成 prompt's start,
  contains the code and the ask, and does not mangle `{x}` inside code; checkRevision cases (each why, and ok). Look at how
  other tests load runtime scripts in node:vm (e.g. tests/notetext or strings tests) and keep it dependency-free.

## Part 2: the 改一改 page and the AI path (commit)

- index.html: new view `v-script-revise` modelled on `v-script-idea` (bar with ◂ back and title 改一改; textarea `script-ask`
  with placeholder; main button `revise-go`; secondary `revise-paste` (粘贴新版本) shown only without a key; note line;
  status line; a hidden selectable textarea for when copying fails, like `scripts-prompt-box`). Placeholder styled
  (`::placeholder{color:var(--ink-2)}` already applies? check). 44 px targets, fits 331x359 without the page scrolling.
- Register `LP.builtin({id:"script-revise", view:"script-revise", keepPad:false, enter, leave, lang})`.
- Editor action row: left button is 改一改 when the editor has code, 粘贴代码 when empty, 停止 while an AI job for this script
  runs. Update it on input too (empty <-> non-empty). Add 粘贴代码 as the FIRST item of the 选项 menu (new id `script-menu-paste`),
  calling the paste path below.
- Editor paste (both the row button when empty and the menu item): read clipboard -> cleanCode -> if the editor already had
  code, `replaceBody(s, code, "paste")`; if it was empty, as today. Keep toasts as today.
- Revise with a key (`revise-go` when `aiOn()`): save the ask draft; `saveCurrent(true)` first (so the latest typing is the
  old version); if code > REVISE_MAX refuse; if `G.job` exists toast `scripts.gen.one`. Then reuse the generate machinery
  (G, genHint, renderGen, keepAwake, the 1 s tick, visibilitychange "left") with a mode flag `G.mode = "revise"` and
  `G.old = {body, name}`. Show the editor; stream into the textarea only (never into `s.body`). On success:
  `checkRevision` -> fail: restore textarea, hint `scripts.revise.fail` {why: text for the code}; ok: `replaceBody(s, code, ask.slice(0,60))`,
  update name from `<title>` only if the current name is a default name (`/^(程序|Script) \d+$/`) or equals the old title,
  clear the ask draft, hint `scripts.revise.done` {t} ("改好了（用时 {t}）。不满意：选项 → 以前的版本。"). If the user left
  the editor, the same happens and a toast says it, exactly like generate.
  Stop / error: restore textarea (if still on this script), hint `scripts.gen.fail` as today. Generate's own behaviour must
  stay identical: factor shared code carefully, or add the revise branch beside it.
- Without a key: `revise-go` reads 复制提示词 and copies `revisePrompt(code, ask)` (fallback box on failure, like copyPrompt).
  `revise-paste` reads the clipboard -> checkRevision against the current code -> fail: status line says why; ok:
  replaceBody(s, code, ask or "paste") -> back to the editor with a toast.
- Code > REVISE_MAX: both buttons disabled, note line says `scripts.revise.toolong` {size}.
- Strings: add every new key in zh and en in `runtime/strings.js` (keys complete test). Short labels: 改一改 / Revise,
  改 / Revise it, 粘贴新版本 / Paste new version, 以前的版本 / Earlier versions, 换回这个 / Use this one,
  placeholder 想怎么改？例如：加一个暂停键 / What should change? e.g. add a pause button.

## Part 3: versions page (commit)

- 选项 menu gets 以前的版本 (`script-versions-open`) after 粘贴代码. View `v-script-versions`: bar ◂ + title; a list
  (`lcd-menu` style, like the library) of rows "time · why · size" (why: the ask, or 粘贴 / 换回 for "paste" / "restore");
  empty state line. Tapping a row shows that version's code read-only in the same view (a textarea readonly) with buttons
  换回这个 and 返回. 换回这个 -> `replaceBody(s, version.body, "restore")` (so the current code becomes a version), name
  from the version, back to the editor, toast.
- A confirms / B goes back on these screens like other built-ins (see how script-idea handles keys, if it does).

## Part 4: wrap-up (commit)

- Bump RUNTIME_VERSION in core.js and VERSION in sw.js to 1.1.4 (add any new runtime file to SHELL and index.html).
- decisions.md: new section 60 "脚本的「改一改」与版本（1.1.4）", short, in Chinese, in the style of section 34: why, what is
  sent, the 64 KB limit, full file not patches, the order version-then-replace, checks, versions 10 / 1 MB, no deep links to AI
  apps (owner 2026-11-21), what did not change. Mark `docs/design/scripts-revise.md` 状态 as 已实现.
- CLAUDE.md: in the Layout scripts description add one clause about 改一改 and versions (`scripts/versions/<id>`).
- e2e in `tests/e2e.test.mjs`, next to the AI line tests, reusing their OpenRouter route fake:
  1. with a key: open a script with code, 改一改, type an ask, 改; the request body contains the old code and the ask and the
     rules; the streamed answer replaces the code; versions doc has the old body; 以前的版本 lists it; 换回这个 restores it and
     the replaced code is itself a version; the script's PAD data doc is unchanged throughout.
  2. back pressed mid-stream: stored body still old; when the stream then finishes it is applied (version first).
  3. a truncated answer (no </html>) is rejected; body unchanged; no version added.
  4. without a key: 复制提示词 copies the revise prompt (grant clipboard permissions as the existing copy test does);
     粘贴新版本 applies a pasted file and stores a version.
  The existing assertion `#script-paste` innerText "粘贴代码" right after a generate (around line 9724) must now be "改一改":
  change only that line. All other existing scripts / AI line assertions must pass unchanged.
- Run only: `node --test tests/scripts-revise.test.mjs tests/strings.test.mjs tests/repo.test.mjs` and the scripts and AI line
  e2e tests (`node --test --test-name-pattern="scripts|AI line" tests/e2e.test.mjs`). Do not run the full suite.
- Report: what you changed per part, test output, time and tokens.
