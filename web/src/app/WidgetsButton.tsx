import * as Popover from "@radix-ui/react-popover";
import { SquaresFour } from "@phosphor-icons/react";
import { WidgetColumn } from "./WidgetColumn";
import styles from "./WidgetsButton.module.css";

/**
 * Header entry point for the right-column widgets when the column is hidden (< 1280px).
 * `includeWeather` is false while the header weather chip is visible, so weather is
 * available from exactly one place at every width.
 */
export function WidgetsButton({ includeWeather }: { includeWeather: boolean }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={styles.trigger} aria-label="At a glance" title="At a glance">
          <SquaresFour aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.pop}
          sideOffset={8}
          align="end"
          collisionPadding={12}
          aria-label="At a glance"
        >
          <div className={styles.stack}>
            <WidgetColumn includeWeather={includeWeather} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
