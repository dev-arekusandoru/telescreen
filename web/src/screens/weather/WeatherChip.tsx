import * as Popover from "@radix-ui/react-popover";
import { useSettings } from "@/features/queries";
import { degrees, unitSuffix, useWeather } from "@/features/weather";
import { WeatherBody } from "./WeatherBody";
import styles from "./Weather.module.css";
import { weatherIcon } from "./WeatherIcon";

/**
 * Weather chip for the calendar header (SPEC §6), shown only while the right column is hidden.
 * Opens a popover rendering the same body as the weather widget.
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
          aria-label={`Weather${data.place ? ` in ${data.place}` : ""}: ${data.current.label}, ${Math.round(data.current.temperature)}${unit}. Open the forecast.`}
        >
          <Icon className={styles.chipIcon} weight="fill" aria-hidden />
          <span className={styles.chipTemp}>{degrees(data.current.temperature)}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.pop}
          sideOffset={8}
          align="end"
          collisionPadding={12}
          aria-label={`Weather${data.place ? ` in ${data.place}` : ""}`}
        >
          <WeatherBody weather={data} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
