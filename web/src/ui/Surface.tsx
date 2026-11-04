import type { ComponentType, ReactNode } from "react";
import type { IconProps } from "@phosphor-icons/react";
import styles from "./Surface.module.css";

/** Raised paper panel that fills the remaining main-column height (calendar, lists). */
export function Surface({ children }: { children: ReactNode }) {
  return <section className={styles.surface}>{children}</section>;
}

/** Centered placeholder for screens that are not built yet. */
export function ComingSoon({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  children: ReactNode;
}) {
  return (
    <Surface>
      <div className={styles.empty}>
        <Icon weight="duotone" aria-hidden />
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </Surface>
  );
}
