import * as Popover from "@radix-ui/react-popover";
import { useSettings } from "@/features/queries";
import { degrees, unitSuffix, useWeather } from "@/features/weather";
import { ForecastStrip } from "./ForecastStrip";
import styles from "./Weather.module.css";
import { weatherIcon } from "./WeatherIcon";

/**
 * Weather chip for the calendar header (SPEC §6). Opens a popover with the 5-day strip.
 * Renders nothing while loading, when the module is off, or when the endpoint is unavailable.
 */
export function WeatherChip() {
  const { data: settings } = useSettings();
  const enabled = settings?.modules.weather === true;
  const { data: weather } = useWeather(enabled);
  const data = enabled ? weather : undefined;
  if (!data) return null;

  const Icon = weatherIcon(data.current.group, data.current.isDay);
  const unit = unitSuffix(data.units);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={styles.chip}
          aria-label={`Weather${data.place ? ` in ${data.place}` : ""}: ${data.current.label}, ${Math.round(data.current.temperature)}${unit}. Open the five-day forecast.`}
        >
          <Icon className={styles.chipIcon} weight="fill" aria-hidden />
          <span className={styles.chipTemp}>{degrees(data.current.temperature)}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.pop} sideOffset={8} align="end" collisionPadding={12}>
          <div className={styles.popHead}>
            <div>
              <b className={styles.popPlace}>{data.place ?? "Weather"}</b>
              <small>
                {data.current.label} · H {degrees(data.today.high)} L {degrees(data.today.low)}
              </small>
            </div>
            <span className={styles.popNow}>
              {Math.round(data.current.temperature)}
              {unit}
            </span>
          </div>
          <ForecastStrip days={data.days} units={data.units} />
          {data.stale ? <p className={styles.stale}>Showing the last update — weather is offline.</p> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
