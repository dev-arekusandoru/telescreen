import type { Chore, ChoreOccurrence, ChoreRecurrence } from "@/features/chores";
import type { Member } from "@/features/queries";

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** "Daily", "Mon, Thu", "Every 2 weeks on Tue", "Monthly on the 31st". */
export function recurrenceLabel(rec: ChoreRecurrence): string {
  switch (rec.type) {
    case "once":
      return "One-off";
    case "daily":
      return "Daily";
    case "weekdays":
      return rec.days.length === 7 ? "Daily" : rec.days.map((d) => WEEKDAY_SHORT[d]).join(", ");
    case "weekly":
      return rec.every === 1
        ? `Weekly on ${WEEKDAY_SHORT[rec.weekday]}`
        : `Every ${rec.every} weeks on ${WEEKDAY_SHORT[rec.weekday]}`;
    case "monthly":
      return `Monthly on the ${ordinal(rec.day)}`;
  }
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function assignmentLabel(chore: Chore, members: readonly Member[]): string {
  const names = chore.memberIds.map((id) => members.find((m) => m.id === id)?.name ?? "?");
  if (chore.assignment === "rotating") return `Rotates ${names.join(" → ")}`;
  if (chore.assignment === "either") return "Either of us";
  return `Fixed: ${names[0] ?? "?"}`;
}

/** "9:30 AM" from `HH:MM`. */
export function timeLabel(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Secondary line under a chore name on Today/Week. */
export function occurrenceMeta(occ: ChoreOccurrence, members: readonly Member[]): string {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name;
  if (occ.status === "done" && occ.assignment === "either") return `Done by ${nameOf(occ.completedBy) ?? "someone"}`;
  if (occ.status === "done" && occ.completedBy !== null && occ.completedBy !== occ.assigneeId) {
    return `Done by ${nameOf(occ.completedBy) ?? "someone"}`;
  }
  if (occ.assignment === "rotating") {
    const next = nameOf(occ.nextAssigneeId);
    return next ? `Rotating · next: ${next}` : "Rotating";
  }
  if (occ.assignment === "either") return "Either of us";
  const bits: string[] = [];
  if (occ.dueTime) bits.push(`by ${timeLabel(occ.dueTime)}`);
  if (occ.estimatedMinutes) bits.push(`${occ.estimatedMinutes} min`);
  return bits.join(" · ");
}
