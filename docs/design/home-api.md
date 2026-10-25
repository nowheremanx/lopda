# 设计草稿：主屏 tile 的系统 API（PAD.home / LP.home）

状态：**设计草稿，未实现**。目标 runtime 0.45.0（版本号以实现时为准），基于 main `5804cd0` / runtime 0.44.0。
只动文档；实现清单见第 10 节。

背景：主屏每一格现在是“图标 + 名字 + 一行小字”。社区 app 的小字固定是 `v<version>`，内置程序可以在
`LP.builtin({icon, tag})` 里自己算图标和这行字（万年历显示今天的日期和最近的纪念日，宠物显示“带回了”）。
社区 app 没有办法改这一格。这个设计给社区 app 和内置程序同一件事：改自己那一格的一行字和图标，
用来放关卡、状态、倒计时这类“现在最想说的一句话”。

万年历和宠物现在就是这样做的；新 API 是增量，不替换这两个 hook。

## 已经和 owner 对齐的约束

下面这些不再作为选项讨论，本文按此写：

- 社区 app 用 `PAD.home.set({text, icon})`；内置程序用 `LP.home.set(id, {text, icon})`。旧 runtime 没有 `PAD.home`，app 要 feature-detect。
- 一行字替换默认的版本号；`text: ""` 隐藏这一行，`text: null` 恢复默认；`icon: null` 恢复默认；`icon` 是 16 × 16 的四色数组。
- 存储有长度上限，去掉 emoji，显示用 CSS ellipsis；不改商店里的 manifest icon。
- 只能改自己那一格；只有运行中的 app 能调用；限速（约 1 秒一次）；不需要新权限。
- 持久化在 `data/users/local/home`：`{ <id>: {text, icon} }`，整机备份自动包含。
- 卸载清掉；更新时清掉覆盖、回默认，等新版本第一次运行时再设。
- 渲染优先级：API 覆盖 > 内置 `LP.builtin` 的 `icon` / `tag` hook > registry manifest icon / 默认 `v<version>`。
  万年历和宠物这一版可以先不迁移。
- 本地脚本没有主屏那一格，调用返回 unavailable / ignored；不调用 API 的社区 app 继续显示 `v<version>`。

## 需要 owner 拍板的事（先看这里）

| # | 问题 | 推荐 |
|---|---|---|
| 1 | `PAD.home.set` / `LP.home.set` 的返回值 | `Promise<"saved" \| "limited" \| "unavailable">`；参数不合法时 reject。理由见 2.4 |
| 2 | 一行字的存储上限 | **32 个码点**（清洗后）。显示仍然交给 CSS ellipsis；存 32 是防止存储被撑大，不是显示宽度 |
| 3 | 省略 `text` / `icon` 字段是什么意思 | **不改这一项**。只有显式 `null` 才恢复默认；`{text: ""}` 才是隐藏 |
| 4 | `LP.home.set` 是否也限速 | 是，和 `PAD.home.set` 同一条 1 秒规则，按 id 记；内置程序也一次把 text 和 icon 传完 |
| 5 | 万年历和宠物现在迁不迁 | **不迁**。继续用 hook；哪天要迁，去掉对应的 `tag` / `icon` hook，改成变化时调用 `LP.home.set`，不需要数据迁移 |
| 6 | 开发台（`sdk/dev.html`）怎么表现主屏 | 这一版只返回 `"unavailable"` 并在日志里写出 `PAD.home.set` 的内容，不做主屏预览；预览以后再说 |
| 7 | 只换 manifest 图标 / 名称的元数据刷新算不算“更新” | **不算**，不清覆盖；只有 sha256 变了的版本更新才清。图标和名称是商店元数据，不是 app 代码 |

## 1. 目标和非目标

### 1.1 目标

- 社区 app 可以把主屏自己那一格的文字换成一句状态（最多一行），可以换 16 × 16 图标。
- 内置程序用同一套存储和渲染规则，但入口是可信的 `LP.home.set(id, ...)`。
- 不调用 API 的 app 完全不变：社区 app 仍显示 `v1.2.3`，内置程序的 hook 仍照常工作。
- 所有覆盖都是本机的、可备份的、可清除的；更新、卸载、恢复备份都不会留下“看不见的旧状态”。
- 规则简单到可以在 `sdk/pad-shim.js` 和 runtime 各实现一遍，而且不会破坏沙盒边界。

### 1.2 非目标

- 不做多行文字、滚动文字、跑马灯、动画图标。
- 不做 `PAD.home.get`。app 只写不读；它自己记得上次设了什么。没有读接口，也就没有“读到别的 app 状态”的问题。
- 不改商店条目的图标、名称、版本或权限说明。主屏覆盖只活在 `home` 文档里。
- 不做每个 app 的主屏设置页。设置页不列主屏覆盖，也不提供“恢复默认”按钮；app 自己负责。
- 不做本地脚本的主屏 tile。本地脚本是玩家自己的程序，不是商店 app，没有 manifest，也没有主屏那一格。
- 不把主屏文字当通知、提醒或跨 app 广播。它只是这一格的装饰。

## 2. API

### 2.1 社区 app：`PAD.home.set`

```js
// lopda/1, runtime 0.45.0 及以后；更旧的 runtime 上 PAD.home 是 undefined
PAD.home.set({ text: "第 3 关", icon: rows })   // -> Promise<"saved" | "limited" | "unavailable">
```

- `PAD.home` 是一个冻结对象，只有 `set` 一个方法。没有 `get`、`clear`、`on`。
- 不需要 manifest 权限；`PAD.spec` 仍是 `"lopda/1"`。
- feature-detect 写在 SPEC 里：

```js
if (PAD.home) {
  PAD.home.set({ text: "第 3 关" }).then(function (r) {
    if (r === "limited") { /* 1 秒内已经设过：这次丢了，下次再试 */ }
  });
}
```

- 在旧 runtime 上不判断就调用，是 app 自己的 TypeError；runtime 不为它做 polyfill。

### 2.2 内置程序：`LP.home.set`

```js
LP.home.set("calendar", { text: "今天 妈妈的生日" })   // -> Promise<"saved" | "limited" | "unavailable">
LP.home.set("calendar", { text: null })                // 回到 LP.builtin 的 tag()
LP.home.set("calendar", { icon: rows })                // 只换图标，tag 仍走 hook
```

- `id` 是主屏那一格的 id：内置程序是 `LP.builtin` 的 `id`，社区 app 是 manifest 的 `id`。
- 内置程序是主页面里的可信代码，不经过 postMessage；`LP.home.set` 可以指定任何 id。约定仍然只改自己的 id，
  但技术上不拦——它和 `LP.toast`、`LP.renderHome` 一样是内部 API。
- 和 `PAD.home.set` 用同一份清洗、校验、存储和渲染；只多了一个 `id` 入参，状态相同。
- 商店内部用一个不公开的 `LP.home.clear(id)` 做更新 / 卸载清理；它绕过 1 秒限速，app 拿不到。

### 2.3 参数语义

| 字段 | 类型 | 省略 / `undefined` | `null` | 有值 |
|---|---|---|---|---|
| `text` | string | 不改这一项 | 删除覆盖，回到默认那一行 | 清洗后的一行文字；`""` 表示隐藏这一行 |
| `icon` | 16 个字符串的数组 | 不改这一项 | 删除覆盖，回到默认图标 | 16 × 16 四色图标 |

- 一次调用至少要带 `text` 或 `icon` 之一；`set({})`、`set(null)`、`set({foo: 1})` 都 reject。
- 未知字段忽略，不报错。
- `text` / `icon` 的“有没有这个键”用 `hasOwnProperty` 判断，不能用真假值判断：`text: ""` 是有效的“隐藏”，
  不能掉回默认版本号；`text: null` 才是删除。
- 两个字段一起给时是原子的：图标不合法，文字也不会被写进去（见 3.3）。

### 2.4 为什么是 Promise + 状态字符串

- **Promise**：写入是 IndexedDB 的异步操作。app 可能想在 `PAD.exit()` 前确认已经保存；Promise 让它能等，
  也让 `"limited"` / `"unavailable"` 有地方回来。`PAD.save` 是 fire-and-forget，但它是高频存档，主屏文字不是。
- **三个状态**：
  - `"saved"`：已经写入，下一次主屏渲染就是新的。
  - `"limited"`：1 秒内重复调用，本次丢弃；app 可以过一会儿重试，或者把 text 和 icon 合成一次调用。
  - `"unavailable"`：没有主屏那一格（本地脚本）、存储还没就绪、或者写入失败；app 当成“这台机器没有这个功能”，不要弹错。
- **为什么不用 boolean**：`false` 分不清“被限速”和“根本没有主屏”，app 没法决定要不要重试。
- **为什么不用 `"ignored"`**：`"limited"` 和 `"unavailable"` 已经覆盖了两种“什么都没发生”：一个可以重试，
  一个不该重试。再加一个词只会让 app 多写一个分支。本地脚本回 `"unavailable"`。
- **参数不合法时 reject**：这属于程序错误，和 `PAD.dict`、`PAD.exportFile` 对坏参数的处理一致；未处理的 rejection
  会进 runtime 的错误框 / 开发台日志。限速和“没有主屏”不是错误，所以 resolve。
- **不回显清洗后的值**：app 知道自己传了什么；清洗规则是确定的、写在 SPEC 里的。回显会让返回值从状态字符串变成对象，
  也会让 app 以为需要保存服务端的“权威值”。主屏只是显示，不需要。
- **`"saved"` 不乐观**：只有 `put` 成功、内存里的覆盖已经更新、主屏已经重画（如果主屏正显示）才 resolve。
  写失败时回 `"unavailable"`，内存和画面都不变，下一次调用可以重试。

## 3. 一行文字和图标

### 3.1 文字

清洗顺序（runtime 做，shim 只做类型检查）：

1. 只接受字符串；其他类型 reject。
2. 把控制字符、换行、制表、零宽字符、双向控制字符换成空格。任何输入都不可能变成第二行。
3. 去掉 emoji（和 runtime 现有的 `noEmoji` 同一个正则，包括 Extended_Pictographic、旗帜、肤色、ZWJ、keycap）。
4. 连续空白合成一个空格，去掉首尾空白。
5. 按**码点**截到 32 个（`Array.from(s).slice(0, 32).join("")`），不按 UTF-16 长度截。
6. 结果为空字符串就是“隐藏这一行”。例如 `"   "`、`"😀"`、只有控制字符的输入都等于 `""`。

其他规则：

- 文字替换的是**整行**，不会自动加 `v`。app 想显示 `v1.2.3` 可以自己写。
- 不做换行、不自动加省略号到存储里；存储里就是清洗后的原文（最多 32 个码点），省略号由 CSS 画。
- 32 个码点是**存储上限**，不是显示宽度。主屏一格在 331 px 宽时约 84 px，14 px 像素字一行大约只放得下
  6 个汉字或 12 个拉丁字母；大多数 32 字的文字都会被省略号截掉。这样定是因为：给 app 留出写完整短语的余量，
  同时保证每个 app 的覆盖最多几百字节，备份不会被主屏文字撑大。
- 不翻译、不按 `PAD.lang` 变。app 在运行时用当时的 `PAD.lang` 设一次；语言切了但 app 没再运行，就保留上一次的字。
- `.tag` 的样式改成一行省略：

```css
.tag{
  width:100%; max-width:100%; text-align:center;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
```

  当前 `.tag` 没有 `nowrap` / `overflow`，很长的内置 tag（比如“3天后 妈妈生日”）会挤宽格子；这次一起修好。
  没有文字（默认就没有 tag，或 API 设了 `""`）时不创建 `.tag` 元素，格子不会多出一条空白。

### 3.2 图标

- 只接受和 manifest `icon` 完全一样的 16 × 16 四色数组：16 个字符串，每个 16 个字符，字符只能是 `.` `0` `1` `2` `3`。
  `.` 是透明，`0`–`3` 是 `LP.TONES` 的四个色调。直接复用 `LP.validIcon` / `LP.iconCanvas`。
- 不接受 data URL、base64、canvas、函数、SVG、动画或超过 16 × 16 的图。API 只传像素。
- 渲染仍然是现有的 64 × 64 tile 里的 75%（48 px），`image-rendering: pixelated`，和内置程序、商店 app 的图标同一个画法。
- 不合法的图标让整次调用 reject，文字也不写。图标和文字不一样：文字可以清洗、截断，坏图标没有合理的“近似值”，
  静默丢掉图标会让 app 以为设置成功。
- `icon: null` 删除 `icon` 键，回到内置 hook 或 manifest icon。`icon` 键不存在和 `icon: null` 在渲染上一样，
  但存储上前者是“没覆盖过”，后者会删掉旧覆盖。

### 3.3 原子性

一次 `set` 要么全部生效，要么全部不生效：

- 先校验参数类型和图标；任何一项不合法，整次 reject，不写存储。
- 文字清洗不会 reject（长度、emoji、换行都是清洗），除非 `text` 不是字符串。
- 写存储成功后，才更新内存里的覆盖并重画主屏；写失败就什么都不变，返回 `"unavailable"`。

## 4. 默认和渲染优先级

每一格按字段分别解析，不是整格二选一：

| 字段 | 第一优先 | 第二优先 | 第三优先 |
|---|---|---|---|
| 文字 | `home[id].text`（键存在，含 `""`） | 内置程序：`LP.builtin.tag()` 的返回值 | 社区 app：`"v" + (version || "?")` |
| 图标 | `home[id].icon`（键存在） | 内置程序：`LP.builtin.icon`（`ICONS` 的键或返回 16 行的函数） | 社区 app：manifest `icon`（`validIcon` 通过时），否则首字 / `?` 的 glyph |

- “键存在”是 `Object.prototype.hasOwnProperty.call(entry, "text")`。`text: ""` 是覆盖，隐藏；`text: null` 会删键，
  于是回到第二 / 第三优先。
- 只设文字时图标仍走 hook / manifest；只设图标时文字仍走 hook / 版本号。这是按字段覆盖，不是整格替换。
- 内置程序的默认文字是 `tag()`，可能是 `""`（日历没有最近的纪念日、宠物没有 tag 时），此时本来就没有那一行。
- 社区 app 的默认文字始终是 `v<version>`；`version` 缺失时是 `v?`，和现在一样。
- `fillTile` 目前第三个参数叫 `builtinIcon`，实现时改成“已经解析好的 16 行或 null”，由 `renderHome` 先查覆盖。
  这样 `fillTile` 不需要知道 app 是内置还是社区。
- 商店列表、运行页标题、备份里的 app 文档仍然用 manifest 的 `icon` / `version`。主屏覆盖只影响 `#home`。

例子：

```js
// 社区 app，只改文字：图标仍是 manifest icon，文字不再是 v1.2.3
PAD.home.set({ text: "第 3 关" });

// 隐藏文字：只剩图标和名字
PAD.home.set({ text: "" });

// 恢复默认版本号；图标不动
PAD.home.set({ text: null });

// 只换图标：文字仍是 v1.2.3（或该 app 已有的文字覆盖）
PAD.home.set({ icon: rows });

// 两个一起换，一次调用，避免撞上 1 秒限速
PAD.home.set({ text: "12 天后 生日", icon: rows });
```

## 5. 持久化

### 5.1 文档

一个文档，不是每个 app 一个：

```
data/users/local/home
```

```json
{
  "wordclock": { "text": "第 3 关" },
  "paint": { "text": "" }
}
```

（`paint` 还可以有 `icon`：16 个字符串，这里省略。）

- 键是 app / 内置程序的 id。id 来自 runtime 的 `S.running.id` 或 `LP.home.set` 的第一个参数，不接受 app 自己编的 id。
- `text` 键存在就表示覆盖，值可以是 `""`；`icon` 键存在就表示覆盖。
- 一个 id 的两个键都被 `null` 删掉后，把 id 从文档里删掉；文档空了就删掉 `home` 文档（`{}` 和不存在等价）。
- 不存 `version`、时间戳、来源 app 名或“上次设置时间”。形状就是 owner 定下的 `{ <id>: {text, icon} }`。
  以后要改形状，按 `docs/decisions.md` 第 13 节的原则做迁移，不做启发式兼容。

### 5.2 读取和缓存

- `boot.js` 在存储就绪后设置 `S.refs.home = db.doc(base + "/home")`，读一次到 `S.home`（一个没有原型的对象或普通对象 +
  `hasOwn` 检查）。读不到（文档不存在）就是 `{}`。
- 读取完成前主屏照常按默认渲染；读完如果主屏正在显示，再 `renderHome()` 一次。用户可能看到一瞬间的默认值，
  和现在 app 列表晚一点到是同一类现象，不为它加 loading。
- 读取失败（IndexedDB 错误）：本次开机内主屏覆盖不可用，`set` 返回 `"unavailable"`；**不写空文档**，
  免得把旧数据覆盖掉。下次开机再试。
- 恢复备份后页面会 `location.reload()`（settings 现在就是这么做的），所以不需要额外的“恢复后重新读 home”钩子。
- 没有存储（`S.db` 为空，`nostore`）：主屏显示默认，`set` 返回 `"unavailable"`。

### 5.3 写入

- 所有写操作走同一条 promise 链（和 `put` 的 per-path 链同一个思路，但覆盖“读内存 → 改 → 写整份文档”整段），
  避免两个 app 同时设置时后一个用旧快照把前一个覆盖掉。
- 每次操作在链里执行：校验 patch → 检查限速 → 以当前 `S.home` 为基础生成下一份文档 → `put` 整份文档 →
  成功后替换 `S.home`、记下这次的 `homeAt[id]`。写失败保持旧内存，不记时间，返回 `"unavailable"`，
  下一次调用可以立刻重试。
- 文档很小（每个 app 最多约 400 字节），整份写没有问题；不为它做逐字段 `update`，那会引入并发读改写。
- 限速按 id 记：`homeAt[id]`，`Date.now() - homeAt[id] >= 1000` 才放行。第一次调用总是放行。
  `LP.home.clear(id)` 是内部清理，不检查限速；卸载时 `deleteApp` 另外忘掉 `homeAt[id]`。

### 5.4 大小

- 每个 app 最坏约 32 个码点（UTF-8 最多 128 字节）+ 16 × 16 个字符（约 256 字节）+ JSON 结构，约 400 字节。
  100 个 app 也只有约 40 KB，远小于 256 KB 的 `PAD.save` 预算，也远小于备份里的照片和词典。
- 文档里只可能有已经安装的 app 的 id（`deleteApp` 会清），加上极端情况下从备份恢复回来的孤儿 id；孤儿不会渲染。

## 6. 更新、卸载、备份

### 6.1 安装和更新

- **首次安装**（`prev` 为空）：没有旧覆盖，主屏显示默认 `v<version>`。如果同一个 id 在 `home` 文档里有一条孤儿覆盖
  （比如从旧备份恢复回来、但 app 当时没装），安装时顺手删掉，保证“重新装回来是默认”。
- **更新**（sha256 变了，`prev` 存在）：`fetchApp` 在 `saveApp` 成功之后调用 `LP.home.clear(id)`。
  新版本第一次运行前，主屏已经回到 `v<新版本>` 或 hook 的默认值；新版本第一次运行想设就再设。
  更新失败、旧版本还在时，覆盖保留，因为玩家看到的还是旧 app。
- **只换 manifest 元数据**（`store.js` 里图标 / i18n 同步，sha256 没变）不算更新，**不清覆盖**。
  图标、名字是商店元数据，不是 app 代码；清掉会让玩家莫名其妙丢掉主屏设置。
- **预装 app**：首次静默安装等同首次安装；之后从商店更新走同一条“更新清覆盖”的路。
- 清理失败（存储错误）：`put` 已经会 toast；覆盖可能暂时还在，下一次更新 / 卸载会再清。这是存储故障，不是规则例外。

### 6.2 卸载

- `deleteApp(id)` 除了删 app 文档、`PAD.save` 数据和代码，还调用 `LP.home.clear(id)`，并删掉限速记录。
  社区 app 在运行页的“移除”走这个函数；以后商店如果加卸载按钮，也走同一个函数，两条路才一致。
- 本地脚本没有主屏 tile，删除脚本时不需要清 `home`（也不会有它的条目）。
- 卸载后重新安装是首次安装：默认，不恢复旧覆盖。

### 6.3 备份和恢复

- `home` 在 `data/users/local/` 下，`LopdaPlatform.dumpAll()` 会带上它，`backup.js` 的 `goodPath` 接受这个路径
  （4 段，偶数）。图标是 16 行字符串，进 `docs.json`，不需要新的二进制类型。
- 恢复时 `replaceAll` 一次事务写回所有文档，然后页面 reload；主屏读到恢复后的 `home`。没有单独合并，也不做“保留本机覆盖”。
- 恢复一个 0.44.0 的旧备份（没有 `home` 文档）：默认，和现在一样。
- 把新备份恢复到旧 runtime：旧 runtime 不认识 `home`，但 `replaceAll` 会原样保留这个文档；主屏忽略它。
  以后升级到新 runtime，覆盖会重新出现。
- 跨版本的极端情况：新备份 → 旧 runtime → 在旧 runtime 上更新 app → 再升级。旧 runtime 更新时不会清覆盖，
  升级后可能看到一条属于旧版本的覆盖。下一次更新 / 卸载会清掉；不为此在文档里加时间戳（会破坏 owner 定的形状）。
  这是可接受的边缘情况，写在这里是为了以后不把它当 bug 重新设计。

## 7. 旧 runtime、本地脚本和开发台

### 7.1 旧 runtime

- `PAD.home` 在 runtime 0.45.0 之前不存在。新 shim 只在 wrapper 传 `home: true` 时定义它；旧 runtime 用旧 shim，
  所以旧 runtime 上就是 `undefined`，feature-detect 生效。
- `PAD.spec` 不升，仍是 `"lopda/1"`。`home` 是增量能力，和 `PAD.music`、`PAD.camera` 一样靠属性存在与否判断。
- `LP.home` 只在主页面；旧 runtime 不会加载新内置程序，所以没有跨版本问题。
- 检查工具（`tools/check-app.mjs`）把 `PAD.home` 加进“需要 `lopda/1`”的检测；它不需要权限，所以不产生
  “用了接口没声明权限”的错误。`lopda/0` 的 app 用了就报错，和 `PAD.music` 等一样。

### 7.2 本地脚本

- 本地脚本也走同一个 sandbox runner 和同一个 shim，所以 `PAD.home` 存在；但运行时用 `S.running.local` 判断出
  它没有主屏那一格，直接回 `"unavailable"`。这就是 owner 说的“调用返回 unavailable / ignored”，本文统一用
  `"unavailable"`。
- 不为本地脚本造一个假 tile，也不把本地脚本写进 `home` 文档。这样删除脚本时没有需要清理的主屏状态。
- 本地脚本的作者仍然可以 feature-detect：`if (PAD.home)` 是真的，但调用不会生效；开发台日志会写出来。

### 7.3 开发台

- `sdk/dev.html` 的 wrapper 传 `home: true`，`PAD.home` 存在。
- dev 的 message handler 收到 `op: "home"` 时，把 `set` 的参数写进日志，回 `"unavailable"`：
  开发台没有主屏，不能假装保存成功。app 至少能走一遍参数校验和 feature 分支。
- 不做主屏预览（owner 拍板项 6）；如果以后要做，可以在开发台右侧放一个 64 × 64 tile + 一行字，回 `"saved"`。

## 8. 沙盒、安全和限速

| 风险 | 处理 |
|---|---|
| 改别人的格子 | shim 不发送 id；runtime 只从 `S.running.id` 取 id，并检查 `e.source === run-frame.contentWindow`。app 没有办法指定另一个 id |
| 不在运行也改 | `S.running` 为空、视图不是 `run`、frame 已经换掉时，消息不处理；退出后 frame 被清空，也不会有后续消息 |
| 本地脚本冒充 app | `S.running.local` 为真时直接 `"unavailable"`，不查也不写 `home` |
| 注入 HTML / 脚本 | 文字只用 `textContent` 创建文本节点，永远不 `innerHTML`；图标只按 16 × 16 的字符栅格化成 canvas，不执行任何内容 |
| 存储撑大 | 文字最多 32 个码点；图标固定 16 × 16；只有自己的 id 一个键；限速 1 秒一次 |
| emoji / 控制字符 / 双向文字 | 清洗时去掉 emoji、控制字符、零宽和双向控制字符，避免一行字里藏东西或显示成别的顺序 |
| 原型污染 | 读文档时用 `hasOwn`，只接受自己的键；不把 `__proto__` / `constructor` 当普通 id 写进对象 |
| 存储故障 | 读失败不写空文档；写失败回 `"unavailable"`，内存和画面不变 |
| 伪装成别的 app | app 只能改自己那一格，可以把自己的文字/图标画成别的 app 的样子，但点开还是它自己，商店里仍是真实的 manifest 名称、版本和图标。这是 app 自己的格子，不是权限问题 |
| 限速绕过 | 限速按 id 记，退出重开也不重置；绕过它只能改自己的装饰，没有安全收益 |

- **不需要新权限**：主屏文字和图标是这台机器上的装饰，不是玩家的数据，也不跨 app 读取。manifest 不变，
  商店条目不增加权限图标，安装时不多一次确认。没有 `get`，app 连自己的旧值都读不到。
- **限速**：每个 id 1 秒一次。被限速的调用不写存储、不重画，`resolve "limited"`。app 在一次调用里把 text 和 icon
  一起传，就不会撞上。内置程序的 `LP.home.set` 也走同一条规则；内部 `LP.home.clear` 不受限。
- **不弹窗**：设置成功/失败都不弹 toast（写失败时 `put` 自己的错误 toast 除外）。主屏文字是低频、非关键的状态，
  不应该打断玩家。app 想看结果就看返回值。

## 9. 内置程序迁移路径

### 9.1 现状

- 万年历：`LP.builtin({icon: dateIcon, tag: tag})`。`dateIcon()` 每次渲染画今天的日期；`tag()` 找最近的纪念日，
  返回“3天后 妈妈生日”或“今天 妈妈生日”。它还有一个 60 秒的 timer，日期变了且在主屏时 `LP.renderHome()`。
- 宠物：`LP.builtin({icon: icon, tag: tag, clock: clockHome, ...})`。图标和 tag 从宠物存档算；`clock` 每 15 秒 tick，
  需要时重画主屏；`resume` / `ready` 也会触发。
- 两者都是**渲染时算**，不存储。主屏一打开就是最新的，恢复备份后也不会留下旧 tag。这是 hook 的优点。

### 9.2 这一版

**不迁移。** `LP.builtin` 的 `icon` / `tag` hook 保留，行为不变。API 覆盖在 hook 之上；现在没有内置程序调用
`LP.home.set`，所以两套机制不会互相影响。

### 9.3 以后要迁的话

- 只迁需要迁的字段：只调用 `LP.home.set(id, {text})` 就只覆盖文字，图标继续走 `icon` hook；只设 `{icon}` 也一样。
- 去掉对应的 hook，避免“hook 还在算但永远被覆盖”的死代码；`LP.home.set(id, {text: null})` 可以回到 hook
  （如果 hook 还留着）。
- 只在值变化时调用，不要在每个 15 秒 tick 都写。把 text 和 icon 合成一次调用，避免 1 秒限速。
- 不需要数据迁移：hook 没有存储；`home` 文档里只有 API 覆盖。迁移的那一版把初始值设进去即可。
- 建议：除非有“必须在备份里保存这个派生值”或“内置程序不再常驻”的理由，否则万年历和宠物继续用 hook。
  derived state 不进备份，恢复后不会过期，也不增加写入。

## 10. 实现位置（只列清单，本 PR 不写代码）

| 文件 | 改动 |
|---|---|
| `runtime/home.js`（新，纯函数） | 文字清洗 / 截断、patch 校验、doc 合并 / 清洗、按优先级解析 tile；`window.LopdaHome`，不碰 DOM 和存储，`tests/home.test.mjs` 直接测 |
| `runtime/core.js` | `LP.home`（`set` / `clear`）、`S.home` 缓存、写入链、限速、`fillTile` 接收解析好的图标、`renderHome` 查覆盖、`LP.builtin` 的 hook 保持 |
| `runtime/boot.js` | 建 `S.refs.home`，读文档，读完后在主屏可见时重画 |
| `runtime/apps/store.js` | message handler 的 `op: "home"`、`homeReply`、`runApp` 传 `home: true`、`deleteApp` 清覆盖、`fetchApp` 更新 / 首次安装清覆盖 |
| `sdk/pad-shim.js` | `home: true` 时的 `PAD.home.set`、`op: "home"`、`op: "homed"` 的状态校验、参数类型预检、注释里的版本和能力表 |
| `runtime/lopda.css` | `.tag` 一行 + ellipsis；不新增颜色 |
| `runtime/index.html` / `runtime/sw.js` | 如果新增 `home.js`，加 script 和 SHELL；repo 测试会检查 |
| `sdk/dev.html` | `home: true`、`op: "home"` 日志、回 `"unavailable"` |
| `SPEC.md` | 第 6 节 API 列表 + 6.8 小节（返回值、text/icon 规则、feature-detect、无权限、限速、本地脚本 unavailable） |
| `sdk/UI.md` | 一行：主屏文字是一行短标签，会被 ellipsis，不要把关键信息只放在那里（可选） |
| `CLAUDE.md` | 实现后在 App spec 摘要里加一句；本设计稿阶段可以只放在 `docs/design/` |
| `tests/home.test.mjs` | 新纯函数测试 |
| `tests/pad-shim.test.mjs` | PAD.home 的存在性、消息形状、状态、坏参数 |
| `tests/e2e.test.mjs` | 见第 11 节；docs-only PR 不跑 |

版本：`runtime/core.js` 的 `RUNTIME_VERSION` 和 `runtime/sw.js` 的 `VERSION` 一起升到 0.45.0（或 owner 定的号）。

## 11. 测试计划

### 11.1 这个 PR（docs-only）

- `node --test tests/repo.test.mjs tests/strings.test.mjs`
- 不跑 e2e，不改 runtime，不需要截图；PR 里说明这是设计稿。

### 11.2 实现时

**单元（`tests/home.test.mjs`）**

- 文字：去 emoji、换行变空格、连续空白合并、首尾 trim、32 码点截断、UTF-16 代理对不被劈开、
  `""` / 只有空白 / 只有 emoji / 只有控制字符 → `""`。
- patch：`text` 省略 ≠ `null` ≠ `""`；`icon` 省略 ≠ `null`；未知字段忽略；`{}` / `null` / 非对象 reject；
  `text` 非字符串 reject；`icon` 行数 / 列数 / 字符不对 reject；合法 icon 深拷贝。
- 合并：只设 text 保留 icon；只设 icon 保留 text；`null` 删键；两个都删后删 id；文档空后删文档。
- 解析：覆盖 > 内置 tag/icon hook > manifest icon / `v<version>` 的每种组合；`text: ""` 不会被真假值判断漏掉。
- 读取清洗：文档里的坏条目、坏 icon、`__proto__` 键被丢掉，不影响其他条目。

**shim（`tests/pad-shim.test.mjs`）**

- 没有 `home: true` 时 `PAD.home` 是 `undefined`；有它是冻结对象，只有 `set`。
- `set` 发出 `{pad: 1, op: "home", i, patch}`；只带 `text` / 只带 `icon` / 两个都带。
- `"saved"` / `"limited"` / `"unavailable"` 原样 resolve；未知状态回 `"unavailable"`；坏参数 reject 且不 post。
- `icon` 数组是拷贝，之后改原数组不影响已发出的消息。

**e2e（`tests/e2e.test.mjs`，实现时）**

1. 不调用 API 的社区 app 在主屏仍显示 `v1.2.3`，刷新后一样。
2. app 调 `PAD.home.set({text:"第 3 关"})`：主屏那一格变成“第 3 关”，其他格不变；刷新后仍在。
3. `text: ""` 隐藏那一行；`text: null` 回到 `v<version>`；`icon: null` 回到 manifest icon。
4. 设 16 × 16 图标：主屏 canvas 出现，商店条目和运行页标题的图标不变。
5. 1 秒内第二次 `set` 回 `"limited"`，主屏保持第一次的值；隔 1 秒再设成功。
6. app A 只能改 A 的格子：B 的格子不变；伪造 id 的消息无法让 runtime 写 B（shim 不发 id）。
7. 本地脚本调用 `PAD.home.set` 回 `"unavailable"`，主屏无变化。
8. 更新 app：覆盖被清，主屏回到 `v<新版本>`；新版本运行时再设成功。
9. 卸载 app：`home` 里的 id 消失；重新安装显示默认。
10. 备份：设覆盖 → 备份 → 卸载 / 改掉 → 恢复 → 覆盖回来。
11. 长文字：一格只有一行，`scrollWidth > clientWidth`，没有换行，看到省略号；不挤出格子。
12. 旧 runtime 模拟（不传 `home: true` 的 wrapper）：`PAD.home` 是 `undefined`，app 的 feature-detect 分支走默认。

**工具和人工**

- `node tools/check-app.mjs registry/apps/*` 仍全绿；`PAD.home` 不需要权限，`lopda/0` 用了会报错。
- `node --test` 全绿；如果加 `runtime/home.js`，repo 测试会要求它在 `index.html` 和 `sw.js` SHELL 里。
- iPhone 真机：331 px 宽下文字只一行、省略号位置正确；16 × 16 图标清晰；主屏切换、备份恢复、更新、卸载各走一遍。
- 现有主屏截图（`tests/runtime-shots.mjs`）在没有覆盖时应逐像素不变；有覆盖的截图作为新用例加。

### 11.3 验收门槛

- 不调用 API 的 app 和现在完全一样；calendar / pet 的 hook 行为不变。
- 文字 / 图标的每种组合都符合第 4 节的优先级；`""` 和 `null` 不混淆。
- app 不能写别人的格子，不能在没有主屏的本地脚本里生效。
- 更新、卸载、恢复备份后没有“看不见的旧覆盖”。
- 商店里的 manifest 名称 / 图标 / 版本不受影响。
- 旧 runtime 上 `PAD.home` 不存在，app 不因此报错（前提是 app 按 SPEC 做了 feature-detect）。

## 12. 开放问题

### 12.1 等 owner 拍板（见开头表格）

返回值（1）、32 码点上限（2）、省略字段语义（3）、`LP.home.set` 是否同限速（4）、calendar / pet 迁不迁（5）、
开发台怎么表现（6）、元数据刷新算不算更新（7）。这七项定了就可以实现。

### 12.2 不阻塞这一版的后续问题

- **`PAD.home.get`**：这一版不做。以后如果 app 需要在重开后知道当前文字（比如“上次设的倒计时还在不在”），
  再单独设计读接口；读接口要决定是只读自己还是也读默认值，以及是否需要权限。
- **开发台预览**：这一版回 `"unavailable"`。以后可以在开发台放一个 tile 预览，让作者看到 331 px 下的省略号效果；
  这会改 `sdk/dev.html` 的布局，单独做。
- **语言**：主屏文字是字面量，不跟 `PAD.lang` 自动变。app 可以按当前语言设；语言切换但 app 没运行时保留旧字。
  如果以后要 `{zh, en}` 两种文字，那是另一个 API（也会改变存储形状），不在这一版。
- **多行 / 跑马灯**：不做。主屏是“一眼看一眼”的地方，多行会把格子撑高、破坏网格。
- **设置页**：不列主屏覆盖，也不做“全部恢复默认”。如果玩家想清，卸载重装或恢复备份。以后 app 多了可以再想。
- **限速窗口**：现在是 1000 ms，和“约 1 秒”一致。如果实际使用中发现 app 需要更快（比如倒计时每秒更新），
  再讨论是放宽到 500 ms 还是只允许“同一文本不重复写”；这一版不提前优化。
- **跨版本备份的孤儿覆盖**：见 6.3 的极端情况。不加时间戳，不阻塞；下一次更新 / 卸载清掉。

## 13. 参考

- `runtime/core.js`：`renderHome`、`fillTile`、`LP.builtin`、`ICONS`、`validIcon`、`noEmoji`
- `runtime/apps/calendar.js`：`dateIcon`、`tag`、60 秒日期刷新
- `runtime/apps/pet.js`：`LP.builtin({icon, tag, clock})`、`clockHome`
- `sdk/pad-shim.js`：`lopdaPadShim` 的 opts、消息表、`lopdaWrapApp`
- `runtime/apps/store.js`：`runApp`、`fetchApp`、`saveApp`、`deleteApp`、message handler
- `runtime/platform.js`：`doc` / `collection` / `dumpAll` / `replaceAll`
- `runtime/backup.js`：`goodPath`、`pack` / `unpack`
- `sdk/UI.md`、`SPEC.md` 第 6 节
- `docs/decisions.md` 第 13、23、25、28、35、42 节
