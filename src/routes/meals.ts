import { createRoute } from "@hono/zod-openapi";
import {
  mealsCurrentSchema,
  mealsStatusSchema,
  mealsTestResultSchema,
} from "../schemas/meals.js";
import { getCurrentMeals, getMealsStatus, testPantryPal } from "../services/meals.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["meals"];

const currentRoute = createRoute({
  method: "get",
  path: "/meals/current",
  tags,
  summary: "This week's meals from PantryPal",
  description:
    "Server-to-server read of PantryPal `GET /api/v1/plans/current`, normalized to days × meals. Cached for 5 minutes; the last good response is served (stale: true) when PantryPal is unreachable. Recipe URLs deep-link into the PantryPal web app. 404 when the module is disabled; 503 when PantryPal is not configured or unreachable.",
  responses: {
    200: { description: "Current week", content: json(mealsCurrentSchema) },
    404: { description: "Meals module disabled" },
    503: { description: "PantryPal not configured or unreachable and no cached response" },
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/meals/status",
  tags,
  summary: "PantryPal configuration status",
  description: "Environment configuration for the Meals module (no network call).",
  responses: { 200: { description: "Status", content: json(mealsStatusSchema) } },
});

const testRoute = createRoute({
  method: "post",
  path: "/meals/test",
  tags,
  summary: "Test the connection to PantryPal",
  description: "Fetches the current plan once, bypassing the cache. Never fails: the result is in the body.",
  responses: { 200: { description: "Reachability result", content: json(mealsTestResultSchema) } },
});

export function registerMealsRoutes(app: ApiApp): void {
  app.openapi(currentRoute, async (c) => c.json(await getCurrentMeals(c.var.ctx), 200));
  app.openapi(statusRoute, (c) => c.json(getMealsStatus(c.var.ctx), 200));
  app.openapi(testRoute, async (c) => c.json(await testPantryPal(), 200));
}
