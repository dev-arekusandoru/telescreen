import { useState } from "react";
import { longDay } from "@/app/dates";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { PageHeader, SegmentedControl } from "@/ui";
import { ManageView } from "./ManageView";
import { TodayView } from "./TodayView";
import { WeekView } from "./WeekView";

type Tab = "today" | "week" | "manage";

const TABS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "manage", label: "Manage" },
] as const;

export function ChoresScreen() {
  const { now, timeZone } = useHouseholdClock();
  const [tab, setTab] = useState<Tab>("today");
  return (
    <>
      <PageHeader title="Chores" subtitle={longDay(now, timeZone)}>
        <SegmentedControl value={tab} onChange={setTab} options={TABS} label="Chores view" />
      </PageHeader>
      {tab === "today" ? <TodayView /> : tab === "week" ? <WeekView /> : <ManageView />}
    </>
  );
}
