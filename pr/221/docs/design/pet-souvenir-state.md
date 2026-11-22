# 纪念品的物品状态（souvenir state）— 设计草案

- 状态：post-1.0 draft；不在 `docs/design/v1.md` 的 1.0 范围里。
- 范围：`runtime/apps/pet.js`、`runtime/petsim.js`、`runtime/petart.js`、纪念品文档、AI 纪念品校验。
- 不包含：运行时实现、UI 改版、新的存储后端。
- 第一版实施范围：只做 `grow` + `match`；`cycle` 留到第二批；`event` 不规划，等有日内天气源再说。

## 1. 目标

让纪念品不只是一张静态的 16 x 16 图，而是能随**时间、昼夜、天气、季节、农历**变化，并且能表达两类完全不同的行为：

- **线性**：种子 -> 发芽 -> 花苞 -> 开花。
- **上下文**：花每天开合、风向标有风时转、雪花球冬天/下雪时下雪、月相盘按农历变化。

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
- 天气、季节、昼夜已经在 `roomScene()` 里有现成值；农历可以用 `lunar.js` 的 `fromSolar` 得到。
- 天气是 `Pet.weatherOf(born, dayKey, season)`，**一天一个值，午夜才变**；`restartPet` 换了 `born`，当天天气也会跟着变。所以现在没有“日内雨停”这种事件。
- 备份包含纪念品文档；恢复后旧 runtime 也可能读到新文档。
- AI 纪念品由 `validateSouvenir` 严格校验，30 秒上限，失败静默回退到内置纪念品。
- 平台文档支持 `get` / `set` / `update` / `delete`；改写已有文档必须用 `update`，不能整件 `set`。

## 3. 设计概览

### 3.1 一个 hook

物品状态只有一个入口：

```js
LopdaPetState.stateOf(item, ctx) -> view
```

- `item`：纪念品文档，带一份可选的声明式 `state`。
- `ctx`：当前时间、昼夜、天气、季节、农历、是否在架子上。
- `view`：当前 16 x 16 帧，以及状态 id、来源层、grow 阶段。
- `stateOf` 是纯函数：不读 DOM、不写存储、不取 `Date.now()`、不随机。
- 同一个 `item` + 同一个 `ctx`，永远得到同一个 `view`。

`ctx` 的形状：

```js
ctx = {
  now,          // ms
  hour, minute, // 本地时间
  night,        // 与房间一致：h < 6 或 h >= 19
  weather,      // "sun" | "cloud" | "rain" | "snow" | "wind"
  season,       // "spring" | "summer" | "autumn" | "winter"
  lunar,        // {month, day, leap} 或 null
  onShelf       // save.shelf === item.id
}
```

`ctx` 由 `roomScene()` / 箱子页构造，不引入新的时钟或数据源。

房间、箱子、出门携带都只调用这一个 hook，不关心内部是线性还是上下文匹配。

### 3.2 为什么是 layer，不是一张状态图

线性 `stages` 只适合“种下 -> 发芽 -> 开花”。纪念品还会遇到：

- 每天开合的花、随农历变化的月相盘；
- 雨天变湿、雪天积雪、冬天休眠的风向标/雪花球；
- 有风时转动的风车、走时的钟。

把这些画成一张状态图会有三个问题：

1. **状态爆炸**：昼夜 x 天气 x 季节 x 生长阶段，组合太多。
2. **难以复用**：每件物品都要重新描述一遍“夜里怎么办”。
3. **测试困难**：每个组合都要单独覆盖。

所以用**独立的轴 + 可组合的 layer**。每个轴都很小、可测试、可复用；组合规则只有一条：**后面的层覆盖前面的层**。

### 3.3 第一版只做 grow + match

- `grow`：只在架子上的时间让种子生长。
- `match`：按昼夜、天气、季节、农历日、grow 阶段选帧。
- `cycle`：留到第二批；月相改用 `lunar.js` 的农历日，不用固定周期。
- `event`：不规划。天气按天生成，午夜才变，“雨停后”现在没有意义；等有真实的日内天气源再单独设计。
- 没有 JS driver、没有 `stateData`、没有逐帧状态。

### 3.4 术语

- **driver**：一种 layer 的求值器，第一版有 `grow` / `match`。
- **layer**：物品 `state.layers` 里的一项，描述一个轴。
- **gating**：layer 或 rule 上的 `when`，条件不满足就跳过。
- **view**：`stateOf` 的结果，包含当前帧。
- **架子时间**：`grownMs + (onShelf ? now - plantedAt : 0)`，只在展示时累计。

## 4. 数据协议

### 4.1 纪念品文档

不新增文档级 `v`。用 `state` 是否存在 + `state.v` 判断：

```json
{
  "name": {"zh": "一粒种子", "en": "A seed"},
  "line": {"zh": "它好像在等一个窗台。", "en": "It seems to be waiting for a windowsill."},
  "px": "<16x16，seed>",
  "at": 1761792000000,
  "ai": false,
  "day": "2026-10-30",
  "grownMs": 0,
  "plantedAt": 1761878400000,
  "state": {
    "v": 1,
    "layers": [
      {
        "kind": "grow",
        "stages": [
          {"id": "seed",  "px": "<16x16，seed>", "hold": 86400},
          {"id": "grown", "px": "<16x16，grown>", "hold": 0}
        ]
      }
    ]
  }
}
```

示例是“正摆在架子上”的状态；收进箱子时 `plantedAt` 不存在。

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | `{zh,en}` | 不变。 |
| `line` | `{zh,en}` | 不变。 |
| `px` | Grid16 | 必需。兜底帧，也是旧 runtime 看到的帧。 |
| `at` | number | 捡到的时间，ms。 |
| `ai` | boolean | 不变。 |
| `day` | string | 不变。 |
| `grownMs` | number? | 已经累计的“架子时间”，ms；旧文档/没种过为 0。 |
| `plantedAt` | number? | 这一次摆上架子的开始时间，ms；不在架子上时没有。 |
| `state` | StateSpec? | 可选的物品状态模板。 |

兼容规则：

- 旧文档没有 `state` / `grownMs` / `plantedAt`：完全按静态纪念品处理。
- 新文档被旧 runtime 读到：旧 runtime 只读 `px`，忽略其余字段，不修改文档。
- `state` 不合法：新 runtime 丢掉 `state`，保留 `px` 和整件纪念品。
- 未知字段必须保留：改写文档只用 `update`，不能 `set` 整件重写。

### 4.2 StateSpec

下面是形状示例，数组内容从略：

```json
{
  "v": 1,
  "layers": [
    {"kind": "grow", "stages": []},
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

### 4.3 Layer: grow（线性，只在架子上）

```json
{
  "kind": "grow",
  "stages": [
    {"id": "seed",   "px": "<16x16>", "hold": 86400},
    {"id": "sprout", "px": "<16x16>", "hold": 86400},
    {"id": "bud",    "px": "<16x16>", "hold": 172800},
    {"id": "bloom",  "px": "<16x16>", "hold": 0}
  ]
}
```

- `stages`：2–6 段。
- `hold`：这一阶段停留多少秒；最后一段忽略。
- 只前进，不回退；最后一段永久停留。
- `px` 必须等于第 0 阶段的帧。
- 生长年龄只算架子时间：

```text
age = (item.grownMs || 0)
    + (ctx.onShelf && item.plantedAt ? max(0, ctx.now - item.plantedAt) : 0)
```

- 收进箱子时 `plantedAt` 为空，年龄停在 `grownMs`，种子不会在抽屉里发芽。
- 重新摆上后从 `grownMs` 继续，不倒退。
- 时钟回拨按 `max(0, ...)` 处理。

### 4.4 Layer: match（上下文）

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

### 4.5 `when` 条件

所有 layer 和 match rule 都可以带 `when`。字段全部可选，AND 关系：

| 字段 | 类型 | 语义 |
|---|---|---|
| `night` | boolean | 与房间一致：本地 `h < 6` 或 `h >= 19`。 |
| `hour` | `[from, to]` | 本地小时，`[from, to)`；`from > to` 时跨午夜，例如 `[20, 6]`。 |
| `weather` | string[] | `sun` / `cloud` / `rain` / `snow` / `wind`。 |
| `season` | string[] | `spring` / `summer` / `autumn` / `winter`。 |
| `stage` | string[] | `grow` 的 stage id；用来做“开花后才在夜里合上”。 |
| `lunarDay` | `[from, to]` | 农历日 1–30；用 `lunar.js` 的 `fromSolar`，和万年历一致。 |
| `lunarMonth` | `[from, to]` | 农历月 1–12；可选。 |
| `lunarLeap` | boolean | 是否闰月；可选，缺省时闰月和非闰月都匹配。 |
| `onShelf` | boolean | 是否正摆在架子上。 |

不允许任意表达式；不认识的条件字段在存储读取时丢弃，在 AI 输入时忽略。

取值约束：

- `hour`：两个 0–23 的整数，`from !== to`；`[20, 6]` 表示 20:00–05:59。
- `weather` / `season` / `stage`：非空数组，值必须在白名单里。
- `lunarDay`：两个 1–30 的整数，`from <= to`。
- `lunarMonth`：两个 1–12 的整数，`from <= to`。
- `night` / `lunarLeap` / `onShelf`：布尔。

### 4.6 求值与覆盖

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

- `matches` 只认 4.5 的字段。
- `merge` 只覆盖 `px` / `id` / `stage`；`r` 没有提供的字段保留 `base` 的值。`layer` 总是设为当前层的 `kind`。
- `grow` 应该放在前面，后面的 `match` 才能用 `base.stage`。
- 后面的层可以完全覆盖前面的帧；这是整帧覆盖，不是像素级混合。
- 如果某一层返回 `null`，继续下一层，`base` 不变。

### 4.7 View

```js
view = {
  px,       // 当前 16 x 16，256 个字符
  id,       // 当前视觉状态，例如 "bloom-night"
  layer,    // 最后生效的层 kind，调试/测试用
  stage     // grow 的 stage id，没有则为 null
}
```

不带 `since` / `nextAt`：渲染不调度定时器，v1 不需要。

### 4.8 cycle（第二批）

`cycle` 只用于固定周期的东西，例如 2 秒两帧动画、机械钟。第一版不实现。

```json
{
  "kind": "cycle",
  "period": 2,
  "epoch": 0,
  "frames": [
    {"id": "spin1", "px": "<16x16>", "hold": 1},
    {"id": "spin2", "px": "<16x16>", "hold": 1}
  ]
}
```

- `period`：秒，必须 > 0；`frames[].hold` 总和等于 `period`。
- `epoch`：绝对 ms 相位锚点。
- 本地昼夜不用 `cycle`，用 `match` 的 `night` / `hour`。
- 月相不用 `cycle`，用 `match` 的 `lunarDay`。

### 4.9 event（不规划）

- 现在的天气一天一个值，午夜才变；“雨停后 6 小时”只会在 00:00–06:00 发生，宠物在睡，玩家多半也不在看。
- `restartPet` 换了 `born`，当天天气也会跟着变。
- 所以这份稿子不定义 `event`、`stateData` 或 `patch`。等有真实的日内天气源，再单独设计。

## 5. 生命周期与持久化

### 5.1 状态

| 时机 | 行为 |
|---|---|
| 捡到 | `at` 写入；没有 `grownMs` / `plantedAt`；箱子里显示第 0 阶段。 |
| 第一次摆上架子 | `update({plantedAt: now})`；`grownMs` 保持。 |
| 屏幕开着 | 每 500 ms `render()` 调用 `stateOf`，跨过时间边界就换帧。 |
| 屏幕关着但仍在架子上 | 不计算；下次打开按 `now - plantedAt` 补上，时间照常流逝。 |
| 收进箱子 | `grownMs += max(0, now - plantedAt)`；`plantedAt` 清空；用 `update` 写回。 |
| 重新摆上 | 从 `grownMs` 继续，不倒退。 |
| 重新开始宠物 | 纪念品、`grownMs`、`plantedAt`、`state` 都保留。 |
| 备份/恢复 | 文档级备份；`grownMs` 是累计值，`plantedAt` 是绝对时间。 |
| 时钟回拨 | `max(0, ...)`，不产生负年龄。 |

### 5.2 只改字段，不重写文档

`plantedAt` 是**第一次改写已有的纪念品文档**。必须：

```js
doc.update({plantedAt: now});
doc.update({grownMs: next, plantedAt: null});
```

**不要** `doc.set({...})` 整件重写。否则以后多一个字段时，一个版本稍旧的 runtime 摆上架子就会把它抹掉。

e2e 要加一条：纪念品文档带一个未知字段，摆上架子后字段仍在。

### 5.3 写入顺序与失败

- 摆上：先 `update({plantedAt: now})`，成功后再把 `save.shelf` 设为该 id。失败则显示「未存档」，但不阻塞展示；下次读档如果发现 `shelf` 指向它但没有 `plantedAt`，补一次 `plantedAt = now`。
- 收起：先 `update({grownMs, plantedAt: null})`，成功后再把 `save.shelf` 清空。失败则留在架子上并显示「未存档」，避免生长时间丢失。
- 换架子按“先收起旧件，再摆上新件”两步；每一步失败都停在那一步，不把两个物品的时间混在一起。
- `grownMs` 缺失按 0 处理；`plantedAt` 存在但不在架子上时按暂停处理，下次收起/摆上时归一化。
- 存储失败时只在内存里生效；下次读档可能回到上一次成功写入的状态。这条写进兼容矩阵，不假装不会倒退。

### 5.4 兼容矩阵

| 文档 | runtime | 行为 |
|---|---|---|
| 旧，无 `state` | 新 | 静态显示 `px`。 |
| 新，有 `state` | 旧 | 显示 `px`，忽略 `state`，不修改。 |
| 新，有 `state` | 新 | 调用 `stateOf`。 |
| `state` 非法 | 新 | 丢掉 `state`，保留 `px`。 |
| 文档有未知字段 | 新 | `update` 只改 `plantedAt` / `grownMs`，未知字段保留。 |
| 写入失败 | 新 | 内存里生效；下次读档回到上次成功写入的状态。 |

## 6. 渲染与调用点

- `roomScene()` 构造一次 `ctx`，`scene.shelf = gridFromPx(stateOf(onShelf, ctx).px)`。
- 箱子网格和单件页也用 `stateOf`；`onShelf` 传当前值。
- 出门/带回：用 `stateOf(item, ctx)` 的当前帧；如果是种子，就是第 0 阶段。
- 主屏不参与；主屏图标仍是宠物。
- 不新增定时器；舞台仍然只接受 16 x 16、四种色调的帧，`petart.js` 的 `drawShelf` 不变。

## 7. 校验

### 7.1 存储读取：宽容

- `state.v !== 1` -> 丢掉 `state`。
- `layers` 为空、超过 4 层、未知 `kind` -> 丢掉 `state`。
- 任一帧不是 16 x 16 的 `0-3` -> 丢掉 `state`。
- `grow` 段数、`match` 规则数越界 -> 丢掉 `state`。
- `when` 有未知字段 -> 丢掉整个 layer / rule（不能猜作者的意图）。
- 绝不因为 `state` 坏了而丢掉整件纪念品。

### 7.2 AI 输入：白名单，不拒绝多给的字段

- `validateSouvenir` 本来就是白名单：只取 `name` / `line` / `px` 重新组装。
- 模型多给 `state`、`life`、`animation` 等字段：**直接忽略**，不拒绝整件。
- 输出形状保持 `{name, line, px}`；AI 第一版仍是静态纪念品。
- 安全上没有损失，因为文档只会有白名单字段。
- 以后如果真的要开放 AI 状态，再单独设计严格的子集；不是这一版。

### 7.3 上限

- `layers` <= 4。
- `grow.stages` <= 6。
- `match.rules` <= 6。
- 总帧数 <= 8。
- 单帧 256 字符；单件 `state` 最坏约 2.1 KB。

## 8. AI 纪念品

- 第一版保持静态：AI 仍只返回 `name` / `line` / `px`。
- 多给的 `state` 忽略；不因此拒绝整件。
- 原因：一次输出多帧 16 x 16 更容易超时或坏 JSON；AI 画的多帧一致性也难保证。
- 以后要开放，也只开放受限的 `match` 子集，并且另写设计。

## 9. 安全、隐私、性能、数据预算

- **安全**：`state` 是数据，不是代码；没有 `eval`、没有 URL、没有 HTML。没有 `register` 这类运行时扩展点。
- **隐私**：AI 输入不增加笔记、书名、日历名、照片或任何 id，也不增加天气/季节；状态规则由 runtime 自己匹配。
- **性能**：最多 2 层 x 6 帧，2 fps 下可以忽略；不新增存储写入，只在摆上/收起时各写一次。
- **数据**：静态约 575 B；4 帧约 1.2 KB；8 帧约 2.1 KB；365 件/年最坏约 0.8 MB。
- **恢复**：`grownMs` 是累计值，`plantedAt` 是绝对时间；恢复后按当前架子状态继续。

## 10. 示例

### 10.1 种子：只在架子上生长 + 夜里合上

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "grow",
      "stages": [
        {"id": "seed",   "px": "<16x16>", "hold": 86400},
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

摆上后：第 1 天是种子，第 2 天发芽，第 4 天开花；开花后夜里合上，早上再打开。收进箱子就暂停，再摆上从原来的阶段继续。

### 10.2 风向标（第一版）：有风/下雨/平静三张静态图

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "match",
      "rules": [
        {"when": {"weather": ["rain"]}, "id": "wet",   "px": "<16x16>"},
        {"when": {"weather": ["wind"]}, "id": "windy", "px": "<16x16>"},
        {"id": "calm", "px": "<16x16>"}
      ]
    }
  ]
}
```

第一版不做转动动画。第二批如果要转，再加 `cycle` 的两帧层。

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

### 10.4 月相盘：用农历日，不用固定周期

```json
"state": {
  "v": 1,
  "layers": [
    {
      "kind": "match",
      "rules": [
        {"when": {"lunarDay": [1, 6]},   "id": "new",    "px": "<16x16>"},
        {"when": {"lunarDay": [7, 14]},  "id": "waxing", "px": "<16x16>"},
        {"when": {"lunarDay": [15, 21]}, "id": "full",   "px": "<16x16>"},
        {"id": "waning", "px": "<16x16>"}
      ]
    }
  ]
}
```

农历日来自 `lunar.js` 的 `fromSolar`，和万年历一致。闰月由 `ctx.lunar.leap` 处理；需要区分时用 `lunarLeap`。

### 10.5 两帧动画（第二批）

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
    }
  ]
}
```

第一版不实现；只作为第二批的协议示例。

## 11. 代码落点与实施阶段

建议新增 `runtime/petstate.js`，挂 `window.LopdaPetState`：

```js
window.LopdaPetState = {
  stateOf: stateOf,   // (item, ctx) -> view
  validate: validate, // (spec, firstPx) -> clean spec | null
  matches: matches    // (when, ctx, base) -> bool
};
```

| 文件 | 改动 |
|---|---|
| `runtime/petstate.js` | 新增：`stateOf`、`validate`、`matches`；纯函数。 |
| `runtime/index.html` | 在 `petsim.js` 之后、`apps/pet.js` 之前加载 `petstate.js`。 |
| `runtime/sw.js` | SHELL 加 `petstate.js`；按惯例 bump `RUNTIME_VERSION`。 |
| `runtime/apps/pet.js` | 构造 `ctx`；`roomScene` / 箱子 / 携带调用 `stateOf`；`souvenirTable` 把 grid 转成 px 并复制 `state`；`makeSouvenir` / `addSouvenir` 写文档形状；`setShelf` 用 `update` 写 `plantedAt` / `grownMs`；读档 normalize；`?debug` 加 `souvAge` / `souvState`。 |
| `runtime/petart.js` | `SOUV` 加示例物品（`seed` / `vane` / `snowglobe` / `moondial`）；`packOk` 检查 `state` 帧。 |
| `runtime/petsim.js` | `validateSouvenir` 保持白名单；多给的 `state` 忽略。 |
| `docs/decisions.md` | 落地时加一节（下一个空号应为 §44）。 |
| `CLAUDE.md` | Layout 里登记 `petstate.js` 和本设计稿。 |
| `tests/petstate.test.mjs` | 新增：`grow` / `match`、`when`、覆盖顺序、非法降级。 |
| `tests/petsim.test.mjs` | 白名单忽略多给的 `state`。 |
| `tests/petart.test.mjs` | 示例物品每帧 16 x 16、四色。 |
| `tests/e2e.test.mjs` | 摆上种子 -> 调时间 -> 发芽/开花；收进箱子暂停；夜里合上；改天气 -> 风向标；重载保留 `grownMs`；未知字段保留。 |

实施顺序：

1. `petstate.js` + `grow` / `match` + 单测。
2. `petart` 四件示例，先证明两个轴。
3. `pet.js` 接入 `stateOf`、`grownMs` / `plantedAt`，全部用 `update`。
4. e2e + debug hook。
5. 第二批再谈 `cycle`；`event` 等日内天气源。

## 12. 测试计划

- **grow**：架子时间边界、收进箱子暂停、重新摆上继续、时钟回拨、最后一段永久、`px` 等于第 0 段。
- **match**：优先级、兜底、`night`、跨午夜 `hour`、天气、季节、`stage`、`lunarDay` / `lunarMonth` / `lunarLeap`、`onShelf`。
- **组合**：grow 后 match 用 `stage`；后层覆盖前层；层返回 `null` 不影响 `base`。
- **校验**：非法 `state` 降级；未知 `when` 字段；超过上限；AI 多给字段被忽略。
- **数据安全**：`update` 保留未知字段；摆上/收起只改 `plantedAt` / `grownMs`。
- **渲染**：房间、箱子、携带三处都用同一个 view；16 x 16 四色。
- **兼容**：旧文档、旧 runtime、恢复备份、写入失败。
- **e2e**：种子、风向标、雪花球、月相盘各一条；重载后 `grownMs` / `plantedAt` 正确。

## 13. 备选方案与取舍

1. **线性 `stages` 字段**：实现最简单，但无法表达昼夜/天气/农历；拒绝作为唯一模型。
2. **一张大状态图**：表达力强，但状态爆炸、每件物品重复描述；拒绝。
3. **文档里放 JS 函数**：最灵活，但纪念品变成代码，安全/备份/旧 runtime 都不可控；拒绝。
4. **内置包注册 JS driver**：v1 不做；内置物品也是数据，等真的有需要再单独提案。
5. **每帧写状态**：会产生大量写入和定时器；拒绝。
6. **像素级 overlay**：例如雪落在花上；表达力更强，但需要合成规则和更多校验；留到以后。
7. **按包引用 state**：文档更小，但包更新会改变旧纪念品；选择复制进文档，保证自包含。
8. **固定周期算月相**：朔望月长度每月差 ±7 小时，会和万年历对不上；改用 `lunar.js` + `match.lunarDay`。

## 14. Review 结论

这一版按 review 收敛为：

- 只做 `grow` + `match`；`cycle` 第二批；`event` 不规划。
- 种子只在架子上长；`grownMs` + `plantedAt`，收起/摆上各写一次。
- 改写文档只用 `update`，不用 `set`；未知字段保留。
- 月相用 `lunar.js` 的农历日，不用固定周期。
- AI 多给 `state` 直接忽略，不拒绝整件。
- 去掉 `register`、`since` / `nextAt`、文档级 `v`、`minAge` / `maxAge`、`stateData` / `patch`。
- 状态行写明是 1.0 之后的工作。
- 落地时补 `decisions.md` §44，登记 `index.html` / `sw.js` / `RUNTIME_VERSION`。

## 15. 未决问题

1. `state` 复制进文档，还是只存包内引用？本文倾向复制，保证自包含。
2. `grownMs` / `plantedAt` 的写入失败语义是否够清楚？是否需要“未存档”时禁止收起？
3. `lunarLeap` 是否需要在第一版就暴露？还是等真的有中秋/闰月物品再加？
4. AI 要不要以后开放 `match` 子集？本文倾向先不做。
5. 要不要像素级叠加（雪落在花上）？本文倾向只做整帧覆盖。
6. 阶段变化要不要宠物反应？本文倾向只做一次 happy，不加数值。
7. 架子是否允许大于 16 x 16？本文倾向先不做。

## 16. Review checklist

- [ ] layer 模型是否覆盖已知的纪念品类型（生长、昼夜、天气、季节、农历）？
- [ ] `stateOf(item, ctx)` 作为唯一 hook 是否边界清晰？
- [ ] `grownMs` + `plantedAt` 是否足够表达“只在架子上长”？
- [ ] `update` 的写入顺序和失败语义是否可接受？
- [ ] `when` 字段是否够用，是否有多余或缺失？
- [ ] 后层覆盖前层的规则是否足够直观？
- [ ] 存储读取宽容、AI 输入白名单忽略，这个不对称是否合理？
- [ ] 旧 runtime / 旧文档 / 备份恢复的兼容是否完整？
- [ ] 数据预算是否可接受？
- [ ] `cycle` 留到第二批、`event` 不规划，是否同意？
