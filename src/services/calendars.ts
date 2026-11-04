import { eq } from "drizzle-orm";
import type { Ctx } from "../context.js";
import type { Db } from "../db/client.js";
import { accounts, calendars, members } from "../db/schema.js";
import { AppError } from "../lib/errors.js";
import type { UpdateCalendarInput } from "../schemas/calendar.js";

export interface CalendarView {
  id: string;
  accountId: string;
  name: string;
  color: string | null;
  writable: boolean;
  enabled: boolean;
  memberId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

type CalendarRow = typeof calendars.$inferSelect;

function toView(row: CalendarRow): CalendarView {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    color: row.color,
    writable: row.writable,
    enabled: row.enabled,
    memberId: row.memberId,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
  };
}

export function listCalendars(db: Db): CalendarView[] {
  return db
    .select({ cal: calendars })
    .from(calendars)
    .innerJoin(accounts, eq(accounts.id, calendars.accountId))
    .all()
    .map((r) => toView(r.cal))
    .sort((a, b) => a.accountId.localeCompare(b.accountId) || a.name.localeCompare(b.name));
}

export function getCalendarRow(db: Db, id: string): CalendarRow {
  const row = db.select().from(calendars).where(eq(calendars.id, id)).get();
  if (!row) throw new AppError("not_found", "Calendar not found");
  return row;
}

export function updateCalendar(ctx: Ctx, id: string, patch: UpdateCalendarInput): CalendarView {
  const row = getCalendarRow(ctx.db, id);
  const set: Partial<CalendarRow> = {};
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.memberId !== undefined) {
    if (patch.memberId !== null) {
      const member = ctx.db.select({ id: members.id }).from(members).where(eq(members.id, patch.memberId)).get();
      if (!member) throw new AppError("validation", "Unknown member");
    }
    set.memberId = patch.memberId;
  }
  if (Object.keys(set).length > 0) ctx.db.update(calendars).set(set).where(eq(calendars.id, id)).run();
  return toView({ ...row, ...set });
}
