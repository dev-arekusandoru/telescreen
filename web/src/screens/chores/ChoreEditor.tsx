import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, X } from "@phosphor-icons/react";
import { useId, useState } from "react";
import {
  errorMessage,
  useSaveChore,
  type Chore,
  type ChoreAssignment,
  type ChoreRecurrenceInput,
  type CreateChore,
} from "@/features/chores";
import type { Member } from "@/features/queries";
import { Avatar, memberColorStyle, useToast } from "@/ui";
import styles from "./Sheet.module.css";
import { WEEKDAY_SHORT } from "./labels";

type Kind = "once" | "daily" | "days" | "weekly" | "monthly";

interface Draft {
  name: string;
  icon: string;
  notes: string;
  minutes: string;
  dueTime: string;
  kind: Kind;
  date: string;
  days: number[];
  weekday: number;
  every: number;
  monthDay: number;
  assignment: ChoreAssignment;
  /** Ordered: the rotation order (rotating) or the single assignee (fixed). */
  memberIds: string[];
}

const EMOJI = ["🍽️", "🧺", "🗑️", "🧹", "🛏️", "🪴", "🐕", "🚗", "🛒", "🧽", "🚿", "📦"];

const KINDS: ReadonlyArray<{ value: Kind; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "days", label: "Selected days" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "once", label: "One-off" },
];

const ASSIGNMENTS: ReadonlyArray<{ value: ChoreAssignment; label: string }> = [
  { value: "fixed", label: "One person" },
  { value: "rotating", label: "Rotating" },
  { value: "either", label: "Either of us" },
];

function draftFrom(chore: Chore | null, members: readonly Member[], today: string): Draft {
  const base: Draft = {
    name: "",
    icon: "",
    notes: "",
    minutes: "",
    dueTime: "",
    kind: "daily",
    date: today,
    days: [1, 3, 5],
    weekday: 1,
    every: 1,
    monthDay: 1,
    assignment: "rotating",
    memberIds: members.map((m) => m.id),
  };
  if (!chore) return base;
  const rec = chore.recurrence;
  return {
    ...base,
    name: chore.name,
    icon: chore.icon ?? "",
    notes: chore.notes ?? "",
    minutes: chore.estimatedMinutes ? String(chore.estimatedMinutes) : "",
    dueTime: chore.dueTime ?? "",
    kind: rec.type === "weekdays" ? "days" : rec.type,
    date: rec.type === "once" ? rec.date : today,
    days: rec.type === "weekdays" ? rec.days : base.days,
    weekday: rec.type === "weekly" ? rec.weekday : base.weekday,
    every: rec.type === "weekly" ? rec.every : 1,
    monthDay: rec.type === "monthly" ? rec.day : 1,
    assignment: chore.assignment,
    memberIds: chore.memberIds,
  };
}

/** Keep the original anchor for unchanged schedules so the server sees "no schedule change". */
function recurrenceFrom(d: Draft, original: Chore | null): ChoreRecurrenceInput {
  const start = original && original.recurrence.type !== "once" ? { start: original.recurrence.start } : {};
  switch (d.kind) {
    case "once":
      return { type: "once", date: d.date };
    case "daily":
      return { type: "daily", ...start };
    case "days":
      return { type: "weekdays", days: d.days, ...start };
    case "weekly":
      return { type: "weekly", every: d.every, weekday: d.weekday, ...start };
    case "monthly":
      return { type: "monthly", day: d.monthDay, ...start };
  }
}

function valid(d: Draft): boolean {
  if (d.name.trim() === "") return false;
  if (d.kind === "days" && d.days.length === 0) return false;
  if (d.kind === "once" && d.date === "") return false;
  if (d.assignment === "fixed") return d.memberIds.length === 1;
  if (d.assignment === "rotating") return d.memberIds.length >= 2;
  return true;
}

/** Create / edit a chore template: icon, schedule, assignment and rotation order. */
export function ChoreEditor({
  open,
  chore,
  members,
  today,
  onClose,
}: {
  open: boolean;
  /** `null` = create. */
  chore: Chore | null;
  members: readonly Member[];
  today: string;
  onClose(): void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        <Dialog.Content className={styles.sheet} aria-describedby={undefined}>
          <Dialog.Title className={styles.heading}>{chore ? "Edit chore" : "New chore"}</Dialog.Title>
          <Dialog.Close className={styles.close} aria-label="Close">
            <X aria-hidden />
          </Dialog.Close>
          {open ? <Form key={chore?.id ?? "new"} chore={chore} members={members} today={today} onDone={onClose} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Form({
  chore,
  members,
  today,
  onDone,
}: {
  chore: Chore | null;
  members: readonly Member[];
  today: string;
  onDone(): void;
}) {
  const id = useId();
  const toast = useToast();
  const save = useSaveChore();
  const [d, setD] = useState(() => draftFrom(chore, members, today));
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const memberName = (mid: string) => members.find((m) => m.id === mid);

  function changeAssignment(assignment: ChoreAssignment) {
    const ids = d.memberIds.length > 0 ? d.memberIds : members.map((m) => m.id);
    set({
      assignment,
      memberIds: assignment === "either" ? [] : assignment === "fixed" ? ids.slice(0, 1) : ids.length >= 2 ? ids : members.map((m) => m.id),
    });
  }

  function move(index: number, by: -1 | 1) {
    const next = [...d.memberIds];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    set({ memberIds: next });
  }

  function submit(patchOnly?: { archived: boolean }) {
    const body = patchOnly ?? {
      name: d.name.trim(),
      icon: d.icon.trim() || null,
      notes: d.notes.trim() || null,
      recurrence: recurrenceFrom(d, chore),
      assignment: d.assignment,
      memberIds: d.assignment === "either" ? [] : d.memberIds,
      dueTime: d.dueTime || null,
      estimatedMinutes: d.minutes ? Number(d.minutes) : null,
    };
    save.mutate(
      { id: chore?.id ?? null, body: body as CreateChore },
      { onSuccess: onDone, onError: (e) => toast({ message: errorMessage(e) }) },
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid(d)) submit();
      }}
    >
      <div className={styles.fld}>
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} className={styles.inp} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Empty the dishwasher" autoFocus={!chore} />
      </div>

      <div className={styles.fld}>
        <label htmlFor={`${id}-icon`}>Icon</label>
        <input id={`${id}-icon`} className={styles.inp} value={d.icon} maxLength={8} onChange={(e) => set({ icon: e.target.value })} placeholder="Pick or type an emoji" />
        <div className={styles.emojis}>
          {EMOJI.map((e) => (
            <button key={e} type="button" className={styles.emoji} aria-pressed={d.icon === e} aria-label={`Icon ${e}`} onClick={() => set({ icon: d.icon === e ? "" : e })}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fld}>
        <label htmlFor={`${id}-kind`}>Repeats</label>
        <select id={`${id}-kind`} className={styles.inp} value={d.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {d.kind === "once" ? (
        <div className={styles.fld}>
          <label htmlFor={`${id}-date`}>Date</label>
          <input id={`${id}-date`} type="date" className={styles.inp} value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
      ) : null}

      {d.kind === "days" ? (
        <div className={styles.fld}>
          <span className={styles.label}>On</span>
          <div className={styles.days}>
            {WEEKDAY_SHORT.map((name, i) => (
              <button
                key={name}
                type="button"
                className={styles.day}
                aria-pressed={d.days.includes(i)}
                onClick={() => set({ days: d.days.includes(i) ? d.days.filter((x) => x !== i) : [...d.days, i].sort() })}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {d.kind === "weekly" ? (
        <div className={`${styles.fld} ${styles.row2}`}>
          <div>
            <label htmlFor={`${id}-every`}>Every</label>
            <select id={`${id}-every`} className={styles.inp} value={d.every} onChange={(e) => set({ every: Number(e.target.value) })}>
              {[1, 2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "week" : `${n} weeks`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-weekday`}>On</label>
            <select id={`${id}-weekday`} className={styles.inp} value={d.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
              {WEEKDAY_SHORT.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {d.kind === "monthly" ? (
        <div className={styles.fld}>
          <label htmlFor={`${id}-mday`}>Day of month</label>
          <input id={`${id}-mday`} type="number" min={1} max={31} className={styles.inp} value={d.monthDay} onChange={(e) => set({ monthDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
        </div>
      ) : null}

      <div className={styles.fld}>
        <span className={styles.label}>Who</span>
        <div className={styles.pick} role="group" aria-label="Assignment">
          {ASSIGNMENTS.map((a) => (
            <button key={a.value} type="button" className={styles.pill} aria-pressed={d.assignment === a.value} onClick={() => changeAssignment(a.value)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {d.assignment === "fixed" ? (
        <div className={styles.fld}>
          <div className={styles.pick} role="radiogroup" aria-label="Assignee">
            {members.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={d.memberIds[0] === m.id} className={styles.pill} style={memberColorStyle(m.colorToken)} onClick={() => set({ memberIds: [m.id] })}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {d.assignment === "rotating" ? (
        <div className={styles.fld}>
          <span className={styles.label}>Rotation order (first goes first)</span>
          <div className={styles.order}>
            {d.memberIds.map((mid, i) => {
              const m = memberName(mid);
              return (
                <div key={mid} className={styles.orderRow} style={memberColorStyle(m?.colorToken)}>
                  <span className={styles.orderIdx}>{i + 1}</span>
                  {m ? <Avatar colorToken={m.colorToken} initial={m.initial} size={28} /> : null}
                  <b>{m?.name ?? "Unknown"}</b>
                  <button type="button" className={styles.iconBtn} aria-label={`Move ${m?.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden />
                  </button>
                  <button type="button" className={styles.iconBtn} aria-label={`Move ${m?.name} down`} disabled={i === d.memberIds.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown aria-hidden />
                  </button>
                  <button type="button" className={styles.iconBtn} aria-label={`Remove ${m?.name}`} disabled={d.memberIds.length <= 2} onClick={() => set({ memberIds: d.memberIds.filter((x) => x !== mid) })}>
                    <X aria-hidden />
                  </button>
                </div>
              );
            })}
            {members
              .filter((m) => !d.memberIds.includes(m.id))
              .map((m) => (
                <button key={m.id} type="button" className={styles.pill} onClick={() => set({ memberIds: [...d.memberIds, m.id] })}>
                  + Add {m.name}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className={`${styles.fld} ${styles.row2}`}>
        <div>
          <label htmlFor={`${id}-time`}>Due time (optional)</label>
          <input id={`${id}-time`} type="time" className={styles.inp} value={d.dueTime} onChange={(e) => set({ dueTime: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-min`}>Minutes (optional)</label>
          <input id={`${id}-min`} type="number" min={1} max={1440} className={styles.inp} value={d.minutes} onChange={(e) => set({ minutes: e.target.value })} />
        </div>
      </div>

      <div className={styles.fld}>
        <label htmlFor={`${id}-notes`}>Notes</label>
        <textarea id={`${id}-notes`} className={styles.inp} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className={styles.actions}>
        {chore ? (
          <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={save.isPending} onClick={() => submit({ archived: !chore.archived })}>
            {chore.archived ? "Restore" : "Archive"}
          </button>
        ) : null}
        <button type="submit" className={styles.btn} disabled={!valid(d) || save.isPending}>
          {chore ? "Save" : "Add chore"}
        </button>
      </div>
    </form>
  );
}
