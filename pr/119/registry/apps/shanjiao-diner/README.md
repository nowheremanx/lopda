# 山脚小馆

A seven-day restaurant game for Lo-PDA, 216×240 in four tones. Gather in the mountain, cook what you can, and keep the little diner open until the mountain god's feast.

## Play

Open the Store, or `sdk/dev.html?app=registry/apps/shanjiao-diner`.

- Arrow keys: choose / walk
- A: confirm / gather / serve
- B: back / open the stock list during service; the cursor stays on the action you left
- START: pause during service; in the mountain, open the codex
- SELECT: the layout grid (development)

## The week

Morning has two actions: go out to the mountain, then come back and prep. The menu is at most four dishes; portions use the pantry. At 18:00 the door opens: customers sit, order, wait, eat and pay. At 22:00 the ledger closes, rent is due on days 4 and 7, and the next morning begins.

Day 7 is the mountain god's feast. Three guests matter; the best ending wants the dish from the deep mountain, a good name, and someone who stayed.

## What is in it

- 8 dishes, 7 ingredients, 4 enemies (one boss)
- an ingredient / dish / beast codex (早市「图鉴」, or START in the mountain)
- 5 shop upgrades, 4 regulars with affinity, 3 helpers
- 2 mountain maps, 7 days, 4 endings
- Original pixel art, original MML music and ambience

## Files

`index.html` is the shipped single file. The source is in `src/`; after editing run:

```sh
node tools/bundle-app.mjs registry/apps/shanjiao-diner
node tools/check-app.mjs registry/apps/shanjiao-diner
```

The screen layout lives in `src/30-ui.js` (header / body / action / footer bands,
text fitting, lists, order tags). The art is in `src/20-art.js`; the three
background plates are generated into `src/25-plates.js` by:

```sh
node tools/art-shanjiao.mjs      # needs Playwright; writes drafts/plates/*.png
```

The plates are 216 x 240, four tones, 2-bit RLE (5.0 / 9.7 / 9.8 KB). Tables,
people, steam, rain and the lantern glow stay live on top. In `sdk/dev.html`,
SELECT toggles the layout grid.

## Balance

The whole seven-day loop can be simulated without a browser:

```sh
node tools/sim-shanjiao.mjs --runs=300       # every policy
node tools/sim-shanjiao.mjs --policy=tuned --trace
node tools/sim-shanjiao.mjs --before --runs=300   # the numbers before the 2026-10 patch
node tools/sim-shanjiao.mjs --boss           # the mountain spirit alone
```

It reads `src/10-data.js`, so a dish, enemy or rent change shows up in the next
run. It assumes perfect service, so treat it as an upper bound, not a playtest.
The design notes and the target numbers are in `docs/design/shanjiao-production.md`.

MIT License, like the rest of Lo-PDA.
