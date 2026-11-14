import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Full Telescreen schema (SPEC §7). After editing run `pnpm db:generate`; migrations
 * in `drizzle/` are applied automatically on boot.
 *
 * Conventions: text primary keys from `newId(prefix)`, timestamps as ISO-8601
 * UTC strings, booleans as 0/1 integers (`mode: "boolean"`), JSON in `*_json` columns.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const households = sqliteTable("household", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** IANA timezone; all display uses this. */
  timezone: text("timezone").notNull(),
  /** 0 = Sunday … 6 = Saturday. Used by the fixed-week mode and month grid. */
  weekStart: integer("week_start").notNull().default(0),
  themeDefault: text("theme_default", { enum: ["system", "light", "dark"] })
    .notNull()
    .default("system"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const members = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Palette key (see `memberColorSchema`), mapped to CSS variables on the web. */
    colorToken: text("color_token").notNull(),
    initial: text("initial").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("member_household_idx").on(t.householdId, t.sort)],
);

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  provider: text("provider", { enum: ["google", "icloud"] }).notNull(),
  label: text("label").notNull(),
  /** AES-GCM blob from `src/lib/crypto.ts`; never returned by the API. */
  secretEncrypted: text("secret_encrypted").notNull(),
  status: text("status", { enum: ["ok", "error", "needs_auth", "disabled"] })
    .notNull()
    .default("ok"),
  lastError: text("last_error"),
});

/**
 * Music-module connection (SPEC §6: Spotify Web API). Separate from `account`
 * because it has no calendars and a single connection is all the module uses.
 */
export const musicConnections = sqliteTable("music_connection", {
  id: text("id").primaryKey(),
  provider: text("provider", { enum: ["spotify"] })
    .notNull()
    .default("spotify"),
  /** Spotify display name, for Settings. */
  label: text("label").notNull(),
  /** AES-GCM blob from `src/lib/crypto.ts`; never returned by the API. */
  secretEncrypted: text("secret_encrypted").notNull(),
  status: text("status", { enum: ["ok", "error", "needs_auth", "disabled"] })
    .notNull()
    .default("ok"),
  lastError: text("last_error"),
});

export const calendars = sqliteTable(
  "calendar",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    remoteId: text("remote_id").notNull(),
    name: text("name").notNull(),
    color: text("color"),
    writable: integer("writable", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** NULL = Family / Both. */
    memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
    syncToken: text("sync_token"),
    ctag: text("ctag"),
    lastSyncedAt: text("last_synced_at"),
    /** Last sync failure message; NULL after a successful sync. */
    lastError: text("last_error"),
  },
  (t) => [uniqueIndex("calendar_account_remote_idx").on(t.accountId, t.remoteId)],
);

export const events = sqliteTable(
  "event",
  {
    id: text("id").primaryKey(),
    calendarId: text("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    remoteId: text("remote_id").notNull(),
    etag: text("etag"),
    /** Groups a recurring series and its overrides. */
    seriesId: text("series_id"),
    /** Set on override instances of a series (original start). */
    recurrenceId: text("recurrence_id"),
    startUtc: text("start_utc").notNull(),
    endUtc: text("end_utc").notNull(),
    /** Original IANA time zone of the event. */
    startTz: text("start_tz"),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    summary: text("summary").notNull().default(""),
    location: text("location"),
    notes: text("notes"),
    rrule: text("rrule"),
    rawIcs: text("raw_ics"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("event_calendar_start_idx").on(t.calendarId, t.startUtc),
    index("event_series_idx").on(t.seriesId),
    uniqueIndex("event_calendar_remote_idx").on(t.calendarId, t.remoteId, t.recurrenceId),
  ],
);

export const chores = sqliteTable("chore", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  notes: text("notes"),
  /** Recurrence descriptor (one-off, daily, weekdays, weekly, every N weeks, monthly). */
  recurrenceJson: text("recurrence_json").notNull(),
  assignment: text("assignment", { enum: ["fixed", "rotating", "either"] }).notNull(),
  /** Ordered member ids (JSON array); rotation order for `rotating`. */
  memberIdsJson: text("member_ids_json").notNull().default("[]"),
  /** HH:MM, display only. */
  dueTime: text("due_time"),
  /** Estimated minutes (display only). */
  estimatedMinutes: integer("estimated_minutes"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const choreOccurrences = sqliteTable(
  "chore_occurrence",
  {
    id: text("id").primaryKey(),
    choreId: text("chore_id")
      .notNull()
      .references(() => chores.id, { onDelete: "cascade" }),
    /** Occurrence index n; rotating assignee = members[n mod k]. */
    indexN: integer("index_n").notNull(),
    /** YYYY-MM-DD in the household time zone. */
    dueDate: text("due_date").notNull(),
    assigneeId: text("assignee_id").references(() => members.id, { onDelete: "set null" }),
    status: text("status", { enum: ["open", "done", "missed", "skipped"] })
      .notNull()
      .default("open"),
    completedBy: text("completed_by").references(() => members.id, { onDelete: "set null" }),
    completedAt: text("completed_at"),
  },
  (t) => [
    uniqueIndex("chore_occurrence_chore_index_idx").on(t.choreId, t.indexN),
    index("chore_occurrence_due_idx").on(t.dueDate),
  ],
);

export const settings = sqliteTable("setting", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
});

/** Bearer tokens for `/api/v1` (not in SPEC §7; same mechanism as PantryPal). */
export const apiTokens = sqliteTable("api_token", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull().default(now),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
});
