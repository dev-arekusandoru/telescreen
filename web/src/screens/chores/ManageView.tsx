import { Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { localDate } from "@/app/localdate";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { useChores, type Chore } from "@/features/chores";
import { useMembers } from "@/features/queries";
import { Avatar, cx, Switch } from "@/ui";
import styles from "./Chores.module.css";
import { ChoreEditor } from "./ChoreEditor";
import { assignmentLabel, recurrenceLabel } from "./labels";

/** Templates list with create / edit / archive. */
export function ManageView() {
  const { now, timeZone } = useHouseholdClock();
  const { data: chores = [], isError } = useChores();
  const { data: members = [] } = useMembers();
  const [editing, setEditing] = useState<Chore | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const active = chores.filter((c) => !c.archived);
  const archived = chores.filter((c) => c.archived);
  const shown = showArchived ? [...active, ...archived] : active;

  return (
    <div className={styles.wrap}>
      <div className={styles.manageTools}>
        <button type="button" className={styles.addBtn} onClick={() => setEditing("new")}>
          <Plus weight="bold" aria-hidden /> New chore
        </button>
        {archived.length > 0 ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            Show archived ({archived.length})
            <Switch checked={showArchived} onCheckedChange={setShowArchived} label="Show archived" />
          </span>
        ) : null}
      </div>
      {isError ? <p className={styles.empty}>Couldn’t load chores.</p> : null}
      {!isError && shown.length === 0 ? <p className={styles.empty}>No chores yet. Add the first one.</p> : null}
      {shown.map((c) => (
        <button key={c.id} type="button" className={cx(styles.mrow, c.archived && styles.archived)} onClick={() => setEditing(c)}>
          <span className={styles.ic} aria-hidden>
            {c.icon ?? "•"}
          </span>
          <div>
            <b>{c.name}</b>
            <small>
              {recurrenceLabel(c.recurrence)} · {assignmentLabel(c, members)}
              {c.archived ? " · Archived" : ""}
            </small>
          </div>
          <span className={styles.avs}>
            {c.memberIds.map((id) => {
              const m = members.find((x) => x.id === id);
              return m ? <Avatar key={id} colorToken={m.colorToken} initial={m.initial} size={28} /> : null;
            })}
          </span>
        </button>
      ))}
      <ChoreEditor
        open={editing !== null}
        chore={editing === "new" ? null : editing}
        members={members}
        today={localDate(now, timeZone)}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
