import { Drop } from "@phosphor-icons/react";
import { degrees, unitSuffix, type Weather, type WeatherUnits } from "@/features/weather";
import styles from "./Weather.module.css";
import { weatherIcon } from "./WeatherIcon";

/** "13:00" — the API sends household-local wall time, so no zone conversion is needed. */
const clock = (time: string, index: number) => (index === 0 ? "Now" : time.slice(11, 16));

/** Horizontally scrolling 24-hour strip shared by the weather widget and its popover. */
export function HourlyStrip({ hours, units }: { hours: Weather["hours"]; units: WeatherUnits }) {
  return (
    <ul className={styles.hours} aria-label="Next 24 hours">
      {hours.map((hour, i) => {
        const Icon = weatherIcon(hour.group, hour.isDay);
        const label = clock(hour.time, i);
        return (
          <li
            key={hour.time}
            className={styles.hour}
            aria-label={`${label}, ${hour.label}, ${Math.round(hour.temperature)}${unitSuffix(units)}${
              hour.precipProbability !== null && hour.precipProbability > 0
                ? `, ${Math.round(hour.precipProbability)}% chance of precipitation`
                : ""
            }`}
          >
            <span className={styles.hourTime}>{label}</span>
            <Icon className={styles.hourIcon} weight={i === 0 ? "fill" : "regular"} aria-hidden />
            <span className={styles.high}>{degrees(hour.temperature)}</span>
            {hour.precipProbability !== null && hour.precipProbability > 0 ? (
              <span className={styles.precip}>
                <Drop aria-hidden />
                {Math.round(hour.precipProbability)}%
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
