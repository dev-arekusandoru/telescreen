import { randomBytes } from "node:crypto";
import { accounts, calendars } from "../src/db/schema.js";
import { encryptSecret } from "../src/lib/crypto.js";
import { newId } from "../src/lib/ids.js";
import type { Db } from "../src/db/client.js";

process.env.TELESCREEN_SECRET_KEY ||= randomBytes(32).toString("hex");

export function addAccount(
  db: Db,
  provider: "icloud" | "google",
  secret: Record<string, string>,
  overrides: Partial<typeof accounts.$inferInsert> = {},
): string {
  const id = newId("acc");
  db.insert(accounts)
    .values({ id, provider, label: `${provider} test`, secretEncrypted: encryptSecret(JSON.stringify(secret)), ...overrides })
    .run();
  return id;
}

export function addCalendar(
  db: Db,
  accountId: string,
  overrides: Partial<typeof calendars.$inferInsert> = {},
): string {
  const id = newId("cal");
  db.insert(calendars)
    .values({ id, accountId, remoteId: `remote-${id}`, name: "Test", writable: true, enabled: true, ...overrides })
    .run();
  return id;
}

export function ics(vevents: string[], vtimezone = ""): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", vtimezone, ...vevents, "END:VCALENDAR"]
    .filter(Boolean)
    .join("\r\n");
}

export const vevent = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
