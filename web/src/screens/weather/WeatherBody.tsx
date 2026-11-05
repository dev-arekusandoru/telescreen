import { useState } from "react";
import { degrees, type Weather } from "@/features/weather";
import { SegmentedControl } from "@/ui";
import { ForecastStrip } from "./ForecastStrip";
import { HourlyStrip } from "./HourlyStrip";
import styles from "./Weather.module.css";
import { weatherIcon } from "./WeatherIcon";

type Scope = "daily" | "hourly";

const SCOPES: ReadonlyArray<{ value: Scope; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "hourly", label: "Hourly" },
];

/**
 * Everything in the weather widget below its title: current conditions, the Daily/Hourly
 * switch and the forecast itself. Both the right-column card and the header popover render
 * this, so the two are always identical (SPEC §6).
 */
export function WeatherBody({ weather }: { weather: Weather }) {
  const [scope, setScope] = useState<Scope>("daily");
  const Icon = weatherIcon(weather.current.group, weather.current.isDay);

  return (
    <>
      <div className={styles.now}>
        <Icon className={styles.nowIcon} weight="fill" aria-hidden />
        <b>{degrees(weather.current.temperature)}</b>
        <span>{weather.current.label}</span>
        <span className={styles.nowRange}>
          H {degrees(weather.today.high)} L {degrees(weather.today.low)}
        </span>
      </div>
      <div className={styles.scope}>
        <SegmentedControl label="Forecast range" value={scope} onChange={setScope} options={SCOPES} small />
      </div>
      {scope === "daily" ? (
        <ForecastStrip days={weather.days} units={weather.units} />
      ) : (
        <HourlyStrip hours={weather.hours} units={weather.units} />
      )}
      {weather.stale ? <p className={styles.stale}>Showing the last update — weather is offline.</p> : null}
    </>
  );
}
