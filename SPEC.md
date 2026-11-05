# HomeHub: spec

Status: draft 1 (planning). Working title: **HomeHub**. License: **MIT**.
Design reference: [`mockups/editorial.html`](mockups/editorial.html) (open in a browser; try Week/Day/Month/Schedule, the "+" sheet, chore tap-to-complete, Settings > Theme, and a narrow window for phone). It is a frozen look-and-feel reference, not a behavior spec.

A self-hosted family wall-calendar for two people. Big calendar, chores, later weather, Spotify and
meals (via [PantryPal](../pantrypal)). Inspired by Skylight, without the subscription, rewards, or cloud.

## 1. Goals and non-goals

**Goals**
1. A wall-mounted/tablet **calendar** that merges Google and iCloud calendars, color-coded by person, with create/edit from the screen.
2. **Chores** with recurrence, rotation, "either of us" and one-offs; fast tap-to-complete.
3. Polished, distinctive UI (editorial personality, light and dark) that reads from across a room.
4. Self-hosted, single container, private network only. Easy for other households to install (MIT).

**Non-goals (v1)**: rewards/points/streaks, multi-household, user accounts/passwords, offline mode,
push notifications, photos/lists/sleep screens (Skylight extras), public-internet exposure.

## 2. Users and devices

| | |
|---|---|
| Users | Two adults (Alex, Vale; placeholder names). Data model allows N members; UI is tuned for 2 to 4. |
| Primary device | iPad or larger, landscape, Safari, installed as a PWA, left on (iPadOS Guided Access optional). |
| Secondary | Phone, portrait. Not required for MVP, but layouts must not break below 600px (see §8). |
| Network | Tailscale only. `tailscale serve --bg <port>` gives HTTPS (needed for the screen wake lock). |

## 3. Stack (mirrors PantryPal so the projects can share patterns and code)

| Area | Choice |
|---|---|
| Runtime | Node >= 22, TypeScript, pnpm workspace (`web/` package) |
| Server | Hono + `@hono/zod-openapi`, REST at `/api/v1`, OpenAPI at `/openapi.json` |
| DB | SQLite via `better-sqlite3` + Drizzle ORM/migrations; one file under `/data` |
| Web | React 19, Vite, TanStack Router + Query, `openapi-typescript` + `openapi-fetch` generated client |
| Calendar UI | **FullCalendar React** (`@fullcalendar/react`, `daygrid`, `timegrid`, `list`, `interaction`) |
| Styling | Plain CSS with design tokens (CSS variables) + CSS modules. No utility framework, no styled component library (MUI, shadcn, etc.). |
| UI primitives | **Radix UI** (headless, unstyled): Dialog (event sheet, chore picker), Select, Popover, ToggleGroup (view/theme segmented controls), Switch, Toast. Gives focus trap, keyboard and screen-reader behavior for free; all looks come from our tokens. FullCalendar is themed through the same CSS variables. |
| Icons | **Phosphor** (`@phosphor-icons/react`): outline for inactive, fill/duotone for active |
| Fonts | Self-hosted via `@fontsource-variable/*` (no CDN) |
| Sync libs | CalDAV: `tsdav`. Recurrence: `ical.js`. Google: `googleapis` (Calendar v3) or plain `fetch` |
| Tests | Vitest (server + web), Testing Library, a few Playwright smoke flows |
| Deploy | One Docker image, `docker-compose.yml`, `./data` volume. Dev: `pnpm dev` + `pnpm web:dev` |

Auth is network access, same as PantryPal: if you can reach it over the tailnet you are in.
Opt-in `HOMEHUB_TRUST_NETWORK=1` (default off) lets `/api/v1/*` act as the household with no token;
a token, when sent, is still verified. Provider secrets (OAuth tokens, app passwords) are stored
server-side only, never returned by the API. Encryption key via `HOMEHUB_SECRET_KEY` (AES-GCM at rest).

## 4. Calendar

### 4.1 Views (FullCalendar)
| View | FullCalendar plugin | Notes |
|---|---|---|
| **Week** (default on iPad) | `timeGrid`, custom range | **7 days starting today** so "today" is always the first column; scrolls to current time. Toggle to a fixed Sun-Sat week is a setting. |
| Day (default on phone) | `timeGridDay` | |
| Month | `dayGrid` | Event dots/chips; tap a day opens Day |
| Agenda ("Schedule") | `list` | Grouped by day |

Shared: all-day strip, "now" line, per-person chips in the header (a ring around the avatar shows
today's chore progress; tap opens the member's tasks and the only show/hide filter), swipe/arrow
navigation and a "Today" button that appears only while today is off-screen. The header is a single
compact row (title + clock, joined prev/next chevrons, member chips, weather, view switcher) so the
calendar gets the height; below 1280px the weather chip stands in for the hidden right column, and a
single "At a glance" button opens the other right-column widgets in a popup (below 768px weather folds
into that popup so the header stays on one row); the last view mode is remembered per device. Idle for 2 min returns to
today's Week view (wall-display behavior; setting).

**Meals in the week/day grid**: when the Meals module is on and the visible range has planned meals,
a fixed-height rail sits under the day columns (outside the scrolling grid, so it never overlaps
timed or all-day events). Each column reserves the same three rows and shows a dashed note box with
one chip per meal: a colored slot badge (B/L/D/S/De) plus the recipe name, truncated. Days with more
than three meals show two chips and a "+N more" line. A chip opens that recipe in PantryPal; an empty
day is a tappable empty note box that opens that week's plan. Ranges are fetched from
`/meals/plan`; while loading, when the module is off, or when PantryPal is unreachable the rail is
simply absent (the calendar never blocks on it). Month and Schedule show no meals.

### 4.2 Sources and sync
| Provider | Method | Setup |
|---|---|---|
| Google | Calendar API v3, OAuth 2.0 (user-supplied Cloud project client id/secret), incremental `syncToken` | Settings > Add account > Google (see Open Question 1) |
| iCloud | CalDAV at `caldav.icloud.com` with an **app-specific password** (no OAuth) | Settings > Add account > iCloud: Apple ID + app password |

- Server polls every **5 min** (configurable) per calendar, plus an immediate refresh when the app
  regains focus and a "pull to refresh" gesture. Webhooks/push are out of scope (no public URL).
- Cache: events live in SQLite so the UI never waits on a provider. Sync is incremental
  (Google `syncToken`; CalDAV `ctag`/`etag` + `sync-collection`).
- Recurrence: the server expands recurring events (including exceptions/overrides) for the requested
  window and returns plain instances; the client never parses RRULE.
- Time zones: all instants stored UTC + original TZ; display in the **household time zone**. All-day
  events stay date-only.
- Failures: a calendar with sync errors shows a small warning badge in Settings; the rail's refresh
  button carries the last-synced state (and error) in its tooltip, Settings > General repeats it, and
  stale data stays visible.

### 4.3 Calendar-to-person mapping (decided: option 1)
Each connected calendar is linked once, in Settings, to **one member or "Family/Both"**. Events
inherit that member's color; Family events render with a neutral/dual-tone style. No per-event
tagging in v1 (per-event override is later).

### 4.4 Writing (decided: two-way)
- **Create / edit / delete** from the UI via the "+" button and event sheet. Fields: title, start/end
  (or all-day), calendar (picker; defaults to the active member's default calendar), location, notes,
  simple repeat (none, daily, weekdays, weekly, monthly, yearly).
- Writes go to the provider first (CalDAV `PUT` with `If-Match`; Google `events.insert/patch`), then
  update the cache. UI is optimistic; a failed write rolls back with a retry toast.
- Conflict policy: `If-Match`/etag. On 412, refetch and show "This event changed elsewhere". No silent overwrite.
- Recurring events: edit/delete supports **this event** and **all events**. "This and following" is later.
- Calendars flagged read-only (shared/subscribed) are not offered as write targets.

## 5. Chores

### 5.1 Model
A **chore** is a template; an **occurrence** is one due instance with a status.

| Field | Values |
|---|---|
| Recurrence | one-off, daily, selected weekdays, weekly, every N weeks, monthly (day-of-month) |
| Assignment | `fixed` (one member), `rotating` (ordered members, advances per occurrence), `either` (anyone) |
| Due | date (optional time-of-day, display only) |
| Extras | emoji/icon, notes, estimated minutes (optional) |

- **Rotating**: assignee of occurrence *n* = `members[n mod k]`, computed from the occurrence index so
  skipping or missing one does not scramble the order. Rotation can be reordered or manually swapped
  for a single occurrence.
- **Either**: shows in a "Shared" group; whoever completes it gets credit.
- **Completion**: tap > confirmation sheet with the assignee pre-selected (one tap to confirm); for
  `either` chores pick Alex or Vale. No login. Undo for 10 s via toast and from the occurrence later.
- **Missed**: an open occurrence is marked `missed` when the chore's next occurrence is generated
  (daily chores expire at day's end; weekly ones at week's end). Missed items stay visible, dimmed, on
  the previous day in history; they never pile up on Today. (Open Question 4.)
- **No rewards.** Progress is just counts: "2/3 today" per member.

### 5.2 Screens
- **Today**: grouped by member plus Shared; large check circles; per-member progress bar (the Skylight header idiom).
- **Week**: grid of days x members, quick overview.
- **Manage**: create/edit/archive templates; rotation editor.
- The calendar header shows each member's progress as a ring around their avatar (done/total for today); tapping it opens their task list and the calendar show/hide filter. Chores can later optionally appear as all-day items on the calendar (off by default).

## 6. Later modules (specified now so the shell leaves room)
| Module | Approach | Notes |
|---|---|---|
| Weather | Open-Meteo (no key); lat/lon in Settings; Daily/Hourly strip in the right-column card or, when that column is hidden, the header chip / widgets popup | Cached 15 min server-side; ~24 hourly entries |
| Spotify | Web API + Connect (OAuth PKCE): show now playing, play/pause/skip/volume on an existing device | Premium confirmed. Same redirect-URI constraint as Google (see §12.1) |
| Meals (PantryPal) | Server-to-server reads of PantryPal's plans (`/plans/current` for Tonight/Meals, `/plans?from&to` + plan ids for the calendar's visible range); "Tonight" card, Meals tab with the week, meal rail under the Week/Day calendar; deep-links into PantryPal web for recipes (`/recipes/{id}`) and weeks (`/?week=YYYY-MM-DD`) | Read-only to start; PantryPal runs with `PANTRYPAL_TRUST_NETWORK=1` on the same tailnet/host, so no token needed (token optional via `PANTRYPAL_TOKEN`) |

Navigation shell (left rail on iPad, bottom bar on phone): Calendar, Chores, Meals, Music, Settings.
Meals/Music tabs are hidden until their module is enabled.

## 7. Data model (SQLite, Drizzle)

```
household(id, name, timezone, week_start, theme_default)
member(id, household_id, name, color_token, initial, sort)
account(id, provider['google'|'icloud'], label, secret_encrypted, status, last_error)
calendar(id, account_id, remote_id, name, color, writable, enabled,
         member_id NULL /* NULL = family */, sync_token, ctag, last_synced_at)
event(id, calendar_id, remote_id, etag, series_id, recurrence_id NULL,
      start_utc, end_utc, start_tz, all_day, summary, location, notes,
      rrule NULL, raw_ics NULL, deleted)
chore(id, name, icon, notes, recurrence_json, assignment['fixed'|'rotating'|'either'],
      member_ids_json /* ordered */, due_time NULL, archived)
chore_occurrence(id, chore_id, index_n, due_date, assignee_id NULL,
      status['open'|'done'|'missed'|'skipped'], completed_by NULL, completed_at NULL)
setting(key, value_json)   -- week mode, idle return, sync interval, module flags
```
Theme override (System/Light/Dark) and the last calendar view mode are per-device (`localStorage`),
not in the DB.

## 8. Design language (direction: Warm and Editorial)

- **Personality**: calm magazine. Paper surfaces, serif display type, soft raised cards, restrained color; a family-planner you would be happy to look at all day.
- **Theme**: tokens in `web/src/styles/tokens.css`. **Light** (cream paper) and **Dark** (warm charcoal-brown, not blue-black). Follows `prefers-color-scheme` by default; **Settings > Appearance: System / Light / Dark** overrides it per device.
- **Color**: one color per member (Alex terracotta, Vale sage by default, user-selectable from a curated palette that passes contrast in both themes). Events = tinted fill + 3px solid left bar in the member color; Family = ink-on-paper neutral. Accent = terracotta.
- **Type**: display serif (candidate: Fraunces Variable) for headings/dates; humanist sans (Inter Variable) for UI. Minimum text 13px on wall display; event titles 14px+; touch targets >= 44px.
- **Icons**: Phosphor. Regular weight at rest, fill/duotone on active/selected. 24px nav, 20px inline.
- **Shape/motion**: 18px card radius, 10px event radius; 150-250ms ease-out; tap feedback via scale 0.98; check-off animates fill + strike. Respect `prefers-reduced-motion`.
- **Layout (iPad landscape 1180x820 reference)**: 84px nav rail + full-width main column (one compact header row, member ring chips inside it, 7-day calendar filling the rest). At >= 1280px (e.g. iPad Pro 12.9") a 288px right column appears (weather, tonight's meal, now playing); below that it is hidden so the 7-day week stays legible, and the same widget bodies are reachable from one "At a glance" button in the calendar header. The weather chip keeps its own header slot while it fits (>= 768px); below that weather joins the popup. Today's chores are always one tap away on the Chores tab and summarized by the per-member progress bars.
- **Phone (portrait, post-MVP-friendly)**: bottom tab bar, Day view default, member ring chips in the (wrapping) header, event sheet as a bottom sheet. Reference in the mockup.
- **Wall-display details**: no hover dependence; "now" line; dim tint for past events; no burn-in-prone static high-contrast chrome in dark mode (accent used sparingly).

## 9. API sketch (`/api/v1`, OpenAPI generated)
```
GET/PATCH  /household           GET/POST/PATCH/DELETE /members
GET/POST/DELETE /accounts       POST /accounts/{id}/sync
GET/PATCH  /calendars           (member mapping, enabled, default write calendar)
GET        /events?start&end&members=      (expanded instances)
GET        /meals/plan?start&end           (planned days for a range, from PantryPal)
POST       /events              PATCH/DELETE /events/{id}?scope=this|all
GET/POST/PATCH/DELETE /chores
GET        /chore-occurrences?from&to&member=
POST       /chore-occurrences/{id}/complete   {completedBy}
POST       /chore-occurrences/{id}/undo | /skip | /reassign
GET/PUT    /settings
GET        /health
```
OAuth callback routes live at `/auth/google/callback` (server-rendered, not part of the OpenAPI client).

## 10. Milestones
| # | Scope | Done when |
|---|---|---|
| M0 | Scaffold: workspace, Hono, Drizzle, Vite, tokens, theme switch, Docker | `docker compose up` serves an empty themed shell over HTTPS via tailscale |
| M1 | Calendar read: Google + iCloud sync, mapping, Week/Day/Month/Agenda, filters | Real calendars render and refresh within the poll interval |
| M2 | Calendar write: event sheet create/edit/delete, recurring scopes | Edits appear in Google/iCloud apps and survive a resync |
| M3 | Chores: templates, occurrences, rotation/either, Today/Week/Manage | Completion flow and progress bars work; rotation order is stable across skips |
| M4 | Polish: PWA, wall-display behavior (wake lock, idle return), phone layout, a11y/contrast pass | Install to iPad home screen; stays awake; no layout break at 390px |
| M5 | Weather | Daily/Hourly strip in the right column, or the header chip + widgets popup below 1280px |
| M6 | PantryPal meals | Tonight card + Meals tab read from `/plans/current` |
| M7 | Spotify | Now playing + transport controls |

## 11. Testing
- Server: Vitest with an in-memory SQLite; a fake CalDAV server and recorded Google fixtures for sync;
  unit tests for recurrence expansion, DST/all-day handling, rotation index math, missed-occurrence rules.
- Web: Testing Library for event sheet and chore completion; Playwright smoke at 1180x820 and 390x844 (check-off, create event, theme override).
- Theme: contrast check of every token pair in light and dark.

## 12. Decisions made (from planning session)

1. **Google OAuth**: keep it as simple as works. Try the Tailscale HTTPS URL as the redirect; if Google rejects it, use a localhost redirect (one-time setup from a phone/laptop via the server host is acceptable). Consent screen set to "In production" so tokens do not expire in 7 days.
2. **Recurring events**: edit/delete "this event" or "all events" only; "this and following" is later.
3. **Missed chores**: drop off Today when the next occurrence generates; visible in history.
4. **Names**: Alex and Vale (placeholders). Member names and colors are editable in Settings > Members.
5. **Chores on the calendar**: follow Skylight, i.e. chores are **not** shown as calendar events; they live on the Chores tab with per-member progress bars in the calendar header (as in the mockup).
6. **Spotify**: Premium confirmed, so playback control is feasible (M7).

## 13. Still open
- Project name (HomeHub is a placeholder). Skylight extras confirmed out of scope for v1.
