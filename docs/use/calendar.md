# Calendar

The calendar is the screen the display opens to. It merges every enabled
Google and iCloud calendar, colors each event by the person the calendar is
mapped to, and puts chores progress and (when the module is on) meals on the
same surface.

## The header

The header is one compact row. From left to right:

| Element | What it does |
| --- | --- |
| Household name | Set in Settings > General |
| Clock | Current time in the household time zone; the zone name is in the tooltip |
| Today | Returns to today and scrolls the grid back to the current hour. It is only shown while today is outside the visible range, so it never leaves a gap |
| Prev / next | Move back or forward by one range: 7 days in Week, 1 day in Day, 1 month in Month, 14 days in Schedule |
| Range label | The dates currently on screen |
| Member chips | One ring chip per person; see below |
| Weather chip | Current temperature when the Weather module is on and the right column is hidden |
| At a glance | Opens the right-column widgets in a popup when the column is hidden |
| View switcher | Week, Day, Month, Schedule |

## Views

| View | Range | Notes |
| --- | --- | --- |
| Week | 7 days | Either rolling (today is the first column) or a calendar week, depending on Settings > General > Week view |
| Day | 1 day | Also the default on phones |
| Month | 1 month | Tap a day to open it in Day |
| Schedule | 14 days | A list grouped by day; each row shows the location |

Week, Month, and Schedule keep their dates when you switch views. Month is laid
out from the household's week start; the rolling Week always begins today.

The last view you used is remembered in this browser. A device with no stored
choice opens Week, except on a narrow phone-width screen, where it opens Day.

## Reading the grid

Events are drawn as tinted blocks with a solid bar on the left edge, in the
color of the person whose calendar they came from. Calendars mapped to
"Family / Both" in Settings > Calendars use the neutral Family style.

- **All-day events** sit in the strip above the time grid.
- **Timed events** show the title plus start–end and location. Slots are 30
  minutes, labeled hourly, and the grid opens about an hour before now.
- **The now line** marks the current time, and events that already ended are
  dimmed.

## Moving around

Use the chevrons, or swipe horizontally across the grid: a horizontal swipe of
more than about 70 pixels moves one range back or forward. Swiping down from
the top of the grid (only when it is not scrolled) asks the server to sync
calendars now.

When the display is left alone for the number of minutes set under Settings >
General > Return to today, the calendar closes any open sheet and jumps back to
today without changing the remembered view. The default is 2 minutes; `Off`
disables it.

## Member chips

Each person gets a chip with a ring around their initial. The ring is today's
chore progress: filled portion = done / total. Tapping a chip opens a popover
with:

- the person's name and `done/total done today`;
- today's chores, open ones first: carried-over items are marked, and any due
  time appears as "by 9:30 AM";
- a switch between "On the calendar" and "Hidden from calendar". Turning it off
  filters that person's events out of the grid and dims the chip; the popover is
  also how you bring them back.

Hidden members and the active member are remembered in this browser, not on the
server.

## Meals rail

When the Meals module is on and the visible range has planned meals, a rail
appears under the day columns of Week and Day. It sits outside the scrolling
grid, so it never covers events, and every column reserves the same three rows
so the week stays aligned.

Each day shows up to three meals as a chip with a slot badge (`B` breakfast,
`L` lunch, `D` dinner, `S` snack, `De` dessert) and the recipe name. A chip
opens that recipe in PantryPal; a day with more than three meals shows two chips
and a `+N more` link to the week. A day with no meals is an empty note box that
opens that week's plan in PantryPal. Month and Schedule show no rail, and the
rail is simply absent while PantryPal is unreachable or the module is off — the
calendar never waits for it.

## Wide and narrow layouts

The layout adapts rather than scaling:

| Width | Layout |
| --- | --- |
| 1280px and wider | A right column appears when at least one widget module (weather, travel, meals, music) is enabled |
| 960–1279px | No right column; the weather chip stays in the header and the other widgets live behind At a glance |
| Below 960px | Weather joins the At a glance popup too, keeping the header on one row |
| Below 600px | Bottom tab bar instead of the left rail, Day as the default view, and a wrapping header |

## Refreshing

The server polls calendars on the interval in Settings > General > Sync
interval (5 minutes by default) and refreshes when the app regains focus. The
rail's sync button, the pull-down gesture, and Settings > General > Last sync
report the most recent successful sync and any error. Cached events stay
readable when a provider is slow.

## Related

- [Create and edit events](events)
- [Chores](chores)
- [Meals](meals)
- [Settings](settings)
- Source: [CalendarScreen.tsx](https://github.com/dev-arekusandoru/telescreen/blob/main/web/src/screens/calendar/CalendarScreen.tsx)
