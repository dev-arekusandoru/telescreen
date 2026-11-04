import { describe, expect, it } from "vitest";
import { parseResource } from "../src/calendar/ics.js";
import { repeatToRrule, rruleToRepeat } from "../src/calendar/recurrence.js";
import { members } from "../src/db/schema.js";
import { replaceResource } from "../src/calendar/store.js";
import { makeTestApp } from "./helpers.js";
import { addAccount, addCalendar, ics, vevent } from "./calendar-helpers.js";
import type { EventInstance } from "../src/services/events.js";

function setup() {
  const t = makeTestApp();
  const accountId = addAccount(t.db, "icloud", { appleId: "a", appPassword: "b" });
  const calendarId = addCalendar(t.db, accountId);
  const load = (href: string, text: string) =>
    replaceResource(t.db, calendarId, href, parseResource(text, { remoteId: href, etag: '"1"', defaultTz: "Europe/Berlin" }));
  const events = async (start: string, end: string, extra = "") =>
    (await t.request<EventInstance[]>("GET", `/api/v1/events?start=${start}&end=${end}${extra}`)).body;
  return { ...t, accountId, calendarId, load, events };
}

describe("GET /events: recurrence expansion", () => {
  it("keeps wall-clock time across the DST change (Europe/Berlin, 2026-10-25)", async () => {
    const s = setup();
    s.load(
      "w.ics",
      ics([
        vevent([
          "UID:weekly",
          "DTSTART;TZID=Europe/Berlin:20261013T100000",
          "DTEND;TZID=Europe/Berlin:20261013T110000",
          "RRULE:FREQ=WEEKLY",
          "SUMMARY:Standup",
        ]),
      ]),
    );
    const list = await s.events("2026-10-12T00:00:00Z", "2026-11-10T00:00:00Z");
    expect(list.map((e) => e.start)).toEqual([
      "2026-10-13T08:00:00.000Z", // CEST = UTC+2
      "2026-10-20T08:00:00.000Z",
      "2026-10-27T09:00:00.000Z", // CET = UTC+1
      "2026-11-03T09:00:00.000Z",
    ]);
    expect(list[0]).toMatchObject({ title: "Standup", recurring: true, repeat: "weekly", timeZone: "Europe/Berlin", allDay: false });
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
    expect(list.every((e) => e.eventId === list[0]!.eventId)).toBe(true);
  });

  it("applies EXDATE, overrides (moved, retitled) and cancelled overrides", async () => {
    const s = setup();
    s.load(
      "d.ics",
      ics([
        vevent([
          "UID:daily",
          "DTSTART:20261101T090000Z",
          "DTEND:20261101T093000Z",
          "RRULE:FREQ=DAILY;COUNT=6",
          "EXDATE:20261103T090000Z",
          "SUMMARY:Pills",
        ]),
        vevent([
          "UID:daily",
          "RECURRENCE-ID:20261104T090000Z",
          "DTSTART:20261104T150000Z",
          "DTEND:20261104T160000Z",
          "SUMMARY:Pills (moved)",
        ]),
      ]),
    );
    const list = await s.events("2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z");
    expect(list.map((e) => [e.start, e.title])).toEqual([
      ["2026-11-01T09:00:00.000Z", "Pills"],
      ["2026-11-02T09:00:00.000Z", "Pills"],
      // 11-03 excluded by EXDATE
      ["2026-11-04T15:00:00.000Z", "Pills (moved)"],
      ["2026-11-05T09:00:00.000Z", "Pills"],
      ["2026-11-06T09:00:00.000Z", "Pills"],
    ]);
    // The moved override keeps the original occurrence key in its instance id.
    expect(list[2]!.id.endsWith("~2026-11-04T09:00:00.000Z")).toBe(true);
  });

  it("includes an override that moved into the window from outside it", async () => {
    const s = setup();
    s.load(
      "m.ics",
      ics([
        vevent(["UID:m", "DTSTART:20261101T090000Z", "DTEND:20261101T100000Z", "RRULE:FREQ=WEEKLY;COUNT=3", "SUMMARY:A"]),
        vevent(["UID:m", "RECURRENCE-ID:20261108T090000Z", "DTSTART:20261120T090000Z", "DTEND:20261120T100000Z", "SUMMARY:A late"]),
      ]),
    );
    const list = await s.events("2026-11-19T00:00:00Z", "2026-11-21T00:00:00Z");
    expect(list.map((e) => e.title)).toEqual(["A late"]);
  });

  it("keeps all-day events date-only with exclusive end, including recurring ones", async () => {
    const s = setup();
    s.load(
      "trip.ics",
      ics([vevent(["UID:trip", "DTSTART;VALUE=DATE:20261105", "DTEND;VALUE=DATE:20261108", "SUMMARY:Trip"])]),
    );
    s.load(
      "bday.ics",
      ics([vevent(["UID:bday", "DTSTART;VALUE=DATE:20200304", "DTEND;VALUE=DATE:20200305", "RRULE:FREQ=YEARLY", "SUMMARY:Birthday"])]),
    );
    const list = await s.events("2026-11-04T23:00:00Z", "2026-11-09T00:00:00Z");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Trip", start: "2026-11-05", end: "2026-11-08", allDay: true, repeat: "none" });

    const march = await s.events("2027-03-01T00:00:00Z", "2027-03-10T00:00:00Z");
    expect(march).toHaveLength(1);
    expect(march[0]).toMatchObject({ title: "Birthday", start: "2027-03-04", end: "2027-03-05", allDay: true, repeat: "yearly" });
  });

  it("honours UNTIL in UTC against a zoned start", async () => {
    const s = setup();
    s.load(
      "u.ics",
      ics([
        vevent([
          "UID:u",
          "DTSTART;TZID=Europe/Berlin:20261102T230000",
          "DTEND;TZID=Europe/Berlin:20261102T233000",
          "RRULE:FREQ=DAILY;UNTIL=20261104T220000Z",
          "SUMMARY:Late",
        ]),
      ]),
    );
    const list = await s.events("2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z");
    // 23:00 Berlin = 22:00Z; UNTIL is inclusive.
    expect(list.map((e) => e.start)).toEqual(["2026-11-02T22:00:00.000Z", "2026-11-03T22:00:00.000Z", "2026-11-04T22:00:00.000Z"]);
  });

  it("filters by member via the calendar mapping, and hides disabled calendars", async () => {
    const s = setup();
    const alex = s.db.select({ id: members.id }).from(members).orderBy(members.sort).limit(1).get()!;
    const other = addCalendar(s.db, s.accountId, { memberId: alex.id, name: "Alex" });
    s.load("a.ics", ics([vevent(["UID:fam", "DTSTART:20261103T100000Z", "DTEND:20261103T110000Z", "SUMMARY:Family thing"])]));
    replaceResource(s.db, other, "b.ics", parseResource(ics([vevent(["UID:alex", "DTSTART:20261103T120000Z", "DTEND:20261103T130000Z", "SUMMARY:Alex thing"])]), { remoteId: "b.ics", etag: null, defaultTz: "UTC" }));
    const q = (m?: string) => s.events("2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z", m ? `&members=${m}` : "");
    expect((await q()).map((e) => e.title)).toEqual(["Family thing", "Alex thing"]);
    expect((await q(alex.id)).map((e) => [e.title, e.memberId])).toEqual([["Alex thing", alex.id]]);
    expect((await q("family")).map((e) => e.title)).toEqual(["Family thing"]);
    expect((await q(`family,${alex.id}`)).length).toBe(2);
    await s.request("PATCH", `/api/v1/calendars/${other}`, { enabled: false });
    expect((await q()).map((e) => e.title)).toEqual(["Family thing"]);
  });

  it("rejects a bad window", async () => {
    const s = setup();
    expect((await s.request("GET", "/api/v1/events?start=nope&end=2026-11-04T00:00:00Z")).status).toBe(400);
    expect((await s.request("GET", "/api/v1/events?start=2026-11-05T00:00:00Z&end=2026-11-04T00:00:00Z")).status).toBe(400);
  });
});

describe("repeat <-> RRULE", () => {
  it("round-trips the UI options and flags the rest as custom", () => {
    for (const r of ["none", "daily", "weekdays", "weekly", "monthly", "yearly"] as const) {
      expect(rruleToRepeat(repeatToRrule(r))).toBe(r);
    }
    expect(rruleToRepeat("FREQ=WEEKLY;INTERVAL=2")).toBe("custom");
    expect(rruleToRepeat("FREQ=DAILY;COUNT=5")).toBe("custom");
    expect(rruleToRepeat("FREQ=WEEKLY;BYDAY=MO,WE")).toBe("custom");
  });
});
