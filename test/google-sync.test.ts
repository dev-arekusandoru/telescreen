import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accounts, calendars, events as eventsTable } from "../src/db/schema.js";
import type { EventInstance } from "../src/services/events.js";
import { syncAccount } from "../src/services/sync.js";
import { makeTestApp, type TestApp } from "./helpers.js";
import { addAccount } from "./calendar-helpers.js";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/google/${name}.json`, import.meta.url), "utf8"));

interface Recorded {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

const PRIMARY = "mara@example.com";
const eventsPath = (cal: string, id = "") => `/calendar/v3/calendars/${encodeURIComponent(cal)}/events${id ? `/${encodeURIComponent(id)}` : ""}`;

/** Fetch stub: routes Google endpoints; `eventsHandler` answers primary-calendar event lists. */
function googleFetch(state: {
  eventsHandler: (req: Recorded) => { status: number; body?: unknown };
  /** Handlers for writes keyed by `METHOD path`. */
  writes?: Map<string, (req: Recorded) => { status: number; body?: unknown }>;
}) {
  const log: Recorded[] = [];
  const fn: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const text = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
    const req: Recorded = { method, url, headers: new Headers(init?.headers), body: text.startsWith("{") ? JSON.parse(text) : text };
    log.push(req);
    const reply = (r: { status: number; body?: unknown }) =>
      new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: { "content-type": "application/json" } });

    if (url.hostname === "oauth2.googleapis.com") {
      const form = new URLSearchParams(text);
      if (form.get("grant_type") === "authorization_code") {
        return reply({ status: 200, body: { access_token: "at-1", refresh_token: "rt-SECRET", expires_in: 3600 } });
      }
      return reply({ status: 200, body: { access_token: "at-2", expires_in: 3600 } });
    }
    if (url.pathname === "/calendar/v3/users/me/calendarList") return reply({ status: 200, body: fixture("calendar-list") });
    if (url.pathname === "/calendar/v3/users/me/calendarList/primary") {
      return reply({ status: 200, body: { id: PRIMARY, primary: true } });
    }
    const write = state.writes?.get(`${method} ${url.pathname}`);
    if (write) return reply(write(req));
    if (method === "GET" && url.pathname === eventsPath(PRIMARY)) return reply(state.eventsHandler(req));
    if (method === "GET" && url.pathname.includes("/events")) {
      return reply({ status: 200, body: { items: [], nextSyncToken: "empty" } });
    }
    return reply({ status: 404, body: { error: { message: `unexpected ${method} ${url.pathname}` } } });
  };
  return { fn, log };
}

interface Account { id: string; status: string; lastError: string | null; label: string }
interface Cal { id: string; name: string; writable: boolean; remoteId?: string }

let t: TestApp;
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.TELESCREEN_PUBLIC_URL = "https://hub.example.ts.net";
  delete process.env.GOOGLE_REDIRECT_URI;
  t = makeTestApp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.TELESCREEN_PUBLIC_URL;
});

const list = async (start = "2026-11-01T00:00:00Z", end = "2026-12-01T00:00:00Z", extra = "") =>
  (await t.request<EventInstance[]>("GET", `/api/v1/events?start=${start}&end=${end}${extra}`)).body;

/** Pagination + sync-token driven handler for the primary calendar. */
function syncHandler(opts: { onIncremental?: (req: Recorded) => { status: number; body?: unknown } } = {}) {
  return (req: Recorded) => {
    const q = req.url.searchParams;
    if (q.get("syncToken")) {
      return opts.onIncremental ? opts.onIncremental(req) : { status: 200, body: fixture("events-incremental") };
    }
    return { status: 200, body: fixture(q.get("pageToken") === "page-2" ? "events-full-page2" : "events-full-page1") };
  };
}

async function connectGoogle(g: ReturnType<typeof googleFetch>): Promise<string> {
  vi.stubGlobal("fetch", g.fn);
  const accountId = addAccount(t.db, "google", { refreshToken: "rt-1" }, { label: PRIMARY });
  await syncAccount(t.ctx, accountId);
  return accountId;
}

describe("Google OAuth", () => {
  it("needs configuration, then builds a consent URL with the redirect default", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect((await t.request("POST", "/api/v1/accounts/google/start")).status).toBe(422);
    process.env.GOOGLE_CLIENT_ID = "client-id";
    const res = await t.request<{ authUrl: string }>("POST", "/api/v1/accounts/google/start");
    expect(res.status).toBe(200);
    const url = new URL(res.body.authUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe("https://hub.example.ts.net/auth/google/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBeTruthy();
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:8788/auth/google/callback";
    const again = new URL((await t.request<{ authUrl: string }>("POST", "/api/v1/accounts/google/start")).body.authUrl);
    expect(again.searchParams.get("redirect_uri")).toBe("http://localhost:8788/auth/google/callback");
  });

  it("callback stores an encrypted refresh token, redirects to /settings, and rejects reused state", async () => {
    const g = googleFetch({ eventsHandler: syncHandler() });
    vi.stubGlobal("fetch", g.fn);
    const state = new URL((await t.request<{ authUrl: string }>("POST", "/api/v1/accounts/google/start")).body.authUrl).searchParams.get("state")!;

    // The browser arrives without a bearer token.
    const ok = await t.app.request(`/auth/google/callback?code=abc&state=${state}`);
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/settings");

    const row = t.db.select().from(accounts).all()[0]!;
    expect(row.provider).toBe("google");
    expect(row.label).toBe(PRIMARY);
    expect(row.secretEncrypted).not.toContain("rt-SECRET");
    const body = (await t.request<Account[]>("GET", "/api/v1/accounts")).body;
    expect(JSON.stringify(body)).not.toMatch(/rt-SECRET|secret/i);
    const exchange = g.log.find((r) => r.url.hostname === "oauth2.googleapis.com")!;
    expect(String(exchange.body)).toContain("redirect_uri=https%3A%2F%2Fhub.example.ts.net%2Fauth%2Fgoogle%2Fcallback");

    const reused = await t.app.request(`/auth/google/callback?code=abc&state=${state}`);
    expect(reused.status).toBe(400);
    expect((await t.app.request("/auth/google/callback?code=abc&state=forged")).status).toBe(400);
    expect((await t.app.request("/auth/google/callback?error=access_denied")).status).toBe(400);
    await syncAccount(t.ctx, row.id); // let the background sync settle before teardown
  });
});

describe("Google sync", () => {
  it("discovers calendars with writability from accessRole", async () => {
    const g = googleFetch({ eventsHandler: syncHandler() });
    await connectGoogle(g);
    const cals = (await t.request<Cal[]>("GET", "/api/v1/calendars")).body;
    expect(cals.map((c) => [c.name, c.writable]).sort()).toEqual([
      ["Family (shared)", true],
      ["Holidays", false],
      [PRIMARY, true],
    ]);
  });

  it("full sync pages through events and expands recurrence, EXDATE, overrides and cancelled instances", async () => {
    const g = googleFetch({ eventsHandler: syncHandler() });
    const accountId = await connectGoogle(g);
    const list1 = await list("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z");
    expect(list1.map((e) => [e.title, e.start, e.end])).toEqual([
      ["Team sync (extended)", "2026-11-03T09:00:00.000Z", "2026-11-03T11:00:00.000Z"], // override replaces 11-03
      ["Lunch", "2026-11-04T11:00:00.000Z", "2026-11-04T12:00:00.000Z"],
      ["Vacation", "2026-11-05", "2026-11-08"],
      ["Will be removed", "2026-11-06T12:00:00.000Z", "2026-11-06T13:00:00.000Z"],
      // 11-10 EXDATE, 11-17 cancelled instance
      ["Team sync", "2026-11-24T09:00:00.000Z", "2026-11-24T10:00:00.000Z"],
    ]);
    const sync = list1.find((e) => e.title === "Team sync")!;
    expect(sync).toMatchObject({ recurring: true, repeat: "custom", timeZone: "Europe/Berlin", location: "Zoom", writable: true });
    expect(list1.find((e) => e.title === "Lunch")).toMatchObject({ notes: "With Sam", recurring: false });
    // First page asked for a bounded window, and the second used the page token.
    const eventCalls = g.log.filter((r) => r.url.pathname === eventsPath(PRIMARY));
    expect(eventCalls[0]!.url.searchParams.get("timeMin")).toBeTruthy();
    expect(eventCalls[0]!.url.searchParams.get("showDeleted")).toBe("true");
    expect(eventCalls[1]!.url.searchParams.get("pageToken")).toBe("page-2");
    expect(eventCalls[0]!.headers.get("authorization")).toBe("Bearer at-2");
    const cal = t.db.select().from(calendars).all().find((c) => c.remoteId === PRIMARY)!;
    expect(cal.syncToken).toBe("SYNC-1");
    expect(cal.lastSyncedAt).not.toBeNull();
    expect(t.db.select().from(accounts).all()[0]!.id).toBe(accountId);
  });

  it("DST: a Google weekly series keeps its Berlin wall-clock time (10:00)", async () => {
    const g = googleFetch({ eventsHandler: syncHandler() });
    await connectGoogle(g);
    const l = (await list("2026-10-12T00:00:00Z", "2026-11-03T00:00:00Z")).filter((e) => e.title === "Team sync");
    expect(l.map((e) => e.start)).toEqual(["2026-10-13T08:00:00.000Z", "2026-10-20T08:00:00.000Z", "2026-10-27T09:00:00.000Z"]);
  });

  it("incremental sync sends the syncToken and applies changes and deletions", async () => {
    const g = googleFetch({ eventsHandler: syncHandler() });
    const accountId = await connectGoogle(g);
    await syncAccount(t.ctx, accountId);
    const calls = g.log.filter((r) => r.url.pathname === eventsPath(PRIMARY) && r.url.searchParams.get("syncToken"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.searchParams.get("syncToken")).toBe("SYNC-1");
    expect(calls[0]!.url.searchParams.has("timeMin")).toBe(false);

    const titles = (await list()).map((e) => e.title);
    expect(titles).toContain("Lunch (moved)");
    expect(titles).toContain("New thing");
    expect(titles).not.toContain("Will be removed");
    expect(titles).toContain("Team sync (extended)"); // untouched by the delta
    expect(t.db.select().from(calendars).all().find((c) => c.remoteId === PRIMARY)!.syncToken).toBe("SYNC-2");
  });

  it("410 Gone drops the token, does a full resync and removes stale rows", async () => {
    let first = true;
    const g = googleFetch({
      eventsHandler: syncHandler({
        onIncremental: () => {
          if (first) {
            first = false;
            return { status: 410, body: fixture("gone") };
          }
          return { status: 200, body: fixture("events-incremental") };
        },
      }),
    });
    // Replace the full-sync fixture on the second pass.
    const base = g.fn;
    let fullSyncs = 0;
    const wrapped: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === eventsPath(PRIMARY) && !url.searchParams.get("syncToken") && !url.searchParams.get("pageToken")) {
        fullSyncs++;
        if (fullSyncs === 2) {
          return new Response(JSON.stringify(fixture("events-resync")), { status: 200 });
        }
      }
      return base(input, init);
    };
    vi.stubGlobal("fetch", wrapped);
    const accountId = addAccount(t.db, "google", { refreshToken: "rt-1" }, { label: PRIMARY });
    await syncAccount(t.ctx, accountId);
    expect((await list()).map((e) => e.title)).toContain("Will be removed");

    await syncAccount(t.ctx, accountId);
    expect(fullSyncs).toBe(2);
    expect((await list()).map((e) => e.title)).toEqual(["Lunch (resynced)"]);
    expect(t.db.select().from(calendars).all().find((c) => c.remoteId === PRIMARY)!.syncToken).toBe("SYNC-3");
    expect(t.db.select().from(accounts).all()[0]!.status).toBe("ok");
  });

  it("marks the account needs_auth when Google revokes the refresh token", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const accountId = addAccount(t.db, "google", { refreshToken: "dead" }, { label: PRIMARY });
    await syncAccount(t.ctx, accountId);
    const acc = (await t.request<Account[]>("GET", "/api/v1/accounts")).body[0]!;
    expect(acc.status).toBe("needs_auth");
    expect(acc.lastError).toMatch(/Reconnect/i);
  });
});

describe("Google writes", () => {
  const primaryCal = async () => (await t.request<Array<Cal & { remoteId: string }>>("GET", "/api/v1/calendars")).body.find((c) => c.name === PRIMARY)!;

  it("creates an event with start/end/timeZone and a recurrence rule", async () => {
    const writes = new Map<string, (r: Recorded) => { status: number; body?: unknown }>();
    writes.set(`POST ${eventsPath(PRIMARY)}`, (req) => {
      const b = req.body as { summary: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string }; recurrence?: string[] };
      return {
        status: 200,
        body: { id: "created1", etag: '"c1"', status: "confirmed", summary: b.summary, start: b.start, end: b.end, recurrence: b.recurrence },
      };
    });
    const g = googleFetch({ eventsHandler: syncHandler(), writes });
    await connectGoogle(g);
    const cal = await primaryCal();
    const res = await t.request<EventInstance>("POST", "/api/v1/events", {
      calendarId: cal.id, title: "Choir", start: "2026-11-03T18:00:00Z", end: "2026-11-03T19:00:00Z", allDay: false, repeat: "weekly",
    });
    expect(res.body).not.toHaveProperty("error");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: "Choir", recurring: true, repeat: "weekly", timeZone: "Europe/Berlin" });
    const sent = g.log.find((r) => r.method === "POST" && r.url.pathname === eventsPath(PRIMARY))!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ summary: "Choir", recurrence: ["RRULE:FREQ=WEEKLY"], start: { dateTime: "2026-11-03T18:00:00.000Z", timeZone: "Europe/Berlin" } });
    expect((await list("2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z")).filter((e) => e.title === "Choir")).toHaveLength(4);
  });

  it("edits one occurrence via the instance id with If-Match, and a 412 becomes 409", async () => {
    const instanceId = "weeklysync_20261124T090000Z";
    const writes = new Map<string, (r: Recorded) => { status: number; body?: unknown }>();
    writes.set(`GET ${eventsPath(PRIMARY, instanceId)}`, () => ({
      status: 200,
      body: { id: instanceId, etag: '"inst-1"', status: "confirmed", summary: "Team sync", recurringEventId: "weeklysync",
        originalStartTime: { dateTime: "2026-11-24T10:00:00+01:00", timeZone: "Europe/Berlin" },
        start: { dateTime: "2026-11-24T10:00:00+01:00" }, end: { dateTime: "2026-11-24T11:00:00+01:00" } },
    }));
    let conflict = false;
    writes.set(`PATCH ${eventsPath(PRIMARY, instanceId)}`, (req) => {
      if (conflict) return { status: 412, body: { error: { message: "Precondition Failed" } } };
      const b = req.body as { summary: string };
      return {
        status: 200,
        body: { id: instanceId, etag: '"inst-2"', status: "confirmed", summary: b.summary, recurringEventId: "weeklysync",
          originalStartTime: { dateTime: "2026-11-24T10:00:00+01:00", timeZone: "Europe/Berlin" },
          start: { dateTime: "2026-11-24T14:00:00+01:00" }, end: { dateTime: "2026-11-24T15:00:00+01:00" } },
      };
    });
    const g = googleFetch({ eventsHandler: syncHandler(), writes });
    await connectGoogle(g);
    const occurrence = (await list()).find((e) => e.start === "2026-11-24T09:00:00.000Z")!;

    const res = await t.request<EventInstance>("PATCH", `/api/v1/events/${occurrence.id}?scope=this`, {
      title: "Team sync (afternoon)", start: "2026-11-24T13:00:00Z", end: "2026-11-24T14:00:00Z",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Team sync (afternoon)", start: "2026-11-24T13:00:00.000Z" });
    const patch = g.log.find((r) => r.method === "PATCH")!;
    expect(patch.headers.get("if-match")).toBe('"inst-1"');
    expect(patch.body).toMatchObject({ summary: "Team sync (afternoon)" });
    expect(patch.body).not.toHaveProperty("recurrence");
    // The override is cached and replaces the generated occurrence.
    const after = (await list()).filter((e) => e.title.startsWith("Team sync"));
    expect(after.map((e) => e.title)).toEqual(["Team sync (extended)", "Team sync (afternoon)"]);

    conflict = true;
    writes.set(`GET ${eventsPath(PRIMARY, "weeklysync_20261124T090000Z")}`, () => ({
      status: 200,
      body: { id: instanceId, etag: '"inst-2"', status: "confirmed", summary: "Team sync (afternoon)", recurringEventId: "weeklysync",
        originalStartTime: { dateTime: "2026-11-24T10:00:00+01:00" }, start: { dateTime: "2026-11-24T14:00:00+01:00" }, end: { dateTime: "2026-11-24T15:00:00+01:00" } },
    }));
    const again = await t.request<{ error: { code: string; message: string } }>("PATCH", `/api/v1/events/${occurrence.id}?scope=this`, { title: "Nope" });
    expect(again.status).toBe(409);
    expect(again.body.error).toEqual({ code: "conflict", message: "This event changed elsewhere" });
  });

  it("deletes one occurrence (cancelled exception) and a whole event", async () => {
    const instanceId = "weeklysync_20261124T090000Z";
    const writes = new Map<string, (r: Recorded) => { status: number; body?: unknown }>();
    writes.set(`GET ${eventsPath(PRIMARY, instanceId)}`, () => ({ status: 200, body: { id: instanceId, etag: '"inst-1"' } }));
    writes.set(`DELETE ${eventsPath(PRIMARY, instanceId)}`, () => ({ status: 204 }));
    writes.set(`DELETE ${eventsPath(PRIMARY, "lunch")}`, () => ({ status: 204 }));
    const g = googleFetch({ eventsHandler: syncHandler(), writes });
    await connectGoogle(g);
    const l = await list();
    const occurrence = l.find((e) => e.start === "2026-11-24T09:00:00.000Z")!;

    expect((await t.request("DELETE", `/api/v1/events/${occurrence.id}?scope=this`)).status).toBe(204);
    expect(g.log.find((r) => r.method === "DELETE" && r.url.pathname === eventsPath(PRIMARY, instanceId))!.headers.get("if-match")).toBe('"inst-1"');
    expect((await list()).some((e) => e.start === "2026-11-24T09:00:00.000Z")).toBe(false);

    const lunch = l.find((e) => e.title === "Lunch")!;
    expect((await t.request("DELETE", `/api/v1/events/${lunch.id}`)).status).toBe(204);
    expect(g.log.find((r) => r.method === "DELETE" && r.url.pathname === eventsPath(PRIMARY, "lunch"))!.headers.get("if-match")).toBe('"l1"');
    expect((await list()).some((e) => e.title === "Lunch")).toBe(false);
  });

  it("refuses writes to a read-only Google calendar", async () => {
    const g = googleFetch({ eventsHandler: syncHandler() });
    await connectGoogle(g);
    const holidays = (await t.request<Cal[]>("GET", "/api/v1/calendars")).body.find((c) => c.name === "Holidays")!;
    const res = await t.request("POST", "/api/v1/events", {
      calendarId: holidays.id, title: "x", start: "2026-11-03T18:00:00Z", end: "2026-11-03T19:00:00Z", allDay: false, repeat: "none",
    });
    expect(res.status).toBe(403);
    expect(t.db.select().from(eventsTable).all().every((e) => e.summary !== "x")).toBe(true);
  });
});
