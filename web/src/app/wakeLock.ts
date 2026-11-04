import { useEffect } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}
interface WakeLockApi {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

function api(): WakeLockApi | undefined {
  return typeof navigator !== "undefined" ? (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock : undefined;
}

/** True when the Screen Wake Lock API exists (needs a secure context: HTTPS or localhost). */
export const wakeLockSupported = (): boolean => api() !== undefined;

/**
 * Hold a screen wake lock while `enabled` and the page is visible. The browser drops the lock
 * whenever the page is hidden, so it is re-requested on every `visibilitychange` back to visible.
 * Failures (battery saver, insecure context) are ignored: this is best-effort.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    const wl = api();
    if (!enabled || !wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== "visible") return;
      try {
        const s = await wl.request("screen");
        if (cancelled) {
          void s.release().catch(() => {});
          return;
        }
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        // Denied; try again on the next visibility change.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void acquire();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}
