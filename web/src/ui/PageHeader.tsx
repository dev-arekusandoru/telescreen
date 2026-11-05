import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./PageHeader.module.css";

/**
 * Page title + subtitle on the left, `children` (view switches, buttons) pushed right.
 * `dense` keeps everything on a single row with a smaller title (calendar, which needs the height).
 */
export function PageHeader({
  title,
  subtitle,
  dense = false,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  dense?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={cx(styles.header, dense && styles.dense)}>
      <div className={styles.titles}>
        <h1 className={styles.title} title={title}>
          {title}
        </h1>
        {subtitle ? <div className={styles.sub}>{subtitle}</div> : null}
      </div>
      <div className={styles.spacer} />
      {children}
    </header>
  );
}
