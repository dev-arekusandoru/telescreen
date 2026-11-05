import { Check, Heart, MusicNotes, PushPin, X } from "@phosphor-icons/react";
import type { MusicItem } from "@/features/music";
import styles from "./MusicPage.module.css";

/** Stable hue per item so covers without art still look distinct. */
function hueOf(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function Cover({ item, className }: { item: MusicItem; className?: string }) {
  if (item.imageUrl) {
    return <img className={`${styles.cover} ${className ?? ""}`} src={item.imageUrl} alt="" loading="lazy" />;
  }
  const Icon = item.kind === "collection" ? Heart : MusicNotes;
  return (
    <span
      className={`${styles.cover} ${styles.coverFallback} ${className ?? ""}`}
      style={{ "--h": hueOf(item.uri) } as React.CSSProperties}
      aria-hidden
    >
      <Icon weight="fill" />
    </span>
  );
}

interface TileProps {
  item: MusicItem;
  editing: boolean;
  pinned: boolean;
  onActivate: (item: MusicItem) => void;
}

const label = (item: MusicItem, editing: boolean, pinned: boolean) =>
  editing ? `${pinned ? "Unpin" : "Pin"} ${item.title}` : `Play ${item.title}`;

/** Shelf tile: big cover, title, subtitle. In edit mode the tap toggles the pin instead of playing. */
export function Tile({ item, editing, pinned, onActivate }: TileProps) {
  return (
    <button
      type="button"
      className={styles.tile}
      data-pinned={pinned || undefined}
      aria-label={label(item, editing, pinned)}
      aria-pressed={editing ? pinned : undefined}
      onClick={() => onActivate(item)}
    >
      <span className={styles.tileArt}>
        <Cover item={item} />
        {editing ? (
          <span className={styles.pinBadge} data-on={pinned || undefined} aria-hidden>
            {pinned ? <Check weight="bold" /> : <PushPin weight="fill" />}
          </span>
        ) : null}
      </span>
      <b className={styles.tileTitle}>{item.title}</b>
      {item.subtitle ? <small className={styles.tileSub}>{item.subtitle}</small> : null}
    </button>
  );
}

/** Pinned item: small cover + title in a pill-shaped card. In edit mode the tap unpins. */
export function Chip({ item, editing, onActivate }: Omit<TileProps, "pinned">) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={label(item, editing, true)}
      onClick={() => onActivate(item)}
    >
      <Cover item={item} className={styles.chipArt} />
      <b className={styles.chipTitle}>{item.title}</b>
      {editing ? (
        <span className={styles.chipRemove} aria-hidden>
          <X weight="bold" />
        </span>
      ) : null}
    </button>
  );
}
