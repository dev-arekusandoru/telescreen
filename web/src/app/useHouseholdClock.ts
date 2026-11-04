import { useHousehold } from "@/features/queries";
import { useNow } from "./useNow";

/** Current time plus the household time zone (undefined until the household loads). */
export function useHouseholdClock(): { now: Date; timeZone: string | undefined } {
  const { data } = useHousehold();
  return { now: useNow(), timeZone: data?.timezone };
}
