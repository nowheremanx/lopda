/*
 * Lo-PDA runtime strings: Simplified Chinese and English.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * One flat table per language. Keys are grouped by screen: home, store, set, upd, notes,
 * paint, cam, cut, cart, run, common. "{name}" in a string is filled from vars.
 * English is short on purpose: labels on an old device, not a translation.
 * Static text in index.html carries data-i18n (text), data-i18n-ph (placeholder),
 * data-i18n-label (aria-label) or data-i18n-title (title); apply() fills them.
 */
(function () {
  "use strict";
  var STR = {
    zh: {
      "app.notes": "记事本", "app.paint": "点阵画板", "app.camera": "点阵相机", "app.cutter": "裁片机",
      "app.cart": "卡带机", "app.store": "应用商店", "app.settings": "设置", "app.unnamed": "无名",
      "home.updates": "有更新",

      "status.boot": "启动中…", "status.saved": "本机存档", "status.unsaved": "未存档", "status.readfail": "读档失败",

      "common.delete": "删除", "common.cancel": "取消", "common.confirm": "确认{what}", "common.unknown": "未知",
      "common.save": "保存", "common.ready": "{name} 已准备好。", "common.saving": "保存中…",
      "common.savefail": "存档失败：{code}", "common.readfail": "读档失败：{msg}",
      "common.dpad": "方向键",

      "store.title": "应用商店", "store.refresh": "刷新",
      "store.note": "每个程序都经过社区审核，在隔离的沙盒里运行，不能联网，也碰不到你的其他数据。装好的版本不会自己变，有新版本时这里会提示更新。",
      "store.fetching": "接收目录…", "store.count": "{n} 个程序", "store.offline": "收不到目录",
      "store.badindex": "目录格式不对", "store.cantreach": "连不上应用目录：{msg}",
      "store.waiting": "正在接收应用目录。连不上的话，检查网络后再进来一次。",
      "store.anon": "佚名", "store.install": "安装", "store.update": "更新", "store.open": "打开",
      "store.downloading": "下载中…", "store.retry": "重试", "store.badhash": "校验不通过，文件和目录对不上",
      "store.nostore": "存不进本机", "store.installed": "已安装 {name}。", "store.updated": "已更新 {name}。",
      "store.failed": "安装失败：{msg}", "store.removefail": "卸载失败",

      "set.title": "设置", "set.sound": "音效", "set.on": "开", "set.off": "关", "set.volume": "音量",
      "set.voldown": "调小音量", "set.volup": "调大音量",
      "set.soundnote": "手机静音时不出声，也不会打断正在播放的音乐。",
      "set.lang": "语言", "set.about": "关于", "set.version": "Lo-PDA {v} · 规范 lopda/1",
      "set.storage": "本机存档：约 {size}", "set.locked": " · 已锁定，不会被系统清理",
      "set.unlocked": " · 未锁定，长期不用可能被系统清理", "set.counting": "本机存档：计算中…",
      "set.nousage": "本机存档：无法读取用量",

      "upd.label": "系统版本", "upd.check": "检查更新", "upd.busy": "接收中…", "upd.restart": "重启升级",
      "upd.note": "新版本下载好以后按「重启升级」。存档、胶卷和卡带都不受影响。",
      "upd.nosw": "这个浏览器不支持离线版本，刷新页面就是最新的。", "upd.latest": "已经是最新版 {v}。",
      "upd.noversion": "读不到版本号", "upd.nocopy": "没有离线副本", "upd.ready": "新版本 {v} 下载好了，按「重启升级」。",
      "upd.failed": "检查失败：{msg}", "upd.offline": "连不上", "upd.arrived": "新版本下载好了。到「设置」按「重启升级」。",

      "run.title": "程序", "run.frame": "运行中的程序", "run.remove": "卸载", "run.error": "程序出错了：",
      "run.hide": "收起", "run.loading": "载入中…", "run.missing": "这个程序的代码找不到了，去应用商店重新安装。",
      "run.loadfail": "读档失败（{code}）", "run.toobig": "存档超过 256 KB 上限，这次没存。",
      "run.removed": "已卸载 {name}，存档也一并清掉了。",

      "notes.title": "记事本", "notes.new": "新建", "notes.back": "◂ 列表", "notes.placeholder": "写点什么。自动保存。",
      "notes.empty": "还没有笔记。点「新建」写第一条，存在这台机器里。",
      "notes.emptynodb": "还没有笔记。现在存不了档，写的内容关掉就没了。",
      "notes.blank": "（空白）", "notes.fresh": "新笔记", "notes.saved": "已保存", "notes.editing": "编辑中…",
      "notes.savedtemp": "已保存（仅本次）", "notes.savefail": "保存失败，再编辑一下会重试", "notes.delfail": "删除失败",

      "paint.title": "点阵画板", "paint.state": "96×96 · 4 色", "paint.canvas": "画布", "paint.colour": "颜色",
      "paint.ink": "墨", "paint.dark": "深", "paint.light": "浅", "paint.paper": "底色（橡皮）",
      "paint.brush": "笔刷粗细", "paint.fine": "笔 · 细", "paint.bold": "笔 · 粗", "paint.undo": "撤销",
      "paint.import": "导入图片", "paint.export": "导出 PNG", "paint.clear": "清空",
      "paint.noundo": "没有可以撤销的了。", "paint.imported": "已转成 96×96 四色点阵。",
      "paint.badimg": "这张图读不出来，换一张试试。", "paint.noexport": "这里不能导出，要在 Claude 里打开。",
      "paint.genfail": "生成图片失败。", "paint.exported": "导出好了。",
      "paint.unsaved": "96×96 · 未存档", "paint.saved": "96×96 · 已保存", "paint.savefail": "保存失败",

      "save.declined": "这次没保存。", "save.busy": "上一个保存窗口还没关。",
      "save.unavailable": "这里不能保存文件，要在 Claude 里打开。", "save.failed": "保存失败（{code}）。",

      "cam.nofilm": "未装胶卷", "cam.reading": "读取中…", "cam.date": "日期", "cam.finder": "取景器",
      "cam.receiving": "接收影像…", "cam.exp": "亮{b} 对{c}",
      "cam.k.dark": "暗", "cam.k.shoot": "拍", "cam.k.bright": "亮", "cam.k.menu": "菜单",
      "cam.a.dark": "调暗", "cam.a.shoot": "拍照", "cam.a.bright": "调亮", "cam.a.menu": "机身菜单",
      "cam.lcd": "{en} {name} · {stock}", "cam.stock.s1": "标", "cam.stock.s2": "细",
      "cam.nolive": "没拿到摄像头权限：按 A 会打开系统相机", "cam.needhttps": "实时取景需要 HTTPS：按 A 会打开系统相机",
      "cam.denied": "没拿到摄像头权限，改用系统相机拍。",
      "cam.loaded": "装好了：PIXEL FILM {en} {name}{fine}，{n} 张。", "cam.loadedfine": " 细颗粒",
      "cam.lost": "这一张没存上，重新打开相机看看。", "cam.last": "最后一张。这卷拍完了，可以冲洗了。",
      "cam.badphoto": "这张照片读不出来，这一格没有用掉。",
      "cam.developed": "冲洗好了。想要单张就放进「裁片机」。", "cam.carded": "印样卡冲印好了。",
      "cam.rewound": "倒片完成，剩下的格子见光了。", "cam.readfail": "相机读档失败（{code}）",
      "cam.unexposed": "未曝光", "cam.fogged": "全曝光",

      "cam.boot.slot": "扩展槽 B 检测中", "cam.boot.found": "发现外设", "cam.boot.lens": "LP-CAM 点阵镜头 rev.2",
      "cam.boot.shake": "握手 9600 bps", "cam.boot.fw": "固件", "cam.boot.film": "胶卷",
      "cam.boot.filmof": "{name}{stock} {n}/{size}", "cam.boot.nofilm": "未装", "cam.boot.done": "连接完成。",
      "cam.boot.skip": "轻点跳过",

      "cam.load.title": "装胶卷", "cam.load.rolls": "胶卷", "cam.load.go": "装入", "cam.load.exp": "{n} 张",
      "cam.load.label": "{name} · {n} 张{fine}", "cam.load.fine": " · 细",
      "cam.stock1": "标准片", "cam.stock2": "细颗粒",
      "cam.load.note1": "标准片 128×112，颗粒粗，复古味重。", "cam.load.note2": "细颗粒 256×224，能看清人脸。",
      "cam.load.tint": " 冲洗出来是「{name}」色调，屏幕上永远是绿的。",

      "cam.menu.body": "机身菜单", "cam.menu.date": "日期", "cam.menu.lens": "换镜头", "cam.menu.front": "前",
      "cam.menu.back": "后", "cam.menu.rewind": "提前倒片", "cam.menu.left": "{n} 张未拍", "cam.menu.finder": "回到取景",
      "cam.menu.rewindnote": "还有 {n} 张没拍。倒片时剩下的胶片会见光，冲出来是一片白。倒片后这卷就拍完了。",
      "cam.menu.rewindgo": "确认倒片", "cam.menu.done": "这卷拍完了",
      "cam.menu.donenote": "冲洗之后才看得到拍了什么。长条是一整条胶片；印样卡把整卷印在一张 3:4 相纸上。",
      "cam.menu.strip": "冲洗成长条", "cam.menu.card": "印样卡 3:4", "cam.menu.swap": "取出胶卷，装新的",
      "cam.menu.remove": "取出胶卷", "cam.menu.removenote": "旧胶卷会从掌机里清掉。没冲洗的话就没了。",
      "cam.menu.removego": "确认取出", "cam.menu.wait": "再想想",
      "cam.menu.keys": "▲▼ 选择 · A 确定", "cam.menu.keysback": " · B 返回",

      "cut.title": "裁片机", "cut.empty": "放入一条冲洗好的胶片", "cut.strip": "胶片", "cut.insert": "放入长条",
      "cut.left": "往左挪一点", "cut.right": "往右挪一点", "cut.go": "裁", "cut.goa": "裁下框里的部分",
      "cut.size": "片框大小", "cut.narrow": "窄框 · 只裁画面", "cut.wide": "宽框 · 连齿孔一起",
      "cut.edge": "相纸边 · {name}",
      "cut.edge.none": "无", "cut.edge.plain": "白边", "cut.edge.scallop": "花边", "cut.edge.card": "3:4 卡",
      "cut.edgenote.none": "裁下来直接是胶片画面。", "cut.edgenote.plain": "加一圈相纸白边。",
      "cut.edgenote.scallop": "加一圈波浪形的花边相纸，像老照片。", "cut.edgenote.card": "放在一张 3:4 相纸卡上，适合直接发出去。",
      "cut.hint": "左右滑动胶片，把想要的部分对进四个角标里，按「裁」。可以跨在两张中间。",
      "cut.state": "{tint} · {n} 格 · 已裁 {k} 张", "cut.reading": "读取中…",
      "cut.notstrip": "这不像 Lo-PDA 冲洗出来的横向长条。", "cut.badimg": "这张图读不出来。",
      "cut.carded": "卡片冲印好了。", "cut.done": "裁好了。",

      "cart.title": "卡带机", "cart.save": "存档", "cart.load": "读档", "cart.eject": "退卡",
      "cart.insert": "插入卡带 · .gb 文件",
      "cart.note": "只认黑白 GB 卡带。卡带要你自己准备：从自己的卡带导出的，或者作者公开发布的自制游戏。这台机器不附带任何游戏。游戏里的进度会自动存进卡带；「存档」是另存一份即时存档，只有一个位置。",
      "cart.screen": "卡带画面", "cart.keys": "键盘：方向键 · X=A · Z=B · 回车=START · Shift=SELECT",
      "cart.empty": "卡带架是空的。", "cart.emptynodb": "现在存不了档，插进来的卡带关掉就没了。",
      "cart.untitled": "无标题", "cart.play": "插卡", "cart.toss": "扔掉", "cart.tossgo": "确认扔掉",
      "cart.shelffail": "卡带架读不出来", "cart.tossed": "扔掉了 {name}，存档也一起清掉了。",
      "cart.noemu": "模拟器文件没载入", "cart.badsize": "文件大小不像 GB 卡带",
      "cart.gbc": "这是彩色专用卡带（GBC），这台机器只认黑白卡带", "cart.badsum": "卡带头校验不对，文件可能坏了",
      "cart.default": "卡带", "cart.dupe": "这盘卡带已经在架子上了。",
      "cart.dual": "放好了。这是双模卡带，会按黑白模式运行。", "cart.placed": "放好了。",
      "cart.badfile": "读不了这个文件：{msg}", "cart.reading": "读卡…", "cart.norom": "卡带数据找不到了",
      "cart.nopower": "开不了机：{msg}", "cart.badrom": "这盘卡带读不出来",
      "cart.saved": "存好了（覆盖上一份）。", "cart.loadgo": "确认读档", "cart.restored": "回到 {when} 的存档。",
      "cart.loadfail": "存档读不进去。",

      "boot.nostore": "这台浏览器不让存档，关掉页面后内容会丢。"
    },

    en: {
      "app.notes": "Notes", "app.paint": "Paint", "app.camera": "Camera", "app.cutter": "Cutter",
      "app.cart": "Cartridge", "app.store": "Store", "app.settings": "Settings", "app.unnamed": "Untitled",
      "home.updates": "UPDATE",

      "status.boot": "BOOT…", "status.saved": "SAVED", "status.unsaved": "NO SAVE", "status.readfail": "READ ERR",

      "common.delete": "Delete", "common.cancel": "Cancel", "common.confirm": "{what}?", "common.unknown": "unknown",
      "common.save": "Save", "common.ready": "{name} is ready.", "common.saving": "Saving…",
      "common.savefail": "Save failed: {code}", "common.readfail": "Read failed: {msg}",
      "common.dpad": "D-pad",

      "store.title": "Store", "store.refresh": "Reload",
      "store.note": "Every program is reviewed by the community and runs sealed off: no network, no reach into your other data. Installed versions never change by themselves; updates show up here.",
      "store.fetching": "Receiving…", "store.count": "{n} programs", "store.offline": "No signal",
      "store.badindex": "bad catalogue", "store.cantreach": "Can't reach the catalogue: {msg}",
      "store.waiting": "Receiving the catalogue. If it never comes, check the network and come back.",
      "store.anon": "anon", "store.install": "Install", "store.update": "Update", "store.open": "Open",
      "store.downloading": "Loading…", "store.retry": "Retry", "store.badhash": "checksum mismatch",
      "store.nostore": "can't store it here", "store.installed": "{name} installed.", "store.updated": "{name} updated.",
      "store.failed": "Install failed: {msg}", "store.removefail": "Remove failed",

      "set.title": "Settings", "set.sound": "Sound", "set.on": "On", "set.off": "Off", "set.volume": "Volume",
      "set.voldown": "Volume down", "set.volup": "Volume up",
      "set.soundnote": "Silent when the phone is on mute. Never stops your music.",
      "set.lang": "Language", "set.about": "About", "set.version": "Lo-PDA {v} · spec lopda/1",
      "set.storage": "Storage: about {size}", "set.locked": " · kept, the system won't clear it",
      "set.unlocked": " · not kept, may be cleared if unused", "set.counting": "Storage: counting…",
      "set.nousage": "Storage: usage unknown",

      "upd.label": "System", "upd.check": "Check", "upd.busy": "Receiving…", "upd.restart": "Restart",
      "upd.note": "When a new version is in, press Restart. Saves, film and carts stay.",
      "upd.nosw": "No offline copy in this browser. Reload the page for the latest.", "upd.latest": "Up to date: {v}.",
      "upd.noversion": "no version found", "upd.nocopy": "no offline copy", "upd.ready": "{v} is in. Press Restart.",
      "upd.failed": "Check failed: {msg}", "upd.offline": "offline", "upd.arrived": "New version in. Settings → Restart.",

      "run.title": "Program", "run.frame": "Running program", "run.remove": "Remove", "run.error": "Program error:",
      "run.hide": "Hide", "run.loading": "Loading…", "run.missing": "This program's code is gone. Reinstall it from the Store.",
      "run.loadfail": "Read failed ({code})", "run.toobig": "Save data over the 256 KB limit. Not saved.",
      "run.removed": "{name} removed, with its saves.",

      "notes.title": "Notes", "notes.new": "New", "notes.back": "◂ List", "notes.placeholder": "Write something. Saves itself.",
      "notes.empty": "No notes yet. Tap New to write one. It stays on this device.",
      "notes.emptynodb": "No notes yet. Saving is off: what you write is lost on close.",
      "notes.blank": "(blank)", "notes.fresh": "New", "notes.saved": "Saved", "notes.editing": "Editing…",
      "notes.savedtemp": "Saved (this session)", "notes.savefail": "Not saved. Edit to retry", "notes.delfail": "Delete failed",

      "paint.title": "Paint", "paint.state": "96×96 · 4 tones", "paint.canvas": "Canvas", "paint.colour": "Tone",
      "paint.ink": "Ink", "paint.dark": "Dark", "paint.light": "Light", "paint.paper": "Paper (eraser)",
      "paint.brush": "Brush size", "paint.fine": "Pen · fine", "paint.bold": "Pen · bold", "paint.undo": "Undo",
      "paint.import": "Import", "paint.export": "Export PNG", "paint.clear": "Clear",
      "paint.noundo": "Nothing to undo.", "paint.imported": "Turned into 96×96, four tones.",
      "paint.badimg": "Can't read that image. Try another.", "paint.noexport": "Can't export here.",
      "paint.genfail": "Couldn't make the image.", "paint.exported": "Exported.",
      "paint.unsaved": "96×96 · not saved", "paint.saved": "96×96 · saved", "paint.savefail": "Save failed",

      "save.declined": "Not saved.", "save.busy": "The last save sheet is still open.",
      "save.unavailable": "Can't save files here.", "save.failed": "Save failed ({code}).",

      "cam.nofilm": "NO FILM", "cam.reading": "READING…", "cam.date": "Date", "cam.finder": "Viewfinder",
      "cam.receiving": "Receiving…", "cam.exp": "B{b} C{c}",
      "cam.k.dark": "Dark", "cam.k.shoot": "Shoot", "cam.k.bright": "Light", "cam.k.menu": "Menu",
      "cam.a.dark": "Darker", "cam.a.shoot": "Take photo", "cam.a.bright": "Brighter", "cam.a.menu": "Body menu",
      "cam.lcd": "{en} · {stock}", "cam.stock.s1": "STD", "cam.stock.s2": "FINE",
      "cam.nolive": "No camera access: A opens the system camera", "cam.needhttps": "Live view needs HTTPS: A opens the system camera",
      "cam.denied": "No camera access. Using the system camera.",
      "cam.loaded": "Loaded: PIXEL FILM {en}{fine}, {n} exp.", "cam.loadedfine": " FINE",
      "cam.lost": "That frame wasn't saved. Reopen the camera.", "cam.last": "Last frame. Roll done, ready to develop.",
      "cam.badphoto": "Can't read that photo. The frame is still unused.",
      "cam.developed": "Developed. For single prints, use the Cutter.", "cam.carded": "Contact sheet printed.",
      "cam.rewound": "Rewound. The rest of the roll got light.", "cam.readfail": "Camera read failed ({code})",
      "cam.unexposed": "unexposed", "cam.fogged": "fogged",

      "cam.boot.slot": "Probing slot B", "cam.boot.found": "Device", "cam.boot.lens": "LP-CAM dot lens rev.2",
      "cam.boot.shake": "Link 9600 bps", "cam.boot.fw": "Firmware", "cam.boot.film": "Film",
      "cam.boot.filmof": "{name} {stock} {n}/{size}", "cam.boot.nofilm": "none", "cam.boot.done": "Linked.",
      "cam.boot.skip": "Tap to skip",

      "cam.load.title": "LOAD FILM", "cam.load.rolls": "Film", "cam.load.go": "Load", "cam.load.exp": "{n} EXP",
      "cam.load.label": "{n} EXP{fine}", "cam.load.fine": " · FINE",
      "cam.stock1": "Standard", "cam.stock2": "Fine grain",
      "cam.load.note1": "Standard 128×112: coarse grain, very retro.", "cam.load.note2": "Fine grain 256×224: faces come through.",
      "cam.load.tint": " Develops in {name}. The screen always stays green.",

      "cam.menu.body": "BODY MENU", "cam.menu.date": "Date", "cam.menu.lens": "Lens", "cam.menu.front": "Front",
      "cam.menu.back": "Back", "cam.menu.rewind": "Rewind now", "cam.menu.left": "{n} left", "cam.menu.finder": "Back to finder",
      "cam.menu.rewindnote": "{n} frames unshot. Rewinding lets light onto them: they develop white. The roll is then done.",
      "cam.menu.rewindgo": "Rewind", "cam.menu.done": "ROLL DONE",
      "cam.menu.donenote": "You see the pictures only once developed. Strip: the whole film. Contact sheet: the roll on one 3:4 print.",
      "cam.menu.strip": "Develop strip", "cam.menu.card": "Contact sheet 3:4", "cam.menu.swap": "Unload, load new",
      "cam.menu.remove": "UNLOAD", "cam.menu.removenote": "The old roll is wiped from the handheld. Undeveloped, it's gone.",
      "cam.menu.removego": "Unload", "cam.menu.wait": "Not yet",
      "cam.menu.keys": "▲▼ Pick · A OK", "cam.menu.keysback": " · B Back",

      "cut.title": "Cutter", "cut.empty": "Insert a developed strip", "cut.strip": "Strip", "cut.insert": "Insert strip",
      "cut.left": "Nudge left", "cut.right": "Nudge right", "cut.go": "CUT", "cut.goa": "Cut what's in the frame",
      "cut.size": "Frame size", "cut.narrow": "Narrow · picture", "cut.wide": "Wide · with holes",
      "cut.edge": "Border · {name}",
      "cut.edge.none": "none", "cut.edge.plain": "white", "cut.edge.scallop": "scallop", "cut.edge.card": "3:4 card",
      "cut.edgenote.none": "Just the film picture.", "cut.edgenote.plain": "A plain white paper border.",
      "cut.edgenote.scallop": "A wavy deckle border, like old prints.", "cut.edgenote.card": "On a 3:4 photo card, ready to send.",
      "cut.hint": "Slide the strip, line up the part you want inside the four corners, press CUT. It can straddle two frames.",
      "cut.state": "{tint} · {n} fr · {k} cut", "cut.reading": "Reading…",
      "cut.notstrip": "That isn't a Lo-PDA film strip.", "cut.badimg": "Can't read that image.",
      "cut.carded": "Card printed.", "cut.done": "Cut.",

      "cart.title": "Cartridge", "cart.save": "Save", "cart.load": "Load", "cart.eject": "Eject",
      "cart.insert": "Insert cart · .gb file",
      "cart.note": "Black-and-white GB carts only. Bring your own: dumped from carts you own, or homebrew its author released. No games included. In-game progress saves to the cart by itself; Save keeps one quick snapshot.",
      "cart.screen": "Cart screen", "cart.keys": "Keys: arrows · X=A · Z=B · Enter=START · Shift=SELECT",
      "cart.empty": "The shelf is empty.", "cart.emptynodb": "Saving is off: carts are lost on close.",
      "cart.untitled": "no title", "cart.play": "Play", "cart.toss": "Toss", "cart.tossgo": "Toss?",
      "cart.shelffail": "Can't read the shelf", "cart.tossed": "{name} tossed, with its saves.",
      "cart.noemu": "emulator didn't load", "cart.badsize": "Wrong size for a GB cart",
      "cart.gbc": "Colour-only cart (GBC). This one takes black-and-white carts", "cart.badsum": "Header checksum bad. The file may be damaged",
      "cart.default": "Cart", "cart.dupe": "That cart is already on the shelf.",
      "cart.dual": "On the shelf. Dual-mode cart: runs in black and white.", "cart.placed": "On the shelf.",
      "cart.badfile": "Can't read this file: {msg}", "cart.reading": "Reading…", "cart.norom": "cart data missing",
      "cart.nopower": "Won't start: {msg}", "cart.badrom": "can't read this cart",
      "cart.saved": "Saved (over the last one).", "cart.loadgo": "Load?", "cart.restored": "Back to the save from {when}.",
      "cart.loadfail": "Couldn't load the save.",

      "boot.nostore": "This browser won't keep data. It's lost when the page closes."
    }
  };

  var I = {
    STR: STR,
    LANGS: ["zh", "en"],
    lang: /^zh/i.test((navigator.languages && navigator.languages[0]) || navigator.language || "") ? "zh" : "en",
    /* t("cam.load.exp", {n:12}) -> "12 张". Missing in English falls back to Chinese, then the key. */
    t: function (key, vars) {
      var s = STR[I.lang][key]; if (s == null) s = STR.zh[key]; if (s == null) s = key;
      return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? "" : String(vars[k]); }) : s;
    },
    set: function (lang) { if (STR[lang]) { I.lang = lang; I.apply(document); } },
    /* the localized manifest field, when an app provides one */
    field: function (app, f) {
      var x = app && app.i18n && app.i18n[I.lang];
      return (x && typeof x[f] === "string" && x[f]) || (app && app[f]) || "";
    },
    apply: function (root) {
      document.documentElement.lang = I.lang === "zh" ? "zh-CN" : "en";
      [["data-i18n", null], ["data-i18n-ph", "placeholder"], ["data-i18n-label", "aria-label"], ["data-i18n-title", "title"]].forEach(function (p) {
        Array.prototype.forEach.call(root.querySelectorAll("[" + p[0] + "]"), function (el) {
          var s = I.t(el.getAttribute(p[0]));
          if (p[1]) el.setAttribute(p[1], s); else el.textContent = s;
        });
      });
    }
  };
  window.LopdaStrings = I;
})();
