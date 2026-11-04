import { createRoute } from "@hono/zod-openapi";
import {
  createEventSchema,
  eventIdParamSchema,
  eventInstanceListSchema,
  eventInstanceSchema,
  eventsQuerySchema,
  scopeQuerySchema,
  updateEventSchema,
} from "../schemas/calendar.js";
import { createEvent, deleteEvent, listEvents, updateEvent } from "../services/events.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["events"];

const listRoute = createRoute({
  method: "get",
  path: "/events",
  tags,
  summary: "Expanded events in a window",
  description:
    "Recurring events are expanded server-side (RRULE, EXDATE, overrides). Timed events are UTC instants; all-day events are date-only with an exclusive end.",
  request: { query: eventsQuerySchema },
  responses: { 200: { description: "Event instances", content: json(eventInstanceListSchema) } },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/events",
  tags,
  summary: "Create an event",
  description: "Written to the provider first, then cached. 403 for read-only calendars; 502 on provider failure.",
  request: { body: { content: json(createEventSchema), required: true } },
  responses: { 201: { description: "Created", content: json(eventInstanceSchema) } },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/events/{id}",
  tags,
  summary: "Edit an event or one occurrence",
  description: "409 `conflict` when the event changed at the provider (etag precondition failed).",
  request: { params: eventIdParamSchema, query: scopeQuerySchema, body: { content: json(updateEventSchema), required: true } },
  responses: { 200: { description: "Updated", content: json(eventInstanceSchema) } },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/events/{id}",
  tags,
  summary: "Delete an event or one occurrence",
  request: { params: eventIdParamSchema, query: scopeQuerySchema },
  responses: { 204: { description: "Deleted" } },
});

export function registerEventRoutes(app: ApiApp): void {
  app.openapi(listRoute, (c) => c.json(listEvents(c.var.ctx, c.req.valid("query")), 200));
  app.openapi(createRoute_, async (c) => c.json(await createEvent(c.var.ctx, c.req.valid("json")), 201));
  app.openapi(patchRoute, async (c) =>
    c.json(await updateEvent(c.var.ctx, c.req.valid("param").id, c.req.valid("query").scope, c.req.valid("json")), 200),
  );
  app.openapi(deleteRoute, async (c) => {
    await deleteEvent(c.var.ctx, c.req.valid("param").id, c.req.valid("query").scope);
    return c.body(null, 204);
  });
}
