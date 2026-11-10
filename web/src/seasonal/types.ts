import type { ComponentType } from "react";

/**
 * Every theme is a self-contained component rendered inside the fixed, click-through
 * `.layer` (see Seasonal.module.css). `syncedAt` changes on every calendar sync (the
 * user's interval or a manual tap); themes use it as the "blow it all away / reset" beat.
 */
export interface ThemeProps {
  syncedAt?: string | null;
}

export interface ThemeDef {
  id: string;
  label: string;
  /** Local date test; the first matching theme in the registry wins, so specific events come before broad seasons. */
  active: (d: Date) => boolean;
  Component: ComponentType<ThemeProps>;
}
