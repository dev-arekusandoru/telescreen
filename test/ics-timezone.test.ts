import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { buildNewIcs, editInstanceIcs, excludeInstanceIcs, parseResource, type WriteFields } from "../src/calendar/ics.js";

const NOW = new Date("2026-11-03T10:00:00Z");
const fields: WriteFields = {
  summary: "Standup",
  location: null,
  notes: null,
  start: { allDay: false, ms: Date.parse("2026-11-09T08:00:00Z"), tz: "Europe/Berlin" },
  end: { allDay: false, ms: Date.parse("2026-11-09T09:00:00Z"), tz: "Europe/Berlin" },
  rrule: "FREQ=WEEKLY",
};

function vtimezones(ics: string): string[] {
  const vcal = new ICAL.Component(ICAL.parse(ics));
  return vcal.getAllSubcomponents("vtimezone").map((v) => String(v.getFirstPropertyValue("tzid")));
}

describe("iCloud writes carry VTIMEZONE", () => {
  it("adds a VTIMEZONE before the VEVENT for a TZID start", () => {
    const ics = buildNewIcs("uid-1", fields, NOW);
    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20261109T090000");
    expect(vtimezones(ics)).toEqual(["Europe/Berlin"]);
    expect(ics.indexOf("BEGIN:VTIMEZONE")).toBeLessThan(ics.indexOf("BEGIN:VEVENT"));
    expect(ics).toContain("BEGIN:DAYLIGHT");
    expect(ics).toContain("BEGIN:STANDARD");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
  });

  it("does not duplicate it across edits, and covers EXDATE/RECURRENCE-ID", () => {
    let ics = buildNewIcs("uid-1", fields, NOW);
    ics = excludeInstanceIcs(ics, "2026-11-16T08:00:00.000Z", fields.start, NOW, "Europe/Berlin");
    ics = editInstanceIcs(ics, "2026-11-23T08:00:00.000Z", { allDay: false, ms: Date.parse("2026-11-23T08:00:00Z"), tz: "Europe/Berlin" }, { ...fields, summary: "Moved" }, NOW, "Europe/Berlin");
    expect(vtimezones(ics)).toEqual(["Europe/Berlin"]);
    expect(ics).toContain("EXDATE;TZID=Europe/Berlin:");
  });

  it("still parses back to the same instants", () => {
    const ics = buildNewIcs("uid-1", fields, NOW);
    const [row] = parseResource(ics, { remoteId: "r", etag: null, defaultTz: "UTC" });
    expect(row?.startUtc).toBe("2026-11-09T08:00:00.000Z");
    expect(row?.startTz).toBe("Europe/Berlin");
  });

  it("adds none for UTC or all-day events", () => {
    const utc = buildNewIcs("u2", { ...fields, rrule: null, start: { ...fields.start, tz: "UTC" }, end: { ...fields.end, tz: "UTC" } }, NOW);
    expect(vtimezones(utc)).toEqual([]);
  });
});
