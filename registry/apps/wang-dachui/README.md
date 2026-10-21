# 王大锤 / Dachui

A Lo-PDA visual novel in six chapters and five endings. The story is a free adaptation of
大咕咕鸡's short piece 「亲子贴：我的儿子王大锤」: a father narrates his eleven-year-old son's
grandiose campaign to prove that spiritual power is real. The adaptation keeps the father's
deadpan voice, the midnight meal, the enamel basin and the final alley, and rewrites the rest
for a family-friendly screen: the son's "spiritual exercises" are daydreaming and standing
with a basin on his head, not anything sexual.

## Story map

```
序  title
一  家长会      school gate → office → home → midnight kitchen
二  全校大会    schoolyard → classroom → bedroom
三  顶盆        classroom → home → courtyard
四  姑奶奶      Baoding courtyard → Baoding night
五  浪潮        brick wall → hutong
六  胡同        final choice
```

Seven choices set flags, but only the last one picks an ending. The first six choices decide
which *version* of the last chapter you get, and which of the two special endings opens.

| Chapter | Choice | Flags |
|---|---|---|
| 1 家长会 | scold / ask if it hurts / say nothing | `harsh` / `warm` / `silent` |
| 1 midnight | speak / go back to bed / leave water | `ask` / `quiet` / `water` |
| 2 全校大会 | stand and clap / look down / drag him off | `stood` / `ashamed` / `dragged` |
| 3 顶盆 | take the basin / let him wear it / buy a bigger one | `basin_remove` / `basin_allow` / `basin_bigger` |
| 3 爸，你来 | refuse / wear it yourself / ask what power | `basin_refuse` / `basin_self` / `basin_ask` |
| 4 姑奶奶 | train too / watch / leave early | `trained` / `watched_again` / `left_early` |
| 5 浪潮 | argue / ask how / admit | `argue` / `ask_wave` / `admit` |
| 6 胡同 | fight / step back / stand beside him / walk away | ending |

Endings:

1. **完了** — fight or step back. The canonical ending: the father understands he has already
   handed something over.
2. **并肩** — stand beside him, default. They run at five in the morning.
3. **顶盆** — stand beside him after wearing the basin yourself in chapter 3 *and* clapping for
   him in chapter 2. The father ends up on the podium, wearing the basin.
4. **长大** — stand beside him after the warm chapter-1 choices (`warm` plus either `water` or `ask`).
   The hug, the midnight meal, the dream of stars in the basin.
5. **出走** — walk away. The son leaves for Baoding; years later, a television interview.

The chapter cards are snapshots, so replaying a finished chapter starts with the flags it had
when the chapter began. Endings and finished chapters are saved separately, so a new game does
not erase the gallery.

## Art direction

The whole screen is four tones: ink, dark, mid, paper. The look is a woodcut picture book:
big silhouettes, hard light, brick and paper texture, rain drawn as short diagonal strokes.
Everything is procedural; there are no image files.

- **Busts, 48×58.** The son's head is deliberately too big for his body. The father is all
  shoulders and tired eyes; the teacher is glasses and a tracksuit; the great-aunt is small,
  white-haired and unmovable.
- **Layered backdrops, 160×144.** Each scene has a foreground, a midground and a light source.
  The dialogue box covers the bottom 56 pixels, so the composition lives in the top 88.
- **Animated light.** Rain, cigarette smoke, fridge light, a flickering tube, dust in the
  schoolyard, cicada shimmer in Baoding, the streetlight cone in the hutong.
- **Comic stamps.** A small paper card in the corner marks an object (cucumber, basin, book,
  fist, wave, lamp) for a few seconds. They are chapter props, not a HUD.
- **Chapter posters.** Six full-screen cards, each with its own composition: a gate at night,
  a podium, a giant basin, a courtyard, a wave, the final alley.
- **Ending posters.** Five full-screen compositions, each with its own light and weather.

## Controls

- A / START / tap: advance, confirm.
- B: backlog. Up/Down scroll; A or B closes.
- SELECT: chapter select (only chapters already finished). A enters, B returns.
- D-pad + A: choices.
- The title screen: Up/Down, A; SELECT opens chapters; B does nothing there.

## Build and check

```sh
node tools/bundle-app.mjs registry/apps/wang-dachui
node tools/check-app.mjs registry/apps/wang-dachui
node tools/build-index.mjs
node --test
```

The story graph can be walked without a browser with `tests/wang-dachui-story.test.mjs`
(every label resolves, every choice is reachable, every ending is reachable).

## Credits

- Story: free adaptation of 大咕咕鸡's 「亲子贴：我的儿子王大锤」. The original's characters and
  best lines are the source; the adaptation and all new scenes are by Haowei Wu.
- Code, art, music: Haowei Wu, MIT.
- Framework: `sdk/lo-game.js` (MIT), font lopix12 (SIL OFL 1.1).
