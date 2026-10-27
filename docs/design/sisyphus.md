# 设计研究：西西弗斯 / Sisyphus

状态：v0.1.0 已实现（占位美术，合成音效）。实现见 `registry/apps/sisyphus/`；美术需求见 `docs/design/sisyphus-art-prompt.md`；采样替换见 `docs/design/sisyphus-todo.md`。目标平台是 Lo-PDA 社区 app（`lopda/1`，`"buttons": true`，`"permissions": ["notes"]`）。

一句话：把巨石推上去，它从另一边滚下去；西西弗斯走下山，再推。没有胜利，没有失败，只有一次次山顶的停顿和加缪的一句话。

---

## 1. 可行性结论

**可行，而且这个题材和 Lo-PDA 的约束是互相成就的。**

- 四色 LCD 适合做版画式的山、雾、石和人；不需要彩色的史诗，只需要明暗和构图。
- 四声道芯片适合做缓慢、克制、靠结构而不是音色取胜的配乐；山顶的静音会比任何号角都更有力量。
- 512 KB 的 app 上限足够：lo-game 约 28 KB，字体子集约 10–20 KB，代码、乐谱、16 条语录合计约 100–150 KB。
- 真正的难点只有三个：**画面在四色里做出气质**、**四声道做出史诗感**、以及你记的那个 base64 音频 API **目前并不存在**。

---

## 2. 关键发现：base64 音频 API 的真相

你记得的应该是设计稿，不是已经实现的 runtime API。

| 你可能记得的 | 实际情况 |
|---|---|
| `PAD.sample.define(id, base64)` / `PAD.sample.play(id)` | **只有设计稿**：`docs/design/pad-audio.md` 的附录「低保真采样（第 4 层，暂不做）」。没有实现，SPEC 里也没有。 |
| `PAD.music.render(song)` 返回 `data:audio/wav;base64,...` | **也只有设计稿**：同文件 §9.4，用来把 MML 离线渲染成 WAV 导出，不是播放 API。 |
| `PAD.sfx({...})` | 已实现，但它是**实时合成**（方波/三角波/噪声 + 滑音 + 包络 + 颤音），不能播放采样。 |
| `PAD.music.play(MML)` | 已实现，四声道芯片合成，不是音频文件。 |
| `PAD.ambience(name, level)` | 已实现，只有雨、浪、瀑布、风、火、溪流六个合成预设。 |
| `PAD.say(text)` | 已实现，用手机 TTS 朗读，不是采样。 |
| `PAD.exportFile` / `PAD.importFile` | 已实现，接受/返回 data URI（含 base64），但那是文件导入导出，不是播放。 |

设计稿里原本的采样方案是：单声道、8 kHz、4 位、单段 ≤ 1 秒（约 4 KB，base64 约 5 KB），`tools/pcm4.mjs` 把 WAV 转成 4 位 base64，总量 ≤ 64 KB。技术上不难，暂缓的原因是**许可**：程序判断不了一段录音是不是原创，只能靠作者声明加人工试听。

### 那这个 app 怎么办？

**推荐：先用 `PAD.sfx` 做「像人的」艰难声音。** 芯片音色反而和四色画面统一，而且自动跟随总音量、静音键、锁屏和退出 app。

一个可用的「发力声」配方（两层，最多两声道）：

```js
// 喉音：低方波 + 颤音，像人憋着气发力
PAD.sfx({ wave: "square", duty: 1, from: 150, to: 92, ms: 320,
          attack: 30, decay: 290, vol: 0.32, vibrato: { depth: 1.1, rate: 5.5 } });
// 鼻息/喘气：一层轻噪声
PAD.sfx({ wave: "noise", from: 820, to: 280, ms: 200,
          attack: 20, decay: 180, vol: 0.10 });
```

按 3–5 秒的间隔随机触发；开始推的第一下用更低、更长的一声，持续推时变成呼吸。这样比循环播放一个采样更自然，也不会有「同一句喊叫反复播」的廉价感。

**如果你确实想要真人录音：**

1. 录你自己的声音（不要用网上的采样），0.5–0.8 秒，单声道。
2. 用 ffmpeg 转成 8 kHz、4 位 PCM 或低码率 MP3，base64 后嵌进 `index.html`。
3. 用 app 自己的 Web Audio 解码播放。SPEC §4 允许 app 使用自己的 Web Audio，CSP 也允许 `media-src data: blob:`；但**它会绕过 runtime 的总音量、静音键和生命周期**，必须保持很轻（约 0.1），并且只在用户手势后启动。
4. 更正确的做法是把 `PAD.sample` 真正实现进 runtime：`runtime/chip.js` 解码、`sdk/pad-shim.js` 转发、SPEC 和 checker 加规则、`tools/pcm4.mjs` 做转换、开发台试听。设计稿已经写好了，缺的是实现和审核。这是一个平台改动，不是 app 改动。

**结论：** 第一个版本不要为这个 API 停下来。用 `PAD.sfx`；如果试听后觉得不够「人」，再决定是加 Web Audio 采样，还是把 `PAD.sample` 做进平台。

---

## 3. 玩法：一个没有通关的循环

### 3.1 状态

```
标题 → 上山 → 山顶（语录）→ 落石 → 右侧下山 → 绕山幕布 → 左侧山脚 → 上山 → …
```

- **标题**：一幅静止的山景，巨石在山脚，西西弗斯很小。一行操作说明：「按住 A / B 或屏幕，把石头推上去。」A 或触摸开始。满足 SPEC「开场一行说明 + 开始控件」。
- **上山**：按住 A、B 或屏幕任意位置推。两个键完全等价；不制造「按哪个更好」的决策。
- **山顶**：巨石在边缘摇晃，西西弗斯直起身。语录卡出现。A 记入笔记，B 让它过去。选完后巨石从另一边滚落。
- **落石 / 下山**：镜头跟着巨石越过山脊；切到西西弗斯，他从**右侧**山坡下去，跟着石头下到右侧山脚。然后一道从右向左的抖动幕布绕过山体，画面切到**左侧山脚**——石头已经在那里等他。下山是自动的（约 8–10 秒的镜头），不要求按键。加缪说，正是在归途和停顿中，西西弗斯最令人着迷；所以下山应该是**可以呼吸的段落**，不是又一段体力活。
- **回到山脚**：巨石已经在那里（从另一边绕回来了）。山脚出现两行小字：「他绕到了山的另一边。」/「石头在山脚等他。」一次呼吸，下一轮开始。没有「再来一局」按钮。

### 3.2 推石模型

```
progress 0 → 1
按住：progress += 基础速度 × 坡度系数 × dt
松开：progress -= 0.25 × 基础速度 × dt   // 石头在滑
连续 6 秒没按：滑动加速
连续 9 秒没按：脱手，滚回山脚
```

- 坡度越接近山顶越陡，推进越慢；但不要做体力条，体力条会把诗变成管理。
- 松开后石头会缓慢滑回，给玩家「还能救」的余地；停太久才真正脱手。这样「停太久」是一个**逐渐逼近的必然**，不是突然的惩罚。
- 脱手不是 game over：屏幕抖一下，石头滚下去，西西弗斯踉跄一下，然后镜头回到山脚。没有分数，没有「失败」字样。
- 在山顶语录卡出现时，时间是停住的；这是唯一安全的停顿。山坡上的停顿是危险的，山顶的停顿是清醒的。这个对比就是玩法的哲学。

### 3.3 记录

- 每次登顶：`summits++`，把语录 id 放进 `seen`，`PAD.save("sisyphus", {...})`。
- 16 条语录洗牌成牌堆；每次抽一张，抽完重洗。第一次登顶固定给最后一句「必须想象西西弗斯是幸福的」，先把论点交给他；之后随机。
- 不保存半山腰的进度。app 被杀掉就回到山脚；循环本来就是从头开始的。
- 「语录」画廊放在 START 菜单里，不放在主画面。主画面只有山、石、人、天。

---

## 4. 哲思：让机制自己说话

加缪的论证不是「人生没有意义，所以随便」，而是：

1. **荒诞来自对峙**：人要求意义，世界沉默。荒诞不在人里，也不在世界里，而在两者之间。
2. **荒诞不导向自杀**：它要求反抗、自由和激情；清醒地维持这种张力。
3. **西西弗斯是荒诞英雄**：他既有激情，也有磨难；他之所以悲壮，是因为他有意识。
4. **下山才是清醒的时刻**：他离开山顶，走向诸神的洞穴，这一刻他高于自己的命运，比他的石头更强。
5. **结论是一道命令**：「必须想象西西弗斯是幸福的。」不是描述，是任务。

这些可以直接映射到 app：

| 文本 | 机制 |
|---|---|
| 诸神判罚他做无用而无望的劳动 | 推石本身没有奖励，山顶没有宝藏 |
| 石头因自身重量滚落 | 松开就滑，停太久就脱手；这是世界的重量，不是玩家的失败 |
| 悲剧只在他有意识时成立 | 语录只在山顶出现；山顶是意识，不是胜利 |
| 下山是呼吸、是意识 | 下山自动；从右侧下去，抖动幕布绕过山体回到左侧山脚；配乐逆行；这是唯一安全的停顿 |
| 幸福与荒诞不可分 | 没有「通关」，只有继续 |
| 「写一部幸福手册」 | 笔记的标题就叫「幸福手册」；A 键把一句话写进去 |

最后一条是我最想保留的设计：加缪原文有一句——

> On ne découvre pas l'absurde sans être tenté d'écrire quelque manuel du bonheur.
> 人发现荒诞之后，很难不产生写一部幸福手册的念头。

所以「计入笔记」不是附加功能，而是整件作品的题眼。玩家在山顶按 A，runtime 弹出它自己的对话框，问「写入 / 不写」——这个动作本身就是一次选择：要不要把这一刻留下来。笔记标题固定为「幸福手册」，每条语录追加一段，日期和登顶次数自动写进去。这样玩久了，笔记真的会成为一本手册。

---

## 5. 画面

### 5.1 四色的分工

| 色 | 值 | 用途 |
|---|---|---|
| ink `#1f2a14` | 0 | 剪影、最深的岩缝、正文 |
| dark `#4a5a32` | 1 | 近山、石头的暗面、英文副文 |
| mid `#7d8a58` | 2 | 远山、雾、石头的中间调 |
| paper `#a3ad7e` | 3 | 天空、光、石头的受光面、语录卡 |

四色不是「限制」，是版画的四个印版。关键是**大块平色 + 结构化抖动**，不是随机噪点。随机点会让画面变成电视雪花；Bayer 8×8 的规则网点才有铜版画/丝网印刷的味道。

### 5.2 构图

- 内部画布 **160 × 178**（接近 Lo-PDA 带键盘时的屏幕比例），在 iPhone SE 上约 2× 放大。
- 一条从**左下到右上**的长山坡；西西弗斯约 10×16 px，巨石约 18–22 px。人比石头小，山比人大；尺度差就是主题。
- 三层视差：远山（0.2×）、中景（0.5×）、近山（1×），前景碎石/草（1.3×）。
- 天空占上半部，山体从右下压上来；山坡上留一条窄窄的浅色小径，像一条被凿出来的缝。
- 山顶不要做成「领奖台」。一块勉强能放石头的平台，边缘就是深渊；石头在那里摇摇欲坠。
- 下山时镜头先跟着他从右侧山坡下去，他变成一个小点，石头在下方；然后抖动幕布绕过山体，切到左侧山脚。这是「他高于命运」的视觉版，也交代了「石头在另一边」的地理。

### 5.3 一天与天气

每一轮是一次日升日落：

- 山脚：黎明，paper 为主，远处有雾。
- 半山：正午，天光最亮，阴影最短。
- 山顶：黄昏，巨大低垂的太阳，山体变成 ink 剪影，石头的受光面是 paper。
- 下山：夜，星、月、深色山脊；只有语录卡是 paper，像一张从白天留下来的纸。

每轮再随机一种天气：晴、风、雨。风让云和尘走得更快；雨用斜线抖动和 `PAD.ambience("rain")`；晴天只有风。天气不改变难度，只改变气氛。

### 5.4 动画

- 西西弗斯 6 fps，8 个姿势/帧：推 2 帧（推的时候**双腿交替**）、憋气、打滑、站起、下山 2 帧、抬头看山顶。每一帧都保持剪影清楚。
- 巨石 12 fps，但转动很慢；每移动 2 px 转一帧。石头要有裂缝和缺角，不能是完美的圆。
- 尘土 12 fps，接触点每走一步冒 1–2 个 paper/mid 点；脱手时一大团。
- 发力是 2 帧循环 + 1 px 屏幕抖动；石头滚动是 3–4 px 抖动。不要持续抖，只在「heave」的瞬间抖。
- 山顶特写：镜头推近，石头占画面 1/4，西西弗斯在后面，太阳在石头边缘；然后石头慢慢倾斜、落下。这个镜头值得单独做。

### 5.5 语录卡

- 整屏 paper，1 px ink 边框，内缩 4 px；不要双线框（会吃掉本就不多的空间）。
- 顶部小字「山顶」；一条细横线。
- 中文 2–3 行，ink；英文 3–4 行，dark；两者都只用 lopix12，12 px，行高 14。
- 底部一行来源：「加缪《西西弗斯神话》」。
- 最底一行操作：「A 记下　　B 让它过去」。
- 16 条语录必须短：中文 ≤ 45 字，英文 ≤ 110 字符，否则 160×178 放不下。长句要么节选，要么拆成两张卡（不推荐）。
- 我在 `docs/design/sisyphus-composition.png` 放了一张三屏构图测试（上山 / 山顶 / 语录卡），只是测试明暗和排版，不是最终美术。最终需要手绘石头、人物和山体，不能靠程序随机生成。

### 5.6 字体

- 用 `sdk/lo-game.js` 自带的 lopix12（12 px 位图字体，OFL）。`tools/bundle-app.mjs` 只把 app 用到的字打进 `index.html`，通常 10–20 KB。
- 160 px 宽约排 13 个汉字、26 个拉丁字母；语录卡的排版必须按这个来。
- 我已用 `sdk/fonts/lopix12.json` 检查过下面 16 条中文语录的每一个字，**全部有字形**。
- 英文用同一套 12 px 字体；英文长句要压缩翻译，不能照搬出版译本的长句。

---

## 6. 音乐与音效

### 6.1 先说实话

四声道芯片做不出好莱坞管弦乐。它能做的是 **8-bit 的史诗**：慢速、调式、固定低音、定音鼓式的噪声、长休止、以及用音量变化做出的渐强。限制本身就是风格。如果一定要真实管弦乐，只能嵌音频文件（512 KB、绕过音量、版权），不推荐。

### 6.2 结构

- **上山 I**（0–45%）：D 多利亚调式，60 BPM。三角波低音持续音，p1 一个很慢的动机，p2 稀疏的回声；风环境声。
- **上山 II**（45–80%）：同一个动机加入 p2 对位，噪声声部变成心跳/定音鼓；音量整体上一档。
- **山顶**：音乐**停 1.5 秒**，只留风。然后一声低沉的锣（`PAD.sfx` 噪声 + 三角波）。语录卡出现。静音比铜管更史诗。
- **下山**：把上山的动机**倒过来演奏**（retrograde），D 爱奥利亚调式（降 B），52 BPM，更慢、更空。同一段旋律，正着走是努力，倒着走是回忆。
- **回到山脚**：一个低音，然后静下来，下一轮开始。

这个「上山多利亚 / 下山爱奥利亚 + 逆行」的结构，是整首曲子最重要的想法。它让「永恒轮回」不只是重复，而是同一段音乐的另一面。

### 6.3 一个可用的 MML 草图

上山主题（60 BPM，约 55 秒，已用 `LopdaChip.parse` 验证可以解析）：

```js
var ascent = { bpm: 60,
  p1:  "@1 v8 o4 l2 d2 a2 f2 e2 d2 r2 | d2 f2 a2 g2 f2 e2 d2 r2 | f2 e2 d2 c2 d2 e2 f2 r2 | d4 r2 a2 g2 f2 e2",
  p2:  "@2 v4 o3 l8 [d f a >d< a f d f]2 | [g b d >g< d b g b]2 | [c e g >c< g e c e]2 | [d f a >d< a f d f]2",
  tri: "v10 o2 l2 d2 a2 g2 d2 | c2 g2 d2 a2 | b-2 f2 c2 g2 | d2 a2 d2 r2",
  noise: "l4 v2 x r v1 x r v2 x r v1 x r | v2 x r v1 x r v3 X4 r r | v2 x r v1 x r v2 x r v1 x r | v3 X4 r v2 x r v1 x r"
};
```

下山主题（52 BPM，约 32 秒）：

```js
var descent = { bpm: 52,
  p1:  "@2 v7 o4 l2 d2 e2 f2 a2 d2 r2 | c2 b-2 a2 g2 f2 e2 d2 r2",
  p2:  "@0 v4 o3 l4 a2 f2 d2 a2 | g2 e2 c2 e2",
  tri: "v10 o2 l2 d2 a2 b-2 f2 | g2 d2 a2 d2",
  noise: "l2 v1 x r | v1 x r"
};
```

实际写作时还要加：p1 的长音渐强（用连续的 `v` 变化）、p2 的手动回声、山顶前的噪声滚奏。总 MML 控制在 8 KB 以内。

### 6.4 音效配方

| 事件 | 配方 |
|---|---|
| 发力（喉音） | square, duty 1, 150→92 Hz, 320 ms, attack 30, decay 290, vol .32, vibrato 1.1/5.5 |
| 鼻息 | noise, 820→280, 200 ms, attack 20, decay 180, vol .10 |
| 石头刮地 | noise, 180→60, 420 ms, vol .16 |
| 脚下滑 | noise, 1200→400, 120 ms, vol .12 |
| 心跳 | triangle, 60→45, 140 ms, vol .28，两下之间留 180 ms |
| 山顶锣 | noise 300→40, 1200 ms, vol .32 + triangle 90→60, 900 ms, vol .22 |
| 脱手滚落 | noise 90→25, 1400 ms, vol .38 + square 55→35, 1200 ms, vol .18 |
| 风吹 | `PAD.ambience("wind", level)`，level 随高度 0.2→0.6 |

限制：音效每秒最多 20 个，两个同时发声，第三个挤掉最早的。音乐/环境声各自每秒最多 4 次调用。不要在每帧调用；只在事件和阶段变化时调用。

---

## 7. 语录库（16 条）

说明：法文是原文（加缪 1942）；中文和英文是为这个作品自译的，不是出版译本。加缪 1960 年去世，法文原作在中国已进入公有领域；法国/欧盟的版权到 2031 年；美国对 1942 年的法文原作可能仍保护到 2037 年。短句引用并注明出处，按引用/合理使用处理。英文的 Justin O'Brien 译本仍在版权保护期内，所以**不要照搬**，用自译。若上架商店，审核可能会问，保留出处和「自译」说明。

| # | 中文 | English | Français |
|---|---|---|---|
| 1 | 真正严肃的哲学问题只有一个：自杀。 | There is only one truly serious philosophical problem: suicide. | Il n'y a qu'un problème philosophique vraiment sérieux : c'est le suicide. |
| 2 | 人与自己的生活、演员与布景之间的离异，正是荒诞之感。 | That divorce between a man and his life, the actor and his setting, is the feeling of absurdity. | Ce divorce entre l'homme et sa vie, l'acteur et son décor, c'est proprement le sentiment de l'absurdité. |
| 3 | 荒诞诞生于人的呼唤与世界不合理的沉默之间的对峙。 | The absurd is born of the confrontation between the human call and the world's unreasonable silence. | L'absurde naît de cette confrontation entre l'appel humain et le silence déraisonnable du monde. |
| 4 | 荒诞既系于人，也系于世界。 | The absurd depends as much on man as on the world. | L'absurde dépend autant de l'homme que du monde. |
| 5 | 诸神判罚西西弗斯把巨石推上山顶，石头又因自身重量滚落。 | The gods condemned Sisyphus to roll a rock to the top of a mountain, whence it fell by its own weight. | Les dieux avaient condamné Sisyphe à rouler sans cesse un rocher jusqu'au sommet d'une montagne d'où la pierre retombait par son propre poids. |
| 6 | 西西弗斯是荒诞的英雄：既因他的激情，也因他的磨难。 | Sisyphus is the absurd hero: as much by his passions as by his torment. | On a compris déjà que Sisyphe est le héros absurde. Il l'est autant par ses passions que par son tourment. |
| 7 | 正是在归途与停顿中，西西弗斯令我着迷。一张贴近石头劳作的脸，本身已是石头。 | It is in the return, the pause, that Sisyphus interests me. A face so close to stones is already stone. | C'est pendant ce retour, cette pause, que Sisyphe m'intéresse. Un visage qui peine si près des pierres est déjà pierre lui-même ! |
| 8 | 每当他离开山顶，他便高于自己的命运。他比他的巨石更强。 | Each time he leaves the summit, he is superior to his fate. He is stronger than his rock. | À chacun de ces instants, où il quitte les sommets et s'enfonce peu à peu vers les tanières des dieux, il est supérieur à son destin. Il est plus fort que son rocher. |
| 9 | 这神话之所以悲壮，是因为它的英雄有意识。 | If this myth is tragic, it is because its hero is conscious. | Si ce mythe est tragique, c'est que son héros est conscient. |
| 10 | 没有哪一种命运不能靠蔑视去战胜。 | There is no fate that cannot be surmounted by scorn. | Il n'est pas de destin qui ne se surmonte par le mépris. |
| 11 | 幸福与荒诞是同一片土地上的两个儿子，不可分离。 | Happiness and the absurd are two sons of the same earth. They are inseparable. | Le bonheur et l'absurde sont deux fils de la même terre. Ils sont inséparables. |
| 12 | 西西弗斯全部无声的欢乐就在于此：命运属于他，巨石也属于他。 | All Sisyphus's silent joy is there: his fate belongs to him, his rock is his own. | Toute la joie silencieuse de Sisyphe est là. Son destin lui appartient. Son rocher est sa chose. |
| 13 | 没有不带阴影的太阳，人必须认识黑夜。 | There is no sun without shadow, and one must know the night. | Il n'y a pas de soleil sans ombre, et il faut connaître la nuit. |
| 14 | 荒诞的人说「是」，他的努力从此不会停歇。 | The absurd man says yes, and his effort will never cease. | L'homme absurde dit oui et son effort n'aura plus de cesse. |
| 15 | 向着高处挣扎本身，就足以填满一个人的心。 | The struggle itself toward the heights is enough to fill a man's heart. | La lutte elle-même vers les sommets suffit à remplir un cœur d'homme. |
| 16 | 我们必须想象西西弗斯是幸福的。 | One must imagine Sisyphus happy. | Il faut imaginer Sisyphe heureux. |

下山字幕（实现：左侧山脚时在底部出现两行，先后为「他绕到了山的另一边」「石头在山脚等他」）：

> Le rocher roule encore. / 巨石仍在滚动。

### 笔记格式

标题：`幸福手册`（固定，runtime 会把它归到「来自 app」组）

```
2026年10月25日 · 第 3 次登顶

「向着高处挣扎本身，就足以填满一个人的心。」
“The struggle itself toward the heights is enough to fill a man's heart.”

—— 加缪《西西弗斯神话》
```

`PAD.notes.append("幸福手册", text)` 每次调用都会弹 runtime 自己的「写入 / 不写」对话框；这是有意的，不是打扰。返回 `"saved"` 时在卡片角落显示一个很小的「已写入」；`"denied"` 时什么都不说，让石头落下。

---

## 8. 技术方案

### 8.1 文件

```
registry/apps/sisyphus/
  manifest.json
  index.html            // bundle 后：lo-game + lopix12 子集 + 代码
  src/
    main.js             // 场景、输入、循环
    world.js            // 路径、镜头、地形
    art.js              // 抖动、精灵、石头、天空
    quotes.js           // 16 条语录 + 牌堆
    music.js            // MML
    sfx.js              // 音效配方
```

### 8.2 manifest

```json
{
  "spec": "lopda/1",
  "id": "sisyphus",
  "name": "西西弗斯",
  "glyph": "石",
  "category": "game",
  "version": "0.1.0",
  "description": "推石上山。它滚下去。再推。加缪的十六句话在山顶等你。",
  "i18n": { "en": { "name": "Sisyphus", "description": "Push the stone. It falls. Push again. Sixteen lines from Camus wait at the summit." } },
  "author": "…",
  "license": "MIT",
  "permissions": ["notes"],
  "buttons": true,
  "icon": [ "…16 行…" ]
}
```

### 8.3 画布与性能

- 用 `LoGame.create({ width: 160, height: 178, lang: "zh" })`；lo-game 负责缩放、按钮、场景、存档、字体。
- 每帧 160×178 = 28,480 像素。用 `g.rect` 画大块，用 `g.pixel` 画抖动和精灵；不要每帧重算整座山。
- 背景按「时间 + 天气」预计算成 run-length（每行同色的连续段），每帧只画可见窗口；动态层（云、尘、人、石）再画。
- 动画 6–12 fps，不要 60 fps 重绘细节；lo-game 的循环是 60 fps，但画面可以「定格」。
- 在 iPhone SE 上实测 60 fps；如果掉帧，先降低内部高度或把静态层缓存成更少的 run。
- 画面比例在 331×359 上接近满屏；在 346×518 / 386×606 上会上下留白。可以把留白做成纸色「装裱边」，加一条细线和小字标题，让 letterbox 看起来是故意的；或者改成按屏幕高度动态选择内部高度（更复杂，但可以全屏）。第一版建议固定 160×178 + 装裱边。

### 8.4 数据

```js
PAD.load("sisyphus") -> {
  summits: 3,
  seen: ["15", "3", "7"],
  deck: ["1", "2", ...],       // 当前牌堆
  weather: "wind",
  firstRun: false
}
```

- 只在登顶和语录选择时 `PAD.save`；不要每帧保存。
- 不存半山腰进度；app 关闭就回山脚。
- 256 KB 预算，这点数据连 1 KB 都不到。

### 8.5 输入

```js
var pushing = game.btn("a") || game.btn("b") || game.pointer.down;
```

- `START` 打开暂停菜单（继续 / 语录 / 关于）；菜单里 A 确认、B 返回，遵守 `sdk/UI.md`。
- `SELECT` 不用；不用为了用而用。
- 离开 app 是 HOME 的事，不要让 B 承担退出。

### 8.6 声音调用

- 场景进入时 `game.music(song)`；阶段变化时换曲（每秒最多 4 次，实际只用几次）。
- `game.ambience("wind", level)` 在阶段变化时调用，不要每帧。
- `game.sfx({...})` 在发力、脚步、脱手、落石、锣时调用；每秒最多 20 个。
- 山顶先 `game.musicStop()`，等 1.5 秒，再锣；不要用音乐盖住语录。

### 8.7 检查

```sh
node tools/bundle-app.mjs registry/apps/sisyphus
node tools/check-app.mjs registry/apps/sisyphus
node --test
```

- 新加的文字会改变字体子集，每次改文案都要重新 bundle。
- 用 `sdk/dev.html?app=registry/apps/sisyphus` 试按钮和音乐；用真机（HTTPS）试字号、音量、触摸和 notes 对话框。
- e2e / 截图测试可选；这个 app 的很多价值在观感，最终还是要用眼睛和耳朵验收。

---

## 9. 风险与待定

| 风险 | 说明 | 对策 |
|---|---|---|
| base64 采样 API 不存在 | 你记得的是设计稿 | 先用 `PAD.sfx`；真需要再做 `PAD.sample` 或 app 内 Web Audio |
| Web Audio 绕过音量 | 采样会在音量为 0 时还响 | 不用，或只在用户明确开启时用，并保持极轻 |
| 四声道不够「史诗」 | 音色薄 | 用结构、调式、静音和逆行；不要硬堆音符 |
| 160×178 在长屏上留白 | 画面不填满 | 装裱边 / 动态高度；第一版先固定，真机看效果 |
| 语录太长放不下 | 160×178 只有约 12 行 | 选短句、压缩英译；长句节选 |
| 字体缺字 | 生僻字会 fallback 到系统字体，变模糊 | 已检查 16 条中文；新增文案要再检查 |
| 版权 | 法文原作在法国/欧盟仍受保护到 2031；英译本有版权 | 短句 + 注明出处 + 自译；上架前再确认 |
| notes 对话框打断 | 每次按 A 都会弹 runtime 对话框 | 这是设计的一部分；冻结画面，处理 denied |
| 山峰/落石的方向 | 「另一边」在 2D 侧视里要交代清楚 | 他从右侧下去；抖动幕布绕过山体；山脚字幕「他绕到了山的另一边」「石头在山脚等他」 |
| 没有通关 | 有人会觉得「没内容」 | 这是作品的核心；用 16 条语录、天气、日循环和笔记提供长期意义 |

### 需要你拍板的 4 件事

1. **平台**：这是 Lo-PDA 商店 app，还是独立的网页艺术作品？如果是独立的，四色/芯片限制可以放开，画面和音乐可以完全是另一个量级。
2. **声音**：先用 `PAD.sfx` 的合成发力声，还是值得为真人录音去实现 `PAD.sample`？
3. **下山**：已定自动；他从右侧下去，抖动幕布绕过山体，回到左侧山脚。
4. **语录**：第一次登顶固定给最后一句，之后随机；还是从第一句开始完全随机？

---

## 10. 建议的实施顺序

1. **可玩原型（1–2 天）**：160×178，占位山体，按住推、松开滑、9 秒脱手、山顶语录卡、A 写笔记、B 继续、下山循环。先验证手感和节奏。
2. **美术 pass（3–5 天）**：手绘西西弗斯 6 帧、巨石 8–12 帧、山体 3 层、日循环、天气、山顶特写、落石镜头。用真机看四色的对比。
3. **音乐/音效（2–3 天）**：三首 MML、发力/脚步/落石/锣、风的层次；在山顶留 1.5 秒静音。
4. **内容与打磨（2–3 天）**：16 条语录、牌堆、笔记格式、画廊、关于页、标题页、语言、存档、异常处理。
5. **验收**：`check-app`、`node --test`、iPhone SE 真机、长屏、音量 0、静音键、锁屏、notes 拒绝、离线。

如果只做一件事，先做**原型里的山顶 10 秒**：石头在边缘摇晃、太阳在它后面、语录卡浮出来、按 A 弹出「写入 / 不写」。这 10 秒决定这件作品成不成立。
