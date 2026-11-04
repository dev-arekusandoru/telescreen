import { Link, Outlet } from "@tanstack/react-router";
import { useSettings } from "@/features/queries";
import styles from "./Shell.module.css";
import { visibleTabs, type Tab } from "./tabs";

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
  return (
    <div className={styles.app}>
      <nav className={styles.rail} aria-label="Primary">
        <div className={styles.logo} aria-hidden="true">
          H
        </div>
        <NavLinks tabs={tabs} />
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
      <nav className={styles.tabbar} aria-label="Primary">
        <NavLinks tabs={tabs} />
      </nav>
    </div>
  );
}
