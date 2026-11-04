import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, unwrap, type components } from "@/api";

/** Query keys. Add new feature keys here so invalidation stays greppable. */
export const queryKeys = {
  household: ["household"] as const,
  members: ["members"] as const,
  settings: ["settings"] as const,
};

export type Member = components["schemas"]["Member"];
export type Household = components["schemas"]["Household"];
export type Settings = components["schemas"]["Settings"];
export type UpdateSettings = components["schemas"]["UpdateSettingsInput"];
export type ModuleKey = keyof Settings["modules"];

export const householdQuery = () =>
  queryOptions({ queryKey: queryKeys.household, queryFn: () => unwrap(client.GET("/household")), staleTime: 5 * 60_000 });

export const membersQuery = () =>
  queryOptions({ queryKey: queryKeys.members, queryFn: () => unwrap(client.GET("/members")) });

export const settingsQuery = () =>
  queryOptions({ queryKey: queryKeys.settings, queryFn: () => unwrap(client.GET("/settings")) });

export const useHousehold = () => useQuery(householdQuery());
export const useMembers = () => useQuery(membersQuery());
export const useSettings = () => useQuery(settingsQuery());

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSettings) => unwrap(client.PUT("/settings", { body: patch })),
    onSuccess: (data) => qc.setQueryData(queryKeys.settings, data),
  });
}
