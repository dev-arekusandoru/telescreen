import { useCallback, useState } from "react";
import {
  errorMessage,
  useCompleteOccurrence,
  useReassignOccurrence,
  useSkipOccurrence,
  useUndoOccurrence,
  type ChoreOccurrence,
} from "@/features/chores";
import { useMembers } from "@/features/queries";
import { useToast } from "@/ui";

/** How long the "Undo" toast stays after completing a chore (SPEC §5.1). */
export const UNDO_MS = 10_000;

/**
 * Tap handling shared by Today and Week. Open occurrence → confirmation sheet (`pending`);
 * done occurrence → undo right away, with a toast that can redo it.
 */
export function useChoreActions() {
  const toast = useToast();
  const { data: members = [] } = useMembers();
  const complete = useCompleteOccurrence();
  const undo = useUndoOccurrence();
  const skip = useSkipOccurrence();
  const reassign = useReassignOccurrence();
  const [pending, setPending] = useState<ChoreOccurrence | null>(null);

  const fail = useCallback((error: unknown) => toast({ message: errorMessage(error) }), [toast]);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Someone";

  const undoOccurrence = useCallback(
    (id: string, onUndone?: () => void) => undo.mutate({ id }, { onSuccess: onUndone, onError: fail }),
    [undo, fail],
  );

  const confirm = useCallback(
    (occ: ChoreOccurrence, completedBy: string) => {
      setPending(null);
      complete.mutate(
        { id: occ.id, completedBy },
        {
          onError: fail,
          onSuccess: () =>
            toast({
              message: `${nameOf(completedBy)} completed “${occ.name}”`,
              duration: UNDO_MS,
              action: { label: "Undo", onClick: () => undoOccurrence(occ.id) },
            }),
        },
      );
    },
    [complete, fail, toast, undoOccurrence, members],
  );

  const tap = useCallback(
    (occ: ChoreOccurrence) => {
      if (occ.status === "open") {
        setPending(occ);
      } else if (occ.status === "done") {
        const by = occ.completedBy;
        undoOccurrence(occ.id, () =>
          toast({
            message: "Marked not done",
            duration: UNDO_MS,
            action: {
              label: "Undo",
              onClick: () => by && complete.mutate({ id: occ.id, completedBy: by }, { onError: fail }),
            },
          }),
        );
      }
    },
    [undoOccurrence, toast, complete, fail],
  );

  const skipPending = useCallback(
    (occ: ChoreOccurrence) => {
      setPending(null);
      skip.mutate(
        { id: occ.id },
        {
          onError: fail,
          onSuccess: () =>
            toast({
              message: `Skipped “${occ.name}”`,
              duration: UNDO_MS,
              action: { label: "Undo", onClick: () => undoOccurrence(occ.id) },
            }),
        },
      );
    },
    [skip, fail, toast, undoOccurrence],
  );

  const reassignPending = useCallback(
    (occ: ChoreOccurrence, memberId: string) => {
      setPending(null);
      reassign.mutate({ id: occ.id, memberId }, { onError: fail });
    },
    [reassign, fail],
  );

  return {
    pending,
    close: () => setPending(null),
    tap,
    confirm,
    skip: skipPending,
    reassign: reassignPending,
  };
}
