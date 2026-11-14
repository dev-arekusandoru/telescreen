import { and, eq, inArray, isNull, lt, gte, or, isNotNull } from "drizzle-orm";
import { expandMaster, repeatToRrule, rruleToRepeat, type ExpandRange, type Occurrence, type Repeat } from "../calendar/recurrence.js";
import type { TimeSpec, WriteFields } from "../calendar/ics.js";
import { ProviderConflictError, type CalendarRef, type EventRef, type Provider, type SyncContext } from "../calendar/provider.js";
import {
  DAY_MS,
  addDays,
  dateIn,
  isValidTimeZone,
  isoUtc,
  storedUtcToDate,
  utcToWall,
  wallAsUtcMs,
  zonedToUtcMs,
} from "../calendar/time.js";
import type { Ctx } from "../context.js";
import { calendars, events } from "../db/schema.js";
import { AppError } from "../lib/errors.js";
import type { CreateEventInput, UpdateEventInput } from "../schemas/calendar.js";
import { getAccountRow, providerFor, toAppError } from "./accounts.js";
import { getCalendarRow } from "./calendars.js";
import { householdTimezone, syncContext } from "./sync.js";

type EventRow = typeof events.$inferSelect;
type CalendarRow = typeof calendars.$inferSelect;

export interface EventInstance {
  id: string;
  eventId: string;
  calendarId: string;
  memberId: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string | null;
  location: string | null;
  notes: string | null;
  recurring: boolean;
  repeat: Repeat;
  writable: boolean;
}

const KEY_SEP = "~";

/** Providers can be swapped in tests via `setProviderFactory`; production uses the account's secret. */
let providerFactory: (accountId: string, ctx: Ctx) => Provider = (accountId, ctx) => providerFor(getAccountRow(ctx.db, accountId));
export function setProviderFactory(factory: typeof providerFactory | null): void {
  providerFactory = factory ?? ((accountId, ctx) => providerFor(getAccountRow(ctx.db, accountId)));
}

function parseDate(value: string, field: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new AppError("validation", `${field} is not a valid date`);
  return ms;
}

// -- reading ------------------------------------------------------------------

function toInstance(
  row: EventRow,
  master: EventRow,
  cal: CalendarRow,
  parts: { id: string; startUtc?: string; endUtc?: string },
): EventInstance {
  const startUtc = parts.startUtc ?? row.startUtc;
  const endUtc = parts.endUtc ?? row.endUtc;
  return {
    id: parts.id,
    eventId: master.id,
    calendarId: cal.id,
    memberId: cal.memberId,
    title: row.summary,
    start: row.allDay ? storedUtcToDate(startUtc) : startUtc,
    end: row.allDay ? storedUtcToDate(endUtc) : endUtc,
    allDay: row.allDay,
    timeZone: row.startTz,
    location: row.location,
    notes: row.notes,
    recurring: master.rrule !== null,
    repeat: rruleToRepeat(master.rrule),
    writable: cal.writable,
  };
}

function expandRange(startMs: number, endMs: number, tz: string): ExpandRange {
  const lo = wallAsUtcMs(dateIn(startMs, tz));
  const hi = wallAsUtcMs(dateIn(Math.max(startMs, endMs - 1), tz)) + DAY_MS;
  return { timed: [startMs, endMs], allDay: [lo, hi] };
}

function safeExpand(master: EventRow, range: ExpandRange, tz: string): Occurrence[] {
  if (!master.rawIcs) return [];
  try {
    return expandMaster(
      { startUtc: master.startUtc, endUtc: master.endUtc, startTz: master.startTz, allDay: master.allDay, rawIcs: master.rawIcs },
      range,
      tz,
    );
  } catch (e) {
    console.warn(`[telescreen] could not expand recurring event ${master.id}:`, e);
    return [];
  }
}

function overlaps(row: { allDay: boolean; startUtc: string; endUtc: string }, range: ExpandRange, startUtc = row.startUtc, endUtc = row.endUtc): boolean {
  const [lo, hi] = row.allDay ? range.allDay : range.timed;
  const s = Date.parse(startUtc);
  const e = Date.parse(endUtc);
  return s < hi && (e > lo || (e === s && s >= lo));
}

/** Expanded instances in `[start, end)` for the selected members (`family` = unassigned calendars). */
export function listEvents(ctx: Ctx, query: { start: string; end: string; members?: string | undefined }): EventInstance[] {
  const startMs = parseDate(query.start, "start");
  const endMs = parseDate(query.end, "end");
  if (endMs <= startMs) throw new AppError("validation", "end must be after start");
  const tz = householdTimezone(ctx.db, ctx.householdId);
  const range = expandRange(startMs, endMs, tz);

  let cals = ctx.db.select().from(calendars).where(eq(calendars.enabled, true)).all();
  if (query.members !== undefined && query.members.trim() !== "") {
    const wanted = new Set(query.members.split(",").map((m) => m.trim()).filter(Boolean));
    cals = cals.filter((c) => (c.memberId === null ? wanted.has("family") : wanted.has(c.memberId)));
  }
  if (cals.length === 0) return [];
  const calById = new Map(cals.map((c) => [c.id, c]));
  const calIds = [...calById.keys()];

  const loBound = isoUtc(Math.min(range.timed[0], range.allDay[0]) - DAY_MS);
  const hiBound = isoUtc(Math.max(range.timed[1], range.allDay[1]));
  const candidates = ctx.db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.calendarId, calIds),
        isNull(events.recurrenceId),
        lt(events.startUtc, hiBound),
        or(isNotNull(events.rrule), gte(events.endUtc, loBound)),
      ),
    )
    .all();

  const recurringSeries = candidates.filter((c) => c.rrule !== null && c.seriesId !== null);
  const overrides = new Map<string, EventRow[]>();
  if (recurringSeries.length > 0) {
    const seriesIds = [...new Set(recurringSeries.map((m) => m.seriesId!))];
    for (let i = 0; i < seriesIds.length; i += 400) {
      const rows = ctx.db
        .select()
        .from(events)
        .where(and(inArray(events.calendarId, calIds), isNotNull(events.recurrenceId), inArray(events.seriesId, seriesIds.slice(i, i + 400))))
        .all();
      for (const r of rows) {
        const k = `${r.calendarId}|${r.seriesId}`;
        const list = overrides.get(k);
        if (list) list.push(r);
        else overrides.set(k, [r]);
      }
    }
  }

  const out: EventInstance[] = [];
  for (const row of candidates) {
    const cal = calById.get(row.calendarId)!;
    if (row.rrule === null) {
      if (overlaps(row, range)) out.push(toInstance(row, row, cal, { id: row.id }));
      continue;
    }
    const ovs = overrides.get(`${row.calendarId}|${row.seriesId}`) ?? [];
    const overridden = new Set(ovs.map((o) => o.recurrenceId));
    for (const occ of safeExpand(row, range, tz)) {
      if (overridden.has(occ.key)) continue;
      out.push(toInstance(row, row, cal, { id: `${row.id}${KEY_SEP}${occ.key}`, startUtc: occ.startUtc, endUtc: occ.endUtc }));
    }
    for (const o of ovs) {
      if (o.deleted || !overlaps(o, range)) continue;
      out.push(toInstance(o, row, cal, { id: `${row.id}${KEY_SEP}${o.recurrenceId}` }));
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return out;
}

// -- resolving ids ------------------------------------------------------------

interface Resolved {
  master: EventRow;
  cal: CalendarRow;
  key: string | null;
}

function resolve(ctx: Ctx, instanceId: string): Resolved {
  const [rowId, key] = instanceId.split(KEY_SEP, 2);
  const master = ctx.db.select().from(events).where(eq(events.id, rowId!)).get();
  if (!master || master.recurrenceId !== null) throw new AppError("not_found", "Event not found");
  return { master, cal: getCalendarRow(ctx.db, master.calendarId), key: key ?? null };
}

function assertWritable(cal: CalendarRow): void {
  if (!cal.writable) throw new AppError("forbidden", "This calendar is read-only");
}

function refs(cal: CalendarRow, master?: EventRow): { cal: CalendarRef; master?: EventRef } {
  return {
    cal: { id: cal.id, remoteId: cal.remoteId, syncToken: cal.syncToken, ctag: cal.ctag },
    ...(master
      ? {
          master: {
            id: master.id,
            remoteId: master.remoteId,
            etag: master.etag,
            seriesId: master.seriesId,
            startUtc: master.startUtc,
            startTz: master.startTz,
            allDay: master.allDay,
            rrule: master.rrule,
            rawIcs: master.rawIcs,
          },
        }
      : {}),
  };
}

/** Run a provider write, mapping provider errors to API errors. */
async function withProvider<T>(ctx: Ctx, cal: CalendarRow, fn: (p: Provider, sctx: SyncContext) => Promise<T>): Promise<T> {
  const provider = providerFactory(cal.accountId, ctx);
  try {
    return await fn(provider, syncContext(ctx));
  } catch (e) {
    if (e instanceof ProviderConflictError) throw new AppError("conflict", "This event changed elsewhere");
    throw toAppError(e);
  }
}

/** Current instance of a series/event (used for write responses). `key` null = the first occurrence. */
function instanceFor(ctx: Ctx, calendarId: string, remoteId: string, key: string | null): EventInstance | null {
  const master = ctx.db
    .select()
    .from(events)
    .where(and(eq(events.calendarId, calendarId), eq(events.remoteId, remoteId), isNull(events.recurrenceId)))
    .get();
  if (!master) return null;
  const cal = getCalendarRow(ctx.db, calendarId);
  if (master.rrule === null) return toInstance(master, master, cal, { id: master.id });
  const tz = householdTimezone(ctx.db, ctx.householdId);
  const wantKey = key ?? (master.allDay ? storedUtcToDate(master.startUtc) : master.startUtc);
  const override = ctx.db
    .select()
    .from(events)
    .where(and(eq(events.calendarId, calendarId), eq(events.seriesId, master.seriesId ?? ""), eq(events.recurrenceId, wantKey)))
    .get();
  if (override && !override.deleted) return toInstance(override, master, cal, { id: `${master.id}${KEY_SEP}${wantKey}` });
  const ms = master.allDay ? wallAsUtcMs(wantKey) : Date.parse(wantKey);
  const range: ExpandRange = { timed: [ms, ms + 1], allDay: [ms, ms + DAY_MS] };
  const occ = safeExpand(master, range, tz).find((o) => o.key === wantKey);
  return toInstance(master, master, cal, {
    id: `${master.id}${KEY_SEP}${wantKey}`,
    ...(occ ? { startUtc: occ.startUtc, endUtc: occ.endUtc } : {}),
  });
}

// -- writing ------------------------------------------------------------------

interface TimeInput {
  allDay: boolean;
  start: string;
  end: string;
}

/** Parse request times into specs. All-day: dates, exclusive end (≥ start + 1 day). */
function timeSpecs(input: TimeInput, tz: string | null): { start: TimeSpec; end: TimeSpec } {
  if (input.allDay) {
    const s = /^\d{4}-\d{2}-\d{2}/.test(input.start) ? input.start.slice(0, 10) : null;
    const e = /^\d{4}-\d{2}-\d{2}/.test(input.end) ? input.end.slice(0, 10) : null;
    if (!s || !e) throw new AppError("validation", "All-day events need YYYY-MM-DD dates");
    const endDate = e > s ? e : addDays(s, 1);
    return {
      start: { allDay: true, ms: wallAsUtcMs(s), tz: null },
      end: { allDay: true, ms: wallAsUtcMs(endDate), tz: null },
    };
  }
  const s = parseDate(input.start, "start");
  const e = parseDate(input.end, "end");
  if (e < s) throw new AppError("validation", "End must not be before start");
  return { start: { allDay: false, ms: s, tz }, end: { allDay: false, ms: e, tz } };
}

function writeTz(master: EventRow | null, recurring: boolean, householdTz: string): string | null {
  const existing = master?.startTz;
  if (isValidTimeZone(existing) && existing !== "UTC") return existing;
  return recurring ? householdTz : null;
}

export async function createEvent(ctx: Ctx, input: CreateEventInput): Promise<EventInstance> {
  const cal = getCalendarRow(ctx.db, input.calendarId);
  assertWritable(cal);
  if (input.repeat === "custom") throw new AppError("validation", "Custom repeat rules cannot be created here");
  const rrule = repeatToRrule(input.repeat);
  const tz = householdTimezone(ctx.db, ctx.householdId);
  const { start, end } = timeSpecs(input, rrule ? tz : null);
  const fields: WriteFields = {
    summary: input.title,
    location: input.location ?? null,
    notes: input.notes ?? null,
    start,
    end,
    rrule,
  };
  const { cal: calRef } = refs(cal);
  const created = await withProvider(ctx, cal, (p, sctx) => p.createEvent(calRef, fields, sctx));
  const instance = instanceFor(ctx, cal.id, created.remoteId, null);
  if (!instance) throw new AppError("provider_error", "The event was created but could not be read back");
  return instance;
}

/** Shift a master's start by the wall-clock delta the user applied to one occurrence. */
function shiftMaster(master: EventRow, tz: string, instStartMs: number, newStartMs: number, newEndMs: number, allDay: boolean): { start: TimeSpec; end: TimeSpec } {
  const masterStartMs = Date.parse(master.startUtc);
  const duration = newEndMs - newStartMs;
  if (allDay) {
    const delta = newStartMs - instStartMs;
    return {
      start: { allDay: true, ms: masterStartMs + delta, tz: null },
      end: { allDay: true, ms: masterStartMs + delta + duration, tz: null },
    };
  }
  const mtz = isValidTimeZone(master.startTz) ? master.startTz : tz;
  const wallDelta = wallAsUtcMs(utcToWall(newStartMs, mtz)) - wallAsUtcMs(utcToWall(instStartMs, mtz));
  const newWall = wallAsUtcMs(utcToWall(masterStartMs, mtz)) + wallDelta;
  const newMasterStart = zonedToUtcMs(new Date(newWall).toISOString().slice(0, 19), mtz);
  const tzOut = writeTz(master, true, tz);
  return {
    start: { allDay: false, ms: newMasterStart, tz: tzOut },
    end: { allDay: false, ms: newMasterStart + duration, tz: tzOut },
  };
}

export async function updateEvent(ctx: Ctx, instanceId: string, scope: "this" | "all", patch: UpdateEventInput): Promise<EventInstance> {
  const { master, cal, key } = resolve(ctx, instanceId);
  assertWritable(cal);
  const recurring = master.rrule !== null;
  const effectiveScope = recurring ? scope : "all";
  if (effectiveScope === "this" && key === null) throw new AppError("validation", "Instance id required to edit one occurrence");
  const tz = householdTimezone(ctx.db, ctx.householdId);

  // Base values: the occurrence the user is looking at.
  const current = key !== null && recurring ? instanceFor(ctx, cal.id, master.remoteId, key) : null;
  const base = current ?? toInstance(master, master, cal, { id: master.id });
  const allDay = patch.allDay ?? base.allDay;
  const timesGiven = patch.start !== undefined || patch.end !== undefined || patch.allDay !== undefined;
  if (patch.allDay !== undefined && patch.allDay !== base.allDay && (patch.start === undefined || patch.end === undefined)) {
    throw new AppError("validation", "start and end are required when changing all-day");
  }
  const startStr = patch.start ?? base.start;
  const endStr = patch.end ?? base.end;

  const repeat: Repeat | undefined = effectiveScope === "all" ? patch.repeat : undefined;
  const rruleChanged = repeat !== undefined && repeat !== "custom" && repeat !== rruleToRepeat(master.rrule);
  const rrule = rruleChanged ? repeatToRrule(repeat as Exclude<Repeat, "custom">) : master.rrule;
  const willRecur = rrule !== null;

  let start: TimeSpec;
  let end: TimeSpec;
  if (!timesGiven) {
    // Keep stored times (no change requested).
    const s = master.allDay ? wallAsUtcMs(storedUtcToDate(master.startUtc)) : Date.parse(master.startUtc);
    const e = master.allDay ? wallAsUtcMs(storedUtcToDate(master.endUtc)) : Date.parse(master.endUtc);
    const useTz = master.allDay ? null : writeTz(master, willRecur, tz);
    start = { allDay: master.allDay, ms: s, tz: useTz };
    end = { allDay: master.allDay, ms: e, tz: useTz };
    if (effectiveScope === "this" && current) {
      const cs = timeSpecs({ allDay: current.allDay, start: current.start, end: current.end }, current.allDay ? null : writeTz(master, willRecur, tz));
      start = cs.start;
      end = cs.end;
    }
  } else {
    const specs = timeSpecs({ allDay, start: startStr, end: endStr }, allDay ? null : writeTz(master, willRecur, tz));
    if (effectiveScope === "all" && recurring && key !== null) {
      const instStart = base.allDay ? wallAsUtcMs(base.start) : Date.parse(base.start);
      ({ start, end } = shiftMaster(master, tz, instStart, specs.start.ms, specs.end.ms, allDay));
    } else {
      ({ start, end } = specs);
    }
  }

  const fields: WriteFields = {
    summary: patch.title ?? base.title,
    location: patch.location !== undefined ? patch.location : base.location,
    notes: patch.notes !== undefined ? patch.notes : base.notes,
    start,
    end,
    rrule,
  };
  const { cal: calRef, master: masterRef } = refs(cal, master);
  await withProvider(ctx, cal, (p, sctx) =>
    p.updateEvent(calRef, masterRef!, { scope: effectiveScope, key, fields, rruleChanged }, sctx),
  );
  const resultKey = effectiveScope === "this" ? key : null;
  const instance = instanceFor(ctx, cal.id, master.remoteId, resultKey);
  if (!instance) throw new AppError("provider_error", "The event was saved but could not be read back");
  return instance;
}

export async function deleteEvent(ctx: Ctx, instanceId: string, scope: "this" | "all"): Promise<void> {
  const { master, cal, key } = resolve(ctx, instanceId);
  assertWritable(cal);
  const recurring = master.rrule !== null;
  const effectiveScope = recurring ? scope : "all";
  if (effectiveScope === "this" && key === null) throw new AppError("validation", "Instance id required to delete one occurrence");
  const { cal: calRef, master: masterRef } = refs(cal, master);
  const ms = key === null ? Date.parse(master.startUtc) : master.allDay ? wallAsUtcMs(key) : Date.parse(key);
  await withProvider(ctx, cal, (p, sctx) =>
    p.deleteEvent(
      calRef,
      masterRef!,
      { scope: effectiveScope, key, instanceStart: { ms, allDay: master.allDay, tz: master.startTz } },
      sctx,
    ),
  );
}
