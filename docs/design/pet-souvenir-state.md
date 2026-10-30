# 纪念品的物品状态（souvenir state）— 设计草案

- 状态：draft for review
- 范围：`runtime/apps/pet.js`、`runtime/petsim.js`、`runtime/petart.js`、纪念品文档、AI 纪念品校验
- 不包含：运行时实现、UI 改版、新的存储后端

## 1. 目标

让纪念品不只是一张静态的 16 x 16 图，而是能随**时间、昼夜、天气、季节、月相**变化，并且能表达两类完全不同的行为：

- **线性**：种子 -> 发芽 -> 花苞 -> 开花。
- **周期/上下文**：花每天开合、月相盘按月变化、风向标有风时转、雪花球冬天/下雪时下雪。

同时保持现有的几条硬约束：

- 纪念品是纯数据，不含代码、URL、HTML。
- 不新增后台定时器；只用房间已有的 2 fps、开屏、`resume`、15 秒时钟 tick。
- 不逐帧写存储；备份仍然只是文档级备份。
- 旧 runtime 读到新纪念品至少能显示一张图，不丢数据。
- AI 纪念品仍然只返回 JSON，不执行任何模型给的代码。

## 2. 现状与约束

- 纪念品文档：`data/users/local/pet/souvenirs/<id>`，当前字段为 `{name, line, px, at, ai, day}`；`px` 是 16 x 16、四种色调、256 个字符。
- 房间只有一个架子槽位 `slots.shelf`（16 x 16，底边贴着板），箱子按月网格预览。
- 宠物屏幕打开时每 500 ms 重画一次；屏幕外只有开机、主屏画图标、`resume`、15 秒时钟 tick 这几个脉冲。
- 天气、季节、昼夜已经在 `roomScene()` 里有现成值；月相可以用 `lunar.js` 的 `fromSolar` 得到。不需要新的数据源。
- 备份包含纪念品文档；恢复后旧 runtime 也可能读到新文档。
- AI 纪念品由 `validateSouvenir` 严格校验，30 秒上限，失败静默回退到内置纪念品。

## 3. 设计概览

### 3.1 一个 hook

物品状态只有一个入口：

```js
LopdaPetState.stateOf(item, ctx) -> view
```

- `item`：纪念品文档，带一份可选的声明式 `state`。
- `ctx`：当前时间、昼夜、天气、季节、月相、是否在架子上等环境。
- `view`：当前 16 x 16 帧，以及状态 id、来源层、grow 阶段等调试信息。
- `stateOf` 是纯函数：不读 DOM、不写存储、不取 `Date.now()`、不随机。
- 同一个 `item` + 同一个 `ctx`，永远得到同一个 `view`。

房间、箱子、出门携带都只调用这一个 hook，不关心内部是线性、周期还是上下文匹配。

### 3.2 为什么是 layer，不是一张状态图

线性 `stages` 只适合“种下 -> 发芽 -> 开花”。纪念品还会遇到：

- 每天开合的花、夜里的月亮、随潮汐变化的贝壳；
- 雨天变湿、雪天积雪、冬天休眠的风向标/雪花球；
- 有风时转动的风车、走时的钟；
- 雨停后才出现的蘑菇，过几小时又消失。

把这些画成一张状态图会有三个问题：

1. **状态爆炸**：昼夜 x 天气 x 季节 x 生长阶段，组合太多。
2. **需要 hysteresis**：雨停后要保持一段时间，状态图必须存“上一次事件”，否则每次重画都重置。
3. **难以复用**：每件物品都要重新描述一遍“夜里怎么办”。

所以用**独立的轴 + 可组合的 layer**。每个轴都很小、可测试、可复用；组合规则只有一条：**后面的层覆盖前面的层**。

### 3.3 术语

- **driver**：一种 layer 的求值器，目前有 `grow` / `cycle` / `match`，v2 加 `event`。
- **layer**：物品 `state.layers` 里的一项，描述一个轴。
- **gating**：layer 或 rule 上的 `when`，条件不满足就跳过。
- **view**：`stateOf` 的结果，包含当前帧。
- **stateData**：v2 的可选实例状态（事件时间、hysteresis），和 `state` 模板分开。
- **patch**：`stateOf` 返回的 `stateData` 增量；调用方合并并防抖写入；v1 不写。

## 4. 数据协议

### 4.1 纪念品文档 v2

```json
{
  "v": 2,
  "name": {"zh": "一粒种子", "en": "A seed"},
  "line": {"zh": "它好像在等一个窗台。", "en": "It seems to be waiting for a windowsill."},
  "px": "<16x16，seed>",
  "at": 1761792000000,
  "ai": false,
  "day": "2026-10-30",
  "plantedAt": 1761878400000,
  "state": {
    "v": 1,
    "layers": [
      {
        "kind": "grow",
        "from": "planted",
        "stages": [
          {"id": "seed",  "px": "<16x16，seed>", "hold": 86400},
          {"id": "grown", "px": "<16x16，grown>", "hold": 0}
        ]
      }
    ]
  }
}
```

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `v` | number? | 文档版本；`2` 表示可能带 `state`。缺省按旧文档处理。 |
| `name` | `{zh,en}` | 不变。 |
| `line` | `{zh,en}` | 不变。 |
| `px` | Grid16 | 必需。兜底帧，也是旧 runtime 看到的帧。 |
| `at` | number | 捡到的时间，ms。 |
| `ai` | boolean | 不变。 |
| `day` | string | 不变。 |
| `plantedAt` | number? | 第一次摆上架子的时间，ms；仅 `grow` 物品；没有表示未种下。 |
| `state` | StateSpec? | 可选的物品状态模板。 |
| `stateData` | object? | v2 可选：事件/hysteresis 的实例状态；v1 不写。 |

兼容规则：

- 旧文档没有 `v` / `state` / `plantedAt`：完全按静态纪念品处理。
- 新文档被旧 runtime 读到：旧 runtime 只读 `px`，忽略其余字段，不修改文档。
- `state` 不合法：新 runtime 丢掉 `state`，保留 `px` 和整件纪念品。

### 4.2 StateSpec

下面是形状示例，数组内容从略：

```json
{
  "v": 1,
  "layers": [
    {"kind": "grow", "from": "planted", "stages": []},
    {"kind": "cycle", "period": 86400, "frames": []},
    {"kind": "match", "rules": []}
  ]
}
```

规则：

- `v` 必须为 `1`。
- `layers` 1–4 层，按数组顺序求值；后面的层覆盖前面的 `px` / `id` / `stage`。
- 每层可以带一个 `when`，条件不满足就跳过。
- 所有帧都是 16 行 x 16 个 `0`–`3`，存成 256 个字符。
- 不允许函数、URL、HTML、任意表达式。数据只描述“哪一帧、什么时候”。

### 4.3 Layer: grow（线性）

```json
{
  "kind": "grow",
  "from": "planted",
  "stages": [
    {"id": "seed",   "px": "<16x16>", "hold": 0},
    {"id": "sprout", "px": "<16x16>", "hold": 86400},
    {"id": "bud",    "px": "<16x16>", "hold": 172800},
    {"id": "bloom",  "px": "<16x16>", "hold": 0}
  ]
}
```

- `from`：`"planted"`（默认）或 `"acquired"`。
- `stages`：2–6 段。
- `hold`：这一阶段停留多少秒；最后一段忽略。
- 只前进，不回退；最后一段永久停留。
- 时钟回拨按 `max(0, now - ref)` 处理。
- 没有对应时间戳时停在第 0 阶段。
- 如果 `grow` 存在，`px` 必须等于第 0 阶段的帧。

### 4.4 Layer: cycle（周期）

```json
{
  "kind": "cycle",
  "period": 86400,
  "epoch": 0,
  "frames": [
    {"id": "day",   "px": "<16x16>", "hold": 43200},
    {"id": "night", "px": "<16x16>", "hold": 43200}
  ]
}
```

- `period`：周期，秒，必须 > 0。
- `epoch`：相位锚点，ms，默认 0。
- `frames`：2–8 帧；`frames[].hold` 的总和必须等于 `period`。
- `phase = ((now - epoch) % (period * 1000) + period * 1000) % (period * 1000)`，按顺序减 `hold * 1000` 选帧。
- 适合固定周期的东西：月相（约 2551443 秒）、潮汐、走时、两帧动画。
- **本地昼夜不要用 cycle**：用 `match` 的 `night` / `hour`，避免时区和夏令时。`cycle` 是给绝对周期的。

### 4.5 Layer: match（上下文）

```json
{
  "kind": "match",
  "rules": [
    {"when": {"weather": ["rain", "snow"]}, "id": "wet",    "px": "<16x16>"},
    {"when": {"night": true},               "id": "night",  "px": "<16x16>"},
    {"when": {"season": ["winter"]},        "id": "winter", "px": "<16x16>"},
    {"id": "default", "px": "<16x16>"}
  ]
}
```

- `rules`：1–6 条，按顺序取第一条匹配的规则。
- 没有 `when` 的规则是兜底。
- 没有规则匹配时，这一层不改变 `base`。
- `match` 不保存历史；要“雨停后保持 6 小时”，用 `event`。

### 4.6 Layer: event（v2 预留）

```json
{
  "kind": "event",
  "on": "rain-end",
  "hold": 21600,
  "px": "<16x16>"
}
```

- 需要 `ctx.events` 和 `item.stateData`。
- `stateOf` 可以返回 `patch`，调用方合并进 `item.stateData`，只在事件真的发生时写一次，不逐帧写。
- 典型：雨停后出现蘑菇、被摸一下后发光 5 分钟。
- v1 不实现；先把 `grow` / `cycle` / `match` 跑通。

### 4.7 `when` 条件

所有 layer 和 match rule 都可以带 `when`。字段全部可选，AND 关系：

| 字段 | 类型 | 语义 |
|---|---|---|
| `night` | boolean | 与房间一致：本地 `h < 6` 或 `h >= 19`。 |
| `hour` | `[from, to]` | 本地小时，`[from, to)`；`from > to` 时跨午夜，例如 `[20, 6]`。 |
| `weather` | string[] | `sun` / `cloud` / `rain` / `snow` / `wind`。 |
| `season` | string[] | `spring` / `summer` / `autumn` / `winter`。 |
| `stage` | string[] | `grow` 的 stage id；用来做“开花后才在夜里合上”。 |
| `lunar` | `{month, day}` 或 `{month, from, to}` | 农历月/日；预留给中秋、月圆等。 |
| `onShelf` | boolean | 是否正摆在架子上。 |
| `minAge` | number | 秒，按 `ageMs` 算。 |
| `maxAge` | number | 秒，按 `ageMs` 算。 |

不允许任意表达式；不认识的条件字段在存储读取时丢弃，在 AI 输入时拒绝。

取值约束：

- `hour`：两个 0–23 的整数，`from !== to`；`[20, 6]` 表示 20:00–05:59。
- `weather` / `season` / `stage`：非空数组，值必须在白名单里。
- `lunar`：`month` 1–12，`day` / `from` / `to` 1–30；范围要求 `from <= to`。
- `minAge` / `maxAge`：非负秒数；两者同时存在时要求 `minAge <= maxAge`。
- `night` / `onShelf`：布尔。

### 4.8 求值与覆盖

```text
stateOf(item, ctx):
  base = {px: item.px, id: "still", stage: null, layer: null}
  if not item.state: return base
  for layer in item.state.layers:
    if layer.when and not matches(layer.when, ctx, base): continue
    r = driver(layer, item, ctx, base)
    if r: base = merge(base, r, layer.kind)
  return base
```

- `matches` 只认 4.7 的字段。
- `merge` 只覆盖 `px` / `id` / `stage` / `since` / `nextAt`；`r` 没有提供的字段保留 `base` 的值。`layer` 总是设为当前层的 `kind`。
- `grow` 应该放在前面，后面的 `match` 才能用 `base.stage`。
- 后面的层可以完全覆盖前面的帧；这是整帧覆盖，不是像素级混合。
- 如果某一层返回 `null`，继续下一层，`base` 不变。

### 4.9 View

```js
view = {
  px,       // 当前 16 x 16，256 个字符
  id,       // 当前视觉状态，例如 "bloom-night"
  layer,    // 最后生效的层 kind，调试/测试用
  stage,    // grow 的 stage id，没有则为 null
  since,    // 可选：在当前状态里的毫秒
  nextAt    // 可选：下一次可预知变化的 ms；只作提示
}
```

`since` / `nextAt` 只对能算出来的 driver 有意义；`match` 通常给 `null`。渲染不依赖它们，也不据此调度定时器。

## 5. 生命周期与持久化

### 5.1 状态

| 时机 | 行为 |
|---|---|
| 捡到 | `at` 写入；没有 `plantedAt`；箱子里显示第 0 阶段。 |
| 第一次摆上架子 | `setShelf(id)` 写一次 `plantedAt = now`（仅含 `grow` 的纪念品）。 |
| 屏幕开着 | 每 500 ms `render()` 调用 `stateOf`，跨过时间边界就换帧。 |
| 屏幕关着 | 不计算；下次打开直接得到当前帧。 |
| 收进箱子 | `plantedAt` 保留；`grow` 继续，`cycle` / `match` 按当前环境。 |
| 重新开始宠物 | 纪念品、`plantedAt`、`state` 都保留。 |
| 备份/恢复 | 文档级备份；`plantedAt` 是绝对时间，恢复后按当前时间继续。 |
| 时钟回拨 | `grow` / `cycle` 用 `max(0, ...)` 或模运算，不产生负状态。 |
| 存储失败 | 只在内存里生效；下次读档会重新种，不阻塞摆上架子。 |

### 5.2 什么写，什么不写

- 写：`at`（已有）、`plantedAt`（第一次摆上，仅 `grow` 物品）、`state`（模板，随文档保存）。
- 不写：`grow` 的阶段、`cycle` 的相位、`match` 的选择。它们都由 `ctx` 派生。
- v2 的 `event`：只在事件发生时写一次 `stateData`，不逐帧写。

### 5.3 兼容矩阵

| 文档 | runtime | 行为 |
|---|---|---|
| 旧，无 `state` | 新 | 静态显示 `px`。 |
| 新，有 `state` | 旧 | 显示 `px`，忽略 `state`，不修改。 |
| 新，有 `state` | 新 | 调用 `stateOf`。 |
| `state` 非法 | 新 | 丢掉 `state`，保留 `px`。 |
| `px` 非法 | 新 | 沿用现有纪念品读取规则，不新增行为。 |

### 5.4 stateData（v2）

`state` 是模板，不存运行时状态。v2 需要 hysteresis/事件时，用单独的 `stateData`：

```json
"stateData": {"last": {"rain-end": 1761878400000}}
```

`stateOf` 返回 `patch`，`pet.js` 合并进 `stateData` 并按现有 `saveSoon()` 防抖写入；没有 `patch` 就不写。v1 不产生 `stateData`。

## 6. 渲染与调用点

- `roomScene()` 构造一次 `ctx`，`scene.shelf = gridFromPx(stateOf(onShelf, ctx).px)`。
- 箱子网格和单件页也用 `stateOf`；`onShelf` 传当前值。
- 出门/带回：用 `stateOf(item, ctx)` 的当前帧；如果是种子，就是第 0 阶段。
- 主屏不参与；主屏图标仍是宠物。
- 不新增定时器；`nextAt` 只作提示。
- 舞台仍然只接受 16 x 16、四种色调的帧；`petart.js` 的 `drawShelf` 不变。

## 7. 校验

### 7.1 存储读取：宽容

- `state.v !== 1` -> 丢掉 `state`。
- `layers` 为空、超过 4 层、未知 `kind` -> 丢掉 `state`。
- 任一帧不是 16 x 16 的 `0-3` -> 丢掉 `state`。
- `grow` 段数、`cycle` 周期、`match` 规则数越界 -> 丢掉 `state`。
- `when` 有未知字段 -> 丢掉整个 layer / rule（不能猜作者的意图）。
- 绝不因为 `state` 坏了而丢掉整件纪念品。

### 7.2 AI 输入：严格

- v1：AI 不允许返回 `state`；出现即拒绝整件，避免模型塞入未校验行为。
- v2（如果开放）：只允许受限子集：
  - `state.v = 1`；
  - 最多 2 层；
  - 只允许 `match`（以后可加 `cycle`）；
  - 最多 3 条 rule；
  - `when` 只允许 `night` / `weather` / `season` / `hour` / `onShelf`；
  - 每帧 16 x 16 `0-3`；
  - 不允许 `grow` / `event` / `stage` / `lunar` / 函数 / URL。
- 任一字段不合法 -> 整件拒绝，回退到内置纪念品。
- AI 上下文不增加任何新信息；`state` 只是图案切换规则。

### 7.3 上限

- `layers` <= 4。
- `grow.stages` <= 6。
- `cycle.frames` <= 8。
- `match.rules` <= 6。
- 总帧数 <= 8。
- `grow` 总时长 <= 180 天。
- 单帧 256 字符；单件 `state` 最坏约 2.1 KB。

## 8. AI 纪念品

### 8.1 第一版：AI 保持静态

- 内置种子先证明引擎；AI 仍只返回 `name` / `line` / `px`。
- 原因：一次输出多帧 16 x 16 更容易超时或坏 JSON；AI 画的多帧一致性也难保证。
- 这不影响协议：`state` 是普通数据，以后可以开放。

### 8.2 第二版：AI 可以给受限 `match`

- 提示词加一句：如果这件东西会随天气/昼夜变化，可返回最多 3 条 `match` 规则；每帧 16 x 16；第一帧仍是 `px`。
- 只允许 `night` / `weather` / `season` / `hour`，不允许生长、事件、月相。
- 严格校验，失败整件拒绝。
- 预算：3 帧约 768 字符，JSON 约 1.5 KB；30 秒上限仍够用，但要实测。

## 9. 安全、隐私、性能、数据预算

- **安全**：`state` 是数据，不是代码；没有 `eval`、没有 URL、没有 HTML。`register(kind, fn)` 只存在于 runtime 代码，AI/文档不能调用。
- **隐私**：AI 输入不增加笔记、书名、日历名、照片或任何 id，也不增加天气/季节；如果 AI 返回 `state`，它只返回切换规则，当前环境由 runtime 自己匹配。
- **性能**：最多 4 层 x 8 帧 = 32 次比较，2 fps 下可以忽略；不新增存储写入。
- **数据**：静态约 575 B；4 帧约 1.2 KB；8 帧约 2.1 KB；365 件/年最坏约 0.8 MB。
- **恢复**：`plantedAt` 是绝对时间；恢复后可能“已经长大”，这是有意的语义。

## 10. 示例

### 10.1 种子：线性生长 + 夜里合上

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "grow",
      "from": "planted",
      "stages": [
        {"id": "seed",   "px": "<16x16>", "hold": 0},
        {"id": "sprout", "px": "<16x16>", "hold": 86400},
        {"id": "bud",    "px": "<16x16>", "hold": 172800},
        {"id": "bloom",  "px": "<16x16>", "hold": 0}
      ]
    },
    {
      "kind": "match",
      "when": {"stage": ["bloom"]},
      "rules": [
        {"when": {"night": true}, "id": "bloom-night", "px": "<16x16>"},
        {"id": "bloom-day", "px": "<16x16>"}
      ]
    }
  ]
}
```

摆上架子后：第 1 天发芽，第 3 天有花苞，第 3 天后开花；开花后夜里合上，早上再打开。收进箱子也会继续长。

### 10.2 风向标：有风时转，下雨时湿

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "cycle",
      "when": {"weather": ["wind"]},
      "period": 2,
      "frames": [
        {"id": "spin1", "px": "<16x16>", "hold": 1},
        {"id": "spin2", "px": "<16x16>", "hold": 1}
      ]
    },
    {
      "kind": "match",
      "rules": [
        {"when": {"weather": ["rain"]}, "id": "wet",  "px": "<16x16>"},
        {"id": "calm", "px": "<16x16>"}
      ]
    }
  ]
}
```

有风时 cycle 层生效；否则 match 层决定“湿”或“平静”。两帧动画用 2 秒周期，房间 2 fps 正好接得上。

### 10.3 雪花球：冬天或下雪时下雪

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "match",
      "rules": [
        {"when": {"season": ["winter"]}, "id": "snow", "px": "<16x16>"},
        {"when": {"weather": ["snow"]},  "id": "snow", "px": "<16x16>"},
        {"id": "clear", "px": "<16x16>"}
      ]
    }
  ]
}
```

### 10.4 月相盘：固定周期

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "cycle",
      "period": 2551443,
      "epoch": 1704067200000,
      "frames": [
        {"id": "new",    "px": "<16x16>", "hold": 637860},
        {"id": "waxing", "px": "<16x16>", "hold": 637861},
        {"id": "full",   "px": "<16x16>", "hold": 637861},
        {"id": "waning", "px": "<16x16>", "hold": 637861}
      ]
    }
  ]
}
```

`hold` 只是示例，实际要加起来等于 2551443。月亮用绝对周期，不受本地昼夜影响。

### 10.5 雨停后的蘑菇（v2）

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "event",
      "on": "rain-end",
      "hold": 21600,
      "px": "<16x16>"
    },
    {"kind": "match", "rules": [{"id": "none", "px": "<16x16>"}]}
  ]
}
```

事件层在雨停后的 6 小时内生效，之后回落到静态帧。v1 不实现。

## 11. 代码落点与实施阶段

建议新增 `runtime/petstate.js`，挂 `window.LopdaPetState`：

```js
window.LopdaPetState = {
  stateOf: stateOf,          // (item, ctx) -> view
  validate: validate,        // (spec, firstPx) -> clean spec | null
  matches: matches,          // (when, ctx, base) -> bool
  register: register         // (kind, fn)，只给内置包用
};
```

| 文件 | 改动 |
|---|---|
| `runtime/petstate.js` | 新增：`stateOf`、`validate`、`matches`、`register`；纯函数。 |
| `runtime/index.html` | 在 `petsim.js` 之后、`apps/pet.js` 之前加载 `petstate.js`。 |
| `runtime/sw.js` | SHELL 加 `petstate.js`。 |
| `runtime/apps/pet.js` | 构造 `ctx`；`roomScene` / 箱子 / 携带调用 `stateOf`；`souvenirTable` 把 grid 转成 px 并复制 `state`；`makeSouvenir` / `addSouvenir` 写文档形状；`setShelf` 对 `grow` 物品首次写 `plantedAt`；读档 normalize；`?debug` 加 `souvAge` / `souvState`。 |
| `runtime/petart.js` | `SOUV` 加示例物品（`seed` / `vane` / `snowglobe`）；`packOk` 检查 `state` 帧。 |
| `runtime/petsim.js` | `validateSouvenir` 接受/拒绝 `state`。 |
| `CLAUDE.md` | Layout 里登记 `petstate.js` 和本设计稿。 |
| `tests/petstate.test.mjs` | 新增：三个 driver、`when`、覆盖顺序、非法降级。 |
| `tests/petsim.test.mjs` | 校验严格/宽容、AI 子集。 |
| `tests/petart.test.mjs` | 示例物品每帧 16 x 16、四色。 |
| `tests/e2e.test.mjs` | 摆上种子 -> 调时间 -> 发芽/开花；夜里合上；改天气 -> 风向标；重载保留 `plantedAt`。 |

实施顺序：

1. `petstate.js` + `grow` / `cycle` / `match` + 单测。
2. `petart` 三件示例，先证明三个轴。
3. `pet.js` 接入 `stateOf` 和 `plantedAt`。
4. e2e + debug hook。
5. AI 静态保持；`event` 和 AI `state` 留到下一版。

## 12. 测试计划

- **grow**：阶段边界、无 `plantedAt`、`from:"acquired"`、时钟回拨、最后一段永久、`px` 等于第 0 段。
- **cycle**：相位、回绕、`epoch`、`hold` 总和、2 秒动画、负数时间。
- **match**：优先级、兜底、`night`、跨午夜 `hour`、天气、季节、`stage`、`onShelf`、`minAge` / `maxAge`。
- **组合**：grow 后 match 用 `stage`；cycle 被 `when` 门控；后层覆盖前层；层返回 `null` 不影响 `base`。
- **校验**：非法 `state` 降级；未知 `when` 字段；超过上限；AI 输入严格拒绝。
- **渲染**：房间、箱子、携带三处都用同一个 view；16 x 16 四色。
- **兼容**：旧文档、旧 runtime、恢复备份、时钟回拨。
- **e2e**：种子、风向标、雪花球各一条；重载后 `plantedAt` 保留。

## 13. 备选方案与取舍

1. **线性 `stages` 字段**：实现最简单，但无法表达昼夜/天气/月相；拒绝作为唯一模型。
2. **一张大状态图**：表达力强，但状态爆炸、hysteresis 难、每件物品重复描述；拒绝。
3. **文档里放 JS 函数**：最灵活，但纪念品变成代码，安全/备份/旧 runtime 都不可控；拒绝。
4. **内置包注册 JS driver**：允许，但只通过 `register(kind, fn)`，只给 runtime 内置包；AI 数据不能。
5. **每帧写状态**：可以避免重算，但会产生大量写入和定时器；拒绝。
6. **像素级 overlay**：例如雪落在花上；表达力更强，但需要合成规则和更多校验；留到 v2。
7. **按包引用 state**：文档更小，但包更新会改变旧纪念品；选择复制进文档，保证自包含。

## 14. 未决问题

1. `state` 复制进文档，还是只存包内引用？本文倾向复制，保证自包含。
2. “雨停后 6 小时”这类事件，`ctx.events` 由谁产生？v2 再定。
3. `cycle` 的 `epoch` 用绝对 ms；本地昼夜用 `match`，是否足够覆盖所有需求？
4. AI 要不要开放 `state`？本文倾向先静态，之后只开放 `match` 子集。
5. 要不要像素级叠加（雪落在花上）？本文倾向 v1 只做整帧覆盖。
6. 阶段变化要不要宠物反应？本文倾向只做一次 happy，不加数值。
7. 架子是否允许大于 16 x 16？本文倾向先不做。

## 15. Review checklist

- [ ] layer 模型是否覆盖已知的纪念品类型（生长、昼夜、天气、季节、月相、动画）？
- [ ] `stateOf(item, ctx)` 作为唯一 hook 是否边界清晰？
- [ ] `plantedAt` 是否足够表达“第一次摆上才开始长”？
- [ ] `cycle` 的绝对周期语义是否正确？本地昼夜是否应该走 `match`？
- [ ] `when` 字段是否够用，是否有多余或缺失？
- [ ] 后层覆盖前层的规则是否足够直观？
- [ ] 存储读取宽容、AI 输入严格，这个不对称是否合理？
- [ ] 旧 runtime / 旧文档 / 备份恢复的兼容是否完整？
- [ ] 数据预算是否可接受？
- [ ] 是否应该先只做 `grow` + `match`，把 `cycle` 留到第二批？
