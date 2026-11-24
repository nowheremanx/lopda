# 纪念品库扩到 100 个 — 设计草案

> 2026-11-01 更新（owner）：数量比长相重要，目标改为 **300 件**（四季各 60、`any` 60），大部分由 DeepSeek 画。自带纪念品改为大约一周一件：每次外出按 `min(1, (1/7) / trait.outing)` 决定带不带回，没带回就空手回来、不写文档；有 AI 线路时每个外出日最多一件 AI 纪念品（也要过下面的心情掷骰）。下文的 100 是第一版的数量，以 decisions.md 第 45 节为准。

心情也会影响这件事：`petsim.careScore(save)` 把 joy、hunger、mess 折成 0..1，存档里的 `care` 按天取平均（新档或旧档第一次出门时从当天的分数开始），只在当天外出决定时更新一次（`today.cared` 防重）。自带纪念品的概率乘 `souvenirMood(care) = clamp((care-0.2)/0.6, 0.1, 1)`；有 AI 线路时，只有当天另一颗按天种子的骰子小于这个系数才发请求，没过就空手回来、不花 AI 额度。养得好的宠物大约一周一件，长期不开心的宠物一年最多十件左右。

- 状态：draft，等 owner 确认（2026-11-01）。
- 目标：没有 AI 线路的玩家，大约每周能捡到一件自带纪念品；库的结构整齐，以后加纪念品只是往表里加行。
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
3. **自带纪念品按周发，其余空手回来**：一次外出带回自带纪念品的概率是 `min(1, (1/7) / trait.outing)`，三种性格都约一周一件（一年约 52 件）；其余外出空手回来，不写文档，当天照常标记完成。没见过的永远优先：池子里有没见过的（当季或 `any`），就一定从没见过的里挑，只有捡完了才从见过的里挑（仍避开最近 5 件）。

模拟（60 季节件 x 4 + 60 四季件，起始日随机，每个性格 50 个种子）：

| 性格 | 一周一件的概率 | 一年自带纪念品（实测平均） |
|---|---|---|
| sleepy 0.30 | 0.476 | 约 51.3 件 |
| curious 0.55 | 0.260 | 约 50.7 件 |
| lively 0.70 | 0.204 | 约 51.1 件 |

（`1/7` 是可以调的一个常数，写在物种包里，测试里再跑一次这张表。）

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
| `ai` 且有 `where` | 出门在{where}找到的 | Found on a walk: {where} |
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
- `tests/petsim.test.mjs`：新挑法确定（同种子同结果）；没见过的优先；只挑当季或四季件；自带纪念品概率公式（`souvenirLocalChance`）；一年模拟的平均件数在区间里（固定种子）；`validateSouvenir` 的 `where` 可选、坏了只丢 `where`。
- `tests/e2e.test.mjs`：卡片显示来源行（本地 / 明信片 / AI / 旧 AI）；旧文档没有 `ref` 也能对上并显示地点。
- `tests/runtime-shots.mjs`：房间与箱子画面除新卡片的来源行外不变。

## 6. 分工与分批

1. 代码（一个 PR）：`petsouv.js` + 搬家（像素不变）、`ref` / `where`、挑法、来源行、AI `where`、测试、decisions.md 新的一节、`RUNTIME_VERSION` / `VERSION`、index.html 与 sw.js SHELL 加新文件。
2. 图和文字分 4 批（每批约 20 件）跟在后面，每批 owner 看过总览图再提交。
