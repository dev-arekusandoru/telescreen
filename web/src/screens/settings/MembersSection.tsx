import { ArrowDown, ArrowUp, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { MEMBER_COLORS, useCreateMember, useUpdateMember, type MemberColor } from "@/features/household";
import { useMembers, type Member } from "@/features/queries";
import { Avatar, cx, memberColorStyle } from "@/ui";
import styles from "./Settings.module.css";

function ColorPicker({ label, value, onChange }: { label: string; value: MemberColor; onChange: (c: MemberColor) => void }) {
  return (
    <div className={styles.swatches} role="radiogroup" aria-label={label}>
      {MEMBER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          className={cx(styles.swatch, c === value && styles.swatchOn)}
          style={memberColorStyle(c)}
          onClick={() => c !== value && onChange(c)}
        />
      ))}
    </div>
  );
}

function MemberRow({ member, index, count, onMove }: { member: Member; index: number; count: number; onMove: (from: number, to: number) => void }) {
  const update = useUpdateMember();
  const [name, setName] = useState(member.name);
  const commitName = () => {
    const next = name.trim();
    if (next && next !== member.name) update.mutate({ id: member.id, name: next, initial: next.slice(0, 1) });
    else setName(member.name);
  };
  return (
    <div className={cx(styles.row, styles.member)}>
      <Avatar colorToken={member.colorToken} initial={member.initial} />
      <input
        className={styles.input}
        aria-label={`Name of member ${index + 1}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <ColorPicker label={`Color for ${member.name}`} value={member.colorToken} onChange={(colorToken) => update.mutate({ id: member.id, colorToken })} />
      <div className={styles.moves}>
        <button type="button" className={styles.iconBtn} aria-label={`Move ${member.name} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
          <ArrowUp aria-hidden />
        </button>
        <button type="button" className={styles.iconBtn} aria-label={`Move ${member.name} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
          <ArrowDown aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Settings > Members: rename, pick a palette color, reorder, add. */
export function MembersSection() {
  const { data: members = [] } = useMembers();
  const update = useUpdateMember();
  const create = useCreateMember();
  const [newName, setNewName] = useState("");

  const move = async (from: number, to: number) => {
    const order = [...members];
    const [item] = order.splice(from, 1);
    if (!item) return;
    order.splice(to, 0, item);
    // Rewrite every sort as its index so duplicate/gapped values cannot break the swap.
    await Promise.all(order.map((m, i) => (m.sort === i ? null : update.mutateAsync({ id: m.id, sort: i }))));
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const used = new Set(members.map((m) => m.colorToken));
    const colorToken = MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[0]!;
    create.mutate({ name, colorToken }, { onSuccess: () => setNewName("") });
  };

  return (
    <section className={styles.sec} aria-labelledby="members-h">
      <h2 id="members-h">Members</h2>
      {members.map((m, i) => (
        <MemberRow key={`${m.id}:${m.name}:${m.sort}`} member={m} index={i} count={members.length} onMove={move} />
      ))}
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Plus aria-hidden />
        <input className={styles.input} aria-label="New member name" placeholder="Add a member" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className={cx(styles.btn, styles.end)} disabled={!newName.trim() || create.isPending}>
          Add
        </button>
      </form>
    </section>
  );
}
