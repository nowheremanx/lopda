# LPBasic：可行性研究（v2，兼容优先）

状态：**已搁置（2026-10-21）**。owner 评估后认为 GVBasic 资料太少、用户面窄，不再做 BASIC 解释器。本文保留作研究记录。
后续方向见 `docs/design/scripting.md`：用原生 JavaScript 跑本地脚本/本地程序，不做新语言。

---

研究稿 v2（2026-10-21）。v1 曾建议从零做一套结构化 BASIC；owner 提出“直接兼容 GVBasic，再加 LP 扩展，主打怀旧”，并指向
`arucil/wqxtools` 的 `gvb_interp`。研究后改变结论：**兼容路线更好，而且技术上比想象中更可行**。本文是修正后的方案。

结论先说：

- **做 GVBasic 超集，不从零造语言。** 旧的 GVBasic 程序直接跑；新增能力用 `LP_*`、`VSYNC`、`SPRITE`、触摸、音乐等扩展。
- **不要用 JS 重写 `gvb_interp`。** 它是 Rust，已经自带 AST、字节码编译器和 VM；正确做法是编译成 WASM，外面包一层 LP host。
- 我在本机做了验证：385 个 Rust 测试全过；`wasm32-unknown-unknown` 能编译；wasm-bindgen 后 wasm 约 1.0 MB（gzip 约 441 KB）；
  在 headless Chromium 里成功跑了 `PRINT`、`GRAPH/LINE`、`INKEY$`，也把仓库里几个真实 GVBasic 游戏加载并跑到了 `SLEEP`。
- 代价是 spec 要完整描述 GVBasic 的旧语义（行号、1-based 数组、`%/$`、MBF5 浮点、文件模式、机型差异），并且要维护一个 Rust fork。
  这比“另造一套干净语言”更难写文档，但换来全部老程序和怀旧卖点，值得。

## 1. 为什么改主意

v1 的出发点是“agent 看 spec 就会写”，于是想把行号、GOTO、`%/$` 都去掉。这个目标本身没错，但它把“语言现代”误当成了“spec 好”。

实际上：

- 行号对 agent 不是难点。`10 20 30` 是简单的机械规则，spec 写清楚、示例给够，agent 不会写错。
- GOTO 才是难点，但 GVBasic 已经有 `FOR/NEXT`、`WHILE/WEND`、`IF/THEN/ELSE`、`GOSUB`。新程序可以只用这些，把 GOTO 留给旧程序。
- 旧程序的生态价值远大于语法洁癖。文曲星的怀旧感，很大一部分就是“把当年的 `.bas` 找回来，居然还能跑”。
- 从零做一套新 BASIC，功能数量并不会比“GVBasic + 扩展”多多少，却要重新实现所有旧语义；如果旧程序跑不了，怀旧卖点就没了。

所以定位改成：

> **LPBasic = 能跑 GVBasic 的掌机 BASIC + 一套 LP 时代的新扩展。**

“spec 更好”体现在：完整、准确、可执行、可检查，而不是“语法必须像 Python”。

## 2. 研究对象：`gvb_interp` 的真实情况

它不是 C 解释器，而是 Rust 项目，结构比“移植一个 C 解释器”更合适：

```
gvb_interp/
  src/parser/        手写解析器，带错误恢复和诊断
  src/compiler.rs    AST -> 字节码
  src/vm.rs          栈式 VM；exec(input, steps) 可按指令数暂停/恢复
  src/device/        设备抽象：160x80 单色屏、20x5 文本、按键、文件、6502 CALL
  machines.yaml      tc808 / pc1000a / nc1020 / nc3000 的机型差异
  data/              8x8/16x16 字体、GB2312 表、文曲星图形符号
  tests/             385 个测试，含快照、文件、表达式、错误
```

关键点：

- **已经是字节码 VM**，不需要“再移植到字节码”。`VirtualMachine::exec(input, steps)` 每次执行有限条指令后返回 `Continue`/`InKey`/`Sleep`/`KeyboardInput`/`Error`/`End`，正好适合 `requestAnimationFrame` 分片。
- **设备是 trait**（`Device`），屏幕、按键、文件、声音、6502 都是接口；这意味着可以在 WASM 外面实现一个 LP host，而不改 VM 主体。
- **MIT 许可**，可以 vendor、修改、再发布；但仓库里的 `examples/bas` 是别人的游戏，**不能随项目分发**（详见第 6 节）。
- 默认设备是 **160×80 单色屏、20×5 文本、16px 汉字**，不是 LP 的 160×144 四色。兼容模式应保留 160×80，按 2 倍或 1.5 倍放大；新扩展可以再提供 160×144 四色模式。
- 需要为浏览器补的洞：`std::fs` 文件 I/O、`chrono::Local` 的本地时间、`std::time`、GBK/UTF-8 文本、wasm-bindgen 包装。这些是工程量，不是不可行。

### 2.1 本机验证结果

| 验证 | 结果 |
|---|---|
| `cargo test -p gvb_interp` | **385 passed, 0 failed** |
| `cargo check --target wasm32-unknown-unknown -p gvb_interp` | 通过（需给 `getrandom` 开 `js`、给 `nanorand` 开 `getrandom`） |
| wasm-bindgen 产物 | 约 1.0 MB wasm，gzip 约 441 KB |
| 浏览器 smoke：`10 PRINT "HI"` | `End`，屏幕有 61 个黑像素 |
| 浏览器 smoke：`GRAPH` + `LINE` + `INKEY$` | 收到按键后 `End`，160 个黑像素 |
| 仓库示例语料 | 58/61 个 `.bas`/`.txt` 通过解析和编译；另外 3 个是中文说明文本，不是程序 |
| 真实游戏启动 | `打砖块.BAS`、`五子棋.BAS`、`小爬虫.BAS` 能加载、运行到 `SLEEP` 并渲染画面 |

这不是“完整兼容证明”，但足以说明方向可行。下一步要用干净、可分发的测试语料做回归，而不是把仓库里的商业游戏放进 CI。

## 3. 功能数量：到底多多少

先给数字。GVBasic 语言层（不含 `RUN/LIST/NEW/EDIT` 这类编辑命令）大约 **70 个命令/函数**（帮助文档列了 27 个函数 + 45 个语句，有重叠）。

`gvb_interp` 在 GVBasic 之上已经加了一批扩展（`DESIGN.md` / `TODO.md`）：

- `SLEEP`
- `POINT(x,y)`
- `CHECKKEY(key)`
- `BINARY` 文件模式
- `FOPEN`、`FGETC`、`FTELL`
- `FPUTC`、`FREAD`、`FWRITE`、`FSEEK`

即 **+11 个左右**。

LPBasic 第一版再计划加：

| 类别 | 新增 |
|---|---|
| 帧/画面 | `VSYNC`、`SCREEN`/`TONE`（四色扩展，可选） |
| 精灵/碰撞 | `DEFSPRITE`、`SPRITE`、`HIT` |
| 触摸 | `TOUCHX`、`TOUCHY`、`TOUCHDOWN`、`TOUCHPRESS` |
| 声音 | `SFX`、`MUSIC`、`AMBIENCE` |
| LP 系统 | `LP_SAY`、`LP_SAVE`、`LP_LOAD`、`LP_HAS`、`LP_DELETE`、`LP_LANG$`、`LP_TIME$`、`LP_DATE$`、`LP_NOW`、`LP_EXIT`、`LP_KEEPON` |
| 第二代 | `LP_NOTE`、`LP_SNAP`、`LP_TILT`、`LP_SHAKE`、`LP_MIC`（轮询标志，不用 Promise） |

第一版约 **+25 个**，加上 `gvb_interp` 已有的 +11，合计比原版 GVBasic 多 **约 35 个命令/函数**。按 70 个基数算，关键字层面约 **+50%**。

但不要被这个数字骗了：

- 其中不少是同一能力的不同函数（触摸 4 个、LP 时间 3 个），**真正的新能力类别约 8-10 类**：双缓冲/帧同步、精灵与碰撞、触摸、四色/更大画面、现代声音与音乐、LP 存档/系统 API、语音、虚拟文件系统、更好的诊断/工具。
- 上一版“从零设计”的 LPBasic 大约 85-95 个命令/函数；和兼容路线差不多，却丢掉全部旧程序。**在功能覆盖上，兼容路线严格更优**。
- 兼容路线多出来的不是“命令数”，而是 **旧语义的复杂度**：行号、1-based 数组、`%/$`、16 位整数、MBF5 实数、255 字符字符串、记录式文件、机型 PEEK/POKE。这些东西必须写进 spec，但不必让新程序使用。

一句话回答：**关键字大约多 35 个（+50%），真正的新能力约 10 类；更重要的是老的 70 个一个不少。**

## 4. 架构：WASM 复用 + LP host

```
runtime/vendor/gvb_interp/
  gvb_interp.js / gvb_interp_bg.wasm     wasm-bindgen 产物（MIT，附 LICENSE）
  LICENSE
runtime/apps/basic.js                    内置程序：脚本库、编辑器、运行页、虚拟键盘、文件
runtime/gvbhost.js                       LP host：屏幕、按键、触摸、声音、存档、时间、LP_*
tools/gvbcheck.mjs                       Node 检查器/无头运行器（wasm 或 native 均可）
sdk/GVBASIC.md                           兼容规范（旧语义）
sdk/LPBASIC-EXT.md                       扩展规范（新能力）
sdk/PROMPT-LPBASIC.md                    给 agent 的写作提示
sdk/examples/basic/                      原创示例，不是仓库里的商业游戏
tests/gvbinterp.test.mjs                 编译/运行/屏幕/扩展/兼容语料
```

为什么用 WASM，而不是 JS 重写：

- Rust 源码约 2.2 万行，含解析器、编译器、VM、四种机型、6502 模拟；逐行翻译成 JS 的工作量和出错概率都不可接受。
- WASM 把 VM、6502、内存都隔离在沙箱里；JS 只提供 host，反而比在主页面跑 JS 解释器更安全。
- `exec(input, steps)` 天然分片，不会长时间卡住 UI；`requestAnimationFrame` 每次给固定指令预算。
- 仓库已经有先例：`runtime/vendor/binjgb/` 就是预编译的 MIT WASM + JS 胶水，`sw.js` 缓存；GVBASIC 可以照同样的方式 vendor。
- 构建成本：需要一个 Rust 工具链和 `wasm-bindgen`，但**运行时不需要构建**；CI 可以只校验预编译产物的 hash，或者在有 Rust 的 job 里重建。

Host 接口（JS 实现，WASM 调用）：

```js
host = {
  present(bitmap160x80, dirty),        // 单色位图，放大到 LP 屏幕
  keyDown(code), keyUp(code),          // 文曲星键码
  touch(),                             // 触摸状态（扩展）
  beep(), playNotes(bytes),            // 原有 BEEP/PLAY
  sfx(name), music(mml, loop), ambience(name, level),
  save(key, value), load(key), has(key), remove(key),
  say(text), lang(), now(), exit(), keepAwake(on),
  sleep(ms),                           // SLEEP 由 host 调度，不阻塞 VM
  fileRead(name), fileWrite(name, bytes), // 虚拟文件系统
}
```

内置 UI 负责：

- 脚本库（`.bas` / `.txt`，名字、更新时间、大小）；
- 编辑器（行号、等宽字体、语法诊断、运行、自动编号）；
- 运行页（160×80 画面居中放大，2× = 320×160；状态栏；屏幕常亮）；
- 文曲星虚拟键盘（10×5，覆盖层；`INPUT` 时自动弹出）；
- 下巴按键映射：方向键对应方向，A=输入/Enter，B=跳出/Esc，START=F1，SELECT=F2；字母/数字用虚拟键盘；
- 文件导入/导出、虚拟文件系统管理、`.bas` 二进制与 `.txt` 文本互转；
- 兼容性报告：检测机型、警告“这个程序用到了 PEEK/POKE/CALL/文件”。

### 4.1 画面

- 兼容模式固定 **160×80 单色**，按 2 倍渲染到 320×160，居中放在 160×144 的 LP 逻辑屏里；上下留边，不拉伸。
- 黑色=INK，白色=PAPER；可选把“白”映射成 MID 做绿色 LCD 味道，但默认保持单色，避免旧程序看起来变色。
- `GRAPH`、`TEXT`、`INVERSE`、`FLASH` 都由设备层处理；`PRINT` 的 20×5 文本格保持原样。
- 新扩展可以开 **160×144 四色模式**（`SCREEN 1`），但旧程序默认 `SCREEN 0`，互不影响。

### 4.2 输入

这是兼容性最容易被低估的部分。GVBasic 程序不只用方向键和 Enter，还会用字母、数字、F1-F4、跳出、输入法、符号键。

方案：

- 下巴按键只映射最常用的 8 个：方向、A=Enter、B=Esc、START=F1、SELECT=F2。
- 运行页有一个“键盘”按钮，打开 10×5 的文曲星键盘覆盖层；点按发送对应键码，支持按住。
- `INPUT` 语句返回 `KeyboardInput` 时，UI 打开底部输入面板，按字段显示字符串/整数/实数，提交后把值送回 VM。
- `INKEY$`/`CHECKKEY` 直接读设备按键状态；覆盖层和下巴按键都走同一套 `fire_key_down/up`。
- 旧程序如果依赖“跳出”退出，B 映射为 Esc；HOME 仍然是退出程序，不混用。

### 4.3 文件

- 每个脚本一个虚拟目录：`Map<name, Uint8Array>`，从 `LopdaPlatform` 文档/文件库预加载到内存；`OPEN/CLOSE/GET/PUT` 在内存里同步执行，`CLOSE` 或程序结束时异步写回。
- 导入 `.bas` 时，如果它是安装型程序（例如“安装A/安装B”），把同目录的 `.txt`/`.BAS` 数据文件一起导入虚拟目录；UI 显示文件列表。
- 文件大小上限（例如单脚本 2 MB）和文件数量上限（例如 32 个），防止旧程序写爆。
- 导出：虚拟目录打包为 `.zip` 或逐个文件分享；`.bas` 可直接导出。
- 文本编码：导入 `.txt` 先按 GBK 解码（`TextDecoder("gbk")`），编辑用 Unicode；编译前转成 VM 需要的 UTF-16/GB2312。建议给 Rust 加一个 `load_utf8` 入口，避免在 JS 里做 GBK 编码。

### 4.4 声音

- `BEEP` → `PAD.sfx("tick")` 或一个短音。
- `PLAY` 的音符字节 → 现有 `chip.js` 的方波通道；`PLAY` 是阻塞还是非阻塞要与原机一致（通常是边播边继续，需实测）。
- 新扩展 `SFX`/`MUSIC`/`AMBIENCE` 直接调 `chip.js`；音乐必须是原创或公共领域，和现有仓库规则一致。
- 旧游戏的音乐是用户文件里的，平台不随包分发；审核/分享时不收录。

### 4.5 时间、随机、机型

- `SLEEP` 按 `machines.yaml` 的 `sleep-unit` 换算成毫秒；host 用 `setTimeout` 或下一帧恢复，不阻塞 JS。
- `PEEK` 时间地址、`RND`、`RANDOMIZE` 由设备/VM 提供；`chrono::Local` 在 WASM 里不可用，改成 host 注入的本地时间。
- 机型：默认按文件头/图形符号自动检测；UI 允许手动选 `PC1000A` / `TC808` / `NC1020` / `NC3000`。不同机型的 PEEK/POKE、按键、EOF 行为不同，兼容性报告要写清楚。
- `CALL` 6502：`emulator_6502` 已在依赖里；WASM 内执行，安全。需要测试使用 `CALL` 的游戏。

## 5. 扩展语言怎么加

原则：**扩展不改变旧行为；旧程序不写新关键字就完全按 GVBasic 跑。**

### 5.1 新关键字

直接在 Rust 的 parser/compiler/VM 里加，保持行号语法：

```basic
10 REM 新程序也可以只用 WHILE/GOSUB，不写 GOTO
20 CLS
30 VSYNC
40 SPRITE 1, 80, 40
50 IF TOUCHPRESS THEN GOSUB 1000
60 GOTO 30
1000 LP_SAY "HELLO"
1010 RETURN
```

为什么不用 `LP.SAY` 这种点号：GVBasic 的词法/关键字表是按空格分隔的，`LP_SAY` 最省事，也和 `INKEY$`/`STR$` 的风格一致。spec 里统一大写。现有 lexer 的标识符不允许 `_`，需要加一条“下划线属于标识符”的规则；旧程序里没有下划线变量，不会冲突。

### 5.2 四色和 160×144

- 默认 `SCREEN 0`：160×80 单色，旧程序不变。
- `SCREEN 1`：160×144 四色；`TONE c` 设置当前绘画色（0-3），`CLS [c]`；旧的 `DRAW/LINE/BOX/CIRCLE/ELLIPSE` 使用当前色。
- `POINT(x,y)` 在单色模式返回 0/1；四色模式返回 0-3。旧程序不受影响。
- `VSYNC` 在两种模式下都表示“呈现这一帧并等待下一帧”；旧程序不调用它也能跑，只是画面按原机节奏刷新。

### 5.3 精灵和碰撞

```basic
10 DEFSPRITE 1, 8, 8, "..0000....000000..033330..033330..000000..000000..."
20 SPRITE 1, 40, 30
30 IF HIT(40,30,8,8, x,y,8,8) THEN ...
```

- `DEFSPRITE id,w,h,data`：`data` 每像素一个字符，`0-3` 色调，`.` 透明；长度必须是 `w*h`。
- `SPRITE id,x,y[,flip]`：原生 blit，不做逐像素 BASIC 循环。
- `HIT(x1,y1,w1,h1,x2,y2,w2,h2)`：矩形碰撞，返回 1/0。
- 旧的 `GET/PUT` 文件记录语义保持不变；精灵是新名字，不冲突。

### 5.4 LP API

| 扩展 | 作用 | 实现 |
|---|---|---|
| `LP_SAVE key, value` | 写本脚本存档 | 内存缓存 + 异步写 `basic/state/<id>` |
| `LP_LOAD(key[, default])` | 读存档 | 启动时预加载，同步返回 |
| `LP_HAS(key)` / `LP_DELETE key` | 查询/删除 | 同上 |
| `LP_LANG$` | `"zh"` / `"en"` | host |
| `LP_TIME$` / `LP_DATE$` / `LP_NOW` | 时间 | host |
| `LP_SAY text` | 系统语音，不等待 | `LP.speech` / `PAD.say` |
| `LP_EXIT` | 回脚本库 | UI |
| `LP_KEEPON on` | 屏幕常亮 | `LP.keepAwake` |
| `SFX name` / `MUSIC mml[,loop]` / `AMBIENCE name[,level]` | 声音 | `chip.js` |
| `TOUCHX/Y/DOWN/PRESS` | 触摸 | host |
| `LP_NOTE` / `LP_SNAP` / `LP_TILT` / `LP_SHAKE` / `LP_MIC` | 第二代 | 轮询标志，不用 Promise |

所有扩展都要在 spec 里写清“旧程序不调用时行为不变”。

### 5.5 是否加“现代语法”

可以作为第二阶段的可选前端：

- 行号自动编号（编辑器/`gvbcheck --number`），让作者不手写 10/20/30；
- `IF ... THEN ... ENDIF`、`SUB ... END SUB` 等语法糖，翻译成行号 + `GOTO/GOSUB`；
- 但**不改变 VM 和旧程序**，只是源码前端。

第一版不做。它能改善写作体验，但不是兼容性的必要条件；先把“旧程序能跑 + 新 API 能用”做扎实。

## 6. 兼容性的边界和风险

### 6.1 能承诺什么

目标不是“100% 所有程序”，而是：

- **语法和常用语义全部兼容**：行号、`GOTO/GOSUB`、`FOR/NEXT`、`WHILE/WEND`、`IF/THEN/ELSE`、`DATA/READ/RESTORE`、`DIM`、`DEF FN`、`ON...GOTO`、字符串/数组/文件、`BEEP/PLAY`、`DRAW/LINE/BOX/CIRCLE/ELLIPSE`、`PEEK/POKE`、`CALL`。
- **常见机型**的按键、屏幕、时间、EOF 差异可用配置切换。
- **文件型游戏**通过虚拟文件系统跑；安装型程序可以导入多个文件。
- **逐项报告**不兼容：不支持的 `CALL` 中断、未知机型、超大文件、缺失数据文件，在加载时给出明确提示，而不是黑屏。

### 6.2 已知风险

| 风险 | 说明 | 处理 |
|---|---|---|
| 版权 | 仓库 `examples/bas` 是别人的商业/同人游戏，不能随 LP 分发 | 只做本地测试语料；产品内置原创示例；用户自己导入的文件自己负责 |
| 字体/图形数据 | `data/*.dat` 可能来自文曲星 ROM，MIT 只覆盖代码，不当然覆盖字体 | 用 OFL 字体生成 16×16 字模；文曲星图形符号重绘或省略；在 LICENSING 里写清 |
| 机型差异 | PC1000A/TC808 的 PEEK/POKE、EOF、按键不同 | `machines.yaml` 配置 + UI 选择 + 兼容性报告 |
| 文件 I/O | `std::fs` 在 WASM 不可用 | 虚拟 FS，预加载/写回；单文件大小上限 |
| 文本编码 | `.txt` 常是 GBK，编辑器是 Unicode | `TextDecoder("gbk")` 读；Rust 加 UTF-8 入口；导出可选 GBK/UTF-8 |
| 虚拟键盘 | 旧游戏可能用任意字母/数字 | 10×5 覆盖键盘 + `INPUT` 面板；下巴按键只做常用映射 |
| Rust fork | 扩展要改 parser/compiler/VM | vendor + 补丁集；预编译 wasm；CI 校验；MIT 合规 |
| WASM 体积 | 约 1 MB，gzip 441 KB | 可接受；离线缓存；必要时 `opt-level=z`/裁剪未用机型 |
| 性能 | 6502 CALL、复杂游戏可能慢 | 指令预算/帧；真机基准；必要时 JIT 不现实，先测 |
| 时间 | `chrono::Local` 在 WASM 不可用 | host 注入本地时间；避免 panic |

### 6.3 “所有 GVBasic 程序都能跑”这句话怎么对外说

建议说：

> 兼容 GVBasic 的语法和绝大多数程序；内置兼容性检查和报告，遇到不支持的机型特性会明确告诉你。

不要说“100%”。旧程序里总会有依赖未公开硬件行为、特定 ROM 版本、计时循环的个例；承诺 100% 会带来无穷的 issue。

## 7. Spec 和工具：让 agent 会写

兼容路线下，spec 分成两层：

1. **`sdk/GVBASIC.md` — 兼容规范**
   - 行号、语句顺序、`GOTO/GOSUB`、1-based 数组、`%/$`、16 位整数、MBF5 实数、255 字符字符串；
   - `PRINT` 的 `;`/`,`、`LOCATE` 20×5、`TEXT/GRAPH`、`DRAW/LINE/BOX/CIRCLE/ELLIPSE`；
   - `OPEN/CLOSE/WRITE/FIELD/GET/PUT/LSET/RSET` 的模式和记录语义；
   - `PEEK/POKE` 的机型地址、`CALL` 的限制、`EOF` 的机型差异；
   - 错误信息和错误行定位；
   - 与 GVBasic 的已知差异（如果有）。
2. **`sdk/LPBASIC-EXT.md` — 扩展规范**
   - `VSYNC`、`SPRITE`、`HIT`、触摸、`SCREEN 1`、`TONE`；
   - `LP_*` 的签名、返回值、失败行为；
   - 音效/音乐/环境音；
   - 推荐的新程序写法：仍然写行号，但用 `WHILE`、`GOSUB`、`IF/THEN/ELSE`，不写 GOTO（除非旧程序）。
3. **`sdk/PROMPT-LPBASIC.md`**
   - 一段可直接粘给 AI 的提示：输出 `.bas`，每行 10/20/30，使用哪些扩展，屏幕 160×80，如何用 `gvbcheck` 检查。
4. **`tools/gvbcheck.mjs`**
   - `--check file.bas`：解析/编译，输出 JSON 诊断（行、列、错误码、人话）；
   - `--run file.bas`：无头运行，模拟按键，输出 `PRINT`/屏幕 hash；
   - `--number`：给没有行号的草稿自动编号；
   - `--compat`：列出用到的机型特性/文件/`CALL`，给兼容性报告。
5. **示例**
   - 只放原创程序：Hello、精灵小游戏、音乐、存档、文件读写；
   - spec 里的代码块由 CI 抽出来跑，防止文档漂移；
   - 商业游戏只作为本地兼容测试，不进仓库。

这套东西仍然能满足“agent 一看 spec 就会写”：不是靠去掉行号，而是靠**完整、准确、可检查**。

## 8. 实施计划

### Phase 0：WASM 桥 + 最小可跑（3-5 天）

- vendor `gvb_interp`，编译 wasm，写 JS host：`present`、按键、`PRINT`、`SLEEP`、`INKEY$`。
- 在浏览器里跑 3 个自写的小程序 + 1 个真实游戏（本地测试，不提交）。
- 真机 iPhone SE 测试：2× 放大、按键延迟、帧率。
- 门槛：160×80 画面 60 fps；`INKEY$` 循环不卡 UI；wasm 加载 < 2 s（本地/缓存后）。

### Phase 1：兼容层补完（1-2 周）

- 虚拟文件系统、GBK/UTF-8、`INPUT` 面板、10×5 键盘、机型选择、兼容性报告。
- `CALL` 6502、`PEEK/POKE` 时间、`PLAY/BEEP`、`SLEEP` 调度。
- 脚本库/编辑器/导入导出/自动编号。
- 用自写语料覆盖每条语句；用本地商业游戏做回归（不提交）。

### Phase 2：LP 扩展（1-2 周）

- `VSYNC`、`SPRITE`/`DEFSPRITE`/`HIT`、触摸、`SCREEN 1`/`TONE`。
- `LP_SAVE/LOAD/HAS/DELETE/LANG/TIME/DATE/NOW/SAY/EXIT/KEEPON`。
- `SFX/MUSIC/AMBIENCE`。
- 扩展 spec + 原创示例 + agent prompt。

### Phase 3：打磨和二代 API（1 周）

- `LP_NOTE/SNAP/TILT/SHAKE/MIC`（轮询标志）。
- 错误报告、性能、手机键盘体验、截图对比、e2e。
- LICENSING/NOTICE、构建脚本、hash 校验、sw 缓存。

### 工作量

| 部分 | 时间 |
|---|---:|
| WASM 桥 + host + 最小运行 | 3-5 天 |
| 兼容层（文件/输入/机型/CALL） | 1-2 周 |
| 内置 UI（库/编辑器/运行/键盘） | 1-2 周 |
| LP 扩展（Rust + JS + spec） | 1-2 周 |
| 测试/真机/文档 | 1 周 |
| 合计 | 4-6 周（单人，熟悉代码） |

比 v1 的“从零 LPBasic”多了一个 Rust 构建/维护成本，但省掉了重新实现 GVBasic 语义的成本，并且直接获得旧程序生态。总体更划算。

## 9. 需要 owner 拍板

1. **接受“GVBasic 超集”定位**，不再追求从零的结构化 LPBasic。我的建议：接受。
2. **接受 160×80 单色兼容模式**，新扩展另开 160×144 四色模式。旧游戏不重排、不重绘。
3. **扩展关键字用 `LP_` 前缀**（`LP_SAVE`、`LP_SAY`），不引入点号/对象语法。这样 parser 改动最小，spec 也好读。
4. **第一版是否包含虚拟文件系统和虚拟键盘**。我建议包含：没有它们，文件型游戏和字母键游戏跑不起来，“所有程序都能跑”会落空。
5. **是否允许随包分发旧游戏**。我的建议：不允许；只允许用户导入，内置示例全部原创。仓库里的 `examples/bas` 不能进产品。
6. **Rust fork 的维护方式**：vendor 预编译 wasm + 补丁集，CI 重建校验；还是只保留 wasm，不保留源码。建议两者都留（源码 2 MB，许可证清晰）。

## 10. 验收门槛

- 自写兼容语料：每条 GVBasic 语句至少一个测试；错误定位到行/列。
- 本地商业游戏回归：至少 10 个不同作者/类型的游戏能启动、响应按键、进入游戏；记录不兼容项。
- 文件型游戏：安装 + 运行 + 存档 + 重开，虚拟文件内容一致。
- `CALL` 6502 游戏至少 2 个可跑。
- 扩展：精灵 + 触摸 + 音乐 + 存档的原创小游戏 60 fps。
- iPhone SE 上 wasm 加载、运行、键盘、INPUT 不卡死；HOME 退出后音频/语音停止。
- `node --test`、e2e、`check-app` 全绿；`sw.js` 缓存 wasm；LICENSING/NOTICE 完整。
- 一个只读过两份 spec 的 agent，能在 30 分钟内写一个通过 `gvbcheck` 的 GVBasic + 扩展小程序。

## 11. 参考

- `arucil/wqxtools`：https://github.com/arucil/wqxtools
- `gvb_interp`：https://github.com/arucil/wqxtools/tree/master/gvb_interp
- GVBASIC（中文维基）：https://zh.wikipedia.org/zh-hans/GVBASIC
- GVBASIC 帮助：https://github.com/fancyblock/GVBASIC/blob/master/GV-BASIC%E5%B8%AE%E5%8A%A9.md
- 现有 WASM 先例：`runtime/vendor/binjgb/`
- 现有游戏框架：`sdk/LO-GAME.md`
- 存储/备份：`runtime/platform.js`、`runtime/backup.js`
