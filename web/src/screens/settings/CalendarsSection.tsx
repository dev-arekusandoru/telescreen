import { Lock, Warning } from "@phosphor-icons/react";
import { useAccounts, useUpdateCalendar } from "@/features/accounts";
import { useCalendars, type CalendarInfo } from "@/features/calendar";
import { useMembers, useSettings, useUpdateSettings, type Member } from "@/features/queries";
import { Select, Switch, memberColorStyle, type SelectOption } from "@/ui";
import styles from "./Accounts.module.css";
import settings from "./Settings.module.css";

const FAMILY = "family";
const NONE = "none";

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

function memberOptions(members: readonly Member[]): SelectOption[] {
  return [
    { value: FAMILY, label: "Family / Both", dot: memberColorStyle(null) },
    ...members.map((m) => ({ value: m.id, label: m.name, dot: memberColorStyle(m.colorToken) })),
  ];
}

function CalendarRow({ calendar, members }: { calendar: CalendarInfo; members: readonly Member[] }) {
  const update = useUpdateCalendar();
  const owner = members.find((m) => m.id === calendar.memberId);
  return (
    <div className={`${settings.row} ${styles.cal}`}>
      <span className={styles.calDot} style={memberColorStyle(owner?.colorToken)} aria-hidden />
      <div className={styles.main}>
        <b>{calendar.name}</b>
        <small>
          {calendar.writable ? (
            "Can create events"
          ) : (
            <span className={styles.lock}>
              <Lock aria-hidden /> Read-only
            </span>
          )}
          {" · "}
          {calendar.lastSyncedAt ? `Synced ${ago(calendar.lastSyncedAt, new Date())}` : "Not synced yet"}
        </small>
        {calendar.lastError ? (
          <small className={styles.warn} role="status">
            <Warning aria-hidden />
            <span>{calendar.lastError}</span>
          </small>
        ) : null}
      </div>
      <div className={styles.controls}>
        <Select
          label={`Person for ${calendar.name}`}
          value={calendar.memberId ?? FAMILY}
          options={memberOptions(members)}
          disabled={update.isPending}
          onValueChange={(v) => update.mutate({ id: calendar.id, memberId: v === FAMILY ? null : v })}
        />
        <Switch
          label={`Show ${calendar.name}`}
          checked={calendar.enabled}
          disabled={update.isPending}
          onCheckedChange={(enabled) => update.mutate({ id: calendar.id, enabled })}
        />
      </div>
    </div>
  );
}

/** Default write calendar per member (`defaultWriteCalendarId` setting). */
function DefaultCalendars({ calendars, members }: { calendars: readonly CalendarInfo[]; members: readonly Member[] }) {
  const { data: prefs } = useSettings();
  const update = useUpdateSettings();
  const writable = calendars.filter((c) => c.writable && c.enabled);
  if (members.length === 0 || writable.length === 0 || !prefs) return null;
  const options: SelectOption[] = [{ value: NONE, label: "Ask each time" }, ...writable.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <>
      <h3 className={styles.sub}>New events go to</h3>
      {members.map((m) => {
        const current = prefs.defaultWriteCalendarId[m.id] ?? null;
        const value = current && writable.some((c) => c.id === current) ? current : NONE;
        return (
          <div key={m.id} className={`${settings.row} ${styles.defRow}`}>
            <span className={styles.calDot} style={memberColorStyle(m.colorToken)} aria-hidden />
            <b>{m.name}</b>
            <div className={settings.end}>
              <Select
                label={`Default calendar for ${m.name}`}
                value={value}
                options={options}
                disabled={update.isPending}
                onValueChange={(v) =>
                  update.mutate({ defaultWriteCalendarId: { ...prefs.defaultWriteCalendarId, [m.id]: v === NONE ? null : v } })
                }
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Settings > Calendars: per-calendar visibility and person mapping, plus per-member default write calendar. */
export function CalendarsSection() {
  const { data: calendars = [] } = useCalendars();
  const { data: accounts = [] } = useAccounts();
  const { data: members = [] } = useMembers();

  return (
    <section className={settings.sec} aria-labelledby="calendars-h">
      <h2 id="calendars-h">Calendars</h2>
      {calendars.length === 0 ? (
        <p className={styles.hint}>Calendars appear here after an account syncs.</p>
      ) : (
        <p className={styles.hint}>Each calendar belongs to one person or the family and takes their color.</p>
      )}
      {accounts.map((account) => {
        const list = calendars.filter((c) => c.accountId === account.id);
        if (list.length === 0) return null;
        return (
          <div key={account.id} role="group" aria-label={account.label}>
            <h3 className={styles.sub}>{account.label}</h3>
            {list.map((c) => (
              <CalendarRow key={c.id} calendar={c} members={members} />
            ))}
          </div>
        );
      })}
      <DefaultCalendars calendars={calendars} members={members} />
    </section>
  );
}
