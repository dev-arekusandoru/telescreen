import { useSyncStatus } from "@/features/calendar";
import { useDevTheme } from "./devTheme";
import { themeForDate, THEMES } from "./registry";
import styles from "./Seasonal.module.css";

/** The theme showing right now: the dev override, else the theme for today's date. */
export function useActiveTheme() {
  const dev = useDevTheme();
  return THEMES.find((t) => t.id === dev) ?? themeForDate(new Date());
}

/** Master switch (`settings.seasonalDecor`) is applied by the caller; this picks the theme for today or the dev override. */
export function Seasonal() {
  const { data: status } = useSyncStatus();
  const theme = useActiveTheme();
  if (!theme) return null;
  return (
    <div className={styles.layer} aria-hidden="true">
      {/* key: switching themes remounts, so piles and timers start clean */}
      <theme.Component key={theme.id} syncedAt={status?.lastSyncedAt} />
    </div>
  );
}
