# 纪念品库扩到 100 个 — 设计草案

- 状态：draft，等 owner 确认（2026-11-01）。
- 目标：没有 AI 线路的玩家，第一年每个月都能捡到新东西；库的结构整齐，以后加纪念品只是往表里加行。
- 范围：`runtime/petsouv.js`（新）、`runtime/petart.js`、`runtime/apps/pet.js`、`runtime/petsim.js`、`runtime/strings.js`、测试。
- 不变：外出概率与时间、AI 的一天一次调用与隐私白名单、`petstate.js` 的 grow / match、已有纪念品文档的字段与图、箱子和架子的操作、房间画面。

## 1. 现状（main 1c675f2）

- `petart.js` 的 `SOUV` 有 23 件（18 件静态、明信片、种子 / 风向标 / 雪花球 / 月相盘 4 件有状态）。
- 外出概率看性格：lively 0.70、curious 0.55、sleepy 0.30。`builtinSouvenir` 只避开最近 5 件。
- 模拟（2000 次）：第 11 件左右第一次重复；curious 集齐 23 件中位数约 4 个月。
- 纪念品文档 `{name, line, px, at, ai, day, state?, grownMs?, plantedAt?}` 有 `ai`，但**没有记下是表里哪一件**；界面不显示来源。

## 2. 只加到 100 件不够

随机挑、避开最近 5 件，100 件一年（curious 约 200 次外出）后平均只见过 86 种，第 2 个月就开始重复。所以挑法也要改：

1. **没捡过的优先**：池子里有没见过的，就只从没见过的里挑。
2. **按季节分**：80 件分到四季（每季 20 件，只在当季能捡到），20 件四季都有。
3. **新东西按天数发，不按外出次数发**：一次外出带回新东西的概率是 `min(1, 0.28 / trait.outing)`，其余外出从已见过的里挑（仍避开最近 5 件）。这样三种性格都是大约每 3.5 天一件新东西，一年约 100 件，sleepy 不吃亏，lively 也不会两个月就挖空。

模拟（20 季节件 x 4 + 20 四季件，起始日随机）：

| 性格 | q | 一年新捡到 | 每月新东西（第 1 → 12 月） |
|---|---|---|---|
| sleepy 0.30 | 0.93 | 约 92 件 | 8.6 → 5.7 |
| curious 0.55 | 0.51 | 约 92 件 | 8.7 → 5.7 |
| lively 0.70 | 0.40 | 约 92 件 | 8.6 → 5.7 |

后几个月少一点，是因为当季的件捡完了还要等下一季；剩下约 8 件留到第二年。

（`0.28` 是可以调的一个常数，写在物种包里，测试里再跑一次这张表。）

挑选必须确定：种子仍是 `daySeed(born, day)`，同一天开两次结果一样；“见过哪些”从箱子里的文档算出来（见 3.2），不另存状态。

## 3. 数据形状

### 3.1 纪念品目录 `runtime/petsouv.js`

新文件，纯数据 + 两个纯函数，ES5、一个 IIFE，挂 `window.LopdaPetSouv`。`petart.js` 的物种包改成引用它（`souvenirs: LopdaPetSouv.CATALOG`），`SOUV` 和种子 / 风向标等的网格整体搬过去，像素一个不改。

```js
{id:"shell", set:"shore", season:"any", where:"river", grid:[16 行], state?:{...}}
```

- `id`：小写英文，永不改、永不复用（文档靠它认领，见 3.2）。
- `set`：分组，只用来排序和以后扩展（`shore` 水边、`yard` 院子、`street` 街上、`desk` 书桌、`sky` 天气与天空、`fest` 节日）。
- `season`：`any | spring | summer | autumn | winter`。节日件（灯笼、粽叶、月饼模……）挂在所属季节，第一版不做“只在节日当天”。
- `where`：地点 key，文字在 strings.js `pet.where.<key>`（“河边”/“the river”）。本地件显示“在{where}捡到的”。
- `state`：同 0.52.0，可选。
- 表按 `set` 再按加入顺序排列；新件只追加在本组末尾。
- 文字：`pet.souv.<id>`、`pet.souv.<id>.line`（已有的 23 件 key 不变）。

### 3.2 文档加一个 `ref`

- 新文档多存 `ref: "<目录 id>"`（本地件）；AI 件不存 `ref`，多存 `where: {zh, en}`。
- 旧文档没有 `ref`：读的时候按名字（zh 或 en）对回目录，只在内存里补，不改写文档。对不上的就是 AI 件或旧的单语件。
- 明信片的 `ref` 是 `post`，来源行另写“旅行回来带的”（旅行带回的和外出捡到的明信片都这样写，简单）。

### 3.3 卡片上的来源行

在日期下面一行，一个规则，不给玩家选项：

| 文档 | 中文 | English |
|---|---|---|
| 有 `ref`，目录有 `where` | 在河边捡到的 | Found by the river |
| `ref` 是 `post` | 旅行回来带的 | Brought back from a trip |
| `ai` 且有 `where` | 出门在{where}找到的 | Found out at {where} |
| `ai` 没有 `where`（旧件） | 出门时找到的 | Found while out |
| 其他 | 不显示 | — |

### 3.4 AI 多一个字段

`aiPrompt` 的 JSON 样例加 `"where":{"zh":"不超过 6 个汉字","en":"20 characters at most"}`，说明“一个虚构的、普通的地方，比如旧书摊、桥下，不要真实地名或地址”。`validateSouvenir` 把 `where` 当可选字段：合法就保留，不合法就丢掉 `where`、保留整件（不因为它拒绝整件）。发给 AI 的内容不变。

## 4. 画图规则（77 件新图）

- 16 x 16，`. k d m p` 五个字符（透明 + 四色），和现有 23 件同样的粗黑轮廓、左上受光。
- 原创的日常小物，不画任何别人的 IP、商标、文字或可认出的品牌。
- 每批约 20 件，配一张总览图（4 倍放大，中英名字和一句话）给 owner 过目，通过才进库。
- 季节件要一眼看得出季节（樱花瓣、蝉蜕、红叶、冰凌……）。

## 5. 测试

- `tests/petsouv.test.mjs`：id 唯一且合法；每件 zh/en 名字、一句话、`where` 都在 strings.js；网格 16 x 16 只用五个字符；`season` / `set` 在白名单；总数 >= 100；每季 >= 20 件。
- `tests/petsim.test.mjs`：新挑法确定（同种子同结果）；没见过的优先；只挑当季或四季件；新东西概率公式；一年模拟的平均新件数在区间里（固定种子）；`validateSouvenir` 的 `where` 可选、坏了只丢 `where`。
- `tests/e2e.test.mjs`：卡片显示来源行（本地 / 明信片 / AI / 旧 AI）；旧文档没有 `ref` 也能对上并显示地点。
- `tests/runtime-shots.mjs`：房间与箱子画面除新卡片的来源行外不变。

## 6. 分工与分批

1. 代码（一个 PR）：`petsouv.js` + 搬家（像素不变）、`ref` / `where`、挑法、来源行、AI `where`、测试、decisions.md 新的一节、`RUNTIME_VERSION` / `VERSION`、index.html 与 sw.js SHELL 加新文件。
2. 图和文字分 4 批（每批约 20 件）跟在后面，每批 owner 看过总览图再提交。
