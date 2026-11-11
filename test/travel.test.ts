import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "../src/db/schema.js";
import type { Travel } from "../src/schemas/travel.js";
import { TRAVEL_CACHE_TTL_MS, clearTravelCache, getTravel, type TravelRequest } from "../src/services/travel.js";
import { makeTestApp } from "./helpers.js";

const REQUEST: TravelRequest = {
  home: "1 Home St",
  destinations: [
    { id: "d1", label: "Work", address: "2 Work Rd" },
    { id: "d2", label: "Gym", address: "3 Gym Ave" },
    { id: "d3", label: "Island", address: "Nowhere" },
  ],
};

/** Routes API omits proto3 defaults: index 0 and an OK status have no keys. Elements arrive unordered. */
const MATRIX = [
  { destinationIndex: 2, originIndex: 0, status: {}, condition: "ROUTE_NOT_FOUND" },
  { status: {}, condition: "ROUTE_EXISTS", duration: "1500s", staticDuration: "1200s" },
  { destinationIndex: 1, status: {}, condition: "ROUTE_EXISTS", duration: "600s", staticDuration: "610s" },
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => clearTravelCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getTravel", () => {
  it("maps matrix elements back to destinations, defaulting a missing index to 0", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(MATRIX));
    const result = await getTravel(REQUEST, { apiKey: "k", fetch: fetchMock as unknown as typeof fetch });

    expect(result.routes).toEqual([
      { id: "d1", label: "Work", address: "2 Work Rd", durationSeconds: 1500, staticDurationSeconds: 1200, error: null },
      { id: "d2", label: "Gym", address: "3 Gym Ave", durationSeconds: 600, staticDurationSeconds: 610, error: null },
      {
        id: "d3",
        label: "Island",
        address: "Nowhere",
        durationSeconds: null,
        staticDurationSeconds: null,
        error: "No driving route found",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("computeRouteMatrix");
    expect(new Headers(init.headers).get("X-Goog-Api-Key")).toBe("k");
    expect(JSON.parse(init.body as string)).toMatchObject({
      origins: [{ waypoint: { address: "1 Home St" } }],
      destinations: [{ waypoint: { address: "2 Work Rd" } }, { waypoint: { address: "3 Gym Ave" } }, { waypoint: { address: "Nowhere" } }],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    });
  });

  it("reports a per-element error status", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([{ status: { code: 3, message: "Address not geocoded" }, condition: "ROUTE_NOT_FOUND" }]),
    );
    const result = await getTravel(
      { home: "h", destinations: [REQUEST.destinations[0]!] },
      { apiKey: "k", fetch: fetchMock as unknown as typeof fetch },
    );
    expect(result.routes[0]).toMatchObject({ durationSeconds: null, error: "Address not geocoded" });
  });

  it("does not call Google without destinations", async () => {
    const fetchMock = vi.fn();
    const result = await getTravel({ home: "h", destinations: [] }, { apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    expect(result.routes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches for the TTL, then serves stale on upstream failure", async () => {
    let now = 1_000_000;
    const ok = vi.fn(async () => jsonResponse(MATRIX));
    await getTravel(REQUEST, { apiKey: "k", fetch: ok as unknown as typeof fetch, now: () => now });
    now += TRAVEL_CACHE_TTL_MS - 1;
    await getTravel(REQUEST, { apiKey: "k", fetch: ok as unknown as typeof fetch, now: () => now });
    expect(ok).toHaveBeenCalledTimes(1);

    now += 2;
    const down = vi.fn(async () => jsonResponse({ error: { message: "API key not valid" } }, 400));
    const stale = await getTravel(REQUEST, { apiKey: "k", fetch: down as unknown as typeof fetch, now: () => now });
    expect(down).toHaveBeenCalledTimes(1);
    expect(stale.stale).toBe(true);
    expect(stale.routes[0]?.durationSeconds).toBe(1500);
  });

  it("throws unavailable with the upstream message when nothing is cached", async () => {
    const down = vi.fn(async () => jsonResponse([{ error: { code: 400, message: "API key not valid" } }], 400));
    await expect(getTravel(REQUEST, { apiKey: "k", fetch: down as unknown as typeof fetch })).rejects.toMatchObject({
      code: "unavailable",
      details: { reason: "API key not valid" },
    });
  });
});

describe("GET /travel", () => {
  const enabled = { modules: { weather: false, meals: false, music: false, travel: true } };

  it("returns 503 until enabled, keyed and given a home address", async () => {
    const t = makeTestApp();
    const fetchMock = vi.fn(async () => jsonResponse(MATRIX));
    vi.stubGlobal("fetch", fetchMock);

    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    expect((await t.request("GET", "/api/v1/travel")).status).toBe(503);
    expect((await t.request<{ configured: boolean }>("GET", "/api/v1/travel/status")).body).toEqual({
      enabled: false,
      configured: false,
    });

    await t.request("PUT", "/api/v1/settings", enabled);
    const noKey = await t.request<{ error: { message: string } }>("GET", "/api/v1/travel");
    expect(noKey.status).toBe(503);
    expect(noKey.body.error.message).toContain("GOOGLE_MAPS_API_KEY");

    vi.stubEnv("GOOGLE_MAPS_API_KEY", "key");
    const noHome = await t.request<{ error: { message: string } }>("GET", "/api/v1/travel");
    expect(noHome.status).toBe(503);
    expect(noHome.body.error.message).toMatch(/home/i);
    expect(fetchMock).not.toHaveBeenCalled();

    const put = await t.request("PUT", "/api/v1/settings", { travel: REQUEST });
    expect(put.status).toBe(200);
    const res = await t.request<Travel>("GET", "/api/v1/travel");
    expect(res.status).toBe(200);
    expect(res.body.routes.map((r) => r.durationSeconds)).toEqual([1500, 600, null]);
  });

  it("keeps stored settings when an older modules row lacks the travel flag", async () => {
    const t = makeTestApp();
    await t.request("PUT", "/api/v1/settings", { weekMode: "fixed" });
    t.db
      .insert(settings)
      .values({ key: "modules", valueJson: JSON.stringify({ weather: true, meals: false, music: false }) })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson: JSON.stringify({ weather: true, meals: false, music: false }) } })
      .run();
    const got = await t.request<{ weekMode: string; modules: Record<string, boolean> }>("GET", "/api/v1/settings");
    expect(got.body.weekMode).toBe("fixed");
    expect(got.body.modules).toEqual({ weather: true, meals: false, music: false, travel: false });
  });

  it("rejects invalid destinations", async () => {
    const t = makeTestApp();
    const res = await t.request("PUT", "/api/v1/settings", {
      travel: { home: "h", destinations: [{ id: "x", label: "", address: "a" }] },
    });
    expect(res.status).toBe(400);
  });
});
