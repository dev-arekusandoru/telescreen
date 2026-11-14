import type { Ctx } from "../context.js";
import { addDays, diffDays, isValidDate, todayIn, weekdayOf } from "../lib/localdate.js";
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

/** Meals for an arbitrary visible range (the calendar's week/day views). */
export interface MealsPlan {
  days: MealDay[];
  fetchedAt: string;
  stale: boolean;
}

/** A planned meal plus what the board tiles need to render it. */
export interface BoardMeal extends MealItem {
  imageUrl: string | null;
  minutes: number | null;
  cuisine: string | null;
  leftover: boolean;
  cookedOn: string | null;
}

export interface BoardDay {
  date: string;
  meals: BoardMeal[];
}

export interface MealsBoard {
  days: BoardDay[];
  fetchedAt: string;
  stale: boolean;
}

export interface Shopping {
  title: string;
  total: number;
  left: number;
  groups: {
    category: string;
    items: { name: string; qty: string | null; needsCheck: boolean; checked: boolean }[];
  }[];
}

export interface MealsKitchen {
  shopping: Shopping | null;
  missing: { name: string; detail: string }[];
  expiring: { name: string; expiresOn: string; daysLeft: number }[];
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
  /** Telescreen → PantryPal API base URL, no trailing slash. */
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
  isLeftover?: boolean | null;
  cookEvent?: { recipeId?: string | null; recipeTitle?: string | null; cookDate?: string | null } | null;
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

/** `items` array of a PantryPal list response, ignoring anything malformed. */
function listItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items)) return [];
  return body.items.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
  );
}

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
 * Turn PantryPal's plan grid into the flat day → meals list Telescreen renders.
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
/** Pantry rows expiring within this many days (already expired ones always count). */
const EXPIRING_DAYS = 5;

interface CacheEntry {
  weekStart: string;
  week: MealDay[];
  fetchedAt: string;
}

interface RangeEntry {
  days: MealDay[];
  fetchedAt: string;
}

/** Per-household last-good plan. Single-process cache; PantryPal is polled at most every 5 min. */
const cache = new Map<string, CacheEntry>();

/**
 * Last-good plans for calendar ranges, keyed by household + PantryPal URL + range. The calendar
 * asks for overlapping ranges as it pages (a rolling week shifts by a day at a time), so entries
 * are capped and pruned rather than kept forever.
 */
const rangeCache = new Map<string, RangeEntry>();
const RANGE_CACHE_MAX = 32;

interface BoardEntry {
  days: BoardDay[];
  fetchedAt: string;
}

/** Same shape of cache as `rangeCache`, for the richer board payloads. */
const boardCache = new Map<string, BoardEntry>();

/** Kitchen snapshots, keyed like `cache` plus the household's today (they age at midnight). */
const kitchenCache = new Map<string, MealsKitchen>();

const RECIPE_CACHE_TTL_MS = 60 * 60_000;
const RECIPE_CACHE_MAX = 200;

/** Recipe details only change when a recipe is edited, so an hour is plenty. */
const recipeCache = new Map<string, { info: RecipeInfo; at: number }>();

/** Test hook: forget cached plans (also useful after changing PANTRYPAL_* at runtime). */
export function resetMealsCache(): void {
  cache.clear();
  rangeCache.clear();
  boardCache.clear();
  kitchenCache.clear();
  recipeCache.clear();
}

export interface MealsServiceOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}

/** GET a PantryPal JSON document. `null` for 404, which is a valid "nothing here" answer. */
async function fetchJson(
  config: PantryPalConfig,
  path: string,
  fetchImpl: typeof fetch,
): Promise<unknown | null> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  const response = await fetchImpl(`${config.url}${path}`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PantryPal responded ${response.status} ${response.statusText}`.trim());
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") throw new Error("PantryPal returned an unexpected response");
  return body;
}

async function fetchPlan(
  config: PantryPalConfig,
  fetchImpl: typeof fetch,
): Promise<RawPlan | null> {
  // PantryPal answers 404 when there is no plan for the current week: a valid empty state.
  return (await fetchJson(config, "/api/v1/plans/current", fetchImpl)) as RawPlan | null;
}

/**
 * Plans overlapping `[start, end)`.
 *
 * PantryPal's plan week starts on its own household setting (Monday by default), which need not
 * match Telescreen's `weekStart`, so the week start is never computed here: the list endpoint is asked
 * for plans overlapping the range and each plan is read by id.
 */
async function fetchRangePlans(
  config: PantryPalConfig,
  start: string,
  end: string,
  fetchImpl: typeof fetch,
): Promise<RawPlan[]> {
  const last = addDays(end, -1);
  const list = await fetchJson(config, `/api/v1/plans?from=${start}&to=${last}`, fetchImpl);
  const ids = planIds(list);
  const plans = await Promise.all(
    ids.map((id) => fetchJson(config, `/api/v1/plans/${encodeURIComponent(id)}`, fetchImpl)),
  );
  return plans.filter((plan): plan is RawPlan => plan !== null);
}

/** Plan ids from PantryPal's list response, ignoring anything malformed. */
function planIds(list: unknown): string[] {
  return listItems(list).flatMap((item) => (typeof item.id === "string" && item.id !== "" ? [item.id] : []));
}

/** Flatten the plans overlapping `[start, end)` into one date-ordered day list, dropping outside days. */
export function mergePlanDays(
  plans: readonly RawPlan[],
  options: { start: string; end: string; publicUrl: string },
): MealDay[] {
  const byDate = new Map<string, MealDay>();
  for (const plan of plans) {
    const { week } = normalizePlan(plan, {
      publicUrl: options.publicUrl,
      fallbackWeekStart: options.start,
    });
    for (const day of week) {
      if (day.date < options.start || day.date >= options.end) continue;
      const existing = byDate.get(day.date);
      byDate.set(day.date, existing ? { date: day.date, meals: [...existing.meals, ...day.meals] } : day);
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function toBoardMeal(slot: RawSlot, mealType: MealType, publicUrl: string): BoardMeal | null {
  const item = toMealItem(slot, mealType, publicUrl);
  if (!item) return null;
  const cookedOn = text(slot.cookEvent?.cookDate);
  return {
    ...item,
    imageUrl: null,
    minutes: null,
    cuisine: null,
    leftover: slot.isLeftover === true,
    cookedOn: cookedOn && isValidDate(cookedOn) ? cookedOn : null,
  };
}

/**
 * Same flattening as `mergePlanDays`, but keeps the left-over provenance the board shows.
 * Recipe details are filled in later by `enrichBoard`.
 */
export function mergeBoardDays(
  plans: readonly RawPlan[],
  options: { start: string; end: string; publicUrl: string },
): BoardDay[] {
  const byDate = new Map<string, BoardDay>();
  for (const plan of plans) {
    for (const day of Array.isArray(plan?.days) ? plan.days : []) {
      const date = text(day?.date);
      if (!date || !isValidDate(date) || date < options.start || date >= options.end) continue;
      const meals: BoardMeal[] = [];
      for (const mealType of MEAL_TYPES) {
        const slots = day?.meals?.[mealType];
        if (!Array.isArray(slots)) continue;
        for (const slot of slots) {
          if (!slot || typeof slot !== "object") continue;
          const meal = toBoardMeal(slot, mealType, options.publicUrl);
          if (meal) meals.push(meal);
        }
      }
      const existing = byDate.get(date);
      byDate.set(date, existing ? { date, meals: [...existing.meals, ...meals] } : { date, meals });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
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

/**
 * Meals planned in `[start, end)` — the calendar's visible range, which may straddle two of
 * PantryPal's plan weeks.
 *
 * - 404 `not_found` when the Meals module flag is off.
 * - 503 `unavailable` when `PANTRYPAL_URL` is unset or PantryPal is unreachable with no cache.
 * - Serves the last good response (marked `stale`) for `CACHE_TTL_MS` and on upstream errors.
 */
export async function getMealsPlan(
  ctx: Ctx,
  start: string,
  end: string,
  options: MealsServiceOptions = {},
): Promise<MealsPlan> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  if (!getSettings(ctx.db).modules.meals) {
    throw new AppError("not_found", "The Meals module is disabled in Settings");
  }
  const config = pantrypalConfig(env);
  if (!config) {
    throw new AppError("unavailable", "Meals are not configured: set PANTRYPAL_URL", { variable: "PANTRYPAL_URL" });
  }

  const now = ctx.now();
  const key = `${ctx.householdId}\u0000${config.url}\u0000${config.publicUrl}\u0000${start}\u0000${end}`;
  const cached = rangeCache.get(key);
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
    return { ...cached, stale: false };
  }

  try {
    const plans = await fetchRangePlans(config, start, end, fetchImpl);
    const entry: RangeEntry = {
      days: mergePlanDays(plans, { start, end, publicUrl: config.publicUrl }),
      fetchedAt: now.toISOString(),
    };
    rememberCapped(rangeCache, key, entry, now, RANGE_CACHE_MAX);
    return { ...entry, stale: false };
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    const reason = error instanceof Error ? error.message : String(error);
    throw new AppError("unavailable", `PantryPal is unreachable: ${reason}`, { url: config.url });
  }
}

/**
 * Meals planned in `[start, end)`, enriched with recipe details for the wall board.
 * Same caching and failure semantics as `getMealsPlan`; a recipe lookup never fails the board.
 */
export async function getMealsBoard(
  ctx: Ctx,
  start: string,
  end: string,
  options: MealsServiceOptions = {},
): Promise<MealsBoard> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  if (!getSettings(ctx.db).modules.meals) {
    throw new AppError("not_found", "The Meals module is disabled in Settings");
  }
  const config = pantrypalConfig(env);
  if (!config) {
    throw new AppError("unavailable", "Meals are not configured: set PANTRYPAL_URL", { variable: "PANTRYPAL_URL" });
  }

  const now = ctx.now();
  const key = `${ctx.householdId}\u0000${config.url}\u0000${config.publicUrl}\u0000${start}\u0000${end}`;
  const cached = boardCache.get(key);
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
    return { ...cached, stale: false };
  }

  try {
    const plans = await fetchRangePlans(config, start, end, fetchImpl);
    const entry: BoardEntry = {
      days: await enrichBoard(
        mergeBoardDays(plans, { start, end, publicUrl: config.publicUrl }),
        config,
        fetchImpl,
      ),
      fetchedAt: now.toISOString(),
    };
    rememberCapped(boardCache, key, entry, now, RANGE_CACHE_MAX);
    return { ...entry, stale: false };
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    const reason = error instanceof Error ? error.message : String(error);
    throw new AppError("unavailable", `PantryPal is unreachable: ${reason}`, { url: config.url });
  }
}

interface RecipeInfo {
  imageUrl: string | null;
  minutes: number | null;
  cuisine: string | null;
}

const EMPTY_RECIPE_INFO: RecipeInfo = { imageUrl: null, minutes: null, cuisine: null };

/** Relative recipe images resolve against the public URL; anything but http(s) is dropped. */
export function recipeImageUrl(value: unknown, publicUrl: string): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (raw.startsWith("/")) return `${publicUrl}${raw}`;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

async function fetchRecipeInfo(
  config: PantryPalConfig,
  recipeId: string,
  fetchImpl: typeof fetch,
): Promise<RecipeInfo> {
  const key = `${config.url}\u0000${recipeId}`;
  const cached = recipeCache.get(key);
  if (cached && Date.now() - cached.at < RECIPE_CACHE_TTL_MS) return cached.info;

  try {
    const raw = await fetchJson(config, `/api/v1/recipes/${encodeURIComponent(recipeId)}`, fetchImpl);
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const info: RecipeInfo = {
      imageUrl: recipeImageUrl(body.imageUrl, config.publicUrl),
      minutes: typeof body.totalMinutes === "number" ? body.totalMinutes : null,
      cuisine: text(body.cuisine),
    };
    recipeCache.set(key, { info, at: Date.now() });
    while (recipeCache.size > RECIPE_CACHE_MAX) {
      const oldest = recipeCache.keys().next().value;
      if (oldest === undefined) break;
      recipeCache.delete(oldest);
    }
    return info;
  } catch {
    // A recipe the board cannot load is a missing photo, not a broken board; don't cache the miss.
    return EMPTY_RECIPE_INFO;
  }
}

/** Fill in recipe details, looking each recipe id up once per request. */
async function enrichBoard(
  days: BoardDay[],
  config: PantryPalConfig,
  fetchImpl: typeof fetch,
): Promise<BoardDay[]> {
  const ids = new Set(days.flatMap((day) => day.meals.flatMap((meal) => (meal.recipeId ? [meal.recipeId] : []))));
  const infos = new Map(
    await Promise.all([...ids].map(async (id) => [id, await fetchRecipeInfo(config, id, fetchImpl)] as const)),
  );
  return days.map((day) => ({
    date: day.date,
    meals: day.meals.map((meal) => {
      const info = meal.recipeId ? infos.get(meal.recipeId) : undefined;
      return info ? { ...meal, ...info } : meal;
    }),
  }));
}

/**
 * Shopping list, pantry gaps and expiring food in one read-only snapshot for the wall board.
 * Sections are fetched independently: a failing one degrades to empty.
 */
export async function getMealsKitchen(
  ctx: Ctx,
  options: MealsServiceOptions = {},
): Promise<MealsKitchen> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  if (!getSettings(ctx.db).modules.meals) {
    throw new AppError("not_found", "The Meals module is disabled in Settings");
  }
  const config = pantrypalConfig(env);
  if (!config) {
    throw new AppError("unavailable", "Meals are not configured: set PANTRYPAL_URL", { variable: "PANTRYPAL_URL" });
  }

  const now = ctx.now();
  const today = todayIn(getHousehold(ctx.db, ctx.householdId).timezone, now);
  const key = `${ctx.householdId}\u0000${config.url}\u0000${today}`;
  const cached = kitchenCache.get(key);
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
    return { ...cached, stale: false };
  }

  const [shopping, missing, expiring] = await Promise.allSettled([
    fetchShopping(config, fetchImpl),
    fetchMissing(config, fetchImpl),
    fetchExpiring(config, today, fetchImpl),
  ]);

  const all = [shopping, missing, expiring];
  if (all.every((section) => section.status === "rejected")) {
    if (cached) return { ...cached, stale: true };
    const failed = all.find((section) => section.status === "rejected") as PromiseRejectedResult;
    const reason = failed.reason instanceof Error ? failed.reason.message : String(failed.reason);
    throw new AppError("unavailable", `PantryPal is unreachable: ${reason}`, { url: config.url });
  }

  const snapshot: MealsKitchen = {
    shopping: shopping.status === "fulfilled" ? shopping.value : null,
    missing: missing.status === "fulfilled" ? missing.value : [],
    expiring: expiring.status === "fulfilled" ? expiring.value : [],
    fetchedAt: now.toISOString(),
    stale: false,
  };
  rememberCapped(kitchenCache, key, snapshot, now, RANGE_CACHE_MAX);
  return snapshot;
}

/** Newest list by `updatedAt`; PantryPal returns them unsorted. */
async function fetchShopping(config: PantryPalConfig, fetchImpl: typeof fetch): Promise<Shopping | null> {
  const lists = listItems(await fetchJson(config, "/api/v1/shopping-lists", fetchImpl))
    .filter((list) => typeof list.id === "string")
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  const chosen = lists.find((list) => list.status === "shopping") ?? lists.find((list) => list.status === "draft");
  if (!chosen) return null;

  const detail = await fetchJson(config, `/api/v1/shopping-lists/${encodeURIComponent(String(chosen.id))}`, fetchImpl);
  if (!detail || typeof detail !== "object") return null;
  const body = detail as Record<string, unknown>;
  const list = body.list && typeof body.list === "object" ? (body.list as Record<string, unknown>) : {};
  const counts = body.counts && typeof body.counts === "object" ? (body.counts as Record<string, unknown>) : {};
  const count = (value: unknown) => (typeof value === "number" ? value : 0);
  return {
    title: text(list.title) ?? "Shopping list",
    total: count(counts.total),
    left: count(counts.remaining),
    groups: (Array.isArray(body.groups) ? body.groups : [])
      .filter((group): group is Record<string, unknown> => Boolean(group) && typeof group === "object")
      .map((group) => ({
        category: categoryLabel(text(group.category) ?? "other"),
        items: (Array.isArray(group.items) ? group.items : [])
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            name: text(item.name) ?? "",
            qty: formatQuantity(typeof item.qty === "number" ? item.qty : null, text(item.unit)),
            needsCheck: item.needsCheck === true,
            checked: text(item.checkedAt) !== null,
          })),
      })),
  };
}

/** "canned_goods" -> "Canned goods": aisle labels for the board. */
export function categoryLabel(category: string): string {
  const words = category.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "600 g" / "3": a shopping quantity as the board shows it. */
export function formatQuantity(qty: number | null, unit: string | null): string | null {
  if (qty === null) return null;
  return unit ? `${qty} ${unit}` : String(qty);
}

/** Current plan demand the pantry cannot cover, one display line per ingredient. */
async function fetchMissing(config: PantryPalConfig, fetchImpl: typeof fetch): Promise<{ name: string; detail: string }[]> {
  const plan = await fetchPlan(config, fetchImpl);
  const planId = plan && "id" in plan ? text(plan.id) : null;
  if (!planId) return [];

  const body = await fetchJson(
    config,
    `/api/v1/pantry/availability?mealPlanId=${encodeURIComponent(planId)}`,
    fetchImpl,
  );
  const lines: { name: string; detail: string }[] = [];
  for (const line of listItems(body)) {
    const committed = typeof line.committed === "number" ? line.committed : null;
    if (committed === null || committed <= 0) continue;
    const onHand = typeof line.onHand === "number" ? line.onHand : null;
    const short =
      line.comparable === true ? onHand !== null && onHand < committed : text(line.onHandStatus) === "out";
    if (!short) continue;

    const uses = (Array.isArray(line.committedBy) ? line.committedBy : []).filter(
      (use): use is Record<string, unknown> => Boolean(use) && typeof use === "object",
    );
    const title = text(uses[0]?.recipeTitle) ?? "Planned meal";
    const more = uses.length > 1 ? ` (+${uses.length - 1} more)` : "";
    const unit = text(line.unit);
    const have = onHand === null || onHand <= 0 ? "have none" : `have ${formatQuantity(onHand, unit) ?? "some"}`;
    lines.push({
      name: text(line.ingredientName) ?? "",
      detail: `${title}${more} · need ${formatQuantity(committed, unit)}, ${have}`,
    });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
}

/** Pantry rows expiring within five days, already expired included (`daysLeft` negative). */
async function fetchExpiring(
  config: PantryPalConfig,
  today: string,
  fetchImpl: typeof fetch,
): Promise<{ name: string; expiresOn: string; daysLeft: number }[]> {
  const body = await fetchJson(config, "/api/v1/pantry", fetchImpl);
  const rows: { name: string; expiresOn: string; daysLeft: number }[] = [];
  for (const item of listItems(body)) {
    const expiresOn = text(item.expiresOn);
    if (!expiresOn || !isValidDate(expiresOn)) continue;
    const daysLeft = diffDays(expiresOn, today);
    if (daysLeft > EXPIRING_DAYS) continue;
    const ingredient = item.ingredient && typeof item.ingredient === "object" ? item.ingredient : {};
    const name = text((ingredient as Record<string, unknown>).name);
    if (!name) continue;
    rows.push({ name, expiresOn, daysLeft });
  }
  return rows
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.name.localeCompare(b.name))
    .slice(0, 8);
}

/** Store a last-good response, dropping expired entries and the oldest ones past the cap. */
function rememberCapped<T extends { fetchedAt: string }>(
  entries: Map<string, T>,
  key: string,
  entry: T,
  now: Date,
  max: number,
): void {
  for (const [cachedKey, cached] of entries) {
    if (now.getTime() - Date.parse(cached.fetchedAt) >= CACHE_TTL_MS) entries.delete(cachedKey);
  }
  entries.set(key, entry);
  while (entries.size > max) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
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
    return { ok: false, message: "PANTRYPAL_URL is not set. Add it to the environment and restart Telescreen.", weekStart: null };
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
