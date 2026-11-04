import { AppError } from "../lib/errors.js";
import { addDays, daysInMonth, isValidDate, msToDate, weekdayOf } from "../lib/localdate.js";
import type { Assignment, Recurrence, RecurrenceInput } from "../schemas/chores.js";

/** Safety cap on schedule iteration (≈ 55 years of daily occurrences). */
const MAX_STEPS = 20_000;

/**
 * Fill in `start` (default `today`), validate, and canonicalize. For "every N weeks" the
 * start is moved forward to the chosen weekday so week alignment is unambiguous.
 */
export function normalizeRecurrence(input: RecurrenceInput, today: string): Recurrence {
  switch (input.type) {
    case "once":
      if (!isValidDate(input.date)) throw new AppError("validation", `Invalid date: ${input.date}`);
      return { type: "once", date: input.date };
    case "daily":
      return { type: "daily", start: validStart(input.start, today) };
    case "weekdays":
      return {
        type: "weekdays",
        days: [...new Set(input.days)].sort((a, b) => a - b),
        start: validStart(input.start, today),
      };
    case "weekly": {
      let start = validStart(input.start, today);
      start = addDays(start, (input.weekday - weekdayOf(start) + 7) % 7);
      return { type: "weekly", every: input.every, weekday: input.weekday, start };
    }
    case "monthly":
      return { type: "monthly", day: input.day, start: validStart(input.start, today) };
  }
}

function validStart(start: string | undefined, today: string): string {
  const value = start ?? today;
  if (!isValidDate(value)) throw new AppError("validation", `Invalid start date: ${value}`);
  return value;
}

/** First date the schedule can produce. */
export function recurrenceStart(rec: Recurrence): string {
  return rec.type === "once" ? rec.date : rec.start;
}

/** Replace the anchor (used when a schedule edit re-anchors at today). */
export function withStart(rec: Recurrence, start: string): Recurrence {
  return rec.type === "once" ? { type: "once", date: start } : { ...rec, start };
}

/** Ascending infinite (or, for one-offs, single) stream of due dates. */
export function* iterateDates(rec: Recurrence): Generator<string> {
  switch (rec.type) {
    case "once":
      yield rec.date;
      return;
    case "daily":
      for (let i = 0; i < MAX_STEPS; i++) yield addDays(rec.start, i);
      return;
    case "weekdays": {
      const wanted = new Set(rec.days);
      for (let i = 0; i < MAX_STEPS; i++) {
        const d = addDays(rec.start, i);
        if (wanted.has(weekdayOf(d))) yield d;
      }
      return;
    }
    case "weekly":
      for (let i = 0; i < MAX_STEPS; i++) yield addDays(rec.start, i * rec.every * 7);
      return;
    case "monthly": {
      const [y0, m0] = rec.start.split("-").map(Number) as [number, number];
      for (let i = 0; i < MAX_STEPS; i++) {
        const idx = m0 - 1 + i;
        const year = y0 + Math.floor(idx / 12);
        const month = (idx % 12) + 1;
        const day = Math.min(rec.day, daysInMonth(year, month));
        const d = msToDate(Date.UTC(year, month - 1, day));
        if (d >= rec.start) yield d;
      }
    }
  }
}

export interface ScheduledDate {
  date: string;
  /** 0-based ordinal of this occurrence counted from the schedule anchor. */
  ordinal: number;
}

/** Occurrences with `from <= date <= to`, each with its ordinal from the anchor. */
export function datesInRange(rec: Recurrence, from: string, to: string): ScheduledDate[] {
  const out: ScheduledDate[] = [];
  let ordinal = 0;
  for (const date of iterateDates(rec)) {
    if (date > to) break;
    if (date >= from) out.push({ date, ordinal });
    ordinal++;
  }
  return out;
}

/** First scheduled date strictly after `date`, or null (one-offs, exhausted schedules). */
export function nextDateAfter(rec: Recurrence, date: string): string | null {
  for (const d of iterateDates(rec)) if (d > date) return d;
  return null;
}

/** Rotation: occurrence `n` goes to `members[n mod k]` (always non-negative). */
export function assigneeFor(assignment: Assignment, memberIds: readonly string[], indexN: number): string | null {
  if (assignment === "either" || memberIds.length === 0) return null;
  if (assignment === "fixed") return memberIds[0] ?? null;
  return memberIds[((indexN % memberIds.length) + memberIds.length) % memberIds.length] ?? null;
}
