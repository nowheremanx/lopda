/* Events: a portrait, a few lines, sometimes a choice. */
var EVENT_ARGS = null;

ART.eventBg = function (g, bg, t) {
  if (bg === "forest") {
    ART.battleBg(g, "forest", t);
    g.dither(0, 0, 216, 40, g.PAPER, 1);
    for (var i = 0; i < 8; i++) g.pixel((i * 41 + t * 7) % 216, 40 + (i * 23) % 120, g.PAPER);
    return;
  }
  if (bg === "deep") {
    ART.battleBg(g, "deep", t);
    g.dither(0, 0, 216, 90, g.PAPER, 1);
    return;
  }
  // shop at night
  g.clear(g.INK);
  g.dither(0, 0, 216, 40, g.DARK, 1);
  g.rect(140, 8, 66, 44, g.DARK);
  g.rect(142, 10, 62, 40, g.MID);
  g.rect(172, 10, 1, 40, g.INK); g.rect(142, 28, 62, 1, g.INK);
  g.pixel(188, 20, g.PAPER); g.pixel(189, 19, g.PAPER); g.pixel(187, 19, g.PAPER); g.pixel(189, 21, g.PAPER);
  g.rect(122, 18, 14, 38, g.INK);
  g.rect(123, 19, 12, 36, g.PAPER);
  g.text("汤", 129, 22, { align: "center" });
  g.rect(112, 34, 10, 12, g.INK);
  g.rect(113, 35, 8, 10, g.MID);
  g.dither(113, 35, 8, 10, g.PAPER, 1);
  g.rect(8, 36, 108, 112, g.MID);
  g.dither(8, 36, 108, 4, g.DARK, 1);
  g.dither(8, 144, 108, 4, g.DARK, 1);
  g.dither(8, 40, 4, 104, g.DARK, 1);
  g.dither(112, 40, 4, 104, g.DARK, 1);
  g.rect(14, 148, 96, 3, g.INK);
  g.dither(0, 152, 216, 30, g.INK, 1);
  if (bg === "dawn") {
    g.dither(0, 0, 216, 60, g.PAPER, 1);
    g.dither(8, 36, 108, 112, g.PAPER, 1);
  }
  for (var d = 0; d < 8; d++) {
    if (Math.floor(t * 2 + d) % 3) g.pixel((d * 29 + t * 5) % 216, 42 + (d * 37) % 100, g.PAPER);
  }
};

game.scene("event", {
  enter: function (args) {
    EVENT_ARGS = args;
    var run = async function () {
      await game.wait(0.18);
      var name = args.name || (args.who && DATA.NPCS[args.who] ? DATA.NPCS[args.who].name : "");
      if (args.pages) await game.say(args.pages, { name: name, speed: 34 });
      var result = 0;
      if (args.choices && args.choices.length) {
        result = await game.choose(args.choices, {
          title: args.title,
          x: 124, y: 52, width: 86,
          cancel: args.cancel === true
        });
      }
      game.pop(result);
    };
    run();
  },
  draw: function (g) {
    if (!EVENT_ARGS) return;
    ART.eventBg(g, EVENT_ARGS.bg || "shop", game.time);
    if (EVENT_ARGS.who) ART.portrait(g, EVENT_ARGS.who, 14, 34);
  }
});

/* ---- morning scenes ---- */
function MorningStory() {
  return (async function () {
    if (!S) return;
    if (S.day === 1 && !seen("intro")) {
      await game.say(["山脚的小馆，今天重新开门。", "娘留下的灶台，火种还在。", "先出门采买，回来再备菜。", "不认识的食材，早市「图鉴」里查。", "七天后的山神宴，是它最后的机会。"]);
      mark("intro");
      return;
    }
    if (S.day === 2 && !seen("zhou1")) {
      var z = await game.push("event", {
        who: "zhou", bg: "dawn",
        pages: ["下雨也得出船。这两条鱼，给你。", "河里的鱼一年比一年少。", "你要是不嫌弃，就算我搭个伙。"],
        choices: ["收下，记你账上", "给你十文"],
        cancel: false
      });
      addIng("fish", 2);
      if (z === 1) {
        if (S.money >= 10) { addMoney(-10); addNpc("zhou", 2); await game.say("老周把钱推回来一半，又塞给你一条鱼。"); addIng("fish", 1); }
        else { addNpc("zhou", 1); await game.say("你摸出几个铜板，老周摆摆手：“先记账。”"); }
      } else addNpc("zhou", 1);
      mark("zhou1");
      sayToast("老周留下两条鱼");
      return;
    }
    if (S.day === 3 && !seen("yan1")) {
      var y = await game.push("event", {
        who: "yan", bg: "forest",
        pages: ["后山那头山猪，最近总来拱我的陷阱。", "山里要封了，猎户也待不久。", "你那个小馆，会做肉吗？"],
        choices: ["教我两手", "帮我打一头"],
        cancel: false
      });
      unlockDish("bamboo_pork");
      addIng("meat", y === 1 ? 2 : 1);
      addNpc("yan", y === 1 ? 2 : 1);
      await game.say("阿岩把切肉的法子说了一遍。笋炒肉，上了菜单。");
      mark("yan1");
      sayToast("学会了「笋炒肉」");
      return;
    }
    if (S.day === 4 && !seen("po4")) {
      await game.push("event", {
        who: "po", bg: "dawn",
        pages: ["初四了。", "一百文，晚上我来取。", "交不上，就拿你那张灶台抵。", "你娘在的时候，可从没欠过。"],
        choices: ["准备好了", "再宽限两天"],
        cancel: false
      });
      addNpc("po", S.money >= 100 ? 1 : 0);
      mark("po4");
      return;
    }
    if (S.day === 5 && !seen("critic5")) {
      await game.push("event", {
        who: "critic", bg: "dawn",
        pages: ["听说山脚有间小馆，汤里有山气。", "你娘在的时候，我来过一回。", "今晚我来。菌菇煲，少一味都不行。"],
        choices: ["一定备好", "我尽量"],
        cancel: false
      });
      unlockDish("mushroom_pot");
      mark("critic5");
      sayToast("学会了「菌菇煲」");
      return;
    }
    if (S.day === 6 && !seen("yan6")) {
      await game.push("event", {
        who: "yan", bg: "deep",
        pages: ["雾一起，山魈就出来。", "你要的那味山珍，在它守着的地方。", "路我给你踩出来了。去不去，你自己定。"],
        choices: ["去", "再等等"],
        cancel: false
      });
      S.flags.deep = 1;
      addNpc("yan", 1);
      addIng("meat", 1);
      mark("yan6");
      sayToast("后山深处可以去了");
      return;
    }
    if (S.day === 7 && !seen("day7")) {
      S.ap = 3;
      await game.say(["今晚山神宴。", "镇上的人都会来。三道菜，别砸了招牌。", "山神也会来。也可能，只是来喝一口汤。", "今天多给你一个时辰。"]);
      mark("day7");
      return;
    }
  })();
}

/* ---- things said over a served table ---- */
function ServiceStory(who, dish) {
  return (async function () {
    var key = "svc_" + who;
    if (seen(key)) return;
    if (who === "ahe") {
      var a = await game.push("event", {
        who: "ahe", bg: "shop",
        pages: ["这碗汤……像我娘做的。", "她走的那年，也是这样的雨天。", "我明天还能来吗？"],
        choices: ["随时来", "要收钱的"],
        cancel: false
      });
      addNpc("ahe", a === 0 ? 1 : 0);
      if (a === 0) await game.say("阿禾笑起来，把碗底最后一口汤喝完了。");
      mark(key);
    } else if (who === "zhou") {
      var b = await game.push("event", {
        who: "zhou", bg: "shop",
        pages: ["鱼还合口吗？", "河里的鱼少了，可我还想再给你送几年。", "你要是不嫌弃，我天天来。"],
        choices: ["鲜", "下次多放姜"],
        cancel: false
      });
      addNpc("zhou", 1);
      if (b === 1) addIng("fish", 1);
      mark(key);
    } else if (who === "yan") {
      var c = await game.push("event", {
        who: "yan", bg: "shop",
        pages: ["肉切得厚。", "山要封了，这可能是最后一头。", "下回我打一头小的，给你练手。"],
        choices: ["跟你学的", "下回你切"],
        cancel: false
      });
      addNpc("yan", 1);
      mark(key);
    } else if (who === "critic") {
      var good = dish === "mushroom_pot";
      await game.push("event", {
        who: "critic", bg: "shop",
        pages: good
          ? ["这锅菌菇煲，火候到了。", "我走过不少地方，这碗汤有山气。", "你娘要是尝到，会放心。"]
          : ["这不是我要的那道菜。", "火候还差一点。", "你娘不会这么急。"],
        choices: good ? ["先生慢用", "还请指教"] : ["对不住", "再给您做一碗"],
        cancel: false
      });
      if (good) {
        addMoney(30);
        addRep(2);
        S.flags.criticGood = 1;
        sayToast("陆先生留下三十文");
      } else {
        addRep(-1);
      }
      mark(key);
    } else if (who === "po") {
      var vip = dish === "god_soup";
      await game.push("event", {
        who: "po", bg: "shop",
        pages: vip
          ? ["这碗羹……山神会记得。", "你娘当年，也是这么端上来的。", "小馆保住了。"]
          : ["心意到了。", "明年再说明年的话。", "灶台我先不收了。"],
        cancel: false
      });
      if (vip) S.flags.vip = (S.flags.vip || 0) + 1;
      else S.flags.vipFail = (S.flags.vipFail || 0) + 1;
      mark(key);
    }
  })();
}
