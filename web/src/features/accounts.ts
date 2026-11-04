import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, unwrap, type components } from "@/api";
import { calendarKeys } from "./calendar";

export type Account = components["schemas"]["Account"];
export type CreateIcloudAccount = components["schemas"]["CreateIcloudAccountInput"];
export type UpdateCalendar = components["schemas"]["UpdateCalendarInput"];

export const useAccounts = () =>
  useQuery({
    queryKey: calendarKeys.accounts,
    queryFn: () => unwrap(client.GET("/accounts")),
  });

/** Everything that depends on accounts/calendars/events after a change. */
function useInvalidateCalendarData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: calendarKeys.accounts }),
      qc.invalidateQueries({ queryKey: calendarKeys.calendars }),
      qc.invalidateQueries({ queryKey: calendarKeys.events }),
      qc.invalidateQueries({ queryKey: calendarKeys.syncStatus }),
    ]);
}

export function useAddIcloudAccount() {
  const invalidate = useInvalidateCalendarData();
  return useMutation({
    mutationFn: (body: CreateIcloudAccount) => unwrap(client.POST("/accounts/icloud", { body })),
    onSuccess: invalidate,
  });
}

/** Resolves to the Google consent URL; the caller navigates the window there. */
export function useStartGoogle() {
  return useMutation({
    mutationFn: async () => (await unwrap(client.POST("/accounts/google/start"))).authUrl,
  });
}

export function useRemoveAccount() {
  const invalidate = useInvalidateCalendarData();
  return useMutation({
    mutationFn: (id: string) => unwrap(client.DELETE("/accounts/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  });
}

export function useSyncAccount() {
  const invalidate = useInvalidateCalendarData();
  return useMutation({
    mutationFn: (id: string) => unwrap(client.POST("/accounts/{id}/sync", { params: { path: { id } } })),
    onSettled: invalidate,
  });
}

export function useUpdateCalendar() {
  const invalidate = useInvalidateCalendarData();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCalendar & { id: string }) =>
      unwrap(client.PATCH("/calendars/{id}", { params: { path: { id } }, body })),
    onSuccess: invalidate,
  });
}
