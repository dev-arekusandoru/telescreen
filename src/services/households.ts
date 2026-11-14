import { and, asc, eq, max } from "drizzle-orm";
import type { Ctx } from "../context.js";
import type { Db } from "../db/client.js";
import { households, members } from "../db/schema.js";
import { AppError } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import type { MEMBER_COLORS } from "../schemas/household.js";

export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect & { colorToken: (typeof MEMBER_COLORS)[number] };

function assertTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new AppError("validation", `Unknown time zone: ${tz}`, { timezone: tz });
  }
}

/** System time zone, overridable with `TELESCREEN_TIMEZONE`. */
export function defaultTimezone(env: NodeJS.ProcessEnv = process.env): string {
  return env.TELESCREEN_TIMEZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getHousehold(db: Db, householdId: string): Household {
  const row = db.select().from(households).where(eq(households.id, householdId)).get();
  if (!row) throw new AppError("not_found", "Household not found");
  return row;
}

export function updateHousehold(
  ctx: Ctx,
  patch: Partial<Pick<Household, "name" | "timezone" | "weekStart" | "themeDefault">>,
): Household {
  if (patch.timezone !== undefined) assertTimezone(patch.timezone);
  const set = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
    ...(patch.weekStart === undefined ? {} : { weekStart: patch.weekStart }),
    ...(patch.themeDefault === undefined ? {} : { themeDefault: patch.themeDefault }),
  };
  if (Object.keys(set).length === 0) return getHousehold(ctx.db, ctx.householdId);
  return ctx.db
    .update(households)
    .set({ ...set, updatedAt: ctx.now().toISOString() })
    .where(eq(households.id, ctx.householdId))
    .returning()
    .get();
}

export function listMembers(db: Db, householdId: string): Member[] {
  return db
    .select()
    .from(members)
    .where(eq(members.householdId, householdId))
    .orderBy(asc(members.sort), asc(members.id))
    .all() as Member[];
}

function getMember(ctx: Ctx, id: string): Member {
  const row = ctx.db
    .select()
    .from(members)
    .where(and(eq(members.householdId, ctx.householdId), eq(members.id, id)))
    .get();
  if (!row) throw new AppError("not_found", `Member not found: ${id}`, { id });
  return row as Member;
}

export function createMember(
  ctx: Ctx,
  input: { name: string; colorToken: Member["colorToken"]; initial?: string | undefined },
): Member {
  const top = ctx.db
    .select({ top: max(members.sort) })
    .from(members)
    .where(eq(members.householdId, ctx.householdId))
    .get();
  return ctx.db
    .insert(members)
    .values({
      id: newId("mem"),
      householdId: ctx.householdId,
      name: input.name,
      colorToken: input.colorToken,
      initial: (input.initial ?? Array.from(input.name)[0] ?? "?").toUpperCase(),
      sort: (top?.top ?? -1) + 1,
    })
    .returning()
    .get() as Member;
}

export function updateMember(
  ctx: Ctx,
  id: string,
  patch: { name?: string | undefined; colorToken?: Member["colorToken"] | undefined; initial?: string | undefined; sort?: number | undefined },
): Member {
  const current = getMember(ctx, id);
  const set = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.colorToken === undefined ? {} : { colorToken: patch.colorToken }),
    ...(patch.initial === undefined ? {} : { initial: patch.initial.toUpperCase() }),
    ...(patch.sort === undefined ? {} : { sort: patch.sort }),
  };
  if (Object.keys(set).length === 0) return current;
  return ctx.db.update(members).set(set).where(eq(members.id, id)).returning().get() as Member;
}

/** Delete a member. Calendars and occurrences referencing it are detached (FK `set null`). */
export function deleteMember(ctx: Ctx, id: string): { id: string } {
  getMember(ctx, id);
  ctx.db.delete(members).where(eq(members.id, id)).run();
  return { id };
}

/**
 * First boot: create the household and the two default members when no household
 * exists. Returns the (existing or new) household.
 */
export function seedIfEmpty(db: Db, env: NodeJS.ProcessEnv = process.env): Household {
  const existing = db.select().from(households).limit(1).get();
  if (existing) return existing;
  return db.transaction((tx) => {
    const household = tx
      .insert(households)
      .values({
        id: newId("home"),
        name: env.TELESCREEN_HOUSEHOLD_NAME?.trim() || "Our Home",
        timezone: defaultTimezone(env),
      })
      .returning()
      .get();
    tx.insert(members)
      .values([
        { id: newId("mem"), householdId: household.id, name: "Alex", colorToken: "terracotta", initial: "A", sort: 0 },
        { id: newId("mem"), householdId: household.id, name: "Vale", colorToken: "sage", initial: "V", sort: 1 },
      ])
      .run();
    return household;
  });
}
