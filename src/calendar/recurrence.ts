import ICAL from "ical.js";
import { exdateKeys, readTime, wallToIcalTime } from "./ics.js";
import { DAY_MS, dateToStoredUtc, isValidTimeZone, isoUtc, wallAsUtcMs, zonedToUtcMs } from "./time.js";

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";

const WEEKDAYS = "MO,TU,WE,TH,FR";

/** Map the UI repeat option to an RRULE value (`custom` is not constructible). */
export function repeatToRrule(repeat: Exclude<Repeat, "custom">): string | null {
  switch (repeat) {
    case "none":
      return null;
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=${WEEKDAYS}`;
    case "weekly":
      return "FREQ=WEEKLY";
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
  }
}

/** Classify an RRULE value; anything not produced by `repeatToRrule` is `custom`. */
export function rruleToRepeat(rrule: string | null): Repeat {
  if (!rrule) return "none";
  const parts = Object.fromEntries(
    rrule.split(";").map((p) => {
      const [k, ...v] = p.split("=");
      return [k!.toUpperCase(), v.join("=")];
    }),
  ) as Record<string, string>;
  const keys = Object.keys(parts).filter((k) => k !== "WKST");
  const interval = parts.INTERVAL === undefined || parts.INTERVAL === "1";
  if (!interval || parts.COUNT !== undefined || parts.UNTIL !== undefined) return "custom";
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  switch (parts.FREQ) {
    case "DAILY":
      return only(["FREQ", "INTERVAL"]) ? "daily" : "custom";
    case "WEEKLY":
      if (parts.BYDAY === WEEKDAYS && only(["FREQ", "INTERVAL", "BYDAY"])) return "weekdays";
      if (only(["FREQ", "INTERVAL"])) return "weekly";
      return "custom";
    case "MONTHLY":
      return only(["FREQ", "INTERVAL"]) ? "monthly" : "custom";
    case "YEARLY":
      return only(["FREQ", "INTERVAL"]) ? "yearly" : "custom";
    default:
      return "custom";
  }
}

export interface MasterTimes {
  startUtc: string;
  endUtc: string;
  startTz: string | null;
  allDay: boolean;
  rawIcs: string;
}

export interface Occurrence {
  /** Recurrence key: UTC ISO (timed) or `YYYY-MM-DD` (all-day); matches override `recurrenceId`. */
  key: string;
  /** Stored format: ISO UTC; all-day = midnight UTC of the date. */
  startUtc: string;
  endUtc: string;
}

export interface ExpandRange {
  /** Half-open ms range applied to timed occurrences. */
  timed: [number, number];
  /** Half-open ms range (midnight-UTC dates) applied to all-day occurrences. */
  allDay: [number, number];
}

const MAX_ITERATIONS = 100_000;

/** Occurrences of a recurring master overlapping `range`, honouring RRULE, UNTIL/COUNT and EXDATE. */
export function expandMaster(master: MasterTimes, range: ExpandRange, defaultTz: string): Occurrence[] {
  const vcal = new ICAL.Component(ICAL.parse(master.rawIcs));
  const ve = vcal.getAllSubcomponents("vevent").find((v) => !v.hasProperty("recurrence-id"));
  const ruleProp = ve?.getFirstPropertyValue("rrule") as ICAL.Recur | null | undefined;
  const dtstartProp = ve?.getFirstProperty("dtstart");
  if (!ve || !ruleProp || !dtstartProp) return [];

  const start = readTime(dtstartProp, vcal, defaultTz);
  const startMs = Date.parse(master.startUtc);
  const durationMs = Date.parse(master.endUtc) - startMs;
  const excluded = exdateKeys(ve, vcal, defaultTz);

  const rule = ICAL.Recur.fromString(ruleProp.toString());
  const until = rule.until;
  rule.until = null as unknown as ICAL.Time;
  let untilMs = Infinity;
  let untilDate: string | null = null;
  const tz = start.tz && isValidTimeZone(start.tz) ? start.tz : null;
  const fixedOffset = wallAsUtcMs(start.wall) - start.ms;
  const wallToMs = (wall: string) => (tz ? zonedToUtcMs(wall, tz) : wallAsUtcMs(wall) - fixedOffset);
  if (until) {
    if (until.isDate) untilDate = until.toString();
    else if (until.zone === ICAL.Timezone.utcTimezone) untilMs = until.toUnixTime() * 1000;
    else untilMs = wallToMs(until.toString());
  }

  const [lo, hi] = start.allDay ? range.allDay : range.timed;
  const out: Occurrence[] = [];
  const dtstart = wallToIcalTime(start.wall);
  const iter = rule.iterator(dtstart);

  const consider = (t: ICAL.Time): "stop" | "continue" => {
    const wall = t.toString();
    if (start.allDay) {
      const ms = wallAsUtcMs(wall);
      if (untilDate !== null && wall > untilDate) return "stop";
      if (ms >= hi) return "stop";
      const key = wall;
      const end = ms + Math.max(durationMs, DAY_MS);
      if (!excluded.has(key) && end > lo) {
        out.push({ key, startUtc: dateToStoredUtc(wall), endUtc: isoUtc(end) });
      }
      return "continue";
    }
    const ms = wallToMs(wall);
    if (ms > untilMs) return "stop";
    if (ms >= hi) return "stop";
    const key = isoUtc(ms);
    const end = ms + durationMs;
    if (!excluded.has(key) && (end > lo || (durationMs === 0 && ms >= lo))) {
      out.push({ key, startUtc: key, endUtc: isoUtc(end) });
    }
    return "continue";
  };

  // RFC 5545: DTSTART is always the first occurrence, even if it does not match the rule.
  if (consider(dtstart) === "stop") return out;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const t = iter.next();
    if (!t) break;
    if (t.compare(dtstart) === 0) continue;
    if (consider(t) === "stop") break;
  }
  return out;
}
