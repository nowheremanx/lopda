# 设计草稿：把四轨机（Tape4）的曲子用进 app

状态：草稿（owner 2026-11-02 定了「先只写设计文档」）。不写代码，不改 SPEC。A 是 Tape4 自己的新功能，不碰 `lopda/1`；
C 要往 SPEC 里加东西，`lopda/1` 已冻结（decisions.md 第 51 节），只能 1.0 之后作为新增。

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

| | 做法 | 好处 | 代价 | 时间 |
|---|---|---|---|---|
| A | Tape4 加「导出 MML」：把磁带压成 `PAD.music` 的四声道曲子 | 不改 SPEC；今天所有 runtime 都能播；跟音量、静音键、锁屏、HOME 走；文本几 KB，能贴进提示词 | 有损：芯片音色，和弦变薄，人声和磁带味没了 | 小（约 1-2 天）；1.0 前后都行 |
| B | SDK 出 `lo-tape.js`，像 lo-game 一样打包进 app，app 自己用 Web Audio 播 JSON | 和 Tape4 一模一样 | 每个 app 多 60-100 KB；自己的 Web Audio 不跟音量和静音键（SPEC 4 不推荐）；合成器一改就要发新版本、所有 app 重打包 | 不推荐 |
| C | 新 API：`PAD.music.play(tape)`，runtime 用 Tape4 的合成器播一盘磁带 | 原声；跟 runtime 的音量走；合成器修好了所有 app 一起变好 | 加 SPEC；pad-audio.md 9.2「runtime 只认 MML」要改成「MML 和磁带两种乐谱」 | 1.0 之后 |
| C2 | 在 C 上再加 `PAD.music.pickTape()`：玩家在 runtime 的选择框里挑自己的一盘磁带给 app | 节奏游戏、「用你自己的歌当关卡音乐」 | 多一个权限对话框；玩家的作品进了 app 的存档 | 1.0 之后，看有没有 app 真要 |

建议：A 先做（什么时候做由 owner 定），C 留到 1.0 之后。B 不做。C2 等到有 app 提出来再说。

A 和 C 不冲突：app 可以两样都带，`PAD.music.tapes` 存在就播原声，否则播 MML（见 4.3）。

## 3. 方案 A：导出 MML

### 3.1 在哪

- Tape4 菜单的导出行里，JSON / MIDI / WAV 旁边加一行「芯片版 MML」。点开是一页：上面「试听」（用 `chip.js` 当场播，作者先听到
  损失再交出去），下面「复制」和「存成 .txt」（走现有的分享 / 下载）。页面上写一行：「人声和磁带味不会带过去」。
- 同一个转换做成纯函数 `runtime/tape-mml.js`（ES5，`LopdaTapeMml.convert(song) -> {song:{bpm,p1,p2,tri,noise}, notes:[...]}`），
  加一个 Node 工具 `tools/tape2mml.mjs <tape.json>`：做 app 的人或 AI 不用手机也能转。
- `sdk/PROMPT.md` 加一段：「有 Tape4 的 .json 就先用 tools/tape2mml.mjs 转成 MML，放进 `PAD.music.play`」。

### 3.2 怎么映射

| Tape4 | 芯片 | 规则 |
|---|---|---|
| bpm 60-140 | `bpm` | 原样 |
| key + scale + deg + acc | 音名和八度 | 走 `noteMidi`；MIDI 60 = `o4 c`，八度 = floor(midi/12)-1 |
| melody | `p1` | 单音：同一刻有几个音取最高的；音色粗映射到占空比（square `@2`，flute / reed `@1`，pluck `@0`，bowed `@3`） |
| chords | `p2` | 默认快速琶音（每个 32 分音符轮一个和弦音，芯片的老办法）；见第 6 节问题 1 |
| bass | `tri` | 单音，取最低的；三角波声道没有音量，按 SPEC 6.3 |
| drums | `noise` | 一个声道只能一下：kick / snare → `X`，hat / perc → `x`；同一格几下取力度最大的 |
| vel 和调音台 vol | `v0`-`v15` | `round(vel * vol * 15)`；mute 的轨不写 |
| voice（人声） | 没有 | 丢掉，页面上说明 |
| 套鼓、音色、磁带味、gate / orn | 没有 | 丢掉（gate 能用音长近似就近似） |
| swing | 音长 | 奇数 16 分音符往后挪的量取整到 1/64（6 tick），用 `&` 连音写出 |
| 链（最多 96 格） | 段落 | 每个用到的 pattern 写一次；连续重复的写成 `[...]n` |

时间：96 tick 一拍，`l64` = 6 tick，最小单位就是它；比它细的（Tape4 现在录音也量化到 16 分音符）取整。

### 3.3 限制

- SPEC 6.3：MML 合起来最多 8192 个字符。96 格的长链可能超。超了就只导出前面能放下的整段，并在页面上说「只放下了前 N 段」，
  不偷偷截在小节中间。见第 6 节问题 2。
- 输出必须过 `chip.js` 的解析器（测试里逐个跑 Demo 文件夹的四盘磁带）。

### 3.4 测试

- `tests/tape-mml.test.mjs`：映射表每一行一个例子；四盘 Demo 磁带转出来都能被 chip.js 解析、在 8192 字以内；
  `tools/tape2mml.mjs` 和 runtime 里的结果逐字相同。
- 手机上：试听的声音和 dev.html 里 `PAD.music.play` 播出来一样。

### 3.5 不变的东西

- 磁带格式（`v:1`）、库、版本、工作区 zip、AI 协作者、WAV / MIDI / JSON 导出都不动。
- `chip.js` 和 `PAD.music` 不动，SPEC 不动。

## 4. 方案 C：`PAD.music.play(tape)`（1.0 之后）

### 4.1 API

```js
if (PAD.music && PAD.music.tapes) {          // runtime 支持磁带才有这个字段（数组，如 ["tape/1"]）
  PAD.music.play(TAPE, {loop: true});        // TAPE = Tape4 导出的 .json 对象
} else if (PAD.music) {
  PAD.music.play(CHIP);                      // 方案 A 转出来的 MML，老 runtime 用
}
```

- 和 MML 曲子共用一个「当前曲子」：同时只有一首；`stop()`、音量、静音键、锁屏、HOME 规则完全一样（SPEC 6.3）。
- runtime 用 `LopdaSong.validate` 检查；不过就像 MML 解析失败一样，在错误框里说出原因，不播。
- 大小：去掉 `clips`（人声，本来就是录音）后 JSON 最多 32 KB（四盘 Demo 磁带都远小于它，实现前量一下）。
- 播放用 Tape4 的合成器和磁带味，放在 runtime 的声音总线上，和 MML 走同一个音量节点。
- 频率限制沿用「每秒 4 次」。

### 4.2 SPEC 和版本

- SPEC 6.3 加一小节「磁带」，`lopda/1` 之内的新增（老 app 不受影响），写明从哪个 runtime 版本起。
- 磁带格式从此是 SPEC 的一部分：`v:1` 的字段要冻结。以后 Tape4 加新字段只能是可选的、老 runtime 忽略也能播。
  这是 C 最大的代价：Tape4 还在长（2.0「音乐词汇」），冻结前要等它稳定。
- dev.html 也要能播（它已经共用 chip.js，到时也要带上 studio-synth.js）。

### 4.3 两样都带

app 带一份 MML（A 转出来的）和一份磁带 JSON，新 runtime 播原声，老 runtime 播芯片版。工具 `tape2mml.mjs` 可以直接吐出这一对。

## 5. 版权

- Tape4 的曲子是作者自己写的，进商店没问题；AI 协作者帮写的部分也算作者的作品（和用 AI 写代码一样）。
- Demo 文件夹里「When the Saints」和「茉莉花」是公有领域民歌，app 用的时候照 CLAUDE.md 在乐谱旁写出处。
- 商店审核照旧：不收改编的游戏音乐，不管是用什么工具写的。

## 6. 要 owner 定的

1. 和弦在芯片上怎么出声：琶音（建议，像 1986 的机器）、只弹根音、还是只弹最高音？
2. 超过 8192 字：只导出前面放得下的整段（建议），还是让作者在链上选一段？
3. A 什么时候做：1.0 之前（小，不改 SPEC）还是 1.0 之后？
4. C 等 Tape4 2.0 的格式稳定后再做，对吗？
