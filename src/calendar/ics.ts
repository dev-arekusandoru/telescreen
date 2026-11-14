import ICAL from "ical.js";
import { tzlib_get_ical_block } from "timezones-ical-library";
import {
  DAY_MS,
  dateToStoredUtc,
  isValidTimeZone,
  isoUtc,
  utcToWall,
  wallAsUtcMs,
  zonedToUtcMs,
} from "./time.js";

/** A cached event row without ids (what sync produces). */
export interface NormEvent {
  remoteId: string;
  etag: string | null;
  seriesId: string;
  /** UTC ISO of the original start (timed) or `YYYY-MM-DD` (all-day); NULL for masters. */
  recurrenceId: string | null;
  startUtc: string;
  endUtc: string;
  startTz: string | null;
  allDay: boolean;
  summary: string;
  location: string | null;
  notes: string | null;
  /** RRULE value (without `RRULE:`), masters only. */
  rrule: string | null;
  /** Full VCALENDAR text of recurring masters (CalDAV: the whole resource). */
  rawIcs: string | null;
  /** Cancelled override (an EXDATE-like hole in a series). */
  deleted: boolean;
}

/** Floating ICAL.Time from `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`. */
export function wallToIcalTime(wall: string): ICAL.Time {
  return wall.includes("T") ? ICAL.Time.fromDateTimeString(wall) : ICAL.Time.fromDateString(wall);
}

export interface ResolvedTime {
  allDay: boolean;
  /** UTC ms (all-day: midnight UTC of the date). */
  ms: number;
  /** Resolved IANA zone (`UTC` for Z times) or null when only a fixed offset is known. */
  tz: string | null;
  /** Wall-clock `YYYY-MM-DD[THH:mm:ss]` as written in the source. */
  wall: string;
}

type JProp = { jCal: [string, Record<string, string>, string, ...string[]] };

function vtimezoneZone(vcal: ICAL.Component, tzid: string): ICAL.Timezone | null {
  for (const vt of vcal.getAllSubcomponents("vtimezone")) {
    if (vt.getFirstPropertyValue("tzid") === tzid) return new ICAL.Timezone(vt);
  }
  return null;
}

/** Resolve a DTSTART/DTEND/RECURRENCE-ID/EXDATE value (first value only) to UTC. */
export function readTime(prop: ICAL.Property, vcal: ICAL.Component, defaultTz: string, index = 0): ResolvedTime {
  const jcal = (prop as unknown as JProp).jCal;
  const type = jcal[2];
  const raw = String(jcal[3 + index]);
  const tzid = jcal[1].tzid;
  if (type === "date") {
    return { allDay: true, ms: wallAsUtcMs(raw), tz: null, wall: raw };
  }
  if (raw.endsWith("Z")) {
    const wall = raw.slice(0, -1);
    return { allDay: false, ms: wallAsUtcMs(wall), tz: "UTC", wall };
  }
  if (!tzid) {
    return { allDay: false, ms: zonedToUtcMs(raw, defaultTz), tz: defaultTz, wall: raw };
  }
  if (isValidTimeZone(tzid)) {
    return { allDay: false, ms: zonedToUtcMs(raw, tzid), tz: tzid, wall: raw };
  }
  const zone = vtimezoneZone(vcal, tzid);
  if (zone) {
    const t = wallToIcalTime(raw);
    const withZone = new ICAL.Time({ year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second }, zone);
    return { allDay: false, ms: withZone.toUnixTime() * 1000, tz: null, wall: raw };
  }
  return { allDay: false, ms: wallAsUtcMs(raw), tz: "UTC", wall: raw };
}

/** All EXDATE values of a VEVENT as occurrence keys (UTC ISO for timed, date for all-day). */
export function exdateKeys(vevent: ICAL.Component, vcal: ICAL.Component, defaultTz: string): Set<string> {
  const keys = new Set<string>();
  for (const prop of vevent.getAllProperties("exdate")) {
    const count = (prop as unknown as JProp).jCal.length - 3;
    for (let i = 0; i < count; i++) {
      const t = readTime(prop, vcal, defaultTz, i);
      keys.add(t.allDay ? t.wall : isoUtc(t.ms));
    }
  }
  return keys;
}

export const recurrenceKey = (t: { allDay: boolean; ms: number }) =>
  t.allDay ? new Date(t.ms).toISOString().slice(0, 10) : isoUtc(t.ms);

function text(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Parse one CalDAV resource (VCALENDAR with one UID: master + overrides) into cache rows.
 * Returns [] for resources without VEVENTs (e.g. VTODO-only).
 */
export function parseResource(
  ics: string,
  opts: { remoteId: string; etag: string | null; defaultTz: string },
): NormEvent[] {
  const vcal = new ICAL.Component(ICAL.parse(ics));
  const vevents = vcal.getAllSubcomponents("vevent");
  if (vevents.length === 0) return [];
  const uid = String(vevents[0]!.getFirstPropertyValue("uid") ?? opts.remoteId);
  const rows: NormEvent[] = [];
  for (const ve of vevents) {
    const dtstart = ve.getFirstProperty("dtstart");
    if (!dtstart) continue;
    const start = readTime(dtstart, vcal, opts.defaultTz);
    const dtend = ve.getFirstProperty("dtend");
    let endMs: number;
    if (dtend) {
      endMs = readTime(dtend, vcal, opts.defaultTz).ms;
    } else if (ve.hasProperty("duration")) {
      const d = ve.getFirstPropertyValue("duration") as ICAL.Duration;
      endMs = start.ms + d.toSeconds() * 1000;
    } else {
      endMs = start.ms + (start.allDay ? DAY_MS : 0);
    }
    if (endMs < start.ms) endMs = start.ms;
    const recId = ve.getFirstProperty("recurrence-id");
    const recurrenceId = recId ? recurrenceKey(readTime(recId, vcal, opts.defaultTz)) : null;
    const rule = recurrenceId === null ? ve.getFirstPropertyValue("rrule") : null;
    const status = String(ve.getFirstPropertyValue("status") ?? "").toUpperCase();
    rows.push({
      remoteId: opts.remoteId,
      etag: opts.etag,
      seriesId: uid,
      recurrenceId,
      startUtc: start.allDay ? dateToStoredUtc(start.wall) : isoUtc(start.ms),
      endUtc: start.allDay ? dateToStoredUtc(isoUtc(endMs).slice(0, 10)) : isoUtc(endMs),
      startTz: start.tz,
      allDay: start.allDay,
      summary: text(ve.getFirstPropertyValue("summary")) ?? "",
      location: text(ve.getFirstPropertyValue("location")),
      notes: text(ve.getFirstPropertyValue("description")),
      rrule: rule ? rule.toString() : null,
      rawIcs: rule ? ics : null,
      deleted: status === "CANCELLED" && recurrenceId !== null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Building / editing ICS for writes
// ---------------------------------------------------------------------------

export interface TimeSpec {
  allDay: boolean;
  /** Instant (timed) or midnight-UTC of the date (all-day). */
  ms: number;
  /** Zone to write the wall time in; null = UTC (`Z`). */
  tz: string | null;
}

export interface WriteFields {
  summary: string;
  location: string | null;
  notes: string | null;
  start: TimeSpec;
  end: TimeSpec;
  /** RRULE value, or null/undefined for none. Only used when creating or editing a master. */
  rrule?: string | null;
}

function timeProp(name: string, spec: TimeSpec): ICAL.Property {
  const prop = new ICAL.Property(name);
  if (spec.allDay) {
    prop.setValue(wallToIcalTime(isoUtc(spec.ms).slice(0, 10)));
  } else if (spec.tz && isValidTimeZone(spec.tz) && spec.tz !== "UTC") {
    prop.setValue(wallToIcalTime(utcToWall(spec.ms, spec.tz)));
    prop.setParameter("tzid", spec.tz);
  } else {
    const t = wallToIcalTime(isoUtc(spec.ms).slice(0, 19));
    t.zone = ICAL.Timezone.utcTimezone;
    prop.setValue(t);
  }
  return prop;
}

function setText(ve: ICAL.Component, name: string, value: string | null): void {
  ve.removeAllProperties(name);
  if (value !== null && value !== "") ve.addPropertyWithValue(name, value);
}

function stamp(ve: ICAL.Component, now: Date): void {
  const t = wallToIcalTime(now.toISOString().slice(0, 19));
  t.zone = ICAL.Timezone.utcTimezone;
  ve.removeAllProperties("dtstamp");
  ve.addPropertyWithValue("dtstamp", t);
  ve.removeAllProperties("last-modified");
  ve.addPropertyWithValue("last-modified", t);
  const seq = Number(ve.getFirstPropertyValue("sequence") ?? 0);
  ve.removeAllProperties("sequence");
  ve.addPropertyWithValue("sequence", seq + 1);
}

function applyFields(ve: ICAL.Component, f: WriteFields, now: Date): void {
  setText(ve, "summary", f.summary);
  setText(ve, "location", f.location);
  setText(ve, "description", f.notes);
  ve.removeAllProperties("dtstart");
  ve.removeAllProperties("dtend");
  ve.removeAllProperties("duration");
  ve.addProperty(timeProp("dtstart", f.start));
  ve.addProperty(timeProp("dtend", f.end));
  stamp(ve, now);
}

/**
 * Serialise a VCALENDAR, adding a VTIMEZONE (RFC 5545 §3.6.5) for every TZID used by a
 * property that the calendar doesn't already define. Blocks go before the first VEVENT.
 */
export function serializeWithTimezones(vcal: ICAL.Component): string {
  const defined = new Set(vcal.getAllSubcomponents("vtimezone").map((vt) => String(vt.getFirstPropertyValue("tzid"))));
  const missing: string[] = [];
  for (const ve of vcal.getAllSubcomponents("vevent")) {
    for (const prop of ve.getAllProperties()) {
      const tzid = prop.getParameter("tzid");
      if (typeof tzid === "string" && !defined.has(tzid)) {
        defined.add(tzid);
        const block = tzlib_get_ical_block(tzid);
        if (block && block[0]) missing.push(block[0]);
      }
    }
  }
  const out = vcal.toString();
  if (missing.length === 0) return out;
  const at = out.indexOf("BEGIN:VEVENT");
  return `${out.slice(0, at)}${missing.join("\r\n")}\r\n${out.slice(at)}`;
}

function wrap(ve: ICAL.Component): ICAL.Component {
  const vcal = new ICAL.Component("vcalendar");
  vcal.addPropertyWithValue("version", "2.0");
  vcal.addPropertyWithValue("prodid", "-//Telescreen//EN");
  vcal.addSubcomponent(ve);
  return vcal;
}

export function buildNewIcs(uid: string, f: WriteFields, now: Date): string {
  const ve = new ICAL.Component("vevent");
  ve.addPropertyWithValue("uid", uid);
  applyFields(ve, f, now);
  if (f.rrule) ve.addPropertyWithValue("rrule", ICAL.Recur.fromString(f.rrule));
  return serializeWithTimezones(wrap(ve));
}

function masterOf(vcal: ICAL.Component): ICAL.Component {
  const master = vcal.getAllSubcomponents("vevent").find((v) => !v.hasProperty("recurrence-id"));
  if (!master) throw new Error("Resource has no master VEVENT");
  return master;
}

function overrideFor(vcal: ICAL.Component, key: string, defaultTz: string): ICAL.Component | undefined {
  return vcal.getAllSubcomponents("vevent").find((v) => {
    const rid = v.getFirstProperty("recurrence-id");
    return rid && recurrenceKey(readTime(rid, vcal, defaultTz)) === key;
  });
}

/** Edit every occurrence: patch the master VEVENT in place, preserving overrides and EXDATEs. */
export function editMasterIcs(rawIcs: string, f: WriteFields, now: Date, opts: { rruleChanged: boolean }): string {
  const vcal = new ICAL.Component(ICAL.parse(rawIcs));
  const ve = masterOf(vcal);
  applyFields(ve, f, now);
  if (opts.rruleChanged) {
    ve.removeAllProperties("rrule");
    if (f.rrule) ve.addPropertyWithValue("rrule", ICAL.Recur.fromString(f.rrule));
    else {
      ve.removeAllProperties("exdate");
      for (const o of vcal.getAllSubcomponents("vevent")) if (o !== ve) vcal.removeSubcomponent(o);
    }
  }
  return serializeWithTimezones(vcal);
}

/** Edit one occurrence: create/replace the override VEVENT with RECURRENCE-ID = `key`. */
export function editInstanceIcs(
  rawIcs: string,
  key: string,
  recurrenceIdSpec: TimeSpec,
  f: WriteFields,
  now: Date,
  defaultTz: string,
): string {
  const vcal = new ICAL.Component(ICAL.parse(rawIcs));
  const master = masterOf(vcal);
  let ve = overrideFor(vcal, key, defaultTz);
  if (!ve) {
    ve = new ICAL.Component("vevent");
    ve.addPropertyWithValue("uid", String(master.getFirstPropertyValue("uid")));
    ve.addProperty(timeProp("recurrence-id", recurrenceIdSpec));
    vcal.addSubcomponent(ve);
  }
  applyFields(ve, f, now);
  return serializeWithTimezones(vcal);
}

/** Delete one occurrence: drop its override and add an EXDATE to the master. */
export function excludeInstanceIcs(rawIcs: string, key: string, spec: TimeSpec, now: Date, defaultTz: string): string {
  const vcal = new ICAL.Component(ICAL.parse(rawIcs));
  const master = masterOf(vcal);
  const existing = overrideFor(vcal, key, defaultTz);
  if (existing) vcal.removeSubcomponent(existing);
  master.addProperty(timeProp("exdate", spec));
  stamp(master, now);
  return serializeWithTimezones(vcal);
}
