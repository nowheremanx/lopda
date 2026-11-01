# Brief change: a happy pet brings souvenirs, an unhappy one seldom (owner, 2026-11-01 02:53)

Owner: the pet should only like to bring a souvenir home when it is doing well; a pet that stays unhappy brings
little. One pure function in petsim.js from the pet's state gives the chance. Applies on top of brief-rate.md.

1. `careScore(save)` -> 0..1, pure: `0.5 * joy/joyMax + 0.3 * hunger/hungerMax + 0.2 * (1 - mess/messMax)`, using the
   state after catch-up at the outing hour (the same state the outing already sees).
2. "Stays unhappy" means over days, not one bad hour: the save keeps `care` (0..1), updated once per outing day when
   the outing is decided: `care = 0.5 * care + 0.5 * careScore(save)`. A missing `care` (new pet, old save) starts at
   `careScore(save)`. Written once, never on every tick; reloads of the same day do not update it twice (tie it to
   today, like `today.out`).
3. `souvenirMood(care)` -> multiplier: `clamp((care - 0.2) / 0.6, 0.1, 1)`. care >= 0.8 gives 1, 0.5 gives 0.5, 0.26 or
   less gives 0.1.
4. Built-in souvenir chance on an outing = `min(1, LOCAL_RATE / trait.outing) * souvenirMood(care)`.
5. With the AI line on: the AI call happens only when a day-seeded roll `< souvenirMood(care)`; otherwise the outing
   comes back empty-handed and no AI call is made (it also saves the player's AI credit). A failed AI call still falls
   back to rule 4.
6. All rolls come from the day seed so reloads give the same answer. Travel's postcard is unchanged. No UI, no
   new string: the player learns it by looking after the pet.
7. Tests (petsim): careScore bounds; souvenirMood table above; care EMA updated once per day; a well-kept pet keeps
   about one built-in a week in the one-year simulation (40-65), a neglected one (joy 1, hunger 1, mess 2 every day)
   gets at most 10 a year; AI skipped when the roll fails. decisions.md section 45 and the design doc get one paragraph.
