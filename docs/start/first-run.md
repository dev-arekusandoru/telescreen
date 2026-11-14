# First run

The first boot creates everything the wall needs: a household, two members, and
an empty calendar. This page takes you from that empty state to a wall display
that stays awake and shows your events.

## What the first boot creates

When the database is empty, Telescreen seeds:

| Thing | Default |
| --- | --- |
| Household name | `Our Home`, or `TELESCREEN_HOUSEHOLD_NAME` if set |
| Household time zone | `TELESCREEN_TIMEZONE`, else the server's system zone |
| Members | Mara (`terracotta`) and Theo (`sage`) |
| Week view | Next 7 days (rolling, today in the first column) |
| Week starts on | Sunday |
| Modules | Weather, Travel, Meals, Music all off |

Nothing is downloaded and no account is created. All of this is editable later.

## Name the household

Open **Settings > Household > General** and change:

- **Household name** — shown as the title on the calendar.
- **Time zone** — every date and time is displayed in this zone, whatever the
  server or browser uses. Set it before you create events.
- **Week view** — `Next 7 days` keeps today in the first column, which is what a
  wall display wants. `Calendar week` shows a fixed Sunday-to-Saturday week.
- **Week starts on** — Sunday or Monday. This affects the fixed week and the
  month view.

The other rows on that page (idle return, sync interval, keep awake, seasonal
decorations) have sensible defaults; leave them for now.

## Name the people

**Settings > Household > Members** lists Mara and Theo. Rename them, pick a color
per person, and reorder them with the arrows. The color drives the member chips
in the calendar header and the ring around that person's events.

Add a third person with the "Add a member" field if your household needs one.
Deleting a member detaches the calendars and chores that referenced them; nothing
is deleted at the provider.

## Connect a calendar

The calendar is empty until you connect an account. Pick one to start:

| Provider | What you need | Guide |
| --- | --- | --- |
| iCloud | Apple ID and an app-specific password | [iCloud](../connect/icloud) |
| Google | An OAuth client of your own | [Google](../connect/google) |

Do this under **Settings > Calendar > Accounts**. A first sync starts in the
background; the calendars then appear under **Settings > Calendar > Calendars**,
where you choose which ones are visible and which one new events are written to.
Events appear within a sync interval (5 minutes by default), or immediately if
you tap the sync button in the rail.

## Turn on the modules you want

Modules are off by default so the wall stays quiet until you ask for more.
Enable each under its own tile:

- **Settings > Modules > Weather** — set a place (or use the device location),
  units, and optionally the UV index.
- **Settings > Modules > Travel** — needs `GOOGLE_MAPS_API_KEY` in the
  environment, plus a home address in Settings.
- **Settings > Modules > Meals** — needs `PANTRYPAL_URL`; use "Test connection"
  to confirm.
- **Settings > Modules > Music** — needs a Spotify app; connect from the tile.

Weather, Travel, Meals, and Music appear in the right column of wide layouts. The
Meals and Music tabs appear only when their modules are on.

## Install it on the tablet

1. Open the tailnet HTTPS URL in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Launch Telescreen from the home screen icon, in landscape.
4. Turn on **Settings > Household > General > Keep screen awake**.

The wake lock only works over HTTPS (over plain `http://` Safari refuses it, and
the row says so). If the setting is on but the screen still sleeps, check that
you opened the `https://` tailnet address, not `http://127.0.0.1:8788`.

An iPad left on all day may benefit from Guided Access or a charging stand; both
are outside Telescreen.

On a phone the app opens with bottom tabs (Calendar, Chores, and Meals/Music when
enabled) and Settings as a tab. Installing it there works the same way and is
optional.

## Next steps

- [ ] Rename the household and set the time zone.
- [ ] Rename members and pick colors.
- [ ] Connect at least one calendar account and pick visible calendars.
- [ ] Set the default write calendar per member, so new events land where you
      expect.
- [ ] Turn on Weather, Travel, Meals, or Music as needed.
- [ ] Install the PWA on the tablet and enable keep-awake.
- [ ] Back up the data directory and store `TELESCREEN_SECRET_KEY` safely. See
      [Backups and restore](../host/backups).
- [ ] Read [Access and security](../host/security) if anyone outside the
      household can reach the instance.

Once the calendar shows events, the rest is day-to-day use: see
[Calendar](../use/calendar), [Events](../use/events), and
[Chores](../use/chores).
