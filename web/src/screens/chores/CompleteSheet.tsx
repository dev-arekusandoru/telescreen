import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { useState } from "react";
import type { ChoreOccurrence } from "@/features/chores";
import type { Member } from "@/features/queries";
import { Avatar, memberColorStyle } from "@/ui";
import styles from "./Sheet.module.css";

/**
 * Completion confirmation. Assigned chores preselect the assignee, so confirming is one tap;
 * "either" chores have no preselection and picking a member completes straight away.
 */
export function CompleteSheet({
  occurrence,
  members,
  onConfirm,
  onSkip,
  onReassign,
  onClose,
}: {
  occurrence: ChoreOccurrence | null;
  members: readonly Member[];
  onConfirm(occurrence: ChoreOccurrence, memberId: string): void;
  onSkip(occurrence: ChoreOccurrence): void;
  onReassign(occurrence: ChoreOccurrence, memberId: string): void;
  onClose(): void;
}) {
  return (
    <Dialog.Root open={occurrence !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        <Dialog.Content className={styles.sheet} aria-describedby={undefined}>
          {occurrence ? (
            <Body
              key={occurrence.id}
              occurrence={occurrence}
              members={members}
              onConfirm={onConfirm}
              onSkip={onSkip}
              onReassign={onReassign}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({
  occurrence,
  members,
  onConfirm,
  onSkip,
  onReassign,
}: {
  occurrence: ChoreOccurrence;
  members: readonly Member[];
  onConfirm(occurrence: ChoreOccurrence, memberId: string): void;
  onSkip(occurrence: ChoreOccurrence): void;
  onReassign(occurrence: ChoreOccurrence, memberId: string): void;
}) {
  const either = occurrence.assigneeId === null;
  const [picked, setPicked] = useState<string | null>(occurrence.assigneeId);
  const pickedName = members.find((m) => m.id === picked)?.name;
  const others = members.filter((m) => m.id !== occurrence.assigneeId);

  return (
    <>
      <Dialog.Title className={styles.heading}>
        {occurrence.icon ? `${occurrence.icon} ` : ""}
        {occurrence.name}
      </Dialog.Title>
      <Dialog.Close className={styles.close} aria-label="Close">
        <X aria-hidden />
      </Dialog.Close>
      <p className={styles.sub}>Who did it?</p>
      <div className={styles.who}>
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={styles.whoBtn}
            style={memberColorStyle(m.colorToken)}
            aria-pressed={picked === m.id}
            onClick={() => (either ? onConfirm(occurrence, m.id) : setPicked(m.id))}
          >
            {m.id === occurrence.assigneeId ? <span className={styles.hint}>assigned</span> : null}
            <Avatar colorToken={m.colorToken} initial={m.initial} size={54} />
            {m.name}
          </button>
        ))}
      </div>
      {either ? null : (
        <button type="button" className={styles.btn} disabled={picked === null} onClick={() => picked && onConfirm(occurrence, picked)}>
          {pickedName ? `Mark done for ${pickedName}` : "Mark done"}
        </button>
      )}
      <div className={styles.linkRow}>
        {occurrence.assignment !== "either"
          ? others.map((m) => (
              <button key={m.id} type="button" className={styles.link} onClick={() => onReassign(occurrence, m.id)}>
                Hand to {m.name}
              </button>
            ))
          : null}
        <button type="button" className={styles.link} onClick={() => onSkip(occurrence)}>
          Skip this time
        </button>
      </div>
    </>
  );
}
