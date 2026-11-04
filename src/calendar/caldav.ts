import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { createAccount, fetchCalendarObjects, fetchCalendars, getBasicAuthHeaders } from "tsdav";
import type { DAVAccount } from "tsdav";
import { events } from "../db/schema.js";
import {
  buildNewIcs,
  editInstanceIcs,
  editMasterIcs,
  excludeInstanceIcs,
  parseResource,
  type TimeSpec,
} from "./ics.js";
import {
  ProviderAuthError,
  ProviderConflictError,
  ProviderError,
  type CalendarRef,
  type EventRef,
  type Provider,
  type RemoteCalendar,
  type SyncContext,
  type SyncOutcome,
} from "./provider.js";
import { deleteResource, replaceResource } from "./store.js";
import { wallAsUtcMs } from "./time.js";

export interface CaldavSecret {
  appleId: string;
  appPassword: string;
}

export const ICLOUD_URL = "https://caldav.icloud.com";

const serverUrl = () => process.env.ICLOUD_CALDAV_URL?.trim() || ICLOUD_URL;

/** Late-bound so tests can stub `globalThis.fetch`. */
const doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

const CALENDAR_PROPS = {
  "c:calendar-description": {},
  "c:calendar-timezone": {},
  "d:displayname": {},
  "ca:calendar-color": {},
  "cs:getctag": {},
  "d:resourcetype": {},
  "c:supported-calendar-component-set": {},
  "d:sync-token": {},
  "d:current-user-privilege-set": {},
};

function isAuthStatus(status: number): boolean {
  return status === 401;
}

async function expectOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  if (isAuthStatus(res.status)) throw new ProviderAuthError("Apple ID or app-specific password was rejected");
  throw new ProviderError(`${what} failed (HTTP ${res.status})`);
}

/** Wrap tsdav/network errors: 401-ish messages become auth errors. */
function translate(error: unknown, what: string): Error {
  if (error instanceof ProviderAuthError || error instanceof ProviderError || error instanceof ProviderConflictError) {
    return error;
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (/401|invalid credentials|unauthori[sz]ed/i.test(msg)) {
    return new ProviderAuthError("Apple ID or app-specific password was rejected");
  }
  return new ProviderError(`${what}: ${msg}`, { cause: error });
}

function isWritable(cal: { projectedProps?: Record<string, unknown>; resourcetype?: string[] }): boolean {
  if (cal.resourcetype?.includes("subscribed")) return false;
  const privileges = cal.projectedProps?.currentUserPrivilegeSet;
  if (privileges === undefined) return true;
  return /"(d:)?(write|write-content|all|bind)"/.test(JSON.stringify(privileges));
}

function normalizeColor(color: unknown): string | null {
  if (typeof color !== "string") return null;
  const m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(color.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

export class CaldavProvider implements Provider {
  private readonly headers: Record<string, string>;
  private account: DAVAccount | undefined;
  /** ctags seen by the last `listCalendars()`; a sync pass lists first, so each calendar costs no extra PROPFIND. */
  private readonly ctags = new Map<string, string | null>();

  constructor(secret: CaldavSecret) {
    this.headers = getBasicAuthHeaders({ username: secret.appleId, password: secret.appPassword }) as Record<string, string>;
  }

  private async davAccount(): Promise<DAVAccount> {
    if (this.account) return this.account;
    try {
      this.account = await createAccount({
        account: { serverUrl: serverUrl(), accountType: "caldav" },
        headers: this.headers,
        loadCollections: false,
        loadObjects: false,
        fetch: doFetch,
      });
    } catch (e) {
      throw translate(e, "CalDAV discovery");
    }
    return this.account;
  }

  async listCalendars(): Promise<RemoteCalendar[]> {
    const account = await this.davAccount();
    try {
      const cals = await fetchCalendars({
        account,
        headers: this.headers,
        props: CALENDAR_PROPS,
        projectedProps: { currentUserPrivilegeSet: true },
        fetch: doFetch,
      });
      for (const c of cals) this.ctags.set(c.url, c.ctag ?? null);
      return cals
        .filter((c) => !c.components || c.components.length === 0 || c.components.includes("VEVENT"))
        .map((c) => ({
          remoteId: c.url,
          name: typeof c.displayName === "string" && c.displayName ? c.displayName : "Calendar",
          color: normalizeColor(c.calendarColor),
          writable: isWritable(c as { projectedProps?: Record<string, unknown>; resourcetype?: string[] }),
        }));
    } catch (e) {
      throw translate(e, "Listing calendars");
    }
  }

  async syncCalendar(cal: CalendarRef, ctx: SyncContext): Promise<SyncOutcome> {
    try {
      const ctag = this.ctags.get(cal.remoteId) ?? null;
      if (ctag !== null && ctag === cal.ctag) return {};

      const objects = await fetchCalendarObjects({
        calendar: { url: cal.remoteId },
        headers: this.headers,
        useMultiGet: false,
        fetch: doFetch,
      });

      const cached = new Map<string, string | null>();
      for (const row of ctx.db
        .select({ remoteId: events.remoteId, etag: events.etag })
        .from(events)
        .where(and(eq(events.calendarId, cal.id), isNull(events.recurrenceId)))
        .all()) {
        cached.set(row.remoteId, row.etag);
      }

      const seen = new Set<string>();
      for (const obj of objects) {
        seen.add(obj.url);
        const etag = obj.etag ?? null;
        if (etag !== null && cached.get(obj.url) === etag) continue;
        let ics = typeof obj.data === "string" ? obj.data : null;
        if (ics === null) {
          const fetched = await this.getResource(obj.url);
          if (!fetched) continue;
          ics = fetched.ics;
        }
        this.store(cal.id, obj.url, etag, ics, ctx);
      }
      for (const remoteId of cached.keys()) {
        if (!seen.has(remoteId)) deleteResource(ctx.db, cal.id, remoteId);
      }
      return { ctag };
    } catch (e) {
      throw translate(e, "Syncing calendar");
    }
  }

  private store(calendarId: string, remoteId: string, etag: string | null, ics: string, ctx: SyncContext): void {
    let rows;
    try {
      rows = parseResource(ics, { remoteId, etag, defaultTz: ctx.defaultTz });
    } catch (e) {
      // A single unparsable resource must not fail the whole calendar.
      console.warn(`[homehub] skipping unparsable calendar object ${remoteId}:`, e);
      return;
    }
    replaceResource(ctx.db, calendarId, remoteId, rows);
  }

  private async getResource(url: string): Promise<{ ics: string; etag: string | null } | null> {
    const res = await doFetch(url, { method: "GET", headers: this.headers });
    if (res.status === 404) return null;
    await expectOk(res, "Fetching event");
    return { ics: await res.text(), etag: res.headers.get("etag") };
  }

  private async put(url: string, ics: string, precondition: Record<string, string>): Promise<{ status: number; etag: string | null }> {
    const res = await doFetch(url, {
      method: "PUT",
      headers: { ...this.headers, "content-type": "text/calendar; charset=utf-8", ...precondition },
      body: ics,
    });
    if (res.status === 412) return { status: 412, etag: null };
    await expectOk(res, "Saving event");
    return { status: res.status, etag: res.headers.get("etag") };
  }

  /** Refresh the cache for one resource after a failed precondition, then raise the conflict. */
  private async conflict(cal: CalendarRef, url: string, ctx: SyncContext): Promise<never> {
    const fresh = await this.getResource(url);
    if (fresh) this.store(cal.id, url, fresh.etag, fresh.ics, ctx);
    else deleteResource(ctx.db, cal.id, url);
    throw new ProviderConflictError();
  }

  /** PUT then cache. If the server omits the new etag, refetch to learn it. */
  private async putAndCache(cal: CalendarRef, url: string, ics: string, precondition: Record<string, string>, ctx: SyncContext): Promise<void> {
    const { status, etag } = await this.put(url, ics, precondition);
    if (status === 412) return this.conflict(cal, url, ctx);
    if (etag) {
      this.store(cal.id, url, etag, ics, ctx);
      return;
    }
    const fresh = await this.getResource(url);
    if (fresh) this.store(cal.id, url, fresh.etag, fresh.ics, ctx);
  }

  async createEvent(cal: CalendarRef, fields: Parameters<Provider["createEvent"]>[1], ctx: SyncContext) {
    const uid = randomUUID();
    const base = cal.remoteId.endsWith("/") ? cal.remoteId : `${cal.remoteId}/`;
    const url = new URL(`${uid}.ics`, base).href;
    try {
      await this.putAndCache(cal, url, buildNewIcs(uid, fields, ctx.now()), { "if-none-match": "*" }, ctx);
    } catch (e) {
      throw translate(e, "Creating event");
    }
    return { remoteId: url };
  }

  /** Fetch the live resource; if it differs from what the UI saw, refresh and conflict. */
  private async liveResource(cal: CalendarRef, master: EventRef, ctx: SyncContext): Promise<{ ics: string; etag: string }> {
    const live = await this.getResource(master.remoteId);
    if (!live) {
      deleteResource(ctx.db, cal.id, master.remoteId);
      throw new ProviderConflictError();
    }
    if (live.etag === null || (master.etag !== null && live.etag !== master.etag)) {
      this.store(cal.id, master.remoteId, live.etag, live.ics, ctx);
      throw new ProviderConflictError();
    }
    return { ics: live.ics, etag: live.etag };
  }

  async updateEvent(
    cal: CalendarRef,
    master: EventRef,
    change: Parameters<Provider["updateEvent"]>[2],
    ctx: SyncContext,
  ): Promise<void> {
    try {
      const live = await this.liveResource(cal, master, ctx);
      const now = ctx.now();
      let ics: string;
      if (change.scope === "this" && master.rrule !== null && change.key) {
        ics = editInstanceIcs(live.ics, change.key, keySpec(change.key, master), change.fields, now, ctx.defaultTz);
      } else {
        ics = editMasterIcs(live.ics, change.fields, now, { rruleChanged: change.rruleChanged });
      }
      await this.putAndCache(cal, master.remoteId, ics, { "if-match": live.etag }, ctx);
    } catch (e) {
      throw translate(e, "Updating event");
    }
  }

  async deleteEvent(
    cal: CalendarRef,
    master: EventRef,
    change: Parameters<Provider["deleteEvent"]>[2],
    ctx: SyncContext,
  ): Promise<void> {
    try {
      const live = await this.liveResource(cal, master, ctx);
      if (change.scope === "this" && master.rrule !== null && change.key) {
        const ics = excludeInstanceIcs(live.ics, change.key, keySpec(change.key, master), ctx.now(), ctx.defaultTz);
        await this.putAndCache(cal, master.remoteId, ics, { "if-match": live.etag }, ctx);
        return;
      }
      const res = await doFetch(master.remoteId, { method: "DELETE", headers: { ...this.headers, "if-match": live.etag } });
      if (res.status === 412) return await this.conflict(cal, master.remoteId, ctx);
      if (res.status !== 404) await expectOk(res, "Deleting event");
      deleteResource(ctx.db, cal.id, master.remoteId);
    } catch (e) {
      throw translate(e, "Deleting event");
    }
  }
}

/** TimeSpec of an occurrence key (UTC ISO for timed, `YYYY-MM-DD` for all-day). */
function keySpec(key: string, master: EventRef): TimeSpec {
  return master.allDay
    ? { allDay: true, ms: wallAsUtcMs(key), tz: null }
    : { allDay: false, ms: Date.parse(key), tz: master.startTz };
}
