import type { CSSProperties } from "react";
import styles from "./Avatar.module.css";
import { memberColorStyle } from "./member";

/** Colored initial circle for a member. `size` in px. */
export function Avatar({ colorToken, initial, size = 34 }: { colorToken: string; initial: string; size?: number }) {
  const style = { ...memberColorStyle(colorToken), "--size": `${size}px` } as CSSProperties;
  return (
    <span className={styles.av} style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
