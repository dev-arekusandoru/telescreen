import { createRoute } from "@hono/zod-openapi";
import { deleteResultSchema } from "../schemas/household.js";
import {
  choreIdParamSchema,
  choreListSchema,
  choreSchema,
  completeOccurrenceSchema,
  createChoreSchema,
  occurrenceIdParamSchema,
  occurrenceListSchema,
  occurrenceQuerySchema,
  occurrenceSchema,
  progressQuerySchema,
  progressSchema,
  reassignOccurrenceSchema,
  updateChoreSchema,
} from "../schemas/chores.js";
import {
  choreProgress,
  completeOccurrence,
  createChore,
  deleteChore,
  listChores,
  listOccurrences,
  reassignOccurrence,
  skipOccurrence,
  undoOccurrence,
  updateChore,
} from "../services/chores.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["chores"];
const occurrenceResponse = { 200: { description: "Updated occurrence", content: json(occurrenceSchema) } };

const listRoute = createRoute({
  method: "get",
  path: "/chores",
  tags,
  summary: "List chore templates (including archived)",
  responses: { 200: { description: "Chores", content: json(choreListSchema) } },
});

const createChoreRoute = createRoute({
  method: "post",
  path: "/chores",
  tags,
  summary: "Create a chore",
  request: { body: { content: json(createChoreSchema), required: true } },
  responses: { 201: { description: "Created chore", content: json(choreSchema) } },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/chores/{id}",
  tags,
  summary: "Update or archive a chore (history is preserved)",
  request: { params: choreIdParamSchema, body: { content: json(updateChoreSchema), required: true } },
  responses: { 200: { description: "Updated chore", content: json(choreSchema) } },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/chores/{id}",
  tags,
  summary: "Delete a chore and its history",
  request: { params: choreIdParamSchema },
  responses: { 200: { description: "Deleted", content: json(deleteResultSchema) } },
});

const occurrencesRoute = createRoute({
  method: "get",
  path: "/chore-occurrences",
  tags,
  summary: "Occurrences due in a date range (materialized on demand)",
  request: { query: occurrenceQuerySchema },
  responses: { 200: { description: "Occurrences", content: json(occurrenceListSchema) } },
});

const progressRoute = createRoute({
  method: "get",
  path: "/chore-occurrences/progress",
  tags,
  summary: "Per-member done/total for a date",
  request: { query: progressQuerySchema },
  responses: { 200: { description: "Progress per member", content: json(progressSchema) } },
});

const completeRoute = createRoute({
  method: "post",
  path: "/chore-occurrences/{id}/complete",
  tags,
  summary: "Mark an occurrence done (credit to completedBy)",
  request: { params: occurrenceIdParamSchema, body: { content: json(completeOccurrenceSchema), required: true } },
  responses: occurrenceResponse,
});

const undoRoute = createRoute({
  method: "post",
  path: "/chore-occurrences/{id}/undo",
  tags,
  summary: "Reopen a done or skipped occurrence",
  request: { params: occurrenceIdParamSchema },
  responses: occurrenceResponse,
});

const skipRoute = createRoute({
  method: "post",
  path: "/chore-occurrences/{id}/skip",
  tags,
  summary: "Skip an open occurrence",
  request: { params: occurrenceIdParamSchema },
  responses: occurrenceResponse,
});

const reassignRoute = createRoute({
  method: "post",
  path: "/chore-occurrences/{id}/reassign",
  tags,
  summary: "Override the assignee of one open occurrence",
  request: { params: occurrenceIdParamSchema, body: { content: json(reassignOccurrenceSchema), required: true } },
  responses: occurrenceResponse,
});

export function registerChoreRoutes(app: ApiApp): void {
  app.openapi(listRoute, (c) => c.json(listChores(c.var.ctx), 200));
  app.openapi(createChoreRoute, (c) => c.json(createChore(c.var.ctx, c.req.valid("json")), 201));
  app.openapi(patchRoute, (c) => c.json(updateChore(c.var.ctx, c.req.valid("param").id, c.req.valid("json")), 200));
  app.openapi(deleteRoute, (c) => c.json(deleteChore(c.var.ctx, c.req.valid("param").id), 200));

  // Static `progress` before the `{id}` routes.
  app.openapi(progressRoute, (c) => c.json(choreProgress(c.var.ctx, c.req.valid("query").date), 200));
  app.openapi(occurrencesRoute, (c) => {
    const q = c.req.valid("query");
    return c.json(
      listOccurrences(c.var.ctx, { from: q.from, to: q.to, member: q.member, carryover: q.carryover === "true" }),
      200,
    );
  });
  app.openapi(completeRoute, (c) =>
    c.json(completeOccurrence(c.var.ctx, c.req.valid("param").id, c.req.valid("json").completedBy), 200),
  );
  app.openapi(undoRoute, (c) => c.json(undoOccurrence(c.var.ctx, c.req.valid("param").id), 200));
  app.openapi(skipRoute, (c) => c.json(skipOccurrence(c.var.ctx, c.req.valid("param").id), 200));
  app.openapi(reassignRoute, (c) =>
    c.json(reassignOccurrence(c.var.ctx, c.req.valid("param").id, c.req.valid("json").memberId), 200),
  );
}
