/**
 * Household-time-zone helpers.
 *
 * FullCalendar runs with `timeZone: "UTC"` and is fed *wall-clock* times of the household zone
 * as if they were UTC ("floating" strings like `2026-11-03T14:00:00`). That makes it render the
 * household's clock regardless of the device zone, without a named-timezone plugin. Everything
 * crossing the boundary (API instants <-> FullCalendar / form fields) goes through these helpers.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock components of an instant in `timeZone`, as a UTC epoch (ms). */
function wallEpoch(instant: Date, timeZone: string): number {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DDTHH:mm:ss` wall clock (no offset) of an instant in `timeZone`. */
export function instantToWall(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Date(wallEpoch(d, timeZone)).toISOString().slice(0, 19);
}

/** Wall-clock string (`YYYY-MM-DDTHH:mm[:ss]`) in `timeZone` to the real instant. */
export function wallToInstant(wall: string, timeZone: string): Date {
  const asUtc = Date.parse(`${wall.length === 16 ? `${wall}:00` : wall}Z`);
  // Two passes handle offsets that differ between the guess and the result (DST edges).
  let guess = asUtc - (wallEpoch(new Date(asUtc), timeZone) - asUtc);
  guess = asUtc - (wallEpoch(new Date(guess), timeZone) - guess);
  return new Date(guess);
}

/** Wall `Date` (UTC fields = household clock) as FullCalendar hands it out in `timeZone: "UTC"` mode. */
export const fcDateToWall = (d: Date): string => d.toISOString().slice(0, 19);

/** `YYYY-MM-DD` of an instant in `timeZone`. */
export const dateInZone = (instant: Date | string, timeZone: string): string => instantToWall(instant, timeZone).slice(0, 10);

/** Add whole days to a `YYYY-MM-DD` string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DDTHH:mm` (datetime-local value) from a wall string. */
export const toLocalInput = (wall: string): string => wall.slice(0, 16);

/** Add minutes to a `YYYY-MM-DDTHH:mm[:ss]` wall string. */
export function addMinutes(wall: string, minutes: number): string {
  const d = new Date(`${wall.length === 16 ? `${wall}:00` : wall}Z`);
  return new Date(d.getTime() + minutes * 60_000).toISOString().slice(0, 19);
}

/** Short zone label for the header ("GMT+1"). */
export function zoneLabel(now: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

export { pad };
