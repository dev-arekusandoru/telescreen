import { CloudRain, SunHorizon } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "@/features/queries";
import { degrees, unitSuffix, type Weather } from "@/features/weather";
import { HourlyStrip } from "./HourlyStrip";
import styles from "./Weather.module.css";
import { weatherIcon } from "./WeatherIcon";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const hhmm = (time: string) => time.slice(11, 16);

/** WHO UV bands; the label rides next to the number so the level never depends on color. */
const uvLabel = (uv: number) => (uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme");

/** Next sunrise/sunset from the first isDay flip in the hourly data (hour granularity). */
function sunEvent(hours: Weather["hours"]) {
  for (let i = 1; i < hours.length; i++) {
    const a = hours[i - 1];
    const b = hours[i];
    if (a && b && a.isDay !== b.isDay) return { kind: b.isDay ? "Sunrise" : "Sunset", at: hhmm(b.time) };
  }
  return null;
}

/** Fades its content in when `id` changes after mount (never on first render). */
function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const prev = useRef(id);
  const changed = prev.current !== id;
  useEffect(() => {
    prev.current = id;
  });
  return (
    <span key={id} className={[className, changed ? styles.swapIn : ""].filter(Boolean).join(" ") || undefined}>
      {children}
    </span>
  );
}

/** The line under the hero: rain within 6h wins over the next sun event. */
function SunLine({ hours, uv }: { hours: Weather["hours"]; uv: number | null }) {
  const rain = hours.slice(1, 7).find((h) => (h.precipProbability ?? 0) >= 50);
  const sun = sunEvent(hours);
  return (
    <div className={styles.line}>
      <Swap id={rain ? "rain" : (sun?.kind ?? "none")}>
        {rain ? (
          <>
            <CloudRain aria-hidden /> Rain ~{hhmm(rain.time)} · {Math.round(rain.precipProbability ?? 0)}%
          </>
        ) : sun ? (
          <>
            <SunHorizon aria-hidden /> {sun.kind} {sun.at}
          </>
        ) : null}
      </Swap>
      {uv !== null ? (
        <Swap id={uvLabel(uv)} className={styles.uv}>
          UV {Math.round(uv)} · {uvLabel(uv)}
        </Swap>
      ) : null}
    </div>
  );
}

/** Five rows with every range bar on the week's shared min/max scale. */
function DailyRows({ days, units }: { days: Weather["days"]; units: Weather["units"] }) {
  const lo = Math.min(...days.map((d) => d.low));
  const hi = Math.max(...days.map((d) => d.high));
  const span = hi - lo || 1;
  const suffix = unitSuffix(units);
  // Bars start empty and grow on first paint; later forecast changes glide via the CSS transition.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <ul className={styles.rows} aria-label="Five-day forecast">
      {days.map((d, i) => {
        const Icon = weatherIcon(d.group, true);
        const rain = d.precipProbability ?? 0;
        const name = i === 0 ? "Today" : weekday.format(new Date(`${d.date}T12:00:00Z`));
        return (
          <li
            key={d.date}
            className={styles.row}
            aria-label={`${name}, ${d.label}, high ${Math.round(d.high)}${suffix}, low ${Math.round(d.low)}${suffix}${rain > 0 ? `, ${Math.round(rain)}% chance of precipitation` : ""}`}
          >
            <span className={styles.rowDay}>{name}</span>
            <Icon className={styles.rowIcon} aria-hidden />
            <span className={styles.rowRain}>{rain > 0 ? `${Math.round(rain)}%` : ""}</span>
            <span className={styles.rowLow}>{degrees(d.low)}</span>
            <span className={styles.track} aria-hidden>
              <span className={styles.fill} style={{ left: `${((d.low - lo) / span) * 100}%`, width: grown ? `${((d.high - d.low) / span) * 100}%` : 0 }} />
            </span>
            <b>{degrees(d.high)}</b>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Everything in the weather widget below its title: current conditions, the sun/rain line and
 * the forecast. Tapping the forecast swaps Daily/Hourly (a hidden button gives keyboards the same).
 * Both the right-column card and the header popover render this, so the two are identical (SPEC §6).
 */
export function WeatherBody({ weather }: { weather: Weather }) {
  const { data: settings } = useSettings();
  const [daily, setDaily] = useState(true);
  const dailyRef = useRef<HTMLDivElement>(null);
  const hourlyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  // The stacked views are absolute, so the wrapper height is measured and eased to the active one.
  useLayoutEffect(() => {
    setHeight((daily ? dailyRef : hourlyRef).current?.offsetHeight);
  }, [daily, weather]);
  const uv = settings?.weather.showUv ? (weather.hours[0]?.uvIndex ?? null) : null;
  const Icon = weatherIcon(weather.current.group, weather.current.isDay);
  const flip = () => setDaily((d) => !d);

  return (
    <>
      <div className={styles.hero}>
        <Icon className={styles.heroIcon} weight="fill" aria-hidden />
        <b className={styles.heroTemp}>{degrees(weather.current.temperature)}</b>
        <div className={styles.heroSide}>
          <span className={styles.heroLabel}>{weather.current.label}</span>
          <span>
            H {degrees(weather.today.high)} · L {degrees(weather.today.low)}
          </span>
        </div>
      </div>
      <SunLine hours={weather.hours} uv={uv !== null && Math.round(uv) >= 1 ? uv : null} />
      <div className={styles.forecast} style={{ height }} onClick={flip}>
        <div ref={dailyRef} className={styles.view} data-active={daily || undefined} inert={!daily}>
          <DailyRows days={weather.days} units={weather.units} />
        </div>
        <div ref={hourlyRef} className={styles.view} data-active={daily ? undefined : true} inert={daily}>
          <HourlyStrip hours={weather.hours} units={weather.units} />
        </div>
        <button type="button" className={styles.swap} aria-label={`Showing ${daily ? "daily" : "hourly"} forecast. Switch to ${daily ? "hourly" : "daily"}.`} />
      </div>
      {weather.stale ? <p className={styles.stale}>Showing the last update — weather is offline.</p> : null}
    </>
  );
}
