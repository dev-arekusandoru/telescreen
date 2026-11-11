import { z } from "zod";
import { AppError } from "../lib/errors.js";
import type { Travel, TravelRoute, TravelSettings } from "../schemas/travel.js";

/** How long a successful Routes API response is served before refetching (one billed matrix per 10 min). */
export const TRAVEL_CACHE_TTL_MS = 10 * 60_000;

const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const FIELD_MASK = "originIndex,destinationIndex,status,condition,duration,staticDuration";
const REQUEST_TIMEOUT_MS = 10_000;

/** `GOOGLE_MAPS_API_KEY` from the environment, or null when unset. */
export function googleMapsApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

export interface TravelRequest {
  home: string;
  destinations: TravelSettings["destinations"];
}

export interface TravelDeps {
  apiKey: string;
  /** Epoch milliseconds; tests inject a clock to exercise the TTL. */
  now?: () => number;
  fetch?: typeof fetch;
}

interface CacheEntry {
  payload: Travel;
  fetchedAtMs: number;
}

/** In-memory cache keyed by home + destinations (ids, labels and addresses). */
const cache = new Map<string, CacheEntry>();

/** Test hook: drop all cached matrices. */
export function clearTravelCache(): void {
  cache.clear();
}

/** Proto3 JSON omits zero/default fields: index 0 and an OK status arrive as absent keys. */
const matrixSchema = z.array(
  z.object({
    destinationIndex: z.number().int().optional(),
    status: z.object({ code: z.number().optional(), message: z.string().optional() }).optional(),
    condition: z.string().optional(),
    duration: z.string().optional(),
    staticDuration: z.string().optional(),
  }),
);

const upstreamErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** "1234s" → 1234; anything else → null. */
function parseSeconds(value: string | undefined): number | null {
  const match = value ? /^(\d+(?:\.\d+)?)s$/.exec(value) : null;
  return match ? Math.round(Number(match[1])) : null;
}

async function fetchMatrix(req: TravelRequest, apiKey: string, fetchImpl: typeof fetch): Promise<TravelRoute[]> {
  const response = await fetchImpl(ROUTE_MATRIX_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      origins: [{ waypoint: { address: req.home } }],
      destinations: req.destinations.map((d) => ({ waypoint: { address: d.address } })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // The matrix endpoint streams a JSON array, so errors usually arrive as `[{ error }]`.
    const upstream = upstreamErrorSchema.safeParse(Array.isArray(body) ? body[0] : body);
    throw new Error(upstream.success ? upstream.data.error.message : `Routes API responded ${response.status}`);
  }

  const parsed = matrixSchema.safeParse(body);
  if (!parsed.success) throw new Error("Routes API returned an unexpected payload");
  const byIndex = new Map(parsed.data.map((element) => [element.destinationIndex ?? 0, element]));

  return req.destinations.map((destination, i): TravelRoute => {
    const element = byIndex.get(i);
    const base = { id: destination.id, label: destination.label, address: destination.address };
    const failed = (error: string): TravelRoute => ({ ...base, durationSeconds: null, staticDurationSeconds: null, error });

    if (!element) return failed("No result from Google");
    if (element.status?.code) return failed(element.status.message || "Google could not route this address");
    if (element.condition !== "ROUTE_EXISTS") return failed("No driving route found");
    const durationSeconds = parseSeconds(element.duration);
    if (durationSeconds === null) return failed("No driving route found");
    return { ...base, durationSeconds, staticDurationSeconds: parseSeconds(element.staticDuration), error: null };
  });
}

/**
 * Traffic-aware driving times from `home` to every destination via the Google Routes API
 * (`computeRouteMatrix`, one request per refresh).
 *
 * Successful payloads are cached for 10 minutes. When upstream fails and an expired entry
 * exists, it is returned with `stale: true`; with no cache this throws `AppError("unavailable")`.
 */
export async function getTravel(req: TravelRequest, deps: TravelDeps): Promise<Travel> {
  const now = deps.now ?? Date.now;
  if (req.destinations.length === 0) {
    return { home: req.home, routes: [], fetchedAt: new Date(now()).toISOString(), stale: false };
  }

  const key = JSON.stringify(req);
  const cached = cache.get(key);
  if (cached && now() - cached.fetchedAtMs < TRAVEL_CACHE_TTL_MS) return cached.payload;

  try {
    const routes = await fetchMatrix(req, deps.apiKey, deps.fetch ?? globalThis.fetch);
    const payload: Travel = { home: req.home, routes, fetchedAt: new Date(now()).toISOString(), stale: false };
    cache.set(key, { payload, fetchedAtMs: now() });
    return payload;
  } catch (error) {
    if (cached) return { ...cached.payload, stale: true };
    throw new AppError("unavailable", "Travel times are unavailable right now.", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
