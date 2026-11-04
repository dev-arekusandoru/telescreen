import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { ApiError, client, unwrap, type components } from "@/api";
import { useToast } from "@/ui/toast";
import { useMembers } from "./queries";

export type EventInstance = components["schemas"]["EventInstance"];
export type CalendarInfo = components["schemas"]["Calendar"];
export type AccountInfo = components["schemas"]["Account"];
export type SyncStatus = components["schemas"]["SyncStatus"];
export type EventFields = components["schemas"]["CreateEventInput"];
export type Repeat = EventInstance["repeat"];
export type EditableRepeat = Exclude<Repeat, "custom">;
export type Scope = "this" | "all";

export const calendarKeys = {
  events: ["events"] as const,
  range: (start: string, end: string) => ["events", start, end] as const,
  calendars: ["calendars"] as const,
  accounts: ["accounts"] as const,
  syncStatus: ["sync-status"] as const,
};

export const eventsQuery = (start: string, end: string, memberIds: readonly string[]) =>
  queryOptions({
    queryKey: calendarKeys.range(start, end),
    queryFn: () =>
      unwrap(client.GET("/events", { params: { query: { start, end, members: [...memberIds, "family"].join(",") } } })),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

/** Events for the visible range (all members + family; the screen filters by chip). */
export function useEvents(range: { start: string; end: string } | null) {
  const { data: members = [] } = useMembers();
  const ids = members.map((m) => m.id);
  return useQuery({
    ...eventsQuery(range?.start ?? "", range?.end ?? "", ids),
    enabled: range !== null && members.length > 0,
  });
}

export const useCalendars = () =>
  useQuery({
    queryKey: calendarKeys.calendars,
    queryFn: () => unwrap(client.GET("/calendars")),
  });

export const useSyncStatus = () =>
  useQuery({
    queryKey: calendarKeys.syncStatus,
    queryFn: () => unwrap(client.GET("/sync/status")),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

/** Sync every account, then refetch events, calendars and the status dot. */
export function useSyncNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const accounts = await unwrap(client.GET("/accounts"));
      await Promise.allSettled(
        accounts.map((a) => unwrap(client.POST("/accounts/{id}/sync", { params: { path: { id: a.id } } }))),
      );
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: calendarKeys.events }),
        qc.invalidateQueries({ queryKey: calendarKeys.calendars }),
        qc.invalidateQueries({ queryKey: calendarKeys.syncStatus }),
      ]),
  });
}

type EventsSnapshot = Array<[readonly unknown[], EventInstance[] | undefined]>;

function updateEventsCache(qc: QueryClient, fn: (events: EventInstance[]) => EventInstance[]) {
  qc.setQueriesData<EventInstance[]>({ queryKey: calendarKeys.events }, (old) => (old ? fn(old) : old));
}

async function beginOptimistic(qc: QueryClient, fn: (events: EventInstance[]) => EventInstance[]): Promise<EventsSnapshot> {
  await qc.cancelQueries({ queryKey: calendarKeys.events });
  const snapshot = qc.getQueriesData<EventInstance[]>({ queryKey: calendarKeys.events });
  updateEventsCache(qc, fn);
  return snapshot;
}

function rollback(qc: QueryClient, snapshot: EventsSnapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

let tempCounter = 0;

export interface EventActions {
  create(fields: EventFields, calendars: readonly CalendarInfo[]): void;
  update(event: EventInstance, patch: Partial<EventFields>, scope: Scope): void;
  remove(event: EventInstance, scope: Scope): void;
}

/**
 * Optimistic create/edit/delete. A failed write rolls the cache back and shows a "Couldn't save"
 * toast with Retry; a 409 conflict shows "This event changed elsewhere" and refetches.
 */
export function useEventActions(): EventActions {
  const qc = useQueryClient();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const run = useCallback(
    async (
      optimistic: (events: EventInstance[]) => EventInstance[],
      request: () => Promise<unknown>,
      retry: () => void,
    ) => {
      const snapshot = await beginOptimistic(qc, optimistic);
      try {
        await request();
      } catch (error) {
        rollback(qc, snapshot);
        if (error instanceof ApiError && error.status === 409) {
          toastRef.current({ message: "This event changed elsewhere" });
        } else {
          toastRef.current({ message: "Couldn't save", action: { label: "Retry", onClick: retry } });
        }
      } finally {
        void qc.invalidateQueries({ queryKey: calendarKeys.events });
      }
    },
    [qc],
  );

  const actions: EventActions = {
    create(fields, calendars) {
      const calendar = calendars.find((c) => c.id === fields.calendarId);
      const id = `tmp-${++tempCounter}`;
      const temp: EventInstance = {
        id,
        eventId: id,
        calendarId: fields.calendarId,
        memberId: calendar?.memberId ?? null,
        title: fields.title,
        start: fields.start,
        end: fields.end,
        allDay: fields.allDay,
        timeZone: null,
        location: fields.location ?? null,
        notes: fields.notes ?? null,
        recurring: fields.repeat !== "none",
        repeat: fields.repeat,
        writable: true,
      };
      void run(
        (events) => [...events, temp],
        () => unwrap(client.POST("/events", { body: fields })),
        () => actions.create(fields, calendars),
      );
    },
    update(event, patch, scope) {
      const { repeat: _repeat, calendarId: _calendar, ...visible } = patch;
      void run(
        (events) =>
          events.map((e) => {
            if (e.id === event.id) return { ...e, ...visible };
            // "All events": mirror text fields onto the series; times are fixed up by the refetch.
            if (scope === "all" && e.eventId === event.eventId) {
              const { start: _s, end: _e, allDay: _a, ...text } = visible;
              return { ...e, ...text };
            }
            return e;
          }),
        () => unwrap(client.PATCH("/events/{id}", { params: { path: { id: event.id }, query: { scope } }, body: patch })),
        () => actions.update(event, patch, scope),
      );
    },
    remove(event, scope) {
      void run(
        (events) => events.filter((e) => (scope === "all" ? e.eventId !== event.eventId : e.id !== event.id)),
        () => unwrap(client.DELETE("/events/{id}", { params: { path: { id: event.id }, query: { scope } } })),
        () => actions.remove(event, scope),
      );
    },
  };
  return actions;
}
