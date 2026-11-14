import { Seasonal, useActiveTheme } from "@/seasonal/Seasonal";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Link, Outlet } from "@tanstack/react-router";
import { ago } from "@/app/dates";
import { useNow } from "@/app/useNow";
import { useSyncNow, useSyncStatus } from "@/features/calendar";
import { useSettings } from "@/features/queries";
import { ToastProvider } from "@/ui/toast";
import styles from "./Shell.module.css";
import { visibleTabs, type Tab } from "./tabs";
import { useWakeLock } from "./wakeLock";
import { WidgetColumn } from "./WidgetColumn";

function NavLinks({ tabs }: { tabs: Tab[] }) {
  return tabs.map((t) => (
    <Link key={t.id} to={t.to} className={styles.nav}>
      {({ isActive }) => (
        <>
          <t.icon weight={isActive ? "fill" : "regular"} aria-hidden />
          {t.label}
        </>
      )}
    </Link>
  ));
}

/** Icon-only calendar sync at the foot of the rail; the last-sync time lives in Settings > General. */
function SyncButton() {
  const sync = useSyncNow();
  const { data: status } = useSyncStatus();
  const now = useNow();
  const state = status?.hasErrors
    ? `Sync problem${status.lastSyncedAt ? `, last synced ${ago(status.lastSyncedAt, now)}` : ""}`
    : status?.lastSyncedAt
      ? `Synced ${ago(status.lastSyncedAt, now)}`
      : "Not synced yet";
  return (
    <button
      type="button"
      className={styles.railSync}
      aria-label="Sync calendars"
      title={`${state} · tap to sync`}
      disabled={sync.isPending}
      onClick={() => sync.mutate()}
    >
      <ArrowsClockwise aria-hidden />
    </button>
  );
}

/** Layout route: 84px nav rail (>= 600px) or bottom tab bar (< 600px) around the page. */
export function Shell() {
  const { data: settings } = useSettings();
  const tabs = visibleTabs(settings?.modules);
  useWakeLock(settings?.keepAwake ?? true);
  // Right column (>= 1280px, SPEC §8): only exists while a module that fills it is enabled.
  const modules = settings?.modules;
  const seasonalLogo = useActiveTheme()?.Logo;
  const Logo = (settings?.seasonalDecor ?? true) ? seasonalLogo : undefined;
  const showSide =
    modules?.weather === true || modules?.meals === true || modules?.music === true || modules?.travel === true;
  return (
    <div className={styles.app} data-side={showSide ? "on" : undefined}>
      <nav className={styles.rail} aria-label="Primary">
        <div className={styles.logo} aria-hidden="true">
          {Logo ? <Logo /> : "T"}
        </div>
        <NavLinks tabs={tabs} />
        <SyncButton />
      </nav>
      <main className={styles.main}>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </main>
      {(settings?.seasonalDecor ?? true) ? <Seasonal /> : null}
      {showSide ? (
        <aside className={styles.side} aria-label="At a glance">
          <WidgetColumn />
        </aside>
      ) : null}
      <nav className={styles.tabbar} aria-label="Primary">
        <NavLinks tabs={tabs} />
      </nav>
    </div>
  );
}
