import { z } from "@hono/zod-openapi";

/** Routes API allows 50 elements per matrix request with address waypoints; one origin keeps us far below. */
export const MAX_TRAVEL_DESTINATIONS = 20;

/** Curated icon keys; the web maps each to a glyph. */
export const TRAVEL_ICONS = ["pin", "home", "work", "school", "shop", "airport", "gym"] as const;

export const travelDestinationSchema = z
  .object({
    id: z.string().min(1).max(40).describe("Client-generated stable id."),
    label: z.string().trim().min(1).max(40).describe('Short name shown in the widget, e.g. "Work".'),
    address: z.string().trim().min(1).max(200).describe("Free-text address; Google resolves it."),
    icon: z.enum(TRAVEL_ICONS).default("pin").describe("Glyph shown beside the label."),
    memberId: z.string().nullable().default(null).describe("Whose destination this is (tints the icon); null = neutral."),
  })
  .openapi("TravelDestination");

/** Settings > Travel (used by `services/travel.ts`). The enable flag is `settings.modules.travel`. */
export const travelSettingsSchema = z
  .object({
    home: z.string().trim().min(1).max(200).nullable().describe("Starting address for every route; null until set."),
    destinations: z.array(travelDestinationSchema).max(MAX_TRAVEL_DESTINATIONS),
  })
  .openapi("TravelSettings");

export const travelRouteSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    address: z.string(),
    durationSeconds: z.number().int().nullable().describe("Driving time with current traffic; null when no route."),
    staticDurationSeconds: z.number().int().nullable().describe("Driving time without traffic; null when no route."),
    error: z.string().nullable().describe("Why no route is available for this destination."),
  })
  .openapi("TravelRoute");

export const travelSchema = z
  .object({
    home: z.string(),
    routes: z.array(travelRouteSchema).describe("One entry per configured destination, in settings order."),
    fetchedAt: z.string().describe("ISO instant the upstream data was fetched."),
    stale: z.boolean().describe("True when upstream failed and the last cached payload is being served."),
  })
  .openapi("Travel");

export const travelStatusSchema = z
  .object({
    enabled: z.boolean().describe("Settings > Modules > Travel."),
    configured: z.boolean().describe("GOOGLE_MAPS_API_KEY is set."),
  })
  .openapi("TravelStatus");

export const travelErrorSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .openapi("TravelError");

export type TravelSettings = z.infer<typeof travelSettingsSchema>;
export type TravelRoute = z.infer<typeof travelRouteSchema>;
export type Travel = z.infer<typeof travelSchema>;
export type TravelStatus = z.infer<typeof travelStatusSchema>;
