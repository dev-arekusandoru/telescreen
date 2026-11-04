import { Clock, CalendarDots, ArrowsClockwise, Globe, House, MoonStars, CalendarBlank, type Icon } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { wakeLockSupported } from "@/app/wakeLock";
import { useUpdateHousehold } from "@/features/household";
import { useHousehold, useSettings, useUpdateSettings } from "@/features/queries";
import { SegmentedControl, Switch } from "@/ui";
import styles from "./Settings.module.css";

const IDLE_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "1", label: "1 min" },
  { value: "2", label: "2 min" },
  { value: "5", label: "5 min" },
  { value: "10", label: "10 min" },
];

const SYNC_OPTIONS = [
  { value: "1", label: "1 min" },
  { value: "5", label: "5 min" },
  { value: "10", label: "10 min" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
];

const WEEK_MODES = [
  { value: "rolling", label: "Next 7 days" },
  { value: "fixed", label: "Calendar week" },
] as const;

const WEEK_STARTS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
] as const;

function Row({ icon: Icon, title, hint, children }: { icon: Icon; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <Icon aria-hidden />
      <div>
        <b>{title}</b>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className={styles.end}>{children}</div>
    </div>
  );
}

/** A text field that commits on blur/Enter and shows the server's validation message. */
function CommitInput({
  label,
  value,
  onCommit,
  list,
  error,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  list?: string;
  error?: string | undefined;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <>
      <input
        className={styles.input}
        aria-label={label}
        value={draft}
        list={list}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {error ? (
        <small className={styles.err} role="alert">
          {error}
        </small>
      ) : null}
    </>
  );
}

const timeZones = (): string[] => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
};

/** Settings > General: household, wall-display behaviour, week mode, sync. */
export function GeneralSection() {
  const { data: settings } = useSettings();
  const { data: household } = useHousehold();
  const updateSettings = useUpdateSettings();
  const updateHousehold = useUpdateHousehold();
  const busy = !settings || updateSettings.isPending;
  const hhError = updateHousehold.error?.message;

  return (
    <section className={styles.sec} aria-labelledby="general-h">
      <h2 id="general-h">General</h2>

      <Row icon={House} title="Household name">
        {household ? (
          <CommitInput label="Household name" value={household.name} onCommit={(name) => updateHousehold.mutate({ name })} />
        ) : null}
      </Row>

      <Row icon={Globe} title="Time zone" hint="Events and chores display in this zone">
        {household ? (
          <>
            <CommitInput
              label="Time zone"
              value={household.timezone}
              list="tz-list"
              onCommit={(timezone) => updateHousehold.mutate({ timezone })}
              error={updateHousehold.variables?.timezone !== undefined ? hhError : undefined}
            />
            <datalist id="tz-list">
              {timeZones().map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </>
        ) : null}
      </Row>

      <Row icon={CalendarDots} title="Week view" hint="Rolling keeps today in the first column">
        <SegmentedControl
          label="Week view"
          value={settings?.weekMode ?? "rolling"}
          options={WEEK_MODES}
          onChange={(weekMode) => !busy && updateSettings.mutate({ weekMode })}
        />
      </Row>

      {settings?.weekMode === "fixed" && household ? (
        <Row icon={CalendarBlank} title="Week starts on">
          <SegmentedControl
            label="Week starts on"
            value={String(household.weekStart) as "0" | "1"}
            options={WEEK_STARTS}
            onChange={(v) => updateHousehold.mutate({ weekStart: Number(v) })}
          />
        </Row>
      ) : null}

      <Row icon={Clock} title="Return to today" hint="After this long with no touches, the calendar returns to the Week view">
        <SegmentedControl
          label="Return to today after"
          value={String(settings?.idleReturnMinutes ?? 2)}
          options={IDLE_OPTIONS}
          onChange={(v) => !busy && updateSettings.mutate({ idleReturnMinutes: Number(v) })}
        />
      </Row>

      <Row icon={ArrowsClockwise} title="Sync interval" hint="How often calendars are refreshed">
        <SegmentedControl
          label="Sync interval"
          value={String(settings?.syncIntervalMinutes ?? 5)}
          options={SYNC_OPTIONS}
          onChange={(v) => !busy && updateSettings.mutate({ syncIntervalMinutes: Number(v) })}
        />
      </Row>

      <Row
        icon={MoonStars}
        title="Keep screen awake"
        hint={wakeLockSupported() ? "Needs HTTPS (tailscale serve) on this device" : "Not supported by this browser"}
      >
        <Switch
          label="Keep screen awake"
          checked={settings?.keepAwake ?? true}
          disabled={busy}
          onCheckedChange={(keepAwake) => updateSettings.mutate({ keepAwake })}
        />
      </Row>
    </section>
  );
}
