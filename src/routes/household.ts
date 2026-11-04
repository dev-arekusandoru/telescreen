import { createRoute } from "@hono/zod-openapi";
import { householdSchema, updateHouseholdSchema } from "../schemas/household.js";
import { getHousehold, updateHousehold } from "../services/households.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const getRoute = createRoute({
  method: "get",
  path: "/household",
  tags: ["household"],
  summary: "Get the household",
  responses: { 200: { description: "Household", content: json(householdSchema) } },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/household",
  tags: ["household"],
  summary: "Update the household",
  request: { body: { content: json(updateHouseholdSchema), required: true } },
  responses: { 200: { description: "Updated household", content: json(householdSchema) } },
});

const view = (h: ReturnType<typeof getHousehold>) => ({
  id: h.id,
  name: h.name,
  timezone: h.timezone,
  weekStart: h.weekStart,
  themeDefault: h.themeDefault,
});

export function registerHouseholdRoutes(app: ApiApp): void {
  app.openapi(getRoute, (c) => c.json(view(getHousehold(c.var.ctx.db, c.var.ctx.householdId)), 200));
  app.openapi(patchRoute, (c) => c.json(view(updateHousehold(c.var.ctx, c.req.valid("json"))), 200));
}
