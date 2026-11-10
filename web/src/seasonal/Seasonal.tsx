import { useSyncStatus } from "@/features/calendar";
import { Scattered } from "./Scattered";
import styles from "./Seasonal.module.css";

/** Thanksgiving theme runs all of November; other events get added here later. */
export const isSeason = (d: Date) => d.getMonth() === 10;

export function Seasonal() {
  const { data: status } = useSyncStatus();
  return (
    <div className={styles.layer} aria-hidden="true">
      <Scattered syncedAt={status?.lastSyncedAt} />
    </div>
  );
}
