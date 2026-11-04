/** Time-zone helpers built on Intl (no tz database dependency). */

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(tz: string): Intl.DateTimeFormat | null {
  let f = formatters.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      f = null;
    }
    formatters.set(tz, f);
  }
  return f;
}

/** True when `tz` is an IANA zone this runtime knows. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  return !!tz && formatterFor(tz) !== null;
}

/** Wall-clock parts of an instant in `tz`. */
function partsIn(ms: number, tz: string) {
  const f = formatterFor(tz);
  if (!f) throw new Error(`Unknown time zone ${tz}`);
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Offset (wall - UTC) in ms of `tz` at instant `ms`. */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = partsIn(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** `YYYY-MM-DDTHH:mm:ss` wall time of an instant in `tz`. */
export function utcToWall(ms: number, tz: string): string {
  const p = partsIn(ms, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** `YYYY-MM-DD` of an instant in `tz`. */
export function dateIn(ms: number, tz: string): string {
  return utcToWall(ms, tz).slice(0, 10);
}

/** Wall string → ms as if the wall time were UTC. */
export function wallAsUtcMs(wall: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(wall);
  if (!m) throw new Error(`Bad wall time ${wall}`);
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

/**
 * Wall-clock time in `tz` → UTC ms. DST gap times move forward; ambiguous
 * (repeated) times resolve to the first occurrence.
 */
export function zonedToUtcMs(wall: string, tz: string): number {
  const guess = wallAsUtcMs(wall);
  const off1 = tzOffsetMs(guess, tz);
  let candidate = guess - off1;
  const off2 = tzOffsetMs(candidate, tz);
  if (off2 !== off1) {
    candidate = guess - off2;
    // Gap: the shifted candidate may land on the other side; keep it consistent.
    const off3 = tzOffsetMs(candidate, tz);
    if (off3 !== off2) candidate = guess - Math.max(off2, off3);
  }
  return candidate;
}

export const DAY_MS = 86_400_000;

/** `2026-11-03` → `2026-11-03T00:00:00.000Z` (how all-day dates are stored). */
export function dateToStoredUtc(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function storedUtcToDate(iso: string): string {
  return iso.slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(wallAsUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export const isoUtc = (ms: number) => new Date(ms).toISOString();
