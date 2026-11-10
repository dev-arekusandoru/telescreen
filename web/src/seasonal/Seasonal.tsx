import { useSyncStatus } from "@/features/calendar";
import { useDevTheme } from "./devTheme";
import { themeForDate, THEMES } from "./registry";
import styles from "./Seasonal.module.css";

/** Master switch (`settings.seasonalDecor`) is applied by the caller; this picks the theme for today or the dev override. */
export function Seasonal() {
  const { data: status } = useSyncStatus();
  const dev = useDevTheme();
  const theme = THEMES.find((t) => t.id === dev) ?? themeForDate(new Date());
  if (!theme) return null;
  return (
    <div className={styles.layer} aria-hidden="true">
      {/* key: switching themes remounts, so piles and timers start clean */}
      <theme.Component key={theme.id} syncedAt={status?.lastSyncedAt} />
    </div>
  );
}
