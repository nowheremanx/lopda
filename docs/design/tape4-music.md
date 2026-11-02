# 设计草稿：把四轨机（Tape4）的曲子用进 app

状态：草稿，1.0 之后。owner 2026-11-02 定了只做方案 C（runtime 原声播磁带），不做 MML 导出。C 要往 SPEC 里加东西，
`lopda/1` 已冻结（decisions.md 第 51 节），只能作为之后的新增。

## 0. 想要什么

owner（2026-11-02）：「我用 Tape4 做的音乐可以在用户的游戏里面用吗？这样就形成了自我循环，用户在开发游戏的时候也就知道
自己会用怎样的音乐。」

循环是：在 Tape4 里写曲子 → 交给做 app 的人（或他们的 AI）→ app 里响起这首曲子 → 商店里的 app 又让别人想写曲子。

## 1. 今天为什么不行

| 现有路径 | 卡在哪 |
|---|---|
| WAV 导出，嵌进 app 当 `data:` | app 上限 512 KB；16-bit 单声道 44.1 kHz 约 88 KB/秒，只放得下约 5 秒。而且 SPEC 4 的音量、静音键、锁屏都管不到 `<audio>` |
| JSON 导出，嵌进 app | app 没有 Tape4 的合成器（`studio-synth.js` 约 46 KB + `studio-tape.js` + 歌曲格式），播不出来 |
| `PAD.music.play(song)` | 只认 MML（四个芯片声道，SPEC 6.3）；Tape4 不导出 MML。studio.md 第 5 节把「MML 导出」列成加分项，一直没做 |
| MIDI 导出 | app 里没有 MIDI 播放器；pad-audio.md 9.2 说 runtime 只认 MML |

## 2. 方案

| | 做法 | 结论 |
|---|---|---|
| A | Tape4 导出芯片版 MML，app 用现有的 `PAD.music.play` | 不做（owner 2026-11-02：「没必要到处 MML，只要 C，原汁原味」）。和弦变薄、人声和磁带味没了 |
| B | SDK 出 `lo-tape.js`，打包进 app，自己用 Web Audio 播 | 不做：每个 app 多 60-100 KB，不跟音量和静音键，合成器一改所有 app 要重打包 |
| C | 新 API `PAD.music.play(tape)`：runtime 用 Tape4 的合成器播一盘磁带 | **做，1.0 之后**。原声；跟 runtime 的音量走；合成器修好了所有 app 一起变好 |
| C2 | 在 C 上加 `PAD.music.pickTape()`：玩家在 runtime 的选择框里挑自己的磁带给 app | 等有 app 真要再说 |

循环就是：在 Tape4 写曲子 → 导出 .json（已有）→ 开发者或 AI 把它放进 app → `PAD.music.play(tape)` 播出和 Tape4 里一样的声音。

## 3. 方案 C：`PAD.music.play(tape)`（1.0 之后）

### 3.1 API

```js
if (PAD.music && PAD.music.tapes) {          // runtime 支持磁带才有这个字段（数组，如 ["tape/1"]）
  PAD.music.play(TAPE, {loop: true});        // TAPE = Tape4 导出的 .json 对象
} else if (PAD.music) {
  PAD.music.play(CHIP);                      // app 自己写的 MML 后备（可选），老 runtime 用
}
```

- 和 MML 曲子共用一个「当前曲子」：同时只有一首；`stop()`、音量、静音键、锁屏、HOME 规则完全一样（SPEC 6.3）。
- runtime 用 `LopdaSong.validate` 检查；不过就像 MML 解析失败一样，在错误框里说出原因，不播。
- 大小：不另设上限（owner 2026-11-02：32 KB 不够）。磁带放在 app 的 `index.html` 里，app 本身的 512 KB 就是上限；`validate` 的
  每个 pattern 1024 个音已经挡住了坏文件。`clips`（人声录音）不播。参考：示例磁带 neo-soul 约 12.6 KB，白日流行约 9.5 KB。
- 播放用 Tape4 的合成器和磁带味，放在 runtime 的声音总线上，和 MML 走同一个音量节点。
- 频率限制沿用「每秒 4 次」。

### 3.2 SPEC 和版本

- SPEC 6.3 加一小节「磁带」，`lopda/1` 之内的新增（老 app 不受影响），写明从哪个 runtime 版本起。
- 磁带格式从此是 SPEC 的一部分：`v:1` 的字段要冻结。以后 Tape4 加新字段只能是可选的、老 runtime 忽略也能播。
  这是 C 最大的代价：Tape4 还在长（2.0「音乐词汇」），冻结前要等它稳定。
- dev.html 也要能播（它已经共用 chip.js，到时也要带上 studio-synth.js）。

### 3.3 老 runtime

`PAD.music.tapes` 不存在时，app 不能播磁带。app 可以安静着，也可以自己带一首 MML 当后备；平台不替它转换。

### 3.4 要做的

- runtime：`PAD.music.play` 认出磁带对象，交给 Tape4 的合成器（`studio-song.js`、`studio-synth.js`、`studio-tape.js`）播，接到和芯片同一个音量节点。
- `sdk/pad-shim.js` 和 `sdk/dev.html`：dev.html 也能播磁带。
- SPEC 6.3 加「磁带」一小节；`sdk/PROMPT.md` 加一段：「有 Tape4 的 .json 就原样放进 `PAD.music.play`」。
- 一个示例 app（或给现有游戏换上 Tape4 写的曲子）。
- 测试：老 app 的 MML 曲子行为不变；坏磁带报错不播；HOME / 锁屏 / 音量 0 都能停。

### 3.5 不变的东西

- 磁带格式（`v:1`）的现有字段、Tape4 的库、版本、导入导出、AI 协作者都不动。
- `PAD.music.play(song)` 对 MML 曲子的行为不变。

## 4. 版权

- Tape4 的曲子是作者自己写的，进商店没问题；AI 协作者帮写的部分也算作者的作品（和用 AI 写代码一样）。
- Demo 文件夹里「When the Saints」和「茉莉花」是公有领域民歌，app 用的时候照 CLAUDE.md 在乐谱旁写出处。
- 商店审核照旧：不收改编的游戏音乐，不管是用什么工具写的。

## 5. owner 的决定（2026-11-02）

1. C 等 Tape4 2.0（音乐词汇）的格式稳定后再冻结、再做。
2. 磁带大小不另设 32 KB 上限，见 3.1。
3. C2 还没定。说明：C 是**开发者**把自己导出的 .json 写进游戏，所有玩家听到同一首；C2 是游戏运行时，**玩家**从自己 Tape4 的
   磁带库里挑一盘，游戏拿去播（比如节奏游戏用玩家自己的歌出关卡）。C2 要多一个 runtime 选择框和权限。
