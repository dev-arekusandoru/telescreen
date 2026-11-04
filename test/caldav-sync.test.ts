import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { events as eventsTable } from "../src/db/schema.js";
import { syncAccount } from "../src/services/sync.js";
import type { EventInstance } from "../src/services/events.js";
import { makeTestApp, type TestApp } from "./helpers.js";
import { ics, vevent } from "./calendar-helpers.js";
import { FakeCaldav, type FakeCalendar } from "./fake-caldav.js";

interface Account {
  id: string;
  provider: string;
  label: string;
  status: string;
  lastError: string | null;
}
interface Calendar {
  id: string;
  name: string;
  color: string | null;
  writable: boolean;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let fake: FakeCaldav;
let work: FakeCalendar;
let t: TestApp;

beforeEach(() => {
  fake = new FakeCaldav();
  work = fake.addCalendar("Work");
  fake.addCalendar("Holidays", { writable: false });
  vi.stubGlobal("fetch", fake.fetch);
  t = makeTestApp();
});
afterEach(() => vi.unstubAllGlobals());

const connect = async () => {
  const res = await t.request<Account>("POST", "/api/v1/accounts/icloud", {
    label: "Home iCloud",
    appleId: "apple@example.com",
    appPassword: fake.password,
  });
  expect(res.status).toBe(201);
  await syncAccount(t.ctx, res.body.id); // joins the background sync started by the route
  return res.body;
};
const calendars = async () => (await t.request<Calendar[]>("GET", "/api/v1/calendars")).body;
const workCal = async () => (await calendars()).find((c) => c.name === "Work")!;
const list = async (start = "2026-11-01T00:00:00Z", end = "2026-12-01T00:00:00Z") =>
  (await t.request<EventInstance[]>("GET", `/api/v1/events?start=${start}&end=${end}`)).body;

const meeting = (extra: string[] = []) =>
  ics([
    vevent([
      "UID:meet-1",
      "DTSTART:20261104T100000Z",
      "DTEND:20261104T110000Z",
      "SUMMARY:Planning",
      "LOCATION:Room 4",
      ...extra,
    ]),
  ]);

describe("iCloud (CalDAV) accounts", () => {
  it("validates credentials, never exposes secrets, and discovers calendars", async () => {
    const bad = await t.request("POST", "/api/v1/accounts/icloud", { label: "x", appleId: "apple@example.com", appPassword: "wrong" });
    expect(bad.status).toBe(422);
    expect((await t.request<Account[]>("GET", "/api/v1/accounts")).body).toEqual([]);

    const account = await connect();
    const accounts = (await t.request<Account[]>("GET", "/api/v1/accounts")).body;
    expect(accounts).toEqual([{ id: account.id, provider: "icloud", label: "Home iCloud", status: "ok", lastError: null }]);
    expect(JSON.stringify(accounts)).not.toMatch(/pass|secret/i);

    const cals = await calendars();
    expect(cals.map((c) => [c.name, c.writable, c.enabled])).toEqual([
      ["Holidays", false, true],
      ["Work", true, true],
    ]);
    expect(cals[0]!.color).toBe("#ff2968");
    expect(cals.every((c) => c.lastSyncedAt !== null && c.lastError === null)).toBe(true);
    expect((await t.request<{ hasErrors: boolean; lastSyncedAt: string }>("GET", "/api/v1/sync/status")).body).toMatchObject({ hasErrors: false });
  });

  it("syncs incrementally: ctag skip, edits and deletions", async () => {
    work.objects.set(`${work.path}a.ics`, { ics: meeting(), etag: '"e1"' });
    const account = await connect();
    expect((await list()).map((e) => [e.title, e.location, e.start])).toEqual([["Planning", "Room 4", "2026-11-04T10:00:00.000Z"]]);

    const before = fake.requests.filter((r) => r.method === "REPORT").length;
    await t.request("POST", `/api/v1/accounts/${account.id}/sync`);
    expect(fake.requests.filter((r) => r.method === "REPORT").length).toBe(before); // ctag unchanged

    fake.put(work, "a.ics", meeting().replace("Planning", "Planning v2"));
    fake.put(work, "b.ics", ics([vevent(["UID:b", "DTSTART:20261105T100000Z", "DTEND:20261105T110000Z", "SUMMARY:Other"])]));
    await t.request("POST", `/api/v1/accounts/${account.id}/sync`);
    expect((await list()).map((e) => e.title)).toEqual(["Planning v2", "Other"]);

    fake.remove(work, "a.ics");
    await t.request("POST", `/api/v1/accounts/${account.id}/sync`);
    expect((await list()).map((e) => e.title)).toEqual(["Other"]);
  });

  it("keeps instance ids stable across syncs", async () => {
    work.objects.set(`${work.path}r.ics`, {
      ics: ics([vevent(["UID:r", "DTSTART:20261102T080000Z", "DTEND:20261102T083000Z", "RRULE:FREQ=DAILY;COUNT=3", "SUMMARY:Run"])]),
      etag: '"r1"',
    });
    const account = await connect();
    const first = (await list()).map((e) => e.id);
    fake.put(work, "r.ics", ics([vevent(["UID:r", "DTSTART:20261102T080000Z", "DTEND:20261102T083000Z", "RRULE:FREQ=DAILY;COUNT=3", "SUMMARY:Run fast"])]));
    await t.request("POST", `/api/v1/accounts/${account.id}/sync`);
    const second = await list();
    expect(second.map((e) => e.id)).toEqual(first);
    expect(second.every((e) => e.title === "Run fast")).toBe(true);
  });

  it("records a sync failure on the calendar and flags the header status", async () => {
    const account = await connect();
    fake.password = "changed"; // iCloud password revoked
    await t.request("POST", `/api/v1/accounts/${account.id}/sync`);
    const acc = (await t.request<Account[]>("GET", "/api/v1/accounts")).body[0]!;
    expect(acc.status).toBe("needs_auth");
    expect(acc.lastError).toMatch(/rejected/i);
    expect((await t.request<{ hasErrors: boolean }>("GET", "/api/v1/sync/status")).body.hasErrors).toBe(true);
  });

  it("deleting an account removes its calendars and events", async () => {
    work.objects.set(`${work.path}a.ics`, { ics: meeting(), etag: '"e1"' });
    const account = await connect();
    expect((await list()).length).toBe(1);
    expect((await t.request("DELETE", `/api/v1/accounts/${account.id}`)).status).toBe(204);
    expect(await calendars()).toEqual([]);
    expect(t.db.select().from(eventsTable).all()).toEqual([]);
  });
});

describe("iCloud writes", () => {
  it("creates, edits and deletes a single event (provider first, then cache)", async () => {
    await connect();
    const cal = await workCal();
    const created = await t.request<EventInstance>("POST", "/api/v1/events", {
      calendarId: cal.id,
      title: "Dentist",
      start: "2026-11-10T14:00:00Z",
      end: "2026-11-10T15:00:00Z",
      allDay: false,
      location: "Main St",
      repeat: "none",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "Dentist", writable: true, recurring: false, calendarId: cal.id });

    const stored = [...work.objects.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]!.ics).toContain("SUMMARY:Dentist");
    expect(stored[0]!.ics).toContain("DTSTART:20261110T140000Z");

    const patched = await t.request<EventInstance>("PATCH", `/api/v1/events/${created.body.id}`, { title: "Dentist (moved)", start: "2026-11-11T14:00:00Z", end: "2026-11-11T15:00:00Z" });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ title: "Dentist (moved)", start: "2026-11-11T14:00:00.000Z", location: "Main St" });
    expect([...work.objects.values()][0]!.ics).toContain("SUMMARY:Dentist (moved)");

    expect((await t.request("DELETE", `/api/v1/events/${created.body.id}`)).status).toBe(204);
    expect(work.objects.size).toBe(0);
    expect(await list()).toEqual([]);
  });

  it("creates all-day and recurring events with the right ICS", async () => {
    await connect();
    const cal = await workCal();
    const allDay = await t.request<EventInstance>("POST", "/api/v1/events", {
      calendarId: cal.id, title: "Holiday", start: "2026-11-20", end: "2026-11-22", allDay: true, repeat: "none",
    });
    expect(allDay.body).toMatchObject({ allDay: true, start: "2026-11-20", end: "2026-11-22" });
    const weekly = await t.request<EventInstance>("POST", "/api/v1/events", {
      calendarId: cal.id, title: "Choir", start: "2026-11-03T18:00:00Z", end: "2026-11-03T19:00:00Z", allDay: false, repeat: "weekly",
    });
    expect(weekly.body).toMatchObject({ recurring: true, repeat: "weekly" });
    const ical = [...work.objects.values()].map((o) => o.ics).join("\n");
    expect(ical).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ical).toContain("RRULE:FREQ=WEEKLY");
    expect(ical).toContain("DTSTART;TZID=Europe/Berlin:20261103T190000");
    expect((await list()).filter((e) => e.title === "Choir")).toHaveLength(4);
  });

  it("edits and deletes one occurrence or the whole series", async () => {
    work.objects.set(`${work.path}s.ics`, {
      ics: ics([vevent(["UID:s", "DTSTART:20261102T080000Z", "DTEND:20261102T090000Z", "RRULE:FREQ=DAILY;COUNT=5", "SUMMARY:Yoga"])]),
      etag: '"s1"',
    });
    await connect();
    let l = await list();
    expect(l).toHaveLength(5);

    // this: override
    const one = await t.request<EventInstance>("PATCH", `/api/v1/events/${l[1]!.id}?scope=this`, { title: "Yoga (special)", start: "2026-11-03T12:00:00Z", end: "2026-11-03T13:00:00Z" });
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ title: "Yoga (special)", start: "2026-11-03T12:00:00.000Z" });
    const ics1 = work.objects.get(`${work.path}s.ics`)!.ics;
    expect(ics1).toContain("RECURRENCE-ID:20261103T080000Z");
    expect(ics1).toContain("RRULE:FREQ=DAILY;COUNT=5"); // master untouched
    l = await list();
    expect(l.map((e) => [e.title, e.start.slice(11, 16)])).toEqual([
      ["Yoga", "08:00"], ["Yoga (special)", "12:00"], ["Yoga", "08:00"], ["Yoga", "08:00"], ["Yoga", "08:00"],
    ]);

    // this: delete -> EXDATE
    const del = await t.request("DELETE", `/api/v1/events/${l[2]!.id}?scope=this`);
    expect(del.status).toBe(204);
    expect(work.objects.get(`${work.path}s.ics`)!.ics).toContain("EXDATE:20261104T080000Z");
    expect(await list()).toHaveLength(4);

    // all: retitle the series; the override is preserved
    const all = await t.request<EventInstance>("PATCH", `/api/v1/events/${l[0]!.id}?scope=all`, { title: "Yoga class" });
    expect(all.status).toBe(200);
    l = await list();
    expect(l.map((e) => e.title)).toEqual(["Yoga class", "Yoga (special)", "Yoga class", "Yoga class"]);

    // all: delete the whole series
    expect((await t.request("DELETE", `/api/v1/events/${l[0]!.id}?scope=all`)).status).toBe(204);
    expect(work.objects.size).toBe(0);
    expect(await list()).toEqual([]);
  });

  it("scope=all with a dragged occurrence shifts the series by the same wall-clock delta", async () => {
    work.objects.set(`${work.path}s.ics`, {
      ics: ics([vevent(["UID:s", "DTSTART;TZID=Europe/Berlin:20261102T100000", "DTEND;TZID=Europe/Berlin:20261102T110000", "RRULE:FREQ=DAILY;COUNT=3", "SUMMARY:Yoga"])]),
      etag: '"s1"',
    });
    await connect();
    const l = await list();
    // second occurrence moved one hour later (09:00Z -> 10:00Z)
    await t.request("PATCH", `/api/v1/events/${l[1]!.id}?scope=all`, { start: "2026-11-03T10:00:00Z", end: "2026-11-03T11:00:00Z" });
    expect((await list()).map((e) => e.start)).toEqual(["2026-11-02T10:00:00.000Z", "2026-11-03T10:00:00.000Z", "2026-11-04T10:00:00.000Z"]);
  });

  it("rejects writes to read-only calendars with 403", async () => {
    await connect();
    const ro = (await calendars()).find((c) => !c.writable)!;
    const res = await t.request("POST", "/api/v1/events", {
      calendarId: ro.id, title: "No", start: "2026-11-10T14:00:00Z", end: "2026-11-10T15:00:00Z", allDay: false, repeat: "none",
    });
    expect(res.status).toBe(403);
    expect(fake.requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("returns 409 and refreshes the cache when the event changed elsewhere (412)", async () => {
    work.objects.set(`${work.path}a.ics`, { ics: meeting(), etag: '"e1"' });
    await connect();
    const [event] = await list();
    fake.put(work, "a.ics", meeting().replace("Planning", "Planning (edited elsewhere)"));

    const res = await t.request<{ error: { code: string; message: string } }>("PATCH", `/api/v1/events/${event!.id}`, { title: "My edit" });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "conflict", message: "This event changed elsewhere" });
    expect(work.objects.get(`${work.path}a.ics`)!.ics).toContain("edited elsewhere"); // not overwritten
    expect((await list())[0]!.title).toBe("Planning (edited elsewhere)"); // cache refetched

    // A 412 raised by the server itself (change between our GET and PUT) is also a conflict.
    const origFetch = fake.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") {
        fake.put(work, "a.ics", meeting().replace("Planning", "Planning (race)"));
      }
      return origFetch(input, init);
    });
    const [fresh] = await list();
    const race = await t.request<{ error: { code: string } }>("PATCH", `/api/v1/events/${fresh!.id}`, { title: "Again" });
    expect(race.status).toBe(409);
    expect(race.body.error.code).toBe("conflict");
    expect((await list())[0]!.title).toBe("Planning (race)");
  });

  it("deleting an event that someone else already changed is a conflict, not a silent delete", async () => {
    work.objects.set(`${work.path}a.ics`, { ics: meeting(), etag: '"e1"' });
    await connect();
    const [event] = await list();
    fake.put(work, "a.ics", meeting().replace("Room 4", "Room 5"));
    const res = await t.request("DELETE", `/api/v1/events/${event!.id}`);
    expect(res.status).toBe(409);
    expect(work.objects.size).toBe(1);
  });

  it("maps provider failures to 502", async () => {
    await connect();
    const cal = await workCal();
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) =>
      init?.method === "PUT" ? new Response("boom", { status: 500 }) : fake.fetch(input, init));
    const res = await t.request<{ error: { code: string } }>("POST", "/api/v1/events", {
      calendarId: cal.id, title: "X", start: "2026-11-10T14:00:00Z", end: "2026-11-10T15:00:00Z", allDay: false, repeat: "none",
    });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("provider_error");
    expect(await list()).toEqual([]);
  });
});
