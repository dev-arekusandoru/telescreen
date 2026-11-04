import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client, unwrap, type components } from "@/api";
import { queryKeys } from "./queries";

export type UpdateHousehold = components["schemas"]["UpdateHouseholdInput"];
export type UpdateMember = components["schemas"]["UpdateMemberInput"];
export type CreateMember = components["schemas"]["CreateMemberInput"];
export type MemberColor = components["schemas"]["MemberColor"];

/** Curated palette order (matches `MEMBER_COLORS` on the server). */
export const MEMBER_COLORS: readonly MemberColor[] = ["terracotta", "sage", "ochre", "plum", "slate", "rose"];

export function useUpdateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateHousehold) => unwrap(client.PATCH("/household", { body: patch })),
    onSuccess: (data) => qc.setQueryData(queryKeys.household, data),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateMember & { id: string }) =>
      unwrap(client.PATCH("/members/{id}", { params: { path: { id } }, body: patch })),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members }),
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMember) => unwrap(client.POST("/members", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members }),
  });
}
