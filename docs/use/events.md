# Create and edit events

Events are created and edited from a sheet over the calendar. Telescreen writes
them to the provider (Google or iCloud) first and then updates its local cache,
so what you see in Google Calendar or on an Apple device is the source of truth.

## Opening the sheet

| Action | Result |
| --- | --- |
| Tap the **+** button at the bottom right | New event, timed, 1 hour long |
| Tap an empty time slot | New event starting at that slot, 1 hour long |
| Tap an empty all-day cell | New all-day event on that date |
| Drag across slots or days | New event spanning the dragged range (timed drags need more than 30 minutes; all-day drags more than one day) |
| Tap an existing event | View or edit that event |
| Tap a day in Month | Switches to Day for that date instead of creating an event |

A new timed event starts at the next full hour when today is on screen, and at
09:00 on the first visible date otherwise. The **+** button sits above the meals
rail when the rail is showing.

## Fields

| Field | Notes |
| --- | --- |
| Title | Required |
| Calendar | Only on create, and only calendars marked "Can create events" are listed. An existing event shows its person and calendar as text |
| All day | Hides the time inputs and turns the dates into whole days |
| Starts | Date, plus a time in 15-minute steps when not all-day |
| Ends | Date, plus time when not all-day. For an all-day event this is the last day it covers |
| Location | Free text, shown in the grid and the list |
| Notes | Free text |
| Repeat | Does not repeat, Daily, Weekdays, Weekly, Monthly, Yearly |

Save is disabled until there is a title and the end is not before the start
(strictly after it for timed events). If no writable calendar exists, the sheet
says so instead of offering a picker — connect an account in
[Google](../connect/google) or [iCloud](../connect/icloud) first.

The button reads "Add to *name*'s calendar" when a default calendar is known,
otherwise "Add event".

## Times and time zones

Timed events are stored as UTC instants and displayed in the household time
zone (Settings > General > Time zone). All-day events are date-only: they keep
their date in every zone and never shift by an hour across a daylight-saving
change.

## Which calendar new events go to

The write target is chosen in this order:

1. the per-member default under Settings > Calendars > "New events go to";
2. otherwise the first writable calendar belonging to the active member — the
   person whose chip you last enabled in the calendar header;
3. otherwise the first writable calendar.

Only enabled, writable calendars appear. Calendars that are read-only (shared or
subscribed) are never offered.

## Recurring events

When you save or delete an event that repeats, the sheet asks whether the change
applies to **This event** or **All events**, with Cancel to go back.

- **This event** changes only the occurrence you opened. Its date and time can
  move, but the recurrence rule itself cannot be changed for a single
  occurrence.
- **All events** changes the series. Text fields (title, location, notes) are
  applied to the whole series; a time change is applied as the same wall-clock
  shift relative to the series start, so the other occurrences keep their
  positions in the rule.

Editing a series from a later occurrence is supported, so moving next Tuesday's
instance by an hour moves the whole series by an hour from its own start.
"This and following" is not offered; only the two scopes above exist.

Rules created elsewhere that Telescreen cannot represent are shown as "a custom
schedule" in the read-only view; the Repeat picker only offers the six simple
rules above.

## Deleting

**Delete event** sits below Save. A single event is deleted immediately after
the tap; a recurring event asks for This event or All events. This event
removes just that date from the series; All events removes the whole series.

## Saving, failures, and conflicts

Writes are optimistic: the grid updates immediately and then reconciles with the
server's response.

| Situation | What you see |
| --- | --- |
| The provider accepts the write | The event stays, and the grid refetches |
| Network or provider failure | The change is rolled back and a "Couldn't save" toast offers Retry |
| The event changed at the provider since it was synced (etag mismatch, HTTP 409) | A "This event changed elsewhere" toast, and the grid refetches so you see the current version |
| The calendar is read-only (HTTP 403) | The change is rolled back; the sheet never offers the write in the first place |

Nothing is overwritten silently: on a conflict the local edit is dropped rather
than forced onto the provider.

## Read-only calendars

Opening an event from a read-only calendar shows a plain view instead of a form:
title, when, recurrence, location, notes, and the person and calendar it belongs
to, followed by "This calendar is read-only." There is no Save or Delete.

## Related

- [Calendar](calendar) — views, filters, and the meals rail
- [Settings](settings) — default write calendar, time zone, week mode
- [REST API](../reference/rest-api) — event endpoints and scopes
- Source: [EventSheet.tsx](https://github.com/dev-arekusandoru/telescreen/blob/main/web/src/screens/calendar/EventSheet.tsx)
