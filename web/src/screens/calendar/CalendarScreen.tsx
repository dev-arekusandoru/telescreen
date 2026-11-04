import { CalendarBlank } from "@phosphor-icons/react";
import { dayAndTime, monthYear } from "@/app/dates";
import { MemberProgress } from "@/app/MemberProgress";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { ComingSoon, PageHeader } from "@/ui";

/** Placeholder: M1 mounts FullCalendar inside the Surface and fills the header actions. */
export function CalendarScreen() {
  const { now, timeZone } = useHouseholdClock();
  return (
    <>
      <PageHeader title={monthYear(now, timeZone)} subtitle={dayAndTime(now, timeZone)} />
      <MemberProgress />
      <ComingSoon icon={CalendarBlank} title="Your calendar lands here">
        Google and iCloud calendars, color-coded by person, arrive with the calendar milestone.
      </ComingSoon>
    </>
  );
}
