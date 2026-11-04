import { SunHorizon } from "@phosphor-icons/react";
import { useTheme, type ThemePreference } from "@/app/theme";
import { useMembers } from "@/features/queries";
import { PageHeader, SegmentedControl } from "@/ui";
import { AccountsSection } from "./AccountsSection";
import { CalendarsSection } from "./CalendarsSection";
import { GeneralSection } from "./GeneralSection";
import { MealsSection } from "./MealsSection";
import { MembersSection } from "./MembersSection";
import { MusicSection } from "./MusicSection";
import { WeatherSection } from "./WeatherSection";
import styles from "./Settings.module.css";

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const { data: members = [] } = useMembers();

  return (
    <>
      <PageHeader title="Settings" subtitle={members.length ? `Household · ${members.map((m) => m.name).join(" & ")}` : undefined} />
      <div className={styles.set}>
        <section className={styles.sec}>
          <h2>Appearance</h2>
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

        <GeneralSection />

        <MembersSection />

        <AccountsSection />

        <CalendarsSection />

        <WeatherSection />

        <MealsSection />

        <MusicSection />
      </div>
    </>
  );
}
