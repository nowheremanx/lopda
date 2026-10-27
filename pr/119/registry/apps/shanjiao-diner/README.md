# 山脚小馆

A seven-day restaurant game for Lo-PDA, 216×240 in four tones. Gather in the mountain, cook what you can, and keep the little diner open until the mountain god's feast.

## Play

Open the Store, or `sdk/dev.html?app=registry/apps/shanjiao-diner`.

- Arrow keys: choose / walk
- A: confirm / gather / serve
- B: back / open the stock list during service
- START: pause during service

## The week

Morning has two actions: go out to the mountain, then come back and prep. The menu is at most four dishes; portions use the pantry. At 18:00 the door opens: customers sit, order, wait, eat and pay. At 22:00 the ledger closes, rent is due on days 4 and 7, and the next morning begins.

Day 7 is the mountain god's feast. Three guests matter; the best ending wants the dish from the deep mountain, a good name, and someone who stayed.

## What is in it

- 8 dishes, 7 ingredients, 4 enemies (one boss)
- 5 shop upgrades, 4 regulars with affinity, 3 helpers
- 2 mountain maps, 7 days, 4 endings
- Original pixel art, original MML music and ambience

## Files

`index.html` is the shipped single file. The source is in `src/`; after editing run:

```sh
node tools/bundle-app.mjs registry/apps/shanjiao-diner
node tools/check-app.mjs registry/apps/shanjiao-diner
```

MIT License, like the rest of Lo-PDA.
