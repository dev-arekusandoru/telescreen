import type { Db } from "../db/client.js";
import type { WriteFields } from "./ics.js";

export interface RemoteCalendar {
  remoteId: string;
  name: string;
  color: string | null;
  writable: boolean;
}

/** Cached calendar row fields providers need. */
export interface CalendarRef {
  id: string;
  remoteId: string;
  syncToken: string | null;
  ctag: string | null;
}

/** Cached master/standalone event row fields providers need for writes. */
export interface EventRef {
  id: string;
  remoteId: string;
  etag: string | null;
  seriesId: string | null;
  startUtc: string;
  startTz: string | null;
  allDay: boolean;
  rrule: string | null;
  rawIcs: string | null;
}

export interface SyncContext {
  db: Db;
  /** Household time zone: used for floating times. */
  defaultTz: string;
  now(): Date;
}

/** Tokens to persist on the calendar after a sync (`undefined` = keep). */
export interface SyncOutcome {
  syncToken?: string | null;
  ctag?: string | null;
}

export interface Provider {
  listCalendars(): Promise<RemoteCalendar[]>;
  syncCalendar(cal: CalendarRef, ctx: SyncContext): Promise<SyncOutcome>;
  /** Create on the provider, update the cache, return the remote id of the new master. */
  createEvent(cal: CalendarRef, fields: WriteFields, ctx: SyncContext): Promise<{ remoteId: string }>;
  /**
   * Edit. `key` is the occurrence recurrence key (required for `scope: "this"` on recurring events).
   * Throws {@link ProviderConflictError} after refetching on a precondition failure.
   */
  updateEvent(
    cal: CalendarRef,
    master: EventRef,
    change: { scope: "this" | "all"; key: string | null; fields: WriteFields; rruleChanged: boolean },
    ctx: SyncContext,
  ): Promise<void>;
  deleteEvent(
    cal: CalendarRef,
    master: EventRef,
    change: { scope: "this" | "all"; key: string | null; instanceStart: { ms: number; allDay: boolean; tz: string | null } },
    ctx: SyncContext,
  ): Promise<void>;
}

/** Credentials rejected: the account needs to be reconnected. */
export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

/** Precondition (etag) failed; the cache has been refreshed from the provider. */
export class ProviderConflictError extends Error {
  constructor() {
    super("This event changed elsewhere");
    this.name = "ProviderConflictError";
  }
}

/** Any other provider failure (network, 5xx, unexpected response). */
export class ProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderError";
  }
}
