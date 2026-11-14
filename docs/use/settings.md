# Settings

Settings is a tile launcher: one tile per section, grouped by meaning, with a
one-line status on each tile. Tapping a tile opens that section full width; the
back arrow in the page header returns to the tiles.

| Group | Sections |
| --- | --- |
| Household | General, Members |
| Calendar | Accounts, Calendars |
| Modules | Weather, Travel, Meals, Music |
| Display | Appearance |

## General

The household's name, its clock, and wall-display behaviour.

| Setting | Values | Notes |
| --- | --- | --- |
| Household name | Text | Commits on blur or Enter; shown as the calendar title |
| Time zone | IANA name, e.g. `Europe/Berlin` | Events and chores are displayed in this zone. The field suggests known zones and the server rejects an invalid one |
| Week view | Next 7 days, Calendar week | Rolling puts today in the first column; Calendar week uses the household week start |
| Week starts on | Sunday, Monday | Only shown while Week view is Calendar week |
| Return to today | Off, 1, 2, 5, 10 min | Idle time before the calendar returns to today |
| Sync interval | 1, 5, 10, 15, 30 min | How often the server polls calendars |
| Last sync | Read-only | "Synced 4 min ago", "Sync problem", or "Not synced yet" |
| Keep screen awake | On / off | Asks the browser for a wake lock while the app is visible. Needs HTTPS (for example `tailscale serve`) and a browser that supports it |
| Seasonal decorations | On / off | Falling leaves and similar touches around holidays, including the seasonal logo |
| Developer: seasonal theme | Auto or a theme | Only present in development builds; previews a theme on this device regardless of the date |

The calendar returns to today in whichever view you are using; it does not force
the Week view. The remembered view is untouched.

## Members

Each member row has an avatar, a name field, a colour picker, and move up/down
arrows.

- **Rename.** Commits on blur or Enter. The initial follows the new name's first
  letter automatically. Renaming changes nothing about existing events or
  chores, because they reference the member by id.
- **Recolour.** Six palette colours: terracotta, sage, ochre, plum, slate, and
  rose. The colour is used for the member's events, chips, chore columns, and
  travel destinations.
- **Reorder.** Arrows change the member's sort position, which is the order used
  for chore columns, the calendar chips, and member pickers.
- **Add.** Type a name and press Add. The colour defaults to the first palette
  colour not already in use. New members start with no calendars and no chores.
- **Remove.** The Settings screen has no remove control. Members can be deleted
  through the API, which detaches anything that referenced them (calendars and
  chore occurrences become unassigned) and keeps the events themselves. A chore
  template keeps the removed id in its rotation order until you edit it. See
  [REST API](../reference/rest-api). Renaming is the safer choice on a live
  display.

Member names and colours are per household, so every device sees the same list.

## Appearance

The theme is **System**, **Light**, or **Dark**. System follows the device's own
appearance setting; the other two pin it. This choice is stored in the browser,
not on the server, so the tablet and a phone can differ. It applies before the
first paint, so there is no flash of the wrong theme.

## Accounts, Calendars, and Modules

These sections have their own guides:

| Section | What it does | Guide |
| --- | --- | --- |
| Accounts | Connect a Google Cloud OAuth client or an iCloud account with an app-specific password | [Google](../connect/google), [iCloud](../connect/icloud) |
| Calendars | Map each calendar to a person or Family / Both, show or hide it, and choose each member's default calendar for new events | [Calendar](calendar) |
| Weather | Location and units for the weather chip and widget | [Weather](weather) |
| Travel | Home address and saved destinations | [Travel](travel) |
| Meals | Enable the Meals tab and test the PantryPal connection; the URL and token come from the environment | [PantryPal](../connect/pantrypal), [Meals](meals) |
| Music | Connect Spotify; enables the Music tab | [Spotify](../connect/spotify), [Music](music) |

Module tiles read On or Off and disabled modules are hidden from the navigation,
so Meals and Music tabs appear only after their module is enabled.

## What is stored where

Household details and settings live in the server's SQLite database, so they
apply to every device that opens the instance.

| Stored on the server | Stored in this browser |
| --- | --- |
| Household name, time zone, week start | Theme (System / Light / Dark) |
| Week view mode and return-to-today minutes | Last calendar view (Week, Day, Month, Schedule) |
| Sync interval and keep-awake preference | Hidden members in the calendar |
| Seasonal decorations and module flags | Active member used for the default write calendar |
| Default write calendar per member | |

Clearing the site's storage resets only the right-hand column; the household
data is unaffected.

## Related

- [Configuration](../host/configuration) — environment variables that seed
  the household, including `TELESCREEN_HOUSEHOLD_NAME` and
  `TELESCREEN_TIMEZONE`
- [First run](../start/first-run) — the initial household and calendar setup
- Source: [sections.tsx](https://github.com/dev-arekusandoru/telescreen/blob/main/web/src/screens/settings/sections.tsx), [GeneralSection.tsx](https://github.com/dev-arekusandoru/telescreen/blob/main/web/src/screens/settings/GeneralSection.tsx)
