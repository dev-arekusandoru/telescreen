# Chores

Chores live on their own tab and never appear on the calendar. Each chore is a
**template** (name, schedule, who does it) and each due instance is an
**occurrence** with its own status. Editing a template never rewrites what
already happened.

The tab has three views, switched in the header: Today, Week, Manage.

## Today

Today is grouped by person plus a Shared column for "either of us" chores, with
a progress bar per person above the columns.

- The list is today's occurrences plus any still-open occurrence carried over
  from an earlier day. Carried-over rows are labeled with the day they came
  from ("from Mon").
- Missed and skipped occurrences never appear here.
- Tapping an open chore opens the completion sheet, "Who did it?", with the
  assignee already selected. Confirm with **Mark done for *name***, hand the
  occurrence to someone else with **Hand to *name***, or use **Skip this time**.
- For an "either of us" chore nothing is preselected: the sheet lists every
  member, and tapping one completes the chore with that person credited.
- Tapping a completed chore marks it not done, with an Undo toast.

Completion shows a toast with **Undo** for 10 seconds. The completer gets the
credit, which may be someone other than the assignee.

## Week

A grid of seven days by person, plus Shared, starting from the household's week
start. Chevrons move a week at a time and **This week** returns to the current
one.

Missed chores show dimmed and cannot be tapped; open chores from earlier days
are dimmed but can still be completed; skipped ones are hidden.

## Manage

The template list, sorted by name. **New chore** creates one; tapping a row edits
it. Archived templates are hidden until **Show archived** is switched on, and
the editor's **Archive** / **Restore** button toggles that flag. Archiving keeps
the history; there is no delete button in the app.

### Editor fields

| Field | Notes |
| --- | --- |
| Name | Required |
| Icon | An emoji; pick one of the twelve presets or type your own |
| Repeats | Daily, Selected days, Weekly, Monthly, One-off |
| Date | Only for One-off |
| On | Only for Selected days: any combination of weekdays |
| Every | Only for Weekly: 1, 2, 3, 4, 6, or 8 weeks |
| On (weekday) | Only for Weekly: which day of the week |
| Day of month | Only for Monthly: 1–31, clamped to the last day of shorter months |
| Who | One person, Rotating, or Either of us |
| Assignee | Only for One person |
| Rotation order | Only for Rotating: the ordered list, with move up, move down, and remove |
| Due time (optional) | A time of day. Display only — it does not change when the chore appears |
| Minutes (optional) | Estimated effort, 1–1440, shown as "15 min" |
| Notes | Free text |

A fixed chore needs exactly one member, a rotating chore needs at least two, and
"Either of us" has no member list. Choosing a different assignment resets the
member list as needed; the first member in the rotation list goes first.

New recurring chores are anchored at today. Schedule edits never rewrite the
past: already-open occurrences before today become `missed`, future open ones
are dropped and regenerated from the new rule, and the rotation index keeps
counting from the highest retained occurrence so the order still advances.

## Recurrence semantics

| Type | Behaviour |
| --- | --- |
| One-off | A single date, never expires |
| Daily | Every day from the anchor |
| Selected days | Every matching weekday from the anchor |
| Weekly | The chosen weekday every N weeks from the anchor |
| Monthly | The chosen day each month, using the last day of shorter months |

## Rotation and skips

The assignee of occurrence *n* is the member at position *n* modulo the size of
the rotation list, counted from the schedule anchor. Skipping or missing an
occurrence does not change the index of the others, so the order stays stable:
skipping Mara's turn still gives the next occurrence to Theo. Reordering the
rotation takes effect for occurrences generated afterwards, and reassigning a
single occurrence changes only that one.

## Missed chores

An open occurrence becomes `missed` once the chore's next scheduled date
arrives: a daily chore expires when the next day's occurrence exists, a weekly
one when the next week's does. One-off chores never expire. Missed occurrences
stay in the history and are never shown on Today, so they do not pile up.

## Progress and rings

Progress is counts only — there are no points, streaks, or rewards.

- Today shows a bar per member with "done/total".
- The calendar header shows the same numbers as a ring around each member's
  chip; tapping the chip lists that person's chores for the day.
- Skipped occurrences are excluded. A chore completed by someone other than the
  assignee counts for the completer, and an open "either of us" chore counts for
  nobody until it is completed.

## Related

- [Calendar](calendar) — member rings and filters
- [Settings](settings) — members, colours, and the household week start
- [REST API](../reference/rest-api) — chore and occurrence endpoints
- Source: [chore-recurrence.ts](https://github.com/dev-arekusandoru/telescreen/blob/main/src/services/chore-recurrence.ts), [chores.ts](https://github.com/dev-arekusandoru/telescreen/blob/main/src/services/chores.ts)
