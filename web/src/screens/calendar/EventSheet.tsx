import * as Dialog from "@radix-ui/react-dialog";
import { Trash, X } from "@phosphor-icons/react";
import { useId, useState } from "react";
import {
  type CalendarInfo,
  type EditableRepeat,
  type EventFields,
  type EventInstance,
  type Scope,
} from "@/features/calendar";
import type { Member } from "@/features/queries";
import { Switch } from "@/ui";
import styles from "./EventSheet.module.css";
import { addDays, addMinutes, instantToWall, wallToInstant } from "./tz";

/** Prefill for "new event": household wall-clock strings (`YYYY-MM-DDTHH:mm`), or dates when `allDay`. */
export interface SheetInitial {
  start: string;
  end: string;
  allDay: boolean;
}

export interface EventSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Event being edited / viewed. `null` = create. */
  event: EventInstance | null;
  initial: SheetInitial | null;
  calendars: readonly CalendarInfo[];
  members: readonly Member[];
  defaultCalendarId: string | null;
  timeZone: string;
  onCreate(fields: EventFields): void;
  onUpdate(event: EventInstance, patch: Partial<EventFields>, scope: Scope): void;
  onDelete(event: EventInstance, scope: Scope): void;
}

const REPEATS: ReadonlyArray<{ value: EditableRepeat; label: string }> = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function EventSheet(props: EventSheetProps) {
  const { open, onOpenChange, event } = props;
  const readOnly = event !== null && !event.writable;
  const heading = event === null ? "New event" : readOnly ? "Event" : "Edit event";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        <Dialog.Content className={styles.sheet} aria-describedby={undefined}>
          <Dialog.Title className={styles.heading}>{heading}</Dialog.Title>
          <Dialog.Close className={styles.close} aria-label="Close">
            <X aria-hidden />
          </Dialog.Close>
          <SheetBody {...props} readOnly={readOnly} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface FormState {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  calendarId: string;
  location: string;
  notes: string;
  repeat: EditableRepeat;
}

function initialForm(p: EventSheetProps, writable: readonly CalendarInfo[]): FormState {
  const calendarId = p.event?.calendarId ?? p.defaultCalendarId ?? writable[0]?.id ?? "";
  if (p.event) {
    const e = p.event;
    const repeat = (REPEATS.some((r) => r.value === e.repeat) ? e.repeat : "none") as EditableRepeat;
    const base = { title: e.title, calendarId, location: e.location ?? "", notes: e.notes ?? "", repeat };
    if (e.allDay) {
      const last = addDays(e.end, -1);
      return {
        ...base,
        allDay: true,
        startDate: e.start,
        endDate: last < e.start ? e.start : last,
        startTime: "09:00",
        endTime: "10:00",
      };
    }
    const s = instantToWall(e.start, p.timeZone);
    const en = instantToWall(e.end, p.timeZone);
    return {
      ...base,
      allDay: false,
      startDate: s.slice(0, 10),
      startTime: s.slice(11, 16),
      endDate: en.slice(0, 10),
      endTime: en.slice(11, 16),
    };
  }
  const init = p.initial ?? { allDay: false, start: instantToWall(new Date(), p.timeZone), end: "" };
  const base = { title: "", calendarId, location: "", notes: "", repeat: "none" as const };
  if (init.allDay) {
    const date = init.start.slice(0, 10);
    // `end` is exclusive (FullCalendar); the form shows the last day.
    const last = init.end ? addDays(init.end.slice(0, 10), -1) : date;
    return { ...base, allDay: true, startDate: date, endDate: last < date ? date : last, startTime: "09:00", endTime: "10:00" };
  }
  const start = init.start.slice(0, 16);
  const end = (init.end || addMinutes(start, 60)).slice(0, 16);
  return {
    ...base,
    allDay: false,
    startDate: start.slice(0, 10),
    startTime: start.slice(11, 16),
    endDate: end.slice(0, 10),
    endTime: end.slice(11, 16),
  };
}

function SheetBody(props: EventSheetProps & { readOnly: boolean }) {
  const { event, calendars, members, timeZone, readOnly, onOpenChange } = props;
  const writable = calendars.filter((c) => c.writable && c.enabled);
  const [form, setForm] = useState(() => initialForm(props, writable));
  const [prompt, setPrompt] = useState<"save" | "delete" | null>(null);
  const ids = { title: useId(), cal: useId(), sd: useId(), st: useId(), ed: useId(), et: useId(), loc: useId(), notes: useId(), rep: useId() };
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const memberName = (calendar: CalendarInfo) =>
    members.find((m) => m.id === calendar.memberId)?.name ?? "Family";
  const calendar = calendars.find((c) => c.id === form.calendarId);

  const range = form.allDay
    ? { start: form.startDate, end: addDays(form.endDate, 1), valid: form.endDate >= form.startDate }
    : (() => {
        const start = wallToInstant(`${form.startDate}T${form.startTime}`, timeZone);
        const end = wallToInstant(`${form.endDate}T${form.endTime}`, timeZone);
        return { start: start.toISOString(), end: end.toISOString(), valid: end > start };
      })();
  const canSave =
    form.title.trim() !== "" && range.valid && form.startDate !== "" && form.endDate !== "" && (event !== null || form.calendarId !== "");

  function fields(): EventFields {
    return {
      calendarId: form.calendarId,
      title: form.title.trim(),
      start: range.start,
      end: range.end,
      allDay: form.allDay,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
      repeat: form.repeat,
    };
  }

  function save(scope: Scope) {
    if (!event) return;
    const { calendarId: _calendar, repeat, ...rest } = fields();
    // A single occurrence cannot change its own recurrence rule.
    props.onUpdate(event, scope === "this" && event.recurring ? rest : { ...rest, repeat }, scope);
    onOpenChange(false);
  }

  function submit() {
    if (!canSave) return;
    if (!event) {
      props.onCreate(fields());
      onOpenChange(false);
    } else if (event.recurring) {
      setPrompt("save");
    } else {
      save("all");
    }
  }

  function remove(scope: Scope) {
    if (!event) return;
    props.onDelete(event, scope);
    onOpenChange(false);
  }

  if (readOnly && event) {
    return (
      <div className={styles.view}>
        <h3 className={styles.viewTitle}>{event.title}</h3>
        <p className={styles.when}>{describeWhen(event, timeZone)}</p>
        {event.recurring ? <p className={styles.meta}>Repeats {event.repeat === "custom" ? "on a custom schedule" : event.repeat}</p> : null}
        {event.location ? <p className={styles.meta}>{event.location}</p> : null}
        {event.notes ? <p className={styles.notes}>{event.notes}</p> : null}
        {calendar ? (
          <p className={styles.meta}>
            {memberName(calendar)} · {calendar.name}
          </p>
        ) : null}
        <p className={styles.hint}>This calendar is read-only.</p>
      </div>
    );
  }

  if (prompt && event) {
    return (
      <div className={styles.scope} role="group" aria-label="Recurring event">
        <p className={styles.sub}>
          {prompt === "save" ? "Apply your changes to" : "Delete"}
        </p>
        <button type="button" className={styles.btn} onClick={() => (prompt === "save" ? save("this") : remove("this"))}>
          This event
        </button>
        <button type="button" className={styles.btn} onClick={() => (prompt === "save" ? save("all") : remove("all"))}>
          All events
        </button>
        <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={() => setPrompt(null)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={styles.fld}>
        <label htmlFor={ids.title} className={styles.srOnly}>
          Title
        </label>
        <input
          id={ids.title}
          className={styles.inp}
          placeholder="Title"
          autoComplete="off"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>

      <div className={styles.fld}>
        <label htmlFor={ids.cal}>Calendar</label>
        {event ? (
          <p className={styles.static}>{calendar ? `${memberName(calendar)} · ${calendar.name}` : "Calendar"}</p>
        ) : writable.length === 0 ? (
          <p className={styles.hint}>No writable calendars. Connect one in Settings.</p>
        ) : (
          <select id={ids.cal} className={styles.inp} value={form.calendarId} onChange={(e) => set("calendarId", e.target.value)}>
            {writable.map((c) => (
              <option key={c.id} value={c.id}>
                {memberName(c)} · {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={`${styles.fld} ${styles.toggle}`}>
        <Switch label="All day" checked={form.allDay} onCheckedChange={(v) => set("allDay", v)} />
        <span aria-hidden="true">All day</span>
      </div>

      <div className={`${styles.fld} ${styles.row2}`}>
        <div>
          <label htmlFor={ids.sd}>Starts</label>
          <input id={ids.sd} type="date" className={styles.inp} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        {form.allDay ? null : (
          <div>
            <label htmlFor={ids.st}>Time</label>
            <input id={ids.st} type="time" step={900} className={styles.inp} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </div>
        )}
      </div>
      <div className={`${styles.fld} ${styles.row2}`}>
        <div>
          <label htmlFor={ids.ed}>Ends</label>
          <input id={ids.ed} type="date" className={styles.inp} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
        {form.allDay ? null : (
          <div>
            <label htmlFor={ids.et}>Time</label>
            <input id={ids.et} type="time" step={900} className={styles.inp} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>
        )}
      </div>
      {range.valid ? null : (
        <p className={styles.error} role="alert">
          The end must be after the start.
        </p>
      )}

      <div className={styles.fld}>
        <label htmlFor={ids.loc}>Location</label>
        <input id={ids.loc} className={styles.inp} autoComplete="off" value={form.location} onChange={(e) => set("location", e.target.value)} />
      </div>
      <div className={styles.fld}>
        <label htmlFor={ids.notes}>Notes</label>
        <textarea id={ids.notes} className={styles.inp} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className={styles.fld}>
        <label htmlFor={ids.rep}>Repeat</label>
        <select id={ids.rep} className={styles.inp} value={form.repeat} onChange={(e) => set("repeat", e.target.value as EditableRepeat)}>
          {REPEATS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className={styles.btn} disabled={!canSave}>
        {event ? "Save" : calendar ? `Add to ${memberName(calendar)}’s calendar` : "Add event"}
      </button>
      {event ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.ghost} ${styles.danger}`}
          onClick={() => (event.recurring ? setPrompt("delete") : remove("all"))}
        >
          <Trash aria-hidden /> Delete event
        </button>
      ) : null}
    </form>
  );
}

function describeWhen(event: EventInstance, timeZone: string): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  if (event.allDay) {
    const last = addDays(event.end, -1);
    return last > event.start ? `${day(event.start)} – ${day(last)}` : `${day(event.start)} · All day`;
  }
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
  const startDay = instantToWall(event.start, timeZone).slice(0, 10);
  return `${day(startDay)} · ${time(event.start)} – ${time(event.end)}`;
}
