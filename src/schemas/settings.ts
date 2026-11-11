import { z } from "@hono/zod-openapi";
import { musicItemSchema } from "./music.js";
import { travelSettingsSchema } from "./travel.js";
import { weatherSettingsSchema } from "./weather.js";

export const modulesSchema = z
  .object({
    weather: z.boolean(),
    meals: z.boolean(),
    music: z.boolean(),
    travel: z.boolean(),
  })
  .openapi("ModuleFlags");

/**
 * Typed settings (stored one key per row in `setting`). To add a key: add it here,
 * to `SETTING_DEFAULTS`, and nothing else; GET/PUT pick it up.
 */
export const settingsSchema = z
  .object({
    weekMode: z.enum(["rolling", "fixed"]).describe("rolling = 7 days starting today; fixed = week per household weekStart."),
    idleReturnMinutes: z.number().int().min(0).max(240).describe("Idle minutes before returning to today in the selected view; 0 disables."),
    syncIntervalMinutes: z.number().int().min(1).max(1440).describe("Calendar poll interval."),
    keepAwake: z.boolean().describe("Request the screen wake lock while the app is visible."),
    seasonalDecor: z.boolean().describe("Show seasonal decoration (falling leaves and similar) during holidays and seasons."),
    modules: modulesSchema.describe("Optional module flags; disabled modules are hidden from navigation."),
    defaultWriteCalendarId: z
      .record(z.string(), z.string().nullable())
      .describe("Member id → default calendar id for new events (null = none)."),
    weather: weatherSettingsSchema.describe("Location and units for the Weather module."),
    musicPins: z.array(musicItemSchema).max(6).describe("Albums/playlists pinned on the Music page (snapshot of title and art)."),
    travel: travelSettingsSchema.describe("Home address and destinations for the Travel module."),
  })
  .openapi("Settings");

export type Settings = z.infer<typeof settingsSchema>;

export const SETTING_DEFAULTS: Settings = {
  weekMode: "rolling",
  idleReturnMinutes: 2,
  syncIntervalMinutes: 5,
  keepAwake: true,
  seasonalDecor: true,
  modules: { weather: false, meals: false, music: false, travel: false },
  defaultWriteCalendarId: {},
  weather: { latitude: null, longitude: null, units: "celsius", place: null, showUv: false },
  musicPins: [],
  travel: { home: null, destinations: [] },
};

/** PUT body: any subset of keys; `modules` and `defaultWriteCalendarId` are replaced as given. */
export const updateSettingsSchema = settingsSchema.partial().openapi("UpdateSettingsInput");
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
