import { createRoute } from "@hono/zod-openapi";
import { settingsSchema, updateSettingsSchema } from "../schemas/settings.js";
import { getSettings, updateSettings } from "../services/settings.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["settings"];

const getRoute = createRoute({
  method: "get",
  path: "/settings",
  tags,
  summary: "Get settings",
  description: "All settings with defaults applied.",
  responses: { 200: { description: "Settings", content: json(settingsSchema) } },
});

const putRoute = createRoute({
  method: "put",
  path: "/settings",
  tags,
  summary: "Update settings",
  description: "Send any subset of keys; provided keys are replaced, omitted keys keep their value.",
  request: { body: { content: json(updateSettingsSchema), required: true } },
  responses: { 200: { description: "Resulting settings", content: json(settingsSchema) } },
});

export function registerSettingsRoutes(app: ApiApp): void {
  app.openapi(getRoute, (c) => c.json(getSettings(c.var.ctx.db), 200));
  app.openapi(putRoute, (c) => c.json(updateSettings(c.var.ctx.db, c.req.valid("json")), 200));
}
