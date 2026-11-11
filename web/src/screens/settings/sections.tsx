import { CalendarDots, Car, CloudSun, ForkKnife, Gear, MusicNotes, SunHorizon, UserCircle, UsersThree, type Icon } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { useTheme } from "@/app/theme";
import { useAccounts } from "@/features/accounts";
import { useCalendars } from "@/features/calendar";
import { useHousehold, useMembers, useSettings } from "@/features/queries";
import { AccountsSection } from "./AccountsSection";
import { AppearanceSection, THEMES } from "./AppearanceSection";
import { CalendarsSection } from "./CalendarsSection";
import { GeneralSection } from "./GeneralSection";
import { MealsSection } from "./MealsSection";
import { MembersSection } from "./MembersSection";
import { MusicSection } from "./MusicSection";
import { TravelSection } from "./TravelSection";
import { WeatherSection } from "./WeatherSection";

export interface SectionDef {
  id: string;
  label: string;
  icon: Icon;
  Component: ComponentType;
}
export interface GroupDef {
  id: string;
  label: string;
  sections: SectionDef[];
}

/** Settings regrouped by meaning. Add a section here and every layout picks it up. */
export const GROUPS: GroupDef[] = [
  {
    id: "household",
    label: "Household",
    sections: [
      { id: "general", label: "General", icon: Gear, Component: GeneralSection },
      { id: "members", label: "Members", icon: UsersThree, Component: MembersSection },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    sections: [
      { id: "accounts", label: "Accounts", icon: UserCircle, Component: AccountsSection },
      { id: "calendars", label: "Calendars", icon: CalendarDots, Component: CalendarsSection },
    ],
  },
  {
    id: "modules",
    label: "Modules",
    sections: [
      { id: "weather", label: "Weather", icon: CloudSun, Component: WeatherSection },
      { id: "travel", label: "Travel", icon: Car, Component: TravelSection },
      { id: "meals", label: "Meals", icon: ForkKnife, Component: MealsSection },
      { id: "music", label: "Music", icon: MusicNotes, Component: MusicSection },
    ],
  },
  {
    id: "display",
    label: "Display",
    sections: [{ id: "appearance", label: "Appearance", icon: SunHorizon, Component: AppearanceSection }],
  },
];

export const SECTIONS = GROUPS.flatMap((g) => g.sections);

/** One-line status per section, for the tile launcher. */
export function useSummaries(): Record<string, string> {
  const { data: household } = useHousehold();
  const { data: members = [] } = useMembers();
  const { data: settings } = useSettings();
  const { data: accounts = [] } = useAccounts();
  const { data: calendars = [] } = useCalendars();
  const { theme } = useTheme();
  const onOff = (on: boolean | undefined) => (on ? "On" : "Off");
  return {
    general: household?.name ?? "",
    members: members.map((m) => m.name).join(" & "),
    accounts: accounts.length ? `${accounts.length} connected` : "None connected",
    calendars: `${calendars.length} ${calendars.length === 1 ? "calendar" : "calendars"}`,
    weather: onOff(settings?.modules.weather),
    travel: onOff(settings?.modules.travel),
    meals: onOff(settings?.modules.meals),
    music: onOff(settings?.modules.music),
    appearance: THEMES.find((t) => t.value === theme)?.label ?? "",
  };
}
