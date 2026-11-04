import { createRoute } from "@hono/zod-openapi";
import {
  createMemberSchema,
  deleteResultSchema,
  memberIdParamSchema,
  memberListSchema,
  memberSchema,
  updateMemberSchema,
} from "../schemas/household.js";
import { createMember, deleteMember, listMembers, updateMember } from "../services/households.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["members"];

const listRoute = createRoute({
  method: "get",
  path: "/members",
  tags,
  summary: "List members",
  responses: { 200: { description: "Members ordered by sort", content: json(memberListSchema) } },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/members",
  tags,
  summary: "Create a member",
  request: { body: { content: json(createMemberSchema), required: true } },
  responses: { 201: { description: "Created member", content: json(memberSchema) } },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/members/{id}",
  tags,
  summary: "Update a member",
  request: { params: memberIdParamSchema, body: { content: json(updateMemberSchema), required: true } },
  responses: { 200: { description: "Updated member", content: json(memberSchema) } },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/members/{id}",
  tags,
  summary: "Delete a member",
  request: { params: memberIdParamSchema },
  responses: { 200: { description: "Deleted", content: json(deleteResultSchema) } },
});

export function registerMemberRoutes(app: ApiApp): void {
  app.openapi(listRoute, (c) => c.json(listMembers(c.var.ctx.db, c.var.ctx.householdId), 200));
  app.openapi(createRoute_, (c) => c.json(createMember(c.var.ctx, c.req.valid("json")), 201));
  app.openapi(patchRoute, (c) => c.json(updateMember(c.var.ctx, c.req.valid("param").id, c.req.valid("json")), 200));
  app.openapi(deleteRoute, (c) => c.json(deleteMember(c.var.ctx, c.req.valid("param").id), 200));
}
