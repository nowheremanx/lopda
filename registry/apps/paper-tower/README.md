# 纸塔 (Paper Tower)

A 24-page tower-climbing RPG for Lo-PDA. Walk, open doors, take stones, fight with arithmetic,
buy from four ink shops, and find the folds. It follows the classic key-and-door tradition, but
every page, name, line of text, sprite and note here is original to this game. No map, character,
story or music is copied from another tower game.

## The tower

Four zones of six pages. A keeper stands in front of the way up on pages 6, 12, 18; the Bookworm
King waits on page 24, on the lamp stand. The three wicks are in the folds of pages 7, 13 and 19;
with all three the King is weaker (15% ATK and DEF), but a player who never opens a fold can still
finish the climb.

The economy is the "generous" kind: shop prices are fixed, stock never refills, fountains heal
to full, and a fall is not a game over. The tower folds the player back to the page's entrance
and takes a fifth of the gold. A fight is always deterministic:

```
damage per hit = ATK - monster DEF
hits           = ceil(monster HP / damage per hit)
cost           = max(0, monster ATK - DEF) * hits
```

The forecast on the map, the bestiary and the walker test all use this one function. If damage is
zero the fight cannot start; if the cost is greater than or equal to current HP it is a fall.

## Files

```
manifest.json     store entry (buttons: true, no permissions)
index.html        bundled app; do not edit by hand
src/data.js       pages, monsters, bosses, items, shops, people (pure data)
src/rules.js      state, movement, fights, doors, shops, fountains, saves (pure functions)
src/art.js        16x16 sprites and tiles, four tones, original
src/music.js      eight original MML songs and custom effects
src/game.js       scenes, drawing, menus, touch, save slots, battle and ending
```

## Playing and checking

```sh
node tools/bundle-app.mjs registry/apps/paper-tower   # after any src/ or text change
node tools/check-app.mjs registry/apps/paper-tower
node --test tests/paper-tower.test.mjs
```

`tests/paper-tower.test.mjs` checks the page geometry, the stairs without folds, the wicks being
hidden, the battle arithmetic, shops, saves, music parsing, and runs a greedy walker from page 1
to the lamp. It also runs the same walker without revealing any fold, which must still finish
(without the three wicks), so the game never depends on a secret.
