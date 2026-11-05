import { createRoute } from "@hono/zod-openapi";
import {
  mealsCurrentSchema,
  mealsPlanQuerySchema,
  mealsPlanSchema,
  mealsStatusSchema,
  mealsTestResultSchema,
} from "../schemas/meals.js";
import { getCurrentMeals, getMealsPlan, getMealsStatus, testPantryPal } from "../services/meals.js";
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

const planRoute = createRoute({
  method: "get",
  path: "/meals/plan",
  tags,
  summary: "Meals planned in a date range",
  description:
    "Reads the PantryPal plans overlapping `[start, end)` (a rolling week can straddle two plan weeks) and returns their days merged and date-ordered, normalized like `/meals/current`. Cached for 5 minutes per range; the last good response is served (stale: true) when PantryPal is unreachable. Days without a plan are omitted, so an absent day is an empty day, not an error. 404 when the module is disabled; 503 when PantryPal is not configured or unreachable.",
  request: { query: mealsPlanQuerySchema },
  responses: {
    200: { description: "Planned days in the range", content: json(mealsPlanSchema) },
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
  app.openapi(planRoute, async (c) => {
    const { start, end } = c.req.valid("query");
    return c.json(await getMealsPlan(c.var.ctx, start, end), 200);
  });
  app.openapi(statusRoute, (c) => c.json(getMealsStatus(c.var.ctx), 200));
  app.openapi(testRoute, async (c) => c.json(await testPantryPal(), 200));
}
