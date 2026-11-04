import { CaretLeft, CaretRight, Users } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { addDays, formatDate, localDate, startOfWeek } from "@/app/localdate";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { ownerOf, useOccurrences, type ChoreOccurrence } from "@/features/chores";
import { useHousehold, useMembers } from "@/features/queries";
import { Avatar, cx, memberColorStyle } from "@/ui";
import styles from "./Chores.module.css";
import { CompleteSheet } from "./CompleteSheet";
import { useChoreActions } from "./useChoreActions";

/** Days × members overview of one week; tapping an open chip opens the same completion sheet. */
export function WeekView() {
  const { now, timeZone } = useHouseholdClock();
  const today = localDate(now, timeZone);
  const { data: household } = useHousehold();
  const { data: members = [] } = useMembers();
  const [offset, setOffset] = useState(0);
  const first = addDays(startOfWeek(today, household?.weekStart ?? 0), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const { data: list = [] } = useOccurrences({ from: days[0]!, to: days[6]! });
  const actions = useChoreActions();

  const visible = list.filter((o) => o.status !== "skipped");
  const columns: Array<{ id: string | null; title: string; colorToken: string | null; initial?: string }> = [
    ...members.map((m) => ({ id: m.id, title: m.name, colorToken: m.colorToken, initial: m.initial })),
    { id: null, title: "Shared", colorToken: null },
  ];

  return (
    <>
      <div className={styles.weekNav} style={{ marginBottom: 12 }}>
        <button type="button" className={styles.navBtn} aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
          <CaretLeft aria-hidden />
        </button>
        <button type="button" className={styles.navBtn} aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>
          <CaretRight aria-hidden />
        </button>
        <button type="button" className={styles.textBtn} onClick={() => setOffset(0)}>
          This week
        </button>
        <b style={{ marginLeft: 8, fontSize: 14 }}>
          {formatDate(days[0]!, { month: "short", day: "numeric" })} – {formatDate(days[6]!, { month: "short", day: "numeric" })}
        </b>
      </div>
      <div className={styles.wrap}>
        <div className={styles.grid} style={{ "--cols": columns.length } as CSSProperties} role="table" aria-label="Chores this week">
          <div role="row" style={{ display: "contents" }}>
            <div role="columnheader" />
            {columns.map((c) => (
              <div key={c.id ?? "shared"} role="columnheader" className={styles.gridHead} style={memberColorStyle(c.colorToken)}>
                {c.initial && c.colorToken ? <Avatar colorToken={c.colorToken} initial={c.initial} size={24} /> : <Users weight="fill" aria-hidden />}
                {c.title}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} role="row" style={{ display: "contents" }}>
              <div role="rowheader" className={cx(styles.dayCell, day === today && styles.today)}>
                <small>{formatDate(day, { weekday: "short" })}</small>
                {formatDate(day, { month: "short", day: "numeric" })}
              </div>
              {columns.map((c) => {
                const items = visible.filter(
                  (o) => o.dueDate === day && (c.id === null ? ownerOf(o) === null : ownerOf(o) === c.id),
                );
                return (
                  <div key={c.id ?? "shared"} role="cell" className={styles.cell}>
                    {items.length === 0 ? <span className={styles.dash}>–</span> : null}
                    {items.map((o) => (
                      <Chip key={o.id} occ={o} day={day} today={today} onTap={actions.tap} colorToken={c.colorToken} />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <CompleteSheet
        occurrence={actions.pending}
        members={members}
        onConfirm={actions.confirm}
        onSkip={actions.skip}
        onReassign={actions.reassign}
        onClose={actions.close}
      />
    </>
  );
}

function Chip({
  occ,
  day,
  today,
  colorToken,
  onTap,
}: {
  occ: ChoreOccurrence;
  day: string;
  today: string;
  colorToken: string | null;
  onTap(occ: ChoreOccurrence): void;
}) {
  const missed = occ.status === "missed";
  const past = occ.status === "open" && day < today;
  return (
    <button
      type="button"
      className={cx(styles.chip, occ.status === "done" && styles.doneChip, missed && styles.missed, past && styles.past)}
      style={memberColorStyle(colorToken)}
      disabled={missed}
      onClick={() => onTap(occ)}
      aria-label={`${occ.name}, ${occ.status}`}
    >
      {occ.icon ? <span aria-hidden>{occ.icon}</span> : null}
      <span>{occ.name}</span>
    </button>
  );
}
