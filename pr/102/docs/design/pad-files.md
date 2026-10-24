# 设计草稿：PAD 文件接口、预装 app、画板和计算器

状态：**已实现**（runtime 0.5.0，2026-10-11）。owner 同意了下表的推荐；实际做法和偏离见 `docs/decisions.md` 第 13 节。
背景：owner 决定画板改成社区 app、计算器做成预装的社区 app。画板需要导入和导出文件，而现在的沙盒做不到。

## 需要 owner 决定的事

| # | 问题 | 推荐 |
|---|---|---|
| 1 | 文件能力怎么开放 | manifest 声明 `"permissions": ["files"]`，PAD 新增 `exportFile` / `importFile`，每次都由 runtime 在机身上弹出确认 |
| 2 | 预装 app 能不能卸载 | 能。它们就是普通的社区 app，卸载后可以在商店重新安装 |
| 3 | 旧画板的数据 | 不迁移。目前没有用户（owner 2026-10-10 决定）。runtime 删掉画板代码，旧的 IndexedDB 文档留着不管 |
| 4 | 以后改存储格式时 | 一旦有了用户，改格式就必须做迁移。这条写进 decisions.md |

## 1. 判断"内置还是社区"的标准

内置 = 需要沙盒给不了的能力（摄像头、跨程序数据、WebAssembly、联网、大量存储），或者是定义这台机器身份的日常工具。
其余都是社区 app。按这个标准：画板、计算器是社区 app；相机、裁片机、卡带机、万年历、词典、阅读器是内置。

## 2. 文件接口

### 2.1 manifest

```json
"permissions": ["files"]
```

- `permissions` 目前必须为空。改为允许列表 `["files"]`，其他值仍然报错。
- 商店详情页显示"可导入、导出文件"。安装时不额外弹窗：真正的保护在每次使用时的确认上。

### 2.2 API（`lopda/1` 的增量，app 先判断 `PAD.exportFile` 是否存在）

```js
PAD.exportFile({ name: "画作.png", type: "image/png", data: dataUrlOrText })  // -> Promise<"saved" | "cancelled">
PAD.importFile({ accept: ["image/png", "text/plain"] })                      // -> Promise<{name, type, data} | null>
```

- `data`：图片用 data URL，文本用字符串。单个文件上限 2 MB（postMessage 传输、IndexedDB 都能承受）。
- 没有声明 `files` 权限的 app 调用时直接返回失败，并在开发台里报错。

### 2.3 为什么每次都要 runtime 确认

1. 安全：沙盒 app 不能悄悄导出或读取用户文件。
2. iPhone 的限制：分享面板和文件选择器必须由真实的点击触发。点击发生在沙盒 iframe 里时，这个用户手势能不能传到外层页面，
   在 Safari 上没有把握。让用户在 runtime 自己的确认框上点一下，就保证了手势来自外层页面。
3. 设定：像老机器上"确认 / 取消"的系统对话框。

确认框是机身上的一个覆盖层：`导出「画作.png」？ [好] [取消]` 或 `从文件导入？ [选文件] [取消]`。
"好"在 `pointerup` 时触发分享面板（遵守 CLAUDE.md 关于用户手势的规则）。

### 2.4 实现位置

- runtime：处理新的 postMessage `op: "file"`，显示确认框，复用现有的 `saveCanvas` / 分享逻辑。
- `sdk/pad-shim.js`：新增两个方法。`sdk/dev.html`：开发台里用普通的下载和 `<input type=file>` 模拟。
- `tools/check-app.mjs`：允许 `files` 权限；调用了 `PAD.exportFile` / `importFile` 但没有声明权限时报错。
- SPEC.md 第 2、6 节。

## 3. 预装 app

- runtime 里有一个列表 `PREINSTALL = ["calculator", "paint"]`。首次启动（或升级后列表里出现新 id 时）自动从 registry 安装，
  和用户在商店里安装完全一样（按 sha256 锁定版本）。
- 这两个 app 的文件加进 `sw.js` 的离线缓存，保证第一次打开、没有网络时也能装上。
- 卸载后不会被自动装回来：记下"已经预装过"的 id。
- 主屏上排在内置程序之后、用户安装的 app 之前。

## 4. 画板（社区 app）

- 功能沿用现有的 96×96 四色画板，存档用 `PAD.save`。
- 新增：导出 PNG（按整数倍放大）、从图片导入（缩放并抖动成四色）。
- 作为 `files` 权限的官方示例，代码注释写清楚用法。
- runtime 删除画板相关代码、图标、strings。

## 5. 计算器（预装社区 app）

- 商务通式：8 位数字显示，加减乘除、百分号、正负号、M+ M- MR MC、清除。不做科学计算。
- 四色点阵数字；按键可以触屏，也支持下巴按键（十字键选键，A 按下）。
- 不需要任何权限。作为"一个完整的社区 app 长什么样"的示范。

## 6. 工作量（估计）

一个 cloud session：文件接口（runtime、shim、开发台、checker、SPEC）+ 预装机制 + 画板迁出 + 计算器。约 $6–10，没有实测过。
建议放在"拆分 runtime"之后做。
