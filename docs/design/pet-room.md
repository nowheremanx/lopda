# 设计草稿：宠物的房间（spots / slots / resolve）

状态：**第一、二步已实现**（spots、slots、`resolve`、`uses`、z 顺序、朝向、状态图标，runtime 0.45.0）；
第三步（DLC 包格式）做了 `roomOk` / `packOk` 和第二个房间的测试，包加载器仍未做。基于 main `69236ad` /
runtime 0.44.1；前两步随 0.45.0 落地。日记不再是一个 pick（见第 8 节）。

目标：房间里的东西不再靠散落在三个文件里的坐标和 `petX + 36` 这种隐式关系摆放；每个物件的
位置、占位、站位和可用动作有名字，DLC（新物种、新房间、新家具）只加数据，不改引擎。

## 1. 原来的问题（0.45.0 已修）

- **同一份几何写了三遍**：床画在 `petart.js` 的 `drawFurniture`（x 4..52、y 56..92），宠物躺的
  位置是 `pet.js` 的 `BED_X/BED_Y = 10,52`，e2e 里又写了一次 `{x:4,y:58,w:48,h:34}`。地毯和
  碗也一样。
- **位置按状态各算各的**：`roomScene()` 用一串 `if` 算 `px/py`；道具的默认位置是 `petX + 36`，
  只要某个状态没有显式钉住它，它就会跟着宠物走。当时的日记书桌就是这样（宠物走去睡觉时书桌跟着
  走，醒来又跳回去；两分钟清醒期被推到 x=119、右边被切掉）。书桌后来删了，但问题留下了：
  道具的位置必须由它自己说清楚。
- **物件没有自己的盒子、层和站位**：不能在数据里说“我在地毯前面”“站在我左边用我”“别压着床”。
  绘制顺序固定成 家具 → 宠物 → 道具 → 牌子 → Zz，新家具想盖住宠物只能改代码。
- **动作和状态无关**：睡着时五个图标都可点；玩耍会把一只在床上睡觉的宠物拉进游戏。

## 2. 模型

房间仍然是手画的像素图（不把墙、窗、书架拆成通用场景图，那只会让画变差），但房间声明一份
**元数据**，场景只描述实体，位置由**一个**纯函数解析。

```js
room = {
  id: "chip", w: 162, h: 120,
  spots: {                 // 宠物“站到哪儿做事”，位置本身是玩法，不是从图形推出来的
    stand: {x:83,  y:69},  // 地毯
    sleep: {x:10,  y:52},  // 床
    eat:   {x:32,  y:69},  // 碗边
    wash:  {x:40,  y:69}   // 便便那一带
  },
  slots: {                 // 物件“放在哪儿”；z 是绘制层
    pick:  {x:119, bottom:101, z:12},   // 小道具在地毯右边，底边贴着地板
    shelf: {x:93,  y:30,  z:6},         // 架子上的纪念品
    sign:  {x:62,  y:60,  z:20},        // 远行的牌子
    zz:    {x:32,  y:48,  z:30}         // 睡着的 Zz
  },
  uses: {                  // 动作 → 站位
    feed:  {spot:"eat"},
    sleep: {spot:"sleep"},
    rest:  {spot:"stand"},
    wash:  {spot:"wash"}
  },
  solids: [                // 家具的占位盒，给“别压着”的检查和测试用
    {id:"bed",       box:[4,58,48,34]},
    {id:"bookshelf", box:[114,16,44,80]},
    {id:"bowl",      box:[25,97,20,14]}
  ]
}
```

场景实体只有几种：

```js
scene = {
  pet: grid,  petX, petY,          // 走路时由任务给绝对位置
  prop: grid, propSlot:"pick",     // 道具：槽位优先
  prop: grid, propX, propY,        // 或者显式位置（生气的小气团）
  prop: grid, propFollow:true,     // 或者明确“跟着宠物”（开心心、月饼、出门带回来的东西）
  sign: true, shelf: grid, zz: true, lightOff: true
}
```

`Art.resolve(scene, room)` 是唯一的解析器，返回 `{pet, prop, sign, zz, order}`，每项带 `x/y/w/h`：

1. `pet`：`petX/petY` 优先，否则 `scene.spot` 对应的 `spots`，否则房间的默认 `petX/petY`。
2. `prop`：`propSlot` → `slotPoint`；其次显式 `propX/propY`；其次 `propFollow` 的从属关系；
   都没有就不画。**不再有隐式默认**。
3. `sign` / `shelf`：槽位优先，旧的 `signAt` / `shelfAt` 只作为兼容回退。
4. 所有结果夹在房间内；宠物由走路路径保证不出界。
5. 绘制顺序由实体的 `z` 决定，同层按脚底 y、再按插入顺序破平；默认仍是宠物(10) → 道具(12) →
   牌子(20) → Zz(30)。`resolve` 返回排好的 `order`，`drawRoom` 只按 `order` 画。

`slot` 的锚点：`bottom` 表示 y 是底边（小道具贴地），`right` 表示 x 是右边。这样同一个槽位换
一件更高/更宽的 DLC 道具，位置仍然对。睡着的 Zz 也有自己的槽位 `zz`。

## 3. 交互

- 宠物 ↔ 物件用**动作表** `uses`：`feed → spots.eat`、`sleep → spots.sleep`、`rest → spots.stand`、
  `wash → spots.wash`。程序里全部走 `useSpotAt(kind, fallback)`，房间里换名字只改 `uses`，不改
  `roomScene()` 和走路状态机。
- 道具 ↔ 宠物用**槽位**：日期旗、单词卡、书、胶卷都走 `slots.pick`；道具钉在自己的槽位里，宠物
  走开时它不动。以后加“大一点的桌/垫”，只改槽位，不改 `roomScene()`。
- 物件 ↔ 物件的“碰撞”不做物理：只有 `solids` 盒子和测试里的不重叠断言。家具拖动、换房间
  （SELECT 预留）以后再加 `movable` / `slot` 字段。

## 4. 状态相关（本轮一起做）

`petsim.actionReady(save, action, ctx)`（纯函数）决定五个图标能不能用：

- 蛋：都不行（图标行本来就不显示）。
- 远行 `travel`：只有“呼唤”（把它叫回来）。
- 出门 `outing`：都不行。
- 在床上睡着 `ctx.asleep`：只有“电灯”——开灯是叫醒它的方式；食物、玩耍、洗澡、叫它都不行。
  以前喂食会把它叫起来，owner 觉得怪，0.45.0 改掉了。
- 其余：五个都行。

程序里 `iconUsable()` 只包一层 `inBedSleep()` / `P.outing`。图标正常是 dark，不能用的是一整块
mid（不再做棋盘格/半透明，图形始终看得清），需要东西或闪烁时是 ink；不能用的按钮标 `aria-disabled`，
A/点击时 `beep("err")`。A 键本身不禁用：长按 A 摸醒它是设计里的动作。

「叫它」原来的名字是「呼唤」：有想要的东西时它朝碗或便便那边看（ink）；没有时抬头看你一下
（surprised）；远行时只有它能把它叫回来。没有“点三次就生气”的隐藏规则了。

START 菜单第一行也不再一律叫「信」：有 pick 时显示它自己的名字（日历/单词/书/胶卷），没有时显示
「今天没有」并变淡。这样看到什么就知道按 A 会打开什么。

## 5. 朝向

侧身走路帧只有朝右一套；`Art.mirror` 翻过来就是朝左。走路时按 `task.to.x < task.from.x`
决定翻不翻，所以：

- 床 → 地毯：向右（不翻）。
- 地毯 → 床：向左（翻）。
- 床 ↔ 碗：按横向那一段的方向；竖直那一段沿用同一个朝向。

以后所有侧面动作（跳、扇）都从同一个 `facing` 值取，不再各写各的。

## 6. DLC / 物种包

现有 `PACKS` 已经是“一个物种一份”，但 `room.draw`、`frames`、`adult` 是函数，不能直接做数据包。
分三步：

1. **已做**：房间元数据（spots/slots/solids/uses）进包；新房间只要给一份数据 + 同一个 painter。
2. **已做**：`roomOk(room)` / `packOk(pack)` 是纯数据检查：网格矩形、只用 `.kdmp`、槽位/盒子在房间内、
   动作引用的站位和槽位存在。`tests/petart.test.mjs` 里有一个只存在于测试的第二房间（不同的站位、
   槽位、家具），证明只加数据不改引擎。
3. **未做**：如果真要装 DLC，包只能是 JSON 数据（没有函数），`draw` 只留给内置包；加载器在安装时
   跑 `packOk`，存档只记 `species` / `room` id，不迁移。

## 7. 测试

- `petart.test.mjs`：spots/slots 的值；`resolve` 在 `petX` 改变时把 `propSlot` 钉住；`propFollow`
  才跟宠物；槽位结果在房间内；`propZ` 和脚底 y 的绘制顺序；`roomOk` / `packOk` 对 chip 和第二个
  房间通过、对坏数据报错。
- `petsim.test.mjs`：`actionReady` 的睡/远行/出门/蛋四种状态。
- `e2e.test.mjs`：夜里 `play`/食物/洗澡的 `aria-disabled`、点击不开面板；电灯可用；正常图标是
  dark、不能用的是 mid；早上可用；床→地毯 `dir:right`、地毯→床 `dir:left`；菜单第一行显示当天的
  pick 名字或「今天没有」；`spot()` 的道具位置来自 `resolve`；房间里不再出现日记书桌。
- 同一套场景矩阵（阶段 × 睡/醒 × 信 × 任务 × 出门 × 架子）做“盒子在房间内、没有未声明的重叠”
  的断言，后面加黄金缓冲哈希，防止重构悄悄挪画。

## 8. 为什么没有日记 pick

「信」原本可以是日记：20:00 后当天还没写日记时，房间摆一张书桌和笔，A 打开 notes 的今天。owner 看了
之后觉得无厘头——信是宠物从只读摘要里找到的“今天可以看看什么”，日记却是**你**的私人写作；让宠物
提醒你写日记既越界，又像一个任务提示。所以 0.45.0 删掉了：

- `pickCandidates` 里的 `diary` 候选和 `addLateDiary`（20:00 的补选）；
- `uses.diary`、`spots.desk`、`slots.desk`、书桌和笔的道具，以及“先走再开”的 `walkUse` / `atUse`；
- `forcePick("diary")` 和相关测试。

`notes` 的使用统计仍然只影响成体形态（diarist）、开心和 AI 纪念品的“wrote a diary”类别：宠物知道你
在用记事本，但不读内容，也不再提醒你写。房间剩下的四个 pick 都是“宠物看了什么”（日期、单词、书、
胶卷），和「信」的设定一致。

## 9. 待定

- 家具拖动 / 换房间（SELECT 预留）要不要成为正式功能。
- `z` 目前是显式数字；书架这种整块背景还在 painter 里，不能和动态实体交错。真要做前后遮挡，
  下一步把家具也拆成带 `z` 的实体，或者让 painter 预留“前景”层。
