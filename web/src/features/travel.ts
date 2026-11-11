import { queryOptions, useQuery } from "@tanstack/react-query";
import { client, unwrap, type components } from "@/api";

export type Travel = components["schemas"]["Travel"];
export type TravelRoute = components["schemas"]["TravelRoute"];
export type TravelSettings = components["schemas"]["TravelSettings"];
export type TravelDestination = components["schemas"]["TravelDestination"];

/** The server caches 10 minutes (one billed Routes API matrix), so the client refetches on the same cadence. */
export const TRAVEL_REFETCH_MS = 10 * 60_000;

export const travelKeys = { travel: ["travel"] as const, status: ["travel", "status"] as const };

/** Driving times from home. `enabled` should be the `modules.travel` flag (disabled → 503). */
export const useTravel = (enabled: boolean) =>
  useQuery(
    queryOptions({
      queryKey: travelKeys.travel,
      queryFn: () => unwrap(client.GET("/travel")),
      enabled,
      staleTime: TRAVEL_REFETCH_MS,
      refetchInterval: TRAVEL_REFETCH_MS,
      retry: 1,
    }),
  );

export const useTravelStatus = () =>
  useQuery({ queryKey: travelKeys.status, queryFn: () => unwrap(client.GET("/travel/status")) });

/** 540 → "9 min", 4500 → "1 h 15 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

/** Whole minutes traffic adds over the free-flow time; 0 when negligible or unknown. */
export function trafficDelayMinutes(route: TravelRoute): number {
  if (route.durationSeconds === null || route.staticDurationSeconds === null) return 0;
  const delay = Math.round((route.durationSeconds - route.staticDurationSeconds) / 60);
  return delay >= 2 ? delay : 0;
}

/** Google Maps driving directions for one destination (universal URL, opens the app on phones). */
export function directionsUrl(home: string, address: string): string {
  const params = new URLSearchParams({ api: "1", origin: home, destination: address, travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Stable id for a new destination; `crypto.randomUUID` needs a secure context, which plain-HTTP dev lacks. */
export function newDestinationId(): string {
  return `dst_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
