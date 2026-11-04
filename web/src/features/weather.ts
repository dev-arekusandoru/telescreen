import { queryOptions, useQuery } from "@tanstack/react-query";
import { client, unwrap, type components } from "@/api";

export type Weather = components["schemas"]["Weather"];
export type WeatherDay = Weather["days"][number];
export type WeatherSettings = components["schemas"]["WeatherSettings"];
export type WeatherUnits = WeatherSettings["units"];

/** SPEC §6: the server caches 15 minutes, so the client refetches on the same cadence. */
export const WEATHER_REFETCH_MS = 15 * 60_000;

export const weatherKeys = { weather: ["weather"] as const };

/**
 * Current weather + 5-day forecast. `enabled` should be the `modules.weather` flag:
 * a disabled module makes `GET /weather` answer 503 and the UI renders nothing.
 */
export function weatherQuery(enabled: boolean) {
  return queryOptions({
    queryKey: weatherKeys.weather,
    queryFn: () => unwrap(client.GET("/weather")),
    enabled,
    staleTime: WEATHER_REFETCH_MS,
    refetchInterval: WEATHER_REFETCH_MS,
    retry: 1,
  });
}

export const useWeather = (enabled = true) => useQuery(weatherQuery(enabled));

/** "°C" / "°F" for the configured units. */
export const unitSuffix = (units: WeatherUnits) => (units === "fahrenheit" ? "°F" : "°C");

/** Rounded degrees for display (the API sends one decimal). */
export const degrees = (value: number) => `${Math.round(value)}°`;
