import { createRoute } from "@hono/zod-openapi";
import { AppError } from "../lib/errors.js";
import { travelErrorSchema, travelSchema, travelStatusSchema } from "../schemas/travel.js";
import { getSettings } from "../services/settings.js";
import { getTravel, googleMapsApiKey } from "../services/travel.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["travel"];

const getTravelRoute = createRoute({
  method: "get",
  path: "/travel",
  tags,
  summary: "Driving times from home to each saved destination",
  description:
    "Google Routes API (traffic-aware, driving) for the home address and destinations in Settings. Cached 10 minutes; serves the last cached payload flagged `stale` when upstream fails.",
  responses: {
    200: { description: "Travel times", content: json(travelSchema) },
    503: {
      description: "Module disabled, GOOGLE_MAPS_API_KEY unset, no home address, or upstream unreachable with no cache",
      content: json(travelErrorSchema),
    },
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/travel/status",
  tags,
  summary: "Travel module configuration status",
  description: "Whether the module is enabled and GOOGLE_MAPS_API_KEY is set (no network call).",
  responses: { 200: { description: "Status", content: json(travelStatusSchema) } },
});

export function registerTravelRoutes(app: ApiApp): void {
  app.openapi(getTravelRoute, async (c) => {
    const { db, now } = c.var.ctx;
    const settings = getSettings(db);
    if (!settings.modules.travel) throw new AppError("unavailable", "The Travel module is disabled.");
    const apiKey = googleMapsApiKey();
    if (!apiKey) throw new AppError("unavailable", "Travel is not configured: set GOOGLE_MAPS_API_KEY.");
    const { home, destinations } = settings.travel;
    if (home === null) throw new AppError("unavailable", "Set a home address in Settings.");
    return c.json(await getTravel({ home, destinations }, { apiKey, now: () => now().getTime() }), 200);
  });
  app.openapi(statusRoute, (c) =>
    c.json({ enabled: getSettings(c.var.ctx.db).modules.travel, configured: googleMapsApiKey() !== null }, 200),
  );
}
