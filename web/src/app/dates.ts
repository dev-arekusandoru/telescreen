/** Date/time formatting in the household time zone (never the device's). */
function fmt(date: Date, timeZone: string | undefined, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, ...(timeZone ? { timeZone } : {}) }).format(date);
}

/** "5:16 PM" */
export const timeOfDay = (d: Date, tz?: string) => fmt(d, tz, { hour: "numeric", minute: "2-digit" });

/** "Tuesday, Nov 3" */
export const longDay = (d: Date, tz?: string) => fmt(d, tz, { weekday: "long", month: "short", day: "numeric" });

/** "November 2026" */
export const monthYear = (d: Date, tz?: string) => fmt(d, tz, { month: "long", year: "numeric" });

/** "never", "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}
