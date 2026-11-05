import { z } from "zod";
import { AppError } from "../lib/errors.js";
import type { WeatherDay, WeatherGroup, WeatherHour, WeatherUnits } from "../schemas/weather.js";

/** How long a successful Open-Meteo response is served before refetching. */
export const WEATHER_CACHE_TTL_MS = 15 * 60_000;

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

const WMO: Record<number, { label: string; group: WeatherGroup }> = {
  0: { label: "Clear", group: "clear" },
  1: { label: "Mainly clear", group: "mainly_clear" },
  2: { label: "Partly cloudy", group: "partly_cloudy" },
  3: { label: "Overcast", group: "overcast" },
  45: { label: "Fog", group: "fog" },
  48: { label: "Rime fog", group: "fog" },
  51: { label: "Light drizzle", group: "drizzle" },
  53: { label: "Drizzle", group: "drizzle" },
  55: { label: "Heavy drizzle", group: "drizzle" },
  56: { label: "Freezing drizzle", group: "drizzle" },
  57: { label: "Heavy freezing drizzle", group: "drizzle" },
  61: { label: "Light rain", group: "rain" },
  63: { label: "Rain", group: "rain" },
  65: { label: "Heavy rain", group: "rain" },
  66: { label: "Freezing rain", group: "rain" },
  67: { label: "Heavy freezing rain", group: "rain" },
  71: { label: "Light snow", group: "snow" },
  73: { label: "Snow", group: "snow" },
  75: { label: "Heavy snow", group: "snow" },
  77: { label: "Snow grains", group: "snow" },
  80: { label: "Light showers", group: "showers" },
  81: { label: "Showers", group: "showers" },
  82: { label: "Heavy showers", group: "showers" },
  85: { label: "Snow showers", group: "snow_showers" },
  86: { label: "Heavy snow showers", group: "snow_showers" },
  95: { label: "Thunderstorm", group: "thunderstorm" },
  96: { label: "Thunderstorm with hail", group: "thunderstorm" },
  99: { label: "Severe thunderstorm with hail", group: "thunderstorm" },
};

/** WMO interpretation code → human label + icon family. Unknown codes fall back to `unknown`. */
export function describeWmo(code: number): { label: string; group: WeatherGroup } {
  return WMO[code] ?? { label: "Unknown", group: "unknown" };
}

export interface WeatherRequest {
  latitude: number;
  longitude: number;
  units: WeatherUnits;
  /** IANA zone used to group the daily forecast (household time zone). */
  timezone: string;
  place: string | null;
}

export interface WeatherCurrent {
  temperature: number;
  code: number;
  label: string;
  group: WeatherGroup;
  isDay: boolean;
}

export interface WeatherPayload {
  latitude: number;
  longitude: number;
  timezone: string;
  units: WeatherUnits;
  place: string | null;
  current: WeatherCurrent;
  today: WeatherDay;
  days: WeatherDay[];
  hours: WeatherHour[];
  fetchedAt: string;
  stale: boolean;
}

interface CacheEntry {
  payload: WeatherPayload;
  fetchedAtMs: number;
}

/** In-memory cache keyed by location + units + forecast zone (SPEC §6: 15 min). */
const cache = new Map<string, CacheEntry>();

/** Test hook: drop all cached forecasts. */
export function clearWeatherCache(): void {
  cache.clear();
}

export interface WeatherDeps {
  /** Epoch milliseconds; tests inject a clock to exercise the TTL. */
  now?: () => number;
  fetch?: typeof fetch;
}

function cacheKey(req: WeatherRequest): string {
  return `${req.latitude},${req.longitude},${req.units},${req.timezone}`;
}

const openMeteoSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  current: z.object({
    time: z.string().optional(),
    temperature_2m: z.number(),
    weather_code: z.number(),
    is_day: z.number().optional(),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }),
  hourly: z
    .object({
      time: z.array(z.string()),
      temperature_2m: z.array(z.number()).optional(),
      weather_code: z.array(z.number()).optional(),
      precipitation_probability: z.array(z.number().nullable()).optional(),
      is_day: z.array(z.number()).optional(),
    })
    .optional(),
});

function buildUrl(req: WeatherRequest): URL {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", String(req.latitude));
  url.searchParams.set("longitude", String(req.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("hourly", "temperature_2m,weather_code,precipitation_probability,is_day");
  url.searchParams.set("timezone", req.timezone);
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  url.searchParams.set("temperature_unit", req.units === "fahrenheit" ? "fahrenheit" : "celsius");
  return url;
}

/** Next 24 hourly entries, starting at the current hour in the forecast zone. */
function buildHours(data: z.infer<typeof openMeteoSchema>): WeatherHour[] {
  const hourly = data.hourly;
  if (!hourly) return [];
  const currentHour = data.current.time?.slice(0, 13);
  let start = 0;
  if (currentHour) {
    const index = hourly.time.findIndex((time) => time.slice(0, 13) >= currentHour);
    if (index >= 0) start = index;
  }
  return hourly.time.slice(start, start + 24).map((time, offset) => {
    const i = start + offset;
    const code = hourly.weather_code?.[i] ?? 0;
    const { label, group } = describeWmo(code);
    return {
      time,
      code,
      label,
      group,
      temperature: hourly.temperature_2m?.[i] ?? 0,
      isDay: (hourly.is_day?.[i] ?? 1) === 1,
      precipProbability: hourly.precipitation_probability?.[i] ?? null,
    };
  });
}

async function fetchForecast(req: WeatherRequest, fetchImpl: typeof fetch): Promise<Omit<WeatherPayload, "fetchedAt" | "stale">> {
  const response = await fetchImpl(buildUrl(req), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);

  const parsed = openMeteoSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Open-Meteo returned an unexpected payload");
  const data = parsed.data;

  const days: WeatherDay[] = data.daily.time.map((date, i) => {
    const code = data.daily.weather_code[i] ?? 0;
    const { label, group } = describeWmo(code);
    return {
      date,
      code,
      label,
      group,
      high: data.daily.temperature_2m_max[i] ?? 0,
      low: data.daily.temperature_2m_min[i] ?? 0,
      precipProbability: data.daily.precipitation_probability_max?.[i] ?? null,
    };
  });
  const today = days[0];
  if (!today) throw new Error("Open-Meteo returned no forecast days");

  const currentCode = data.current.weather_code;
  const current = describeWmo(currentCode);

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone ?? req.timezone,
    units: req.units,
    place: req.place,
    current: {
      temperature: data.current.temperature_2m,
      code: currentCode,
      label: current.label,
      group: current.group,
      isDay: (data.current.is_day ?? 1) === 1,
    },
    today,
    days,
    hours: buildHours(data),
  };
}

/**
 * Current conditions, a 5-day daily forecast and the next 24 hours from Open-Meteo (no API key).
 *
 * Successful payloads are cached for 15 minutes. When upstream fails and an expired
 * entry exists, the cached payload is returned with `stale: true`; with no cache at
 * all this throws `AppError("unavailable")` (HTTP 503).
 */
export async function getWeather(req: WeatherRequest, deps: WeatherDeps = {}): Promise<WeatherPayload> {
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const key = cacheKey(req);
  const cached = cache.get(key);

  if (cached && now() - cached.fetchedAtMs < WEATHER_CACHE_TTL_MS) {
    return { ...cached.payload, stale: false, place: req.place };
  }

  try {
    const fresh = await fetchForecast(req, fetchImpl);
    const payload: WeatherPayload = { ...fresh, fetchedAt: new Date(now()).toISOString(), stale: false };
    cache.set(key, { payload, fetchedAtMs: now() });
    return payload;
  } catch (error) {
    if (cached) return { ...cached.payload, stale: true, place: req.place };
    throw new AppError("unavailable", "Weather is unavailable right now.", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
