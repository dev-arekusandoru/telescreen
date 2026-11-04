import * as RadixSelect from "@radix-ui/react-select";
import { CaretDown, Check } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  /** Optional color dot (`--c` style, e.g. from `memberColorStyle`). */
  dot?: CSSProperties;
}

/** Radix Select styled with tokens. `value` must match an option (Radix forbids empty-string values). */
export function Select({
  value,
  onValueChange,
  options,
  label,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  label: string;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} {...(disabled === undefined ? {} : { disabled })}>
      <RadixSelect.Trigger className={styles.trigger} aria-label={label}>
        {selected?.dot ? <span className={styles.dot} style={selected.dot} aria-hidden /> : null}
        <span className={styles.value}>
          <RadixSelect.Value>{selected?.label}</RadixSelect.Value>
        </span>
        <RadixSelect.Icon className={styles.caret}>
          <CaretDown aria-hidden />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className={styles.content} position="popper" sideOffset={6}>
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map((o) => (
              <RadixSelect.Item key={o.value} value={o.value} className={styles.item}>
                {o.dot ? <span className={styles.dot} style={o.dot} aria-hidden /> : null}
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className={styles.check}>
                  <Check aria-hidden />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
