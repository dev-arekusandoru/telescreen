import { useSyncExternalStore } from "react";

/** Dev-only per-device override of the date-driven theme: "auto" or a theme id. */
const KEY = "telescreen.dev.seasonalTheme";
const listeners = new Set<() => void>();

// Production builds ignore any stored override (it could be left over from a dev session on this origin).
const read = () => {
  if (!import.meta.env.DEV) return "auto";
  try {
    return localStorage.getItem(KEY) ?? "auto";
  } catch {
    return "auto";
  }
};

export function setDevTheme(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable: override just doesn't persist
  }
  listeners.forEach((l) => l());
}

export function useDevTheme(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
  );
}
