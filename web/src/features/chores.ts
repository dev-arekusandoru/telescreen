import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError, client, unwrap, type components } from "@/api";

export type Chore = components["schemas"]["Chore"];
export type ChoreOccurrence = components["schemas"]["ChoreOccurrence"];
export type ChoreRecurrence = components["schemas"]["ChoreRecurrence"];
export type ChoreRecurrenceInput = components["schemas"]["ChoreRecurrenceInput"];
export type ChoreAssignment = components["schemas"]["ChoreAssignment"];
export type CreateChore = components["schemas"]["CreateChoreInput"];
export type UpdateChore = components["schemas"]["UpdateChoreInput"];
export type ChoreProgress = components["schemas"]["ChoreProgress"];

export const choreKeys = {
  all: ["chores"] as const,
  list: ["chores", "list"] as const,
  occurrences: ["chores", "occurrences"] as const,
  progress: (date: string) => ["chores", "progress", date] as const,
};

export interface OccurrenceRange {
  from: string;
  to: string;
  /** Also fetch still-live open occurrences due before `from` (Today). */
  carryover?: boolean;
}

export const choresQuery = () =>
  queryOptions({ queryKey: choreKeys.list, queryFn: () => unwrap(client.GET("/chores")) });

export const occurrencesQuery = ({ from, to, carryover = false }: OccurrenceRange) =>
  queryOptions({
    queryKey: [...choreKeys.occurrences, from, to, carryover] as const,
    queryFn: () =>
      unwrap(
        client.GET("/chore-occurrences", {
          params: { query: { from, to, ...(carryover ? { carryover: "true" as const } : {}) } },
        }),
      ),
  });

export const useChores = () => useQuery(choresQuery());
export const useOccurrences = (range: OccurrenceRange) => useQuery(occurrencesQuery(range));

/**
 * Per-member `{ done, total }` for `date` (the header progress strip). Pass `date = null` to
 * stay idle (household time zone not loaded yet, or the caller supplies its own numbers).
 */
export function useChoreProgress(date: string | null) {
  return useQuery({
    queryKey: choreKeys.progress(date ?? ""),
    queryFn: () => unwrap(client.GET("/chore-occurrences/progress", { params: { query: { date: date ?? "" } } })),
    enabled: date !== null,
    refetchInterval: 60_000,
  });
}

/** Who a Today/Week row belongs to: the completer once done, else the assignee (`null` = Shared). */
export function ownerOf(occ: ChoreOccurrence): string | null {
  return occ.status === "done" ? occ.completedBy : occ.assigneeId;
}

/** Same rule as the server's `/progress`: skipped excluded, credit to the completer. */
export function progressFor(list: readonly ChoreOccurrence[]): Record<string, { done: number; total: number }> {
  const out: Record<string, { done: number; total: number }> = {};
  for (const occ of list) {
    if (occ.status === "skipped" || occ.status === "missed") continue;
    const owner = ownerOf(occ);
    if (owner === null) continue;
    const p = (out[owner] ??= { done: 0, total: 0 });
    p.total++;
    if (occ.status === "done") p.done++;
  }
  return out;
}

type Snapshot = Array<[readonly unknown[], ChoreOccurrence[] | undefined]>;

/** Optimistically patch one occurrence in every cached occurrence list; returns a rollback snapshot. */
function patchCached(qc: QueryClient, id: string, patch: Partial<ChoreOccurrence>): Snapshot {
  const snapshot = qc.getQueriesData<ChoreOccurrence[]>({ queryKey: choreKeys.occurrences });
  qc.setQueriesData<ChoreOccurrence[]>({ queryKey: choreKeys.occurrences }, (old) =>
    old?.map((o) => (o.id === id ? { ...o, ...patch } : o)),
  );
  return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined): void {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

function useOccurrenceMutation<V extends { id: string }>(
  call: (vars: V) => Promise<ChoreOccurrence>,
  optimistic: (vars: V) => Partial<ChoreOccurrence>,
) {
  const qc = useQueryClient();
  return useMutation<ChoreOccurrence, Error, V, Snapshot>({
    mutationFn: call,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: choreKeys.occurrences });
      return patchCached(qc, vars.id, optimistic(vars));
    },
    onError: (_e, _v, snapshot) => restore(qc, snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: choreKeys.all }),
  });
}

const post = (path: "complete" | "undo" | "skip" | "reassign", id: string, body?: object) =>
  unwrap(
    client.POST(`/chore-occurrences/{id}/${path}` as "/chore-occurrences/{id}/complete", {
      params: { path: { id } },
      body: (body ?? {}) as { completedBy: string },
    }),
  );

export const useCompleteOccurrence = () =>
  useOccurrenceMutation<{ id: string; completedBy: string }>(
    ({ id, completedBy }) => post("complete", id, { completedBy }),
    ({ completedBy }) => ({ status: "done", completedBy, completedAt: new Date().toISOString() }),
  );

export const useUndoOccurrence = () =>
  useOccurrenceMutation<{ id: string }>(
    ({ id }) => post("undo", id),
    () => ({ status: "open", completedBy: null, completedAt: null }),
  );

export const useSkipOccurrence = () =>
  useOccurrenceMutation<{ id: string }>(
    ({ id }) => post("skip", id),
    () => ({ status: "skipped" }),
  );

export const useReassignOccurrence = () =>
  useOccurrenceMutation<{ id: string; memberId: string }>(
    ({ id, memberId }) => post("reassign", id, { memberId }),
    ({ memberId }) => ({ assigneeId: memberId }),
  );

export function useSaveChore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: CreateChore | UpdateChore }) =>
      id === null
        ? unwrap(client.POST("/chores", { body: body as CreateChore }))
        : unwrap(client.PATCH("/chores/{id}", { params: { path: { id } }, body: body as UpdateChore })),
    onSuccess: () => qc.invalidateQueries({ queryKey: choreKeys.all }),
  });
}

/** Human-readable message for a failed request. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong";
}
