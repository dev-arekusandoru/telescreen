import { and, eq, inArray } from "drizzle-orm";
import type { CalendarRef, SyncContext } from "../calendar/provider.js";
import { ProviderAuthError } from "../calendar/provider.js";
import type { Ctx } from "../context.js";
import type { Db } from "../db/client.js";
import { accounts, calendars, households } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import { getAccountRow, providerFor } from "./accounts.js";
import { getSettings } from "./settings.js";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function householdTimezone(db: Db, householdId: string): string {
  const row = db.select({ tz: households.timezone }).from(households).where(eq(households.id, householdId)).get();
  return row?.tz ?? "UTC";
}

export function syncContext(ctx: Ctx): SyncContext {
  return { db: ctx.db, defaultTz: householdTimezone(ctx.db, ctx.householdId), now: ctx.now };
}

const inflight = new Map<string, Promise<void>>();

/**
 * Discover calendars and sync every enabled one for an account. Concurrent calls for the
 * same account share one run. Failures are recorded on the calendar/account, not thrown.
 */
export function syncAccount(ctx: Ctx, accountId: string): Promise<void> {
  const running = inflight.get(accountId);
  if (running) return running;
  const run = doSyncAccount(ctx, accountId).finally(() => inflight.delete(accountId));
  inflight.set(accountId, run);
  return run;
}

async function doSyncAccount(ctx: Ctx, accountId: string): Promise<void> {
  const { db } = ctx;
  const account = getAccountRow(db, accountId);
  if (account.status === "disabled") return;
  const sctx = syncContext(ctx);
  const nowIso = () => ctx.now().toISOString();

  let firstError: string | null = null;
  try {
    const provider = providerFor(account);
    const remote = await provider.listCalendars();
    const existing = db.select().from(calendars).where(eq(calendars.accountId, accountId)).all();
    const byRemote = new Map(existing.map((c) => [c.remoteId, c]));
    for (const rc of remote) {
      const known = byRemote.get(rc.remoteId);
      if (known) {
        db.update(calendars).set({ name: rc.name, color: rc.color, writable: rc.writable }).where(eq(calendars.id, known.id)).run();
      } else {
        db.insert(calendars)
          .values({ id: newId("cal"), accountId, remoteId: rc.remoteId, name: rc.name, color: rc.color, writable: rc.writable })
          .run();
      }
    }
    const gone = existing.filter((c) => !remote.some((r) => r.remoteId === c.remoteId)).map((c) => c.id);
    if (gone.length > 0) db.delete(calendars).where(inArray(calendars.id, gone)).run();

    for (const cal of db.select().from(calendars).where(and(eq(calendars.accountId, accountId), eq(calendars.enabled, true))).all()) {
      const ref: CalendarRef = { id: cal.id, remoteId: cal.remoteId, syncToken: cal.syncToken, ctag: cal.ctag };
      try {
        const outcome = await provider.syncCalendar(ref, sctx);
        db.update(calendars)
          .set({
            lastSyncedAt: nowIso(),
            lastError: null,
            ...(outcome.syncToken !== undefined ? { syncToken: outcome.syncToken } : {}),
            ...(outcome.ctag !== undefined ? { ctag: outcome.ctag } : {}),
          })
          .where(eq(calendars.id, cal.id))
          .run();
      } catch (e) {
        if (e instanceof ProviderAuthError) throw e;
        const msg = message(e);
        firstError ??= `${cal.name}: ${msg}`;
        db.update(calendars).set({ lastError: msg }).where(eq(calendars.id, cal.id)).run();
      }
    }
    db.update(accounts)
      .set({ status: firstError ? "error" : "ok", lastError: firstError })
      .where(eq(accounts.id, accountId))
      .run();
  } catch (e) {
    const status = e instanceof ProviderAuthError ? "needs_auth" : "error";
    db.update(accounts).set({ status, lastError: message(e) }).where(eq(accounts.id, accountId)).run();
  }
}

/** Sync every account (in parallel; each account is single-flight). */
export async function syncAll(ctx: Ctx): Promise<void> {
  const ids = ctx.db.select({ id: accounts.id }).from(accounts).all();
  await Promise.all(ids.map((a) => syncAccount(ctx, a.id)));
}

export interface SyncStatus {
  lastSyncedAt: string | null;
  hasErrors: boolean;
}

/** Header indicator: most recent successful sync, and whether anything is failing. */
export function getSyncStatus(db: Db): SyncStatus {
  const cals = db.select().from(calendars).where(eq(calendars.enabled, true)).all();
  const accountRows = db.select({ status: accounts.status }).from(accounts).all();
  const times = cals.map((c) => c.lastSyncedAt).filter((t): t is string => t !== null);
  return {
    lastSyncedAt: times.length > 0 ? times.reduce((x, y) => (x > y ? x : y)) : null,
    hasErrors: cals.some((c) => c.lastError !== null) || accountRows.some((a) => a.status !== "ok"),
  };
}

/**
 * Poll every `syncIntervalMinutes` (re-read each cycle so a settings change applies without restart).
 * Returns a stop function.
 */
export function startSyncScheduler(ctx: Ctx, options: { initialDelayMs?: number } = {}): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(tick, delayMs);
    timer.unref();
  };
  const tick = async () => {
    try {
      await syncAll(ctx);
    } catch (e) {
      console.error("[homehub] sync failed:", e);
    }
    schedule(Math.max(1, getSettings(ctx.db).syncIntervalMinutes) * 60_000);
  };

  schedule(options.initialDelayMs ?? 5_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
