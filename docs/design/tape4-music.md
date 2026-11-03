# 设计草稿：四轨机（Tape4）的曲子用进 app

状态：草稿，**1.0 之后**做，要等 Tape4 2.0（音乐词汇）的格式稳定以后。这一步只写文档，不写代码，SPEC 也不动。
`lopda/1` 已冻结（decisions.md 第 51 节），这里的 API 将来作为新增加进去，老 app 不受影响。

## 0. 已定的事（owner，2026-11-02 / 11-03）

| 问题 | 决定 |
|---|---|
| 曲子怎么进 app | runtime 原声播磁带：`PAD.music.play(tape)`（第 3 节）。不做芯片版 MML 导出：「没必要到处 MML，只要 C，原汁原味」 |
| 什么时候做 | 1.0 之后，等 Tape4 2.0 的格式稳定；那时磁带格式要写进 SPEC，就再也不能随便改了 |
| 磁带大小上限 | 不另设上限：32 KB 不够，app 自己的 512 KB 就是上限 |
| 专辑 | 一盘磁带是一首歌，几盘就是一张专辑，配上像素封面，做成社区 app（第 4 节） |
| 玩家挑自己的磁带给 app | 还没定（第 5 节） |

## 1. 想要什么

owner（2026-11-02）：「我用 Tape4 做的音乐可以在用户的游戏里面用吗？这样就形成了自我循环，用户在开发游戏的时候也就知道
自己会用怎样的音乐。」

循环是：在 Tape4 里写曲子 → 导出 .json（已有）→ 开发者或 AI 把它放进 app → app 里响起和 Tape4 里一样的声音
→ 商店里的 app 又让别人想写曲子。

owner 对现在的 AI 曲子的看法：AI 味重，有点俗气，但当游戏背景音乐够用。Tape4 2.0 的音乐词汇（每轨音色、更多和弦）
做完以后应该会好一些，这也是先等 2.0 的另一个理由。

## 2. 今天为什么不行

| 现有路径 | 卡在哪 |
|---|---|
| WAV 导出，嵌进 app 当 `data:` | app 上限 512 KB；16-bit 单声道 44.1 kHz 约 88 KB/秒，只放得下约 5 秒。SPEC 4 的音量、静音键、锁屏也管不到 `<audio>` |
| JSON 导出，嵌进 app | app 里没有 Tape4 的合成器（`studio-synth.js` 约 46 KB，加上 `studio-tape.js` 和歌曲格式），播不出来 |
| `PAD.music.play(song)` | 只认 MML（四个芯片声道，SPEC 6.3） |
| MIDI 导出 | app 里没有 MIDI 播放器；pad-audio.md 9.2 说 runtime 只认 MML |

## 3. `PAD.music.play(tape)`

### 3.1 比较过的做法

| 做法 | 结论 |
|---|---|
| Tape4 导出芯片版 MML，app 用现有的 `PAD.music.play` | 不做：和弦变薄，人声和磁带味没了，owner 要原声 |
| SDK 出 `lo-tape.js`，打包进 app，自己用 Web Audio 播 | 不做：每个 app 多 60-100 KB；不跟音量和静音键（SPEC 4 不推荐）；合成器一改，所有 app 都要重打包 |
| **runtime 用 Tape4 的合成器播磁带** | **做**：原声；跟 runtime 的音量、静音键、锁屏走；合成器修好了，所有 app 一起变好 |

### 3.2 API

```js
if (PAD.music && PAD.music.tapes) {          // 支持磁带的 runtime 才有这个字段（数组，如 ["tape/1"]）
  PAD.music.play(TAPE, {loop: true});        // TAPE = Tape4 导出的 .json 对象，原样放进 app
} else if (PAD.music) {
  PAD.music.play(CHIP);                      // 可选：app 自己写的 MML 后备，老 runtime 用
}
PAD.on("music", function (e) {               // 新事件：{type: "end"}，一首不循环的曲子放完了
  if (e.type === "end") nextTrack();
});
```

- **一首在放。** 磁带和 MML 曲子共用一个「当前曲子」：同时只放一首。`stop()`、音量、静音键、锁屏、HOME 的规则和 SPEC 6.3 一样。
- **检查。** runtime 用 `LopdaSong.validate` 检查磁带。过不了就不播，像 MML 解析失败那样在错误框里说明原因。
- **大小。** 不另设上限，app 的 512 KB 就是上限。`validate` 限制每个 pattern 最多 1024 个音，坏文件拖不垮它。
  参考：示例磁带 neo-soul 约 12.6 KB，白日流行约 9.5 KB。
- **播什么。** 播磁带里的轨、调音台的音量和静音、swing 和磁带味。人声轨的 `clips` 是录音，不播。
- **声音走哪。** 磁带接在 runtime 的声音总线上，和芯片用同一个音量节点。
- **频率。** 和 MML 一样，每秒最多 4 次。
- **放完的事件。** `play(x, {loop: false})` 放完时发 `{type: "end"}`，磁带和 MML 都发。现在的 SPEC 6.3 没有这个事件，和磁带一起加。

### 3.3 老 runtime

`PAD.music.tapes` 不存在，就说明 runtime 不能播磁带。这时 app 可以不出声，也可以自己带一首 MML 当后备，平台不替它转换。
`PAD.on("music")` 在老 runtime 上永远不会触发，所以「放完接下一首」的 app 要自己有个后备（比如循环放第一首）。

### 3.4 SPEC 和磁带格式

- SPEC 6.3 加一小节「磁带」和 `music` 事件，写明从哪个 runtime 版本起有。
- 从这时起，磁带格式就是 SPEC 的一部分，`v:1` 现有的字段要冻结。以后 Tape4 只能加可选字段，老 runtime 忽略了也要能播。
  这是这个方案最大的代价，所以要等 Tape4 2.0 稳定以后再做。

## 4. 专辑（owner，2026-11-03）

一盘磁带是一首歌，几盘磁带就是一张专辑，配上像素封面，本身就有艺术感。有了第 3 节，专辑就是一个普通的社区 app，
不需要别的 API：

- `index.html` 里放几盘磁带的 JSON、一张四色像素封面、一份曲目单，再加一个播放器：封面、曲目、上一首 / 下一首，
  像 1986 年的随身听。一首放完收到 `music` 的 `end` 事件，就接着放下一首。
- 一张专辑就是商店里的一个 app，审核照旧：曲子必须是原创或公有领域。
- SDK 加一个模板 `sdk/template-album/`（封面、曲目单、播放器），和第 3 节放在同一个 PR 里，当示例。

## 5. 玩家挑自己的磁带给 app（未定）

第 3 节是**开发者**把自己导出的 .json 写进 app，所有玩家听到的都是同一首。这里说的是另一件事：app 运行的时候，
**玩家**从自己的 Tape4 磁带库里挑一盘交给 app，比如节奏游戏用玩家自己的歌出关卡，或者跑酷游戏换上玩家自己的配乐。

- 大概的样子：`PAD.music.pickTape()` 打开 runtime 自己的选择框，返回一盘磁带，玩家取消就返回 null。要在 manifest 里声明一项权限，
  第一次用时 runtime 弹对话框，像 `PAD.camera.snap` 那样。
- 代价：多一个选择框、一项权限；玩家的作品会进到 app 的存档里。
- 建议：先不做，等有 app 真的需要再说。

## 6. 做的时候要改的

- runtime：`PAD.music.play` 认出磁带，交给 `studio-song.js`、`studio-synth.js`、`studio-tape.js` 播；`PAD.music.tapes`；`music` 事件。
- `sdk/pad-shim.js` 和 `sdk/dev.html`：dev.html 也能播磁带（它现在只带 chip.js，到时还要带上 Tape4 的合成器）。
- SPEC 6.3；`sdk/PROMPT.md` 加一段：「有 Tape4 的 .json，就原样放进 `PAD.music.play`」。
- `sdk/template-album/`，再给一个现有的游戏换上 Tape4 写的曲子当示例。
- 测试：老 app 的 MML 曲子行为不变；坏磁带报错、不播；HOME、锁屏、音量 0 都能停；`end` 事件只在不循环的曲子放完时发一次。

不变的东西：

- 磁带格式现有的字段，Tape4 的库、版本、导入导出、AI 协作者都不动。
- `PAD.music.play(song)` 播 MML 曲子的行为不变。

## 7. 版权

- Tape4 的曲子是作者自己写的，进商店没问题。AI 协作者帮写的部分也算作者的作品，就像用 AI 写代码一样。
- Demo 文件夹里的「When the Saints」和「茉莉花」是公有领域民歌，app 用了的话，照 CLAUDE.md 在乐谱旁写出处。
- 商店审核照旧：不收改编的游戏音乐，用什么工具写的都一样。
