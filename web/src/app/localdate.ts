/** `YYYY-MM-DD` calendar-date helpers (pure UTC arithmetic; no device time zone involved). */

const DAY_MS = 86_400_000;

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** The date in `timeZone` for an instant (defaults to the device zone until the household loads). */
export function localDate(now: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(toMs(date)).getUTCDay();
}

/** First day of the week containing `date`, for a week starting on `weekStart` (0 = Sunday). */
export function startOfWeek(date: string, weekStart: number): string {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

/** Format a date-only value, e.g. `{ weekday: "short", day: "numeric" }`. */
export function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(toMs(date)));
}
