import { createRoute } from "@hono/zod-openapi";
import { calendarIdParamSchema, calendarListSchema, calendarSchema, updateCalendarSchema } from "../schemas/calendar.js";
import { listCalendars, updateCalendar } from "../services/calendars.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["calendars"];

const listRoute = createRoute({
  method: "get",
  path: "/calendars",
  tags,
  summary: "List discovered calendars",
  responses: { 200: { description: "Calendars", content: json(calendarListSchema) } },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/calendars/{id}",
  tags,
  summary: "Enable/disable a calendar or map it to a member",
  description: "`memberId: null` = Family / Both.",
  request: { params: calendarIdParamSchema, body: { content: json(updateCalendarSchema), required: true } },
  responses: { 200: { description: "Updated calendar", content: json(calendarSchema) } },
});

export function registerCalendarRoutes(app: ApiApp): void {
  app.openapi(listRoute, (c) => c.json(listCalendars(c.var.ctx.db), 200));
  app.openapi(patchRoute, (c) => c.json(updateCalendar(c.var.ctx, c.req.valid("param").id, c.req.valid("json")), 200));
}
