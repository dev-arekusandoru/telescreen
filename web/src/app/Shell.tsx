import { Link, Outlet } from "@tanstack/react-router";
import { useSettings } from "@/features/queries";
import { TonightCard } from "@/screens/meals/TonightCard";
import { NowPlayingCard } from "@/screens/music/NowPlayingCard";
import { WeatherCard } from "@/screens/weather/WeatherCard";
import { ToastProvider } from "@/ui/toast";
import styles from "./Shell.module.css";
import { visibleTabs, type Tab } from "./tabs";
import { useWakeLock } from "./wakeLock";

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

/** Layout route: 84px nav rail (>= 600px) or bottom tab bar (< 600px) around the page. */
export function Shell() {
  const { data: settings } = useSettings();
  const tabs = visibleTabs(settings?.modules);
  useWakeLock(settings?.keepAwake ?? true);
  // Right column (>= 1280px, SPEC §8): only exists while a module that fills it is enabled.
  const showSide =
    settings?.modules.weather === true || settings?.modules.meals === true || settings?.modules.music === true;
  return (
    <div className={styles.app} data-side={showSide ? "on" : undefined}>
      <nav className={styles.rail} aria-label="Primary">
        <div className={styles.logo} aria-hidden="true">
          H
        </div>
        <NavLinks tabs={tabs} />
      </nav>
      <main className={styles.main}>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </main>
      {showSide ? (
        <aside className={styles.side} aria-label="At a glance">
          {settings?.modules.weather ? <WeatherCard /> : null}
          {settings?.modules.meals ? (
            <section className={styles.sideCard}>
              <TonightCard />
            </section>
          ) : null}
          {settings?.modules.music ? <NowPlayingCard /> : null}
        </aside>
      ) : null}
      <nav className={styles.tabbar} aria-label="Primary">
        <NavLinks tabs={tabs} />
      </nav>
    </div>
  );
}
