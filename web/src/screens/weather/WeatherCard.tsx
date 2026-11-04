import { useSettings } from "@/features/queries";
import { degrees, unitSuffix, useWeather } from "@/features/weather";
import { ForecastStrip } from "./ForecastStrip";
import styles from "./Weather.module.css";
import { weatherIcon } from "./WeatherIcon";

/** Right-column card (>= 1280px): the 5-day strip. Hidden when the module is off or unavailable. */
export function WeatherCard() {
  const { data: settings } = useSettings();
  const { data, isError } = useWeather(settings?.modules.weather === true);

  if (settings?.modules.weather !== true) return null;
  if (!data) {
    return isError ? (
      <section className={styles.card} aria-label="Weather">
        <h2 className={styles.cardTitle}>Weather</h2>
        <p className={styles.unavailable}>Unavailable</p>
      </section>
    ) : null;
  }

  const Icon = weatherIcon(data.current.group, data.current.isDay);
  return (
    <section className={styles.card} aria-label="Weather">
      <h2 className={styles.cardTitle}>
        Weather
        {data.place ? <span className={styles.place}>{data.place}</span> : null}
      </h2>
      <div className={styles.now}>
        <Icon className={styles.nowIcon} weight="fill" aria-hidden />
        <b>{degrees(data.current.temperature)}</b>
        <span>{data.current.label}</span>
        <span className={styles.nowRange}>
          H {degrees(data.today.high)} L {degrees(data.today.low)}
        </span>
      </div>
      <ForecastStrip days={data.days} units={data.units} />
      {data.stale ? <p className={styles.stale}>Showing the last update — weather is offline.</p> : null}
    </section>
  );
}
