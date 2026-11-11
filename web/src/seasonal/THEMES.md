# Seasonal themes

Decoration only; base colors never change. Date logic lives in `registry.ts` (first match wins, top to bottom). Dates are local time. Master switch: Settings → General → Seasonal decorations. Dev override: Settings → General → Developer → Seasonal theme (per device).

| Theme | Dates | Behavior |
|---|---|---|
| New Year | Dec 31 – Jan 1 | Gold/silver/rose/midnight confetti falls, lands and piles along the floor (up to 150 pieces); large balloons rise; string lights twinkle; sparkle bursts. Sync: confetti burst, pile resets. |
| Christmas | Dec 1 – Dec 30 | Snow falls and builds drifts on the floor; a wreath replaces the rail H; a big tree grows out of the bottom-right; holly sprigs; twinkling lights; a reindeer crosses the bottom. Sync: a gust clears the drift. |
| Valentine's Day | Feb 7 – Feb 14 | Hearts float UP and fade; a love letter replaces the rail H. Sync: heart burst. |
| St. Patrick's Day | Mar 10 – Mar 17 | Clovers drift down, gold coins fall and pile; a rainbow with clouds replaces the rail H. Sync: coins scatter. |
| Easter | 7 days up to and including Easter Sunday (Western) | No falling eggs. A bunny hops along the bottom, chicks wander, decorated eggs peek out from the floor edge (egg hunt). Sync: eggs reshuffle. |
| Spring | Apr 1 – May 31 | 14 flowers sprout from the floor and bloom over about 30s, then sway; petals drift; butterflies and a bee wander. Sync: gust, garden re-sprouts. |
| 4th of July | Jul 1 – Jul 4 | Red/white/blue/gold firework rings burst in the upper area on staggered 8s cycles; a waving flag replaces the rail H; sparkler near the floor. Sync: finale volley. |
| Summer | Jun 1 – Aug 31 | Bubbles rise; a sun replaces the rail H; a crab scuttles and a bee wanders. Sync: a wave washes across the bottom. |
| Halloween | Oct 15 – Oct 31 | Bats and ghosts (more opaque), three spiders on threads, cobwebs in the corners, jack-o'-lanterns at the rail and floor. Sync: bat flock bursts. |
| Thanksgiving | Nov 1 – Nov 30 | Leaves and acorns fall, pile up at the bottom, blow away on sync; a turkey perched by the rail and one walking along the bottom |

No theme: Jan 2 – Feb 6, Feb 15 – Mar 9, Mar 18 – Mar 31 (unless Easter falls early), Sep 1 – Oct 14.


Themes can replace the side-rail "H" by exporting a `Logo` (see `types.ts`); Christmas, Valentine's, St. Patrick's, 4th of July and Summer do.
