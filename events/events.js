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
      en: "Ten small, useful programs for a 1986 handheld. Taste one on your phone in ten minutes, or ship it to the store from a computer in an evening.",
      zh: "十个给 1986 年掌机做的实用小程序。在手机上十分钟尝个鲜，或者在电脑上花一个晚上，把它送进商店。"
    },

    /* Two ways in. The phone is a taste: a script in ten minutes, only for you. The computer is the real thing:
       an app in the store, built with an AI coding agent. Each way has its steps, three short facts and a little
       screen ("demo") that types its lines one after another; the page draws the phone's on the LCD, the computer's
       in a terminal. Names in the steps are the runtime's own labels (runtime/strings.js), so people find the buttons. */
    ways: [
      { id: "phone",
        where: { en: "On your phone", zh: "在手机上" },
        time: { en: "10 minutes", zh: "十分钟" },
        title: { en: "Taste it", zh: "尝个鲜" },
        lede: { en: "Say what you want in one line. An AI writes it, it runs on the handheld, and you change it with another line.",
                zh: "一句话说你想要什么。AI 写好，掌机上就能跑；想改，再说一句。" },
        facts: [
          { k: { en: "You need", zh: "要准备" },
            v: { en: "Your phone, and a key for one AI line: DeepSeek, Kimi, Qwen, SiliconFlow or OpenRouter. Or any AI chat.",
                 zh: "一台手机，一把 AI 线路的 key：DeepSeek、Kimi、通义千问、硅基流动或 OpenRouter，任选一家。或者任意 AI 聊天。" },
            /* the handheld's own Settings, AI line, + Add line page (events/img/) */
            pic: { src: { en: "img/ai-lines-en.png", zh: "img/ai-lines-zh.png" },
                   alt: { en: "The handheld's Add a line page: OpenRouter, DeepSeek, Kimi, Qwen and SiliconFlow, each with how you pay",
                          zh: "掌机的「添加线路」页：OpenRouter、DeepSeek、Kimi、通义千问、硅基流动，每家写着怎么付款" } } },
          { k: { en: "Who sees it", zh: "谁能看到" }, v: { en: "Only you", zh: "只有你自己" } },
          { k: { en: "It lives", zh: "放在哪" }, v: { en: "In Scripts, on this phone", zh: "这台手机的「脚本」里" } }
        ],
        steps: [
          { h: { en: "Open Lo-PDA", zh: "打开 Lo-PDA" },
            p: { en: "Open it on your phone and add it to the Home Screen.",
                 zh: "在手机上打开，添加到主屏幕。" } },
          { h: { en: "Connect an AI line", zh: "接一条 AI 线路" },
            p: { en: "Settings, AI line, + Add line: DeepSeek, Kimi, Qwen, SiliconFlow or OpenRouter, and paste your key. No key? Skip it: Copy AI prompt works with any AI chat.",
                 zh: "设置 → AI 线路 → ＋ 添加线路：DeepSeek、Kimi、通义千问、硅基流动或 OpenRouter，粘贴 key。没有 key 也行：「复制 AI 提示词」，贴进任意 AI 聊天。" } },
          { h: { en: "One line, then Generate", zh: "一句话，按「生成」" },
            p: { en: "In Scripts, Write the idea: paste a card's one-liner below, or your own. Tap Generate and watch it write.",
                 zh: "进「脚本」→「写需求」：贴一张卡的一句话，或者写你自己的。按「生成」，看它一行一行写出来。" } },
          { h: { en: "Run it", zh: "跑起来" },
            p: { en: "Save and run. It is a real program on the handheld, with its own saves.",
                 zh: "按「保存并运行」。这是掌机上一个真的程序，有自己的存档。" } },
          { h: { en: "Revise", zh: "改一改" },
            p: { en: "Not quite? Revise, one sentence: \"bigger digits\". The old code is kept first, under Options, Versions.",
                 zh: "差一点？「改一改」，一句话：「数字再大一点」。旧代码先存好，在「选项 → 版本」里。" } }
        ],
        end: { en: "Like it? Options, Export script gives you the file: the first draft for the computer.",
               zh: "喜欢的话，「选项 → 导出脚本」拿到文件，带去电脑上当初稿。" },
        demo: [
          { en: "> a wind-up kitchen timer", zh: "> 一个发条蛋表" },
          { en: "AI is writing... 2318 chars", zh: "AI 在写… 2318 字" },
          { en: "Done. Save and run", zh: "写好了。保存并运行" },
          { en: "> revise: bigger digits", zh: "> 改一改：数字再大一点" },
          { en: "Revised. Old one kept", zh: "改好了。旧的已存好" }
        ] },
      { id: "computer",
        where: { en: "On a computer", zh: "在电脑上" },
        time: { en: "An evening", zh: "一个晚上" },
        title: { en: "Ship it", zh: "做成真的" },
        lede: { en: "Build a proper app with an AI coding agent, check it, and send it to the store. Everyone with Lo-PDA can install it.",
                zh: "和 AI 编程助手一起做一个正式的 app，检查通过，送进商店。每个用 Lo-PDA 的人都能装。" },
        facts: [
          { k: { en: "You need", zh: "要准备" }, v: { en: "A computer, git, an AI coding agent", zh: "一台电脑、git、一个 AI 编程助手" } },
          { k: { en: "Who sees it", zh: "谁能看到" }, v: { en: "Everyone with Lo-PDA", zh: "所有 Lo-PDA 用户" } },
          { k: { en: "It lives", zh: "放在哪" }, v: { en: "In the store, with your name", zh: "商店里，写着你的名字" } }
        ],
        steps: [
          { h: { en: "Get the repo", zh: "拿到代码" },
            p: { en: "Fork nowheremanx/lopda on GitHub and clone it.",
                 zh: "在 GitHub 上 fork nowheremanx/lopda，再 clone 下来。" } },
          { h: { en: "Brief your agent", zh: "交代给助手" },
            p: { en: "Open the folder in Claude Code, Codex or the agent you use. Point it at sdk/PROMPT.md (games: sdk/LO-GAME.md), paste a card's starter prompt, and ask for registry/apps/<your-id>/. Started on the phone? Give it your exported script too.",
                 zh: "用 Claude Code、Codex 或你常用的助手打开这个文件夹。让它读 sdk/PROMPT.md（游戏读 sdk/LO-GAME.md），贴上卡片的起手 prompt，让它写到 registry/apps/<你的 id>/。手机上做过？把导出的脚本也交给它。" } },
          { h: { en: "Try it", zh: "试一试" },
            p: { en: "python3 -m http.server, then sdk/dev.html?app=registry/apps/<your-id>. Tell the agent exactly what is off.",
                 zh: "python3 -m http.server，打开 sdk/dev.html?app=registry/apps/<你的 id>。哪里不对，原样告诉助手。" } },
          { h: { en: "Check it", zh: "过检查" },
            p: { en: "node tools/check-app.mjs registry/apps/<your-id> must say PASS. Then node tools/build-index.mjs.",
                 zh: "node tools/check-app.mjs registry/apps/<你的 id> 要显示 PASS。再跑 node tools/build-index.mjs。" } },
          { h: { en: "Open a pull request", zh: "开 pull request" },
            p: { en: "Name the card you picked. Once it is merged, it is in the store for everyone, with your name on it.",
                 zh: "写上你选的卡。合并以后它就进了商店，人人能装，上面写着你的名字。" } }
        ],
        end: { en: "Stuck? Each card links to its issue: ask there.",
               zh: "卡住了？每张卡都连着它的 issue，在那里问。" },
        demo: [
          { en: "> read sdk/PROMPT.md, build the Wind-up Timer card", zh: "> 读 sdk/PROMPT.md，做「发条蛋表」这张卡" },
          { en: "  wrote manifest.json, index.html", zh: "  wrote manifest.json, index.html" },
          { en: "$ node tools/check-app.mjs registry/apps/wind-up", zh: "$ node tools/check-app.mjs registry/apps/wind-up" },
          { en: "PASS  wind-up", zh: "PASS  wind-up" },
          { en: "$ git push, open a pull request", zh: "$ git push，开 pull request" }
        ] }
    ],

    /* Challenge cards. stars: 1 one screen and one save; 2 a few screens, sound or timing; 3 import/export or a data-safety trap.
       idea: the one line to write in Scripts on the phone; revise: two follow-up asks for Revise;
       prompt: the full brief for a coding agent (English, like the SDK). */
    cards: [
      { id: "receipt-ledger", issue: 191, stars: 3, hours: "2",
        name: { en: "Receipt Ledger", zh: "小票账本" },
        idea: { en: "A spending log that prints each entry like a cash-register receipt, with today's and this month's totals.", zh: "一个记账本：每记一笔，就像收银机一样打出一张小票；显示今天和本月的合计。" },
        revise: [{ en: "Add a bar chart per category, drawn with blocks", zh: "用方块画一个按类别的柱状图" }, { en: "Mistakes are fixed with a reversing entry, never by editing", zh: "记错了不能改，只能再记一笔冲掉" }],
        what: { en: "Log small spending and income; see today's and this month's totals.", zh: "随手记一笔花销或收入，看今天和本月的合计。" },
        looks: { en: "Every entry prints out like a cash-register receipt, line by line, with a tick.", zh: "每记一笔，屏幕就像收银机一样逐行「打印」出一张小票。" },
        twist: { en: "A paper roll: you never edit an entry, you add a reversing one.", zh: "一卷纸：记错了不改原记录，而是再记一笔冲掉。" },
        skip: { en: "Bank sync, exchange rates, chart libraries.", zh: "银行同步、汇率、图表库。" },
        prompt: "A pocket expense ledger that looks like a cash-register receipt roll. Add an entry with amount, category (food, transport, home, fun, other) and a short note; each new entry \"prints\" line by line with a tick sound. Show today's and this month's totals, and a simple per-category bar chart drawn with blocks. Corrections are new reversing entries, never edits. Save with PAD.save under one key with a version field \"v\"; if the save is from a newer version, refuse to overwrite it and say so. Export all entries as CSV with PAD.exportFile." },
      { id: "slide-rule", issue: 192, stars: 2, hours: "1.5",
        name: { en: "Slide Rule", zh: "换算尺" },
        idea: { en: "A unit converter drawn as a slide rule: drag the slide, read the answer underneath. C/F, cm/inch, kg/lb.", zh: "一把换算尺：拖动滑尺，下面读出结果。摄氏和华氏、厘米和英寸、公斤和磅。" },
        revise: [{ en: "Add cups of flour and sugar, and say which cup", zh: "加上一杯面粉、一杯糖各多少克，写明是哪种杯子" }, { en: "Keep my last five conversions", zh: "记住最近五次换算" }],
        what: { en: "Kitchen, travel and DIY unit conversions on one screen.", zh: "厨房、出行、装修常用的单位换算，一屏搞定。" },
        looks: { en: "A slide rule: drag the slide to the mark and read the answer underneath.", zh: "一把计算尺：拖动滑尺对准刻度，下面读出结果。" },
        twist: { en: "No dropdowns. It is only as precise as you can read the scale.", zh: "没有下拉菜单。能读到多准，就有多准。" },
        skip: { en: "A calculator (the store has one), currency.", zh: "计算器（商店已有）、汇率。" },
        prompt: "A unit converter drawn as a slide rule. Pick a pair (C/F, cm/inch, kg/lb, g/cup of flour, g/cup of sugar, ml/cup, km/mile, MB/GB). Drag the slide or press left/right to move it; the reading under the rule shows the converted value. Name the assumption for cups (which ingredient, which cup). Keep the last five conversions with PAD.save and show them as rows under the rule." },
      { id: "tally-board", issue: 193, stars: 2, hours: "1.5",
        name: { en: "Tally Board", zh: "正字计数" },
        idea: { en: "A habit counter: each tap writes one stroke, five strokes make one tally.", zh: "习惯计数：点一下写一笔，五笔成一个「正」字。" },
        revise: [{ en: "Add a 30-day grid under each habit", zh: "每个习惯下面加 30 天的格子" }, { en: "Click when a tally is finished", zh: "写满一个「正」字时咔嗒一声" }],
        what: { en: "Count a few daily habits: water, practice, a walk.", zh: "给几件日常习惯计数：喝水、练琴、散步。" },
        looks: { en: "Each tap draws one stroke; five strokes close a tally with a click. Thirty days of grids below.", zh: "点一下写一笔，五笔成一个「正」字，咔嗒一声。下面是 30 天的格子。" },
        twist: { en: "A mechanical counter: it counts, it never nags.", zh: "机械计数器：只管数，不催你。" },
        skip: { en: "Reminders, notifications, health advice.", zh: "提醒、通知、健康建议。" },
        prompt: "A habit tally board. The user names up to six habits. Each tap adds one stroke; five strokes make one Chinese character 正 (in English, four bars and a slash). Show today's tallies, the current streak, and a 30-day grid per habit. Renaming or removing a habit keeps its past records. It is a manual log: no reminders, no health advice. Save with PAD.save with a version field." },
      { id: "wind-up-timer", issue: 194, stars: 2, hours: "1.5",
        name: { en: "Wind-up Timer", zh: "发条蛋表" },
        idea: { en: "A wind-up kitchen timer: drag around the dial to wind it; it ticks and rings at zero.", zh: "发条蛋表：绕着表盘拖动上发条，嘀嗒嘀嗒走，到点响铃。" },
        revise: [{ en: "Add a stopwatch mode", zh: "加一个秒表模式" }, { en: "Ring with a short melody of its own", zh: "到点的铃声换成一小段原创旋律" }],
        what: { en: "A kitchen countdown and a stopwatch.", zh: "厨房倒计时和秒表。" },
        looks: { en: "Turn the dial to wind it, hear it tick, and it rings at zero.", zh: "转表盘上发条，嘀嗒嘀嗒，到点叮铃铃。" },
        twist: { en: "However far you wind it, that is how long it runs.", zh: "拧多少，就走多少。" },
        skip: { en: "Background alarms. It keeps time only while open, and says so.", zh: "后台闹钟。只在打开时计时，并且写明。" },
        prompt: "A wind-up kitchen timer. Drag around the dial to wind it (one full turn = 60 minutes); it starts when released and ticks quietly. At zero it rings with a short original melody using PAD.music. Also a stopwatch mode. Time is measured from timestamps, not frame counts. The first screen says clearly that it only keeps time while the app is open. Save the last few durations as presets." },
      { id: "errand-pad", issue: 195, stars: 1, hours: "1",
        name: { en: "Errand Pad", zh: "购物便签" },
        idea: { en: "A shopping list with big rows: tap to cross an item out and it sinks to the bottom.", zh: "购物清单：整行大按钮，点一下划掉，划掉的沉到底。" },
        revise: [{ en: "Star staples so they come back with one tap", zh: "常买的加星，一点就回来" }, { en: "Add a Tear off button that clears crossed items", zh: "加一个「撕掉」按钮，清掉划掉的" }],
        what: { en: "A shopping list for one thumb while the other hand holds the basket.", zh: "一手提篮子，一只拇指打勾的购物清单。" },
        looks: { en: "Big rows; crossed items sink to the bottom; staples come back with one tap.", zh: "整行大按钮，划掉的沉到底部，常买的一点就回来。" },
        twist: { en: "One sheet torn from a pad. Done shopping? Tear it off.", zh: "从便签本上撕下的一张。买完了就撕掉。" },
        skip: { en: "Sharing, prices, barcodes.", zh: "多人共享、价格、条码。" },
        prompt: "A one-handed shopping list, like a single note torn from a pad. Big full-width rows; tap to cross an item out and it sinks to the bottom. Items have an optional quantity and an aisle group (produce, dairy, pantry, home, other). Starred staples come back with one tap. \"Tear off\" clears crossed items and starts a fresh sheet. Save with PAD.save." },
      { id: "suitcase", issue: 198, stars: 2, hours: "1.5-2",
        name: { en: "Suitcase", zh: "行李箱" },
        idea: { en: "A packing list drawn as a suitcase: it fills as you check items and shuts when all are done.", zh: "打包清单画成一只行李箱：每勾一样满一点，勾完就合上。" },
        revise: [{ en: "Keep templates: trip, gym, school", zh: "存几个模板：出差、健身、上学" }, { en: "Snap the lid shut with a sound", zh: "合上时「咔」地一声" }],
        what: { en: "Reusable packing lists for trips, the gym and school.", zh: "出差、健身、上学可以反复用的打包清单。" },
        looks: { en: "Each checked item fills the suitcase; check the last one and the lid snaps shut.", zh: "每勾一样，箱子满一点；勾完最后一样，箱子「咔」地合上。" },
        twist: { en: "The list is the suitcase. You can leave when it closes.", zh: "清单就是箱子。关得上，才能出门。" },
        skip: { en: "Weather, itineraries, free-form notes.", zh: "天气、行程、自由笔记。" },
        prompt: "A packing checklist drawn as a suitcase. The user keeps named templates (trip, gym, school), each with groups and quantities. Start a trip by copying a template. Each checked item fills the suitcase picture a little more; when all are checked the lid closes with a sound. Reset unchecks everything without changing the template. Save with PAD.save with a version field." },
      { id: "password-dice", issue: 196, stars: 2, hours: "1.5",
        name: { en: "Password Dice", zh: "密码骰子" },
        idea: { en: "Password dice: roll a PIN, a password or four words, with tumbling dice. Never save anything.", zh: "密码骰子：掷出 PIN、密码或四个单词，骰子会滚；什么都不保存。" },
        revise: [{ en: "Show the strength in bits", zh: "显示强度有多少 bit" }, { en: "Take the words from PAD.dict.words", zh: "单词从 PAD.dict.words 里取" }],
        what: { en: "Roll a PIN, a password or a memorable passphrase.", zh: "掷出 PIN、密码或好记的单词口令。" },
        looks: { en: "Dice tumble across the screen; each roll lands on a word.", zh: "骰子在屏幕上滚，停下来就是一个单词。" },
        twist: { en: "Like rolling real dice against a word list. Write it on paper; nothing is kept.", zh: "像拿真骰子查单词表。抄在纸上，什么都不保存。" },
        skip: { en: "Saving secrets, sync, export. It is not a password vault.", zh: "保存密码、同步、导出。它不是密码管理器。" },
        prompt: "Password dice. Modes: PIN (4-8 digits), password (length and character sets), and passphrase (4-6 common English words). Use crypto.getRandomValues only, never Math.random. For words, use PAD.dict.words({len, level, max}) if PAD.dict exists, otherwise a small built-in list. Show rolling dice before each result and the strength in bits. Never save what it generates; say on screen that it is not a password vault." },
      { id: "morse-drill", issue: 197, stars: 3, hours: "2",
        name: { en: "Morse Drill", zh: "电码练习" },
        idea: { en: "A Morse trainer: hold A to key, and a paper tape prints the dots and dashes.", zh: "摩斯电码练习：按住 A 发报，纸带打出点和划。" },
        revise: [{ en: "Teach two new letters at a time", zh: "每次只教两个新字母" }, { en: "Add a mode: listen and pick the letter", zh: "加一个听音选字母的模式" }],
        what: { en: "A few minutes of Morse code a day: listen and key.", zh: "每天几分钟摩斯电码：听，再敲。" },
        looks: { en: "Hold A and it beeps; a paper tape prints dots and dashes; right letters drop into place.", zh: "按住 A 发出「嘀」，纸带打出点和划，对的字母落进格子。" },
        twist: { en: "A telegraph key and a paper tape. Radio's little sibling: it practises, it never sends.", zh: "电报键加纸带。和「电波台」是一对：只练习，不发送。" },
        skip: { en: "Microphone decoding, networking.", zh: "麦克风识别、联机。" },
        prompt: "A Morse code trainer with a telegraph key. Hold A (or the big on-screen key) to send; a paper tape shows dots and dashes. Lessons add two letters at a time (Koch order); modes: listen and pick the letter, or hear a letter and key it. Speed in WPM is adjustable; explain that a dash is three dots long and gaps are one, three and seven. Keep accuracy per letter with PAD.save." },
      { id: "study-hall", issue: 199, stars: 2, hours: "1.5",
        name: { en: "Study Hall", zh: "自习室" },
        idea: { en: "A 25/5 focus timer in a tiny pixel study room, with rain at the window.", zh: "番茄钟，放在一间点阵自习室里，窗外下着雨。" },
        revise: [{ en: "Play rain with PAD.ambience while I work", zh: "专注时用 PAD.ambience 放雨声" }, { en: "Put a book on the desk for each round", zh: "每完成一轮，桌上多一本书" }],
        what: { en: "A focus timer: 25 minutes of work, 5 of rest, rounds counted.", zh: "番茄钟：专注 25 分钟，休息 5 分钟，记下完成几轮。" },
        looks: { en: "A tiny pixel study room with rain at the window, and you hear it. Each round adds a book to the desk.", zh: "一间点阵自习室，窗外下着雨，真的听得见。每完成一轮，桌上多一本书。" },
        twist: { en: "A timer that does one thing, plus a window.", zh: "一台只做一件事的计时器，再加一扇窗。" },
        skip: { en: "Background notifications, task lists, reports.", zh: "后台通知、任务管理、统计报表。" },
        prompt: "A focus timer set in a tiny pixel study room. Work and break lengths (25/5 by default, editable). Start, pause, skip, reset. During work, PAD.ambience plays rain or fire at low level; at each switch, a short sound and, if PAD.say exists, one short spoken line. Each finished session adds a book to the desk; keep the history with PAD.save. Time comes from timestamps; say that it only runs while the app is open." },
      { id: "fortune-sticks", issue: 200, stars: 2, hours: "1.5",
        name: { en: "Fortune Sticks", zh: "摇签筒" },
        idea: { en: "A cup of bamboo sticks for everyday choices: shake the phone and one stick jumps out.", zh: "签筒帮你做决定：晃一晃手机，跳出一支签。" },
        revise: [{ en: "Keep lists: lunch, chores, games", zh: "存几组签：午饭、家务、游戏" }, { en: "Never the same stick twice in a row", zh: "别连着两次抽到同一支" }],
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
