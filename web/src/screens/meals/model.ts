import { addDays, formatDate, startOfWeek } from "@/app/localdate";
import type { BoardDay, BoardMeal, MealItem, MealsKitchen } from "@/features/meals";

export const SLOT_LABEL: Record<MealItem["slot"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

/** Weeks the strip can page to, relative to the household's current week. */
export const PAGE_MIN = -4;
export const PAGE_MAX = 8;

/** First day of page `page` (0 = the week containing `today`), for a household week start. */
export function pageStart(today: string, weekStart: number, page: number): string {
  return addDays(startOfWeek(today, weekStart), page * 7);
}

/** The seven date-only days of a page, in order. */
export function pageDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekLabel(start: string): string {
  const short = (date: string) => formatDate(date, { month: "short", day: "numeric" });
  return `${short(start)} – ${short(addDays(start, 6))}`;
}

export interface HeroPick {
  meal: BoardMeal;
  date: string;
  /** "Tonight" for today's dinner, otherwise "Up next · Monday". */
  label: string;
}

const eligible = (meal: BoardMeal) => !meal.skipped && !meal.leftover;

/**
 * The next meal to cook: from today onward, the first non-skipped, non-leftover dinner; then any
 * such meal; then any meal that is not skipped. Looks into next week when this week has none.
 */
export function pickHero(today: string, current: BoardDay[], next: BoardDay[] | undefined): HeroPick | null {
  const ahead = [...current.filter((day) => day.date >= today), ...(next ?? [])].flatMap((day) =>
    day.meals.map((meal) => ({ meal, date: day.date })),
  );
  const pick =
    ahead.find((x) => x.meal.slot === "dinner" && eligible(x.meal)) ??
    ahead.find((x) => eligible(x.meal)) ??
    ahead.find((x) => !x.meal.skipped);
  if (!pick) return null;
  const label =
    pick.date === today && pick.meal.slot === "dinner"
      ? "Tonight"
      : `Up next · ${formatDate(pick.date, { weekday: "long" })}`;
  return { ...pick, label };
}

const DISH_EMOJI = ["🍲", "🍝", "🥘", "🍗", "🐟", "🥗", "🍕", "🌮", "🍛", "🥣", "🍰", "🥪"];

/** Deterministic tint + dish emoji for meals without a photo, so a title keeps its look. */
export function placeholderFor(title: string): { hue: number; emoji: string } {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return { hue: hash % 360, emoji: DISH_EMOJI[hash % DISH_EMOJI.length]! };
}

/** "today" / "tomorrow" / "in 4 days" / "expired". */
export function expiryLabel(daysLeft: number): string {
  if (daysLeft < 0) return "expired";
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

/** Read-only shopping panel rows: at most `perGroup` unchecked items per aisle. */
export function shoppingGroups(shopping: MealsKitchen["shopping"], perGroup: number) {
  if (!shopping) return [];
  return shopping.groups
    .map((group) => {
      const open = group.items.filter((item) => !item.checked);
      return { category: group.category, items: open.slice(0, perGroup), more: Math.max(0, open.length - perGroup) };
    })
    .filter((group) => group.items.length > 0);
}
