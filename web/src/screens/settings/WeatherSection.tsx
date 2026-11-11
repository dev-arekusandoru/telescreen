import { CloudSun, Crosshair, MapPin, Sun, Tag, Thermometer } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import { useSettings, useUpdateSettings, type UpdateSettings } from "@/features/queries";
import { weatherKeys, type WeatherSettings, type WeatherUnits } from "@/features/weather";
import { SegmentedControl, Switch, useToast } from "@/ui";
import styles from "./Settings.module.css";
import layout from "./WeatherSection.module.css";

const UNITS: ReadonlyArray<{ value: WeatherUnits; label: string }> = [
  { value: "celsius", label: "°C" },
  { value: "fahrenheit", label: "°F" },
];

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Numeric text field that commits on blur/Enter; an empty value commits `null`. */
function CoordInput({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => setDraft(value === null ? "" : String(value)), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === "") {
      if (value !== null) onCommit(null);
      return;
    }
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max && parsed !== value) onCommit(parsed);
    else setDraft(value === null ? "" : String(value));
  };

  return (
    <input
      className={layout.coord}
      type="number"
      inputMode="decimal"
      step="any"
      min={min}
      max={max}
      aria-label={label}
      placeholder={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/** Free-text label committed on blur/Enter; an empty value commits `null`. */
function PlaceInput({ value, onCommit }: { value: string | null; onCommit: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next !== (value ?? "")) onCommit(next === "" ? null : next);
  };

  return (
    <input
      className={styles.input}
      aria-label="Place label"
      placeholder="e.g. Home"
      value={draft}
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/** Settings > Modules > Weather: enable, location (device or manual), place label and units. */
export function WeatherSection() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [locating, setLocating] = useState(false);

  const weatherSettings = settings?.weather;
  const enabled = settings?.modules.weather ?? false;

  const save = (patch: UpdateSettings) =>
    update.mutate(patch, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: weatherKeys.weather }),
    });

  const saveLocation = (patch: Partial<WeatherSettings>) => {
    if (!weatherSettings) return;
    save({ weather: { ...weatherSettings, ...patch } });
  };

  const useDeviceLocation = () => {
    if (navigator.geolocation === undefined) {
      toast({ message: "This browser can't share a location." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        saveLocation({
          latitude: round4(position.coords.latitude),
          longitude: round4(position.coords.longitude),
        });
        toast({ message: "Weather location set from this device." });
      },
      (error) => {
        setLocating(false);
        toast({
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location permission denied."
              : "Couldn't read this device's location.",
        });
      },
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const busy = !settings || update.isPending;
  const coords = weatherSettings?.latitude != null && weatherSettings.longitude != null
    ? `${round4(weatherSettings.latitude)}, ${round4(weatherSettings.longitude)}`
    : "No location set";

  return (
    <section className={styles.sec} aria-labelledby="weather-h">
      <h2 id="weather-h">Weather</h2>

      <div className={styles.row}>
        <CloudSun aria-hidden />
        <div>
          <b>Weather</b>
          <small>Header chip and Daily/Hourly forecast (Open-Meteo, no account needed)</small>
        </div>
        <div className={styles.end}>
          <Switch
            label="Weather"
            checked={enabled}
            disabled={busy}
            onCheckedChange={(on) => settings && save({ modules: { ...settings.modules, weather: on } })}
          />
        </div>
      </div>

      <div className={styles.row}>
        <MapPin aria-hidden />
        <div>
          <b>Location</b>
          <small>{weatherSettings?.place ?? coords}</small>
          {weatherSettings?.place ? <small>{coords}</small> : null}
        </div>
        <div className={styles.end}>
          <button type="button" className={layout.locate} disabled={busy || locating} onClick={useDeviceLocation}>
            <Crosshair aria-hidden />
            {locating ? "Locating…" : "Use this device's location"}
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <Crosshair aria-hidden />
        <div>
          <b>Coordinates</b>
          <small>Latitude and longitude, decimal degrees</small>
        </div>
        <div className={layout.coords}>
          <CoordInput
            label="Latitude"
            value={weatherSettings?.latitude ?? null}
            min={-90}
            max={90}
            onCommit={(latitude) => !busy && saveLocation({ latitude })}
          />
          <CoordInput
            label="Longitude"
            value={weatherSettings?.longitude ?? null}
            min={-180}
            max={180}
            onCommit={(longitude) => !busy && saveLocation({ longitude })}
          />
        </div>
      </div>

      <div className={styles.row}>
        <Tag aria-hidden />
        <div>
          <b>Place label</b>
          <small>Optional, shown with the forecast</small>
        </div>
        <PlaceInput
          value={weatherSettings?.place ?? null}
          onCommit={(place) => !busy && saveLocation({ place })}
        />
      </div>

      <div className={styles.row}>
        <Thermometer aria-hidden />
        <div>
          <b>Units</b>
          <small>Temperature scale</small>
        </div>
        <div className={styles.end}>
          <SegmentedControl
            label="Temperature units"
            value={weatherSettings?.units ?? "celsius"}
            options={UNITS}
            onChange={(units) => !busy && saveLocation({ units })}
          />
        </div>
      </div>

      <div className={styles.row}>
        <Sun aria-hidden />
        <div>
          <b>UV index</b>
          <small>Show the current UV level under the temperature</small>
        </div>
        <div className={styles.end}>
          <Switch
            label="UV index"
            checked={weatherSettings?.showUv ?? false}
            disabled={busy}
            onCheckedChange={(showUv) => saveLocation({ showUv })}
          />
        </div>
      </div>

      {update.error ? (
        <p className={styles.err} role="alert">
          {errorMessage(update.error)}
        </p>
      ) : null}
    </section>
  );
}
