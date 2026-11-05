import { Drop } from "@phosphor-icons/react";
import { degrees, unitSuffix, type Weather, type WeatherUnits } from "@/features/weather";
import styles from "./Weather.module.css";
import { weatherIcon } from "./WeatherIcon";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

/** "Today" for the first entry, then the short weekday of the date-only value. */
function dayName(date: string, index: number): string {
  if (index === 0) return "Today";
  return weekday.format(new Date(`${date}T12:00:00Z`));
}

/** Daily five-day strip shared by the right-column card and the header popover. */
export function ForecastStrip({ days, units }: { days: Weather["days"]; units: WeatherUnits }) {
  return (
    <ul className={styles.strip} aria-label="Five-day forecast">
      {days.map((day, i) => {
        const Icon = weatherIcon(day.group, true);
        return (
          <li
            key={day.date}
            className={styles.day}
            aria-label={`${day.label}, high ${Math.round(day.high)}${unitSuffix(units)}, low ${Math.round(day.low)}${unitSuffix(units)}`}
          >
            <span className={styles.dayName}>{dayName(day.date, i)}</span>
            <Icon className={styles.dayIcon} weight={i === 0 ? "fill" : "regular"} aria-hidden />
            <span className={styles.high}>{degrees(day.high)}</span>
            <span className={styles.low}>{degrees(day.low)}</span>
            {day.precipProbability !== null && day.precipProbability > 0 ? (
              <span className={styles.precip}>
                <Drop aria-hidden />
                {Math.round(day.precipProbability)}%
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
