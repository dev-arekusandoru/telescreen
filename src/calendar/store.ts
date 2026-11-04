import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import type { NormEvent } from "./ics.js";

/**
 * Replace everything cached for one remote resource. The master row keeps its id
 * so instance ids handed to the UI stay valid across syncs.
 */
export function replaceResource(db: Db, calendarId: string, remoteId: string, rows: NormEvent[]): void {
  db.transaction((tx) => {
    const existing = tx
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.calendarId, calendarId), eq(events.remoteId, remoteId), isNull(events.recurrenceId)))
      .get();
    tx.delete(events).where(and(eq(events.calendarId, calendarId), eq(events.remoteId, remoteId))).run();
    for (const row of rows) {
      const id = row.recurrenceId === null && existing ? existing.id : newId("ev");
      tx.insert(events).values({ id, calendarId, ...row }).run();
    }
  });
}

export function deleteResource(db: Db, calendarId: string, remoteId: string): void {
  db.delete(events).where(and(eq(events.calendarId, calendarId), eq(events.remoteId, remoteId))).run();
}

/** Delete a whole series (master and overrides) by series id. */
export function deleteSeries(db: Db, calendarId: string, seriesId: string): void {
  db.delete(events).where(and(eq(events.calendarId, calendarId), eq(events.seriesId, seriesId))).run();
}

export function clearCalendar(db: Db, calendarId: string): void {
  db.delete(events).where(eq(events.calendarId, calendarId)).run();
}
