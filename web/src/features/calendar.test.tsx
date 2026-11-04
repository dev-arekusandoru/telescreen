import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api";
import { ToastProvider } from "@/ui/toast";
import { useEventActions, type EventInstance } from "./calendar";

const EVENT: EventInstance = {
  id: "evt_1",
  eventId: "evt_1",
  calendarId: "cal_a",
  memberId: null,
  title: "Dentist",
  start: "2026-11-03T13:00:00.000Z",
  end: "2026-11-03T14:00:00.000Z",
  allDay: false,
  timeZone: "Europe/Berlin",
  location: null,
  notes: null,
  recurring: false,
  repeat: "none",
  writable: true,
};

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

function setup() {
  const qc = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useEventActions(), { wrapper });
}

afterEach(() => vi.unstubAllGlobals());

describe("useEventActions error handling", () => {
  it("shows 'changed elsewhere' for the server's 409 envelope", async () => {
    respondWith(409, { error: { code: "conflict", message: "Event changed at the provider" } });
    const { result } = setup();
    act(() => result.current.update(EVENT, { title: "x" }, "all"));
    expect(await findToast("This event changed elsewhere")).toBeTruthy();
    expect(screenText()).not.toContain("Couldn't save");
  });

  it("shows a Retry toast for a 502", async () => {
    respondWith(502, { error: { code: "bad_gateway", message: "Provider failed" } });
    const { result } = setup();
    act(() => result.current.remove(EVENT, "this"));
    expect(await findToast("Couldn't save")).toBeTruthy();
    expect(screenText()).toContain("Retry");
  });
});

function screenText() {
  return document.body.textContent ?? "";
}

async function findToast(text: string) {
  await waitFor(() => expect(screenText()).toContain(text));
  return true;
}
