import type { Ctx } from "../context.js";
import { addDays, isValidDate, todayIn, weekdayOf } from "../lib/localdate.js";
import { AppError } from "../lib/errors.js";
import { getHousehold } from "./households.js";
import { getSettings } from "./settings.js";

/** Meal order shared with PantryPal (`MEAL_TYPES`). */
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "dessert"] as const;
type MealType = (typeof MEAL_TYPES)[number];

export interface MealItem {
  slot: MealType;
  title: string;
  recipeId: string | null;
  url: string | null;
  skipped?: boolean;
}

export interface MealDay {
  date: string;
  meals: MealItem[];
}

export interface MealsCurrent {
  weekStart: string;
  week: MealDay[];
  tonight: MealItem | null;
  fetchedAt: string;
  stale: boolean;
}

export interface MealsStatus {
  enabled: boolean;
  configured: boolean;
  url: string | null;
  publicUrl: string | null;
  tokenConfigured: boolean;
}

export interface MealsTestResult {
  ok: boolean;
  message: string;
  weekStart: string | null;
}

export interface PantryPalConfig {
  /** HomeHub → PantryPal API base URL, no trailing slash. */
  url: string;
  /** Browser-facing base URL for recipe deep links, no trailing slash. */
  publicUrl: string;
  /** Optional bearer token (`Authorization: Bearer …`, PantryPal's scheme). */
  token: string | null;
}

/** PantryPal connection settings from the environment, or null when `PANTRYPAL_URL` is unset. */
export function pantrypalConfig(env: NodeJS.ProcessEnv = process.env): PantryPalConfig | null {
  const url = env.PANTRYPAL_URL?.trim().replace(/\/+$/, "");
  if (!url) return null;
  const publicUrl = (env.PANTRYPAL_PUBLIC_URL?.trim() || url).replace(/\/+$/, "");
  const token = env.PANTRYPAL_TOKEN?.trim();
  return { url, publicUrl, token: token || null };
}

// -- PantryPal response shapes (subset of its `planViewSchema`; read defensively) -----------

interface RawSlot {
  kind?: string | null;
  label?: string | null;
  cookEvent?: { recipeId?: string | null; recipeTitle?: string | null } | null;
}

interface RawDay {
  date?: string | null;
  meals?: Record<string, RawSlot[] | null | undefined> | null;
}

export interface RawPlan {
  weekStart?: string | null;
  days?: RawDay[] | null;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * PantryPal's recipe screen (`/recipes/$slug` in its web app) also resolves recipe ids,
 * so the id from the plan is a valid deep link.
 */
function toMealItem(slot: RawSlot, mealType: MealType, publicUrl: string): MealItem | null {
  const kind = text(slot.kind);
  const cook = slot.cookEvent ?? null;
  const recipeId = cook ? text(cook.recipeId) : null;
  const label = text(slot.label);

  if (kind === "skip") {
    return { slot: mealType, title: label ?? "No meal", recipeId: null, url: null, skipped: true };
  }
  if (kind === "meal" || (kind === null && cook)) {
    const title = (cook ? text(cook.recipeTitle) : null) ?? "Planned meal";
    return {
      slot: mealType,
      title,
      recipeId,
      url: recipeId ? `${publicUrl}/recipes/${encodeURIComponent(recipeId)}` : null,
    };
  }
  if (kind === "freeform" || label) {
    return { slot: mealType, title: label ?? "Freeform meal", recipeId: null, url: null };
  }
  return null;
}

/** First day of the week containing `date`, for a week starting on `weekStart` (0 = Sunday). */
export function weekStartFor(date: string, weekStart: number): string {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

/**
 * Turn PantryPal's plan grid into the flat day → meals list HomeHub renders.
 * Empty meal types are omitted; malformed entries are skipped rather than failing the week.
 */
export function normalizePlan(
  plan: RawPlan | null,
  options: { publicUrl: string; fallbackWeekStart: string },
): { weekStart: string; week: MealDay[] } {
  const week: MealDay[] = [];
  const days = Array.isArray(plan?.days) ? plan.days : [];
  for (const day of days) {
    const date = text(day?.date);
    if (!date || !isValidDate(date)) continue;
    const meals: MealItem[] = [];
    for (const mealType of MEAL_TYPES) {
      const slots = day?.meals?.[mealType];
      if (!Array.isArray(slots)) continue;
      for (const slot of slots) {
        if (!slot || typeof slot !== "object") continue;
        const item = toMealItem(slot, mealType, options.publicUrl);
        if (item) meals.push(item);
      }
    }
    week.push({ date, meals });
  }
  const planWeekStart = text(plan?.weekStart);
  const weekStart = planWeekStart && isValidDate(planWeekStart) ? planWeekStart : (week[0]?.date ?? options.fallbackWeekStart);
  return { weekStart, week };
}

/**
 * Today's dinner, else the last planned meal today (PantryPal order: breakfast … dessert).
 * Skips (`skipped: true`) never count as the meal.
 */
export function pickTonight(week: MealDay[], today: string): MealItem | null {
  const day = week.find((d) => d.date === today);
  if (!day) return null;
  const planned = day.meals.filter((m) => !m.skipped);
  const dinner = planned.filter((m) => m.slot === "dinner");
  if (dinner.length > 0) return dinner[0]!;
  for (let i = MEAL_TYPES.length - 1; i >= 0; i -= 1) {
    const slot = MEAL_TYPES[i]!;
    const items = planned.filter((m) => m.slot === slot);
    if (items.length > 0) return items[items.length - 1]!;
  }
  return null;
}

// -- Fetching, cache and stale-on-error ---------------------------------------------------

const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  weekStart: string;
  week: MealDay[];
  fetchedAt: string;
}

/** Per-household last-good plan. Single-process cache; PantryPal is polled at most every 5 min. */
const cache = new Map<string, CacheEntry>();

/** Test hook: forget cached plans (also useful after changing PANTRYPAL_* at runtime). */
export function resetMealsCache(): void {
  cache.clear();
}

export interface MealsServiceOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}

async function fetchPlan(
  config: PantryPalConfig,
  fetchImpl: typeof fetch,
): Promise<RawPlan | null> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  const response = await fetchImpl(`${config.url}/api/v1/plans/current`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // PantryPal answers 404 when there is no plan for the current week: a valid empty state.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PantryPal responded ${response.status} ${response.statusText}`.trim());
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") throw new Error("PantryPal returned an unexpected response");
  return body as RawPlan;
}

function present(entry: CacheEntry, today: string, stale: boolean): MealsCurrent {
  return {
    weekStart: entry.weekStart,
    week: entry.week,
    tonight: pickTonight(entry.week, today),
    fetchedAt: entry.fetchedAt,
    stale,
  };
}

/**
 * Current week plan, normalized for the UI.
 *
 * - 404 `not_found` when the Meals module flag is off.
 * - 503 `unavailable` when `PANTRYPAL_URL` is unset or PantryPal is unreachable with no cache.
 * - Serves the last good response (marked `stale`) for `CACHE_TTL_MS` and on upstream errors.
 */
export async function getCurrentMeals(ctx: Ctx, options: MealsServiceOptions = {}): Promise<MealsCurrent> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  if (!getSettings(ctx.db).modules.meals) {
    throw new AppError("not_found", "The Meals module is disabled in Settings");
  }
  const config = pantrypalConfig(env);
  if (!config) {
    throw new AppError("unavailable", "Meals are not configured: set PANTRYPAL_URL", { variable: "PANTRYPAL_URL" });
  }

  const household = getHousehold(ctx.db, ctx.householdId);
  const now = ctx.now();
  const today = todayIn(household.timezone, now);
  const key = `${ctx.householdId}\u0000${config.url}\u0000${config.publicUrl}`;
  const cached = cache.get(key);
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
    return present(cached, today, false);
  }

  try {
    const raw = await fetchPlan(config, fetchImpl);
    const normalized = normalizePlan(raw, {
      publicUrl: config.publicUrl,
      fallbackWeekStart: weekStartFor(today, household.weekStart),
    });
    const entry: CacheEntry = { ...normalized, fetchedAt: now.toISOString() };
    cache.set(key, entry);
    return present(entry, today, false);
  } catch (error) {
    if (cached) return present(cached, today, true);
    const reason = error instanceof Error ? error.message : String(error);
    throw new AppError("unavailable", `PantryPal is unreachable: ${reason}`, { url: config.url });
  }
}

/** Settings > Modules status: configuration only, no network call. */
export function getMealsStatus(ctx: Ctx, env: NodeJS.ProcessEnv = process.env): MealsStatus {
  const config = pantrypalConfig(env);
  return {
    enabled: getSettings(ctx.db).modules.meals,
    configured: config !== null,
    url: config?.url ?? null,
    publicUrl: config?.publicUrl ?? null,
    tokenConfigured: Boolean(config?.token),
  };
}

/** Settings > Modules "Test connection" (always hits PantryPal, ignores the cache and the module flag). */
export async function testPantryPal(options: MealsServiceOptions = {}): Promise<MealsTestResult> {
  const env = options.env ?? process.env;
  const config = pantrypalConfig(env);
  if (!config) {
    return { ok: false, message: "PANTRYPAL_URL is not set. Add it to the environment and restart HomeHub.", weekStart: null };
  }
  try {
    const raw = await fetchPlan(config, options.fetch ?? fetch);
    if (raw === null) {
      return { ok: true, message: "PantryPal is reachable, but there is no plan for the current week.", weekStart: null };
    }
    const weekStart = text(raw.weekStart);
    const days = Array.isArray(raw.days) ? raw.days.length : 0;
    return {
      ok: true,
      message: `PantryPal is reachable: ${days} day${days === 1 ? "" : "s"} planned for the current week.`,
      weekStart: weekStart && isValidDate(weekStart) ? weekStart : null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not reach PantryPal at ${config.url}: ${reason}`, weekStart: null };
  }
}
