import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cx } from "./cx";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Pill-shaped single-select control (Radix ToggleGroup; one option is always selected). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  small = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  label: string;
  /** Tighter padding/type for dense headers. */
  small?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      className={cx(styles.seg, small && styles.small)}
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className={styles.item}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
