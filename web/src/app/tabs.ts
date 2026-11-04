import { Broom, CalendarBlank, ForkKnife, GearSix, MusicNotes, type Icon } from "@phosphor-icons/react";
import type { ModuleKey } from "@/features/queries";

export interface Tab {
  id: string;
  to: "/calendar" | "/chores" | "/meals" | "/music" | "/settings";
  label: string;
  icon: Icon;
  /** Hidden from navigation unless this module flag is on (Settings > modules). */
  module?: ModuleKey;
}

/** Navigation order (SPEC §6). To add a screen: add a tab here and a route in `router.tsx`. */
export const TABS: readonly Tab[] = [
  { id: "calendar", to: "/calendar", label: "Calendar", icon: CalendarBlank },
  { id: "chores", to: "/chores", label: "Chores", icon: Broom },
  { id: "meals", to: "/meals", label: "Meals", icon: ForkKnife, module: "meals" },
  { id: "music", to: "/music", label: "Music", icon: MusicNotes, module: "music" },
  { id: "settings", to: "/settings", label: "Settings", icon: GearSix },
];

/** Tabs visible with the given module flags. */
export function visibleTabs(modules: Partial<Record<ModuleKey, boolean>> | undefined): Tab[] {
  return TABS.filter((t) => t.module === undefined || modules?.[t.module] === true);
}
