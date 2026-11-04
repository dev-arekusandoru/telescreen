import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { client, unwrap, type components } from "@/api";

export type MealsCurrent = components["schemas"]["MealsCurrent"];
export type MealDay = components["schemas"]["MealDay"];
export type MealItem = components["schemas"]["MealItem"];
export type MealsStatus = components["schemas"]["MealsStatus"];
export type MealsTestResult = components["schemas"]["MealsTestResult"];

export const mealsKeys = {
  current: ["meals", "current"] as const,
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

export const mealsStatusQuery = () =>
  queryOptions({ queryKey: mealsKeys.status, queryFn: () => unwrap(client.GET("/meals/status")) });

/** `enabled: false` while the module flag is off or unknown. */
export const useMeals = (enabled = true) => useQuery({ ...mealsQuery(), enabled });
export const useMealsStatus = () => useQuery(mealsStatusQuery());

/** Settings > Modules "Test connection": always runs, result carried in the body. */
export function useTestPantryPal() {
  return useMutation({ mutationFn: () => unwrap(client.POST("/meals/test")) });
}
