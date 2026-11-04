import { useCallback, useEffect, useRef, useState } from "react";

/** `useState` persisted to localStorage as JSON (silently in-memory if storage is unavailable). */
export function useStoredState<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          globalThis.localStorage?.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage full or blocked: keep in memory */
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/** Calls `onIdle` after `minutes` without user interaction. `0` (or less) disables it. */
export function useIdleReturn(minutes: number, onIdle: () => void) {
  const callback = useRef(onIdle);
  callback.current = onIdle;
  useEffect(() => {
    if (!(minutes > 0)) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), minutes * 60_000);
    };
    arm();
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, arm, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, arm);
    };
  }, [minutes]);
}
