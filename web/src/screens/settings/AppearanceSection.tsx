import { SunHorizon } from "@phosphor-icons/react";
import { useTheme, type ThemePreference } from "@/app/theme";
import { SegmentedControl } from "@/ui";
import styles from "./Settings.module.css";

export const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <section className={styles.sec} aria-labelledby="appearance-h">
      <h2 id="appearance-h">Appearance</h2>
      <div className={styles.row}>
        <SunHorizon aria-hidden />
        <div>
          <b>Theme</b>
          <small>System follows this device</small>
        </div>
        <div className={styles.end}>
          <SegmentedControl label="Theme" value={theme} onChange={setTheme} options={THEMES} />
        </div>
      </div>
    </section>
  );
}
