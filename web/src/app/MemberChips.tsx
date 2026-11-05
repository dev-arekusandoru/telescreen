import * as Popover from "@radix-ui/react-popover";
import { Check } from "@phosphor-icons/react";
import { useState } from "react";
import { localDate } from "@/app/localdate";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { ownerOf, useChoreProgress, useOccurrences, type ChoreOccurrence } from "@/features/chores";
import { useMembers, type Member } from "@/features/queries";
import { timeLabel } from "@/screens/chores/labels";
import { cx, memberColorStyle, Switch } from "@/ui";
import styles from "./MemberChips.module.css";

interface Progress {
  done: number;
  total: number;
}

/** Ring geometry: a 32px square, 3px stroke, expressed in percent so any radius works. */
function ProgressRing({ p }: { p: Progress }) {
  const pct = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
  return (
    <svg className={styles.ring} viewBox="0 0 32 32" aria-hidden="true">
      <circle className={styles.track} cx="16" cy="16" r="14.1" pathLength={100} />
      {pct > 0 ? <circle className={styles.arc} cx="16" cy="16" r="14.1" pathLength={100} strokeDasharray={`${pct * 100} 100`} /> : null}
    </svg>
  );
}

/** Today's chores for one member, as shown inside their popover. */
function ChoreList({ member }: { member: Member }) {
  const { now, timeZone } = useHouseholdClock();
  const today = localDate(now, timeZone);
  const { data: all = [], isLoading } = useOccurrences({ from: today, to: today, carryover: true });
  const mine = all.filter((o) => ownerOf(o) === member.id && (o.status === "open" || o.status === "done"));
  // Open first, done last; carried-over chores keep their original position within each group.
  const items = [...mine.filter((o) => o.status === "open"), ...mine.filter((o) => o.status === "done")];
  if (isLoading) return <p className={styles.note}>Loading today’s chores…</p>;
  if (items.length === 0) return <p className={styles.note}>Nothing on today’s list.</p>;
  return (
    <ul className={styles.list}>
      {items.map((o) => (
        <ChoreLine key={o.id} occ={o} today={today} />
      ))}
    </ul>
  );
}

function ChoreLine({ occ, today }: { occ: ChoreOccurrence; today: string }) {
  const done = occ.status === "done";
  const meta = [occ.dueDate < today ? "carried over" : "", occ.dueTime ? `by ${timeLabel(occ.dueTime)}` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={cx(styles.line, done && styles.lineDone)}>
      <span className={styles.tick} aria-hidden="true">
        {done ? <Check weight="bold" /> : null}
      </span>
      <span className={styles.lineText}>
        <b>{occ.name}</b>
        {meta ? <small>{meta}</small> : null}
      </span>
    </li>
  );
}

function PersonPanel({
  member,
  progress,
  hidden,
  onToggle,
}: {
  member: Member;
  progress: Progress;
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.bigAvatar} style={memberColorStyle(member.colorToken)} aria-hidden="true">
          {member.initial}
        </span>
        <div className={styles.headText}>
          <b>{member.name}</b>
          <small>
            {progress.done}/{progress.total} done today
          </small>
        </div>
      </div>
      <ChoreList member={member} />
      <label className={styles.foot}>
        <span>
          <b>{hidden ? "Hidden from calendar" : "On the calendar"}</b>
          <small>{hidden ? "Their events are filtered out" : "Their events are showing"}</small>
        </span>
        <Switch label={`Show ${member.name} on the calendar`} checked={!hidden} onCheckedChange={onToggle} />
      </label>
    </div>
  );
}

/**
 * Compact header chip group: one ring chip per member.
 * The ring shows today's chore progress (done / total); tapping a chip opens a popover with the
 * member's list and the only control that filters their events out of the calendar. `hidden`
 * member ids render dimmed but stay tappable, so the popover is also the way to restore them.
 */
export function MemberChips({
  hidden,
  onToggle,
}: {
  hidden: readonly string[];
  onToggle: (memberId: string) => void;
}) {
  const { data: members = [] } = useMembers();
  const { now, timeZone } = useHouseholdClock();
  const { data: fetched } = useChoreProgress(timeZone ? localDate(now, timeZone) : null);
  const [openId, setOpenId] = useState<string | null>(null);
  if (members.length === 0) return null;

  const progress: Record<string, Progress> = Object.fromEntries(
    (fetched ?? []).map((p) => [p.memberId, { done: p.done, total: p.total }]),
  );

  return (
    <div className={styles.chips}>
      {members.map((m) => {
        const p = progress[m.id] ?? { done: 0, total: 0 };
        const off = hidden.includes(m.id);
        return (
          <Popover.Root
            key={m.id}
            open={openId === m.id}
            onOpenChange={(open) => setOpenId(open ? m.id : null)}
          >
            <Popover.Trigger asChild>
              <button
                type="button"
                className={cx(styles.person, off && styles.off)}
                style={memberColorStyle(m.colorToken)}
                aria-label={`${m.name}: ${p.done} of ${p.total} chores done today${off ? ", hidden from the calendar" : ""}`}
                title={`${m.name} · ${p.done}/${p.total}`}
              >
                <ProgressRing p={p} />
                <span className={styles.initial} aria-hidden="true">
                  {m.initial}
                </span>
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className={styles.pop}
                sideOffset={8}
                align="end"
                collisionPadding={12}
                aria-label={`${m.name} details`}
              >
                <PersonPanel member={m} progress={p} hidden={off} onToggle={() => onToggle(m.id)} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        );
      })}
    </div>
  );
}
