/** Date/time formatting in the household time zone (never the device's). */
function fmt(date: Date, timeZone: string | undefined, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, ...(timeZone ? { timeZone } : {}) }).format(date);
}

/** "Tuesday · 5:16 PM" */
export const dayAndTime = (d: Date, tz?: string) =>
  `${fmt(d, tz, { weekday: "long" })} · ${fmt(d, tz, { hour: "numeric", minute: "2-digit" })}`;

/** "Tuesday, Nov 3" */
export const longDay = (d: Date, tz?: string) => fmt(d, tz, { weekday: "long", month: "short", day: "numeric" });

/** "November 2026" */
export const monthYear = (d: Date, tz?: string) => fmt(d, tz, { month: "long", year: "numeric" });
