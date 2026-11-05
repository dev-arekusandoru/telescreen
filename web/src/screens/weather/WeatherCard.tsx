import { useSettings } from "@/features/queries";
import { useWeather } from "@/features/weather";
import { WeatherBody } from "./WeatherBody";
import styles from "./Weather.module.css";

/** Right-column card (>= 1280px): current conditions, Daily/Hourly forecast. Hidden when the module is off or unavailable. */
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

  return (
    <section className={styles.card} aria-label="Weather">
      <h2 className={styles.cardTitle}>
        Weather
        {data.place ? <span className={styles.place}>{data.place}</span> : null}
      </h2>
      <WeatherBody weather={data} />
    </section>
  );
}
