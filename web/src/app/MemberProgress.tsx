import { useMembers } from "@/features/queries";
import { Avatar, cx, memberColorStyle } from "@/ui";
import styles from "./MemberProgress.module.css";

export interface Progress {
  done: number;
  total: number;
}

/**
 * Header strip with one card per member and their chore progress ("2/3").
 * `progress` is keyed by member id; chores (M3) fill it in. `hidden` member ids render
 * dimmed, and `onToggle` makes cards tappable filter chips (calendar, M1).
 */
export function MemberProgress({
  progress = {},
  hidden = [],
  onToggle,
}: {
  progress?: Record<string, Progress>;
  hidden?: readonly string[];
  onToggle?: (memberId: string) => void;
}) {
  const { data: members = [] } = useMembers();
  if (members.length === 0) return null;
  return (
    <div className={styles.people}>
      {members.map((m) => {
        const p = progress[m.id] ?? { done: 0, total: 0 };
        const body = (
          <>
            <Avatar colorToken={m.colorToken} initial={m.initial} />
            <div className={styles.bar}>
              <b>
                {m.name}
                <em>
                  {p.done}/{p.total}
                </em>
              </b>
              <div className={styles.track}>
                <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
              </div>
            </div>
          </>
        );
        const className = cx(styles.person, hidden.includes(m.id) && styles.off);
        return onToggle ? (
          <button
            key={m.id}
            type="button"
            className={className}
            style={memberColorStyle(m.colorToken)}
            aria-pressed={!hidden.includes(m.id)}
            onClick={() => onToggle(m.id)}
          >
            {body}
          </button>
        ) : (
          <div key={m.id} className={className} style={memberColorStyle(m.colorToken)}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
