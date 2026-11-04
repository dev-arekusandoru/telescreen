import { Broom } from "@phosphor-icons/react";
import { longDay } from "@/app/dates";
import { MemberProgress } from "@/app/MemberProgress";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { ComingSoon, PageHeader } from "@/ui";

/** Placeholder: M3 adds Today / Week / Manage. */
export function ChoresScreen() {
  const { now, timeZone } = useHouseholdClock();
  return (
    <>
      <PageHeader title="Chores" subtitle={longDay(now, timeZone)} />
      <MemberProgress />
      <ComingSoon icon={Broom} title="Chores are on their way">
        Recurring and rotating chores with tap-to-complete arrive with the chores milestone.
      </ComingSoon>
    </>
  );
}
