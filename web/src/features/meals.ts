import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { client, unwrap, type components } from "@/api";

export type MealsCurrent = components["schemas"]["MealsCurrent"];
export type MealsPlan = components["schemas"]["MealsPlan"];
export type MealDay = components["schemas"]["MealDay"];
export type MealItem = components["schemas"]["MealItem"];
export type MealsStatus = components["schemas"]["MealsStatus"];
export type MealsTestResult = components["schemas"]["MealsTestResult"];

export const mealsKeys = {
  current: ["meals", "current"] as const,
  plan: (start: string, end: string) => ["meals", "plan", start, end] as const,
  status: ["meals", "status"] as const,
};

/** Current week as normalized by the server (cached there for 5 min; stale-on-error). */
export const mealsQuery = () =>
  queryOptions({
    queryKey: mealsKeys.current,
    queryFn: () => unwrap(client.GET("/meals/current")),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

/**
 * Planned meals for a half-open `[start, end)` date range (the calendar's visible week or day).
 * The server merges PantryPal's plans, so a rolling week that straddles two plan weeks works.
 * Fails silently: callers treat `isError` as "no meals to show".
 */
export const mealsPlanQuery = (start: string, end: string) =>
  queryOptions({
    queryKey: mealsKeys.plan(start, end),
    queryFn: () => unwrap(client.GET("/meals/plan", { params: { query: { start, end } } })),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });

export const mealsStatusQuery = () =>
  queryOptions({ queryKey: mealsKeys.status, queryFn: () => unwrap(client.GET("/meals/status")) });

/** `enabled: false` while the module flag is off or unknown. */
export const useMeals = (enabled = true) => useQuery({ ...mealsQuery(), enabled });
export const useMealsStatus = () => useQuery(mealsStatusQuery());

/** Planned days for a range, or nothing while the range is unknown (month view, no clock yet). */
export const useMealsPlan = (range: { start: string; end: string } | null, enabled = true) =>
  useQuery({
    ...mealsPlanQuery(range?.start ?? "", range?.end ?? ""),
    enabled: enabled && range !== null,
  });

/**
 * PantryPal's week screen accepts `?week=YYYY-MM-DD` and snaps it to its own week start, so any
 * day of the wanted week is a valid deep link. Null when the browser-facing URL is unknown.
 */
export function pantrypalWeekUrl(publicUrl: string | null | undefined, date: string): string | null {
  const base = publicUrl?.replace(/\/+$/, "");
  return base ? `${base}/?week=${encodeURIComponent(date)}` : null;
}

/** Settings > Modules "Test connection": always runs, result carried in the body. */
export function useTestPantryPal() {
  return useMutation({ mutationFn: () => unwrap(client.POST("/meals/test")) });
}
