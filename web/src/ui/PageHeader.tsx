import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

/** Page title + subtitle on the left, `children` (view switches, buttons) pushed right. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <div className={styles.sub}>{subtitle}</div> : null}
      </div>
      <div className={styles.spacer} />
      {children}
    </header>
  );
}
