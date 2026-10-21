# 纸塔 (Paper Tower)

A 50-page tower-climbing RPG for Lo-PDA. Walk, open doors, take stones, fight with arithmetic,
buy from five ink shops, and find the folds. It follows the classic key-and-door tradition, but
every page, name, line of text, sprite and note here is original to this game. No map, character,
story or music is copied from another tower game.

## The tower

Five zones of ten pages. A keeper stands in front of the way up on pages 10, 20 and 30; the Ink Sea Lord guards page 40
and the Bookworm King waits on page 50, on the lamp stand. The
five wicks are in the folds of pages 7, 17, 27, 37 and 47; with all five the King is weaker
(20% ATK and DEF), but a player who never opens a fold can still finish the climb.

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
src/data.js       fifty pages assembled from ten original floor plans, plus monsters, bosses, items, shops, people
src/rules.js      state, movement, fights, doors, shops, fountains, saves (pure functions)
src/art.js        16x16 sprites and tiles, four tones, original
src/music.js      nine original MML songs and custom effects
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
(without the five wicks), so the game never depends on a secret.
