import type { CSSProperties } from "react";
import { SECTIONS, useSummaries } from "./sections";
import s from "./Settings.module.css";

/** Big status tiles; tapping one opens that section full width. The page header is the way back. */
export function Tiles({ id, onOpen }: { id: string | null; onOpen: (id: string) => void }) {
  const summaries = useSummaries();
  const active = SECTIONS.find((x) => x.id === id);

  if (active) {
    const Active = active.Component;
    return (
      <div className={s.detail}>
        <div className={s.detailInner}>
          <Active />
        </div>
      </div>
    );
  }

  return (
    <div className={s.tiles}>
      {SECTIONS.map(({ id: sid, label, icon: Icon }, i) => (
        <button key={sid} type="button" className={s.tile} style={{ "--i": i } as CSSProperties} onClick={() => onOpen(sid)}>
          <Icon aria-hidden weight="duotone" />
          <b>{label}</b>
          <small title={summaries[sid]}>{summaries[sid] || "\u00a0"}</small>
        </button>
      ))}
    </div>
  );
}
