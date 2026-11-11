import { Car } from "@phosphor-icons/react";
import { useSettings } from "@/features/queries";
import { directionsUrl, formatDuration, trafficDelayMinutes, useTravel } from "@/features/travel";
import styles from "./Travel.module.css";

/** Right-column card: traffic-aware driving time from home to each saved destination. */
export function TravelCard() {
  const { data: settings } = useSettings();
  const enabled = settings?.modules.travel === true;
  const { data, isError, isPending } = useTravel(enabled);

  if (!enabled) return null;

  return (
    <section className={styles.card} aria-label="Travel">
      <h2 className={styles.cardTitle}>
        <Car weight="fill" aria-hidden />
        Travel
        {data?.stale ? <span className={styles.badge}>Last known</span> : null}
      </h2>
      {data ? (
        data.routes.length === 0 ? (
          <p className={styles.muted}>Add destinations in Settings.</p>
        ) : (
          <ul className={styles.list}>
            {data.routes.map((route) => {
              const delay = trafficDelayMinutes(route);
              return (
                <li key={route.id}>
                  <a className={styles.route} href={directionsUrl(data.home, route.address)} target="_blank" rel="noreferrer">
                    <span className={styles.label}>{route.label}</span>
                    {route.durationSeconds === null ? (
                      <span className={styles.none} title={route.error ?? undefined}>
                        No route
                      </span>
                    ) : (
                      <span className={styles.time}>
                        {formatDuration(route.durationSeconds)}
                        {delay > 0 ? <small className={styles.delay}>+{delay} min traffic</small> : null}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <p className={styles.muted}>{isError ? "Unavailable" : isPending ? "Loading…" : null}</p>
      )}
    </section>
  );
}
