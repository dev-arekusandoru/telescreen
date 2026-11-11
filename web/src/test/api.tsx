import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "@/app/App";
import { createAppRouter } from "@/app/router";
import { createQueryClient } from "@/api";

export const MEMBERS = [
  { id: "mem_a", householdId: "hh", name: "Alex", colorToken: "terracotta", initial: "A", sort: 0 },
  { id: "mem_b", householdId: "hh", name: "Vale", colorToken: "sage", initial: "V", sort: 1 },
];

export function defaultSettings() {
  return {
    weekMode: "rolling",
    idleReturnMinutes: 2,
    syncIntervalMinutes: 5,
    keepAwake: true,
    seasonalDecor: true,
    modules: { weather: false, meals: false, music: false, travel: false },
    defaultWriteCalendarId: {},
    weather: { latitude: null, longitude: null, units: "celsius", place: null, showUv: false },
    musicPins: [],
    travel: { home: null, destinations: [] },
  };
}

/** Stub `fetch` with an in-memory API (household, members, settings). Returns the mutable settings. */
export function stubApi() {
  let settings = defaultSettings();
  const body = (data: unknown) =>
    new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const req = typeof input === "string" ? new Request(input, init) : input;
      const path = new URL(req.url).pathname;
      if (path === "/api/v1/household") {
        return body({ id: "hh", name: "Home", timezone: "Europe/Berlin", weekStart: 0, themeDefault: "system" });
      }
      if (path === "/api/v1/members") return body(MEMBERS);
      if (path === "/api/v1/settings") {
        if (req.method === "PUT") settings = { ...settings, ...(await req.json()) };
        return body(settings);
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

export function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter({ history });
  return render(<App queryClient={createQueryClient()} appRouter={router} />);
}
