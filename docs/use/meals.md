# Meals

Meals shows the plan you built in PantryPal: what is next, what the week looks like, and what the kitchen still needs. Telescreen only reads from PantryPal, so any change to the plan happens in PantryPal.

## Before you start

Meals need two things:

- Telescreen must reach your PantryPal server. Set `PANTRYPAL_URL`, and optionally `PANTRYPAL_PUBLIC_URL` (the address a browser uses, for recipe links) and `PANTRYPAL_TOKEN`. See [PantryPal](../connect/pantrypal).
- The module must be on in **Settings > Modules > Meals**.

When the module is off, the Meals tab is hidden from the navigation rail. Opening `/meals` directly shows "Meals are turned off. Enable them in Settings > Modules."

## Open the Meals tab

The tab opens on the current week. Its header shows the date range of the visible week, a **Last known plan** badge when the data is stale, and previous/next arrows. Once you page away from the current week, a **This week** button returns you to it.

### The next-meal hero

The large card at the top picks the next meal to cook:

1. today's dinner, if one is planned;
2. otherwise the next dinner ahead;
3. otherwise the next meal ahead that is not a skip or a left-over;
4. otherwise the next meal that is not a skip.

It looks into next week when this week has nothing left. The small line above the title reads **Tonight** for today's dinner, or **Up next · Friday** for a later day, followed by the slot name. Dishes with a recipe photo show it; meals without one get a tinted tile with a dish glyph. Tapping the title opens the recipe in PantryPal. With no plan at all the hero reads "Nothing planned".

### The week strip

Swipe the strip (or use the arrows) to move one week at a time, from four weeks back to eight weeks ahead. Each day column has fixed breakfast, lunch and dinner tiles, with snacks and desserts as a small line underneath. A left-over tile shows `↻` and the day it was cooked. Empty slots stay as blank tiles so the columns keep their shape. Only the visible week and its neighbours are fetched; far pages stay empty until you scroll to them.

## The kitchen sidebar

Two panels on the right of the board, both read-only:

| Panel | Contents |
|---|---|
| Shopping | Newest open PantryPal shopping list: "N of M left", then unchecked items grouped by aisle, two per aisle with a `+N` count for the rest, a `check` chip when PantryPal wants the item verified, and the quantity. |
| Pantry watch | **Missing for this week**: up to three ingredients the current plan needs and the pantry cannot cover, with the recipe and the shortfall. **Expiring soon**: up to three pantry rows expiring within five days, labelled today, tomorrow, in N days or expired. |

Each section is fetched separately. If one fails, that panel is empty while the others still render.

## Tonight card

The right column (wide screens) carries a **Tonight** card below weather and travel, badged PantryPal. It shows today's dinner, else the last planned meal of the day, and adds "· last known plan" when PantryPal is unreachable. Without a plan it reads "No dinner planned."; with no cached data at all, "Unavailable".

## Meal rail in the calendar

In the Week and Day views a fixed-height rail sits under the day columns, aligned to them. Each day shows up to three meals with their slot badge (B, L, D, S, De); extra meals collapse into `+N more`. Tapping a meal that has a recipe opens it; freeform and skip entries are plain text. A day with no plan is a tappable empty cell that opens that week's plan in PantryPal. Month and Schedule views never show the rail, and nothing is fetched there. The rail only appears when at least one visible day has a planned meal, and the calendar never waits on PantryPal to draw.

## Read-only, by design

There are no edit controls. To change a meal, open PantryPal from the hero, a tile or the rail; links go to `/recipes/{id}` for a recipe and `/?week=YYYY-MM-DD` for a week.

## When PantryPal is down

- Successful responses are cached server-side for five minutes, so a brief outage is invisible.
- If PantryPal fails and a cached response exists, Telescreen serves it and marks it stale: the `Last known plan` badge, the "last known plan" note under Tonight, or a plain empty panel.
- If there is no cached response, the screen shows the error message and a **Try again** button. The API answers 503 with the reason.

## Settings > Modules > Meals

| Field | What it does |
|---|---|
| Meals | Enables the Meals tab and the Tonight card. |
| PantryPal server | Shows the configured URL, the URL recipe links open, and whether a token is being sent. Read-only; the values come from the environment. |
| Test connection | Fetches the current plan once, ignoring the cache and the module switch, and reports whether PantryPal answered and how many days are planned. |
