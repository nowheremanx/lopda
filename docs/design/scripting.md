# 本地脚本 / 本地程序：方向研究

状态：v1 已实现（2026-10-21，`runtime/apps/scripts.js`）。替代已搁置的 LPBasic 方案（见 `docs/design/lpbasic.md`）。
结论：**不做新解释器；用浏览器原生的 JavaScript，把脚本当作“本地程序”在现有沙盒里跑。**

## 1. 结论

- **语言用 JavaScript**，不设计新语言，不写解释器。
- **运行方式**：和商店 app 一样，在 `<iframe sandbox="allow-scripts">` + CSP 里跑；网络、父页面、存储 API 都进不去，只通过 `PAD` 桥拿能力。
- **两种文件**：
  - `.html`：完整本地 app，沿用 `SPEC.md` / `sdk/LO-GAME.md`；游戏、复杂 UI 用这个。
  - `.js`：内置一个标准外壳（160×144 canvas + `PAD` + `requestAnimationFrame`），适合小程序和实验。
- **产品形态**：一个内置程序“脚本 / Scripts”（名字可再定），有脚本库、编辑器、运行页、从手机导入/导出。不是商店 app，不需要 manifest、审核和哈希。
- **不做 Python / MicroPython 第一版**。Python 太重；MicroPython 仍是 VM、子集、Host 绑定和 GC，收益不如原生 JS。

一句话：**不是“给 Lo-PDA 加一门语言”，而是“让 Lo-PDA 能跑本地 JS 程序”。**

## 2. 为什么是 JavaScript

| 维度 | JavaScript | MicroPython | Python (Pyodide) | Lua |
|---|---|---|---|---|
| 浏览器原生 | 是，零运行时 | 否，WASM | 否，WASM | 否，WASM |
| 运行时体积 | 0 | 约 1-2 MB | 10 MB+ | 约 200-400 KB |
| 速度 | 原生 | 慢 5-20 倍 | 慢 10-50 倍 | 慢 2-10 倍 |
| agent 熟悉度 | 最高 | 高 | 高 | 中 |
| 现有 Lo-PDA 代码 | 完全复用 | 要重写桥 | 要重写桥 | 要重写桥 |
| 沙盒 | iframe + CSP | WASM | WASM | WASM |
| 主要问题 | CPU 死循环、JS 权限面大 | 子集/标准库/GC | 太重 | 生态/熟悉度 |

JS 的优势不是“语法好”，而是**不用造运行时**。`sdk/PROMPT.md` 已经在教 agent 写 Lo-PDA app；`lo-game.js`、`PAD`、沙盒、文件、音乐、传感器都已存在。做一个本地脚本运行器，是把这些现成东西接起来，而不是再做一个平台。

## 3. 为什么不是 MicroPython

MicroPython 能跑，但放 Lo-PDA 上不划算：

- 需要一个 WASM 构建 + JS 胶水；体积和启动都不如原生 JS。
- 它是 Python **子集**：没有完整标准库、没有 pip，`asyncio`/游戏循环/画布都要另写绑定。agent 很容易写出“桌面 Python 能跑、MicroPython 不能跑”的代码。
- GC 和堆限制会带来新的性能/内存问题；160×144 的小游戏未必需要。
- 沙盒更强，但 Lo-PDA 已经有 iframe sandbox；本地脚本的信任模型和商店 app 一样，够用。
- 如果以后真有 Python 学习需求，再作为第二语言；第一版不做。

Python 本体（Pyodide）直接排除：十几 MB、启动慢、手机上不现实。

Lua 是技术上的备选：小、快、易嵌入、游戏脚本成熟。但 agent 熟悉度和现有代码复用都不如 JS；在“原生支持”这一点上，JS 已经赢了。

## 4. 运行模型

### 4.1 `.html` 本地程序

- 一个自包含 HTML 文件，和商店 app 同规格：≤ 512 KB、无外部资源、四色、无 emoji。
- 用 `lopdaWrapApp(html, opts)` 注入 CSP + `pad-shim`，放进 `iframe sandbox="allow-scripts"`。
- 可直接用 `sdk/lo-game.js`（用 `tools/bundle-app.mjs` 打进 HTML），做游戏。
- 不需要 manifest；本地运行器默认不显示手柄，只有代码读取 `PAD.isDown` / `PAD.on('press'/'release')` / `PAD.BUTTONS` 时才显示（纯触屏游戏因此多出约 120px 高度）；权限集合全开（见 4.4）。

### 4.2 `.js` 脚本

内置外壳大致是：

```html
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#a3ad7e}
#lp{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}</style>
<canvas id="lp" width="160" height="144"></canvas>
<script>/* 用户脚本 */</script>
```

脚本里可以直接用：

```js
const cv = document.getElementById("lp");
const ctx = cv.getContext("2d");
const T = PAD.TONES;              // ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"]

function frame(t) {
  ctx.fillStyle = T[3]; ctx.fillRect(0, 0, 160, 144);
  ctx.fillStyle = T[0]; ctx.fillRect(70, 60, 20, 20);
  if (PAD.isDown("left")) x -= 2;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- 画布固定 160×144，CSS 放大，`image-rendering: pixelated`。
- `PAD` 提供按键、存档、音效、音乐、环境音、文件、传感器、相机、朗读；和商店 app 完全一致。
- `requestAnimationFrame` 是原生帧循环，不需要 `VSYNC`。
- 需要 `canvas` 之外的能力？用 `.html`，不要给 `.js` 加一套新 DOM API。
- 不使用 `eval`/`new Function`；用户代码是内联 `<script>`，CSP 保持 `script-src 'unsafe-inline'`、`connect-src 'none'`。

### 4.3 运行器

- 内置“脚本”程序：脚本库（名字、类型、更新时间、大小）、AI 需求页（长 prompt 草稿、清空、复制）、编辑器（textarea/等宽）、运行页、导入/导出。
- 运行页复用商店的 `run` 视图或抽一个共享 runner：
  - iframe 每次新建，防止状态残留；
  - 错误面板显示 `window.onerror` 的行/列/消息；
  - 按钮栏看脚本是否需要（默认显示，游戏需要）；
  - HOME 退出；运行中保持屏幕常亮；
  - 运行前自动保存。
- 编辑器的语法检查：运行后由 iframe 的 `onerror` 报错，或用一个不执行代码的 `new Function` 做语法解析（运行时页面没有 CSP；但为了不引入 eval，优先用 iframe 报错）。
- 手机键盘/可视高度沿用 runtime 现有处理。

### 4.4 权限

本地脚本没有 manifest，运行器用一个默认权限集合：

- `files`、`notes`、`camera`、`motion`、`mic` 都可用，但每次仍走 runtime 自己的确认框（和商店 app 一样）。
- 或者更保守：第一版只给 `files` + `motion`，`notes/camera` 以后再加。建议默认给 `files`，其他按需开启。
- 不提供网络、localStorage、IndexedDB、cookies；存档走 `PAD.save/load`。

### 4.5 脚本存档：每个脚本一个子命名空间

这是本地脚本最容易做错的地方。所有脚本都跑在同一个内置程序下，如果直接共用 `PAD.save` 的 app key，两个脚本的同名 key 会互相覆盖；改脚本、删脚本、换脚本时数据归属也会乱。

规则：**脚本 id 是数据命名空间的唯一依据；编辑、重命名、替换内容都不改变 id，因此数据自然保留。**

#### 路径

```
data/users/local/scripts                   设置：{v, lastId, sort}
data/users/local/script-idea                AI 需求草稿：{v, text, updated}
data/users/local/scripts/items/<scriptId>  脚本源文件：{v, id, name, kind, body, created, updated}
data/users/local/scripts/data/<scriptId>   脚本存档：{v, kv, updated, bytes}
```

- `scriptId` 在新建/导入时生成（`LP.uid()` 一类），不是文件名；文件名/标题可以随便改。
- 源文件和存档**分开两个文档**：用户每改一次脚本不会重写存档，存档写入也不会碰源码。
- 三个路径都在 `data/users/local/...` 下，`dumpAll()` 和整机备份会自动包含；恢复后 id 不变，数据自然对上。
- 不需要把数据塞进 `LopdaPlatform.files`；`PAD.save` 只支持 JSON，256 KB 以内文档足够。

#### 运行期的映射

- 运行器启动脚本时记住 `S.runningScript.id`。
- iframe 里 `PAD.save(k, v)` / `PAD.load(k)` / `PAD.remove(k)` 仍然按原样发消息；父页面**不信任 iframe 传来的任何 id**，只用当前脚本 id 找到 `data/<scriptId>`。
- 启动时把该脚本的 `kv` 一次性读进内存；`PAD.load` 同步返回。`PAD.save` 先改内存，再按 500 ms 防抖写回文档。
- 离开运行页、切换脚本、页面隐藏时强制 flush 一次；写失败只 toast，不清内存，不覆盖旧数据。
- 这样脚本看到的还是普通的 `PAD.save/load`，不需要知道命名空间；不同脚本之间天然隔离。

#### 数据格式与限制

```js
// data/<scriptId>
{ v: 1, kv: { settings: {...}, sessions: [...] }, updated: 1690000000000, bytes: 1234 }
```

- 每个脚本上限 **256 KB**（和商店 app 的 `PAD.save` 预算一致）；超出时拒绝本次写入，保留上一版，toast 提示。
- 所有脚本合计上限建议 **2 MB**，在“脚本 → 存档”页显示用量；到上限时提示用户清理。这个上限集中在一个常量里，以后可调。
- `v` 用于以后迁移；读到比当前新的版本，拒绝运行并提示“存档来自更新的版本”，不要静默降级。
- `bytes` 只是显示/统计用，真正判断以 `JSON.stringify(kv).length` 为准。

#### 编辑、重命名、替换、复制

| 动作 | id | 数据 |
|---|---|---|
| 在编辑器里改代码并保存 | 不变 | **保留** |
| 重命名脚本/文件名 | 不变 | **保留** |
| 用手机上的同名文件“替换当前脚本内容” | 不变 | **保留**（这是更新脚本的正路） |
| 从手机“导入” | 新 id | 空 |
| 复制/另存为 | 新 id | 空（复制的是源码，不是存档） |
| 删除脚本 | 删除 | 一并删除，确认框写明 |

“导入”和“替换”必须分开：导入永远是新脚本，避免用户只是想试一个文件却覆盖了旧脚本的数据；替换是脚本菜单里的明确动作。

#### 手动删除

用户必须能自己清，而且要知道清的是什么：

- 脚本列表每行显示存档大小（如 `3.2 KB`）。
- 脚本菜单：
  - `清除存档`：只删 `data/<id>`，保留脚本；确认框写“清除 3.2 KB 的存档，设置和历史都会没”。
  - `删除脚本`：删源文件 + 存档；确认框写“脚本和它的 3.2 KB 存档都会删除”。
- 脚本程序的“存档”页（`脚本 → 存档`）：总用量、每个脚本的用量、逐项清除、`清空`（两次确认）。
- 运行中不允许清除当前脚本的存档；先停止/退出，避免内存里的旧值又写回去。
- 第一版不做回收站/撤销；确认框写清楚即可。删除是破坏性操作，按钮用 B 取消、A 确认，和内置程序一致。

#### 与整机备份的关系

- 备份包含脚本源文件、脚本存档、设置；恢复后 id 和数据都在。
- 如果用户只导出 `.html`/`.js` 文件，不包含存档；这是有意的：脚本文件是代码，存档是设备数据。
- 需要搬存档时，后续可加“导出脚本 + 存档”的 `.json` 包；第一版用整机备份即可。

#### 番茄钟的数据模型

番茄钟正好是这套存档的第一个真实用例：

```js
PAD.save("settings", { v: 1, work: 25, short: 5, long: 15, rounds: 4, sound: true });
PAD.save("timer", { v: 1, mode: "work", startedAt: 1690000000000, remaining: 0 });
PAD.save("sessions", [
  { start: 1690000000000, end: 1690001500000, minutes: 25, kind: "work", label: "写文档" }
]);
```

- 改脚本、改标题、替换内容，`settings`、`timer`、`sessions` 都还在。
- 用户点“清除存档”，三样一起清；点“删除脚本”，脚本和存档一起删。
- 应用内还可以有“清空历史”，那是脚本自己的业务，不是平台强制的。
- 历史只留最近 500 条（约 40 KB），超了从旧到新裁掉，保证 256 KB 上限不会被历史撑爆。

### 4.6 导入、导出、模板

- 导入：隐藏 `<input type="file" accept=".html,.htm,.js,.txt,text/html,text/javascript">`，UTF-8；上限 512 KB；`.js` 可自动包外壳。
- 导出：`LP.S.downloads.save` 分享原文件。
- 新建：空白 JS / 空白 HTML；首次打开另种一个番茄钟示例。
- 示例全部原创；不要把商店 app 或别人的游戏直接塞进内置示例。

### 4.7 第一个示例：番茄钟

首次打开「脚本」会把一个可运行的番茄钟种进脚本库；用户删掉它以后不会再自动出现。

番茄钟比账本小，但它把“脚本存档”这件事讲得最清楚：设置、进行中的计时、历史记录，都必须跨编辑保留。

- 主屏：大号剩余时间、当前模式（专注/短休息/长休息）、开始/暂停/重置；
- 设置：专注 25 分钟、短休息 5 分钟、长休息 15 分钟、每 4 轮、提示音；
- 历史：今天完成了几个番茄、总专注分钟、上一次完成时间；
- 结束：提示音、屏幕常亮、把一条 session 写进存档；
- 导出：`PAD.exportFile` 把 history 导出 CSV；
- 计时用 `Date.now()` 和时间戳，不用 `setInterval` 计数：页面被切走、屏幕锁了，回来还能算对；
- 离开/重置时保存 `timer`，下次打开能恢复；完成时只记一次，避免重复写历史。

它覆盖了：`PAD.save/load`、`PAD.sfx`、`PAD.exportFile`、`requestAnimationFrame`、四色 UI、键盘/触控、时间计算。它也是“编辑脚本不丢数据”的最直观验收：改一下提示音，历史还在。

### 4.8 第二个示例：CSV 小账本

如果还要一个偏“数据”的例子，做这个；不要做画板、计算器这种“演示功能”。

> 月底把银行/支付 App 导出的 CSV 丢进掌机，30 秒内知道这个月花在哪，再把汇总发回手机。

名字：`账本` / `Ledger`。一个自包含 HTML 本地程序，不联网。

界面：

- 顶部：月份、当月总支出、预算进度；
- 中间：按分类的 160×144 四色柱状图（餐饮、交通、购物、其他），下面是最近几笔；
- 底部：`导入 CSV`、`导出`、`+ 记一笔`；
- `+ 记一笔`：金额数字键盘、分类、备注、日期；保存到 `PAD.save`；
- 导入：`PAD.importFile({accept:["text/csv","text/plain"]})`，解析 `日期,商户,金额,分类`，合并/去重；
- 导出：`PAD.exportFile({name:"ledger.csv", type:"text/csv", data})`。

为什么它“有生产力”：

- 处理的是用户自己的真实数据，不是假数据；
- 有明确的输入/输出：CSV 进，图表和 CSV 出；
- 一次打开就能回答一个问题：“这个月钱花哪了”；
- 所有数据本地保存，不上传，符合 Lo-PDA 的设定；
- 不需要网络，不需要账号，不需要后端。

技术上它覆盖了本地程序的关键能力：

- 文件导入/导出（`PAD.importFile/exportFile`）；
- 本地存档（`PAD.save/load`，256 KB 够几千条）；
- Canvas 四色图表；
- 表单、数字键盘、列表滚动；
- 错误处理：坏 CSV、金额格式、缺列；
- `sdk/UI.md` 的 331×359 布局和 44 px 触控。

它也是 agent 的验收题：只给 `SPEC.md` + `sdk/LOCAL-SCRIPTS.md` + 这个需求，agent 能不能在 30 分钟内写出可用的版本。能，就说明“本地 JS 程序”这条路真的成立。

第二个示例可以更小：**专注计时 + 会话日志**（开始/暂停/结束，按项目统计，导出 CSV）。不要做第三个“画板”。

## 5. 安全与限制

| 风险 | 处理 |
|---|---|
| 网络 | iframe CSP `connect-src 'none'`；无 fetch/XHR/WebSocket |
| 父页面/存储 | `sandbox="allow-scripts"`，无 `allow-same-origin`；只用 `PAD` |
| 弹窗/导航 | 不给 `allow-popups` / `allow-top-navigation` |
| `eval` | CSP 不包含 `unsafe-eval`；用户代码内联执行 |
| 死循环 | 第一版接受（和商店 app 一样，刷新恢复）；要更强隔离时用 Worker 或 QuickJS |
| 资源 | 文件 ≤512 KB；`PAD.save` 256 KB；图片/音频内嵌 |
| 本地代码不可信 | 运行前一行提示“本地程序在沙盒里运行，但仍然可能卡住或画得不好”；不承诺审核 |

如果以后要**分享脚本**，再加两层之一：

- **Worker 执行**：把用户代码放进 Worker，父页面只收 160×144 帧和 PAD 消息；可以 `terminate()` 死循环。
- **QuickJS WASM**：同样的 JS 语言，硬沙盒 + 指令/内存上限；体积约 1 MB，速度慢一些。spec 不变，只是运行时换掉。

第一版不引入这两者，保持简单。

## 6. 工作量

| 部分 | 时间 |
|---|---:|
| 脚本库 + 编辑器 + 导入/导出 | 4-5 天 |
| 共享 runner（iframe、PAD、错误面板、按钮） | 3-4 天 |
| `.js` 外壳 + 160×144 画布 + 模板 | 2-3 天 |
| spec（`sdk/LOCAL-SCRIPTS.md`）+ 示例 + prompt | 2-3 天 |
| 测试/真机/打磨 | 3-5 天 |
| 合计 | **2-3 周** |

比 LPBasic（4-6 周 + Rust/WASM 维护）轻很多，而且没有新语言要学。

## 7. 需要 owner 拍板

1. **接受“本地 JS/HTML 程序”而不是“新语言解释器”**。我的建议：接受。
2. 第一版做 **一个内置“脚本”程序**，还是把“本地程序”并进商店？建议独立内置，避免和审核 app 混淆。
3. `.js` 外壳是否保留？建议保留：它让“脚本”真的像一个脚本，而不是必须写完整 HTML。
4. 默认权限：只给 `files`，还是把 `notes/camera/motion/mic` 也打开？建议先给 `files`，其余按需。
5. 死循环：先接受刷新恢复，还是第一版就上 Worker？建议先接受，分享功能出现后再上 Worker/QuickJS。

## 8. 验收门槛

- 导入一个 100 KB 的 `.html`，3 秒内运行；导入 `.js` 自动包外壳。
- 一个只用 `PAD` + canvas 的 160×144 小游戏稳定 60 fps。
- 脚本错误能显示行号/消息；HOME 退出后音乐/语音/传感器停止。
- 脚本库进整机备份，恢复后还在。
- 只读 `sdk/LOCAL-SCRIPTS.md` 的 agent，30 分钟内能写出一个可运行的小程序。
- `node --test`、e2e、`check-app` 全绿；`sw.js` 和 `RUNTIME_VERSION` 同步。

## 9. 参考

- 现有 app 规范：`SPEC.md`
- 沙盒/PAD 注入：`sdk/pad-shim.js` 的 `lopdaWrapApp`
- 商店运行器：`runtime/apps/store.js`
- 游戏框架：`sdk/LO-GAME.md`
- 已搁置的 LPBasic 研究：`docs/design/lpbasic.md`
