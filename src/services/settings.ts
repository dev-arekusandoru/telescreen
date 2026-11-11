import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { SETTING_DEFAULTS, settingsSchema, type Settings, type UpdateSettings } from "../schemas/settings.js";

type Key = keyof Settings;
const KEYS = Object.keys(SETTING_DEFAULTS) as Key[];

/** All settings, with defaults filled in for keys that were never written or are invalid. */
export function getSettings(db: Db): Settings {
  const stored = new Map(db.select().from(settings).all().map((r) => [r.key, r.valueJson]));
  const merged: Record<string, unknown> = {};
  for (const key of KEYS) {
    const raw = stored.get(key);
    if (raw === undefined) continue;
    try {
      merged[key] = JSON.parse(raw);
    } catch {
      // Corrupt row: fall back to the default.
    }
  }
  // Module flags added later are missing from older stored rows; fill them from the defaults.
  if (typeof merged.modules === "object" && merged.modules !== null) {
    merged.modules = { ...SETTING_DEFAULTS.modules, ...merged.modules };
  }
  const parsed = settingsSchema.safeParse({ ...SETTING_DEFAULTS, ...merged });
  return parsed.success ? parsed.data : SETTING_DEFAULTS;
}

/** Upsert the provided keys and return the full settings. */
export function updateSettings(db: Db, patch: UpdateSettings): Settings {
  db.transaction((tx) => {
    for (const key of KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      const valueJson = JSON.stringify(value);
      tx.insert(settings)
        .values({ key, valueJson })
        .onConflictDoUpdate({ target: settings.key, set: { valueJson } })
        .run();
    }
  });
  return getSettings(db);
}

export function deleteSetting(db: Db, key: Key): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}
