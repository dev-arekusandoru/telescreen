import { createRoute, type RouteHandler } from "@hono/zod-openapi";
import type { AppEnv } from "../auth/middleware.js";
import { AppError } from "../lib/errors.js";
import { weatherErrorSchema, weatherSchema } from "../schemas/weather.js";
import { getHousehold } from "../services/households.js";
import { getSettings } from "../services/settings.js";
import { getWeather } from "../services/weather.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["weather"];

const getWeatherRoute = createRoute({
  method: "get",
  path: "/weather",
  tags,
  summary: "Current weather and a 5-day forecast",
  description:
    "Open-Meteo (no API key) for the location in Settings, in the household time zone. Cached 15 minutes; serves the last cached payload flagged `stale` when upstream fails.",
  responses: {
    200: { description: "Weather", content: json(weatherSchema) },
    503: {
      description: "Module disabled, no location configured, or upstream unreachable with no cache",
      content: json(weatherErrorSchema),
    },
  },
});

export const weatherHandler: RouteHandler<typeof getWeatherRoute, AppEnv> = async (c) => {
  const { db, householdId, now } = c.var.ctx;
  const settings = getSettings(db);

  if (!settings.modules.weather) throw new AppError("unavailable", "The Weather module is disabled.");
  const { latitude, longitude, units, place } = settings.weather;
  if (latitude === null || longitude === null) {
    throw new AppError("unavailable", "Set a weather location in Settings.");
  }

  const household = getHousehold(db, householdId);
  return c.json(
    await getWeather({ latitude, longitude, units, place, timezone: household.timezone }, { now: () => now().getTime() }),
    200,
  );
};

export function registerWeatherRoutes(app: ApiApp): void {
  app.openapi(getWeatherRoute, weatherHandler);
}
