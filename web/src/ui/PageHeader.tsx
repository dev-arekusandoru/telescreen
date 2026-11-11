import { CaretLeft } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./PageHeader.module.css";

/**
 * Page title + subtitle on the left, `children` (view switches, buttons) pushed right.
 * `onBack` turns the title into a back button (drill-down pages).
 * `dense` keeps everything on a single row with a smaller title (calendar, which needs the height).
 */
export function PageHeader({
  title,
  subtitle,
  dense = false,
  onBack,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  dense?: boolean;
  onBack?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className={cx(styles.header, dense && styles.dense)}>
      <div className={styles.titles}>
        <h1 className={styles.title} title={title}>
          {onBack ? (
            <button type="button" className={styles.back} onClick={onBack}>
              <CaretLeft aria-hidden />
              {title}
            </button>
          ) : (
            title
          )}
        </h1>
        {subtitle ? <div className={styles.sub}>{subtitle}</div> : null}
      </div>
      <div className={styles.spacer} />
      {children}
    </header>
  );
}
