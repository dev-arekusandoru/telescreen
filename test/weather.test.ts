import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEATHER_CACHE_TTL_MS,
  clearWeatherCache,
  describeWmo,
  getWeather,
  type WeatherPayload,
  type WeatherRequest,
} from "../src/services/weather.js";
import { makeTestApp } from "./helpers.js";

const REQUEST: WeatherRequest = {
  latitude: 52.52,
  longitude: 13.41,
  units: "celsius",
  timezone: "Europe/Berlin",
  place: "Berlin",
};

const HOURLY_TIME = Array.from({ length: 48 }, (_, i) =>
  new Date(Date.UTC(2026, 10, 3, 0, 0, 0) + i * 3_600_000).toISOString().slice(0, 16),
);

const FORECAST = {
  latitude: 52.52,
  longitude: 13.41,
  timezone: "Europe/Berlin",
  current: {
    time: "2026-11-03T12:00",
    interval: 900,
    temperature_2m: 8.4,
    weather_code: 3,
    is_day: 1,
  },
  daily: {
    time: ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"],
    weather_code: [3, 61, 0, 71, 95],
    temperature_2m_max: [11.2, 9.6, 12.1, 2.4, 8.0],
    temperature_2m_min: [4.1, 5.2, 3.4, -1.2, 2.1],
    precipitation_probability_max: [20, 80, 0, 60, null],
  },
  hourly: {
    time: HOURLY_TIME,
    temperature_2m: HOURLY_TIME.map((_, i) => 6 + i * 0.1),
    weather_code: HOURLY_TIME.map((_, i) => (i % 3 === 0 ? 0 : 3)),
    precipitation_probability: HOURLY_TIME.map((_, i) => (i % 4 === 0 ? 25 : 0)),
    is_day: HOURLY_TIME.map((_, i) => (i >= 8 && i < 18 ? 1 : 0)),
    uv_index: HOURLY_TIME.map((_, i) => (i === 12 ? 3.4 : 0)),
  },
};

function forecastFetch(): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(FORECAST), { status: 200, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  clearWeatherCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WMO code mapping", () => {
  it("maps representative codes to labels and icon families", () => {
    expect(describeWmo(0)).toEqual({ label: "Clear", group: "clear" });
    expect(describeWmo(2)).toEqual({ label: "Partly cloudy", group: "partly_cloudy" });
    expect(describeWmo(3)).toEqual({ label: "Overcast", group: "overcast" });
    expect(describeWmo(45)).toEqual({ label: "Fog", group: "fog" });
    expect(describeWmo(55)).toEqual({ label: "Heavy drizzle", group: "drizzle" });
    expect(describeWmo(63)).toEqual({ label: "Rain", group: "rain" });
    expect(describeWmo(75)).toEqual({ label: "Heavy snow", group: "snow" });
    expect(describeWmo(82)).toEqual({ label: "Heavy showers", group: "showers" });
    expect(describeWmo(86)).toEqual({ label: "Heavy snow showers", group: "snow_showers" });
    expect(describeWmo(96)).toEqual({ label: "Thunderstorm with hail", group: "thunderstorm" });
  });

  it("falls back for codes Open-Meteo does not document", () => {
    expect(describeWmo(42)).toEqual({ label: "Unknown", group: "unknown" });
  });
});

describe("getWeather", () => {
  it("returns current conditions and five days mapped from the upstream payload", async () => {
    const clock = { ms: Date.parse("2026-11-03T12:00:00.000Z") };
    const payload = await getWeather(REQUEST, { now: () => clock.ms, fetch: forecastFetch() });

    expect(payload.current).toEqual({
      temperature: 8.4,
      code: 3,
      label: "Overcast",
      group: "overcast",
      isDay: true,
    });
    expect(payload.today).toMatchObject({ date: "2026-11-03", high: 11.2, low: 4.1, precipProbability: 20 });
    expect(payload.days).toHaveLength(5);
    expect(payload.days[4]).toMatchObject({ code: 95, group: "thunderstorm", precipProbability: null });
    expect(payload.place).toBe("Berlin");
    expect(payload.stale).toBe(false);
    expect(payload.fetchedAt).toBe("2026-11-03T12:00:00.000Z");
  });

  it("parses the next 24 hours starting at the current hour", async () => {
    const fetchMock = forecastFetch();
    const payload = await getWeather(REQUEST, { now: () => Date.parse("2026-11-03T12:00:00.000Z"), fetch: fetchMock });

    const url = new URL(String(vi.mocked(fetchMock).mock.calls[0]?.[0]));
    expect(url.searchParams.get("hourly")).toBe("temperature_2m,weather_code,precipitation_probability,is_day,uv_index");

    expect(payload.hours).toHaveLength(24);
    expect(payload.hours[0]).toEqual({
      time: "2026-11-03T12:00",
      code: 0,
      label: "Clear",
      group: "clear",
      temperature: 7.2,
      isDay: true,
      precipProbability: 25,
      uvIndex: 3.4,
    });
    expect(payload.hours[23]).toMatchObject({ time: "2026-11-04T11:00", code: 3, isDay: false, precipProbability: 0 });
  });

  it("serves the cache for 15 minutes and refetches after the TTL", async () => {
    const clock = { ms: Date.parse("2026-11-03T12:00:00.000Z") };
    const fetchMock = forecastFetch();

    await getWeather(REQUEST, { now: () => clock.ms, fetch: fetchMock });
    clock.ms += WEATHER_CACHE_TTL_MS - 1;
    await getWeather(REQUEST, { now: () => clock.ms, fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock.ms += 2;
    await getWeather(REQUEST, { now: () => clock.ms, fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keys the cache by location, units and time zone", async () => {
    const clock = { ms: Date.parse("2026-11-03T12:00:00.000Z") };
    const fetchMock = forecastFetch();
    await getWeather(REQUEST, { now: () => clock.ms, fetch: fetchMock });
    await getWeather({ ...REQUEST, units: "fahrenheit" }, { now: () => clock.ms, fetch: fetchMock });
    await getWeather({ ...REQUEST, latitude: 48.85 }, { now: () => clock.ms, fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("serves the stale cached payload when upstream fails, then recovers", async () => {
    const clock = { ms: Date.parse("2026-11-03T12:00:00.000Z") };
    const good = await getWeather(REQUEST, { now: () => clock.ms, fetch: forecastFetch() });

    clock.ms += WEATHER_CACHE_TTL_MS + 1;
    const failing = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;
    const stale = await getWeather(REQUEST, { now: () => clock.ms, fetch: failing });

    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(good.fetchedAt);
    expect(stale.current).toEqual(good.current);

    const recovered = await getWeather(REQUEST, { now: () => clock.ms, fetch: forecastFetch() });
    expect(recovered.stale).toBe(false);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("throws unavailable when upstream fails and nothing is cached", async () => {
    const failing = vi.fn(async () => new Response("boom", { status: 502 })) as unknown as typeof fetch;
    await expect(getWeather(REQUEST, { fetch: failing })).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });
});

describe("GET /weather", () => {
  const configured = {
    modules: { weather: true, meals: false, music: false, travel: false },
    weather: { latitude: 52.52, longitude: 13.41, units: "celsius", place: "Berlin" },
  };

  it("returns the forecast for the configured location", async () => {
    const t = makeTestApp();
    vi.stubGlobal("fetch", forecastFetch());
    await t.request("PUT", "/api/v1/settings", configured);

    const res = await t.request<WeatherPayload>("GET", "/api/v1/weather");
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe("Europe/Berlin");
    expect(res.body.current.temperature).toBe(8.4);
    expect(res.body.days).toHaveLength(5);
    expect(res.body.hours).toHaveLength(24);
    expect(res.body.stale).toBe(false);

    // Second request inside the TTL is served from cache.
    const again = await t.request<WeatherPayload>("GET", "/api/v1/weather");
    expect(again.status).toBe(200);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it("returns 503 when the module is disabled", async () => {
    const t = makeTestApp();
    const res = await t.request<{ error: { code: string } }>("GET", "/api/v1/weather");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("unavailable");
  });

  it("returns 503 when no location is set", async () => {
    const t = makeTestApp();
    await t.request("PUT", "/api/v1/settings", {
      modules: { weather: true, meals: false, music: false, travel: false },
    });
    const res = await t.request<{ error: { code: string; message: string } }>("GET", "/api/v1/weather");
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/location/i);
  });

  it("returns 503 when upstream is unreachable and nothing is cached", async () => {
    const t = makeTestApp();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await t.request("PUT", "/api/v1/settings", configured);
    const res = await t.request<{ error: { code: string } }>("GET", "/api/v1/weather");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("unavailable");
  });
});
