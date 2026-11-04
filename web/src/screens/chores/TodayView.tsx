import { Check, Swap, Users } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { formatDate, localDate } from "@/app/localdate";
import { MemberProgress } from "@/app/MemberProgress";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { ownerOf, progressFor, useOccurrences, type ChoreOccurrence } from "@/features/chores";
import { useMembers, type Member } from "@/features/queries";
import { Avatar, cx, memberColorStyle } from "@/ui";
import styles from "./Chores.module.css";
import { CompleteSheet } from "./CompleteSheet";
import { occurrenceMeta } from "./labels";
import { useChoreActions } from "./useChoreActions";

export function TodayView() {
  const { now, timeZone } = useHouseholdClock();
  const today = localDate(now, timeZone);
  const { data: members = [] } = useMembers();
  const { data: all = [], isLoading, isError } = useOccurrences({ from: today, to: today, carryover: true });
  const actions = useChoreActions();

  // Missed and skipped never show on Today.
  const list = all.filter((o) => o.status === "open" || o.status === "done");
  const shared = list.filter((o) => o.status === "open" && o.assigneeId === null);

  return (
    <>
      <MemberProgress progress={progressFor(list)} />
      <div className={styles.wrap}>
        {isError ? (
          <p className={styles.empty}>Couldn’t load today’s chores.</p>
        ) : (
          <div className={styles.cols} aria-busy={isLoading}>
            {members.map((m) => {
              const mine = list.filter((o) => ownerOf(o) === m.id);
              const done = mine.filter((o) => o.status === "done").length;
              return (
                <Column
                  key={m.id}
                  title={m.name}
                  colorToken={m.colorToken}
                  lead={<Avatar colorToken={m.colorToken} initial={m.initial} size={30} />}
                  note={mine.length ? `${done} of ${mine.length} done` : null}
                  items={mine}
                  members={members}
                  today={today}
                  onTap={actions.tap}
                />
              );
            })}
            <Column
              title="Shared"
              colorToken={null}
              lead={<Users weight="fill" aria-hidden />}
              note="anyone can do"
              items={shared}
              members={members}
              today={today}
              onTap={actions.tap}
            />
          </div>
        )}
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

function Column({
  title,
  colorToken,
  lead,
  note,
  items,
  members,
  today,
  onTap,
}: {
  title: string;
  colorToken: string | null;
  lead: ReactNode;
  note: string | null;
  items: ChoreOccurrence[];
  members: readonly Member[];
  today: string;
  onTap(occ: ChoreOccurrence): void;
}) {
  return (
    <section className={styles.col} style={memberColorStyle(colorToken)} aria-label={title}>
      <h2>
        {lead}
        {title}
        {note ? <em>{note}</em> : null}
      </h2>
      {items.length === 0 ? (
        <div className={styles.empty}>All clear ✓</div>
      ) : (
        items.map((occ) => (
          <ChoreRow key={occ.id} occ={occ} members={members} today={today} colorToken={colorToken} onTap={onTap} />
        ))
      )}
    </section>
  );
}

function ChoreRow({
  occ,
  members,
  today,
  colorToken,
  onTap,
}: {
  occ: ChoreOccurrence;
  members: readonly Member[];
  today: string;
  colorToken: string | null;
  onTap(occ: ChoreOccurrence): void;
}) {
  const done = occ.status === "done";
  const creditColor = done ? members.find((m) => m.id === occ.completedBy)?.colorToken : colorToken;
  const meta = occurrenceMeta(occ, members);
  const late = occ.dueDate < today ? `from ${formatDate(occ.dueDate, { weekday: "short" })}` : "";
  return (
    <button
      type="button"
      className={cx(styles.chore, done && styles.done)}
      style={memberColorStyle(creditColor ?? colorToken)}
      aria-pressed={done}
      aria-label={`${occ.name}${done ? ", done" : ""}`}
      onClick={() => onTap(occ)}
    >
      <span className={styles.chk}>
        <Check weight="bold" aria-hidden />
      </span>
      {occ.icon ? (
        <span className={styles.ci} aria-hidden>
          {occ.icon}
        </span>
      ) : null}
      <span className={styles.nm}>
        <b>{occ.name}</b>
        {meta || late ? (
          <small>
            {occ.assignment === "rotating" && !done ? <Swap aria-hidden /> : null}
            {[late, meta].filter(Boolean).join(" · ")}
          </small>
        ) : null}
      </span>
    </button>
  );
}
