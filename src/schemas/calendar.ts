import { z } from "@hono/zod-openapi";

const idParam = z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) });
export const calendarIdParamSchema = idParam;
export const accountIdParamSchema = idParam;
export const eventIdParamSchema = idParam;

// -- accounts -----------------------------------------------------------------

export const accountSchema = z
  .object({
    id: z.string(),
    provider: z.enum(["google", "icloud"]),
    label: z.string(),
    status: z.enum(["ok", "error", "needs_auth"]),
    lastError: z.string().nullable(),
  })
  .openapi("Account");
export const accountListSchema = z.array(accountSchema).openapi("AccountList");

export const createIcloudAccountSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    appleId: z.string().trim().min(1),
    appPassword: z.string().trim().min(1).describe("App-specific password from appleid.apple.com."),
  })
  .openapi("CreateIcloudAccountInput");

export type CreateIcloudAccountInput = z.infer<typeof createIcloudAccountSchema>;

export const googleStartSchema = z
  .object({ authUrl: z.string().describe("Send the browser here to grant calendar access.") })
  .openapi("GoogleAuthStart");

// -- calendars ----------------------------------------------------------------

export const calendarSchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    writable: z.boolean(),
    enabled: z.boolean(),
    memberId: z.string().nullable().describe("NULL = Family / Both."),
    lastSyncedAt: z.string().nullable(),
    lastError: z.string().nullable(),
  })
  .openapi("Calendar");
export const calendarListSchema = z.array(calendarSchema).openapi("CalendarList");

export const updateCalendarSchema = z
  .object({
    enabled: z.boolean().optional(),
    memberId: z.string().nullable().optional(),
  })
  .openapi("UpdateCalendarInput");
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

// -- sync ---------------------------------------------------------------------

export const syncStatusSchema = z
  .object({
    lastSyncedAt: z.string().nullable().describe("Most recent successful sync across enabled calendars."),
    hasErrors: z.boolean(),
  })
  .openapi("SyncStatus");

// -- events -------------------------------------------------------------------

export const repeatSchema = z.enum(["none", "daily", "weekdays", "weekly", "monthly", "yearly", "custom"]);

export const eventInstanceSchema = z
  .object({
    id: z.string().describe("Opaque instance id; use it for PATCH/DELETE."),
    eventId: z.string().describe("Id of the series / single event."),
    calendarId: z.string(),
    memberId: z.string().nullable(),
    title: z.string(),
    start: z.string().describe("UTC ISO instant, or `YYYY-MM-DD` when allDay."),
    end: z.string().describe("UTC ISO instant, or exclusive `YYYY-MM-DD` when allDay."),
    allDay: z.boolean(),
    timeZone: z.string().nullable().describe("Original IANA zone of the event, when known."),
    location: z.string().nullable(),
    notes: z.string().nullable(),
    recurring: z.boolean(),
    repeat: repeatSchema,
    writable: z.boolean(),
  })
  .openapi("EventInstance");
export const eventInstanceListSchema = z.array(eventInstanceSchema).openapi("EventInstanceList");

export const eventsQuerySchema = z.object({
  start: z.string().describe("Window start (ISO instant)."),
  end: z.string().describe("Window end (ISO instant, exclusive)."),
  members: z.string().optional().describe("Comma-separated member ids; `family` selects unassigned calendars. Omit for all."),
});

const eventFields = {
  title: z.string().trim().min(1).max(500),
  start: z.string().describe("ISO instant, or `YYYY-MM-DD` for all-day."),
  end: z.string().describe("ISO instant, or exclusive `YYYY-MM-DD` for all-day."),
  allDay: z.boolean(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  repeat: repeatSchema,
};

export const createEventSchema = z
  .object({ calendarId: z.string(), ...eventFields, repeat: repeatSchema.default("none") })
  .openapi("CreateEventInput");

export const updateEventSchema = z
  .object({
    title: eventFields.title.optional(),
    start: eventFields.start.optional(),
    end: eventFields.end.optional(),
    allDay: eventFields.allDay.optional(),
    location: eventFields.location,
    notes: eventFields.notes,
    repeat: repeatSchema.optional(),
  })
  .openapi("UpdateEventInput");

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const scopeQuerySchema = z.object({
  scope: z.enum(["this", "all"]).default("all").describe("Recurring events: this occurrence or the whole series."),
});
