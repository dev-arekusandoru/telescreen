import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./wakeLock";

function stubWakeLock() {
  const handlers: Array<() => void> = [];
  const release = vi.fn(async () => {});
  const request = vi.fn(async () => ({ release, addEventListener: (_: string, cb: () => void) => handlers.push(cb) }));
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, release, handlers };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("useWakeLock", () => {
  it("requests a lock when enabled and releases on unmount", async () => {
    const { request, release } = stubWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    unmount();
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });

  it("does nothing when disabled or unsupported", () => {
    const { request } = stubWakeLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, "wakeLock");
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it("re-requests after the page becomes visible again", async () => {
    const { request, handlers } = stubWakeLock();
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request).toHaveBeenCalledTimes(1); // still held, no duplicate
    handlers.forEach((h) => h()); // browser released it while hidden
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});
