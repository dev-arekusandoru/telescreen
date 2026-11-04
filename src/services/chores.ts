import { and, asc, between, eq, gte, inArray, lt, max, or, sql } from "drizzle-orm";
import type { Ctx } from "../context.js";
import { choreOccurrences, chores, members } from "../db/schema.js";
import { AppError } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import { addDays, diffDays, todayIn } from "../lib/localdate.js";
import {
  assigneeFor,
  datesInRange,
  nextDateAfter,
  normalizeRecurrence,
  recurrenceStart,
  withStart,
} from "./chore-recurrence.js";
import { recurrenceSchema, type Assignment, type Recurrence, type RecurrenceInput } from "../schemas/chores.js";
import { getHousehold } from "./households.js";

type ChoreRow = typeof chores.$inferSelect;
type OccurrenceRow = typeof choreOccurrences.$inferSelect;

/** Longest range a single occurrence query may materialize. */
const MAX_RANGE_DAYS = 100;
/** The daily tick keeps this many days ahead materialized. */
const TICK_HORIZON_DAYS = 14;

export interface Chore {
  id: string;
  name: string;
  icon: string | null;
  notes: string | null;
  recurrence: Recurrence;
  assignment: Assignment;
  memberIds: string[];
  dueTime: string | null;
  estimatedMinutes: number | null;
  archived: boolean;
}

export interface Occurrence {
  id: string;
  choreId: string;
  indexN: number;
  dueDate: string;
  status: OccurrenceRow["status"];
  assigneeId: string | null;
  completedBy: string | null;
  completedAt: string | null;
  name: string;
  icon: string | null;
  notes: string | null;
  dueTime: string | null;
  estimatedMinutes: number | null;
  assignment: Assignment;
  nextAssigneeId: string | null;
}

/** `recurrence_json` = the descriptor plus the internal `indexOffset` (see `rescheduleChore`). */
interface StoredRecurrence {
  rec: Recurrence;
  indexOffset: number;
}

function parseStored(raw: string): StoredRecurrence {
  const parsed: unknown = JSON.parse(raw);
  const { indexOffset, ...rest } = parsed as Record<string, unknown>;
  return { rec: recurrenceSchema.parse(rest), indexOffset: typeof indexOffset === "number" ? indexOffset : 0 };
}

function serializeStored(stored: StoredRecurrence): string {
  return JSON.stringify({ ...stored.rec, indexOffset: stored.indexOffset });
}

function toChore(row: ChoreRow): Chore {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    notes: row.notes,
    recurrence: parseStored(row.recurrenceJson).rec,
    assignment: row.assignment,
    memberIds: JSON.parse(row.memberIdsJson) as string[],
    dueTime: row.dueTime,
    estimatedMinutes: row.estimatedMinutes,
    archived: row.archived,
  };
}

/** Today's date in the household time zone. */
export function householdToday(ctx: Ctx): string {
  return todayIn(getHousehold(ctx.db, ctx.householdId).timezone, ctx.now());
}

function getChoreRow(ctx: Ctx, id: string): ChoreRow {
  const row = ctx.db.select().from(chores).where(eq(chores.id, id)).get();
  if (!row) throw new AppError("not_found", `Chore not found: ${id}`, { id });
  return row;
}

function assertMembers(ctx: Ctx, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) throw new AppError("validation", "Duplicate member in chore assignment");
  if (ids.length === 0) return;
  const found = ctx.db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.householdId, ctx.householdId), inArray(members.id, [...ids])))
    .all();
  if (found.length !== ids.length) throw new AppError("validation", "Unknown member in chore assignment");
}

function assertAssignment(assignment: Assignment, memberIds: readonly string[]): void {
  if (assignment === "fixed" && memberIds.length !== 1) {
    throw new AppError("validation", "A fixed chore needs exactly one member");
  }
  if (assignment === "rotating" && memberIds.length < 2) {
    throw new AppError("validation", "A rotating chore needs at least two members");
  }
}

export function listChores(ctx: Ctx): Chore[] {
  return ctx.db.select().from(chores).orderBy(asc(chores.name), asc(chores.id)).all().map(toChore);
}

export function createChore(
  ctx: Ctx,
  input: {
    name: string;
    icon?: string | null | undefined;
    notes?: string | null | undefined;
    recurrence: RecurrenceInput;
    assignment: Assignment;
    memberIds: string[];
    dueTime?: string | null | undefined;
    estimatedMinutes?: number | null | undefined;
  },
): Chore {
  assertMembers(ctx, input.memberIds);
  assertAssignment(input.assignment, input.memberIds);
  const rec = normalizeRecurrence(input.recurrence, householdToday(ctx));
  const row = ctx.db
    .insert(chores)
    .values({
      id: newId("chore"),
      name: input.name,
      icon: input.icon ?? null,
      notes: input.notes ?? null,
      recurrenceJson: serializeStored({ rec, indexOffset: 0 }),
      assignment: input.assignment,
      memberIdsJson: JSON.stringify(input.memberIds),
      dueTime: input.dueTime ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
    })
    .returning()
    .get();
  return toChore(row);
}

export interface ChorePatch {
  name?: string | undefined;
  icon?: string | null | undefined;
  notes?: string | null | undefined;
  recurrence?: RecurrenceInput | undefined;
  assignment?: Assignment | undefined;
  memberIds?: string[] | undefined;
  dueTime?: string | null | undefined;
  estimatedMinutes?: number | null | undefined;
  archived?: boolean | undefined;
}

/**
 * Edit a template. History (done/missed/skipped and past open occurrences) is never rewritten:
 * - schedule change: past open occurrences become `missed`, future open ones are dropped, and the
 *   schedule is re-anchored at max(start, today) with `indexOffset` continuing after the highest
 *   retained index, so indexes stay unique and rotation order keeps advancing;
 * - assignment/rotation change: future open occurrences are dropped and regenerated lazily;
 * - archiving drops future open occurrences.
 */
export function updateChore(ctx: Ctx, id: string, patch: ChorePatch): Chore {
  const row = getChoreRow(ctx, id);
  const today = householdToday(ctx);
  const assignment = patch.assignment ?? row.assignment;
  const memberIds = patch.memberIds ?? (JSON.parse(row.memberIdsJson) as string[]);
  if (patch.assignment !== undefined || patch.memberIds !== undefined) {
    assertMembers(ctx, memberIds);
    assertAssignment(assignment, memberIds);
  }

  const stored = parseStored(row.recurrenceJson);
  let nextStored = stored;
  let scheduleChanged = false;
  if (patch.recurrence !== undefined) {
    const normalized = normalizeRecurrence(patch.recurrence, today);
    if (JSON.stringify(normalized) !== JSON.stringify(stored.rec)) {
      scheduleChanged = true;
      const reanchored =
        normalized.type === "once" || recurrenceStart(normalized) >= today
          ? normalized
          : normalizeRecurrence(withStart(normalized, today), today);
      nextStored = { rec: reanchored, indexOffset: stored.indexOffset };
    }
  }
  const assignmentChanged =
    assignment !== row.assignment || JSON.stringify(memberIds) !== row.memberIdsJson;
  const archiving = patch.archived === true && !row.archived;

  ctx.db.transaction((tx) => {
    if (scheduleChanged) {
      tx.update(choreOccurrences)
        .set({ status: "missed" })
        .where(and(eq(choreOccurrences.choreId, id), eq(choreOccurrences.status, "open"), lt(choreOccurrences.dueDate, today)))
        .run();
    }
    if (scheduleChanged || assignmentChanged || archiving) {
      tx.delete(choreOccurrences)
        .where(and(eq(choreOccurrences.choreId, id), eq(choreOccurrences.status, "open"), gte(choreOccurrences.dueDate, today)))
        .run();
    }
    if (scheduleChanged) {
      const top = tx
        .select({ top: max(choreOccurrences.indexN) })
        .from(choreOccurrences)
        .where(eq(choreOccurrences.choreId, id))
        .get();
      nextStored = { rec: nextStored.rec, indexOffset: (top?.top ?? -1) + 1 };
    }
    tx.update(chores)
      .set({
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.icon === undefined ? {} : { icon: patch.icon }),
        ...(patch.notes === undefined ? {} : { notes: patch.notes }),
        ...(patch.dueTime === undefined ? {} : { dueTime: patch.dueTime }),
        ...(patch.estimatedMinutes === undefined ? {} : { estimatedMinutes: patch.estimatedMinutes }),
        ...(patch.archived === undefined ? {} : { archived: patch.archived }),
        ...(patch.assignment === undefined ? {} : { assignment }),
        ...(patch.memberIds === undefined ? {} : { memberIdsJson: JSON.stringify(memberIds) }),
        ...(scheduleChanged ? { recurrenceJson: serializeStored(nextStored) } : {}),
      })
      .where(eq(chores.id, id))
      .run();
  });
  return toChore(getChoreRow(ctx, id));
}

/** Permanently delete a chore and its history (use `archived` to keep history). */
export function deleteChore(ctx: Ctx, id: string): { id: string } {
  getChoreRow(ctx, id);
  ctx.db.delete(chores).where(eq(chores.id, id)).run();
  return { id };
}

/**
 * Idempotently create the open occurrences of every active chore due in `[from, to]`.
 * Existing rows (by index or by date) are never touched.
 */
export function materializeOccurrences(ctx: Ctx, from: string, to: string): void {
  const active = ctx.db.select().from(chores).where(eq(chores.archived, false)).all();
  ctx.db.transaction((tx) => {
    for (const row of active) {
      const { rec, indexOffset } = parseStored(row.recurrenceJson);
      const dates = datesInRange(rec, from, to);
      if (dates.length === 0) continue;
      const have = new Set(
        tx
          .select({ d: choreOccurrences.dueDate })
          .from(choreOccurrences)
          .where(and(eq(choreOccurrences.choreId, row.id), between(choreOccurrences.dueDate, from, to)))
          .all()
          .map((r) => r.d),
      );
      const memberIds = JSON.parse(row.memberIdsJson) as string[];
      for (const { date, ordinal } of dates) {
        if (have.has(date)) continue;
        const indexN = indexOffset + ordinal;
        tx.insert(choreOccurrences)
          .values({
            id: newId("occ"),
            choreId: row.id,
            indexN,
            dueDate: date,
            assigneeId: assigneeFor(row.assignment, memberIds, indexN),
          })
          .onConflictDoNothing()
          .run();
      }
    }
  });
}

/**
 * Missed rule: an open occurrence becomes `missed` once the chore's next scheduled date has
 * arrived (`next <= today`): daily chores expire at day end, weekly ones at week end. One-offs
 * never expire. Missed items stay in history and never show on Today.
 */
export function markMissedOccurrences(ctx: Ctx, today: string): void {
  const stale = ctx.db
    .select()
    .from(choreOccurrences)
    .where(and(eq(choreOccurrences.status, "open"), lt(choreOccurrences.dueDate, today)))
    .all();
  if (stale.length === 0) return;
  const recs = new Map<string, Recurrence>();
  const expired: string[] = [];
  for (const occ of stale) {
    let rec = recs.get(occ.choreId);
    if (!rec) {
      const row = ctx.db.select().from(chores).where(eq(chores.id, occ.choreId)).get();
      if (!row) continue;
      rec = parseStored(row.recurrenceJson).rec;
      recs.set(occ.choreId, rec);
    }
    if (rec.type === "once") continue;
    const next = nextDateAfter(rec, occ.dueDate);
    if (next !== null && next <= today) expired.push(occ.id);
  }
  if (expired.length > 0) {
    ctx.db.update(choreOccurrences).set({ status: "missed" }).where(inArray(choreOccurrences.id, expired)).run();
  }
}

/** Daily tick: expire missed occurrences and keep the next two weeks materialized. */
export function runChoreTick(ctx: Ctx): void {
  const today = householdToday(ctx);
  markMissedOccurrences(ctx, today);
  materializeOccurrences(ctx, today, addDays(today, TICK_HORIZON_DAYS));
}

function toOccurrence(
  occ: OccurrenceRow,
  chore: ChoreRow,
): Occurrence {
  const memberIds = JSON.parse(chore.memberIdsJson) as string[];
  return {
    id: occ.id,
    choreId: occ.choreId,
    indexN: occ.indexN,
    dueDate: occ.dueDate,
    status: occ.status,
    assigneeId: occ.assigneeId,
    completedBy: occ.completedBy,
    completedAt: occ.completedAt,
    name: chore.name,
    icon: chore.icon,
    notes: chore.notes,
    dueTime: chore.dueTime,
    estimatedMinutes: chore.estimatedMinutes,
    assignment: chore.assignment,
    nextAssigneeId: chore.assignment === "rotating" ? assigneeFor("rotating", memberIds, occ.indexN + 1) : null,
  };
}

export interface OccurrenceQuery {
  from: string;
  to: string;
  member?: string | undefined;
  /** Also include still-live open occurrences due before `from` (Today view). */
  carryover?: boolean | undefined;
}

export function listOccurrences(ctx: Ctx, q: OccurrenceQuery): Occurrence[] {
  if (q.to < q.from) throw new AppError("validation", "`to` must not be before `from`");
  if (diffDays(q.to, q.from) > MAX_RANGE_DAYS) {
    throw new AppError("validation", `Range too long (max ${MAX_RANGE_DAYS} days)`);
  }
  const today = householdToday(ctx);
  markMissedOccurrences(ctx, today);
  materializeOccurrences(ctx, q.from, q.to);

  const inRange = between(choreOccurrences.dueDate, q.from, q.to);
  const where = q.carryover
    ? or(inRange, and(eq(choreOccurrences.status, "open"), lt(choreOccurrences.dueDate, q.from)))
    : inRange;
  const rows = ctx.db
    .select({ occ: choreOccurrences, chore: chores })
    .from(choreOccurrences)
    .innerJoin(chores, eq(chores.id, choreOccurrences.choreId))
    .where(where)
    .orderBy(asc(choreOccurrences.dueDate), sql`${chores.dueTime} is null`, asc(chores.dueTime), asc(chores.name))
    .all();
  return rows
    .filter(({ occ, chore }) => !(chore.archived && occ.status === "open"))
    .filter(({ occ }) => q.member === undefined || occ.assigneeId === q.member || occ.completedBy === q.member)
    .map(({ occ, chore }) => toOccurrence(occ, chore));
}

function getOccurrence(ctx: Ctx, id: string): { occ: OccurrenceRow; chore: ChoreRow } {
  const row = ctx.db
    .select({ occ: choreOccurrences, chore: chores })
    .from(choreOccurrences)
    .innerJoin(chores, eq(chores.id, choreOccurrences.choreId))
    .where(eq(choreOccurrences.id, id))
    .get();
  if (!row) throw new AppError("not_found", `Occurrence not found: ${id}`, { id });
  return row;
}

function assertMember(ctx: Ctx, id: string): void {
  assertMembers(ctx, [id]);
}

function requireOpen(occ: OccurrenceRow): void {
  if (occ.status !== "open") throw new AppError("conflict", `This chore is already ${occ.status}`, { status: occ.status });
}

/** Mark done; the completer (not necessarily the assignee) gets the credit. */
export function completeOccurrence(ctx: Ctx, id: string, completedBy: string): Occurrence {
  const { occ, chore } = getOccurrence(ctx, id);
  assertMember(ctx, completedBy);
  requireOpen(occ);
  const updated = ctx.db
    .update(choreOccurrences)
    .set({ status: "done", completedBy, completedAt: ctx.now().toISOString() })
    .where(eq(choreOccurrences.id, id))
    .returning()
    .get();
  return toOccurrence(updated, chore);
}

/** Back to open from done or skipped; re-applies the missed rule if its window has passed. */
export function undoOccurrence(ctx: Ctx, id: string): Occurrence {
  const { occ } = getOccurrence(ctx, id);
  if (occ.status !== "done" && occ.status !== "skipped") {
    throw new AppError("conflict", `Nothing to undo: chore is ${occ.status}`, { status: occ.status });
  }
  ctx.db
    .update(choreOccurrences)
    .set({ status: "open", completedBy: null, completedAt: null })
    .where(eq(choreOccurrences.id, id))
    .run();
  markMissedOccurrences(ctx, householdToday(ctx));
  const fresh = getOccurrence(ctx, id);
  return toOccurrence(fresh.occ, fresh.chore);
}

export function skipOccurrence(ctx: Ctx, id: string): Occurrence {
  const { occ, chore } = getOccurrence(ctx, id);
  requireOpen(occ);
  const updated = ctx.db
    .update(choreOccurrences)
    .set({ status: "skipped" })
    .where(eq(choreOccurrences.id, id))
    .returning()
    .get();
  return toOccurrence(updated, chore);
}

/** One-off assignee override for a single open occurrence; rotation of the others is unaffected. */
export function reassignOccurrence(ctx: Ctx, id: string, memberId: string): Occurrence {
  const { occ, chore } = getOccurrence(ctx, id);
  assertMember(ctx, memberId);
  requireOpen(occ);
  const updated = ctx.db
    .update(choreOccurrences)
    .set({ assigneeId: memberId })
    .where(eq(choreOccurrences.id, id))
    .returning()
    .get();
  return toOccurrence(updated, chore);
}

export interface ProgressEntry {
  memberId: string;
  done: number;
  total: number;
}

/**
 * Per-member progress for `date`: the occurrences on Today (due that day, plus still-live open
 * carry-overs), skipped excluded. Credit goes to whoever completed it; an open one counts
 * for its assignee. Unassigned open `either` chores are in nobody's total (they join the
 * completer's total and done count once completed).
 */
export function choreProgress(ctx: Ctx, date: string): ProgressEntry[] {
  const list = listOccurrences(ctx, { from: date, to: date, carryover: true });
  const people = ctx.db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.householdId, ctx.householdId))
    .orderBy(asc(members.sort), asc(members.id))
    .all();
  const tally = new Map(people.map((p) => [p.id, { memberId: p.id, done: 0, total: 0 }]));
  for (const occ of list) {
    if (occ.status === "skipped") continue;
    const owner = tally.get((occ.status === "done" ? occ.completedBy : occ.assigneeId) ?? "");
    if (!owner) continue;
    owner.total++;
    if (occ.status === "done") owner.done++;
  }
  return [...tally.values()];
}
