import { z } from "@hono/zod-openapi";

/** Condition families the web maps to icons; `is_day` picks sun vs moon variants. */
export const weatherGroupSchema = z
  .enum([
    "clear",
    "mainly_clear",
    "partly_cloudy",
    "overcast",
    "fog",
    "drizzle",
    "rain",
    "snow",
    "showers",
    "snow_showers",
    "thunderstorm",
    "unknown",
  ])
  .openapi("WeatherGroup");

export const weatherUnitsSchema = z.enum(["celsius", "fahrenheit"]).openapi("WeatherUnits");

/** Settings > Weather (used by `services/weather.ts`). The enable flag is `settings.modules.weather`. */
export const weatherSettingsSchema = z
  .object({
    latitude: z.number().min(-90).max(90).nullable().describe("Null until a location is set."),
    longitude: z.number().min(-180).max(180).nullable().describe("Null until a location is set."),
    units: weatherUnitsSchema,
    place: z.string().max(80).nullable().describe("Optional label shown next to the forecast."),
  })
  .openapi("WeatherSettings");

export const weatherDaySchema = z
  .object({
    date: z.string().describe("YYYY-MM-DD in the household time zone."),
    code: z.number().int().describe("WMO weather interpretation code."),
    label: z.string(),
    group: weatherGroupSchema,
    high: z.number(),
    low: z.number(),
    precipProbability: z.number().nullable(),
  })
  .openapi("WeatherDay");

export const weatherCurrentSchema = z
  .object({
    temperature: z.number(),
    code: z.number().int(),
    label: z.string(),
    group: weatherGroupSchema,
    isDay: z.boolean(),
  })
  .openapi("WeatherCurrent");

export const weatherHourSchema = z
  .object({
    time: z.string().describe("Local wall time (YYYY-MM-DDTHH:00) in the household time zone."),
    code: z.number().int().describe("WMO weather interpretation code."),
    label: z.string(),
    group: weatherGroupSchema,
    temperature: z.number(),
    isDay: z.boolean(),
    precipProbability: z.number().nullable(),
  })
  .openapi("WeatherHour");

export const weatherSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
    units: weatherUnitsSchema,
    place: z.string().nullable(),
    current: weatherCurrentSchema,
    today: weatherDaySchema,
    days: z.array(weatherDaySchema).describe("Five days, starting with today."),
    hours: z.array(weatherHourSchema).describe("Next 24 hours, starting with the current hour."),
    fetchedAt: z.string().describe("ISO instant the upstream data was fetched."),
    stale: z.boolean().describe("True when upstream failed and the last cached payload is being served."),
  })
  .openapi("Weather");

export const weatherErrorSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .openapi("WeatherError");

export type WeatherGroup = z.infer<typeof weatherGroupSchema>;
export type WeatherUnits = z.infer<typeof weatherUnitsSchema>;
export type WeatherDay = z.infer<typeof weatherDaySchema>;
export type WeatherHour = z.infer<typeof weatherHourSchema>;
export type Weather = z.infer<typeof weatherSchema>;
