import { localPublicUrl } from "../config.js";
import { and, eq } from "drizzle-orm";
import { events } from "../db/schema.js";
import type { NormEvent, TimeSpec, WriteFields } from "./ics.js";
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
import { deleteSeries, replaceResource } from "./store.js";
import { DAY_MS, dateToStoredUtc, isValidTimeZone, isoUtc, utcToWall } from "./time.js";

export interface GoogleSecret {
  refreshToken: string;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";

/** OAuth client settings from the environment, or null when Google is not configured. */
export function googleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const publicUrl = (env.HOMEHUB_PUBLIC_URL?.trim() || localPublicUrl(env)).replace(/\/+$/, "");
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim() || `${publicUrl}/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

const doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** Authorization-code → tokens. Returns the refresh token. */
export async function exchangeGoogleCode(config: GoogleConfig, code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await doFetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new ProviderError(`Google rejected the authorization code: ${body.error_description ?? res.status}`);
  }
  if (!body.refresh_token) {
    throw new ProviderError("Google did not return a refresh token. Remove HomeHub from your Google account's third-party access and connect again.");
  }
  return { refreshToken: body.refresh_token, accessToken: body.access_token };
}

// -- Google API shapes (subset) ------------------------------------------------

interface GTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GEvent {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GTime;
  end?: GTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GTime;
  eventType?: string;
}

interface GCalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  accessRole?: string;
  deleted?: boolean;
  primary?: boolean;
}

/** Response bodies: single events and list pages share one loose shape. */
interface GResponse extends Partial<GEvent> {
  error?: { message?: string };
  items?: unknown[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

class GoneError extends Error {}

const ICS_DATE = (d: string) => d.replaceAll("-", "");
const ICS_DT = (wall: string) => wall.replaceAll("-", "").replaceAll(":", "");

/** Occurrence key of a Google time: UTC ISO for timed, date for all-day. */
function gKey(t: GTime): string | null {
  if (t.date) return t.date;
  if (t.dateTime) return isoUtc(Date.parse(t.dateTime));
  return null;
}

/** Google's instance id for an occurrence of a recurring event. */
export function googleInstanceId(masterId: string, key: string): string {
  return `${masterId}_${key.length === 10 ? ICS_DATE(key) : key.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

function dtLine(name: string, t: GTime): string {
  if (t.date) return `${name};VALUE=DATE:${ICS_DATE(t.date)}`;
  const ms = Date.parse(t.dateTime!);
  if (t.timeZone && isValidTimeZone(t.timeZone) && t.timeZone !== "UTC") {
    return `${name};TZID=${t.timeZone}:${ICS_DT(utcToWall(ms, t.timeZone))}`;
  }
  return `${name}:${ICS_DT(isoUtc(ms).slice(0, 19))}Z`;
}

/** Normalise a Google event into a cache row. Null when it has no usable times. */
export function googleToRow(ev: GEvent, remoteId = ev.id): NormEvent | null {
  const { start, end } = ev;
  if (!start || !end) return null;
  const allDay = Boolean(start.date);
  const startKey = allDay ? start.date! : start.dateTime;
  const endKey = allDay ? end.date : end.dateTime;
  if (!startKey || !endKey) return null;
  const startMs = allDay ? Date.parse(dateToStoredUtc(startKey)) : Date.parse(startKey);
  const endMs = allDay ? Date.parse(dateToStoredUtc(endKey)) : Date.parse(endKey);
  const rruleLine = ev.recurrence?.find((l) => l.toUpperCase().startsWith("RRULE:"));
  const rrule = rruleLine ? rruleLine.slice(6) : null;
  const tz = start.timeZone && isValidTimeZone(start.timeZone) ? start.timeZone : start.dateTime?.endsWith("Z") ? "UTC" : null;

  let rawIcs: string | null = null;
  if (ev.recurrence && ev.recurrence.length > 0 && !ev.recurringEventId) {
    rawIcs = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HomeHub//Google//EN",
      "BEGIN:VEVENT",
      `UID:${ev.id}`,
      dtLine("DTSTART", start),
      dtLine("DTEND", { ...end, timeZone: end.timeZone ?? start.timeZone }),
      ...ev.recurrence,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  const recurrenceId = ev.recurringEventId && ev.originalStartTime ? gKey(ev.originalStartTime) : null;
  return {
    remoteId,
    etag: ev.etag ?? null,
    seriesId: ev.recurringEventId ?? ev.id,
    recurrenceId,
    startUtc: isoUtc(startMs),
    endUtc: isoUtc(Math.max(endMs, startMs)),
    startTz: allDay ? null : tz,
    allDay,
    summary: ev.summary ?? "",
    location: ev.location ?? null,
    notes: ev.description ?? null,
    rrule: recurrenceId === null ? rrule : null,
    rawIcs,
    deleted: false,
  };
}

function gtime(spec: TimeSpec): Record<string, string | null> {
  if (spec.allDay) return { date: isoUtc(spec.ms).slice(0, 10), dateTime: null, timeZone: null };
  return { dateTime: isoUtc(spec.ms), timeZone: spec.tz && isValidTimeZone(spec.tz) ? spec.tz : "UTC", date: null };
}

function eventBody(f: WriteFields): Record<string, unknown> {
  return {
    summary: f.summary,
    location: f.location ?? null,
    description: f.notes ?? null,
    start: gtime(f.start),
    end: gtime(f.end),
  };
}

export class GoogleProvider implements Provider {
  private accessToken: string | undefined;

  constructor(
    private readonly secret: GoogleSecret,
    private readonly config: GoogleConfig,
  ) {}

  private async token(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const res = await doFetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.secret.refreshToken,
        grant_type: "refresh_token",
      }),
    }).catch((e) => {
      throw new ProviderError(`Could not reach Google: ${e instanceof Error ? e.message : e}`, { cause: e });
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      if (body.error === "invalid_grant" || res.status === 400 || res.status === 401) {
        throw new ProviderAuthError("Google access was revoked or expired. Reconnect the account.");
      }
      throw new ProviderError(`Google token refresh failed (HTTP ${res.status})`);
    }
    this.accessToken = body.access_token;
    return this.accessToken;
  }

  private async call(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; json: GResponse }> {
    const url = new URL(`${API}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const res = await doFetch(url, {
      method,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
        ...opts.headers,
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    }).catch((e) => {
      throw new ProviderError(`Could not reach Google: ${e instanceof Error ? e.message : e}`, { cause: e });
    });
    const text = await res.text();
    let json: GResponse = {};
    try {
      json = text ? (JSON.parse(text) as GResponse) : {};
    } catch {
      json = {};
    }
    if (res.status === 401) throw new ProviderAuthError("Google rejected the access token. Reconnect the account.");
    return { status: res.status, json };
  }

  private fail(status: number, json: GResponse, what: string): never {
    const detail = json.error?.message ?? `HTTP ${status}`;
    throw new ProviderError(`${what}: ${detail}`);
  }

  async listCalendars(): Promise<RemoteCalendar[]> {
    const out: RemoteCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const { status, json } = await this.call("GET", "/users/me/calendarList", {
        query: { maxResults: "250", ...(pageToken ? { pageToken } : {}) },
      });
      if (status !== 200) this.fail(status, json, "Listing calendars");
      for (const c of (json.items ?? []) as GCalendarListEntry[]) {
        if (c.deleted) continue;
        out.push({
          remoteId: c.id,
          name: c.summaryOverride ?? c.summary ?? c.id,
          color: c.backgroundColor ?? null,
          writable: c.accessRole === "owner" || c.accessRole === "writer",
        });
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  /** Email-like label of the account: the id of the primary calendar. */
  async primaryCalendarId(): Promise<string | null> {
    const { status, json } = await this.call("GET", "/users/me/calendarList/primary");
    return status === 200 ? (json.id ?? null) : null;
  }

  async syncCalendar(cal: CalendarRef, ctx: SyncContext): Promise<SyncOutcome> {
    try {
      return await this.pull(cal, cal.syncToken, ctx);
    } catch (e) {
      if (e instanceof GoneError) return this.pull(cal, null, ctx);
      throw e;
    }
  }

  private async pull(cal: CalendarRef, syncToken: string | null, ctx: SyncContext): Promise<SyncOutcome> {
    const seen = new Set<string>();
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const query: Record<string, string> = {
        maxResults: "2500",
        showDeleted: "true",
        singleEvents: "false",
        ...(syncToken
          ? { syncToken }
          : { timeMin: new Date(ctx.now().getTime() - 365 * DAY_MS).toISOString() }),
        ...(pageToken ? { pageToken } : {}),
      };
      const { status, json } = await this.call("GET", `/calendars/${encodeURIComponent(cal.remoteId)}/events`, { query });
      if (status === 410) throw new GoneError();
      if (status !== 200) this.fail(status, json, "Syncing calendar");
      for (const ev of (json.items ?? []) as GEvent[]) {
        const remoteId = this.apply(cal.id, ev, ctx);
        if (remoteId) seen.add(remoteId);
      }
      pageToken = json.nextPageToken;
      nextSyncToken = json.nextSyncToken ?? nextSyncToken;
    } while (pageToken);

    if (!syncToken) {
      // Full resync: drop anything the provider no longer reports.
      const ids = [...seen];
      const stale = ctx.db.select({ remoteId: events.remoteId }).from(events).where(eq(events.calendarId, cal.id)).all();
      const keep = new Set(ids);
      for (const row of stale) if (!keep.has(row.remoteId)) deleteSeriesByRemote(ctx, cal.id, row.remoteId);
    }
    return { syncToken: nextSyncToken ?? null };
  }

  /** Apply one Google event to the cache. Returns the remote id it now lives under (if any). */
  private apply(calendarId: string, ev: GEvent, ctx: SyncContext): string | null {
    if (ev.eventType === "workingLocation") return null;
    if (ev.status === "cancelled") {
      if (ev.recurringEventId) {
        const key = ev.originalStartTime ? gKey(ev.originalStartTime) : null;
        if (key) {
          const startUtc = key.length === 10 ? dateToStoredUtc(key) : key;
          replaceResource(ctx.db, calendarId, ev.id, [
            {
              remoteId: ev.id,
              etag: ev.etag ?? null,
              seriesId: ev.recurringEventId,
              recurrenceId: key,
              startUtc,
              endUtc: startUtc,
              startTz: null,
              allDay: key.length === 10,
              summary: "",
              location: null,
              notes: null,
              rrule: null,
              rawIcs: null,
              deleted: true,
            },
          ]);
        } else {
          ctx.db.update(events).set({ deleted: true }).where(and(eq(events.calendarId, calendarId), eq(events.remoteId, ev.id))).run();
        }
        return ev.id;
      }
      deleteSeries(ctx.db, calendarId, ev.id);
      return null;
    }
    const row = googleToRow(ev);
    if (!row) return null;
    replaceResource(ctx.db, calendarId, ev.id, [row]);
    return ev.id;
  }

  // -- writes ------------------------------------------------------------------

  async createEvent(cal: CalendarRef, f: WriteFields, ctx: SyncContext) {
    const body: Record<string, unknown> = eventBody(f);
    if (f.rrule) body.recurrence = [`RRULE:${f.rrule}`];
    const { status, json } = await this.call("POST", `/calendars/${encodeURIComponent(cal.remoteId)}/events`, { body });
    if (status !== 200) this.fail(status, json, "Creating event");
    this.apply(cal.id, json as GEvent, ctx);
    return { remoteId: (json as GEvent).id };
  }

  private async refetchAndConflict(cal: CalendarRef, eventId: string, ctx: SyncContext): Promise<never> {
    const { status, json } = await this.call("GET", `/calendars/${encodeURIComponent(cal.remoteId)}/events/${encodeURIComponent(eventId)}`);
    if (status === 200) this.apply(cal.id, json as GEvent, ctx);
    else if (status === 404 || status === 410) deleteSeries(ctx.db, cal.id, eventId);
    throw new ProviderConflictError();
  }

  /** Current etag of an occurrence of a recurring event (fresh from Google). */
  private async liveInstance(cal: CalendarRef, instanceId: string, ctx: SyncContext): Promise<GEvent> {
    const { status, json } = await this.call("GET", `/calendars/${encodeURIComponent(cal.remoteId)}/events/${encodeURIComponent(instanceId)}`);
    if (status === 404 || status === 410) throw new ProviderConflictError();
    if (status !== 200) this.fail(status, json, "Fetching event");
    const live = json as GEvent;
    const cached = ctx.db
      .select({ etag: events.etag })
      .from(events)
      .where(and(eq(events.calendarId, cal.id), eq(events.remoteId, instanceId)))
      .get();
    if (cached?.etag && live.etag && cached.etag !== live.etag) {
      this.apply(cal.id, live, ctx);
      throw new ProviderConflictError();
    }
    return live;
  }

  async updateEvent(cal: CalendarRef, master: EventRef, change: Parameters<Provider["updateEvent"]>[2], ctx: SyncContext): Promise<void> {
    const calPath = `/calendars/${encodeURIComponent(cal.remoteId)}/events`;
    const body: Record<string, unknown> = eventBody(change.fields);
    let targetId = master.remoteId;
    let etag = master.etag;
    if (change.scope === "this" && master.rrule !== null && change.key) {
      targetId = googleInstanceId(master.remoteId, change.key);
      etag = (await this.liveInstance(cal, targetId, ctx)).etag ?? null;
    } else if (change.rruleChanged) {
      const kept = (master.rawIcs ?? "")
        .split(/\r?\n/)
        .filter((l) => /^(EXDATE|RDATE)/i.test(l));
      body.recurrence = change.fields.rrule ? [`RRULE:${change.fields.rrule}`, ...kept] : null;
    }
    const { status, json } = await this.call("PATCH", `${calPath}/${encodeURIComponent(targetId)}`, {
      body,
      ...(etag ? { headers: { "if-match": etag } } : {}),
    });
    if (status === 412) return this.refetchAndConflict(cal, targetId, ctx);
    if (status === 404 || status === 410) {
      deleteSeries(ctx.db, cal.id, master.remoteId);
      throw new ProviderConflictError();
    }
    if (status !== 200) this.fail(status, json, "Updating event");
    this.apply(cal.id, json as GEvent, ctx);
  }

  async deleteEvent(cal: CalendarRef, master: EventRef, change: Parameters<Provider["deleteEvent"]>[2], ctx: SyncContext): Promise<void> {
    const calPath = `/calendars/${encodeURIComponent(cal.remoteId)}/events`;
    const instance = change.scope === "this" && master.rrule !== null && change.key !== null;
    const targetId = instance ? googleInstanceId(master.remoteId, change.key!) : master.remoteId;
    const etag = instance ? ((await this.liveInstance(cal, targetId, ctx)).etag ?? null) : master.etag;
    const { status, json } = await this.call("DELETE", `${calPath}/${encodeURIComponent(targetId)}`, {
      ...(etag ? { headers: { "if-match": etag } } : {}),
    });
    if (status === 412) return this.refetchAndConflict(cal, targetId, ctx);
    if (status !== 204 && status !== 200 && status !== 404 && status !== 410) this.fail(status, json, "Deleting event");
    if (instance) {
      this.apply(
        cal.id,
        {
          id: targetId,
          status: "cancelled",
          recurringEventId: master.remoteId,
          originalStartTime: change.instanceStart.allDay
            ? { date: change.key! }
            : { dateTime: change.key! },
        },
        ctx,
      );
    } else {
      deleteSeries(ctx.db, cal.id, master.seriesId ?? master.remoteId);
    }
  }
}

/** Remove all rows stored under a remote id (an override or a series master with its overrides). */
function deleteSeriesByRemote(ctx: SyncContext, calendarId: string, remoteId: string): void {
  ctx.db.delete(events).where(and(eq(events.calendarId, calendarId), eq(events.remoteId, remoteId))).run();
}
