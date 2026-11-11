import { Car } from "@phosphor-icons/react";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { useMembers, useSettings } from "@/features/queries";
import { arrivalTime, directionsUrl, formatDuration, trafficDelayMinutes, trafficLevel, useTravel } from "@/features/travel";
import { memberColorStyle } from "@/ui";
import { TRAVEL_ICONS } from "./icons";
import styles from "./Travel.module.css";

const LEVEL_WORD = { clear: "Clear", slow: "Slow", heavy: "Heavy" } as const;

/** Right-column card: traffic-aware driving time from home to each saved destination. */
export function TravelCard() {
  const { data: settings } = useSettings();
  const { data: members = [] } = useMembers();
  const { now, timeZone } = useHouseholdClock();
  const enabled = settings?.modules.travel === true;
  const { data, isError, isPending } = useTravel(enabled);

  if (!enabled) return null;

  const destinations = new Map(settings.travel.destinations.map((d) => [d.id, d]));

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
              const destination = destinations.get(route.id);
              const member = members.find((m) => m.id === destination?.memberId);
              const { Icon } = TRAVEL_ICONS[destination?.icon ?? "pin"];
              const level = trafficLevel(route);
              const delay = trafficDelayMinutes(route);
              return (
                <li key={route.id}>
                  <a className={styles.route} href={directionsUrl(data.home, route.address)} target="_blank" rel="noreferrer">
                    <span className={styles.glyph} style={memberColorStyle(member?.colorToken)} title={member?.name}>
                      <Icon weight="fill" aria-hidden />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.label}>{route.label}</span>
                      {route.durationSeconds !== null ? (
                        <small>arrival {arrivalTime(new Date(now.getTime() + route.durationSeconds * 1000), timeZone)}</small>
                      ) : null}
                    </span>
                    {route.durationSeconds === null || level === null ? (
                      <span className={styles.none} title={route.error ?? undefined}>
                        No route
                      </span>
                    ) : (
                      <span className={styles.time} data-level={level}>
                        <b>{formatDuration(route.durationSeconds)}</b>
                        {/* The word and the +N keep the level readable without color. */}
                        <small>
                          {delay > 0 ? `+${delay} min · ` : ""}
                          {LEVEL_WORD[level]}
                        </small>
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
