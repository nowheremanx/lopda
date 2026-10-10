# Handoff：RPG 技术展示「镇妖塔·外传」

给 cloud 上的 Claude Code 主 session 读。先读 `CLAUDE.md` 和 `docs/decisions.md`，本文件只写增量。
本文件的决定已经由 owner（Haowei）确认（2026-10-08）。

## 0. 目标

做一个 20–30 分钟的原创 RPG 支线，用来展示 Lo-PDA 的能力：**画面仍然是 160×144 四色，但效果的复杂度对标 GBA《黄金太阳》**
（战斗镜头环绕、长段法术动画、召唤级大招、场景光影）。
游戏机制刻意保持简单：玩的人只会玩一遍，看的是演出。

设定上的解释：这盘卡带「内置 LX-3D 协处理器」（类比 1993 年 Super FX 芯片）。开机画面和商店简介里要写这句。
机身本身不变，其他 app 不受影响。

## 1. 不做的事（硬约束）

- 不改画面限制：只有四个色调，分辨率用 lo-game 默认 160×144。所有"透明、发光、模糊"都用 dither 和图案表达。
- 不加游戏机制：没有职业、没有装备栏、没有场景谜题技能、没有破防/蓄力系统、没有多主角。
- 不用他人 IP：《黄金太阳》《八方旅人》《伏魔记》等只作为效果参照，名字、角色、剧情、画面一概不借用。
- 不加背景音乐：`PAD.music` 还没定，以后单独做。只用 `PAD.sfx`。
- 不改 runtime（`runtime/`）。本任务只动 `sdk/`、`tools/`、`registry/`、`tests/`、`.github/`、`SPEC.md`、`CONTRIBUTING.md`、`CLAUDE.md`、`docs/`。
- 不 push main。每个阶段一个分支、一个 PR，owner 审后合并。

## 2. 游戏内容

- **题材**：原创仙侠。镇妖塔下的小镇，塔中封印松动，主角（一名年轻的守塔弟子）上塔查看。
- **规模**：1 个主角；2–3 张地图（小镇、塔外山道、塔内）；普通遇敌若干；1 个 boss。流程 20–30 分钟。
- **文本**：只做中文。商店名称和简介中英双语（manifest `i18n.en`）。每行最多约 13 个汉字，台词要短，像文曲星。
- **战斗**（全部机制）：
  - 回合制，主角 1 人对敌人 1–3 个。
  - 指令：攻击 / 法术 / 物品 / 防御 / 逃跑。
  - 五行属性：每个敌人有一个弱点，打中弱点伤害加倍并有特殊命中特效。这是唯一的额外机制。
  - 法术 5–6 个（每个五行一个，加一个大招）。物品 2–3 种。等级随流程自动成长，没有加点。
  - 难度：不需要刷级就能通关；boss 需要用到弱点。
- **存档**：`PAD.save`，在存档点保存。

## 3. 展示效果清单（验收看这些）

场景（"HD-2D" 的四色版本）：
- 低多边形 3D 场景，固定斜俯视角，镜头跟随，过场时可以移动。
- 角色和 NPC 是 billboard sprite，和场景一起做 z-buffer 遮挡。
- 动态光源：火把/灯笼闪烁，按像素算光照后 dither 成四色。
- 远景雾化、景深（近景远景用更粗的 dither）。
- 天气：至少雨或雪一种；塔外山道有。

战斗（"黄金太阳" 的部分）：
- 3D 战斗场地，选目标和施法时镜头环绕、推近。
- 每个法术 2–4 秒动画：粒子、闪光（四色反相）、屏幕震动、逐行扭曲（raster wave）、缩放。
- 大招 5–8 秒，演出级别最高。
- 进入战斗的转场效果。
- 打中弱点有专门的命中效果。

性能：iPhone Safari 上稳定 60fps（Chromium 里测到的帧时间要留余量，目标每帧 < 8ms）。

## 4. 技术方案

### 4.1 体积上限
- app 的 `index.html` 上限从 200 KB 改为 512 KB，对所有 app 统一适用。改 `tools/check-app.mjs`、`SPEC.md`、`CLAUDE.md`、相关测试。runtime 不检查体积，不用改。

### 4.2 源码分文件，分发仍是单文件
- 为了让 agent 改台词时不必读整个大 HTML：app 可以有 `src/` 目录，`index.html` 里写
  `<script data-src="src/battle.js"></script>`，由新工具 `tools/bundle-app.mjs` 把文件内容填进去（和 `lo-game.mjs` 填框架的做法一样）。
- 剧本放在 `src/` 下的数据文件里（JS 对象或 JSON），不要和逻辑混在一起。
- `check-app.mjs`：如果 app 有 `src/`，检查 `index.html` 和重新打包的结果一致，否则报错。审核者只需看 `src/`。
- 写进 SPEC 和 `CONTRIBUTING.md`。

### 4.3 部署（GitHub Pages）
- owner 需要在 iPhone 上验收，所以 P1 先做部署。
- 写一个 GitHub Actions workflow，发布到 `gh-pages` 分支（不引入第三方 action 也可以，用 git 命令推送；用第三方 action 的话要是宽松许可、并固定到 commit hash）：
  - push 到 `main`：发布到站点根目录，即 `https://nowheremanx.github.io/lopda/runtime/`。
  - PR（同一个 repo 的分支）：发布到 `pr/<编号>/`，并在 PR 里留言给出预览链接；PR 关闭后删除该目录。
- 发布内容是 repo 根目录（runtime 通过 `../sdk`、`../registry` 加载），排除 `node_modules`、`tests`、`_to_delete`、`.github`。
- 注意：预览和正式站点是同一个 origin（`nowheremanx.github.io`），IndexedDB 是共享的。所以 PR 预览链接**只给 `sdk/dev.html?app=registry/apps/<id>`**（它把存档放在 localStorage，不碰掌机本体的数据），不要引导 owner 在预览路径下打开 `runtime/`。
- 开启 Pages、给 Actions 写权限需要 owner 在 GitHub 设置里操作：在 PR 描述里列出具体步骤，不要假设已经开启。
- 在 `docs/decisions.md` 第 10 节把「部署」从〔提议〕改为已定，并写上上面关于共享 origin 的注意事项。

### 4.4 `sdk/lo-3d.js`（新的可选模块）
- 不并入 `lo-game.js`：lo-game 会复制进每个游戏，2D 游戏不应该背上 3D 的体积。
- 机制和 lo-game 一样：`<script data-lo-3d="1.0.0"></script>` 空块，由工具填入；`sdk/lo-3d.versions.json` 记录已发布的 hash；检查器只接受未修改的已发布版本。可以扩展 `tools/lo-game.mjs` 一并处理，或者另写一个工具，自己选，理由写进 PR。
- 内容：软件光栅化、z-buffer、billboard、点光源、雾、Bayer dither 输出到 lo-game 的 0–3 缓冲区。起点是 `registry/apps/vector-dream` 里已有的渲染代码。
- 战斗特效需要的通用部分（粒子、raster wave、反相、震动）如果放进 lo-3d 或 lo-game，要说明为什么通用；只有本游戏用的留在游戏里。
- RPG 逻辑（战斗、物品、遇敌）**留在游戏里，不进 framework**。
- 写 `sdk/LO-3D.md`，风格同 `LO-GAME.md`。
- 把 VecDream 改成用 lo-3d，验证 API；VecDream 的画面不应变化。

## 5. 分阶段（每阶段结束：开 PR，停下来等 owner）

| 阶段 | 内容 | 验收 |
|---|---|---|
| P1 | 4.3 部署（先做）、4.1 体积上限、4.2 打包工具、4.4 lo-3d、VecDream 迁移；游戏骨架 + 一个可走动的小镇场景（光源、雾、billboard 角色） | 全部测试通过；PR 里附截图/GIF 和预览链接；owner 在 iPhone 上看小镇场景是否清晰、流畅 |
| P2 | 战斗系统 + 全部法术和大招特效 + 战斗模拟器（battle simulator，Node 里跑，验证难度：不刷级可通关、boss 需要弱点） | 测试通过；模拟器报告附在 PR 里；每个法术的 GIF |
| P3 | 剧情、地图、NPC、boss、存档、结局 | 能从头玩到结局的 e2e 测试（脚本按键走完全程）；owner 试玩 |

P1 不通过（例如四色 3D 在小屏上看不清），停在 P1 修改，不进 P2。

## 6. 成本规则

- 预算有限。主 session 负责设计、审查和剧情文字；规格明确的实现任务交给 `.claude/agents/implementer.md`（Sonnet）。
- subagent 每次都从头读上下文，不要为小事开 subagent；同时最多 2 个。
- 不要整个读 `runtime/lopda.js`（98 KB），本任务用不到它。需要时用 grep 看局部。
- 截图和 GIF 只在验收时做，不要每改一次就截图。
- 卡住超过 3 次同样的失败，停下来写进 PR 描述，不要继续重试。

## 7. 收尾

- 每个 PR 描述写清：做了什么、偏离本文件的地方和理由、已知问题、需要 owner 决定的事。
- `docs/decisions.md` 增加新的一节，记录 lo-3d、打包、体积上限、部署的决定；第 10 节里「自动化测试：目前没有」已过时（仓库已有测试），一并更新。
- 遵守 `CLAUDE.md` 的所有规则（四色、无 emoji、putImageData、许可）。
