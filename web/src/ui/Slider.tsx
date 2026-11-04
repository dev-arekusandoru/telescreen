import * as RadixSlider from "@radix-ui/react-slider";
import styles from "./Slider.module.css";

/**
 * Radix Slider on tokens. `onChange` fires continuously while dragging (drive local
 * state), `onCommit` on release / keyboard step (send the request).
 */
export function Slider({
  value,
  onChange,
  onCommit,
  label,
  min = 0,
  max = 100,
  step = 1,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <RadixSlider.Root
      className={styles.root}
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(values) => {
        const next = values[0];
        if (next !== undefined) onChange(next);
      }}
      onValueCommit={(values) => {
        const next = values[0];
        if (next !== undefined) onCommit(next);
      }}
    >
      <RadixSlider.Track className={styles.track}>
        <RadixSlider.Range className={styles.range} />
      </RadixSlider.Track>
      <RadixSlider.Thumb className={styles.thumb} aria-label={label} />
    </RadixSlider.Root>
  );
}
