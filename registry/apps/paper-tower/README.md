# 纸塔 (Paper Tower)

A twelve-page tower-climbing RPG for Lo-PDA, built for one 10–15 minute sitting. Walk, open
doors, take stones, fight with arithmetic, and decide what to leave behind. It follows the classic
key-and-door tradition, but every page, name, line of text, sprite and note here is original to
this game. No map, character, story or music is copied from another tower game.

## The tower

Three zones of four pages. A keeper stands in front of the way up on pages 4, 8 and 12. The three
wicks are in the folds of pages 3, 7 and 11; with all three the Bookworm King is weaker (20% ATK
and DEF), but the tower can be finished without them.

The run is deliberately short and the purse deliberately tight:

- Three shops (2, 6, 10), each with limited stock whose price rises with every purchase.
- Three springs (3, 7, 11), one full heal each.
- Three hidden folds; three wicks; three special pages with a bomb, holy water and poison.
- A fall is not a game over: the tower folds the player back to the page's entrance and takes a
  fifth of the gold.

## The order of the keepers

The pages are not a flat field of optional monsters. Like the old tower games, the route is
choked: the Ink Drop sits in the only doorway on page 1, the Paper Mite in the only doorway on
page 2, and the Moth in the only doorway on page 6. Page 5 makes the player choose between an
armored Staple in the left lane and a first-striking Moth in the right, with one bomb to remove
one of them. Page 7 offers a poison corridor or an armored guard. The keepers close each zone.
The Page Keeper, the Folder and the Ink Ferryman name the order and the tricks; the bestiary
records only what has actually been met.

There are also four small treasure rooms with a monster in the only doorway: a shield behind an
armored bug on page 2, a blue potion on page 4, another blue potion on page 6, and holy water
behind a wraith on page 9. The eleventh page puts the wick behind a last guard. These rooms are
never free: the question is whether the potion or shield is worth the HP now, before a gate or a
keeper asks for that HP.

A fight is deterministic:

```
damage per hit = ATK - monster DEF (or 75% of it against armor)
hits           = ceil(HP / damage per hit) (or 125% of HP against drain)
cost           = max(0, monster ATK - DEF) * hits
```

Abilities change the cost, never the outcome of the dice (there are no dice): **armor** cuts hero
damage by a quarter, **first** adds one enemy hit, **pierce** makes hero DEF count for half,
**drain** adds 25% monster HP, and **poison** costs 8% of max HP after a win.

## Files

```
manifest.json     store entry (buttons: true, no permissions)
index.html        bundled app; do not edit by hand
src/data.js       twelve pages, monsters, bosses, items, shops, people (pure data)
src/rules.js      state, movement, fights, doors, shops, springs, items, poison (pure functions)
src/art.js        16x16 sprites and tiles, four tones, original
src/music.js      original MML songs and custom effects
src/game.js       scenes, drawing, menus, touch, items, save slots, battle and ending
```

## Playing and checking

```sh
node tools/bundle-app.mjs registry/apps/paper-tower   # after any src/ or text change
node tools/check-app.mjs registry/apps/paper-tower
node --test tests/paper-tower.test.mjs
```

`tests/paper-tower.test.mjs` checks the page geometry, the stairs without folds, the hidden wicks,
the battle arithmetic and abilities, shops with rising prices, bombs, holy water, poison, saves,
music parsing, and two careful walks from page 1 to the lamp: one taking the three wicks, one
without opening a single fold. Both must reach the top, so a secret is a reward, never a lock.
