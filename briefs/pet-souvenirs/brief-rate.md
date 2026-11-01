# Brief change: one built-in souvenir a week (owner, 2026-11-01 02:21)

Owner: built-in souvenirs should come about once a week; with the AI line the pet should bring more. This replaces
the "new-item chance" of brief.md Part B and the NEW_RATE number in brief-art.md.

1. Without the AI line (or when the AI call fails), an outing brings a built-in souvenir with chance
   `min(1, LOCAL_RATE / trait.outing)`, `LOCAL_RATE = 1/7` (pack `souvenirLocalRate`). That is about one a week for every
   trait. The pick is always an unseen in-season-or-any item; only when that pool is empty does it pick a seen one
   (avoiding the last 5). There is no more "repeat on the other outings".
2. The other outings still happen (same chance and hours, the pet leaves and walks back) but it comes back empty-handed:
   no souvenir document, the day is marked done exactly as after a souvenir (`out` / `back`), and a reload never turns
   it into a souvenir. Decide it from the day seed so the same day gives the same answer. The room shows the normal
   walk-back; no new string, no message.
3. With the AI line on, unchanged: every outing day makes the one AI call and brings the AI souvenir. If the AI call
   fails, fall back to rule 1 (the weekly roll), not to a guaranteed built-in one.
4. Travel's postcard is unchanged.
5. Tests: the one-year petsim simulation now expects 40-65 built-in souvenirs a year for each trait (no AI), and no
   repeats while unseen items remain; an empty-handed day writes no document and is stable across reloads.
6. Design doc: replace the NEW_RATE numbers with this rule.
