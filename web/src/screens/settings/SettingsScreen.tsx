import { CloudSun, ForkKnife, MusicNotes, SunHorizon, type Icon } from "@phosphor-icons/react";
import { useTheme, type ThemePreference } from "@/app/theme";
import { useMembers, useSettings, useUpdateSettings, type ModuleKey } from "@/features/queries";
import { PageHeader, SegmentedControl, Switch } from "@/ui";
import { AccountsSection } from "./AccountsSection";
import { CalendarsSection } from "./CalendarsSection";
import { GeneralSection } from "./GeneralSection";
import { MembersSection } from "./MembersSection";
import styles from "./Settings.module.css";

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const MODULES: Array<{ key: ModuleKey; label: string; hint: string; icon: Icon }> = [
  { key: "weather", label: "Weather", hint: "Header chip and 5-day strip", icon: CloudSun },
  { key: "meals", label: "Meals", hint: "Tonight's dinner from PantryPal", icon: ForkKnife },
  { key: "music", label: "Music", hint: "Spotify now playing and controls", icon: MusicNotes },
];

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const { data: settings } = useSettings();
  const { data: members = [] } = useMembers();
  const update = useUpdateSettings();

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

        <section className={styles.sec}>
          <h2>Modules</h2>
          {MODULES.map(({ key, label, hint, icon: Icon }) => (
            <div key={key} className={styles.row}>
              <Icon aria-hidden />
              <div>
                <b>{label}</b>
                <small>{hint}</small>
              </div>
              <div className={styles.end}>
                <Switch
                  label={label}
                  checked={settings?.modules[key] ?? false}
                  disabled={!settings || update.isPending}
                  onCheckedChange={(on) => settings && update.mutate({ modules: { ...settings.modules, [key]: on } })}
                />
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
