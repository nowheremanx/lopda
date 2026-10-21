English summary: Review apps for original, shareable content; four-tone, usable screens; working keys; justified permissions; sandbox compliance; size; and readable code.

# App review checklist

审核 app PR 时逐项检查：

- **原创与 IP**：不出现他人的名字、角色、精灵图、音乐或其他受保护素材；不做未经授权的移植。公有领域音乐要在乐谱旁标明来源。
- **许可证**：只能是 MIT、0BSD、BSD-2-Clause、BSD-3-Clause、ISC、Apache-2.0、CC0-1.0 或 Unlicense。
- **四色画面**：app 只用 `#1f2a14`、`#4a5a32`、`#7d8a58`、`#a3ad7e` 四种颜色；文字对比度符合 `sdk/UI.md`。
- **小屏布局**：按 `sdk/UI.md` 检查 331×359；单一主滚动区、没有横向滚动，触控目标至少 44 px。
- **按键**：按 `SPEC.md` 第 4 节核对按键提示和操作；菜单、列表、对话框中 A 确认、B 返回或取消。倾斜和麦克风必须有按键或触控的替代方式。
- **权限**：每项权限都必须必要且实际使用。尤其麦克风只在 app 正在听时开启，听完立即关闭。
- **沙盒**：按 `SPEC.md` 第 5 节检查，不联网、不加载外部资源、不绕过存储隔离、不导航到 app 外。
- **大小**：`index.html` 不超过 512 KB，且通过 `node tools/check-app.mjs`。
- **代码**：逻辑清楚、容易阅读；仅在非显然处补充注释。
