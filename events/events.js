/* Lo-PDA events: the data behind events/index.html.
 *
 * One entry per event, newest first. To add an event, add an entry here; the page does not change.
 * When an event ends: set status to "archived", fill "summary", and put one screenshot per app in
 * events/shots/<event id>/<app id>.png. Name a maker only with their consent, by GitHub login.
 *
 * Every text field is {en, zh}. Starter prompts stay in English: they go to an AI, which reads either.
 */
window.LOPDA_EVENTS = [
  {
    id: "first-app",
    status: "open",                       /* "open" | "archived" */
    when: { en: "Open now, no deadline", zh: "进行中，不设截止" },
    title: { en: "Your first Lo-PDA app", zh: "你的第一个 Lo-PDA app" },
    lede: {
      en: "Ten small, useful programs for a 1986 handheld. Pick one, hand the prompt to your AI, and have it running on your phone in an evening.",
      zh: "十个给 1986 年掌机做的实用小程序。挑一个，把提示词交给你的 AI，一个晚上就能在手机上跑起来。"
    },

    /* The ten-minute tutorial: what to do on the phone, then how to get into the store. */
    steps: [
      { h: { en: "Open Lo-PDA", zh: "打开 Lo-PDA" },
        p: { en: "Open it on your phone and add it to the Home Screen. Then open Scripts.",
             zh: "在手机上打开它，添加到主屏幕。然后进「脚本」。" } },
      { h: { en: "Write one line", zh: "写一句话" },
        p: { en: "Paste a card's starter prompt below into the request box, or write your own idea in one sentence.",
             zh: "把下面某张卡的起手 prompt 贴进需求框，或者用一句话写自己的点子。" } },
      { h: { en: "Let an AI write it", zh: "让 AI 写" },
        p: { en: "Tap Copy AI prompt, paste it into any AI chat, and copy the HTML it gives back. With your own OpenRouter key in Settings, Generate does it in place.",
             zh: "点「复制 AI 提示词」，贴进任意 AI 聊天，再把它给的 HTML 复制回来。在设置里填了自己的 OpenRouter key，按「生成」就当场写好。" } },
      { h: { en: "Paste, run, fix", zh: "粘贴、运行、修" },
        p: { en: "Tap Paste code, then Save and run. Something is off the first time? Tell the AI exactly what, paste the new version.",
             zh: "点「粘贴代码」，再「保存并运行」。第一次不对劲？把哪里不对原样告诉 AI，贴回新的版本。" } },
      { h: { en: "Put it in the store", zh: "放进商店" },
        p: { en: "On a computer: give sdk/PROMPT.md to your AI with your idea, try it in sdk/dev.html, run tools/check-app.mjs, and open a pull request. Your name goes on the app.",
             zh: "在电脑上：把 sdk/PROMPT.md 和你的点子交给 AI，在 sdk/dev.html 里试，跑通 tools/check-app.mjs，再开一个 pull request。app 上会写你的名字。" } }
    ],

    /* Challenge cards. stars: 1 one screen and one save; 2 a few screens, sound or timing; 3 import/export or a data-safety trap. */
    cards: [
      { id: "receipt-ledger", issue: 191, stars: 3, hours: "2",
        name: { en: "Receipt Ledger", zh: "小票账本" },
        what: { en: "Log small spending and income; see today's and this month's totals.", zh: "随手记一笔花销或收入，看今天和本月的合计。" },
        looks: { en: "Every entry prints out like a cash-register receipt, line by line, with a tick.", zh: "每记一笔，屏幕就像收银机一样逐行「打印」出一张小票。" },
        twist: { en: "A paper roll: you never edit an entry, you add a reversing one.", zh: "一卷纸：记错了不改原记录，而是再记一笔冲掉。" },
        skip: { en: "Bank sync, exchange rates, chart libraries.", zh: "银行同步、汇率、图表库。" },
        prompt: "A pocket expense ledger that looks like a cash-register receipt roll. Add an entry with amount, category (food, transport, home, fun, other) and a short note; each new entry \"prints\" line by line with a tick sound. Show today's and this month's totals, and a simple per-category bar chart drawn with blocks. Corrections are new reversing entries, never edits. Save with PAD.save under one key with a version field \"v\"; if the save is from a newer version, refuse to overwrite it and say so. Export all entries as CSV with PAD.exportFile." },
      { id: "slide-rule", issue: 192, stars: 2, hours: "1.5",
        name: { en: "Slide Rule", zh: "换算尺" },
        what: { en: "Kitchen, travel and DIY unit conversions on one screen.", zh: "厨房、出行、装修常用的单位换算，一屏搞定。" },
        looks: { en: "A slide rule: drag the slide to the mark and read the answer underneath.", zh: "一把计算尺：拖动滑尺对准刻度，下面读出结果。" },
        twist: { en: "No dropdowns. It is only as precise as you can read the scale.", zh: "没有下拉菜单。能读到多准，就有多准。" },
        skip: { en: "A calculator (the store has one), currency.", zh: "计算器（商店已有）、汇率。" },
        prompt: "A unit converter drawn as a slide rule. Pick a pair (C/F, cm/inch, kg/lb, g/cup of flour, g/cup of sugar, ml/cup, km/mile, MB/GB). Drag the slide or press left/right to move it; the reading under the rule shows the converted value. Name the assumption for cups (which ingredient, which cup). Keep the last five conversions with PAD.save and show them as rows under the rule." },
      { id: "tally-board", issue: 193, stars: 2, hours: "1.5",
        name: { en: "Tally Board", zh: "正字计数" },
        what: { en: "Count a few daily habits: water, practice, a walk.", zh: "给几件日常习惯计数：喝水、练琴、散步。" },
        looks: { en: "Each tap draws one stroke; five strokes close a tally with a click. Thirty days of grids below.", zh: "点一下写一笔，五笔成一个「正」字，咔嗒一声。下面是 30 天的格子。" },
        twist: { en: "A mechanical counter: it counts, it never nags.", zh: "机械计数器：只管数，不催你。" },
        skip: { en: "Reminders, notifications, health advice.", zh: "提醒、通知、健康建议。" },
        prompt: "A habit tally board. The user names up to six habits. Each tap adds one stroke; five strokes make one Chinese character 正 (in English, four bars and a slash). Show today's tallies, the current streak, and a 30-day grid per habit. Renaming or removing a habit keeps its past records. It is a manual log: no reminders, no health advice. Save with PAD.save with a version field." },
      { id: "wind-up-timer", issue: 194, stars: 2, hours: "1.5",
        name: { en: "Wind-up Timer", zh: "发条蛋表" },
        what: { en: "A kitchen countdown and a stopwatch.", zh: "厨房倒计时和秒表。" },
        looks: { en: "Turn the dial to wind it, hear it tick, and it rings at zero.", zh: "转表盘上发条，嘀嗒嘀嗒，到点叮铃铃。" },
        twist: { en: "However far you wind it, that is how long it runs.", zh: "拧多少，就走多少。" },
        skip: { en: "Background alarms. It keeps time only while open, and says so.", zh: "后台闹钟。只在打开时计时，并且写明。" },
        prompt: "A wind-up kitchen timer. Drag around the dial to wind it (one full turn = 60 minutes); it starts when released and ticks quietly. At zero it rings with a short original melody using PAD.music. Also a stopwatch mode. Time is measured from timestamps, not frame counts. The first screen says clearly that it only keeps time while the app is open. Save the last few durations as presets." },
      { id: "errand-pad", issue: 195, stars: 1, hours: "1",
        name: { en: "Errand Pad", zh: "购物便签" },
        what: { en: "A shopping list for one thumb while the other hand holds the basket.", zh: "一手提篮子，一只拇指打勾的购物清单。" },
        looks: { en: "Big rows; crossed items sink to the bottom; staples come back with one tap.", zh: "整行大按钮，划掉的沉到底部，常买的一点就回来。" },
        twist: { en: "One sheet torn from a pad. Done shopping? Tear it off.", zh: "从便签本上撕下的一张。买完了就撕掉。" },
        skip: { en: "Sharing, prices, barcodes.", zh: "多人共享、价格、条码。" },
        prompt: "A one-handed shopping list, like a single note torn from a pad. Big full-width rows; tap to cross an item out and it sinks to the bottom. Items have an optional quantity and an aisle group (produce, dairy, pantry, home, other). Starred staples come back with one tap. \"Tear off\" clears crossed items and starts a fresh sheet. Save with PAD.save." },
      { id: "suitcase", issue: 198, stars: 2, hours: "1.5-2",
        name: { en: "Suitcase", zh: "行李箱" },
        what: { en: "Reusable packing lists for trips, the gym and school.", zh: "出差、健身、上学可以反复用的打包清单。" },
        looks: { en: "Each checked item fills the suitcase; check the last one and the lid snaps shut.", zh: "每勾一样，箱子满一点；勾完最后一样，箱子「咔」地合上。" },
        twist: { en: "The list is the suitcase. You can leave when it closes.", zh: "清单就是箱子。关得上，才能出门。" },
        skip: { en: "Weather, itineraries, free-form notes.", zh: "天气、行程、自由笔记。" },
        prompt: "A packing checklist drawn as a suitcase. The user keeps named templates (trip, gym, school), each with groups and quantities. Start a trip by copying a template. Each checked item fills the suitcase picture a little more; when all are checked the lid closes with a sound. Reset unchecks everything without changing the template. Save with PAD.save with a version field." },
      { id: "password-dice", issue: 196, stars: 2, hours: "1.5",
        name: { en: "Password Dice", zh: "密码骰子" },
        what: { en: "Roll a PIN, a password or a memorable passphrase.", zh: "掷出 PIN、密码或好记的单词口令。" },
        looks: { en: "Dice tumble across the screen; each roll lands on a word.", zh: "骰子在屏幕上滚，停下来就是一个单词。" },
        twist: { en: "Like rolling real dice against a word list. Write it on paper; nothing is kept.", zh: "像拿真骰子查单词表。抄在纸上，什么都不保存。" },
        skip: { en: "Saving secrets, sync, export. It is not a password vault.", zh: "保存密码、同步、导出。它不是密码管理器。" },
        prompt: "Password dice. Modes: PIN (4-8 digits), password (length and character sets), and passphrase (4-6 common English words). Use crypto.getRandomValues only, never Math.random. For words, use PAD.dict.words({len, level, max}) if PAD.dict exists, otherwise a small built-in list. Show rolling dice before each result and the strength in bits. Never save what it generates; say on screen that it is not a password vault." },
      { id: "morse-drill", issue: 197, stars: 3, hours: "2",
        name: { en: "Morse Drill", zh: "电码练习" },
        what: { en: "A few minutes of Morse code a day: listen and key.", zh: "每天几分钟摩斯电码：听，再敲。" },
        looks: { en: "Hold A and it beeps; a paper tape prints dots and dashes; right letters drop into place.", zh: "按住 A 发出「嘀」，纸带打出点和划，对的字母落进格子。" },
        twist: { en: "A telegraph key and a paper tape. Radio's little sibling: it practises, it never sends.", zh: "电报键加纸带。和「电波台」是一对：只练习，不发送。" },
        skip: { en: "Microphone decoding, networking.", zh: "麦克风识别、联机。" },
        prompt: "A Morse code trainer with a telegraph key. Hold A (or the big on-screen key) to send; a paper tape shows dots and dashes. Lessons add two letters at a time (Koch order); modes: listen and pick the letter, or hear a letter and key it. Speed in WPM is adjustable; explain that a dash is three dots long and gaps are one, three and seven. Keep accuracy per letter with PAD.save." },
      { id: "study-hall", issue: 199, stars: 2, hours: "1.5",
        name: { en: "Study Hall", zh: "自习室" },
        what: { en: "A focus timer: 25 minutes of work, 5 of rest, rounds counted.", zh: "番茄钟：专注 25 分钟，休息 5 分钟，记下完成几轮。" },
        looks: { en: "A tiny pixel study room with rain at the window, and you hear it. Each round adds a book to the desk.", zh: "一间点阵自习室，窗外下着雨，真的听得见。每完成一轮，桌上多一本书。" },
        twist: { en: "A timer that does one thing, plus a window.", zh: "一台只做一件事的计时器，再加一扇窗。" },
        skip: { en: "Background notifications, task lists, reports.", zh: "后台通知、任务管理、统计报表。" },
        prompt: "A focus timer set in a tiny pixel study room. Work and break lengths (25/5 by default, editable). Start, pause, skip, reset. During work, PAD.ambience plays rain or fire at low level; at each switch, a short sound and, if PAD.say exists, one short spoken line. Each finished session adds a book to the desk; keep the history with PAD.save. Time comes from timestamps; say that it only runs while the app is open." },
      { id: "fortune-sticks", issue: 200, stars: 2, hours: "1.5",
        name: { en: "Fortune Sticks", zh: "摇签筒" },
        what: { en: "What's for lunch, who does the dishes: put the options in a cup and shake one out.", zh: "今天吃什么、谁洗碗：把选项放进签筒，摇一支出来。" },
        looks: { en: "Shake the phone, the cup rattles, and one stick jumps out with the answer.", zh: "晃手机，签筒哗啦作响，跳出一支签，上面就是答案。" },
        twist: { en: "You really shake it. Or press A to give it a tap.", zh: "真的要摇。不想摇，就按 A 拍一下。" },
        skip: { en: "Fortunes and horoscopes, gambling-style rewards.", zh: "算命运势、赌博式的奖励。" },
        prompt: "A cup of bamboo sticks for everyday decisions. The user keeps named lists (lunch, chores, games). Shake the phone (PAD.motion with PAD.on(\"shake\")) or press A to shake the cup; sticks rattle and one jumps out with the choice. Options: put the stick back, or keep it out until the list is reset, and avoid repeating the last pick. Keys must also work without motion. Save lists with PAD.save." }
    ],

    /* Filled in when the event ends:
       summary: { text: {en, zh}, apps: [{ app: "<registry id>", name: {en, zh}, by: "<github login>", card: "<card id>" }] }
       The page shows events/shots/<event id>/<app>.png for each app. */
    summary: null
  }
];
